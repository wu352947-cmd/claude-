import { describe, expect, it } from 'vitest';
import {
  type GameContext, CombatRules, MovementRules, RatingsParams, Sequence, TurnRules, apply, hexRecord, historyReport, initialState, loadDeployment, loadMap, loadOob,
  loadScenario, parseHexId, revealedEnemies, score, sideOfUnit, turnInfo, turnLabel, withFullSteps,
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

describe('想定 S1 普罗霍罗夫卡', () => {
  it('每个单位要么放进想定（开局或增援），要么照实列在"没放"里；加起来正好是全部单位（含 8 个苏军炮兵占位）', () => {
    const used = new Set([...sc.placements.map((p) => p.unit), ...sc.reinforcements.map((r) => r.unit)]);
    expect(used.size).toBe(sc.placements.length + sc.reinforcements.length);
    const omitted = [...oob.units.keys()].filter((id) => !used.has(id));
    expect(omitted.length).toBe(3);
    expect(sc.omitted.length).toBe(3);
    expect(omitted.filter((id) => id.startsWith('DE.III.7PD')).length).toBe(0); // 第 7 装甲师已按设计取值放入（推定）
  });

  it('开局位置：都在地图内、不在水面、德苏不同格；有出处的都带原文摘录', () => {
    for (const p of sc.placements) {
      expect(hexRecord(map, parseHexId(p.hex)).terrain, p.unit).not.toBe('water');
      if (p.confidence === 'sourced') expect(p.provenance.length, p.unit).toBeGreaterThan(0);
      expect(p.basis, p.unit).toBeTruthy();
    }
    expect(sc.placements.filter((p) => p.confidence === 'sourced').length).toBeGreaterThan(5);
  });

  it('日历与回合：7 月 11 日上午开始，9 回合到 13 日夜间；12 日上午（第 4 回合）苏军先手', () => {
    expect(turnLabel(turnInfo(ctx, s0))).toBe('7 月 11 日 上午');
    expect(turnLabel(turnInfo(ctx, { start: s0.start, turn: 9 }))).toBe('7 月 13 日 夜间');
    expect(sc.initiative[3]).toBe('SU');
    expect(sc.turns).toBe(9);
  });

  it('不做任何操作，一路结束阶段，9 回合后对局结束；增援在规定回合到达', () => {
    let s = s0;
    const arrived: number[] = [];
    for (let i = 0; i < 200 && !s.over; i++) {
      const r = apply(ctx, s, { type: 'EndPhase' });
      for (const e of r.events) if (e.type === 'Reinforced') arrived.push(r.state.turn);
      s = r.state;
    }
    expect(s.over).toBe(true);
    expect(s.turn).toBe(9);
    expect(arrived).toEqual([3, 5]);
    expect(s.units.length).toBe(oob.units.size - 3);
  });

  it('没人动时：目标格都归苏军、得分 = 0，比历史基准低 16.8 → 苏军决定性胜利；战后报告把目标格对照历史（历史上交替易手的不计）', () => {
    const sco = score(ctx, s0)!;
    expect([sco.objectiveVp, sco.total, sco.delta, sco.band]).toEqual([0, 0, -16.8, '苏军决定性胜利']);
    const rep = historyReport(ctx, s0)!;
    expect(rep.rows.length).toBe(sc.history!.control.length);
    expect(rep.comparable).toBe(rep.rows.filter((r) => r.history !== 'contested').length);
    expect(rep.agree).toBe(rep.rows.filter((r) => r.history === 'SU').length); // 历史上苏军守住的都"一致"
    expect(rep.losses.length).toBeGreaterThan(3);
    for (const l of sc.history!.losses) expect(l.provenance.length, l.label).toBeGreaterThan(0);
  });

  it('热座迷雾：德军开局只看得清自己身边 1 格内的苏军', () => {
    const seen = revealedEnemies(ctx, s0, 'DE');
    for (const id of seen) expect(sideOfUnit(ctx, id)).toBe('SU');
    expect(seen.size).toBeLessThan(s0.units.filter((u) => sideOfUnit(ctx, u.id) === 'SU').length);
  });

  it('想定读取会拒绝德苏同格、目标归属与占领方矛盾', () => {
    const grid = map.grid;
    const a = sc.placements.find((p) => sideOfUnit(ctx, p.unit) === 'DE')!;
    const b = sc.placements.find((p) => sideOfUnit(ctx, p.unit) === 'SU')!;
    const bad = { ...s1raw, placements: s1raw.placements.map((p) => (p.unit === b.unit ? { ...p, hex: a.hex } : p)) };
    expect(() => loadScenario(oob, grid, bad)).toThrow(/双方都有部队/);
    const obj = { ...s1raw, objectives: [{ hex: a.hex, name: 'x', vp: 1, owner: 'SU' }] };
    expect(() => loadScenario(oob, grid, obj)).toThrow(/归属却写成/);
  });
});
