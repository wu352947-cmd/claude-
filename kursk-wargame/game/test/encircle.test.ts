import { describe, expect, it } from 'vitest';
import { apply, createRng, hexId, neighbors, parseHexId } from '../src/engine';
import { DEINF, INF, at, combat, oob, world } from './helpers';

/** 结果表全部换成"撤退 N 格"，便于验证撤退规则本身 */
const withCrt = (code: string, annihilateAtR = combat.retreat.annihilateAtR) => ({
  ...world(),
  combat: { ...combat, crt: Object.fromEntries(Object.entries(combat.crt).map(([k, v]) => [k, v.map(() => code)])), retreat: { ...combat.retreat, annihilateAtR } },
});
const SUS = [...oob.units.values()].filter((u) => oob.formations.get(u.formation)!.side === 'SU' && u.id !== INF).map((u) => u.id);
const ring = (h: string) => neighbors(parseHexId(h)).map(hexId);
// 被围的守军是 DE 的 DEINF，6 个邻格里 5 个放苏军单位当"墙"，第 6 个是进攻的 TANK（苏军进攻时守方是 DE，所以攻方用 SU）
const encircled = (spare: boolean) => {
  const around = ring('0606');
  const walls = Object.fromEntries(around.slice(0, spare ? 4 : 5).map((h, i) => [SUS[i]!, h]));
  return at({ [DEINF]: '0606', ...walls, [INF]: around[5]! }, 'second.combat');
};

describe('无路可退', () => {
  it('被围死、又要退 2 格以上：整格被歼灭；退 1 格则只是额外损失', () => {
    const s = { ...encircled(false), rng: createRng(5) };
    const r2 = apply(withCrt('R2'), s, { type: 'Attack', attackers: [INF], hex: '0606' });
    expect(r2.state.units.some((u) => u.id === DEINF)).toBe(false);
    expect(r2.events.some((e) => e.type === 'RetreatLoss' && e.reason.includes('围歼'))).toBe(true);
    const r1 = apply(withCrt('R1'), s, { type: 'Attack', attackers: [INF], hex: '0606' });
    expect(r1.events.some((e) => e.type === 'RetreatLoss' && e.reason.includes('围歼'))).toBe(false);
  });
  it('还有退路时照常撤退（不歼灭）；参数设为 0 时关闭', () => {
    const open = { ...encircled(true), rng: createRng(5) };
    const r = apply(withCrt('R2'), open, { type: 'Attack', attackers: [INF], hex: '0606' });
    expect(r.events.some((e) => e.type === 'Retreated')).toBe(true);
    expect(r.state.units.some((u) => u.id === DEINF)).toBe(true);
    const off = apply(withCrt('R2', 0), { ...encircled(false), rng: createRng(5) }, { type: 'Attack', attackers: [INF], hex: '0606' });
    expect(off.events.some((e) => e.type === 'RetreatLoss' && e.reason.includes('围歼'))).toBe(false);
  });
});
