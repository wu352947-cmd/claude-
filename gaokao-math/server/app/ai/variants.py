"""变式题生成（ARCHITECTURE.md §7.5）。

母题 → 大模型写参数化模板 → 程序随机取参数并用 SymPy 算出答案 → 检查答案「干净」
→ 大模型只看题干独立求解 → 两个答案等价才入库，否则丢弃。
模板里的表达式只在白名单内求值（core/safe_expr.py），大模型写的东西不会被当作代码执行。
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

import sympy as sp

from ..core.grading import fill_equal
from ..core.safe_expr import NAME, UnsafeExpression, safe_condition, safe_expr
from .llm import LLMError

MAX_PARAMS = 5
MAX_ABS = 100
PLACEHOLDER = re.compile(r"\[\[([a-z][a-z0-9]{0,5})\]\]")


class TemplateError(ValueError):
    pass


@dataclass
class Template:
    params: dict[str, list[int]]  # 参数 → 候选值
    derived: dict[str, str]
    constraints: list[str]
    stem: str
    answer: str
    answer_kind: str
    solution: str


@dataclass
class Instance:
    values: dict[str, sp.Expr]
    stem: str
    solution: str
    answer: str  # LaTeX
    key: tuple = field(default_factory=tuple)


def parse_template(obj: dict) -> Template:
    params_raw = obj.get("params")
    if not isinstance(params_raw, dict) or not 1 <= len(params_raw) <= MAX_PARAMS:
        raise TemplateError(f"参数个数必须在 1–{MAX_PARAMS} 之间")
    params: dict[str, list[int]] = {}
    for name, spec in params_raw.items():
        if not NAME.match(str(name)):
            raise TemplateError(f"参数名不合法：{name}")
        if not isinstance(spec, dict):
            raise TemplateError(f"参数 {name} 的取值格式不对")
        if "randint" in spec:
            lo, hi = spec["randint"]
            if not (isinstance(lo, int) and isinstance(hi, int) and -MAX_ABS <= lo <= hi <= MAX_ABS):
                raise TemplateError(f"参数 {name} 的范围不合法")
            params[name] = list(range(lo, hi + 1))
        elif "choice" in spec:
            choices = spec["choice"]
            if not (isinstance(choices, list) and 1 <= len(choices) <= 50
                    and all(isinstance(c, int) and abs(c) <= MAX_ABS for c in choices)):
                raise TemplateError(f"参数 {name} 的候选值不合法")
            params[name] = list(choices)
        else:
            raise TemplateError(f"参数 {name} 只能用 randint 或 choice")

    derived = obj.get("derived") or {}
    if not isinstance(derived, dict) or len(derived) > 6:
        raise TemplateError("derived 格式不对")
    for name in derived:
        if not NAME.match(str(name)) or name in params or name == "ans":
            raise TemplateError(f"中间量名字不合法：{name}")
    constraints = obj.get("constraints") or []
    if not isinstance(constraints, list) or len(constraints) > 10:
        raise TemplateError("constraints 格式不对")
    kind = obj.get("answer_kind", "expr")
    if kind not in ("expr", "set"):
        raise TemplateError("answer_kind 只能是 expr 或 set")
    stem, answer, solution = (str(obj.get(k) or "").strip() for k in ("stem", "answer", "solution"))
    if not stem or not answer:
        raise TemplateError("模板缺少题干或答案")
    known = set(params) | set(derived) | {"ans"}
    for text in (stem, solution):
        for name in PLACEHOLDER.findall(text):
            if name not in known:
                raise TemplateError(f"题干或解答引用了不存在的参数：{name}")
    return Template(params, {str(k): str(v) for k, v in derived.items()}, [str(c) for c in constraints],
                    stem, answer, kind, solution)


def _clean(value: sp.Expr) -> bool:
    """答案要像一道正常的高考题：有限的实数，没有离谱的大数和丑分数。"""
    if not value.is_finite or value.has(sp.I) or value.free_symbols:
        return False
    if sp.count_ops(value) > 12:
        return False
    if value.is_Rational:
        return abs(value.q) <= 100 and abs(value.p) <= 100000
    return True


def _render(text: str, values: dict[str, sp.Expr], answer_latex: str) -> str:
    return PLACEHOLDER.sub(lambda m: answer_latex if m.group(1) == "ans" else sp.latex(values[m.group(1)]), text)


def instantiate(t: Template, rng: random.Random, tries: int = 300) -> Instance | None:
    names = list(t.params)
    for _ in range(tries):
        values: dict[str, sp.Expr] = {n: sp.Integer(rng.choice(t.params[n])) for n in names}
        try:
            for name, expr in t.derived.items():
                values[name] = sp.simplify(safe_expr(expr, values))
            if not all(safe_condition(c, values) for c in t.constraints):
                continue
            parts = [sp.simplify(safe_expr(p, values)) for p in t.answer.split(",")] if t.answer_kind == "set" \
                else [sp.simplify(safe_expr(t.answer, values))]
        except (UnsafeExpression, ZeroDivisionError, TypeError, ValueError):
            continue
        if not all(_clean(p) for p in parts) or (t.answer_kind == "set" and len(set(parts)) != len(parts)):
            continue
        answer = ", ".join(sp.latex(p) for p in parts)
        return Instance(values=values, stem=_render(t.stem, values, answer),
                        solution=_render(t.solution, values, answer),
                        answer=answer, key=tuple(int(values[n]) for n in names))
    return None


@dataclass
class VariantResult:
    created: list[dict] = field(default_factory=list)  # 待写入 YAML 的题目
    rejected: list[str] = field(default_factory=list)


def generate(ai, q, count: int, rng: random.Random, original_answers: list[str] | None = None) -> VariantResult:
    result = VariantResult()
    try:
        template = parse_template(ai.variant_template(q))
    except (TemplateError, LLMError) as exc:
        result.rejected.append(f"模板不可用：{exc}")
        return result

    seen_keys: set[tuple] = set()
    solve_budget, draws = count * 2, 0
    while len(result.created) < count and solve_budget > 0 and draws < 60:
        draws += 1
        inst = instantiate(template, rng)
        if inst is None:
            result.rejected.append("找不到满足约束、答案又干净的参数")
            break
        if inst.key in seen_keys:
            continue
        seen_keys.add(inst.key)
        if original_answers and any(fill_equal(inst.answer, a, template.answer_kind) for a in original_answers):
            continue  # 和原题答案一样，没有练习价值
        solve_budget -= 1
        try:
            independent = ai.solve_final_answer(inst.stem, template.answer_kind)
        except LLMError as exc:
            result.rejected.append(f"独立求解失败：{exc}")
            continue
        if not fill_equal(independent, inst.answer, template.answer_kind):
            result.rejected.append(f"交叉验证不一致：程序算出 {inst.answer}，独立求解得 {independent}")
            continue
        result.created.append({
            "stem": inst.stem,
            "answer": inst.answer,
            "answer_kind": template.answer_kind,
            "solution": inst.solution,
        })
    return result
