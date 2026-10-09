/**
 * 引擎骨架（docs/03 §2.1）：一局游戏的状态、指令、事件，以及唯一改变状态的入口 apply()。
 * apply 是纯函数：同样的状态 + 同样的指令 → 同样的新状态与事件。随机数的状态放在 GameState.rng 里，
 * 所以文档里的 apply(state, command, rng) 在这里写作 apply(ctx, state, command)。
 * ctx 是不随对局变化的数据（地图、战斗序列、回合顺序、移动规则）。
 */
import { z } from 'zod';
import { parseHexId } from './hex';
import type { GameMap } from './map';
import { type MovementRules, checkPath, whyCannotMove } from './movement';
import { type RngState, createRng, rollDie } from './rng';
import type { Deployment, Oob, PlacedUnit, Side } from './units';

export const PhaseActor = z.enum(['both', 'first', 'second']);
export const Sequence = z.object({
  $comment: z.string().optional(),
  phases: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), actor: PhaseActor })).min(1),
});
export type Sequence = z.infer<typeof Sequence>;

/** 不随对局变化的规则数据 */
export interface GameContext {
  map: GameMap;
  oob: Oob;
  sequence: Sequence;
  movement: MovementRules;
}

/** 单位在对局中的可变部分；数组顺序 = 同格堆叠从下到上 */
export interface UnitState { id: string; hex: string; steps: number }

export interface GameState {
  scenario: string;
  /** 主动方 */
  first: Side;
  turn: number;
  /** sequence.phases 的下标 */
  phase: number;
  rng: RngState;
  units: UnitState[];
  /** 本阶段已经移动过的单位 */
  moved: string[];
}

export const Command = z.discriminatedUnion('type', [
  /** 移动：path 是出发格之后依次经过的格子，最后一格是目的地 */
  z.object({ type: z.literal('Move'), unit: z.string().min(1), path: z.array(z.string().regex(/^\d{4}$/)).min(1) }),
  /** 测试骰：验证随机数可回放 */
  z.object({ type: z.literal('RollDie'), sides: z.number().int().min(2).max(100), purpose: z.string().default('测试') }),
  z.object({ type: z.literal('EndPhase') }),
]);
export type Command = z.infer<typeof Command>;

export type GameEvent =
  | { type: 'UnitMoved'; unit: string; from: string; path: string[]; cost: number }
  | { type: 'DieRolled'; sides: number; value: number; purpose: string }
  | { type: 'PhaseChanged'; turn: number; phase: number }
  | { type: 'TurnStarted'; turn: number };

/** 非法指令（例如单位不存在）：界面应提示玩家，不会改变状态 */
export class CommandError extends Error {}

export function initialState(scenario: string, first: Side, seed: number, deployment: Deployment): GameState {
  return {
    scenario, first, turn: 1, phase: 0, rng: createRng(seed), moved: [],
    units: deployment.placements.map((p) => ({ id: p.unit, hex: p.hex, steps: p.steps ?? -1 })),
  };
}

/** 部署里没写步数的单位按满编补上（需要战斗序列，所以与 initialState 分开） */
export function withFullSteps(ctx: GameContext, s: GameState): GameState {
  return { ...s, units: s.units.map((u) => (u.steps > 0 ? u : { ...u, steps: ctx.oob.units.get(u.id)!.steps })) };
}

export function apply(ctx: GameContext, s: GameState, cmd: Command): { state: GameState; events: GameEvent[] } {
  switch (cmd.type) {
    case 'Move': {
      const why = whyCannotMove(ctx, s, cmd.unit, actingSide(ctx, s));
      if (why) throw new CommandError(why);
      const r = checkPath(ctx, s, cmd.unit, cmd.path);
      if ('error' in r) throw new CommandError(r.error);
      const i = s.units.findIndex((u) => u.id === cmd.unit);
      const u = s.units[i]!;
      // 到达后放在目的格堆叠的最上面
      const units = [...s.units.slice(0, i), ...s.units.slice(i + 1), { ...u, hex: cmd.path.at(-1)! }];
      return {
        state: { ...s, units, moved: [...s.moved, u.id] },
        events: [{ type: 'UnitMoved', unit: u.id, from: u.hex, path: cmd.path, cost: r.cost }],
      };
    }
    case 'RollDie': {
      const [value, rng] = rollDie(s.rng, cmd.sides);
      return { state: { ...s, rng }, events: [{ type: 'DieRolled', sides: cmd.sides, value, purpose: cmd.purpose }] };
    }
    case 'EndPhase': {
      const last = s.phase + 1 >= ctx.sequence.phases.length;
      const turn = last ? s.turn + 1 : s.turn;
      const phase = last ? 0 : s.phase + 1;
      const events: GameEvent[] = [{ type: 'PhaseChanged', turn, phase }];
      if (last) events.unshift({ type: 'TurnStarted', turn });
      return { state: { ...s, turn, phase, moved: [] }, events };
    }
  }
}

/** 本阶段由哪一方行动（双方都行动时返回 null） */
export function actingSide(ctx: GameContext, s: GameState): Side | null {
  const a = ctx.sequence.phases[s.phase]!.actor;
  if (a === 'both') return null;
  const other: Side = s.first === 'DE' ? 'SU' : 'DE';
  return a === 'first' ? s.first : other;
}

/** 把状态变成界面用的已部署单位列表（顺序 = 堆叠从下到上） */
export function placedUnits(ctx: GameContext, s: GameState): PlacedUnit[] {
  return s.units.map((u) => {
    const unit = ctx.oob.units.get(u.id);
    if (!unit) throw new Error(`状态里的单位 ${u.id} 不在战斗序列中`);
    return { unit, formation: ctx.oob.formations.get(unit.formation)!, hex: parseHexId(u.hex), steps: u.steps };
  });
}

