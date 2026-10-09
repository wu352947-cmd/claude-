/** 测试用：小地图与手搭的对局状态（movement、combat 测试共用） */
import {
  type GameContext, type GameState, CombatRules, MovementRules, RatingsParams, Sequence, createRng, linkKey, loadMap, loadOob, parseHexId,
} from '../src/engine';
import def from '../data/maps/south.json';
import oobData from '../data/units/south.oob.json';
import rawParams from '../data/rules/ratings.json';
import rawSeq from '../data/rules/sequence.json';
import rawMove from '../data/rules/movement.json';
import rawCombat from '../data/rules/combat.json';

/**
 * 小测试地图（12×12，默认全是开阔地）。第 5 列从北往南：0502、0503 …… 南北相邻。
 * 用到的单位：TANK = 党卫军第 1 装甲团（履带，移动 7）；INF = 近卫步兵第 13 师（徒步 4）；
 * MOT = 摩托化步兵第 53 旅（摩托化 8）；ART = 警卫旗队炮兵团（不施加控制区）。
 */
export const TANK = 'DE.IISS.LSSAH.PzRgt1', INF = 'SU.5GA.13GvSD', MOT = 'SU.29TK.53MSBr', ART = 'DE.IISS.LSSAH.ArtRgt', DEINF = 'DE.IISS.LSSAH.PzGrenRgt1';
export const oob = loadOob(oobData, RatingsParams.parse(rawParams));
export const sequence = Sequence.parse(rawSeq);
export const movement = MovementRules.parse(rawMove);
export const combat = CombatRules.parse(rawCombat);
export const phase = (id: string): number => sequence.phases.findIndex((p) => p.id === id);

export function world(opts: { hexes?: Record<string, string>; sides?: Record<string, string[]>; roads?: [string, string, string][] } = {}): GameContext {
  const map = loadMap({
    def: { ...def, hex: { ...def.hex, cols: 12, rows: 12 } },
    hexes: { hexes: Object.fromEntries(Object.entries(opts.hexes ?? {}).map(([k, t]) => [k, { terrain: t, status: 'unverified' }])) },
    hexsides: { hexsides: Object.fromEntries(Object.entries(opts.sides ?? {}).map(([k, f]) => [k, { features: f, status: 'unverified' }])) },
    labels: { labels: [] },
  });
  for (const [a, b, kind] of opts.roads ?? []) map.links.set(linkKey(parseHexId(a), parseHexId(b)), [kind as 'road']);
  return { map, oob, sequence, movement, combat };
}
/** 手搭状态：units = 单位 → 格号；步数默认满编，可用 steps 覆盖 */
export const at = (units: Record<string, string>, ph = 'first.movement', steps: Record<string, number> = {}): GameState => ({
  scenario: 't', first: 'DE', turn: 1, phase: phase(ph), rng: createRng(1),
  moved: [], movedThisTurn: [], attacked: [], attackedHexes: [], fired: [], advance: null, damaged: [], eliminated: [],
  units: Object.entries(units).map(([id, hex]) => ({ id, hex, steps: steps[id] ?? oob.units.get(id)!.steps })),
});
