/**
 * 回合末（docs/02 §4.4、docs/11）：先推进修理队列，再把本回合受损池按战场控制分流成"送修"与"完全损失"。
 * 参数在 data/rules/turns.json 的 damaged。
 */
import { distance, parseHexId } from './hex';
import { rollDie } from './rng';
import { sideOfUnit, zocOf } from './movement';
import { turnInfo } from './calendar';
import type { GameContext, GameEvent, GameState } from './game';
import type { Side } from './units';

export type Control = 'own' | 'contested' | 'enemy';
export const CONTROL_NAMES: Record<Control, string> = { own: '本方控制', contested: '争夺中', enemy: '敌方控制' };

/** 格子现在由谁控制：有部队的归部队一方；空格只在一方控制区内归那一方；否则 null（争夺中或无人） */
export function controlOf(ctx: GameContext, s: GameState, hex: string): Side | null {
  const here = s.units.find((u) => u.hex === hex);
  if (here) return sideOfUnit(ctx, here.id);
  const de = zocOf(ctx, s, 'DE').has(hex), su = zocOf(ctx, s, 'SU').has(hex);
  return de === su ? null : de ? 'DE' : 'SU';
}

const controlFor = (owner: Side, c: Side | null): Control => (c === null ? 'contested' : c === owner ? 'own' : 'enemy');

export function endOfTurn(ctx: GameContext, s0: GameState): { state: GameState; events: GameEvent[] } {
  const D = ctx.turns.damaged;
  const events: GameEvent[] = [];
  let rng = s0.rng;
  let units = s0.units;

  // 1. 修理队列：夜间回合末进度加倍
  const progress = turnInfo(ctx, s0).night ? D.nightRepair : 1;
  const repair: GameState['repair'] = [];
  for (const r of s0.repair) {
    const left = Math.max(0, r.left - progress);
    const u = units.find((x) => x.id === r.unit);
    if (left > 0 || !u) { repair.push({ ...r, left }); continue; } // 单位已被消灭：修好的车辆等重建（以后的冲刺）
    const full = ctx.oob.units.get(r.unit)!.steps;
    const back = Math.min(r.steps, full - u.steps);
    if (back > 0) {
      units = units.map((x) => (x.id === r.unit ? { ...x, steps: x.steps + back } : x));
      events.push({ type: 'Repaired', unit: r.unit, steps: back });
    }
  }

  // 2. 受损池分流：每一步掷骰
  const destroyed = [...s0.destroyed];
  for (const d of s0.damaged) {
    const owner = sideOfUnit(ctx, d.unit);
    const control = controlFor(owner, controlOf(ctx, { ...s0, units }, d.hex));
    const need = D.recover[control];
    const rolls: number[] = [];
    for (let i = 0; i < d.steps; i++) {
      const [v, next] = rollDie(rng, D.die);
      rng = next;
      rolls.push(v);
    }
    const repaired = rolls.filter((v) => v <= need).length;
    const lost = d.steps - repaired;
    if (repaired) repair.push({ unit: d.unit, steps: repaired, left: D.repairTurns });
    if (lost) destroyed.push({ unit: d.unit, formation: d.formation, steps: lost, turn: s0.turn });
    events.push({ type: 'DamagedSorted', unit: d.unit, hex: d.hex, control, need, rolls, repaired, destroyed: lost });
  }
  // 3. 疲劳：进攻过的 +，没进攻的休整 −（夜间多恢复一级）
  const F = ctx.turns.fatigue;
  const rest = F.rest + (turnInfo(ctx, s0).night ? F.nightRest : 0);
  const fatigue: Record<string, number> = {};
  for (const u of units) {
    const v = s0.foughtThisTurn.includes(u.id) ? Math.min(F.max, (s0.fatigue[u.id] ?? 0) + F.perFightTurn) : Math.max(0, (s0.fatigue[u.id] ?? 0) - rest);
    if (v > 0) fatigue[u.id] = v;
  }
  return { state: { ...s0, rng, units, repair, destroyed, fatigue, damaged: [] }, events };
}

/** 热座迷雾：viewer 能看清番号与实力的敌军单位（距本方任一单位不超过 revealRange） */
export function revealedEnemies(ctx: GameContext, s: GameState, viewer: Side): Set<string> {
  const mine = s.units.filter((u) => sideOfUnit(ctx, u.id) === viewer).map((u) => parseHexId(u.hex));
  const out = new Set<string>();
  for (const u of s.units) {
    if (sideOfUnit(ctx, u.id) === viewer) continue;
    const h = parseHexId(u.hex);
    if (mine.some((m) => distance(m, h) <= ctx.turns.fog.revealRange)) out.add(u.id);
  }
  return out;
}
