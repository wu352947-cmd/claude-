// Act VI 铁 — the city: low dusk roofs that crystallise into a night skyscraper city
// (instanced tiers with a window-grid shader), searchlights, aviation beacons, traffic,
// and in the after-world the same towers dissolving into ash.
import { COMMON, GLSL } from './iron_common.js';

// ---- integer-hash value noise, identical in JS and GLSL (used to sync mesh dissolve ↔ ash release) ----
function ihash(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
const sm = t => t * t * (3 - 2 * t);
export function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(ihash(ix, iy, iz), ihash(ix + 1, iy, iz), fx), L(ihash(ix, iy + 1, iz), ihash(ix + 1, iy + 1, iz), fx), fy),
    L(L(ihash(ix, iy, iz + 1), ihash(ix + 1, iy, iz + 1), fx), L(ihash(ix, iy + 1, iz + 1), ihash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
const VNOISE_GLSL = /* glsl */`
float ihash(ivec3 c){
  uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u + uint(c.z) * 1274126177u;
  h = (h ^ (h >> 13u)) * 1103515245u;
  h = h ^ (h >> 16u);
  return float(h) / 4294967296.0;
}
float vnoise(vec3 p){
  vec3 i = floor(p); vec3 f = p - i; f = f * f * (3.0 - 2.0 * f);
  ivec3 c = ivec3(i);
  return mix(mix(mix(ihash(c), ihash(c + ivec3(1,0,0)), f.x), mix(ihash(c + ivec3(0,1,0)), ihash(c + ivec3(1,1,0)), f.x), f.y),
             mix(mix(ihash(c + ivec3(0,0,1)), ihash(c + ivec3(1,0,1)), f.x), mix(ihash(c + ivec3(0,1,1)), ihash(c + ivec3(1,1,1)), f.x), f.y), f.z);
}
`;
// Dissolve time (in warped after-world time τ) of a point on a building.
export function dissolveAt(x, y, z) {
  const sweep = Math.min(Math.max((x + 260) / 560, 0), 1);
  return 1.5 + sweep * 3.0 + (1 - Math.min(y / 240, 1)) * 0.9 + 0.35 * vnoise(x * 0.12, y * 0.12, z * 0.12) + 0.22 * vnoise(x * 0.7 + 7.1, y * 0.7, z * 0.7);
}
export const DISSOLVE_GLSL = VNOISE_GLSL + /* glsl */`
float dissolveAt(vec3 p){
  float sweep = clamp((p.x + 260.0) / 560.0, 0.0, 1.0);
  return 1.5 + sweep * 3.0 + (1.0 - min(p.y / 240.0, 1.0)) * 0.9 + 0.35 * vnoise(p * 0.12) + 0.22 * vnoise(p * 0.7 + vec3(7.1, 0.0, 0.0));
}
`;

export const SPIRE = { x: 62, z: -118, h: 212, needle: 252 };

function layout(rand) {
  const B = [];   // buildings: {x,z,fx,fz,h,tiers:[{y0,th,sx,sz}],crown,seed,...}
  const PX = 34, PZ = 66;
  for (let bx = -14; bx <= 14; bx++) for (let bz = -16; bz <= 3; bz++) {
    const cx = bx * PX, cz = bz * PZ;
    if (Math.abs(cx) < 70 && cz > -80 && cz < 260) continue;    // the Champ de Mars around the iron tower
    const lotsX = 2, lotsZ = 3;
    const lw = (PX - 8) / lotsX, ld = (PZ - 8) / lotsZ;
    for (let i = 0; i < lotsX; i++) for (let j = 0; j < lotsZ; j++) {
      if (rand() < 0.07) continue;
      const x = cx - (PX - 8) / 2 + lw * (i + 0.5), z = cz - (PZ - 8) / 2 + ld * (j + 0.5);
      B.push({ x, z, fx: lw - 0.8 - rand() * 1.6, fz: ld - 0.8 - rand() * 2.0, seed: rand() });
    }
  }
  // heights: two downtown clusters
  let spireIdx = -1, best = 1e9;
  for (const b of B) {
    const d1 = Math.hypot(b.x - SPIRE.x, b.z - SPIRE.z), d2 = Math.hypot(b.x + 170, b.z + 470), d3 = Math.hypot(b.x - 230, b.z + 650);
    const r = rand();
    let h = 9 + 18 * r * r;
    h += 150 * Math.exp(-((d1 / 190) ** 2)) * (0.25 + 0.75 * Math.pow(rand(), 1.6));
    h += 165 * Math.exp(-((d2 / 210) ** 2)) * (0.2 + 0.8 * Math.pow(rand(), 1.8));
    h += 110 * Math.exp(-((d3 / 200) ** 2)) * (0.2 + 0.8 * Math.pow(rand(), 1.8));
    if (rand() < 0.04) h += 60 * rand();
    b.h = Math.min(h, 168);
    if (d1 < best) { best = d1; spireIdx = B.indexOf(b); }
  }
  // the tallest tower: the art-deco spire
  const S = B[spireIdx];
  S.x = SPIRE.x; S.z = SPIRE.z; S.fx = 24; S.fz = 24; S.h = SPIRE.h; S.spire = true;
  // clear neighbours that would intersect it
  for (const b of B) if (b !== S && Math.hypot(b.x - S.x, b.z - S.z) < 50) b.h = -1;
  for (const b of B) if (b !== S && Math.abs(b.x - S.x) < (b.fx + S.fx) / 2 + 2 && Math.abs(b.z - S.z) < (b.fz + S.fz) / 2 + 2) b.h = -1;
  return B.filter(b => b.h > 0);
}

export function buildCity(THREE, U, rand) {
  const B = layout(rand);
  const tiers = [], pyr = [], beacons = [];
  B.forEach((b, bi) => {
    const hP = Math.min(b.h, 6 + 4 * b.seed);        // the low Paris roofline of 1889
    let y = 0, sx = b.fx, sz = b.fz;
    const nT = b.spire ? 4 : b.h < 40 ? 1 : b.h < 80 ? 2 : b.h < 120 ? 3 : 4;
    const fr = nT === 1 ? [1] : nT === 2 ? [0.72, 0.28] : nT === 3 ? [0.55, 0.28, 0.17] : [0.5, 0.24, 0.15, 0.11];
    const flood = b.h > 95 || b.spire;
    for (let k = 0; k < nT; k++) {
      const th = b.h * fr[k];
      tiers.push({ b: bi, x: b.x, z: b.z, y0: y, th, sx, sz, top: k === nT - 1, flood: flood && k >= nT - 2 ? 1 : 0 });
      y += th;
      sx *= b.spire ? 0.8 : 0.72 + 0.12 * rand(); sz *= b.spire ? 0.8 : 0.72 + 0.12 * rand();
    }
    b.top = y;
    if (b.spire) {
      // stepped art-deco crown + needle
      let cy = y, w = sx;
      for (let k = 0; k < 4; k++) { const th = 5.5 - k; tiers.push({ b: bi, x: b.x, z: b.z, y0: cy, th, sx: w, sz: w, top: false, flood: 1, crown: 1 }); cy += th; w *= 0.78; }
      pyr.push({ b: bi, x: b.x, z: b.z, y0: cy, h: 14, w: w * 1.15 });
      pyr.push({ b: bi, x: b.x, z: b.z, y0: cy + 14, h: SPIRE.needle - cy - 14, w: 0.9 });
      b.top = SPIRE.needle;
      beacons.push({ b: bi, x: b.x, y: SPIRE.needle + 0.6, z: b.z, ph: 0.0 });
    } else if (b.h > 100 && rand() < 0.75) {
      const ph = 6 + rand() * 18;
      pyr.push({ b: bi, x: b.x, z: b.z, y0: y, h: ph, w: Math.min(sx, sz) * 0.92 });
      if (rand() < 0.6) { pyr.push({ b: bi, x: b.x, z: b.z, y0: y + ph * 0.9, h: 10 + rand() * 14, w: 0.6 }); b.top = y + ph * 0.9 + 10; }
      else b.top = y + ph;
    }
    if (b.h > 70 && !b.spire && rand() < 0.8) beacons.push({ b: bi, x: b.x, y: b.top + 1.0, z: b.z, ph: rand() });
    // growth window (I2 time-lapse, local seconds): the downtown core first, spire last-but-fast
    const d = Math.hypot(b.x - SPIRE.x, b.z - SPIRE.z);
    b.g0 = 8.4 + 1.6 * rand() + Math.min(d / 600, 1) * 1.2;
    b.g1 = b.g0 + 2.2 + 2.4 * rand() * (b.h / 168);
    if (b.spire) { b.g0 = 9.0; b.g1 = 12.4; }
    b.hP = hP;
    b.on = b.g0 + 0.3 + rand() * 2.5;     // window lights start switching on
    b.pat = Math.floor(rand() * 4);
  });

  // draw near-first (rough front-to-back for the I2 rise and the I3 view) to save fill
  tiers.sort((a, b) => Math.hypot(a.x - 20, a.z + 60) - Math.hypot(b.x - 20, b.z + 60));
  // ---- tiers (boxes) ----
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const n = tiers.length;
  const aSize = new Float32Array(n * 4), aGrow = new Float32Array(n * 4), aBld = new Float32Array(n * 4);
  const mesh = new THREE.InstancedMesh(geo, null, n);
  const m4 = new THREE.Matrix4();
  tiers.forEach((t, i) => {
    const b = B[t.b];
    m4.makeScale(t.sx, 1, t.sz); m4.setPosition(t.x, 0, t.z);
    mesh.setMatrixAt(i, m4);
    aSize.set([t.sx, t.th, t.sz, t.y0], i * 4);
    // building growth: hP, Htot (incl. crown when crown tier), g0, g1
    aGrow.set([b.hP, t.crown ? 1e4 : b.h, b.g0, b.g1], i * 4);
    aBld.set([t.b, b.seed, b.on, t.flood + (b.spire ? 2 : 0)], i * 4);
  });
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 4));
  geo.setAttribute('aGrow', new THREE.InstancedBufferAttribute(aGrow, 4));
  geo.setAttribute('aBld', new THREE.InstancedBufferAttribute(aBld, 4));
  mesh.material = buildingMaterial(THREE, U);
  mesh.frustumCulled = false;

  // ---- crowns / needles (square pyramids) ----
  const pg = new THREE.ConeGeometry(0.7071, 1, 4, 1); pg.rotateY(Math.PI / 4); pg.translate(0, 0.5, 0);
  const pmesh = new THREE.InstancedMesh(pg, null, pyr.length);
  const pS = new Float32Array(pyr.length * 4), pG = new Float32Array(pyr.length * 4), pB = new Float32Array(pyr.length * 4);
  pyr.forEach((p, i) => {
    const b = B[p.b];
    m4.makeScale(p.w, 1, p.w); m4.setPosition(p.x, 0, p.z); pmesh.setMatrixAt(i, m4);
    pS.set([p.w, p.h, p.w, p.y0], i * 4);
    pG.set([0, 1e4, b.g0, b.g1], i * 4);
    pB.set([p.b, b.seed, b.on, 1 + (b.spire ? 2 : 0) + 4], i * 4);
  });
  pg.setAttribute('aSize', new THREE.InstancedBufferAttribute(pS, 4));
  pg.setAttribute('aGrow', new THREE.InstancedBufferAttribute(pG, 4));
  pg.setAttribute('aBld', new THREE.InstancedBufferAttribute(pB, 4));
  pmesh.material = buildingMaterial(THREE, U);
  pmesh.frustumCulled = false;

  const group = new THREE.Group();
  group.add(mesh, pmesh);
  group.add(buildGround(THREE, U));
  const bea = buildBeacons(THREE, U, beacons, B);
  group.add(bea);
  const traffic = buildTraffic(THREE, U, rand);
  group.add(traffic);
  const lights = buildSearchlights(THREE, U);
  group.add(lights.group);
  return { group, B, tiers, pyr, mesh, pmesh, searchlights: lights, beacons: bea, traffic };
}

function buildingMaterial(THREE, U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
${COMMON}
attribute vec4 aSize, aGrow, aBld;
varying vec3 vW, vL, vN;
varying float vHc, vG, vTH, vY0;
varying vec4 vBld;
void main(){
  float g = smoothstep(aGrow.z, aGrow.w, uTime);
  bool late = aGrow.y > 9000.0;
  // current height of the whole building; crystal-like: floors appear in jumps of a few storeys
  float hc = mix(aGrow.x, aGrow.y, g);
  hc = mix(hc, floor(hc / 4.8 + 0.5) * 4.8, 0.85);
  if (late || uAsh > 0.5) hc = 1e5;
  float th = aSize.y;
  float vis = clamp(hc - aSize.w, 0.0, th);
  if (late && g < 0.999 && uAsh < 0.5) vis = 0.0;
  vY0 = aSize.w;
  vec3 p = position; p.y *= vis;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  w.y += aSize.w;
  vW = w.xyz;
  vL = vec3(position.x * aSize.x, aSize.w + p.y, position.z * aSize.z);
  vN = normal;
  vHc = hc; vG = g; vTH = th; vBld = aBld;
  gl_Position = vis <= 0.001 ? vec4(0.0, 0.0, -2.0, 1.0) : projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */`
${COMMON}
${DISSOLVE_GLSL}
varying vec3 vW, vL, vN;
varying float vHc, vG, vTH, vY0;
varying vec4 vBld;
void main(){
  vec3 n = normalize(vN);
  float bid = floor(vBld.x + 0.5), seed = vBld.y, onT = vBld.z;
  float pat = floor(fract(seed * 13.7) * 4.0);
  float isPyr = step(3.5, vBld.w);
  float w2 = vBld.w - 4.0 * isPyr;
  bool spire = w2 > 1.5;
  float flood = w2 - (spire ? 2.0 : 0.0);
  float dissolveEdge = 0.0;
  if (uAsh > 0.5) {
    float td = dissolveAt(vW);
    if (uTau > td) discard;
    dissolveEdge = 1.0 - smoothstep(0.0, 0.14, td - uTau);
  }
  vec3 V = normalize(uCam - vW);
  float isRoof = step(0.5, n.y);
  // facade
  vec3 base = mix(vec3(0.050, 0.056, 0.066), vec3(0.075, 0.068, 0.060), fract(seed * 7.3));
  vec3 amb = mix(uAmbBot, uAmbTop, n.y * 0.5 + 0.5);
  float k = max(dot(n, uKeyDir), 0.0);
  vec3 col = base * (amb + uKeyCol * k);
  // warm haze uplight on the lower floors at night
  col += base * uFogLow * 2.2 * exp(-vW.y / 40.0) * uNight;
  float u = abs(n.x) > 0.5 ? vL.z * sign(n.x) : vL.x * -sign(n.z);
  float v = vL.y;
  if (isRoof < 0.5 && isPyr < 0.5) {
    vec2 cs = vec2(2.7, 3.3);
    vec2 q = vec2(u, v) / cs;
    vec2 cell = floor(q), f = fract(q);
    vec2 fw = fwidth(q);
    float face = floor(n.x * 2.0 + n.z * 3.0 + 6.5);
    float h1 = hash12(cell + vec2(bid * 13.7 + face * 101.0, bid * 3.1));
    float h2 = hash12(cell.yx * 1.31 + vec2(bid * 7.9, face * 17.0 + 3.0));
    // clustered occupancy: whole regions (offices) lit or dark, plus fully dark floors
    float rh = hash12(floor(cell / vec2(3.0, 2.0)) + vec2(bid * 5.3 + face * 9.1, bid * 1.7));
    float rowDark = step(hash12(vec2(cell.y * 1.7, bid * 2.3 + face * 0.7)), 0.38);
    float occ = step(rh, 0.42 + 0.2 * seed) * (1.0 - rowDark) * step(h1, 0.72);
    // when does this window switch on?
    float tOn = onT;
    if (pat < 0.5) tOn += v / 120.0 * 2.2 + h2 * 0.4;
    else if (pat < 1.5) tOn += rh * 3.0 + h2 * 0.3;
    else if (pat < 2.5) tOn += fract(cell.x * 0.137 + face * 0.3) * 1.6 + h2 * 0.3;
    else tOn += fract((cell.x + cell.y) * 0.125) * 1.8 + h2 * 0.3;
    float dens = 0.25;
    float lit = occ * smoothstep(tOn, tOn + 0.08, uTime);
    if (uMode < 0.5) lit = step(h1, 0.12 + 0.08 * seed) * step(rh, 0.6) * smoothstep(1.0, 3.0, uTime + h2 * 4.0);
    // window rectangle with thick mullions, analytic AA
    vec2 wx = smoothstep(vec2(0.24, 0.28) - fw, vec2(0.24, 0.28) + fw, f) * (1.0 - smoothstep(vec2(0.76, 0.72) - fw, vec2(0.76, 0.72) + fw, f));
    float win = wx.x * wx.y;
    vec3 wc = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.78, 0.5), step(0.6, h2));
    wc = mix(wc, vec3(0.6, 0.85, 1.0), step(0.92, h2));
    float inten = (0.8 + 1.5 * h2 * h2 * h2) * mix(0.7, 1.0, uNight);
    vec3 glass = vec3(0.01, 0.014, 0.02) + uSkyHor * 0.06 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
    vec3 wcol = mix(glass, wc * inten, lit);
    // far away: average the grid instead of aliasing
    float far = smoothstep(0.3, 0.8, max(fw.x, fw.y));
    float avgLit = 0.2 * smoothstep(onT, onT + 2.5, uTime) * 0.28;
    if (uMode < 0.5) avgLit = 0.1 * 0.28 * smoothstep(1.0, 4.0, uTime);
    vec3 avg = mix(glass * 0.5, vec3(1.0, 0.62, 0.3) * 1.8, avgLit);
    col = mix(mix(col, wcol, win), avg, far * 0.85);
  }
  // floodlit crowns
  if (flood > 0.5) {
    float fl = exp(-clamp((vL.y - vY0) / max(vTH, 1.0), 0.0, 1.0) * 1.6);
    vec3 fcol = spire ? vec3(1.0, 0.86, 0.66) : vec3(0.85, 0.9, 1.0);
    col += base * fcol * 2.0 * fl * uNight * smoothstep(onT, onT + 1.0, uTime) * (isPyr > 0.5 ? 0.8 : 1.0);
    if (isPyr > 0.5) col += fcol * 0.025 * uNight * pow(max(dot(n, normalize(vec3(0.3, 1.0, 0.5))), 0.0), 2.0);
  }
  // crystal growth front: a cold glowing seam at the top while growing
  float growing = step(0.001, vG) * (1.0 - step(0.999, vG));
  col += vec3(0.5, 0.85, 1.2) * 0.4 * growing * smoothstep(vHc - 0.7, vHc, vL.y) * (1.0 - isRoof);
  // the after-world
  if (uAsh > 0.5) {
    vec3 g = vec3(0.105, 0.105, 0.11) * (0.8 + 0.2 * (n.y * 0.5 + 0.5)) * (0.9 + 0.1 * k);
    g += vec3(0.32) * dissolveEdge;
    col = g;
  }
  gl_FragColor = vec4(applyFog(col, vW), 1.0);
}`,
  });
}

function buildGround(THREE, U) {
  const geo = new THREE.PlaneGeometry(6000, 6000); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
${COMMON}
varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  // street grid (avenues every 34, streets every 66)
  vec2 q = vec2(mod(p.x + 17.0, 34.0), mod(p.y + 33.0, 66.0));
  vec2 fw = fwidth(p) + 0.001;
  float st = max(1.0 - smoothstep(4.0 - fw.x, 4.0 + fw.x, abs(q.x - 0.0 + (q.x > 17.0 ? -34.0 : 0.0))),
                 1.0 - smoothstep(4.0 - fw.y, 4.0 + fw.y, abs(q.y + (q.y > 33.0 ? -66.0 : 0.0))));
  bool park = abs(p.x) < 70.0 && p.y > -80.0 && p.y < 260.0;
  vec3 col = park ? vec3(0.018, 0.022, 0.02) : vec3(0.026, 0.026, 0.028);
  col *= (uAmbTop + uKeyCol * max(uKeyDir.y, 0.0)) ;
  if (!park) {
    col += vec3(1.0, 0.55, 0.22) * st * 0.12 * (0.15 + uNight);
    // the city goes on beyond the towers: a carpet of small lights, averaged with distance
    vec2 cc = floor(p / 5.0);
    float h = hash12(cc + 0.37);
    vec2 fc = fract(p / 5.0) - 0.5;
    float far = smoothstep(0.15, 0.6, max(fw.x, fw.y) / 5.0);
    float dotv = step(0.72, h) * smoothstep(0.22, 0.08, length(fc));
    col += vec3(1.0, 0.6, 0.28) * mix(dotv * 1.6, 0.05, far) * uNight * smoothstep(250.0, 700.0, length(p - uCam.xz));
  }
  // paths of the Champ de Mars
  if (park) { float pth = 1.0 - smoothstep(1.2, 2.2, abs(p.x)); col += vec3(0.05, 0.05, 0.055) * pth; }
  if (uAsh > 0.5) col = vec3(0.09, 0.09, 0.093) * (1.0 - 0.25 * st);
  gl_FragColor = vec4(applyFog(col, vW), 1.0);
}`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

function buildBeacons(THREE, U, list, B) {
  const N = list.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), aB = new Float32Array(N * 2);
  list.forEach((b, i) => { pos.set([b.x, b.y, b.z], i * 3); aB.set([b.ph, B[b.b].g1], i * 2); });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
${COMMON}
attribute vec2 aB;
varying float vA;
void main(){
  float ph = fract(uTime * 0.72 + aB.x);
  float on = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.32, 0.5, ph));
  vA = on * step(aB.y + 0.4, uTime) * (1.0 - uAsh);
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA > 0.0 ? clamp(1100.0 * uPx / -mv.z, 3.0 * uPx, 26.0 * uPx) : 0.0;
}`,
    fragmentShader: /* glsl */`
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = (exp(-d * 9.0) * 1.0 + exp(-d * 2.5) * 0.25) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(9.0, 0.5, 0.25) * a, 1.0);
}`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

function buildTraffic(THREE, U, rand) {
  const N = 9000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), aT = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const alongX = rand() < 0.45;
    let line;
    if (alongX) line = (Math.floor(rand() * 20) - 16) * 66 + 33 * 0 - 33;  // streets z = const
    else line = (Math.floor(rand() * 29) - 14) * 34 - 17;                  // avenues x = const
    const lane = (rand() < 0.5 ? -1 : 1);
    pos.set([alongX ? 1 : 0, line + lane * 1.6, lane], i * 3);
    aT.set([rand(), (0.6 + rand() * 0.8), rand(), rand()], i * 4);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
${COMMON}
attribute vec4 aT;
varying vec3 vC; varying float vA;
void main(){
  bool alongX = position.x > 0.5;
  float lane = position.z;
  float L = alongX ? 1000.0 : 1300.0;
  // time-lapse: traffic speeds up with the night
  float sp = mix(2.0, 70.0, uNight) * aT.y * lane;
  float s = fract(aT.x + sp * uTime / L) * L;
  vec3 p = alongX ? vec3(s - 500.0, 0.6, position.y) : vec3(position.y, 0.6, s - 1100.0);
  bool park = abs(p.x) < 70.0 && p.z > -80.0 && p.z < 260.0;
  vC = lane > 0.0 ? vec3(1.0, 0.75, 0.45) * 2.4 : vec3(1.0, 0.18, 0.08) * 1.6;
  if (uMode < 0.5) vC = vec3(1.0, 0.62, 0.3) * 1.6;
  vA = (park ? 0.0 : 1.0) * (1.0 - uAsh) * step(aT.z, mix(0.25, 1.0, uNight));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA > 0.0 ? clamp(260.0 * uPx / -mv.z, 1.0 * uPx, 5.0 * uPx) : 0.0;
}`,
    fragmentShader: /* glsl */`
varying vec3 vC; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = exp(-d * 4.0) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// Crossing searchlights: additive soft cones.
function buildSearchlights(THREE, U) {
  const geo = new THREE.ConeGeometry(26, 900, 28, 1, true);
  geo.scale(1, -1, 1); geo.translate(0, 450, 0);
  const defs = [
    { p: [-120, 2, -260], az: 0.3, el: 1.05, sw: 0.35, sp: 0.23, ph: 0.0 },
    { p: [180, 2, -330], az: 2.6, el: 1.15, sw: 0.4, sp: -0.19, ph: 1.7 },
    { p: [-30, 2, -520], az: 1.4, el: 1.1, sw: 0.5, sp: 0.15, ph: 3.1 },
    { p: [260, 2, -150], az: 2.9, el: 1.0, sw: 0.35, sp: 0.21, ph: 4.4 },
    { p: [-260, 2, -140], az: 0.15, el: 1.0, sw: 0.4, sp: -0.17, ph: 2.2 },
    { p: [90, 2, -700], az: 1.9, el: 1.2, sw: 0.45, sp: 0.13, ph: 5.3 },
    { p: [-200, 2, -620], az: 0.8, el: 1.12, sw: 0.4, sp: 0.2, ph: 0.9 },
  ];
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uOn: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
${COMMON}
varying float vAlong; varying vec3 vW, vNw;
void main(){
  vAlong = position.y / 900.0;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */`
${COMMON}
uniform float uOn;
varying float vAlong; varying vec3 vW, vNw;
void main(){
  vec3 V = normalize(uCam - vW);
  float edge = pow(abs(dot(normalize(vNw), V)), 3.0);
  float fall = exp(-vAlong * 2.6) * smoothstep(0.0, 0.03, vAlong) * (1.0 - smoothstep(0.35, 0.95, vAlong));
  float a = edge * fall * uOn;
  gl_FragColor = vec4(vec3(0.55, 0.8, 1.0) * a * 0.3, 1.0);
}`,
  });
  const group = new THREE.Group();
  const meshes = defs.map(d => {
    const m = new THREE.Mesh(geo, mat);
    m.position.fromArray(d.p);
    m.frustumCulled = false;
    group.add(m);
    return { m, d };
  });
  const e = new THREE.Euler();
  function update(t) {
    for (const { m, d } of meshes) {
      const az = d.az + Math.sin(t * d.sp * 2.0 + d.ph) * d.sw * 1.6;
      const el = d.el + Math.sin(t * d.sp * 1.3 + d.ph * 1.7) * 0.18;
      // tilt from vertical by (π/2 − el) toward azimuth az
      const tilt = Math.PI / 2 - el;
      m.rotation.set(0, 0, 0);
      m.rotateY(az); m.rotateZ(tilt);
    }
  }
  return { group, update, mat };
}
