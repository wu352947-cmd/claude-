"""判分（ARCHITECTURE.md §6）。

填空题答案支持四种 kind：
- expr      单个值：1/2、\\frac{\\sqrt3}{2}、√3/2、2π/3
- set       多个值，顺序无关：-1, \\sqrt{2}；1或2
- interval  区间并：(-\\infty,1)\\cup(2,+\\infty)；R
- equation  方程，两边同乘非零常数视为相同：x-y+1=0 与 2x-2y+2=0

输入既可以是 LaTeX（含反斜杠或花括号），也可以是普通写法。普通写法只允许白名单字符，
因为 sympy 的 parse_expr 内部会执行 eval。
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

import sympy as sp
from sympy.parsing.latex import parse_latex
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

MAX_INPUT_LEN = 200
FILL_KINDS = ("expr", "set", "interval", "equation")


class ParseError(ValueError):
    pass


@dataclass
class Grade:
    score: float
    max_score: float
    full: bool
    detail: dict = field(default_factory=dict)


# ---------------------------------------------------------------- 解析

_FULLWIDTH = str.maketrans({
    "（": "(", "）": ")", "［": "[", "］": "]", "｛": "{", "｝": "}",
    "，": ",", "；": ";", "：": ":", "＋": "+", "－": "-", "−": "-", "–": "-",
    "＝": "=", "／": "/", "×": "*", "·": "*", "÷": "/", "　": " ",
    "²": "^2", "³": "^3",
})

_LATEX_FIXES = [
    (r"\dfrac", r"\frac"), (r"\tfrac", r"\frac"),
    (r"\left", ""), (r"\right", ""),
    (r"\,", ""), (r"\;", ""), (r"\!", ""), (r"\ ", ""),
    (r"\cdot", r"\times"), (r"\mathrm{e}", "e"), (r"\mathrm{i}", "i"),
    ("π", r"\pi "), ("∞", r"\infty "),
]

_PLAIN_ALLOWED = re.compile(r"^[0-9A-Za-z+\-*/^().\s]*$")
_PLAIN_NAMES = {"sqrt", "log", "ln", "pi", "sin", "cos", "tan", "oo", "inf"}
_SYMBOL_CONSTANTS = {"pi": sp.pi, "e": sp.E, "i": sp.I}
_TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)


def _clean(text: str) -> str:
    if text is None:
        raise ParseError("答案为空")
    s = str(text).translate(_FULLWIDTH).strip().rstrip("。.")
    s = s.strip("$").strip()
    if not s:
        raise ParseError("答案为空")
    if len(s) > MAX_INPUT_LEN:
        raise ParseError("答案太长")
    return s


def _is_latex(s: str) -> bool:
    return "\\" in s or "{" in s


def _with_constants(expr: sp.Expr) -> sp.Expr:
    subs = {sym: _SYMBOL_CONSTANTS[sym.name] for sym in expr.free_symbols if sym.name in _SYMBOL_CONSTANTS}
    return expr.subs(subs) if subs else expr


def _parse_plain(s: str) -> sp.Expr:
    s = re.sub(r"√\s*(\d+(?:\.\d+)?|[A-Za-z])", r"sqrt(\1)", s)
    s = s.replace("√", "sqrt").replace("π", "pi").replace("∞", "oo")
    if not _PLAIN_ALLOWED.match(s):
        raise ParseError(f"无法识别的字符：{s}")
    if re.search(r"(?<!\d)\.|\.(?!\d)", s):
        raise ParseError(f"无法识别的小数点：{s}")
    for name in re.findall(r"[A-Za-z]{2,}", s):
        if name not in _PLAIN_NAMES:
            raise ParseError(f"无法识别的名称：{name}")
    s = s.replace("inf", "oo")
    local = {"ln": sp.log, "log": sp.log, "sqrt": sp.sqrt, "pi": sp.pi, "e": sp.E, "i": sp.I, "oo": sp.oo,
             "sin": sp.sin, "cos": sp.cos, "tan": sp.tan}
    try:
        return parse_expr(s, local_dict=local, transformations=_TRANSFORMS, evaluate=True)
    except Exception as exc:  # noqa: BLE001  sympy 抛出的异常类型很多
        raise ParseError(f"无法解析：{s}") from exc


def _parse_latex(s: str) -> sp.Expr:
    for old, new in _LATEX_FIXES:
        s = s.replace(old, new)
    s = s.replace("√", r"\sqrt ")
    # 手写常见的省略花括号：\sqrt3、\frac12、\frac{1}2
    s = re.sub(r"\\sqrt\s*(\d|[A-Za-z](?![A-Za-z]))", r"\\sqrt{\1}", s)
    s = re.sub(r"\\frac\s*(\d)\s*(\d)", r"\\frac{\1}{\2}", s)
    s = re.sub(r"\\frac\s*(\{[^{}]*\})\s*(\d)", r"\\frac\1{\2}", s)
    try:
        expr = parse_latex(s)
    except Exception as exc:  # noqa: BLE001
        raise ParseError(f"无法解析：{s}") from exc
    return _with_constants(expr)


def parse_value(text: str, *, strip_var: bool = True) -> sp.Expr:
    s = _clean(text)
    if strip_var:
        s = re.sub(r"^[A-Za-z]\s*=\s*", "", s)  # 学生写成 a=1/2 也接受
    expr = _parse_latex(s) if _is_latex(s) else _parse_plain(s)
    if isinstance(expr, sp.Basic) and not isinstance(expr, sp.Expr):
        raise ParseError(f"不是一个数学表达式：{text}")
    return expr


def _split_values(text: str) -> list[str]:
    s = _clean(text)
    s = re.sub(r"^\\?\{(.*?)\\?\}$", r"\1", s)  # 去掉集合外层花括号
    parts = [p.strip() for p in re.split(r"[,;]|或|和", s)]
    parts = [p for p in parts if p]
    if not parts:
        raise ParseError("答案为空")
    return parts


@dataclass
class Interval:
    left: sp.Expr
    right: sp.Expr
    left_closed: bool
    right_closed: bool


def _parse_endpoint(text: str) -> sp.Expr:
    t = text.strip().replace(" ", "")
    if t in {"+\\infty", "\\infty", "+∞", "∞", "+oo", "oo", "+inf", "inf"}:
        return sp.oo
    if t in {"-\\infty", "-∞", "-oo", "-inf"}:
        return -sp.oo
    return parse_value(t, strip_var=False)


def parse_intervals(text: str) -> list[Interval]:
    s = _clean(text)
    if s in {"R", r"\mathbb{R}", r"\mathbf{R}", "ℝ"}:
        return [Interval(-sp.oo, sp.oo, False, False)]
    pieces = re.split(r"\\cup|∪|U|或", s)
    out = []
    for piece in pieces:
        m = re.fullmatch(r"\s*([(\[])(.+),(.+)([)\]])\s*", piece)
        if not m:
            raise ParseError(f"无法识别的区间：{piece}")
        out.append(Interval(_parse_endpoint(m.group(2)), _parse_endpoint(m.group(3)),
                            m.group(1) == "[", m.group(4) == "]"))
    return out


def parse_equation(text: str) -> sp.Expr:
    s = _clean(text)
    if s.count("=") != 1:
        raise ParseError("方程需要恰好一个等号")
    lhs, rhs = s.split("=")
    return parse_value(lhs, strip_var=False) - parse_value(rhs, strip_var=False)


def parse_answer(text: str, kind: str):
    """解析标准答案，用于题库校验；解析失败抛 ParseError。"""
    if kind == "expr":
        return parse_value(text)
    if kind == "set":
        return [parse_value(p) for p in _split_values(text)]
    if kind == "interval":
        return parse_intervals(text)
    if kind == "equation":
        return parse_equation(text)
    raise ParseError(f"未知的答案类型：{kind}")


# ---------------------------------------------------------------- 等价判定

def _numeric(expr: sp.Expr) -> complex:
    return complex(sp.N(expr, 30))


def expr_equal(a: sp.Expr, b: sp.Expr) -> bool:
    if a.has(sp.oo, -sp.oo, sp.zoo) or b.has(sp.oo, -sp.oo, sp.zoo):
        return a == b
    try:
        if sp.simplify(a - b) == 0:
            return True
    except Exception:  # noqa: BLE001
        pass
    syms = sorted(a.free_symbols | b.free_symbols, key=str)
    rng = random.Random(20270607)
    for _ in range(8 if syms else 1):
        subs = {s: rng.uniform(0.3, 2.7) for s in syms}
        try:
            va, vb = _numeric(a.subs(subs)), _numeric(b.subs(subs))
        except (TypeError, ValueError):
            return False
        if abs(va - vb) > 1e-9 * max(1.0, abs(vb)):
            return False
    return True


def _multiset_equal(xs: list[sp.Expr], ys: list[sp.Expr]) -> bool:
    if len(xs) != len(ys):
        return False
    remaining = list(ys)
    for x in xs:
        for i, y in enumerate(remaining):
            if expr_equal(x, y):
                del remaining[i]
                break
        else:
            return False
    return True


def _intervals_equal(xs: list[Interval], ys: list[Interval], loose: bool) -> bool:
    if len(xs) != len(ys):
        return False
    key = lambda iv: float(iv.left) if iv.left.is_finite else float("-inf")  # noqa: E731
    for x, y in zip(sorted(xs, key=key), sorted(ys, key=key)):
        if not (expr_equal(x.left, y.left) and expr_equal(x.right, y.right)):
            return False
        if x.left.is_finite and not loose and x.left_closed != y.left_closed:
            return False
        if x.right.is_finite and not loose and x.right_closed != y.right_closed:
            return False
        if not x.left.is_finite and x.left_closed or not x.right.is_finite and x.right_closed:
            return False  # 无穷端点不能是闭的
    return True


def _equations_equal(a: sp.Expr, b: sp.Expr) -> bool:
    if b == 0:
        return a == 0
    try:
        ratio = sp.simplify(a / b)
    except Exception:  # noqa: BLE001
        return False
    return not ratio.free_symbols and ratio != 0 and ratio.is_finite is not False


def fill_equal(student: str, answer: str, kind: str = "expr", loose_endpoints: bool = False) -> bool:
    try:
        if kind == "expr":
            return expr_equal(parse_value(student), parse_value(answer))
        if kind == "set":
            return _multiset_equal(parse_answer(student, "set"), parse_answer(answer, "set"))
        if kind == "interval":
            return _intervals_equal(parse_intervals(student), parse_intervals(answer), loose_endpoints)
        if kind == "equation":
            return _equations_equal(parse_equation(student), parse_equation(answer))
    except ParseError:
        return False
    raise ValueError(f"未知的答案类型：{kind}")


# ---------------------------------------------------------------- 各题型判分

def grade(q, response: dict) -> Grade:
    """q 是 models.Question（或带同名属性的对象），response 见 api.AttemptIn。"""
    pts = float(q.points)
    if q.type == "single":
        choice = str(response.get("choice") or "").strip().upper()
        ok = choice == q.answer
        return Grade(pts if ok else 0.0, pts, ok, {"correct": q.answer})

    if q.type == "multi":
        chosen = {str(c).strip().upper() for c in response.get("choices") or []}
        correct = set(q.answer)
        if not chosen or chosen - correct:
            score = 0.0  # 有错选得 0 分
        else:
            score = pts * len(chosen) / len(correct)  # 新高考：每选对一个得 pts/正确选项数
        return Grade(round(score, 2), pts, chosen == correct, {"correct": sorted(correct)})

    if q.type == "fill":
        value = str(response.get("value") or "")
        ok = bool(value.strip()) and fill_equal(value, q.answer, q.answer_kind, q.loose_endpoints)
        return Grade(pts if ok else 0.0, pts, ok, {"correct": q.answer})

    if q.type == "solve":
        parts = q.parts or []
        given = list(response.get("part_scores") or [])
        scores = []
        for i, part in enumerate(parts):
            raw = given[i] if i < len(given) else 0
            try:
                v = float(raw)
            except (TypeError, ValueError):
                v = 0.0
            scores.append(min(max(v, 0.0), float(part["points"])))
        total = round(sum(scores), 2)
        return Grade(total, pts, total >= pts, {"part_scores": scores})

    raise ValueError(f"未知题型：{q.type}")
