import { describe, expect, it } from 'vitest';
import {
  type Command, type GameState, apply, createRng, distance, hexId, neighbors, parseHexId, parseResult, previewCombat, retreatPath, whyCannotAttack, zocOf,
} from '../src/engine';
import { ART, DEINF, INF, MOT, TANK, at, combat, world } from './helpers';

/** 其余用到的单位：帝国师装甲团（12-11）、近卫独立坦克第 47 团（1-1，丘吉尔，2 步）、反坦克歼击炮兵第 10 旅、坦克第 25 旅（5-4） */
const DRPZ = 'DE.IISS.DR.PzRgt2', CHURCHILL = 'SU.2GTK.47GvTP', AT = 'SU.69A.10IPTABr', T25 = 'SU.29TK.25TBr';
const col = (name: string): number => combat.columns.findIndex((c) => c.name === name);
const labels = (p: ReturnType<typeof previewCombat>): string[] => p.shifts.map((m) => m.label);
/** 0506 的另一个相邻格（不是 0505） */
const otherNeighbor = hexId(neighbors(parseHexId('0506')).find((h) => hexId(h) !== '0505' && hexId(h) !== '0507')!);

describe('战斗结果表', () => {
  it('11 行 × 8 列；同一行越往右（赔率越高）攻方损失不增加、守方损失不减少', () => {
    for (let roll = 2; roll <= 12; roll++) {
      const row = combat.crt[roll]!.map(parseResult);
      expect(row.length).toBe(8);
      for (let i = 1; i < row.length; i++) {
        expect(row[i]!.a).toBeLessThanOrEqual(row[i - 1]!.a);
        expect(row[i]!.d + row[i]!.r).toBeGreaterThanOrEqual(row[i - 1]!.d + row[i - 1]!.r);
      }
    }
  });
});

describe('赔率与修正', () => {
  const ctx = world();
  const s = (units: Record<string, string>, ph = 'first.combat', steps: Record<string, number> = {}): GameState => at(units, ph, steps);

  it('基础赔率按剩余步数折算；装甲在开阔地打没有反坦克力量的守方 +1 列，并注明出处', () => {
    const p = previewCombat(ctx, s({ [TANK]: '0505', [MOT]: '0506' }), [TANK], '0506');
    expect([p.attack, p.defense, p.ratio]).toEqual([11, 5, 2.2]);
    expect(p.baseColumn).toBe(col('2:1'));
    expect(p.shifts).toEqual([expect.objectContaining({ value: 1, source: expect.stringContaining('02 §4.2') })]);
    expect(p.column).toBe(col('3:1'));
    const weak = previewCombat(ctx, s({ [TANK]: '0505', [MOT]: '0506' }, 'first.combat', { [TANK]: 1 }), [TANK], '0506');
    expect(weak.attack).toBeCloseTo(11 / 3, 1);
    expect(weak.baseColumn).toBe(col('1:2'));
  });

  it('守方在村庄：-1 列，且装甲效应不生效', () => {
    const p = previewCombat(world({ hexes: { '0506': 'village' } }), s({ [TANK]: '0505', [MOT]: '0506' }), [TANK], '0506');
    expect(labels(p)).toEqual(['守方地形：村庄']);
    expect(p.column).toBe(col('2:1') - 1);
  });

  it('隔小河进攻 -1；只要有一个攻方不隔河就不算', () => {
    const c = world({ sides: { '0506:0': ['minorRiver'] } });
    expect(labels(previewCombat(c, s({ [TANK]: '0505', [MOT]: '0506' }), [TANK], '0506'))).toContain('隔着小河进攻');
    const two = s({ [TANK]: '0505', [DEINF]: otherNeighbor, [MOT]: '0506' });
    expect(labels(previewCombat(c, two, [TANK, DEINF], '0506'))).not.toContain('隔着小河进攻');
  });

  it('诸兵种合成：同一师的装甲团与掷弹兵团一起进攻 +1；守方有反坦克旅时没有装甲效应', () => {
    const p = previewCombat(ctx, s({ [TANK]: '0505', [DEINF]: otherNeighbor, [MOT]: '0506', [AT]: '0506' }), [TANK, DEINF], '0506');
    expect(labels(p)).toEqual([expect.stringMatching(/^诸兵种合成/)]);
  });

  it('炮兵：射程 2 格内支援 +1 列（警卫旗队炮兵团支援 4 点，每 3 点 1 列）；本回合移动过的不能支援', () => {
    const units = { [TANK]: '0505', [ART]: '0504', [MOT]: '0506' };
    expect(distance(parseHexId('0504'), parseHexId('0506'))).toBe(2);
    const p = previewCombat(ctx, s(units), [TANK], '0506');
    expect(p.support.attacker).toEqual([ART]);
    expect(labels(p)).toContain('攻方炮兵支援（1 个炮兵单位）');
    const moved = { ...s(units), movedThisTurn: [ART] };
    expect(previewCombat(ctx, moved, [TANK], '0506').support.attacker).toEqual([]);
    expect(previewCombat(ctx, s({ ...units, [ART]: '0503' }), [TANK], '0506').support.attacker).toEqual([]);
  });

  it('守方炮兵支援 -1 列；列偏移合计最多 ±3', () => {
    const def = s({ [T25]: '0505', [DEINF]: '0506', [ART]: '0507' }, 'second.combat');
    expect(labels(previewCombat(ctx, def, [T25], '0506'))).toContain('守方炮兵支援（1 个炮兵单位）');
    const hard = world({ hexes: { '0506': 'city' }, sides: { '0506:0': ['majorRiver'] } });
    const p = previewCombat(hard, s({ [T25]: '0505', [DEINF]: '0506' }, 'second.combat'), [T25], '0506');
    expect(p.shifts.reduce((a, m) => a + m.value, 0)).toBe(-3);
    expect(labels(p)).toContain('列偏移合计最多 ±3');
  });

  it('各结果的概率加起来是 1', () => {
    const p = previewCombat(ctx, s({ [TANK]: '0505', [MOT]: '0506' }), [TANK], '0506');
    expect(p.outcomes.reduce((a, o) => a + o.p, 0)).toBeCloseTo(1, 10);
  });
});

describe('进攻的合法性', () => {
  const ctx = world();
  const base = at({ [TANK]: '0505', [DEINF]: '0405', [ART]: '0504', [MOT]: '0506', [INF]: '0510' }, 'first.combat');

  it('只能在本方战斗阶段、用相邻的能进攻单位进攻敌军格；每格、每个单位每阶段一次', () => {
    expect(whyCannotAttack(ctx, { ...base, phase: 0 }, [TANK], '0506', null)).toMatch(/不能进攻/);
    expect(whyCannotAttack(ctx, base, [ART], '0506', 'DE')).toMatch(/不能参加/);
    expect(whyCannotAttack(ctx, base, [TANK], '0510', 'DE')).toMatch(/不能参加/);
    expect(whyCannotAttack(ctx, base, [TANK], '0405', 'DE')).toMatch(/本方部队/);
    expect(whyCannotAttack(ctx, base, [TANK], '0506', 'DE')).toBeNull();
    const after = apply(ctx, base, { type: 'Attack', attackers: [TANK], hex: '0506' }).state;
    expect(() => apply(ctx, after, { type: 'Attack', attackers: [TANK], hex: '0506' })).toThrow();
  });

  it('赔率低于 1:2 不能进攻', () => {
    const s = at({ [DEINF]: '0505', [INF]: '0506' }, 'first.combat');
    expect(() => apply(ctx, s, { type: 'Attack', attackers: [DEINF], hex: '0506' })).toThrow(/低于 1:2/);
  });
});

describe('结算', () => {
  const ctx = world();

  it('同一种子结果相同；结果与损失、撤退、推进的规则一致（200 个种子）', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = { ...at({ [TANK]: '0505', [DEINF]: otherNeighbor, [MOT]: '0506', [INF]: '0509' }, 'first.combat'), rng: createRng(seed) };
      const cmd: Command = { type: 'Attack', attackers: [TANK, DEINF], hex: '0506' };
      const r = apply(ctx, s, cmd);
      expect(apply(ctx, s, cmd)).toEqual(r);
      const res = r.events[0]!.type === 'CombatResolved' ? parseResult(r.events[0]!.result) : null;
      expect(res).not.toBeNull();
      const lost = (ids: string[]) => r.events.filter((e) => e.type === 'StepsLost' && ids.includes(e.unit)).reduce((a, e) => a + (e as { steps: number }).steps, 0);
      const retreatLoss = r.events.some((e) => e.type === 'RetreatLoss');
      if (!retreatLoss) expect(lost([MOT])).toBe(Math.min(res!.d, 2));
      expect(lost([TANK, DEINF])).toBe(res!.a);
      const mot = r.state.units.find((u) => u.id === MOT);
      if (mot && res!.r) {
        expect(mot.hex).not.toBe('0506');
        if (!retreatLoss) expect(zocOf(ctx, r.state, 'DE').has(mot.hex)).toBe(false);
      }
      expect(r.state.advance !== null).toBe(!r.state.units.some((u) => u.hex === '0506'));
    }
  });

  it('撤退远离攻方；无路可退时损失步数', () => {
    const s = at({ [TANK]: '0505', [MOT]: '0506' }, 'first.combat');
    const { path, extraLoss } = retreatPath(ctx, s, '0506', 2, 'DE', [TANK]);
    expect(path.length).toBe(2);
    expect(distance(parseHexId('0505'), parseHexId(path[1]!))).toBe(3);
    expect(extraLoss).toBe(0);
    // 0101 在角上：相邻格都被德军占住，退不了
    const corner = Object.fromEntries(neighbors(parseHexId('0101')).filter((h) => h.col >= 0 && h.row >= 0).map((h, i) => [[TANK, DEINF, DRPZ][i]!, hexId(h)]));
    const t = at({ ...corner, [MOT]: '0101' }, 'first.combat');
    expect(retreatPath(ctx, t, '0101', 2, 'DE', [TANK]).extraLoss).toBe(2);
  });

  it('装甲单位损失的步数进入受损池；守方被消灭后攻方可以推进，下一条别的指令就失去机会', () => {
    let found = false;
    for (let seed = 1; seed <= 100 && !found; seed++) {
      const s = { ...at({ [TANK]: '0505', [DRPZ]: otherNeighbor, [CHURCHILL]: '0506' }, 'first.combat'), rng: createRng(seed) };
      const r = apply(ctx, s, { type: 'Attack', attackers: [TANK, DRPZ], hex: '0506' });
      expect(r.state.damaged.some((d) => d.unit === CHURCHILL)).toBe(true);
      if (!r.state.eliminated.includes(CHURCHILL)) continue;
      found = true;
      expect(r.state.advance).toEqual({ hex: '0506', units: [TANK, DRPZ] });
      const adv = apply(ctx, r.state, { type: 'Advance', units: [TANK] });
      expect(adv.state.units.find((u) => u.id === TANK)!.hex).toBe('0506');
      expect(() => apply(ctx, r.state, { type: 'Advance', units: [MOT] })).toThrow(/没有参加/);
      const other = apply(ctx, r.state, { type: 'RollDie', sides: 6, purpose: '测试' }).state;
      expect(() => apply(ctx, other, { type: 'Advance', units: [TANK] })).toThrow(/现在不能推进/);
    }
    expect(found).toBe(true);
  });

  it('结束阶段后进攻记录清空', () => {
    const s = at({ [TANK]: '0505', [MOT]: '0506' }, 'first.combat');
    const r = apply(ctx, s, { type: 'Attack', attackers: [TANK], hex: '0506' });
    const next = apply(ctx, r.state, { type: 'EndPhase' }).state;
    expect([next.attacked, next.attackedHexes, next.fired, next.advance]).toEqual([[], [], [], null]);
  });
});

describe('受损池记在战场上', () => {
  const ctx = world();
  it('攻方装甲的损失记在守方所在的格子（战场），不是自己出发的格子；守方损失也记在这一格', () => {
    let seen = 0;
    for (let seed = 1; seed <= 200 && seen < 5; seed++) {
      const s = { ...at({ [TANK]: '0505', [DRPZ]: otherNeighbor, [CHURCHILL]: '0506' }, 'first.combat'), rng: createRng(seed) };
      const r = apply(ctx, s, { type: 'Attack', attackers: [TANK, DRPZ], hex: '0506' }).state;
      for (const d of r.damaged) { expect(d.hex).toBe('0506'); seen++; }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
