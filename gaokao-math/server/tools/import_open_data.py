"""把开源高考数学真题数据集转换成题库 YAML。

数据来源（克隆或下载到同一个目录下）：

    git clone --depth 1 https://github.com/OpenLMLab/GAOKAO-Bench          # 2010–2022
    git clone --depth 1 https://github.com/OpenLMLab/GAOKAO-Bench-Updates  # 2023–2024 选择题
    git clone --depth 1 https://github.com/OpenMOSS/GAOKAO-MM              # 2010–2023 带图选择题
    curl -L -o gaokao_math_2026.jsonl \\
      https://huggingface.co/datasets/XHToken/gaokao_math_2026/resolve/main/data/gaokao_math_2026.jsonl
    for f in gaokao-mathqa gaokao-mathcloze; do                            # AGIEval（MIT），含 2021–2022 新高考卷
      curl -L -o agieval-$f.jsonl https://raw.githubusercontent.com/ruixiangcui/AGIEval/main/data/v1_1/$f.jsonl
    done

然后在 server/ 下运行（需要 Node.js 和 web/node_modules，用 KaTeX 检查公式能否渲染）：

    uv run --with pillow python -m tools.import_open_data --src <目录>

会重写 data/questions/gaokao/ 并把配图写进 data/figures/，同时打印跳过了哪些题、为什么。
"""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path

import yaml

from app.bank import load_knowledge_graph, normalize_question, write_question_file
from app.config import PROJECT_ROOT
from app.core.grading import ParseError, parse_answer
from app.images import save_figure

from .kp_rules import tag

DATA_DIR = PROJECT_ROOT / "data"
FIXES = yaml.safe_load((Path(__file__).parent / "import_fixes.yaml").read_text(encoding="utf-8")) or {}
OUT_SUBDIR = "gaokao"
# GAOKAO-Bench-Updates 的仓库没有附许可文件，转换出的题只放在本机（已在 .gitignore 里），不随代码分发
LOCAL_SUBDIR = "gaokao-local"
UNLICENSED = {"updates"}
# AGIEval 里这些卷子的题已逐题人工验算（错的记在 import_fixes.yaml）；其余卷子的答案只能信数据集
AGIEVAL_CHECKED = {"xkb1", "xkb2"}
LICENSE_NOTE = {
    "bench": "GAOKAO-Bench（Apache-2.0）",
    "updates": "GAOKAO-Bench-Updates（仓库未附许可，仅供个人学习）",
    "mm": "GAOKAO-MM（Apache-2.0）",
    "xh2026": "gaokao_math_2026（Apache-2.0）",
    "agieval": "AGIEval（MIT）",
}


@dataclass
class Raw:
    origin: str  # bench | updates | mm | xh2026
    year: int
    paper: str  # 全国I卷、新课标I卷……
    slug: str
    fmt: str  # 试卷结构，决定题号对应的题型和难度
    num: int | None
    type: str  # single | multi | fill | solve
    score: float
    text: str  # 题干（选择题含选项）
    answer: object
    solution: str
    track: str = ""  # 文 / 理（老高考分文理）
    pictures: list[Path] = field(default_factory=list)
    rate_rule: str = ""
    num_estimated: bool = False  # 题号是按顺序推算的，不显示


# ---------------------------------------------------------------- 试卷

FORMATS = {
    "old": {"single": (1, 12), "fill": (13, 16), "solve": (17, 21)},
    "new22": {"single": (1, 8), "multi": (9, 12), "fill": (13, 16), "solve": (17, 22)},
    "new19": {"single": (1, 8), "multi": (9, 11), "fill": (12, 14), "solve": (15, 19)},
    "bj": {"single": (1, 10), "fill": (11, 15), "solve": (16, 21)},
    "sh": {"fill": (1, 12), "single": (13, 16), "solve": (17, 21)},
    "tj": {"single": (1, 9), "fill": (10, 15), "solve": (16, 20)},
    "zj": {"single": (1, 10), "fill": (11, 17), "solve": (18, 22)},
}


def bench_paper(year: int, category: str) -> tuple[str, str, str]:
    c = category.replace(" ", "").lower()
    if "甲" in c:
        return "全国甲卷", "jia", "old"
    if "乙" in c:
        return "全国乙卷", "yi", "old"
    if "ⅲ" in c or "iii" in c:
        return "全国III卷", "qg3", "old"
    if "ⅱ" in c or "ii" in c:
        if "新高考" in c or year >= 2023:
            return "新课标II卷", "xkb2", "new22" if year == 2023 else "new19"
        return "全国II卷", "qg2", "old"
    if "ⅰ" in c or "i" in c:
        if year >= 2023:
            return "新课标I卷", "xkb1", "new22" if year == 2023 else "new19"
        if year == 2021:
            return "全国乙卷", "yi", "old"  # GAOKAO-Bench 把 2021 年乙卷标成了新课标Ⅰ
        return "全国I卷", "qg1", "old"
    return "全国新课标卷", "qgxkb", "old"


def updates_category(cat: str) -> str:
    # 2023 年的数据里有几条 category 混进了解析文字，取末尾的卷名
    for name in ("新课标Ⅰ卷", "新课标 I ", "新课标 I", "新课标I", "全国新高考Ⅱ卷", "新课标II",
                 "全国乙卷理科", "全国甲卷理科", "全国甲卷文科"):
        if cat.strip().endswith(name.strip()) or cat.strip() == name.strip():
            return name
    return cat


# ---------------------------------------------------------------- 文本清理

NUM_PREFIX = re.compile(r"^\s*(\d{1,2})\s*[.．、]\s*(?:[(（]\s*\d+\s*分\s*[)）])?\s*")
SCORE_PREFIX = re.compile(r"^\$?\s*[(（]\s*\d+\s*\$?\s*分\s*\$?\s*[)）]\s*")
PAPER_PREFIX = re.compile(r"^\s*[(（]\s*20\d\d\s*[.．]?\s*[^)）]{2,12}[)）]\s*")


def cell_tex(cell: str) -> str:
    """表格的一个单元格 → array 里的内容：公式去掉 $，文字包进 \\text{}。"""
    out = []
    for piece in re.split(r"(\$[^$]*\$)", cell.strip()):
        if len(piece) >= 2 and piece.startswith("$") and piece.endswith("$"):
            out.append(piece[1:-1])
        elif piece.strip():
            text = piece.strip().replace("%", "\\%")
            out.append(f"\\text{{{text}}}" if re.search(r"[^\x00-\x7f]", text) else text)
    return " ".join(out)


def tabular_to_array(m: re.Match) -> str:
    spec = re.sub(r"[pmb]\{[^}]*\}", "c", m.group(1))
    rows = []
    for row in re.split(r"\\\\", m.group(2)):
        hlines = row.count("\\hline")
        body = row.replace("\\hline", "")
        cells = " & ".join(cell_tex(c) for c in re.split(r"(?<!\\)&", body)) if body.strip() else ""
        rows.append("\\hline " * hlines + cells)
    return "$$\\begin{array}{" + spec + "}" + " \\\\ ".join(rows) + "\\end{array}$$"


def markdown_table_to_array(m: re.Match) -> str:
    lines = [ln.strip() for ln in m.group(0).strip().splitlines()]
    rows = [ln.strip("|").split("|") for ln in lines if not re.fullmatch(r"[\s|:\-]*-[\s|:\-]*", ln)]
    n = max(len(r) for r in rows)
    body = " \\\\ \\hline ".join(" & ".join(cell_tex(c) for c in r) for r in rows)
    return "\n$$\\begin{array}{|" + "c|" * n + "}\\hline " + body + " \\\\ \\hline\\end{array}$$\n"


def fix_latex(s: str) -> str:
    s = s.replace("\\(", "$").replace("\\)", "$").replace("\\[", "$$").replace("\\]", "$$")
    s = re.sub(r"\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}", tabular_to_array, s)
    s = re.sub(r"(?:^\s*\|.*\|\s*$\n?){2,}", markdown_table_to_array, s, flags=re.M)
    # 识别错的补集符号：\partial_{U}、\oint_{U}、老教材的 C_{U}A
    s = re.sub(r"\\(partial|oint)\s*_\{[^}]*\}", r"\\complement_{U}", s)
    s = re.sub(r"\\partial\s*(?=\()", r"\\complement_{U}", s)
    s = re.sub(r"(?<![A-Za-z\\])C_\{([A-Z])\}\s*(?=[A-Z(\\])", r"\\complement_{\1} ", s)
    # 三角形符号被识别成了 V / \vee
    s = re.sub(r"\\(big)?vee\s*(?=A\s*B\s*C)", r"\\triangle ", s)
    s = re.sub(r"(^|[^A-Za-z\\$])V\s*\$(\s*A\s*B\s*C)", r"\1$\\triangle\2", s)
    return s


def clean(s: str) -> str:
    # 数据集里少数反斜杠被 JSON 当成了转义：\frac → 换页符 + rac，\bar → 退格符 + ar
    s = (s or "").replace("\x08", "\\b").replace("\x0c", "\\f").replace("\t", "\\t")
    s = re.sub(r"\r(?=[a-z])", r"\\r", s).replace("\r", "")
    s = s.replace("雉", "锥").replace("\\mathrm{~", "\\mathrm{").replace("\\mathbf{~", "\\mathbf{")
    s = re.sub(r"【(解析|分析|详解|解答|点睛|答案|小问\d详解)】\s*\}", r"【\1】", s)
    s = re.sub(r"^\s*【解析】\s*", "", s)
    s = re.sub(r"^\s*【解答】\s*", "", s)
    s = re.sub(r"【点睛】[\s\S]*$", "", s)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "（图略）", s)  # 解析里引用的外链图片
    s = fix_latex(s)  # 点睛是给老师看的套话，去掉
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def split_number(text: str, loose: bool = False) -> tuple[int | None, str]:
    text = PAPER_PREFIX.sub("", text)
    m = NUM_PREFIX.match(text) or (re.match(r"^\s*(\d{1,2})\s+(?=[^\d\s])", text) if loose else None)
    num = int(m.group(1)) if m else None
    rest = text[m.end():] if m else text
    sm = SCORE_PREFIX.match(rest)
    if sm:
        rest = rest[sm.end():]
        if sm.group(0).count("$") % 2 == 1 and not dollars_balanced(rest):
            rest = "$" + rest
    rest = PAPER_PREFIX.sub("", rest)
    return num, rest.strip()


OPT = re.compile(r"(?<![A-Za-z\\{_^])([A-D])\s*[.．、:：]\s*")


def dollars_balanced(s: str) -> bool:
    return len(re.findall(r"(?<!\\)\$", s)) % 2 == 0


def split_options(text: str) -> tuple[str, dict[str, str]] | None:
    ms = list(OPT.finditer(text))
    chosen = []
    limit = len(text)
    for letter in "DCBA":
        cand = [m for m in ms if m.group(1) == letter and m.end() <= limit]
        if not cand:
            return None
        chosen.append(cand[-1])
        limit = cand[-1].start()
    chosen.reverse()
    stem = text[:chosen[0].start()].strip()
    opts = {}
    for i, m in enumerate(chosen):
        end = chosen[i + 1].start() if i < 3 else len(text)
        opts[m.group(1)] = text[m.end():end].strip().rstrip("；;").strip()
    if not dollars_balanced(stem) or not all(dollars_balanced(v) for v in opts.values()):
        return None
    return stem, opts


# ---------------------------------------------------------------- 过滤

OFF_SYLLABUS = [
    ("程序框图", r"框图|程序|输出的|输入的|伪代码|算法"),
    ("三视图", r"三视图|正视图|侧视图|俯视图|主视图|左视图"),
    ("极坐标与参数方程", r"极坐标|参数方程|极轴|极点|为参数"),
    ("线性规划", r"约束条件|可行域|线性规划"),
    ("茎叶图", r"茎叶图"),
    ("定积分", r"\\int|定积分|微积分基本定理|曲线.{0,40}所围成的(封闭)?图形"),
    ("极限", r"\\lim"),
    ("几何证明选讲", r"切割线|圆内接四边形|弦切角"),
    ("绝对值不等式选讲", r"柯西不等式|绝对值三角不等式"),
]
NEED_FIGURE = re.compile(r"!\[|mathpix|如图|图中|下图|右图|左图|见图|图所示|网格纸|图象大致|图像大致|大致图象|大致图像|统计图|折线图|"
                         r"条形图|饼图|直方图|散点图|雷达图|图\s*\d|图\(\d\)|下面的图|示意图|阴影|小正方形")
GARBLE = [
    r"\\left\[_\{",  # 组合数 C_n^k 被识别成了 [_n^k
    r"(?<![,，+\s])\s*\\ldots\s*(?![,，+\s]|\$|$)",  # ≥ 被识别成了 …
    r"\\cdots\s*\d",
    r"\{\s*\}_\{",
    r"\]\s*_\{\d\}\^\{",
    r"\\mid\s*\\mid",
    r"\\square",
    r"＼",
    r"\|\|\s*\w\s*\\mid",
]


def why_off(text: str) -> str | None:
    s = re.sub(r"\s+", "", text)
    for name, rx in OFF_SYLLABUS:
        if re.search(rx, s):
            return name
    return None


def garbled(text: str) -> bool:
    return any(re.search(rx, text) for rx in GARBLE)


# ---------------------------------------------------------------- 填空题答案

CHINESE = re.compile(r"[\u4e00-\u9fff]")


def normalize_fill(answer: str, stem: str) -> tuple[str, str] | None:
    """把数据集里的填空答案整理成判分程序认得的形式，返回 (答案, answer_kind)；认不了返回 None。"""
    a = clean(str(answer)).strip()
    a = re.split(r"\s*\\#\s*\\#\s*|\s*##\s*", a)[0]  # 「$\frac{3}{10} \#\# 0.3$」：多个等价写法，取第一个
    a = re.sub(r"[。．.]\s*$", "", a).strip()
    a = re.sub(r"(\d)\.\s+(\d)", r"\1.\2", a)
    if a.count("}") > a.count("{"):
        a = a.rstrip("}")
    a = re.sub(r"\s*(和|或|与|及)\s*", ", ", a)
    if CHINESE.search(a) or "；" in a or re.search(r"[①-⑩]|^\(?\d\)\(\d\)", a):
        return None
    a = a.replace("$", "").strip()
    a = re.sub(r"^\\left\\\{|\\right\\\}$", "", a)
    a = a.replace("\\mathrm{~", "\\mathrm{").replace("\\displaystyle", "")
    a = re.sub(r"\\(left|right)(?=[()\[\]|.])", "", a)
    a = re.sub(r"\\mathrm\{([a-zA-Z])\}", r"\1", a)
    if not a or "|" in a or "\\mid" in a or "\\pm" in a or "±" in a:
        return None
    if re.match(r"^\(.*,.*\)$", a) and "坐标" in stem[-30:]:
        return None  # 点的坐标：判分程序会当成区间
    if a.count("=") == 1 and len(set(re.findall(r"[xy]", a))) == 2:
        kinds = ["equation"]
    elif re.search(r"\\cup|∪|\\infty|∞", a) or (re.match(r"^[(\[].*,.*[)\]]$", a) and re.search(r"范围|区间|解集", stem)):
        kinds = ["interval"]
    elif "," in a or "，" in a:
        kinds = ["set"]
    else:
        kinds = ["expr"]
    for kind in kinds:
        try:
            parse_answer(a, kind)
            return a, kind
        except (ParseError, Exception):  # noqa: BLE001 —— SymPy 解析失败的异常种类很多
            continue
    return None


# ---------------------------------------------------------------- 解答题拆问

PART = re.compile(r"[（(]\s*(1|2|3|Ⅰ|Ⅱ|Ⅲ|I{1,3}|i{1,3})\s*[)）]")
ORDER = {"1": 1, "2": 2, "3": 3, "Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "I": 1, "II": 2, "III": 3, "i": 1, "ii": 2, "iii": 3}


def split_parts(stem: str) -> list[tuple[str, int]]:
    """找出 (1)(2)(3) 各问的位置，返回 [(标签, 起始位置)]。"""
    found = []
    want = 1
    for m in PART.finditer(stem):
        if ORDER[m.group(1)] == want:
            found.append((f"({want})", m.start()))
            want += 1
    return found if len(found) >= 2 else []


def part_points(score: float, n: int, rate_rule: str) -> list[float]:
    if rate_rule:
        pts = [float(x) for x in re.findall(r"分值\s*(\d+)\s*分", rate_rule)]
        if len(pts) == n and sum(pts) == score:
            return pts
    if n <= 1:
        return [score]
    if n == 2:
        first = round(score * 0.42)
        return [first, score - first]
    each = round(score * 0.3)
    return [each] * (n - 1) + [score - each * (n - 1)]


# ---------------------------------------------------------------- 难度

def difficulty(fmt: str, qtype: str, num: int | None) -> str:
    rng = FORMATS.get(fmt, {}).get(qtype)
    if not num or not rng or not rng[0] <= num <= rng[1]:
        return "中档"
    lo, hi = rng
    f = (num - lo) / max(hi - lo, 1)
    if qtype == "single":
        return "基础" if f < 0.4 else "中档" if f < 0.75 else "较难"
    if qtype == "fill":
        return "基础" if f < 0.34 else "中档" if f < 0.67 else "较难"
    if qtype == "multi":
        return "中档" if f < 0.5 else "较难"
    return "中档" if f < 0.6 else "较难" if f < 1 else "压轴"


def type_by_number(fmt: str, num: int | None) -> str | None:
    for t, (lo, hi) in FORMATS.get(fmt, {}).items():
        if num and lo <= num <= hi:
            return t
    return None


# ---------------------------------------------------------------- 读取各数据集

def load_bench(src: Path) -> list[Raw]:
    base = src / "GAOKAO-Bench" / "Data"
    files = [
        ("Objective_Questions/2010-2022_Math_I_MCQs.json", "single", "理"),
        ("Objective_Questions/2010-2022_Math_II_MCQs.json", "single", "文"),
        ("Subjective_Questions/2010-2022_Math_I_Fill-in-the-Blank.json", "fill", "理"),
        ("Subjective_Questions/2010-2022_Math_II_Fill-in-the-Blank.json", "fill", "文"),
        ("Subjective_Questions/2010-2022_Math_I_Open-ended_Questions.json", "solve", "理"),
        ("Subjective_Questions/2010-2022_Math_II_Open-ended_Questions.json", "solve", "文"),
    ]
    out = []
    for rel, qtype, track in files:
        for e in json.loads((base / rel).read_text(encoding="utf-8"))["example"]:
            year = int(e["year"])
            paper, slug, fmt = bench_paper(year, e["category"])
            num, text = split_number(clean(e["question"]))
            if qtype == "solve":
                solution = clean(e.get("answer") or "") or clean(e.get("analysis") or "")
                answer = None
            else:
                solution = clean(e.get("analysis") or "")
                answer = e["answer"]
            out.append(Raw("bench", year, paper, slug, fmt, num, qtype, float(e.get("score") or 5), text,
                           answer, solution, track))
    return out


def load_updates(src: Path) -> list[Raw]:
    out = []
    for year in (2023, 2024):
        path = src / "GAOKAO-Bench-Updates" / "Data" / f"GAOKAO-Bench-{year}" / f"{year}_Math_MCQs.json"
        for e in json.loads(path.read_text(encoding="utf-8"))["example"]:
            cat = updates_category(e["category"])
            paper, slug, fmt = bench_paper(year, cat)
            track = "理" if "理" in cat else "文" if "文" in cat else ""
            num, text = split_number(clean(e["question"]), loose=True)
            out.append(Raw("updates", year, paper, slug, fmt, num, "single", float(e.get("score") or 5), text,
                           e["answer"], clean(e.get("analysis") or ""), track))
    return out


def load_mm(src: Path) -> list[Raw]:
    base = src / "GAOKAO-MM" / "Data"
    out = []
    for e in json.loads((base / "2010-2023_Math_MCQs.json").read_text(encoding="utf-8"))["example"]:
        year = int(e["year"])
        paper, slug, fmt = bench_paper(year, e["category"])
        num, text = split_number(clean(e["question"]))
        pics = [base / p.replace("../Data/", "") for p in e.get("picture") or []]
        out.append(Raw("mm", year, paper, slug, fmt, num, "single", float(e.get("score") or 5), text,
                       e["answer"], clean(e.get("analysis") or ""), "", pics))
    return out


def load_xh2026(src: Path) -> list[Raw]:
    path = src / "gaokao_math_2026.jsonl"
    types = {"单选题": "single", "多选题": "multi", "填空题": "fill", "解答题": "solve"}
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        e = json.loads(line)
        name = e["paper_name"]
        if name.startswith("全国一卷"):
            paper, slug, fmt = "新课标I卷", "xkb1", "new19"
        elif name.startswith("全国二卷"):
            paper, slug, fmt = "新课标II卷", "xkb2", "new19"
        elif "上海" in name:
            paper, slug, fmt = "上海卷", "sh", "sh"
        elif "天津" in name:
            paper, slug, fmt = "天津卷", "tj", "tj"
        else:
            paper, slug, fmt = "北京卷", "bj", "bj"
        num = int(e["question_number"].rsplit("_", 1)[1])
        qtype = types[e["question_type"]]
        out.append(Raw("xh2026", 2026, paper, slug, fmt, num, qtype, float(e["max_score"]), clean(e["query"]),
                       e["target"], "", "", [], str(e.get("rate_rule") or "")))
    return out


def agieval_paper(source: str) -> tuple[str, str, str]:
    year = int(re.search(r"20\d\d", source).group(0))
    s = source.replace(" ", "")
    if "北京" in s:
        return "北京卷", "bj", "bj"
    if "天津" in s:
        return "天津卷", "tj", "tj"
    if "浙江" in s:
        return "浙江卷", "zj", "zj"
    if "新高考" in s:
        two = re.search(r"新高考(Ⅱ|II|2|ii)", s, re.I)
        name, slug = ("新课标II卷", "xkb2") if two else ("新课标I卷", "xkb1")
        return name, slug, "new22" if year <= 2023 else "new19"
    if "大纲" in s:
        return "全国大纲卷", "dg", "old"
    if "卷ⅰ" in s or "卷Ⅰ" in s:
        return "全国I卷", "qg1", "old"
    if "卷ⅱ" in s or "卷Ⅱ" in s:
        return "全国II卷", "qg2", "old"
    if "卷Ⅲ" in s or "卷ⅲ" in s:
        return "全国III卷", "qg3", "old"
    return bench_paper(year, s)


def load_agieval(src: Path) -> list[Raw]:
    """AGIEval 没有题号和解析；题号按同一张卷子里出现的顺序推算（只用来估难度）。"""
    out = []
    seen: Counter = Counter()
    for name, qtype in (("agieval-gaokao-mathqa.jsonl", "single"), ("agieval-gaokao-mathcloze.jsonl", "fill")):
        path = src / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            e = json.loads(line)
            source = e["other"]["source"]
            year = int(re.search(r"20\d\d", source).group(0))
            paper, slug, fmt = agieval_paper(source)
            track = "理" if "理科" in source else "文" if "文科" in source else ""
            text = clean(re.sub(r"(\\\\\s*)+$", "", e["question"].strip()))
            if qtype == "single":
                opts = "\n".join(re.sub(r"^\(([A-D])\)\s*", r"\1. ", o) for o in e["options"])
                text = f"{text}\n{opts}"
                answer = list(re.sub(r"[^A-D]", "", e["label"] or ""))
            else:
                answer = e["answer"]
            key = (source, qtype if len(answer) < 2 or qtype == "fill" else "multi")
            lo = FORMATS[fmt].get(key[1], FORMATS[fmt].get(qtype, (1, 1)))[0]
            num = lo + seen[key]
            seen[key] += 1
            out.append(Raw("agieval", year, paper, slug, fmt, num, qtype, 5.0, text, answer, "", track,
                           num_estimated=True))
    return out


# ---------------------------------------------------------------- 配图

def compose_figure(pictures: list[Path]) -> bytes:
    """把一道题的几张图拼成一张。数据集里图的顺序不固定（选项图里自带 A、B、C、D 标记），所以按原顺序排成网格。"""
    from PIL import Image

    ims = []
    for p in pictures:
        im = Image.open(p)
        im.load()
        ims.append(im.convert("RGB"))
    cols = 2 if len(ims) >= 4 else 1
    cell_w = max(im.width for im in ims)
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    gap = 24
    width = cell_w * cols + gap * (cols - 1)
    height = sum(max(im.height for im in row) for row in rows) + gap * (len(rows) - 1)
    canvas = Image.new("RGB", (width, height), "white")
    y = 0
    for row in rows:
        for i, im in enumerate(row):
            canvas.paste(im, (i * (cell_w + gap) + (cell_w - im.width) // 2, y))
        y += max(im.height for im in row) + gap
    if canvas.width > 1200:
        canvas = canvas.resize((1200, round(canvas.height * 1200 / canvas.width)), Image.LANCZOS)
    buf = io.BytesIO()
    canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------- KaTeX 检查

def katex_failures(texts: dict[str, str]) -> set[str]:
    """用前端同一个 KaTeX 渲染每段公式，返回渲染失败的 key。"""
    script = r"""
const katex = require(process.argv[1]);
const items = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
const bad = [];
for (const [key, text] of Object.entries(items)) {
  for (const m of text.matchAll(MATH)) {
    try { katex.renderToString(m[1] ?? m[2], {throwOnError: true, strict: 'ignore', displayMode: m[1] !== undefined}); }
    catch (e) { bad.push(key); break; }
  }
}
process.stdout.write(JSON.stringify(bad));
"""
    katex = PROJECT_ROOT / "web" / "node_modules" / "katex"
    res = subprocess.run(["node", "-e", script, str(katex)], input=json.dumps(texts), capture_output=True,
                         text=True, check=True)
    return set(json.loads(res.stdout))


# ---------------------------------------------------------------- 转换

def dedupe_text(raw: Raw) -> str:
    """去掉 LaTeX 命令和符号，只留汉字、字母、数字：不同数据集对同一道题的排版不一样。"""
    s = re.sub(r"\\[a-zA-Z]+", "", raw.text)
    return "".join(re.findall(r"[\u4e00-\u9fff0-9a-zA-Z]", s))[:80]


def answer_text(raw: Raw) -> str:
    a = "".join(map(str, raw.answer)) if isinstance(raw.answer, list) else str(raw.answer or "")
    return "".join(re.findall(r"[0-9a-zA-Z]", re.sub(r"\\(mathrm|left|right|dfrac|frac)", "", a)))


def group_duplicates(raws: list[Raw]) -> list[list[Raw]]:
    """同一年、题干几乎一样、答案一样的算同一道题（文理两卷共用的题、不同数据集收录的同一道题）。"""
    groups: list[tuple[Raw, str, str, list[Raw]]] = []
    by_year: dict[int, list[int]] = defaultdict(list)
    for r in raws:
        text, ans = dedupe_text(r), answer_text(r)
        for i in by_year[r.year]:
            first, gtext, gans, members = groups[i]
            # AGIEval 的答案约有 2–3% 标错（和 GAOKAO-Bench 对照、人工验算过），题干相同就以另一份为准
            agieval = "agieval" in (r.origin, first.origin)
            if (agieval or not ans or not gans or ans == gans) and SequenceMatcher(None, text, gtext).ratio() > 0.9:
                members.append(r)
                break
        else:
            by_year[r.year].append(len(groups))
            groups.append((r, text, ans, [r]))
    return [g[3] for g in groups]


def convert(raws: list[Raw], kp_ids: set[str], figures_dir: Path) -> tuple[dict[str, dict], Counter, list[str]]:
    skipped: Counter = Counter()
    notes: list[str] = []

    # 1) 带图的版本（GAOKAO-MM）优先；同一题在文理两卷都出现时合并
    mm_index = {(r.year, r.slug, r.num): r for r in raws if r.origin == "mm"}
    kept = [r for r in raws
            if not (r.origin == "bench" and (r.year, r.slug, r.num) in mm_index and r.type == "single")]  # 用 MM 里带图的那条

    out: dict[str, dict] = {}
    for group in group_duplicates(kept):
        group.sort(key=lambda r: ({"mm": 0, "xh2026": 0, "updates": 1, "bench": 2, "agieval": 3}[r.origin], r.track))
        r = group[0]
        tracks = sorted({g.track for g in group if g.track})
        track = "" if len(tracks) != 1 else tracks[0]

        if r.fmt == "old" and r.num and r.num >= 22:
            skipped["选做题（极坐标 / 不等式选讲 / 几何证明）"] += 1
            continue
        off = why_off(r.text)
        if off:
            skipped[f"新课标不考：{off}"] += 1
            continue
        if not dollars_balanced(r.text):
            skipped["公式定界符不成对"] += 1
            continue
        if garbled(r.text):
            skipped["题干识别有乱码"] += 1
            continue

        qtype = r.type
        entry: dict = {}
        figure = None
        if qtype in ("single", "multi"):
            parsed = split_options(r.text)
            if parsed is None and r.origin == "mm" and len(r.pictures) in (4, 5):
                parsed = (r.text.strip(), {k: f"见图中 {k}" for k in "ABCD"})
            if parsed is None:
                skipped["选项无法拆分（多为选项是图片）"] += 1
                continue
            stem, options = parsed
            if any(not v for v in options.values()):
                skipped["选项无法拆分（多为选项是图片）"] += 1
                continue
            answer = r.answer
            if isinstance(answer, str):
                answer = list(answer.strip())
            answer = [str(a).strip().upper() for a in answer if str(a).strip()]
            if qtype == "single" and len(answer) > 1:
                qtype = "multi"
            if not answer or any(a not in options for a in answer):
                skipped["答案缺失或不在选项里"] += 1
                continue
            entry.update(options=options, answer=answer[0] if qtype == "single" else answer)
            if r.pictures:
                figure = save_figure(figures_dir, compose_figure(r.pictures), "png")
        else:
            stem = r.text

        if NEED_FIGURE.search(re.sub(r"\s+", "", stem)) and not figure:
            skipped["需要配图但数据集里没有"] += 1
            continue

        if qtype == "fill":
            if r.origin == "xh2026":
                # 「#」分隔的是一题多空的各个答案：改为自评
                ans = "；".join(a.strip() for a in str(r.answer).split("#"))
            elif r.origin == "agieval":
                ans = str(r.answer)
                if ";" in ans:
                    ans = "；".join(ans.split(";"))  # 一题多空：改为自评
            else:
                ans = r.answer[0] if isinstance(r.answer, list) else str(r.answer)
            norm = normalize_fill(ans, stem)
            # 数据集用 (\quad) 表示填空的横线：整段公式只是一个 (\quad) 时换成横线，在公式中间时换成 \underline
            stem = re.sub(r"\$\s*\(\s*\\q?quad\s*\)\s*\$|\(\s*\$\s*\\q?quad\s*\$\s*\)", " ______ ", stem)
            stem = re.sub(r"\(\s*\\q?quad\s*\)", r"\\underline{\\qquad}", stem).replace("  ", " ")
            if norm:
                entry.update(answer=norm[0], answer_kind=norm[1])
                if not re.search(r"_{2,}|\\underline|\\qquad|\(\s*\)|（\s*）", stem):
                    stem = stem.rstrip("．。. ") + " ______"
            else:
                # 答案是文字或坐标等判分程序认不了的形式：改成对照答案自评
                qtype = "solve"
                entry["parts"] = [{"label": "答案", "points": r.score, "answer": clean(str(ans)),
                                   "rubric": ["与参考答案一致即得分"]}]
                notes.append(f"{r.year} {r.paper} 第 {r.num} 题：填空答案「{clean(str(ans))[:30]}」改为自评")

        if qtype == "solve" and "parts" not in entry:
            parts = split_parts(stem)
            labels = [p[0] for p in parts] or ["全题"]
            pts = part_points(r.score, len(labels), r.rate_rule)
            answers = [""] * len(labels)
            if r.origin == "xh2026":
                segs = [s.strip() for s in str(r.answer).split("#")]
                for i, s in enumerate(segs[:len(labels)]):
                    answers[i] = clean(re.sub(r"^\(\d\)", "", s))
            entry["parts"] = [{"label": lab, "points": p, "answer": a} for lab, p, a in zip(labels, pts, answers)]

        solution = r.solution
        if qtype == "solve" and not solution:
            ref = "；".join(f"{p['label']} {p['answer']}" for p in entry["parts"] if p.get("answer"))
            solution = "（数据集只提供了参考答案，没有解答过程）\n\n参考答案：" + (ref or "见各问")
        if qtype == "solve" and r.origin == "xh2026":
            for p in entry["parts"]:
                if "答案略" in p["answer"]:
                    p["answer"] = "（证明题）"

        kps = tag(stem + "\n" + "\n".join((entry.get("options") or {}).values()), solution, qtype)
        if not kps:
            skipped["没能自动标注知识点"] += 1
            notes.append(f"未标注 {r.year} {r.paper} {r.num}：{re.sub(chr(10), ' ', stem)[:90]}")
            continue

        # 原题型（填空题改成自评的仍叫填空题）；单选数据里答案有多个字母的是多选题
        kind_name = {"single": "单选", "multi": "多选", "fill": "填空", "solve": "解答"}[
            "multi" if qtype == "multi" else r.type]
        title = f"{r.year} {r.paper}{('（' + track + '科）') if track else ''} 第 {r.num} 题" if r.num and not r.num_estimated else \
            f"{r.year} {r.paper}{('（' + track + '科）') if track else ''} {kind_name}题"
        qid = f"gk{r.year}-{r.slug}{('-' + {'文': 'w', '理': 'l'}[track]) if track else ''}-{'x' if r.num_estimated else ''}{r.num or 0:02d}"
        if qid in out:
            qid += f"-{len([k for k in out if k.startswith(qid)]) + 1}"
        data = {
            "type": qtype,
            "source": f"{title} · 来源：{LICENSE_NOTE[r.origin]}" + (
                " · 答案未经人工核对" if r.origin == "agieval" and r.slug not in AGIEVAL_CHECKED else ""),
            "year": r.year,
            "_origin": r.origin,
            "kps": kps,
            "difficulty_label": difficulty(r.fmt, qtype if qtype == "multi" else r.type, r.num),
            "stem": stem,
            **({"figure": figure} if figure else {}),
            **entry,
            "points": r.score if qtype != "solve" else None,
            "solution": solution,
        }
        data = {k: v for k, v in data.items() if v is not None and v != ""}
        fix = FIXES.get(qid)
        if fix:
            fix = dict(fix)
            data["options"] = {**(data.get("options") or {}), **fix.pop("options", {})} or None
            data.update(fix)
            data = {k: v for k, v in data.items() if v is not None}
        try:
            normalize_question(data, qid, kp_ids, None, figures_dir)
        except Exception as exc:  # noqa: BLE001
            skipped["格式校验未通过"] += 1
            notes.append(f"{qid}：{exc}")
            continue
        out[qid] = data
    return out, skipped, notes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--data", type=Path, default=DATA_DIR)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    kp_ids = {k["id"] for k in load_knowledge_graph(args.data / "knowledge_graph.yaml")}
    raws = (load_bench(args.src) + load_updates(args.src) + load_mm(args.src) + load_xh2026(args.src)
            + load_agieval(args.src))
    print(f"读入 {len(raws)} 条", Counter(r.origin for r in raws))

    figures_dir = args.data / "figures"
    old_figures = {
        str(yaml.safe_load(p.read_text(encoding="utf-8")).get("figure"))
        for sub in (OUT_SUBDIR, LOCAL_SUBDIR) for p in (args.data / "questions" / sub).rglob("*.yaml")
    } - {"None"}
    if args.dry_run:
        import tempfile
        figures_dir = Path(tempfile.mkdtemp())
    out, skipped, notes = convert(raws, kp_ids, figures_dir)

    # KaTeX：题干和选项渲染失败的题跳过；解析渲染失败的只去掉解析（选择填空题）
    texts = {}
    for qid, d in out.items():
        texts[qid + "|stem"] = d["stem"] + "\n" + "\n".join((d.get("options") or {}).values())
        texts[qid + "|sol"] = d.get("solution", "")
    bad = katex_failures(texts)
    for qid in list(out):
        if qid + "|stem" in bad:
            skipped["公式无法渲染"] += 1
            del out[qid]
        elif qid + "|sol" in bad:
            if out[qid]["type"] == "solve":
                skipped["解答公式无法渲染"] += 1
                del out[qid]
            else:
                out[qid].pop("solution", None)
                notes.append(f"{qid}：解析公式无法渲染，已去掉解析")

    print(f"\n导入 {len(out)} 道", Counter(d["type"] for d in out.values()))
    print("按年份", sorted(Counter(d["year"] for d in out.values()).items()))
    print("\n跳过：")
    for reason, n in skipped.most_common():
        print(f"  {reason}: {n}")
    kp_count = Counter(k for d in out.values() for k in d["kps"])
    print("\n知识点覆盖：", len(kp_count), "/", len(kp_ids))
    print("  未覆盖：", sorted(kp_ids - set(kp_count)))
    if args.dry_run:
        for n in notes[:40]:
            print("  ·", n)
        return 0

    for sub in (OUT_SUBDIR, LOCAL_SUBDIR):
        if (args.data / "questions" / sub).exists():
            shutil.rmtree(args.data / "questions" / sub)
    # 旧的导入配图一并清理（录题上传的配图不在导入列表里，保留）
    for name in old_figures - {d.get("figure") for d in out.values()}:
        (figures_dir / name).unlink(missing_ok=True)
    for qid, d in out.items():
        sub = LOCAL_SUBDIR if d.pop("_origin") in UNLICENSED else OUT_SUBDIR
        write_question_file(args.data, qid, d, f"{sub}/{d['year']}")
    print(f"\n已写入 data/questions/{OUT_SUBDIR}/ 和 data/questions/{LOCAL_SUBDIR}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
