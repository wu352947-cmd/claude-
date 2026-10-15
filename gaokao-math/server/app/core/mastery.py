"""知识点掌握度：Elo 式在线更新，等价于简化的 IRT-1PL（ARCHITECTURE.md §5.3）。

    P(对) = σ(Σ w_k θ_k − b)
    θ_k ← θ_k + K_k · w_k · (r − P),  K_k = K0 / (1 + 0.05 n_k)

题目难度 b 固定（由「基础 / 中档 / 较难 / 压轴」标签映射），只更新学生的 θ。
长期不练的知识点按 e^{−Δt/τ} 向 0 回归。
"""

from __future__ import annotations

import math
from datetime import datetime

from sqlmodel import Session

from ..models import Mastery

DIFFICULTY_B = {"基础": -1.0, "中档": 0.0, "较难": 1.2, "压轴": 2.5}


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def effective_theta(m: Mastery | None, now: datetime, tau_days: float) -> float:
    if m is None:
        return 0.0
    if m.last_practiced is None:
        return m.theta
    days = max((now - m.last_practiced).total_seconds() / 86400.0, 0.0)
    return m.theta * math.exp(-days / tau_days)


def mastery_percent(theta: float) -> float:
    """展示用：做一道中档题（b = 0）的把握。"""
    return round(sigmoid(theta) * 100, 1)


def predict(kp_weights: dict[str, float], masteries: dict[str, Mastery], b: float,
            now: datetime, tau_days: float) -> float:
    ability = sum(w * effective_theta(masteries.get(k), now, tau_days) for k, w in kp_weights.items())
    return sigmoid(ability - b)


def update(session: Session, kp_weights: dict[str, float], b: float, r: float, now: datetime,
           *, k0: float, tau_days: float) -> list[dict]:
    masteries = {k: session.get(Mastery, k) or Mastery(kp_id=k) for k in kp_weights}
    p = predict(kp_weights, masteries, b, now, tau_days)
    changes = []
    for k, w in kp_weights.items():
        m = masteries[k]
        before = effective_theta(m, now, tau_days)
        step = k0 / (1 + 0.05 * m.n_attempts)
        m.theta = before + step * w * (r - p)
        m.n_attempts += 1
        m.last_practiced = now
        session.add(m)
        changes.append({
            "kp_id": k,
            "before": mastery_percent(before),
            "after": mastery_percent(m.theta),
        })
    return changes
