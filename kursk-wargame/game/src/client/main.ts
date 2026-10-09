import { Application } from 'pixi.js';
import {
  ENGINE_VERSION, GameMeta, SIDE_FEATURE_NAMES, STATUS_NAMES, TERRAIN_NAMES, type Direction, type Offset,
  type GameContext, RatingsParams, Sequence, formatDM, hexAt, hexCenter, hexId, hexRecord, inBounds, initialState, linksBetween,
  loadDeployment, loadMap, loadOob, neighbor, placedUnits, sideFeatures, stacks, toLatLon, withFullSteps,
} from '../engine';
import rawMeta from '../../data/game.json';
import def from '../../data/maps/south.json';
import hexes from '../../data/maps/south.hexes.json';
import hexsides from '../../data/maps/south.hexsides.json';
import labels from '../../data/maps/south.labels.json';
import lines from '../../data/maps/south.lines.json';
import oobData from '../../data/units/south.oob.json';
import ratingsParams from '../../data/rules/ratings.json';
import demoDeployment from '../../data/scenarios/demo.deployment.json';
import sequence from '../../data/rules/sequence.json';
import { attachCamera } from './camera';
import { createEditor } from './editor';
import { type GameUi, createGameUi } from './game-ui';
import { createMapView } from './map-view';
import { MAP_FONTS, PX_PER_KM } from './style';
import { unitSectionHtml } from './unit-panel';
import { createUnitsView } from './units-view';

const meta = GameMeta.parse(rawMeta);
const baseMap = loadMap({ def, hexes, hexsides, labels, lines });
/** 当前显示的地图 = 数据文件 + 编辑器里的修改 */
let map = baseMap;
const oob = loadOob(oobData, RatingsParams.parse(ratingsParams));
const { deployment } = loadDeployment(oob, baseMap.grid, demoDeployment);
const ctx: GameContext = { grid: baseMap.grid, oob, sequence: Sequence.parse(sequence) };
/** 想定 + 种子 → 初始状态（目前只有演示摆放） */
const initialFor = (scenario: string, seed: number) => {
  if (scenario !== deployment.id) throw new Error(`没有想定 ${scenario}`);
  return withFullSteps(ctx, initialState(scenario, deployment.first, seed, deployment));
};
/** 当前对局各格的堆叠（由对局状态算出） */
let stackMap = new Map<string, ReturnType<typeof placedUnits>>();
/** 信息面板里选中的单位 */
let selectedUnit: string | null = null;
/** 正在等玩家点目标格的单位（临时移动） */
let moving: string | null = null;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const DIR_NAMES = ['北', '东北', '东南', '南', '西南', '西北'];
let toastTimer = 0;
const toast = (msg: string): void => {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
};
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function showInfo(h: Offset | null): void {
  const box = $('info');
  if (!h) { box.hidden = true; return; }
  const rec = hexRecord(map, h);
  const ll = toLatLon(map.projection, hexCenter(map.grid, h));
  const dirs = [0, 1, 2, 3, 4, 5] as Direction[];
  const sides = dirs
    .map((d) => ({ d, f: sideFeatures(map, h, d) }))
    .filter((x) => x.f.length)
    .map((x) => `${DIR_NAMES[x.d]}：${x.f.map((f) => SIDE_FEATURE_NAMES[f]).join('、')}`);
  const LINK_NAMES = { road: '公路', track: '小路', railway: '铁路', river: '', stream: '' } as const;
  const links = dirs
    .map((d) => ({ d, k: linksBetween(map, h, neighbor(h, d)) }))
    .filter((x) => x.k.length)
    .map((x) => `${DIR_NAMES[x.d]}：${x.k.map((k) => LINK_NAMES[k]).join('、')}`);
  const isDefault = !map.hexes.has(hexId(h));
  box.innerHTML = `
    <div class="info-head"><span class="hexno">${hexId(h)}</span><button id="info-close" aria-label="关闭">×</button></div>
    <dl>
      <dt>地形</dt><dd>${TERRAIN_NAMES[rec.terrain]}${isDefault ? '<span class="muted">（未录入，默认）</span>' : ''}</dd>
      ${isDefault ? '' : `<dt>状态</dt><dd class="st-${rec.status}">${STATUS_NAMES[rec.status]}</dd>`}
      ${editor.active ? '' : rec.note ? `<dt>备注</dt><dd>${esc(rec.note)}</dd>` : ''}
      <dt>格边</dt><dd>${sides.length ? sides.join('<br>') : '<span class="muted">无</span>'}</dd>
      <dt>道路</dt><dd>${links.length ? links.join('<br>') : '<span class="muted">无</span>'}</dd>
      <dt>中心</dt><dd>${formatDM(ll.lat, 'N', 'S')} ${formatDM(ll.lon, 'E', 'W')}</dd>
      ${rec.sources.length ? `<dt>出处</dt><dd>${rec.sources.join('、')}</dd>` : ''}
    </dl>
    ${editor.active ? '' : unitSectionHtml(stackMap.get(hexId(h)) ?? [], selectedUnit, moving !== null && moving === selectedUnit)}
    ${editor.active ? `<textarea id="info-note" placeholder="备注（例如：对照图上此处有冲沟）">${esc(rec.note ?? '')}</textarea>
      <button class="note-save" id="info-note-save">保存备注</button>` : ''}`;
  box.hidden = false;
  const save = document.getElementById('info-note-save');
  if (save) save.onclick = () => { editor.note(h, $<HTMLTextAreaElement>('info-note').value); showInfo(h); };
  for (const b of box.querySelectorAll<HTMLButtonElement>('.unit-row')) {
    b.onclick = () => { selectedUnit = b.dataset.unit ?? null; moving = null; units.highlight(selectedUnit); showInfo(h); };
  }
  const mv = document.getElementById('move-btn');
  if (mv) mv.onclick = () => { moving = moving ? null : selectedUnit; showInfo(h); };
  $('info-close').onclick = () => { moving = null; view.select(null); units.highlight(null); showInfo(null); };
}

let view: Awaited<ReturnType<typeof createMapView>>;
let editor: ReturnType<typeof createEditor>;
let units: ReturnType<typeof createUnitsView>;
let game: GameUi;

async function start(): Promise<void> {
  $('title').textContent = meta.title.zh;
  $('subtitle').textContent = `${map.def.name.zh} · 引擎 v${ENGINE_VERSION}`;
  const host = $('app');
  const app = new Application();
  await app.init({ resizeTo: host, background: '#2b2e30', antialias: true, autoDensity: true, resolution: Math.min(2, devicePixelRatio) });
  host.appendChild(app.canvas);

  // 先加载地图字体，否则 PixiJS 会用后备字体把文字画进纹理
  await Promise.all(MAP_FONTS.map(async (f) => {
    try {
      const face = new FontFace(f.family, `url(${import.meta.env.BASE_URL}${f.file})`, { style: f.style });
      document.fonts.add(await face.load());
    } catch (e) { console.warn('字体加载失败，使用后备字体', f.family, e); }
  }));
  view = await createMapView(map, `${import.meta.env.BASE_URL}${map.def.reference.image}`,
    map.def.relief ? `${import.meta.env.BASE_URL}${map.def.relief.image}` : undefined);
  app.stage.addChild(view.root);
  // 算子在地名之上、选中框之下
  units = createUnitsView(map);
  view.root.addChildAt(units.root, view.root.children.length - 1);

  let selected: ReturnType<typeof hexAt> | null = null;
  editor = createEditor(baseMap, {
    onMapChange(m) {
      map = m;
      view.update(m);
      if (selected && !$('info').hidden) showInfo(selected);
    },
    onActiveChange(on) {
      // 编辑时显示核对标记（含已核对的绿点）；参考底图由所有者在"图层"里按需打开
      view.setShowVerified(on);
      const st = $<HTMLInputElement>('ly-status');
      if (on && !st.checked) { st.checked = true; st.dispatchEvent(new Event('change')); }
      // 编辑地图时隐藏算子，免得挡住地形
      units.root.visible = !on && $<HTMLInputElement>('ly-units').checked;
      units.highlight(null);
      $('game').hidden = on;
      moving = null;
      view.select(null); showInfo(null);
    },
    highlightSide: (h, dir) => view.selectSide(h, dir),
  });
  map = editor.map();
  if (map !== baseMap) view.update(map);

  game = createGameUi(ctx, initialFor, deployment.id, ENGINE_VERSION, (s) => {
    stackMap = stacks(placedUnits(ctx, s));
    void units.render(stackMap);
    if (selected && !$('info').hidden) showInfo(selected);
  }, toast);

  const cam = attachCamera(app.canvas, view.root, (sx, sy) => {
    const local = view.root.toLocal({ x: sx, y: sy });
    const world = { x: local.x / PX_PER_KM, y: local.y / PX_PER_KM };
    const h = hexAt(map.grid, world);
    if (!inBounds(map.grid, h)) { selected = null; view.select(null); showInfo(null); return; }
    if (editor.tap(world, h)) {
      if (editor.tool !== 'side') view.select(h);
      showInfo(null);
      return;
    }
    if (moving && !editor.active) {
      const u = moving;
      moving = null;
      if (game.dispatch({ type: 'Relocate', unit: u, to: hexId(h) })) {
        selected = h; selectedUnit = u; units.highlight(u); view.select(h); showInfo(h);
      }
      return;
    }
    selected = h;
    // 点到有部队的格子，默认选中最上面的单位
    const stack = stackMap.get(hexId(h)) ?? [];
    selectedUnit = editor.active ? null : stack.at(-1)?.unit.id ?? null;
    units.highlight(selectedUnit);
    view.select(h); showInfo(h);
  });
  cam.onChange(() => view.onZoom(cam.zoom()));
  const b = view.fullBounds;
  cam.fit(b.x0 * PX_PER_KM, b.y0 * PX_PER_KM, b.x1 * PX_PER_KM, b.y1 * PX_PER_KM);

  // 图层开关
  const L = view.layers;
  const bind = (id: string, apply: (on: boolean) => void): void => {
    const el = $<HTMLInputElement>(id);
    const f = (): void => { apply(el.checked); view.onZoom(cam.zoom()); };
    el.addEventListener('change', f); f();
  };
  bind('ly-ref', (on) => { L.reference.visible = on; });
  bind('ly-ref2', (on) => { if (L.reference2) L.reference2.visible = on; });
  bind('ly-relief', (on) => { if (L.relief) L.relief.visible = on; });
  bind('ly-terrain', (on) => { L.terrain.visible = on; });
  bind('ly-grid', (on) => { L.grid.visible = on; });
  bind('ly-num', (on) => { L.numbers.visible = on; });
  bind('ly-labels', (on) => { L.labels.visible = on; });
  bind('ly-status', (on) => { L.status.visible = on; });
  bind('ly-units', (on) => { units.root.visible = on && !editor.active; });
  const op = $<HTMLInputElement>('ref-opacity');
  const setOp = (): void => { L.reference.alpha = Number(op.value) / 100; if (L.reference2) L.reference2.alpha = Number(op.value) / 100; $('ref-op-val').textContent = `${op.value}%`; };
  op.addEventListener('input', setOp); setOp();
  // 编辑面板里的"参考底图"开关与图层面板同步
  const edRef = $<HTMLInputElement>('ed-ref'), lyRef = $<HTMLInputElement>('ly-ref');
  edRef.checked = lyRef.checked;
  edRef.addEventListener('change', () => { lyRef.checked = edRef.checked; lyRef.dispatchEvent(new Event('change')); });
  lyRef.addEventListener('change', () => { edRef.checked = lyRef.checked; });
  $('layers-toggle').addEventListener('click', () => $('layers').classList.toggle('open'));
  $('fit').addEventListener('click', () => cam.fit(b.x0 * PX_PER_KM, b.y0 * PX_PER_KM, b.x1 * PX_PER_KM, b.y1 * PX_PER_KM));
  $('loading').remove();
}

void start();
