"""在白名单内求值数学表达式（变式题模板用）。

sympy 的 parse_expr 内部会 eval，而模板来自大模型，所以先做严格的字符和名称检查：
只允许数字、运算符、括号、逗号和白名单里的函数名 / 变量名，不允许下划线、引号、方括号、属性访问。
"""

from __future__ import annotations

import re

import sympy as sp
from sympy.parsing.sympy_parser import convert_xor, parse_expr, standard_transformations


class UnsafeExpression(ValueError):
    pass


FUNCTIONS = {
    "sqrt": sp.sqrt, "log": sp.log, "ln": sp.log, "exp": sp.exp,
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "Abs": sp.Abs, "abs": sp.Abs,
    "binomial": sp.binomial, "factorial": sp.factorial, "Rational": sp.Rational,
    "floor": sp.floor, "ceiling": sp.ceiling, "Min": sp.Min, "Max": sp.Max, "gcd": sp.gcd,
    "pi": sp.pi, "E": sp.E,
}
NAME = re.compile(r"^[a-z][a-z0-9]{0,5}$")
_CHARS = re.compile(r"^[0-9A-Za-z+\-*/^().,\s]*$")
_IDENT = re.compile(r"[A-Za-z][A-Za-z0-9]*")
_TRANSFORMS = standard_transformations + (convert_xor,)
MAX_LEN = 300


def _check(text: str, names: set[str]) -> str:
    s = str(text).strip()
    if not s or len(s) > MAX_LEN:
        raise UnsafeExpression("表达式为空或太长")
    if not _CHARS.match(s):
        raise UnsafeExpression(f"表达式含有不允许的字符：{s}")
    if re.search(r"(?<!\d)\.|\.(?!\d)", s):
        raise UnsafeExpression("小数点只能出现在数字中间")
    if re.search(r"\d{7,}", s):
        raise UnsafeExpression("数字太大")
    compact = s.replace(" ", "")
    if re.search(r"(\*\*|\^)([A-Za-z0-9.]+|\([^()]*\))(\*\*|\^)", compact):
        raise UnsafeExpression("不允许连续乘方")  # 防止 9^9^9 这种算不完的数
    for ident in _IDENT.findall(s):
        if ident not in FUNCTIONS and ident not in names:
            raise UnsafeExpression(f"不认识的名称：{ident}")
    return s


def safe_expr(text: str, values: dict[str, sp.Expr] | None = None) -> sp.Expr:
    values = values or {}
    s = _check(text, set(values))
    try:
        expr = parse_expr(s, local_dict={**FUNCTIONS, **values}, transformations=_TRANSFORMS, evaluate=True)
    except Exception as exc:  # noqa: BLE001
        raise UnsafeExpression(f"无法计算：{s}") from exc
    if not isinstance(expr, sp.Expr):
        raise UnsafeExpression(f"不是数学表达式：{s}")
    return expr


_COMPARE = re.compile(r"(<=|>=|!=|==|<|>)")


def safe_condition(text: str, values: dict[str, sp.Expr]) -> bool:
    pieces = _COMPARE.split(str(text))
    if len(pieces) != 3:
        raise UnsafeExpression(f"约束条件只能有一个比较符号：{text}")
    lhs, op, rhs = pieces
    diff = sp.nsimplify(safe_expr(lhs, values) - safe_expr(rhs, values))
    try:
        v = complex(sp.N(diff, 30))
    except (TypeError, ValueError) as exc:
        raise UnsafeExpression(f"约束条件无法求值：{text}") from exc
    if abs(v.imag) > 1e-12:
        return False
    x = v.real
    eps = 1e-12
    return {
        "<": x < -eps, ">": x > eps, "<=": x <= eps, ">=": x >= -eps,
        "==": abs(x) <= eps, "!=": abs(x) > eps,
    }[op]
