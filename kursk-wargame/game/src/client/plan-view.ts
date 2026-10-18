/** 作战计划的地图图层：轴线（带箭头）、路点和类型标签。画草稿时也用它。 */
import { Container, Graphics, Text } from 'pixi.js';
import { AXIS_NAMES, type Axis, type AxisKind, type GameMap, hexCenter, parseHexId } from '../engine';
import { PX_PER_KM } from './style';

export const AXIS_COLORS: Record<AxisKind, number> = { main: 0xd9442f, support: 0xe69a2e, fix: 0x5b8fb9, flank: 0x8e5bb5, reserve: 0x5a9a5a };
const K = PX_PER_KM;

export interface PlanView {
  root: Container;
  /** draft = 正在画的路点（不属于任何已定轴线） */
  show(axes: readonly Axis[], draft?: { kind: AxisKind; path: readonly string[] } | null): void;
}

export function createPlanView(map: GameMap): PlanView {
  const root = new Container();
  const g = new Graphics();
  const labels = new Container();
  root.addChild(g, labels);
  const pt = (id: string): { x: number; y: number } => { const c = hexCenter(map.grid, parseHexId(id)); return { x: c.x * K, y: c.y * K }; };

  function line(kind: AxisKind, path: readonly string[], label: string, dashed: boolean): void {
    const color = AXIS_COLORS[kind];
    const pts = path.map(pt);
    if (pts.length > 1) {
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: 9, color, alpha: dashed ? 0.55 : 0.85, cap: 'round', join: 'round' });
      // 箭头
      const a = pts.at(-2)!, b = pts.at(-1)!;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), L = 42;
      g.poly([b.x, b.y, b.x - L * Math.cos(ang - 0.45), b.y - L * Math.sin(ang - 0.45), b.x - L * Math.cos(ang + 0.45), b.y - L * Math.sin(ang + 0.45)]).fill({ color, alpha: 0.95 });
    }
    for (const p of pts) g.circle(p.x, p.y, 9).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: 2, color });
    const t = new Text({ text: label, style: { fontSize: 34, fill: 0xffffff, fontWeight: '700', stroke: { color, width: 7 } } });
    t.position.set(pts[0]!.x + 8, pts[0]!.y - 46);
    labels.addChild(t);
  }

  return {
    root,
    show(axes, draft) {
      g.clear();
      for (const ch of labels.removeChildren()) ch.destroy();
      for (const a of axes) line(a.kind, a.path, AXIS_NAMES[a.kind], false);
      if (draft && draft.path.length) line(draft.kind, draft.path, `${AXIS_NAMES[draft.kind]}（画线中）`, true);
    },
  };
}
