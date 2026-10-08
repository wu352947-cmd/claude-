/**
 * 矢量要素：林地、居民点、河流/道路/铁路、格边特征。矢量绘制，任何缩放下线条和边缘都锐利。
 */
import { FillPattern, Graphics, Matrix, Texture } from 'pixi.js';
import {
  type Direction, type GameMap, type LineFeature, type Point, SIDE_FEATURES, hexCenter, hexCorners, hexId,
  inBounds, linePoints, neighbor, parseHexId, sideCorners,
} from '../engine';
import { hashString } from './noise';
import { PALETTE, PX_PER_KM } from './style';

const K = PX_PER_KM;
const DIRS = [0, 1, 2, 3, 4, 5] as Direction[];

function hash2(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** 林地纹理：2 km 见方的无缝树冠图案（512 像素，放大后依然细腻）。 */
function woodsPattern(): FillPattern {
  const SIZE = 512, KM = 2, ppk = SIZE / KM;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex(PALETTE.woods);
  ctx.fillRect(0, 0, SIZE, SIZE);
  const STEP = 0.11;
  const n = Math.round(KM / STEP);
  const dots: { x: number; y: number; r: number; t: number }[] = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    dots.push({
      x: (gx + 0.5 + (hash2(gx, gy, 1) - 0.5) * 0.9) * STEP * ppk,
      y: (gy + 0.5 + (hash2(gx, gy, 2) - 0.5) * 0.9) * STEP * ppk,
      r: (0.04 + hash2(gx, gy, 3) * 0.025) * ppk,
      t: hash2(gx, gy, 4),
    });
  }
  // 每个点在四周复制一份，保证图案无缝平铺
  const draw = (fill: (d: typeof dots[0]) => void): void => {
    for (const d of dots) for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      ctx.save(); ctx.translate(ox, oy); fill(d); ctx.restore();
    }
  };
  draw((d) => { ctx.fillStyle = hex(PALETTE.woodsDark); ctx.beginPath(); ctx.arc(d.x + d.r * 0.25, d.y + d.r * 0.3, d.r, 0, Math.PI * 2); ctx.fill(); });
  draw((d) => {
    ctx.fillStyle = d.t > 0.5 ? hex(PALETTE.woodsLight) : hex(PALETTE.woods);
    ctx.beginPath(); ctx.arc(d.x - d.r * 0.2, d.y - d.r * 0.2, d.r * 0.72, 0, Math.PI * 2); ctx.fill();
  });
  const p = new FillPattern(Texture.from(c), 'repeat');
  p.setTransform(new Matrix().scale((KM * K) / SIZE, (KM * K) / SIZE));
  return p;
}

/** 林地：按格填充树冠纹理，只在林地外缘描深色边。 */
export function drawWoods(map: GameMap, g: Graphics): void {
  const ids = [...map.hexes].filter(([, r]) => r.terrain === 'woods').map(([id]) => id);
  if (ids.length === 0) return;
  const pattern = woodsPattern();
  const set = new Set(ids);
  for (const id of ids) g.poly(hexCorners(map.grid, parseHexId(id)).flatMap((p) => [p.x * K, p.y * K]), true);
  g.fill({ fill: pattern });
  for (const id of ids) {
    const h = parseHexId(id);
    for (const d of DIRS) {
      const n = neighbor(h, d);
      if (inBounds(map.grid, n) && set.has(hexId(n))) continue;
      const [a, b] = sideCorners(map.grid, h, d);
      g.moveTo(a.x * K, a.y * K).lineTo(b.x * K, b.y * K);
    }
  }
  g.stroke({ width: 0.07 * K, color: PALETTE.woodsEdge, cap: 'round' });
}

/** 居民点：沿街排开的小房子 + 屋后菜园 + 白色圆点（印刷兵棋地图的村庄符号）。 */
export function drawSettlements(map: GameMap, g: Graphics): void {
  const R = map.grid.acrossKm / Math.sqrt(3);
  const gardens: number[][] = [], houses: number[][] = [], streets: [Point, Point][] = [];
  const dots: { c: Point; r: number }[] = [];
  for (const [id, rec] of map.hexes) {
    const kind = rec.terrain as 'village' | 'town' | 'city';
    const n = { village: 24, town: 48, city: 90 }[kind];
    if (!n) continue;
    const h = parseHexId(id);
    const c = hexCenter(map.grid, h);
    const len = R * { village: 0.9, town: 1.15, city: 1.5 }[kind];
    const ang = hash2(h.col, h.row, 9) * Math.PI;
    const nStreets = kind === 'village' ? (hash2(h.row, h.col, 10) > 0.55 ? 2 : 1) : 3;
    for (let s = 0; s < nStreets; s++) {
      const a = ang + s * (Math.PI / 2.4);
      const ux = Math.cos(a), uy = Math.sin(a);
      const L = len * (s === 0 ? 1 : 0.6);
      streets.push([{ x: c.x - ux * L / 2, y: c.y - uy * L / 2 }, { x: c.x + ux * L / 2, y: c.y + uy * L / 2 }]);
      const m = Math.round((n / nStreets) * (s === 0 ? 1.2 : 0.8));
      for (let i = 0; i < m; i++) {
        const t = (i / m - 0.5) * L + (hash2(i, h.col * 3 + s, 4) - 0.5) * 0.08;
        if (Math.abs(t) < 0.22) continue; // 中心留给圆点
        const side = hash2(i, h.row + s, 5) > 0.5 ? 1 : -1;
        const off = side * (0.09 + hash2(i, h.col + s, 6) * 0.04);
        const x = c.x + ux * t - uy * off, y = c.y + uy * t + ux * off;
        const rect = (along: number, across0: number, across1: number): number[] => {
          const pts = [[-along, across0], [along, across0], [along, across1], [-along, across1]];
          return pts.flatMap(([p, q]) => [(x + ux * p! - uy * q! * side) * K, (y + uy * p! + ux * q! * side) * K]);
        };
        gardens.push(rect(0.045, 0.03, 0.15));
        houses.push(rect(0.04, -0.03, 0.03));
      }
    }
    dots.push({ c, r: { village: 0.14, town: 0.24, city: 0.34 }[kind] });
  }
  for (const p of gardens) g.poly(p, true);
  g.fill({ color: PALETTE.garden, alpha: 0.45 });
  for (const [a, b] of streets) g.moveTo(a.x * K, a.y * K).lineTo(b.x * K, b.y * K);
  g.stroke({ width: 0.03 * K, color: PALETTE.track, alpha: 0.6 });
  for (const p of houses) g.poly(p, true);
  g.fill(PALETTE.house);
  for (const d of dots) g.circle(d.c.x * K, d.c.y * K, d.r * K);
  g.fill(PALETTE.townDot).stroke({ width: 0.05 * K, color: PALETTE.townDotEdge });
}

/** 平滑曲线（Catmull-Rom）采样成密集折线（世界坐标，公里） */
function smooth(pts: Point[], step = 0.1): Point[] {
  const out: Point[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

function polyline(g: Graphics, pts: Point[]): Graphics {
  g.moveTo(pts[0]!.x * K, pts[0]!.y * K);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x * K, pts[i]!.y * K);
  return g;
}

/** 沿折线每隔 every 公里调用一次 fn（位置、单位切向量） */
function along(pts: Point[], every: number, fn: (p: Point, ux: number, uy: number, i: number) => void, start = every / 2): void {
  let next = start, acc = 0, i = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k]!, b = pts[k + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      fn({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, (b.x - a.x) / len, (b.y - a.y) / len, i++);
      next += every;
    }
    acc += len;
  }
}

/** 河流、道路、铁路：细线、分级清楚（印刷地图的线条层次）。 */
export function drawLines(map: GameMap, g: Graphics): void {
  const get = (k: LineFeature['kind'], c?: LineFeature['class']): Point[][] =>
    map.lines.filter((l) => l.kind === k && (c === undefined || l.class === c)).map((l) => smooth(linePoints(map.projection, l)));
  const round = { cap: 'round', join: 'round' } as const;
  // 水系
  for (const p of get('stream')) polyline(g, p).stroke({ width: 0.08 * K, color: PALETTE.river, ...round });
  for (const p of get('river')) polyline(g, p).stroke({ width: 0.5 * K, color: PALETTE.riverBank, alpha: 0.9, ...round });
  for (const p of get('river')) polyline(g, p).stroke({ width: 0.3 * K, color: PALETTE.riverEdge, ...round });
  for (const p of get('river')) polyline(g, p).stroke({ width: 0.22 * K, color: PALETTE.river, ...round });
  // 土路：细虚线
  for (const p of get('track')) {
    along(p, 0.28, (q, ux, uy) => {
      g.moveTo((q.x - ux * 0.08) * K, (q.y - uy * 0.08) * K).lineTo((q.x + ux * 0.08) * K, (q.y + uy * 0.08) * K);
    });
  }
  g.stroke({ width: 0.045 * K, color: PALETTE.track, cap: 'butt' });
  // 公路
  for (const p of get('road', 'secondary')) polyline(g, p).stroke({ width: 0.13 * K, color: PALETTE.roadCasing, ...round });
  for (const p of get('road', 'secondary')) polyline(g, p).stroke({ width: 0.06 * K, color: PALETTE.road, ...round });
  for (const p of get('road', 'primary')) polyline(g, p).stroke({ width: 0.2 * K, color: PALETTE.road, ...round });
  for (const p of get('road', 'primary')) polyline(g, p).stroke({ width: 0.12 * K, color: PALETTE.roadPrimary, ...round });
  // 铁路：细黑线 + 短枕木
  for (const p of get('railway')) {
    polyline(g, p).stroke({ width: 0.06 * K, color: PALETTE.rail, ...round });
    along(p, 0.3, (q, ux, uy) => {
      g.moveTo((q.x - uy * 0.1) * K, (q.y + ux * 0.1) * K).lineTo((q.x + uy * 0.1) * K, (q.y - ux * 0.1) * K);
    });
    g.stroke({ width: 0.04 * K, color: PALETTE.rail });
  }
}

/** 人工录入的格边特征（冲沟、铁路路堤等；河流按走向画在 drawLines 里） */
export function drawSides(map: GameMap, g: Graphics): void {
  const order = [...SIDE_FEATURES];
  for (const [key, rec] of map.sides) {
    const h = parseHexId(key.slice(0, 4));
    const dir = Number(key.slice(5)) as Direction;
    const [a, b] = sideCorners(map.grid, h, dir);
    const c = hexCenter(map.grid, h);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const nx = mx - c.x, ny = my - c.y, nl = Math.hypot(nx, ny);
    const off = (hashString(key) - 0.5) * 0.7;
    const pts = smooth([a, { x: mx + (nx / nl) * off, y: my + (ny / nl) * off }, b]);
    for (const f of [...rec.features].sort((p, q) => order.indexOf(p) - order.indexOf(q))) {
      if (f === 'majorRiver') polyline(g, pts).stroke({ width: 0.35 * K, color: PALETTE.river, cap: 'round' });
      else if (f === 'minorRiver') polyline(g, pts).stroke({ width: 0.22 * K, color: PALETTE.river, cap: 'round' });
      else if (f === 'stream') polyline(g, pts).stroke({ width: 0.08 * K, color: PALETTE.river, cap: 'round' });
      else if (f === 'balka') {
        polyline(g, pts).stroke({ width: 0.06 * K, color: PALETTE.balka, cap: 'round' });
        along(pts, 0.18, (q, ux, uy) => {
          g.moveTo(q.x * K, q.y * K).lineTo((q.x - uy * 0.14) * K, (q.y + ux * 0.14) * K)
            .moveTo(q.x * K, q.y * K).lineTo((q.x + uy * 0.14) * K, (q.y - ux * 0.14) * K);
        });
        g.stroke({ width: 0.035 * K, color: PALETTE.balka });
      } else if (f === 'railEmbankment') polyline(g, pts).stroke({ width: 0.12 * K, color: PALETTE.rail });
    }
  }
}
