import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_SIZE, CELL, FLOORS, PLATFORMS, STAIRS, ROOFS, WALLS, PROPS, DECOR } from './mapdata.js';

const HALF = MAP_SIZE / 2;
// painted letters: [text, sub, color, x, y, z, rotY, size]
const SIGNS = [
  ['A', '', '#d8752a', 44, 3.0, -65.94, 0, 5], ['A', '', '#d8752a', 65.94, 3.0, -58, -Math.PI / 2, 5],
  ['B', '', '#c8402a', -55, 3.0, -71.94, 0, 5], ['B', '', '#c8402a', -71.94, 3.0, -56, Math.PI / 2, 5],
  ['A', '→', '#d8752a', 41.94, 2.2, 14, Math.PI / 2, 2.6], ['A', '↑', '#d8752a', 10.06, 2.2, 0, Math.PI / 2, 2.4],
  ['B', '←', '#c8402a', -9.94, 2.2, 20, -Math.PI / 2, 2.4], ['B', '↓', '#c8402a', -50.06, 2.2, 12, -Math.PI / 2, 2.4],
  ['A', '', '#d8752a', 60.06, 2.6, 40, -Math.PI / 2, 2.6], ['B', '', '#c8402a', -40, 2.2, -43.94, 0, 2.4],
];
const GRID = 4;                       // collision broadphase cell (m)
const GN = Math.ceil(MAP_SIZE / GRID);
const RN = MAP_SIZE / CELL;           // raster cells per side

// penetration resistance per material (higher = harder to shoot through)
const PEN = { wood: 1.0, crate: 1.0, plaster: 1.6, tin: 0.8, metal: 2.6, old_sand: 3.0, stone: 3.5, building: 99, car: 2.2, default: 3 };

function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

export class World {
  constructor() {
    this.solids = [];
    this.grid = Array.from({ length: GN * GN }, () => []);
    this.stamp = 1; this.marks = [];
    this.floorRaster = new Array(RN * RN).fill(null);  // material per raster cell or null = solid
    this.zoneRaster = new Array(RN * RN).fill('');
    this.group = new THREE.Group();
    this.propSpots = [];
  }

  // ---------- solids ----------
  addSolid(x0, y0, z0, x1, y1, z1, mat = 'building', kind = 'building') {
    const s = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat, kind, id: this.solids.length };
    s.pen = PEN[mat] ?? PEN.default;
    this.solids.push(s); this.marks.push(0);
    const gx0 = Math.max(0, Math.floor((s.min[0] + HALF) / GRID)), gx1 = Math.min(GN - 1, Math.floor((s.max[0] + HALF - 1e-4) / GRID));
    const gz0 = Math.max(0, Math.floor((s.min[2] + HALF) / GRID)), gz1 = Math.min(GN - 1, Math.floor((s.max[2] + HALF - 1e-4) / GRID));
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) this.grid[gz * GN + gx].push(s.id);
    return s;
  }

  query(x0, z0, x1, z1, out = []) {
    out.length = 0; const st = ++this.stamp;
    const gx0 = Math.max(0, Math.floor((x0 + HALF) / GRID)), gx1 = Math.min(GN - 1, Math.floor((x1 + HALF) / GRID));
    const gz0 = Math.max(0, Math.floor((z0 + HALF) / GRID)), gz1 = Math.min(GN - 1, Math.floor((z1 + HALF) / GRID));
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const c = this.grid[gz * GN + gx];
      for (let k = 0; k < c.length; k++) { const id = c[k]; if (this.marks[id] !== st) { this.marks[id] = st; out.push(this.solids[id]); } }
    }
    return out;
  }

  // highest walkable surface under a circle, not above yMax (navOnly: ignore props/walls, used by the nav grid)
  groundAt(x, z, r = 0.35, yMax = 1e9, navOnly = false) {
    let g = 0; const q = this.query(x - r, z - r, x + r, z + r, this._q || (this._q = []));
    for (const s of q) {
      if (s.max[1] > yMax || s.kind === 'roof') continue;
      if (navOnly && s.kind !== 'platform' && s.kind !== 'stair') continue;
      if (circleBox(x, z, r * 0.7, s)) g = Math.max(g, s.max[1]);
    }
    return g;
  }

  // push a vertical capsule (circle in XZ) out of solids; returns true if collided
  collide(pos, r, height, step) {
    let hit = false;
    const q = this.query(pos.x - r - 0.1, pos.z - r - 0.1, pos.x + r + 0.1, pos.z + r + 0.1, this._q2 || (this._q2 = []));
    for (let iter = 0; iter < 2; iter++) {
      for (const s of q) {
        if (s.max[1] <= pos.y + step || s.min[1] >= pos.y + height) continue;
        // closest point
        const cx = Math.max(s.min[0], Math.min(pos.x, s.max[0]));
        const cz = Math.max(s.min[2], Math.min(pos.z, s.max[2]));
        let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d; pos.x += dx / d * push; pos.z += dz / d * push;
        } else {
          // center inside box: push out along smallest axis
          const pxl = pos.x - s.min[0] + r, pxr = s.max[0] - pos.x + r, pzl = pos.z - s.min[2] + r, pzr = s.max[2] - pos.z + r;
          const m = Math.min(pxl, pxr, pzl, pzr);
          if (m === pxl) pos.x = s.min[0] - r; else if (m === pxr) pos.x = s.max[0] + r; else if (m === pzl) pos.z = s.min[2] - r; else pos.z = s.max[2] + r;
        }
        hit = true;
      }
    }
    return hit;
  }

  // ceiling above position (for jumping under roofs)
  ceilingAt(x, z, r, y) {
    let c = 1e9; const q = this.query(x - r, z - r, x + r, z + r, this._q3 || (this._q3 = []));
    for (const s of q) if (s.min[1] >= y && circleBox(x, z, r * 0.7, s)) c = Math.min(c, s.min[1]);
    return c;
  }

  // ---------- raycast ----------
  // returns array of {t, tOut, solid, normal} sorted by t, up to maxDist. includes ground plane (solid=null, t)
  raycastAll(o, d, maxDist, out = []) {
    out.length = 0; const st = ++this.stamp;
    let gx = Math.floor((o.x + HALF) / GRID), gz = Math.floor((o.z + HALF) / GRID);
    const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    const tDX = Math.abs(GRID / (d.x || 1e-9)), tDZ = Math.abs(GRID / (d.z || 1e-9));
    let tMX = d.x !== 0 ? (((gx + (d.x > 0 ? 1 : 0)) * GRID - HALF) - o.x) / d.x : 1e9;
    let tMZ = d.z !== 0 ? (((gz + (d.z > 0 ? 1 : 0)) * GRID - HALF) - o.z) / d.z : 1e9;
    let t = 0;
    while (t <= maxDist) {
      if (gx >= 0 && gz >= 0 && gx < GN && gz < GN) {
        const c = this.grid[gz * GN + gx];
        for (let k = 0; k < c.length; k++) {
          const id = c[k]; if (this.marks[id] === st) continue; this.marks[id] = st;
          const s = this.solids[id]; const h = rayBox(o, d, s);
          if (h && h.t <= maxDist) { h.solid = s; out.push(h); }
        }
      } else if ((gx < -1 && stepX < 0) || (gz < -1 && stepZ < 0) || (gx > GN && stepX > 0) || (gz > GN && stepZ > 0)) break;
      if (tMX < tMZ) { t = tMX; tMX += tDX; gx += stepX; } else { t = tMZ; tMZ += tDZ; gz += stepZ; }
    }
    if (d.y < 0) { const tg = -o.y / d.y; if (tg <= maxDist && tg >= 0) out.push({ t: tg, tOut: 1e9, solid: null, normal: [0, 1, 0] }); }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  raycast(o, d, maxDist) { const a = this.raycastAll(o, d, maxDist, this._ra || (this._ra = [])); return a.length ? a[0] : null; }

  // line of sight between two points
  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    const d = { x: dx / L, y: dy / L, z: dz / L };
    const h = this.raycast(a, d, L);
    return !h || h.t >= L - 0.05;
  }

  // ---------- build ----------
  build(assets) {
    this.assets = assets;
    const mats = this.makeMaterials(assets);
    this.mats = mats;
    const geo = {}; const push = (m, g) => (geo[m] || (geo[m] = [])).push(g);

    // raster floors
    for (const [x0, z0, x1, z1, m, zone] of FLOORS) {
      for (let x = x0; x < x1; x += CELL) for (let z = z0; z < z1; z += CELL) {
        const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL);
        if (i >= 0 && j >= 0 && i < RN && j < RN) { this.floorRaster[j * RN + i] = m; this.zoneRaster[j * RN + i] = zone; }
      }
    }
    // floors: greedy rows per material
    for (let j = 0; j < RN; j++) {
      let i = 0;
      while (i < RN) {
        const m = this.floorRaster[j * RN + i];
        if (!m) { i++; continue; }
        let k = i; while (k < RN && this.floorRaster[j * RN + k] === m) k++;
        const x0 = i * CELL - HALF, x1 = k * CELL - HALF, z0 = j * CELL - HALF, z1 = z0 + CELL;
        push(m, quadY(x0, z0, x1, z1, 0, mats.scale[m] || 4));
        i = k;
      }
    }
    // buildings: greedy rectangles of solid cells, max 6x6 cells
    const used = new Uint8Array(RN * RN);
    const isSolid = (i, j) => i >= 0 && j >= 0 && i < RN && j < RN && !this.floorRaster[j * RN + i];
    const isFloor = (i, j) => i >= 0 && j >= 0 && i < RN && j < RN && !!this.floorRaster[j * RN + i];
    const facadeMats = ['sand_blocks', 'plaster', 'stone', 'sand_blocks', 'plaster2', 'old_sand'];
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
      if (!isSolid(i, j) || used[j * RN + i]) continue;
      let w = 1; while (w < 6 && isSolid(i + w, j) && !used[j * RN + i + w]) w++;
      let h = 1; outer: while (h < 6) { for (let a = 0; a < w; a++) if (!isSolid(i + a, j + h) || used[(j + h) * RN + i + a]) break outer; h++; }
      for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) used[(j + b) * RN + i + a] = 1;
      // is it visible (adjacent to any floor)? interior blocks get a cheap low box
      let touches = false;
      for (let a = -1; a <= w && !touches; a++) for (let b = -1; b <= h; b++) if (isFloor(i + a, j + b)) { touches = true; break; }
      const x0 = i * CELL - HALF, z0 = j * CELL - HALF, x1 = x0 + w * CELL, z1 = z0 + h * CELL;
      const edge = i === 0 || j === 0 || i + w >= RN || j + h >= RN;
      const r = hash(Math.floor(i / 3), Math.floor(j / 3));
      const H = touches ? (edge ? 12 + r * 4 : 6.5 + Math.floor(r * 4) * 1.2) : 9;
      this.addSolid(x0, 0, z0, x1, H, z1, 'building', 'building');
      if (!touches) continue;
      const fm = facadeMats[Math.floor(hash(Math.floor(i / 5) + 7, Math.floor(j / 5) + 3) * facadeMats.length)];
      push(fm, boxGeo(x0, 0.9, z0, x1, H, z1, mats.scale[fm] || 3, { bottom: false }));
      // base band and top cornice
      push('old_sand', boxGeo(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.9, z1 + 0.06, 2.5, { bottom: false, top: false }));
      push('old_sand', boxGeo(x0 - 0.22, H - 0.05, z0 - 0.22, x1 + 0.22, H + 0.35, z1 + 0.22, 2.5, {}));
      // facade details on sides facing floors
      this.facadeDetails(i, j, w, h, x0, z0, x1, z1, H, isFloor, push, mats);
    }
    // platforms
    for (const [x0, z0, x1, z1, y, m] of PLATFORMS) {
      this.addSolid(x0, 0, z0, x1, y, z1, m, 'platform');
      push(m, boxGeo(x0, 0, z0, x1, y - 0.12, z1, 2.5, { bottom: false, top: false }));
      push('cobble', boxGeo(x0, y - 0.12, z0, x1, y, z1, 3, { bottom: false }));
    }
    // stairs
    for (const [x0, z0, x1, z1, dir, y0, y1] of STAIRS) {
      const n = Math.max(2, Math.round((y1 - y0) / 0.3));
      for (let k = 0; k < n; k++) {
        const top = y0 + (y1 - y0) * (k + 1) / n;
        let a = [x0, z0, x1, z1]; const f0 = k / n, f1 = 1;
        if (dir === 'e') a = [x0 + (x1 - x0) * f0, z0, x1, z1];
        if (dir === 'w') a = [x0, z0, x1 - (x1 - x0) * f0, z1];
        if (dir === 's') a = [x0, z0 + (z1 - z0) * f0, x1, z1];
        if (dir === 'n') a = [x0, z0, x1, z1 - (z1 - z0) * f0];
        this.addSolid(a[0], 0, a[1], a[2], top, a[3], 'old_sand', 'stair');
        push('old_sand', boxGeo(a[0], 0, a[1], a[2], top, a[3], 1.5, { bottom: false }));
      }
    }
    // roofs
    for (const [x0, z0, x1, z1, y] of ROOFS) {
      this.addSolid(x0, y, z0, x1, y + 1.2, z1, 'building', 'roof');
      push('planks', boxGeo(x0, y, z0, x1, y + 0.25, z1, 3, {}));
      push('old_sand', boxGeo(x0, y + 0.25, z0, x1, y + 1.2, z1, 2.5, { bottom: false }));
      // beams
      const along = (x1 - x0) < (z1 - z0);
      for (let t = 0; t < (along ? z1 - z0 : x1 - x0); t += 3) {
        if (along) push('pine', boxGeo(x0, y - 0.3, z0 + t, x1, y, z0 + t + 0.3, 2, { bottom: true }));
        else push('pine', boxGeo(x0 + t, y - 0.3, z0, x0 + t + 0.3, y, z1, 2, { bottom: true }));
      }
    }
    // walls
    for (const [x0, z0, x1, z1, h, m] of WALLS) {
      if (h <= 0) continue;
      this.addSolid(x0, 0, z0, x1, h, z1, m, 'wall');
      push(m, boxGeo(x0, 0, z0, x1, h, z1, mats.scale[m] || 2.5, { bottom: false }));
      if (h > 2) push('old_sand', boxGeo(x0 - 0.1, h, z0 - 0.1, x1 + 0.1, h + 0.25, z1 + 0.1, 2, {}));
    }
    // mid doors leaves (half open) + long doors
    this.addDoor(2, -19, 2.1, 3.2, 70, push); this.addDoor(6, -19, 2.1, 3.2, 110 + 180, push);
    this.addDoor(46, 33.8, 3, 4.2, 20, push); this.addDoor(54, 33.8, 3, 4.2, 160 + 180, push);

    // merge into meshes
    for (const m in geo) {
      const g = mergeGeometries(geo[m], false);
      const mesh = new THREE.Mesh(g, mats[m] || mats.sand_blocks);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    this.buildSkyline(mats);
    this.paintSigns();
    this.buildNav();
    return this.group;
  }

  facadeDetails(i, j, w, h, x0, z0, x1, z1, H, isFloor, push, mats) {
    const sides = [
      { n: [0, 0, -1], cells: w, test: a => isFloor(i + a, j - 1), at: a => [x0 + a * CELL + 1, z0] },
      { n: [0, 0, 1], cells: w, test: a => isFloor(i + a, j + h), at: a => [x0 + a * CELL + 1, z1] },
      { n: [-1, 0, 0], cells: h, test: b => isFloor(i - 1, j + b), at: b => [x0, z0 + b * CELL + 1] },
      { n: [1, 0, 0], cells: h, test: b => isFloor(i + w, j + b), at: b => [x1, z0 + b * CELL + 1] },
    ];
    for (const s of sides) {
      for (let a = 0; a < s.cells; a++) {
        if (!s.test(a)) continue;
        const r = hash(i * 31 + a * 7 + s.n[0] * 3, j * 17 + a * 5 + s.n[2] * 11);
        const [cx, cz] = s.at(a);
        if (SIGNS.some(g => Math.hypot(g[3] - cx, g[5] - cz) < g[7] * 0.6 + 1.2)) continue;
        const nx = s.n[0], nz = s.n[2];
        const along = nx === 0;
        if (r < 0.12) {           // wooden door
          const hw = 0.9;
          const b = along ? [cx - hw, 0, cz - 0.08 * -nz, cx + hw, 2.6, cz + 0.08 * nz] : [cx - 0.08 * -nx, 0, cz - hw, cx + 0.08 * nx, 2.6, cz + hw];
          push('door', boxGeo(Math.min(b[0], b[3]), b[1], Math.min(b[2], b[5]), Math.max(b[0], b[3]), b[4], Math.max(b[2], b[5]), 2.6, { bottom: false, uvFit: true }));
          push('old_sand', frame(cx, cz, nx, nz, hw, 2.6, 0.2));
        } else if (r < 0.34 && H > 5) {   // window
          const wy = 3.2 + (r > 0.25 ? 0 : 0.4), hw = 0.6, hh = 0.75;
          const b = along ? [cx - hw, wy - hh, cz + 0.04 * nz, cx + hw, wy + hh, cz + 0.06 * nz] : [cx + 0.04 * nx, wy - hh, cz - hw, cx + 0.06 * nx, wy + hh, cz + hw];
          push('window', boxGeo(Math.min(b[0], b[3]), b[1], Math.min(b[2], b[5]), Math.max(b[0], b[3]), b[4], Math.max(b[2], b[5]), 1.4, { bottom: false, uvFit: true }));
          push('old_sand', frame(cx, cz, nx, nz, hw, hh * 2, 0.14, wy - hh));
          // sill
          const sb = along ? [cx - hw - 0.15, wy - hh - 0.12, cz, cx + hw + 0.15, wy - hh, cz + 0.25 * nz] : [cx, wy - hh - 0.12, cz - hw - 0.15, cx + 0.25 * nx, wy - hh, cz + hw + 0.15];
          push('old_sand', boxGeo(Math.min(sb[0], sb[3]), sb[1], Math.min(sb[2], sb[5]), Math.max(sb[0], sb[3]), sb[4], Math.max(sb[2], sb[5]), 2, {}));
        } else if (r > 0.93) {    // awning / tin plate
          const hw = 1.0;
          const b = along ? [cx - hw, 2.9, cz, cx + hw, 3.0, cz + 1.0 * nz] : [cx, 2.9, cz - hw, cx + 1.0 * nx, 3.0, cz + hw];
          push('tin', boxGeo(Math.min(b[0], b[3]), b[1], Math.min(b[2], b[5]), Math.max(b[0], b[3]), b[4], Math.max(b[2], b[5]), 2, {}));
        }
      }
    }
  }

  addDoor(hx, hz, w, h, angDeg, push) {
    // a door leaf hinged at (hx,hz), rotated angDeg around Y
    const g = boxGeo(0, 0, -0.06, w, h, 0.06, w, { uvFit: true });
    const m = new THREE.Matrix4().makeRotationY(angDeg * Math.PI / 180).setPosition(hx, 0, hz);
    g.applyMatrix4(m); push('door', g);
    // collision: approximate leaf with an AABB
    g.computeBoundingBox(); const bb = g.boundingBox;
    const s = this.addSolid(bb.min.x, 0, bb.min.z, bb.max.x, h, bb.max.z, 'wood', 'door');
    // thin collision for diagonal doors is generous; shrink
    const cx = (s.min[0] + s.max[0]) / 2, cz = (s.min[2] + s.max[2]) / 2;
    s.min[0] = cx - Math.max(0.1, (s.max[0] - s.min[0]) * 0.35); s.max[0] = cx + Math.max(0.1, (s.max[0] - cx) * 0.7);
    s.min[2] = cz - Math.max(0.1, (s.max[2] - s.min[2]) * 0.35); s.max[2] = cz + Math.max(0.1, (s.max[2] - cz) * 0.7);
  }

  // spray-painted bomb site letters and route arrows (like CS maps)
  paintSigns() {
    const mk = (text, sub, color) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
      x.fillStyle = color; x.strokeStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `900 ${sub ? 150 : 190}px Impact, "Arial Black", sans-serif`;
      x.globalAlpha = 0.92; x.fillText(text, 128, sub ? 110 : 128);
      if (sub) { x.font = '900 70px Impact, "Arial Black", sans-serif'; x.fillText(sub, 128, 210); }
      // overspray + drips
      x.globalAlpha = 0.25; for (let i = 0; i < 400; i++) { const r = Math.random() * 2; x.beginPath(); x.arc(40 + Math.random() * 176, 30 + Math.random() * 196, r, 0, 7); x.fill(); }
      x.globalAlpha = 0.6; for (let i = 0; i < 6; i++) { const px = 70 + Math.random() * 120, py = 150 + Math.random() * 30; x.fillRect(px, py, 3, 20 + Math.random() * 40); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    };
    const signs = SIGNS;
    const _unused = [
      ['A', '', '#d8752a', 44, 3.2, -65.92, 0, 4], ['A', '', '#d8752a', 65.92, 3.0, -58, -Math.PI / 2, 4],
      ['B', '', '#c8402a', -55, 3.2, -71.92, 0, 4], ['B', '', '#c8402a', -71.92, 3.0, -56, Math.PI / 2, 4],
      ['A', '→', '#d8752a', 41.92, 2.2, 14, Math.PI / 2, 2.2], ['A', '↑', '#d8752a', 10.08, 2.2, 0, Math.PI / 2, 2],
      ['B', '←', '#c8402a', -9.92, 2.2, 20, -Math.PI / 2, 2], ['B', '↓', '#c8402a', -50.08, 2.2, 12, -Math.PI / 2, 2],
      ['A', '', '#d8752a', 60.08, 2.6, 40, -Math.PI / 2, 2], ['B', '', '#c8402a', -40, 2.2, -43.92, 0, 2],
    ];
    for (const [t, sub, col, x, y, z, ry, size] of signs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mk(t, sub, col));
      m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  buildSkyline(mats) {
    // distant buildings + dunes beyond the playable area (no collision)
    const gs = { sand_blocks: [], plaster: [], ground: [] };
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * Math.PI * 2 + hash(k, 3) * 0.05;
      const R = HALF + 12 + hash(k, 9) * 30;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const w = 8 + hash(k, 1) * 14, d = 8 + hash(k, 2) * 14, h = 10 + hash(k, 5) * 16;
      const g = boxGeo(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, 4, { bottom: false });
      (k % 2 ? gs.sand_blocks : gs.plaster).push(g);
    }
    const ground = quadY(-400, -400, 400, 400, -0.02, 6);
    gs.ground.push(ground);
    for (const m in gs) {
      const mesh = new THREE.Mesh(mergeGeometries(gs[m]), mats[m]);
      mesh.receiveShadow = m === 'ground'; mesh.matrixAutoUpdate = false;
      if (m === 'ground') { mesh.position.y = -0.01; mesh.updateMatrix(); }
      this.group.add(mesh);
    }
  }

  makeMaterials(assets) {
    const T = assets.tex;
    const mk = (name, opts = {}) => {
      const m = new THREE.MeshStandardMaterial({
        map: T[name + '_diff'], normalMap: T[name + '_nor'], roughnessMap: T[name + '_arm'], metalnessMap: opts.metal ? T[name + '_arm'] : null,
        aoMap: T[name + '_arm'], aoMapIntensity: 0.9, roughness: 1, metalness: opts.metal ? 1 : 0,
        normalScale: new THREE.Vector2(opts.ns ?? 1, opts.ns ?? 1), color: opts.color ?? 0xffffff, envMapIntensity: 0.6,
      });
      return m;
    };
    const mats = {
      sand_blocks: mk('sand_blocks', { color: 0xfff2dc }), plaster: mk('plaster', { color: 0xf4dcb4 }), plaster2: mk('plaster2', { color: 0xf8e8c8 }),
      stone: mk('stone'), old_sand: mk('old_sand', { color: 0xf0e0c0 }), ground: mk('ground', { color: 0xf4e0bc }), ground2: mk('ground2', { color: 0xf2e2c4 }),
      cobble: mk('cobble', { color: 0xf0dcc0 }), concrete: mk('concrete', { color: 0xd8ccb8 }), door: mk('door'), pine: mk('pine'), tin: mk('tin', { metal: true }),
      planks: mk('planks'), tiles: mk('tiles', { color: 0xf2d2b8 }), bconcrete: mk('bconcrete'),
      window: new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.15, metalness: 0.6 }),
    };
    mats.wood = mats.planks;
    mats.scale = { sand_blocks: 3.2, plaster: 3, plaster2: 3, stone: 2.6, old_sand: 2.5, ground: 5, cobble: 3, concrete: 4, tiles: 3, planks: 2, tin: 2 };
    return mats;
  }

  // ---------- props ----------
  placeProps(assets) {
    const M = assets.models;
    const defs = {
      crate: { model: 'p_wooden_crate_01', size: 1.2, mat: 'crate' },
      barrel: { model: 'p_Barrel_01', size: 1.0, mat: 'metal', round: true },
      car: { model: 'p_covered_car', size: 4.4, mat: 'car' },
      barrier: { model: 'p_concrete_road_barrier', size: 2.0, mat: 'stone' },
      jerry: { model: 'p_metal_jerrycan', size: 0.5, mat: 'metal', noCollide: true },
      tyre: { model: 'p_old_tyre', size: 0.8, mat: 'metal', noCollide: true },
      propane: { model: 'p_propane_tank', size: 1.3, mat: 'metal' },
      cement: { model: 'p_cement_bag', size: 0.8, mat: 'plaster', noCollide: true },
      lamp: { model: 'p_street_lamp_01', size: 5.5, noCollide: true, vertical: true },
      aircon: { model: 'p_exterior_aircon_unit', size: 1.0, noCollide: true, wall: true },
      trash: { model: 'p_metal_trash_can', size: 1.0, mat: 'metal' },
    };
    const place = (type, x, z, rot, scale, stack, collide = true) => {
      const d = defs[type]; const src = M[d.model]; if (!src) return;
      for (let k = 0; k < stack; k++) {
        const o = src.scene.clone(true);
        // normalize size: largest horizontal extent (or height for vertical items)
        const bb = new THREE.Box3().setFromObject(o); const sz = bb.getSize(new THREE.Vector3());
        const base = d.vertical ? sz.y : Math.max(sz.x, sz.z);
        const s = d.size * scale / base; o.scale.setScalar(s);
        const bb2 = new THREE.Box3().setFromObject(o); const c = bb2.getCenter(new THREE.Vector3());
        const pivot = new THREE.Group(); pivot.add(o); o.position.set(-c.x, -bb2.min.y, -c.z);
        const g0 = this.groundAt(x, z, 0.3, 3);
        const y = (d.wall ? 2.6 : g0) + k * (bb2.max.y - bb2.min.y);
        const r = (rot + (k ? 12 * (k % 2 ? 1 : -1) : 0)) * Math.PI / 180;
        pivot.position.set(x, y, z); pivot.rotation.y = r;
        pivot.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        this.group.add(pivot);
        if (collide && !d.noCollide) {
          pivot.updateMatrixWorld(true);
          const wb = new THREE.Box3().setFromObject(pivot);
          // shrink a little for rotated items
          const shrink = Math.abs(Math.sin(2 * r)) * 0.18 * (wb.max.x - wb.min.x);
          this.addSolid(wb.min.x + shrink, wb.min.y, wb.min.z + shrink, wb.max.x - shrink, wb.max.y, wb.max.z - shrink, d.mat, 'prop');
        }
      }
    };
    for (const [type, x, z, rot, scale, stack] of PROPS) place(type, x, z, rot, scale, stack);
    for (const [type, x, z, rot] of DECOR) place(type, x, z, rot, 1, 1, type !== 'lamp' && type !== 'aircon');
    this.mergeStatic();
    this.buildNav();   // props changed walkability
  }

  // merge all static prop meshes that share a material into single draw calls
  mergeStatic() {
    const groups = new Map(); const remove = [];
    this.group.updateMatrixWorld(true);
    this.group.traverse(o => {
      if (!o.isMesh || o.parent === this.group || o.isInstancedMesh) return;
      const key = o.material.uuid;
      if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [] });
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      // keep only attributes every prop has
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      groups.get(key).geos.push(g); remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    for (const { mat, geos } of groups.values()) {
      const merged = mergeGeometries(geos.filter(g => g.attributes.uv && g.attributes.normal), false); if (!merged) continue;
      const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    // drop now-empty prop pivots
    for (const c of [...this.group.children]) if (c.isGroup && !c.children.some(x => x.isMesh || x.children.length)) this.group.remove(c);
  }

  // ---------- navigation ----------
  buildNav() {
    const N = RN; this.navN = N;
    const h = new Float32Array(N * N).fill(NaN);
    const r = 0.45;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i * CELL - HALF + CELL / 2, z = j * CELL - HALF + CELL / 2;
      const g = this.groundAt(x, z, 0.3, 2.5, true);
      if (!this.floorRaster[j * N + i] && g < 0.01) continue;
      if (this.blocked(x, z, g, 0.36)) continue;
      h[j * N + i] = g;
    }
    this.navH = h;
    // edges (8-neighborhood); bit k set if traversable to neighbor k
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    this.navDirs = dirs;
    const e = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * N + i; if (isNaN(h[a])) continue;
      for (let k = 0; k < 8; k++) {
        const [di, dj] = dirs[k]; const i2 = i + di, j2 = j + dj;
        if (i2 < 0 || j2 < 0 || i2 >= N || j2 >= N) continue;
        const b = j2 * N + i2; if (isNaN(h[b])) continue;
        if (k >= 4 && (isNaN(h[j * N + i2]) || isNaN(h[j2 * N + i]))) continue;
        if (this.walkable(i, j, i2, j2)) e[a] |= 1 << k;
      }
    }
    this.navE = e;
  }

  blocked(x, z, g, r) {
    const q = this.query(x - r, z - r, x + r, z + r, this._qb || (this._qb = []));
    for (const s of q) {
      if (s.max[1] <= g + 0.45 || s.min[1] >= g + 1.75) continue;
      if (circleBox(x, z, r, s)) return true;
    }
    return false;
  }

  walkable(i, j, i2, j2) {
    const x0 = i * CELL - HALF + CELL / 2, z0 = j * CELL - HALF + CELL / 2;
    const x1 = i2 * CELL - HALF + CELL / 2, z1 = j2 * CELL - HALF + CELL / 2;
    let prev = this.navH[j * this.navN + i];
    const n = 8;
    for (let s = 0; s <= n; s++) {
      const x = x0 + (x1 - x0) * s / n, z = z0 + (z1 - z0) * s / n;
      const g = this.groundAt(x, z, 0.25, prev + 0.5, true);
      if (g - prev > 0.48) return false;
      if (prev - g > 0.48 && prev - g > 2.2) return false;
      if (this.blocked(x, z, g, 0.35)) return false;
      prev = g;
    }
    return true;
  }

  cellOf(x, z) {
    const i = Math.max(0, Math.min(this.navN - 1, Math.floor((x + HALF) / CELL)));
    const j = Math.max(0, Math.min(this.navN - 1, Math.floor((z + HALF) / CELL)));
    return [i, j];
  }
  cellCenter(i, j) { return { x: i * CELL - HALF + CELL / 2, z: j * CELL - HALF + CELL / 2, y: this.navH[j * this.navN + i] || 0 }; }
  zoneAt(x, z) { const [i, j] = this.cellOf(x, z); return this.zoneRaster[j * this.navN + i] || ''; }

  nearestNav(x, z) {
    const [ci, cj] = this.cellOf(x, z); const N = this.navN;
    for (let rad = 0; rad < 8; rad++) {
      let best = null, bd = 1e9;
      for (let j = cj - rad; j <= cj + rad; j++) for (let i = ci - rad; i <= ci + rad; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad) continue;
        if (isNaN(this.navH[j * N + i]) || !this.navE[j * N + i]) continue;
        const c = this.cellCenter(i, j); const d = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return [ci, cj];
  }

  // A* over nav grid; returns array of {x,y,z}
  findPath(sx, sz, tx, tz, avoid = null) {
    const N = this.navN; const [si, sj] = this.nearestNav(sx, sz); const [ti, tj] = this.nearestNav(tx, tz);
    const start = sj * N + si, goal = tj * N + ti;
    if (!this._g) { this._g = new Float32Array(N * N); this._f = new Int32Array(N * N); this._seen = new Int32Array(N * N); this._closed = new Int32Array(N * N); this._gen = 0; }
    const G = this._g, from = this._f, seen = this._seen, closed = this._closed; const gen = ++this._gen;
    const heap = new MinHeap();
    G[start] = 0; seen[start] = gen; from[start] = -1; heap.push(start, 0);
    const dirs = this.navDirs; let found = false, iter = 0;
    while (heap.size && iter++ < 20000) {
      const a = heap.pop(); if (closed[a] === gen) continue; closed[a] = gen;
      if (a === goal) { found = true; break; }
      const ai = a % N, aj = (a / N) | 0; const e = this.navE[a];
      for (let k = 0; k < 8; k++) {
        if (!(e & (1 << k))) continue;
        const b = (aj + dirs[k][1]) * N + ai + dirs[k][0];
        let cost = k < 4 ? 1 : 1.4142;
        if (avoid) cost += avoid(b) || 0;
        const ng = G[a] + cost;
        if (seen[b] !== gen || ng < G[b]) {
          seen[b] = gen; G[b] = ng; from[b] = a;
          const bi = b % N, bj = (b / N) | 0; const dx = Math.abs(bi - ti), dz = Math.abs(bj - tj);
          heap.push(b, ng + (dx + dz) + (1.4142 - 2) * Math.min(dx, dz));
        }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = goal; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => this.cellCenter(c % N, (c / N) | 0));
    // final point exact target if walkable
    pts.push({ x: tx, z: tz, y: this.groundAt(tx, tz, 0.3, pts[pts.length - 1].y + 0.6) });
    return this.smooth(pts);
  }

  // string pulling on nav grid
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 12);
      for (; j > i + 1; j--) if (this.navLine(pts[i], pts[j])) break;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  navLine(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z); const n = Math.ceil(d / 0.7);
    let prev = a.y;
    for (let s = 1; s <= n; s++) {
      const x = a.x + (b.x - a.x) * s / n, z = a.z + (b.z - a.z) * s / n;
      const [i, j] = this.cellOf(x, z); const hh = this.navH[j * this.navN + i];
      if (isNaN(hh) || Math.abs(hh - prev) > 0.48) return false;
      if (this.blocked(x, z, hh, 0.42)) return false;
      prev = hh;
    }
    return true;
  }

  randomNavNear(x, z, rad) {
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * rad;
      const [i, j] = this.cellOf(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (!isNaN(this.navH[j * this.navN + i]) && this.navE[j * this.navN + i]) return this.cellCenter(i, j);
    }
    return { x, z, y: this.groundAt(x, z) };
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) { const K = this.k, P = this.p; let i = K.length; K.push(k); P.push(p); while (i > 0) { const pa = (i - 1) >> 1; if (P[pa] <= p) break; K[i] = K[pa]; P[i] = P[pa]; i = pa; } K[i] = k; P[i] = p; }
  pop() {
    const K = this.k, P = this.p; const top = K[0]; const lk = K.pop(), lp = P.pop();
    if (K.length) { let i = 0; const n = K.length; while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && P[c + 1] < P[c]) c++; if (P[c] >= lp) break; K[i] = K[c]; P[i] = P[c]; i = c; } K[i] = lk; P[i] = lp; }
    return top;
  }
}

function circleBox(x, z, r, s) {
  const cx = Math.max(s.min[0], Math.min(x, s.max[0])), cz = Math.max(s.min[2], Math.min(z, s.max[2]));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

function rayBox(o, d, s) {
  let tmin = -1e9, tmax = 1e9, nAxis = -1, nSign = 0;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-9) { if (O[a] < s.min[a] || O[a] > s.max[a]) return null; continue; }
    let t1 = (s.min[a] - O[a]) / D[a], t2 = (s.max[a] - O[a]) / D[a]; let sg = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sg = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sg; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const normal = [0, 0, 0]; if (nAxis >= 0) normal[nAxis] = nSign;
  if (tmin < 0) { return { t: 0, tOut: tmax, normal: [-D[0], -D[1], -D[2]], inside: true }; }
  return { t: tmin, tOut: tmax, normal };
}

// ---------- geometry helpers (world-space UVs) ----------
function quadY(x0, z0, x1, z1, y, sc) {
  const g = new THREE.BufferGeometry();
  const p = [x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0];
  const uv = [x0 / sc, -z0 / sc, x0 / sc, -z1 / sc, x1 / sc, -z1 / sc, x1 / sc, -z0 / sc];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function boxGeo(x0, y0, z0, x1, y1, z1, sc, o = {}) {
  const P = [], N = [], U = [], I = [];
  const face = (corners, n, uvf) => {
    const b = P.length / 3;
    for (const c of corners) { P.push(...c); N.push(...n); U.push(...uvf(c)); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const fit = o.uvFit;
  const W = x1 - x0, H = y1 - y0, D = z1 - z0;
  const ux = c => fit ? [(c[0] - x0) / W, (c[1] - y0) / H] : [c[0] / sc, c[1] / sc];
  const uz = c => fit ? [(c[2] - z0) / D, (c[1] - y0) / H] : [c[2] / sc, c[1] / sc];
  const uy = c => [c[0] / sc, c[2] / sc];
  // +z
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], ux);
  // -z
  face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c => { const u = ux(c); return [fit ? 1 - u[0] : -u[0], u[1]]; });
  // +x
  face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c => { const u = uz(c); return [fit ? 1 - u[0] : -u[0], u[1]]; });
  // -x
  face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], uz);
  if (o.top !== false) face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], uy);
  if (o.bottom) face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], uy);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

function frame(cx, cz, nx, nz, hw, h, t, y0 = 0) {
  // three-sided frame around an opening on a wall facing (nx,nz)
  const gs = [];
  const along = nx === 0; const off = 0.12;
  const mk = (a0, a1, yA, yB) => {
    if (along) { const z0 = cz, z1 = cz + off * nz; gs.push(boxGeo(cx + a0, yA, Math.min(z0, z1), cx + a1, yB, Math.max(z0, z1), 2, {})); }
    else { const x0 = cx, x1 = cx + off * nx; gs.push(boxGeo(Math.min(x0, x1), yA, cz + a0, Math.max(x0, x1), yB, cz + a1, 2, {})); }
  };
  mk(-hw - t, -hw, y0, y0 + h + t); mk(hw, hw + t, y0, y0 + h + t); mk(-hw - t, hw + t, y0 + h, y0 + h + t);
  return mergeGeometries(gs);
}
