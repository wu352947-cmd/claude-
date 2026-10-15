"""把用户自己提供的 Word 试卷（学科网导出，公式是 MathType 对象）导入题库。

用法（在 server/ 目录下）：
    uv run --with pillow --with olefile --with lxml python -m tools.import_user_docs \\
        2025:xkb1=/path/to/2025新1卷解析版.docx 2024:jia=/path/to/2024全国甲卷理科.docx [--dry-run]

试卷的结构、分值在下面的 PAPERS 里登记。导入结果写到 data/questions/gaokao-user/，
题号和 import_open_data 一致（gk2025-xkb1-01 …），所以开源数据里的同一道题会被它取代。
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from app.bank import load_knowledge_graph, write_question_file
from app.images import save_figure

from .docx_math import Doc, Para
from .import_open_data import (DATA_DIR, USER_SUBDIR, Raw, clean, convert, drop_unrenderable, type_by_number)

# year:slug → 试卷信息。solve 里的分值是每道解答题的满分。
PAPERS = {
    "2025:xkb1": dict(paper="新课标I卷", fmt="new19", track="",
                      score={"single": 5, "multi": 6, "fill": 5}, solve={15: 13, 16: 15, 17: 15, 18: 17, 19: 17}),
    "2024:jia": dict(paper="全国甲卷", fmt="old", track="理",
                     score={"single": 5, "fill": 5}, solve={n: 12 for n in range(17, 22)}),
}
# Word 里个别汉字是以图片（wmf）形式插入的，没法转成文字；按上下文人工认出来。
GLYPHS = {
    "xkb1": {"image66.wmf": "【", "image108.wmf": "是", "image413.wmf": "在", "image417.wmf": "的"},
    "jia": {"image121.wmf": "的", "image302.wmf": "是", "image431.wmf": "在"},
}
IMG = "\0IMG\0"
QNUM = re.compile(r"^\s*(\d{1,2})\s*[.．、]\s*")
SECTION = re.compile(r"^[一二三四五六七八九十]+[、.．]")
OPTION_LINE = re.compile(r"^\s*[A-D]\s*[.．、]")
FUNCS = "sin|cos|tan|cot|sec|csc|ln|lg|log|arcsin|arccos|arctan"


@dataclass
class Item:
    text: str = ""
    table: list[str] | None = None
    images: list[str] = field(default_factory=list)


@dataclass
class Block:
    num: int
    stem: list[Item] = field(default_factory=list)
    answer: list[str] = field(default_factory=list)
    solution: list[Item] = field(default_factory=list)
    state: str = "stem"


# ---------------------------------------------------------------- 文本整理

def split_math(s: str) -> list[tuple[bool, str]]:
    """按 $…$ 切成 [(是否公式, 内容)]。"""
    parts, last = [], 0
    for m in re.finditer(r"\$([^$]*)\$", s):
        parts.append((False, s[last:m.start()]))
        parts.append((True, m.group(1)))
        last = m.end()
    parts.append((False, s[last:]))
    return parts


def fix_functions(s: str) -> str:
    """Word 里手敲的 sin/cos 没有反斜杠：公式里补上（\\text{…} 里面的不动）。"""
    out = []
    for is_math, seg in split_math(s):
        if is_math:
            segs = re.split(r"(\\text\{[^}]*\})", seg)
            seg = "".join(
                x if x.startswith("\\text{") else
                re.sub(rf"(?<![\\A-Za-z])({FUNCS})(?![A-Za-z]{{2}})", r"\\\1 ", x)
                for x in segs)
            seg = seg.replace("\\text{∣}", "\\mid ").replace("\\text{△}", "\\triangle ")
            out.append(f"${seg}$")
        else:
            out.append(seg)
    return "".join(out)


def table_tex(rows: list[str]) -> str:
    cells = [r.split("\t") for r in rows]
    n = max(len(r) for r in cells)

    def cell(c: str) -> str:
        parts = []
        for is_math, seg in split_math(c.strip()):
            if is_math:
                parts.append(seg)
            elif re.fullmatch(r"[\d.\-+%/\s]+", seg.strip() or "x"):
                parts.append(seg.strip())
            elif seg.strip():
                parts.append("\\text{" + seg.strip() + "}")
        return " ".join(parts)

    body = r" \\ \hline ".join(" & ".join(cell(c) for c in r + [""] * (n - len(r))) for r in cells)
    return "$$\\begin{array}{|" + "c|" * n + "}\\hline " + body + r" \\ \hline \end{array}$$"


# ---------------------------------------------------------------- 读 Word

class Importer:
    def __init__(self, doc: Doc, slug: str, figures_dir: Path, tmp: Path):
        self.doc, self.slug, self.figures_dir, self.tmp = doc, slug, figures_dir, tmp
        self.warnings: list[str] = []

    def image(self, name: str, *, solution: bool) -> tuple[str, Path | None]:
        """返回 (文字, 图片路径)：wmf 是汉字字形，png 是插图。"""
        if name.endswith(".wmf"):
            ch = GLYPHS.get(self.slug, {}).get(Path(name).name)
            if ch is None:
                self.warnings.append(f"未认出的字形图片 {name}")
            return ch or "□", None
        data = self.doc.zip.read(name)
        if solution:
            return "[[图:" + save_figure(self.figures_dir, data, "png") + "]]", None
        path = self.tmp / (Path(name).name)
        path.write_bytes(data)
        return "", path

    def blocks(self) -> list[Block]:
        out: list[Block] = []
        cur: Block | None = None
        started = False  # 「一、选择题」之后才开始算题；之前的「注意事项 1. 2. 3.」不是题
        table: list[str] = []
        table_imgs: list[str] = []

        def target() -> list[Item]:
            return cur.stem if cur.state == "stem" else cur.solution

        for p in self.doc.paragraphs():
            if p.in_table:
                table.append(p.text)
                table_imgs += p.images
                continue
            if table and cur is not None:
                target().append(Item(table=table, images=table_imgs))
            table, table_imgs = [], []
            text = p.text.strip()
            if not text and not p.images:
                continue
            if re.match(r"^一[、.．]\s*选择题", text):
                started = True
                continue
            if not started:
                continue
            m = QNUM.match(text)
            if m and int(m.group(1)) == (cur.num + 1 if cur else 1) and (cur is None or cur.state != "stem"):
                cur = Block(int(m.group(1)))
                out.append(cur)
                text = text[m.end():]
                p = Para(text, p.images)
            elif cur is None:
                continue
            elif SECTION.match(text):
                continue
            if text.startswith("【答案】"):
                cur.state = "answer"
                text = text[len("【答案】"):]
            if cur.state == "answer" and text.startswith("【解析】"):
                cur.state = "solution"
                text = text[len("【解析】"):]
            if cur.state == "answer":
                if text.strip():
                    cur.answer.append(text.strip())
                continue
            if cur.state == "stem" and (text.startswith("【解析】") or text.startswith("【分析】")):
                cur.state = "solution"
                text = text.removeprefix("【解析】")
            if text.strip() or p.images:
                target().append(Item(text=text, images=list(p.images)))
        if table and cur is not None:
            (cur.stem if cur.state == "stem" else cur.solution).append(Item(table=table, images=table_imgs))
        return out

    def render(self, items: list[Item], *, solution: bool) -> tuple[str, list[Path]]:
        """把一组段落拼成文本；返回 (文本, 题干插图路径)。"""
        lines: list[str] = []
        pics: list[Path] = []
        for it in items:
            if it.table is not None:
                lines.append(table_tex(it.table))
                for im in it.images:
                    t, path = self.image(im, solution=solution)
                    pics += [path] if path else []
                continue
            imgs = list(it.images)
            text = it.text
            is_option = bool(OPTION_LINE.match(text)) and not solution
            while IMG in text:
                name = imgs.pop(0)
                ch, path = self.image(name, solution=solution)
                if path:
                    if is_option:  # 选项是图：在图上标出 A/B/C/D（拼成一张配图后才分得清）
                        letters = re.findall(r"([A-D])\s*[.．、]", text[:text.index(IMG)])
                        path = label_image(path, letters[-1]) if letters else path
                    pics.append(path)
                    ch = "（见图）" if is_option else ""
                text = text.replace(IMG, ch, 1)
            lines.append(text)
        return "\n".join(lines), pics


def label_image(path: Path, letter: str) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    im = Image.open(path).convert("RGB")
    font = ImageFont.load_default(size=34)
    strip = 56
    canvas = Image.new("RGB", (im.width + strip, im.height), "white")
    canvas.paste(im, (strip, 0))
    ImageDraw.Draw(canvas).text((10, max(im.height // 2 - 24, 0)), letter, fill="black", font=font)
    out = path.with_name(f"{path.stem}-{letter}.png")
    canvas.save(out)
    return out


def solution_text(raw: str) -> str:
    s = raw.replace("【分析】", "思路：", 1)
    s = re.sub(r"【小问(\d)详解】", lambda m: f"\n（{m.group(1)}）", s)
    s = s.replace("【分析】", "").replace("【详解】", "\n")
    s = re.sub(r"【点睛】[\s\S]*$", "", s)
    return s.strip()


def strip_dollars(s: str) -> str:
    s = s.split("##")[0].strip()
    if s.startswith("$") and s.endswith("$") and s.count("$") == 2:
        s = s[1:-1]
    return s.strip().rstrip("．.")


def split_part_answers(text: str) -> list[str]:
    ms = [m for m in re.finditer(r"[（(]\s*([123])\s*[)）]", text)]
    out, want = [], 1
    marks = []
    for m in ms:
        if int(m.group(1)) == want:
            marks.append(m)
            want += 1
    if len(marks) < 2:
        return [text.strip()]
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        out.append(text[m.end():end].strip().rstrip("；;"))
    return out


def load_paper(path: Path, key: str, figures_dir: Path, tmp: Path) -> tuple[list[Raw], list[str]]:
    year, slug = key.split(":")
    info = PAPERS[key]
    imp = Importer(Doc(str(path)), slug, figures_dir, tmp)
    raws: list[Raw] = []
    for b in imp.blocks():
        qtype = type_by_number(info["fmt"], b.num)
        if qtype is None:  # 选做题
            qtype = "solve"
        stem, pics = imp.render(b.stem, solution=False)
        sol, _ = imp.render(b.solution, solution=True)
        ans_text = "\n".join(b.answer)
        score = info["solve"].get(b.num, 10) if qtype == "solve" else info["score"][qtype]
        if qtype in ("single", "multi"):
            letters = re.match(r"\s*([A-D]+)", ans_text)
            answer = list(letters.group(1)) if letters else []
        elif qtype == "fill":
            answer = strip_dollars(ans_text)
        else:
            answer = split_part_answers(ans_text)
        raws.append(Raw("user", int(year), info["paper"], slug, info["fmt"], b.num, qtype, float(score),
                        fix_functions(clean_user(stem)), answer, fix_functions(solution_text(clean_user(sol))),
                        info["track"], pics))
    return raws, imp.warnings


def clean_user(s: str) -> str:
    s = s.replace("\0", "")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docs", nargs="+", help="年份:卷名=路径，如 2025:xkb1=/path/a.docx")
    ap.add_argument("--data", type=Path, default=DATA_DIR)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    kp_ids = {k["id"] for k in load_knowledge_graph(args.data / "knowledge_graph.yaml")}
    figures_dir = args.data / "figures"
    if args.dry_run:
        figures_dir = Path(tempfile.mkdtemp())
    tmp = Path(tempfile.mkdtemp())
    raws: list[Raw] = []
    for spec in args.docs:
        key, path = spec.split("=", 1)
        got, warnings = load_paper(Path(path), key, figures_dir, tmp)
        print(f"{key}: 读到 {len(got)} 题", Counter(r.type for r in got), *warnings)
        raws += got
    out, skipped, notes = convert(raws, kp_ids, figures_dir)
    drop_unrenderable(out, skipped, notes)
    print(f"\n导入 {len(out)} 道", Counter(d["type"] for d in out.values()))
    for reason, n in skipped.most_common():
        print(f"  跳过 {reason}: {n}")
    for n in notes:
        print("  ·", n)
    if args.dry_run:
        for qid, d in out.items():
            print(qid, d["type"], d["kps"], d["stem"][:60].replace("\n", " "))
        return 0
    import shutil

    import yaml

    user_dir = args.data / "questions" / USER_SUBDIR
    old_figures = set()
    if user_dir.exists():
        old_figures = {str(yaml.safe_load(p.read_text(encoding="utf-8")).get("figure")) for p in user_dir.rglob("*.yaml")}
        for p in user_dir.rglob("*.yaml"):  # 解析里的插图用 [[图:文件名]] 引用
            old_figures |= set(re.findall(r"\[\[图:([0-9a-f]{16}\.png)\]\]", p.read_text(encoding="utf-8")))
        shutil.rmtree(user_dir)
    keep = {d.get("figure") for d in out.values()}
    keep |= {n for d in out.values() for n in re.findall(r"\[\[图:([0-9a-f]{16}\.png)\]\]", d.get("solution", ""))}
    for name in old_figures - keep - {"None"}:
        (figures_dir / name).unlink(missing_ok=True)
    for qid, d in out.items():
        d.pop("_origin")
        write_question_file(args.data, qid, d, f"{USER_SUBDIR}/{d['year']}")
    print(f"\n已写入 data/questions/{USER_SUBDIR}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
