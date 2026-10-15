"""mtef.py 解析出的节点树 → LaTeX（KaTeX 能渲染的子集）。"""

from __future__ import annotations

import re

from .mtef import Node

TEXT, FUNC, VAR, LCG, UCG, SYM, VEC, NUM, MTEXTRA, TEXT_FE = 129, 130, 131, 132, 133, 134, 135, 136, 139, 140

SYMBOLS = {
    0x2212: "-", 0xB1: r"\pm ", 0x2213: r"\mp ", 0xD7: r"\times ", 0x22C5: r"\cdot ", 0xB7: r"\cdot ",
    0xF7: r"\div ", 0x2264: r"\leq ", 0x2265: r"\geq ", 0x2260: r"\neq ", 0x2248: r"\approx ",
    0x2245: r"\cong ", 0x223C: r"\sim ", 0x2208: r"\in ", 0x2209: r"\notin ", 0x2282: r"\subset ",
    0x2284: r"\not\subset ", 0x2283: r"\supset ", 0x2286: r"\subseteq ", 0x2287: r"\supseteq ",
    0x2229: r"\cap ", 0x222A: r"\cup ", 0x2205: r"\varnothing ", 0x221E: r"\infty ",
    0x2220: r"\angle ", 0x22A5: r"\perp ", 0x2225: r"\parallel ", 0x25B3: r"\triangle ",
    0x394: r"\Delta ", 0x2206: r"\Delta ", 0x2211: r"\sum ", 0x220F: r"\prod ", 0x222B: r"\int ",
    0x2192: r"\to ", 0x2190: r"\leftarrow ", 0x21D2: r"\Rightarrow ", 0x21D4: r"\Leftrightarrow ",
    0x21D0: r"\Leftarrow ", 0x2194: r"\leftrightarrow ", 0x2234: r"\therefore ", 0x2235: r"\because ",
    0xB0: r"^{\circ}", 0x2032: "'", 0x2033: "''", 0x22EF: r"\cdots ", 0x2026: r"\cdots ", 0x2201: r"\complement ",
    0x2200: r"\forall ", 0x2203: r"\exists ", 0x2223: r"\mid ", 0x2329: r"\langle ", 0x232A: r"\rangle ",
    0x27E8: r"\langle ", 0x27E9: r"\rangle ", 0x2202: r"\partial ", 0x2207: r"\nabla ", 0x221D: r"\propto ",
    0x2261: r"\equiv ", 0x226A: r"\ll ", 0x226B: r"\gg ", 0x22A4: r"\top ", 0x2297: r"\otimes ", 0x2295: r"\oplus ",
    0x2A7D: r"\leqslant ", 0x2A7E: r"\geqslant ", 0x22EE: r"\vdots ", 0x22F1: r"\ddots ", 0x2218: r"\circ ", 0x2022: r"\bullet ", 0x2016: r"\| ",
    0x7B: r"\{", 0x7D: r"\}", 0x25: r"\%", 0x23: r"\#", 0x26: r"\&", 0x5F: r"\_", 0x7C: "|",
    0x3C: "<", 0x3E: ">", 0x5C: r"\backslash ", 0x7E: r"\sim ", 0x2A: r"\ast ", 0x3B: ";", 0x21: "!",
    0x20D7: "", 0x2D: "-", 0xA0: " ", 0x2009: " ", 0x2003: r"\quad ", 0x2002: r"\ ",
}
GREEK = {
    "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "varepsilon", "ϵ": "epsilon", "ζ": "zeta",
    "η": "eta", "θ": "theta", "ϑ": "vartheta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu",
    "ξ": "xi", "π": "pi", "ϖ": "varpi", "ρ": "rho", "ϱ": "varrho", "σ": "sigma", "ς": "varsigma", "τ": "tau",
    "υ": "upsilon", "φ": "varphi", "ϕ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
    "Γ": "Gamma", "Δ": "Delta", "Θ": "Theta", "Λ": "Lambda", "Ξ": "Xi", "Π": "Pi", "Σ": "Sigma",
    "Φ": "Phi", "Ψ": "Psi", "Ω": "Omega",
}
FUNCS = {
    "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "lg", "lim", "max", "min", "exp", "arcsin",
    "arccos", "arctan", "sinh", "cosh", "tanh", "det", "gcd", "sup", "inf", "arg", "deg", "dim", "ker",
}
OPERATORS = {0x2211: r"\sum", 0x220F: r"\prod", 0x222B: r"\int", 0x222E: r"\oint", 0x22C3: r"\bigcup", 0x22C2: r"\bigcap"}
EMBELL = {2: r"\dot{%s}", 3: r"\ddot{%s}", 8: r"\tilde{%s}", 9: r"\hat{%s}", 11: r"\vec{%s}", 12: r"\overleftarrow{%s}",
          13: r"\overleftrightarrow{%s}", 16: r"\bar{%s}", 17: r"\bar{%s}", 18: r"\overset{\frown}{%s}", 10: r"\not %s"}
FENCE_CHAR = {0x28: "(", 0x29: ")", 0x5B: "[", 0x5D: "]", 0x7B: r"\{", 0x7D: r"\}", 0xEC07: "|", 0xEC08: "|",
              0x7C: "|", 0x2016: r"\|", 0x2329: r"\langle ", 0x232A: r"\rangle ", 0x27E8: r"\langle ", 0x27E9: r"\rangle ",
              0x230A: r"\lfloor ", 0x230B: r"\rfloor ", 0x2308: r"\lceil ", 0x2309: r"\rceil ", 0x3C: r"\langle ", 0x3E: r"\rangle "}

unknown: set[int] = set()


def _is_cjk(code: int) -> bool:
    return code >= 0x2E80 and not (0x2190 <= code <= 0x22FF) or code in (0x2223,) and False


class Ctx:
    def __init__(self) -> None:
        self.unknown: set[int] = set()


def line(n: Node, c: Ctx) -> str:
    return "" if n.null else seq(n.kids, c)


def seq(ns: list[Node], c: Ctx) -> str:
    out: list[str] = []
    i = 0
    while i < len(ns):
        n = ns[i]
        if n.kind == "char":
            # 连续中文 → \text{}
            if n.typeface == TEXT_FE or (n.code >= 0x3000 and n.code not in SYMBOLS and n.code > 0x2FFF):
                j = i
                s = ""
                while j < len(ns) and ns[j].kind == "char" and (ns[j].typeface == TEXT_FE or ns[j].code >= 0x3000) and not ns[j].embells:
                    s += chr(ns[j].code)
                    j += 1
                out.append(r"\text{" + s + "}")
                i = j
                continue
            # 连续函数名 sin/log/…
            if n.typeface == FUNC and chr(n.code).isalpha() and n.code < 128:
                j = i
                s = ""
                while j < len(ns) and ns[j].kind == "char" and ns[j].typeface == FUNC and chr(ns[j].code).isalpha() and ns[j].code < 128:
                    s += chr(ns[j].code)
                    j += 1
                out.append((r"\%s " % s) if s in FUNCS else (r"\mathrm{%s}" % s))
                i = j
                continue
            out.append(char(n, c))
        elif n.kind == "tmpl":
            out.append(tmpl(n, c))
        elif n.kind == "matrix":
            out.append(matrix(n, c))
        elif n.kind == "pile":
            out.append(r"\begin{matrix}" + r" \\ ".join(line(k, c) for k in n.kids) + r"\end{matrix}")
        elif n.kind == "line":
            out.append(line(n, c))
        i += 1
    return _tidy("".join(out))


def _tidy(s: str) -> str:
    # 命令后紧跟字母时需要空格；已有的尾随空格保留，最后统一压缩。
    return re.sub(r" {2,}", " ", s)


def char(n: Node, c: Ctx) -> str:
    code = n.code
    ch = chr(code) if code else ""
    if code in SYMBOLS and not (n.typeface in (VAR, TEXT, NUM) and code < 128 and ch.isalnum()):
        s = SYMBOLS[code]
    elif ch in GREEK:
        s = "\\" + GREEK[ch] + " "
    elif n.typeface == VEC and ch.isalpha() and code < 128:
        s = r"\mathbf{%s}" % ch
    elif code < 128 or code in (0x2018, 0x2019, 0x201C, 0x201D):
        s = {0x2018: "'", 0x2019: "'", 0x201C: "``", 0x201D: "''"}.get(code, ch)
    elif code == 0xEC07 or code == 0xEC08:
        s = "|"
    else:
        c.unknown.add(code)
        s = ch
    for e in n.embells:
        f = EMBELL.get(e)
        if e == 5:
            s += "'"
        elif e == 6:
            s += "''"
        elif f:
            s = f % s
        else:
            c.unknown.add(-e)
    return s


def _slot(n: Node, i: int, c: Ctx) -> str:
    return line(n.kids[i], c) if i < len(n.kids) and n.kids[i].kind == "line" else ""


def _fence_chars(n: Node) -> tuple[str, str]:
    chars = [k for k in n.kids if k.kind == "char"]
    left = right = ""
    names = [FENCE_CHAR.get(k.code, chr(k.code)) for k in chars]
    if n.var & 1 and n.var & 2 and len(names) >= 2:
        left, right = names[0], names[1]
    elif n.var & 1 and names:
        left = names[0]
    elif n.var & 2 and names:
        right = names[-1]
    return left, right


BIG = re.compile(r"\\(frac|sum|prod|int|begin|sqrt)")


def tmpl(n: Node, c: Ctx) -> str:
    s, v = n.code, n.var
    if s <= 9:  # 括号类
        inner_nodes = [k for k in n.kids if k.kind != "char"]
        inner = "".join(line(k, c) if k.kind == "line" else seq([k], c) for k in inner_nodes)
        left, right = _fence_chars(n)
        if s == 2 and v == 1 and inner.startswith(r"\begin{matrix}"):
            return r"\begin{cases}" + inner[len(r"\begin{matrix}"):-len(r"\end{matrix}")] + r"\end{cases}"
        if s == 4 and v == 1:
            return r"\mid " + inner
        if s == 4 and v == 2:
            return inner + r"\mid "
        if s == 9 and not (left or right):
            return inner
        if BIG.search(inner) and left and right:
            return r"\left" + left + inner + r"\right" + right
        if (left == "" or right == "") and BIG.search(inner):
            return (r"\left" + left if left else r"\left.") + inner + (r"\right" + right if right else r"\right.")
        return left + inner + right
    if s == 10:  # 根式
        idx = _slot(n, 1, c)
        rad = _slot(n, 0, c)
        return (r"\sqrt[%s]{%s}" % (idx, rad)) if idx else (r"\sqrt{%s}" % rad)
    if s == 11:  # 分数
        return r"\frac{%s}{%s}" % (_slot(n, 0, c), _slot(n, 1, c))
    if s == 12:
        return r"\underline{%s}" % _slot(n, 0, c)
    if s == 13:
        return r"\overline{%s}" % _slot(n, 0, c)
    if s in (14, 15):  # 箭头 / 线段上的标记
        return r"\overrightarrow{%s}" % _slot(n, 0, c)
    if s == 27:  # 下标
        return "_{%s}" % _slot(n, 0, c)
    if s == 28:  # 上标
        return "^{%s}" % _slot(n, 1, c)
    if s == 29:  # 上下标
        return "_{%s}^{%s}" % (_slot(n, 0, c), _slot(n, 1, c))
    if s == 31:  # 向量
        base = _slot(n, 0, c)
        marks = [k.code for k in n.kids if k.kind == "char"]
        if 0x20D7 in marks or not marks:
            return r"\overrightarrow{%s}" % base
        return r"\overrightarrow{%s}" % base
    if s in (16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26):  # 大运算符 + 上下限
        op = ""
        for k in n.kids:
            ch = k if k.kind == "char" else (k.kids[0] if k.kind == "line" and k.kids and k.kids[0].kind == "char" else None)
            if ch is not None and ch.code in OPERATORS:
                op = OPERATORS[ch.code]
        if not op:
            op = r"\sum"
        lo, hi = _slot(n, 1, c), _slot(n, 2, c)
        body = _slot(n, 0, c)
        return op + ("_{%s}" % lo if lo else "") + ("^{%s}" % hi if hi else "") + " " + body
    c.unknown.add(-1000 - s)
    return "".join(line(k, c) for k in n.kids if k.kind == "line")


def matrix(n: Node, c: Ctx) -> str:
    cells = [line(k, c) for k in n.kids if k.kind == "line"]
    cols = max(n.cols, 1)
    rows = [cells[i:i + cols] for i in range(0, len(cells), cols)]
    return r"\begin{matrix}" + r" \\ ".join(" & ".join(r) for r in rows) + r"\end{matrix}"


def to_latex(objs: list[Node], c: Ctx | None = None) -> str:
    c = c or Ctx()
    if len(objs) == 1 and objs[0].kind == "line":
        return seq(objs[0].kids, c).strip()
    return seq(objs, c).strip()
