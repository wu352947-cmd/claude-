from datetime import datetime, timezone

import pytest
import yaml

from app.bank import load_knowledge_graph
from app.blueprint import BlueprintError, load_blueprint
from app.core.exam import multi_breakdown
from app.core.predict import predict_score
from app.models import Mastery

from .conftest import DATA_DIR

KP_IDS = {k["id"] for k in load_knowledge_graph(DATA_DIR / "knowledge_graph.yaml")}
NAMES = {k["id"]: k["name"] for k in load_knowledge_graph(DATA_DIR / "knowledge_graph.yaml")}
NOW = datetime(2026, 10, 15, tzinfo=timezone.utc)


def test_blueprint_is_xinkebiao_one():
    bp = load_blueprint(DATA_DIR / "exam_blueprint.yaml", KP_IDS)
    assert bp.name == "新课标I卷" and bp.minutes == 120
    assert [s.no for s in bp.slots] == list(range(1, 20))
    assert [s.type for s in bp.slots] == ["single"] * 8 + ["multi"] * 3 + ["fill"] * 3 + ["solve"] * 5
    assert [s.points for s in bp.slots[14:]] == [13, 15, 15, 17, 17]
    assert sum(s.points for s in bp.slots) == 150
    for s in bp.slots:
        assert abs(sum(s.kps.values()) - 1) < 1e-9


@pytest.mark.parametrize("slot, message", [
    ({"num": 1, "type": "single", "points": 150, "kps": {"nope": 1}}, "不在图谱"),
    ({"num": 1, "type": "solve", "points": 150, "kps": {"tri.laws": 1}, "parts": [{"points": 6}]}, "之和"),
    ({"num": 1, "type": "essay", "points": 150, "kps": {"tri.laws": 1}}, "type"),
    ({"num": 1, "type": "single", "points": 5, "kps": {"tri.laws": 1}}, "总分"),
])
def test_blueprint_validation(tmp_path, slot, message):
    p = tmp_path / "bp.yaml"
    p.write_text(yaml.safe_dump({"total_points": 150, "slots": [slot]}, allow_unicode=True), encoding="utf-8")
    with pytest.raises(BlueprintError, match=message):
        load_blueprint(p, KP_IDS)


def test_prediction_rises_with_mastery_and_suggests_gains():
    bp = load_blueprint(DATA_DIR / "exam_blueprint.yaml", KP_IDS)
    base = predict_score(bp, {}, NAMES, NOW, tau_days=45, hour_gain=0.3)
    assert 40 < base["total"] < 110
    assert sum(t["points"] for t in base["by_type"]) == 150
    assert base["gains"] and base["gains"][0]["gain"] >= base["gains"][-1]["gain"]

    strong = {"tri.laws": Mastery(kp_id="tri.laws", theta=2.0, last_practiced=NOW)}
    better = predict_score(bp, strong, NAMES, NOW, tau_days=45, hour_gain=0.3)
    assert better["total"] > base["total"]
    assert better["slots"][14]["expected"] > base["slots"][14]["expected"]


def test_multi_breakdown_advice():
    data = multi_breakdown([
        (["A", "B", "C"], ["A", "B"], 0, 6),  # 错选
        (["A", "D"], ["A", "B"], 0, 6),  # 错选
        (["A"], ["A", "B"], 3, 6),  # 漏选
        (["A", "B"], ["A", "B"], 6, 6),
        ([], ["A", "B"], 0, 6),
    ])
    assert data["wrong"] == {"count": 2, "lost": 12} and data["missed"] == {"count": 1, "lost": 3}
    assert data["blank"]["count"] == 1 and data["full"] == 1
    assert "宁可不选" in data["advice"]
    assert "大胆" in multi_breakdown([(["A"], ["A", "B", "C"], 2, 6)])["advice"]


def test_exam_full_flow(client):
    created = client.post("/api/exams", json={}).json()
    assert created["status"] == "ongoing" and created["predicted"] > 0
    exam = client.get(f"/api/exams/{created['id']}").json()
    slots = exam["slots"]
    assert len(slots) == 19
    assert all("reveal" not in s for s in slots)  # 交卷前看不到答案
    assert slots[0]["question_id"] == "s01-set-intersection"  # 第 1 题考集合，题库里正好有
    filled = [s for s in slots if s["question_id"]]
    assert {s["type"] for s in filled} == {"single", "multi", "fill", "solve"}
    assert len({s["question_id"] for s in filled}) == len(filled)  # 不重复出题

    answers, seconds = {}, {}
    for s in filled:
        key = str(s["no"])
        seconds[key] = 60
        if s["question_id"] == "s01-set-intersection":
            answers[key] = {"choice": "B"}
        elif s["question_id"] == "s06-trig-properties":
            answers[key] = {"choices": ["A", "B"]}  # 漏选，得 4 分
        elif s["question_id"] == "s07-cubic-derivative":
            answers[key] = {"choices": ["A", "B", "C"]}  # 错选，0 分
    after = client.post(f"/api/exams/{created['id']}/finish", json={"answers": answers, "seconds": seconds}).json()
    assert after["status"] == "grading"
    solve_slots = [s for s in after["slots"] if s["type"] == "solve" and s["question_id"]]
    assert solve_slots and all(s["reveal"]["solution"] for s in solve_slots)
    assert client.post(f"/api/exams/{created['id']}/finish", json={}).status_code == 409

    part_scores = {str(s["no"]): [p["points"] for p in s["reveal"]["parts"]] for s in solve_slots}
    done = client.post(f"/api/exams/{created['id']}/grade", json={"part_scores": part_scores}).json()
    assert done["status"] == "done"
    report = done["report"]
    # 解答题按题位分值折算：自评满分 → 题位满分
    solve_points = sum(s["points"] for s in solve_slots)
    multi_points = 0
    for s in filled:
        if s["question_id"] == "s06-trig-properties":
            multi_points += s["points"] * 4 / 6
    assert report["total"] == pytest.approx(5 + multi_points + solve_points, abs=0.11)
    assert report["multi"]["missed"]["count"] == 1 and report["multi"]["wrong"]["count"] == 1
    assert all(m["module"] != "（未出题）" for m in report["lost_by_module"])
    assert report["available_points"] == sum(s["points"] for s in filled) < 150
    assert sum(t["points"] for t in report["by_type"]) == 150

    history = client.get("/api/stats/prediction").json()["exams"]
    assert history[0]["score"] == report["total"]
    # 模考作答也进入错题本和掌握度
    assert any(c["id"] == "s07-cubic-derivative" for c in client.get("/api/review").json())


def test_exam_can_be_abandoned_before_finish(client):
    exam = client.post("/api/exams", json={"title": "试一下"}).json()
    assert exam["title"] == "试一下"
    assert client.delete(f"/api/exams/{exam['id']}").json() == {"ok": True}
    assert client.get(f"/api/exams/{exam['id']}").status_code == 404


def test_prediction_endpoint(client):
    data = client.get("/api/stats/prediction").json()
    assert data["blueprint"] == "新课标I卷" and len(data["slots"]) == 19 and data["gains"]
