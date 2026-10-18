/**
 * 编制树与指挥链（docs/15）：集团军群 → 集团军 → 军 → 师。
 * 想定里每个编制有默认上级（oob 的 parent）；玩家可以用 Assign 指令把一个编制配属给别的上级（GameState.attach）。
 * 规则：同一集团军内的部队一起进攻协同良好；跨集团军、或刚（本回合）调整过隶属的部队一起进攻，赔率列左移（combat.ts）。
 */
import type { GameContext, GameState } from './game';
import type { Side } from './units';

export const ECHELON_RANK = { division: 1, corps: 2, army: 3, 'army-group': 4 } as const;
export const ECHELON_NAMES = { division: '师', corps: '军', army: '集团军', 'army-group': '集团军群/方面军' } as const;

/** 编制现在的上级（没有 = null） */
export function parentOf(ctx: GameContext, s: GameState, id: string): string | null {
  const a = s.attach[id];
  if (a) return a.parent;
  return ctx.oob.formations.get(id)?.parent ?? null;
}

/** 从自己往上到最高一级（自己在最前） */
export function chainOf(ctx: GameContext, s: GameState, id: string): string[] {
  const out: string[] = [];
  for (let at: string | null = id; at && !out.includes(at); at = parentOf(ctx, s, at)) out.push(at);
  return out;
}

export function childrenOf(ctx: GameContext, s: GameState, id: string): string[] {
  return [...ctx.oob.formations.keys()].filter((f) => parentOf(ctx, s, f) === id);
}

/** 协同组：同一组的部队一起进攻没有协调代价。本回合刚调整过隶属的编制自成一组（fresh）。 */
export function coordGroup(ctx: GameContext, s: GameState, id: string): { id: string; fresh: boolean } {
  const chain = chainOf(ctx, s, id);
  for (const f of chain) {
    if (s.attach[f]?.turn === s.turn) return { id: f, fresh: true };
    if (ctx.oob.formations.get(f)?.echelon === 'army') return { id: f, fresh: false };
  }
  return { id: chain.at(-1)!, fresh: false };
}

/** 能不能把 formation 配属给 parent（null = 直属）；side = 现在行动的一方 */
export function whyCannotAssign(ctx: GameContext, s: GameState, formation: string, parent: string | null, side: Side | null): string | null {
  const f = ctx.oob.formations.get(formation);
  if (!f) return `编制 ${formation} 不存在`;
  if (!side) return '本阶段双方同时行动，不能调整隶属';
  if (f.side !== side) return '只能调整本方的编制';
  if (s.attach[formation]?.turn === s.turn) return `${f.names.zh}本回合已经调整过隶属`;
  if (parentOf(ctx, s, formation) === parent) return '已经隶属于它了';
  if (parent === null) return null;
  const p = ctx.oob.formations.get(parent);
  if (!p) return `编制 ${parent} 不存在`;
  if (p.side !== f.side) return '不能配属给敌方';
  if (chainOf(ctx, s, parent).includes(formation)) return '不能配属给自己的下级';
  if (f.echelon && p.echelon && ECHELON_RANK[p.echelon] <= ECHELON_RANK[f.echelon]) return `${ECHELON_NAMES[f.echelon]}只能配属给更高一级的指挥机构`;
  return null;
}
