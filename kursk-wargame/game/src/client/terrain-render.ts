/**
 * 把"每格一种地形"的数据画成自然形状（兵棋地图风格）：
 * 1. 低分辨率下把同类地形的格子涂成蒙版并模糊 → 相邻格自然连成一片
 * 2. 全分辨率下叠加噪声后取阈值 → 边缘起伏自然
 * 3. 上色、加纹理和描边
 * 规则只看格子数据；这里只是"画法"。
 */
import { type GameMap, type Terrain, hexCenter, hexCorners, parseHexId, radiusOf } from '../engine';
import { fbm, valueNoise } from './noise';
import { PALETTE, PX_PER_KM, type RGB } from './style';

export interface WorldBounds { x0: number; y0: number; x1: number; y1: number }

const LOW = 5; // 蒙版分辨率：每公里 5 像素

interface Layer {
  terrains: Terrain[];
  /** 'hex' = 整格六边形（放大系数）；'disc' = 格中心的圆（半径占外接圆半径的比例） */
  shape: 'hex' | 'disc';
  size: number;
  blurKm: number;
  noise: number;
  fill: RGB;
  edge: RGB;
  texture?: (x: number, y: number) => RGB | null;
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

function maskFor(map: GameMap, layer: Layer, b: WorldBounds, lw: number, lh: number): Float32Array | null {
  const ids = [...map.hexes].filter(([, r]) => layer.terrains.includes(r.terrain)).map(([id]) => parseHexId(id));
  if (ids.length === 0) return null;
  const c = document.createElement('canvas');
  c.width = lw; c.height = lh;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  const R = radiusOf(map.grid);
  for (const h of ids) {
    const ctr = hexCenter(map.grid, h);
    ctx.beginPath();
    if (layer.shape === 'hex') {
      for (const p of hexCorners(map.grid, h)) {
        ctx.lineTo((ctr.x + (p.x - ctr.x) * layer.size - b.x0) * LOW, (ctr.y + (p.y - ctr.y) * layer.size - b.y0) * LOW);
      }
    } else {
      ctx.arc((ctr.x - b.x0) * LOW, (ctr.y - b.y0) * LOW, R * layer.size * LOW, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  const px = ctx.getImageData(0, 0, lw, lh).data;
  const m = new Float32Array(lw * lh);
  for (let i = 0; i < m.length; i++) m[i] = px[i * 4]! / 255;
  return blur(m, lw, lh, Math.round(layer.blurKm * LOW));
}

function sample(m: Float32Array, lw: number, lh: number, x: number, y: number): number {
  const xi = Math.max(0, Math.min(lw - 2, Math.floor(x))), yi = Math.max(0, Math.min(lh - 2, Math.floor(y)));
  const xf = Math.min(1, Math.max(0, x - xi)), yf = Math.min(1, Math.max(0, y - yi));
  const i = yi * lw + xi;
  return (m[i]! * (1 - xf) + m[i + 1]! * xf) * (1 - yf) + (m[i + lw]! * (1 - xf) + m[i + lw + 1]! * xf) * yf;
}

const LAYERS: Layer[] = [
  {
    terrains: ['marsh'], shape: 'hex', size: 1.0, blurKm: 0.5, noise: 0.2,
    fill: PALETTE.marsh as RGB, edge: PALETTE.marshHatch as RGB,
    texture: (x, y) => (Math.floor(y * 1.6) % 3 === 0 && valueNoise(x * 0.25, Math.floor(y * 1.6), 7) > 0.45 ? (PALETTE.marshHatch as RGB) : null),
  },
  { terrains: ['water'], shape: 'hex', size: 1.0, blurKm: 0.4, noise: 0.12, fill: PALETTE.water as RGB, edge: PALETTE.waterEdge as RGB },
  {
    terrains: ['woods'], shape: 'hex', size: 1.0, blurKm: 1.1, noise: 0.2,
    fill: PALETTE.woods as RGB, edge: PALETTE.woodsEdge as RGB,
    texture: (x, y) => (valueNoise(x * 0.9, y * 0.9, 3) > 0.62 ? (PALETTE.woodsDark as RGB) : null),
  },
  { terrains: ['city'], shape: 'hex', size: 0.95, blurKm: 0.3, noise: 0.1, fill: PALETTE.village as RGB, edge: PALETTE.villageEdge as RGB },
  { terrains: ['town'], shape: 'disc', size: 0.62, blurKm: 0.3, noise: 0.12, fill: PALETTE.village as RGB, edge: PALETTE.villageEdge as RGB },
  { terrains: ['village'], shape: 'disc', size: 0.42, blurKm: 0.25, noise: 0.12, fill: PALETTE.village as RGB, edge: PALETTE.villageEdge as RGB },
];

/** 纸张底色 + 轻微纹理（铺在最底层，参考底图半透明地叠在它上面）。 */
export function renderPaper(b: WorldBounds): HTMLCanvasElement {
  const S = 4; // 纸纹分辨率：每公里 4 像素，显示时放大，足够柔和
  const W = Math.round((b.x1 - b.x0) * S), H = Math.round((b.y1 - b.y0) * S);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const [pr, pg, pb] = PALETTE.paper;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm((x / S) * 0.08, (y / S) * 0.08, 11) * 16 + (valueNoise(x * 0.9, y * 0.9, 5) - 0.5) * 5;
      const i = (y * W + x) * 4;
      d[i] = pr + n; d[i + 1] = pg + n; d[i + 2] = pb + n * 0.8; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 地形要素画布（透明背景；世界坐标 bounds，单位公里）。 */
export function renderTerrain(map: GameMap, b: WorldBounds): HTMLCanvasElement {
  const W = Math.round((b.x1 - b.x0) * PX_PER_KM), H = Math.round((b.y1 - b.y0) * PX_PER_KM);
  const lw = Math.ceil((b.x1 - b.x0) * LOW) + 2, lh = Math.ceil((b.y1 - b.y0) * LOW) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;

  for (const layer of LAYERS) {
    const m = maskFor(map, layer, b, lw, lh);
    if (!m) continue;
    const cov = new Uint8Array(W * H);
    const s = LOW / PX_PER_KM;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = sample(m, lw, lh, x * s, y * s);
        if (v < 0.15) continue;
        const kx = x / PX_PER_KM, ky = y / PX_PER_KM;
        if (v + fbm(kx * 0.55, ky * 0.55, 23) * layer.noise * 2 > 0.5) cov[y * W + x] = 1;
      }
    }
    const edgePx = 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!cov[k]) continue;
        let edge = false;
        for (let e = 1; e <= edgePx && !edge; e++) {
          if (!cov[k - e] || !cov[k + e] || !cov[k - e * W] || !cov[k + e * W]) edge = true;
        }
        const c = edge ? layer.edge : (layer.texture?.(x / PX_PER_KM * 8, y / PX_PER_KM * 8) ?? layer.fill);
        const i = k * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
