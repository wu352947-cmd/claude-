/**
 * 回合流程参数与日历（docs/02 §1、docs/11）：每天几个回合、哪个是夜间、发展阶段、受损池分流、热座迷雾。
 * 参数在 data/rules/turns.json。本文件只依赖类型，movement / combat / turn-end 都可以引用。
 */
import { z } from 'zod';
import { Mobility } from './ratings';
import type { GameContext, GameState } from './game';

export const TurnRules = z.object({
  $comment: z.string().optional(),
  status: z.enum(['draft', 'approved']),
  slots: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), night: z.boolean() })).min(1),
  night: z.object({ $comment: z.string().optional(), movementFactor: z.number().positive().max(1), noAttackMobility: z.array(Mobility) }),
  exploitation: z.object({ $comment: z.string().optional(), phases: z.array(z.string()) }),
  damaged: z.object({
    $comment: z.string().optional(),
    phase: z.string().min(1),
    die: z.number().int().min(2),
    recover: z.object({ own: z.number().int().nonnegative(), contested: z.number().int().nonnegative(), enemy: z.number().int().nonnegative() }),
    repairTurns: z.number().int().positive(),
    nightRepair: z.number().int().positive(),
  }),
  fog: z.object({ $comment: z.string().optional(), revealRange: z.number().int().nonnegative() }),
});
export type TurnRules = z.infer<typeof TurnRules>;

/** 想定开局的日期与时段（slots 的下标）；日期可以不写 */
export interface TurnStart { date: string | null; slot: number }

export interface TurnInfo {
  slot: number;
  slotName: string;
  night: boolean;
  /** 1943-07-11 这样的日期；想定没写开局日期时为 null */
  date: string | null;
}

/** 日期加天数（纯计算，不读系统时间） */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** 第 turn 回合是哪一天、哪个时段 */
export function turnInfo(ctx: GameContext, s: Pick<GameState, 'start' | 'turn'>): TurnInfo {
  const n = ctx.turns.slots.length;
  const k = s.start.slot + s.turn - 1;
  const slot = k % n;
  const t = ctx.turns.slots[slot]!;
  return { slot, slotName: t.name, night: t.night, date: s.start.date ? addDays(s.start.date, Math.floor(k / n)) : null };
}

/** "7 月 11 日 上午" 这样的中文写法 */
export function turnLabel(info: TurnInfo): string {
  if (!info.date) return info.slotName;
  const [, m, d] = info.date.split('-').map(Number);
  return `${m} 月 ${d} 日 ${info.slotName}`;
}

/** 当前阶段是否发展阶段 */
export const isExploitation = (ctx: GameContext, s: GameState): boolean =>
  ctx.turns.exploitation.phases.includes(ctx.sequence.phases[s.phase]!.id);

/** 发展阶段里这个单位为什么不能行动（能行动返回 null；不在发展阶段也返回 null） */
export function whyNotExploit(ctx: GameContext, s: GameState, unitId: string): string | null {
  if (!isExploitation(ctx, s)) return null;
  const unit = ctx.oob.units.get(unitId)!;
  if (!ctx.movement.exploitationMobility.includes(unit.mobility)) return '发展阶段只有机动单位能行动';
  if (s.foughtThisTurn.includes(unitId) && !s.wonThisTurn.includes(unitId)) return '本回合进攻没有得手，发展阶段不能再行动';
  return null;
}

/** 本回合的移动力（夜间减半） */
export function movementAllowance(ctx: GameContext, s: GameState, unitId: string): number {
  const mp = ctx.oob.units.get(unitId)!.ratings.movement;
  return turnInfo(ctx, s).night ? mp * ctx.turns.night.movementFactor : mp;
}

/** 夜间不能发起进攻的单位 */
export function nightBarred(ctx: GameContext, s: GameState, unitId: string): boolean {
  return turnInfo(ctx, s).night && ctx.turns.night.noAttackMobility.includes(ctx.oob.units.get(unitId)!.mobility);
}
