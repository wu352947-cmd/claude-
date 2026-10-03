// 关卡几何：把字符网格变成墙、地、顶、水银渠，并提供碰撞、视线与寻路
import * as THREE from 'three';

export const S = 2; // 每格 2 米

class Quads {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  // 四个点（任意绕序）+ 期望法线；uv 与颜色一一对应
  quad(pts, n, uvs, cols) {
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    let order = [0, 1, 2, 3];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) order = [0, 3, 2, 1];
    const base = this.p.length / 3;
    for (const k of order) {
      this.p.push(...pts[k]); this.n.push(...n); this.uv.push(...uvs[k]);
      const col = cols ? cols[k] : 1; this.c.push(col, col, col);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.i.length === 0; }
}

const AO = [1, 0.74, 0.58, 0.5, 0.45];

export class World {
  constructor(def, mats) {
    this.def = def; this.mats = mats;
    const rows = def.map;
    this.h = rows.length; this.w = Math.max(...rows.map(r => r.length));
    const N = this.w * this.h;
    this.kind = new Uint8Array(N);   // 0 地面 1 墙 2 水银 3 桥
    this.block = new Uint8Array(N);  // 动态阻挡（移动）
    this.opaque = new Uint8Array(N); // 阻挡视线
    this.spots = {};
    this.obstacles = [];
    this.bridgeId = new Int8Array(N).fill(-1);
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const ch = rows[z][x] ?? '#', i = z * this.w + x;
      if (ch === '#' || ch === ' ') { this.kind[i] = 1; this.block[i] = 1; this.opaque[i] = 1; continue; }
      if (def.wallSpots?.includes(ch)) { this.kind[i] = 1; this.block[i] = 1; this.opaque[i] = 1; (this.spots[ch] ||= []).push(this.cell(x, z)); continue; }
      if (ch === '~') { this.kind[i] = 2; this.block[i] = 1; continue; }
      if (ch >= '1' && ch <= '9') { this.kind[i] = 3; this.block[i] = 1; this.bridgeId[i] = +ch; (this.spots[ch] ||= []).push(this.cell(x, z)); continue; }
      if (ch !== '.') (this.spots[ch] ||= []).push(this.cell(x, z));
    }
    this.group = new THREE.Group();
    this.build();
  }

  cell(cx, cz) { return { cx, cz, x: cx * S + S / 2, z: cz * S + S / 2 }; }
  idx(cx, cz) { return cz * this.w + cx; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  isWall(cx, cz) { return !this.inside(cx, cz) || this.kind[this.idx(cx, cz)] === 1; }
  isBlocked(cx, cz) { return !this.inside(cx, cz) || this.block[this.idx(cx, cz)] === 1; }
  isOpaque(cx, cz) { return !this.inside(cx, cz) || this.opaque[this.idx(cx, cz)] === 1; }
  setBlock(cx, cz, v, opaque = v) { const i = this.idx(cx, cz); this.block[i] = v ? 1 : 0; this.opaque[i] = opaque ? 1 : 0; this.flowCache = null; }
  cellOf(x, z) { return [Math.floor(x / S), Math.floor(z / S)]; }

  material(name) {
    this._mc ||= {};
    if (!this._mc[name]) { const m = this.mats[name].clone(); m.vertexColors = true; this._mc[name] = m; }
    return this._mc[name];
  }

  build() {
    const t = this.def.theme, H = t.height, tile = t.tile || 2;
    const floor = new Quads(), ceil = new Quads(), wall = new Quads(), chan = new Quads(), merc = new Quads();
    const solidN = (x, z) => (this.isWall(x, z) ? 1 : 0);
    const cornerAO = (gx, gz) => AO[solidN(gx - 1, gz - 1) + solidN(gx, gz - 1) + solidN(gx - 1, gz) + solidN(gx, gz)];
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const k = this.kind[this.idx(cx, cz)];
      const x0 = cx * S, x1 = x0 + S, z0 = cz * S, z1 = z0 + S;
      if (k === 1) {
        // 朝向相邻非墙格子的墙面
        const sides = [[1, 0, x1, z0, x1, z1], [-1, 0, x0, z1, x0, z0], [0, 1, x1, z1, x0, z1], [0, -1, x0, z0, x1, z0]];
        for (const [dx, dz, ax, az, bx, bz] of sides) {
          if (this.isWall(cx + dx, cz + dz)) continue;
          const nk = this.kind[this.idx(cx + dx, cz + dz)];
          const yb = nk >= 2 ? -0.9 : 0;
          const n = [dx, 0, dz];
          const ua = (dx !== 0 ? az : ax) / tile, ub = (dx !== 0 ? bz : bx) / tile;
          const ys = [yb, Math.min(0.7, H * 0.3), H - 0.6, H], cs = [0.42, 1, 1, H > 5 ? 0.9 : 0.65];
          for (let s = 0; s < 3; s++) {
            wall.quad([[ax, ys[s], az], [bx, ys[s], bz], [bx, ys[s + 1], bz], [ax, ys[s + 1], az]], n,
              [[ua, ys[s] / tile], [ub, ys[s] / tile], [ub, ys[s + 1] / tile], [ua, ys[s + 1] / tile]], [cs[s], cs[s], cs[s + 1], cs[s + 1]]);
          }
        }
        continue;
      }
      const ao = [cornerAO(cx, cz), cornerAO(cx, cz + 1), cornerAO(cx + 1, cz + 1), cornerAO(cx + 1, cz)];
      const ft = t.floorTile || tile;
      if (k === 0) {
        floor.quad([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], [0, 1, 0],
          [[x0 / ft, z0 / ft], [x0 / ft, z1 / ft], [x1 / ft, z1 / ft], [x1 / ft, z0 / ft]], ao);
      } else {
        merc.quad([[x0, -0.28, z0], [x0, -0.28, z1], [x1, -0.28, z1], [x1, -0.28, z0]], [0, 1, 0],
          [[x0 / 6, z0 / 6], [x0 / 6, z1 / 6], [x1 / 6, z1 / 6], [x1 / 6, z0 / 6]]);
        // 渠壁
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (this.isWall(nx, nz) || this.kind[this.idx(nx, nz)] >= 2) continue;
          const ex = dx === 1 ? x1 : dx === -1 ? x0 : null, ez = dz === 1 ? z1 : dz === -1 ? z0 : null;
          const pa = ex !== null ? [ex, z0] : [x0, ez], pb = ex !== null ? [ex, z1] : [x1, ez];
          const u0 = (ex !== null ? pa[1] : pa[0]) / 2, u1 = (ex !== null ? pb[1] : pb[0]) / 2;
          chan.quad([[pa[0], -0.9, pa[1]], [pb[0], -0.9, pb[1]], [pb[0], 0, pb[1]], [pa[0], 0, pa[1]]], [-dx, 0, -dz],
            [[u0, 0], [u1, 0], [u1, 0.45], [u0, 0.45]], [0.4, 0.4, 0.9, 0.9]);
          // 渠沿的青铜包边
          chan.quad([[pa[0], 0.02, pa[1]], [pb[0], 0.02, pb[1]], [pb[0] - dx * 0.12, 0.02, pb[1] - dz * 0.12], [pa[0] - dx * 0.12, 0.02, pa[1] - dz * 0.12]], [0, 1, 0],
            [[u0, 0], [u1, 0], [u1, 0.06], [u0, 0.06]], [1, 1, 1, 1]);
        }
      }
      if (t.ceil) {
        ceil.quad([[x0, H, z0], [x0, H, z1], [x1, H, z1], [x1, H, z0]], [0, -1, 0],
          [[x0 / tile, z0 / tile], [x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile]], ao.map(a => a * 0.85));
      }
    }
    const add = (q, mat, cast = false) => {
      if (q.empty) return null;
      const m = new THREE.Mesh(q.geometry(), mat);
      m.receiveShadow = true; m.castShadow = cast; m.matrixAutoUpdate = false;
      this.group.add(m); return m;
    };
    add(floor, this.material(t.floor));
    add(wall, this.material(t.wall), true);
    if (t.ceil) add(ceil, this.material(t.ceil));
    add(chan, this.material(t.channel || 'stone'));
    if (!merc.empty) {
      const T = this.mats._T;
      this.mercuryMat = new THREE.MeshStandardMaterial({
        color: 0xc9ced6, metalness: 1, roughness: 0.06, normalMap: T.mercury, normalScale: new THREE.Vector2(0.25, 0.25)
      });
      this.mercury = add(merc, this.mercuryMat);
      this.mercury.receiveShadow = false;
    }
  }

  // ---------------- 碰撞 ----------------
  collide(p, r) {
    for (let iter = 0; iter < 2; iter++) {
      const cx0 = Math.floor((p.x - r) / S), cx1 = Math.floor((p.x + r) / S);
      const cz0 = Math.floor((p.z - r) / S), cz1 = Math.floor((p.z + r) / S);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.isBlocked(cx, cz)) continue;
        const nx = Math.max(cx * S, Math.min(p.x, cx * S + S)), nz = Math.max(cz * S, Math.min(p.z, cz * S + S));
        let dx = p.x - nx, dz = p.z - nz; const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-5) { dx = p.x - (cx * S + S / 2); dz = p.z - (cz * S + S / 2); const l = Math.hypot(dx, dz) || 1; p.x += dx / l * r; p.z += dz / l * r; }
          else { p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
        }
      }
      for (const o of this.obstacles) {
        if (o.off) continue;
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = r + o.r;
        if (d < m && d > 1e-5) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
      }
    }
  }

  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.3);
    for (let i = 1; i < n; i++) {
      const t = i / n, [cx, cz] = this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      if (this.isOpaque(cx, cz)) return false;
    }
    return true;
  }

  // 沿方向前进到撞墙的距离（机弩箭矢用）
  rayDist(x, z, dx, dz, max = 40) {
    for (let s = 0.1; s < max; s += 0.1) {
      const [cx, cz] = this.cellOf(x + dx * s, z + dz * s);
      if (this.isOpaque(cx, cz)) return s;
    }
    return max;
  }

  // 广度优先距离场，敌人沿梯度追踪玩家
  flow(tcx, tcz) {
    const key = tcx + ',' + tcz;
    if (this.flowCache && this.flowKey === key) return this.flowCache;
    const N = this.w * this.h, dist = new Int16Array(N).fill(-1), q = new Int32Array(N);
    let h = 0, t = 0;
    if (!this.inside(tcx, tcz)) return dist;
    dist[this.idx(tcx, tcz)] = 0; q[t++] = this.idx(tcx, tcz);
    while (h < t) {
      const i = q[h++], x = i % this.w, z = (i / this.w) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!this.inside(nx, nz)) continue;
        const j = this.idx(nx, nz);
        if (dist[j] >= 0 || this.block[j]) continue;
        dist[j] = dist[i] + 1; q[t++] = j;
      }
    }
    this.flowCache = dist; this.flowKey = key;
    return dist;
  }

  // 下一步该去的格子中心
  nextStep(x, z, dist) {
    const [cx, cz] = this.cellOf(x, z);
    const here = this.inside(cx, cz) ? dist[this.idx(cx, cz)] : -1;
    let best = null, bd = here < 0 ? 1e9 : here;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (!this.inside(nx, nz)) continue;
      const d = dist[this.idx(nx, nz)];
      if (d >= 0 && d < bd) { bd = d; best = [nx, nz]; }
    }
    if (!best) return null;
    return { x: best[0] * S + S / 2, z: best[1] * S + S / 2, d: bd };
  }

  randomFloor(r = Math.random) {
    for (let k = 0; k < 500; k++) {
      const cx = (r() * this.w) | 0, cz = (r() * this.h) | 0;
      if (!this.isBlocked(cx, cz)) return this.cell(cx, cz);
    }
    return null;
  }

  dispose() {
    this.group.traverse(o => { o.geometry?.dispose(); });
    for (const m of Object.values(this._mc || {})) m.dispose();
    this.mercuryMat?.dispose();
  }
}
