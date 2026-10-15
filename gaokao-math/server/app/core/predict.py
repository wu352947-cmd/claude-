"""预测分与提分建议（ARCHITECTURE.md §5.6）。

    E[分数] = Σ_题位 Σ_每一问 分值 × Σ_k p(k) · σ(θ_k − b)

提分建议：对每个知识点求「θ_k 增加 Δθ（约等于认真练 1 小时）时预测分增加多少」，
即 Σ 分值 × p(k) × P(1−P) × Δθ，取最大的几个。这比「哪里最弱」更能指导复习。
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from .mastery import effective_theta, sigmoid

TYPE_LABELS = {"single": "单选", "multi": "多选", "fill": "填空", "solve": "解答"}


def predict_score(blueprint, masteries: dict, kp_names: dict[str, str], now: datetime, *,
                  tau_days: float, hour_gain: float, top: int = 5) -> dict:
    theta = {k: effective_theta(masteries.get(k), now, tau_days) for k in kp_names}
    slots, by_type = [], defaultdict(lambda: {"expected": 0.0, "points": 0.0})
    gain: dict[str, float] = defaultdict(float)
    total = 0.0
    for slot in blueprint.slots:
        expected = 0.0
        for part in slot.parts:
            for k, p in slot.kps.items():
                prob = sigmoid(theta.get(k, 0.0) - part.b)
                expected += part.points * p * prob
                gain[k] += part.points * p * prob * (1 - prob) * hour_gain
        slots.append({
            "no": slot.no,
            "type": slot.type,
            "points": slot.points,
            "expected": round(expected, 2),
            "main_kp": kp_names.get(max(slot.kps, key=slot.kps.get), ""),
        })
        by_type[slot.type]["expected"] += expected
        by_type[slot.type]["points"] += slot.points
        total += expected
    gains = sorted(gain.items(), key=lambda kv: -kv[1])[:top]
    return {
        "total": round(total, 1),
        "points": blueprint.total_points,
        "by_type": [{"type": t, "label": TYPE_LABELS[t], "expected": round(v["expected"], 1), "points": v["points"]}
                    for t, v in by_type.items()],
        "slots": slots,
        "gains": [{"kp_id": k, "name": kp_names.get(k, k), "gain": round(g, 2)} for k, g in gains],
    }
