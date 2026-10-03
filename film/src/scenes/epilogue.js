// EPILOGUE · 问  (226 – 260)
// E1: the same cursor as the prologue asks the question; hard cut at EPILOGUE_CUT.
// E2: black under the credits (titles.js CARDS); final two blinks at frame centre.
// The 3D layer is only a faint, nearly subliminal drift of dust so the black breathes.
import { CURSOR, HITS, TYPING_EPILOGUE, EPILOGUE_CUT } from '../cues.js';
import { drawTyping, drawLoneCursor, loadTypingFonts, REF_W, REF_H } from './prologue_typing.js';
import { SPRITE_FRAG } from './prologue_world.js';
import { rng, smoothstep, GLSL } from '../engine/util.js';

const FOV = 30;

const DUST_VERT = /* glsl */`
uniform float uT, uPx, uAmt;
attribute vec4 aD;
varying vec3 vC; varying float vA;
${GLSL.snoise}
void main(){
  float s = aD.w;
  float d = 2.5 + 22. * aD.z;
  float hw = d * ${(Math.tan(FOV * Math.PI / 360) * REF_W / REF_H * 1.15).toFixed(5)}, hh = d * ${(Math.tan(FOV * Math.PI / 360) * 1.15).toFixed(5)};
  // slow rising drift, wrapped; gentle meander
  float y = mod(aD.y * 2. * hh + uT * (.05 + .07 * fract(s * 3.3)), 2. * hh) - hh;
  float x = (aD.x * 2. - 1.) * hw + sin(uT * .11 + s * 40.) * .25;
  vec3 p = vec3(x, y, -d);
  p += vec3(snoise(vec3(p.xy * .2, uT * .04 + s)), snoise(vec3(p.xy * .2 + 9., uT * .04)), 0.) * .3;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  float S = uPx * (.006 + .02 * pow(fract(s * 7.7), 3.)) / d;
  float Sc = clamp(S, 1., 30.);
  gl_PointSize = Sc;
  float tw = .55 + .45 * sin(uT * (.4 + .6 * fract(s * 5.1)) + s * 70.);
  float edge = smoothstep(hh, hh * .8, abs(y));
  vC = vec3(1., .80, .60);
  vA = uAmt * tw * edge * min(S * S / (Sc * Sc), 1.) * (.012 + .03 * fract(s * 2.9));
}`;

export default {
  async init({ THREE, aspect, H }) {
    await loadTypingFonts(TYPING_EPILOGUE);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 100);
    const N = 2600, d = new Float32Array(N * 4), r = rng(260);
    for (let i = 0; i < N * 4; i++) d[i] = r();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aD', new THREE.BufferAttribute(d, 4));
    const uniforms = { uT: { value: 0 }, uPx: { value: (H / 2) / Math.tan(FOV * Math.PI / 360) }, uAmt: { value: 0 } };
    const dust = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: DUST_VERT, fragmentShader: SPRITE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dust.frustumCulled = false;
    scene.add(dust);
    return { scene, camera, clearColor: 0x000000, uniforms };
  },

  update(S, t, info) {
    const g = info.global;
    S.uniforms.uT.value = g;
    // the dust breathes in after the word scene has gone, and lifts a little under the credits
    S.uniforms.uAmt.value = smoothstep(227.0, 231, g) * (1 + 0.6 * smoothstep(238, 244, g));
  },

  grade: {
    exposure: 1.0,
    vignette: 0.4,
    grain: 0.04,
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.8 },
  },

  overlay(S, A, t, info) {
    const g = info.global;
    if (g < EPILOGUE_CUT) {
      drawTyping(A.g, A.s, { events: TYPING_EPILOGUE, t: g, W: A.W, H: A.H });
      return;
    }
    // final blinks at frame centre
    const half = CURSOR.period / 2;
    let a = 0;
    for (const b of HITS.finalBlinks) a = Math.max(a, smoothstep(b - 0.02, b + 0.02, g) * (1 - smoothstep(b + half - 0.02, b + half + 0.02, g)));
    if (a > 0.003) drawLoneCursor(A.g, A.s, REF_W / 2 - CURSOR.w / 2, REF_H / 2, a, A.W, A.H);
  },
};
