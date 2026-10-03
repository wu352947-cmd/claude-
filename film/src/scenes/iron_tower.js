// Act VI 铁 — the wrought-iron lattice tower (Eiffel type) that assembles itself bottom-up,
// plus the rivet sparks at its growth front.
import { COMMON, GLSL, FRONT_GLSL, frontTime, TOWER_H } from './iron_common.js';

const YM = 45;                      // height where the four legs merge
export const wOut = y => 2.3 + 22.7 * Math.exp(-y / 27);
export const wIn = y => (y < YM ? 14.5 * Math.pow(1 - y / YM, 1.12) : 0);
const PROFILE_GLSL = /* glsl */`
float wOut(float y){ return 2.3 + 22.7 * exp(-y / 27.0); }
float wIn(float y){ return y < 45.0 ? 14.5 * pow(1.0 - y / 45.0, 1.12) : 0.0; }
`;

export function steelMaterial(THREE, U, { instanced = true, heat = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
${COMMON}
attribute float aBirth;
attribute float aSeed;
varying vec3 vN, vW;
varying float vHeat, vAlong, vSeed;
void main(){
  vec3 p = position;
  float g = 1.0; vHeat = 0.0; vSeed = 0.0;
#ifdef USE_INSTANCING
  ${heat ? `
  float a = uTime - aBirth;
  g = clamp(a / 0.32, 0.0, 1.0); g = g * g * (3.0 - 2.0 * g);
  p.y *= g;
  vHeat = g > 0.0 ? exp(-max(a - 0.15, 0.0) * 1.2) : 0.0;
  vSeed = aSeed;` : ''}
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
#else
  vec4 w = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
#endif
  vAlong = position.y;
  vW = w.xyz;
  gl_Position = g <= 0.0 ? vec4(0.0, 0.0, -2.0, 1.0) : projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */`
${COMMON}
varying vec3 vN, vW;
varying float vHeat, vAlong, vSeed;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 base = vec3(0.16, 0.18, 0.21);
  float k = max(dot(n, uKeyDir), 0.0);
  vec3 amb = mix(uAmbBot, uAmbTop, n.y * 0.5 + 0.5);
  vec3 h = normalize(uKeyDir + v);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.6;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  float fill = max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0);
  vec3 col = base * (amb + uKeyCol * k + uAmbTop * fill * 0.5) + uKeyCol * spec + uRimCol * fres * 0.8;
  // furnace light (gears machine room)
  vec3 lf = uFurnace - vW; float df = length(lf);
  col += base * uFurnaceCol * max(dot(n, lf / df), 0.0) * 9.0 / (1.0 + df * df * 0.08);
  // rivet heat at the freshly placed end
  float hot = vHeat * (0.35 + 0.65 * smoothstep(0.4, 1.0, vAlong));
  col += vec3(4.0, 1.25, 0.32) * hot * hot * 1.6;
  // the after-world: grey, ash coloured
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), uAsh);
  gl_FragColor = vec4(applyFog(col, vW), 1.0);
}`,
  });
}

// Build the girder list.
function buildMembers() {
  const M = [];   // {a:[x,y,z], b:[x,y,z], t:thickness, birth}
  const add = (a, b, t, birthY) => M.push({ a, b, t, by: birthY ?? Math.min(a[1], b[1]) });
  // --- legs (four square trusses) ---
  const legLv = [];
  for (let k = 0; k <= 13; k++) legLv.push(YM * Math.pow(k / 13, 0.92));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = (y, i, j) => {   // i,j ∈ {0 inner, 1 outer}
      const wi = wIn(y), wo = wOut(y);
      return [sx * (i ? wo : wi), y, sz * (j ? wo : wi)];
    };
    for (let k = 0; k < legLv.length - 1; k++) {
      const y0 = legLv[k], y1 = legLv[k + 1];
      for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]]) add(corner(y0, i, j), corner(y1, i, j), 0.62);
      // ring
      add(corner(y1, 0, 0), corner(y1, 1, 0), 0.34); add(corner(y1, 1, 0), corner(y1, 1, 1), 0.34);
      add(corner(y1, 1, 1), corner(y1, 0, 1), 0.34); add(corner(y1, 0, 1), corner(y1, 0, 0), 0.34);
      // X-bracing on the 4 faces (doubled: two stacked crosses per panel)
      const faces = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
      const ym = (y0 + y1) / 2;
      for (const [[i0, j0], [i1, j1]] of faces) {
        for (const [ya, yb] of [[y0, ym], [ym, y1]]) {
          add(corner(ya, i0, j0), corner(yb, i1, j1), 0.2);
          add(corner(ya, i1, j1), corner(yb, i0, j0), 0.2);
        }
        // mid strut
        add(corner(ym, i0, j0), corner(ym, i1, j1), 0.16);
      }
    }
  }
  // --- shaft ---
  const shLv = [];
  for (let y = YM; y < 106; y += 4.3) shLv.push(y);
  shLv.push(106);
  const sc = (y, i, j) => { const w = wOut(y); return [i ? w : -w, y, j ? w : -w]; };
  for (let k = 0; k < shLv.length - 1; k++) {
    const y0 = shLv[k], y1 = shLv[k + 1];
    for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]]) add(sc(y0, i, j), sc(y1, i, j), 0.58);
    const faces = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
    for (const [[i0, j0], [i1, j1]] of faces) {
      add(sc(y1, i0, j0), sc(y1, i1, j1), 0.3);
      const a0 = sc(y0, i0, j0), b0 = sc(y0, i1, j1), a1 = sc(y1, i0, j0), b1 = sc(y1, i1, j1);
      const mid = (p, q, s) => p.map((v, d) => v + (q[d] - v) * s);
      // two side-by-side crosses per face
      for (const [s0, s1] of [[0, 0.5], [0.5, 1]]) {
        add(mid(a0, b0, s0), mid(a1, b1, s1), 0.18);
        add(mid(a0, b0, s1), mid(a1, b1, s0), 0.18);
      }
      add(mid(a0, b0, 0.5), mid(a1, b1, 0.5), 0.2);
    }
  }
  // --- arches on the four faces of the first level ---
  for (let f = 0; f < 4; f++) {
    const ang = f * Math.PI / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (x, y, inset) => { const z = wOut(y) - inset; return [x * ca + z * sa, y, -x * sa + z * ca]; };
    const N = 22, A = wIn(5) + 0.4, y0 = 4.5, B = 15.2;
    let prevO, prevI;
    for (let s = 0; s <= N; s++) {
      const ph = Math.PI * s / N;
      const xo = A * Math.cos(ph), yo = y0 + B * Math.sin(ph);
      const xi = (A - 1.3) * Math.cos(ph), yi = y0 + (B - 1.3) * Math.sin(ph);
      const o = P(xo, yo, 0.6), i = P(xi, yi, 0.6);
      if (s > 0) {
        add(prevO, o, 0.42, 4 + yo * 0.5); add(prevI, i, 0.3, 4 + yo * 0.5);
        add(s % 2 ? prevO : prevI, s % 2 ? i : o, 0.16, 4 + yo * 0.5);
      }
      prevO = o; prevI = i;
    }
  }
  // --- platforms (lattice bands) ---
  const band = (y, hw, hh, depth) => {
    for (let f = 0; f < 4; f++) {
      const ang = f * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const P = (x, yy, z) => [x * ca + z * sa, yy, -x * sa + z * ca];
      // top and bottom rails
      add(P(-hw, y, hw), P(hw, y, hw), 0.5, y); add(P(-hw, y + hh, hw), P(hw, y + hh, hw), 0.5, y);
      add(P(-hw + depth, y + hh * 0.5, hw - depth), P(hw - depth, y + hh * 0.5, hw - depth), 0.4, y);
      // lattice of the band
      const n = Math.max(6, Math.round(hw * 2 / 1.6));
      for (let s = 0; s < n; s++) {
        const x0 = -hw + 2 * hw * s / n, x1 = -hw + 2 * hw * (s + 1) / n;
        add(P(x0, y, hw), P(x1, y + hh, hw), 0.14, y); add(P(x1, y, hw), P(x0, y + hh, hw), 0.14, y);
        add(P(x0, y, hw), P(x0, y + hh, hw), 0.18, y);
      }
    }
  };
  band(21.2, wOut(22) + 1.4, 3.0, 1.5);
  band(44.5, wOut(45) + 1.0, 2.2, 1.0);
  band(104.5, wOut(105) + 0.7, 1.8, 0.6);
  // top: cupola, lantern, mast
  add([0, 106.3, 0], [0, 111.5, 0], 3.2, 106.3);
  add([0, 111.5, 0], [0, 114.5, 0], 1.6, 111.5);
  add([0, 114.5, 0], [0, 125.5, 0], 0.28, 114.5);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    add([Math.cos(a) * 1.5, 111.5, Math.sin(a) * 1.5], [0, 116, 0], 0.12, 111.5);
  }
  return M;
}

export function buildTower(THREE, U, rand) {
  const group = new THREE.Group();
  const M = buildMembers();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = steelMaterial(THREE, U);
  const mesh = new THREE.InstancedMesh(geo, mat, M.length);
  const birth = new Float32Array(M.length), seed = new Float32Array(M.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pa = new THREE.Vector3(), d = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  M.forEach((m, i) => {
    pa.fromArray(m.a); d.fromArray(m.b).sub(pa);
    const len = d.length(); d.normalize();
    q.setFromUnitVectors(up, d);
    s.set(m.t, len, m.t);
    m4.compose(pa, q, s);
    mesh.setMatrixAt(i, m4);
    birth[i] = frontTime(m.by) + rand() * 0.25 - 0.1;
    seed[i] = rand();
  });
  geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birth, 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  mesh.frustumCulled = false;
  group.add(mesh);
  group.add(buildSparks(THREE, U));
  return { group, mesh, count: M.length };
}

// Rivet sparks born at the growth front, ballistic, sodium orange.
function buildSparks(THREE, U) {
  const N = 9000;
  const geo = new THREE.BufferGeometry();
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    a[i * 4] = i; a[i * 4 + 1] = 0.35 + 0.55 * ((i * 0.6180339) % 1);
    a[i * 4 + 2] = (i * 0.7548776) % 1; a[i * 4 + 3] = (i * 0.5698403) % 1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aD', new THREE.BufferAttribute(a, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
${COMMON}
${FRONT_GLSL}
${PROFILE_GLSL}
attribute vec4 aD;   // id, period, phase, seed
varying float vA;
void main(){
  float id = aD.x, P = aD.y;
  float c = floor((uTime + aD.z * P) / P);
  float tb = c * P - aD.z * P;
  float age = uTime - tb;
  vec3 r = hash31(id * 7.13 + c * 131.7);
  vec3 r2 = hash31(id * 3.71 + c * 57.3 + 9.0);
  float y = frontAt(tb) - r.x * 2.5;
  // emitting point on the tower envelope at the front
  float wo = wOut(y), wi = wIn(y);
  float face = floor(r.y * 4.0);
  float along = mix(-wo, wo, r.z);
  if (wi > 0.0) { float side = r2.z < 0.5 ? -1.0 : 1.0; along = side * mix(wi, wo, fract(r.z * 2.0)); }
  vec3 p0 = face < 1.0 ? vec3(along, y, wo) : face < 2.0 ? vec3(wo, y, along) : face < 3.0 ? vec3(along, y, -wo) : vec3(-wo, y, along);
  vec3 outw = face < 1.0 ? vec3(0,0,1) : face < 2.0 ? vec3(1,0,0) : face < 3.0 ? vec3(0,0,-1) : vec3(-1,0,0);
  vec3 v0 = outw * (1.5 + r2.x * 5.0) + (r2 - 0.5) * vec3(7.0, 6.0, 7.0) + vec3(0.0, 2.5, 0.0);
  vec3 p = p0 + v0 * age + vec3(0.0, -14.0, 0.0) * age * age * 0.5;
  float alive = step(0.0, age) * step(age, P) * step(tb, 7.75) * step(-0.5, tb);
  vA = alive * pow(1.0 - age / P, 1.5) * (0.4 + 0.6 * fract(id * 0.37));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = alive > 0.0 ? clamp((0.9 + 1.4 * fract(id * 0.913)) * uPx * 700.0 / -mv.z, 1.7 * uPx, 9.0 * uPx) : 0.0;
}`,
    fragmentShader: /* glsl */`
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = exp(-d * 3.5) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(14.0, 5.0, 1.2) * a, 1.0);
}`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
export { TOWER_H };
