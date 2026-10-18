/** 战斗结算：掷骰、查表、分配步数损失、撤退、推进（规则见 combat.ts 与 docs/10）。 */
import { rollDie } from './rng';
import { parseResult, previewCombat, retreatPath } from './combat';
import { sideOfUnit, whyOverstacked } from './movement';
import { markDisorganized } from './disorganize';
import { CommandError, type GameContext, type GameEvent, type GameState, type UnitState } from './game';

const unitOf = (ctx: GameContext, id: string) => ctx.oob.units.get(id)!;

/**
 * 按顺序每个单位轮流损失 1 步，直到损失够 n 步或全部消灭。
 * battleHex = 战斗发生的格子（守方所在格）：装甲损失记在战场上，回合末按"这块战场现在归谁"分流（02 §4.4）。
 */
function takeLosses(ctx: GameContext, s: GameState, order: string[], n: number, events: GameEvent[], battleHex: string): GameState {
  const left = new Map(order.map((id) => [id, s.units.find((u) => u.id === id)!.steps]));
  const lost = new Map<string, number>();
  let need = n;
  while (need > 0 && [...left.values()].some((v) => v > 0)) {
    for (const id of order) {
      if (need <= 0) break;
      if (left.get(id)! <= 0) continue;
      left.set(id, left.get(id)! - 1);
      lost.set(id, (lost.get(id) ?? 0) + 1);
      need--;
    }
  }
  if (!lost.size) return s;
  const damaged = [...s.damaged];
  const casualties = [...s.casualties];
  for (const [id, steps] of lost) {
    const unit = unitOf(ctx, id);
    // 装甲单位损失的步数先进入受损池（02 §4.4），回合末再按战场控制分流（冲刺 6）
    const armored = ctx.combat.armor.armorTypes.includes(unit.type);
    if (armored) damaged.push({ unit: id, formation: unit.formation, steps, hex: battleHex, turn: s.turn });
    else casualties.push({ unit: id, steps, turn: s.turn });
    events.push({ type: 'StepsLost', unit: id, steps, damagedPool: armored });
  }
  const units: UnitState[] = [];
  const eliminated = [...s.eliminated];
  for (const u of s.units) {
    if (!left.has(u.id)) { units.push(u); continue; }
    const steps = left.get(u.id)!;
    if (steps > 0) units.push({ ...u, steps });
    else { eliminated.push(u.id); events.push({ type: 'UnitEliminated', unit: u.id }); }
  }
  return { ...s, units, eliminated, damaged, casualties };
}

export function resolveAttack(ctx: GameContext, s0: GameState, attackers: string[], hex: string): { state: GameState; events: GameEvent[] } {
  const p = previewCombat(ctx, s0, attackers, hex);
  if (p.column < 0) throw new CommandError(`赔率 ${p.attack}:${p.defense} 低于 ${ctx.combat.columns[0]!.name}，不能进攻`);
  const [d1, r1] = rollDie(s0.rng, 6);
  const [d2, rng] = rollDie(r1, 6);
  const roll = Math.max(2, Math.min(12, d1 + d2 + p.drm));
  const code = ctx.combat.crt[roll]![p.column]!;
  const res = parseResult(code);
  const side = sideOfUnit(ctx, attackers[0]!);
  const events: GameEvent[] = [{
    type: 'CombatResolved', hex, attackers, odds: ctx.combat.columns[p.column]!.name, shift: p.column - p.baseColumn,
    dice: [d1, d2], drm: p.drm, result: code,
  }];
  let s: GameState = {
    ...s0, rng,
    attacked: [...s0.attacked, ...attackers],
    attackedHexes: [...s0.attackedHexes, hex],
    fired: [...s0.fired, ...p.support.attacker, ...p.support.defender],
  };
  // 守方从堆叠最上面开始轮流损失；攻方按进攻单位的先后
  const defenders = s.units.filter((u) => u.hex === hex).map((u) => u.id).reverse();
  s = takeLosses(ctx, s, defenders, res.d, events, hex);
  s = takeLosses(ctx, s, attackers, res.a, events, hex);
  const survivors = s.units.filter((u) => u.hex === hex).map((u) => u.id);
  if (res.r && survivors.length) {
    const { path, extraLoss } = retreatPath(ctx, s, hex, res.r, side, attackers);
    if (path.length) {
      const to = path.at(-1)!;
      // 撤退的单位移到目的格堆叠最上面，保持原来的上下顺序
      s = { ...s, units: [...s.units.filter((u) => u.hex !== hex), ...s.units.filter((u) => u.hex === hex).map((u) => ({ ...u, hex: to }))] };
      events.push({ type: 'Retreated', units: survivors, path });
    }
    if (!path.length && ctx.combat.retreat.annihilateAtR && res.r >= ctx.combat.retreat.annihilateAtR) {
      // 被围死又要撤退很远：整格被歼灭（剩下的步数全部损失）
      const alive = survivors.filter((id) => s.units.some((u) => u.id === id));
      const all = alive.reduce((n, id) => n + s.units.find((u) => u.id === id)!.steps, 0);
      events.push({ type: 'RetreatLoss', units: survivors, steps: all, reason: '被围歼：无路可退' });
      s = takeLosses(ctx, s, alive, all, events, hex);
    } else if (extraLoss) {
      events.push({ type: 'RetreatLoss', units: survivors, steps: extraLoss, reason: path.length < res.r ? '无路可退' : '退入敌控制区' });
      for (let i = 0; i < extraLoss; i++) s = takeLosses(ctx, s, survivors.filter((id) => s.units.some((u) => u.id === id)), survivors.length, events, hex);
    }
  }
  // 混乱：被迫撤退（含无路可退）的守军、损失惨重的一方的幸存者
  const D = ctx.combat.disorganize;
  const lostOf = (ids: string[]): number => events.reduce((n, e) => (e.type === 'StepsLost' && ids.includes(e.unit) ? n + e.steps : n), 0);
  if (D.onRetreat && res.r && survivors.length) s = markDisorganized(s, survivors, '被迫撤退', events);
  else if (lostOf(defenders) >= D.defenderLossAtLeast) s = markDisorganized(s, defenders, '损失惨重', events);
  if (lostOf(attackers) >= D.attackerLossAtLeast) s = markDisorganized(s, attackers, '进攻受挫', events);
  const empty = !s.units.some((u) => u.hex === hex);
  const canAdvance = attackers.filter((id) => s.units.some((u) => u.id === id) && s.disorganized[id] === undefined);
  s = {
    ...s, advance: empty && canAdvance.length ? { hex, units: canAdvance } : null,
    foughtThisTurn: [...s.foughtThisTurn, ...attackers],
    wonThisTurn: empty ? [...s.wonThisTurn, ...canAdvance] : s.wonThisTurn,
  };
  return { state: s, events };
}

/** 战斗后推进：占领空出的格子（不计移动力，不受控制区影响），只能紧接在战斗之后 */
export function resolveAdvance(ctx: GameContext, s: GameState, units: string[]): { state: GameState; events: GameEvent[] } {
  const adv = s.advance;
  if (!adv) throw new CommandError('现在不能推进（只能紧接在把守方逐出格子的战斗之后）');
  if (!units.length || units.length > ctx.combat.advanceMax) throw new CommandError(`推进单位数应为 1–${ctx.combat.advanceMax} 个`);
  for (const id of units) if (!adv.units.includes(id)) throw new CommandError(`${unitOf(ctx, id)?.names.zh ?? id} 没有参加这次进攻，不能推进`);
  const over = whyOverstacked(ctx, s, adv.hex, units);
  if (over) throw new CommandError(over);
  const moving = s.units.filter((u) => units.includes(u.id)).map((u) => ({ ...u, hex: adv.hex }));
  return {
    state: { ...s, units: [...s.units.filter((u) => !units.includes(u.id)), ...moving], advance: null },
    events: [{ type: 'Advanced', units, to: adv.hex }],
  };
}
