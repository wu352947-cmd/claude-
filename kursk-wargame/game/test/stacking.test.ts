import { describe, expect, it } from 'vitest';
import { apply, checkPath, previewCombat, reachable, stackUsed, whyCannotAttack, whyOverstacked } from '../src/engine';
import { ART, DEINF, INF, MOT, TANK, at, combat, movement, oob, world } from './helpers';

const pts = (id: string): number => movement.stacking.points[oob.units.get(id)!.size];
/** 把堆叠上限改小，便于用少数单位测试 */
const ctxWith = (limit: number, maxAttackers = combat.frontage.maxAttackers) => ({
  ...world(), movement: { ...movement, stacking: { ...movement.stacking, limit } }, combat: { ...combat, frontage: { maxAttackers } },
});

describe('堆叠限制', () => {
  it('点数按单位规模取自 movement.json；开局最多的一格 10 点，上限不低于它', () => {
    expect(movement.stacking.limit).toBeGreaterThanOrEqual(10);
    expect([pts(TANK), pts(INF), pts(MOT)].every((p) => p >= 1)).toBe(true);
    expect(stackUsed(world(), at({ [TANK]: '0505', [ART]: '0505', [INF]: '0510' }), '0505')).toBe(pts(TANK) + pts(ART));
  });

  it('终点超限不能走，路过己方满格不受限', () => {
    const need = pts(DEINF) + pts(ART);
    const ctx = ctxWith(need);
    const s = at({ [TANK]: '0505', [ART]: '0507', [DEINF]: '0507' });
    expect(whyOverstacked(ctx, s, '0507', [TANK])).toMatch(/堆叠超限/);
    expect(checkPath(ctx, s, TANK, ['0506', '0507'])).toEqual({ error: expect.stringMatching(/堆叠超限/) });
    expect(() => apply(ctx, s, { type: 'Move', unit: TANK, path: ['0506', '0507'] })).toThrow(/堆叠超限/);
    expect(reachable(ctx, s, TANK).has('0507')).toBe(false);
    // 满格在途中：穿过去，停在更远的格子
    const through = reachable(ctx, s, TANK).get('0508');
    expect(through?.path).toContain('0507');
    expect(checkPath(ctx, s, TANK, ['0506', '0507', '0508'])).toHaveProperty('cost');
  });

  it('刚好等于上限可以进入；换到空格不受影响', () => {
    const ctx = ctxWith(pts(TANK) + pts(ART));
    const s = at({ [TANK]: '0505', [ART]: '0507' });
    expect(whyOverstacked(ctx, s, '0507', [TANK])).toBeNull();
    expect(reachable(ctx, s, TANK).has('0507')).toBe(true);
  });
});

describe('正面限制', () => {
  it('一次进攻的单位数超过 frontage.maxAttackers 时拒绝，并说明原因', () => {
    const ctx = ctxWith(99, 1);
    const why = whyCannotAttack(ctx, at({ [TANK]: '0505', [DEINF]: '0507', [INF]: '0506' }, 'first.combat'), [TANK, DEINF], '0506', 'DE');
    expect(why).toMatch(/正面限制：一次进攻最多 1 个单位/);
    expect(whyCannotAttack(ctxWith(99, 2), at({ [TANK]: '0505', [DEINF]: '0507', [INF]: '0506' }, 'first.combat'), [TANK, DEINF], '0506', 'DE')).toBeNull();
  });
});

describe('工事', () => {
  const base = world();
  const fort = (level: number, side: 'DE' | 'SU' = 'SU') => ({
    ...base, scenario: { fortifications: [{ hex: '0506', side, level, name: '测试工事', confidence: 'estimated', basis: '测试', provenance: [] }] } as never,
  });
  const s = at({ [TANK]: '0505', [INF]: '0506' }, 'first.combat');

  it('守方格有本方工事时，每级使列左移一列，说明写在修正明细里', () => {
    const none = previewCombat(base, s, [TANK], '0506');
    const p1 = previewCombat(fort(1), s, [TANK], '0506');
    const p2 = previewCombat(fort(2), s, [TANK], '0506');
    expect(p1.shifts.find((m) => m.label.includes('测试工事'))?.value).toBe(-combat.fortification.shiftPerLevel);
    expect(p1.column).toBeLessThanOrEqual(none.column);
    expect(p2.column).toBeLessThanOrEqual(p1.column);
    expect(p2.shifts.find((m) => m.label.includes('2 级'))?.value).toBe(-2 * combat.fortification.shiftPerLevel);
  });

  it('工事只保护写明的一方；攻方占着的格子不给守方加成', () => {
    expect(previewCombat(fort(2, 'DE'), s, [TANK], '0506').shifts.some((m) => m.label.includes('测试工事'))).toBe(false);
  });
});
