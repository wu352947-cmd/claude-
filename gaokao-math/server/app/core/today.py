"""每日推荐（ARCHITECTURE.md §5.5 的简化版）。

1. 先放到期的错题（按到期时间）；
2. 再从没做过的题里挑新题：
   知识点优先级 = 卷面分值 × (1 − 把握) × 前置是否就绪 × 当前复习重点
   题目得分     = 优先级 × 难度贴合度（预测做对概率落在目标区间时为 1）
   同一知识点被选中后优先级减半，避免一天全是同一类题。
每道题都附一句推荐理由。
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime

from sqlmodel import Session, select

from ..models import Attempt, KnowledgePoint, Mastery, Question, QuestionKp, ReviewCard
from .mastery import effective_theta, predict, sigmoid

ERROR_LABELS = {
    "concept": "概念不清", "method": "方法没想到", "calc": "计算失误",
    "reading": "审题错误", "time": "时间不够", "guess": "不会，蒙的",
}
READY_THRESHOLD = 0.4
NOT_READY_FACTOR = 0.3
FOCUS_FACTOR = 1.5
REPEAT_PENALTY = 0.5


def _days_since(dt: datetime | None, now: datetime) -> int | None:
    return None if dt is None else max(int((now - dt).total_seconds() // 86400), 0)


def build_plan(session: Session, settings, now: datetime) -> dict:
    kps = {k.id: k for k in session.exec(select(KnowledgePoint).where(KnowledgePoint.active))}
    masteries = {m.kp_id: m for m in session.exec(select(Mastery))}
    questions = {q.id: q for q in session.exec(select(Question).where(Question.active, Question.verified))}
    links: dict[str, dict[str, float]] = defaultdict(dict)
    for link in session.exec(select(QuestionKp)):
        links[link.question_id][link.kp_id] = link.weight
    attempted = set(session.exec(select(Attempt.question_id).distinct()))

    # ---- 到期错题
    due_cards = session.exec(
        select(ReviewCard).where(ReviewCard.due <= now, ReviewCard.suspended == False)  # noqa: E712
        .order_by(ReviewCard.due)
    ).all()
    reviews = []
    for card in due_cards:
        if card.question_id not in questions:
            continue
        reason = f"到期错题 · 第 {card.reps + 1} 次复习"
        if card.last_error_type:
            reason += f" · 上次错因：{ERROR_LABELS.get(card.last_error_type, card.last_error_type)}"
        reviews.append({"question_id": card.question_id, "kind": "review", "reason": reason})
        if len(reviews) >= settings.daily_review:
            break

    # ---- 知识点优先级
    def eff(k: str) -> float:
        return effective_theta(masteries.get(k), now, settings.tau_days)

    priority: dict[str, float] = {}
    for k, kp in kps.items():
        ready = 1.0
        if kp.prereq:
            avg = sum(sigmoid(eff(p)) for p in kp.prereq) / len(kp.prereq)
            ready = 1.0 if avg >= READY_THRESHOLD else NOT_READY_FACTOR
        focus = FOCUS_FACTOR if kp.module in settings.focus_modules else 1.0
        priority[k] = kp.exam_weight * (1 - sigmoid(eff(k))) * ready * focus

    lo, hi = settings.target_band
    candidates = []
    for qid, q in questions.items():
        if qid in attempted or not links.get(qid):
            continue
        weights = {k: w for k, w in links[qid].items() if k in kps}
        if not weights:
            continue
        p = predict(weights, masteries, q.difficulty, now, settings.tau_days)
        fit = 1.0 if lo <= p <= hi else math.exp(-4 * (lo - p if p < lo else p - hi))
        main_kp = max(weights, key=lambda k: weights[k] * priority[k])
        candidates.append({"q": q, "p": p, "fit": fit, "weights": weights, "main": main_kp})

    picked = []
    used: dict[str, int] = defaultdict(int)
    while candidates and len(picked) < settings.daily_new:
        def score(c):
            return sum(w * priority[k] * REPEAT_PENALTY ** used[k] for k, w in c["weights"].items()) * c["fit"]
        best = max(candidates, key=lambda c: (score(c), c["q"].id))
        candidates.remove(best)
        for k in best["weights"]:
            used[k] += 1
        picked.append(best)

    new_items = []
    for c in picked:
        kp = kps[c["main"]]
        m = masteries.get(kp.id)
        days = _days_since(m.last_practiced if m else None, now)
        practiced = "还没练过" if days is None else ("今天练过" if days == 0 else f"已 {days} 天未练")
        reason = (f"{kp.name}：卷面约 {kp.exam_weight:g} 分，你的把握 {sigmoid(eff(kp.id)) * 100:.0f}%，"
                  f"{practiced}；预计做对 {c['p'] * 100:.0f}%")
        new_items.append({"question_id": c["q"].id, "kind": "new", "reason": reason})

    return {"generated_at": now, "items": reviews + new_items,
            "due_total": len(due_cards), "unseen_total": len(questions) - len(attempted & set(questions))}
