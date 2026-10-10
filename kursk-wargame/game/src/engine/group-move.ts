/**
 * 整体移动（docs/15 §6）：一次指令让一批单位各自尽量靠近目的格。
 * 做法：离目的格近的先走；每个单位在自己能到的格子里挑离目的格最近的（同样近挑耗费少的），
 * 一格满了（堆叠）后面的自然落到旁边的格子。每个单位仍走一条普通 Move，所以所有移动规则（控制区、夜间、堆叠）照常生效。
 */
import { apply, actingSide, type GameContext, type GameEvent, type GameState } from './game';
import { distance, parseHexId } from './hex';
import { reachable, whyCannotMove } from './movement';

export interface GroupMovePlan {
  moves: { unit: string; path: string[] }[];
  /** 没动的单位和原因 */
  skipped: { unit: string; why: string }[];
  state: GameState;
  events: GameEvent[];
}

export function planGroupMove(ctx: GameContext, s: GameState, units: readonly string[], hex: string): GroupMovePlan {
  const target = parseHexId(hex);
  const side = actingSide(ctx, s);
  const hexOf = (st: GameState, id: string): string | undefined => st.units.find((u) => u.id === id)?.hex;
  const order = [...new Set(units)].sort((a, b) => {
    const da = distance(parseHexId(hexOf(s, a) ?? hex), target), db = distance(parseHexId(hexOf(s, b) ?? hex), target);
    return da - db || (a < b ? -1 : 1);
  });
  let st = s;
  const plan: GroupMovePlan = { moves: [], skipped: [], state: s, events: [] };
  for (const id of order) {
    const why = whyCannotMove(ctx, st, id, side);
    if (why) { plan.skipped.push({ unit: id, why }); continue; }
    const here = distance(parseHexId(hexOf(st, id)!), target);
    let best: { hex: string; d: number; cost: number; path: string[] } | null = null;
    for (const [h, r] of reachable(ctx, st, id)) {
      const d = distance(parseHexId(h), target);
      if (!best || d < best.d || (d === best.d && (r.cost < best.cost || (r.cost === best.cost && h < best.hex)))) best = { hex: h, d, cost: r.cost, path: r.path };
    }
    if (!best || best.d >= here) { plan.skipped.push({ unit: id, why: '已经无法更靠近' }); continue; }
    const r = apply(ctx, st, { type: 'Move', unit: id, path: best.path });
    st = r.state;
    plan.events.push(...r.events);
    plan.moves.push({ unit: id, path: best.path });
  }
  plan.state = st;
  return plan;
}
