"""模考接口。流程：组卷 → 作答（前端计时）→ 交卷（客观题自动判分）→ 解答题对照答案自评 → 成绩报告。"""

from __future__ import annotations

import random

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .api import SessionDep, current_prediction, now_of, public_question
from .core.exam import build_report, compose
from .models import Attempt, Exam, Question
from .services import kp_map, links, record_attempt, reveal_payload

router = APIRouter(prefix="/api/exams")


def _exam_or_404(session: Session, exam_id: int) -> Exam:
    exam = session.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "模考不存在")
    return exam


def _brief(e: Exam) -> dict:
    return {"id": e.id, "title": e.title, "status": e.status, "created_at": e.created_at, "minutes": e.minutes,
            "score": e.score, "predicted": e.predicted, "finished_at": e.finished_at}


class ExamIn(BaseModel):
    title: str | None = Field(default=None, max_length=60)


@router.post("", status_code=201)
def create_exam(body: ExamIn, request: Request, session: Session = SessionDep):
    bp = request.app.state.blueprint
    if not bp.slots:
        raise HTTPException(400, "试卷结构里没有题位（data/exam_blueprint.yaml 的 slots）")
    now = now_of(request)
    questions = session.exec(select(Question).where(Question.active, Question.verified)).all()
    kps = kp_map(session)
    attempted = set(session.exec(select(Attempt.question_id).distinct()))
    n = len(session.exec(select(Exam.id)).all()) + 1
    slots = compose(bp, questions, links(session), {k: v.module for k, v in kps.items()}, attempted,
                    random.Random(f"{now.isoformat()}-{n}"))
    if not any(s["question_id"] for s in slots):
        raise HTTPException(400, "题库里还没有题，先去录题")
    exam = Exam(title=body.title or f"模考 {n} · {bp.name}", slots=slots, minutes=bp.minutes,
                predicted=current_prediction(request, session)["total"], created_at=now)
    session.add(exam)
    session.commit()
    session.refresh(exam)
    return _brief(exam)


@router.get("")
def list_exams(session: Session = SessionDep):
    return [_brief(e) for e in session.exec(select(Exam).order_by(Exam.created_at.desc()))]


@router.get("/{exam_id}")
def get_exam(exam_id: int, session: Session = SessionDep):
    exam = _exam_or_404(session, exam_id)
    qids = [s["question_id"] for s in exam.slots if s["question_id"]]
    questions = {q.id: q for q in session.exec(select(Question).where(Question.id.in_(qids)))}
    all_links, kps = links(session, qids), kp_map(session)
    slots = []
    for s in exam.slots:
        q = questions.get(s["question_id"]) if s["question_id"] else None
        row = {**s, "question": public_question(q, all_links.get(q.id, {}), kps) if q else None}
        if q and exam.status != "ongoing":
            row["reveal"] = reveal_payload(q)  # 交卷后才能看答案
            row["response"] = exam.responses.get(str(s["no"]))
        slots.append(row)
    return {**_brief(exam), "slots": slots, "report": exam.report or None}


class FinishIn(BaseModel):
    answers: dict[str, dict] = Field(default_factory=dict)  # 题号 → response
    seconds: dict[str, int] = Field(default_factory=dict)  # 题号 → 在这道题上停留的秒数


def _finalize(request: Request, session: Session, exam: Exam) -> None:
    attempts = {a.question_id: a for a in session.exec(select(Attempt).where(Attempt.exam_id == exam.id))}
    qids = [s["question_id"] for s in exam.slots if s["question_id"]]
    questions = {q.id: q for q in session.exec(select(Question).where(Question.id.in_(qids)))}
    kps = kp_map(session)
    report = build_report(exam, attempts, questions, links(session, qids), kps, {k: v.module for k, v in kps.items()})
    exam.report = report
    exam.score = report["total"]
    exam.status = "done"
    exam.finished_at = now_of(request)
    session.add(exam)


@router.post("/{exam_id}/finish")
def finish_exam(exam_id: int, body: FinishIn, request: Request, session: Session = SessionDep):
    """交卷：客观题当场判分；有解答题时进入自评阶段。"""
    exam = _exam_or_404(session, exam_id)
    if exam.status != "ongoing":
        raise HTTPException(409, "这场模考已经交卷了")
    now = now_of(request)
    responses = {}
    has_solve = False
    for s in exam.slots:
        key = str(s["no"])
        seconds = max(0, min(int(body.seconds.get(key, 0)), 6 * 3600))
        response = body.answers.get(key) or {}
        responses[key] = {"response": response, "seconds": seconds}
        if not s["question_id"]:
            continue
        if s["type"] == "solve":
            has_solve = True
            continue
        q = session.get(Question, s["question_id"])
        if q is not None:
            record_attempt(session, request.app.state, q, response, seconds=seconds, now=now, exam_id=exam.id)
    exam.responses = responses
    if has_solve:
        exam.status = "grading"
    else:
        _finalize(request, session, exam)
    session.add(exam)
    session.commit()
    return get_exam(exam_id, session)


class GradeIn(BaseModel):
    part_scores: dict[str, list[float]] = Field(default_factory=dict)  # 题号 → 各问得分


@router.post("/{exam_id}/grade")
def grade_exam(exam_id: int, body: GradeIn, request: Request, session: Session = SessionDep):
    """解答题自评完成，生成成绩报告。"""
    exam = _exam_or_404(session, exam_id)
    if exam.status != "grading":
        raise HTTPException(409, "现在不是自评阶段")
    now = now_of(request)
    for s in exam.slots:
        if s["type"] != "solve" or not s["question_id"]:
            continue
        q = session.get(Question, s["question_id"])
        if q is None:
            continue
        key = str(s["no"])
        response = {"part_scores": body.part_scores.get(key, [])}
        seconds = exam.responses.get(key, {}).get("seconds", 0)
        record_attempt(session, request.app.state, q, response, seconds=seconds, revealed=True, now=now,
                       exam_id=exam.id)
        exam.responses = {**exam.responses, key: {"response": response, "seconds": seconds}}
    _finalize(request, session, exam)
    session.commit()
    return get_exam(exam_id, session)


@router.delete("/{exam_id}")
def abandon_exam(exam_id: int, session: Session = SessionDep):
    """放弃一场还没交卷的模考（不留任何作答记录）。"""
    exam = _exam_or_404(session, exam_id)
    if exam.status != "ongoing":
        raise HTTPException(409, "已经交卷的模考不能删除")
    session.delete(exam)
    session.commit()
    return {"ok": True}
