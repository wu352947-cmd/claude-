/**
 * 战斗（docs/02 §4、docs/10）：赔率 → 列偏移 → 2d6 + 骰子修正 → 查表 → 步数损失 / 撤退 / 推进。
 * 每一个列偏移和骰子修正都带说明与出处，界面原样显示（"修正明细可读"）。参数在 data/rules/combat.json。
 */
import { z } from 'zod';
import { type Direction, distance, hexId, inBounds, neighbor, parseHexId } from './hex';
import { Terrain, SideFeature, hexRecord, sideFeatures } from './map';
import { directionTo, sideOfUnit, stepCost, zocOf } from './movement';
import { nightBarred, whyNotExploit } from './calendar';
import type { GameContext, GameState, UnitState } from './game';
import type { Side } from './units';

const Result = z.string().regex(/^(A\d)?(D\d)?(R\d)?$/);
const withComment = <T extends z.ZodTypeAny>(v: T) => z.record(z.string(), z.union([z.string(), v]));

export const CombatRules = z.object({
  status: z.enum(['draft', 'approved']),
  dice: z.literal('2d6'),
  columns: z.array(z.object({ name: z.string(), min: z.number().positive() })).min(2),
  crt: z.record(z.string().regex(/^\d+$/), z.array(Result)),
  maxShift: z.number().int().nonnegative(),
  terrainShift: withComment(z.number().int()),
  sideShift: withComment(z.number().int()),
  armor: z.object({ armorTypes: z.array(z.string()), antiTankTypes: z.array(z.string()), openTerrain: z.array(Terrain), bonus: z.number().int(), balkaPenalty: z.number().int() }),
  combinedArms: z.object({ armorTypes: z.array(z.string()), infantryTypes: z.array(z.string()), bonus: z.number().int() }),
  artillery: z.object({ types: z.array(z.string()), range: z.number().int().positive(), pointsPerShift: z.number().positive(), maxShifts: z.number().int().nonnegative() }),
  defenseOnlyTypes: z.array(z.string()),
  qualityDrm: z.object({ perLevel: z.number().int(), max: z.number().int().nonnegative() }),
  retreat: z.object({ zocLoss: z.number().int().nonnegative(), blockedLoss: z.number().int().nonnegative() }),
  fortification: z.object({ $comment: z.string().optional(), shiftPerLevel: z.number().int().nonnegative() }),
  frontage: z.object({ $comment: z.string().optional(), maxAttackers: z.number().int().positive() }),
  advanceMax: z.number().int().positive(),
  combatPhases: z.array(z.string()),
}).superRefine((r, ctx) => {
  for (let roll = 2; roll <= 12; roll++) {
    if (r.crt[roll]?.length !== r.columns.length) ctx.addIssue({ code: 'custom', message: `战斗结果表第 ${roll} 行应有 ${r.columns.length} 列` });
  }
});
export type CombatRules = z.infer<typeof CombatRules>;

/** 一条修正：数值、说明、出处（界面直接显示） */
export interface Modifier { value: number; label: string; source: string }
export interface Outcome { a: number; d: number; r: number }
export const parseResult = (code: string): Outcome => ({
  a: Number(/A(\d)/.exec(code)?.[1] ?? 0), d: Number(/D(\d)/.exec(code)?.[1] ?? 0), r: Number(/R(\d)/.exec(code)?.[1] ?? 0),
});

export interface CombatPreview {
  attackers: { id: string; value: number }[];
  defenders: { id: string; value: number }[];
  attack: number;
  defense: number;
  ratio: number;
  /** 基础列（-1 = 低于最左列，不能进攻） */
  baseColumn: number;
  shifts: Modifier[];
  column: number;
  drms: Modifier[];
  drm: number;
  /** 本列各结果的概率（2d6 加修正后） */
  outcomes: { code: string; p: number }[];
  /** 参与支援的炮兵 */
  support: { attacker: string[]; defender: string[] };
}

const C_F = (ctx: GameContext) => ctx.turns.fatigue;
const unitOf = (ctx: GameContext, id: string) => ctx.oob.units.get(id)!;
/** 按剩余步数折算的当前攻/防 */
export const currentValue = (ctx: GameContext, u: UnitState, kind: 'attack' | 'defense'): number => {
  const unit = unitOf(ctx, u.id);
  return (unit.ratings[kind] * u.steps) / unit.steps;
};
const r2 = (x: number): number => Math.round(x * 100) / 100;
const RULE = 'data/rules/combat.json';

/** 能进攻这一格的本方单位（相邻、能进攻、本阶段还没进攻过；夜间不含机动单位；发展阶段只限可发展的单位） */
export function eligibleAttackers(ctx: GameContext, s: GameState, hex: string, side: Side): string[] {
  const h = parseHexId(hex);
  return s.units.filter((u) => sideOfUnit(ctx, u.id) === side && distance(parseHexId(u.hex), h) === 1
    && !ctx.combat.defenseOnlyTypes.includes(unitOf(ctx, u.id).type) && !s.attacked.includes(u.id)
    && !nightBarred(ctx, s, u.id) && !whyNotExploit(ctx, s, u.id)).map((u) => u.id);
}

/** 射程内能支援的炮兵 */
export function supportingArtillery(ctx: GameContext, s: GameState, hex: string, side: Side): string[] {
  const A = ctx.combat.artillery;
  const h = parseHexId(hex);
  return s.units.filter((u) => sideOfUnit(ctx, u.id) === side && A.types.includes(unitOf(ctx, u.id).type)
    && distance(parseHexId(u.hex), h) <= A.range && !s.fired.includes(u.id) && !s.movedThisTurn.includes(u.id)).map((u) => u.id);
}

/** 不能进攻的原因；可以返回 null */
export function whyCannotAttack(ctx: GameContext, s: GameState, attackers: readonly string[], hex: string, side: Side | null): string | null {
  const phase = ctx.sequence.phases[s.phase]!;
  if (!ctx.combat.combatPhases.includes(phase.id)) return `${phase.name}不能进攻`;
  if (!side) return '本阶段没有行动方';
  const defenders = s.units.filter((u) => u.hex === hex);
  if (!defenders.length) return `${hex} 没有部队`;
  if (defenders.some((u) => sideOfUnit(ctx, u.id) === side)) return `${hex} 是本方部队`;
  if (s.attackedHexes.includes(hex)) return '这一格本阶段已经被进攻过';
  if (!attackers.length) return '没有选择进攻单位';
  for (const a of attackers) if (nightBarred(ctx, s, a)) return `夜间回合机动单位不能发起进攻（${unitOf(ctx, a)?.names.zh ?? a}）`;
  for (const a of attackers) { const ex = whyNotExploit(ctx, s, a); if (ex) return `${unitOf(ctx, a)?.names.zh ?? a}：${ex}`; }
  const ok = new Set(eligibleAttackers(ctx, s, hex, side));
  for (const a of attackers) if (!ok.has(a)) return `${unitOf(ctx, a)?.names.zh ?? a} 不能参加这次进攻（不相邻、不能进攻或已进攻过）`;
  if (new Set(attackers).size !== attackers.length) return '进攻单位重复';
  if (attackers.length > ctx.combat.frontage.maxAttackers) return `正面限制：一次进攻最多 ${ctx.combat.frontage.maxAttackers} 个单位，现在选了 ${attackers.length} 个`;
  return null;
}

/** 赔率预览（也是结算时用的同一套计算） */
export function previewCombat(ctx: GameContext, s: GameState, attackers: readonly string[], hex: string): CombatPreview {
  const C = ctx.combat;
  const atk = attackers.map((id) => s.units.find((u) => u.id === id)!);
  const def = s.units.filter((u) => u.hex === hex);
  const side = sideOfUnit(ctx, atk[0]!.id);
  const enemy: Side = side === 'DE' ? 'SU' : 'DE';
  const attackersV = atk.map((u) => ({ id: u.id, value: r2(currentValue(ctx, u, 'attack')) }));
  const defendersV = def.map((u) => ({ id: u.id, value: r2(currentValue(ctx, u, 'defense')) }));
  const attack = attackersV.reduce((a, x) => a + x.value, 0);
  const defense = Math.max(0.5, defendersV.reduce((a, x) => a + x.value, 0));
  const ratio = attack / defense;
  let baseColumn = -1;
  C.columns.forEach((c, i) => { if (ratio >= c.min) baseColumn = i; });

  const shifts: Modifier[] = [];
  const h = parseHexId(hex);
  const terrain = hexRecord(ctx.map, h).terrain;
  const tShift = C.terrainShift[terrain];
  if (typeof tShift === 'number' && tShift) shifts.push({ value: tShift, label: `守方地形：${TERRAIN_ZH[terrain]}`, source: `${RULE} terrainShift（02 §2）` });
  // 格边：所有攻方都隔着同一种格边才算
  const sidesOf = (u: UnitState): SideFeature[] => sideFeatures(ctx.map, parseHexId(u.hex), directionTo(parseHexId(u.hex), h) as Direction);
  for (const f of SideFeature.options) {
    const v = C.sideShift[f];
    if (typeof v === 'number' && v && atk.every((u) => sidesOf(u).includes(f))) shifts.push({ value: v, label: `隔着${SIDE_ZH[f]}进攻`, source: `${RULE} sideShift（02 §2）` });
  }
  const typeOf = (u: UnitState): string => unitOf(ctx, u.id).type;
  const armorAtk = atk.filter((u) => C.armor.armorTypes.includes(typeOf(u)) && ['medium', 'heavy'].includes(unitOf(ctx, u.id).derived?.armorClass ?? ''));
  if (C_F(ctx).shiftPerLevel) {
    const w = attackersV.reduce((a, x) => a + x.value, 0) || 1;
    const lvl = Math.floor(attackersV.reduce((a, x) => a + (s.fatigue[x.id] ?? 0) * x.value, 0) / w);
    if (lvl > 0) shifts.push({ value: -lvl * C_F(ctx).shiftPerLevel, label: `攻方疲劳（${lvl} 级）：连续进攻的部队越打越乏`, source: 'data/rules/turns.json fatigue（02 §3）' });
  }
  const fort = ctx.scenario?.fortifications.find((f) => f.hex === hex && f.side === enemy);
  if (fort && C.fortification.shiftPerLevel) {
    shifts.push({ value: -fort.level * C.fortification.shiftPerLevel, label: `守方工事：${fort.name}（${fort.level} 级）`, source: `${RULE} fortification（02 §5；位置：${fort.confidence === 'sourced' ? '有出处' : '推定'}）` });
  }
  if (armorAtk.length && C.armor.openTerrain.includes(terrain) && !def.some((u) => C.armor.antiTankTypes.includes(typeOf(u)))) {
    shifts.push({ value: C.armor.bonus, label: '装甲效应：开阔地、守方没有反坦克力量', source: `${RULE} armor（02 §4.2）` });
  }
  if (armorAtk.some((u) => sidesOf(u).includes('balka'))) shifts.push({ value: C.armor.balkaPenalty, label: '装甲隔冲沟进攻', source: `${RULE} armor（02 §2）` });
  const formations = new Set(atk.map((u) => unitOf(ctx, u.id).formation));
  for (const f of formations) {
    const mine = atk.filter((u) => unitOf(ctx, u.id).formation === f);
    if (mine.some((u) => C.combinedArms.armorTypes.includes(typeOf(u))) && mine.some((u) => C.combinedArms.infantryTypes.includes(typeOf(u)))) {
      shifts.push({ value: C.combinedArms.bonus, label: `诸兵种合成：${ctx.oob.formations.get(f)!.names.zh}的装甲与步兵一同进攻`, source: `${RULE} combinedArms（02 §4.3）` });
      break;
    }
  }
  const artShift = (ids: string[]): number => Math.min(C.artillery.maxShifts,
    Math.floor(ids.reduce((a, id) => a + unitOf(ctx, id).ratings.attack, 0) / C.artillery.pointsPerShift));
  const support = { attacker: supportingArtillery(ctx, s, hex, side), defender: supportingArtillery(ctx, s, hex, enemy) };
  const as = artShift(support.attacker), ds = artShift(support.defender);
  if (as) shifts.push({ value: as, label: `攻方炮兵支援（${support.attacker.length} 个炮兵单位）`, source: `${RULE} artillery（08 §3.4）` });
  if (ds) shifts.push({ value: -ds, label: `守方炮兵支援（${support.defender.length} 个炮兵单位）`, source: `${RULE} artillery（08 §3.4）` });

  const total = shifts.reduce((a, m) => a + m.value, 0);
  const clamped = Math.max(-C.maxShift, Math.min(C.maxShift, total));
  if (clamped !== total) shifts.push({ value: clamped - total, label: `列偏移合计最多 ±${C.maxShift}`, source: `${RULE} maxShift` });
  const column = baseColumn < 0 ? -1 : Math.max(0, Math.min(C.columns.length - 1, baseColumn + clamped));

  const drms: Modifier[] = [];
  const bestQ = (us: UnitState[]): number => Math.max(...us.map((u) => unitOf(ctx, u.id).quality));
  const q = Math.max(-C.qualityDrm.max, Math.min(C.qualityDrm.max, (bestQ(atk) - bestQ(def)) * C.qualityDrm.perLevel));
  if (q) drms.push({ value: q, label: `素质：攻方最高 ${bestQ(atk)} 级，守方最高 ${bestQ(def)} 级`, source: `${RULE} qualityDrm（08 §6）` });
  const drm = drms.reduce((a, m) => a + m.value, 0);

  const outcomes: { code: string; p: number }[] = [];
  if (column >= 0) {
    for (let d1 = 1; d1 <= 6; d1++) for (let d2 = 1; d2 <= 6; d2++) {
      const code = C.crt[Math.max(2, Math.min(12, d1 + d2 + drm))]![column]!;
      const o = outcomes.find((x) => x.code === code);
      if (o) o.p += 1 / 36; else outcomes.push({ code, p: 1 / 36 });
    }
  }
  return { attackers: attackersV, defenders: defendersV, attack: r2(attack), defense: r2(defense), ratio: r2(ratio), baseColumn, shifts, column, drms, drm, outcomes, support };
}

const TERRAIN_ZH: Record<string, string> = { clear: '开阔地', woods: '林地', village: '村庄', town: '镇', city: '城市', marsh: '沼泽', water: '水面' };
const SIDE_ZH: Record<string, string> = { stream: '溪流', minorRiver: '小河', majorRiver: '大河', balka: '冲沟', railEmbankment: '铁路路堤' };

/**
 * 撤退路线（全格一起退）：每一步在可通行、无敌军的相邻格里，先选不在敌控制区的，再选离攻方最远的，再按格号。
 * 返回走过的格子和因退入敌控制区 / 无路可退而要损失的步数（每个单位）。
 */
export function retreatPath(ctx: GameContext, s: GameState, hex: string, hexes: number, attackerSide: Side, attackers: readonly string[]): { path: string[]; extraLoss: number } {
  const units = s.units.filter((u) => u.hex === hex);
  const zoc = zocOf(ctx, s, attackerSide);
  const enemyHexes = new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) === attackerSide).map((u) => u.hex));
  const from = s.units.filter((u) => attackers.includes(u.id)).map((u) => parseHexId(u.hex));
  const path: string[] = [];
  let at = parseHexId(hex);
  let extraLoss = 0;
  for (let i = 0; i < hexes; i++) {
    const options: { id: string; zoc: boolean; dist: number }[] = [];
    for (let d = 0; d < 6; d++) {
      const n = neighbor(at, d as Direction);
      const id = hexId(n);
      if (!inBounds(ctx.map.grid, n) || enemyHexes.has(id) || path.includes(id) || id === hex) continue;
      if (units.some((u) => stepCost(ctx, unitOf(ctx, u.id).mobility, at, n) === null)) continue;
      options.push({ id, zoc: zoc.has(id), dist: Math.min(...from.map((f) => distance(f, n))) });
    }
    options.sort((a, b) => Number(a.zoc) - Number(b.zoc) || b.dist - a.dist || (a.id < b.id ? -1 : 1));
    const pick = options[0];
    if (!pick) { extraLoss += (hexes - i) * ctx.combat.retreat.blockedLoss; break; }
    if (pick.zoc) extraLoss += ctx.combat.retreat.zocLoss;
    path.push(pick.id);
    at = parseHexId(pick.id);
  }
  return { path, extraLoss };
}
