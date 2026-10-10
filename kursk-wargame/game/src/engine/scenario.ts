/**
 * 想定（docs/12）：在部署之外规定回合数、每回合的主动方、增援、胜利目标与胜利点（docs/01 §7"与历史比"）。
 * 没写这些字段的部署（如演示摆放）照常可玩：不限回合、没有增援与胜利点。
 */
import { z } from 'zod';
import { distance, hexId, inBounds, parseHexId } from './hex';
import { hexRecord } from './map';
import { sideOfUnit } from './movement';
import { ScenarioSupply } from './supply';
import type { GameContext, GameEvent, GameState } from './game';
import { type Oob, DeploymentFile, Side } from './units';
import type { HexGrid } from './hex';

const Hex = z.string().regex(/^\d{4}$/, '格号必须是 4 位数字');
/** 想定里的考据说明：引用 sources.csv 的 ID 与页码，原文摘录 */
const Prov = z.object({ source: z.string(), page: z.string().optional(), quote: z.string().optional() });
const Held = z.enum(['DE', 'SU', 'contested']);

export const ScenarioFile = DeploymentFile.extend({
  /** 共几个回合（不写 = 不限） */
  turns: z.number().int().positive().optional(),
  /** 每回合的主动方（第 1 回合起；没写到的回合沿用 first） */
  initiative: z.array(Side).default([]),
  initiativeNote: z.string().optional(),
  /** 没有查到开局位置、因此没有放进想定的单位（照实列出，不凭空放） */
  omitted: z.array(z.string()).default([]),
  /** 增援：第 turn 回合开始时出现在 hex（被敌军占住时放到最近的空格） */
  reinforcements: z.array(z.object({
    unit: z.string().min(1), turn: z.number().int().min(2), hex: Hex, steps: z.number().int().min(1).optional(),
    note: z.string().optional(), provenance: z.array(Prov).default([]),
  })).default([]),
  /** 胜利目标：开局归 owner；之后哪一方的单位最后进入（经过）就归哪一方 */
  objectives: z.array(z.object({ hex: Hex, name: z.string().min(1), vp: z.number().int().positive(), owner: Side, note: z.string().optional() })).default([]),
  /** 工事：该格守方（side）获得每级一个列偏移（combat.json fortification）。位置与等级须有出处，没有出处的标 placeholder */
  /** 各方的后方边缘（补给线连回这些地图边缘）；不写 = 不启用补给规则 */
  supply: ScenarioSupply.optional(),
  fortifications: z.array(z.object({
    hex: Hex, side: Side, level: z.number().int().min(1).max(3), name: z.string().min(1),
    confidence: z.enum(['sourced', 'estimated', 'placeholder']), basis: z.string().min(1), provenance: z.array(Prov).default([]),
  })).default([]),
  /** 历史结局（战后报告用）：某个目标格在历史上最后归谁；contested = 史料互相矛盾或交替易手 */
  history: z.object({
    date: z.string(),
    time: z.string(),
    control: z.array(z.object({ hex: Hex, name: z.string().min(1), heldBy: Held, note: z.string().optional(), provenance: z.array(Prov).default([]) })),
    losses: z.array(z.object({ label: z.string().min(1), text: z.string().min(1), provenance: z.array(Prov).default([]) })).default([]),
    note: z.string().optional(),
  }).optional(),
  victory: z.object({
    $comment: z.string().optional(),
    /** 关键目标格（必须是目标格之一） */
    key: Hex,
    /** 从上到下判定，第一条满足的就是结果；最后一条没有条件，作为兜底 */
    results: z.array(z.object({
      label: z.string().min(1),
      winner: Side.nullable(),
      when: z.object({
        /** 关键目标：DE = 德军占着，notDE = 德军没占着 */
        key: z.enum(['DE', 'notDE']).optional(),
        /** 德军占着的目标点数下限 / 上限（含） */
        deVpMin: z.number().optional(),
        deVpMax: z.number().optional(),
      }).default({}),
    })).min(2),
  }).optional(),
});
export type Scenario = z.infer<typeof ScenarioFile>;

/** 读取想定并检查增援与目标 */
export function loadScenario(oob: Oob, grid: HexGrid, raw: unknown): Scenario {
  const sc = ScenarioFile.parse(raw);
  const placed = new Set(sc.placements.map((p) => p.unit));
  for (const r of sc.reinforcements) {
    const u = oob.units.get(r.unit);
    if (!u) throw new Error(`增援单位 ${r.unit} 不存在`);
    if (placed.has(r.unit)) throw new Error(`单位 ${r.unit} 既在开局部署又是增援`);
    placed.add(r.unit);
    if (!inBounds(grid, parseHexId(r.hex))) throw new Error(`增援 ${r.unit} 的格子 ${r.hex} 不在地图内`);
    if ((r.steps ?? 0) > u.steps) throw new Error(`增援 ${r.unit} 步数超过满编`);
    if (sc.turns && r.turn > sc.turns) throw new Error(`增援 ${r.unit} 在第 ${r.turn} 回合，想定只有 ${sc.turns} 回合`);
  }
  // 开局时敌对双方不能同格；目标格上有部队时，归属必须是那一方
  const sideAt = new Map<string, Side>();
  for (const p of sc.placements) {
    const side = oob.formations.get(oob.units.get(p.unit)!.formation)!.side;
    const prev = sideAt.get(p.hex);
    if (prev && prev !== side) throw new Error(`格子 ${p.hex} 开局时德苏双方都有部队`);
    sideAt.set(p.hex, side);
  }
  for (const o of sc.objectives) {
    const at = sideAt.get(o.hex);
    if (at && at !== o.owner) throw new Error(`目标 ${o.name}（${o.hex}）开局被${at}部队占着，归属却写成 ${o.owner}`);
  }
  const fseen = new Set<string>();
  for (const f of sc.fortifications) {
    if (!inBounds(grid, parseHexId(f.hex))) throw new Error(`工事 ${f.name} 的格子 ${f.hex} 不在地图内`);
    if (fseen.has(`${f.hex}${f.side}`)) throw new Error(`工事格 ${f.hex} 重复`);
    fseen.add(`${f.hex}${f.side}`);
    if (f.confidence === 'sourced' && !f.provenance.length) throw new Error(`工事 ${f.name} 标为有出处却没有 provenance`);
  }
  const seen = new Set<string>();
  for (const o of sc.objectives) {
    if (seen.has(o.hex)) throw new Error(`目标格 ${o.hex} 重复`);
    seen.add(o.hex);
    if (!inBounds(grid, parseHexId(o.hex))) throw new Error(`目标 ${o.name} 的格子 ${o.hex} 不在地图内`);
  }
  if (sc.victory) {
    if (!sc.objectives.some((o) => o.hex === sc.victory!.key)) throw new Error(`关键目标 ${sc.victory.key} 不是目标格`);
    if (Object.keys(sc.victory.results.at(-1)!.when).length) throw new Error('胜负判定的最后一条应该没有条件（兜底）');
  }
  return sc;
}

/**
 * 回合末：目标格上只有一方的部队，这一格就归这一方（只是路过、没停在上面不算；格子空了归属不变）。
 * 返回新状态和"占领"事件。
 */
export function claimHeld(ctx: GameContext, s: GameState): { state: GameState; events: GameEvent[] } {
  let owners = s.owners;
  const events: GameEvent[] = [];
  for (const o of ctx.scenario?.objectives ?? []) {
    const sides = new Set(s.units.filter((u) => u.hex === o.hex).map((u) => sideOfUnit(ctx, u.id)));
    const side = sides.size === 1 ? [...sides][0]! : null;
    if (side && owners[o.hex] !== side) { owners = { ...owners, [o.hex]: side }; events.push({ type: 'ObjectiveClaimed', hex: o.hex, side }); }
  }
  return { state: owners === s.owners ? s : { ...s, owners }, events };
}

/** 新回合开始：换主动方、放增援 */
export function startTurn(ctx: GameContext, s0: GameState): { state: GameState; events: GameEvent[] } {
  const sc = ctx.scenario;
  if (!sc) return { state: s0, events: [] };
  let s: GameState = { ...s0, first: sc.initiative[s0.turn - 1] ?? s0.first };
  const events: GameEvent[] = [];
  for (const r of sc.reinforcements.filter((x) => x.turn === s.turn)) {
    const side = sideOfUnit(ctx, r.unit);
    const hex = entryHex(ctx, s, r.hex, side);
    if (!hex) continue;
    s = { ...s, units: [...s.units, { id: r.unit, hex, steps: r.steps ?? ctx.oob.units.get(r.unit)!.steps }] };
    events.push({ type: 'Reinforced', unit: r.unit, hex });
  }
  return { state: s, events };
}

/** 增援进入的格子：原定格没有敌军就用它，否则取最近的没有敌军的格子（同距离按格号） */
function entryHex(ctx: GameContext, s: GameState, hex: string, side: Side): string | null {
  const enemy = new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) !== side).map((u) => u.hex));
  if (!enemy.has(hex)) return hex;
  const h = parseHexId(hex);
  const g = ctx.map.grid;
  let best: string | null = null, bd = Infinity;
  for (let col = 0; col < g.cols; col++) for (let row = 0; row < g.rows; row++) {
    const id = hexId({ col, row });
    if (enemy.has(id) || hexRecord(ctx.map, { col, row }).terrain === 'water') continue;
    const d = distance(h, { col, row });
    if (d < bd || (d === bd && best !== null && id < best)) { best = id; bd = d; }
  }
  return best;
}

export interface VictoryOutcome { label: string; winner: Side | null }
export interface Score {
  objectives: { hex: string; name: string; vp: number; owner: Side }[];
  /** 德军占着的目标点数 */
  objectiveVp: number;
  /** 关键目标现在归德军吗 */
  keyHeld: boolean;
  /** 双方装甲完全损失的步数（回合末分流后报废的；只作参考，不决定胜负） */
  lost: Record<Side, number>;
  /** 其他兵种的步数损失（参考） */
  lostOther: Record<Side, number>;
  /** 按现在的局面算出的结果（对局没结束时是"如果现在结束"） */
  outcome: VictoryOutcome;
}

export function score(ctx: GameContext, s: GameState): Score | null {
  const sc = ctx.scenario;
  if (!sc?.victory) return null;
  const V = sc.victory;
  const objectives = sc.objectives.map((o) => ({ hex: o.hex, name: o.name, vp: o.vp, owner: s.owners[o.hex] ?? o.owner }));
  const objectiveVp = objectives.filter((o) => o.owner === 'DE').reduce((a, o) => a + o.vp, 0);
  const keyHeld = objectives.find((o) => o.hex === V.key)?.owner === 'DE';
  const lost: Record<Side, number> = { DE: 0, SU: 0 };
  for (const x of s.destroyed) lost[sideOfUnit(ctx, x.unit)] += x.steps;
  const lostOther: Record<Side, number> = { DE: 0, SU: 0 };
  for (const x of s.casualties) lostOther[sideOfUnit(ctx, x.unit)] += x.steps;
  const hit = V.results.find((r) => (r.when.key === undefined || (r.when.key === 'DE') === keyHeld)
    && (r.when.deVpMin === undefined || objectiveVp >= r.when.deVpMin) && (r.when.deVpMax === undefined || objectiveVp <= r.when.deVpMax)) ?? V.results.at(-1)!;
  return { objectives, objectiveVp, keyHeld, lost, lostOther, outcome: { label: hit.label, winner: hit.winner } };
}

export interface HistoryRow { hex: string; name: string; history: Side | 'contested'; game: Side; same: boolean; note?: string }
export interface HistoryReport {
  date: string;
  time: string;
  rows: HistoryRow[];
  /** 与历史结局归属一致的目标格数 / 可比较的目标格数（历史上交替易手的不计） */
  agree: number;
  comparable: number;
  /** 游戏里双方装甲完全损失的步数 */
  lost: Record<Side, number>;
  /** 其他兵种的步数损失 */
  lostOther: Record<Side, number>;
  losses: { label: string; text: string; provenance: { source: string; page?: string; quote?: string }[] }[];
  note?: string;
}

/** 战后报告"与历史对比"：目标格最终归属对照历史结局，并列出各说法的历史损失（口径不同，不直接折算） */
export function historyReport(ctx: GameContext, s: GameState): HistoryReport | null {
  const H = ctx.scenario?.history;
  if (!H) return null;
  const rows = H.control.map((c) => {
    const game = s.owners[c.hex] ?? ctx.scenario!.objectives.find((o) => o.hex === c.hex)?.owner ?? 'SU';
    return { hex: c.hex, name: c.name, history: c.heldBy, game, same: c.heldBy === game, note: c.note };
  });
  const comparable = rows.filter((r) => r.history !== 'contested');
  const sc = score(ctx, s);
  const zero: Record<Side, number> = { DE: 0, SU: 0 };
  return { date: H.date, time: H.time, rows, agree: comparable.filter((r) => r.same).length, comparable: comparable.length, lost: sc?.lost ?? zero, lostOther: sc?.lostOther ?? zero, losses: H.losses, note: H.note };
}
