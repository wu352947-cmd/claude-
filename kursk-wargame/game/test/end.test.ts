import { describe, expect, it } from 'vitest';
import {
  type GameContext, CombatRules, MovementRules, RatingsParams, Sequence, TurnRules, apply, initialState, loadDeployment, loadMap, loadOob, loadScenario, withFullSteps,
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
const mk = (end: Record<string, number> | null): GameContext => {
  const sc = loadScenario(oob, map.grid, { ...s1raw, end: end ?? undefined });
  loadDeployment(oob, map.grid, s1raw);
  return { map, oob, sequence: Sequence.parse(rawSeq), movement: MovementRules.parse(rawMove), combat: CombatRules.parse(rawCombat), turns: TurnRules.parse(rawTurns), scenario: sc };
};
const start = (ctx: GameContext) => withFullSteps(ctx, initialState(ctx.scenario!.id, ctx.scenario!.first, 1, ctx.scenario!));
/** 一路"结束阶段"，直到满足 stop 或结束；返回最后状态和全部事件 */
const run = (ctx: GameContext, stop: (s: ReturnType<typeof start>) => boolean) => {
  let s = start(ctx);
  const events: string[] = [];
  for (let i = 0; i < 600 && !s.over && !stop(s); i++) {
    const r = apply(ctx, s, { type: 'EndPhase' });
    s = r.state;
    for (const e of r.events) events.push(e.type === 'GameOver' ? `GameOver:${e.reason}` : e.type);
  }
  return { s, events };
};

describe('结束规则（docs/17）', () => {
  it('收兵：行动方随时可以结束对局，写明原因；结束后不能再操作', () => {
    const ctx = mk({ holdTurns: 2, minTurn: 6, hardTurns: 27 });
    const r = apply(ctx, start(ctx), { type: 'Conclude' });
    expect(r.state.over).toBe(true);
    expect(r.events).toEqual([{ type: 'GameOver', turn: 1, reason: '指挥官收兵' }]);
    expect(() => apply(ctx, r.state, { type: 'EndPhase' })).toThrow();
  });
  it('提前分出胜负：守方开局就"达成目标"也要等到 minTurn；之后连续 holdTurns 回合才结束', () => {
    const ctx = mk({ holdTurns: 2, minTurn: 6, hardTurns: 27 });
    const { s, events } = run(ctx, () => false);
    expect(s.over).toBe(true);
    expect(s.turn).toBe(6);
    expect(s.streak).toEqual({ side: 'SU', turns: 6 });
    expect(events.find((e) => e.startsWith('GameOver'))).toMatch(/苏军连续 6 个回合/);
  });
  it('minTurn 之前连续回合数照常累计，不会提前结束', () => {
    const ctx = mk({ holdTurns: 2, minTurn: 6, hardTurns: 27 });
    const { s } = run(ctx, (x) => x.turn === 4);
    expect(s.over).toBe(false);
    expect(s.streak.turns).toBe(3);
  });
  it('软时限：到想定的回合数只标记一次、不结束，可以继续；硬上限才强制结束', () => {
    const ctx = mk({ holdTurns: 50, minTurn: 6, hardTurns: 12 });
    const a = run(ctx, (x) => x.turn === 10);
    expect(a.s.over).toBe(false);
    expect(a.s.limitReached).toBe(true);
    expect(a.events.filter((e) => e === 'TimeLimit')).toHaveLength(1);
    const b = run(ctx, () => false);
    expect(b.s.over).toBe(true);
    expect(b.s.turn).toBe(12);
    expect(b.events.find((e) => e.startsWith('GameOver'))).toMatch(/回合上限/);
  });
  it('想定没有 end 段：仍是打满 turns 回合就结束（旧行为）', () => {
    const ctx = mk(null);
    const { s } = run(ctx, () => false);
    expect(s.over).toBe(true);
    expect(s.turn).toBe(9);
  });
});
