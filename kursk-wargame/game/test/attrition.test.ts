import { describe, expect, it } from 'vitest';
import {
  type GameContext, type GameState, CombatRules, MovementRules, RatingsParams, Sequence, TurnRules, apply, initialState, loadDeployment, loadMap, loadOob, loadScenario, score, strengthOf, withFullSteps,
} from '../src/engine';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import oobData from '../data/units/south.oob.json';
import s1raw from '../data/scenarios/s1.scenario.json';
import rawParams from '../data/rules/ratings.json';
import rawSeq from '../data/rules/sequence.json';
import rawMove from '../data/rules/movement.json';
import rawCombat from '../data/rules/combat.json';
import rawTurns from '../data/rules/turns.json';

const map = loadMap({ def, hexes, hexsides, labels });
const oob = loadOob(oobData, RatingsParams.parse(rawParams));
const sc = loadScenario(oob, map.grid, s1raw);
loadDeployment(oob, map.grid, s1raw);
const ctx: GameContext = { map, oob, sequence: Sequence.parse(rawSeq), movement: MovementRules.parse(rawMove), combat: CombatRules.parse(rawCombat), turns: TurnRules.parse(rawTurns), scenario: sc };
const s0 = withFullSteps(ctx, initialState(sc.id, sc.first, 1, sc));
const ids = (side: 'DE' | 'SU') => s0.units.filter((u) => (ctx.oob.units.get(u.id)!.formation.startsWith('DE') ? 'DE' : 'SU') === side).map((u) => u.id);
/** 一方的单位逐个消灭，直到 all（onlyArmor 时是 armor）剩余战力不高于 frac */
const worn = (side: 'DE' | 'SU', frac: number, onlyArmor = false, from: GameState = s0): GameState => {
  let s = from;
  for (const id of ids(side)) {
    const o = ctx.oob.units.get(id)!;
    if (onlyArmor && !ctx.combat.armor.armorTypes.includes(o.type)) continue;
    const st = strengthOf(ctx, s, side);
    if ((onlyArmor ? st.armor : st.all) <= frac) break;
    s = { ...s, units: s.units.filter((u) => u.id !== id), eliminated: [...s.eliminated, id] };
  }
  return s;
};

describe('兵力损耗（docs/18）', () => {
  it('开局双方战力 = 100%；损失和消灭按满编步数折算；修理中的步数算回来', () => {
    expect(strengthOf(ctx, s0, 'DE')).toEqual({ all: 1, armor: 1 });
    const half = strengthOf(ctx, worn('SU', 0.5), 'SU');
    expect(half.all).toBeLessThanOrEqual(0.5);
    expect(half.all).toBeGreaterThan(0.3);
    const u = s0.units.find((x) => ids('DE').includes(x.id) && ctx.combat.armor.armorTypes.includes(ctx.oob.units.get(x.id)!.type))!;
    const lost = { ...s0, units: s0.units.map((x) => (x === u ? { ...x, steps: x.steps - 1 } : x)) };
    const back = { ...lost, repair: [{ unit: u.id, steps: 1, left: 2 }] };
    expect(strengthOf(ctx, lost, 'DE').armor).toBeLessThan(1);
    expect(strengthOf(ctx, back, 'DE')).toEqual({ all: 1, armor: 1 });
    expect(strengthOf(ctx, { ...s0, units: s0.units.filter((x) => x.id !== u.id), eliminated: [u.id] }, 'DE').armor).toBeLessThan(strengthOf(ctx, lost, 'DE').armor);
  });
  it('被打残：任何一方 all 或 armor 低于崩溃线 → 对方决定性胜利，不看目标', () => {
    const o = score(ctx, worn('DE', 0.2))!.outcome;
    expect(o.collapsed).toEqual(['DE']);
    expect([o.winner, o.label]).toEqual(['SU', '德军被打残：苏军决定性胜利']);
    expect(score(ctx, worn('SU', 0.2, true))!.outcome.collapsed).toEqual(['SU']);
    const both = worn('SU', 0.2, false, worn('DE', 0.2));
    expect(score(ctx, both)!.outcome).toMatchObject({ winner: null, label: '两败俱伤（双方都被打残）' });
  });
  it('惨胜：靠目标赢了但自己低于惨胜线 → 降为惨胜（赢家不变）', () => {
    // 苏军守住全部目标本来是"苏军决定性胜利"；苏军 armor 剩 ~45%（低于惨胜线 40% 之上）→ 不降；剩 ~35% 且高于崩溃线 25% → 惨胜
    const ok = score(ctx, worn('SU', 0.5, true))!.outcome;
    expect(ok.costly).toBe(false);
    expect(ok.label).toBe('苏军决定性胜利');
    const costly = score(ctx, worn('SU', 0.33, true))!;
    expect(costly.outcome.collapsed).toEqual([]);
    expect(costly.outcome).toMatchObject({ winner: 'SU', costly: true, label: '苏军惨胜（代价过大）' });
  });
  it('回合末一方被打残 → 对局立刻结束（不等 minTurn）', () => {
    const s = { ...worn('DE', 0.2), phase: ctx.sequence.phases.length - 2 };
    const r = apply(ctx, s, { type: 'EndPhase' });
    expect(r.state.over).toBe(true);
    expect(r.events.find((e) => e.type === 'GameOver')).toMatchObject({ reason: expect.stringContaining('崩溃线') });
  });
});
