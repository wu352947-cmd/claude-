import { describe, expect, it } from 'vitest';
import {
  type GameState, apply, checkPath, controlOf, previewCombat, createRng, endOfTurn, movementAllowance, reachable, revealedEnemies, turnInfo, turnLabel,
  whyCannotAttack, whyCannotMove,
} from '../src/engine';
import { DEINF, INF, MOT, TANK, at, phase, turns, world } from './helpers';

const T25 = 'SU.29TK.25TBr';
const ctx = world();
/** 第 n 回合（开局 7 月 11 日上午，每天 3 回合，第 3 回合是夜间） */
const onTurn = (s: GameState, turn: number): GameState => ({ ...s, turn });

describe('日历', () => {
  it('每天上午、下午、夜间 3 个回合；第 4 回合是第二天上午', () => {
    const s = at({});
    const labels = [1, 2, 3, 4].map((t) => turnLabel(turnInfo(ctx, onTurn(s, t))));
    expect(labels).toEqual(['7 月 11 日 上午', '7 月 11 日 下午', '7 月 11 日 夜间', '7 月 12 日 上午']);
    expect(turnInfo(ctx, onTurn(s, 3)).night).toBe(true);
    expect(turnInfo(ctx, { start: { date: '1943-07-31', slot: 2 }, turn: 2 }).date).toBe('1943-08-01');
    expect(turnInfo(ctx, { start: { date: null, slot: 1 }, turn: 1 })).toMatchObject({ date: null, slotName: '下午' });
  });
});

describe('夜间回合', () => {
  it('移动力减半：履带 7 → 3.5，走不到白天能到的格子', () => {
    const day = at({ [TANK]: '0505' });
    const night = onTurn(day, 3);
    expect(movementAllowance(ctx, night, TANK)).toBe(7 * turns.night.movementFactor);
    expect(Math.max(...[...reachable(ctx, night, TANK).values()].map((r) => r.cost))).toBeLessThanOrEqual(3.5);
    const path = ['0506', '0507', '0508', '0509'];
    expect(checkPath(ctx, day, TANK, path)).toEqual({ cost: 4 });
    expect(checkPath(ctx, night, TANK, path)).toEqual({ error: '需要移动力 4，只有 3.5' });
  });

  it('机动单位不能发起进攻，步兵可以', () => {
    const s = onTurn(at({ [TANK]: '0505', [MOT]: '0506' }, 'first.combat'), 3);
    expect(whyCannotAttack(ctx, s, [TANK], '0506', 'DE')).toMatch(/夜间/);
    const su = onTurn(at({ [INF]: '0505', [DEINF]: '0506' }, 'second.combat'), 3);
    expect(whyCannotAttack(ctx, su, [INF], '0506', 'SU')).toBeNull();
  });
});

describe('发展阶段', () => {
  const ex = (extra: Partial<GameState> = {}): GameState => ({ ...at({ [TANK]: '0505', [MOT]: '0507', [INF]: '0510' }, 'first.exploitation'), ...extra });

  it('移动阶段移动过的机动单位还能再动；进攻没得手的不能；徒步单位不能', () => {
    expect(whyCannotMove(ctx, ex({ movedThisTurn: [TANK] }), TANK, 'DE')).toBeNull();
    expect(whyCannotMove(ctx, ex({ foughtThisTurn: [TANK] }), TANK, 'DE')).toMatch(/没有得手/);
    expect(whyCannotMove(ctx, ex({ foughtThisTurn: [TANK], wonThisTurn: [TANK] }), TANK, 'DE')).toBeNull();
    const su = { ...at({ [INF]: '0510' }, 'second.exploitation') };
    expect(whyCannotMove(ctx, su, INF, 'SU')).toMatch(/机动单位/);
  });

  it('发展阶段也能进攻；战斗阶段把守方逐出格子算得手', () => {
    const s = ex();
    const moved = apply(ctx, s, { type: 'Move', unit: TANK, path: ['0506'] }).state;
    expect(whyCannotAttack(ctx, moved, [TANK], '0507', 'DE')).toBeNull();
    let won = 0, lost = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const c = { ...at({ [TANK]: '0505', [MOT]: '0506' }, 'first.combat'), rng: createRng(seed) };
      const r = apply(ctx, c, { type: 'Attack', attackers: [TANK], hex: '0506' }).state;
      if (!r.units.some((u) => u.id === TANK)) continue;
      expect(r.foughtThisTurn).toContain(TANK);
      const cleared = !r.units.some((u) => u.hex === '0506');
      expect(r.wonThisTurn.includes(TANK)).toBe(cleared);
      if (cleared) won++; else lost++;
    }
    expect(won).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });
});

describe('回合末：受损池分流与修理', () => {
  const entry = (unit: string, hex: string, steps = 1) => ({ unit, formation: ctx.oob.units.get(unit)!.formation, steps, hex, turn: 1 });

  it('战场控制：有部队归部队一方；空格只在一方控制区归那一方；双方控制区或谁都没有算争夺', () => {
    const s = at({ [TANK]: '0505', [T25]: '0507' });
    expect(controlOf(ctx, s, '0505')).toBe('DE');
    expect(controlOf(ctx, s, '0504')).toBe('DE');
    expect(controlOf(ctx, s, '0508')).toBe('SU');
    expect(controlOf(ctx, s, '0506')).toBeNull();
    expect(controlOf(ctx, { ...s, units: s.units.slice(0, 1) }, '0510')).toBeNull();
  });

  it('每一步掷骰，不大于门槛送修，否则完全损失；本方控制回收多、敌方控制回收少（各 300 步）', () => {
    const tally = (hex: string): { repaired: number; destroyed: number; need: number } => {
      let repaired = 0, destroyed = 0, need = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const s = { ...at({ [TANK]: '0505', [T25]: '0507' }, 'end', { [TANK]: 1 }), rng: createRng(seed), damaged: [entry(TANK, hex, 2), entry(TANK, hex, 1)] };
        const r = endOfTurn(ctx, s);
        expect(r.state.damaged).toEqual([]);
        for (const e of r.events) {
          if (e.type !== 'DamagedSorted') continue;
          need = e.need;
          expect(e.repaired).toBe(e.rolls.filter((v) => v <= e.need).length);
          expect(e.repaired + e.destroyed).toBe(e.rolls.length);
          repaired += e.repaired; destroyed += e.destroyed;
        }
        expect(r.state.repair.reduce((a, x) => a + x.steps, 0) + r.state.destroyed.reduce((a, x) => a + x.steps, 0)).toBe(3);
      }
      return { repaired, destroyed, need };
    };
    const own = tally('0505'), enemy = tally('0508'), mid = tally('0506');
    expect([own.need, mid.need, enemy.need]).toEqual([turns.damaged.recover.own, turns.damaged.recover.contested, turns.damaged.recover.enemy]);
    expect(own.repaired).toBeGreaterThan(mid.repaired);
    expect(mid.repaired).toBeGreaterThan(enemy.repaired);
    expect(own.repaired + own.destroyed).toBe(300);
  });

  it(`送修的步数过 ${turns.damaged.repairTurns} 个回合末回到原单位；夜间回合末算 ${turns.damaged.nightRepair} 个`, () => {
    let s: GameState = { ...at({ [TANK]: '0505' }, 'end', { [TANK]: 1 }), repair: [{ unit: TANK, steps: 2, left: 3 }] };
    s = endOfTurn(ctx, s).state; // 第 1 回合（上午）
    expect(s.repair).toEqual([{ unit: TANK, steps: 2, left: 2 }]);
    const r = endOfTurn(ctx, { ...s, turn: 3 }); // 夜间：一次推进 2
    expect(r.state.repair).toEqual([]);
    expect(r.state.units[0]!.steps).toBe(3);
    expect(r.events).toContainEqual({ type: 'Repaired', unit: TANK, steps: 2 });
  });

  it('单位已被消灭时，修好的步数留在队列里等重建', () => {
    const s: GameState = { ...at({}, 'end'), repair: [{ unit: TANK, steps: 1, left: 1 }], eliminated: [TANK] };
    expect(endOfTurn(ctx, s).state.repair).toEqual([{ unit: TANK, steps: 1, left: 0 }]);
  });

  it('结束最后一个发展阶段时自动经过回合末：分流、进入下一回合主动方移动阶段', () => {
    const s = { ...at({ [TANK]: '0505' }, 'second.exploitation', { [TANK]: 2 }), damaged: [entry(TANK, '0505')] };
    const r = apply(ctx, s, { type: 'EndPhase' });
    expect(r.events.map((e) => e.type)).toEqual(['TurnEnded', 'DamagedSorted', 'TurnStarted', 'PhaseChanged']);
    expect([r.state.turn, r.state.phase, r.state.damaged]).toEqual([2, phase('first.movement'), []]);
  });
});

describe('热座迷雾', () => {
  it(`敌军单位距本方单位不超过 ${turns.fog.revealRange} 格才看得清`, () => {
    const s = at({ [TANK]: '0505', [MOT]: '0506', [INF]: '0510' });
    expect([...revealedEnemies(ctx, s, 'DE')]).toEqual([MOT]);
    expect([...revealedEnemies(ctx, s, 'SU')]).toEqual([TANK]);
  });
});

describe('疲劳', () => {
  const F = turns.fatigue;
  it(`进攻过的单位回合末疲劳 +${F.perFightTurn}（最高 ${F.max}）；没进攻的休整 −${F.rest}，夜间多 −${F.nightRest}`, () => {
    let s: GameState = { ...at({ [TANK]: '0505', [MOT]: '0506' }, 'end'), foughtThisTurn: [TANK] };
    s = endOfTurn(ctx, s).state;
    expect(s.fatigue).toEqual({ [TANK]: F.perFightTurn });
    for (let i = 0; i < 6; i++) s = endOfTurn(ctx, { ...s, foughtThisTurn: [TANK] }).state;
    expect(s.fatigue[TANK]).toBe(F.max);
    const rested = endOfTurn(ctx, { ...s, foughtThisTurn: [] }).state;
    expect(rested.fatigue[TANK]).toBe(F.max - F.rest);
    const night = endOfTurn(ctx, { ...s, foughtThisTurn: [], turn: 3 }).state;
    expect(night.fatigue[TANK] ?? 0).toBe(Math.max(0, F.max - F.rest - F.nightRest));
  });

  it('疲劳的攻方列左移，按攻击力加权平均后向下取整，明细可读', () => {
    const s = { ...at({ [TANK]: '0505', [DEINF]: '0507', [INF]: '0506' }, 'first.combat'), fatigue: { [TANK]: 2, [DEINF]: 2 } };
    const tired = previewCombat(ctx, s, [TANK, DEINF], '0506');
    const fresh = previewCombat(ctx, { ...s, fatigue: {} }, [TANK, DEINF], '0506');
    expect(tired.shifts.find((m) => m.label.includes('疲劳'))?.value).toBe(-2 * F.shiftPerLevel);
    expect(fresh.shifts.some((m) => m.label.includes('疲劳'))).toBe(false);
    expect(tired.column).toBeLessThanOrEqual(fresh.column);
    const mixed = previewCombat(ctx, { ...s, fatigue: { [TANK]: 1 } }, [TANK, DEINF], '0506');
    expect(mixed.shifts.some((m) => m.label.includes('疲劳'))).toBe(false); // 平均不足 1 级
  });
});
