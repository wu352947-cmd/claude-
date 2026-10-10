/**
 * 移动与控制区（docs/02 §3、docs/09）。
 * - 消耗：进入格的地形 + 穿越格边的特征；沿道路/小路走时改用道路消耗，不计地形与格边。
 * - 控制区：每个单位（豁免兵种除外）控制相邻 6 格，大河格边挡住控制区。
 *   进入敌控制区必须停止；从敌控制区出发，第一步另加离开消耗。不能进入有敌军的格子。
 * - 只能在本方的移动阶段（或发展阶段，限本回合没进攻或进攻得手的机动单位）移动，每个单位每阶段一次。
 * - 夜间回合移动力减半（calendar.ts）。
 * 参数全部在 data/rules/movement.json。
 */
import { z } from 'zod';
import { DIRECTIONS, type Direction, type Offset, hexId, inBounds, neighbor, parseHexId } from './hex';
import { TERRAIN, SideFeature, hexRecord, linksBetween, sideFeatures } from './map';
import { Mobility } from './ratings';
import { movementAllowance, whyNotExploit } from './calendar';
import type { GameContext, GameState } from './game';
import type { Side } from './units';

const Cost = z.number().nonnegative().nullable();
const ByMobility = z.object({ foot: Cost, motorized: Cost, tracked: Cost });
type ByMobility = z.infer<typeof ByMobility>;
/** 允许在表里写 "$comment" */
const table = <T extends z.ZodTypeAny>(v: T) => z.record(z.string(), z.union([z.string(), v]));

export const MovementRules = z.object({
  status: z.enum(['draft', 'approved']),
  terrain: table(ByMobility),
  sides: table(ByMobility),
  links: table(ByMobility),
  zoc: z.object({
    exemptTypes: z.array(z.string()),
    blockedBySides: z.array(SideFeature),
    leaveCost: z.object({ foot: z.number().nonnegative(), motorized: z.number().nonnegative(), tracked: z.number().nonnegative() }),
  }),
  stacking: z.object({
    $comment: z.string().optional(),
    limit: z.number().int().positive(),
    points: z.object({ battalion: z.number().int().positive(), regiment: z.number().int().positive(), brigade: z.number().int().positive(), division: z.number().int().positive() }),
  }),
  movePhases: z.array(z.string()),
  exploitationMobility: z.array(Mobility),
}).superRefine((r, ctx) => {
  for (const t of TERRAIN) if (typeof r.terrain[t] !== 'object') ctx.addIssue({ code: 'custom', message: `移动表缺少地形 ${t}` });
  for (const f of SideFeature.options) if (typeof r.sides[f] !== 'object') ctx.addIssue({ code: 'custom', message: `移动表缺少格边 ${f}` });
});
export type MovementRules = z.infer<typeof MovementRules>;

const row = (t: Record<string, string | ByMobility>, k: string): ByMobility | undefined => {
  const v = t[k];
  return typeof v === 'object' ? v : undefined;
};

/** 从 a 到相邻格 b 的方向 */
export function directionTo(a: Offset, b: Offset): Direction | null {
  for (let d = 0; d < DIRECTIONS.length; d++) {
    const n = neighbor(a, d as Direction);
    if (n.col === b.col && n.row === b.row) return d as Direction;
  }
  return null;
}

/** 一步的消耗（不含控制区）；null = 不能走 */
export function stepCost(ctx: GameContext, mob: Mobility, from: Offset, to: Offset): number | null {
  const R = ctx.movement;
  const links = linksBetween(ctx.map, from, to);
  for (const k of ['road', 'track'] as const) {
    const c = links.includes(k) ? row(R.links, k)?.[mob] : undefined;
    if (c !== undefined && c !== null) return c;
  }
  const dir = directionTo(from, to);
  if (dir === null) return null;
  let cost = row(R.terrain, hexRecord(ctx.map, to).terrain)?.[mob];
  if (cost === null || cost === undefined) return null;
  for (const f of sideFeatures(ctx.map, from, dir)) {
    const extra = row(R.sides, f)?.[mob];
    if (extra === null || extra === undefined) return null;
    cost += extra;
  }
  return cost;
}

export const sideOfUnit = (ctx: GameContext, unitId: string): Side =>
  ctx.oob.formations.get(ctx.oob.units.get(unitId)!.formation)!.side;

/** 某一方施加的控制区（格号集合） */
export function zocOf(ctx: GameContext, s: GameState, side: Side): Set<string> {
  const out = new Set<string>();
  for (const u of s.units) {
    const unit = ctx.oob.units.get(u.id)!;
    if (sideOfUnit(ctx, u.id) !== side || ctx.movement.zoc.exemptTypes.includes(unit.type)) continue;
    const h = parseHexId(u.hex);
    for (let d = 0; d < 6; d++) {
      const n = neighbor(h, d as Direction);
      if (!inBounds(ctx.map.grid, n)) continue;
      if (sideFeatures(ctx.map, h, d as Direction).some((f) => ctx.movement.zoc.blockedBySides.includes(f))) continue;
      out.add(hexId(n));
    }
  }
  return out;
}

const enemyOf = (side: Side): Side => (side === 'DE' ? 'SU' : 'DE');

function occupiedBy(ctx: GameContext, s: GameState, side: Side): Set<string> {
  return new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) === side).map((u) => u.hex));
}

/** 单位占的堆叠点数 */
export const stackPoints = (ctx: GameContext, unitId: string): number => ctx.movement.stacking.points[ctx.oob.units.get(unitId)!.size];

/** 某格里本方单位已占的堆叠点数（不含 except 指定的单位） */
export function stackUsed(ctx: GameContext, s: GameState, hex: string, except: readonly string[] = []): number {
  return s.units.filter((u) => u.hex === hex && !except.includes(u.id)).reduce((a, u) => a + stackPoints(ctx, u.id), 0);
}

/** 这些单位放进 hex 会不会超过堆叠限制；超过返回原因 */
export function whyOverstacked(ctx: GameContext, s: GameState, hex: string, units: readonly string[]): string | null {
  const used = stackUsed(ctx, s, hex, units), add = units.reduce((a, id) => a + stackPoints(ctx, id), 0);
  const limit = ctx.movement.stacking.limit;
  return used + add > limit ? `${hex} 堆叠超限：已有 ${used} 点，再加 ${add} 点，上限 ${limit} 点` : null;
}

/** 单位现在不能移动的原因；能移动返回 null */
export function whyCannotMove(ctx: GameContext, s: GameState, unitId: string, acting: Side | null): string | null {
  const unit = ctx.oob.units.get(unitId);
  if (!unit || !s.units.some((u) => u.id === unitId)) return `单位 ${unitId} 不在地图上`;
  const phase = ctx.sequence.phases[s.phase]!;
  if (!ctx.movement.movePhases.includes(phase.id)) return `${phase.name}不能移动`;
  const side = sideOfUnit(ctx, unitId);
  if (acting !== side) return `现在是${acting === 'DE' ? '德军' : '苏军'}的阶段`;
  const ex = whyNotExploit(ctx, s, unitId);
  if (ex) return ex;
  if (s.moved.includes(unitId)) return '本阶段已经移动过';
  return null;
}

export interface Reach {
  /** 到达这一格累计消耗的移动力 */
  cost: number;
  /** 从出发格之后到这一格的路径（格号） */
  path: string[];
  /** 这一格在敌控制区内（到此必须停止） */
  zoc: boolean;
}

/** 可到达的格子（不含出发格）。最短路径；同样消耗时按格号先后取，保证结果确定。 */
export function reachable(ctx: GameContext, s: GameState, unitId: string): Map<string, Reach> {
  const unit = ctx.oob.units.get(unitId)!;
  const mob = unit.mobility;
  const mp = movementAllowance(ctx, s, unitId);
  const side = sideOfUnit(ctx, unitId);
  const enemyZoc = zocOf(ctx, s, enemyOf(side));
  const enemyHere = occupiedBy(ctx, s, enemyOf(side));
  const start = s.units.find((u) => u.id === unitId)!.hex;
  const leave = enemyZoc.has(start) ? ctx.movement.zoc.leaveCost[mob] : 0;
  const best = new Map<string, Reach>([[start, { cost: 0, path: [], zoc: false }]]);
  const open = new Set([start]);
  while (open.size) {
    let cur = '';
    for (const k of open) {
      const a = best.get(k)!.cost, b = cur ? best.get(cur)!.cost : Infinity;
      if (a < b || (a === b && k < cur)) cur = k;
    }
    open.delete(cur);
    const r = best.get(cur)!;
    if (cur !== start && r.zoc) continue; // 进入敌控制区：停止
    const h = parseHexId(cur);
    for (let d = 0; d < 6; d++) {
      const n = neighbor(h, d as Direction);
      const id = hexId(n);
      if (!inBounds(ctx.map.grid, n) || enemyHere.has(id)) continue;
      const c = stepCost(ctx, mob, h, n);
      if (c === null) continue;
      const total = r.cost + c + (cur === start ? leave : 0);
      if (total > mp) continue;
      const old = best.get(id);
      if (!old || total < old.cost) {
        best.set(id, { cost: total, path: [...r.path, id], zoc: enemyZoc.has(id) });
        open.add(id);
      }
    }
  }
  best.delete(start);
  for (const hex of [...best.keys()]) if (whyOverstacked(ctx, s, hex, [unitId])) best.delete(hex); // 路过不限，终点才查
  return best;
}

/** 检查一条具体路径是否合法；合法返回消耗，否则返回原因 */
export function checkPath(ctx: GameContext, s: GameState, unitId: string, path: readonly string[]): { cost: number } | { error: string } {
  if (!path.length) return { error: '路径为空' };
  const unit = ctx.oob.units.get(unitId)!;
  const mob = unit.mobility;
  const side = sideOfUnit(ctx, unitId);
  const enemyZoc = zocOf(ctx, s, enemyOf(side));
  const enemyHere = occupiedBy(ctx, s, enemyOf(side));
  let at = s.units.find((u) => u.id === unitId)!.hex;
  let cost = enemyZoc.has(at) ? ctx.movement.zoc.leaveCost[mob] : 0;
  for (const [i, id] of path.entries()) {
    const to = parseHexId(id);
    if (!inBounds(ctx.map.grid, to)) return { error: `格子 ${id} 不在地图内` };
    if (directionTo(parseHexId(at), to) === null) return { error: `${at} 与 ${id} 不相邻` };
    if (enemyHere.has(id)) return { error: `${id} 有敌军` };
    const c = stepCost(ctx, mob, parseHexId(at), to);
    if (c === null) return { error: `不能从 ${at} 进入 ${id}（地形或河流不可通行）` };
    cost += c;
    if (enemyZoc.has(id) && i < path.length - 1) return { error: `${id} 在敌控制区内，必须停止` };
    at = id;
  }
  const mp = movementAllowance(ctx, s, unitId);
  if (cost > mp) return { error: `需要移动力 ${cost}，只有 ${mp}` };
  const over = whyOverstacked(ctx, s, path.at(-1)!, [unitId]);
  if (over) return { error: over };
  return { cost };
}
