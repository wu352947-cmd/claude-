// Core helpers for the BABEL score: seeded randomness, pitch, automation,
// smooth noise, the per-segment mixer and the lazy event scheduler.
// Everything is deterministic: no Math.random, no clocks.
import { rng as baseRng } from '../engine/util.js';

export function seedOf(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}
export const R = name => baseRng(seedOf(String(name)));

export const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export const mhz = m => 440 * Math.pow(2, (m - 69) / 12);
// 'D4' → MIDI 62
export function midi(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return PC[m[1]] + 12 * (parseInt(m[2], 10) + 1);
}
export const hz = name => mhz(midi(name));
export const db = d => Math.pow(10, d / 20);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Piecewise-linear keyframes [[t, v], ...] evaluated at t.
export function keyAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return t1 === t0 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}

// Smooth value noise in [-1, 1], deterministic per seed. rate = lattice points per second.
export function smoothNoise(seed, rate = 1) {
  const s = (typeof seed === 'string' ? seedOf(seed) : seed) % 100000;
  const L = i => { const x = Math.sin(i * 127.1 + s * 311.7 + 0.123) * 43758.5453123; return (x - Math.floor(x)) * 2 - 1; };
  return t => {
    const x = t * rate, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return L(i) + (L(i + 1) - L(i)) * u;
  };
}
// Fractal (3-octave) smooth noise in roughly [-1, 1].
export function fbm(seed, rate = 1) {
  const a = smoothNoise(seed + ':a', rate), b = smoothNoise(seed + ':b', rate * 2.13), c = smoothNoise(seed + ':c', rate * 4.71);
  return t => (a(t) * 0.6 + b(t) * 0.3 + c(t) * 0.15) / 1.05;
}

// Lazy scheduler + mixer for one OfflineAudioContext covering global [g0, g1).
export class Mix {
  constructor(ctx, g0, g1, { spaces = {}, noise = {} } = {}) {
    this.ctx = ctx; this.g0 = g0; this.g1 = g1; this.sr = ctx.sampleRate;
    this.out = ctx.createGain();
    this.sends = {};
    this.noiseBufs = noise;
    for (const [name, ir] of Object.entries(spaces)) {
      const inp = ctx.createGain();
      const cv = ctx.createConvolver();
      cv.normalize = false; cv.buffer = ir;
      inp.connect(cv).connect(this.out);
      this.sends[name] = inp;
    }
    this.events = [];
  }
  // global → context time
  t(g) { return g - this.g0; }
  // A channel strip: input gain → stereo pan → dry + reverb sends. Returns the input node.
  ch({ pan = 0, gain = 1, dry = 1, send = {} } = {}) {
    const ctx = this.ctx;
    const inp = ctx.createGain(); inp.gain.value = gain;
    let node = inp;
    if (pan !== 0) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); inp.connect(p); node = p; }
    if (dry > 0) {
      if (dry === 1) node.connect(this.out);
      else { const d = ctx.createGain(); d.gain.value = dry; node.connect(d).connect(this.out); }
    }
    for (const k in send) {
      if (send[k] > 0 && this.sends[k]) { const s = ctx.createGain(); s.gain.value = send[k]; node.connect(s).connect(this.sends[k]); }
    }
    return inp;
  }
  // Memoised shared bus (one per key per segment).
  bus(key, opts) {
    this._b = this._b || {};
    if (this._b[key]) return this._b[key];
    if (this.solo && !this.solo.includes(key)) return (this._b[key] = this.ctx.createGain());   // debug: muted stem
    return (this._b[key] = this.ch(opts));
  }
  // Looping noise source started at global time g (random offset), stopped at g + dur.
  noise(kind, g, dur, seed = 'n') {
    const buf = this.noiseBufs[kind];
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    const r = R(seed + kind + g);
    const T = Math.max(0, this.t(g));
    s.start(T, r() * (buf.duration - 0.1));
    s.stop(T + dur);
    return s;
  }
  // Register an event builder that runs (lazily) before global time g.
  at(g, fn) {
    if (!(g < this.g1 && g >= this.g0 - 0.001)) return;
    if (!this.running) { this.events.push([g, fn]); return; }
    // during rendering: sorted insert after the current position
    const ev = this.events;
    let lo = this.pos, hi = ev.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m][0] <= g) lo = m + 1; else hi = m; }
    ev.splice(lo, 0, [g, fn]);
  }
  // Is global window [a, b) inside this segment? (an event must start within the segment)
  has(a) { return a >= this.g0 - 0.001 && a < this.g1; }

  async render(lengthFrames) {
    const ctx = this.ctx;
    this.events.sort((a, b) => a[0] - b[0]);
    this.running = true; this.pos = 0;
    const flush = until => {
      while (this.pos < this.events.length && this.events[this.pos][0] < until) {
        const [g, fn] = this.events[this.pos++];
        try { fn(); } catch (e) { console.error(`score event @${g.toFixed(3)} (segment ${this.g0}): ${e.message}\n${e.stack.split('\n').slice(1, 4).join('\n')}`); }
      }
    };
    const LOOK = 2.0;
    flush(this.g0 + LOOK);
    const dur = lengthFrames / this.sr;
    // 1-second steps are an integer number of 128-frame quanta at 48 kHz (and at 44.1 kHz we round).
    const q = 128 / this.sr;
    for (let k = 1; k * 1.0 < dur - 0.01; k++) {
      const s = Math.round(k / q) * q;
      ctx.suspend(s).then(() => { flush(this.g0 + s + LOOK); ctx.resume(); });
    }
    return ctx.startRendering();
  }
}

// ---------- automation helpers (times are global) ----------
// keys [[g, v], ...]: set at the first key, linear ramps after.
export function ramp(M, param, keys) {
  const T0 = Math.max(0, M.t(keys[0][0]));
  param.setValueAtTime(keys[0][1], T0);
  for (let i = 1; i < keys.length; i++) {
    const T = M.t(keys[i][0]);
    if (T <= T0) continue;
    param.linearRampToValueAtTime(keys[i][1], T);
  }
}
// Exponential ramps (values clamped > 0).
export function eramp(M, param, keys) {
  const T0 = Math.max(0, M.t(keys[0][0]));
  param.setValueAtTime(Math.max(1e-5, keys[0][1]), T0);
  for (let i = 1; i < keys.length; i++) param.exponentialRampToValueAtTime(Math.max(1e-5, keys[i][1]), M.t(keys[i][0]));
}
// Sample fn(g) at `rate` Hz over [ga, gb] into a value curve.
export function curve(M, param, ga, gb, fn, rate = 50) {
  const n = Math.max(2, Math.ceil((gb - ga) * rate) + 1);
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = fn(ga + (gb - ga) * i / (n - 1));
  param.setValueCurveAtTime(arr, Math.max(0.0015, M.t(ga)), gb - ga);
}
// Percussive envelope on a gain param: 0 → peak in `a`, hold, then exponential decay with time constant tau.
export function perc(M, param, g, { a = 0.003, peak = 1, hold = 0, tau = 0.1 } = {}) {
  const T = M.t(g);
  param.setValueAtTime(0, T);
  param.linearRampToValueAtTime(peak, T + a);
  if (hold > 0) param.setValueAtTime(peak, T + a + hold);
  param.setTargetAtTime(0, T + a + hold, tau);
  return g + a + hold + tau * 9;   // a safe stop time (global time)
}

export function osc(M, type, f, g, stopG, { detune = 0, wave = null } = {}) {
  const o = M.ctx.createOscillator();
  if (wave) o.setPeriodicWave(wave); else o.type = type;
  o.frequency.value = f; o.detune.value = detune;
  o.start(Math.max(0, M.t(g))); o.stop(M.t(stopG));
  return o;
}
export function gain(M, v = 1) { const g = M.ctx.createGain(); g.gain.value = v; return g; }
export function biquad(M, type, f, Q = 0.707, gainDb = 0) {
  const b = M.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gainDb; return b;
}
export function shaper(M, drive = 2, kind = 'tanh') {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = kind === 'tanh' ? Math.tanh(x * drive) / Math.tanh(drive)
      : kind === 'hard' ? clamp(x * drive, -1, 1) * 0.9 + Math.tanh(x * drive) * 0.1
        : (x * drive) / (1 + Math.abs(x * drive));
  }
  const w = M.ctx.createWaveShaper(); w.curve = c; w.oversample = '2x'; return w;
}
// PeriodicWave from harmonic amplitude function amp(n) for n = 1..N.
const waveCache = new WeakMap();
export function wave(M, name, N, amp) {
  let m = waveCache.get(M.ctx); if (!m) { m = {}; waveCache.set(M.ctx, m); }
  if (m[name]) return m[name];
  const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) im[n] = amp(n);
  return (m[name] = M.ctx.createPeriodicWave(re, im, { disableNormalization: false }));
}
