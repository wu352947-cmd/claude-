"""模考：按试卷结构的题位组卷，交卷后生成成绩报告。"""

from __future__ import annotations

import random
from collections import defaultdict

from .predict import TYPE_LABELS
from .today import recency_weight

MATCH_LABELS = {"kp": "知识点吻合", "module": "同模块", "type": "仅题型相同", "none": "题库里没有这种题型"}


def compose(blueprint, questions, links: dict[str, dict[str, float]], kp_module: dict[str, str],
            attempted: set[str], rng: random.Random) -> list[dict]:
    """每个题位挑一道题：知识点越吻合、越没做过、难度越接近越好，加一点随机，每次组出来的卷子不一样。"""
    used: set[str] = set()
    out = []
    for slot in blueprint.slots:
        slot_b = sum(p.points * p.b for p in slot.parts) / slot.points
        slot_modules = {kp_module.get(k) for k in slot.kps}
        best, best_score, best_match = None, float("-inf"), "none"
        for q in questions:
            if q.id in used or q.type != slot.type:
                continue
            w = links.get(q.id, {})
            kp_match = sum(wk * slot.kps.get(k, 0.0) for k, wk in w.items())
            module_match = sum(wk for k, wk in w.items() if kp_module.get(k) in slot_modules)
            score = (10 * kp_match + 3 * module_match + (2 if q.id not in attempted else 0)
                     - 0.5 * abs(q.difficulty - slot_b) + 2 * recency_weight(q.year) + rng.random())
            if slot.type == "solve" and len(q.parts or []) < 2:
                score -= 3  # 只有一问的（多是答案没法自动判分、改成自评的填空题）不像真正的大题
            if score > best_score:
                best, best_score = q, score
                best_match = "kp" if kp_match > 0 else "module" if module_match > 0 else "type"
        if best is not None:
            used.add(best.id)
        out.append({
            "no": slot.no,
            "type": slot.type,
            "points": slot.points,
            "question_id": best.id if best else None,
            "matched": best_match,
            "matched_label": MATCH_LABELS[best_match],
        })
    return out


def multi_breakdown(items: list[tuple[list[str], list[str], float, float]]) -> dict:
    """items: (选了什么, 正确答案, 得分, 满分)。把多选失分拆成「漏选」和「错选」。"""
    missed = wrong = blank = 0.0
    n_missed = n_wrong = n_blank = n_full = 0
    for chosen, correct, score, max_score in items:
        chosen_s, correct_s = set(chosen), set(correct)
        loss = max_score - score
        if not chosen_s:
            blank += loss
            n_blank += 1
        elif chosen_s - correct_s:
            wrong += loss
            n_wrong += 1
        elif chosen_s != correct_s:
            missed += loss
            n_missed += 1
        else:
            n_full += 1
    if wrong + missed == 0:
        advice = "还没有多选失分记录。" if not items else "多选题没有因为漏选或错选丢分，保持。"
    elif wrong > 1.5 * missed:
        advice = "错选丢的分更多：拿不准的选项宁可不选，只选有把握的，部分分也比 0 分强。"
    elif missed > 1.5 * wrong:
        advice = "漏选丢的分更多：你对选项的判断比你以为的准，把握超过一半的选项可以大胆选上。"
    else:
        advice = "漏选和错选丢分差不多：继续按「有把握才选」的原则，同时提高单个选项的判断准确率。"
    return {
        "count": len(items),
        "full": n_full,
        "missed": {"count": n_missed, "lost": round(missed, 2)},
        "wrong": {"count": n_wrong, "lost": round(wrong, 2)},
        "blank": {"count": n_blank, "lost": round(blank, 2)},
        "advice": advice,
    }


def build_report(exam, attempts: dict[str, object], questions: dict, links, kps, kp_module) -> dict:
    """attempts: question_id → Attempt（本场模考的）。题位得分按题位分值折算。"""
    by_type = defaultdict(lambda: {"score": 0.0, "points": 0.0, "seconds": 0})
    lost_by_module: dict[str, float] = defaultdict(float)
    slot_rows, multi_items = [], []
    total = 0.0
    for slot in exam.slots:
        qid = slot["question_id"]
        a = attempts.get(qid) if qid else None
        ratio = (a.score / a.max_score) if a and a.max_score else 0.0
        score = round(slot["points"] * ratio, 2)
        seconds = a.seconds if a else 0
        total += score
        t = by_type[slot["type"]]
        t["score"] += score
        t["points"] += slot["points"]
        t["seconds"] += seconds
        w = links.get(qid, {}) if qid else {}
        for k, wk in w.items():
            lost_by_module[kp_module.get(k, "其它")] += (slot["points"] - score) * wk
        if a and slot["type"] == "multi":
            multi_items.append((a.response.get("choices") or [], questions[qid].answer, a.score, a.max_score))
        slot_rows.append({
            "no": slot["no"],
            "type": slot["type"],
            "points": slot["points"],
            "score": score,
            "seconds": seconds,
            "question_id": qid,
            "kps": [kps[k].name for k in w if k in kps],
        })
    return {
        "total": round(total, 1),
        "predicted": exam.predicted,
        "by_type": [{"type": t, "label": TYPE_LABELS[t], "score": round(v["score"], 1), "points": v["points"],
                     "minutes": round(v["seconds"] / 60, 1)} for t, v in by_type.items()],
        "slots": slot_rows,
        "multi": multi_breakdown(multi_items),
        "lost_by_module": sorted(({"module": m, "lost": round(v, 1)} for m, v in lost_by_module.items() if v > 0.05),
                                 key=lambda x: -x["lost"]),
        "minutes_used": round(sum(r["seconds"] for r in slot_rows) / 60, 1),
        # 题库不够时有些题位组不出题：报告里要说明这次卷面实际覆盖了多少分
        "available_points": sum(s["points"] for s in exam.slots if s["question_id"]),
    }

