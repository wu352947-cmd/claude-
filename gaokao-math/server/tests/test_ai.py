import base64
import json
import random
import re

import pytest
import sympy as sp

from app.ai.llm import LLMError, ScriptedLLM, parse_json
from app.ai.variants import TemplateError, instantiate, parse_template
from app.core.safe_expr import UnsafeExpression, safe_condition, safe_expr

from .conftest import make_client

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()


def _text(messages) -> str:
    content = messages[-1]["content"]
    return content if isinstance(content, str) else content[0]["text"]


# ---------------------------------------------------------------- 未配置 / 额度 / 缓存

def test_ai_disabled_by_default(client):
    assert client.get("/api/ai/status").json()["text"] is False
    r = client.post("/api/ai/hint", json={"question_id": "s01-set-intersection", "level": 1})
    assert r.status_code == 503 and "README" in r.json()["detail"]


def test_hint_is_grounded_cached_and_counted(data_dir, tmp_path, clock):
    llm = ScriptedLLM(["先把集合 A 化简。"])
    with make_client(data_dir, tmp_path, clock, llm=llm) as c:
        body = {"question_id": "s01-set-intersection", "level": 1, "current_answer": ""}
        first = c.post("/api/ai/hint", json=body).json()
        second = c.post("/api/ai/hint", json=body).json()
        assert first["hint"] == second["hint"] == "先把集合 A 化简。"
        assert first["note"] == "AI 生成，仅供参考"
        assert len(llm.calls) == 1  # 第二次走缓存
        prompt = _text(llm.calls[0])
        assert "标准解答" in prompt and "(x-4)(x+1)" in prompt and "不出现任何计算" in prompt
        assert c.get("/api/ai/status").json()["used_today"] == 1
        assert c.post("/api/ai/hint", json={**body, "level": 3}).status_code == 422


def test_daily_quota(data_dir, tmp_path, clock):
    llm = ScriptedLLM(lambda m: "提示")
    with make_client(data_dir, tmp_path, clock, llm=llm, ai_daily_limit=1) as c:
        assert c.post("/api/ai/hint", json={"question_id": "s01-set-intersection", "level": 1}).status_code == 200
        r = c.post("/api/ai/hint", json={"question_id": "s01-set-intersection", "level": 2})
        assert r.status_code == 429 and "用完" in r.json()["detail"]
        clock.advance(days=1)
        assert c.post("/api/ai/hint", json={"question_id": "s01-set-intersection", "level": 2}).status_code == 200


def test_llm_errors_become_502(data_dir, tmp_path, clock):
    def boom(_):
        raise LLMError("连不上大模型接口")
    with make_client(data_dir, tmp_path, clock, llm=ScriptedLLM(boom)) as c:
        r = c.post("/api/ai/hint", json={"question_id": "s01-set-intersection", "level": 1})
        assert r.status_code == 502 and "连不上" in r.json()["detail"]


# ---------------------------------------------------------------- 讲解 / 知识点 / OCR

def test_explain_after_wrong_attempt(data_dir, tmp_path, clock):
    reply = json.dumps({"explanation": "你漏了定义域。", "error_type": "reading", "error_reason": "没先求定义域"})
    llm = ScriptedLLM([reply, json.dumps({"explanation": "x", "error_type": "lazy"})])
    with make_client(data_dir, tmp_path, clock, llm=llm) as c:
        a = c.post("/api/attempts", json={"question_id": "s12-log-monotonic-interval",
                                          "response": {"value": "(1,+∞)"}, "seconds": 60}).json()
        data = c.post("/api/ai/explain", json={"attempt_id": a["attempt_id"]}).json()
        assert data["error_type"] == "reading" and data["explanation"] == "你漏了定义域。"
        assert "(1,+∞)" in _text(llm.calls[0]) and "(2,+\\infty)" in _text(llm.calls[0])
        b = c.post("/api/attempts", json={"question_id": "s09-ellipse-eccentricity",
                                          "response": {"value": "2"}, "seconds": 60}).json()
        assert c.post("/api/ai/explain", json={"attempt_id": b["attempt_id"]}).json()["error_type"] is None


def test_suggest_kps_keeps_only_known_ids(data_dir, tmp_path, clock):
    llm = ScriptedLLM(['```json\n{"kps": ["conic.eccentricity", "made.up", "conic.ellipse"]}\n```'])
    with make_client(data_dir, tmp_path, clock, llm=llm) as c:
        r = c.post("/api/ai/suggest-kps", json={"stem": "椭圆的离心率"}).json()
        assert r["kps"] == ["conic.eccentricity", "conic.ellipse"]
        assert "conic.eccentricity｜圆锥曲线｜离心率" in _text(llm.calls[0])


def test_ocr_uses_vision_model(data_dir, tmp_path, clock):
    vision = ScriptedLLM([json.dumps({"type": "single", "stem": "$1+1=$", "options": {"a": "1", "b": "2"},
                                      "answer": "null", "parts": None})])
    with make_client(data_dir, tmp_path, clock, vision=vision) as c:
        assert c.get("/api/ai/status").json() == {"text": False, "vision": True, "used_today": 0, "daily_limit": 60}
        assert c.post("/api/ai/ocr", json={"image": "data:image/png;base64,AAAA"}).status_code == 400
        draft = c.post("/api/ai/ocr", json={"image": PNG}).json()
        assert draft["type"] == "single" and draft["options"] == {"A": "1", "B": "2"} and draft["answer"] is None
        content = vision.calls[0][0]["content"]
        assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_parse_json_tolerates_wrapping():
    assert parse_json('好的：\n```json\n{"a": "x}y", "b": {"c": 1}}\n```') == {"a": "x}y", "b": {"c": 1}}
    with pytest.raises(LLMError):
        parse_json("没有 JSON")


# ---------------------------------------------------------------- 安全求值

@pytest.mark.parametrize("bad", [
    "__import__('os')", "a.real", "a[0]", "lambda: 1", "open", "9^9^9", "2**(3)**4", "x_1", "'s'", "1" * 8,
])
def test_safe_expr_rejects(bad):
    with pytest.raises(UnsafeExpression):
        safe_expr(bad, {"a": sp.Integer(2)})


def test_safe_expr_and_conditions():
    v = {"a": sp.Integer(3), "b": sp.Integer(4)}
    assert safe_expr("sqrt(a^2 + b**2)", v) == 5
    assert safe_expr("binomial(b, 2) * Rational(1, 2)", v) == 3
    assert safe_condition("a != b", v) and safe_condition("a + 1 == b", v) and not safe_condition("a > b", v)
    assert safe_condition("sqrt(2) < 3/2", {})
    with pytest.raises(UnsafeExpression):
        safe_condition("a < b < 5", v)


# ---------------------------------------------------------------- 变式题

TEMPLATE = {
    "params": {"p": {"randint": [2, 9]}, "d": {"choice": [1, 2, 3]}},
    "derived": {"q": "p - d"},
    "constraints": ["q > 0"],
    "stem": "在等差数列 $\\{a_n\\}$ 中，$a_2=[[p]]$，公差 $d=[[d]]$，则 $S_{10}=$ ______。",
    "answer": "10*q + 45*d",
    "answer_kind": "expr",
    "solution": "$a_1=[[q]]$，$S_{10}=10a_1+45d=[[ans]]$。",
}


def test_template_instantiation():
    t = parse_template(TEMPLATE)
    inst = instantiate(t, random.Random(1))
    p, d = (int(x) for x in re.findall(r"=(\d+)\$", inst.stem))
    assert int(inst.answer) == 10 * (p - d) + 45 * d
    assert inst.answer in inst.solution and "[[" not in inst.stem + inst.solution


@pytest.mark.parametrize("patch, message", [
    ({"params": {}}, "个数"),
    ({"params": {"__x": {"randint": [1, 2]}}}, "参数名"),
    ({"params": {"p": {"randint": [1, 1000]}}}, "范围"),
    ({"params": {"p": {"choice": ["1"]}}}, "候选值"),
    ({"stem": "[[zz]]"}, "不存在"),
    ({"answer_kind": "interval"}, "answer_kind"),
])
def test_template_rejects(patch, message):
    with pytest.raises(TemplateError, match=message):
        parse_template({**TEMPLATE, **patch})


def test_template_with_unsafe_answer_yields_nothing():
    t = parse_template({**TEMPLATE, "answer": "__import__('os')"})
    assert instantiate(t, random.Random(1), tries=5) is None


def _variant_llm(correct: bool):
    def reply(messages):
        text = _text(messages)
        if "参数化模板" in text:
            return json.dumps(TEMPLATE, ensure_ascii=False)
        p, d = (int(x) for x in re.findall(r"=(\d+)\$", text))
        answer = 10 * (p - d) + 45 * d
        return json.dumps({"answer": str(answer if correct else answer + 1)})
    return ScriptedLLM(reply)


def test_variants_cross_checked_and_saved(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock, llm=_variant_llm(correct=True)) as c:
        r = c.post("/api/ai/variants", json={"question_id": "s08-arithmetic-sum", "count": 2}).json()
        assert len(r["created"]) == 2 and r["variants_total"] == 2
        files = list((data_dir / "questions" / "variants").glob("*.yaml"))
        assert len(files) == 2
        v = c.get(f"/api/questions/{r['created'][0]}").json()
        assert v["parent_id"] == "s08-arithmetic-sum" and v["type"] == "fill" and "交叉验证" in v["source"]
        assert c.post("/api/ai/variants", json={"question_id": r["created"][0]}).status_code == 400

        # 变式题不作为新题推荐
        assert all(not i["question_id"].startswith("s08-arithmetic-sum-v") for i in c.get("/api/today").json()["items"])

        # 母题进了错题本后，做对变式题算在母题的卡上
        c.post("/api/attempts", json={"question_id": "s08-arithmetic-sum", "response": {"value": "1"}, "seconds": 30})
        reveal = c.post(f"/api/questions/{r['created'][0]}/reveal").json()
        res = c.post("/api/attempts", json={"question_id": r["created"][0], "response": {"value": reveal["answer"]},
                                            "seconds": 30}).json()
        assert res["full"] and res["review"]["created"] is False
        card = c.get("/api/questions/s08-arithmetic-sum").json()["card"]
        assert card["reps"] == 2


def test_variants_rejected_when_independent_solution_disagrees(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock, llm=_variant_llm(correct=False)) as c:
        r = c.post("/api/ai/variants", json={"question_id": "s08-arithmetic-sum", "count": 1}).json()
        assert r["created"] == [] and any("不一致" in x for x in r["rejected"])
        assert not (data_dir / "questions" / "variants").exists()
