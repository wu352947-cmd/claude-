/**
 * 作战计划（docs/15 §7）：玩家为本方画几条进攻轴线——主攻、助攻、牵制、迂回、预备队——并指派给某个编制。
 * 计划不强制任何行动。只有"主攻"有效果：它在**前一回合或更早**定下，指派的编制（含下级）沿着轴线（走廊）打出的进攻赔率列右移。
 * 其他类型目前只是给自己看的标记。计划只给本方看（热座时对方看不到）。
 */
import { z } from 'zod';
import { type Offset, axialToOffset, distance, hexId, inBounds, offsetToAxial, parseHexId } from './hex';
import { chainOf } from './command-chain';
import type { GameContext, GameState } from './game';
import type { Side } from './units';

export const AxisKind = z.enum(['main', 'support', 'fix', 'flank', 'reserve']);
export type AxisKind = z.infer<typeof AxisKind>;
export const AXIS_NAMES: Record<AxisKind, string> = { main: '主攻', support: '助攻', fix: '牵制', flank: '迂回', reserve: '预备队' };

export const PlanRules = z.object({
  $comment: z.string().optional(),
  /** 主攻走廊内进攻的赔率列偏移 */
  mainShift: z.number().int(),
  /** 走廊宽度：离轴线几格以内算走廊 */
  corridorRadius: z.number().int().nonnegative(),
  /** 每方最多几条轴线 */
  maxAxes: z.number().int().positive(),
});
export type PlanRules = z.infer<typeof PlanRules>;

export interface Axis { id: string; side: Side; kind: AxisKind; formation: string | null; path: string[]; turn: number }

/** 两格之间的直线经过的格子（含两端） */
export function lineHexes(a: Offset, b: Offset): Offset[] {
  const A = offsetToAxial(a), B = offsetToAxial(b);
  const n = distance(a, b);
  const out: Offset[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    // 立方坐标线性插值再取整
    const x = A.q + (B.q - A.q) * t, z = A.r + (B.r - A.r) * t, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    out.push(axialToOffset({ q: rx, r: rz }));
  }
  return out;
}

/** 轴线经过的所有格子 */
export function axisLine(path: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < path.length; i++) for (const h of lineHexes(parseHexId(path[i]!), parseHexId(path[i + 1]!))) if (!out.includes(hexId(h))) out.push(hexId(h));
  return out;
}

export interface PlanInput { id?: string; kind: AxisKind; formation: string | null; path: string[] }

export function whyCannotPlan(ctx: GameContext, s: GameState, side: Side | null, c: PlanInput): string | null {
  if (!side) return '本阶段双方同时行动，不能制定计划';
  const R = ctx.combat.plan;
  if (c.path.length < 2 || c.path.length > 8) return '轴线需要 2 到 8 个路点';
  for (const h of c.path) if (!/^\d{4}$/.test(h) || !inBounds(ctx.map.grid, parseHexId(h))) return `路点 ${h} 不在地图内`;
  if (c.formation) {
    const f = ctx.oob.formations.get(c.formation);
    if (!f) return `编制 ${c.formation} 不存在`;
    if (f.side !== side) return '只能指派本方的编制';
  }
  const mine = s.plans.filter((p) => p.side === side && p.id !== c.id);
  if (c.id && !s.plans.some((p) => p.id === c.id && p.side === side)) return `没有这条轴线 ${c.id}`;
  if (mine.length + 1 > R.maxAxes) return `每方最多 ${R.maxAxes} 条轴线`;
  if (c.kind === 'main' && mine.some((p) => p.kind === 'main')) return '已经有一条主攻轴线了（主攻只能有一条，请先删除或改类型）';
  return null;
}

export function nextAxisId(s: GameState, side: Side): string {
  for (let n = 1; ; n++) if (!s.plans.some((p) => p.id === `${side}-${n}`)) return `${side}-${n}`;
}

/** 主攻走廊加成；没有则 null。只有前一回合或更早定下的计划才有效，且所有进攻单位都属于指派的编制。 */
export function planShift(ctx: GameContext, s: GameState, side: Side, attackerFormations: readonly string[], hex: string): { value: number; label: string } | null {
  const R = ctx.combat.plan;
  if (!R.mainShift) return null;
  const ax = s.plans.find((p) => p.side === side && p.kind === 'main' && p.turn < s.turn);
  if (!ax) return null;
  if (ax.formation && !attackerFormations.every((f) => chainOf(ctx, s, f).includes(ax.formation!))) return null;
  const target = parseHexId(hex);
  if (!axisLine(ax.path).some((h) => distance(parseHexId(h), target) <= R.corridorRadius)) return null;
  return { value: R.mainShift, label: `按计划主攻（${ax.formation ? ctx.oob.formations.get(ax.formation)!.names.zh : '全军'}，沿计划轴线）` };
}
