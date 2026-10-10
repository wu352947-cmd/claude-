/**
 * 地图编辑器（网页里的一个模式）：点格子改地形、点格边加/去冲沟等、点格子标"已核对"。
 * 修改存成修改单（engine/map-edit.ts），自动保存在浏览器里；导出后由 AI 合并进 data/maps/。
 */
import {
  type Direction, type GameMap, type MapEdits, type Offset, type SideFeature, type Terrain,
  MapEdits as MapEditsSchema, SIDE_FEATURE_NAMES, TERRAIN, TERRAIN_NAMES, editCount, emptyEdits, hexId, nearestSide,
  pruneEdits, setNote, setTerrain, sideKey, toggleSideFeature, toggleVerified, verifiedCount, withEdits, type Point,
} from '../engine';
import sourcesCsv from '../../data/sources.csv?raw';
import { PALETTE } from './style';

export type Tool = 'view' | 'terrain' | 'side' | 'verify';

/** 编辑器里可以手工录入的格边特征（河流、溪流来自线状要素，按实际走向绘制，这里不录） */
const SIDE_BRUSHES: SideFeature[] = ['balka', 'railEmbankment'];

const css = (c: number | readonly number[]): string =>
  typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : `rgb(${c.join(',')})`;
const TERRAIN_SWATCH: Record<Terrain, string> = {
  clear: css(PALETTE.paper), woods: css(PALETTE.woods), village: css(PALETTE.house), town: css(PALETTE.settlement),
  city: css(PALETTE.settlementEdge), marsh: css(PALETTE.marshHatch), water: css(PALETTE.water),
};
const SIDE_SWATCH: Partial<Record<SideFeature, string>> = { balka: css(PALETTE.balka), railEmbankment: css(PALETTE.rail) };

const HINTS: Record<Tool, string> = {
  view: '点格子查看信息、写备注。',
  terrain: '选一种地形，再点格子。勾选下方"显示参考底图"可对照原图。',
  side: '选一种格边特征，点格边附近（靠近边、别点格子中央）。再点一次去掉。',
  verify: '对照原图确认格子没错，点一下标为已核对（绿点）；再点取消。蓝点 = AI 已交叉核对，你不必逐个再看。',
};

/** 史料登记表的 ID 与标题（简单 CSV 解析，支持引号） */
function parseSources(csv: string): { id: string; title: string }[] {
  const rows: { id: string; title: string }[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push({ id: cells[0] ?? '', title: cells[3] ?? '' });
  }
  return rows.filter((r) => r.id);
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface Editor {
  readonly active: boolean;
  readonly tool: Tool;
  map(): GameMap;
  /** 编辑模式下的点击；返回 true 表示已处理 */
  tap(world: Point, h: Offset): boolean;
  note(h: Offset, text: string): void;
}

export function createEditor(
  base: GameMap,
  hooks: {
    onMapChange(map: GameMap): void;
    onActiveChange(active: boolean): void;
    highlightSide(h: Offset, dir: Direction): void;
  },
): Editor {
  const storeKey = `kursk-map-edits:${base.def.id}`;
  const load = (): MapEdits => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) return pruneEdits(base, MapEditsSchema.parse(JSON.parse(raw)));
    } catch (e) { console.warn('读取本地修改失败', e); }
    return emptyEdits(base.def.id);
  };
  let edits = load();
  const history: MapEdits[] = [];
  let current = withEdits(base, edits);
  let active = false;
  let tool: Tool = 'terrain';
  let terrainBrush: Terrain = 'woods';
  let sideBrush: SideFeature = 'balka';

  const sources = parseSources(sourcesCsv);
  const sourceSel = $<HTMLSelectElement>('ed-source');
  for (const s of sources) sourceSel.add(new Option(`${s.id} ${s.title}`, s.id));
  try { const s = localStorage.getItem('kursk-editor-source'); if (s && sources.some((x) => x.id === s)) sourceSel.value = s; } catch { /* 无痕模式等 */ }
  sourceSel.addEventListener('change', () => { try { localStorage.setItem('kursk-editor-source', sourceSel.value); } catch { /* 忽略 */ } });
  const verifyBox = $<HTMLInputElement>('ed-verify');
  const opts = (): { source: string; verify: boolean } => ({ source: sourceSel.value, verify: verifyBox.checked });

  let toastTimer = 0;
  const toast = (msg: string): void => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show'), 1600);
  };

  const save = (): void => {
    try { localStorage.setItem(storeKey, JSON.stringify(edits)); } catch { toast('浏览器不允许保存，请及时导出'); }
  };
  const refreshStats = (): void => {
    const total = base.grid.cols * base.grid.rows;
    $('ed-stats').textContent = `你已核对 ${verifiedCount(current)} 格 · AI 交叉核对 ${verifiedCount(current, 'crosschecked')} 格（共 ${total} 格）· 未导出的修改 ${editCount(edits)} 处`;
    $<HTMLButtonElement>('ed-undo').disabled = history.length === 0;
  };
  const commit = (next: MapEdits, msg: string): void => {
    if (next === edits) return;
    history.push(edits);
    if (history.length > 200) history.shift();
    edits = next;
    current = withEdits(base, edits);
    save();
    hooks.onMapChange(current);
    refreshStats();
    toast(msg);
  };

  // 工具与画笔
  const renderBrushes = (): void => {
    const box = $('ed-brushes');
    box.innerHTML = '';
    const items: { key: string; name: string; color: string; on: boolean; pick(): void }[] =
      tool === 'terrain' ? TERRAIN.map((t) => ({ key: t, name: TERRAIN_NAMES[t], color: TERRAIN_SWATCH[t], on: t === terrainBrush, pick: () => { terrainBrush = t; } }))
        : tool === 'side' ? SIDE_BRUSHES.map((f) => ({ key: f, name: SIDE_FEATURE_NAMES[f], color: SIDE_SWATCH[f] ?? '#888', on: f === sideBrush, pick: () => { sideBrush = f; } }))
          : [];
    for (const it of items) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="sw" style="background:${it.color}"></span>${it.name}`;
      b.classList.toggle('on', it.on);
      b.onclick = () => { it.pick(); renderBrushes(); };
      box.appendChild(b);
    }
    box.hidden = items.length === 0;
    for (const b of $('ed-tools').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.tool === tool);
    $('ed-hint').textContent = HINTS[tool];
  };
  for (const b of $('ed-tools').querySelectorAll<HTMLButtonElement>('button')) {
    b.onclick = () => { tool = b.dataset.tool as Tool; renderBrushes(); };
  }
  renderBrushes();

  $('ed-min').onclick = () => {
    const min = $('editor').classList.toggle('min');
    $('ed-min').textContent = min ? '+' : '–';
  };
  $('ed-undo').onclick = () => {
    const prev = history.pop();
    if (!prev) return;
    edits = prev;
    current = withEdits(base, edits);
    save();
    hooks.onMapChange(current);
    refreshStats();
    toast('已撤销');
  };

  // 导出 / 导入
  const dialog = $('export');
  const text = $<HTMLTextAreaElement>('ex-text');
  $('ed-export').onclick = () => { text.value = JSON.stringify(edits, null, 1); dialog.hidden = false; };
  $('ex-close').onclick = () => { dialog.hidden = true; };
  $('ex-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(text.value); toast('已复制'); } catch { text.select(); toast('请长按选中后手动复制'); }
  };
  $('ex-download').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text.value], { type: 'application/json' }));
    a.download = `${base.def.id}-map-edits.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('ex-load').onclick = () => {
    try {
      const e = MapEditsSchema.parse(JSON.parse(text.value));
      if (e.map !== base.def.id) throw new Error(`这是地图 ${e.map} 的修改，当前地图是 ${base.def.id}`);
      commit(pruneEdits(base, e), `已载入 ${editCount(e)} 处修改`);
      dialog.hidden = true;
    } catch (err) { alert(`内容格式不对，未载入。\n${err instanceof Error ? err.message.slice(0, 300) : ''}`); }
  };
  $('ex-clear').onclick = () => {
    if (!confirm('清空这台设备上的全部修改？（建议先复制导出）')) return;
    commit(emptyEdits(base.def.id), '已清空');
    text.value = JSON.stringify(edits, null, 1);
  };

  const setActive = (on: boolean): void => {
    active = on;
    $('editor').hidden = !on;
    $('edit-toggle').classList.toggle('on', on);
    $('edit-toggle').textContent = on ? '完成编辑' : '编辑';
    hooks.onActiveChange(on);
    refreshStats();
  };
  $('edit-toggle').onclick = () => setActive(!active);

  return {
    get active() { return active; },
    get tool() { return tool; },
    map: () => current,
    tap(world, h) {
      if (!active || tool === 'view') return false;
      if (tool === 'terrain') {
        commit(setTerrain(base, edits, h, terrainBrush, opts()), `${hexId(h)} → ${TERRAIN_NAMES[terrainBrush]}`);
      } else if (tool === 'verify') {
        const next = toggleVerified(base, edits, h, sourceSel.value);
        const on = withEdits(base, next).hexes.get(hexId(h))?.status === 'verified';
        commit(next, `${hexId(h)} ${on ? '已核对 ✓' : '取消核对'}`);
      } else if (tool === 'side') {
        const s = nearestSide(base.grid, world);
        if (!s) { toast('请点在格边附近'); return true; }
        const had = current.sides.get(sideKey(s.hex, s.dir))?.features.includes(sideBrush);
        hooks.highlightSide(s.hex, s.dir);
        commit(toggleSideFeature(base, edits, s.hex, s.dir, sideBrush, opts()),
          `${hexId(s.hex)} 格边：${had ? '去掉' : '加上'}${SIDE_FEATURE_NAMES[sideBrush]}`);
      }
      return true;
    },
    note(h, t) { commit(setNote(base, edits, h, t), `${hexId(h)} 备注已保存`); },
  };
}
