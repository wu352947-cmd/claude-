"""AI 接口。没有配置大模型时返回 503，前端据此隐藏 AI 按钮；超过每日额度返回 429。"""

from __future__ import annotations

import random
import secrets

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from . import images
from .ai import variants
from .ai.llm import LLMError
from .ai.service import AIQuotaExceeded, AIService, AIUnavailable
from .api import SessionDep, create_question_file, get_question_or_404, now_of, sync
from .models import Attempt, KnowledgePoint, Question
from .services import links

router = APIRouter(prefix="/api/ai")

AI_NOTE = "AI 生成，仅供参考"


def service(request: Request, session: Session) -> AIService:
    st = request.app.state
    return AIService(session, st.settings, st.text_llm, st.vision_llm, st.tz, now_of(request))


def guarded(fn):
    try:
        return fn()
    except AIUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except AIQuotaExceeded as exc:
        raise HTTPException(429, str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/status")
def status(request: Request, session: Session = SessionDep):
    st = request.app.state
    return {"text": st.text_llm is not None, "vision": st.vision_llm is not None,
            **service(request, session).usage()}


class HintIn(BaseModel):
    question_id: str
    level: int = Field(ge=1, le=2)
    current_answer: str = Field(default="", max_length=300)


@router.post("/hint")
def hint(body: HintIn, request: Request, session: Session = SessionDep):
    q = get_question_or_404(session, body.question_id)
    text = guarded(lambda: service(request, session).hint(q, body.level, body.current_answer))
    return {"hint": text, "level": body.level, "note": AI_NOTE}


class ExplainIn(BaseModel):
    attempt_id: int


@router.post("/explain")
def explain(body: ExplainIn, request: Request, session: Session = SessionDep):
    attempt = session.get(Attempt, body.attempt_id)
    if attempt is None:
        raise HTTPException(404, "作答记录不存在")
    q = get_question_or_404(session, attempt.question_id)
    data = guarded(lambda: service(request, session).explain(q, attempt.response, attempt.score, attempt.max_score))
    return {**data, "note": AI_NOTE}


class KpSuggestIn(BaseModel):
    stem: str = Field(min_length=1, max_length=4000)


@router.post("/suggest-kps")
def suggest_kps(body: KpSuggestIn, request: Request, session: Session = SessionDep):
    kps = session.exec(select(KnowledgePoint).where(KnowledgePoint.active).order_by(KnowledgePoint.position)).all()
    return {"kps": guarded(lambda: service(request, session).suggest_kps(body.stem, kps))}


class OcrIn(BaseModel):
    image: str


@router.post("/ocr")
def ocr(body: OcrIn, request: Request, session: Session = SessionDep):
    try:
        data, ext = images.decode_data_url(body.image)
    except images.ImageError as exc:
        raise HTTPException(400, str(exc)) from exc
    draft = guarded(lambda: service(request, session).ocr(images.to_data_url(data, ext)))
    return {**draft, "note": "AI 识别，请逐字核对后再保存"}


class VariantIn(BaseModel):
    question_id: str
    count: int = Field(default=2, ge=1, le=3)


@router.post("/variants")
def make_variants(body: VariantIn, request: Request, session: Session = SessionDep):
    q = get_question_or_404(session, body.question_id)
    if q.parent_id:
        raise HTTPException(400, "这道题本身就是变式题，请对母题生成")
    ai = service(request, session)
    original = [str(q.answer)] if q.type == "fill" else None
    result = guarded(lambda: variants.generate(ai, q, body.count, random.Random(), original))
    weights = links(session, [q.id]).get(q.id, {})
    created = []
    for item in result.created:
        qid = f"{q.id}-v{secrets.token_hex(2)}"
        raw = {
            "type": "fill",
            "source": f"变式（AI 生成，程序计算 + 独立求解交叉验证）· 母题：{q.source or q.id}",
            "kps": {k: round(w, 4) for k, w in weights.items()},
            "difficulty_label": q.difficulty_label,
            "stem": item["stem"],
            "answer": item["answer"],
            "answer_kind": item["answer_kind"],
            "solution": item["solution"],
            "parent": q.id,
            "verified": True,
        }
        try:
            create_question_file(request, session, raw, qid, "variants")
        except HTTPException as exc:
            result.rejected.append(f"写入失败：{exc.detail}")
            continue
        created.append(qid)
    if created:
        sync(request, session)
    return {"created": created, "rejected": result.rejected,
            "variants_total": len(session.exec(select(Question.id).where(Question.parent_id == q.id)).all())}
