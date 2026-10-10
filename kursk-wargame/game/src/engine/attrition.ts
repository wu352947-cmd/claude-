/**
 * 兵力损耗（docs/18）：一方还剩多少战力。分母 = 已经出现过的单位的满编步数（含已消灭的；增援到场才计入），
 * 分子 = 地图上现有步数 + 修理中的步数（受损池里还没分流的不算，分流后送修的会回来）。
 * all = 全部单位，armor = 装甲类单位（combat.json armor.armorTypes）。比例是对本想定开局兵力说的，不是史料数字。
 */
import { sideOfUnit } from './movement';
import type { GameContext, GameState } from './game';
import type { Side } from './units';

export interface Strength { all: number; armor: number }

export function strengthOf(ctx: GameContext, s: GameState, side: Side): Strength {
  const armorTypes = ctx.combat.armor.armorTypes;
  const tally = { all: [0, 0], armor: [0, 0] };
  const add = (id: string, now: number): void => {
    const u = ctx.oob.units.get(id);
    if (!u || sideOfUnit(ctx, id) !== side) return;
    tally.all[0]! += now; tally.all[1]! += u.steps;
    if (armorTypes.includes(u.type)) { tally.armor[0]! += now; tally.armor[1]! += u.steps; }
  };
  const back = (id: string): number => s.repair.filter((r) => r.unit === id).reduce((n, r) => n + r.steps, 0);
  for (const u of s.units) add(u.id, u.steps + back(u.id));
  for (const id of s.eliminated) add(id, 0);
  const ratio = (t: number[]): number => (t[1]! > 0 ? Math.min(1, t[0]! / t[1]!) : 1);
  return { all: ratio(tally.all), armor: ratio(tally.armor) };
}
