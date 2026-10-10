import { describe, expect, it } from 'vitest';
import { apply, chainOf, coordGroup, previewCombat, whyCannotAssign } from '../src/engine';
import { INF, TANK, at, oob, world } from './helpers';

const DR = 'DE.IISS.DR.D', SIX = 'DE.III.6PD.PzG4';
const ctx = world();
const shiftOf = (s: ReturnType<typeof at>, atk: string[]) =>
  previewCombat(ctx, s, atk, '0506').shifts.find((m) => m.label.startsWith('协同不良'));

describe('编制树', () => {
  it('想定里的默认上下级：师 → 军 → 集团军 → 集团军群', () => {
    const s = at({});
    expect(chainOf(ctx, s, 'DE.IISS.LSSAH')).toEqual(['DE.IISS.LSSAH', 'DE.IISSPzK', 'DE.4PA', 'DE.AGS']);
    expect(chainOf(ctx, s, 'DE.168ID')).toEqual(['DE.168ID', 'DE.III', 'DE.AAK', 'DE.AGS']);
    expect(coordGroup(ctx, s, 'DE.IISS.DR')).toEqual({ id: 'DE.4PA', fresh: false });
    expect(coordGroup(ctx, s, 'SU.18TK').id).toBe('SU.5GTA');
  });

  it('所有上级都存在、同阵营、层级更高（载入时检查）', () => {
    for (const f of oob.formations.values()) if (f.parent) expect(oob.formations.get(f.parent)?.side).toBe(f.side);
  });
});

describe('协同：跨集团军一起进攻赔率列左移 1', () => {
  const base = { [TANK]: '0505', [DR]: '0505', [SIX]: '0507', [INF]: '0506' };
  it('同一集团军（党卫军两个师）没有惩罚', () => {
    expect(shiftOf(at(base, 'first.combat'), [TANK, DR])).toBeUndefined();
  });
  it('党卫军装甲军 + 第 3 装甲军（分属第 4 装甲集团军与肯普夫集群）有惩罚', () => {
    const m = shiftOf(at(base, 'first.combat'), [TANK, SIX]);
    expect(m?.value).toBe(-1);
    expect(m?.label).toMatch(/不属同一集团军/);
  });
  it('单一单位不受影响', () => {
    expect(shiftOf(at(base, 'first.combat'), [SIX])).toBeUndefined();
  });
});

describe('调整隶属（Assign）', () => {
  const s0 = at({ [TANK]: '0505', [SIX]: '0507', [INF]: '0506' }, 'first.movement');
  it('把第 6 装甲师配属给第 4 装甲集团军：当回合协同不良，下一回合起正常', () => {
    const r = apply(ctx, s0, { type: 'Assign', formation: 'DE.III.6PD', parent: 'DE.4PA' });
    expect(r.events).toEqual([{ type: 'Assigned', formation: 'DE.III.6PD', from: 'DE.III', to: 'DE.4PA' }]);
    expect(coordGroup(ctx, r.state, 'DE.III.6PD')).toEqual({ id: 'DE.III.6PD', fresh: true });
    const now = { ...r.state, phase: at({}, 'first.combat').phase };
    expect(shiftOf(now, [TANK, SIX])?.label).toMatch(/本回合刚调整/);
    const later = { ...now, turn: now.turn + 1 };
    expect(coordGroup(ctx, later, 'DE.III.6PD')).toEqual({ id: 'DE.4PA', fresh: false });
    expect(shiftOf(later, [TANK, SIX])).toBeUndefined();
  });

  it('非法调整：对方的编制、配属给自己的下级、层级不够、同一回合改两次、已经隶属、双方同时行动阶段', () => {
    const w = (f: string, p: string | null, side: 'DE' | 'SU' | null = 'DE', s = s0) => whyCannotAssign(ctx, s, f, p, side);
    expect(w('SU.18TK', 'SU.VF')).toMatch(/本方/);
    expect(w('DE.4PA', 'DE.IISSPzK')).toMatch(/下级|更高/);
    expect(w('DE.IISS.DR', 'DE.IISS.LSSAH')).toMatch(/更高一级/);
    expect(w('DE.III.6PD', 'DE.III')).toMatch(/已经隶属/);
    expect(w('DE.III.6PD', 'SU.VF')).toMatch(/敌方/);
    expect(w('DE.III.6PD', 'DE.4PA', null)).toMatch(/同时行动/);
    expect(w('DE.III.6PD', null)).toBeNull();
    const once = apply(ctx, s0, { type: 'Assign', formation: 'DE.III.6PD', parent: 'DE.4PA' }).state;
    expect(w('DE.III.6PD', 'DE.AAK', 'DE', once)).toMatch(/本回合已经调整/);
    expect(() => apply(ctx, s0, { type: 'Assign', formation: 'SU.18TK', parent: 'SU.VF' })).toThrow(/本方/);
  });

  it('直属（null）：自成一组', () => {
    const r = apply(ctx, s0, { type: 'Assign', formation: 'DE.III.6PD', parent: null });
    expect(chainOf(ctx, r.state, 'DE.III.6PD')).toEqual(['DE.III.6PD']);
  });
});
