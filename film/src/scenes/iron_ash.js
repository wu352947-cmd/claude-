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
  const N = 30000;
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
varying float vA, vB, vRot, vRat, vL;
void main(){
  float s = uTau - aT.x;
  if (s < 0.0 || uAsh < 0.5) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vB = 0.0; vRot = 0.0; vRat = 1.0; vL = 0.0; return; }
  vec3 p0 = position;
  float r = aN.w;
  // peel off the face, lift a little, then drift downwind and settle like snow
  vec3 off = aN.xyz * (1.2 + 2.0 * r) * (1.0 - exp(-1.6 * s));
  off.y += (1.5 + 2.5 * aT.y) * (1.0 - exp(-0.9 * s)) - (0.5 + 0.5 * r) * s * s * 0.09;
  off.x += (2.5 + 2.0 * aT.y) * s * s * 0.25 + s * 1.2;
  off.z += 0.6 * s;
  vec3 q = p0 * 0.02 + vec3(0.0, 0.0, s * 0.12);
  off += vec3(snoise(q), snoise(q + 31.7), snoise(q + 71.3)) * (2.0 + 5.0 * r) * min(s * 0.45, 1.0);
  vec3 p = p0 + off;
  // flakes tumbling, catching the light when face-on
  float tumble = s * (1.2 + 1.6 * aT.y) + r * 30.0;
  vRat = 0.25 + 0.75 * abs(cos(tumble));
  vRot = r * 6.283 + s * (0.3 + 0.5 * aT.y);
  vB = 0.0;
  vA = smoothstep(0.0, 0.2, s);
  vL = (0.2 + 0.1 * aT.y) * (0.8 + 0.6 * pow(vRat, 8.0));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vA *= exp(-max(-mv.z - 60.0, 0.0) * 0.006);   // recede into the haze
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((0.7 + 0.9 * aT.y) * 1500.0 * uPx / -mv.z, 1.6 * uPx, 9.0 * uPx);
}`,
    fragmentShader: /* glsl */`
varying float vA, vB, vRot, vRat, vL;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  vec2 q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
  q.y /= max(vRat, 0.22);
  float d = dot(q, q) * 4.0;
  float crisp = 1.0 - smoothstep(0.55, 1.0, d);
  float soft = max(1.0 - dot(c, c) * 4.0, 0.0); soft *= soft;
  float a = mix(crisp, soft * 0.55, vB) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(vL), a);
}`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  // ---- ambient ash: a volume in front of the camera, falling like slow snow ----
  const M = 14000;
  const g2 = new THREE.BufferGeometry();
  const p2 = new Float32Array(M * 3), a2 = new Float32Array(M * 4);
  for (let j = 0; j < M; j++) {
    // layers: a few big out-of-focus flakes near the lens, crisp mid flakes, fine far haze
    const layer = j < 200 ? 0 : j < 5200 ? 1 : 2;
    const d = layer === 0 ? 2.5 + rand() * 9 : layer === 1 ? 12 + Math.pow(rand(), 1.3) * 80 : 95 + rand() * 320;
    const ang = (rand() - 0.5) * 1.2;
    p2.set([Math.sin(ang) * d, layer, -Math.cos(ang) * d], j * 3);
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
varying float vA, vB, vRot, vRat, vL;
void main(){
  float d = length(position.xz);
  float layer = position.y;
  float span = 0.62 * d + 6.0;
  float fall = (0.6 + 0.6 * aR.y) * uTau * (layer < 0.5 ? 0.5 : 1.0);
  float y = (fract(aR.x - fall / (span * 2.0)) - 0.5) * span * 2.0;
  vec3 lp = vec3(position.x + sin(uTau * (0.4 + aR.z) + aR.w * 30.0) * 0.5 * (0.5 + aR.z), y, position.z);
  vec3 p = (uAnchor * vec4(lp, 1.0)).xyz;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float z = -mv.z;
  float tumble = uTau * (0.8 + 1.4 * aR.z) + aR.w * 40.0;
  vRat = 0.25 + 0.75 * abs(cos(tumble));
  vRot = aR.y * 6.283 + uTau * (0.2 + 0.4 * aR.w);
  float sz;
  if (layer < 0.5) { sz = (0.05 + 0.05 * aR.w) * 1500.0 * uPx / z; vB = 1.0; vRat = 1.0; }
  else if (layer < 1.5) { sz = (0.06 + 0.22 * aR.w * aR.w) * 1500.0 * uPx / z; vB = 0.0; }
  else { sz = 1.4 * uPx; vB = 0.6; vRat = 1.0; }
  gl_PointSize = clamp(sz, 1.2 * uPx, 70.0 * uPx);
  float ramp = smoothstep(0.3 + 3.0 * aR.x * aR.z, 1.2 + 3.5 * aR.x * aR.z, uTau);
  vA = uAsh * ramp * (layer < 0.5 ? 0.16 : layer < 1.5 ? 0.8 * exp(-max(z - 40.0, 0.0) * 0.012) : 0.25);
  bool dark = aR.z < 0.1;
  vL = dark ? 0.07 : (0.26 + 0.08 * aR.w) * (0.8 + 0.7 * pow(vRat, 8.0) * step(0.5, layer) * step(layer, 1.5));
  if (layer < 0.5) vL = 0.28;
}`,
    fragmentShader: /* glsl */`
varying float vA, vB, vRot, vRat, vL;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  vec2 q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
  q.y /= max(vRat, 0.22);
  float d = dot(q, q) * 4.0;
  float crisp = 1.0 - smoothstep(0.55, 1.0, d);
  float soft = max(1.0 - dot(c, c) * 4.0, 0.0); soft *= soft;
  float a = mix(crisp, soft * 0.55, vB) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(vL), a);
}`,
  });
  const ambPts = new THREE.Points(g2, amb);
  ambPts.frustumCulled = false;
  return { points: pts, ambient: ambPts, ambMat: amb, count };
}
