import { Application } from 'pixi.js';
import {
  ENGINE_VERSION, GameMeta, SIDE_FEATURE_NAMES, STATUS_NAMES, TERRAIN_NAMES, type Direction, type Offset,
  formatDM, hexAt, hexCenter, hexId, hexRecord, inBounds, loadMap, sideRecord, toLatLon,
} from '../engine';
import rawMeta from '../../data/game.json';
import def from '../../data/maps/south.json';
import hexes from '../../data/maps/south.hexes.json';
import hexsides from '../../data/maps/south.hexsides.json';
import labels from '../../data/maps/south.labels.json';
import { attachCamera } from './camera';
import { createMapView } from './map-view';
import { PX_PER_KM } from './style';

const meta = GameMeta.parse(rawMeta);
const map = loadMap({ def, hexes, hexsides, labels });
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const DIR_NAMES = ['北', '东北', '东南', '南', '西南', '西北'];

function showInfo(h: Offset | null): void {
  const box = $('info');
  if (!h) { box.hidden = true; return; }
  const rec = hexRecord(map, h);
  const ll = toLatLon(map.projection, hexCenter(map.grid, h));
  const sides = ([0, 1, 2, 3, 4, 5] as Direction[])
    .map((d) => ({ d, r: sideRecord(map, h, d) }))
    .filter((x) => x.r)
    .map((x) => `${DIR_NAMES[x.d]}：${x.r!.features.map((f) => SIDE_FEATURE_NAMES[f]).join('、')}`);
  const isDefault = !map.hexes.has(hexId(h));
  box.innerHTML = `
    <div class="info-head"><span class="hexno">${hexId(h)}</span><button id="info-close" aria-label="关闭">×</button></div>
    <dl>
      <dt>地形</dt><dd>${TERRAIN_NAMES[rec.terrain]}${isDefault ? '<span class="muted">（未录入，默认）</span>' : ''}</dd>
      ${isDefault ? '' : `<dt>状态</dt><dd class="st-${rec.status}">${STATUS_NAMES[rec.status]}</dd>`}
      ${rec.note ? `<dt>备注</dt><dd>${rec.note}</dd>` : ''}
      <dt>格边</dt><dd>${sides.length ? sides.join('<br>') : '<span class="muted">无</span>'}</dd>
      <dt>中心</dt><dd>${formatDM(ll.lat, 'N', 'S')} ${formatDM(ll.lon, 'E', 'W')}</dd>
      ${rec.sources.length ? `<dt>出处</dt><dd>${rec.sources.join('、')}</dd>` : ''}
    </dl>`;
  box.hidden = false;
  $('info-close').onclick = () => { view.select(null); showInfo(null); };
}

let view: Awaited<ReturnType<typeof createMapView>>;

async function start(): Promise<void> {
  $('title').textContent = meta.title.zh;
  $('subtitle').textContent = `${map.def.name.zh} · 引擎 v${ENGINE_VERSION}`;
  const host = $('app');
  const app = new Application();
  await app.init({ resizeTo: host, background: '#cfc8ad', antialias: true, autoDensity: true, resolution: Math.min(2, devicePixelRatio) });
  host.appendChild(app.canvas);

  view = await createMapView(map, `${import.meta.env.BASE_URL}${map.def.reference.image}`);
  app.stage.addChild(view.root);

  const cam = attachCamera(app.canvas, view.root, (sx, sy) => {
    const local = view.root.toLocal({ x: sx, y: sy });
    const h = hexAt(map.grid, { x: local.x / PX_PER_KM, y: local.y / PX_PER_KM });
    if (inBounds(map.grid, h)) { view.select(h); showInfo(h); } else { view.select(null); showInfo(null); }
  });
  cam.onChange(() => view.onZoom(cam.zoom()));
  const b = view.bounds;
  cam.fit(b.x0 * PX_PER_KM, b.y0 * PX_PER_KM, b.x1 * PX_PER_KM, b.y1 * PX_PER_KM);

  // 图层开关
  const L = view.layers;
  const bind = (id: string, apply: (on: boolean) => void): void => {
    const el = $<HTMLInputElement>(id);
    const f = (): void => { apply(el.checked); view.onZoom(cam.zoom()); };
    el.addEventListener('change', f); f();
  };
  bind('ly-ref', (on) => { L.reference.visible = on; });
  bind('ly-terrain', (on) => { L.terrain.visible = on; L.sides.visible = on; });
  bind('ly-grid', (on) => { L.grid.visible = on; });
  bind('ly-num', (on) => { L.numbers.visible = on; });
  bind('ly-labels', (on) => { L.labels.visible = on; });
  bind('ly-status', (on) => { L.status.visible = on; });
  const op = $<HTMLInputElement>('ref-opacity');
  const setOp = (): void => { L.reference.alpha = Number(op.value) / 100; $('ref-op-val').textContent = `${op.value}%`; };
  op.addEventListener('input', setOp); setOp();
  $('layers-toggle').addEventListener('click', () => $('layers').classList.toggle('open'));
  $('fit').addEventListener('click', () => cam.fit(b.x0 * PX_PER_KM, b.y0 * PX_PER_KM, b.x1 * PX_PER_KM, b.y1 * PX_PER_KM));
  $('loading').remove();
}

void start();
