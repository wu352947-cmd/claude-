/** 模拟用的对局环境：和浏览器、测试里同一套数据（想定、规则、战斗序列）。 */
import {
  type GameContext, CombatRules, MovementRules, RatingsParams, Sequence, TurnRules, loadDeployment, loadMap, loadOob, loadScenario,
} from '../engine';
import def from '../../data/maps/south.json';
import hexes from '../../data/maps/south.hexes.json';
import hexsides from '../../data/maps/south.hexsides.json';
import labels from '../../data/maps/south.labels.json';
import lines from '../../data/maps/south.lines.json';
import oobData from '../../data/units/south.oob.json';
import s1raw from '../../data/scenarios/s1.scenario.json';
import rawParams from '../../data/rules/ratings.json';
import rawSeq from '../../data/rules/sequence.json';
import rawMove from '../../data/rules/movement.json';
import rawCombat from '../../data/rules/combat.json';
import rawTurns from '../../data/rules/turns.json';
import rawBots from '../../data/sim/bots.json';
import { BotRules } from './bot';

export function loadSimContext(): { ctx: GameContext; rules: BotRules; itemClass: (item: string) => string | undefined } {
  const map = loadMap({ def, hexes, hexsides, labels, lines });
  const params = RatingsParams.parse(rawParams);
  const oob = loadOob(oobData, params);
  loadDeployment(oob, map.grid, s1raw);
  const scenario = loadScenario(oob, map.grid, s1raw);
  const ctx: GameContext = {
    map, oob, sequence: Sequence.parse(rawSeq), movement: MovementRules.parse(rawMove), combat: CombatRules.parse(rawCombat), turns: TurnRules.parse(rawTurns), scenario,
  };
  return { ctx, rules: BotRules.parse(rawBots), itemClass: (item) => params.items[item]?.class };
}
