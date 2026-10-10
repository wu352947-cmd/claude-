/**
 * 对局什么时候结束（docs/17）：不再硬性打满 N 回合，更像指挥官自己决定。
 * - 提前分出胜负：一方连续 holdTurns 个回合末都处于"达成战争目标"的结果（score 的 outcome.winner），对局结束；
 * - 软时限：到了想定写的 turns 回合只做一次标记（limitReached）并提示，可以继续打；
 * - 随时收兵：行动方可以用 Conclude 指令当场结束，按现状判胜负；
 * - 硬上限 hardTurns：防止永远打不完（电脑对打、挂机）。
 * 想定没有 end 段时仍是旧行为：打满 turns 回合就结束。
 */
import { score, type EndRules } from './scenario';
import type { GameContext, GameEvent, GameState } from './game';
import type { Side } from './units';

export interface Streak { side: Side | null; turns: number }

const SIDE_ZH: Record<Side, string> = { DE: '德军', SU: '苏军' };

/** 回合末检查（回合最后一个阶段离开时调用）：更新连续达成目标的回合数，决定是否结束 / 提示软时限 */
export function turnEndCheck(ctx: GameContext, s: GameState): { state: GameState; events: GameEvent[] } {
  const E: EndRules | undefined = ctx.scenario?.end;
  if (!E) return { state: s, events: [] };
  const events: GameEvent[] = [];
  const out = score(ctx, s)?.outcome;
  const winner = out?.winner ?? null;
  const streak: Streak = winner ? { side: winner, turns: s.streak.side === winner ? s.streak.turns + 1 : 1 } : { side: null, turns: 0 };
  let cur: GameState = { ...s, streak };
  if (winner && streak.turns >= E.holdTurns && s.turn >= E.minTurn) {
    events.push({ type: 'GameOver', turn: s.turn, reason: `${SIDE_ZH[winner]}连续 ${streak.turns} 个回合保持战争目标：${out!.label}` });
    return { state: { ...cur, over: true }, events };
  }
  if (E.hardTurns && s.turn >= E.hardTurns) {
    events.push({ type: 'GameOver', turn: s.turn, reason: `已到回合上限（${E.hardTurns} 回合）` });
    return { state: { ...cur, over: true }, events };
  }
  if (!s.limitReached && ctx.scenario?.turns && s.turn >= ctx.scenario.turns) {
    cur = { ...cur, limitReached: true };
    events.push({ type: 'TimeLimit', turn: s.turn });
  }
  return { state: cur, events };
}

/** 行动方收兵：当场结束，按现状判胜负 */
export function conclude(s: GameState): { state: GameState; events: GameEvent[] } {
  return { state: { ...s, over: true }, events: [{ type: 'GameOver', turn: s.turn, reason: '指挥官收兵' }] };
}
