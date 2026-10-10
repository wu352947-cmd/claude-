/**
 * 位图层：纸面底色，以及沼泽、水面、城市这类面状地形（边缘柔和，位图足够）。
 * 林地、居民点、线状要素画成矢量（features.ts），任何缩放下都清晰。
 */
import { type GameMap, type Terrain, hexCenter, hexCorners, parseHexId, radiusOf } from '../engine';
import { fbm, valueNoise } from './noise';
import { PALETTE, PX_PER_KM, type RGB } from './style';

export interface WorldBounds { x0: number; y0: number; x1: number; y1: number }

const LOW = 5; // 蒙版分辨率：每公里 5 像素

/** 纸面：几乎纯色，带极轻微的纸纹（每公里 8 像素，显示时放大）。 */
export function renderPaper(b: WorldBounds): HTMLCanvasElement {
  const S = 8;
  const W = Math.round((b.x1 - b.x0) * S), H = Math.round((b.y1 - b.y0) * S);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const [pr, pg, pb] = PALETTE.paper;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm((x / S) * 0.1, (y / S) * 0.1, 11) * 7 + (valueNoise(x * 0.9, y * 0.9, 5) - 0.5) * 3;
      const i = (y * W + x) * 4;
      d[i] = pr + n; d[i + 1] = pg + n; d[i + 2] = pb + n * 0.8; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

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

interface Area { terrains: Terrain[]; shape: 'hex' | 'disc'; size: number; blurKm: number; noise: number; fill: RGB; edge: RGB; hatch?: RGB }

const AREAS: Area[] = [
  { terrains: ['marsh'], shape: 'hex', size: 1.0, blurKm: 0.5, noise: 0.2, fill: PALETTE.marsh, edge: PALETTE.marshHatch, hatch: PALETTE.marshHatch },
  { terrains: ['water'], shape: 'hex', size: 1.0, blurKm: 0.4, noise: 0.12, fill: PALETTE.water, edge: PALETTE.waterEdge },
  { terrains: ['city'], shape: 'hex', size: 0.95, blurKm: 0.3, noise: 0.1, fill: PALETTE.settlement, edge: PALETTE.settlementEdge },
  { terrains: ['town'], shape: 'disc', size: 0.6, blurKm: 0.35, noise: 0.14, fill: PALETTE.settlement, edge: PALETTE.settlement },
];

/** 面状地形位图（透明背景）；没有面状地形时返回 null。 */
export function renderAreas(map: GameMap, b: WorldBounds): HTMLCanvasElement | null {
  const W = Math.round((b.x1 - b.x0) * PX_PER_KM), H = Math.round((b.y1 - b.y0) * PX_PER_KM);
  const lw = Math.ceil((b.x1 - b.x0) * LOW) + 2, lh = Math.ceil((b.y1 - b.y0) * LOW) + 2;
  const R = radiusOf(map.grid);
  let canvas: HTMLCanvasElement | null = null;
  let img: ImageData | null = null;
  for (const a of AREAS) {
    const ids = [...map.hexes].filter(([, r]) => a.terrains.includes(r.terrain)).map(([id]) => parseHexId(id));
    if (ids.length === 0) continue;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      img = canvas.getContext('2d')!.createImageData(W, H);
    }
    const mc = document.createElement('canvas');
    mc.width = lw; mc.height = lh;
    const mctx = mc.getContext('2d')!;
    mctx.fillStyle = '#fff';
    for (const h of ids) {
      const ctr = hexCenter(map.grid, h);
      mctx.beginPath();
      if (a.shape === 'hex') {
        for (const p of hexCorners(map.grid, h)) mctx.lineTo((ctr.x + (p.x - ctr.x) * a.size - b.x0) * LOW, (ctr.y + (p.y - ctr.y) * a.size - b.y0) * LOW);
      } else {
        mctx.arc((ctr.x - b.x0) * LOW, (ctr.y - b.y0) * LOW, R * a.size * LOW, 0, Math.PI * 2);
      }
      mctx.fill();
    }
    const px = mctx.getImageData(0, 0, lw, lh).data;
    let m: Float32Array = new Float32Array(lw * lh);
    for (let i = 0; i < m.length; i++) m[i] = px[i * 4]! / 255;
    m = blur(m, lw, lh, Math.round(a.blurKm * LOW));
    const d = img!.data;
    const cov = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const kx = x / PX_PER_KM, ky = y / PX_PER_KM;
        const fx = Math.min(lw - 1, kx * LOW), fy = Math.min(lh - 1, ky * LOW);
        const v = m[Math.floor(fy) * lw + Math.floor(fx)]!;
        if (v + fbm(kx * 0.7, ky * 0.7, 23) * a.noise * 2 > 0.5) cov[y * W + x] = 1;
      }
    }
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
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
  if (canvas && img) canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas;
}
