// The film engine: owns the renderer, the per-frame timeline evaluation,
// cross-fades between scene segments, bloom and the final grade/overlay pass.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { W, H, FPS, DURATION, SEGMENTS, MASTER } from '../timeline.js';
import { track, smoothstep, lerp } from './util.js';
import * as util from './util.js';
import * as text from './text.js';
import { Overlay } from './overlay.js';

// Global grain trim: the delivery encode is ~2.6 Mbps, and grain is what bitrate starvation turns to mush.
const GRAIN_SCALE = 0.65;

export const DEFAULT_GRADE = {
  exposure: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  tint: [1, 1, 1],
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  vignette: 0.35,
  grain: 0.045,
  aberration: 0.0015,
  bloom: { strength: 0.6, radius: 0.55, threshold: 0.75 },
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, tOverlay: { value: null },
    exposure: { value: 1 }, contrast: { value: 1 }, saturation: { value: 1 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() },
    gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
    vignette: { value: 0.3 }, grain: { value: 0.04 }, aberration: { value: 0.001 },
    black: { value: 0 }, white: { value: 0 }, frame: { value: 0 },
    res: { value: new THREE.Vector2(W, H) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: /* glsl */`
precision highp float;
uniform sampler2D tDiffuse, tOverlay;
uniform float exposure, contrast, saturation, vignette, grain, aberration, black, white, frame;
uniform vec3 tint, lift, gamma, gain;
uniform vec2 res;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-.055, step(.0031308,c)); }
float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv=vUv, d=uv-.5;
  vec3 col;
  col.r=texture2D(tDiffuse, uv-d*aberration).r;
  col.g=texture2D(tDiffuse, uv).g;
  col.b=texture2D(tDiffuse, uv+d*aberration).b;
  col=max(col*exposure*tint, 0.);
  col=aces(col);
  col=clamp(col*gain+lift*(1.-col),0.,1.);
  col=pow(col, 1./gamma);
  float l=dot(col,vec3(.2126,.7152,.0722));
  col=mix(vec3(l),col,saturation);
  col=toSRGB(clamp(col,0.,1.));
  col=clamp((col-.5)*contrast+.5,0.,1.);
  float v=length(d*vec2(res.x/res.y,1.)*.62);
  col*=mix(1., smoothstep(1.05,.25,v), vignette);
  col=mix(col, vec3(0.), black);
  col=mix(col, vec3(1.), white);
  vec4 o=texture2D(tOverlay, uv);
  col=mix(col, o.rgb, o.a);
  vec2 px=uv*res;
  float n=h12(px+fract(frame*.61803)*1000.)+h12(px*1.7+fract(frame*.3819)*800.)-1.;
  float lum=dot(col,vec3(.299,.587,.114));
  col+=n*grain*(1.2-lum);
  col+=(h12(px+frame)-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`,
};

const MixShader = {
  uniforms: { tA: { value: null }, tB: { value: null }, mixv: { value: 0 } },
  vertexShader: FinalShader.vertexShader,
  fragmentShader: /* glsl */`uniform sampler2D tA,tB; uniform float mixv; varying vec2 vUv;
  void main(){ gl_FragColor=mix(texture2D(tA,vUv),texture2D(tB,vUv),mixv); }`,
};

function lerpGrade(a, b, t) {
  const o = {};
  for (const k in DEFAULT_GRADE) {
    const x = a[k], y = b[k];
    if (k === 'bloom') o.bloom = { strength: lerp(x.strength, y.strength, t), radius: lerp(x.radius, y.radius, t), threshold: lerp(x.threshold, y.threshold, t) };
    else if (Array.isArray(x)) o[k] = x.map((v, i) => lerp(v, y[i], t));
    else o[k] = lerp(x, y, t);
  }
  return o;
}
function fullGrade(g) { return { ...DEFAULT_GRADE, ...(g || {}), bloom: { ...DEFAULT_GRADE.bloom, ...((g && g.bloom) || {}) } }; }

export class Film {
  constructor(canvas, { samples = 0, scale = 1 } = {}) {
    this.canvas = canvas;
    this.w = Math.round(W * scale); this.h = Math.round(H * scale);
    canvas.width = this.w; canvas.height = this.h;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setSize(this.w, this.h, false);
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    const rtOpts = { type: THREE.HalfFloatType, samples, depthBuffer: true };
    this.rtA = new THREE.WebGLRenderTarget(this.w, this.h, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(this.w, this.h, rtOpts);
    this.rtMix = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.6, 0.5, 0.8);
    this.finalMat = new THREE.ShaderMaterial({ ...FinalShader, uniforms: THREE.UniformsUtils.clone(FinalShader.uniforms), depthTest: false, depthWrite: false });
    this.finalMat.uniforms.res.value.set(this.w, this.h);
    this.finalQuad = new FullScreenQuad(this.finalMat);
    this.mixMat = new THREE.ShaderMaterial({ ...MixShader, uniforms: THREE.UniformsUtils.clone(MixShader.uniforms), depthTest: false, depthWrite: false });
    this.mixQuad = new FullScreenQuad(this.mixMat);
    this.overlay = new Overlay(this.w, this.h, scale);
    this.finalMat.uniforms.tOverlay.value = this.overlay.texture;
    this.modules = {};
    this.states = {};
  }

  // ctx handed to every scene's init()
  ctx() {
    return { THREE, renderer: this.renderer, W: this.w, H: this.h, aspect: this.w / this.h, FPS, util, text };
  }

  async load(sceneIds) {
    const ids = [...new Set(sceneIds || SEGMENTS.map(s => s.scene))];
    for (const id of ids) {
      if (this.states[id]) continue;
      const mod = (await import(`../scenes/${id}.js`)).default;
      this.modules[id] = mod;
      this.states[id] = await mod.init(this.ctx());
    }
    await this.overlay.load();
  }

  active(t) {
    return SEGMENTS.filter(s => t >= s.start && t < s.end);
  }

  renderSegment(seg, t, target) {
    const mod = this.modules[seg.scene], st = this.states[seg.scene];
    const info = { global: t, start: seg.start, dur: seg.end - seg.start, seg };
    const lt = t - seg.start + (seg.offset || 0);
    mod.update(st, lt, info);
    const r = this.renderer;
    r.setRenderTarget(target);
    if (mod.draw) mod.draw(st, r, target, lt, info);
    else { r.setClearColor(st.clearColor ?? 0x000000, 1); r.clear(); r.render(st.scene, st.camera); }
    const g = typeof mod.grade === 'function' ? mod.grade(st, lt, info) : (mod.grade || st.grade);
    return { grade: fullGrade(g), overlayHook: mod.overlay ? (gctx) => mod.overlay(st, gctx, lt, info) : null };
  }

  // Render global time t (seconds) to the canvas.
  renderTime(t, frameIndex = Math.round(t * FPS)) {
    const r = this.renderer;
    const segs = this.active(t);
    let src, grade, hooks = [];
    if (segs.length === 0) {
      r.setRenderTarget(this.rtA); r.setClearColor(0, 1); r.clear();
      src = this.rtA; grade = fullGrade(null);
    } else if (segs.length === 1) {
      const a = this.renderSegment(segs[0], t, this.rtA);
      src = this.rtA; grade = a.grade; if (a.overlayHook) hooks.push(a.overlayHook);
    } else {
      const [s0, s1] = segs.sort((x, y) => x.start - y.start);
      const a = this.renderSegment(s0, t, this.rtA);
      const b = this.renderSegment(s1, t, this.rtB);
      // cross-fade over the overlap window [s1.start, s0.end]
      const m = smoothstep(s1.start, s0.end, t);
      this.mixMat.uniforms.tA.value = this.rtA.texture;
      this.mixMat.uniforms.tB.value = this.rtB.texture;
      this.mixMat.uniforms.mixv.value = m;
      r.setRenderTarget(this.rtMix); this.mixQuad.render(r);
      src = this.rtMix; grade = lerpGrade(a.grade, b.grade, m);
      if (a.overlayHook) hooks.push(a.overlayHook);
      if (b.overlayHook) hooks.push(b.overlayHook);
    }
    // bloom (composited additively back into src)
    if (grade.bloom.strength > 0.001) {
      this.bloom.strength = grade.bloom.strength;
      this.bloom.radius = grade.bloom.radius;
      this.bloom.threshold = grade.bloom.threshold;
      this.bloom.render(r, null, src, 0, false);
    }
    // overlay text
    this.overlay.draw(t, hooks);
    // final
    const u = this.finalMat.uniforms;
    u.tDiffuse.value = src.texture;
    u.exposure.value = grade.exposure; u.contrast.value = grade.contrast; u.saturation.value = grade.saturation;
    u.tint.value.fromArray(grade.tint); u.lift.value.fromArray(grade.lift); u.gamma.value.fromArray(grade.gamma); u.gain.value.fromArray(grade.gain);
    u.vignette.value = grade.vignette; u.grain.value = grade.grain * GRAIN_SCALE; u.aberration.value = grade.aberration;
    u.black.value = track(MASTER.black, t); u.white.value = track(MASTER.white, t);
    u.frame.value = frameIndex;
    r.setRenderTarget(null);
    this.finalQuad.render(r);
  }

  renderFrame(i) { this.renderTime(i / FPS, i); }

  // RGBA pixels of the canvas, top row first.
  readPixels() {
    const gl = this.renderer.getContext();
    const w = this.w, h = this.h;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8Array(w * h * 4), row = w * 4;
    for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    return out;
  }
}

export { W, H, FPS, DURATION, SEGMENTS };
