/* ---------- 南沙群岛: the reefs, atolls and islands of the theatre ----------
   Real Spratly features placed by their real relative positions (longitude / latitude compressed to the game's
   1:5 theatre scale, 1° ≈ 22 km), each drawn at its real size:
   - atolls: a ring of reef flat (awash at low tide) around a turquoise lagoon, surf breaking on the outer rim;
     cays and vegetated islands sit on the rim (郑和群礁 with 太平岛, 敦谦沙洲, 鸿庥岛; 美济礁; 渚碧礁; 弹丸礁)
   - reef platforms: small reefs with a sand cay or a vegetated island (中业岛, 南威岛, 南薰礁, 赤瓜礁, 华阳礁)
   - the artificial island: 永暑礁, a 3 km runway on reclaimed coral with a harbour basin, hangars and radomes
   The water shader colours the sea by this bathymetry; terrainH() uses it for grounding, reef avoidance and flight.
   Inlined into navwar.js (shares its scope; THREE and mergeGeometries are imported there). */
const REEF_K = 22000, REEF_LON0 = 114.2, REEF_LAT0 = 10.0;
const ll = (lon, lat) => [(lon - REEF_LON0) * REEF_K, -(lat - REEF_LAT0) * REEF_K];
// shape types: 0 atoll ring (rim half-width w), 1 reef platform, 2 submerged bank
const REEFS = [
  { name: '永暑礁', at: ll(112.89, 9.55), rx: 3300, rz: 1300, rot: 0.42, type: 1, base: true },
  { name: '郑和群礁', at: ll(114.42, 10.38), rx: 9000, rz: 3300, rot: 0.22, type: 0, w: 260 },
  { name: '美济礁', at: ll(115.53, 9.9), rx: 4300, rz: 2900, rot: -0.3, type: 0, w: 220 },
  { name: '渚碧礁', at: ll(114.08, 10.92), rx: 2900, rz: 1900, rot: 0.6, type: 0, w: 200 },
  { name: '弹丸礁', at: ll(113.84, 7.38), rx: 3600, rz: 1000, rot: 0.35, type: 0, w: 180 },
  { name: '中业岛', at: ll(114.28, 11.05), rx: 1500, rz: 900, rot: 0.3, type: 1 },
  { name: '南威岛', at: ll(111.92, 8.64), rx: 900, rz: 600, rot: 0.1, type: 1 },
  { name: '南薰礁', at: ll(114.22, 10.21), rx: 700, rz: 450, rot: 0.8, type: 1 },
  { name: '赤瓜礁', at: ll(114.28, 9.72), rx: 1300, rz: 700, rot: -0.5, type: 1 },
  { name: '华阳礁', at: ll(112.86, 8.86), rx: 1700, rz: 600, rot: 0.9, type: 1 },
  { name: '九章群礁', at: ll(114.55, 9.85), rx: 7000, rz: 4000, rot: 0.4, type: 2 }
];
for (const F of REEFS) { F.x = F.at[0]; F.z = F.at[1]; F.c = Math.cos(F.rot); F.s = Math.sin(F.rot); F.R = Math.max(F.rx, F.rz) + 900; }
// land: islands and cays, each on its reef (local position on the feature, metres)
const REEF_LAND = [
  // 太平岛 on the north rim of 郑和群礁: the largest natural island of the group, wooded, with a short airstrip
  { name: '太平岛', on: '郑和群礁', u: -4200, v: -3000, rx: 690, rz: 200, rot: 0.05, h: 3.8, veg: 0.9, strip: true, light: true },
  { name: '敦谦沙洲', on: '郑和群礁', u: 2600, v: -3150, rx: 300, rz: 120, rot: -0.05, h: 2.6, veg: 0.6 },
  { name: '鸿庥岛', on: '郑和群礁', u: 1500, v: 3200, rx: 320, rz: 140, rot: 0.08, h: 3.0, veg: 0.8, light: true },
  { name: '中业岛', on: '中业岛', u: 200, v: 0, rx: 380, rz: 260, rot: 0.2, h: 3.4, veg: 0.85, strip: true },
  { name: '南威岛', on: '南威岛', u: 0, v: 0, rx: 330, rz: 180, rot: 0.1, h: 2.4, veg: 0.5, light: true },
  { name: '美济礁沙洲', on: '美济礁', u: 3900, v: 1000, rx: 140, rz: 60, rot: 0.9, h: 1.8, veg: 0 },
  { name: '弹丸礁沙洲', on: '弹丸礁', u: 2600, v: -450, rx: 420, rz: 110, rot: 0.1, h: 2.2, veg: 0.3 },
  { name: '南薰礁沙洲', on: '南薰礁', u: 0, v: 0, rx: 90, rz: 50, rot: 0, h: 1.6, veg: 0 }
];
for (const L of REEF_LAND) {
  const F = REEFS.find(f => f.name === L.on);
  L.x = F.x + L.u * F.c - L.v * F.s; L.z = F.z + L.u * F.s + L.v * F.c; L.rot = (L.rot || 0) + F.rot;
}
// the artificial island (永暑礁) in its own frame: runway along +x, the harbour basin cut into the east end
const BASE_REEF = REEFS[0];
const BASE_LAND = { name: '永暑礁', x: BASE_REEF.x + 300 * BASE_REEF.c, z: BASE_REEF.z + 300 * BASE_REEF.s, rot: BASE_REEF.rot, base: true, rx: 1800, rz: 520 };
function inBaseLand(lx, lz) {
  if (lx > -1700 && lx < 1650 && lz > -230 && lz < 130) return true;
  if (lx > 250 && lx < 1650 && lz >= 130 && lz < 560) return !(lx > 1050 && lz > 380 && lz < 500);
  return false;
}
// bathymetry / land height at (x, z): highest of every feature that reaches the point
function reefLocal(F, x, z) {
  const dx = x - F.x, dz = z - F.z;
  const u = dx * F.c + dz * F.s, v = -dx * F.s + dz * F.c;
  const e = Math.hypot(u / F.rx, v / F.rz), r = Math.hypot(u, v);
  return { u, v, e, sd: e > 1e-4 ? r * (e - 1) / e : -Math.min(F.rx, F.rz) };
}
const smoothR = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function reefH(x, z) {
  let h = -60;
  for (const F of REEFS) {
    if (Math.abs(x - F.x) > F.R || Math.abs(z - F.z) > F.R) continue;
    const L = reefLocal(F, x, z);
    let f;
    if (F.type === 0) {
      const dr = Math.abs(L.sd);
      if (dr < F.w) f = -0.6;
      else if (L.sd < 0) f = -0.6 + (-18 + 0.6) * smoothR(F.w, F.w + 280, dr);
      else f = -0.6 + (-60 + 0.6) * smoothR(F.w, F.w + 520, dr);
    } else if (F.type === 1) f = L.sd < 0 ? -0.8 : -0.8 + (-60 + 0.8) * smoothR(0, 460, L.sd);
    else f = L.sd < 0 ? -24 : -24 + (-60 + 24) * smoothR(0, 1500, L.sd);
    if (f > h) h = f;
  }
  for (const I of REEF_LAND) {
    const dx = x - I.x, dz = z - I.z; if (Math.abs(dx) > I.rx * 1.2 || Math.abs(dz) > I.rx * 1.2) continue;
    const c = Math.cos(I.rot), s = Math.sin(I.rot), e = Math.hypot((dx * c + dz * s) / I.rx, (-dx * s + dz * c) / I.rz);
    if (e < 1.08) h = Math.max(h, e < 1 ? I.h * (1 - smoothR(0.55, 1, e)) + 0.4 * (1 - e) : -0.6);
  }
  {
    const I = BASE_LAND, dx = x - I.x, dz = z - I.z;
    if (Math.abs(dx) < 2200 && Math.abs(dz) < 2200) { const c = Math.cos(I.rot), s = Math.sin(I.rot); if (inBaseLand(dx * c + dz * s, -dx * s + dz * c)) h = Math.max(h, 4.2); }
  }
  return h;
}
// the shader takes the eight features nearest the camera
const REEF_GPU = REEFS.map(F => ({ F, a: new THREE.Vector4(F.x, F.z, F.rx, F.rz), b: new THREE.Vector4(F.rot, F.w || 0, F.type, 0) }));

/* ---------- land meshes: islands with beaches and woods, cays, palms; the artificial island base ---------- */
function reefNoise(x, z) { return Math.sin(x * 0.013 + Math.sin(z * 0.011) * 2.1) * 0.5 + Math.sin(z * 0.021 - x * 0.007) * 0.3 + Math.sin((x + z) * 0.047) * 0.2; }
function islandGeometry(I) {
  // concentric rings of an ellipse: wooded interior, sand beach, a shelf running under the water
  const rings = 14, segs = 64, pos = [], col = [], idx = [];
  const sand = new THREE.Color(0xd9cba4), wet = new THREE.Color(0xa99f80), wood = new THREE.Color(0x2c4a1e), wood2 = new THREE.Color(0x46612a), tmp = new THREE.Color();
  const c = Math.cos(I.rot), s = Math.sin(I.rot);
  pos.push(0, I.h + 0.4, 0); col.push(...wood.toArray());
  for (let r = 1; r <= rings; r++) {
    const e = r / rings * 1.1;
    for (let k = 0; k < segs; k++) {
      const a = k / segs * Math.PI * 2, wob = 1 + 0.05 * Math.sin(a * 3 + I.rx * 0.01) + 0.03 * Math.sin(a * 7 + I.rz * 0.02);
      const u = Math.cos(a) * I.rx * e * wob, v = Math.sin(a) * I.rz * e * wob;
      const y = e < 1 ? I.h * (1 - smoothR(0.55, 1, e)) + 0.4 * (1 - e) : -0.6 - (e - 1) * 12;
      pos.push(u * c - v * s, y, u * s + v * c);
      const veg = I.veg && e < 0.78 - 0.1 * reefNoise(u, v) ? I.veg : 0;
      if (veg) tmp.copy(wood).lerp(wood2, 0.5 + 0.5 * reefNoise(u * 3, v * 3)); else if (e > 0.93) tmp.copy(wet); else tmp.copy(sand).offsetHSL(0, 0, 0.03 * reefNoise(u * 5, v * 5));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let k = 0; k < segs; k++) idx.push(0, 1 + (k + 1) % segs, 1 + k);
  for (let r = 1; r < rings; r++) for (let k = 0; k < segs; k++) {
    const a = 1 + (r - 1) * segs + k, b = 1 + (r - 1) * segs + (k + 1) % segs, cc = 1 + r * segs + k, d = 1 + r * segs + (k + 1) % segs;
    idx.push(a, b, d, a, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function palmGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 9, 5); trunk.translate(0, 4.5, 0); trunk.rotateZ(0.12);
  const parts = [trunk];
  for (let i = 0; i < 6; i++) { const f = new THREE.ConeGeometry(0.7, 5.2, 3); f.rotateZ(Math.PI / 2 + 0.35); f.translate(2.3, 9.2, 0); f.rotateY(i / 6 * Math.PI * 2); parts.push(f); }
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i), leaf = y > 8.3; col.set(leaf ? [0.16, 0.33, 0.1] : [0.38, 0.3, 0.2], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function buildReefLand(scene) {
  const group = new THREE.Group();
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 }), red = new THREE.MeshStandardMaterial({ color: 0xb8352e, roughness: 0.6 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.8 }), asphalt = new THREE.MeshStandardMaterial({ color: 0x45484a, roughness: 0.9 });
  const trees = [], lights = [], blocks = [], strips = [];
  for (const I of REEF_LAND) {
    const m = new THREE.Mesh(islandGeometry(I), landMat); m.position.set(I.x, 0, I.z); m.receiveShadow = true; group.add(m);
    if (I.veg) {
      const n = Math.round(I.rx * I.rz * 0.0009 * I.veg) + 6;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, e = Math.sqrt(Math.random()) * 0.82;
        const u = Math.cos(a) * I.rx * e, v = Math.sin(a) * I.rz * e, c = Math.cos(I.rot), s = Math.sin(I.rot);
        trees.push([I.x + u * c - v * s, Math.max(0.6, reefH(I.x + u * c - v * s, I.z + u * s + v * c)), I.z + u * s + v * c, 0.7 + Math.random() * 0.6, Math.random() * 6.3]);
      }
    }
    const c = Math.cos(I.rot), s = Math.sin(I.rot), at = (u, v) => [I.x + u * c - v * s, I.z + u * s + v * c];
    if (I.strip) { const [x, z] = at(0, I.rz * 0.15); strips.push([x, z, I.rx * 1.7, 30, I.rot, I.h + 0.05]); }
    if (I.light) { const [x, z] = at(I.rx * 0.8, 0); lights.push([x, Math.max(1, reefH(x, z)), z]); }
    if (I.strip) for (let k = 0; k < 5; k++) { const [x, z] = at(-I.rx * 0.4 + k * 60, -I.rz * 0.45); blocks.push([x, I.h, z, I.rot]); }
  }
  // palms: one instanced mesh for the whole theatre
  if (trees.length) {
    const im = new THREE.InstancedMesh(palmGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), trees.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    trees.forEach(([x, y, z, k, a], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); sc.setScalar(k); p.set(x, y, z); M.compose(p, q, sc); im.setMatrixAt(i, M); });
    im.castShadow = true; group.add(im);
  }
  Object.assign(asphalt, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  for (const [x, z, len, w, rot, y] of strips) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), asphalt); m.rotation.set(-Math.PI / 2, 0, -rot); m.position.set(x, y + 0.3, z); group.add(m); }
  for (const [x, y, z] of lights) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 22, 10), white); t.position.set(x, y + 11, z); t.castShadow = true; group.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 3.5, 10), red); h.position.set(x, y + 23.5, z); group.add(h);
  }
  for (const [x, y, z, rot] of blocks) { const b = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 16), white); b.position.set(x, y + 3.5, z); b.rotation.y = -rot; b.castShadow = true; group.add(b); const r = new THREE.Mesh(new THREE.BoxGeometry(35, 0.6, 17), roof); r.position.set(x, y + 7.3, z); r.rotation.y = -rot; group.add(r); }
  scene.add(group);
  return group;
}
// 永暑礁: reclaimed coral with sea walls, a 3 km runway and parallel taxiway, aprons, hardened shelters, a harbour
// basin with piers, radomes and a radar tower, an HQ-9 battery, close-in weapon towers, a lighthouse
function runwayTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#3d4043'; g.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 1024, Math.random() * 64, 2, 2); }
  g.fillStyle = '#e9e9e4';
  g.fillRect(0, 2, 1024, 1.2); g.fillRect(0, 60.8, 1024, 1.2);
  for (let x = 40; x < 984; x += 26) g.fillRect(x, 31, 13, 1.4);
  for (const x0 of [6, 1000]) for (let k = 0; k < 8; k++) g.fillRect(x0 + (x0 > 500 ? -18 : 0), 6 + k * 6.5, 18, 3.6);
  for (const x0 of [120, 880]) { g.fillRect(x0, 18, 22, 6); g.fillRect(x0, 40, 22, 6); }
  g.fillStyle = 'rgba(20,20,20,0.35)'; for (const x0 of [60, 940]) g.fillRect(x0 - 40, 10, 80, 44);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function buildBaseIsland(g) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xbdb8a8, roughness: 0.95 }), wall = new THREE.MeshStandardMaterial({ color: 0x8f8b80, roughness: 0.9 });
  const sandM = new THREE.MeshStandardMaterial({ color: 0xd7cba6, roughness: 1 });
  // the land: the outline with the harbour notch, extruded from below the waterline, sea walls on the sides
  const sh = new THREE.Shape();
  const P = [[-1700, -230], [1500, -230], [1650, -150], [1650, 380], [1050, 380], [1050, 500], [1650, 500], [1650, 560], [400, 560], [250, 130], [-1600, 130], [-1700, 60]];
  P.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z));
  const land = new THREE.ExtrudeGeometry(sh, { depth: 7.2, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 6, bevelSegments: 1, steps: 1 });
  land.rotateX(-Math.PI / 2); land.translate(0, -4.2, 0);   // top face (with the bevel) at 4.2 m
  const lm = new THREE.Mesh(land, [sandM, wall]); lm.receiveShadow = true; g.add(lm);
  // the reef platform around it, awash
  // surface layers sit just above the fill and are pulled forward in depth, so they never fight the land surface
  // for the depth buffer when seen from kilometres away
  const decal = m => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const flatTop = (w, d, x, z, m, y = 4.4) => { decal(m); const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.receiveShadow = true; g.add(o); return o; };
  const rw = new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.9 });
  flatTop(3000, 55, 50, -120, rw, 4.5);
  const asph = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.9 });
  flatTop(2700, 24, 100, 40, asph);
  for (const x of [-900, -100, 700]) flatTop(24, 140, x, -30, asph);
  flatTop(800, 210, 820, 260, concrete.clone(), 4.42);
  flatTop(380, 150, -400, 92, concrete.clone(), 4.42);
  const white = new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: 0.75 }), grey = new THREE.MeshStandardMaterial({ color: 0x9da09e, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.7 }), green = new THREE.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 1 });
  const solar = new THREE.MeshStandardMaterial({ color: 0x1d2b46, roughness: 0.25, metalness: 0.4 });
  const parts = new Map();
  const put = (geo, mat, x, y, z, ry = 0) => { geo = geo.clone(); geo.rotateY(ry); geo.translate(x, y, z); if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  // hardened aircraft shelters along the north edge of the taxiway (half cylinders, door to the taxiway)
  const shelter = new THREE.CylinderGeometry(13, 13, 34, 14, 1, false, 0, Math.PI); shelter.rotateZ(Math.PI / 2); shelter.rotateY(Math.PI / 2);
  for (let i = 0; i < 14; i++) put(shelter, grey, -1350 + i * 48, 4.2, 96);
  // hangars and support buildings in the east block
  for (let i = 0; i < 4; i++) put(new THREE.BoxGeometry(70, 20, 50), white, 520 + i * 85, 14, 200);
  for (let i = 0; i < 6; i++) put(new THREE.BoxGeometry(40, 14, 22), white, 480 + (i % 3) * 60, 11, 330 + Math.floor(i / 3) * 40);
  put(new THREE.BoxGeometry(30, 32, 30), white, 330, 20, 300);                              // control tower block
  put(new THREE.BoxGeometry(16, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a3a48, roughness: 0.2, metalness: 0.5 }), 330, 39, 300);
  // radomes on towers, the radar tower, the HF array
  const dome = new THREE.SphereGeometry(14, 18, 12);
  for (const [x, z] of [[760, 420], [880, 520], [1180, 540], [620, 520]]) { put(new THREE.CylinderGeometry(9, 11, 22, 10), white, x, 15, z); put(dome, white, x, 34, z); }
  put(new THREE.CylinderGeometry(3, 5, 60, 8), grey, 1450, 34, 300); put(new THREE.BoxGeometry(14, 3, 6), dark, 1450, 66, 300);
  for (let i = 0; i < 12; i++) put(new THREE.CylinderGeometry(0.5, 0.5, 26, 4), grey, 1200 + (i % 6) * 22, 17, 230 + Math.floor(i / 6) * 22);
  // HQ-9 battery, close-in weapon towers at the corners
  for (let i = 0; i < 6; i++) { const l = new THREE.BoxGeometry(11, 3, 3); l.rotateZ(0.9); put(l, dark, -1200 + (i % 3) * 26, 9, 10 + Math.floor(i / 3) * 24); }
  for (const [x, z] of [[-1660, -200], [-1660, 90], [1600, -180], [1600, 540]]) { put(new THREE.CylinderGeometry(5, 6, 14, 8), grey, x, 11, z); put(new THREE.CylinderGeometry(2, 2.6, 4, 8), white, x, 20, z); }
  // solar fields, fuel tanks, planted trees
  for (let i = 0; i < 10; i++) put(new THREE.BoxGeometry(40, 0.8, 18), solar, -1500 + i * 46, 5.2, -205);
  for (let i = 0; i < 4; i++) put(new THREE.CylinderGeometry(11, 11, 12, 16), white, 1150 + i * 30, 10, 140);
  for (let i = 0; i < 60; i++) put(new THREE.IcosahedronGeometry(3.2, 0), green, -1550 + Math.random() * 3000, 6.5, 118 + Math.random() * 8);
  // the harbour: piers into the basin, a lighthouse on the breakwater
  for (let i = 0; i < 3; i++) put(new THREE.BoxGeometry(14, 2, 90), concrete, 1150 + i * 140, 3.4, 440);
  put(new THREE.CylinderGeometry(2.4, 3.2, 26, 10), white, 1640, 17, 530); put(new THREE.CylinderGeometry(3, 3, 4, 10), new THREE.MeshStandardMaterial({ color: 0xb8352e }), 1640, 32, 530);
  for (const [mat, list] of parts) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}
// ambient traffic: fishing boats clustered at the reefs (the trawler fleets that ride out on the banks) and a few
// merchant ships on the lanes; scenery only, not part of the battle picture
function buildAmbient(scene) {
  const hullG = (() => {
    const s = new THREE.Shape(); s.moveTo(-1, -0.5); s.lineTo(0.7, -0.5); s.lineTo(1, 0); s.lineTo(0.7, 0.5); s.lineTo(-1, 0.5); s.lineTo(-1, -0.5);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0); return g;
  })();
  const parts = (L, B, H, cab, col, cabCol) => {
    const h = hullG.clone(); h.scale(L / 2, H, B); const c = new THREE.BoxGeometry(L * cab, H * 1.6, B * 0.7); c.translate(-L * 0.18, H * 1.6, 0);
    const ni = x => x.index ? x.toNonIndexed() : x, hN = ni(h);
    const g = mergeGeometries([hN, ni(c)]);
    const n = g.attributes.position.count, cc = new Float32Array(n * 3), hn = hN.attributes.position.count;
    for (let i = 0; i < n; i++) cc.set(i < hn ? col : cabCol, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return g;
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const kinds = [{ g: parts(38, 7, 3, 0.3, [0.85, 0.86, 0.85], [0.2, 0.36, 0.62]), n: 0, list: [] }, { g: parts(52, 9, 3.5, 0.25, [0.7, 0.22, 0.18], [0.92, 0.92, 0.9]), n: 0, list: [] }, { g: parts(190, 30, 9, 0.12, [0.16, 0.2, 0.26], [0.9, 0.9, 0.88]), n: 0, list: [] }];
  const fleets = [['九章群礁', 14], ['美济礁', 8], ['永暑礁', 5], ['郑和群礁', 7], ['渚碧礁', 6]];
  for (const [name, n] of fleets) {
    const F = REEFS.find(f => f.name === name);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = (F.type === 2 ? 0.5 : 1.15) + Math.random() * 0.5;
      const u = Math.cos(a) * F.rx * r, v = Math.sin(a) * F.rz * r;
      const x = F.x + u * F.c - v * F.s, z = F.z + u * F.s + v * F.c;
      if (reefH(x, z) > -10) continue;
      kinds[Math.random() < 0.7 ? 0 : 1].list.push([x, z, Math.random() * 6.3]);
    }
  }
  // merchant traffic on the lanes north and south of the reefs
  for (let i = 0; i < 6; i++) kinds[2].list.push([-90000 + i * 34000 + Math.random() * 8000, (i % 2 ? -1 : 1) * (52000 + Math.random() * 9000), i % 2 ? 0.08 : Math.PI + 0.08]);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const k of kinds) {
    if (!k.list.length) continue;
    const im = new THREE.InstancedMesh(k.g, mat, k.list.length);
    k.list.forEach(([x, z, h], i) => { q.setFromAxisAngle(Y, h); p.set(x, -0.6, z); M.compose(p, q, one); im.setMatrixAt(i, M); });
    im.castShadow = true; scene.add(im);
  }
}
