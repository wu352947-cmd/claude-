// Act VI 铁 — I3 the after-world: points sampled on the building surfaces peel away when the
// dissolve front passes them, drift in slow motion and fall like snow; plus a field of ambient ash.
// All motion is a closed-form function of the warped time uTau, so it freezes when uTau stops.
import { COMMON, GLSL } from './iron_common.js';
import { dissolveAt } from './iron_city.js';

export function buildAsh(THREE, U, rand, city, view) {
  // ---- surface samples ----
  const { tiers, B } = city;
  const inView = (x, z) => view(x, z);
  const cand = [];
  let total = 0;
  for (const t of tiers) {
    if (!inView(t.x, t.z)) continue;
    const area = 2 * (t.sx + t.sz) * t.th + t.sx * t.sz;
    cand.push({ t, area }); total += area;
  }
  const N = 120000;
  const pos = new Float32Array(N * 3), aN = new Float32Array(N * 4), aT = new Float32Array(N * 2);
  let i = 0;
  for (const { t, area } of cand) {
    let k = Math.round((area / total) * N);
    while (k-- > 0 && i < N) {
      // pick a face weighted by area
      const fr = rand() * area;
      let x, y, z, nx = 0, ny = 0, nz = 0;
      const sideA = t.sx * t.th, sideB = t.sz * t.th;
      if (fr < 2 * sideA) { const s = fr < sideA ? 1 : -1; x = t.x + (rand() - 0.5) * t.sx; y = t.y0 + rand() * t.th; z = t.z + s * t.sz / 2; nz = s; }
      else if (fr < 2 * sideA + 2 * sideB) { const s = fr < 2 * sideA + sideB ? 1 : -1; x = t.x + s * t.sx / 2; y = t.y0 + rand() * t.th; z = t.z + (rand() - 0.5) * t.sz; nx = s; }
      else { x = t.x + (rand() - 0.5) * t.sx; y = t.y0 + t.th; z = t.z + (rand() - 0.5) * t.sz; ny = 1; }
      pos.set([x, y, z], i * 3);
      aN.set([nx, ny, nz, rand()], i * 4);
      aT.set([dissolveAt(x, y, z), rand()], i * 2);
      i++;
    }
  }
  const count = i;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, count * 3), 3));
  geo.setAttribute('aN', new THREE.BufferAttribute(aN.subarray(0, count * 4), 4));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT.subarray(0, count * 2), 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
${COMMON}
${GLSL.snoise}
attribute vec4 aN;
attribute vec2 aT;
varying float vA, vL;
void main(){
  float s = uTau - aT.x;
  if (s < 0.0 || uAsh < 0.5) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  vec3 p0 = position;
  float r = aN.w;
  // peel off the face, lift a little, then drift downwind and settle like snow
  vec3 off = aN.xyz * (1.2 + 2.0 * r) * (1.0 - exp(-1.6 * s));
  off.y += (1.5 + 2.5 * aT.y) * (1.0 - exp(-0.9 * s)) - (0.9 + 0.8 * r) * s * s * 0.18;
  off.x += (2.5 + 2.0 * aT.y) * s * s * 0.25 + s * 1.2;
  off.z += 0.6 * s;
  vec3 q = p0 * 0.02 + vec3(0.0, 0.0, s * 0.12);
  off += vec3(snoise(q), snoise(q + 31.7), snoise(q + 71.3)) * (2.0 + 5.0 * r) * min(s * 0.45, 1.0);
  vec3 p = p0 + off;
  // flakes turning in the light
  float flick = 0.65 + 0.35 * sin(s * (2.0 + 3.0 * r) + r * 40.0);
  vA = smoothstep(0.0, 0.15, s) * (0.55 + 0.45 * flick);
  vL = 0.55 + 0.5 * r;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((0.45 + 0.6 * aT.y) * 1500.0 * uPx / -mv.z, 1.3 * uPx, 7.0 * uPx);
}`,
    fragmentShader: /* glsl */`
${COMMON}
varying float vA, vL;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = (1.0 - d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.34, 0.34, 0.345) * vL, a * 0.95);
}`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  // ---- ambient ash: a volume in front of the camera, falling like slow snow ----
  const M = 26000;
  const g2 = new THREE.BufferGeometry();
  const p2 = new Float32Array(M * 3), a2 = new Float32Array(M * 4);
  for (let j = 0; j < M; j++) {
    // depth distribution weighted towards the camera for parallax
    const d = 6 + Math.pow(rand(), 1.6) * 340;
    const ang = (rand() - 0.5) * 1.15;
    p2.set([Math.sin(ang) * d, (rand() - 0.5), -Math.cos(ang) * d], j * 3);
    a2.set([rand(), rand(), rand(), rand()], j * 4);
  }
  g2.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  g2.setAttribute('aR', new THREE.BufferAttribute(a2, 4));
  const amb = new THREE.ShaderMaterial({
    uniforms: { ...U, uAnchor: { value: new THREE.Matrix4() }, uYSpan: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
${COMMON}
uniform mat4 uAnchor;
attribute vec4 aR;
varying float vA, vB;
void main(){
  float d = length(position.xz);
  // vertical extent grows with distance (fills the frustum)
  float span = 0.62 * d + 8.0;
  float fall = (0.9 + 0.9 * aR.y) * uTau;
  float y = (fract(aR.x - fall / (span * 2.0)) - 0.5) * span * 2.0;
  vec3 lp = vec3(position.x + sin(uTau * (0.4 + aR.z) + aR.w * 30.0) * 0.6 * (0.5 + aR.z), y, position.z) ;
  vec3 p = (uAnchor * vec4(lp, 1.0)).xyz;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float z = -mv.z;
  // near flakes: big and soft (out of focus); far: tiny
  float sz = (0.09 + 0.13 * aR.w) * 1500.0 * uPx / z;
  vB = clamp((sz - 6.0 * uPx) / (40.0 * uPx), 0.0, 1.0);
  gl_PointSize = clamp(sz, 1.0 * uPx, 30.0 * uPx);
  vA = uAsh * smoothstep(0.3 + 3.5 * aR.x * aR.z, 1.2 + 4.0 * aR.x * aR.z, uTau) * (0.5 + 0.5 * aR.z) * (1.0 - 0.75 * vB);
}`,
    fragmentShader: /* glsl */`
varying float vA, vB;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = mix(1.0 - d, (1.0 - d * d) * 0.7, vB) * vA;
  if (a < 0.01 || d > 1.0) discard;
  gl_FragColor = vec4(vec3(0.3, 0.3, 0.305), a * 0.75);
}`,
  });
  const ambPts = new THREE.Points(g2, amb);
  ambPts.frustumCulled = false;
  return { points: pts, ambient: ambPts, ambMat: amb, count };
}
