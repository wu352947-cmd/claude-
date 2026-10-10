/**
 * 作战分配（docs/16 第 4 轮）：先宣布本阶段的全部进攻，再由进攻方决定顺序逐个结算。
 * 牵制（软规定）：一个单位进攻时，它侧翼还贴着别的敌军格；这些格没被同时进攻（由它或别的单位），
 * 进攻就降一列（combat.ts）。不再禁止宣布：玩家可以自己权衡。参数在 combat.json 的 pin。
 */
import { distance, hexId, neighbors, parseHexId } from './hex';
import { sideOfUnit } from './movement';
import { whyCannotAttack } from './combat';
import type { GameContext, GameState } from './game';
import type { Side } from './units';

export interface Attack { attackers: string[]; hex: string }

/** 牵制：进攻单位旁边、除目标格外还有敌军的格子（scope = flank 时只算同时贴着目标格的侧翼；本阶段已被进攻过或已宣布的不算）应该也被进攻，否则降列 */
export function pinRequired(ctx: GameContext, s: GameState, attackers: readonly string[], hex: string): string[] {
  if (!ctx.combat.pin.enabled || !attackers.length) return [];
  const side = sideOfUnit(ctx, attackers[0]!);
  const enemyAt = new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) !== side).map((u) => u.hex));
  const out = new Set<string>();
  for (const id of attackers) {
    const u = s.units.find((x) => x.id === id);
    if (!u) continue;
    for (const n of neighbors(parseHexId(u.hex))) {
      const h = hexId(n);
      if (h === hex || !enemyAt.has(h) || s.attackedHexes.includes(h) || s.pending.some((p) => p.hex === h)) continue;
      if (ctx.combat.pin.scope === 'all' || distance(n, parseHexId(hex)) === 1) out.add(h);
    }
  }
  return [...out].sort();
}

/** 一份分配里还没被覆盖的牵制：[被要求进攻的格, 因为哪个格的进攻] */
export function assaultMissing(ctx: GameContext, s: GameState, attacks: readonly Attack[]): { hex: string; because: string }[] {
  const covered = new Set(attacks.map((a) => a.hex));
  const out = new Map<string, string>();
  for (const a of attacks) for (const h of pinRequired(ctx, s, a.attackers, a.hex)) if (!covered.has(h) && !out.has(h)) out.set(h, a.hex);
  return [...out].map(([hex, because]) => ({ hex, because }));
}

export const sameUnits = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** 这份作战分配为什么不合法；合法返回 null */
export function whyCannotAssault(ctx: GameContext, s: GameState, attacks: readonly Attack[], side: Side | null): string | null {
  if (!attacks.length) return '分配里没有进攻';
  if (s.pending.length) return '已经有宣布的进攻还没结算完';
  const hexes = new Set<string>(), used = new Set<string>();
  for (const a of attacks) {
    if (hexes.has(a.hex)) return `${a.hex} 在分配里出现了两次`;
    hexes.add(a.hex);
    for (const u of a.attackers) {
      if (used.has(u)) return `${ctx.oob.units.get(u)?.names.zh ?? u} 在分配里被用了两次`;
      used.add(u);
    }
    const why = whyCannotAttack(ctx, s, a.attackers, a.hex, side);
    if (why) return `进攻 ${a.hex}：${why}`;
  }
  return null;
}

