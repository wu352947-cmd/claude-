/** 人机对战：电脑用 sim/bot.ts 的自动对手，打法取自 data/sim/styles.json（AI 拟定的模拟设定，不是史料）。 */
import type { GameContext, Side } from '../engine';
import { Bot, BotRules } from '../sim/bot';
import rawBots from '../../data/sim/bots.json';
import rawStyles from '../../data/sim/styles.json';

type Styles = Record<Side, Record<string, unknown>>;
const styles = rawStyles as unknown as Styles;

export const aiStyleNames = (side: Side): string[] => Object.keys(styles[side]).filter((k) => k !== '$comment');
/** 没选时的默认打法：德军"集中突破"，苏军"伺机反击" */
export const defaultAiStyle = (side: Side): string => (side === 'DE' ? '集中突破' : '伺机反击');

export function makeBot(ctx: GameContext, side: Side, style: string): Bot {
  const base = rawBots as unknown as Record<Side, object>;
  const pick = (styles[side][style] ?? styles[side][defaultAiStyle(side)]) as object;
  return new Bot(ctx, BotRules.parse({ ...rawBots, [side]: { ...base[side], ...pick } }));
}
