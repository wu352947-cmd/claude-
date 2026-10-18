import { describe, expect, it } from 'vitest';
import { type GameContext, type GameState, ScenarioFile, apply, createRng, initialState, loadScenario, score, withFullSteps } from '../src/engine';
import { INF, MOT, TANK, phase, world } from './helpers';

const T25 = 'SU.29TK.25TBr';

const sc = ScenarioFile.parse({
  id: 't', names: { zh: '测试想定', en: 'Test' }, confidence: 'placeholder', first: 'DE', start: { date: '1943-07-11', slot: 0 },
  turns: 2, initiative: ['DE', 'SU'],
  placements: [{ unit: TANK, hex: '0505' }, { unit: INF, hex: '0510' }],
  reinforcements: [{ unit: MOT, turn: 2, hex: '0506' }, { unit: T25, turn: 2, hex: '0303' }],
  objectives: [{ hex: '0507', name: '目标甲', vp: 3, owner: 'SU' }, { hex: '0505', name: '目标乙', vp: 2, owner: 'DE' }],
  victory: {
    key: '0507',
    results: [
      { label: '德军决定性胜利', winner: 'DE', when: { key: 'DE', deVpMin: 5 } },
      { label: '德军胜利', winner: 'DE', when: { deVpMin: 3 } },
      { label: '苏军胜利', winner: 'SU', when: { key: 'notDE', deVpMax: 2 } },
      { label: '平局', winner: null, when: {} },
    ],
  },
});
const ctx: GameContext = { ...world(), scenario: sc };
const s0 = withFullSteps(ctx, initialState('t', sc.first, 1, sc));
const ends = (s: GameState, n: number): GameState => { for (let i = 0; i < n; i++) s = apply(ctx, s, { type: 'EndPhase' }).state; return s; };

describe('想定', () => {
  it('读取时检查：增援单位不能同时在开局部署，增援回合不能超过想定回合数', () => {
    const grid = ctx.map.grid;
    expect(() => loadScenario(ctx.oob, grid, { ...sc, reinforcements: [{ unit: TANK, turn: 2, hex: '0101' }] })).toThrow(/既在开局部署/);
    expect(() => loadScenario(ctx.oob, grid, { ...sc, reinforcements: [{ unit: MOT, turn: 3, hex: '0101' }] })).toThrow(/只有 2 回合/);
    expect(loadScenario(ctx.oob, grid, sc).objectives.length).toBe(2);
  });

  it('第 2 回合开始：换主动方，增援出现；原定格附近有敌军也照常放，原定格被敌军占住就放到最近的空格', () => {
    const blocked = { ...s0, units: [...s0.units, { id: 'DE.IISS.LSSAH.PzGrenRgt1', hex: '0303', steps: 3 }] };
    const r = apply(ctx, ends(blocked, 5), { type: 'EndPhase' });
    expect(r.state.turn).toBe(2);
    expect(r.state.first).toBe('SU');
    expect(r.state.phase).toBe(phase('first.movement'));
    const where = (id: string) => r.state.units.find((u) => u.id === id)?.hex;
    expect(where(MOT)).toBe('0506');
    expect(where(T25)).not.toBe('0303');
    expect(r.events.filter((e) => e.type === 'Reinforced').length).toBe(2);
  });

  it('最后一个回合结束后对局结束，不能再下指令', () => {
    const last = ends(s0, 11);
    expect([last.turn, last.over]).toEqual([2, false]);
    const r = apply(ctx, last, { type: 'EndPhase' });
    expect(r.state.over).toBe(true);
    expect(r.events.map((e) => e.type)).toContain('GameOver');
    expect(() => apply(ctx, r.state, { type: 'EndPhase' })).toThrow(/已经结束/);
  });

  it('目标格：开局归想定规定的一方；只是路过不算，回合末停在上面（且没有敌军）才算占领，并有占领事件', () => {
    expect(s0.owners).toEqual({ '0507': 'SU', '0505': 'DE' });
    const passed = ends(apply(ctx, s0, { type: 'Move', unit: TANK, path: ['0506', '0507', '0508'] }).state, 11);
    expect(passed.owners['0507']).toBe('SU'); // 经过了，但停在 0508
    const onIt = apply(ctx, s0, { type: 'Move', unit: TANK, path: ['0506', '0507'] }).state;
    expect(onIt.owners['0507']).toBe('SU'); // 回合没结束，还不算
    let s = onIt;
    const claimed: string[] = [];
    for (let i = 0; i < 11; i++) { const r = apply(ctx, s, { type: 'EndPhase' }); s = r.state; for (const e of r.events) if (e.type === 'ObjectiveClaimed') claimed.push(`${e.hex}${e.side}`); }
    expect(s.owners['0507']).toBe('DE');
    expect(claimed).toEqual(['0507DE']);
  });

  it('胜负：按目标点数与关键目标判定，从上到下第一条满足的；装甲损失只作参考，不影响结果', () => {
    const sc0 = score(ctx, s0)!;
    expect([sc0.objectiveVp, sc0.keyHeld, sc0.outcome.label, sc0.outcome.winner]).toEqual([2, false, '苏军胜利', 'SU']);
    const took = { ...s0, owners: { '0507': 'DE', '0505': 'DE' } as const };
    const sc1 = score(ctx, { ...took, destroyed: [{ unit: T25, formation: 'x', steps: 2, turn: 1 }], casualties: [{ unit: INF, steps: 5, turn: 1 }] })!;
    expect([sc1.objectiveVp, sc1.keyHeld, sc1.lost, sc1.lostOther, sc1.outcome.label]).toEqual([5, true, { DE: 0, SU: 2 }, { DE: 0, SU: 5 }, '德军决定性胜利']);
    expect(score(ctx, { ...took, destroyed: [{ unit: TANK, formation: 'x', steps: 9, turn: 1 }] })!.outcome.label).toBe('德军决定性胜利');
    expect(score(ctx, { ...s0, owners: { '0507': 'SU', '0505': 'DE' } })!.outcome.label).toBe('苏军胜利');
    const none = { ...s0, owners: { '0507': 'SU', '0505': 'SU' } as const };
    expect(score(ctx, none)!.outcome.label).toBe('苏军胜利');
    expect(() => loadScenario(ctx.oob, ctx.map.grid, { ...sc, victory: { ...sc.victory!, key: '0101' } })).toThrow(/不是目标格/);
    expect(() => loadScenario(ctx.oob, ctx.map.grid, { ...sc, victory: { ...sc.victory!, results: [sc.victory!.results[0]!, sc.victory!.results[1]!] } })).toThrow(/兜底/);
  });

  it('非装甲单位的步数损失直接记为完全损失', () => {
    const s = { ...s0, phase: phase('first.combat'), units: [{ id: TANK, hex: '0505', steps: 3 }, { id: INF, hex: '0506', steps: 1 }] };
    for (let seed = 1; seed <= 20; seed++) {
      const r = apply(ctx, { ...s, rng: createRng(seed) }, { type: 'Attack', attackers: [TANK], hex: '0506' }).state;
      const infLost = 1 - (r.units.find((u) => u.id === INF)?.steps ?? 0);
      expect(r.casualties.filter((c) => c.unit === INF).reduce((a, c) => a + c.steps, 0)).toBe(infLost);
    }
  });
});
