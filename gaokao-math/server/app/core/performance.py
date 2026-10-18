"""作答 → 0–1 表现分（ARCHITECTURE.md §5.2）。"""

from __future__ import annotations

HINT_DISCOUNT = 0.85  # 每用一次提示打 85 折
SLOW_FACTOR = 1.5  # 超过建议用时 1.5 倍算超时
SLOW_DISCOUNT = 0.8
CONFIDENCE_CAP = {"sure": 1.0, "unsure": 0.7, "guess": 0.3}
REVEALED_CAP = 0.3  # 作答前看了答案


def performance(q, grade, *, seconds: int, hints_used: int = 0, revealed: bool = False,
                confidence: str = "sure") -> float:
    if q.type in ("multi", "solve"):
        r = grade.score / grade.max_score if grade.max_score else 0.0
    else:
        r = 1.0 if grade.full else 0.0

    if r > 0:
        r *= HINT_DISCOUNT ** max(hints_used, 0)
        if seconds > SLOW_FACTOR * q.est_seconds:
            r *= SLOW_DISCOUNT  # 做对但超时：考场上等于丢分
        r = min(r, CONFIDENCE_CAP.get(confidence, 1.0))
    if revealed:
        r = min(r, REVEALED_CAP)
    return round(r, 4)
