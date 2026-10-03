// MUD — procedural world: path/canal network, ground mask canvas, houses,
// ziggurat heightfield (built / softened / dune states). Pure + deterministic.
import { rng, noise3, fbm3, clamp, smoothstep } from '../engine/util.js';

// ---------------------------------------------------------------- ziggurat
// Axes: +x east, +z north, +y up. Front (stairs) faces south (−z).
// batter widths (b·h) are whole metres so the hip lines run exactly along cell diagonals
export const TERRACE = { ax: 130, az: 105, b: 2 / 3, y0: 0, h: 3 };
export const TIERS = [
  { ax: 62, az: 45, b: 3 / 12, y0: 3, h: 12 },
  { ax: 50, az: 35, b: 2 / 9, y0: 15, h: 9 },
  { ax: 40, az: 27, b: 2 / 7, y0: 24, h: 7 },
  { ax: 31, az: 20, b: 2 / 6, y0: 31, h: 6 },
  { ax: 23, az: 14, b: 1 / 5, y0: 37, h: 5 },
];
export const TOP_Y = 42;
export const TEMPLE = { ax: 9, az: 6, y0: 42, h: 7.5, zc: 2 };
export const STAIR_C = { hw: 4.5, z0: -64, z1: -42, y0: 3, y1: 15 };          // central, perpendicular
export const STAIR_S = { x0: 34, x1: 4.5, z0: -52, z1: -42, y0: 3, y1: 15 };   // side, along the face (mirrored)
export const GATE = { hw: 7.5, z0: -45, z1: -36, y0: 15, h: 7 };
export const HF = { x0: -150, z0: -130, sx: 300, sz: 260 };

function tierH(x, z, T) {
  const d = Math.min(T.ax - Math.abs(x), T.az - Math.abs(z));
  if (d < 0) return 0;
  return T.y0 + Math.min(d / T.b, T.h);
}
export function Hzig(x, z) {
  let h = tierH(x, z, TERRACE);
  for (const T of TIERS) h = Math.max(h, tierH(x, z, T));
  // central stair
  const C = STAIR_C;
  if (Math.abs(x) <= C.hw && z >= C.z0 && z <= C.z1) h = Math.max(h, C.y0 + (C.y1 - C.y0) * (z - C.z0) / (C.z1 - C.z0));
  // side stairs, rising toward the centre
  const S = STAIR_S, ax = Math.abs(x);
  if (ax <= S.x0 && ax >= S.x1 - 0.01 && z >= S.z0 && z <= S.z1) h = Math.max(h, S.y0 + (S.y1 - S.y0) * (S.x0 - ax) / (S.x0 - S.x1));
  // gate house
  const G = GATE;
  if (Math.abs(x) <= G.hw && z >= G.z0 && z <= G.z1) h = Math.max(h, G.y0 + G.h);
  return h;
}

function duneH(x, z) {
  // wind from the west (−x): long windward slope, steeper lee to the east
  const cx = 12, cz = -6;
  const dx = x - cx, dz = z - cz;
  const rx = dx < 0 ? 128 : 92, rz = 98;
  const q = (dx / rx) ** 2 + (dz / rz) ** 2;
  let h = q < 1 ? 27 * Math.pow(1 - q, 1.6) : 0;
  const n = fbm3(x * 0.012, z * 0.012, 3.1, 4);
  h += (q < 1.3 ? (1 - smoothstep(0.6, 1.3, q)) : 0) * (n * 6 + 2.5 * Math.sin((x * 0.9 + z * 0.35) * 0.09 + n * 3));
  // fade to zero at region edges
  const ex = Math.min(x - HF.x0, HF.x0 + HF.sx - x), ez = Math.min(z - HF.z0, HF.z0 + HF.sz - z);
  return Math.max(0, h) * smoothstep(0, 18, Math.min(ex, ez));
}

// Regular grid (0.5 m) of the three states + erosion threshold. Returns Float32 arrays.
export function buildHeightGrids() {
  const res = 0.5, nx = Math.round(HF.sx / res) + 1, nz = Math.round(HF.sz / res) + 1;
  const hz = new Float32Array(nx * nz), hb = new Float32Array(nx * nz), hd = new Float32Array(nx * nz), thr = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = HF.x0 + i * res, z = HF.z0 + j * res, k = j * nx + i;
    hz[k] = Hzig(x, z);
    hd[k] = duneH(x, z);
  }
  // softened state: separable box blur ×2 (≈ gaussian, radius ~5 m)
  const tmp = new Float32Array(nx * nz);
  const blur = (src, dst, r, horiz) => {
    const n = horiz ? nx : nz, m = horiz ? nz : nx;
    for (let a = 0; a < m; a++) {
      let acc = 0, cnt = 0;
      const at = b => horiz ? a * nx + b : b * nx + a;
      for (let b = -r; b <= r; b++) { const bb = clamp(b, 0, n - 1); acc += src[at(bb)]; cnt++; }
      for (let b = 0; b < n; b++) {
        dst[at(b)] = acc / cnt;
        const add = Math.min(n - 1, b + r + 1), rem = Math.max(0, b - r);
        acc += src[at(add)] - src[at(rem)];
      }
    }
  };
  blur(hz, tmp, 9, true); blur(tmp, hb, 9, false);
  blur(hb, tmp, 9, true); blur(tmp, hb, 9, false);
  // softened state also slumps a little: lowered peaks, spread
  for (let k = 0; k < hb.length; k++) hb[k] = hb[k] * 0.86 + hd[k] * 0.14;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = HF.x0 + i * res, z = HF.z0 + j * res, k = j * nx + i;
    const n = noise3(x * 0.03, z * 0.03, 7.7) * 0.5 + noise3(x * 0.1, z * 0.1, 2.2) * 0.2;
    thr[k] = clamp(0.08 + 0.42 * (1 - Math.max(hz[k], hd[k]) / 50) + 0.28 * n, 0, 0.62);
  }
  return { res, nx, nz, hz, hb, hd, thr };
}

function bilinear(grid, G, x, z) {
  const fx = clamp((x - HF.x0) / G.res, 0, G.nx - 1.001), fz = clamp((z - HF.z0) / G.res, 0, G.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * G.nx + i;
  return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + G.nx] * (1 - u) + grid[k + G.nx + 1] * u) * v;
}

// Mesh: non-uniform grid with breakpoints at every tier / stair edge (so battered walls are exact planes).
export function buildHeightMesh(G) {
  const bx = new Set(), bz = new Set();
  const add = (S, v) => S.add(Math.round(v * 100) / 100);
  for (const T of [TERRACE, ...TIERS]) {
    for (const s of [-1, 1]) {
      add(bx, s * T.ax); add(bx, s * (T.ax - T.b * T.h));
      add(bz, s * T.az); add(bz, s * (T.az - T.b * T.h));
    }
  }
  for (const s of [-1, 1]) {
    add(bx, s * STAIR_C.hw); add(bx, s * (STAIR_C.hw + 0.25));
    add(bx, s * STAIR_S.x0); add(bx, s * (STAIR_S.x0 + 0.25));
    add(bx, s * GATE.hw); add(bx, s * (GATE.hw + 0.25));
  }
  for (const v of [STAIR_C.z0, STAIR_C.z0 - 0.25, STAIR_S.z0, STAIR_S.z0 - 0.25, GATE.z0, GATE.z0 - 0.25, GATE.z1, GATE.z1 + 0.25, STAIR_C.z1]) add(bz, v);
  const axis = (lo, hi, B, core) => {
    const out = [...B].filter(v => v > lo && v < hi);
    for (let v = lo; v <= hi + 1e-6; ) {
      out.push(v);
      v += Math.abs(v) < core ? 1.0 : 3.0;
    }
    out.sort((a, b) => a - b);
    const ded = [];
    for (const v of out) if (!ded.length || v - ded[ded.length - 1] > 0.05) ded.push(v);
    else if (B.has(Math.round(v * 100) / 100)) ded[ded.length - 1] = v;
    return ded;
  };
  const xs = axis(HF.x0, HF.x0 + HF.sx, bx, 67), zs = axis(HF.z0, HF.z0 + HF.sz, bz, 70);
  const NX = xs.length, NZ = zs.length, N = NX * NZ;
  const pos = new Float32Array(N * 3), aH = new Float32Array(N * 4), aG = new Float32Array(N * 4);
  const e = 0.6;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = xs[i], z = zs[j];
    pos[k * 3] = x; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z;
    aH[k * 4] = Hzig(x, z);
    aH[k * 4 + 1] = bilinear(G.hb, G, x, z);
    aH[k * 4 + 2] = bilinear(G.hd, G, x, z);
    aH[k * 4 + 3] = bilinear(G.thr, G, x, z);
    aG[k * 4] = (bilinear(G.hb, G, x + e, z) - bilinear(G.hb, G, x - e, z)) / (2 * e);
    aG[k * 4 + 1] = (bilinear(G.hb, G, x, z + e) - bilinear(G.hb, G, x, z - e)) / (2 * e);
    aG[k * 4 + 2] = (bilinear(G.hd, G, x + e, z) - bilinear(G.hd, G, x - e, z)) / (2 * e);
    aG[k * 4 + 3] = (bilinear(G.hd, G, x, z + e) - bilinear(G.hd, G, x, z - e)) / (2 * e);
  }
  const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
  let p = 0;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    // diagonal follows the hip lines of the stepped pyramid
    if (cx * cz > 0) { idx[p++] = a; idx[p++] = c; idx[p++] = d; idx[p++] = a; idx[p++] = d; idx[p++] = b; }
    else { idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
  }
  return { pos, aH, aG, idx, NX, NZ };
}

// Half-float RGBA texture data of the grids (for shadows in fragment shaders), downsampled ×1 (0.5 m).
export function heightTextureData(G, toHalf) {
  const data = new Uint16Array(G.nx * G.nz * 4);
  for (let k = 0; k < G.nx * G.nz; k++) {
    data[k * 4] = toHalf(G.hz[k]); data[k * 4 + 1] = toHalf(G.hb[k]);
    data[k * 4 + 2] = toHalf(G.hd[k]); data[k * 4 + 3] = toHalf(G.thr[k]);
  }
  return data;
}

// ---------------------------------------------------------------- network
// Paths converge on the platform: a set of branching trees rooted at the terrace edge.
function terraceEdgePoint(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const k = Math.min(TERRACE.ax / Math.abs(c || 1e-6), TERRACE.az / Math.abs(s || 1e-6));
  return [c * (k + 4), s * (k + 4)];
}

export function buildNetwork(seed = 11) {
  const R = rng(seed);
  const nodes = []; // {pts:[[x,z]...], parent, depth, canal, width}
  const N_TRUNK = 10;
  function grow(parent, start, ang, len, depth, canal) {
    const pts = [start];
    let [x, z] = start, a = ang;
    const step = 22, n = Math.max(2, Math.round(len / step));
    const seedN = R() * 100;
    for (let i = 1; i <= n; i++) {
      a += noise3(seedN, i * 0.21, depth) * 0.16;
      x += Math.cos(a) * step; z += Math.sin(a) * step;
      pts.push([x, z]);
    }
    const node = { pts, parent, depth, canal, ang: a };
    nodes.push(node);
    const r = Math.hypot(x, z);
    if (depth < 4 && r < 2300) {
      const kids = depth === 0 ? 2 : R() < 0.55 ? 2 : 3;
      for (let k = 0; k < kids; k++) {
        const spread = (k - (kids - 1) / 2) * (0.42 + R() * 0.25) + (R() - 0.5) * 0.2;
        grow(node, [x, z], a + spread, len * (0.62 + R() * 0.3), depth + 1, canal && (depth < 2 || R() < 0.5));
      }
    }
    return node;
  }
  for (let i = 0; i < N_TRUNK; i++) {
    const a = (i + 0.5 + (R() - 0.5) * 0.5) / N_TRUNK * Math.PI * 2;
    grow(null, terraceEdgePoint(a), a, 330 + R() * 220, 0, i % 2 === 0);
  }
  // leaves → inbound polylines (outer end first, ending at the terrace)
  const leaves = nodes.filter(n => !nodes.some(m => m.parent === n));
  const paths = leaves.map(leaf => {
    const chain = [];
    for (let n = leaf; n; n = n.parent) chain.push(n);
    let pts = [];
    for (const n of chain.reverse()) pts = pts.concat(pts.length ? n.pts.slice(1) : n.pts);
    return pts.reverse();
  });
  // river: a slow meander from north-west to south-east, ~1.1 km off centre
  const river = [];
  for (let s = -3600; s <= 3600; s += 40) {
    const off = 1150 + Math.sin(s * 0.0021) * 230 + Math.sin(s * 0.0051 + 1.3) * 90;
    const dir = [0.78, -0.62], nrm = [0.62, 0.78];
    river.push([dir[0] * s + nrm[0] * off, dir[1] * s + nrm[1] * off]);
  }
  return { nodes, paths, river };
}

// Resample a polyline to n points of uniform arc length. Returns {pts: Float32Array(n*2), len}.
export function resample(poly, n) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1], out = new Float32Array(n * 2);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = L * k / (n - 1);
    while (j < poly.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    out[k * 2] = poly[j][0] + (poly[j + 1][0] - poly[j][0]) * u;
    out[k * 2 + 1] = poly[j][1] + (poly[j + 1][1] - poly[j][1]) * u;
  }
  return { pts: out, len: L };
}

// ---------------------------------------------------------------- ground masks
// Canvas covering ±EXT metres. R = water, G = field tone (0 bare), B = path/track.
export const GROUND_EXT = 2600;
export function drawGround(net, size = 4096) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const k = size / (2 * GROUND_EXT);
  const X = x => (x + GROUND_EXT) * k, Z = z => (GROUND_EXT - z) * k;   // canvas y = −z (north up)
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const R = rng(5);
  const stroke = (pts, w, col, off = 0) => {
    g.strokeStyle = col; g.lineWidth = Math.max(0.8, w * k);
    g.beginPath();
    pts.forEach((p, i) => {
      let x = p[0], z = p[1];
      if (off) {
        const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
        const dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1;
        x += -dz / l * off; z += dx / l * off;
      }
      i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z));
    });
    g.stroke();
  };
  // fields: long strips perpendicular to canals, both banks
  const strips = (pts, maxLen) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, tx = dx / l, tz = dz / l, nx = -tz, nz = tx;
      for (let s = 0; s < l; s += 12 + R() * 10) {
        const px = x0 + tx * s, pz = z0 + tz * s;
        if (Math.hypot(px / 1.08, pz) < 790) continue;
        for (const side of [-1, 1]) {
          if (R() < 0.1) continue;
          const len = maxLen * (0.75 + R() * 0.25), w = 11 + R() * 8, st = 10;
          const tone = R() < 0.5 ? R() * 0.45 : 0.45 + R() * 0.55;
          const v = Math.floor(60 + tone * 195);
          g.fillStyle = `rgb(0,${v},0)`;
          g.save();
          g.translate(X(px + nx * side * st), Z(pz + nz * side * st));
          g.rotate(-Math.atan2(nz * side, nx * side));
          g.fillRect(0, -w * k / 2, len * k, w * k * 0.92);
          g.restore();
        }
      }
    }
  };
  for (const n of net.nodes) if (n.canal) strips(n.pts, n.depth < 2 ? 260 : 170);
  // river-side groves / fields
  strips(net.river.filter((_, i) => i % 2 === 0), 420);
  const grove = (x, z, r, n) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r;
      g.fillStyle = `rgb(0,${20 + Math.floor(R() * 30)},0)`;
      g.beginPath(); g.arc(X(x + Math.cos(a) * d), Z(z + Math.sin(a) * d), (3 + R() * 3.5) * k, 0, Math.PI * 2); g.fill();
    }
  };
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < net.river.length; i += 3) {
    const [x, z] = net.river[i];
    for (const side of [-1, 1]) if (R() < 0.7) grove(x + side * (70 + R() * 60) * 0.62, z + side * (70 + R() * 60) * 0.78, 40 + R() * 50, 60);
  }
  for (const n of net.nodes) if (n.canal) for (let i = 2; i < n.pts.length; i += 4) {
    const [x, z] = n.pts[i];
    if (R() < 0.45 && Math.hypot(x, z) > 300) grove(x + (R() - 0.5) * 50, z + (R() - 0.5) * 50, 18 + R() * 28, 22);
  }
  g.globalCompositeOperation = 'lighter';
  g.globalCompositeOperation = 'source-over';
  // erase fields where water/paths are (keep channels clean) then add them
  g.globalCompositeOperation = 'lighter';
  for (const n of net.nodes) {
    const w = n.depth === 0 ? 5 : n.depth === 1 ? 4 : 3;
    stroke(n.pts, w, 'rgb(0,0,150)');
    if (n.canal) stroke(n.pts, n.depth < 2 ? 7 : 4.5, 'rgb(255,0,0)', 9);
  }
  stroke(net.river, 95, 'rgb(255,0,0)');
  stroke(net.river, 140, 'rgb(0,0,40)');
  // ring moat around the city
  const moat = [];
  for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2; moat.push([Math.cos(t) * 760 + Math.sin(t * 3) * 25, Math.sin(t) * 690 + Math.cos(t * 2) * 30]); }
  stroke(moat, 9, 'rgb(255,0,0)');
  const tex = c;
  return { canvas: tex, ext: GROUND_EXT, moat };
}

// ---------------------------------------------------------------- houses
// Dense mud-brick city around the platform; born in waves outward along the paths.
export function buildHouses(net, seed = 23) {
  const R = rng(seed);
  // spatial hash of path segments for clearance tests
  const cell = 40, segs = new Map();
  const key = (i, j) => i * 100003 + j;
  const addSeg = (a, b, w) => {
    const i0 = Math.floor(Math.min(a[0], b[0]) / cell) - 1, i1 = Math.floor(Math.max(a[0], b[0]) / cell) + 1;
    const j0 = Math.floor(Math.min(a[1], b[1]) / cell) - 1, j1 = Math.floor(Math.max(a[1], b[1]) / cell) + 1;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!segs.has(k)) segs.set(k, []); segs.get(k).push([a, b, w]); }
  };
  for (const n of net.nodes) for (let i = 1; i < n.pts.length; i++) addSeg(n.pts[i - 1], n.pts[i], n.canal ? 16 : 7);
  const near = (x, z) => {
    const l = segs.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!l) return 1e9;
    let best = 1e9;
    for (const [a, b, w] of l) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz));
      best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - w);
    }
    return best;
  };
  const out = [];
  const step = 12.5;
  for (let gx = -900; gx <= 900; gx += step) for (let gz = -900; gz <= 900; gz += step) {
    const x = gx + (R() - 0.5) * 2.5, z = gz + (R() - 0.5) * 2.5;
    const r = Math.hypot(x / 1.08, z);
    if (Math.abs(x) < TERRACE.ax + 14 && Math.abs(z) < TERRACE.az + 14) continue;
    if (r > 745) continue;                                      // inside the moat
    const dens = 0.92 * (1 - smoothstep(380, 740, r)) + 0.06 + 0.25 * noise3(x * 0.006, z * 0.006, 4);
    if (R() > dens) continue;
    const dPath = near(x, z);
    if (dPath < 3) continue;
    const sx = step * (0.62 + R() * 0.3), sz = step * (0.62 + R() * 0.3);
    const sy = 3.2 + R() * 2.6 + (R() < 0.06 ? 3 : 0);
    const rot = noise3(x * 0.003, z * 0.003, 9) * 0.5;
    // birth: crystallises outward from the platform and along the paths
    const birth = 7.5 + (r - 140) / 600 * 9.5 + (R() - 0.5) * 2.0 + clamp(dPath / 60) * 2.0 - (R() < 0.08 ? 8 : 0);
    out.push({ x, z, sx, sz, sy, rot, birth: Math.max(-1, Math.min(birth, 19)), death: 23.6 + (r / 745) * 1.6 + R() * 1.4, lamp: R() < 0.55 });
  }
  return out;
}

// City height texture (RGBA8): R height/16, G (birth+2)/24, B (death−20)/12. Exact rasterisation (no AA).
export const CITY_EXT = 800;
export function cityHeightData(houses, size = 2048) {
  const data = new Uint8Array(size * size * 4);
  const k = size / (2 * CITY_EXT);
  for (const h of houses) {
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    const r = Math.hypot(h.sx, h.sz) / 2 + 1;
    const i0 = Math.max(0, Math.floor((h.x - r + CITY_EXT) * k)), i1 = Math.min(size - 1, Math.ceil((h.x + r + CITY_EXT) * k));
    const j0 = Math.max(0, Math.floor((h.z - r + CITY_EXT) * k)), j1 = Math.min(size - 1, Math.ceil((h.z + r + CITY_EXT) * k));
    const R = Math.round(clamp(h.sy / 16) * 255), G = Math.round(clamp((h.birth + 2) / 24) * 255), B = Math.round(clamp((h.death - 20) / 12) * 255);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / k - CITY_EXT - h.x, z = (j + 0.5) / k - CITY_EXT - h.z;
      const lx = c * x + s * z, lz = -s * x + c * z;
      if (Math.abs(lx) <= h.sx / 2 && Math.abs(lz) <= h.sz / 2) {
        const o = (j * size + i) * 4;
        data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 255;
      }
    }
  }
  return data;
}
