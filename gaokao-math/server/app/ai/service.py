"""AI 功能（ARCHITECTURE.md §7）。原则：

1. 讲解必须基于标准解答：模型负责「解释」，不负责从零做题；
2. 分级提示，不直接给答案；
3. 每天调用次数封顶，相同请求走缓存；
4. 所有 AI 内容在界面上标注「AI 生成，仅供参考」。
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlmodel import Session

from ..models import AiCache, AiUsage, Question
from .llm import ChatClient, LLMError, parse_json

ERROR_TYPES = ("concept", "method", "calc", "reading", "time", "guess")

SYSTEM = (
    "你是一位耐心、严谨的高中数学老师，正在辅导一名准备新高考（新课标 I 卷）的高三学生。"
    "数学公式一律用 LaTeX，行内公式用 $...$，独立公式用 $$...$$。不要使用 Markdown 标题和表格。"
)

HINT_RULES = {
    1: "第 1 级提示：只指出这道题考什么、题目里哪个条件最关键、该往哪个方向想。不出现任何计算过程和结果。不超过 80 字。",
    2: "第 2 级提示：给出解题的关键一步（关键的变形、构造或设法），可以写出这一步的式子，但不要给出最终答案。不超过 150 字。",
}


class AIUnavailable(RuntimeError):
    pass


class AIQuotaExceeded(RuntimeError):
    pass


def question_text(q: Question) -> str:
    text = q.stem.strip()
    if q.options:
        text += "\n" + "\n".join(f"{k}. {v}" for k, v in q.options.items())
    return text


def answer_text(q: Question) -> str:
    if q.type == "solve":
        return "；".join(f"{p['label']} {p.get('answer', '')}" for p in q.parts or [])
    if isinstance(q.answer, list):
        return "".join(q.answer)
    return str(q.answer)


def describe_response(q: Question, response: dict) -> str:
    if q.type == "single":
        return response.get("choice") or "（没有作答）"
    if q.type == "multi":
        return "".join(response.get("choices") or []) or "（没有作答）"
    if q.type == "fill":
        return response.get("value") or "（没有作答）"
    scores = response.get("part_scores") or []
    return "自评得分：" + "，".join(f"{p['label']} {s}/{p['points']:g}" for p, s in zip(q.parts or [], scores))


class AIService:
    def __init__(self, session: Session, settings, text: ChatClient | None, vision: ChatClient | None,
                 tz: ZoneInfo, now: datetime):
        self.session = session
        self.settings = settings
        self.text = text
        self.vision = vision
        self.tz = tz
        self.now = now

    # ------------------------------------------------------------ 基础设施

    def _day(self) -> str:
        return self.now.astimezone(self.tz).date().isoformat()

    def usage(self) -> dict:
        row = self.session.get(AiUsage, self._day())
        return {"used_today": row.calls if row else 0, "daily_limit": self.settings.ai_daily_limit}

    def _call(self, client: ChatClient | None, messages: list[dict], *, json_mode: bool = False,
              cache: bool = True, temperature: float = 0.3) -> str:
        if client is None:
            raise AIUnavailable("没有配置大模型，见 README 的「AI 功能」一节")
        key = hashlib.sha256(json.dumps([client.model, messages, json_mode, temperature],
                                        ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if cache and (hit := self.session.get(AiCache, key)):
            return hit.value
        usage = self.session.get(AiUsage, self._day()) or AiUsage(day=self._day(), calls=0)
        if usage.calls >= self.settings.ai_daily_limit:
            raise AIQuotaExceeded(f"今天的 AI 调用次数已用完（{self.settings.ai_daily_limit} 次），明天再来，或在 config.yaml 里调高")
        usage.calls += 1
        self.session.add(usage)
        self.session.commit()  # 先记账：即使调用失败也算一次，防止反复重试刷爆额度
        value = client.chat(messages, json_mode=json_mode, temperature=temperature)
        if cache:
            self.session.merge(AiCache(key=key, value=value, created_at=self.now))
            self.session.commit()
        return value

    def _ask(self, prompt: str, **kw) -> str:
        return self._call(self.text, [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], **kw)

    def _ask_json(self, prompt: str, **kw) -> dict:
        return parse_json(self._ask(prompt, json_mode=True, **kw))

    # ------------------------------------------------------------ 功能

    def hint(self, q: Question, level: int, current_answer: str = "") -> str:
        if level not in HINT_RULES:
            raise ValueError("提示级别只能是 1 或 2")
        prompt = (
            f"【题目】\n{question_text(q)}\n\n【标准解答】\n{q.solution or '（无）'}\n\n"
            f"【学生目前写的答案】{current_answer or '（还没写）'}\n\n"
            f"请给学生一个提示。{HINT_RULES[level]}\n严格沿着标准解答的思路，不要另起炉灶。只输出提示本身。"
        )
        return self._ask(prompt).strip()

    def explain(self, q: Question, response: dict, score: float, max_score: float) -> dict:
        prompt = (
            f"【题目】\n{question_text(q)}\n\n【标准答案】{answer_text(q)}\n\n【标准解答】\n{q.solution or '（无）'}\n\n"
            f"【学生的作答】{describe_response(q, response)}（得分 {score:g}/{max_score:g}）\n\n"
            "请以标准解答为准，给学生讲清楚这道题：先用一两句话点出学生最可能错在哪一步，"
            "再给出规范、可以按步得分的完整解答，最后用一句话总结「以后看到什么条件要想到什么」。\n"
            "同时判断学生的主要错因，只能是以下之一：concept（概念不清）、method（方法没想到）、"
            "calc（计算失误）、reading（审题错误）、time（时间不够）、guess（不会，蒙的）。\n"
            '只输出 JSON：{"explanation": "讲解全文", "error_type": "错因代码", "error_reason": "一句话说明为什么这样判断"}'
        )
        data = self._ask_json(prompt)
        error_type = data.get("error_type")
        return {
            "explanation": str(data.get("explanation") or "").strip(),
            "error_type": error_type if error_type in ERROR_TYPES else None,
            "error_reason": str(data.get("error_reason") or "").strip(),
        }

    def suggest_kps(self, stem: str, kps: list) -> list[str]:
        catalog = "\n".join(f"{k.id}｜{k.module}｜{k.name}" for k in kps)
        prompt = (
            f"下面是知识点列表（格式：id｜模块｜名称）：\n{catalog}\n\n【题目】\n{stem}\n\n"
            "从列表中选出这道题考查的 1–3 个知识点，按重要程度排序。"
            '只输出 JSON：{"kps": ["id1", "id2"]}，id 必须原样来自列表。'
        )
        valid = {k.id for k in kps}
        picked = [k for k in self._ask_json(prompt, temperature=0).get("kps") or [] if k in valid]
        return list(dict.fromkeys(picked))[:3]

    def ocr(self, image_data_url: str) -> dict:
        prompt = (
            "识别图片中的一道高中数学题，转写成文字。要求：\n"
            "1. 公式全部用 LaTeX，行内用 $...$；\n"
            "2. 选择题的选项不要放进题干；解答题的小问用 (1)(2) 分段，每问另起一段；\n"
            "3. 图形无法转写，在题干相应位置写「（见图）」；\n"
            "4. 看不清的地方写「□」，不要猜。\n"
            '只输出 JSON：{"type": "single|multi|fill|solve", "stem": "题干", '
            '"options": {"A": "...", "B": "...", "C": "...", "D": "..."} 或 null, '
            '"answer": "图中如果有答案就写，没有写 null", "parts": ["(1)", "(2)"] 或 null}'
        )
        messages = [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]}]
        data = parse_json(self._call(self.vision, messages, json_mode=True, temperature=0))
        qtype = data.get("type") if data.get("type") in ("single", "multi", "fill", "solve") else "fill"
        options = data.get("options") if isinstance(data.get("options"), dict) else None
        parts = data.get("parts") if isinstance(data.get("parts"), list) else None
        return {
            "type": qtype,
            "stem": str(data.get("stem") or "").strip(),
            "options": {str(k).upper(): str(v) for k, v in options.items()} if options else None,
            "answer": None if data.get("answer") in (None, "null", "") else data.get("answer"),
            "parts": [str(p) for p in parts] if parts else None,
        }

    def variant_template(self, q: Question) -> dict:
        prompt = VARIANT_PROMPT.format(question=question_text(q), answer=answer_text(q),
                                       solution=q.solution or "（无）")
        return self._ask_json(prompt, cache=False, temperature=0.7)

    def solve_final_answer(self, stem: str, kind: str) -> str:
        """独立求解（不给标准答案），用来交叉验证变式题。"""
        form = {"set": "所有答案用英文逗号隔开", "interval": "用区间表示", "equation": "写成方程"}.get(kind, "一个准确值")
        prompt = (f"【题目】\n{stem}\n\n请仔细求解这道题。最终答案要求：{form}，写准确值（分数、根式、π 等），不要写小数近似。\n"
                  '只输出 JSON：{"answer": "最终答案的 LaTeX"}')
        data = self._ask_json(prompt, cache=False, temperature=0)
        answer = data.get("answer")
        if not answer:
            raise LLMError("AI 没有给出答案")
        return str(answer)


VARIANT_PROMPT = """下面是一道高中数学题。请把它改编成「参数化模板」，用来生成同类变式题（填空题，只有一个最终答案）。

【原题】
{question}

【原题答案】{answer}

【原题解答】
{solution}

模板格式（只输出 JSON，不要输出其它内容）：
{{
  "params": {{"a": {{"randint": [2, 6]}}, "b": {{"choice": [1, 2, 3, 5]}}}},
  "derived": {{"d": "b - a"}},
  "constraints": ["a != b", "d > 0"],
  "stem": "题干，参数写成 [[a]]，例如：已知等差数列中 $a_2=[[a]]$ ……",
  "answer": "用参数写出的答案表达式，例如 (a + b)/2",
  "answer_kind": "expr",
  "solution": "解答过程，同样用 [[a]] 引用参数，最后写出答案 [[ans]]"
}}

规则：
1. params 最多 5 个，名字只用小写字母（可带数字），每个参数要么 randint [最小, 最大]（整数，绝对值不超过 100），要么 choice [若干个整数]。
2. derived 是由参数算出的中间量，可以在题干和解答中引用；answer 的值也可以用 [[ans]] 引用。
3. answer、derived、constraints 只能用：数字、参数名、+ - * / ** ( )、以及函数 sqrt、log、exp、sin、cos、tan、Abs、binomial、factorial、Rational、pi、E。
   不要用 Python 的其它写法，不要用下划线、方括号、字符串。
4. constraints 是比较式（<、>、<=、>=、==、!=），保证题目有意义、答案唯一、数字干净（避免出现很大的数或很丑的分数）。
5. answer_kind 只能是 expr（一个值）或 set（多个值，answer 写成用英文逗号隔开的多个表达式）。
6. 题型、考点、难度要和原题一致，只改数字（必要时改动条件的表述），不要改变解题方法。
"""
