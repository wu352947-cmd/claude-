"""把含 MathType 公式的 .docx 读成"段落列表"：公式转成 $…$，插图保存成文件并留占位符。

学科网等导出的 Word 试卷里，公式是 OLE 对象（Equation.DSMT*），文字是普通 run，
所以直接用 python-docx 读到的文本里公式全是空的。
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field

from lxml import etree

from . import mtef, mtef_latex

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}
W = "{%s}" % NS["w"]
R = "{%s}" % NS["r"]


@dataclass
class Para:
    text: str
    images: list[str] = field(default_factory=list)  # 压缩包内路径，如 word/media/image3.png
    in_table: bool = False
    failed: int = 0  # 没能转换的公式个数


class Doc:
    def __init__(self, path: str):
        self.zip = zipfile.ZipFile(path)
        self.rels = self._rels()
        self.cache: dict[str, str | None] = {}
        self.unknown: set[int] = set()

    def _rels(self) -> dict[str, str]:
        root = etree.fromstring(self.zip.read("word/_rels/document.xml.rels"))
        return {e.get("Id"): "word/" + e.get("Target") for e in root}

    def formula(self, target: str) -> str | None:
        if target in self.cache:
            return self.cache[target]
        latex = None
        try:
            data = self.zip.read(target)
            import olefile

            ole = olefile.OleFileIO(io.BytesIO(data))
            raw = ole.openstream("Equation Native").read()
            try:
                ctx = mtef_latex.Ctx()
                latex = mtef_latex.to_latex(mtef.parse(raw), ctx)
                self.unknown |= ctx.unknown
            except mtef.MtefError:
                latex = mtef.tex_source(raw)  # MathType 存的 TeX 源码，简单公式够用
        except Exception:
            latex = None
        self.cache[target] = latex
        return latex

    def image(self, rid: str) -> str | None:
        return self.rels.get(rid)

    def paragraphs(self) -> list[Para]:
        root = etree.fromstring(self.zip.read("word/document.xml"))
        body = root.find("w:body", NS)
        out: list[Para] = []
        for el in body:
            if el.tag == W + "p":
                out.append(self._para(el, False))
            elif el.tag == W + "tbl":
                for row in el.iter(W + "tr"):
                    cells = [self._cell(c) for c in row.findall("w:tc", NS)]
                    out.append(Para("\t".join(t for t, _ in cells), [i for _, ims in cells for i in ims], True))
        return out

    def _cell(self, tc) -> tuple[str, list[str]]:
        ps = [self._para(p, True) for p in tc.iter(W + "p")]
        return " ".join(p.text for p in ps).strip(), [i for p in ps for i in p.images]

    def _para(self, p, in_table: bool) -> Para:
        para = Para("", [], in_table)
        parts: list[str] = []

        def walk(el) -> None:
            for ch in el:
                tag = ch.tag
                if tag == W + "t":
                    parts.append(ch.text or "")
                elif tag == W + "tab":
                    parts.append("\t")
                elif tag == W + "br":
                    parts.append("\n")
                elif tag == W + "object":
                    ole = ch.find(".//o:OLEObject", NS)
                    tgt = self.rels.get(ole.get(R + "id")) if ole is not None else None
                    if tgt and "embeddings" in tgt:
                        f = self.formula(tgt)
                        if f is None:
                            para.failed += 1
                            parts.append("$?$")
                        else:
                            parts.append(f"${f}$" if f else "")
                    else:  # 其它嵌入对象：用预览图
                        img = ch.find(".//v:imagedata", NS)
                        if img is not None and self.image(img.get(R + "id")):
                            para.images.append(self.image(img.get(R + "id")))
                            parts.append("\0IMG\0")
                elif tag == W + "drawing":
                    if ch.find("wp:anchor", NS) is not None:  # 水印
                        continue
                    blip = ch.find(".//a:blip", NS)
                    if blip is not None and self.image(blip.get(R + "embed")):
                        para.images.append(self.image(blip.get(R + "embed")))
                        parts.append("\0IMG\0")
                elif tag == W + "pict":
                    img = ch.find(".//v:imagedata", NS)
                    if img is not None and self.image(img.get(R + "id")):
                        para.images.append(self.image(img.get(R + "id")))
                        parts.append("\0IMG\0")
                elif tag in (W + "r", W + "hyperlink", W + "smartTag", W + "ins", W + "sdt", W + "sdtContent", W + "fldSimple"):
                    walk(ch)

        walk(p)
        text = "".join(parts)
        text = re.sub(r"\$\s*\$", " ", text)  # 相邻的两个行内公式合成一个（中间留空格，免得 \perp 和 x 粘成 \perpx）
        text = text.replace(" ", " ")
        para.text = text
        return para
