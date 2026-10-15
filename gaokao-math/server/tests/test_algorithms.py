from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fsrs import Rating
from sqlmodel import Session

from app.core import mastery, review
from app.core.grading import Grade
from app.core.performance import performance
from app.db import make_engine
from app.models import KnowledgePoint, Mastery, Question

NOW = datetime(2026, 10, 15, tzinfo=timezone.utc)
Q = SimpleNamespace(type="single", est_seconds=100)
FULL = Grade(5, 5, True)
WRONG = Grade(0, 5, False)


def test_performance_rules():
    assert performance(Q, FULL, seconds=60) == 1.0
    assert performance(Q, WRONG, seconds=60) == 0.0
    assert performance(Q, FULL, seconds=60, hints_used=1) == 0.85
    assert performance(Q, FULL, seconds=200) == 0.8  # 超时
    assert performance(Q, FULL, seconds=60, confidence="guess") == 0.3
    assert performance(Q, FULL, seconds=60, revealed=True) == 0.3
    multi = SimpleNamespace(type="multi", est_seconds=100)
    assert performance(multi, Grade(3, 6, False), seconds=60) == 0.5


def _session(tmp_path):
    engine = make_engine(tmp_path / "m.db")
    s = Session(engine)
    for k in ("a", "b"):
        s.add(KnowledgePoint(id=k, name=k, module="M"))
    s.commit()
    return s


def test_mastery_moves_toward_result_and_slows_down(tmp_path):
    s = _session(tmp_path)
    up = mastery.update(s, {"a": 1.0}, 0.0, 1.0, NOW, k0=0.4, tau_days=45)
    assert up[0]["after"] > up[0]["before"] == 50.0
    steps = []
    for _ in range(20):
        before = s.get(Mastery, "a").theta
        mastery.update(s, {"a": 1.0}, 0.0, 1.0, NOW, k0=0.4, tau_days=45)
        steps.append(s.get(Mastery, "a").theta - before)
    assert steps[-1] < steps[0]  # 越做越稳
    down = mastery.update(s, {"b": 1.0}, -1.0, 0.0, NOW, k0=0.4, tau_days=45)
    assert down[0]["after"] < 50.0


def test_mastery_wrong_on_easy_costs_more_than_on_hard(tmp_path):
    s = _session(tmp_path)
    easy = mastery.update(s, {"a": 1.0}, -1.0, 0.0, NOW, k0=0.4, tau_days=45)[0]
    hard = mastery.update(s, {"b": 1.0}, 2.5, 0.0, NOW, k0=0.4, tau_days=45)[0]
    assert easy["before"] - easy["after"] > hard["before"] - hard["after"]


def test_mastery_decays_without_practice():
    m = Mastery(kp_id="a", theta=2.0, last_practiced=NOW)
    assert mastery.effective_theta(m, NOW, 45) == 2.0
    assert abs(mastery.effective_theta(m, NOW + timedelta(days=45), 45) - 2.0 / 2.718281828) < 1e-6


def test_rating_mapping():
    q = SimpleNamespace(est_seconds=100)
    kw = dict(hints_used=0, confidence="sure")
    assert review.rate(q, WRONG, 0.0, seconds=50, **kw) == Rating.Again
    assert review.rate(q, FULL, 1.0, seconds=50, **kw) == Rating.Easy
    assert review.rate(q, FULL, 1.0, seconds=90, **kw) == Rating.Good
    assert review.rate(q, FULL, 0.85, seconds=90, hints_used=1, confidence="sure") == Rating.Hard
    assert review.rate(q, FULL, 0.7, seconds=90, hints_used=0, confidence="unsure") == Rating.Hard
    assert not review.needs_card(1.0, hints_used=0, confidence="sure", revealed=False)
    assert review.needs_card(1.0, hints_used=0, confidence="unsure", revealed=False)


def test_card_lifecycle_until_graduation(tmp_path):
    s = _session(tmp_path)
    s.add(Question(id="q", type="fill", stem="x", points=5, difficulty=0, difficulty_label="中档", est_seconds=60))
    s.commit()
    sched = review.make_scheduler(0.9)
    assert review.on_attempt(s, sched, "q", Rating.Good, False, NOW) is None  # 一次做对不进错题本

    first = review.on_attempt(s, sched, "q", Rating.Again, True, NOW)
    assert first["created"] and timedelta(hours=20) < first["due"] - NOW <= timedelta(days=1)

    now, graduated = NOW, False
    for _ in range(10):
        now = s.get(review.ReviewCard, "q").due
        result = review.on_attempt(s, sched, "q", Rating.Good, False, now)
        if result["graduated"]:
            graduated = True
            break
    assert graduated
    card = s.get(review.ReviewCard, "q")
    assert card.suspended and card.lapses == 0

    again = review.on_attempt(s, sched, "q", Rating.Again, True, now + timedelta(days=60))
    assert not again["graduated"] and s.get(review.ReviewCard, "q").lapses == 1
