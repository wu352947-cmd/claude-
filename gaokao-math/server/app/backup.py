"""数据库备份：每天第一次启动时自动备份一份，保留最近 N 份。

手动备份：uv run python -m app.backup
备份目录默认 var/backups，可以用环境变量 BACKUP_DIR 指到网盘同步文件夹。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path


def backup_now(db_path: Path, backup_dir: Path, keep: int, today: str | None = None, force: bool = False) -> Path | None:
    if not db_path.exists():
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    today = today or datetime.now().strftime("%Y%m%d")
    target = backup_dir / f"app-{today}.db"
    if target.exists() and not force:
        return None
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)  # SQLite 在线备份，服务运行中也能安全复制
    finally:
        dst.close()
        src.close()
    for old in sorted(backup_dir.glob("app-*.db"))[:-keep] if keep > 0 else []:
        old.unlink()
    return target


if __name__ == "__main__":
    from .config import load_settings

    s = load_settings()
    path = backup_now(s.db_path, s.backup_dir, s.backup_keep, force=True)
    print(f"已备份到 {path}" if path else "还没有数据库，不需要备份")
