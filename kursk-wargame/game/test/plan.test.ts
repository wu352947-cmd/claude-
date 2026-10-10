import { describe, expect, it } from 'vitest';
import { apply, axisLine, lineHexes, parseHexId, planShift, previewCombat, whyCannotPlan } from '../src/engine';
import { DEINF, INF, TANK, at, combat, world } from './helpers';

const ctx = world();
const s0 = at({ [TANK]: '0505', [DEINF]: '0505', [INF]: '0509' }, 'first.movement');
const plan = (s = s0, extra: Partial<Parameters<typeof apply>[2]> = {}) =>
  apply(ctx, s, { type: 'Plan', kind: 'main', formation: 'DE.IISS.LSSAH', path: ['0505', '0509'], ...extra } as never);

describe('作战计划', () => {
  it('直线经过的格子：两端含、相邻格连续', () => {
    const l = lineHexes(parseHexId('0505'), parseHexId('0509')).map((h) => `${h.col}${h.row}`);
    expect(l).toHaveLength(5);
    expect(axisLine(['0505', '0509'])).toEqual(['0505', '0506', '0507', '0508', '0509']);
    expect(axisLine(['0505', '0507', '0507'])).toEqual(['0505', '0506', '0507']);
  });

  it('新建轴线：自动编号，记下回合与阵营；Unplan 删除', () => {
    const r = plan();
    expect(r.state.plans).toEqual([{ id: 'DE-1', side: 'DE', kind: 'main', formation: 'DE.IISS.LSSAH', path: ['0505', '0509'], turn: 1 }]);
    expect(r.events).toEqual([{ type: 'Planned', side: 'DE', id: 'DE-1', kind: 'main' }]);
    const again = plan(r.state, { kind: 'support' });
    expect(again.state.plans.map((p) => p.id)).toEqual(['DE-1', 'DE-2']);
    expect(apply(ctx, again.state, { type: 'Unplan', id: 'DE-2' }).state.plans.map((p) => p.id)).toEqual(['DE-1']);
    expect(() => apply(ctx, r.state, { type: 'Unplan', id: 'nope' })).toThrow(/没有这条/);
  });

  it('改一条：给 id 就替换；主攻只能有一条；数量上限；只能指派本方编制', () => {
    const r = plan();
    const edited = plan(r.state, { id: 'DE-1', kind: 'main', path: ['0505', '0507'] } as never);
    expect(edited.state.plans).toHaveLength(1);
    expect(edited.state.plans[0]!.path).toEqual(['0505', '0507']);
    expect(() => plan(r.state)).toThrow(/只能有一条/);
    expect(whyCannotPlan(ctx, s0, 'DE', { kind: 'support', formation: 'SU.18TK', path: ['0505', '0506'] })).toMatch(/本方/);
    expect(whyCannotPlan(ctx, s0, 'DE', { kind: 'support', formation: null, path: ['0505'] })).toMatch(/路点/);
    expect(whyCannotPlan(ctx, s0, 'DE', { kind: 'support', formation: null, path: ['0505', '9999'] })).toMatch(/不在地图/);
    expect(whyCannotPlan(ctx, s0, null, { kind: 'support', formation: null, path: ['0505', '0506'] })).toMatch(/同时行动/);
    let s = s0;
    for (let i = 0; i < combat.plan.maxAxes; i++) s = plan(s, { kind: 'support' }).state;
    expect(() => plan(s, { kind: 'support' })).toThrow(/最多/);
  });

  it('主攻加成：前一回合定下才有效；编制与走廊都要对；其他类型没有加成', () => {
    const made = plan().state;
    const atkAt = (s: typeof made, hex = '0507') => planShift(ctx, s, 'DE', ['DE.IISS.LSSAH'], hex);
    expect(atkAt(made)).toBeNull(); // 当回合定的不算
    const later = { ...made, turn: 2 };
    expect(atkAt(later)?.value).toBe(combat.plan.mainShift);
    expect(atkAt(later, '0507')?.label).toMatch(/按计划主攻/);
    expect(atkAt(later, '1010')).toBeNull(); // 走廊之外
    expect(planShift(ctx, later, 'DE', ['DE.IISS.DR', 'DE.III.6PD'], '0507')).toBeNull(); // 不是指派的编制
    const sup = { ...plan(s0, { kind: 'support' }).state, turn: 2 };
    expect(atkAt(sup)).toBeNull();
  });

  it('战斗预览里出现这条修正；苏军看不到德军的计划只是界面层的事，引擎里按阵营存', () => {
    const made = { ...plan().state, turn: 2, phase: at({}, 'first.combat').phase };
    const withPlan = previewCombat(ctx, made, [TANK], '0509');
    expect(withPlan.shifts.some((m) => m.label.startsWith('按计划主攻'))).toBe(true);
    const none = previewCombat(ctx, { ...made, plans: [] }, [TANK], '0509');
    expect(withPlan.column).toBeGreaterThanOrEqual(none.column);
  });
});
