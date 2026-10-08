/**
 * 把"每格一种地形"的数据画成兵棋地图风格：
 *  - 纸面：库尔斯克夏季的大块田地（色调轻微变化 + 浅色田埂）
 *  - 林地：一簇簇树冠（相邻林地格自然连成片）
 *  - 居民点：浅色底块上的小房子
 *  - 沼泽、水面、城市：自然边缘的色块
 * 规则只看格子数据；这里只是"画法"。
 */
import { type GameMap, type Terrain, hexCenter, hexCorners, parseHexId, radiusOf } from '../engine';
import { fbm, valueNoise } from './noise';
import { PALETTE, PX_PER_KM, type RGB } from './style';

export interface WorldBounds { x0: number; y0: number; x1: number; y1: number }

const LOW = 5; // 蒙版分辨率：每公里 5 像素

function hash2(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 田块纸面（每公里 10 像素，显示时放大）。 */
export function renderPaper(b: WorldBounds): HTMLCanvasElement {
  const S = 10, CELL = 1.4; // 田块约 1.4 km 见方，接近当年集体农庄的大田
  const W = Math.round((b.x1 - b.x0) * S), H = Math.round((b.y1 - b.y0) * S);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const site = (cx: number, cy: number): [number, number] => [(cx + 0.15 + hash2(cx, cy, 1) * 0.7) * CELL, (cy + 0.15 + hash2(cx, cy, 2) * 0.7) * CELL];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const kx = x / S, ky = y / S;
      const cx = Math.floor(kx / CELL), cy = Math.floor(ky / CELL);
      let best = 1e9, second = 1e9, bx = 0, by = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const [sx, sy] = site(cx + i, cy + j);
        const dd = (sx - kx) ** 2 + (sy - ky) ** 2;
        if (dd < best) { second = best; best = dd; bx = cx + i; by = cy + j; } else if (dd < second) second = dd;
      }
      const tone = PALETTE.fields[Math.floor(hash2(bx, by, 3) * PALETTE.fields.length)]!;
      // 田埂：很淡的浅色细线，只在放大后隐约可见
      const e = Math.sqrt(second) - Math.sqrt(best);
      const w = e < 0.06 ? 0.55 * (1 - e / 0.06) : 0;
      const n = fbm(kx * 0.12, ky * 0.12, 11) * 8 + (valueNoise(x * 0.8, y * 0.8, 5) - 0.5) * 3;
      const f = PALETTE.fieldEdge;
      const c = [tone[0] + (f[0] - tone[0]) * w, tone[1] + (f[1] - tone[1]) * w, tone[2] + (f[2] - tone[2]) * w];
      const i = (y * W + x) * 4;
      d[i] = c[0]! + n; d[i + 1] = c[1]! + n; d[i + 2] = c[2]! + n * 0.8; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

interface Mask { m: Float32Array; lw: number; lh: number }

function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    const a = pass === 0 ? src : out;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / win;
        acc += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / win;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
      }
    }
  }
  return out;
}

function makeMask(map: GameMap, b: WorldBounds, terrains: Terrain[], shape: 'hex' | 'disc', size: number, blurKm: number): Mask | null {
  const ids = [...map.hexes].filter(([, r]) => terrains.includes(r.terrain)).map(([id]) => parseHexId(id));
  if (ids.length === 0) return null;
  const lw = Math.ceil((b.x1 - b.x0) * LOW) + 2, lh = Math.ceil((b.y1 - b.y0) * LOW) + 2;
  const c = document.createElement('canvas');
  c.width = lw; c.height = lh;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  const R = radiusOf(map.grid);
  for (const h of ids) {
    const ctr = hexCenter(map.grid, h);
    ctx.beginPath();
    if (shape === 'hex') {
      for (const p of hexCorners(map.grid, h)) {
        ctx.lineTo((ctr.x + (p.x - ctr.x) * size - b.x0) * LOW, (ctr.y + (p.y - ctr.y) * size - b.y0) * LOW);
      }
    } else {
      ctx.arc((ctr.x - b.x0) * LOW, (ctr.y - b.y0) * LOW, R * size * LOW, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  const px = ctx.getImageData(0, 0, lw, lh).data;
  const m = new Float32Array(lw * lh);
  for (let i = 0; i < m.length; i++) m[i] = px[i * 4]! / 255;
  return { m: blur(m, lw, lh, Math.round(blurKm * LOW)), lw, lh };
}

/** 在世界坐标（公里，相对 bounds 左上角）处采样蒙版。 */
function at(mk: Mask, kx: number, ky: number): number {
  const x = kx * LOW, y = ky * LOW;
  const { m, lw, lh } = mk;
  const xi = Math.max(0, Math.min(lw - 2, Math.floor(x))), yi = Math.max(0, Math.min(lh - 2, Math.floor(y)));
  const xf = Math.min(1, Math.max(0, x - xi)), yf = Math.min(1, Math.max(0, y - yi));
  const i = yi * lw + xi;
  return (m[i]! * (1 - xf) + m[i + 1]! * xf) * (1 - yf) + (m[i + lw]! * (1 - xf) + m[i + lw + 1]! * xf) * yf;
}

interface Area { terrains: Terrain[]; shape: 'hex' | 'disc'; size: number; blurKm: number; noise: number; fill: RGB; edge: RGB; hatch?: RGB }

const AREAS: Area[] = [
  { terrains: ['marsh'], shape: 'hex', size: 1.0, blurKm: 0.5, noise: 0.2, fill: PALETTE.marsh as RGB, edge: PALETTE.marshHatch as RGB, hatch: PALETTE.marshHatch as RGB },
  { terrains: ['water'], shape: 'hex', size: 1.0, blurKm: 0.4, noise: 0.12, fill: PALETTE.water as RGB, edge: PALETTE.waterEdge as RGB },
  { terrains: ['city'], shape: 'hex', size: 0.95, blurKm: 0.3, noise: 0.1, fill: PALETTE.settlement as RGB, edge: PALETTE.settlementEdge as RGB },
  { terrains: ['town'], shape: 'disc', size: 0.6, blurKm: 0.35, noise: 0.14, fill: PALETTE.settlement as RGB, edge: PALETTE.settlement as RGB },
];

const rgb = (c: RGB, k = 0): string => `rgb(${c[0] + k},${c[1] + k},${c[2] + k})`;

/** 地形要素画布（透明背景；世界坐标 bounds，单位公里）。 */
export function renderTerrain(map: GameMap, b: WorldBounds): HTMLCanvasElement {
  const W = Math.round((b.x1 - b.x0) * PX_PER_KM), H = Math.round((b.y1 - b.y0) * PX_PER_KM);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. 面状要素：逐像素
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (const a of AREAS) {
    const mk = makeMask(map, b, a.terrains, a.shape, a.size, a.blurKm);
    if (!mk) continue;
    const cov = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const kx = x / PX_PER_KM, ky = y / PX_PER_KM;
        const v = at(mk, kx, ky);
        if (v < 0.15) continue;
        if (v + fbm(kx * 0.7, ky * 0.7, 23) * a.noise * 2 > 0.5) cov[y * W + x] = 1;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!cov[k]) continue;
        const edge = !cov[k - 1] || !cov[k + 1] || !cov[k - W] || !cov[k + W];
        let c = edge ? a.edge : a.fill;
        if (!edge && a.hatch && y % 6 === 0 && valueNoise(x * 0.08, y, 7) > 0.4) c = a.hatch;
        const i = k * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const K = PX_PER_KM;

  // 2. 居民点：沿一两条街道排开的小房子（俄罗斯村庄多沿路、沿河谷呈长条形），房前有菜园
  const R = radiusOf(map.grid);
  for (const [id, rec] of map.hexes) {
    const kind = rec.terrain as 'village' | 'town' | 'city';
    const n = { village: 22, town: 44, city: 90 }[kind];
    if (!n) continue;
    const h = parseHexId(id);
    const c = hexCenter(map.grid, h);
    const len = R * { village: 0.85, town: 1.1, city: 1.5 }[kind];
    const ang = hash2(h.col, h.row, 9) * Math.PI;
    const streets = kind === 'village' ? (hash2(h.row, h.col, 10) > 0.55 ? 2 : 1) : 3;
    const toPx = (x: number, y: number): [number, number] => [(x - b.x0) * K, (y - b.y0) * K];
    for (let s2 = 0; s2 < streets; s2++) {
      const a2 = ang + s2 * (Math.PI / 2.4);
      const ux = Math.cos(a2), uy = Math.sin(a2);
      const L = len * (s2 === 0 ? 1 : 0.6);
      // 街道
      ctx.strokeStyle = 'rgba(120,110,95,0.55)';
      ctx.lineWidth = 0.05 * K;
      ctx.beginPath();
      ctx.moveTo(...toPx(c.x - ux * L / 2, c.y - uy * L / 2));
      ctx.lineTo(...toPx(c.x + ux * L / 2, c.y + uy * L / 2));
      ctx.stroke();
      const m = Math.round((n / streets) * (s2 === 0 ? 1.2 : 0.8));
      for (let i = 0; i < m; i++) {
        const t = (i / m - 0.5) * L + (hash2(i, h.col * 3 + s2, 4) - 0.5) * 0.12;
        const side = hash2(i, h.row + s2, 5) > 0.5 ? 1 : -1;
        const off = side * (0.11 + hash2(i, h.col + s2, 6) * 0.05);
        const x = c.x + ux * t - uy * off, y = c.y + uy * t + ux * off;
        ctx.save();
        ctx.translate(...toPx(x, y));
        ctx.rotate(a2);
        // 菜园（屋后的浅绿条）
        ctx.fillStyle = 'rgba(150,165,110,0.35)';
        ctx.fillRect(-0.05 * K, side * 0.04 * K, 0.1 * K, side * 0.13 * K);
        ctx.fillStyle = PALETTE.house;
        ctx.fillRect(-0.045 * K, -0.035 * K, 0.09 * K, 0.07 * K);
        ctx.restore();
      }
    }
  }

  // 3. 林地：一簇簇树冠
  const woods = makeMask(map, b, ['woods'], 'hex', 1.0, 1.0);
  if (woods) {
    const STEP = 0.3;
    const crowns: { x: number; y: number; r: number; tone: number }[] = [];
    for (let gy = 0; gy < (b.y1 - b.y0) / STEP; gy++) {
      for (let gx = 0; gx < (b.x1 - b.x0) / STEP; gx++) {
        const x = (gx + 0.5 + (hash2(gx, gy, 11) - 0.5) * 0.8) * STEP;
        const y = (gy + 0.5 + (hash2(gx, gy, 12) - 0.5) * 0.8) * STEP;
        if (at(woods, x, y) + fbm(x * 0.7, y * 0.7, 23) * 0.4 < 0.5) continue;
        crowns.push({ x, y, r: 0.17 + hash2(gx, gy, 13) * 0.08, tone: hash2(gx, gy, 14) });
      }
    }
    crowns.sort((p, q) => p.y - q.y);
    // 先画一圈深色外缘，再画树冠和高光，边缘自然呈"花边"状
    ctx.fillStyle = rgb(PALETTE.woodsDark as RGB);
    for (const c of crowns) { ctx.beginPath(); ctx.arc(c.x * K, c.y * K, (c.r + 0.045) * K, 0, Math.PI * 2); ctx.fill(); }
    for (const c of crowns) {
      ctx.fillStyle = rgb(PALETTE.woods as RGB, Math.round((c.tone - 0.5) * 16));
      ctx.beginPath(); ctx.arc(c.x * K, c.y * K, c.r * K, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(PALETTE.woodsLight as RGB, Math.round((c.tone - 0.5) * 10));
      ctx.beginPath(); ctx.arc((c.x - c.r * 0.3) * K, (c.y - c.r * 0.3) * K, c.r * 0.45 * K, 0, Math.PI * 2); ctx.fill();
    }
  }
  return canvas;
}
