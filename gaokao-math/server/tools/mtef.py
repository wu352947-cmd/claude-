"""MathType（Equation.DSMT*）公式的 MTEF v5 二进制 → 节点树。

Word 里用 MathType 插入的公式存成 OLE 对象（word/embeddings/oleObject*.bin），
其中 "Equation Native" 流是 MTEF 数据。这里只做二进制解析；转 LaTeX 在 mtef_latex.py。
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

import olefile

END, LINE, CHAR, TMPL, PILE, MATRIX, EMBELL, RULER, AFORMAT = range(9)
SIZE, FULL, SUB, SUB2, SYM, SUBSYM, COLOR, COLOR_DEF, FONT_DEF, EQN_PREFS, ENCODING_DEF = range(9, 20)


class MtefError(Exception):
    pass


@dataclass
class Node:
    kind: str  # line / char / tmpl / pile / matrix / embell
    code: int = 0  # char: MTCode; tmpl: selector
    var: int = 0
    typeface: int = 0
    ch8: int | None = None
    kids: list["Node"] = field(default_factory=list)  # tmpl 的槽、line 的内容、pile 的行
    embells: list[int] = field(default_factory=list)
    rows: int = 0
    cols: int = 0
    halign: int = 0
    null: bool = False


class _R:
    def __init__(self, b: bytes, pos: int = 0):
        self.b, self.p = b, pos

    def u8(self) -> int:
        if self.p >= len(self.b):
            raise MtefError("eof")
        v = self.b[self.p]
        self.p += 1
        return v

    def u16(self) -> int:
        if self.p + 2 > len(self.b):
            raise MtefError("eof")
        v = struct.unpack_from("<H", self.b, self.p)[0]
        self.p += 2
        return v

    def peek(self) -> int:
        if self.p >= len(self.b):
            raise MtefError("eof")
        return self.b[self.p]

    def cstr(self) -> bytes:
        i = self.b.index(b"\0", self.p)
        s = self.b[self.p:i]
        self.p = i + 1
        return s


def _nudge(r: _R, opt: int) -> None:
    if opt & 0x08:
        dx, dy = r.u8(), r.u8()
        if dx == 128 and dy == 128:
            r.u16()
            r.u16()


def _objects(r: _R, depth: int = 0) -> list[Node]:
    """读到配对的 END 为止。"""
    if depth > 40:
        raise MtefError("too deep")
    out: list[Node] = []
    while True:
        tag = r.u8()
        if tag == END:
            return out
        if tag == LINE:
            opt = r.u8()
            _nudge(r, opt)
            if opt & 0x04:
                r.u16()  # line spacing
            if opt & 0x02:
                _ruler(r)
            n = Node("line")
            if opt & 0x01:
                n.null = True
            else:
                n.kids = _objects(r, depth + 1)
            out.append(n)
        elif tag == CHAR:
            opt = r.u8()
            _nudge(r, opt)
            n = Node("char", typeface=r.u8())
            if not opt & 0x20:
                n.code = r.u16()
            if opt & 0x04:
                n.ch8 = r.u8()
            if opt & 0x10:
                n.ch8 = r.u16()
            if opt & 0x01:
                n.embells = _embells(r)
            out.append(n)
        elif tag == TMPL:
            opt = r.u8()
            _nudge(r, opt)
            n = Node("tmpl", code=r.u8())
            v = r.u8()
            if v & 0x80:
                v = (v & 0x7F) | (r.u8() << 8)
            n.var = v
            r.u8()  # template-specific options
            n.kids = _objects(r, depth + 1)
            out.append(n)
        elif tag == PILE:
            opt = r.u8()
            _nudge(r, opt)
            n = Node("pile", halign=r.u8())
            r.u8()  # valign
            if opt & 0x02:
                _ruler(r)
            n.kids = _objects(r, depth + 1)
            out.append(n)
        elif tag == MATRIX:
            opt = r.u8()
            _nudge(r, opt)
            r.u8(); r.u8(); r.u8()  # valign, h_just, v_just
            n = Node("matrix", rows=r.u8(), cols=r.u8())
            for count in (n.rows, n.cols):
                for _ in range((((count + 1) * 2) + 7) >> 3):
                    r.u8()
            n.kids = _objects(r, depth + 1)
            out.append(n)
        elif tag == EMBELL:
            raise MtefError("stray embell")
        elif tag == RULER:
            _ruler(r)
        elif tag == AFORMAT:  # FONT_STYLE：字体序号 + 样式
            r.u8(); r.u8()
        elif tag >= 100:  # 扩展记录：长度字节 + 数据（如 "TeX Input Language"）
            n = r.u8()
            r.p += n
        elif tag == SIZE:
            ls = r.u8()
            if ls in (100, 101):
                r.u16()
            else:
                r.u8()
        elif tag in (FULL, SUB, SUB2, SYM, SUBSYM):
            pass
        elif tag == COLOR:
            r.u8()
        elif tag == FONT_DEF:
            r.u8()
            r.cstr()
        elif tag == ENCODING_DEF:
            r.cstr()
        elif tag == COLOR_DEF:
            opt = r.u8()
            for _ in range(4 if opt & 1 else 3):
                r.u16()
            if opt & 4:
                r.cstr()
        else:
            raise MtefError(f"tag {tag}")


def _ruler(r: _R) -> None:
    for _ in range(r.u8()):
        r.u8()
        r.u16()


def _embells(r: _R) -> list[int]:
    out = []
    while True:
        tag = r.u8()
        if tag == END:
            return out
        if tag == COLOR:
            r.u8()
            continue
        if tag != EMBELL:
            raise MtefError("embell")
        opt = r.u8()
        _nudge(r, opt)
        out.append(r.u8())


def parse(data: bytes) -> list[Node]:
    """data = "Equation Native" 流。返回顶层对象（通常是一个 line）。"""
    hdr = struct.unpack_from("<H", data, 0)[0]
    r = _R(data, hdr)
    if r.u8() != 5:
        raise MtefError("not MTEF v5")
    r.u8(); r.u8(); r.u8(); r.u8()
    r.cstr()  # 应用名
    r.u8()  # equation options
    # 序言（编码表、字体表、公式设置）之后就是公式体：对象序列 + 结尾 END。
    rr = _R(data, _after_prefs(data, r.p))
    return _objects(rr)  # 个别对象在 END 之后还带着旧版本的残留数据，忽略


def _count(ns: list[Node]) -> int:
    return sum(1 + _count(n.kids) for n in ns)


def _dims(r: _R) -> None:
    """nibble 编码的尺寸表：个数字节，然后每项 = 单位 nibble + 数字 nibble… + 0xF 结尾。"""
    count = r.u8()
    pending: list[int] = []
    done = 0
    while done < count:
        if not pending:
            b = r.u8()
            pending = [b >> 4, b & 15]
        nib = pending.pop(0)
        if nib == 15:
            done += 1
        # 第一个 nibble 是单位；后面是数字，遇 F 结束
    # 末尾半个字节丢弃


def _after_prefs(data: bytes, pos: int) -> int:
    """跳过 ENCODING_DEF / FONT_DEF / EQN_PREFS，返回公式体可能开始的位置。"""
    r = _R(data, pos)
    while True:
        tag = r.peek()
        if tag == ENCODING_DEF:
            r.u8(); r.cstr()
        elif tag == FONT_DEF:
            r.u8(); r.u8(); r.cstr()
        elif tag >= 100:
            r.u8(); n = r.u8()
            r.p += n
        elif tag == EQN_PREFS:
            r.u8(); r.u8()
            _dims(r)
            _dims(r)
            for _ in range(r.u8()):  # 样式表
                r.u8(); r.u8()
            return r.p
        else:
            return r.p


def tex_source(data: bytes) -> str | None:
    """MathType 有时把公式的 TeX 源码也存在流里。"""
    import re

    m = re.search(rb"TeX Input Language\x00([^\x00]*)\x00", data)
    return m.group(1).decode("latin-1") if m else None


def read_ole(path_or_bytes) -> list[Node]:
    ole = olefile.OleFileIO(path_or_bytes)
    try:
        return parse(ole.openstream("Equation Native").read())
    finally:
        ole.close()
