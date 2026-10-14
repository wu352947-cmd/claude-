import base64
import sqlite3
from datetime import timedelta

from app.backup import backup_now
from app.db import make_engine

from .conftest import make_client

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x01" * 32
PNG = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode()


def test_figure_upload_and_use(client, data_dir):
    r = client.post("/api/figures", json={"image": PNG}).json()
    assert r["url"] == f"/api/figures/{r['name']}"
    assert client.get(r["url"]).content == PNG_BYTES
    assert client.post("/api/figures", json={"image": PNG}).json()["name"] == r["name"]  # 同图只存一份
    fake = "data:image/png;base64," + base64.b64encode(b"<svg onload=alert(1)>").decode()
    assert client.post("/api/figures", json={"image": fake}).status_code == 400
    assert client.get("/api/figures/../../config.yaml").status_code == 404

    q = {"type": "fill", "stem": "如图（见图）", "kps": ["solid.measure"], "answer": "2", "figure": r["name"]}
    created = client.post("/api/questions", json=q).json()
    assert client.get(f"/api/questions/{created['id']}").json()["figure"] == r["url"]
    missing = client.post("/api/questions", json={**q, "figure": "0123456789abcdef.png"})
    assert missing.status_code == 400 and "不在" in missing.json()["detail"]


def test_offline_batch_sync(client, clock):
    earlier = (clock.now - timedelta(hours=3)).isoformat()
    future = (clock.now + timedelta(days=3)).isoformat()
    r = client.post("/api/attempts/batch", json={"attempts": [
        {"question_id": "s01-set-intersection", "response": {"choice": "B"}, "seconds": 50, "answered_at": future},
        {"question_id": "s09-ellipse-eccentricity", "response": {"value": "1/3"}, "seconds": 40, "answered_at": earlier},
        {"question_id": "gone", "response": {}, "seconds": 1},
    ]}).json()
    assert [x["question_id"] for x in r["results"]] == ["s09-ellipse-eccentricity", "s01-set-intersection"]
    assert r["skipped"] == ["gone"]
    hist = client.get("/api/questions/s09-ellipse-eccentricity").json()["history"]
    assert hist[0]["created_at"].startswith((clock.now - timedelta(hours=3)).strftime("%Y-%m-%dT%H"))
    assert client.get("/api/questions/s01-set-intersection").json()["history"][0]["created_at"].startswith("2026-10-15T12")


def test_old_database_gets_new_columns(tmp_path):
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE attempt (id INTEGER PRIMARY KEY, question_id VARCHAR NOT NULL, response JSON, "
                "score FLOAT NOT NULL, max_score FLOAT NOT NULL, perf FLOAT NOT NULL, seconds INTEGER NOT NULL, "
                "hints_used INTEGER NOT NULL, revealed BOOLEAN NOT NULL, confidence VARCHAR NOT NULL, "
                "error_type VARCHAR, note VARCHAR NOT NULL, created_at DATETIME NOT NULL)")
    con.execute("INSERT INTO attempt VALUES (1, 'q', '{}', 5, 5, 1, 10, 0, 0, 'sure', NULL, '', '2026-10-01')")
    con.commit()
    con.close()
    make_engine(db)
    con = sqlite3.connect(db)
    cols = {r[1] for r in con.execute("PRAGMA table_info(attempt)")}
    assert "exam_id" in cols
    assert con.execute("SELECT exam_id FROM attempt").fetchone() == (None,)
    qcols = {r[1] for r in con.execute("PRAGMA table_info(question)")}
    assert {"figure", "parent_id"} <= qcols


def test_backup_once_a_day_and_pruned(tmp_path):
    db = tmp_path / "app.db"
    sqlite3.connect(db).execute("CREATE TABLE t (x)").connection.commit()
    out = tmp_path / "b"
    assert backup_now(db, out, keep=2, today="20261001")
    assert backup_now(db, out, keep=2, today="20261001") is None  # 同一天不重复
    backup_now(db, out, keep=2, today="20261002")
    backup_now(db, out, keep=2, today="20261003")
    assert sorted(p.name for p in out.iterdir()) == ["app-20261002.db", "app-20261003.db"]
    assert backup_now(tmp_path / "missing.db", out, keep=2) is None


def test_startup_backs_up_existing_db(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock):
        pass
    with make_client(data_dir, tmp_path, clock):
        pass
    assert len(list((tmp_path / "backups").glob("app-*.db"))) == 1


def test_token_does_not_block_figures(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock, token="k") as c:
        auth = {"Authorization": "Bearer k"}
        name = c.post("/api/figures", json={"image": PNG}, headers=auth).json()["name"]
        assert c.post("/api/figures", json={"image": PNG}).status_code == 401
        assert c.get(f"/api/figures/{name}").status_code == 200
        assert c.get("/api/exams").status_code == 401


def test_env_file(tmp_path):
    from app.config import read_env_file

    p = tmp_path / ".env"
    p.write_text("# 注释\nLLM_MODEL=\"deepseek-chat\"\nBROKEN\n APP_TOKEN = abc \n", encoding="utf-8")
    assert read_env_file(p) == {"LLM_MODEL": "deepseek-chat", "APP_TOKEN": "abc"}
    assert read_env_file(tmp_path / "missing") == {}
