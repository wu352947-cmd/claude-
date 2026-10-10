/**
 * 想定（docs/12）：在部署之外规定回合数、每回合的主动方、增援、胜利目标与胜利点（docs/01 §7"与历史比"）。
 * 没写这些字段的部署（如演示摆放）照常可玩：不限回合、没有增援与胜利点。
 */
import { z } from 'zod';
import { distance, hexId, inBounds, parseHexId } from './hex';
import { hexRecord } from './map';
import { sideOfUnit } from './movement';
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
    /** 每一步完全损失给对方的胜利点（德军得分 = 德占目标 + 苏军损失 × SU − 德军损失 × DE） */
    lossVp: z.object({ DE: z.number().nonnegative(), SU: z.number().nonnegative() }),
    /** 历史结果按同一公式算出的德军得分；null = 还没校准 */
    baseline: z.number().nullable(),
    baselineNote: z.string(),
    /** 德军得分 − 历史基准 ≥ min 就是这一档（从高到低排列，最后一档 min 为 null） */
    bands: z.array(z.object({ min: z.number().nullable(), label: z.string().min(1) })).min(2),
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
  if (sc.victory && sc.victory.bands.at(-1)!.min !== null) throw new Error('胜负档位最后一档的 min 应为 null');
  return sc;
}

/** 单位经过这些格子：其中的目标格归这一方 */
export function claim(ctx: GameContext, s: GameState, unitId: string, hexes: readonly string[]): GameState {
  const objs = ctx.scenario?.objectives ?? [];
  if (!objs.length) return s;
  const side = sideOfUnit(ctx, unitId);
  let owners = s.owners;
  for (const h of hexes) {
    if (owners[h] && owners[h] !== side && objs.some((o) => o.hex === h)) owners = { ...owners, [h]: side };
  }
  return owners === s.owners ? s : { ...s, owners };
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
    s = claim(ctx, s, r.unit, [hex]);
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

export interface Score {
  /** 德军占领的目标 */
  objectives: { hex: string; name: string; vp: number; owner: Side }[];
  objectiveVp: number;
  /** 双方装甲完全损失的步数（回合末分流后报废的；胜利点只计这个，01 §7.2） */
  lost: Record<Side, number>;
  /** 其他兵种的步数损失（不计胜利点，战后报告里单列） */
  lostOther: Record<Side, number>;
  lossVp: number;
  total: number;
  /** 与历史基准之差；没有基准时为 null */
  delta: number | null;
  /** 胜负档位；没有基准时为 null */
  band: string | null;
}

export function score(ctx: GameContext, s: GameState): Score | null {
  const sc = ctx.scenario;
  if (!sc?.victory) return null;
  const V = sc.victory;
  const objectives = sc.objectives.map((o) => ({ hex: o.hex, name: o.name, vp: o.vp, owner: s.owners[o.hex] ?? o.owner }));
  const objectiveVp = objectives.filter((o) => o.owner === 'DE').reduce((a, o) => a + o.vp, 0);
  const lost: Record<Side, number> = { DE: 0, SU: 0 };
  for (const x of s.destroyed) lost[sideOfUnit(ctx, x.unit)] += x.steps;
  const lostOther: Record<Side, number> = { DE: 0, SU: 0 };
  for (const x of s.casualties) lostOther[sideOfUnit(ctx, x.unit)] += x.steps;
  const lossVp = lost.SU * V.lossVp.SU - lost.DE * V.lossVp.DE;
  const total = objectiveVp + lossVp;
  const delta = V.baseline === null ? null : total - V.baseline;
  const band = delta === null ? null : V.bands.find((b) => b.min === null || delta >= b.min)!.label;
  return { objectives, objectiveVp, lost, lostOther, lossVp, total, delta, band };
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
