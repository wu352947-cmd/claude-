/**
 * 单位数值换算（docs/08-单位数值换算公式.md）：由史料里的装备与兵力（strength）按公开公式算出
 * 攻击、防御、移动、步数，并给出逐项明细，方便玩家与所有者看到"这个数字是怎么来的"。
 * 公式参数在 data/rules/ratings.json，是游戏设计参数（待校准），不是史料数字。
 */
import { z } from 'zod';

/** 机动类型：徒步 / 摩托化（轮式） / 履带 */
export const Mobility = z.enum(['foot', 'motorized', 'tracked']);
export type Mobility = z.infer<typeof Mobility>;

export const RatingsParams = z.object({
  status: z.enum(['draft', 'approved']),
  items: z.record(z.string(), z.object({ name: z.string(), class: z.string() })),
  classes: z.record(z.string(), z.object({
    per: z.number().positive(),
    attack: z.number().optional(),
    defense: z.number().optional(),
    support: z.number().optional(),
    armor: z.enum(['light', 'medium', 'heavy']).optional(),
    combatRatio: z.number().positive().max(1).optional(),
  })),
  typeDefaults: z.record(z.string(), z.union([z.string(), z.object({ attack: z.number(), defense: z.number() })])),
  artilleryDefense: z.number(),
  pointsPerStep: z.number().positive(),
  steps: z.record(z.string(), z.tuple([z.number().int(), z.number().int()])),
  mobility: z.record(z.string(), Mobility),
  movement: z.record(z.string(), z.number()),
  /** 只有上级（师）数字时，按单位类型分到本单位的份额（设计参数） */
  /** 兵力密度（设计参数）：徒步单位的攻防按规模打折。一个师要守 3–4 个格子，把全师数字堆在一格会让这一格过硬 */
  density: z.record(z.string(), z.union([z.string(), z.number().positive().max(1)])).default({}),
  shares: z.record(z.string(), z.union([z.string(), z.object({ name: z.string(), fraction: z.number().positive().max(1) })])).default({}),
}).superRefine((p, ctx) => {
  for (const [k, it] of Object.entries(p.items)) {
    if (!p.classes[it.class]) ctx.addIssue({ code: 'custom', message: `装备 ${k} 的类别 ${it.class} 不存在` });
  }
});
export type RatingsParams = z.infer<typeof RatingsParams>;

/** 进公式的一条输入（只需这几个字段） */
export interface StrengthInput {
  item: string;
  count: number;
  /** 数字属于上级（如全师），按 params.shares 里的份额分到本单位 */
  share?: string | undefined;
}

export interface BreakdownLine {
  label: string;
  count?: number;
  attack: number;
  defense: number;
  support: number;
  /** 这一行是占位（没有史料数字，用了类型默认值） */
  placeholder?: boolean;
}

export interface Derived {
  attack: number;
  defense: number;
  movement: number;
  steps: number;
  armorClass: 'none' | 'light' | 'medium' | 'heavy';
  /** 有没有用到占位分 */
  usedDefault: boolean;
  lines: BreakdownLine[];
}

const r1 = (x: number): number => Math.round(x * 100) / 100;

/**
 * @param type 兵种（决定机动类型、占位分、是否炮兵）
 * @param size 规模（决定步数上下限）
 */
export function deriveRatings(
  p: RatingsParams, type: string, size: string, strength: readonly StrengthInput[],
): Derived {
  const lines: BreakdownLine[] = [];
  const armorWeight = { light: 0, medium: 0, heavy: 0 };
  let hasPersonnel = false;
  for (const s of strength) {
    const it = p.items[s.item];
    if (!it) throw new Error(`未知装备：${s.item}`);
    const c = p.classes[it.class]!;
    const shRaw = s.share === undefined ? undefined : p.shares[s.share];
    if (s.share !== undefined && (!shRaw || typeof shRaw === 'string')) throw new Error(`未知份额：${s.share}`);
    const sh = typeof shRaw === 'string' ? undefined : shRaw;
    const k = (s.count * (sh?.fraction ?? 1)) / c.per;
    const ratio = c.combatRatio ?? 1;
    if (it.class.startsWith('personnel')) hasPersonnel = true;
    lines.push({
      label: it.name + (sh ? `（全师数字 × ${sh.name}份额 ${Math.round(sh.fraction * 100)}%）` : '')
        + (c.combatRatio ? `（按战斗兵力约 ${Math.round(ratio * 100)}% 推算）` : ''),
      count: s.count,
      attack: r1(k * ratio * (c.attack ?? 0)),
      defense: r1(k * ratio * (c.defense ?? 0)),
      support: r1(k * (c.support ?? 0)),
    });
    if (c.armor) armorWeight[c.armor] += s.count * (c.attack ?? 0);
  }
  const def = p.typeDefaults[type];
  let usedDefault = false;
  if (!hasPersonnel && def && typeof def !== 'string') {
    lines.push({ label: '步兵（无兵力数字，用类型占位分）', attack: def.attack, defense: def.defense, support: 0, placeholder: true });
    usedDefault = true;
  }
  const sum = (f: 'attack' | 'defense' | 'support'): number => lines.reduce((a, l) => a + l[f], 0);
  const isArtillery = type === 'artillery';
  // 炮兵：算子"攻击"位置印炮火支援值，"防御"印自身近战防御
  const mob = p.mobility[type] ?? 'foot';
  const dens = mob === 'foot' && !isArtillery ? (typeof p.density[size] === 'number' ? p.density[size] : 1) : 1;
  const attack = Math.max(1, Math.round(isArtillery ? sum('support') : sum('attack') * dens));
  const defense = Math.max(1, Math.round(isArtillery ? p.artilleryDefense : sum('defense') * dens));
  const [lo, hi] = p.steps[size] ?? [1, 4];
  const stepBase = isArtillery ? sum('support') * 2 : sum('defense');
  const steps = Math.min(hi, Math.max(lo, Math.round(stepBase / p.pointsPerStep)));
  const top = (Object.entries(armorWeight) as [Derived['armorClass'], number][]).sort((a, b) => b[1] - a[1])[0]!;
  return {
    attack, defense, steps,
    movement: p.movement[mob] ?? 4,
    armorClass: top[1] > 0 ? top[0] : 'none',
    usedDefault,
    lines,
  };
}
