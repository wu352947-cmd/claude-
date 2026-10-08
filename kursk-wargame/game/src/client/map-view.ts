/** 地图各图层：参考底图、地形、格边、格网、格号、地名、核对状态、选中框。 */
import { Assets, BitmapFont, BitmapText, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  type Direction, type GameMap, type LineFeature, type Offset, type Point, SIDE_FEATURES, hexCenter, hexCorners, hexId,
  hexAt, linePoints, parseHexId, sideCorners, toWorld,
} from '../engine';
import { hashString } from './noise';
import { PALETTE, PX_PER_KM, THEME } from './style';
import { renderPaper, renderTerrain, type WorldBounds } from './terrain-render';

export interface MapView {
  root: Container;
  bounds: WorldBounds;
  layers: { reference: Sprite; relief: Sprite | null; terrain: Sprite; sides: Graphics; lines: Graphics; grid: Graphics; numbers: Container; labels: Container; status: Graphics };
  select(h: Offset | null): void;
  onZoom(zoom: number): void;
}

const K = PX_PER_KM;

export function gridBounds(map: GameMap): WorldBounds {
  const R = map.grid.acrossKm / Math.sqrt(3);
  const last = hexCenter(map.grid, { col: map.grid.cols - 1, row: map.grid.rows - 1 });
  return {
    x0: map.grid.origin.x - R - 1, y0: map.grid.origin.y - map.grid.acrossKm / 2 - 1,
    x1: last.x + R + 1, y1: last.y + map.grid.acrossKm + 1,
  };
}

function drawSides(map: GameMap, g: Graphics): void {
  const order = [...SIDE_FEATURES];
  for (const [key, rec] of map.sides) {
    const h = parseHexId(key.slice(0, 4));
    const dir = Number(key.slice(5)) as Direction;
    const [a, b] = sideCorners(map.grid, h, dir);
    const c = hexCenter(map.grid, h);
    // 曲线控制点：沿格边中点的法线方向随机偏移，让河道不那么僵直
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const nx = mx - c.x, ny = my - c.y, nl = Math.hypot(nx, ny);
    const off = (hashString(key) - 0.5) * 0.7;
    const cx = mx + (nx / nl) * off, cy = my + (ny / nl) * off;
    for (const f of [...rec.features].sort((p, q) => order.indexOf(p) - order.indexOf(q))) {
      const path = (): Graphics => g.moveTo(a.x * K, a.y * K).quadraticCurveTo(cx * K, cy * K, b.x * K, b.y * K);
      if (f === 'majorRiver') path().stroke({ width: 0.4 * K, color: PALETTE.river, cap: 'round' });
      else if (f === 'minorRiver') path().stroke({ width: 0.22 * K, color: PALETTE.river, cap: 'round' });
      else if (f === 'stream') path().stroke({ width: 0.1 * K, color: PALETTE.river, cap: 'round' });
      else if (f === 'balka') {
        path().stroke({ width: 0.09 * K, color: PALETTE.balka, cap: 'round' });
        for (let t = 0.15; t < 0.9; t += 0.14) {
          const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
          const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
          const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
          g.moveTo(x * K, y * K).lineTo((x - (dy / l) * 0.18) * K, (y + (dx / l) * 0.18) * K)
            .moveTo(x * K, y * K).lineTo((x + (dy / l) * 0.18) * K, (y - (dx / l) * 0.18) * K);
        }
        g.stroke({ width: 0.05 * K, color: PALETTE.balka });
      } else if (f === 'railEmbankment') {
        path().stroke({ width: 0.14 * K, color: PALETTE.rail });
      }
    }
  }
}

/** 平滑折线（Catmull-Rom → 三次贝塞尔） */
function smoothPath(g: Graphics, pts: Point[]): Graphics {
  const P = pts.map((p) => ({ x: p.x * K, y: p.y * K }));
  g.moveTo(P[0]!.x, P[0]!.y);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[Math.min(P.length - 1, i + 2)]!;
    g.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
  return g;
}

/** 河流、道路、铁路：按实际走向画平滑曲线（规则用的格边/连通由引擎另行推算）。 */
function drawLines(map: GameMap, g: Graphics): void {
  const byKind = (k: LineFeature['kind'], c?: LineFeature['class']): Point[][] =>
    map.lines.filter((l) => l.kind === k && (c === undefined || l.class === c)).map((l) => linePoints(map.projection, l));
  const round = { cap: 'round', join: 'round' } as const;
  for (const p of byKind('stream')) smoothPath(g, p).stroke({ width: 0.17 * K, color: PALETTE.riverEdge, alpha: 0.55, ...round });
  for (const p of byKind('stream')) smoothPath(g, p).stroke({ width: 0.11 * K, color: PALETTE.river, ...round });
  for (const p of byKind('river')) smoothPath(g, p).stroke({ width: 0.75 * K, color: PALETTE.riverBank, alpha: 0.85, ...round });
  for (const p of byKind('river')) smoothPath(g, p).stroke({ width: 0.42 * K, color: PALETTE.riverEdge, ...round });
  for (const p of byKind('river')) smoothPath(g, p).stroke({ width: 0.32 * K, color: PALETTE.river, ...round });
  for (const p of byKind('track')) smoothPath(g, p).stroke({ width: 0.06 * K, color: PALETTE.road, alpha: 0.7, ...round });
  for (const p of byKind('road', 'secondary')) smoothPath(g, p).stroke({ width: 0.2 * K, color: PALETTE.roadCasing, ...round });
  for (const p of byKind('road', 'secondary')) smoothPath(g, p).stroke({ width: 0.09 * K, color: PALETTE.road, ...round });
  for (const p of byKind('road', 'primary')) smoothPath(g, p).stroke({ width: 0.32 * K, color: PALETTE.roadCasing, ...round });
  for (const p of byKind('road', 'primary')) smoothPath(g, p).stroke({ width: 0.17 * K, color: PALETTE.roadPrimary, ...round });
  // 铁路：黑线 + 横向枕木短线
  for (const pts of byKind('railway')) {
    smoothPath(g, pts).stroke({ width: 0.11 * K, color: PALETTE.rail, ...round });
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let t = carry; t < len; t += 0.45) {
        const x = a.x + ux * t, y = a.y + uy * t;
        g.moveTo((x - uy * 0.16) * K, (y + ux * 0.16) * K).lineTo((x + uy * 0.16) * K, (y - ux * 0.16) * K);
        carry = t + 0.45 - len;
      }
    }
    g.stroke({ width: 0.06 * K, color: PALETTE.rail });
  }
}

/** 地图外框：深色边框 + 浅色细内线（桌面兵棋地图的边框） */
function drawFrame(b: WorldBounds, g: Graphics): void {
  const w = 1.6;
  g.rect((b.x0 - w / 2) * K, (b.y0 - w / 2) * K, (b.x1 - b.x0 + w) * K, (b.y1 - b.y0 + w) * K).stroke({ width: w * K, color: PALETTE.frame });
  g.rect((b.x0 + 0.15) * K, (b.y0 + 0.15) * K, (b.x1 - b.x0 - 0.3) * K, (b.y1 - b.y0 - 0.3) * K).stroke({ width: 0.08 * K, color: PALETTE.frame, alpha: 0.8 });
  g.rect((b.x0 - w - 0.2) * K, (b.y0 - w - 0.2) * K, (b.x1 - b.x0 + 2 * w + 0.4) * K, (b.y1 - b.y0 + 2 * w + 0.4) * K).stroke({ width: 0.1 * K, color: PALETTE.frameInner, alpha: 0.6 });
}

export async function createMapView(map: GameMap, referenceUrl: string, reliefUrl?: string): Promise<MapView> {
  const root = new Container();
  const bounds = gridBounds(map);

  // 参考底图
  const refTex = await Assets.load<Texture>(referenceUrl);
  const reference = new Sprite(refTex);
  const [rx0, ry0, rx1, ry1] = map.def.reference.boundsKm;
  reference.position.set(rx0 * K, ry0 * K);
  reference.width = (rx1 - rx0) * K;
  reference.height = (ry1 - ry0) * K;

  // 纸张底色（最底层）
  const paper = new Sprite(Texture.from(renderPaper(bounds)));
  paper.position.set(bounds.x0 * K, bounds.y0 * K);
  paper.width = (bounds.x1 - bounds.x0) * K;
  paper.height = (bounds.y1 - bounds.y0) * K;

  // 地形明暗（正片叠底）
  let relief: Sprite | null = null;
  if (map.def.relief && reliefUrl) {
    relief = new Sprite(await Assets.load<Texture>(reliefUrl));
    const [x0, y0, x1, y1] = map.def.relief.boundsKm;
    relief.position.set(x0 * K, y0 * K);
    relief.width = (x1 - x0) * K;
    relief.height = (y1 - y0) * K;
    relief.blendMode = 'multiply';
    relief.alpha = THEME === 'cool' ? 0.75 : 1;
  }

  // 地形
  const terrain = new Sprite(Texture.from(renderTerrain(map, bounds)));
  terrain.position.set(bounds.x0 * K, bounds.y0 * K);

  const sides = new Graphics();
  drawSides(map, sides);
  const lines = new Graphics();
  drawLines(map, lines);
  const frame = new Graphics();
  drawFrame(bounds, frame);

  // 格网
  const grid = new Graphics();
  for (let col = 0; col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      grid.poly(hexCorners(map.grid, { col, row }).flatMap((p) => [p.x * K, p.y * K]), true);
    }
  }
  grid.stroke({ width: 1, color: PALETTE.hexLine, alpha: 0.75, pixelLine: true });
  // 格内浅色内边（印刷兵棋地图常见的"压凹"格子）——仅暖调；冷调学东线地图，只用细格线
  for (let col = 0; THEME === 'warm' && col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      const c = hexCenter(map.grid, { col, row });
      grid.poly(hexCorners(map.grid, { col, row }).flatMap((p) => [(c.x + (p.x - c.x) * 0.93) * K, (c.y + (p.y - c.y) * 0.93) * K]), true);
    }
  }
  grid.stroke({ width: 0.09 * K, color: PALETTE.hexBevel, alpha: 0.55 });

  // 格号
  BitmapFont.install({ name: 'hexnum', style: { fontFamily: 'Arial, sans-serif', fontSize: 28, fill: PALETTE.hexNumber }, chars: '0123456789', resolution: 2 });
  // 格号：小而淡，像印刷兵棋地图那样贴在格子上沿
  const numbers = new Container();
  for (let col = 0; col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      const h = { col, row };
      const c = hexCenter(map.grid, h);
      const t = new BitmapText({ text: hexId(h), style: { fontFamily: 'hexnum', fontSize: 0.3 * K } });
      t.anchor.set(0.5, 0);
      t.position.set(c.x * K, (c.y - map.grid.acrossKm / 2 + 0.1) * K);
      t.alpha = 0.9;
      numbers.addChild(t);
    }
  }

  // 核对状态：自动提取、未核对的格子在格中心偏上画一个橙色小菱形
  const status = new Graphics();
  for (const [id, rec] of map.hexes) {
    if (rec.status === 'verified') continue;
    const c = hexCenter(map.grid, parseHexId(id));
    const x = c.x * K, y = (c.y - 0.55) * K, r = 0.22 * K;
    status.poly([x, y - r, x + r, y, x, y + r, x - r, y], true);
  }
  status.fill({ color: PALETTE.auto, alpha: 0.95 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });

  // 地名
  const labels = new Container();
  const SIZE = { city: 30, town: 24, village: 19, river: 19, height: 16, other: 16 } as const;
  for (const l of map.labels) {
    const p = toWorld(map.projection, l.lat, l.lon);
    const t = new Text({
      text: l.names.zh,
      style: {
        fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
        fontSize: SIZE[l.kind], fontWeight: l.kind === 'city' ? '700' : '600', fill: PALETTE.label,
        stroke: { color: PALETTE.labelHalo, width: 5, join: 'round' },
      },
      resolution: 2,
    });
    t.anchor.set(0.5, 1.15);
    const inTown = ['village', 'town', 'city'].includes(map.hexes.get(hexId(hexAt(map.grid, p)))?.terrain ?? '');
    if (inTown) {
      // 地名贴在该居民点格的白点上方
      const c = hexCenter(map.grid, hexAt(map.grid, p));
      p.x = c.x; p.y = c.y - 0.25;
    }
    const dot = new Graphics();
    t.position.set(p.x * K, p.y * K);
    if (!inTown) dot.circle(p.x * K, p.y * K, l.kind === 'city' ? 5 : 3.5).fill(PALETTE.label).stroke({ width: 2, color: PALETTE.labelHalo });
    t.label = l.kind; dot.label = l.kind;
    labels.addChild(dot, t);
  }

  // 居民点标记：白色圆点加黑边（村庄）、较大（镇）——学《Holland '44》
  const towns = new Graphics();
  for (const [id, rec] of map.hexes) {
    const r = { village: 0.15, town: 0.26, city: 0.36 }[rec.terrain as 'village' | 'town' | 'city'];
    if (!r) continue;
    const c = hexCenter(map.grid, parseHexId(id));
    towns.circle(c.x * K, c.y * K, r * K).fill(0xffffff).stroke({ width: 0.06 * K, color: 0x1f1d1a });
  }

  const selection = new Graphics();

  root.addChild(paper, ...(relief ? [relief] : []), reference, terrain, lines, sides, grid, towns, frame, status, numbers, labels, selection);
  reference.alpha = 0.45;
  terrain.alpha = 1;

  return {
    root, bounds,
    layers: { reference, relief, terrain, sides, lines, grid, numbers, labels, status },
    select(h) {
      selection.clear();
      if (!h) return;
      selection.poly(hexCorners(map.grid, h).flatMap((p) => [p.x * K, p.y * K]), true).stroke({ width: 4, color: PALETTE.select });
    },
    onZoom(zoom) {
      numbers.renderable = numbers.visible && zoom >= 0.75;
      // 地名保持屏幕上大小不变；按重要性依次放置，和已放置的地名重叠就隐藏
      const s = Math.min(2.5, Math.max(0.25, 1 / zoom));
      const rank = { city: 0, town: 1, village: 2, river: 3, height: 4, other: 5 } as Record<string, number>;
      const texts = labels.children.filter((c): c is Text => c instanceof Text).sort((a, b) => rank[a.label]! - rank[b.label]!);
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const t of texts) {
        t.scale.set(s);
        const box = { x0: t.x - t.width / 2, x1: t.x + t.width / 2, y0: t.y - t.height * 1.15, y1: t.y };
        const hit = placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
        t.visible = !hit;
        if (!hit) placed.push(box);
      }
    },
  };
}
