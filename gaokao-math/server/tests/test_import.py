from pathlib import Path

import yaml
from sqlmodel import Session

from app.bank import iter_question_files, sync_bank
from app.config import load_settings
from app.core.today import recency_weight
from app.db import make_engine
from tools.import_open_data import fix_latex, normalize_fill, split_number, split_options
from tools.kp_rules import tag

from .conftest import DATA_DIR, make_client


def test_imported_bank_loads_cleanly(tmp_path):
    settings = load_settings()
    with Session(make_engine(tmp_path / "t.db")) as session:
        report = sync_bank(session, DATA_DIR, settings.type_defaults)
    assert report.errors == []
    files = iter_question_files(DATA_DIR / "questions" / "gaokao")
    assert len(files) >= 800
    years = set()
    for path in files:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        years.add(raw["year"])
        assert "Apache-2.0" in raw["source"] or "MIT" in raw["source"]
        if raw.get("figure"):
            assert (DATA_DIR / "figures" / raw["figure"]).exists()
    assert {2010, 2015, 2020, 2022, 2026} <= years


def test_split_number_and_score_prefix():
    assert split_number("4. (5 分) 已知 $x$") == (4, "已知 $x$")
    assert split_number(r"$(5$ 分 $)(1+i)(2+i)=(\quad)$")[1] == r"$(1+i)(2+i)=(\quad)$"
    assert split_number("1 已知 $z$", loose=True) == (1, "已知 $z$")
    assert split_number("4 位同学各自", loose=False) == (None, "4 位同学各自")
    assert split_number("12. (2023. 全国乙卷) 已知 $f(x)$") == (12, "已知 $f(x)$")


def test_split_options_inline_and_multiline():
    stem, opts = split_options("复数 $z$ 满足 $(\\quad)$\nA. $1-2 i$\nB. $1+2 i$\nC. $1+i$\nD. $1-i$")
    assert stem == "复数 $z$ 满足 $(\\quad)$" and opts == {"A": "$1-2 i$", "B": "$1+2 i$", "C": "$1+i$", "D": "$1-i$"}
    stem, opts = split_options("输出的 $S=(\\quad)$A. $1$B. $2$C. $3$D. $4$")
    assert opts["C"] == "$3$"
    assert split_options("没有选项的题") is None


def test_normalize_fill_answers():
    assert normalize_fill("$\\frac{3}{10} \\#\\# 0.3$", "概率为") == ("\\frac{3}{10}", "expr")
    assert normalize_fill("$\\left(-\\frac{1}{4},+\\infty\\right)$", "取值范围是")[1] == "interval"
    assert normalize_fill("$2 x+y+1=0$.", "切线方程为")[1] == "equation"
    assert normalize_fill("1 和 3", "则 $x=$")[1] == "set"
    assert normalize_fill("0. 98.", "正点率")[0] == "0.98"
    assert normalize_fill("(2)(3)", "正确的是") is None  # 命题序号：改为自评
    assert normalize_fill("分层抽样", "方法是") is None


def test_fix_latex_tables_and_complement():
    out = fix_latex("如表：\\begin{tabular}{|c|c|}\n\\hline 性别 & 男 \\\\\n\\hline 需要 & $40$ \\\\\n\\hline\n\\end{tabular}")
    assert "\\begin{array}{|c|c|}" in out and "\\text{性别}" in out and "$$" in out
    assert fix_latex("则 $C_{U} A=$") == "则 $\\complement_{U} A=$"
    assert fix_latex("\\(x+1\\)") == "$x+1$"


def test_kp_rules_examples():
    assert "conic.eccentricity" in tag("双曲线 $C$ 的离心率为 $\\sqrt{5}$，则渐近线方程为", "", "single")
    assert "complex.arith" in tag("$(1+i)(2-i)=(\\quad)$", "", "single")
    assert "solid.sphere" not in tag("甲、乙两人进行乒乓球比赛，每局甲获胜的概率为 0.6", "", "single")
    assert "trig.graph" in tag("函数 $f(x)=\\sin(\\omega x+\\phi)$ 的最小正周期为 $\\pi$", "", "single")
    assert set(tag("已知函数 $f(x)=e^{x}-ax$。(1) 讨论 $f(x)$ 的单调性；(2) 若 $f(x)$ 有两个零点，求 $a$ 的取值范围",
                   "", "solve")) & {"deriv.monotonic", "deriv.zeros"}


def test_recency_weight():
    assert recency_weight(None) == recency_weight(2026) == 1.0
    assert recency_weight(2010) < recency_weight(2016) < recency_weight(2019) < recency_weight(2024)


def _add(data_dir: Path, qid: str, year: int | None):
    q = {"type": "fill", "stem": f"题 {qid}：$1+1=$", "kps": ["set.operations"], "answer": "2",
         "difficulty_label": "基础", **({"year": year} if year else {})}
    (data_dir / "questions" / f"{qid}.yaml").write_text(yaml.safe_dump(q, allow_unicode=True), encoding="utf-8")


def test_today_prefers_recent_papers(data_dir, tmp_path, clock):
    _add(data_dir, "zz-old", 2011)
    _add(data_dir, "aa-new", 2024)
    with make_client(data_dir, tmp_path, clock, explore=0) as c:
        ids = [i["question_id"] for i in c.get("/api/today").json()["items"]]
        assert "aa-new" in ids
        if "zz-old" in ids:
            assert ids.index("aa-new") < ids.index("zz-old")


def test_flagged_question_is_not_recommended(client, clock):
    first = client.get("/api/today").json()["items"][0]["question_id"]
    assert client.post(f"/api/questions/{first}/flag", json={"reason": "题干乱码"}).json() == {"ok": True}
    detail = client.get(f"/api/questions/{first}").json()
    assert detail["flag"]["reason"] == "题干乱码"
    assert first not in [i["question_id"] for i in client.get("/api/today").json()["items"]]
    assert next(q for q in client.get("/api/questions").json() if q["id"] == first)["flagged"]
    exam = client.post("/api/exams", json={}).json()
    assert first not in [s["question_id"] for s in client.get(f"/api/exams/{exam['id']}").json()["slots"]]
    client.delete(f"/api/questions/{first}/flag")
    assert client.get(f"/api/questions/{first}").json()["flag"] is None
    assert client.post("/api/questions/nope/flag", json={}).status_code == 404
