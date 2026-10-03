// PROLOGUE · 作者  (0 – 39.5)
// P1 cursor · P2 typing (overlay) · P3 the text becomes sand and falls to a dark plain ·
// P4 pre-dawn plain, river, wind · P5 dust devil (title), blown apart, sand curtain → mud.
import { CURSOR, HITS, TYPING_PROLOGUE, DISINTEGRATE } from '../cues.js';
import { drawTyping, loadTypingFonts, REF_W, REF_H, layoutOf } from './prologue_typing.js';
import { makeSky, makeGround, makeRiver, SPRITE_FRAG, STREAK_FRAG, OCC_FRAG, spline, INK_LIN } from './prologue_world.js';
import { smoothstep, clamp, track, rng, GLSL } from '../engine/util.js';

// ---- the hand-off geometry -------------------------------------------------------------
const FOV = 30;              // vertical, degrees
const Y0 = 40;               // altitude of the camera when the text is "written in the sky"
const D = 10;                // distance from the camera to the text plane at t = DISINTEGRATE
const SS = 2;                // supersampling of the rasterised layout (grains per ref px = SS²)
const T16 = DISINTEGRATE;
const SHED0 = T16 + 0.5;     // grains breathe 0.5 s, then shed left → right
const SHED_DUR = 1.9;

// Overlay push-in: a zoom about the text block centre ≡ dolly of the 3D camera toward the plane.
const ZC = [1010, 410];
const kz = t => 1 + 0.0018 * Math.pow(Math.max(0, t - 6), 1.25);

// Camera after the hand-off: offsets from the dolly position, and pitch (deg).
const CAM_OFF = [
  [SHED0 - 0.1, [0, 0, 0]],
  [18.4, [0.1, 3.2, -5.5]],
  [19.6, [0.3, 5.0, -11.5]],
  [20.8, [0.4, -1.0, -14.5]],
  [21.9, [0.4, -14, -16.0]],
  [22.9, [0.4, -28, -15.5]],
  [23.9, [0.3, -36.4, -13.6]],
  [25.2, [0.3, -38.2, -12.5]],
  [31.0, [0.3, -38.45, -17]],
  [39.5, [0.2, -38.5, -23]],
];
const CAM_PITCH = [
  [SHED0 - 0.1, 0], [18.0, -22], [19.4, -62], [20.6, -70], [21.5, -60], [22.4, -36], [23.3, -13], [24.3, 0.0], [25.6, 4.4], [31, 5.3], [35, 5.6], [39.5, 5.9],
];
const CAM_YAW = [[SHED0 - 0.1, 0], [21, -2], [25, 1.5], [31, 0.5], [39.5, -1.0]];

const DEVIL = [5.5, 0, -118];   // dust devil base (world)
const HMAX = 150;

function camPose(t) {
  // dolly toward the text block centre: image scale about ZC = kz(t)/kz(T16)
  const sDolly = 1 - kz(T16) / kz(t);
  const B = unproject(ZC[0], ZC[1]);
  const pos = [B[0] * sDolly, Y0 + (B[1] - Y0) * sDolly, B[2] * sDolly];
  const off = t > SHED0 - 0.1 ? spline(CAM_OFF, t) : [0, 0, 0];
  return {
    pos: [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]],
    pitch: t > SHED0 - 0.1 ? spline(CAM_PITCH, t) : 0,
    yaw: t > SHED0 - 0.1 ? spline(CAM_YAW, t) : 0,
  };
}

// reference-pixel → world point on the text plane (camera at (0,Y0,0) looking −z)
function unproject(px, py) {
  const th = Math.tan(FOV * Math.PI / 360);
  const nx = (px / REF_W) * 2 - 1, ny = 1 - (py / REF_H) * 2;
  return [nx * D * th * (REF_W / REF_H), Y0 + ny * D * th, -D];
}

// overlay opacity a (sRGB ink·a over black) → linear HDR value that the grade maps back to it
function inkHDR(a) {
  const target = (() => { const v = 0.925 * a; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })();
  const aces = x => (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  let lo = 0, hi = 8;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (aces(m) < target) lo = m; else hi = m; }
  return lo / 0.84;   // grains are tinted with the linear ink colour (~0.84 luminance)
}

// wind displacement (integral of wind speed)
const windPos = t => 2.6 * t + 0.55 * Math.pow(Math.max(0, t - 30), 2) + 1.6 * Math.pow(Math.max(0, t - 35.5), 2);

// ---- shaders ------------------------------------------------------------------------------
const GRAIN_VERT = /* glsl */`
uniform float uT, uPx, uT16;
attribute vec4 aD;   // x: HDR energy at the hand-off, y: seed, z: release time, w: seed2
attribute float aC;  // glyph coverage
varying vec3 vC; varying float vA;
${GLSL.snoise}
${GLSL.hash}
void main(){
  vec3 p = position;
  float s1 = aD.y, s2 = aD.w;
  float tau = max(uT - aD.z, 0.);
  float br = smoothstep(uT16, uT16 + .3, uT);
  float pre = 1. - smoothstep(0., .3, tau);
  // breathing
  p.xy += vec2(sin(uT * 8.3 + s1 * 40.), cos(uT * 7.1 + s2 * 40.)) * .0011 * br * pre * (.3 + s2);
  // drag-limited fall, wind drift, coherent turbulence
  float k = .55 + .5 * s2, vt = 6.5 + 4. * s1;
  float fall = vt * (tau - k * (1. - exp(-tau / k)));
  float pop = .05 * (1. - exp(-tau * 5.)) * s2;
  float drT = tau - 1.1 * (1. - exp(-tau / 1.1));
  vec3 q = position * vec3(.5, 1.2, .5) + vec3(0., fall * .09, 0.);
  float ts = uT * .13;
  vec3 turb = vec3(snoise(q + vec3(0., ts, 0.)), snoise(q + vec3(31.7, ts, 7.)), snoise(q + vec3(-11., ts, 53.)));
  // curl of a scalar potential in the horizontal plane → swirling sheets
  vec3 qc = q * .55 + vec3(4., 0., 0.);
  float e = .35;
  float c0 = snoise(qc), cx = snoise(qc + vec3(e, 0., 0.)), cz = snoise(qc + vec3(0., 0., e));
  vec2 curl = vec2(cz - c0, -(cx - c0)) / e;
  vec3 jit = hash31(s1 * 917. + s2 * 13.) - .5;
  float A = tau * tau / (1. + .5 * tau) * .42;
  p += turb * vec3(2.4, .5, 2.4) * A + vec3(curl.x, 0., curl.y) * 3. * A + jit * vec3(1.2, .8, 1.2) * A * .4;
  p += vec3(1.3, 0., -5.0) * drT;
  p.y += pop - fall;
  float under = .03 - p.y;
  float land = smoothstep(-.2, 5., under);
  p.y = max(p.y, .03);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float rel = smoothstep(0., .9, tau);
  float dist = max(-mv.z, .01);
  float S = uPx * .013333 * (1. + .5 * rel + .3 * tau) / dist;
  float Sc = clamp(S, 1., 48.);
  gl_PointSize = Sc;
  float tw = .6 + .4 * sin(uT * (5. + 9. * s2) + s1 * 80.);
  float val = aD.x * smoothstep(uT16 - .01, uT16 + .2, uT) * (1. + .2 * sin(uT * 9. + s1 * 60.) * br * pre);
  val = mix(val, aC * (.3 + .9 * smoothstep(1., 4.5, tau)), rel) * (1. + rel * (.6 + 1.6 * tw * tw)) / (1. + .2 * tau) * smoothstep(1.2, 4., dist + (1. - rel) * 9.);
  val *= 1. - land;
  // grains warm toward sand as they fall
  vC = mix(vec3(${INK_LIN.join(',')}), vec3(1., .70, .36), rel * .7);
  float Se = min(S, 3.);   // near grains defocus rather than flare
  vA = val * .249 * Se * Se / max(.249 * Sc * Sc, 1.);
}`;

const STREAK_VERT = /* glsl */`
uniform float uT, uPx, uWind, uAmt, uDawn, uLine, uPulse;
uniform vec3 uCam;
attribute vec4 aD;   // x0 (0..1), lane (0..1), height (0..1), seed
varying vec3 vC; varying float vA; varying float vK;
${GLSL.snoise}
void main(){
  float s = aD.w;
  float lane = floor(aD.y * 70.);
  float d = 4. + 90. * pow((lane + .5) / 70., 1.5) + (fract(s * 5.1) - .5) * .35;
  float span = 2. * (.8 * d + 6.);
  float spd = .8 + .4 * fract(s * 7.31);
  float x = mod(aD.x * span + uWind * spd * (1.1 - .3 * fract(lane * .37)), span) - span * .5;
  float zw = sin(x * .11 + lane * 1.7 + uT * .15) * 1.2 + sin(x * .043 + lane) * 2.;
  vec3 p = vec3(uCam.x + x, .02 + .25 * pow(aD.z, 4.), uCam.z - d + zw);
  // gusts travelling along each lane
  float g = snoise(vec3(x * .035 - uWind * .025, lane * .61, uT * .05));
  float m = smoothstep(.3, .85, g);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, .01);
  float S = uPx * (.3 + .3 * fract(s * 3.7)) / dist;
  float Sc = clamp(S, 2., 40.);
  gl_PointSize = Sc;
  vK = clamp(Sc / .9, 1., 40.);
  float edge = smoothstep(span * .5, span * .42, abs(x));
  vA = m * edge * uAmt * (.4 + .6 * fract(s * 13.1)) * min(S / Sc, 1.) * .35;
  vC = vec3(1., .62, .36) * (.16 + .2 * uLine) * uDawn * (1. + uPulse * .6);
}`;

const DEVIL_VERT = /* glsl */`
uniform float uT, uPx, uForm, uSuck, uDisT, uPulse, uDawn;
uniform vec3 uBase;
attribute vec4 aD;   // seed1, seed2, seed3, type (0 core, 1 sheath, 2 inflow, 3 skirt)
varying vec3 vC; varying float vA; varying float vO;
${GLSL.snoise}
${GLSL.hash}
const float HMAX = ${HMAX.toFixed(1)};
void main(){
  float s1 = aD.x, s2 = aD.y, s3 = aD.z, ty = aD.w;
  vec3 p; float a = 1.; float h = 0.; float occ = .0;
  if (ty < 1.5) {
    float sh = ty;
    float u = fract(s1 + uT * (.035 + .05 * s2));
    h = pow(u, 1.8) * HMAX;
    float wob = snoise(vec3(h * .09, uT * .5, s3 * 5.));
    float r = (.8 + .028 * h + .0002 * h * h) * (sh > .5 ? 1.2 + 1.3 * s3 : .2 + .8 * sqrt(s3)) * (1. + .35 * wob);
    float ang = s2 * 6.2832 + uT * (2.0 - .006 * h) * (sh > .5 ? .65 : 1.) + wob * .6;
    vec2 ax = vec2(snoise(vec3(h * .016, uT * .1, 1.)), snoise(vec3(h * .016, uT * .1, 7.))) * (.8 + h * .06);
    ax.x += h * .035;
    p = uBase + vec3(cos(ang) * r + ax.x, h, sin(ang) * r + ax.y);
    a = smoothstep(0., .03, u) * smoothstep(uForm, uForm - 12., h) * (sh > .5 ? .5 : 1.);
    a *= .65 + .35 * smoothstep(-1., 1., sin(ang - .6));
    occ = sh > .5 ? .55 : .35;
  } else if (ty < 2.5) {
    // ground inflow: spiral sucked toward the base
    float v = fract(s1 + uT * .3);
    float r = mix(26. + 22. * s3, 1.0, v * v * (3. - 2. * v));
    float ang = s2 * 6.2832 + 2.4 * log(30. / r) + uT * .4;
    h = .04 + pow(v, 5.) * 3.;
    p = uBase + vec3(cos(ang) * r, h, sin(ang) * r);
    a = smoothstep(0., .25, v) * smoothstep(1., .85, v) * uSuck * .7;
    occ = .2;
  } else {
    // skirt: churning debris around the foot
    float v = fract(s1 + uT * .5);
    float r = 1. + 4.5 * s3 * (.6 + .4 * v);
    float ang = s2 * 6.2832 + uT * 1.4 / (.5 + .25 * r);
    h = 3.2 * v * v * (1. - .5 * s3);
    p = uBase + vec3(cos(ang) * r, h, sin(ang) * r);
    a = sin(v * 3.1416) * uSuck * .5 * smoothstep(-2., 2., uForm);
    occ = .22;
  }
  // disintegration: from the top down, blown right
  float tau = max(h > 30. ? uDisT - (h - 30.) * .02 : uDisT - (30. - h) * .1, 0.);
  if (tau > 0.) {
    vec3 q = p * .06;
    vec3 tb = vec3(snoise(q + vec3(0., uT * .2, 0.)), snoise(q + vec3(5., uT * .2, 9.)), snoise(q + vec3(9., uT * .2, 3.)));
    vec3 jt = hash31(s1 * 311. + s3 * 71.) - .5;
    p += vec3(1.5 * tau + 3.4 * tau * tau, .9 * tau, -.8 * tau * tau) + tb * vec3(4., 2.5, 4.) * tau + jt * vec3(9., 6., 9.) * tau;
    a *= exp(-tau * .7);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, .01);
  float big = ty > .5 && ty < 1.5 ? 4.5 : ty > 2.5 ? 2.5 : 1.;
  float S = uPx * (.05 + .06 * s3) * big / dist;
  float Sc = clamp(S, 1.2, 40.);
  gl_PointSize = Sc;
  vec3 sand = mix(vec3(1., .56, .28), vec3(1., .74, .5), s2);
  vC = sand * (.20 + .12 * uDawn) * (1. + uPulse * 2.2) / (big > 1. ? 7. : 1.);
  vA = a * min(S * S / (Sc * Sc), 1.) * 1.5;
  vO = occ;
}`;

const CURTAIN_VERT = /* glsl */`
uniform float uT, uPx, uC;
attribute vec4 aD;   // lane, depth, y, seed
varying vec3 vC; varying float vA; varying float vK;
void main(){
  float s = aD.w;
  float d = .5 + 9. * pow(aD.y, 1.4);
  float hw = d * ${(Math.tan(FOV * Math.PI / 360) * REF_W / REF_H).toFixed(5)}, hh = d * ${Math.tan(FOV * Math.PI / 360).toFixed(5)};
  float sp = 2.6 + .9 * fract(s * 5.3);
  float xn = -1.15 - aD.x * 2.2 + uC * sp;
  float yn = (aD.z * 2. - 1.) * 1.15 - .3 * uC * uC * fract(s * 3.1) + .06 * sin(xn * 3. + s * 20.);
  vec3 p = vec3(xn * hw, yn * hh, -d);
  gl_Position = projectionMatrix * vec4(p, 1.);
  // motion-blurred streaks: length ∝ screen speed (≈ constant in normalised coords), thin
  float L = uPx * hw * sp * .016 / d * (.7 + .6 * fract(s * 11.7));
  float th = uPx * (.0008 + .0025 * pow(fract(s * 7.9), 4.)) / d;
  float Sc = clamp(L, 2., 90.);
  gl_PointSize = Sc;
  vK = clamp(Sc / max(th, .8), 1., 60.);
  float on = smoothstep(-1.4, -1.05, xn) * smoothstep(1.4, 1.05, xn);
  vC = mix(vec3(1., .52, .22), vec3(1., .72, .45), fract(s * 2.3)) * 1.1;
  float band = .35 + .65 * smoothstep(-.2, .9, sin(yn * 5.3 + 1.7) * .6 + sin(yn * 13.1 - xn * 1.3 + 4.) * .4);
  vA = on * band * (.2 + .8 * fract(s * 17.)) * smoothstep(0., .15, uC) * min(th / .8, 1.) * .38;
}`;

function points(THREE, n, attrs, vert, frag, uniforms, blending) {
  const geo = new THREE.BufferGeometry();
  for (const [k, v, sz] of attrs) geo.setAttribute(k, new THREE.BufferAttribute(v, sz));
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: true, blending: blending ?? THREE.AdditiveBlending });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

export default {
  async init({ THREE, aspect, W, H }) {
    await loadTypingFonts(TYPING_PROLOGUE);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.05, 9000);
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    const uPx = (H / 2) / Math.tan(FOV * Math.PI / 360);

    const world = {
      uDawn: { value: 0 }, uLine: { value: 0 }, uSun: { value: new THREE.Vector3(Math.sin(0.22), 0, -Math.cos(0.22)) },
      uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uStars: { value: 0 }, uPool: { value: new THREE.Vector4() },
    };
    const sky = makeSky(THREE, world);
    const ground = makeGround(THREE, world);
    const P4Z = -12;
    const river = makeRiver(THREE, world, [
      [300, 60], [120, 26], [40, 6], [P4Z + 30, -6], [P4Z - 2, -7.5], [P4Z - 25, -3], [P4Z - 60, 12], [P4Z - 115, 25], [P4Z - 190, 14],
      [P4Z - 300, -24], [P4Z - 470, -42], [P4Z - 700, -5], [P4Z - 1000, 70], [P4Z - 1500, 60], [P4Z - 2300, -60], [P4Z - 3600, 40], [P4Z - 5200, 0],
    ], c => 5.5 + 0.012 * Math.max(0, P4Z - c.z));
    scene.add(sky, ground, river);

    // ---- grains: rasterise the exact overlay layout at DISINTEGRATE ----
    const L = layoutOf(TYPING_PROLOGUE);
    const ys = L.lines.filter(l => l.style !== 'gap').map(l => l.y);
    const box = [CURSOR.x * REF_W - 30, Math.min(...ys) - 40, REF_W - 260, Math.max(...ys) + 40];
    const cw = Math.ceil((box[2] - box[0]) * SS), ch = Math.ceil((box[3] - box[1]) * SS);
    // pass 1: coverage (every run at full opacity); pass 2: the real style opacities
    const raster = (alphaFn) => {
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d', { willReadFrequently: true });
      drawTyping(g, SS, { events: TYPING_PROLOGUE, t: T16, zoom: kz(T16), center: ZC, idleAnchor: HITS.cursorIn, glow: false, offset: [box[0], box[1]], alphaFn });
      return g.getImageData(0, 0, cw, ch).data;
    };
    const cov = raster(() => 1), img = raster(null);
    const pos = [], dat = [], cvg = [];
    const R = rng(20160);
    let minX = 1e9, maxX = -1e9;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = (y * cw + x) * 4 + 3, c = cov[k];
      if (c < 5) continue;
      const styleA = Math.min(1, img[k] / c);
      const px = box[0] + (x + 0.5) / SS, py = box[1] + (y + 0.5) / SS;
      const w = unproject(px, py);
      pos.push(w[0], w[1], w[2]);
      // HDR energy that reproduces the overlay's sRGB ink·alpha after ACES (per supersample)
      dat.push((c / 255) * inkHDR(styleA) / (SS * SS), R(), px, R());
      cvg.push(c / 255);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    }
    const nG = pos.length / 3;
    console.log("prologue grains", nG);
    for (let i = 0; i < nG; i++) {
      const xn = (dat[i * 4 + 2] - minX) / (maxX - minX);
      dat[i * 4 + 2] = SHED0 + xn * SHED_DUR + (R() - 0.5) * 0.45 + (R() < 0.04 ? -0.3 * R() : 0);
    }
    const gU = { uT: { value: 0 }, uPx: { value: uPx }, uT16: { value: T16 } };
    const grains = points(THREE, nG, [['position', new Float32Array(pos), 3], ['aD', new Float32Array(dat), 4], ['aC', new Float32Array(cvg), 1]], GRAIN_VERT, SPRITE_FRAG, gU);
    scene.add(grains);

    // ---- wind streaks over the plain ----
    const NS = 30000, sd = new Float32Array(NS * 4), r2 = rng(77);
    for (let i = 0; i < NS * 4; i++) sd[i] = r2();
    const sU = { uT: { value: 0 }, uPx: { value: uPx }, uWind: { value: 0 }, uAmt: { value: 0 }, uDawn: world.uDawn, uLine: world.uLine, uPulse: { value: 0 }, uCam: world.uCam };
    const streaks = points(THREE, NS, [['position', new Float32Array(NS * 3), 3], ['aD', sd, 4]], STREAK_VERT, STREAK_FRAG, sU);
    scene.add(streaks);

    // ---- dust devil ----
    const ND = 60000, dd = new Float32Array(ND * 4), r3 = rng(4242);
    for (let i = 0; i < ND; i++) {
      dd[i * 4] = r3(); dd[i * 4 + 1] = r3(); dd[i * 4 + 2] = r3();
      const u = r3(); dd[i * 4 + 3] = u < 0.46 ? 0 : u < 0.80 ? 1 : u < 0.92 ? 2 : 3;
    }
    const dU = { uT: { value: 0 }, uPx: { value: uPx }, uForm: { value: 0 }, uSuck: { value: 0 }, uDisT: { value: -10 }, uPulse: { value: 0 }, uDawn: world.uDawn, uBase: { value: new THREE.Vector3(...DEVIL) } };
    const devil = points(THREE, ND, [['position', new Float32Array(ND * 3), 3], ['aD', dd, 4]], DEVIL_VERT, OCC_FRAG, dU, THREE.CustomBlending);
    Object.assign(devil.material, { blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    scene.add(devil);

    // ---- sand curtain across the lens (camera space) ----
    const NC = 26000, cd = new Float32Array(NC * 4), r4 = rng(909);
    for (let i = 0; i < NC * 4; i++) cd[i] = r4();
    const cU = { uT: { value: 0 }, uPx: { value: uPx }, uC: { value: 0 } };
    const curtain = points(THREE, NC, [['position', new Float32Array(NC * 3), 3], ['aD', cd, 4]], CURTAIN_VERT, STREAK_FRAG, cU);
    curtain.material.depthTest = false;
    curtain.renderOrder = 10;
    camera.add(curtain);

    return { scene, camera, clearColor: 0x000000, world, sky, ground, river, grains, gU, streaks, sU, devil, dU, curtain, cU, nG };
  },

  update(S, t) {
    const { camera, world } = S;
    const c = camPose(t);
    camera.position.set(...c.pos);
    camera.rotation.set(c.pitch * Math.PI / 180, c.yaw * Math.PI / 180, 0);
    camera.updateMatrixWorld(true);
    S.sky.position.copy(camera.position);
    world.uCam.value.copy(camera.position);
    world.uT.value = t;
    world.uDawn.value = track([[18.4, 0], [20.6, 0.25], [22.8, 0.62], [25.5, 1.0], [31, 1.05], [36, 1.12], [39.5, 1.2]], t);
    world.uLine.value = track([[20.6, 0], [23.4, 0.8], [27, 1.0], [33, 1.08], [39.5, 1.2]], t);
    // the grain cloud lights the sand it falls onto
    {
      const tau = Math.max(0, t - (SHED0 + SHED_DUR * 0.5)), drT = tau - 1.1 * (1 - Math.exp(-tau / 1.1));
      world.uPool.value.set(0.3 + 1.3 * drT, -D - 5.0 * drT, 7 + 1.2 * tau, track([[20.8, 0], [22.6, 0.55], [23.6, 0.45], [26, 0]], t));
    }
    world.uStars.value = track([[19, 0], [23, 1], [30, 0.7], [37, 0.3]], t);
    const lit = t > 18;
    S.sky.visible = S.ground.visible = S.river.visible = lit;

    S.grains.visible = t >= T16 && t < 26;
    S.gU.uT.value = t;

    const sAmt = track([[21.5, 0], [24.5, 0.8], [30, 1], [33, 1.5], [36, 1.8], [39.5, 2.1]], t);
    S.streaks.visible = sAmt > 0.001;
    S.sU.uT.value = t; S.sU.uWind.value = windPos(t); S.sU.uAmt.value = sAmt;

    const pulse = t >= HITS.braam ? 1.4 * smoothstep(HITS.braam, HITS.braam + 0.04, t) * Math.exp(-(t - HITS.braam) / 0.5) : 0;
    S.sU.uPulse.value = pulse;
    S.devil.visible = t > 29.5;
    S.dU.uT.value = t;
    S.dU.uForm.value = track([[30.6, -10], [31.6, 8], [33.0, HMAX + 10, 'outCubic']], t);
    S.dU.uSuck.value = track([[29.8, 0], [31.4, 1], [36.5, 1], [38, 0]], t);
    S.dU.uDisT.value = t - 36.0;
    S.dU.uPulse.value = pulse;

    const cc = (t - 37.9) / 1.6;
    S.curtain.visible = cc > 0 && cc < 1.2;
    S.cU.uC.value = clamp(cc, 0, 1.2);
  },

  grade(S, t) {
    const p = smoothstep(16.2, 19, t), q = smoothstep(21.5, 24, t);
    return {
      exposure: 1.0 + 0.1 * smoothstep(22, 26, t),
      gain: [1 + 0.05 * p, 1, 1 - 0.06 * p],
      vignette: 0.35 + 0.1 * p,
      grain: 0.04,
      bloom: { strength: 0.45 + 0.4 * p - 0.4 * q, radius: 0.5 - 0.1 * q, threshold: t < 16 ? 0.8 : 1.15 - 0.6 * p + 0.1 * q },
    };
  },

  overlay(S, A, t) {
    if (t < HITS.cursorIn || t > T16 + 0.25) return;
    const fadeIn = smoothstep(HITS.cursorIn, HITS.cursorIn + 0.6, t);
    const out = 1 - smoothstep(T16, T16 + 0.2, t);
    drawTyping(A.g, A.s, { events: TYPING_PROLOGUE, t, zoom: kz(t), center: ZC, idleAnchor: HITS.cursorIn, cursor: fadeIn * out, textAlpha: out, W: A.W, H: A.H });
  },
};
