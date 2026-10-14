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
    shutil.copytree(DATA_DIR, target, ignore=shutil.ignore_patterns("inbox"))
    return target


@pytest.fixture
def clock() -> Clock:
    return Clock()


def make_client(data_dir: Path, tmp_path: Path, clock: Clock, **overrides) -> TestClient:
    settings = load_settings(data_dir=data_dir, db_path=tmp_path / "test.db", web_dist=tmp_path / "no-dist",
                             **overrides)
    settings.token = overrides.get("token")
    app = create_app(settings)
    app.state.clock = clock
    return TestClient(app)


@pytest.fixture
def client(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock) as c:
        yield c
