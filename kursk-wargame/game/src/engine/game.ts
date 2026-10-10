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
import { type CombatRules, whyCannotAttack } from './combat';
import { resolveAdvance, resolveAttack } from './combat-resolve';
import { type TurnRules, type TurnStart } from './calendar';
import { endOfTurn } from './turn-end';
import { parentOf, whyCannotAssign } from './command-chain';
import { type Scenario, claim, startTurn } from './scenario';
import { type RngState, createRng, rollDie } from './rng';
import type { Deployment, Oob, PlacedUnit, Side } from './units';

export const PhaseActor = z.enum(['both', 'first', 'second']);
export const Sequence = z.object({
  $comment: z.string().optional(),
  phases: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), actor: PhaseActor,
    /** 自动经过（规则还没做或不需要玩家操作） */
    auto: z.boolean().default(false),
  })).min(1),
}).refine((q) => q.phases.some((p) => !p.auto), '至少要有一个不自动经过的阶段');
export type Sequence = z.infer<typeof Sequence>;

/** 不随对局变化的规则数据 */
export interface GameContext {
  map: GameMap;
  oob: Oob;
  sequence: Sequence;
  movement: MovementRules;
  combat: CombatRules;
  turns: TurnRules;
  /** 当前想定（回合数、增援、胜利目标）；测试可以不给 */
  scenario?: Scenario;
}

/** 单位在对局中的可变部分；数组顺序 = 同格堆叠从下到上 */
export interface UnitState { id: string; hex: string; steps: number }

export interface GameState {
  scenario: string;
  /** 主动方 */
  first: Side;
  turn: number;
  /** 第 1 回合的日期与时段（日历见 calendar.ts） */
  start: TurnStart;
  /** sequence.phases 的下标 */
  phase: number;
  rng: RngState;
  units: UnitState[];
  /** 本阶段已经移动过的单位 */
  moved: string[];
  /** 本回合移动过的单位（炮兵移动后本回合不能支援） */
  movedThisTurn: string[];
  /** 本回合进攻过的单位、进攻得手（守方格被清空）的单位：决定发展阶段谁能行动 */
  foughtThisTurn: string[];
  wonThisTurn: string[];
  /** 疲劳等级（只记大于 0 的单位；回合末按本回合是否进攻更新，见 turn-end.ts） */
  fatigue: Record<string, number>;
  /** 掘壕：单位在同一格不动的回合数（等级），换格或移动就清零；hex 记下掘壕的格子 */
  entrench: Record<string, { hex: string; level: number }>;
  /** 玩家改过的隶属：编制 → 新上级（null = 直属）和调整的回合；没改过的用战斗序列里的默认上级 */
  attach: Record<string, { parent: string | null; turn: number }>;
  /** 本阶段已经进攻过的单位、被进攻过的格子、已经支援过的炮兵 */
  attacked: string[];
  attackedHexes: string[];
  fired: string[];
  /** 战斗后可以推进（只在紧接着的下一条指令有效） */
  advance: { hex: string; units: string[] } | null;
  /** 受损池：装甲单位本回合损失的步数（02 §4.4），回合末分流；hex = 战斗发生的格子（守方所在格） */
  damaged: { unit: string; formation: string; steps: number; hex: string; turn: number }[];
  /** 修理队列：left = 还要几个回合末 */
  repair: { unit: string; steps: number; left: number }[];
  /** 装甲完全损失（胜利点只计这些，02 §4.4） */
  destroyed: { unit: string; formation: string; steps: number; turn: number }[];
  /** 非装甲单位的步数损失（直接就是完全损失） */
  casualties: { unit: string; steps: number; turn: number }[];
  /** 被消灭的单位 */
  eliminated: string[];
  /** 胜利目标格现在归谁（开局取想定，之后最后进入的一方） */
  owners: Record<string, Side>;
  /** 想定的最后一个回合已经结束 */
  over: boolean;
}

export const Command = z.discriminatedUnion('type', [
  /** 移动：path 是出发格之后依次经过的格子，最后一格是目的地 */
  z.object({ type: z.literal('Move'), unit: z.string().min(1), path: z.array(z.string().regex(/^\d{4}$/)).min(1) }),
  /** 测试骰：验证随机数可回放 */
  z.object({ type: z.literal('RollDie'), sides: z.number().int().min(2).max(100), purpose: z.string().default('测试') }),
  /** 进攻：attackers 进攻 hex 里的全部敌军 */
  z.object({ type: z.literal('Attack'), attackers: z.array(z.string().min(1)).min(1), hex: z.string().regex(/^\d{4}$/) }),
  /** 战斗后推进 */
  z.object({ type: z.literal('Advance'), units: z.array(z.string().min(1)).min(1) }),
  /** 调整隶属：把编制 formation 配属给 parent（null = 直属，不隶属任何上级） */
  z.object({ type: z.literal('Assign'), formation: z.string().min(1), parent: z.string().min(1).nullable() }),
  z.object({ type: z.literal('EndPhase') }),
]);
export type Command = z.infer<typeof Command>;

export type GameEvent =
  | { type: 'UnitMoved'; unit: string; from: string; path: string[]; cost: number }
  | { type: 'DieRolled'; sides: number; value: number; purpose: string }
  | { type: 'PhaseChanged'; turn: number; phase: number }
  | { type: 'TurnStarted'; turn: number }
  | { type: 'CombatResolved'; hex: string; attackers: string[]; odds: string; shift: number; dice: [number, number]; drm: number; result: string }
  | { type: 'StepsLost'; unit: string; steps: number; damagedPool: boolean }
  | { type: 'UnitEliminated'; unit: string }
  | { type: 'Retreated'; units: string[]; path: string[] }
  | { type: 'RetreatLoss'; units: string[]; steps: number; reason: string }
  | { type: 'Advanced'; units: string[]; to: string }
  | { type: 'TurnEnded'; turn: number }
  | { type: 'DamagedSorted'; unit: string; hex: string; control: 'own' | 'contested' | 'enemy'; need: number; rolls: number[]; repaired: number; destroyed: number }
  | { type: 'Repaired'; unit: string; steps: number }
  | { type: 'Reinforced'; unit: string; hex: string }
  | { type: 'Assigned'; formation: string; from: string | null; to: string | null }
  | { type: 'GameOver'; turn: number };

/** 非法指令（例如单位不存在）：界面应提示玩家，不会改变状态 */
export class CommandError extends Error {}

export function initialState(scenario: string, first: Side, seed: number, deployment: Deployment | Scenario): GameState {
  const objectives = 'objectives' in deployment ? deployment.objectives : [];
  return {
    scenario, first, turn: 1, phase: 0, rng: createRng(seed), start: deployment.start,
    moved: [], movedThisTurn: [], foughtThisTurn: [], wonThisTurn: [], fatigue: {}, entrench: {}, attach: {}, attacked: [], attackedHexes: [], fired: [], advance: null,
    damaged: [], repair: [], destroyed: [], casualties: [], eliminated: [], over: false,
    owners: Object.fromEntries(objectives.map((o) => [o.hex, o.owner])),
    units: deployment.placements.map((p) => ({ id: p.unit, hex: p.hex, steps: p.steps ?? -1 })),
  };
}

/** 部署里没写步数的单位按满编补上，并跳过开头自动经过的阶段（需要规则数据，所以与 initialState 分开） */
export function withFullSteps(ctx: GameContext, s: GameState): GameState {
  const full = { ...s, units: s.units.map((u) => (u.steps > 0 ? u : { ...u, steps: ctx.oob.units.get(u.id)!.steps })) };
  return ctx.sequence.phases[full.phase]!.auto ? advancePhase(ctx, full, false).state : full;
}

/**
 * 结束当前阶段，进入下一个需要玩家操作的阶段；途中经过回合末时结算受损池与修理。
 * @param leave false = 不离开当前阶段（开局时当前阶段本身是自动阶段）
 */
function advancePhase(ctx: GameContext, s: GameState, leave = true): { state: GameState; events: GameEvent[] } {
  const P = ctx.sequence.phases;
  const events: GameEvent[] = [];
  const reset = { moved: [], attacked: [], attackedHexes: [], fired: [], advance: null };
  let cur: GameState = { ...s, ...reset };
  let first = leave;
  for (;;) {
    if (first) {
      const last = cur.phase + 1 >= P.length;
      if (last && ctx.scenario?.turns && cur.turn >= ctx.scenario.turns) {
        // 想定的最后一个回合结束：停在回合末
        cur = { ...cur, over: true };
        events.push({ type: 'GameOver', turn: cur.turn });
        break;
      }
      cur = last
        ? { ...cur, turn: cur.turn + 1, phase: 0, movedThisTurn: [], foughtThisTurn: [], wonThisTurn: [] }
        : { ...cur, phase: cur.phase + 1 };
      if (last) {
        events.push({ type: 'TurnStarted', turn: cur.turn });
        const r = startTurn(ctx, cur);
        cur = r.state;
        events.push(...r.events);
      }
    }
    first = true;
    const ph = P[cur.phase]!;
    if (ph.id === ctx.turns.damaged.phase) {
      events.push({ type: 'TurnEnded', turn: cur.turn });
      const r = endOfTurn(ctx, cur);
      cur = r.state;
      events.push(...r.events);
    }
    if (!ph.auto) break;
  }
  events.push({ type: 'PhaseChanged', turn: cur.turn, phase: cur.phase });
  return { state: cur, events };
}

export function apply(ctx: GameContext, s: GameState, cmd: Command): { state: GameState; events: GameEvent[] } {
  if (s.over) throw new CommandError('想定已经结束');
  // 推进的机会只保留到下一条指令
  if (cmd.type !== 'Advance' && s.advance) s = { ...s, advance: null };
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
        state: claim(ctx, { ...s, units, moved: [...s.moved, u.id], movedThisTurn: [...s.movedThisTurn, u.id] }, u.id, cmd.path),
        events: [{ type: 'UnitMoved', unit: u.id, from: u.hex, path: cmd.path, cost: r.cost }],
      };
    }
    case 'Attack': {
      const why = whyCannotAttack(ctx, s, cmd.attackers, cmd.hex, actingSide(ctx, s));
      if (why) throw new CommandError(why);
      return resolveAttack(ctx, s, cmd.attackers, cmd.hex);
    }
    case 'Advance':
      return resolveAdvance(ctx, s, cmd.units);
    case 'RollDie': {
      const [value, rng] = rollDie(s.rng, cmd.sides);
      return { state: { ...s, rng }, events: [{ type: 'DieRolled', sides: cmd.sides, value, purpose: cmd.purpose }] };
    }
    case 'Assign': {
      const why = whyCannotAssign(ctx, s, cmd.formation, cmd.parent, actingSide(ctx, s));
      if (why) throw new CommandError(why);
      const from = parentOf(ctx, s, cmd.formation);
      return {
        state: { ...s, attach: { ...s.attach, [cmd.formation]: { parent: cmd.parent, turn: s.turn } } },
        events: [{ type: 'Assigned', formation: cmd.formation, from, to: cmd.parent }],
      };
    }
    case 'EndPhase':
      return advancePhase(ctx, s);
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

