// 程序化贴图：全部在浏览器里按种子生成，可无缝平铺，附带法线与粗糙度/金属度贴图
import * as THREE from 'three';
import { mulberry, clamp, smoothstep, frame } from './util.js';

class Noise {
  constructor(seed) {
    const r = mulberry(seed);
    this.p = new Float32Array(512 * 512);
    for (let i = 0; i < this.p.length; i++) this.p[i] = r();
  }
  v(x, y, px, py) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const p = this.p;
    const a = p[y0 * 512 + x0], b = p[y0 * 512 + x1], c = p[y1 * 512 + x0], d = p[y1 * 512 + x1];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // u,v ∈ [0,1)，在贴图空间里无缝
  fbm(u, v, base, oct, gain = 0.5, bx = base) {
    let s = 0, amp = 1, norm = 0, px = bx, py = base;
    for (let o = 0; o < oct; o++) {
      s += amp * this.v(u * px, v * py, px, py);
      norm += amp; amp *= gain; px *= 2; py *= 2;
    }
    return s / norm;
  }
}

// 可平铺的 Worley 细胞噪声，结果写进 W.f1 / W.f2 / W.id
const W = { f1: 0, f2: 0, id: 0 };
function worley(seed, n) {
  const r = mulberry(seed);
  const pts = new Float32Array(n * n * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  return (u, v) => {
    const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n, k = wy * n + wx;
      const ddx = cx + pts[k * 2] - x, ddy = cy + pts[k * 2 + 1] - y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    W.f1 = f1 / 1; W.f2 = f2; W.id = id;
    return f1;
  };
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mix = (a, b, t) => a + (b - a) * t;

function gen(size, fn) {
  const col = new Uint8Array(size * size * 4), h = new Float32Array(size * size), orm = new Uint8Array(size * size * 4);
  const o = { r: 0, g: 0, b: 0, h: 0, ro: 0.85, me: 0 };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    o.ro = 0.85; o.me = 0;
    fn(x / size, y / size, o, x, y);
    const i = y * size + x;
    col[i * 4] = clamp(o.r, 0, 255); col[i * 4 + 1] = clamp(o.g, 0, 255); col[i * 4 + 2] = clamp(o.b, 0, 255); col[i * 4 + 3] = 255;
    h[i] = o.h;
    orm[i * 4] = 255; orm[i * 4 + 1] = clamp(o.ro * 255, 0, 255); orm[i * 4 + 2] = clamp(o.me * 255, 0, 255); orm[i * 4 + 3] = 255;
  }
  return { col, h, orm, size };
}

function normalFrom(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

function dataTex(arr, size, srgb) {
  const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function pack(res, nStrength) {
  return {
    map: dataTex(res.col, res.size, true),
    normalMap: dataTex(normalFrom(res.h, res.size, nStrength), res.size, false),
    ormMap: dataTex(res.orm, res.size, false)
  };
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasHeight(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const h = new Float32Array(c.width * c.height);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}

// ---------------- 各种材质 ----------------
const S = 512;

function earth() {
  const n = new Noise(11), peb = worley(12, 40), cr = worley(13, 7);
  return pack(gen(S, (u, v, o) => {
    const a = n.fbm(u, v, 4, 6), b = n.fbm(u + 0.31, v + 0.7, 16, 4), fine = n.fbm(u, v, 64, 2);
    const warp = (n.fbm(u, v, 3, 3) - 0.5) * 0.25;
    const band = n.fbm(0.5, v + warp, 1, 4, 0.5, 6);
    // 镐头留下的斜向凿痕
    const pk = Math.sin((u + v * 2) * Math.PI * 2 * 9 + n.fbm(u, v, 8, 2) * 5);
    const pick = smoothstep(0.82, 1, pk) * smoothstep(0.5, 0.68, n.fbm(u + 0.2, v, 3, 3));
    const f1 = peb(u, v);
    const pebble = (f1 < 0.11 ? smoothstep(0.11, 0.04, f1) : 0) * smoothstep(0.52, 0.62, b);
    cr(u, v); const crack = smoothstep(0.012, 0, W.f2 - W.f1) * smoothstep(0.55, 0.7, a);
    o.h = a * 0.55 + b * 0.3 + fine * 0.12 + pebble * 0.3 - crack * 0.4 - pick * 0.22;
    const t = clamp(a * 0.75 + b * 0.35 + (band - 0.5) * 0.5 - 0.05, 0, 1);
    o.r = mix(62, 140, t); o.g = mix(46, 106, t); o.b = mix(32, 72, t);
    if (pick > 0) { o.r = mix(o.r, 150, pick * 0.3); o.g = mix(o.g, 118, pick * 0.3); o.b = mix(o.b, 84, pick * 0.3); }
    if (pebble > 0) { const g = 0.7 + 0.3 * fine; o.r = mix(o.r, 112 * g, pebble); o.g = mix(o.g, 106 * g, pebble); o.b = mix(o.b, 98 * g, pebble); }
    const dk = 1 - crack * 0.55; o.r *= dk; o.g *= dk; o.b *= dk;
    o.ro = 0.96;
  }), 3.2);
}

// 夯土：一层层夯筑的黄土，带夯窝与干裂
function rammed() {
  const n = new Noise(21), pits = worley(22, 26), cr = worley(23, 5);
  return pack(gen(S, (u, v, o) => {
    const warp = (n.fbm(u, v, 4, 3) - 0.5) * 0.35;
    const L = v * 12 + warp, li = Math.floor(L), lf = L - li;
    const lr = hash(((li % 12) + 12) % 12);
    const g = n.fbm(u, v, 32, 3), big = n.fbm(u, v, 3, 4), mid = n.fbm(u, v, 12, 3);
    const groove = smoothstep(0.1, 0.0, lf);
    const f1 = pits(u, v);
    const pit = (f1 < 0.12 ? (0.12 - f1) / 0.12 : 0) * smoothstep(0.5, 0.6, mid);
    cr(u, v); const crack = smoothstep(0.01, 0.0, W.f2 - W.f1) * smoothstep(0.55, 0.7, big);
    o.h = 0.5 + g * 0.2 + mid * 0.2 + big * 0.15 - groove * 0.28 + lf * 0.06 - pit * 0.25 - crack * 0.4;
    const tone = 0.74 + lr * 0.32 + (big - 0.5) * 0.35 + (mid - 0.5) * 0.15;
    o.r = 148 * tone; o.g = 116 * tone; o.b = 80 * tone;
    const dk = 1 - groove * 0.3 - crack * 0.5 - pit * 0.12;
    o.r *= dk; o.g *= dk; o.b *= dk;
    o.ro = 0.95;
  }), 3.5);
}
// 秦代青砖铺地，错缝
function brick() {
  const n = new Noise(31), chip = worley(32, 20);
  return pack(gen(S, (u, v, o) => {
    const by = v * 8, row = Math.floor(by);
    const bx = u * 4 + (row % 2) * 0.5, col = Math.floor(bx);
    const fx = bx - col, fy = by - row;
    const dx = Math.min(fx, 1 - fx) * 0.25, dy = Math.min(fy, 1 - fy) * 0.125, d = Math.min(dx, dy);
    const id = (((col % 4) + 4) % 4) + row * 4;
    const r = hash(id + 3);
    const g = n.fbm(u, v, 16, 4), dirt = n.fbm(u, v, 4, 4);
    const bevel = smoothstep(0.002, 0.012, d);
    const f1 = chip(u, v);
    const ch = f1 < 0.12 && d < 0.02 ? 1 : 0;
    o.h = bevel * (0.7 + g * 0.3) - ch * 0.3;
    const tone = 0.7 + r * 0.35;
    o.r = 74 * tone; o.g = 78 * tone; o.b = 82 * tone;
    const dm = smoothstep(0.4, 0.75, dirt) * 0.6 + (1 - bevel) * 0.6;
    o.r = mix(o.r, 70, dm); o.g = mix(o.g, 58, dm); o.b = mix(o.b, 44, dm);
    o.r *= 0.85 + g * 0.3; o.g *= 0.85 + g * 0.3; o.b *= 0.85 + g * 0.3;
    o.ro = 0.88 - bevel * 0.1;
  }), 7);
}

// 墓道条石
function stone() {
  const n = new Noise(41), w = worley(42, 8);
  return pack(gen(S, (u, v, o) => {
    const by = v * 3, row = Math.floor(by);
    const bx = u * 2 + (row % 2) * 0.5 + hash(row) * 0.0, col = Math.floor(bx);
    const fx = bx - col, fy = by - row;
    const d = Math.min(Math.min(fx, 1 - fx) * 0.5, Math.min(fy, 1 - fy) * 0.333);
    const id = (((col % 2) + 2) % 2) + row * 2;
    const g = n.fbm(u, v, 8, 5), fine = n.fbm(u, v, 64, 2);
    const chisel = Math.sin((u * 2 + v * 3) * 240 + hash(id) * 6) * 0.5 + 0.5;
    w(u, v); const crack = smoothstep(0.02, 0.0, W.f2 - W.f1) * smoothstep(0.55, 0.7, g);
    const bevel = smoothstep(0.0, 0.02, d);
    o.h = bevel * (0.6 + g * 0.3 + chisel * 0.05 + fine * 0.05) - crack * 0.4;
    const tone = 0.75 + hash(id + 9) * 0.3 + (g - 0.5) * 0.4;
    o.r = 112 * tone; o.g = 107 * tone; o.b = 98 * tone;
    const dm = (1 - bevel) * 0.7 + crack * 0.6;
    o.r *= 1 - dm * 0.6; o.g *= 1 - dm * 0.6; o.b *= 1 - dm * 0.6;
    o.ro = 0.8;
  }), 6);
}

// 回纹单元
function meander(ctx, x, y, s) {
  const P = [[0, 1], [1, 1], [1, 0], [0.2, 0], [0.2, 0.8], [0.8, 0.8], [0.8, 0.2], [0.4, 0.2], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4]];
  ctx.beginPath();
  P.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * s, y + py * s));
  ctx.stroke();
}

// 地宫铺地石：回纹边框 + 菱形纹
function palace() {
  const c = canvas(S), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#000'; x.lineCap = 'square';
  const T = S / 2;
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const ox = tx * T, oy = ty * T;
    x.lineWidth = 4; x.strokeRect(ox + 2, oy + 2, T - 4, T - 4);
    x.lineWidth = 2.5;
    const s = 18, m = 12;
    for (let i = 0; i < 12; i++) {
      meander(x, ox + m + i * s + 2, oy + m, s - 6);
      meander(x, ox + m + i * s + 2, oy + T - m - s + 6, s - 6);
      meander(x, ox + m, oy + m + i * s + 2, s - 6);
      meander(x, ox + T - m - s + 6, oy + m + i * s + 2, s - 6);
    }
    x.lineWidth = 2;
    x.save(); x.beginPath(); x.rect(ox + 40, oy + 40, T - 80, T - 80); x.clip();
    for (let k = -T; k < T * 2; k += 26) {
      x.beginPath(); x.moveTo(ox + k, oy); x.lineTo(ox + k + T, oy + T); x.stroke();
      x.beginPath(); x.moveTo(ox + k + T, oy); x.lineTo(ox + k, oy + T); x.stroke();
    }
    x.restore();
    x.lineWidth = 3; x.beginPath(); x.arc(ox + T / 2, oy + T / 2, 34, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(ox + T / 2, oy + T / 2, 22, 0, Math.PI * 2); x.stroke();
  }
  // 模糊一点，让刻线有斜面
  const c2 = canvas(S), x2 = c2.getContext('2d'); x2.filter = 'blur(1.2px)'; x2.drawImage(c, 0, 0);
  const pat = canvasHeight(c2);
  const n = new Noise(51), w = worley(52, 10);
  return pack(gen(S, (u, v, o, px, py) => {
    const p = pat[py * S + px];
    const g = n.fbm(u, v, 8, 5), dust = n.fbm(u, v, 3, 4);
    w(u, v); const crack = smoothstep(0.015, 0.0, W.f2 - W.f1) * smoothstep(0.6, 0.72, g);
    o.h = p * 0.8 + g * 0.2 - crack * 0.3;
    const tone = 0.8 + (g - 0.5) * 0.5;
    o.r = 46 * tone; o.g = 44 * tone; o.b = 42 * tone;
    const filled = (1 - p) * 0.9;
    o.r = mix(o.r, 104, filled); o.g = mix(o.g, 92, filled); o.b = mix(o.b, 72, filled);
    const dm = smoothstep(0.45, 0.8, dust) * 0.5;
    o.r = mix(o.r, 92, dm); o.g = mix(o.g, 82, dm); o.b = mix(o.b, 66, dm);
    o.ro = 0.35 + dm * 0.5 + filled * 0.4;
  }), 5);
}

function wood() {
  const n = new Noise(61), w = worley(62, 6);
  return pack(gen(S, (u, v, o) => {
    const grain = n.fbm(u, v, 24, 4, 0.55, 2);
    const ring = Math.sin(grain * 40) * 0.5 + 0.5;
    const big = n.fbm(u, v, 4, 4);
    const crack = smoothstep(0.03, 0.0, Math.abs(n.fbm(u, v, 48, 2, 0.5, 1) - 0.5)) * smoothstep(0.5, 0.7, big);
    const rot = smoothstep(0.55, 0.75, n.fbm(u + 0.5, v, 4, 5));
    const knot = w(u, v) < 0.08 ? 1 : 0;
    o.h = 0.5 + ring * 0.2 + grain * 0.2 - crack * 0.6 - rot * 0.2 - knot * 0.2;
    const t = 0.5 + ring * 0.25 + (big - 0.5) * 0.6;
    o.r = mix(48, 112, t); o.g = mix(32, 80, t); o.b = mix(20, 50, t);
    const dk = 1 - crack * 0.7 - rot * 0.55 - knot * 0.4;
    o.r *= dk; o.g *= dk; o.b *= dk;
    o.ro = 0.9;
  }), 6);
}

function cloudThunder() {
  // 云雷纹：成行的方形回旋纹，用于青铜器浮雕
  const c = canvas(S), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineCap = 'square';
  const s = 64;
  for (let gy = 0; gy < S / s; gy++) for (let gx = 0; gx < S / s; gx++) {
    const ox = gx * s, oy = gy * s, flip = (gx + gy) % 2;
    x.save(); x.translate(ox + s / 2, oy + s / 2); if (flip) x.rotate(Math.PI / 2); x.translate(-s / 2, -s / 2);
    x.beginPath();
    let px = 6, py = 6, len = s - 12, dir = 0;
    x.moveTo(px, py);
    for (let k = 0; k < 7 && len > 6; k++) {
      const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
      px += dx * len; py += dy * len; x.lineTo(px, py);
      if (k % 2 === 1) len -= 10; dir = (dir + 1) % 4;
    }
    x.stroke(); x.restore();
  }
  x.lineWidth = 8; x.strokeRect(0, 0, S, S);
  const c2 = canvas(S), x2 = c2.getContext('2d'); x2.filter = 'blur(1.5px)'; x2.drawImage(c, 0, 0);
  return canvasHeight(c2);
}

function bronze(ornate) {
  const n = new Noise(ornate ? 71 : 72), pits = worley(73, 30);
  const relief = ornate ? cloudThunder() : null;
  return pack(gen(S, (u, v, o, px, py) => {
    const rel = relief ? relief[py * S + px] : 0.5;
    const g = n.fbm(u, v, 4, 5), f = n.fbm(u, v, 32, 2);
    let pm = smoothstep(0.42, 0.58, g + 0.15 * f + (ornate ? (0.5 - rel) * 0.5 : 0));
    const p = pits(u, v); const pit = p < 0.1 ? 1 - p / 0.1 : 0;
    o.h = rel * (ornate ? 0.8 : 0) + pm * 0.25 + f * 0.1 - pit * 0.15;
    const mt = 0.75 + (f - 0.5) * 0.5;
    const mr = 128 * mt, mg = 92 * mt, mb = 52 * mt;
    const pt = 0.8 + (n.fbm(u, v, 16, 3) - 0.5) * 0.6;
    const pr = 62 * pt, pg = 132 * pt, pb = 108 * pt;
    o.r = mix(mr, pr, pm); o.g = mix(mg, pg, pm); o.b = mix(mb, pb, pm);
    if (ornate) { const hl = smoothstep(0.6, 1, rel) * (1 - pm) * 0.4; o.r += hl * 60; o.g += hl * 44; o.b += hl * 20; }
    o.r *= 1 - pit * 0.5; o.g *= 1 - pit * 0.5; o.b *= 1 - pit * 0.5;
    o.ro = mix(0.32, 0.85, pm); o.me = mix(0.9, 0.15, pm);
  }), ornate ? 8 : 4);
}

// 陶俑：灰陶底，残存的彩绘（朱红、石绿、汉紫、粉白）
function terracotta() {
  const n = new Noise(81), cr = worley(82, 9);
  return pack(gen(S, (u, v, o) => {
    const g = n.fbm(u, v, 32, 3), big = n.fbm(u, v, 4, 4);
    cr(u, v); const crack = smoothstep(0.022, 0.0, W.f2 - W.f1) * smoothstep(0.4, 0.6, big);
    o.h = 0.5 + g * 0.3 + big * 0.2 - crack * 0.6;
    const tone = 0.8 + (big - 0.5) * 0.5 + (g - 0.5) * 0.2;
    o.r = 132 * tone; o.g = 120 * tone; o.b = 108 * tone;
    const p1 = smoothstep(0.7, 0.73, n.fbm(u + 0.13, v, 12, 4)), p2 = smoothstep(0.72, 0.75, n.fbm(u, v + 0.37, 12, 4));
    const p3 = smoothstep(0.74, 0.77, n.fbm(u + 0.71, v + 0.2, 12, 4)), p4 = smoothstep(0.7, 0.73, n.fbm(u + 0.4, v + 0.9, 10, 4));
    const paint = (r, gg, b, t) => { o.r = mix(o.r, r, t); o.g = mix(o.g, gg, t); o.b = mix(o.b, b, t); };
    paint(138, 62, 48, p1 * 0.6); paint(84, 104, 86, p2 * 0.5); paint(98, 80, 112, p3 * 0.5); paint(186, 178, 162, p4 * 0.45);
    o.h += (p1 + p2 + p3 + p4) * 0.05;
    o.r *= 1 - crack * 0.6; o.g *= 1 - crack * 0.6; o.b *= 1 - crack * 0.6;
    o.ro = 0.9;
  }), 5);
}

// 石铠甲：青石甲片以铜丝编缀
function stoneArmor() {
  const c = canvas(256), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  const rows = 8, cols = 8, w = 256 / cols, h = 256 / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols + 1; k++) {
    const ox = k * w - (r % 2) * w / 2, oy = r * h;
    const g = x.createLinearGradient(0, oy, 0, oy + h);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#999');
    x.fillStyle = g; x.beginPath(); x.roundRect(ox + 2, oy + 2, w - 4, h - 3, 4); x.fill();
    x.fillStyle = '#222';
    for (const [hx, hy] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) { x.beginPath(); x.arc(ox + hx * w, oy + hy * h, 1.8, 0, 7); x.fill(); }
  }
  const hgt = canvasHeight(c);
  const n = new Noise(91);
  return pack(gen(256, (u, v, o, px, py) => {
    const p = hgt[py * 256 + px], g = n.fbm(u, v, 16, 3);
    o.h = p * 0.85 + g * 0.15;
    const t = 0.75 + g * 0.4;
    o.r = (p > 0.15 ? 150 : 50) * t; o.g = (p > 0.15 ? 148 : 46) * t; o.b = (p > 0.15 ? 140 : 40) * t;
    o.ro = 0.7;
  }), 6);
}

function plain(r, g, b, seed, rough, nstr = 3) {
  const n = new Noise(seed);
  return pack(gen(128, (u, v, o) => {
    const f = n.fbm(u, v, 8, 4);
    o.h = f; const t = 0.8 + f * 0.4;
    o.r = r * t; o.g = g * t; o.b = b * t; o.ro = rough;
  }), nstr);
}

function mercuryNormal() {
  const n = new Noise(101);
  const res = gen(256, (u, v, o) => { o.h = n.fbm(u, v, 4, 5, 0.55); o.r = o.g = o.b = 200; });
  return dataTex(normalFrom(res.h, 256, 10), 256, false);
}

// 穹顶星图：二十八宿、日月、银河
function starDome() {
  const Wd = 2048, Hd = 1024;
  const c = canvas(Wd, Hd), x = c.getContext('2d');
  const r = mulberry(2026);
  const g = x.createLinearGradient(0, 0, 0, Hd);
  g.addColorStop(0, '#05060c'); g.addColorStop(0.6, '#0a0d1a'); g.addColorStop(1, '#141018');
  x.fillStyle = g; x.fillRect(0, 0, Wd, Hd);
  // 银河
  for (let i = 0; i < 14000; i++) {
    const t = r() * Wd, off = Math.sin(t / Wd * Math.PI * 2) * 160 + 420;
    const y = off + (r() + r() + r() - 1.5) * 120;
    x.fillStyle = `rgba(170,180,220,${r() * 0.12})`;
    x.fillRect(t, y, 1.5, 1.5);
  }
  for (let i = 0; i < 2600; i++) {
    const s = r() < 0.92 ? r() * 1.4 + 0.4 : r() * 2.5 + 1.5;
    x.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 40},${180 + r() * 60},${0.4 + r() * 0.6})`;
    x.beginPath(); x.arc(r() * Wd, r() * Hd * 0.92, s, 0, 7); x.fill();
  }
  // 二十八宿：金色连线
  for (let k = 0; k < 28; k++) {
    const cx = (k + 0.5) / 28 * Wd, cy = 260 + Math.sin(k * 1.7) * 140 + r() * 120;
    const pts = []; const m = 3 + ((r() * 4) | 0);
    for (let i = 0; i < m; i++) pts.push([cx + (r() - 0.5) * 120, cy + (r() - 0.5) * 120]);
    x.strokeStyle = 'rgba(214,170,90,0.75)'; x.lineWidth = 2.2;
    x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
    for (const [a, b] of pts) {
      const rg = x.createRadialGradient(a, b, 0, a, b, 12);
      rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.3, 'rgba(255,214,140,0.8)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = rg; x.beginPath(); x.arc(a, b, 12, 0, 7); x.fill();
    }
  }
  // 日（金乌）与月（银盘）
  const sun = x.createRadialGradient(520, 640, 0, 520, 640, 90);
  sun.addColorStop(0, 'rgba(255,200,110,1)'); sun.addColorStop(0.6, 'rgba(200,90,40,0.9)'); sun.addColorStop(1, 'rgba(150,40,20,0)');
  x.fillStyle = sun; x.beginPath(); x.arc(520, 640, 90, 0, 7); x.fill();
  const moon = x.createRadialGradient(1540, 620, 0, 1540, 620, 80);
  moon.addColorStop(0, 'rgba(235,240,255,1)'); moon.addColorStop(0.7, 'rgba(170,180,210,0.8)'); moon.addColorStop(1, 'rgba(120,130,170,0)');
  x.fillStyle = moon; x.beginPath(); x.arc(1540, 620, 80, 0, 7); x.fill();
  x.fillStyle = 'rgba(40,40,60,0.35)'; x.beginPath(); x.arc(1560, 610, 22, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function spriteTex(draw, size = 128) {
  const c = canvas(size), x = c.getContext('2d'); draw(x, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const radial = (stops) => (x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; x.fillRect(0, 0, s, s);
};

// 墙上的抓痕与刻字
export function scratchTexture(lines, seed = 7) {
  const c = canvas(512, 256), x = c.getContext('2d');
  const r = mulberry(seed);
  x.clearRect(0, 0, 512, 256);
  x.font = '64px "Ma Shan Zheng","STKaiti","KaiTi",serif';
  x.textBaseline = 'top';
  lines.forEach((ln, i) => {
    for (let k = 0; k < 3; k++) {
      x.strokeStyle = `rgba(${200 + r() * 40},${180 + r() * 30},${150},${0.35 + r() * 0.3})`;
      x.lineWidth = 1 + r() * 1.5;
      x.save(); x.translate(20 + (r() - 0.5) * 3, 20 + i * 80 + (r() - 0.5) * 3); x.rotate((r() - 0.5) * 0.06);
      x.strokeText(ln, 0, 0); x.restore();
    }
  });
  for (let i = 0; i < 26; i++) {
    const sx = r() * 512, sy = r() * 256, len = 40 + r() * 90, a = Math.PI / 2 + (r() - 0.5) * 0.5;
    x.strokeStyle = `rgba(220,200,170,${0.15 + r() * 0.25})`; x.lineWidth = 1 + r() * 2;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function bloodTexture(seed = 3) {
  return spriteTex((x, s) => {
    const r = mulberry(seed);
    for (let i = 0; i < 18; i++) {
      const cx = s / 2 + (r() - 0.5) * s * 0.5, cy = s / 2 + (r() - 0.5) * s * 0.5, rad = 8 + r() * 40;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(40,6,4,0.85)'); g.addColorStop(0.7, 'rgba(50,10,6,0.6)'); g.addColorStop(1, 'rgba(50,10,6,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
    }
  }, 256);
}

// 手电光斑（投射贴图）：中心热点、外圈与少许划痕
function cookie() {
  return spriteTex((x, s) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(0.2, '#f2eee4'); g.addColorStop(0.32, '#a6a39b');
    g.addColorStop(0.42, '#9e9a91'); g.addColorStop(0.52, '#55534e'); g.addColorStop(0.85, '#1c1b1a'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.globalCompositeOperation = 'multiply';
    const r = mulberry(5);
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = `rgba(0,0,0,${r() * 0.25})`; x.lineWidth = r() * 2;
      x.beginPath(); x.arc(s / 2, s / 2, r() * s / 2, r() * 7, r() * 7); x.stroke();
    }
  }, 256);
}

// 惊吓时一闪而过的陶俑脸
export function scareFace() {
  const c = canvas(512), x = c.getContext('2d');
  const r = mulberry(666);
  x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
  const fg = x.createRadialGradient(256, 230, 30, 256, 260, 260);
  fg.addColorStop(0, '#8d8173'); fg.addColorStop(0.6, '#4e463e'); fg.addColorStop(1, '#000');
  x.fillStyle = fg; x.beginPath(); x.ellipse(256, 270, 170, 225, 0, 0, 7); x.fill();
  // 裂纹
  x.strokeStyle = 'rgba(10,8,6,0.8)';
  for (let i = 0; i < 30; i++) {
    x.lineWidth = 1 + r() * 2; x.beginPath(); let px = 120 + r() * 270, py = 80 + r() * 380; x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 50; py += (r() - 0.3) * 40; x.lineTo(px, py); } x.stroke();
  }
  // 眼窝
  for (const ex of [185, 327]) {
    const eg = x.createRadialGradient(ex, 230, 2, ex, 230, 60);
    eg.addColorStop(0, '#000'); eg.addColorStop(0.7, '#000'); eg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = eg; x.beginPath(); x.ellipse(ex, 230, 62, 44, 0, 0, 7); x.fill();
    const pg = x.createRadialGradient(ex, 232, 0, ex, 232, 10);
    pg.addColorStop(0, '#ffe8c0'); pg.addColorStop(0.4, '#ff5a2a'); pg.addColorStop(1, 'rgba(255,40,0,0)');
    x.fillStyle = pg; x.beginPath(); x.arc(ex, 232, 10, 0, 7); x.fill();
  }
  // 张大的嘴
  const mg = x.createRadialGradient(256, 405, 5, 256, 405, 80);
  mg.addColorStop(0, '#000'); mg.addColorStop(0.8, '#0a0505'); mg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = mg; x.beginPath(); x.ellipse(256, 405, 58, 82, 0, 0, 7); x.fill();
  // 上翘的胡须
  x.strokeStyle = '#1a1512'; x.lineWidth = 9; x.lineCap = 'round';
  x.beginPath(); x.moveTo(250, 330); x.quadraticCurveTo(200, 340, 170, 300); x.stroke();
  x.beginPath(); x.moveTo(262, 330); x.quadraticCurveTo(312, 340, 342, 300); x.stroke();
  return c.toDataURL('image/jpeg', 0.85);
}

export async function buildTextures(progress) {
  const T = {};
  const jobs = [
    ['earth', earth], ['rammed', rammed], ['brick', brick], ['stone', stone], ['palace', palace],
    ['wood', wood], ['bronze', () => bronze(false)], ['bronzeOrnate', () => bronze(true)],
    ['terracotta', terracotta], ['stoneArmor', stoneArmor],
    ['bone', () => plain(196, 182, 150, 111, 0.8)], ['cloth', () => plain(70, 62, 54, 121, 1, 6)],
    ['lacquer', () => plain(70, 18, 14, 131, 0.45, 2)], ['jade', () => plain(120, 160, 120, 141, 0.25, 1)],
    ['mercury', mercuryNormal], ['stars', starDome], ['cookie', cookie],
    ['flame', () => spriteTex(radial([[0, 'rgba(255,250,220,1)'], [0.2, 'rgba(255,190,90,0.95)'], [0.5, 'rgba(230,90,20,0.45)'], [1, 'rgba(120,20,0,0)']]))],
    ['glow', () => spriteTex(radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]))],
    ['glint', () => spriteTex((x, s) => {
      radial([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,240,200,0.6)'], [0.4, 'rgba(255,220,160,0)']])(x, s);
      x.globalCompositeOperation = 'lighter';
      const g = x.createLinearGradient(0, s / 2, s, s / 2);
      g.addColorStop(0, 'rgba(255,230,180,0)'); g.addColorStop(0.5, 'rgba(255,240,210,0.9)'); g.addColorStop(1, 'rgba(255,230,180,0)');
      x.fillStyle = g; x.fillRect(0, s / 2 - 1.5, s, 3); x.fillRect(s / 2 - 1.5, 0, 3, s);
    })],
    ['shaft', () => spriteTex((x, s) => {
      const g = x.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      const v = x.createLinearGradient(0, 0, 0, s);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = v; x.fillRect(0, 0, s, s);
    })],
    ['blood', () => bloodTexture(3)]
  ];
  for (let i = 0; i < jobs.length; i++) {
    T[jobs[i][0]] = jobs[i][1]();
    progress?.((i + 1) / jobs.length, jobs[i][0]);
    await frame();
  }
  return T;
}
