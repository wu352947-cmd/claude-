/**
 * 编制面板：按"集团军群 → 集团军 → 军 → 师"列出本方部队，可以把一个编制配属给别的上级，
 * 点"看位置"在地图上框出这个编制的全部单位。配属是引擎指令 Assign（当回合协同不良，见 docs/15）。
 */
import {
  ECHELON_NAMES, type GameContext, type GameState, type Side, SIDE_NAMES, actingSide, childrenOf, coordGroup, parentOf, whyCannotAssign,
} from '../engine';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface OrgPanel { refresh(s: GameState): void }

export function setupOrg(
  ctx: GameContext, view: () => Side | null, assign: (formation: string, parent: string | null) => boolean, show: (unitIds: string[]) => void,
): OrgPanel {
  const box = $('org');
  let last: GameState | null = null;
  let side: Side = 'DE';
  let open = false;
  let marked: string | null = null;

  function render(): void {
    box.hidden = !open;
    if (!open || !last) return;
    const s = last;
    const acting = actingSide(ctx, s);
    side = view() ?? acting ?? side;
    const alive = new Set(s.units.map((u) => u.id));
    const countOf = (f: string): number => [...ctx.oob.units.values()].filter((u) => u.formation === f && alive.has(u.id)).length;
    const total = (f: string): number => countOf(f) + childrenOf(ctx, s, f).reduce((a, c) => a + total(c), 0);
    const roots = [...ctx.oob.formations.values()].filter((f) => f.side === side && !parentOf(ctx, s, f.id)).map((f) => f.id);

    const row = (f: string, depth: number): string => {
      const form = ctx.oob.formations.get(f)!;
      const att = s.attach[f];
      const fresh = coordGroup(ctx, s, f).fresh && att?.turn === s.turn;
      const own = countOf(f);
      const options = [...ctx.oob.formations.values()]
        .filter((p) => p.id !== f && !whyCannotAssign(ctx, s, f, p.id, acting))
        .map((p) => `<option value="${esc(p.id)}">${esc(p.names.zh)}</option>`).join('');
      const canDetach = !whyCannotAssign(ctx, s, f, null, acting);
      const can = acting === side && (options !== '' || canDetach);
      return `<div class="org-row${marked === f ? ' on' : ''}" style="padding-left:${depth * 14}px">
        <span class="org-name">${form.echelon ? `<small>${ECHELON_NAMES[form.echelon]}</small> ` : ''}${esc(form.names.zh)}</span>
        <small>${total(f)} 个单位${own && own !== total(f) ? `（直属 ${own}）` : ''}${fresh ? ' · <b class="c-zoc">本回合刚调整</b>' : ''}</small>
        <span class="org-act">${total(f) ? `<button data-show="${esc(f)}">看位置</button>` : ''}
        ${can ? `<select data-assign="${esc(f)}"><option value="">配属到…</option>${options}${canDetach ? '<option value="-">直属（不隶属）</option>' : ''}</select>` : ''}</span>
      </div>${childrenOf(ctx, s, f).filter((c) => ctx.oob.formations.get(c)!.side === side).map((c) => row(c, depth + 1)).join('')}`;
    };
    box.innerHTML = `<div class="org-head"><b>${SIDE_NAMES[side]}编制</b><button id="org-close" aria-label="关闭">×</button></div>
      <div class="muted small">同一集团军的部队一起进攻协调良好；跨集团军、或本回合刚调整隶属的部队一起进攻，赔率列左移 1。每个编制每回合只能调整一次。</div>
      ${roots.map((r) => row(r, 0)).join('')}`;
    $('org-close').onclick = () => { open = false; show([]); render(); };
    for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-show]')) {
      b.onclick = () => {
        const f = b.dataset.show!;
        const members = new Set<string>();
        const walk = (g: string): void => {
          for (const u of ctx.oob.units.values()) if (u.formation === g && s.units.some((x) => x.id === u.id)) members.add(u.id);
          for (const c of childrenOf(ctx, s, g)) walk(c);
        };
        walk(f);
        marked = marked === f ? null : f;
        show(marked ? [...members] : []);
        render();
      };
    }
    for (const sel of box.querySelectorAll<HTMLSelectElement>('select[data-assign]')) {
      sel.onchange = () => { if (sel.value) assign(sel.dataset.assign!, sel.value === '-' ? null : sel.value); };
    }
  }

  $('g-org').onclick = () => { open = !open; if (!open) show([]); render(); };
  return { refresh(s) { last = s; render(); } };
}
