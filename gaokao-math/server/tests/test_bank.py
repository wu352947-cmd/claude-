import pytest
import yaml

from app.bank import BankError, iter_question_files, load_knowledge_graph, normalize_question, write_question_file
from app.config import load_settings
from app.core.grading import fill_equal

from .conftest import DATA_DIR

KG = load_knowledge_graph(DATA_DIR / "knowledge_graph.yaml")
KP_IDS = {k["id"] for k in KG}
DEFAULTS = load_settings(data_dir=DATA_DIR).type_defaults


def test_knowledge_graph_weights_roughly_one_paper():
    total = sum(k["exam_weight"] for k in KG)
    assert 130 <= total <= 170, total


@pytest.mark.parametrize("path", iter_question_files(DATA_DIR / "questions"), ids=lambda p: p.stem)
def test_every_question_file_is_valid(path):
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    q = normalize_question(raw, path.stem, KP_IDS, DEFAULTS)
    if q["type"] == "fill":
        assert fill_equal(q["answer"], q["answer"], q["answer_kind"], q["loose_endpoints"])
    assert abs(sum(q["kps"].values()) - 1) < 1e-9


def test_kg_rejects_cycles(tmp_path):
    p = tmp_path / "kg.yaml"
    p.write_text(yaml.safe_dump([
        {"id": "a", "name": "A", "module": "M", "prereq": ["b"]},
        {"id": "b", "name": "B", "module": "M", "prereq": ["a"]},
    ]), encoding="utf-8")
    with pytest.raises(BankError, match="环"):
        load_knowledge_graph(p)


def test_kg_rejects_unknown_prereq(tmp_path):
    p = tmp_path / "kg.yaml"
    p.write_text(yaml.safe_dump([{"id": "a", "name": "A", "module": "M", "prereq": ["zz"]}]), encoding="utf-8")
    with pytest.raises(BankError, match="zz"):
        load_knowledge_graph(p)


BASE = {"type": "single", "stem": "1+1=", "kps": ["set.operations"], "options": {"A": "1", "B": "2"}, "answer": "B"}


@pytest.mark.parametrize("patch, message", [
    ({"kps": ["nope"]}, "不在图谱"),
    ({"kps": []}, "至少"),
    ({"answer": "C"}, "不在选项"),
    ({"type": "essay"}, "type"),
    ({"stem": ""}, "题干"),
    ({"difficulty_label": "超难"}, "difficulty_label"),
    ({"type": "multi", "answer": ["A", "Z"]}, "多选"),
    ({"type": "fill", "answer": "@@"}, "无法被程序识别"),
    ({"type": "fill", "answer": "1", "answer_kind": "matrix"}, "answer_kind"),
    ({"type": "solve", "parts": [{"points": 0}], "solution": "x"}, "分值"),
    ({"type": "solve", "parts": [{"points": 6}]}, "solution"),
])
def test_invalid_questions(patch, message):
    with pytest.raises(BankError, match=message):
        normalize_question({**BASE, **patch}, "q1", KP_IDS, DEFAULTS)


def test_defaults_from_blueprint():
    q = normalize_question(BASE, "q1", KP_IDS, DEFAULTS)
    assert q["points"] == 5 and q["est_seconds"] == 150 and q["difficulty"] == 0.0
    q = normalize_question({**BASE, "type": "multi", "answer": "AB"}, "q2", KP_IDS, DEFAULTS)
    assert q["answer"] == ["A", "B"] and q["points"] == 6


def test_written_file_round_trips(tmp_path):
    raw = {"type": "fill", "stem": "第一行\n$\\frac{1}{2}$", "kps": ["set.operations"], "answer": r"\frac{1}{2}",
           "solution": "略"}
    path = write_question_file(tmp_path, "u1", raw)
    text = path.read_text(encoding="utf-8")
    assert "stem: |" in text  # 多行用块样式，方便手改
    assert normalize_question(yaml.safe_load(text), "u1", KP_IDS, DEFAULTS)["answer"] == r"\frac{1}{2}"
    with pytest.raises(BankError):
        write_question_file(tmp_path, "u1", raw)
