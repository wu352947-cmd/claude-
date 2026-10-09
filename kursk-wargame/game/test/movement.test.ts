import { describe, expect, it } from 'vitest';
import {
  type GameContext, type GameState, MovementRules, RatingsParams, Sequence, actingSide, apply, checkPath, createRng, linkKey, loadMap,
  loadOob, parseHexId, reachable, whyCannotMove, zocOf,
} from '../src/engine';
import def from '../data/maps/south.json';
import oobData from '../data/units/south.oob.json';
import rawParams from '../data/rules/ratings.json';
import rawSeq from '../data/rules/sequence.json';
import rawMove from '../data/rules/movement.json';

/**
 * 小测试地图（12×12，默认全是开阔地）。第 5 列从北往南：0502、0503 …… 南北相邻。
 * 用到的单位：TANK = 党卫军第 1 装甲团（履带，移动 7）；INF = 近卫步兵第 13 师（徒步 4）；
 * MOT = 摩托化步兵第 53 旅（摩托化 8）；ART = 警卫旗队炮兵团（不施加控制区）。
 */
const TANK = 'DE.IISS.LSSAH.PzRgt1', INF = 'SU.5GA.13GvSD', MOT = 'SU.29TK.53MSBr', ART = 'DE.IISS.LSSAH.ArtRgt', DEINF = 'DE.IISS.LSSAH.PzGrenRgt1';
const oob = loadOob(oobData, RatingsParams.parse(rawParams));
const sequence = Sequence.parse(rawSeq);
const movement = MovementRules.parse(rawMove);
const phase = (id: string): number => sequence.phases.findIndex((p) => p.id === id);

function world(opts: { hexes?: Record<string, string>; sides?: Record<string, string[]>; roads?: [string, string, string][] } = {}): GameContext {
  const map = loadMap({
    def: { ...def, hex: { ...def.hex, cols: 12, rows: 12 } },
    hexes: { hexes: Object.fromEntries(Object.entries(opts.hexes ?? {}).map(([k, t]) => [k, { terrain: t, status: 'unverified' }])) },
    hexsides: { hexsides: Object.fromEntries(Object.entries(opts.sides ?? {}).map(([k, f]) => [k, { features: f, status: 'unverified' }])) },
    labels: { labels: [] },
  });
  for (const [a, b, kind] of opts.roads ?? []) map.links.set(linkKey(parseHexId(a), parseHexId(b)), [kind as 'road']);
  return { map, oob, sequence, movement };
}
const at = (units: Record<string, string>, ph = 'first.movement'): GameState => ({
  scenario: 't', first: 'DE', turn: 1, phase: phase(ph), rng: createRng(1), moved: [],
  units: Object.entries(units).map(([id, hex]) => ({ id, hex, steps: 2 })),
});
const cost = (ctx: GameContext, s: GameState, unit: string, hex: string): number | undefined => reachable(ctx, s, unit).get(hex)?.cost;

describe('移动消耗', () => {
  it('参数表齐全：每种地形、格边都有三种机动类型的消耗', () => {
    expect(movement.status).toBe('draft');
    expect(oob.units.get(TANK)!.mobility).toBe('tracked');
    expect(oob.units.get(INF)!.mobility).toBe('foot');
    expect(oob.units.get(MOT)!.mobility).toBe('motorized');
  });

  it('开阔地每格 1：履带移动 7 正好走 7 格，第 8 格到不了', () => {
    const ctx = world();
    const s = at({ [TANK]: '0502' });
    expect(cost(ctx, s, TANK, '0509')).toBe(7);
    expect(cost(ctx, s, TANK, '0510')).toBeUndefined();
  });

  it('林地：徒步 2、摩托化 3、履带 2', () => {
    const ctx = world({ hexes: { '0503': 'woods' } });
    expect(cost(ctx, at({ [INF]: '0502' }, 'second.movement'), INF, '0503')).toBe(2);
    expect(cost(ctx, at({ [MOT]: '0502' }, 'second.movement'), MOT, '0503')).toBe(3);
    expect(cost(ctx, at({ [TANK]: '0502' }), TANK, '0503')).toBe(2);
  });

  it('沼泽：摩托化不能进入，徒步 3', () => {
    const ctx = world({ hexes: { '0503': 'marsh' } });
    const s = at({ [MOT]: '0502', [INF]: '0802' }, 'second.movement');
    expect(reachable(ctx, s, MOT).has('0503')).toBe(false);
    expect(cost(ctx, at({ [INF]: '0502' }, 'second.movement'), INF, '0503')).toBe(3);
  });

  it('格边：过溪流摩托化另加 1；过冲沟摩托化另加 2、徒步不加；绕过一条格边只要 2', () => {
    // 0503 与 0504 之间是 0504 的北边（方向 0）
    const ctx = world({ sides: { '0504:0': ['stream'], '0506:0': ['balka'] } });
    const m = at({ [MOT]: '0503' }, 'second.movement');
    expect(checkPath(ctx, m, MOT, ['0504'])).toEqual({ cost: 2 });
    expect(checkPath(ctx, at({ [MOT]: '0505' }, 'second.movement'), MOT, ['0506'])).toEqual({ cost: 3 });
    expect(checkPath(ctx, at({ [INF]: '0505' }, 'second.movement'), INF, ['0506'])).toEqual({ cost: 1 });
    // 最短路径会绕开：冲沟只占一条格边，从旁边一格绕过去 2 点
    expect(cost(ctx, at({ [MOT]: '0505' }, 'second.movement'), MOT, '0506')).toBe(2);
  });

  it('大河不能直接渡过；有公路（桥）就能过，沿公路每格 0.5', () => {
    const ctx = world({ sides: { '0504:0': ['majorRiver'] } });
    const s = at({ [TANK]: '0503' });
    expect(checkPath(ctx, s, TANK, ['0504'])).toMatchObject({ error: expect.stringMatching(/不可通行/) });
    // 这张测试图上大河只占一条格边，绕过去 2 格
    expect(cost(ctx, s, TANK, '0504')).toBe(2);
    const bridged = world({ sides: { '0504:0': ['majorRiver'] }, roads: [['0503', '0504', 'road']] });
    expect(cost(bridged, s, TANK, '0504')).toBe(0.5);
  });
});

describe('控制区', () => {
  it('每个单位控制相邻 6 格；炮兵不施加控制区；大河挡住控制区', () => {
    const ctx = world({ sides: { '0507:0': ['majorRiver'] } });
    const s = at({ [INF]: '0507', [ART]: '0302' });
    const su = zocOf(ctx, s, 'SU');
    expect(su.size).toBe(5); // 北边隔着大河
    expect(su.has('0506')).toBe(false);
    expect(zocOf(ctx, s, 'DE').size).toBe(0);
  });

  it('进入敌控制区必须停止：可以进去，但不能穿过去', () => {
    const ctx = world();
    const s = at({ [TANK]: '0502', [INF]: '0507' });
    const r = reachable(ctx, s, TANK);
    expect(r.get('0506')).toMatchObject({ cost: 4, zoc: true });
    expect(r.has('0507')).toBe(false); // 有敌军的格子不能进
    expect(r.has('0508')).toBe(false); // 敌控制区后面的格子到不了
    expect(checkPath(ctx, s, TANK, ['0503', '0504', '0505', '0506', '0406'])).toMatchObject({ error: expect.stringMatching(/必须停止/) });
  });

  it('离开敌控制区：第一步另加消耗（履带 1，徒步 2）', () => {
    const ctx = world();
    expect(cost(ctx, at({ [TANK]: '0506', [INF]: '0507' }), TANK, '0505')).toBe(2);
    expect(cost(ctx, at({ [DEINF]: '0506', [INF]: '0507' }), DEINF, '0505')).toBe(1 + 2);
    expect(cost(ctx, at({ [INF]: '0506', [TANK]: '0507' }, 'second.movement'), INF, '0505')).toBe(1 + 2);
  });

  it('敌方炮兵不挡路：苏军单位可以从德军炮兵旁边穿过', () => {
    const ctx = world();
    const s = at({ [MOT]: '0502', [ART]: '0607' }, 'second.movement');
    expect(cost(ctx, s, MOT, '0510')).toBe(8);
  });
});

describe('移动指令', () => {
  const ctx = world();

  it('只能在本方移动阶段移动，每个单位每阶段一次；结束阶段后重置', () => {
    const s = at({ [TANK]: '0502', [INF]: '0510' });
    expect(whyCannotMove(ctx, { ...s, phase: phase('strategic') }, TANK, null)).toMatch(/不能移动/);
    expect(whyCannotMove(ctx, s, INF, actingSide(ctx, s))).toMatch(/德军的阶段/);
    const r = apply(ctx, s, { type: 'Move', unit: TANK, path: ['0503', '0504'] });
    expect(r.events[0]).toMatchObject({ type: 'UnitMoved', unit: TANK, from: '0502', cost: 2 });
    expect(r.state.units.find((u) => u.id === TANK)!.hex).toBe('0504');
    expect(() => apply(ctx, r.state, { type: 'Move', unit: TANK, path: ['0505'] })).toThrow(/已经移动过/);
    const next = apply(ctx, r.state, { type: 'EndPhase' }).state;
    expect(next.moved).toEqual([]);
  });

  it('发展阶段只有机动单位能移动', () => {
    const s = at({ [TANK]: '0502', [DEINF]: '0802', [INF]: '0510' }, 'first.exploitation');
    expect(whyCannotMove(ctx, s, TANK, 'DE')).toBeNull();
    // 装甲掷弹兵团是摩托化的，能动；徒步的苏军步兵师在苏军发展阶段不能动
    expect(whyCannotMove(ctx, s, DEINF, 'DE')).toBeNull();
    expect(whyCannotMove(ctx, { ...s, phase: phase('second.exploitation') }, INF, 'SU')).toMatch(/机动单位/);
  });

  it('非法路径被拒绝：不相邻、超过移动力', () => {
    const s = at({ [TANK]: '0502' });
    expect(() => apply(ctx, s, { type: 'Move', unit: TANK, path: ['0505'] })).toThrow(/不相邻/);
    const far = ['0503', '0504', '0505', '0506', '0507', '0508', '0509', '0510'];
    expect(() => apply(ctx, s, { type: 'Move', unit: TANK, path: far })).toThrow(/只有 7/);
  });

  it('可到达范围里的每条最短路径都能被移动指令接受，消耗一致', () => {
    const c = world({ hexes: { '0604': 'woods', '0405': 'marsh' }, sides: { '0505:0': ['stream'] }, roads: [['0502', '0503', 'road']] });
    const s = at({ [TANK]: '0502', [INF]: '0808' });
    const r = reachable(c, s, TANK);
    expect(r.size).toBeGreaterThan(20);
    for (const [hex, x] of r) {
      expect(x.path.at(-1)).toBe(hex);
      expect(checkPath(c, s, TANK, x.path)).toEqual({ cost: x.cost });
    }
  });
});
