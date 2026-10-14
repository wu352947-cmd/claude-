"""题库与知识点图谱：YAML 是唯一的数据源，启动时同步进数据库。

- data/knowledge_graph.yaml  知识点图谱
- data/questions/**/*.yaml   每个文件一道题，文件名即题目 id

单个题目文件有错误时跳过并报告，不影响其它题；图谱有错误时直接报错。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from sqlmodel import Session, delete, select

from .core.grading import FILL_KINDS, ParseError, parse_answer
from .core.mastery import DIFFICULTY_B
from .images import FIGURE_NAME
from .models import KnowledgePoint, Question, QuestionKp, utcnow

TYPES = ("single", "multi", "fill", "solve")
FALLBACK_DEFAULTS = {
    "single": {"points": 5, "est_seconds": 150},
    "multi": {"points": 6, "est_seconds": 240},
    "fill": {"points": 5, "est_seconds": 240},
    "solve": {"points": 15, "est_seconds": 900},
}
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-]*$")


class BankError(ValueError):
    pass


@dataclass
class SyncReport:
    knowledge_points: int = 0
    questions: int = 0
    deactivated: int = 0
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- 知识点图谱

def load_knowledge_graph(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        raw = yaml.safe_load(f) or []
    kps: list[dict] = []
    seen: set[str] = set()
    for i, item in enumerate(raw):
        for key in ("id", "name", "module"):
            if not item.get(key):
                raise BankError(f"知识点图谱第 {i + 1} 项缺少 {key}")
        if item["id"] in seen:
            raise BankError(f"知识点 id 重复：{item['id']}")
        seen.add(item["id"])
        kps.append({
            "id": item["id"],
            "name": item["name"],
            "module": item["module"],
            "exam_weight": float(item.get("exam_weight", 1.0)),
            "prereq": list(item.get("prereq") or []),
            "methods": list(item.get("methods") or []),
            "position": i,
        })
    by_id = {k["id"]: k for k in kps}
    for k in kps:
        for p in k["prereq"]:
            if p not in by_id:
                raise BankError(f"知识点 {k['id']} 的前置 {p} 不存在")
    _check_acyclic(by_id)
    return kps


def _check_acyclic(by_id: dict[str, dict]) -> None:
    state: dict[str, int] = {}  # 1 = 访问中, 2 = 已完成

    def visit(k: str, path: list[str]) -> None:
        if state.get(k) == 2:
            return
        if state.get(k) == 1:
            raise BankError("知识点前置关系有环：" + " → ".join(path + [k]))
        state[k] = 1
        for p in by_id[k]["prereq"]:
            visit(p, path + [k])
        state[k] = 2

    for k in by_id:
        visit(k, [])


# ---------------------------------------------------------------- 题目

def normalize_question(raw: dict, qid: str, kp_ids: set[str], defaults: dict | None = None,
                       figures_dir: Path | None = None) -> dict:
    """校验一道题并补全默认值，返回 Question 字段 + kps 权重。出错抛 BankError。"""
    defaults = {**FALLBACK_DEFAULTS, **(defaults or {})}

    def fail(msg: str):
        raise BankError(f"{qid}：{msg}")

    if not isinstance(raw, dict):
        fail("文件内容不是一个对象")
    if not ID_PATTERN.match(qid):
        fail("文件名只能包含字母、数字、- 和 _")
    qtype = raw.get("type")
    if qtype not in TYPES:
        fail(f"type 必须是 {' / '.join(TYPES)} 之一")
    stem = str(raw.get("stem") or "").strip()
    if not stem:
        fail("缺少题干 stem")

    kps = raw.get("kps") or []
    if isinstance(kps, list):
        kps = {k: 1.0 for k in kps}
    if not isinstance(kps, dict) or not kps:
        fail("至少要标注一个知识点 kps")
    for k, w in kps.items():
        if k not in kp_ids:
            fail(f"知识点 {k} 不在图谱里")
        if not isinstance(w, (int, float)) or w <= 0:
            fail(f"知识点 {k} 的权重必须是正数")
    total_w = sum(kps.values())
    kps = {k: w / total_w for k, w in kps.items()}

    label = raw.get("difficulty_label", "中档")
    if label not in DIFFICULTY_B:
        fail(f"difficulty_label 必须是 {' / '.join(DIFFICULTY_B)} 之一")
    difficulty = float(raw.get("difficulty", DIFFICULTY_B[label]))

    out = {
        "id": qid,
        "type": qtype,
        "stem": stem,
        "options": None,
        "answer": None,
        "answer_kind": "expr",
        "loose_endpoints": bool(raw.get("loose_endpoints", False)),
        "parts": None,
        "solution": str(raw.get("solution") or "").strip(),
        "hints": [str(h).strip() for h in raw.get("hints") or [] if str(h).strip()],
        "difficulty": difficulty,
        "difficulty_label": label,
        "est_seconds": int(raw.get("est_seconds") or defaults[qtype]["est_seconds"]),
        "source": str(raw.get("source") or ""),
        "year": None,
        "parent_id": raw.get("parent"),
        "figure": raw.get("figure"),
        "verified": bool(raw.get("verified", True)),
        "kps": kps,
    }

    if raw.get("year") is not None:
        try:
            out["year"] = int(raw["year"])
        except (TypeError, ValueError):
            fail("year 必须是年份数字，如 2024")

    if out["figure"] is not None:
        if not FIGURE_NAME.match(str(out["figure"])):
            fail("figure 文件名格式不对（应由录题页面上传生成）")
        if figures_dir is not None and not (figures_dir / out["figure"]).exists():
            fail(f"配图 {out['figure']} 不在 data/figures/ 里")

    if qtype in ("single", "multi"):
        options = raw.get("options")
        if not isinstance(options, dict) or len(options) < 2:
            fail("选择题需要 options，形如 {A: ..., B: ...}")
        options = {str(k).strip().upper(): str(v) for k, v in options.items()}
        out["options"] = options
        answer = raw.get("answer")
        if qtype == "single":
            answer = str(answer or "").strip().upper()
            if answer not in options:
                fail(f"单选题答案 {answer!r} 不在选项里")
        else:
            if isinstance(answer, str):
                answer = list(answer.replace(",", "").replace(" ", ""))
            answer = sorted({str(a).strip().upper() for a in answer or []})
            if not answer or any(a not in options for a in answer):
                fail("多选题答案必须是选项字母的列表，如 [A, C]")
        out["answer"] = answer
        out["points"] = float(raw.get("points") or defaults[qtype]["points"])

    elif qtype == "fill":
        kind = raw.get("answer_kind", "expr")
        if kind not in FILL_KINDS:
            fail(f"answer_kind 必须是 {' / '.join(FILL_KINDS)} 之一")
        answer = raw.get("answer")
        if answer is None or str(answer).strip() == "":
            fail("填空题缺少答案 answer")
        answer = str(answer).strip()
        try:
            parse_answer(answer, kind)
        except ParseError as exc:
            fail(f"答案无法被程序识别（{exc}），请检查 LaTeX 写法或 answer_kind")
        out["answer"] = answer
        out["answer_kind"] = kind
        out["points"] = float(raw.get("points") or defaults[qtype]["points"])

    else:  # solve
        parts = raw.get("parts")
        if not isinstance(parts, list) or not parts:
            fail("解答题需要 parts，列出每一问的分值")
        norm_parts = []
        for i, p in enumerate(parts):
            if not isinstance(p, dict) or not isinstance(p.get("points"), (int, float)) or p["points"] <= 0:
                fail(f"第 {i + 1} 问缺少正数分值 points")
            norm_parts.append({
                "label": str(p.get("label") or f"({i + 1})"),
                "points": float(p["points"]),
                "answer": str(p.get("answer") or ""),
                "rubric": [str(r) for r in p.get("rubric") or []],
            })
        out["parts"] = norm_parts
        out["points"] = float(sum(p["points"] for p in norm_parts))
        if not out["solution"]:
            fail("解答题需要标准解答 solution，自评时要对照")
    return out


def iter_question_files(questions_dir: Path) -> list[Path]:
    if not questions_dir.exists():
        return []
    return sorted(p for p in questions_dir.rglob("*.yaml") if p.is_file())


def sync_bank(session: Session, data_dir: Path, defaults: dict | None = None) -> SyncReport:
    report = SyncReport()
    kps = load_knowledge_graph(data_dir / "knowledge_graph.yaml")
    kp_ids = {k["id"] for k in kps}
    for k in kps:
        session.merge(KnowledgePoint(**k, active=True))
    for old in session.exec(select(KnowledgePoint).where(KnowledgePoint.id.not_in(kp_ids))):
        old.active = False
        session.add(old)
    report.knowledge_points = len(kps)

    seen: dict[str, Path] = {}
    now = utcnow()
    for path in iter_question_files(data_dir / "questions"):
        qid = path.stem
        rel = path.relative_to(data_dir).as_posix()
        if qid in seen:
            report.errors.append(f"{qid}：文件名重复（{seen[qid].relative_to(data_dir)} 和 {rel}）")
            continue
        try:
            with path.open(encoding="utf-8") as f:
                raw = yaml.safe_load(f)
            data = normalize_question(raw, qid, kp_ids, defaults, data_dir / "figures")
        except yaml.YAMLError as exc:
            report.errors.append(f"{qid}：YAML 格式错误（{exc.__class__.__name__}）")
            continue
        except BankError as exc:
            report.errors.append(str(exc))
            continue
        seen[qid] = path
        weights = data.pop("kps")
        session.merge(Question(**data, active=True, file=rel, updated_at=now))
        session.exec(delete(QuestionKp).where(QuestionKp.question_id == qid))
        for k, w in weights.items():
            session.add(QuestionKp(question_id=qid, kp_id=k, weight=w))
        report.questions += 1

    for old in session.exec(select(Question).where(Question.id.not_in(list(seen)), Question.active)):
        old.active = False
        session.add(old)
        report.deactivated += 1
    session.commit()
    return report


# ---------------------------------------------------------------- 写入新题

class _BlockDumper(yaml.SafeDumper):
    pass


def _str_representer(dumper, value: str):
    if "\n" in value:
        return dumper.represent_scalar("tag:yaml.org,2002:str", value, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", value)


_BlockDumper.add_representer(str, _str_representer)

FIELD_ORDER = ("type", "source", "year", "kps", "difficulty_label", "est_seconds", "points", "stem", "figure", "options",
               "answer", "answer_kind", "loose_endpoints", "parts", "hints", "solution", "parent", "verified")


def write_question_file(data_dir: Path, qid: str, raw: dict, subdir: str = "inbox") -> Path:
    """把录入的题写成 YAML（调用前须已通过 normalize_question 校验）。"""
    target_dir = data_dir / "questions" / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{qid}.yaml"
    if path.exists():
        raise BankError(f"{qid}：文件已存在")
    ordered = {k: raw[k] for k in FIELD_ORDER if raw.get(k) not in (None, "", [], {})}
    with path.open("w", encoding="utf-8") as f:
        yaml.dump(ordered, f, Dumper=_BlockDumper, allow_unicode=True, sort_keys=False, width=1000)
    return path
