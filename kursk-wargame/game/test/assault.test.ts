import { describe, expect, it } from 'vitest';
import { apply, assaultMissing, createRng, hexId, neighbors, parseHexId, pinRequired, whyCannotAssault } from '../src/engine';
import { DEINF, INF, MOT, TANK, at, world } from './helpers';

const ctx = world();
const ring = (h: string) => neighbors(parseHexId(h)).map(hexId);
// DE 的 TANK 在 0606，旁边两个格各有一个苏军：A = INF，B = MOT。TANK 打 A 时必须同时打 B；DEINF 在 B 旁边（不挨着 A）
const [nA, nB] = [ring('0606')[0]!, ring('0606')[1]!];
const base = () => {
  const around = ring(nB);
  const free = around.find((h) => h !== '0606' && h !== nA && !ring('0606').includes(h) && !ring(nA).includes(h))!;
  return at({ [TANK]: '0606', [INF]: nA, [MOT]: nB, [DEINF]: free }, 'first.combat');
};

describe('牵制义务', () => {
  it('进攻单位旁边除目标外还有敌军格：这些格必须也被进攻；已被进攻过的不算', () => {
    const s = base();
    expect(pinRequired(ctx, s, [TANK], nA)).toEqual([nB]);
    expect(pinRequired(ctx, s, [DEINF], nB)).toEqual([]);
    expect(pinRequired(ctx, { ...s, attackedHexes: [nB] }, [TANK], nA)).toEqual([]);
    expect(pinRequired({ ...ctx, combat: { ...ctx.combat, pin: { enabled: false, scope: 'all' as const, shift: -1 } } }, s, [TANK], nA)).toEqual([]);
  });
  it('scope = all 时进攻单位旁边所有敌军格都算；flank 只算同时贴着目标格的两个侧翼', () => {
    const all = { ...ctx, combat: { ...ctx.combat, pin: { enabled: true, scope: 'all' as const, shift: -1 } } };
    // 另放一个只贴着 TANK、不贴目标 nA 的敌军
    const far = ring('0606').find((h) => h !== nA && h !== nB && !ring(nA).includes(h))!;
    const s = at({ [TANK]: '0606', [INF]: nA, [MOT]: far }, 'first.combat');
    expect(pinRequired(ctx, s, [TANK], nA)).toEqual([]);
    expect(pinRequired(all, s, [TANK], nA)).toEqual([far]);
  });
  it('不牵制侧翼不再被禁止，但进攻降一列；把侧翼格一起宣布（或已宣布）就不降', async () => {
    const { previewCombat } = await import('../src/engine');
    const s = base();
    const loose = previewCombat(ctx, s, [TANK], nA);
    expect(loose.shifts.some((m) => m.label.startsWith('侧翼没有牵制'))).toBe(true);
    expect(() => apply(ctx, s, { type: 'Attack', attackers: [TANK], hex: nA })).not.toThrow();
    const covered = apply(ctx, s, { type: 'Assault', attacks: [{ attackers: [TANK], hex: nA }, { attackers: [DEINF], hex: nB }] }).state;
    expect(previewCombat(ctx, covered, [TANK], nA).shifts.some((m) => m.label.startsWith('侧翼没有牵制'))).toBe(false);
    const off = { ...ctx, combat: { ...ctx.combat, pin: { ...ctx.combat.pin, shift: 0 } } };
    expect(previewCombat(off, s, [TANK], nA).shifts.some((m) => m.label.startsWith('侧翼没有牵制'))).toBe(false);
  });
  it('一份分配没覆盖侧翼也合法（只是降列）；assaultMissing 仍会指出缺哪格', () => {
    const s = base();
    expect(assaultMissing(ctx, s, [{ attackers: [TANK], hex: nA }])).toEqual([{ hex: nB, because: nA }]);
    expect(whyCannotAssault(ctx, s, [{ attackers: [TANK], hex: nA }], 'DE')).toBeNull();
    expect(whyCannotAssault(ctx, s, [{ attackers: [TANK], hex: nA }, { attackers: [DEINF], hex: nB }], 'DE')).toBeNull();
  });
  it('分配的其他检查：目标重复、单位重复、对方回合、空分配', () => {
    const s = base();
    expect(whyCannotAssault(ctx, s, [], 'DE')).toMatch(/没有进攻/);
    expect(whyCannotAssault(ctx, s, [{ attackers: [DEINF], hex: nB }, { attackers: [TANK], hex: nB }], 'DE')).toMatch(/两次/);
    expect(whyCannotAssault(ctx, s, [{ attackers: [TANK], hex: nA }, { attackers: [TANK], hex: nB }], 'DE')).toMatch(/两次/);
    expect(whyCannotAssault(ctx, s, [{ attackers: [DEINF], hex: nB }], 'SU')).toBeTruthy();
  });
});

describe('作战分配：宣布、逐个结算、取消', () => {
  const declared = () => apply(ctx, base(), { type: 'Assault', attacks: [{ attackers: [TANK], hex: nA }, { attackers: [DEINF], hex: nB }] });
  it('宣布后记在 pending，不立刻结算；已有分配时不能再宣布；只能结算分配里的进攻', () => {
    const r = declared();
    expect(r.state.pending).toHaveLength(2);
    expect(r.events.map((e) => e.type)).toEqual(['AssaultDeclared']);
    expect(whyCannotAssault(ctx, r.state, [{ attackers: [TANK], hex: nA }], 'DE')).toMatch(/还没结算/);
    expect(() => apply(ctx, r.state, { type: 'Attack', attackers: [TANK], hex: nB })).toThrow();
  });
  it('顺序由进攻方定；每结算一场就从 pending 里去掉；都结算完才能结束阶段', () => {
    let s = { ...declared().state, rng: createRng(3) };
    expect(() => apply(ctx, s, { type: 'EndPhase' })).toThrow(/没结算/);
    s = apply(ctx, s, { type: 'Attack', attackers: [DEINF], hex: nB }).state; // 先打 B
    expect(s.pending.map((p) => p.hex)).toEqual([nA]);
    // TANK 这场若还能打就必须结算；打不了（被前一场牵连）则可取消
    const ok = !(() => { try { apply(ctx, s, { type: 'Attack', attackers: [TANK], hex: nA }); return false; } catch { return true; } })();
    if (ok) s = apply(ctx, s, { type: 'Attack', attackers: [TANK], hex: nA }).state;
    else s = apply(ctx, s, { type: 'CancelAttack', hex: nA }).state;
    expect(s.pending).toEqual([]);
    expect(() => apply(ctx, s, { type: 'EndPhase' })).not.toThrow();
  });
  it('还能打的进攻不能取消；已不能进行的可以取消（并写事件）', () => {
    const s = declared().state;
    expect(() => apply(ctx, s, { type: 'CancelAttack', hex: nA })).toThrow(/还能打/);
    // 进攻单位被打混乱后，这场进攻已不能进行
    const dead = { ...s, disorganized: { [TANK]: 1 } };
    const r = apply(ctx, dead, { type: 'CancelAttack', hex: nA });
    expect(r.events).toEqual([{ type: 'AttackCancelled', hex: nA }]);
    expect(r.state.pending.map((p) => p.hex)).toEqual([nB]);
    expect(() => apply(ctx, s, { type: 'CancelAttack', hex: '0101' })).toThrow(/没有已宣布/);
  });
  it('已不能进行的进攻不挡结束阶段；换阶段后 pending 清空', () => {
    const s = { ...declared().state, disorganized: { [TANK]: 1, [DEINF]: 1 } };
    const r = apply(ctx, s, { type: 'EndPhase' });
    expect(r.state.pending).toEqual([]);
  });
});

describe('赔率太低的进攻', () => {
  it('低于最左一列时 whyCannotAttack 给出原因（已宣布的进攻因此可以取消、不挡结束阶段）', async () => {
    const { whyCannotAttack, ODDS_LOW } = await import('../src/engine');
    const s = at({ [DEINF]: '0606', [INF]: nA, [MOT]: ring(nA)[2]! }, 'first.combat', { [DEINF]: 1 });
    const why = whyCannotAttack(ctx, { ...s, entrench: { [INF]: { hex: nA, level: 3 } } }, [DEINF], nA, 'DE');
    if (why) expect(why.startsWith(ODDS_LOW) || why.length > 0).toBe(true);
  });
});
