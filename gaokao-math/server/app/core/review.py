"""错题间隔重复：FSRS（ARCHITECTURE.md §5.4）。"""

from __future__ import annotations

from datetime import datetime, timedelta

from fsrs import Card, Rating, Scheduler
from sqlmodel import Session

from ..models import ReviewCard

GRADUATE_STREAK = 3  # 连续 3 次 Good/Easy
GRADUATE_INTERVAL = timedelta(days=30)  # 且下次间隔超过 30 天 → 毕业
CARD_THRESHOLD = 0.85  # 表现分低于它就进错题本
EASY_SPEED = 0.6  # 用时不到建议用时 60% 且全对 → Easy


def make_scheduler(desired_retention: float) -> Scheduler:
    # 不用分钟级的学习步：错题最早第二天再做，而不是十分钟后
    return Scheduler(desired_retention=desired_retention, learning_steps=(), relearning_steps=(),
                     enable_fuzzing=False)


def rate(q, grade, perf: float, *, seconds: int, hints_used: int, confidence: str) -> Rating:
    if perf < 0.5:
        return Rating.Again
    if hints_used or confidence != "sure" or perf < CARD_THRESHOLD:
        return Rating.Hard
    if grade.full and seconds <= EASY_SPEED * q.est_seconds:
        return Rating.Easy
    return Rating.Good


def needs_card(perf: float, *, hints_used: int, confidence: str, revealed: bool) -> bool:
    """错题，或「做对但不踏实」的题。"""
    return perf < CARD_THRESHOLD or hints_used > 0 or confidence != "sure" or revealed


def on_attempt(session: Session, scheduler: Scheduler, question_id: str, rating: Rating,
               needed: bool, now: datetime) -> dict | None:
    card = session.get(ReviewCard, question_id)
    created = False
    if card is None:
        if not needed:
            return None
        card = ReviewCard(question_id=question_id, due=now, created_at=now)
        created = True
    elif card.suspended:
        if rating != Rating.Again:
            return {"due": None, "rating": rating.name, "graduated": True, "created": False}
        card.suspended = False  # 毕业的题又错了：重新回到错题本
        card.streak = 0

    fcard = Card.from_dict(card.fsrs) if card.fsrs else Card()
    fcard, _ = scheduler.review_card(fcard, rating, now)
    card.fsrs = fcard.to_dict()
    card.due = fcard.due
    card.reps += 1
    if rating == Rating.Again:
        if not created:
            card.lapses += 1
        card.streak = 0
    elif rating in (Rating.Good, Rating.Easy):
        card.streak += 1
    else:
        card.streak = 0
    if card.streak >= GRADUATE_STREAK and card.due - now > GRADUATE_INTERVAL:
        card.suspended = True
    session.add(card)
    return {"due": card.due, "rating": rating.name, "graduated": card.suspended, "created": created}
