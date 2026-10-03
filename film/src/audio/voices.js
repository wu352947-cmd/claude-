// Formant voices: the "babel" murmur of many tongues, and the choir.
// Source = band-limited glottal pulse (PeriodicWave) + aspiration noise,
// shaped by five parallel band-pass formant filters whose targets glide between vowels.
import { R, db, clamp, gain, biquad, wave, curve, smoothNoise } from './core.js';

// [freq Hz, bandwidth Hz, level dB] × 5 formants (Csound bass / alto tables)
const VOW = {
  m: {
    a: [[600, 60, 0], [1040, 70, -7], [2250, 110, -9], [2450, 120, -9], [2750, 130, -20]],
    e: [[400, 40, 0], [1620, 80, -12], [2400, 100, -9], [2800, 120, -12], [3100, 120, -18]],
    i: [[250, 60, 0], [1750, 90, -30], [2600, 100, -16], [3050, 120, -22], [3340, 120, -28]],
    o: [[400, 40, 0], [750, 80, -11], [2400, 100, -21], [2600, 120, -20], [2900, 120, -40]],
    u: [[350, 40, 0], [600, 80, -20], [2400, 100, -32], [2675, 120, -28], [2950, 120, -36]],
    E: [[530, 60, 0], [1840, 80, -10], [2480, 110, -12], [2900, 120, -14], [3300, 130, -24]],
    y: [[300, 50, 0], [1500, 80, -18], [2200, 100, -18], [2700, 120, -22], [3200, 120, -30]],
  },
  f: {
    a: [[800, 80, 0], [1150, 90, -4], [2800, 120, -20], [3500, 130, -36], [4950, 140, -60]],
    e: [[400, 60, 0], [1600, 80, -24], [2700, 120, -30], [3300, 150, -35], [4950, 200, -60]],
    i: [[350, 50, 0], [1700, 100, -20], [2700, 120, -30], [3700, 150, -36], [4950, 200, -60]],
    o: [[450, 70, 0], [800, 80, -9], [2830, 100, -16], [3500, 130, -28], [4950, 135, -55]],
    u: [[325, 50, 0], [700, 60, -12], [2530, 170, -30], [3500, 180, -40], [4950, 200, -64]],
    E: [[600, 70, 0], [2000, 90, -14], [2900, 120, -22], [3600, 140, -30], [4950, 180, -58]],
    y: [[330, 50, 0], [1750, 90, -22], [2600, 120, -28], [3600, 150, -36], [4950, 200, -60]],
  },
};
export const VOWELS = ['a', 'e', 'i', 'o', 'u', 'E', 'y'];

// events: [{ t, f?, v?, amp?, tau?, cons? }] — targets applied at time t (global).
// cons: { kind: 's'|'sh'|'f'|'p'|'k'|'h', amp } consonant noise burst at t.
export function formantVoice(M, out, { g0, g1, sex = 'm', events, vib = 0, vibRate = 5.3, breath = 0.08, seed = 'v', jitter = 12, bright = 1 }) {
  const ctx = M.ctx, r = R(seed);
  const tbl = VOW[sex];
  const glottal = wave(M, 'glottal' + (bright > 1 ? 'B' : ''), 90, n => Math.pow(n, bright > 1 ? -1.05 : -1.25) * (1 - 0.15 * Math.sin(n * 0.7)));
  const stop = g1 + 1.5;
  const T0 = Math.max(0, M.t(g0));

  const o = ctx.createOscillator(); o.setPeriodicWave(glottal);
  const f0 = events.find(e => e.f)?.f || 120;
  o.frequency.setValueAtTime(f0, T0);
  o.start(T0); o.stop(M.t(stop));
  // vibrato + slow jitter as one detune curve
  const jn = smoothNoise(seed + 'j', 6), jn2 = smoothNoise(seed + 'k', 0.7), vph = r() * 6.28;
  const vibAt = typeof vib === 'function' ? vib : () => vib;
  curve(M, o.detune, g0, stop, x => vibAt(x) * Math.sin(2 * Math.PI * vibRate * (x - g0) + vph + 0.3 * Math.sin(x * 1.3)) + jitter * jn(x) + jitter * 1.5 * jn2(x), 80);

  const voiced = gain(M, 1);
  const src = gain(M, 1);
  o.connect(voiced).connect(src);
  const nz = M.noise('white', g0, stop - g0 + 0.1, seed + 'n');
  const asp = biquad(M, 'highpass', 500, 0.7), asg = gain(M, breath);
  nz.connect(asp).connect(asg).connect(src);

  const amp = gain(M, 0);
  amp.gain.setValueAtTime(0, T0);
  const fil = [], fg = [];
  const v0 = tbl[events.find(e => e.v)?.v || 'a'];
  for (let k = 0; k < 5; k++) {
    const b = ctx.createBiquadFilter(); b.type = 'bandpass';
    b.frequency.setValueAtTime(v0[k][0], T0); b.Q.setValueAtTime(v0[k][0] / v0[k][1], T0);
    const g = gain(M, 0); g.gain.setValueAtTime(db(v0[k][2]) * (k ? 1.6 : 1), T0);
    src.connect(b).connect(g).connect(amp);
    fil.push(b); fg.push(g);
  }
  // consonant channel
  const cbp = biquad(M, 'bandpass', 4000, 1.5), cg = gain(M, 0);
  nz.connect(cbp).connect(cg).connect(amp);
  // final gentle lowpass (distance/softness) → out
  amp.connect(out);

  const CONS = { s: [6200, 2.0, 0.07], sh: [2900, 1.4, 0.08], f: [4500, 0.6, 0.06], p: [1200, 0.5, 0.015], k: [2200, 1.2, 0.02], h: [1500, 0.4, 0.05], t: [4000, 0.9, 0.012] };
  for (const e of events) {
    const T = M.t(e.t);
    if (T < 0) continue;
    const tau = e.tau ?? 0.03;
    if (e.f) o.frequency.setTargetAtTime(e.f, T, e.ftau ?? tau * 1.3);
    if (e.v) {
      const V = tbl[e.v];
      for (let k = 0; k < 5; k++) {
        fil[k].frequency.setTargetAtTime(V[k][0], T, tau);
        fil[k].Q.setTargetAtTime(V[k][0] / V[k][1], T, tau);
        fg[k].gain.setTargetAtTime(db(V[k][2]) * (k ? 1.6 : 1), T, tau);
      }
    }
    if (e.amp !== undefined) amp.gain.setTargetAtTime(e.amp, T, e.atau ?? tau);
    if (e.voiced !== undefined) voiced.gain.setTargetAtTime(e.voiced, T, 0.01);
    if (e.cons) {
      const [cf, q, d] = CONS[e.cons.kind];
      cbp.frequency.setValueAtTime(cf, T); cbp.Q.setValueAtTime(q, T);
      cg.gain.setTargetAtTime(e.cons.amp, T, 0.004);
      cg.gain.setTargetAtTime(0, T + d, 0.012);
    }
  }
  amp.gain.setTargetAtTime(0, M.t(g1), 0.08);
}

// Generate babble (speech-like) events for one voice over [t0, t1).
// Each "tongue" has its own phonotactics: syllable rate, vowel set, consonants, melody.
export function babble(seed, t0, t1, { sex = 'm', f0 = 120, level = 1, rate = 1 } = {}) {
  const r = R(seed);
  const vset = [];
  for (let i = 0; i < 4; i++) vset.push(VOWELS[Math.floor(r() * VOWELS.length)]);
  vset.push('a');
  const cset = ['s', 'sh', 'f', 'p', 'k', 'h', 't'].filter(() => r() < 0.6);
  if (!cset.length) cset.push('k');
  const tonal = r() < 0.35;               // a tonal language: syllables carry pitch shapes
  const syl = (0.13 + r() * 0.08) / rate;
  const ev = [];
  let t = t0 + r() * 1.2;
  while (t < t1) {
    const nSyl = 3 + Math.floor(r() * 11);
    const phraseTop = 1 + r() * 0.12;
    for (let i = 0; i < nSyl && t < t1; i++) {
      const d = syl * (0.7 + r() * 0.7);
      const decl = phraseTop * (1 - 0.18 * i / nSyl);
      const stress = r() < 0.25 ? 1.12 + r() * 0.1 : 1;
      let f = f0 * decl * stress;
      if (tonal) f *= [1, 1.12, 0.9, 1.05][Math.floor(r() * 4)];
      const a = level * (0.55 + r() * 0.45) * (stress > 1 ? 1.25 : 1);
      const hasC = r() < 0.55;
      if (hasC) ev.push({ t, amp: a * 0.06, tau: 0.008, cons: { kind: cset[Math.floor(r() * cset.length)], amp: a * (0.15 + r() * 0.25) } });
      const tv = t + (hasC ? 0.035 : 0.0);
      ev.push({ t: tv, amp: a, tau: 0.022, f, v: vset[Math.floor(r() * vset.length)] });
      if (tonal) ev.push({ t: tv + d * 0.5, f: f * (r() < 0.5 ? 0.88 : 1.1), tau: 0.05 });
      t += d;
    }
    // end of phrase: fall + pause
    ev.push({ t, amp: 0, tau: 0.05, f: f0 * 0.85 });
    t += 0.25 + r() * 1.1;
  }
  return ev;
}
