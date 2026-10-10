/** 信息面板里的"进攻这一格"与"推进"：选进攻单位 → 赔率与每条修正的出处 → 各结果概率 → 开战。 */
import {
  type GameContext, type GameState, ODDS_LOW, actingSide, eligibleAttackers, parseResult, pinRequired, previewCombat, sideOfUnit, whyCannotAttack,
} from '../engine';

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const sign = (v: number): string => (v > 0 ? `+${v}` : `${v}`);

/** 结果代码 → 中文 */
export function resultText(code: string): string {
  const r = parseResult(code);
  const parts = [r.a && `攻方损失 ${r.a} 步`, r.d && `守方损失 ${r.d} 步`, r.r && `守方撤退 ${r.r} 格`].filter(Boolean);
  return parts.length ? parts.join('，') : '无结果';
}

/**
 * @param chosen 玩家勾选的进攻单位（null = 默认全选）
 * 返回 HTML；按钮 id：atk-go（开战）、复选框 class atk-pick（data-unit）
 */
export function combatSectionHtml(ctx: GameContext, s: GameState, hex: string, chosen: Set<string> | null, inDraft: string[] | null = null): string {
  const side = actingSide(ctx, s);
  const defenders = s.units.filter((u) => u.hex === hex);
  if (!side || !defenders.length || sideOfUnit(ctx, defenders[0]!.id) === side) return '';
  if (!ctx.combat.combatPhases.includes(ctx.sequence.phases[s.phase]!.id)) return '';
  if (s.pending.length) return `<div class="combat"><div class="units-head">进攻这一格</div><div class="muted">已经宣布了作战分配：${s.pending.some((p) => p.hex === hex) ? '这一格的进攻在左下角面板里结算' : '只能结算分配里的进攻'}。</div></div>`;
  const name = (id: string): string => esc(ctx.oob.units.get(id)!.names.zh);
  const eligible = eligibleAttackers(ctx, s, hex, side);
  const head = '<div class="units-head">进攻这一格</div>';
  if (!eligible.length) return `<div class="combat">${head}<div class="muted">没有能进攻这一格的${side === 'DE' ? '德' : '苏'}军单位（要相邻、不是炮兵/反坦克旅、本阶段没进攻过；夜间机动单位不能进攻；发展阶段只限本回合没进攻或进攻得手的机动单位）</div></div>`;
  const picked = eligible.filter((id) => !chosen || chosen.has(id));
  const boxes = eligible.map((id) => `<label class="atk-row"><input type="checkbox" class="atk-pick" data-unit="${esc(id)}"${picked.includes(id) ? ' checked' : ''}> ${name(id)}</label>`).join('');
  const why = whyCannotAttack(ctx, s, picked, hex, side);
  if (why && !why.startsWith(ODDS_LOW)) return `<div class="combat">${head}${boxes}<div class="muted">${esc(why)}</div></div>`;
  const p = previewCombat(ctx, s, picked, hex);
  const pin = pinRequired(ctx, s, picked, hex);
  const C = ctx.combat;
  const vals = (xs: { id: string; value: number }[]): string => xs.map((x) => `${name(x.id)} ${x.value}`).join('、');
  const mods = (ms: typeof p.shifts): string => ms.map((m) => `<li><b>${sign(m.value)}</b> ${esc(m.label)}<small>${esc(m.source)}</small></li>`).join('');
  const below = p.column < 0;
  const outcomes = [...p.outcomes].sort((a, b) => b.p - a.p)
    .map((o) => `<li><b>${Math.round(o.p * 100)}%</b> ${esc(resultText(o.code))}</li>`).join('');
  return `<div class="combat">${head}${boxes}
    <dl class="odds">
      <dt>攻</dt><dd>${p.attack}<small>${vals(p.attackers)}</small></dd>
      <dt>防</dt><dd>${p.defense}<small>${vals(p.defenders)}</small></dd>
      <dt>赔率</dt><dd>${p.ratio} : 1 → ${below ? `<b class="bad">低于 ${C.columns[0]!.name}，不能进攻</b>` : `基础列 ${C.columns[p.baseColumn]!.name}`}</dd>
    </dl>
    ${p.shifts.length ? `<div class="sub">列偏移</div><ul class="mods">${mods(p.shifts)}</ul>` : '<div class="sub">列偏移：无</div>'}
    ${p.drms.length ? `<div class="sub">骰子修正</div><ul class="mods">${mods(p.drms)}</ul>` : ''}
    ${below ? '' : `<div class="final">最终：<b>${C.columns[p.column]!.name}</b> 列，掷 2d6${p.drm ? `（${sign(p.drm)}）` : ''}</div>
    <ul class="mods outcomes">${outcomes}</ul>
    ${pin.length ? `<div class="bad small">牵制义务：这些单位还贴着 ${pin.map(esc).join('、')} 的敌军，这些格子也必须被进攻——点那些格子，选好单位，都“加入分配”后一起宣布。</div>` : ''}
    ${inDraft ? '<div class="muted small">已在分配草稿里（再点“加入分配”会更新）</div>' : ''}
    <button class="primary" id="atk-go"${pin.length ? ' disabled' : ''}>开战（掷骰）</button> <button id="atk-add">加入分配</button>`}
    <div class="muted small">规则与参数：docs/10-战斗.md、data/rules/combat.json（草案）</div></div>`;
}

/** 战斗后推进（紧接在战斗之后、格子空出时） */
export function advanceSectionHtml(ctx: GameContext, s: GameState, hex: string): string {
  if (!s.advance || s.advance.hex !== hex) return '';
  const boxes = s.advance.units.map((id, i) => `<label class="atk-row"><input type="checkbox" class="adv-pick" data-unit="${esc(id)}"${i < ctx.combat.advanceMax ? ' checked' : ''}> ${esc(ctx.oob.units.get(id)!.names.zh)}</label>`).join('');
  return `<div class="combat"><div class="units-head">推进占领 ${hex}</div>${boxes}
    <div class="muted small">最多 ${ctx.combat.advanceMax} 个单位；不推进就直接做别的操作</div>
    <button class="primary" id="adv-go">推进</button></div>`;
}
