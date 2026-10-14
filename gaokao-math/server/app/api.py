from __future__ import annotations

import secrets
from collections import defaultdict
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from . import bank
from .core import mastery, review, stats
from .core.grading import grade
from .core.performance import performance
from .core.today import ERROR_LABELS, build_plan
from .models import Attempt, KnowledgePoint, Mastery, Question, QuestionKp, ReviewCard

router = APIRouter(prefix="/api")


def get_session(request: Request):
    with Session(request.app.state.engine) as session:
        yield session


def now_of(request: Request):
    return request.app.state.clock()


SessionDep = Depends(get_session)


# ---------------------------------------------------------------- 序列化

def _kp_map(session: Session) -> dict[str, KnowledgePoint]:
    return {k.id: k for k in session.exec(select(KnowledgePoint))}


def _links(session: Session, qids: list[str] | None = None) -> dict[str, dict[str, float]]:
    stmt = select(QuestionKp)
    if qids is not None:
        stmt = stmt.where(QuestionKp.question_id.in_(qids))
    out: dict[str, dict[str, float]] = defaultdict(dict)
    for link in session.exec(stmt):
        out[link.question_id][link.kp_id] = link.weight
    return out


def _preview(stem: str, limit: int = 90) -> str:
    text = stem.strip().splitlines()[0] if stem.strip() else ""
    if len(text) > limit:
        text = text[:limit]
        if text.count("$") % 2:  # 不要截断在公式中间
            text = text[: text.rfind("$")]
        text = text.rstrip() + "…"
    return text


def summary(q: Question, weights: dict[str, float], kps: dict[str, KnowledgePoint]) -> dict:
    return {
        "id": q.id,
        "type": q.type,
        "source": q.source,
        "difficulty_label": q.difficulty_label,
        "points": q.points,
        "preview": _preview(q.stem),
        "kps": [{"id": k, "name": kps[k].name, "module": kps[k].module} for k in weights if k in kps],
    }


def public_question(q: Question, weights: dict[str, float], kps: dict[str, KnowledgePoint]) -> dict:
    """作答前可见的内容：不含答案、解答和提示正文。"""
    return {
        **summary(q, weights, kps),
        "stem": q.stem,
        "options": q.options,
        "answer_kind": q.answer_kind if q.type == "fill" else None,
        "parts": [{"label": p["label"], "points": p["points"]} for p in q.parts or []],
        "hints_total": len(q.hints),
        "est_seconds": q.est_seconds,
    }


def reveal_payload(q: Question) -> dict:
    return {
        "answer": q.answer,
        "answer_kind": q.answer_kind if q.type == "fill" else None,
        "solution": q.solution,
        "parts": q.parts or [],
    }


def _get_question(session: Session, qid: str) -> Question:
    q = session.get(Question, qid)
    if q is None:
        raise HTTPException(404, "题目不存在")
    return q


# ---------------------------------------------------------------- 题库

@router.get("/health")
def health():
    return {"ok": True}


@router.get("/bank/status")
def bank_status(request: Request):
    return request.app.state.bank_report


@router.post("/bank/reload")
def bank_reload(request: Request, session: Session = SessionDep):
    """修改了 YAML 之后点一下，不用重启服务。"""
    report = bank.sync_bank(session, request.app.state.settings.data_dir, request.app.state.settings.type_defaults)
    request.app.state.bank_report = report
    return report


@router.get("/kps")
def list_kps(session: Session = SessionDep):
    stmt = select(KnowledgePoint).where(KnowledgePoint.active).order_by(KnowledgePoint.position)
    return [{"id": k.id, "name": k.name, "module": k.module, "exam_weight": k.exam_weight}
            for k in session.exec(stmt)]


@router.get("/questions")
def list_questions(module: str | None = None, type: str | None = None, kp: str | None = None,
                   q: str | None = None, session: Session = SessionDep):
    kps = _kp_map(session)
    questions = session.exec(select(Question).where(Question.active).order_by(Question.id)).all()
    links = _links(session)
    counts = dict(session.exec(select(Attempt.question_id, func.count()).group_by(Attempt.question_id)).all())
    cards = {c.question_id: c for c in session.exec(select(ReviewCard))}
    out = []
    for item in questions:
        weights = links.get(item.id, {})
        if type and item.type != type:
            continue
        if kp and kp not in weights:
            continue
        if module and not any(kps[k].module == module for k in weights if k in kps):
            continue
        if q and q not in item.stem and q not in item.source and q not in item.id:
            continue
        card = cards.get(item.id)
        out.append({
            **summary(item, weights, kps),
            "attempts": counts.get(item.id, 0),
            "in_review": bool(card and not card.suspended),
        })
    return out


@router.get("/questions/{qid}")
def get_question(qid: str, session: Session = SessionDep):
    q = _get_question(session, qid)
    data = public_question(q, _links(session, [qid]).get(qid, {}), _kp_map(session))
    history = session.exec(select(Attempt).where(Attempt.question_id == qid).order_by(Attempt.created_at)).all()
    card = session.get(ReviewCard, qid)
    data["history"] = [{"created_at": a.created_at, "score": a.score, "max_score": a.max_score,
                        "seconds": a.seconds, "error_type": a.error_type, "note": a.note} for a in history]
    data["card"] = None if card is None else {
        "due": card.due, "reps": card.reps, "lapses": card.lapses, "graduated": card.suspended}
    return data


@router.get("/questions/{qid}/hints/{n}")
def get_hint(qid: str, n: int, session: Session = SessionDep):
    q = _get_question(session, qid)
    if not 1 <= n <= len(q.hints):
        raise HTTPException(404, "没有这一级提示")
    return {"level": n, "total": len(q.hints), "hint": q.hints[n - 1]}


@router.post("/questions/{qid}/reveal")
def reveal(qid: str, session: Session = SessionDep):
    return reveal_payload(_get_question(session, qid))


class QuestionIn(BaseModel):
    type: Literal["single", "multi", "fill", "solve"]
    stem: str
    kps: list[str]
    source: str = ""
    difficulty_label: str = "中档"
    est_seconds: int | None = None
    options: dict[str, str] | None = None
    answer: Any = None
    answer_kind: str | None = None
    loose_endpoints: bool | None = None
    parts: list[dict] | None = None
    hints: list[str] = Field(default_factory=list)
    solution: str = ""


@router.post("/questions", status_code=201)
def create_question(body: QuestionIn, request: Request, session: Session = SessionDep):
    settings = request.app.state.settings
    now = now_of(request)
    raw = body.model_dump(exclude_none=True)
    if raw.get("type") != "fill":
        raw.pop("answer_kind", None)
        raw.pop("loose_endpoints", None)
    qid = f"u{now:%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"
    kp_ids = {k.id for k in session.exec(select(KnowledgePoint).where(KnowledgePoint.active))}
    try:
        bank.normalize_question(raw, qid, kp_ids, settings.type_defaults)
        path = bank.write_question_file(settings.data_dir, qid, raw)
    except bank.BankError as exc:
        raise HTTPException(400, str(exc)) from exc
    request.app.state.bank_report = bank.sync_bank(session, settings.data_dir, settings.type_defaults)
    return {"id": qid, "file": path.relative_to(settings.data_dir).as_posix()}


# ---------------------------------------------------------------- 作答

class AttemptIn(BaseModel):
    question_id: str
    response: dict = Field(default_factory=dict)  # {"choice"} | {"choices"} | {"value"} | {"part_scores"}
    seconds: int = Field(ge=0, le=6 * 3600)
    hints_used: int = Field(default=0, ge=0)
    revealed: bool = False
    confidence: Literal["sure", "unsure", "guess"] = "sure"


@router.post("/attempts", status_code=201)
def submit_attempt(body: AttemptIn, request: Request, session: Session = SessionDep):
    settings = request.app.state.settings
    now = now_of(request)
    q = _get_question(session, body.question_id)
    revealed = body.revealed and q.type != "solve"  # 解答题本来就要看答案自评
    g = grade(q, body.response)
    perf = performance(q, g, seconds=body.seconds, hints_used=body.hints_used, revealed=revealed,
                       confidence=body.confidence)
    attempt = Attempt(question_id=q.id, response=body.response, score=g.score, max_score=g.max_score,
                      perf=perf, seconds=body.seconds, hints_used=body.hints_used, revealed=revealed,
                      confidence=body.confidence, created_at=now)
    session.add(attempt)

    weights = _links(session, [q.id]).get(q.id, {})
    kps = _kp_map(session)
    changes = mastery.update(session, weights, q.difficulty, perf, now, k0=settings.k0, tau_days=settings.tau_days)
    for c in changes:
        c["name"] = kps[c["kp_id"]].name if c["kp_id"] in kps else c["kp_id"]

    rating = review.rate(q, g, perf, seconds=body.seconds, hints_used=body.hints_used, confidence=body.confidence)
    needed = review.needs_card(perf, hints_used=body.hints_used, confidence=body.confidence, revealed=revealed)
    card = review.on_attempt(session, request.app.state.scheduler, q.id, rating, needed, now)
    session.commit()
    session.refresh(attempt)
    return {
        "attempt_id": attempt.id,
        "score": g.score,
        "max_score": g.max_score,
        "full": g.full,
        "perf": perf,
        "detail": g.detail,
        "reveal": reveal_payload(q),
        "review": card,
        "mastery": changes,
    }


class ReflectionIn(BaseModel):
    error_type: Literal["concept", "method", "calc", "reading", "time", "guess"] | None = None
    note: str = Field(default="", max_length=500)


@router.post("/attempts/{attempt_id}/reflection")
def reflect(attempt_id: int, body: ReflectionIn, session: Session = SessionDep):
    attempt = session.get(Attempt, attempt_id)
    if attempt is None:
        raise HTTPException(404, "作答记录不存在")
    attempt.error_type = body.error_type
    attempt.note = body.note.strip()
    session.add(attempt)
    card = session.get(ReviewCard, attempt.question_id)
    if card is not None and body.error_type:
        card.last_error_type = body.error_type
        session.add(card)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 错题本 / 今日 / 看板

@router.get("/review")
def list_review(request: Request, scope: Literal["due", "active", "graduated", "all"] = "active",
                session: Session = SessionDep):
    now = now_of(request)
    stmt = select(ReviewCard).order_by(ReviewCard.due)
    if scope == "due":
        stmt = stmt.where(ReviewCard.suspended == False, ReviewCard.due <= now)  # noqa: E712
    elif scope == "active":
        stmt = stmt.where(ReviewCard.suspended == False)  # noqa: E712
    elif scope == "graduated":
        stmt = stmt.where(ReviewCard.suspended == True)  # noqa: E712
    cards = session.exec(stmt).all()
    qids = [c.question_id for c in cards]
    questions = {q.id: q for q in session.exec(select(Question).where(Question.id.in_(qids)))}
    links, kps = _links(session, qids), _kp_map(session)
    out = []
    for c in cards:
        q = questions.get(c.question_id)
        if q is None or not q.active:
            continue
        out.append({
            **summary(q, links.get(q.id, {}), kps),
            "due": c.due, "is_due": c.due <= now and not c.suspended, "reps": c.reps, "lapses": c.lapses,
            "graduated": c.suspended,
            "last_error_type": c.last_error_type,
            "last_error_label": ERROR_LABELS.get(c.last_error_type) if c.last_error_type else None,
        })
    return out


@router.get("/today")
def today(request: Request, session: Session = SessionDep):
    plan = build_plan(session, request.app.state.settings, now_of(request))
    qids = [i["question_id"] for i in plan["items"]]
    questions = {q.id: q for q in session.exec(select(Question).where(Question.id.in_(qids)))}
    links, kps = _links(session, qids), _kp_map(session)
    for item in plan["items"]:
        q = questions[item["question_id"]]
        item["question"] = summary(q, links.get(q.id, {}), kps)
    return plan


@router.get("/stats/overview")
def stats_overview(request: Request, session: Session = SessionDep):
    data = stats.overview(session, now_of(request), request.app.state.tz)
    data["bank_errors"] = request.app.state.bank_report.errors
    return data


@router.get("/stats/mastery")
def stats_mastery(request: Request, session: Session = SessionDep):
    return stats.mastery_by_module(session, now_of(request), request.app.state.settings.tau_days)


@router.get("/stats/errors")
def stats_errors(request: Request, days: int = 30, session: Session = SessionDep):
    return stats.error_breakdown(session, now_of(request), days)


@router.get("/export")
def export(session: Session = SessionDep):
    """全部作答数据。题目本身在 YAML 里，不重复导出。"""
    return {
        "attempts": [a.model_dump() for a in session.exec(select(Attempt).order_by(Attempt.id))],
        "mastery": [m.model_dump() for m in session.exec(select(Mastery))],
        "review_cards": [c.model_dump() for c in session.exec(select(ReviewCard))],
    }
