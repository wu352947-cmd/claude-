import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, load_settings
from app.main import create_app

DATA_DIR = PROJECT_ROOT / "data"


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now

    def advance(self, **kwargs):
        self.now += timedelta(**kwargs)


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    target = tmp_path / "data"
    # 只用示例题：导入的真题有几百道，测试里的推荐、组卷结果就不好预期了（真题另有专门的测试）
    shutil.copytree(DATA_DIR, target, ignore=shutil.ignore_patterns("inbox", "gaokao*"))
    return target


@pytest.fixture
def clock() -> Clock:
    return Clock()


def make_client(data_dir: Path, tmp_path: Path, clock: Clock, *, llm=None, vision=None, **overrides) -> TestClient:
    settings = load_settings(data_dir=data_dir, db_path=tmp_path / "test.db", web_dist=tmp_path / "no-dist",
                             backup_dir=tmp_path / "backups", **overrides)
    settings.token = overrides.get("token")
    for key in ("ai_daily_limit", "explore"):
        if key in overrides:
            setattr(settings, key, overrides[key])  # 覆盖 config.yaml 里的值
    app = create_app(settings)
    app.state.clock = clock
    app.state.text_llm = llm
    app.state.vision_llm = vision
    return TestClient(app)


@pytest.fixture
def client(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock) as c:
        yield c
