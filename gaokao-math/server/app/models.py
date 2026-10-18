"""数据模型，对应 ARCHITECTURE.md §4。时间一律用带时区的 UTC。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlmodel import JSON, Column, Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class KnowledgePoint(SQLModel, table=True):
    __tablename__ = "knowledge_point"

    id: str = Field(primary_key=True)
    name: str
    module: str = Field(index=True)
    exam_weight: float = 1.0
    prereq: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    methods: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    position: int = 0  # 在图谱文件中的顺序，用于展示
    active: bool = True  # 从图谱删除后置为 False，保留掌握度历史


class Question(SQLModel, table=True):
    id: str = Field(primary_key=True)  # 即 YAML 文件名（不含扩展名）
    type: str = Field(index=True)  # single | multi | fill | solve
    stem: str
    options: dict[str, str] | None = Field(default=None, sa_column=Column(JSON))
    # single: "B"；multi: ["A", "C"]；fill: 字符串；solve: None（各问答案在 parts 里）
    answer: Any = Field(default=None, sa_column=Column(JSON))
    answer_kind: str = "expr"  # 填空题：expr | set | interval | equation
    loose_endpoints: bool = False  # 区间答案是否不区分端点开闭（如单调区间）
    parts: list[dict] | None = Field(default=None, sa_column=Column(JSON))
    solution: str = ""
    hints: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    points: float
    difficulty: float  # IRT 难度 b
    difficulty_label: str
    est_seconds: int
    source: str = ""
    year: int | None = Field(default=None, index=True)  # 真题年份；自编题、变式题为空
    parent_id: str | None = Field(default=None, index=True)  # 变式题指向母题
    figure: str | None = None  # data/figures/ 下的配图文件名
    verified: bool = True
    active: bool = True  # YAML 文件删除后置为 False，保留作答历史
    file: str = ""
    updated_at: datetime = Field(default_factory=utcnow)


class QuestionFlag(SQLModel, table=True):
    """做题时点了「这题有问题」：不再推送，也不进模考，直到取消标记。改 YAML 修好后在题库里取消。"""

    __tablename__ = "question_flag"

    question_id: str = Field(primary_key=True, foreign_key="question.id")
    reason: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class QuestionKp(SQLModel, table=True):
    __tablename__ = "question_kp"

    question_id: str = Field(primary_key=True, foreign_key="question.id")
    kp_id: str = Field(primary_key=True, foreign_key="knowledge_point.id")
    weight: float = 1.0  # 同一道题的权重之和为 1


class Attempt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    question_id: str = Field(index=True, foreign_key="question.id")
    response: dict = Field(default_factory=dict, sa_column=Column(JSON))
    score: float
    max_score: float
    perf: float  # 0–1 表现分，见 core/performance.py
    seconds: int
    hints_used: int = 0
    revealed: bool = False  # 作答前看了答案
    confidence: str = "sure"  # sure | unsure | guess
    error_type: str | None = None  # concept | method | calc | reading | time | guess
    note: str = ""
    exam_id: int | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class Mastery(SQLModel, table=True):
    kp_id: str = Field(primary_key=True, foreign_key="knowledge_point.id")
    theta: float = 0.0
    n_attempts: int = 0
    last_practiced: datetime | None = None


class ReviewCard(SQLModel, table=True):
    __tablename__ = "review_card"

    question_id: str = Field(primary_key=True, foreign_key="question.id")
    fsrs: dict = Field(default_factory=dict, sa_column=Column(JSON))  # fsrs.Card.to_dict()
    due: datetime = Field(index=True)
    reps: int = 0
    lapses: int = 0
    streak: int = 0  # 连续 Good/Easy 次数
    suspended: bool = False  # 已「毕业」
    last_error_type: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Exam(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    status: str = "ongoing"  # ongoing | grading（客观题已交，等解答题自评）| done
    # [{no, type, points, question_id, matched, parts}]
    slots: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    minutes: int = 120
    predicted: float | None = None  # 组卷时的预测分
    score: float | None = None
    responses: dict = Field(default_factory=dict, sa_column=Column(JSON))  # 题号 → 作答与用时
    report: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    finished_at: datetime | None = None


class AiUsage(SQLModel, table=True):
    __tablename__ = "ai_usage"

    day: str = Field(primary_key=True)  # 本地日期 YYYY-MM-DD
    calls: int = 0


class AiCache(SQLModel, table=True):
    __tablename__ = "ai_cache"

    key: str = Field(primary_key=True)  # 请求内容的 sha256
    value: str
    created_at: datetime = Field(default_factory=utcnow)
