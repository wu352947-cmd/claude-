import { describe, expect, it } from 'vitest';
import { type GameState, apply, createRng, eligibleAttackers, markDisorganized, previewCombat, reachable, supportingArtillery, whyCannotMove, zocOf } from '../src/engine';
import { ART, DEINF, INF, TANK, at, combat, phase, world } from './helpers';

const ctx = world();
const dis = (s: ReturnType<typeof at>, ...ids: string[]) => markDisorganized(s, ids, '测试', []);

describe('混乱状态的效果', () => {
  const s0 = at({ [TANK]: '0505', [INF]: '0506', [ART]: '0504' }, 'first.movement');
  it('不能移动、不能进攻、没有控制区、炮兵不能支援', () => {
    const d = dis(s0, TANK, ART);
    expect(whyCannotMove(ctx, d, TANK, 'DE')).toMatch(/混乱/);
    expect(() => apply(ctx, d, { type: 'Move', unit: TANK, path: ['0504'] })).toThrow(/混乱/);
    const atk = { ...d, phase: phase('first.combat') };
    expect(eligibleAttackers(ctx, atk, '0506', 'DE')).not.toContain(TANK);
    expect(supportingArtillery(ctx, atk, '0506', 'DE')).not.toContain(ART);
    expect(supportingArtillery(ctx, { ...s0, phase: phase('first.combat') }, '0506', 'DE')).toContain(ART);
    expect(zocOf(ctx, d, 'DE').size).toBe(0);
    expect(zocOf(ctx, s0, 'DE').size).toBeGreaterThan(0);
    expect(reachable(ctx, s0, TANK).size).toBeGreaterThan(0);
  });
  it('取消掘壕；守方有混乱单位时进攻赔率列右移', () => {
    const e = { ...s0, entrench: { [INF]: { hex: '0506', level: 2 } }, phase: phase('first.combat') };
    const d = dis(e, INF);
    expect(d.entrench[INF]).toBeUndefined();
    const base = previewCombat(ctx, e, [TANK], '0506');
    const withDis = previewCombat(ctx, { ...e, entrench: {}, disorganized: { [INF]: 1 } }, [TANK], '0506');
    const m = withDis.shifts.find((x) => x.label.startsWith('守方有混乱'));
    expect(m?.value).toBe(combat.disorganize.defenderShift);
    expect(base.shifts.some((x) => x.label.startsWith('守方有混乱'))).toBe(false);
  });
});

const hard = world({ hexes: { '0506': 'woods' } });
describe('怎么进入混乱、怎么恢复', () => {
  it('被迫撤退的守军幸存者混乱；多个种子里，损失惨重的一方也会混乱', () => {
    let retreated = 0, heavyAtt = 0, heavyDef = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = { ...at({ [TANK]: '0505', [DEINF]: '0505', [INF]: '0506' }, 'first.combat', { [INF]: 3 }), rng: createRng(seed) };
      const r = apply(ctx, s, { type: 'Attack', attackers: [TANK, DEINF], hex: '0506' });
      const dEv = r.events.filter((e) => e.type === 'Disorganized');
      const code = (r.events.find((e) => e.type === 'CombatResolved') as { result: string }).result;
      for (const e of dEv) if (e.type === 'Disorganized') {
        if (e.reason === '被迫撤退') { retreated++; expect(code).toMatch(/R/); for (const u of e.units) expect(r.state.disorganized[u]).toBe(1); }
        if (e.reason === '损失惨重') heavyDef++;
        if (e.reason === '进攻受挫') heavyAtt++;
      }
      // 混乱的进攻单位不能推进
      for (const u of r.state.advance?.units ?? []) expect(r.state.disorganized[u]).toBeUndefined();
    }
    expect(retreated).toBeGreaterThan(0);
    // 势均力敌的硬碰硬：损失惨重的一方（损失 ≥ 阈值步）幸存者混乱；阈值以下不混乱
    for (let seed = 1; seed <= 400; seed++) {
      const s = { ...at({ [TANK]: '0505', [DEINF]: '0505', [INF]: '0506' }, 'first.combat'), entrench: { [INF]: { hex: '0506', level: 3 } }, rng: createRng(seed) };
      const r = apply(hard, s, { type: 'Attack', attackers: [TANK, DEINF], hex: '0506' });
      const lost = (id: string) => r.events.reduce((n, e) => (e.type === 'StepsLost' && e.unit === id ? n + e.steps : n), 0);
      const alive = (id: string) => r.state.units.some((u) => u.id === id);
      const need = combat.disorganize;
      const attLoss = lost(TANK) + lost(DEINF);
      if (alive(DEINF)) expect(r.state.disorganized[DEINF] !== undefined).toBe(attLoss >= need.attackerLossAtLeast);
      const retreatedDef = r.events.some((e) => e.type === 'Retreated');
      if (alive(INF) && !retreatedDef) expect(r.state.disorganized[INF] !== undefined).toBe(lost(INF) >= need.defenderLossAtLeast);
      if (alive(DEINF) && attLoss >= need.attackerLossAtLeast) heavyAtt++;
      if (alive(INF) && !retreatedDef && lost(INF) >= need.defenderLossAtLeast) heavyDef++;
    }
    expect(heavyAtt).toBeGreaterThan(0);
    // 现行结果表里守方损失 ≥ 2 步的结果都带撤退，所以"损失惨重"这一支靠撤退规则触发；把阈值调成 1 验证这一支本身也有效
    const lenient = { ...hard, combat: { ...hard.combat, disorganize: { ...hard.combat.disorganize, defenderLossAtLeast: 1 } } };
    let stayed = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = { ...at({ [TANK]: '0505', [DEINF]: '0505', [INF]: '0506' }, 'first.combat'), entrench: { [INF]: { hex: '0506', level: 3 } }, rng: createRng(seed) };
      const r = apply(lenient, s, { type: 'Attack', attackers: [TANK, DEINF], hex: '0506' });
      if (r.events.some((e) => e.type === 'Disorganized' && e.reason === '损失惨重')) stayed++;
    }
    expect(stayed).toBeGreaterThan(0);
    void heavyDef;
  });
  it('回合末：更早回合混乱的恢复，本回合刚混乱的保持；再次被打垮则重新计时', () => {
    const t2: GameState = { ...at({ [TANK]: '0505', [INF]: '0506' }, 'second.combat'), turn: 2, disorganized: { [TANK]: 1, [INF]: 2 } };
    let s: GameState = t2;
    const evs: string[] = [];
    for (let i = 0; i < 12 && s.turn === 2; i++) { const r = apply(ctx, s, { type: 'EndPhase' }); s = r.state; for (const e of r.events) if (e.type === 'Recovered') evs.push(e.units.join()); }
    expect(s.turn).toBe(3);
    expect(s.disorganized).toEqual({ [INF]: 2 });
    expect(evs).toEqual([TANK]);
    // 又过一个回合末：INF 恢复
    let s4: GameState = s;
    for (let i = 0; i < 12 && s4.turn === 3; i++) s4 = apply(ctx, s4, { type: 'EndPhase' }).state;
    expect(s4.disorganized).toEqual({});
  });
  it('混乱的单位不会掘壕', () => {
    const t: GameState = { ...at({ [INF]: '0506' }, 'second.combat'), disorganized: { [INF]: 1 }, turn: 2 };
    let s: GameState = t;
    for (let i = 0; i < 12 && s.turn === 2; i++) s = apply(ctx, s, { type: 'EndPhase' }).state;
    expect(s.entrench[INF]).toBeUndefined();
  });
});
