"""试卷结构（data/exam_blueprint.yaml）：题型默认值 + 每个题位的分值、难度、知识点分布。"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .core.mastery import DIFFICULTY_B


class BlueprintError(ValueError):
    pass


@dataclass
class SlotPart:
    points: float
    difficulty: str

    @property
    def b(self) -> float:
        return DIFFICULTY_B[self.difficulty]


@dataclass
class Slot:
    no: int
    type: str
    points: float
    kps: dict[str, float]  # 归一化后的概率
    parts: list[SlotPart]  # 客观题只有一个「部分」


@dataclass
class Blueprint:
    name: str = "试卷"
    total_points: float = 150
    minutes: int = 120
    type_defaults: dict[str, dict] = field(default_factory=dict)
    slots: list[Slot] = field(default_factory=list)


def load_blueprint(path: Path, kp_ids: set[str] | None = None) -> Blueprint:
    if not path.exists():
        return Blueprint()
    with path.open(encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    bp = Blueprint(
        name=str(raw.get("name", "试卷")),
        total_points=float(raw.get("total_points", 150)),
        minutes=int(raw.get("minutes", 120)),
        type_defaults={s["type"]: {"points": s["points"], "est_seconds": s["est_seconds"]}
                       for s in raw.get("sections", [])},
    )
    seen = set()
    for item in raw.get("slots") or []:
        no = int(item["num"])  # 不用 no 做键名：YAML 会把 no 当成 false
        where = f"试卷结构第 {no} 题"
        if no in seen:
            raise BlueprintError(f"{where}重复")
        seen.add(no)
        if item.get("type") not in ("single", "multi", "fill", "solve"):
            raise BlueprintError(f"{where}的 type 不对")
        points = float(item["points"])
        kps = {str(k): float(v) for k, v in (item.get("kps") or {}).items() if float(v) > 0}
        if not kps:
            raise BlueprintError(f"{where}没有写 kps")
        if kp_ids is not None:
            unknown = [k for k in kps if k not in kp_ids]
            if unknown:
                raise BlueprintError(f"{where}的知识点不在图谱里：{', '.join(unknown)}")
        total = sum(kps.values())
        kps = {k: v / total for k, v in kps.items()}
        if item.get("parts"):
            parts = [SlotPart(float(p["points"]), p.get("difficulty", "中档")) for p in item["parts"]]
            if abs(sum(p.points for p in parts) - points) > 1e-6:
                raise BlueprintError(f"{where}各问分值之和不等于 {points:g}")
        else:
            parts = [SlotPart(points, item.get("difficulty", "中档"))]
        for p in parts:
            if p.difficulty not in DIFFICULTY_B:
                raise BlueprintError(f"{where}的难度必须是 {' / '.join(DIFFICULTY_B)} 之一")
        bp.slots.append(Slot(no=no, type=item["type"], points=points, kps=kps, parts=parts))
    bp.slots.sort(key=lambda s: s.no)
    if bp.slots and abs(sum(s.points for s in bp.slots) - bp.total_points) > 1e-6:
        raise BlueprintError(f"各题位分值之和 {sum(s.points for s in bp.slots):g} 不等于总分 {bp.total_points:g}")
    return bp
