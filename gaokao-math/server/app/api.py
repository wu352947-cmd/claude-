from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from . import bank, images
from .core import stats
from .core.predict import predict_score
from .core.today import ERROR_LABELS, build_plan, flagged_ids
from .models import Attempt, KnowledgePoint, Mastery, Question, QuestionFlag, ReviewCard
from .services import kp_map, links, record_attempt, reveal_payload, review_target

router = APIRouter(prefix="/api")


def get_session(request: Request):
    with Session(request.app.state.engine) as session:
        yield session


def now_of(request: Request) -> datetime:
    return request.app.state.clock()


SessionDep = Depends(get_session)


# ---------------------------------------------------------------- 序列化

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
        "year": q.year,
        "difficulty_label": q.difficulty_label,
        "points": q.points,
        "preview": _preview(q.stem),
        "is_variant": bool(q.parent_id),
        "kps": [{"id": k, "name": kps[k].name, "module": kps[k].module} for k in weights if k in kps],
    }


def public_question(q: Question, weights: dict[str, float], kps: dict[str, KnowledgePoint]) -> dict:
    """作答前可见的内容：不含答案、解答和提示正文。"""
    return {
        **summary(q, weights, kps),
        "stem": q.stem,
        "figure": f"/api/figures/{q.figure}" if q.figure else None,
        "options": q.options,
        "answer_kind": q.answer_kind if q.type == "fill" else None,
        "parts": [{"label": p["label"], "points": p["points"]} for p in q.parts or []],
        "hints_total": len(q.hints),
        "est_seconds": q.est_seconds,
        "parent_id": q.parent_id,
    }


def get_question_or_404(session: Session, qid: str) -> Question:
    q = session.get(Question, qid)
    if q is None:
        raise HTTPException(404, "题目不存在")
    return q


def sync(request: Request, session: Session):
    settings = request.app.state.settings
    request.app.state.bank_report = bank.sync_bank(session, settings.data_dir, settings.type_defaults)
    return request.app.state.bank_report


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
    return sync(request, session)


@router.get("/kps")
def list_kps(session: Session = SessionDep):
    stmt = select(KnowledgePoint).where(KnowledgePoint.active).order_by(KnowledgePoint.position)
    return [{"id": k.id, "name": k.name, "module": k.module, "exam_weight": k.exam_weight}
            for k in session.exec(stmt)]


@router.get("/questions")
def list_questions(module: str | None = None, type: str | None = None, kp: str | None = None,
                   q: str | None = None, session: Session = SessionDep):
    kps = kp_map(session)
    questions = session.exec(select(Question).where(Question.active).order_by(Question.id)).all()
    all_links = links(session)
    counts = dict(session.exec(select(Attempt.question_id, func.count()).group_by(Attempt.question_id)).all())
    cards = {c.question_id: c for c in session.exec(select(ReviewCard))}
    flagged = flagged_ids(session)
    variant_counts: dict[str, int] = {}
    for item in questions:
        if item.parent_id:
            variant_counts[item.parent_id] = variant_counts.get(item.parent_id, 0) + 1
    out = []
    for item in questions:
        weights = all_links.get(item.id, {})
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
            "variants": variant_counts.get(item.id, 0),
            "flagged": item.id in flagged,
        })
    return out


@router.get("/questions/{qid}")
def get_question(qid: str, session: Session = SessionDep):
    q = get_question_or_404(session, qid)
    data = public_question(q, links(session, [qid]).get(qid, {}), kp_map(session))
    history = session.exec(select(Attempt).where(Attempt.question_id == qid).order_by(Attempt.created_at)).all()
    card = session.get(ReviewCard, qid)
    data["history"] = [{"created_at": a.created_at, "score": a.score, "max_score": a.max_score,
                        "seconds": a.seconds, "error_type": a.error_type, "note": a.note} for a in history]
    data["card"] = None if card is None else {
        "due": card.due, "reps": card.reps, "lapses": card.lapses, "graduated": card.suspended}
    data["file"] = q.file
    flag = session.get(QuestionFlag, qid)
    data["flag"] = None if flag is None else {"reason": flag.reason, "created_at": flag.created_at}
    return data


class FlagIn(BaseModel):
    reason: str = Field(default="", max_length=200)


@router.post("/questions/{qid}/flag")
def flag_question(qid: str, body: FlagIn, session: Session = SessionDep):
    """题目有错（乱码、答案不对、缺图……）：不再推送、不进模考，等改好 YAML 再取消。"""
    get_question_or_404(session, qid)
    session.merge(QuestionFlag(question_id=qid, reason=body.reason.strip()))
    session.commit()
    return {"ok": True}


@router.delete("/questions/{qid}/flag")
def unflag_question(qid: str, session: Session = SessionDep):
    flag = session.get(QuestionFlag, qid)
    if flag is not None:
        session.delete(flag)
        session.commit()
    return {"ok": True}


@router.get("/questions/{qid}/hints/{n}")
def get_hint(qid: str, n: int, session: Session = SessionDep):
    q = get_question_or_404(session, qid)
    if not 1 <= n <= len(q.hints):
        raise HTTPException(404, "没有这一级提示")
    return {"level": n, "total": len(q.hints), "hint": q.hints[n - 1]}


@router.post("/questions/{qid}/reveal")
def reveal(qid: str, session: Session = SessionDep):
    return reveal_payload(get_question_or_404(session, qid))


class QuestionIn(BaseModel):
    type: Literal["single", "multi", "fill", "solve"]
    stem: str
    kps: list[str]
    source: str = ""
    difficulty_label: str = "中档"
    est_seconds: int | None = None
    figure: str | None = None
    options: dict[str, str] | None = None
    answer: Any = None
    answer_kind: str | None = None
    loose_endpoints: bool | None = None
    parts: list[dict] | None = None
    hints: list[str] = Field(default_factory=list)
    solution: str = ""


def create_question_file(request: Request, session: Session, raw: dict, qid: str, subdir: str) -> str:
    settings = request.app.state.settings
    kp_ids = {k.id for k in session.exec(select(KnowledgePoint).where(KnowledgePoint.active))}
    try:
        bank.normalize_question(raw, qid, kp_ids, settings.type_defaults, settings.data_dir / "figures")
        path = bank.write_question_file(settings.data_dir, qid, raw, subdir)
    except bank.BankError as exc:
        raise HTTPException(400, str(exc)) from exc
    return path.relative_to(settings.data_dir).as_posix()


@router.post("/questions", status_code=201)
def create_question(body: QuestionIn, request: Request, session: Session = SessionDep):
    now = now_of(request)
    raw = body.model_dump(exclude_none=True)
    if raw.get("type") != "fill":
        raw.pop("answer_kind", None)
        raw.pop("loose_endpoints", None)
    qid = f"u{now:%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"
    file = create_question_file(request, session, raw, qid, "inbox")
    sync(request, session)
    return {"id": qid, "file": file}


# ---------------------------------------------------------------- 配图

class ImageIn(BaseModel):
    image: str  # data:image/...;base64,...


@router.post("/figures", status_code=201)
def upload_figure(body: ImageIn, request: Request):
    try:
        data, ext = images.decode_data_url(body.image)
    except images.ImageError as exc:
        raise HTTPException(400, str(exc)) from exc
    name = images.save_figure(request.app.state.settings.data_dir / "figures", data, ext)
    return {"name": name, "url": f"/api/figures/{name}"}


@router.get("/figures/{name}")
def get_figure(name: str, request: Request):
    if not images.FIGURE_NAME.match(name):
        raise HTTPException(404, "没有这张图")
    path = request.app.state.settings.data_dir / "figures" / name
    if not path.is_file():
        raise HTTPException(404, "没有这张图")
    return FileResponse(path, media_type=images.MEDIA_TYPES[name.rsplit(".", 1)[1]],
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------------------------------------------------------------- 作答

class AttemptIn(BaseModel):
    question_id: str
    response: dict = Field(default_factory=dict)  # {"choice"} | {"choices"} | {"value"} | {"part_scores"}
    seconds: int = Field(ge=0, le=6 * 3600)
    hints_used: int = Field(default=0, ge=0)
    revealed: bool = False
    confidence: Literal["sure", "unsure", "guess"] = "sure"
    answered_at: datetime | None = None  # 离线作答时在手机上记录的时间


def _answered_at(body: AttemptIn, now: datetime) -> datetime:
    t = body.answered_at
    if t is None:
        return now
    if t.tzinfo is None:
        t = t.replace(tzinfo=now.tzinfo)
    return t if now - timedelta(days=30) <= t <= now else now


@router.post("/attempts", status_code=201)
def submit_attempt(body: AttemptIn, request: Request, session: Session = SessionDep):
    q = get_question_or_404(session, body.question_id)
    result = record_attempt(session, request.app.state, q, body.response, seconds=body.seconds,
                            hints_used=body.hints_used, revealed=body.revealed, confidence=body.confidence,
                            now=_answered_at(body, now_of(request)))
    session.commit()
    return result


class BatchIn(BaseModel):
    attempts: list[AttemptIn] = Field(max_length=500)


@router.post("/attempts/batch")
def submit_batch(body: BatchIn, request: Request, session: Session = SessionDep):
    """离线时攒下的作答，联网后一次性同步。按作答时间顺序处理；题目不存在的跳过。"""
    now = now_of(request)
    results, skipped = [], []
    for item in sorted(body.attempts, key=lambda a: _answered_at(a, now)):
        q = session.get(Question, item.question_id)
        if q is None:
            skipped.append(item.question_id)
            continue
        r = record_attempt(session, request.app.state, q, item.response, seconds=item.seconds,
                           hints_used=item.hints_used, revealed=item.revealed, confidence=item.confidence,
                           now=_answered_at(item, now))
        results.append({k: r[k] for k in ("attempt_id", "question_id", "score", "max_score", "full")})
    session.commit()
    return {"results": results, "skipped": skipped}


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
    q = session.get(Question, attempt.question_id)
    card = session.get(ReviewCard, review_target(session, q) if q else attempt.question_id)
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
    all_links, kps = links(session, qids), kp_map(session)
    out = []
    for c in cards:
        q = questions.get(c.question_id)
        if q is None or not q.active:
            continue
        out.append({
            **summary(q, all_links.get(q.id, {}), kps),
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
    all_links, kps = links(session, qids), kp_map(session)
    for item in plan["items"]:
        q = questions[item["question_id"]]
        item["question"] = summary(q, all_links.get(q.id, {}), kps)
    return plan


@router.get("/stats/overview")
def stats_overview(request: Request, session: Session = SessionDep):
    data = stats.overview(session, now_of(request), request.app.state.tz)
    data["bank_errors"] = request.app.state.bank_report.errors
    data["blueprint"] = request.app.state.blueprint.name
    return data


@router.get("/stats/mastery")
def stats_mastery(request: Request, session: Session = SessionDep):
    return stats.mastery_by_module(session, now_of(request), request.app.state.settings.tau_days)


@router.get("/stats/errors")
def stats_errors(request: Request, days: int = 30, session: Session = SessionDep):
    return stats.error_breakdown(session, now_of(request), days)


@router.get("/stats/trend")
def stats_trend(request: Request, days: int = 30, session: Session = SessionDep):
    return stats.trend(session, now_of(request), request.app.state.tz, min(max(days, 7), 120))


@router.get("/stats/multi")
def stats_multi(request: Request, session: Session = SessionDep):
    return stats.multi_analysis(session, now_of(request))


def current_prediction(request: Request, session: Session) -> dict:
    settings = request.app.state.settings
    masteries = {m.kp_id: m for m in session.exec(select(Mastery))}
    names = {k.id: k.name for k in session.exec(select(KnowledgePoint).where(KnowledgePoint.active))}
    return predict_score(request.app.state.blueprint, masteries, names, now_of(request),
                         tau_days=settings.tau_days, hour_gain=settings.hour_gain)


@router.get("/stats/prediction")
def stats_prediction(request: Request, session: Session = SessionDep):
    data = current_prediction(request, session)
    data["blueprint"] = request.app.state.blueprint.name
    data["practiced_kps"] = session.exec(select(func.count()).select_from(Mastery)
                                         .where(Mastery.n_attempts > 0)).one()
    data["exams"] = stats.exam_history(session)
    return data


@router.get("/export")
def export(session: Session = SessionDep):
    """全部作答数据。题目本身在 YAML 里，不重复导出。"""
    from .models import Exam

    return {
        "attempts": [a.model_dump() for a in session.exec(select(Attempt).order_by(Attempt.id))],
        "mastery": [m.model_dump() for m in session.exec(select(Mastery))],
        "review_cards": [c.model_dump() for c in session.exec(select(ReviewCard))],
        "exams": [e.model_dump() for e in session.exec(select(Exam).order_by(Exam.id))],
    }
