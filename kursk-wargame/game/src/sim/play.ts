/** 无界面对局：用自动对手把一个想定打完，收集校准用的指标（docs/14）。 */
import {
  type GameContext, type GameEvent, type GameState, type Side, type Unit, apply, initialState, score, sideOfUnit, withFullSteps,
} from '../engine';
import { Bot, type BotRules } from './bot';

/** 装甲战斗车辆类别（ratings.json classes）：用来把"步"折算成坦克数 */
const VEHICLE_CLASSES = new Set(['command', 'light', 'mediumShort', 'mediumLong', 'heavy', 'assaultGun', 'tankDestroyer']);

/** 一个装甲单位每损失 1 步大约相当于多少辆装甲车辆：该单位战斗序列里的车辆总数 ÷ 满编步数 */
export function tanksPerStep(unit: Unit, itemClass: (item: string) => string | undefined): number {
  let n = 0;
  for (const s of unit.strength) if (!s.share && VEHICLE_CLASSES.has(itemClass(s.item) ?? '')) n += s.count;
  return n / unit.steps;
}

export interface GameResult {
  seed: number;
  commands: number;
  turns: number;
  /** 德军占着的目标格 */
  deHeld: string[];
  /** 德军占着的目标点数 */
  vp: number;
  /** 按想定胜负条件得出的结果 */
  outcome: string;
  /** 双方完全损失步数（装甲回合末分流后 + 其他兵种全部损失） */
  lostSteps: Record<Side, number>;
  /** 装甲完全损失折算成车辆数：[天][阵营]；党卫军军单独列 */
  tankLoss: { day: number; side: Side; ss: boolean; tanks: number; steps: number }[];
  /** 装甲受损池：受损步数、送修步数、完全损失步数 */
  pool: Record<Side, { damaged: number; repaired: number; destroyed: number }>;
  attacks: number;
  /** 各结果代码出现次数 */
  codes: Record<string, number>;
  /** 各赔率列出现次数 */
  odds: Record<string, number>;
}

export function playGame(
  ctx: GameContext, initialFor: (seed: number) => GameState, seed: number, rules: BotRules, itemClass: (item: string) => string | undefined, maxCommands = 4000,
): GameResult {
  const bot = new Bot(ctx, rules);
  let s = initialFor(seed);
  const events: GameEvent[] = [];
  let n = 0;
  while (!s.over && n < maxCommands) {
    const cmd = bot.step(s);
    const r = apply(ctx, s, cmd);
    s = r.state;
    events.push(...r.events);
    n++;
  }
  if (!s.over) throw new Error(`种子 ${seed}：${maxCommands} 条指令内没有打完`);
  const sco = score(ctx, s)!;
  const pool: GameResult['pool'] = { DE: { damaged: 0, repaired: 0, destroyed: 0 }, SU: { damaged: 0, repaired: 0, destroyed: 0 } };
  const codes: Record<string, number> = {}, odds: Record<string, number> = {};
  let attacks = 0;
  for (const e of events) {
    if (e.type === 'DamagedSorted') {
      const side = sideOfUnit(ctx, e.unit);
      pool[side].damaged += e.rolls.length; pool[side].repaired += e.repaired; pool[side].destroyed += e.destroyed;
    } else if (e.type === 'CombatResolved') {
      attacks++;
      codes[e.result || '—'] = (codes[e.result || '—'] ?? 0) + 1;
      odds[e.odds] = (odds[e.odds] ?? 0) + 1;
    }
  }
  const slots = ctx.turns.slots.length;
  const tankLoss = s.destroyed.map((d) => {
    const unit = ctx.oob.units.get(d.unit)!;
    const day = Math.floor((s.start.slot + d.turn - 1) / slots);
    return { day, side: sideOfUnit(ctx, d.unit), ss: unit.formation.startsWith('DE.IISS'), tanks: d.steps * tanksPerStep(unit, itemClass), steps: d.steps };
  });
  return {
    seed, commands: n, turns: s.turn, deHeld: sco.objectives.filter((o) => o.owner === 'DE').map((o) => o.hex),
    vp: sco.objectiveVp, outcome: sco.outcome.label, lostSteps: sco.lost, tankLoss, pool, attacks, codes, odds,
  };
}

export const initialStateFor = (ctx: GameContext, seed: number): GameState => withFullSteps(ctx, initialState(ctx.scenario!.id, ctx.scenario!.first, seed, ctx.scenario!));
