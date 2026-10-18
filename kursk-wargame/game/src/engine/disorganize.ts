/**
 * 混乱状态（docs/16）：被打垮的部队暂时失去战斗力——不能移动、不能进攻、没有控制区、炮兵不能支援、取消掘壕；
 * 守方有混乱单位时，进攻赔率列右移。触发条件与恢复条件的参数在 data/rules/combat.json 的 disorganize。
 * 恢复：回合末，在更早的回合就已混乱、且本回合没有再次被打混乱的，恢复正常（turn-end.ts）。
 */
import { z } from 'zod';
import type { GameEvent, GameState } from './game';

export const DisorganizeRules = z.object({
  $comment: z.string().optional(),
  /** 守军被迫撤退（含无路可退）后的幸存者混乱 */
  onRetreat: z.boolean(),
  /** 守方在一场战斗里损失步数达到这个数，幸存者混乱 */
  defenderLossAtLeast: z.number().int().positive(),
  /** 攻方在一场战斗里损失步数达到这个数，幸存的进攻单位混乱 */
  attackerLossAtLeast: z.number().int().positive(),
  /** 守方有混乱单位时，进攻赔率列偏移（正数 = 向攻方有利移） */
  defenderShift: z.number().int(),
  /** 混乱后至少隔几个回合末才恢复 */
  recoverAfterTurns: z.number().int().positive(),
});
export type DisorganizeRules = z.infer<typeof DisorganizeRules>;

export const isDisorganized = (s: GameState, id: string): boolean => s.disorganized[id] !== undefined;

/** 把单位置为混乱：记下回合、取消掘壕、写事件 */
export function markDisorganized(s: GameState, ids: readonly string[], reason: string, events: GameEvent[]): GameState {
  const alive = ids.filter((id) => s.units.some((u) => u.id === id));
  if (!alive.length) return s;
  const entrench = { ...s.entrench };
  for (const id of alive) delete entrench[id];
  events.push({ type: 'Disorganized', units: alive, reason });
  return { ...s, disorganized: { ...s.disorganized, ...Object.fromEntries(alive.map((id) => [id, s.turn])) }, entrench };
}
