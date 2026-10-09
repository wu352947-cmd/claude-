/**
 * 部队：编制（师/军，决定师属色条）、单位（算子）、部署（哪个单位在哪一格）。
 * 数据文件在 data/units/ 与 data/scenarios/，加载时用 Zod 校验并检查相互引用。
 *
 * 史料纪律：番号、兵力、数值、位置都是历史数据。尚未考据的标 confidence = "placeholder"，
 * 界面以灰色斜体显示；考据过的标 "sourced"，并且必须在 provenance 里写明出处。
 */
import { z } from 'zod';
import { type HexGrid, type Offset, hexId, inBounds, parseHexId } from './hex';

export const Side = z.enum(['DE', 'SU']);
export type Side = z.infer<typeof Side>;
export const SIDE_NAMES: Record<Side, string> = { DE: '德军', SU: '苏军' };

/** 军种：决定算子底色（德国陆军原野灰、武装党卫军深灰、红军赭色） */
export const Branch = z.enum(['heer', 'waffen-ss', 'rkka']);
export type Branch = z.infer<typeof Branch>;

/** 兵种：决定北约兵种符号 */
export const UNIT_TYPES = [
  'armor', 'panzergrenadier', 'motorized-infantry', 'infantry', 'airborne', 'recon',
  'artillery', 'sp-artillery', 'antitank', 'tank-destroyer',
] as const;
export const UnitType = z.enum(UNIT_TYPES);
export type UnitType = z.infer<typeof UnitType>;
export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  armor: '装甲/坦克', panzergrenadier: '装甲掷弹兵/机械化步兵', 'motorized-infantry': '摩托化步兵', infantry: '步兵',
  airborne: '空降兵', recon: '侦察', artillery: '炮兵', 'sp-artillery': '自行火炮', antitank: '反坦克', 'tank-destroyer': '坦克歼击车',
};

/** 规模：决定符号上方的规模标记（|| 营、||| 团、X 旅、XX 师） */
export const UnitSize = z.enum(['battalion', 'regiment', 'brigade', 'division']);
export type UnitSize = z.infer<typeof UnitSize>;
export const UNIT_SIZE_NAMES: Record<UnitSize, string> = { battalion: '营', regiment: '团', brigade: '旅', division: '师' };

export const Confidence = z.enum(['placeholder', 'sourced']);
export type Confidence = z.infer<typeof Confidence>;
export const CONFIDENCE_NAMES: Record<Confidence, string> = { placeholder: '占位（未考据）', sourced: '有出处' };

/** 一条出处：哪个字段、哪个史料（sources.csv 的 ID）、页码、级别 */
export const Provenance = z.object({
  field: z.string().min(1),
  source: z.string().regex(/^SRC-\d{4}$/, '史料 ID 形如 SRC-0001'),
  page: z.string().optional(),
  grade: z.enum(['A', 'B', 'C', 'D']).optional(),
  note: z.string().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

const Names = z.object({
  zh: z.string().min(1), en: z.string().min(1), de: z.string().optional(), ru: z.string().optional(),
});
const Color = z.string().regex(/^#[0-9a-f]{6}$/i, '颜色形如 #a1b2c3');

/** 编制：师、军等，同一编制的单位共用一条色条 */
export const Formation = z.object({
  id: z.string().min(1),
  side: Side,
  branch: Branch,
  names: Names,
  /** 色条上的简称 */
  abbr: z.string().min(1).max(10),
  color: Color,
  /** 近卫（苏军），色条上加"Гв"标记 */
  guards: z.boolean().default(false),
  confidence: Confidence,
  provenance: z.array(Provenance).default([]),
  note: z.string().optional(),
});
export type Formation = z.infer<typeof Formation>;

export const Ratings = z.object({
  attack: z.number().int().min(0).max(99),
  defense: z.number().int().min(0).max(99),
  movement: z.number().int().min(0).max(99),
});
export type Ratings = z.infer<typeof Ratings>;

export const Unit = z.object({
  id: z.string().min(1),
  formation: z.string().min(1),
  names: Names,
  /** 算子上印的番号（简短） */
  designation: z.string().min(1).max(8),
  type: UnitType,
  size: UnitSize,
  /** 满编步数（每损失一步，战斗力下降） */
  steps: z.number().int().min(1).max(6),
  ratings: Ratings,
  /** 数值（步数、攻防移动）的考据状态 */
  confidence: Confidence,
  provenance: z.array(Provenance).default([]),
  note: z.string().optional(),
});
export type Unit = z.infer<typeof Unit>;

export const OobFile = z.object({
  $comment: z.string().optional(),
  formations: z.array(Formation),
  units: z.array(Unit),
});

/** 部署：单位在哪一格；同格多个单位按列表顺序堆叠，后列出的在上面 */
export const Placement = z.object({
  unit: z.string().min(1),
  hex: z.string().regex(/^\d{4}$/, '格号必须是 4 位数字'),
  /** 当前剩余步数（不写 = 满编） */
  steps: z.number().int().min(1).optional(),
});
export type Placement = z.infer<typeof Placement>;

export const DeploymentFile = z.object({
  $comment: z.string().optional(),
  id: z.string().min(1),
  names: z.object({ zh: z.string().min(1), en: z.string().min(1) }),
  confidence: Confidence,
  provenance: z.array(Provenance).default([]),
  note: z.string().optional(),
  placements: z.array(Placement),
});
export type Deployment = z.infer<typeof DeploymentFile>;

export interface Oob {
  formations: Map<string, Formation>;
  units: Map<string, Unit>;
}

/** 已部署单位（含当前步数） */
export interface PlacedUnit {
  unit: Unit;
  formation: Formation;
  hex: Offset;
  steps: number;
}

export function loadOob(raw: unknown): Oob {
  const data = OobFile.parse(raw);
  const formations = new Map<string, Formation>();
  for (const f of data.formations) {
    if (formations.has(f.id)) throw new Error(`编制 ID 重复：${f.id}`);
    if ((f.branch === 'rkka') !== (f.side === 'SU')) throw new Error(`编制 ${f.id}：军种与阵营不符`);
    if (f.confidence === 'sourced' && f.provenance.length === 0) throw new Error(`编制 ${f.id} 标为有出处，但没有写出处`);
    formations.set(f.id, f);
  }
  const units = new Map<string, Unit>();
  for (const u of data.units) {
    if (units.has(u.id) || formations.has(u.id)) throw new Error(`单位 ID 重复：${u.id}`);
    if (!formations.has(u.formation)) throw new Error(`单位 ${u.id} 所属编制 ${u.formation} 不存在`);
    if (u.confidence === 'sourced' && u.provenance.length === 0) throw new Error(`单位 ${u.id} 标为有出处，但没有写出处`);
    units.set(u.id, u);
  }
  return { formations, units };
}

/** 读取部署并检查：单位存在、只出现一次、格子在地图内、步数不超过满编 */
export function loadDeployment(oob: Oob, grid: HexGrid, raw: unknown): { deployment: Deployment; placed: PlacedUnit[] } {
  const deployment = DeploymentFile.parse(raw);
  const seen = new Set<string>();
  const placed = deployment.placements.map((p) => {
    const unit = oob.units.get(p.unit);
    if (!unit) throw new Error(`部署中的单位 ${p.unit} 不存在`);
    if (seen.has(p.unit)) throw new Error(`单位 ${p.unit} 部署了两次`);
    seen.add(p.unit);
    const hex = parseHexId(p.hex);
    if (!inBounds(grid, hex)) throw new Error(`单位 ${p.unit} 的格子 ${p.hex} 不在地图内`);
    const steps = p.steps ?? unit.steps;
    if (steps > unit.steps) throw new Error(`单位 ${p.unit} 当前步数 ${steps} 超过满编 ${unit.steps}`);
    return { unit, formation: oob.formations.get(unit.formation)!, hex, steps };
  });
  return { deployment, placed };
}

/** 按格分组成堆叠：键为格号，数组从下到上 */
export function stacks(placed: readonly PlacedUnit[]): Map<string, PlacedUnit[]> {
  const out = new Map<string, PlacedUnit[]>();
  for (const p of placed) {
    const k = hexId(p.hex);
    const s = out.get(k);
    if (s) s.push(p); else out.set(k, [p]);
  }
  return out;
}
