// Ⅱ 石 STONE — Giza, 2560 BCE.  Segment 67.5–83 (local t = global − 67.5).
// S1 0–8.5   sand slides off a vast slope: the Great Pyramid. Skim up the face, courses rushing by.
// S2 8.5–15.5 crest the apex; Orion's belt above it; tilt up; 80.0 the belt star flares (0.5W, 0.32H).
import { GLSL } from '../engine/util.js';

const A = 115.2, HP = 146.6;                       // Great Pyramid half-base, height
const SL = Math.hypot(A, HP);                      // slant length of a face
const SIN = HP / SL, COS = A / SL;                 // slope 51.84°
const HC = 1.25;                                   // course height (vertical)
const CASE = 1.6;                                  // horizontal casing thickness
const GLINT_T = 80.0 - 67.5;

const COMMON = /* glsl */`
${GLSL.hash}
uniform float uTime;
uniform vec3 uCam, uMoonDir, uMoonCol, uAmb, uHaze;
uniform float uFogDen;
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
vec3 skyCol(vec3 d){
  float h = clamp(d.y, 0., 1.);
  vec3 zen = vec3(0.006, 0.010, 0.028), hor = vec3(0.030, 0.040, 0.075);
  vec3 c = mix(zen, hor, pow(1. - h, 4.));
  float md = max(dot(d, uMoonDir), 0.);
  c += vec3(0.20, 0.27, 0.42) * (pow(md, 6.) * 0.18 + pow(md, 60.) * 0.35 + pow(md, 900.) * 1.2);
  return c;
}
vec3 fog(vec3 col, vec3 P){
  vec3 v = P - uCam; float d = length(v);
  float hf = exp(-max(P.y, 0.) * 0.004);
  float f = 1. - exp(-d * uFogDen * mix(0.4, 1., hf));
  vec3 dd = v / d;
  return mix(col, skyCol(normalize(vec3(dd.x, 0.02 + max(dd.y, 0.) * 0.3, dd.z))) * 1.1, f);
}
`;

// Casing: polished white limestone, courses + staggered joints, missing patches reveal the core.
const CASING_VS = /* glsl */`varying vec3 vP; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const MASK = /* glsl */`
// missing casing: 1 inside a hole. coordinates on the climbed (south) face: x across, y height
float holeMask(vec2 q){
  float hw = ${A.toFixed(2)} - q.y / ${(HP / A).toFixed(5)};
  float edge = 1. - smoothstep(0., 18., hw - abs(q.x));                 // arrises are broken
  float n = vnoise(q * 0.045) * 0.55 + vnoise(q * 0.11 + 7.) * 0.3 + vnoise(q * 0.4 + 3.) * 0.15;
  float bias = 0.76 - 0.18 * smoothstep(20., 140., q.y) - 0.35 * edge + 0.25 * (1. - smoothstep(0., 30., q.y)) + 0.6 * smoothstep(105., 128., q.y);
  return n - bias;      // > 0 → hole
}
float sandFront(float x){ return uSandY + (vnoise(vec2(x * 0.05, 1.3)) - 0.5) * 9. + sin(x * 0.11) * 2.; }
`;
const CASING_FS = /* glsl */`
${COMMON}
uniform float uHoles, uSandY, uFlow;
varying vec3 vP; varying vec3 vN;
${MASK}
void main(){
  vec3 P = vP, N = normalize(vN);
  bool south = N.z < -0.5;
  float tx = abs(N.z) > abs(N.x) ? P.x : P.z;
  // casing holes (south face only)
  float hm = south ? holeMask(vec2(P.x, P.y)) * uHoles : -1.;
  float sf0 = sandFront(P.x);
  if (hm > 0. && P.y > sf0 - 1.) discard;
  // courses & staggered joints
  float k = floor(P.y / ${HC.toFixed(3)});
  float fy = fract(P.y / ${HC.toFixed(3)});
  float bw = 1.5 + 1.6 * hash11(k * 1.37 + 0.1);
  float off = hash11(k * 2.11 + 0.7) * bw;
  float j = floor((tx + off) / bw);
  float fx = fract((tx + off) / bw);
  float fwy = fwidth(P.y) / ${HC.toFixed(3)}, fwx = fwidth(tx) / bw;
  float jh = 1. - smoothstep(0.0, 0.012 + fwy, min(fy, 1. - fy));
  float jv = 1. - smoothstep(0.0, 0.01 + fwx, min(fx, 1. - fx));
  float far = smoothstep(0.15, 0.6, max(fwy, fwx));
  float joint = mix(max(jh, jv), 0.06, far);
  float hb = hash12(vec2(k, j));
  vec3 alb = mix(vec3(0.80, 0.78, 0.74), vec3(0.84, 0.79, 0.70), hash11(hb * 17.)) * (0.86 + 0.2 * mix(hb, 0.5, far));
  alb *= 0.9 + 0.14 * vnoise(P.xy * vec2(0.08, 0.3)) ;
  alb *= 0.94 + 0.08 * vnoise(vec2(tx, P.y) * 2.3);
  alb *= 1. - 0.32 * joint;
  // per-block tilt → glints as the stones rush past
  vec3 jit = (hash31(k * 31.7 + j * 5.3) - 0.5) * 0.07 * (1. - far);
  vec3 Nb = normalize(N + jit);
  // broken edges around holes: darker chipped rim
  float rim = south ? smoothstep(-0.12, 0., hm) * uHoles : 0.;
  alb *= 1. - 0.55 * rim;
  // sand: covers the face below the sliding front; streaks flowing downslope
  float sf = sandFront(P.x);
  float sand = smoothstep(sf + 1.5, sf - 2.5, P.y);
  float flow = vnoise(vec2(P.x * 0.6, P.y * 0.12 + uTime * 9.)) * 0.6 + vnoise(vec2(P.x * 2.3, P.y * 0.5 + uTime * 16.)) * 0.4;
  sand = max(sand, smoothstep(0.62, 0.9, flow) * smoothstep(sf + 30., sf, P.y) * uFlow);
  float grain = hash12(floor(vec2(tx, P.y) * 9.)) * 0.12;
  float rip = sin(P.y * 7. + vnoise(vec2(tx, P.y) * 0.8) * 6. + uTime * 3.) * 0.5 + 0.5;
  alb = mix(alb, vec3(0.50, 0.41, 0.30) * (0.65 + 0.45 * flow + grain + 0.12 * rip), sand);
  Nb = normalize(mix(Nb, N + vec3((flow - 0.5) * 0.3, 0., 0.), sand));
  // lighting
  vec3 V = normalize(uCam - P);
  float ndl = max(dot(Nb, uMoonDir), 0.);
  vec3 H = normalize(V + uMoonDir);
  float spec = (pow(max(dot(Nb, H), 0.), 90.) * 1.6 + pow(max(dot(Nb, H), 0.), 12.) * 0.12) * (1. - sand) * (1. - 0.6 * joint);
  float fr = pow(1. - max(dot(Nb, V), 0.), 5.);
  vec3 c = alb * (uMoonCol * ndl + uAmb * (0.6 + 0.4 * Nb.y));
  c += uMoonCol * spec * (0.6 + 0.4 * hb);
  c += skyCol(reflect(-V, Nb)) * fr * 0.5 * (1. - sand);
  gl_FragColor = vec4(fog(c, P), 1.);
}`;

// Stepped core visible through the holes: rough, warmer, darker.
const CORE_FS = /* glsl */`
${COMMON}
uniform float uHoles, uSandY, uFlow;
varying vec3 vP; varying vec3 vN;
${MASK}
void main(){
  vec3 P = vP, N = normalize(vN);
  float hm = holeMask(vec2(P.x, P.y));
  bool riser = abs(N.z) > 0.5;
  vec2 q = riser ? vec2(P.x, P.y) : vec2(P.x, P.z);
  float k = floor(P.y / ${HC.toFixed(3)} - (riser ? 0. : 0.5));
  float bw = 1.2 + 1.5 * hash11(k * 3.1 + 0.4);
  float off = hash11(k * 1.7) * bw;
  float j = floor((P.x + off) / bw);
  float fx = fract((P.x + off) / bw);
  float fwx = fwidth(P.x) / bw;
  float jv = 1. - smoothstep(0.0, 0.05 + fwx, min(fx, 1. - fx));
  float hb = hash12(vec2(k, j));
  vec3 alb = vec3(0.56, 0.50, 0.42) * (0.86 + 0.2 * hb) * (0.75 + 0.35 * vnoise(q * 1.7)) * (0.85 + 0.2 * vnoise(q * 6.));
  alb *= 1. - 0.45 * jv;
  float ao = 1.;
  if (riser) { float fy = fract(P.y / ${HC.toFixed(3)}); ao = mix(0.45, 1., smoothstep(0., 0.5, fy)) * mix(0.75, 1., smoothstep(1., 0.8, fy)); }
  else { float d = fract((P.z + ${A.toFixed(2)} - (P.y) / ${(HP / A).toFixed(5)}) / 0.9); ao = mix(0.55, 1., smoothstep(0., 0.6, d)); }
  // the casing's edge shadows the core near the hole boundary
  ao *= mix(0.35, 1., smoothstep(0., 0.1, hm));
  // sand drifts on the treads
  float sd = (riser ? 0. : smoothstep(0.45, 0.8, vnoise(q * 0.35))) ;
  alb = mix(alb, vec3(0.62, 0.52, 0.40), sd);
  vec3 Nb = normalize(N + (hash31(k * 7.1 + j) - 0.5) * 0.12 + vec3(vnoise(q * 3.) - 0.5, 0., vnoise(q * 3. + 5.) - 0.5) * 0.3);
  float ndl = max(dot(Nb, uMoonDir), 0.);
  vec3 c = alb * (uMoonCol * ndl * mix(0.5, 1., ao) + uAmb * (0.6 + 0.4 * Nb.y) * ao);
  gl_FragColor = vec4(fog(c, P), 1.);
}`;

const DESERT_FS = /* glsl */`
${COMMON}
varying vec3 vP; varying vec3 vN;
uniform float uNileX;
void main(){
  vec3 P = vP;
  vec2 xz = P.xz;
  float d = length(P - uCam);
  // dunes: normal from noise gradient, fading with distance
  float e = 1.5;
  float s1 = 0.012, s2 = 0.05;
  float h0 = vnoise(xz * s1) * 6. + vnoise(xz * s2) * 1.2;
  float hx = vnoise((xz + vec2(e, 0.)) * s1) * 6. + vnoise((xz + vec2(e, 0.)) * s2) * 1.2;
  float hz = vnoise((xz + vec2(0., e)) * s1) * 6. + vnoise((xz + vec2(0., e)) * s2) * 1.2;
  float fade = 1. - smoothstep(800., 5000., d);
  vec3 N = normalize(vec3(-(hx - h0) / e * fade, 1., -(hz - h0) / e * fade));
  vec3 alb = vec3(0.52, 0.44, 0.33) * (0.85 + 0.25 * vnoise(xz * 0.004));
  // the Nile with its strip of dark fields
  float dn = abs(P.x - uNileX - sin(P.z * 0.0004) * 600.);
  float fields = 1. - smoothstep(500., 900., dn);
  alb = mix(alb, vec3(0.05, 0.07, 0.04), fields * 0.9);
  vec3 c = alb * (uMoonCol * max(dot(N, uMoonDir), 0.) + uAmb * (0.5 + 0.5 * N.y));
  float water = 1. - smoothstep(170., 190., dn);
  if (water > 0.) {
    vec3 V = normalize(uCam - P);
    vec3 Nw = normalize(vec3((vnoise(xz * 0.05 + uTime * 0.3) - 0.5) * 0.08, 1., (vnoise(xz * 0.07 - uTime * 0.2) - 0.5) * 0.08));
    vec3 R = reflect(-V, Nw);
    vec3 w = skyCol(R) * 0.8 + uMoonCol * pow(max(dot(R, uMoonDir), 0.), 250.) * 40.;
    c = mix(c, w, water);
  }
  gl_FragColor = vec4(fog(c, P), 1.);
}`;

const SKY_VS = /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
${COMMON}
${GLSL.snoise}
uniform vec3 uMWPole;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = skyCol(d);
  // faint winter Milky Way: a soft band around a great circle, mottled
  float b = dot(d, uMWPole);
  float band = exp(-b * b * 14.);
  float n = snoise(d * 6.) * 0.5 + snoise(d * 15.) * 0.25 + 0.5;
  c += vec3(0.020, 0.024, 0.036) * band * (0.4 + 0.8 * n) * smoothstep(0.0, 0.25, d.y);
  // moon disc
  c += vec3(1.6, 1.7, 1.85) * smoothstep(0.99990, 0.99994, dot(d, uMoonDir));
  gl_FragColor = vec4(c, 1.);
}`;

const STAR_VS = /* glsl */`
uniform float uPx, uStarI, uTime;
attribute vec4 aS;   // flux, colour (0 blue … 1 red), twinkle seed, size bias
varying vec3 vC; varying float vI;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float f = aS.x;
  float sz = uPx * (1.25 + 2.4 * pow(min(f, 6.), 0.42));
  vI = 2.6 * f * uStarI * (0.93 + 0.07 * sin(uTime * (3. + aS.z * 5.) + aS.z * 40.)) * (1.6 / (sz / uPx)) ;
  vC = mix(vec3(0.70, 0.80, 1.20), vec3(1.25, 0.92, 0.66), aS.y);
  gl_PointSize = sz;
  gl_Position = projectionMatrix * mv;
  float hz = normalize(position).y;
  vI *= smoothstep(-0.02, 0.12, hz);
}`;
const STAR_FS = /* glsl */`
varying vec3 vC; varying float vI;
void main(){ vec2 q = gl_PointCoord - 0.5; float r2 = dot(q, q) * 4.; float a = exp(-r2 * 6.5); gl_FragColor = vec4(vC * vI * a, 1.); }`;

const GLINT_FS = /* glsl */`
uniform float uI, uSpike, uAspect, uWarm;
uniform vec2 uPos, uRes;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - uPos) * uRes;          // pixels from the star (at full-res scale)
  float r = length(p);
  vec3 cool = vec3(0.85, 0.92, 1.15), warm = vec3(1.0, 0.78, 0.55);
  vec3 col = mix(cool, warm, uWarm);
  float core = exp(-r * r * 0.12) * 2.2 + exp(-r * 0.25) * 0.5 + 0.06 / (r * r * 0.004 + 0.06) * 0.25;
  float ax = abs(p.x), ay = abs(p.y);
  float sp = exp(-ay * 0.9) * exp(-ax * 0.012) + exp(-ax * 0.9) * exp(-ay * 0.012);
  float sp2 = exp(-abs(p.x - p.y) * 0.9) * exp(-abs(p.x + p.y) * 0.03) + exp(-abs(p.x + p.y) * 0.9) * exp(-abs(p.x - p.y) * 0.03);
  float halo = exp(-r * 0.018) * 0.12;
  vec3 c = col * (core * uI + (sp * 1.0 + sp2 * 0.18) * uSpike + halo * uI * 0.6);
  gl_FragColor = vec4(c, 1.);
}`;

const SANDP_VS = /* glsl */`
uniform float uTime, uPx, uI, uSandY;
attribute vec4 aS;
varying float vI; varying vec3 vC;
// grains sliding down the slope (−u) along the face, with a little bounce off it
void main(){
  vec3 U = vec3(0., ${SIN.toFixed(5)}, ${COS.toFixed(5)});
  vec3 Nn = vec3(0., ${COS.toFixed(5)}, ${(-SIN).toFixed(5)});
  float life = 1.4 + aS.w * 1.2;
  float ph = fract(aS.z + uTime / life);
  float age = ph * life;
  float s0 = (uSandY / ${SIN.toFixed(5)}) + aS.y * 40. - 6.;
  float s = s0 - (4. * age + 0.5 * 14. * age * age);
  vec3 p = vec3(aS.x, 0., -${A.toFixed(2)}) + U * s + Nn * (0.2 + 1.8 * aS.w * age + sin(age * 6. + aS.x) * 0.2);
  vec4 mv = viewMatrix * vec4(p, 1.);
  vI = uI * smoothstep(0., 0.1, ph) * (1. - smoothstep(0.7, 1., ph)) * step(0., s);
  vC = vec3(0.60, 0.62, 0.70);
  gl_PointSize = uPx * clamp(14. / -mv.z, 0.8, 5.);
  gl_Position = projectionMatrix * mv;
}`;
const SANDP_FS = /* glsl */`varying float vI; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q, q) * 12.); gl_FragColor = vec4(vC * vI * a, 1.); }`;

const VEIL_FS = /* glsl */`
${GLSL.snoise}
uniform float uTime, uBack, uOp, uAspect;
uniform vec3 uCol;
varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float n = snoise(vec3(p.x * 1.6 - uTime * 1.3, p.y * 2.2, uTime * 0.35)) * 0.5
          + snoise(vec3(p.x * 4.0 - uTime * 3.1, p.y * 5.5, uTime * 0.6)) * 0.3
          + snoise(vec3(p.x * 1.5 - uTime * 9., p.y * 40., 1.)) * 0.2;
  float edgeB = uBack + n * 0.10 - (vUv.y - 0.5) * 0.12;
  float cover = smoothstep(edgeB - 0.04, edgeB + 0.25, vUv.x);
  vec3 c = uCol * (0.7 + 0.5 * n) * (0.85 + 0.3 * vUv.y);
  gl_FragColor = vec4(c, clamp(cover * (0.85 + 0.15 * n) * uOp, 0., 1.));
}`;

// Orion relative to Alnilam: [ΔRA·cosδ (deg, +east), ΔDec (deg), V mag, B−V]
const ORION = [
  [0, 0, 1.69, -0.18],          // Alnilam (ε Ori)
  [1.36, -0.75, 1.77, -0.21],   // Alnitak (ζ)
  [-1.38, 0.90, 2.23, -0.22],   // Mintaka (δ)
  [4.06, 8.61, 0.50, 1.85],     // Betelgeuse (α)
  [-5.50, -6.99, 0.13, -0.03],  // Rigel (β)
  [-3.24, 7.52, 1.64, -0.22],   // Bellatrix (γ)
  [1.85, -8.47, 2.06, -0.17],   // Saiph (κ)
  [0.65, 11.14, 3.39, -0.16],   // Meissa (λ)
  [-0.03, -4.20, 2.77, -0.24],  // Hatysa (ι)
  [-0.05, -3.4, 4.0, 0.0],      // M42 region (θ)
  [-0.12, -3.0, 4.6, -0.1],     // sword
  [-6.4, 6.2, 3.7, -0.1], [-7.2, 4.5, 3.6, -0.1], [-7.6, 2.4, 4.4, 0.0], [-7.4, 0.8, 4.5, 0.0],   // shield (π)
  [2.9, 13.6, 4.4, 0.2], [5.4, 12.9, 4.1, 0.3],   // club
];

export default {
  async init({ THREE, aspect, util, H, W }) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, aspect, 0.5, 30000);
    const pxScale = H / 804;
    const R = util.rng(77);
    const v3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) });
    const moonDir = new THREE.Vector3(0.88, 0.47, -0.077).normalize();
    const U = {
      uTime: { value: 0 }, uCam: v3(), uMoonDir: { value: moonDir }, uMoonCol: v3(0.62, 0.72, 0.98),
      uAmb: v3(0.030, 0.040, 0.070), uHaze: v3(), uFogDen: { value: 0.00009 },
      uHoles: { value: 1 }, uSandY: { value: 140 }, uFlow: { value: 1 },
    };
    const mat = (vs, fs, extra = {}, opts = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: vs, fragmentShader: fs, ...opts });

    // ---------- sky
    const mwPole = new THREE.Vector3(-0.55, 0.35, 0.76).normalize();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), mat(SKY_VS, SKY_FS, { uMWPole: { value: mwPole } }, { side: THREE.BackSide, depthWrite: false }));
    sky.renderOrder = 10; sky.frustumCulled = false;
    scene.add(sky);

    // ---------- the Great Pyramid: 4 faces (south face finely tessellated for nothing but precision)
    const casingMat = mat(CASING_VS, CASING_FS);
    const faceGeo = (corners) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners.flat()), 3));
      g.computeVertexNormals();
      return g;
    };
    const apex = [0, HP, 0];
    const c00 = [-A, 0, -A], c10 = [A, 0, -A], c11 = [A, 0, A], c01 = [-A, 0, A];
    const faces = [
      [c10, c00, apex],    // south (climbed)
      [c11, c10, apex],    // east
      [c01, c11, apex],    // north
      [c00, c01, apex],    // west
    ];
    const pyr = new THREE.Group();
    for (const f of faces) {
      const m = new THREE.Mesh(faceGeo(f), casingMat);
      m.frustumCulled = false; pyr.add(m);
    }
    scene.add(pyr);
    // stepped core behind the south face
    {
      const pos = [], nrm = [];
      const quad = (a, b, c, d, n) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) nrm.push(...n); };
      const zPlane = y => -A + y / (HP / A);
      const nC = Math.floor(HP / HC) - 1;
      for (let k = 0; k < nC; k++) {
        const y0 = k * HC, y1 = (k + 1) * HC;
        const zk = zPlane(y1) + CASE, zk1 = zPlane(y1 + HC) + CASE;
        const hw = A - y1 / (HP / A) - 0.5;
        if (hw < 1) break;
        quad([-hw, y0, zk], [hw, y0, zk], [hw, y1, zk], [-hw, y1, zk], [0, 0, -1]);          // riser
        quad([-hw, y1, zk], [hw, y1, zk], [hw, y1, zk1], [-hw, y1, zk1], [0, 1, 0]);          // tread
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      const core = new THREE.Mesh(g, mat(CASING_VS, CORE_FS, {}, { side: THREE.DoubleSide }));
      core.frustumCulled = false; core.renderOrder = 1;
      scene.add(core);
    }
    // the two other pyramids (silhouettes in the moonlight), far to the north-east
    const pyrAt = (x, z, a, h, rot) => {
      const ap = [0, h, 0], p = [[-a, 0, -a], [a, 0, -a], [a, 0, a], [-a, 0, a]];
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(faceGeo([p[(i + 1) % 4], p[i], ap]), mat(CASING_VS, CASING_FS, { uHoles: { value: 0 }, uSandY: { value: -100 }, uFlow: { value: 0 } })); m.frustumCulled = false; g.add(m); }
      g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g); return g;
    };
    pyrAt(720, -60, 107.5, 143.5, 0.12);     // Khafre
    pyrAt(1450, -260, 51.7, 65.0, -0.05);     // Menkaure

    // ---------- desert + Nile
    const dg = new THREE.PlaneGeometry(40000, 40000, 4, 4); dg.rotateX(-Math.PI / 2);
    const desert = new THREE.Mesh(dg, mat(CASING_VS, DESERT_FS, { uNileX: { value: 5200 } }));
    desert.position.y = -0.05; desert.frustumCulled = false;
    scene.add(desert);

    // ---------- stars: real-looking magnitude distribution on the sphere
    const starGroup = new THREE.Group();
    const NS = 9000, sp = new Float32Array(NS * 3), sa = new Float32Array(NS * 4);
    for (let i = 0; i < NS; i++) {
      const z = R() * 2 - 1, ph = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      sp.set([r * Math.cos(ph) * 15000, z * 15000, r * Math.sin(ph) * 15000], i * 3);
      // N(<m) ∝ 10^(0.45 m) between m = 0.5 and 7.2
      const u = R(), m0 = 2.2, m1 = 7.4, k = 0.45 * Math.LN10;
      const m = Math.log(Math.exp(k * m0) + u * (Math.exp(k * m1) - Math.exp(k * m0))) / k;
      const flux = Math.pow(10, -0.4 * (m - 1.5)) * 4.0 + 0.06;
      const bv = Math.min(1, Math.max(0, 0.35 + util.rng(i + 5)() * 0.0 + (R() - 0.45) * 0.7));
      sa.set([flux, bv, R(), 0], i * 4);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aS', new THREE.BufferAttribute(sa, 4));
    const starU = { uPx: { value: 1.0 * pxScale }, uStarI: { value: 1 }, uTime: U.uTime };
    const starMat = new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VS, fragmentShader: STAR_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; stars.renderOrder = 11;
    starGroup.add(stars);
    // Orion, built in a tangent frame around Alnilam's direction (set in update from the final framing)
    const og = new THREE.BufferGeometry();
    const op = new Float32Array(ORION.length * 3), oa = new Float32Array(ORION.length * 4);
    ORION.forEach((s, i) => { oa.set([Math.pow(10, -0.4 * (s[2] - 1.5)) * 4.0, Math.min(1, Math.max(0, (s[3] + 0.3) / 2.1)), R(), 0], i * 4); });
    og.setAttribute('position', new THREE.BufferAttribute(op, 3)); og.setAttribute('aS', new THREE.BufferAttribute(oa, 4));
    const orion = new THREE.Points(og, starMat); orion.frustumCulled = false; orion.renderOrder = 11;
    starGroup.add(orion);
    scene.add(starGroup);

    // ---------- sliding sand grains
    const NG = 9000, gs = new Float32Array(NG * 4);
    for (let i = 0; i < NG; i++) gs.set([(R() - 0.5) * 180, R(), R(), R()], i * 4);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NG * 3), 3)); gg.setAttribute('aS', new THREE.BufferAttribute(gs, 4));
    const grainU = { uTime: U.uTime, uPx: { value: 1.6 * pxScale }, uI: { value: 0 }, uSandY: U.uSandY };
    const grains = new THREE.Points(gg, new THREE.ShaderMaterial({ uniforms: grainU, vertexShader: SANDP_VS, fragmentShader: SANDP_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    grains.frustumCulled = false; grains.renderOrder = 12;
    scene.add(grains);

    // ---------- screen-space layers: sand veil, star glint
    const ovScene = new THREE.Scene(), ovCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    const qv = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
    const veilU = { uTime: { value: 0 }, uBack: { value: 0 }, uOp: { value: 1 }, uAspect: { value: aspect }, uCol: v3(0.20, 0.21, 0.25) };
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), new THREE.ShaderMaterial({ uniforms: veilU, vertexShader: qv, fragmentShader: VEIL_FS, transparent: true, depthTest: false, depthWrite: false }));
    veil.renderOrder = 1;
    const glintU = { uI: { value: 0 }, uSpike: { value: 0 }, uAspect: { value: aspect }, uWarm: { value: 0 }, uPos: { value: new THREE.Vector2(0.5, 0.68) }, uRes: { value: new THREE.Vector2(1920, 804) } };
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), new THREE.ShaderMaterial({ uniforms: glintU, vertexShader: qv, fragmentShader: GLINT_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    glint.renderOrder = 2;
    ovScene.add(veil, glint);

    return {
      scene, camera, THREE, util, U, sky, starGroup, orion, op, starU, grains, grainU, veil, veilU, glint, glintU, ovScene, ovCam, pxScale,
      q: new THREE.Quaternion(), e: new THREE.Euler(), tmp: new THREE.Vector3(),
    };
  },

  // camera orientation as yaw (0 = +z, + toward +x), pitch, roll in degrees
  _cam(S, t) {
    const { track } = S.util;
    const P = (s, w, h) => [w, s * SIN + h * COS, -A + s * COS - h * SIN];
    const pos = track([
      [0, P(26, 50, 7)],
      [2.6, P(60, 22, 8)],
      [6.3, P(130, 2, 10)],
      [7.6, P(158, 0, 7)],
      [8.7, [0, HP + 3.5, -1]],
      [15.5, [0, HP + 6.5, 5]],
    ], t, 'inOutSine');
    const ypr = track([
      [0, [64, 4, 2]],
      [1.8, [50, 14, 1]],
      [3.0, [8, 47, 0]],
      [3.6, [0, 52, 0]],
      [6.3, [0, 52, 0]],
      [7.6, [0, 49, 0]],
      [8.7, [0, 50, 0]],
      [14.0, [0, 58, 0], 'inOutCubic'],
      [15.5, [0, 58, 0]],
    ], t, 'inOutSine');
    const fov = track([[0, 40], [3, 36], [8.6, 34]], t);
    return { pos, ypr, fov };
  },

  update(S, t) {
    const { THREE, util, U, camera } = S;
    const { track, smoothstep, clamp, lerp } = util;
    U.uTime.value = t;
    const deg = Math.PI / 180;
    const setCam = (cam, st) => {
      cam.position.fromArray(st.pos);
      // three's camera looks down −z; yaw 0 should look toward +z → add π about y; pitch up = +x rotation
      cam.quaternion.setFromEuler(S.e.set(st.ypr[1] * deg, Math.PI + st.ypr[0] * deg, st.ypr[2] * deg, 'YXZ'));
      cam.fov = st.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    };
    const st = this._cam(S, t);
    setCam(camera, st);
    U.uCam.value.copy(camera.position);
    S.sky.position.copy(camera.position);
    S.starGroup.position.copy(camera.position);

    // Orion: place Alnilam where the final camera sees screen (0.5, 0.32)
    if (!S.orionPlaced) {
      const fin = this._cam(S, 15.5);
      const c2 = camera.clone(); setCam(c2, fin);
      const ndc = new THREE.Vector3(0, 1 - 2 * 0.32, 0.5).unproject(c2).sub(c2.position).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const east = new THREE.Vector3().crossVectors(up, ndc).normalize();   // screen-left = east
      const north = new THREE.Vector3().crossVectors(ndc, east).normalize();
      // rotate the asterism a little so the belt tilts as seen from the northern hemisphere
      const rot = -18 * deg;
      ORION.forEach((s, i) => {
        const x = s[0] * Math.cos(rot) - s[1] * Math.sin(rot), y = s[0] * Math.sin(rot) + s[1] * Math.cos(rot);
        const d = ndc.clone().addScaledVector(east, Math.tan(x * deg)).addScaledVector(north, Math.tan(y * deg)).normalize().multiplyScalar(14000);
        S.op.set([d.x, d.y, d.z], i * 3);
      });
      S.orion.geometry.attributes.position.needsUpdate = true;
      S.alnilam = ndc.clone();
      S.orionPlaced = true;
    }

    // sand slides off: front descends the face; grains stream down
    const sandY = track([[0, 95], [0.6, 88], [3.2, -8]], t, 'inQuad');
    U.uSandY.value = sandY;
    U.uFlow.value = 1 - smoothstep(2.5, 4.5, t);
    S.grainU.uI.value = (1 - smoothstep(2.8, 4.2, t)) * 1.4;
    S.grains.visible = t < 4.3;

    // veil: the mud scene's sand wall passing on to the right
    S.veilU.uTime.value = t + 30;
    S.veilU.uBack.value = track([[0, -0.3], [1.6, 1.35]], t, 'inOutSine');
    S.veil.visible = t < 1.7;

    // stars brighten as the sky opens
    S.starU.uStarI.value = track([[0, 0.55], [3, 0.8], [9, 1.0]], t);

    // glint on Alnilam
    const proj = S.tmp.copy(S.alnilam).multiplyScalar(14000).add(camera.position).project(camera);
    S.glintU.uPos.value.set(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5);
    const tg = GLINT_T;
    const flare = smoothstep(tg - 0.08, tg + 0.15, t) * (1 - 0.45 * smoothstep(tg + 0.3, tg + 1.4, t));
    const grow = smoothstep(tg + 1.5, tg + 3.0, t);
    S.glintU.uI.value = 0.0 + flare * 1.2 + grow * 2.2;
    S.glintU.uSpike.value = flare * 1.1 + grow * 1.6;
    S.glintU.uWarm.value = grow * 0.85;
    S.glint.visible = t > tg - 0.2;
  },

  draw(S, r, target, t) {
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(S.scene, S.camera);
    const ac = r.autoClear; r.autoClear = false;
    r.render(S.ovScene, S.ovCam);
    r.autoClear = ac;
  },

  grade(S, t) {
    return {
      exposure: 1.15,
      saturation: 0.92,
      contrast: 1.05,
      tint: [0.97, 1.0, 1.04],
      lift: [0.0, 0.004, 0.012],
      vignette: 0.45,
      bloom: { strength: 0.75, radius: 0.55, threshold: 0.7 },
    };
  },
};
