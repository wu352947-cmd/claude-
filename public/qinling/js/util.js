import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];

export { mulberry } from './rng.js';

// 合并若干几何体（可带变换、顶点色与 UV 缩放），减少绘制调用
// parts: [{ geo, m?: Matrix4, color?: [r,g,b], uv?: number }]
export function mergeGeos(parts, withColor = true) {
  let vCount = 0, iCount = 0;
  const prepared = parts.map(p => {
    let g = p.geo.index ? p.geo : p.geo; // 内置几何体均带索引
    g = g.clone();
    if (p.m) g.applyMatrix4(p.m);
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
    return { g, color: p.color || [1, 1, 1], uv: p.uv || 1 };
  });
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const col = withColor ? new Float32Array(vCount * 3) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const { g, color, uv: us } of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) { const a = g.attributes.uv.array; for (let i = 0; i < n * 2; i++) uv[vo * 2 + i] = a[i] * us; }
    if (col) {
      const src = g.attributes.color?.array;
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) col[(vo + i) * 3 + k] = color[k] * (src ? src[i * 3 + k] : 1);
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// 组装变换矩阵的小工具
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export const wait = ms => new Promise(r => setTimeout(r, ms));
export const frame = () => new Promise(r => requestAnimationFrame(() => r()));
