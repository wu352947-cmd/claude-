/**
 * 补给线（docs/16）：一个单位要能沿一串格子连回本方的"后方边缘"才算有补给。
 * 这串格子里不能有敌军单位，也不能在敌军控制区里（除非那格有己方单位占着）。
 * 哪些地图边缘是哪一方的后方，写在想定的 supply 里；想定没写就不启用补给规则（所有单位都算有补给）。
 * 效果：断补的单位进攻赔率列左移、被进攻时对方赔率列右移（combat.ts）；混乱的单位断补时不能恢复（turn-end.ts）。
 */
import { z } from 'zod';
import { type Direction, type Offset, hexId, inBounds, neighbor } from './hex';
import { sideOfUnit, zocOf } from './movement';
import type { GameContext, GameState } from './game';
import type { Side } from './units';

export const Edge = z.enum(['N', 'S', 'E', 'W']);
export type Edge = z.infer<typeof Edge>;
export const ScenarioSupply = z.object({ $comment: z.string().optional(), DE: z.array(Edge), SU: z.array(Edge) });
export type ScenarioSupply = z.infer<typeof ScenarioSupply>;

export const SupplyRules = z.object({
  $comment: z.string().optional(),
  /** 攻方有断补单位时，赔率列偏移（负数 = 向守方有利移） */
  attackShift: z.number().int(),
  /** 守方有断补单位时，赔率列偏移（正数 = 向攻方有利移） */
  defendShift: z.number().int(),
  /** 混乱的单位断补时不能恢复 */
  recoverNeedsSupply: z.boolean(),
});
export type SupplyRules = z.infer<typeof SupplyRules>;

const cache = new WeakMap<GameState, { cfg: ScenarioSupply; sets: Partial<Record<Side, Set<string>>> }>();

/** 这一方现在能连回后方的所有格子（从后方边缘往里填充）；想定没启用补给时返回 null（= 全部有补给） */
export function suppliedHexes(ctx: GameContext, s: GameState, side: Side): Set<string> | null {
  const cfg = ctx.scenario?.supply;
  if (!cfg) return null;
  let per = cache.get(s);
  if (!per || per.cfg !== cfg) cache.set(s, per = { cfg, sets: {} });
  const hit = per.sets[side];
  if (hit) return hit;
  const enemy: Side = side === 'DE' ? 'SU' : 'DE';
  const g = ctx.map.grid;
  const zoc = zocOf(ctx, s, enemy);
  const enemyAt = new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) === enemy).map((u) => u.hex));
  const friendAt = new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) === side).map((u) => u.hex));
  const open = (id: string): boolean => !enemyAt.has(id) && (!zoc.has(id) || friendAt.has(id));
  const seen = new Set<string>();
  const queue: Offset[] = [];
  const push = (h: Offset): void => { const id = hexId(h); if (!seen.has(id) && open(id)) { seen.add(id); queue.push(h); } };
  for (const e of cfg[side]) {
    for (let c = 0; c < g.cols; c++) for (const r of e === 'N' ? [0] : e === 'S' ? [g.rows - 1] : []) push({ col: c, row: r });
    for (let r = 0; r < g.rows; r++) for (const c of e === 'W' ? [0] : e === 'E' ? [g.cols - 1] : []) push({ col: c, row: r });
  }
  while (queue.length) {
    const h = queue.pop()!;
    for (let d = 0; d < 6; d++) {
      const n = neighbor(h, d as Direction);
      if (inBounds(g, n)) push(n);
    }
  }
  per.sets[side] = seen;
  return seen;
}

/** 单位现在有没有补给（想定没启用补给规则时一律有） */
export function isSupplied(ctx: GameContext, s: GameState, unitId: string): boolean {
  const sup = suppliedHexes(ctx, s, sideOfUnit(ctx, unitId));
  if (!sup) return true;
  const u = s.units.find((x) => x.id === unitId);
  return !u || sup.has(u.hex);
}

