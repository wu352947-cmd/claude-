from .conftest import make_client


def test_question_is_served_without_answer(client):
    q = client.get("/api/questions/s09-ellipse-eccentricity").json()
    assert q["type"] == "fill" and "answer" not in q and "solution" not in q
    assert q["kps"][0]["name"]
    assert client.get("/api/questions/nope").status_code == 404
    assert client.get("/api/nope").status_code == 404


def test_hints_are_progressive(client):
    q = client.get("/api/questions/s12-log-monotonic-interval").json()
    assert q["hints_total"] == 2
    assert "定义域" in client.get("/api/questions/s12-log-monotonic-interval/hints/1").json()["hint"]
    assert client.get("/api/questions/s12-log-monotonic-interval/hints/3").status_code == 404


def test_wrong_answer_flow(client, clock):
    r = client.post("/api/attempts", json={
        "question_id": "s12-log-monotonic-interval", "response": {"value": "(1,+∞)"}, "seconds": 100})
    assert r.status_code == 201
    body = r.json()
    assert body["score"] == 0 and body["reveal"]["answer"] == r"(2,+\infty)"
    assert body["review"]["created"] and body["review"]["rating"] == "Again"
    assert all(m["after"] < m["before"] for m in body["mastery"])

    assert client.post(f"/api/attempts/{body['attempt_id']}/reflection",
                       json={"error_type": "reading", "note": "忘了定义域"}).json() == {"ok": True}
    assert client.post(f"/api/attempts/{body['attempt_id']}/reflection",
                       json={"error_type": "lazy"}).status_code == 422

    assert client.get("/api/review", params={"scope": "due"}).json() == []
    clock.advance(days=1)
    due = client.get("/api/review", params={"scope": "due"}).json()
    assert [d["id"] for d in due] == ["s12-log-monotonic-interval"]
    assert due[0]["last_error_label"] == "审题错误"

    today = client.get("/api/today").json()
    first = today["items"][0]
    assert first["kind"] == "review" and "审题错误" in first["reason"]
    assert all(i["question_id"] != "s12-log-monotonic-interval" for i in today["items"][1:])

    errors = client.get("/api/stats/errors").json()
    assert errors["items"][0]["error_type"] == "reading" and errors["lost_points"] == 5


def test_correct_answer_does_not_create_card(client):
    body = client.post("/api/attempts", json={
        "question_id": "s01-set-intersection", "response": {"choice": "B"}, "seconds": 60}).json()
    assert body["full"] and body["review"] is None
    body = client.post("/api/attempts", json={
        "question_id": "s04-vector-perpendicular", "response": {"choice": "D"}, "seconds": 30,
        "confidence": "unsure"}).json()
    assert body["review"]["created"] and body["review"]["rating"] == "Hard"


def test_multi_partial_and_solve_self_grading(client):
    body = client.post("/api/attempts", json={
        "question_id": "s06-trig-properties", "response": {"choices": ["A", "B"]}, "seconds": 200}).json()
    assert body["score"] == 4 and not body["full"] and body["review"]["created"]

    body = client.post("/api/attempts", json={
        "question_id": "s14-triangle-area", "response": {"part_scores": [6, 7]}, "seconds": 500,
        "revealed": True}).json()
    assert body["full"] and body["perf"] == 1.0  # 解答题自评需要看答案，不算偷看


def test_today_plan_is_limited_and_explained(client):
    plan = client.get("/api/today").json()
    assert len(plan["items"]) == 6 and plan["unseen_total"] == 15
    assert all(i["kind"] == "new" and "卷面约" in i["reason"] for i in plan["items"])
    main_kps = [i["question"]["kps"][0]["id"] for i in plan["items"]]
    assert len(set(main_kps)) >= 4  # 不会一天全是同一类题


def test_create_question_writes_yaml(client, data_dir):
    payload = {"type": "fill", "stem": "$1+1=$ ______", "kps": ["set.operations"], "answer": "2",
               "source": "自己的错题本", "solution": "2"}
    r = client.post("/api/questions", json=payload)
    assert r.status_code == 201, r.text
    created = r.json()
    assert (data_dir / created["file"]).exists()
    assert client.get(f"/api/questions/{created['id']}").json()["source"] == "自己的错题本"

    bad = client.post("/api/questions", json={**payload, "kps": ["nope"]})
    assert bad.status_code == 400 and "不在图谱" in bad.json()["detail"]


def test_bank_reload_reports_bad_files(client, data_dir):
    (data_dir / "questions" / "broken.yaml").write_text("type: single\nstem: x\n", encoding="utf-8")
    report = client.post("/api/bank/reload").json()
    assert report["questions"] == 15 and any("broken" in e for e in report["errors"])
    assert client.get("/api/stats/overview").json()["bank_errors"]


def test_overview_and_mastery(client):
    client.post("/api/attempts", json={"question_id": "s08-arithmetic-sum", "response": {"value": "100"},
                                       "seconds": 60})
    ov = client.get("/api/stats/overview").json()
    assert ov["attempts_today"] == 1 and ov["streak_days"] == 1 and ov["score_rate_7d"] == 100
    modules = client.get("/api/stats/mastery").json()
    seq = next(m for m in modules if m["module"] == "数列")
    assert seq["practiced"] == 1 and seq["mastery"] > 50
    export = client.get("/api/export").json()
    assert len(export["attempts"]) == 1


def test_token_required_when_configured(data_dir, tmp_path, clock):
    with make_client(data_dir, tmp_path, clock, token="s3cret") as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/today").status_code == 401
        assert c.get("/api/today", headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert c.get("/api/today", headers={"Authorization": "Bearer s3cret"}).status_code == 200
