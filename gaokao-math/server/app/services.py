"""记录一次作答：判分 → 表现分 → 掌握度 → 错题本。练习、模考、离线同步都走这里。"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlmodel import Session, select

from .core import mastery, review
from .core.grading import grade
from .core.performance import performance
from .models import Attempt, KnowledgePoint, Question, QuestionKp, ReviewCard


def kp_map(session: Session) -> dict[str, KnowledgePoint]:
    return {k.id: k for k in session.exec(select(KnowledgePoint))}


def links(session: Session, qids: list[str] | None = None) -> dict[str, dict[str, float]]:
    stmt = select(QuestionKp)
    if qids is not None:
        stmt = stmt.where(QuestionKp.question_id.in_(qids))
    out: dict[str, dict[str, float]] = defaultdict(dict)
    for link in session.exec(stmt):
        out[link.question_id][link.kp_id] = link.weight
    return out


def reveal_payload(q: Question) -> dict:
    return {
        "answer": q.answer,
        "answer_kind": q.answer_kind if q.type == "fill" else None,
        "solution": q.solution,
        "parts": q.parts or [],
    }


def review_target(session: Session, q: Question) -> str:
    """变式题算在母题的错题卡上：做对变式说明母题的方法掌握了。"""
    if q.parent_id:
        parent_card = session.get(ReviewCard, q.parent_id)
        if parent_card is not None and not parent_card.suspended:
            return q.parent_id
    return q.id


def record_attempt(session: Session, state, q: Question, response: dict, *, seconds: int, hints_used: int = 0,
                   revealed: bool = False, confidence: str = "sure", now: datetime,
                   exam_id: int | None = None) -> dict:
    """不 commit，由调用方统一提交。"""
    settings = state.settings
    revealed = revealed and q.type != "solve"  # 解答题本来就要看答案自评
    g = grade(q, response)
    perf = performance(q, g, seconds=seconds, hints_used=hints_used, revealed=revealed, confidence=confidence)
    attempt = Attempt(question_id=q.id, response=response, score=g.score, max_score=g.max_score, perf=perf,
                      seconds=seconds, hints_used=hints_used, revealed=revealed, confidence=confidence,
                      exam_id=exam_id, created_at=now)
    session.add(attempt)

    weights = links(session, [q.id]).get(q.id, {})
    kps = kp_map(session)
    changes = mastery.update(session, weights, q.difficulty, perf, now, k0=settings.k0, tau_days=settings.tau_days)
    for c in changes:
        c["name"] = kps[c["kp_id"]].name if c["kp_id"] in kps else c["kp_id"]

    rating = review.rate(q, g, perf, seconds=seconds, hints_used=hints_used, confidence=confidence)
    needed = review.needs_card(perf, hints_used=hints_used, confidence=confidence, revealed=revealed)
    card = review.on_attempt(session, state.scheduler, review_target(session, q), rating, needed, now)
    session.flush()
    return {
        "attempt_id": attempt.id,
        "question_id": q.id,
        "score": g.score,
        "max_score": g.max_score,
        "full": g.full,
        "perf": perf,
        "detail": g.detail,
        "reveal": reveal_payload(q),
        "review": card,
        "mastery": changes,
    }
