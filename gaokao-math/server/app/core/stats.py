"""看板数据。"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, func, select

from ..models import Attempt, Exam, KnowledgePoint, Mastery, Question, ReviewCard
from .mastery import effective_theta, mastery_percent
from .today import ERROR_LABELS


def _local_date(dt: datetime, tz: ZoneInfo):
    return dt.astimezone(tz).date()


def overview(session: Session, now: datetime, tz: ZoneInfo) -> dict:
    week_ago = now - timedelta(days=7)
    recent = session.exec(select(Attempt).where(Attempt.created_at >= week_ago)).all()
    days = {_local_date(a.created_at, tz) for a in session.exec(select(Attempt))}
    streak, day = 0, _local_date(now, tz)
    if day not in days:
        day -= timedelta(days=1)  # 今天还没做不算断
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    today = _local_date(now, tz)
    return {
        "questions": session.exec(select(func.count()).select_from(Question).where(Question.active)).one(),
        "attempts_total": session.exec(select(func.count()).select_from(Attempt)).one(),
        "attempts_today": sum(1 for a in recent if _local_date(a.created_at, tz) == today),
        "attempts_7d": len(recent),
        "score_rate_7d": round(sum(a.score for a in recent) / sum(a.max_score for a in recent) * 100, 1)
        if recent else None,
        "cards_active": session.exec(select(func.count()).select_from(ReviewCard)
                                     .where(ReviewCard.suspended == False)).one(),  # noqa: E712
        "cards_due": session.exec(select(func.count()).select_from(ReviewCard)
                                  .where(ReviewCard.suspended == False, ReviewCard.due <= now)).one(),  # noqa: E712
        "cards_graduated": session.exec(select(func.count()).select_from(ReviewCard)
                                        .where(ReviewCard.suspended == True)).one(),  # noqa: E712
        "streak_days": streak,
    }


def mastery_by_module(session: Session, now: datetime, tau_days: float) -> list[dict]:
    masteries = {m.kp_id: m for m in session.exec(select(Mastery))}
    modules: dict[str, list[dict]] = defaultdict(list)
    for kp in session.exec(select(KnowledgePoint).where(KnowledgePoint.active).order_by(KnowledgePoint.position)):
        m = masteries.get(kp.id)
        modules[kp.module].append({
            "id": kp.id,
            "name": kp.name,
            "exam_weight": kp.exam_weight,
            "mastery": mastery_percent(effective_theta(m, now, tau_days)),
            "n_attempts": m.n_attempts if m else 0,
        })
    out = []
    for module, items in modules.items():
        practiced = [i for i in items if i["n_attempts"]]
        weight = sum(i["exam_weight"] for i in practiced)
        avg = (sum(i["mastery"] * i["exam_weight"] for i in practiced) / weight) if weight else None
        out.append({
            "module": module,
            "exam_weight": round(sum(i["exam_weight"] for i in items), 1),
            "mastery": round(avg, 1) if avg is not None else None,
            "practiced": len(practiced),
            "kps": items,
        })
    return out


def error_breakdown(session: Session, now: datetime, days: int = 30) -> dict:
    since = now - timedelta(days=days)
    lost = session.exec(select(Attempt).where(Attempt.created_at >= since, Attempt.score < Attempt.max_score)).all()
    buckets: dict[str, dict] = {}
    for a in lost:
        key = a.error_type or "unlabeled"
        b = buckets.setdefault(key, {
            "error_type": key,
            "label": ERROR_LABELS.get(key, "未标注"),
            "count": 0,
            "lost_points": 0.0,
        })
        b["count"] += 1
        b["lost_points"] = round(b["lost_points"] + a.max_score - a.score, 2)
    total = sum(b["lost_points"] for b in buckets.values())
    items = sorted(buckets.values(), key=lambda b: -b["lost_points"])
    for b in items:
        b["share"] = round(b["lost_points"] / total * 100, 1) if total else 0.0
    return {"days": days, "lost_points": round(total, 2), "items": items}


def trend(session: Session, now: datetime, tz: ZoneInfo, days: int = 30) -> list[dict]:
    """最近 days 天每天做了几题、得分率多少（没做题的日子也列出来，方便画图）。"""
    since = now - timedelta(days=days + 1)
    buckets: dict = defaultdict(lambda: [0, 0.0, 0.0])
    for a in session.exec(select(Attempt).where(Attempt.created_at >= since)):
        b = buckets[_local_date(a.created_at, tz)]
        b[0] += 1
        b[1] += a.score
        b[2] += a.max_score
    today = _local_date(now, tz)
    out = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        n, score, max_score = buckets.get(day, (0, 0.0, 0.0))
        out.append({"date": day.isoformat(), "attempts": n,
                    "score_rate": round(score / max_score * 100, 1) if max_score else None})
    return out


def multi_analysis(session: Session, now: datetime, days: int = 60) -> dict:
    from .exam import multi_breakdown

    since = now - timedelta(days=days)
    rows = session.exec(
        select(Attempt, Question).join(Question, Question.id == Attempt.question_id)
        .where(Question.type == "multi", Attempt.created_at >= since, Attempt.revealed == False)  # noqa: E712
    ).all()
    data = multi_breakdown([(a.response.get("choices") or [], q.answer, a.score, a.max_score) for a, q in rows])
    data["days"] = days
    return data


def exam_history(session: Session) -> list[dict]:
    exams = session.exec(select(Exam).where(Exam.status == "done").order_by(Exam.created_at)).all()
    return [{"id": e.id, "title": e.title, "date": e.created_at.isoformat(), "score": e.score,
             "predicted": e.predicted} for e in exams]
