// Procedural buffers: noise colours, crackle, sand grains, and impulse responses
// for the film's acoustic spaces. All generated from seeded PRNGs.
import { R } from './core.js';

function buffer(ctx, ch, n) { return ctx.createBuffer(ch, n, ctx.sampleRate); }

export function makeNoise(ctx, kind, seconds = 8, seed = 'noise') {
  const n = Math.floor(seconds * ctx.sampleRate);
  const b = buffer(ctx, 2, n);
  for (let c = 0; c < 2; c++) {
    const r = R(seed + kind + c), d = b.getChannelData(c);
    if (kind === 'white') for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = r() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let x = 0;
      for (let i = 0; i < n; i++) { x = (x + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = x * 3.5; }
    }
    // remove DC and make the loop seamless with a short crossfade
    let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
    for (let i = 0; i < n; i++) d[i] -= m;
    const X = 2048;
    for (let i = 0; i < X; i++) { const a = i / X; d[i] = d[i] * a + d[n - X + i] * (1 - a); }
  }
  return b;
}

// Crackle: sparse impulsive bursts with heavy-tailed amplitudes (rocket exhaust, fire).
export function makeCrackle(ctx, seconds = 10, seed = 'crackle', density = 900) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const b = buffer(ctx, 2, n);
  for (let c = 0; c < 2; c++) {
    const r = R(seed + c), d = b.getChannelData(c);
    const count = Math.floor(seconds * density);
    for (let k = 0; k < count; k++) {
      const i0 = Math.floor(r() * n);
      const amp = Math.min(1, 0.04 / Math.pow(r() + 0.01, 1.4)) * (r() < 0.5 ? -1 : 1);
      const len = Math.floor(sr * (0.0002 + r() * 0.0015));
      const tau = len * 0.35;
      for (let j = 0; j < len && i0 + j < n; j++) d[i0 + j] += amp * Math.exp(-j / tau) * (r() * 2 - 1);
    }
  }
  return b;
}

// Sand / grit: many tiny windowed noise grains.
export function makeGrains(ctx, seconds = 8, seed = 'grains', density = 2600) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const b = buffer(ctx, 2, n);
  for (let c = 0; c < 2; c++) {
    const r = R(seed + c), d = b.getChannelData(c);
    const count = Math.floor(seconds * density);
    for (let k = 0; k < count; k++) {
      const i0 = Math.floor(r() * n);
      const amp = Math.pow(r(), 3) * (r() < 0.5 ? -1 : 1);
      const len = Math.floor(sr * (0.0003 + r() * 0.0025));
      for (let j = 0; j < len && i0 + j < n; j++) d[i0 + j] += amp * Math.sin(Math.PI * j / len) * (r() * 2 - 1);
    }
  }
  return b;
}

// Impulse response: stereo noise with three-band frequency-dependent exponential decay,
// diffusion build-up, discrete early reflections, pre-delay, and a sub-bass high-pass.
// rt = [low, mid, high] RT60 seconds.
export function makeIR(ctx, { seconds, rt, predelay = 0.02, early = [], build = 0.01, seed = 'ir', hp = 60, lp = 12000, width = 1 }) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const b = buffer(ctx, 2, n);
  const pd = Math.floor(predelay * sr);
  const onePole = fc => Math.exp(-2 * Math.PI * fc / sr);
  const k300 = onePole(300), k3k = onePole(3000), kLp = onePole(lp), kHp = onePole(hp);
  const data = [];
  for (let c = 0; c < 2; c++) {
    const r = R(seed + c), d = b.getChannelData(c);
    let l1 = 0, l2 = 0;
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / sr;
      const w = r() * 2 - 1;
      l1 = (1 - k300) * w + k300 * l1;         // < 300 Hz
      l2 = (1 - k3k) * w + k3k * l2;           // < 3 kHz
      const lo = l1, mid = l2 - l1, hi = w - l2;
      const e = x => Math.exp(-6.907755 * t / x);
      const env = Math.min(1, t / Math.max(1e-4, build));
      // fade the very end to avoid truncation clicks
      const tail = Math.min(1, (n - i) / (0.05 * sr));
      d[i] = (lo * e(rt[0]) + mid * e(rt[1]) + hi * e(rt[2])) * env * tail;
    }
    // early reflections: [time s, gain, lowpass Hz]
    for (const [tm, g, lpf = 8000] of early) {
      const jt = Math.floor((tm * (1 + (c ? 0.04 : -0.04) * width) + predelay * 0.3) * sr);
      const kk = onePole(lpf); let y = 0;
      const sgn = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < 96 && jt + j < n; j++) { const x = j === 0 ? 1 : 0; y = (1 - kk) * x + kk * y; d[jt + j] += sgn * g * y * 6; }
    }
    // global tone: lowpass then high-pass (one-pole each)
    let y = 0, hpl = 0;
    for (let i = 0; i < n; i++) { y = (1 - kLp) * d[i] + kLp * y; hpl = (1 - kHp) * y + kHp * hpl; d[i] = y - hpl; }
    data.push(d);
  }
  // stereo width: mid/side
  if (width !== 1) {
    const [L, Rr] = data;
    for (let i = 0; i < n; i++) { const m = (L[i] + Rr[i]) / 2, s = (L[i] - Rr[i]) / 2 * width; L[i] = m + s; Rr[i] = m - s; }
  }
  // normalise to unit energy per channel
  for (const d of data) {
    let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
    const s = 1 / Math.sqrt(e + 1e-12);
    for (let i = 0; i < n; i++) d[i] *= s;
  }
  return b;
}

export const SPACES = {
  // small wooden room for the typing
  room: { seconds: 0.9, rt: [0.5, 0.42, 0.28], predelay: 0.004, build: 0.004, hp: 120, lp: 9000, seed: 'room',
    early: [[0.0031, 0.5, 7000], [0.0057, 0.4, 6000], [0.0089, 0.35, 5000], [0.013, 0.3, 4500], [0.017, 0.22, 4000]] },
  // open air: few distant reflections (dunes, cliffs), thin diffuse tail
  desert: { seconds: 4.5, rt: [2.6, 2.0, 0.9], predelay: 0.03, build: 0.06, hp: 50, lp: 6000, seed: 'desert', width: 1.3,
    early: [[0.07, 0.6, 3000], [0.13, 0.45, 2500], [0.21, 0.4, 2000], [0.34, 0.3, 1600], [0.52, 0.25, 1200], [0.81, 0.15, 900]] },
  // large concert hall — the general music space
  hall: { seconds: 5.5, rt: [3.6, 3.0, 1.8], predelay: 0.028, build: 0.03, hp: 45, lp: 11000, seed: 'hall', width: 1.15,
    early: [[0.019, 0.5, 8000], [0.027, 0.45, 7000], [0.041, 0.4, 6000], [0.055, 0.32, 5000], [0.07, 0.25, 4500]] },
  // stone cathedral
  cathedral: { seconds: 13, rt: [11.5, 9.0, 4.5], predelay: 0.06, build: 0.09, hp: 38, lp: 9000, seed: 'cathedral', width: 1.2,
    early: [[0.045, 0.5, 6000], [0.071, 0.45, 5000], [0.098, 0.4, 4500], [0.131, 0.3, 4000], [0.172, 0.25, 3500], [0.233, 0.2, 3000]] },
};
