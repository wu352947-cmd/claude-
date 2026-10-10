/**
 * 无界面模拟用的简单自动对手（docs/14）：每次给出下一条指令。
 * 不是历史命令脚本，也不是好 AI：移动 = 向目标推进，战斗 = 赔率够就打，打赢了就推进。
 * 没有任何随机：同样的局面总是给出同样的指令（并列时按单位 ID、格号先后）。
 */
import { z } from 'zod';
import {
  type Command, type GameContext, type GameState, type Side, actingSide, distance, currentValue, eligibleAttackers, parseHexId, previewCombat, reachable, sideOfUnit,
  whyCannotAttack, whyCannotMove, whyOverstacked,
} from '../engine';

const Goal = z.enum(['objectives', 'enemy', 'hold']);
const Profile = z.object({
  goal: Goal, goalWhenFirst: Goal, footAdvances: z.boolean(), minRatio: z.number().positive(), minRatioWhenFirst: z.number().positive(), artilleryStandoff: z.number().int().nonnegative(),
  /** 疲劳达到这一级的单位不参加进攻（除非不用它就够不上赔率门槛）；不写 = 不看疲劳 */
  maxFatigue: z.number().int().nonnegative().optional(),
  /** 只投入够用的兵力：赔率刚到门槛就不再加人，保留生力军 */
  economy: z.boolean().default(false),
});
export const BotRules = z.object({ $comment: z.string().optional(), status: z.enum(['draft', 'approved']), DE: Profile, SU: Profile });
export type BotRules = z.infer<typeof BotRules>;

export class Bot {
  private key = '';
  private done = new Set<string>();
  constructor(private ctx: GameContext, private rules: BotRules) {}

  step(s: GameState): Command {
    const ctx = this.ctx;
    const side = actingSide(ctx, s);
    if (!side || s.over) return { type: 'EndPhase' };
    const key = `${s.turn}.${s.phase}`;
    if (key !== this.key) { this.key = key; this.done = new Set(); }
    const profile = this.rules[side];
    const first = s.first === side;
    const phaseId = ctx.sequence.phases[s.phase]!.id;

    if (s.advance) {
      const pick: string[] = [];
      for (const id of s.advance.units) if (pick.length < ctx.combat.advanceMax && !whyOverstacked(ctx, s, s.advance.hex, [...pick, id])) pick.push(id);
      return pick.length ? { type: 'Advance', units: pick } : { type: 'EndPhase' };
    }
    if (ctx.movement.movePhases.includes(phaseId)) return this.move(s, side, first ? profile.goalWhenFirst : profile.goal) ?? { type: 'EndPhase' };
    if (ctx.combat.combatPhases.includes(phaseId)) return this.attack(s, side, first ? profile.minRatioWhenFirst : profile.minRatio) ?? { type: 'EndPhase' };
    return { type: 'EndPhase' };
  }

  private enemyHexes(s: GameState, side: Side): string[] {
    return [...new Set(s.units.filter((u) => sideOfUnit(this.ctx, u.id) !== side).map((u) => u.hex))].sort();
  }

  private goalHex(s: GameState, side: Side, from: string, goal: z.infer<typeof Goal>): string | null {
    if (goal === 'hold') return null;
    const cands = goal === 'enemy'
      ? this.enemyHexes(s, side)
      : (this.ctx.scenario?.objectives ?? []).filter((o) => (s.owners[o.hex] ?? o.owner) !== side).map((o) => o.hex);
    const h = parseHexId(from);
    let best: string | null = null, bd = Infinity;
    for (const c of cands) {
      const d = distance(h, parseHexId(c));
      if (d < bd || (d === bd && best !== null && c < best)) { best = c; bd = d; }
    }
    return best;
  }

  private move(s: GameState, side: Side, goal: z.infer<typeof Goal>): Command | null {
    const ctx = this.ctx;
    const profile = this.rules[side];
    const enemy = this.enemyHexes(s, side).map(parseHexId);
    const nearestEnemy = (hex: string): number => Math.min(...enemy.map((e) => distance(parseHexId(hex), e)));
    const mine = s.units.filter((u) => sideOfUnit(ctx, u.id) === side).map((u) => u.id).sort();
    for (const id of mine) {
      if (this.done.has(id)) continue;
      this.done.add(id);
      if (whyCannotMove(ctx, s, id, side)) continue;
      const unit = ctx.oob.units.get(id)!;
      if (unit.mobility === 'foot' && !profile.footAdvances) continue;
      const here = s.units.find((u) => u.id === id)!.hex;
      const target = this.goalHex(s, side, here, goal);
      if (!target) continue;
      const t = parseHexId(target);
      const isArt = ctx.combat.artillery.types.includes(unit.type);
      let best: { hex: string; d: number; cost: number; path: string[] } | null = null;
      const cur = distance(parseHexId(here), t);
      for (const [hex, r] of reachable(ctx, s, id)) {
        if (isArt && nearestEnemy(hex) < profile.artilleryStandoff) continue;
        const d = distance(parseHexId(hex), t);
        if (d >= cur) continue;
        if (!best || d < best.d || (d === best.d && (r.cost < best.cost || (r.cost === best.cost && hex < best.hex)))) best = { hex, d, cost: r.cost, path: r.path };
      }
      if (best) return { type: 'Move', unit: id, path: best.path };
    }
    return null;
  }

  private attack(s: GameState, side: Side, minRatio: number): Command | null {
    const ctx = this.ctx;
    const prof = this.rules[side];
    const cap = ctx.combat.frontage.maxAttackers;
    let best: { hex: string; ratio: number; attackers: string[] } | null = null;
    for (const hex of this.enemyHexes(s, side)) {
      if (s.attackedHexes.includes(hex)) continue;
      const all = eligibleAttackers(ctx, s, hex, side)
        .map((id) => ({ id, v: currentValue(ctx, s.units.find((u) => u.id === id)!, 'attack'), f: s.fatigue[id] ?? 0 }));
      const fresh = prof.maxFatigue === undefined ? all : all.filter((x) => x.f < prof.maxFatigue!);
      // 优先用不疲劳的、攻击力大的；先试只用生力军，不够再把疲劳的也算上
      for (const pool of fresh.length === all.length ? [all] : [fresh, all]) {
        if (!pool.length) continue;
        const order = [...pool].sort((a, b) => a.f - b.f || b.v - a.v || (a.id < b.id ? -1 : 1));
        let pick = order.slice(0, cap).map((x) => x.id);
        if (prof.economy) {
          for (let n = 1; n <= Math.min(cap, order.length); n++) {
            const ids = order.slice(0, n).map((x) => x.id);
            if (!whyCannotAttack(ctx, s, ids, hex, side) && previewCombat(ctx, s, ids, hex).ratio >= minRatio) { pick = ids; break; }
          }
        }
        if (!pick.length || whyCannotAttack(ctx, s, pick, hex, side)) continue;
        const p = previewCombat(ctx, s, pick, hex);
        if (p.column < 0 || p.ratio < minRatio) continue;
        if (!best || p.ratio > best.ratio || (p.ratio === best.ratio && hex < best.hex)) best = { hex, ratio: p.ratio, attackers: pick };
        break;
      }
    }
    return best ? { type: 'Attack', attackers: best.attackers, hex: best.hex } : null;
  }
}
