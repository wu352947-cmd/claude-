import { describe, expect, it } from 'vitest';
import { apply, distance, parseHexId, planGroupMove } from '../src/engine';
import { ART, DEINF, INF, TANK, at, movement, oob, world } from './helpers';

const d = (a: string, b: string): number => distance(parseHexId(a), parseHexId(b));
const hexOf = (s: ReturnType<typeof at>, id: string): string => s.units.find((u) => u.id === id)!.hex;

describe('整体移动', () => {
  const ctx = world();
  const s0 = at({ [TANK]: '0502', [DEINF]: '0503', [ART]: '0502' });

  it('一条指令让每个单位尽量靠近目的格；各自走普通 Move（事件与单个移动相同）', () => {
    const r = apply(ctx, s0, { type: 'MoveGroup', units: [TANK, DEINF, ART], hex: '0510' });
    expect(r.events.every((e) => e.type === 'UnitMoved')).toBe(true);
    expect(r.events).toHaveLength(3);
    for (const id of [TANK, DEINF, ART]) expect(d(hexOf(r.state, id), '0510')).toBeLessThan(d(hexOf(s0, id), '0510'));
  });

  it('到不了的单位走到最近处；堆叠满了的格子，后来的落到旁边', () => {
    const tight = { ...ctx, movement: { ...movement, stacking: { ...movement.stacking, limit: movement.stacking.points[oob.units.get(TANK)!.size] } } };
    const r = planGroupMove(tight, at({ [TANK]: '0505', [ART]: '0506' }), [TANK, ART], '0507');
    expect(r.moves).toHaveLength(2);
    const ends = r.moves.map((m) => m.path.at(-1));
    expect(new Set(ends).size).toBe(2);
    expect(ends).toContain('0507');
  });

  it('不能动的单位被跳过并说明原因；没有任何单位能动则报错', () => {
    const s = at({ [TANK]: '0502', [INF]: '0509' });
    const r = planGroupMove(ctx, s, [TANK, INF], '0510');
    expect(r.moves.map((m) => m.unit)).toEqual([TANK]);
    expect(r.skipped).toEqual([{ unit: INF, why: expect.stringMatching(/的阶段/) }]);
    expect(() => apply(ctx, s, { type: 'MoveGroup', units: [INF], hex: '0510' })).toThrow(/没有单位能更靠近/);
    expect(() => apply(ctx, at({ [TANK]: '0510' }), { type: 'MoveGroup', units: [TANK], hex: '0510' })).toThrow(/没有单位/);
  });

  it('同一状态同一指令结果相同（确定性）', () => {
    const a = apply(ctx, s0, { type: 'MoveGroup', units: [TANK, DEINF, ART], hex: '0510' });
    const b = apply(ctx, s0, { type: 'MoveGroup', units: [ART, DEINF, TANK], hex: '0510' });
    expect(a.state.units).toEqual(b.state.units);
  });
});
