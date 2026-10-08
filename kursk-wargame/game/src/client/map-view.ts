/** 地图各图层：参考底图、地形、格边、格网、格号、地名、核对状态、选中框。 */
import { Assets, BitmapFont, BitmapText, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  type Direction, type GameMap, type Offset, SIDE_FEATURES, hexCenter, hexCorners, hexId, parseHexId,
  sideCorners, toWorld,
} from '../engine';
import { hashString } from './noise';
import { PALETTE, PX_PER_KM } from './style';
import { renderPaper, renderTerrain, type WorldBounds } from './terrain-render';

export interface MapView {
  root: Container;
  bounds: WorldBounds;
  layers: { reference: Sprite; terrain: Sprite; sides: Graphics; grid: Graphics; numbers: Container; labels: Container; status: Graphics };
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

export async function createMapView(map: GameMap, referenceUrl: string): Promise<MapView> {
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

  // 地形
  const terrain = new Sprite(Texture.from(renderTerrain(map, bounds)));
  terrain.position.set(bounds.x0 * K, bounds.y0 * K);

  const sides = new Graphics();
  drawSides(map, sides);

  // 格网
  const grid = new Graphics();
  for (let col = 0; col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      grid.poly(hexCorners(map.grid, { col, row }).flatMap((p) => [p.x * K, p.y * K]), true);
    }
  }
  grid.stroke({ width: 1, color: PALETTE.hexLine, alpha: 0.5, pixelLine: true });

  // 格号
  BitmapFont.install({ name: 'hexnum', style: { fontFamily: 'Arial, sans-serif', fontSize: 28, fill: PALETTE.hexNumber }, chars: '0123456789', resolution: 2 });
  const numbers = new Container();
  for (let col = 0; col < map.grid.cols; col++) {
    for (let row = 0; row < map.grid.rows; row++) {
      const h = { col, row };
      const c = hexCenter(map.grid, h);
      const t = new BitmapText({ text: hexId(h), style: { fontFamily: 'hexnum', fontSize: 0.36 * K } });
      t.anchor.set(0.5, 0);
      t.position.set(c.x * K, (c.y - map.grid.acrossKm / 2 + 0.12) * K);
      t.alpha = 0.8;
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
    t.position.set(p.x * K, p.y * K);
    const dot = new Graphics().circle(p.x * K, p.y * K, l.kind === 'city' ? 5 : 3.5).fill(PALETTE.label).stroke({ width: 2, color: PALETTE.labelHalo });
    t.label = l.kind; dot.label = l.kind;
    labels.addChild(dot, t);
  }

  const selection = new Graphics();

  root.addChild(paper, reference, terrain, sides, grid, status, numbers, labels, selection);
  reference.alpha = 0.45;
  terrain.alpha = 1;

  return {
    root, bounds,
    layers: { reference, terrain, sides, grid, numbers, labels, status },
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
