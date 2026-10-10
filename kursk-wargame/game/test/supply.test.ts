import { describe, expect, it } from 'vitest';
import { type GameContext, type GameState, ScenarioFile, apply, isSupplied, markDisorganized, neighbors, parseHexId, hexId, placedUnits, previewCombat, suppliedHexes } from '../src/engine';
import { DEINF, INF, MOT, TANK, at, oob, world } from './helpers';

const mk = (supply: { DE: string[]; SU: string[] } | undefined): GameContext => ({
  ...world(),
  scenario: ScenarioFile.parse({
    id: 't', names: { zh: '补给测试', en: 'Supply' }, confidence: 'placeholder', first: 'DE', start: { date: '1943-07-11', slot: 0 }, turns: 3, initiative: [],
    placements: [], reinforcements: [], objectives: [], ...(supply ? { supply } : {}),
  }),
});
const ring = (hex: string) => neighbors(parseHexId(hex)).map(hexId);
const SUS = [...oob.units.values()].filter((u) => oob.formations.get(u.formation)!.side === 'SU').map((u) => u.id);

describe('补给线', () => {
  it('想定没写 supply：不启用，所有单位都算有补给', () => {
    const ctx = mk(undefined);
    const s = at({ [TANK]: '0505' });
    expect(suppliedHexes(ctx, s, 'DE')).toBeNull();
    expect(isSupplied(ctx, s, TANK)).toBe(true);
  });

  it('开阔地上没人挡：有补给；被敌军围在四周（6 格全是敌军）：断补；只围一圈的控制区也挡', () => {
    const ctx = mk({ DE: ['S'], SU: ['N'] });
    expect(isSupplied(ctx, at({ [TANK]: '0505' }), TANK)).toBe(true);
    const around = ring('0505').slice(0, 6);
    const surrounded = at({ [TANK]: '0505', ...Object.fromEntries(around.map((h, i) => [SUS[i]!, h])) });
    expect(isSupplied(ctx, surrounded, TANK)).toBe(false);
    // 没人包围、但整排敌军挡在北面时，只要后方是南面就没事
    const wallN = at({ [TANK]: '0508', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [SUS[i]!, `${String(i + 1).padStart(2, '0')}06`])) });
    expect(isSupplied(ctx, wallN, TANK)).toBe(true);
    // 后方换成北面：被整排敌军（及其控制区）挡住，断补；撤掉整排后恢复
    const ctxN = mk({ DE: ['N'], SU: ['S'] });
    expect(isSupplied(ctxN, wallN, TANK)).toBe(false);
    expect(isSupplied(ctxN, at({ [TANK]: '0508' }), TANK)).toBe(true);
  });

  it('己方单位占着的格子，敌军控制区不挡补给线', () => {
    const ctx = mk({ DE: ['N'], SU: ['S'] });
    // 敌军 INF 在 0503：它的控制区盖住 0502、0504 等；DE 的 TANK 在 0504，DEINF 占着 0502 之类的控制区格仍可通过
    const s = at({ [TANK]: '0505', [INF]: '0503' });
    const blocked = suppliedHexes(ctx, s, 'DE')!;
    const zocHex = ring('0503')[0]!;
    expect(blocked.has('0503')).toBe(false);
    const withFriend = suppliedHexes(ctx, at({ [TANK]: '0505', [INF]: '0503', [DEINF]: zocHex }), 'DE')!;
    expect(withFriend.has(zocHex)).toBe(true);
  });

  it('断补的影响：进攻列左移、守方断补列右移；有补给的没有这条修正', () => {
    const cut = mk({ DE: [], SU: ['N'] });
    const s = at({ [TANK]: '0505', [INF]: '0506' }, 'first.combat');
    const lbl = (ctx: GameContext, st: GameState) => previewCombat(ctx, st, [TANK], '0506').shifts.map((m) => m.label).filter((l) => l.includes('断补'));
    expect(lbl(cut, s)).toEqual(['攻方有断补单位：补给线被切断']);
    const cutSU = mk({ DE: ['S'], SU: [] });
    expect(lbl(cutSU, s)).toEqual(['守方有断补单位：补给线被切断']);
    expect(lbl(mk({ DE: ['S'], SU: ['N'] }), s)).toEqual([]);
    expect(lbl(world(), s)).toEqual([]);
  });

  it('混乱的单位断补时不能恢复；有补给的照常恢复', () => {
    const run = (ctx: GameContext): GameState => {
      let s: GameState = { ...at({ [TANK]: '0505', [MOT]: '0509' }, 'second.combat'), turn: 2 };
      s = markDisorganized({ ...s, turn: 1 }, [TANK, MOT], '测试', []);
      s = { ...s, turn: 2 };
      for (let i = 0; i < 12 && s.turn === 2; i++) s = apply(ctx, s, { type: 'EndPhase' }).state;
      return s;
    };
    expect(Object.keys(run(mk({ DE: ['S'], SU: ['N'] })).disorganized)).toEqual([]);
    const cutDE = run(mk({ DE: [], SU: ['N'] }));
    expect(Object.keys(cutDE.disorganized)).toEqual([TANK]);
  });

  it('界面用的 placedUnits 标出断补的单位', () => {
    const cut = mk({ DE: [], SU: ['N'] });
    const p = placedUnits(cut, at({ [TANK]: '0505', [INF]: '0510' }));
    expect(p.find((x) => x.unit.id === TANK)!.unsupplied).toBe(true);
    expect(p.find((x) => x.unit.id === INF)!.unsupplied).toBe(false);
  });
});
