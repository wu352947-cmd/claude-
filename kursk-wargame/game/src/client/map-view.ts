/** 地图各图层的组装：纸面、地形起伏、参考底图、地形、线状要素、格网、居民点、格号、地名、图边。 */
import { Assets, BitmapFont, BitmapText, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  type Direction, type GameMap, type Offset, hexAt, hexCenter, hexCorners, hexId, parseHexId, sideCorners, toWorld,
} from '../engine';
import { drawLines, drawSettlements, drawSides, drawWoods } from './features';
import { MARGIN_KM, drawFurniture } from './furniture';
import { FONT_LATIN, FONT_SERIF, PALETTE, PX_PER_KM } from './style';
import { renderAreas, renderPaper, type WorldBounds } from './terrain-render';

export interface MapView {
  root: Container;
  bounds: WorldBounds;
  /** 含下方图边带的范围（"全图"用） */
  fullBounds: WorldBounds;
  layers: {
    reference: Sprite; relief: Sprite | null; terrain: Container; grid: Graphics;
    numbers: Container; labels: Container; status: Graphics;
  };
  select(h: Offset | null): void;
  /** 高亮一条格边（编辑器格边工具） */
  selectSide(h: Offset, dir: Direction): void;
  onZoom(zoom: number): void;
  /** 地图数据改变后（编辑器）重画地形、核对标记和地名 */
  update(map: GameMap): void;
  /** 核对标记是否同时显示"已核对"（编辑模式） */
  setShowVerified(on: boolean): void;
}

const K = PX_PER_KM;

export function gridBounds(map: GameMap): WorldBounds {
  const R = map.grid.acrossKm / Math.sqrt(3);
  const last = hexCenter(map.grid, { col: map.grid.cols - 1, row: map.grid.rows - 1 });
  return {
    x0: map.grid.origin.x - R - 0.5, y0: map.grid.origin.y - map.grid.acrossKm / 2 - 0.5,
    x1: last.x + R + 0.5, y1: last.y + map.grid.acrossKm + 0.5,
  };
}

async function imageLayer(url: string, bounds: [number, number, number, number]): Promise<Sprite> {
  const s = new Sprite(await Assets.load<Texture>(url));
  const [x0, y0, x1, y1] = bounds;
  s.position.set(x0 * K, y0 * K);
  s.width = (x1 - x0) * K;
  s.height = (y1 - y0) * K;
  return s;
}

/** 地名：中文衬线体 + 下方小号拉丁转写（放大后出现），屏幕上大小固定，按重要性避让。 */
function buildLabels(map: GameMap): Container {
  const labels = new Container();
  const SIZE = { city: 20, town: 16, village: 13, river: 13, height: 12, other: 12 } as const;
  for (const l of map.labels) {
    const p = toWorld(map.projection, l.lat, l.lon);
    const h = hexAt(map.grid, p);
    const terrain = map.hexes.get(hexId(h))?.terrain ?? '';
    const inTown = terrain === 'village' || terrain === 'town' || terrain === 'city';
    const c = new Container();
    c.label = l.kind;
    if (inTown) {
      // 贴在居民点白点的上方
      const ctr = hexCenter(map.grid, h);
      c.position.set(ctr.x * K, (ctr.y - 0.2) * K);
    } else {
      c.position.set(p.x * K, p.y * K);
      const dot = new Graphics().circle(0, 0, l.kind === 'city' ? 4 : 3).fill(PALETTE.label).stroke({ width: 1.5, color: PALETTE.labelHalo });
      labels.addChild(new Container({ position: c.position, children: [dot] }));
    }
    const zh = new Text({
      text: l.names.zh,
      style: {
        fontFamily: FONT_SERIF, fontSize: SIZE[l.kind], fontWeight: l.kind === 'city' || l.kind === 'town' ? '700' : '500',
        fill: PALETTE.label, stroke: { color: PALETTE.labelHalo, width: 3, join: 'round' },
      },
      resolution: 3,
    });
    zh.anchor.set(0.5, 1);
    zh.position.set(0, -4);
    zh.label = 'zh';
    c.addChild(zh);
    if (l.names.en) {
      const en = new Text({
        text: l.names.en,
        style: { fontFamily: FONT_LATIN, fontSize: SIZE[l.kind] * 0.78, fontStyle: 'italic', fill: PALETTE.labelSub, stroke: { color: PALETTE.labelHalo, width: 2.5, join: 'round' } },
        // 地名在屏幕上 1:1 显示，按屏幕像素密度生成；更高倍生成再缩小会出现锯齿
        resolution: Math.min(2, window.devicePixelRatio || 1),
      });
      en.anchor.set(0.5, 1);
      en.position.set(0, -3);
      en.label = 'latin';
      c.addChild(en);
    }
    labels.addChild(c);
  }
  return labels;
}

export async function createMapView(map: GameMap, referenceUrl: string, reliefUrl?: string): Promise<MapView> {
  const root = new Container();
  const bounds = gridBounds(map);
  const fullBounds = { ...bounds, y1: bounds.y1 + MARGIN_KM };

  const paper = new Sprite(Texture.from(renderPaper(bounds)));
  paper.position.set(bounds.x0 * K, bounds.y0 * K);
  paper.width = (bounds.x1 - bounds.x0) * K;
  paper.height = (bounds.y1 - bounds.y0) * K;

  let relief: Sprite | null = null;
  if (map.def.relief && reliefUrl) {
    relief = await imageLayer(reliefUrl, map.def.relief.boundsKm);
    relief.blendMode = 'multiply';
    relief.alpha = 0.75;
  }
  const reference = await imageLayer(referenceUrl, map.def.reference.boundsKm);

  // 地形（面状位图 + 矢量林地/线状要素/格边/居民点）
  const terrain = new Container();
  let areasKey = '';
  let areasSprite: Sprite | null = null;
  const buildTerrain = (m: GameMap): void => {
    // 面状位图重画较慢，只在沼泽/水面/城镇格子变化时才重画
    const key = [...m.hexes].filter(([, r]) => ['marsh', 'water', 'city', 'town'].includes(r.terrain))
      .map(([id, r]) => id + r.terrain).sort().join();
    if (key !== areasKey) {
      areasKey = key;
      areasSprite?.destroy(true);
      areasSprite = null;
      const areas = renderAreas(m, bounds);
      if (areas) {
        areasSprite = new Sprite(Texture.from(areas));
        areasSprite.position.set(bounds.x0 * K, bounds.y0 * K);
      }
    }
    for (const c of terrain.removeChildren()) if (c !== areasSprite) c.destroy();
    const woods = new Graphics(); drawWoods(m, woods);
    const lines = new Graphics(); drawLines(m, lines);
    const sides = new Graphics(); drawSides(m, sides);
    const settlements = new Graphics(); drawSettlements(m, settlements);
    terrain.addChild(...(areasSprite ? [areasSprite] : []), woods, lines, sides, settlements);
  };
  buildTerrain(map);

  // 格网：细线压在地形之上（东线兵棋地图的做法）
  const grid = new Graphics();
  for (let col = 0; col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      grid.poly(hexCorners(map.grid, { col, row }).flatMap((p) => [p.x * K, p.y * K]), true);
    }
  }
  grid.stroke({ width: 0.035 * K, color: PALETTE.hexLine, alpha: 0.9 });

  // 格号：小而淡，贴在格子上沿
  BitmapFont.install({ name: 'hexnum', style: { fontFamily: 'Arial, sans-serif', fontSize: 32, fill: PALETTE.hexNumber }, chars: '0123456789', resolution: 2 });
  const numbers = new Container();
  for (let col = 0; col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      const h = { col, row };
      const c = hexCenter(map.grid, h);
      const t = new BitmapText({ text: hexId(h), style: { fontFamily: 'hexnum', fontSize: 0.26 * K, letterSpacing: 0.02 * K } });
      t.anchor.set(0.5, 0);
      t.position.set(c.x * K, (c.y - map.grid.acrossKm / 2 + 0.12) * K);
      numbers.addChild(t);
    }
  }

  // 核对标记：橙色菱形 = 未核对；编辑模式下另用绿色小圆点标出已核对
  const status = new Graphics();
  let showVerified = false;
  let current = map;
  const drawStatus = (): void => {
    status.clear();
    for (const [id, rec] of current.hexes) {
      if (rec.status === 'verified') continue;
      const c = hexCenter(current.grid, parseHexId(id));
      const x = c.x * K, y = (c.y + 0.75) * K, r = 0.18 * K;
      status.poly([x, y - r, x + r, y, x, y + r, x - r, y], true);
    }
    status.fill({ color: PALETTE.auto, alpha: 0.95 }).stroke({ width: 1.2, color: 0xffffff, alpha: 0.8 });
    if (!showVerified) return;
    for (const [id, rec] of current.hexes) {
      if (rec.status !== 'verified') continue;
      const c = hexCenter(current.grid, parseHexId(id));
      status.circle(c.x * K, (c.y + 0.75) * K, 0.15 * K);
    }
    status.fill({ color: PALETTE.verified, alpha: 0.95 }).stroke({ width: 1.2, color: 0xffffff, alpha: 0.8 });
  };
  drawStatus();

  let labels = buildLabels(map);
  let lastZoom = 1;
  const furniture = drawFurniture(bounds, '库尔斯克 1943', `${map.def.name.zh} · 1:250,000 底图转绘 · 草稿`);
  const selection = new Graphics();

  root.addChild(paper, ...(relief ? [relief] : []), reference, terrain, grid, status, numbers, labels, furniture, selection);
  reference.alpha = 0.55;

  const view: MapView = {
    root, bounds, fullBounds,
    layers: { reference, relief, terrain, grid, numbers, labels, status },
    select(h) {
      selection.clear();
      if (!h) return;
      selection.poly(hexCorners(map.grid, h).flatMap((p) => [p.x * K, p.y * K]), true).stroke({ width: 0.15 * K, color: PALETTE.select });
    },
    selectSide(h, dir) {
      const [a, b] = sideCorners(map.grid, h, dir);
      selection.clear().moveTo(a.x * K, a.y * K).lineTo(b.x * K, b.y * K)
        .stroke({ width: 0.3 * K, color: PALETTE.select, cap: 'round', alpha: 0.85 });
    },
    update(m) {
      current = m;
      buildTerrain(m);
      drawStatus();
      const visible = labels.visible;
      const idx = root.getChildIndex(labels);
      labels.destroy({ children: true });
      labels = buildLabels(m);
      labels.visible = visible;
      root.addChildAt(labels, idx);
      view.layers.labels = labels;
      view.onZoom(lastZoom);
    },
    setShowVerified(on) { showVerified = on; drawStatus(); },
    onZoom(zoom) {
      lastZoom = zoom;
      numbers.renderable = numbers.visible && zoom >= 0.9;
      // 地名保持屏幕大小不变；按重要性依次放置，与已放置的重叠就隐藏
      const s = 1 / zoom;
      const rank: Record<string, number> = { city: 0, town: 1, village: 2, river: 3, height: 4, other: 5 };
      const groups = labels.children.filter((c) => c.label in rank).sort((a, b) => rank[a.label]! - rank[b.label]!);
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const c of groups) {
        c.scale.set(s);
        const latin = c.children.find((x) => x.label === 'latin');
        // 拉丁转写放在中文下方、白点上方；放大后才出现，中文随之上移
        const showLatin = zoom >= 1.3;
        if (latin) latin.visible = showLatin;
        const zh = c.children.find((x) => x.label === 'zh');
        if (zh && latin) zh.y = showLatin ? -4 - latin.height : -4;
        const bb = c.getLocalBounds();
        const box = { x0: c.x + bb.minX * s, x1: c.x + bb.maxX * s, y0: c.y + bb.minY * s, y1: c.y + bb.maxY * s };
        const hit = placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
        c.visible = !hit && (zoom >= 0.5 || c.label === 'city' || c.label === 'town');
        if (c.visible) placed.push(box);
      }
      for (const c of labels.children) if (!(c.label in rank)) c.scale.set(s);
    },
  };
  return view;
}
