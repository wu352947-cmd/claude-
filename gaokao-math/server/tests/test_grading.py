from types import SimpleNamespace

import pytest

from app.core.grading import ParseError, fill_equal, grade, parse_value


@pytest.mark.parametrize("student", [
    r"\frac{\sqrt{3}}{2}", r"\dfrac{\sqrt3}{2}", "√3/2", "sqrt(3)/2", "（√3）/2", r"\frac{1}{2}\sqrt{3}",
    "$\\frac{\\sqrt{3}}{2}$", "x=√3/2",
])
def test_expr_equivalent_forms(student):
    assert fill_equal(student, r"\frac{\sqrt{3}}{2}")


@pytest.mark.parametrize("student", ["0.866", "0.8660254", r"\frac{\sqrt{2}}{2}", "√3", ""])
def test_expr_rejects_approximations_and_wrong_values(student):
    assert not fill_equal(student, r"\frac{\sqrt{3}}{2}")


@pytest.mark.parametrize("student, answer", [
    ("0.5", r"\frac{1}{2}"),
    ("2π/3", r"\frac{2\pi}{3}"),
    ("2pi/3", r"\frac{2\pi}{3}"),
    (r"2\sqrt{2}", r"\sqrt{8}"),
    ("1+i", r"\frac{2i}{1+i}"),
    (r"\log_2 8", "3"),
    ("e^2", r"e^{2}"),
    ("100", "100"),
    ("-1/3", r"-\frac{1}{3}"),
])
def test_expr_equal_misc(student, answer):
    assert fill_equal(student, answer)


def test_expr_with_parameter_is_compared_by_sampling():
    assert fill_equal("(n-1)*2^(n+1)+2", r"n\cdot 2^{n+1}-2^{n+1}+2")
    assert not fill_equal("n*2^(n+1)+2", r"(n-1)\cdot 2^{n+1}+2")


@pytest.mark.parametrize("student", ["√2, -1", "-1或√2", r"a=-1或a=\sqrt{2}", r"\{-1,\sqrt{2}\}", "-1；√2"])
def test_set_order_and_separators(student):
    assert fill_equal(student, r"-1, \sqrt{2}", "set")


@pytest.mark.parametrize("student", ["-1", r"-1, \sqrt{2}, 2", "1, √2"])
def test_set_rejects_missing_or_extra(student):
    assert not fill_equal(student, r"-1, \sqrt{2}", "set")


@pytest.mark.parametrize("student", [r"(2,+\infty)", "(2,+∞)", "（2，+∞）", "(2, oo)"])
def test_interval_forms(student):
    assert fill_equal(student, r"(2,+\infty)", "interval")


def test_interval_endpoints():
    assert not fill_equal("[2,+∞)", r"(2,+\infty)", "interval")
    assert not fill_equal("(1,+∞)", r"(2,+\infty)", "interval")
    assert not fill_equal("(2,+∞]", r"(2,+\infty)", "interval")  # 无穷端点不能闭
    assert fill_equal("[1,+∞)", r"(1,+\infty)", "interval", loose_endpoints=True)


def test_interval_union_order_independent():
    answer = r"(-\infty,0)\cup(2,+\infty)"
    assert fill_equal("(2,+∞)∪(-∞,0)", answer, "interval")
    assert not fill_equal("(-∞,0)", answer, "interval")
    assert fill_equal("R", r"(-\infty,+\infty)", "interval")


@pytest.mark.parametrize("student", ["x-y+1=0", "2x-2y+2=0", "y=x+1", "-x+y-1=0"])
def test_equation_up_to_scaling(student):
    assert fill_equal(student, "x-y+1=0", "equation")


def test_equation_rejects_different_line():
    assert not fill_equal("y=x-1", "x-y+1=0", "equation")
    assert not fill_equal("x-y+1", "x-y+1=0", "equation")


@pytest.mark.parametrize("payload", [
    "__import__('os').system('true')",
    "x.__class__",
    "lambda: 1",
    "open('/etc/passwd')",
    "a" * 300,
])
def test_plain_input_whitelist(payload):
    with pytest.raises(ParseError):
        parse_value(payload)


def _q(**kw):
    base = dict(type="single", points=5.0, answer="B", answer_kind="expr", loose_endpoints=False, parts=None)
    return SimpleNamespace(**{**base, **kw})


def test_single_choice():
    assert grade(_q(), {"choice": "b"}).full
    g = grade(_q(), {"choice": "C"})
    assert g.score == 0 and not g.full


@pytest.mark.parametrize("choices, score", [
    (["A", "C"], 6), (["A"], 3), (["C"], 3), (["A", "B"], 0), ([], 0), (["A", "C", "D"], 0),
])
def test_multi_two_correct(choices, score):
    assert grade(_q(type="multi", points=6.0, answer=["A", "C"]), {"choices": choices}).score == score


@pytest.mark.parametrize("choices, score", [(["A", "B", "D"], 6), (["A", "D"], 4), (["B"], 2), (["A", "C"], 0)])
def test_multi_three_correct(choices, score):
    assert grade(_q(type="multi", points=6.0, answer=["A", "B", "D"]), {"choices": choices}).score == score


def test_fill_grade():
    q = _q(type="fill", answer=r"\frac{4}{5}")
    assert grade(q, {"value": "4/5"}).full
    assert not grade(q, {"value": "  "}).full


def test_solve_self_assessment_is_clamped():
    q = _q(type="solve", points=13.0, parts=[{"label": "(1)", "points": 6}, {"label": "(2)", "points": 7}])
    g = grade(q, {"part_scores": [6, 99]})
    assert g.score == 13 and g.full
    g = grade(q, {"part_scores": [-3, "x"]})
    assert g.score == 0
    assert grade(q, {"part_scores": [6, 4]}).detail["part_scores"] == [6, 4]
