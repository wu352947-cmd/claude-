/**
 * 作战计划面板：列出本方轴线（主攻/助攻/牵制/迂回/预备队）、删除，或"开始画"后在地图上依次点路点，点"完成"提交。
 * 提交就是引擎指令 Plan / Unplan。规则见 docs/15 §7。
 */
import { AXIS_NAMES, type Axis, type AxisKind, type GameContext, type GameState, type Side, SIDE_NAMES, actingSide } from '../engine';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const HELP: Record<AxisKind, string> = {
  main: '集中力量的主要方向。前一回合定下后，指派的编制沿这条线（走廊）进攻，赔率列右移 1。只能有一条。',
  support: '次要方向，用来分散对手。目前只是标记，没有加成。',
  fix: '牵制：把对手拖在原地。目前只是标记，没有加成。',
  flank: '迂回：绕到侧后。目前只是标记，没有加成。',
  reserve: '预备队集结地。目前只是标记，没有加成。',
};

export interface PlanPanel {
  refresh(s: GameState): void;
  /** 正在画：地图点击交给 addPoint */
  drawing(): boolean;
  addPoint(hex: string): void;
  cancel(): void;
  axes(s: GameState): Axis[];
  draft(): { kind: AxisKind; path: readonly string[] } | null;
}

export function setupPlan(
  ctx: GameContext, view: () => Side | null, dispatch: (kind: AxisKind, formation: string | null, path: string[]) => boolean,
  remove: (id: string) => boolean, redraw: () => void,
): PlanPanel {
  const box = $('plan');
  let last: GameState | null = null;
  let open = false;
  let kind: AxisKind = 'main';
  let formation = '';
  let path: string[] | null = null;
  const sideNow = (): Side => view() ?? (last ? actingSide(ctx, last) : null) ?? 'DE';
  const mine = (s: GameState): Axis[] => s.plans.filter((p) => p.side === sideNow());

  function render(): void {
    box.hidden = !open;
    redraw();
    if (!open || !last) return;
    const s = last, side = sideNow();
    if (!path && kind === 'main' && mine(s).some((a) => a.kind === 'main')) kind = 'support';
    const acting = actingSide(ctx, s) === side;
    const forms = [...ctx.oob.formations.values()].filter((f) => f.side === side);
    const nm = (f: string | null): string => (f ? ctx.oob.formations.get(f)?.names.zh ?? f : '全军');
    box.innerHTML = `<div class="pl-head"><b>${SIDE_NAMES[side]}作战计划</b><button id="pl-close" aria-label="关闭">×</button></div>
      <div class="muted small">计划只给自己看，不强制行动；偏离计划也没有惩罚。</div>
      ${mine(s).map((a) => `<div class="pl-row"><span class="pl-dot" style="background:#${AXIS_COLOR_HEX[a.kind]}"></span><b>${AXIS_NAMES[a.kind]}</b> ${esc(nm(a.formation))}
        <small>${a.path.join(' → ')} · 第 ${a.turn} 回合定</small>${acting ? `<button data-del="${esc(a.id)}">删除</button>` : ''}</div>`).join('') || '<div class="muted">还没有计划</div>'}
      ${acting ? (path ? `<div class="pl-new"><b>${AXIS_NAMES[kind]}</b>：在地图上依次点路点（已 ${path.length} 个，至少 2 个）
          <div><button id="pl-done" ${path.length < 2 ? 'disabled' : ''}>完成</button> <button id="pl-undo">退一个点</button> <button id="pl-cancel">取消</button></div></div>`
        : `<div class="pl-new"><select id="pl-kind">${(Object.keys(AXIS_NAMES) as AxisKind[]).map((k) => `<option value="${k}"${k === kind ? ' selected' : ''}>${AXIS_NAMES[k]}</option>`).join('')}</select>
          <select id="pl-form"><option value="">全军</option>${forms.map((f) => `<option value="${esc(f.id)}"${f.id === formation ? ' selected' : ''}>${esc(f.names.zh)}</option>`).join('')}</select>
          <button id="pl-go">在地图上画</button><div class="muted small">${HELP[kind]}</div></div>`) : '<div class="muted small">要等到本方行动的阶段才能改计划。</div>'}`;
    $('pl-close').onclick = () => { open = false; path = null; render(); };
    for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-del]')) b.onclick = () => { remove(b.dataset.del!); };
    const go = document.getElementById('pl-go');
    if (go) {
      $<HTMLSelectElement>('pl-kind').onchange = (e) => { kind = (e.target as HTMLSelectElement).value as AxisKind; render(); };
      $<HTMLSelectElement>('pl-form').onchange = (e) => { formation = (e.target as HTMLSelectElement).value; };
      go.onclick = () => { path = []; render(); };
    }
    const done = document.getElementById('pl-done');
    if (done) {
      done.onclick = () => { const p = path!; if (dispatch(kind, formation || null, p)) path = null; render(); };
      $('pl-undo').onclick = () => { path!.pop(); render(); };
      $('pl-cancel').onclick = () => { path = null; render(); };
    }
  }

  $('g-plan').onclick = () => { open = !open; if (!open) path = null; render(); };
  return {
    refresh(s) { last = s; render(); },
    drawing: () => path !== null,
    addPoint(hex) { if (path && path.at(-1) !== hex) { path.push(hex); render(); } },
    cancel() { path = null; render(); },
    axes: (s) => mine(s),
    draft: () => (path ? { kind, path } : null),
  };
}

const AXIS_COLOR_HEX: Record<AxisKind, string> = { main: 'd9442f', support: 'e69a2e', fix: '5b8fb9', flank: '8e5bb5', reserve: '5a9a5a' };
