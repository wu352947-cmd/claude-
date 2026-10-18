"""图片：拍照识题、题目配图。只接受真正的 JPEG / PNG / WebP（检查文件头，不信扩展名）。"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
from pathlib import Path

MAX_BYTES = 4 * 1024 * 1024
FIGURE_NAME = re.compile(r"^[0-9a-f]{16}\.(png|jpg|webp)$")
MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


class ImageError(ValueError):
    pass


def sniff(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    raise ImageError("只支持 JPEG、PNG、WebP 图片")


def decode_data_url(data_url: str) -> tuple[bytes, str]:
    m = re.match(r"^data:image/[a-z+]+;base64,(.*)$", data_url or "", re.S)
    if not m:
        raise ImageError("图片格式不对")
    if len(m.group(1)) > MAX_BYTES * 4 // 3 + 4:
        raise ImageError("图片太大（上限 4 MB），请先裁剪")
    try:
        data = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageError("图片数据损坏") from exc
    return data, sniff(data)


def to_data_url(data: bytes, ext: str) -> str:
    return f"data:{MEDIA_TYPES[ext]};base64,{base64.b64encode(data).decode()}"


def save_figure(figures_dir: Path, data: bytes, ext: str) -> str:
    """按内容哈希命名：同一张图只存一份，文件名也不会泄露任何信息。"""
    figures_dir.mkdir(parents=True, exist_ok=True)
    name = f"{hashlib.sha256(data).hexdigest()[:16]}.{ext}"
    path = figures_dir / name
    if not path.exists():
        path.write_bytes(data)
    return name
