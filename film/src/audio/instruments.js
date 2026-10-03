// Synthesised instruments. Every function takes the segment mixer M, an output
// node, and options with GLOBAL times. Nodes stop themselves when done.
import { R, db, clamp, perc, osc, gain, biquad, shaper, wave, curve, ramp, eramp } from './core.js';

// ---------------------------------------------------------------- bells
// Partial tables: [ratio, amplitude, decay factor]
const BELLS = {
  // European church bell, ratios relative to the nominal (perceived strike pitch)
  church: [[0.25, 0.55, 1.0], [0.5, 0.42, 0.78], [0.597, 0.45, 0.6], [0.752, 0.16, 0.42], [1, 1, 0.5], [1.255, 0.26, 0.31],
    [1.335, 0.18, 0.27], [1.506, 0.22, 0.24], [2.02, 0.16, 0.17], [2.52, 0.09, 0.12], [3.04, 0.055, 0.09], [4.1, 0.03, 0.06]],
  // Chinese bronze chime bell (bianzhong): two-tone, quicker decay
  bronze: [[0.5, 0.14, 0.7], [1, 1, 0.6], [1.19, 0.28, 0.42], [2.0, 0.34, 0.33], [2.42, 0.22, 0.27], [2.98, 0.18, 0.21],
    [3.6, 0.11, 0.16], [4.53, 0.07, 0.11], [5.8, 0.04, 0.08]],
  // small eave bell / wind chime (free bar modes + a bronze shimmer)
  chime: [[1, 1, 1.0], [2.0, 0.12, 0.6], [2.756, 0.42, 0.55], [4.07, 0.08, 0.35], [5.404, 0.18, 0.3], [8.933, 0.06, 0.16]],
  // glassy, almost pure (star glint, music-box like coda)
  glass: [[1, 1, 1.0], [2.001, 0.3, 0.6], [3.0, 0.08, 0.4], [4.2, 0.05, 0.25], [5.43, 0.03, 0.18]],
};

export function bell(M, out, g, f, { kind = 'church', dur = 6, amp = 0.3, bright = 1, beat = 0.6, strike = 0.25, seed = 'bell', maxF = 15000 } = {}) {
  const r = R(seed + g + f);
  const tbl = BELLS[kind];
  const sum = gain(M, amp);
  sum.connect(out);
  let last = 0;
  for (const [ratio, a, df] of tbl) {
    const fp = f * ratio * (1 + (r() - 0.5) * 0.002);
    if (fp > maxF || fp < 20) continue;
    const aa = a * (ratio > 1 ? Math.pow(bright, Math.log2(ratio)) : 1);
    const tau = dur * df / 5;
    const att = ratio > 1.4 ? 0.0012 : 0.004 + 0.004 * (1 - ratio);
    // doublet (two slightly split modes) for natural beating
    const split = beat * (0.3 + r()) * (ratio < 1 ? 0.5 : 1);
    for (const [k, w] of [[1, 0.62], [-1, 0.38]]) {
      const o = osc(M, 'sine', fp + k * split / 2, g, g + tau * 9 + 0.1);
      const e = gain(M, 0);
      last = Math.max(last, perc(M, e.gain, g, { a: att, peak: aa * w, tau }));
      o.connect(e).connect(sum);
    }
  }
  if (strike > 0) {
    const n = M.noise('white', g, 0.25, seed);
    const bp = biquad(M, 'bandpass', Math.min(9000, f * 2.4), 0.9);
    const e = gain(M, 0);
    perc(M, e.gain, g, { a: 0.0015, peak: strike * (kind === 'church' ? 0.45 : 1), tau: kind === 'church' ? 0.012 : 0.006 });
    n.connect(bp).connect(e).connect(sum);
  }
  return last;
}

// ---------------------------------------------------------------- typing ticks
export function tick(M, out, g, f, amp = 0.1) {
  const e = gain(M, 0);
  const stop = perc(M, e.gain, g, { a: 0.0015, peak: amp, tau: 0.075 });
  const o1 = osc(M, 'sine', f, g, stop), o2 = osc(M, 'sine', f * 2.0, g, stop), o3 = osc(M, 'sine', f * 4.17, g, stop);
  const g2 = gain(M, 0.18), g3 = gain(M, 0.05);
  o1.connect(e); o2.connect(g2).connect(e); o3.connect(g3).connect(e);
  // tiny felt click
  const n = M.noise('white', g, 0.05, 'tk'); const bp = biquad(M, 'bandpass', 3800, 1.2); const ne = gain(M, 0);
  perc(M, ne.gain, g, { a: 0.0005, peak: amp * 0.35, tau: 0.0025 });
  n.connect(bp).connect(ne).connect(out);
  // high partial decays faster: a lowpass that closes
  const lp = biquad(M, 'lowpass', f * 6, 0.5);
  eramp(M, lp.frequency, [[g, f * 6], [g + 0.12, f * 1.6]]);
  e.connect(lp).connect(out);
}
export function backTick(M, out, g, f, amp = 0.1) {
  const e = gain(M, 0);
  const stop = perc(M, e.gain, g, { a: 0.0008, peak: amp, tau: 0.022 });
  const o = osc(M, 'triangle', f, g, stop);
  const lp = biquad(M, 'lowpass', 1400, 0.7);
  o.connect(lp).connect(e).connect(out);
  const n = M.noise('white', g, 0.05, 'bk'); const bp = biquad(M, 'bandpass', 1300, 1.5); const ne = gain(M, 0);
  perc(M, ne.gain, g, { a: 0.0004, peak: amp * 0.6, tau: 0.004 });
  n.connect(bp).connect(ne).connect(out);
}

// ---------------------------------------------------------------- labour
// hand slapping wet clay
export function clayThump(M, out, g, amp = 0.5, seed = 'clay') {
  const r = R(seed + g);
  const f0 = 120 + r() * 40;
  const o = osc(M, 'sine', f0, g, g + 0.6);
  eramp(M, o.frequency, [[g, f0], [g + 0.08, 58 + r() * 8]]);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.002, peak: amp, tau: 0.075 });
  o.connect(e).connect(out);
  // the slap
  const n = M.noise('pink', g, 0.4, seed);
  const bp = biquad(M, 'bandpass', 550 + r() * 300, 1.1);
  const ne = gain(M, 0); perc(M, ne.gain, g, { a: 0.001, peak: amp * 1.5, tau: 0.022 });
  n.connect(bp).connect(ne).connect(out);
  // wet squelch a few ms later
  const n2 = M.noise('white', g, 0.3, seed + 'w');
  const bp2 = biquad(M, 'bandpass', 1500 + r() * 900, 3.5);
  eramp(M, bp2.frequency, [[g + 0.01, 1700 + r() * 600], [g + 0.09, 700]]);
  const ne2 = gain(M, 0); perc(M, ne2.gain, g + 0.012 + r() * 0.01, { a: 0.004, peak: amp * 0.5, tau: 0.035 });
  n2.connect(bp2).connect(ne2).connect(out);
}
// chisel on stone: inharmonic metallic tick + gritty thock
export function chisel(M, out, g, amp = 0.2, seed = 'chisel') {
  const r = R(seed + g);
  const base = 2100 + r() * 500;
  for (const [k, a, tau] of [[1, 1, 0.06], [1.73, 0.6, 0.045], [2.49, 0.4, 0.03], [3.6, 0.25, 0.02]]) {
    const o = osc(M, 'sine', base * k, g, g + 0.5);
    const e = gain(M, 0); perc(M, e.gain, g, { a: 0.0005, peak: amp * a * 0.4, tau });
    o.connect(e).connect(out);
  }
  const n = M.noise('white', g, 0.2, seed); const bp = biquad(M, 'bandpass', 900 + r() * 400, 1.4); const ne = gain(M, 0);
  perc(M, ne.gain, g, { a: 0.0005, peak: amp * 0.9, tau: 0.012 });
  n.connect(bp).connect(ne).connect(out);
}
// steam piston: thump + pneumatic chuff
export function piston(M, out, g, amp = 0.5, seed = 'piston') {
  const r = R(seed + g);
  const o = osc(M, 'sine', 95, g, g + 0.6);
  eramp(M, o.frequency, [[g, 95], [g + 0.06, 56]]);
  const sh = shaper(M, 2.5);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.001, peak: amp, tau: 0.09 });
  o.connect(sh).connect(e).connect(out);
  const n = M.noise('pink', g, 0.6, seed); const bp = biquad(M, 'bandpass', 380 + r() * 80, 0.9);
  const ne = gain(M, 0); perc(M, ne.gain, g + 0.015, { a: 0.006, peak: amp * 0.9, tau: 0.08 });
  n.connect(bp).connect(ne).connect(out);
  // metal clank of the crosshead
  const o2 = osc(M, 'triangle', 640 + r() * 40, g, g + 0.3);
  const e2 = gain(M, 0); perc(M, e2.gain, g, { a: 0.0005, peak: amp * 0.08, tau: 0.03 });
  o2.connect(e2).connect(out);
}
export function steam(M, out, g, dur = 0.5, amp = 0.15, seed = 'steam') {
  const n = M.noise('white', g, dur + 1, seed);
  const hp = biquad(M, 'highpass', 2200, 0.7), bp = biquad(M, 'peaking', 5200, 1.2, 6);
  const e = gain(M, 0);
  ramp(M, e.gain, [[g, 0], [g + 0.02, amp], [g + dur * 0.4, amp * 0.7], [g + dur, 0]]);
  n.connect(hp).connect(bp).connect(e).connect(out);
}
// anvil / struck plate
export function anvil(M, out, g, f = 880, amp = 0.25, seed = 'anvil') {
  const r = R(seed + g);
  for (const [k, a, tau] of [[1, 1, 0.5], [2.76, 0.5, 0.3], [3.93, 0.35, 0.22], [5.4, 0.3, 0.15], [6.81, 0.15, 0.1], [8.93, 0.1, 0.07]]) {
    const o = osc(M, 'sine', f * k * (1 + (r() - 0.5) * 0.004), g, g + tau * 9);
    const e = gain(M, 0); perc(M, e.gain, g, { a: 0.0004, peak: amp * a * 0.35, tau });
    o.connect(e).connect(out);
  }
  const n = M.noise('white', g, 0.2, seed); const hp = biquad(M, 'highpass', 2500, 0.7); const ne = gain(M, 0);
  perc(M, ne.gain, g, { a: 0.0003, peak: amp * 0.5, tau: 0.008 });
  n.connect(hp).connect(ne).connect(out);
}
// clockwork / gear tick
export function gearTick(M, out, g, f = 3200, amp = 0.12) {
  const o = osc(M, 'sine', f, g, g + 0.1);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.0003, peak: amp * 0.5, tau: 0.008 });
  o.connect(e).connect(out);
  const n = M.noise('white', g, 0.05, 'gt'); const hp = biquad(M, 'bandpass', f * 1.4, 2); const ne = gain(M, 0);
  perc(M, ne.gain, g, { a: 0.0002, peak: amp, tau: 0.003 });
  n.connect(hp).connect(ne).connect(out);
}
// keyboard key: plastic click + bottom-out thock
export function keyClick(M, out, g, amp = 0.15, seed = 'key') {
  const r = R(seed + g);
  const n = M.noise('white', g, 0.08, seed);
  const bp = biquad(M, 'bandpass', 2800 + r() * 2200, 1.6);
  const ne = gain(M, 0); perc(M, ne.gain, g, { a: 0.0003, peak: amp, tau: 0.004 });
  n.connect(bp).connect(ne).connect(out);
  const o = osc(M, 'sine', 230 + r() * 120, g, g + 0.15);
  const e = gain(M, 0); perc(M, e.gain, g + 0.006, { a: 0.0006, peak: amp * 0.5, tau: 0.014 });
  o.connect(e).connect(out);
}
// data blip: tiny high sine
export function blip(M, out, g, f, amp = 0.05, tau = 0.012) {
  const o = osc(M, 'sine', f, g, g + tau * 10);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.0006, peak: amp, tau });
  o.connect(e).connect(out);
}
// soft synthetic pulse kick for the data age
export function softKick(M, out, g, amp = 0.4) {
  const o = osc(M, 'sine', 110, g, g + 0.7);
  eramp(M, o.frequency, [[g, 110], [g + 0.09, 54]]);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.002, peak: amp, tau: 0.12 });
  o.connect(e).connect(out);
}

// ---------------------------------------------------------------- pluck (arpeggio pulses)
export function pluck(M, out, g, f, amp = 0.12, seed = 'pl') {
  const r = R(seed + g);
  const e = gain(M, 0);
  const stop = perc(M, e.gain, g, { a: 0.002, peak: amp, tau: 0.16 });
  const lp = biquad(M, 'lowpass', f * 8, 2.5);
  eramp(M, lp.frequency, [[g, Math.min(12000, f * 10)], [g + 0.25, f * 1.4]]);
  for (const d of [-8, 7]) { const o = osc(M, 'sawtooth', f, g, stop, { detune: d + (r() - 0.5) * 4 }); o.connect(lp); }
  const s = osc(M, 'sine', f / 2, g, stop); const sg = gain(M, 0.35); s.connect(sg).connect(e);
  lp.connect(e).connect(out);
}

// ---------------------------------------------------------------- cinematic
export function braam(M, out, g, freqs, { amp = 0.4, dur = 7, open = 2400, seed = 'braam', drive = 2.2 } = {}) {
  const r = R(seed + g);
  const mixIn = gain(M, 1);
  for (const f of freqs) {
    for (let k = 0; k < 6; k++) {
      const o = osc(M, 'sawtooth', f, g - 0.02, g + dur + 1, { detune: (k - 2.5) * 6 + (r() - 0.5) * 5 });
      const gg = gain(M, 0.16); o.connect(gg).connect(mixIn);
    }
  }
  const sh = shaper(M, drive);
  const lp = biquad(M, 'lowpass', 80, 2.2), lp2 = biquad(M, 'lowpass', 5000, 0.5);
  const T = M.t(g);
  lp.frequency.setValueAtTime(70, T - 0.02);
  lp.frequency.exponentialRampToValueAtTime(open, T + 0.22);
  lp.frequency.setTargetAtTime(260, T + 0.5, dur * 0.25);
  const e = gain(M, 0);
  e.gain.setValueAtTime(0, T - 0.02);
  e.gain.linearRampToValueAtTime(amp * 0.8, T + 0.12);
  e.gain.setTargetAtTime(amp * 0.55, T + 0.3, 0.6);
  e.gain.setTargetAtTime(0, T + dur * 0.45, dur * 0.18);
  mixIn.connect(sh).connect(lp).connect(lp2).connect(e).connect(out);
}
export function subDrop(M, out, g, { f0 = 72, f1 = 27, dur = 2.2, amp = 0.6 } = {}) {
  const o = osc(M, 'sine', f0, g, g + dur * 2.5);
  eramp(M, o.frequency, [[g, f0], [g + dur, f1]]);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.01, peak: amp, hold: dur * 0.15, tau: dur * 0.4 });
  o.connect(e).connect(out);
}
export function impact(M, out, g, { amp = 0.6, tone = 1, seed = 'imp' } = {}) {
  const o = osc(M, 'sine', 130 * tone, g, g + 2);
  eramp(M, o.frequency, [[g, 130 * tone], [g + 0.12, 38 * tone]]);
  const e = gain(M, 0); perc(M, e.gain, g, { a: 0.004, peak: amp * 0.5, tau: 0.22 });
  const sh = shaper(M, 2.5, 'tanh');
  o.connect(sh).connect(e).connect(out);
  const n = M.noise('pink', g, 1.5, seed);
  const lp = biquad(M, 'lowpass', 3000, 0.8);
  eramp(M, lp.frequency, [[g, 4500], [g + 0.5, 300]]);
  const ne = gain(M, 0); perc(M, ne.gain, g, { a: 0.003, peak: amp * 0.6, tau: 0.12 });
  n.connect(lp).connect(ne).connect(out);
}
// noise + pitch riser ending at g1 (abrupt)
export function riser(M, out, g0, g1, { amp = 0.3, f0 = 200, f1 = 7000, pitch = [55, 220], seed = 'riser', release = 0.02 } = {}) {
  const n = M.noise('white', g0, g1 - g0 + 1, seed);
  const bp = biquad(M, 'bandpass', f0, 1.8);
  eramp(M, bp.frequency, [[g0, f0], [g1, f1]]);
  const e = gain(M, 0);
  eramp(M, e.gain, [[g0, amp * 0.01], [g1 - 0.01, amp]]);
  e.gain.setTargetAtTime(0, M.t(g1), release / 3);
  n.connect(bp).connect(e).connect(out);
  if (pitch) {
    const lp = biquad(M, 'lowpass', 400, 1.2);
    eramp(M, lp.frequency, [[g0, 300], [g1, 6000]]);
    const pe = gain(M, 0);
    eramp(M, pe.gain, [[g0, amp * 0.004], [g1 - 0.01, amp * 0.45]]);
    pe.gain.setTargetAtTime(0, M.t(g1), release / 3);
    for (const [k, d] of [[1, -9], [1, 8], [2, 3], [1.5, -4]]) {
      const o = osc(M, 'sawtooth', pitch[0] * k, g0, g1 + 0.3, { detune: d });
      eramp(M, o.frequency, [[g0, pitch[0] * k], [g1, pitch[1] * k]]);
      const og = gain(M, 0.25); o.connect(og).connect(lp);
    }
    lp.connect(pe).connect(out);
  }
}
export function whoosh(M, out, g, dur, { amp = 0.2, f0 = 300, f1 = 2500, pan0 = -0.8, pan1 = 0.8, q = 0.8, seed = 'wh' } = {}) {
  const n = M.noise('pink', g, dur + 0.5, seed);
  const bp = biquad(M, 'bandpass', f0, q);
  eramp(M, bp.frequency, [[g, f0], [g + dur * 0.55, f1], [g + dur, f0 * 1.2]]);
  const e = gain(M, 0);
  curve(M, e.gain, g, g + dur, x => amp * Math.pow(Math.sin(Math.PI * clamp((x - g) / dur)), 2), 100);
  const p = M.ctx.createStereoPanner();
  ramp(M, p.pan, [[g, pan0], [g + dur, pan1]]);
  n.connect(bp).connect(e).connect(p).connect(out);
}

// ---------------------------------------------------------------- organ (additive ranks)
export function organNote(M, out, g0, g1, f, amp = 0.1, seed = 'org') {
  const r = R(seed + g0 + f);
  const principal = wave(M, 'principal', 32, n => Math.pow(n, -1.25) * (n % 2 ? 1 : 0.8));
  const flute = wave(M, 'flute', 12, n => (n % 2 ? 1 : 0.12) * Math.pow(n, -2));
  const env = gain(M, 0);
  ramp(M, env.gain, [[g0, 0], [g0 + 0.12, amp], [g1, amp]]);
  env.gain.setTargetAtTime(0, M.t(g1), 0.18);
  const stop = g1 + 2;
  const lp = biquad(M, 'lowpass', Math.min(9000, 4500 + f * 6), 0.5);
  const ranks = [[1, 1, principal], [2, 0.45, principal], [3, 0.16, principal], [4, 0.14, principal], [6, 0.06, principal], [8, 0.05, principal]];
  if (f < 260) ranks.push([0.5, 0.6, flute]);
  for (const [k, a, w] of ranks) {
    if (f * k > 12000) continue;
    const o = osc(M, null, f * k, g0, stop, { wave: w, detune: (r() - 0.5) * 5 });
    const og = gain(M, a); o.connect(og).connect(lp);
  }
  // chiff: breathy onset of the pipe
  const n = M.noise('white', g0, 0.4, seed); const bp = biquad(M, 'bandpass', Math.min(8000, f * 3), 3); const ne = gain(M, 0);
  perc(M, ne.gain, g0, { a: 0.01, peak: amp * 0.6, tau: 0.04 });
  n.connect(bp).connect(ne).connect(out);
  lp.connect(env).connect(out);
}

// ---------------------------------------------------------------- string ensemble voice
// notes: [[g, f, amp], ...] legato pitch/amp targets. mode 'sustain' | 'tremolo' | 'spiccato' (amp gated per note).
export function strings(M, out, g0, g1, notes, { n = 5, spread = 11, cutoff = 2400, mode = 'sustain', trem = 11, seed = 'str', attack = 0.3, noteLen = 0.12, release = 0.4 } = {}) {
  const r = R(seed + g0);
  const lp = biquad(M, 'lowpass', cutoff, 0.6);
  const hp = biquad(M, 'highpass', 70, 0.7);
  const body = biquad(M, 'peaking', 1100, 1.2, -3);
  const env = gain(M, 0);
  const stop = g1 + release * 6;
  for (let k = 0; k < n; k++) {
    const o = osc(M, 'sawtooth', notes[0][1], g0, stop);
    const T0 = Math.max(0, M.t(g0));
    o.frequency.setValueAtTime(notes[0][1], T0);
    for (let i = 1; i < notes.length; i++) {
      if (mode === 'spiccato') o.frequency.setValueAtTime(notes[i][1], M.t(notes[i][0]));
      else o.frequency.setTargetAtTime(notes[i][1], M.t(notes[i][0]), 0.04);
    }
    const base = (k - (n - 1) / 2) * (spread * 2 / Math.max(1, n - 1)) + (r() - 0.5) * 3;
    const vr = 5 + r() * 1.2, vd = 6 + r() * 5, ph = r() * 6.28;
    curve(M, o.detune, g0, stop, x => base + vd * Math.sin(2 * Math.PI * vr * (x - g0) + ph) * clamp((x - g0) / 0.8), 60);
    const og = gain(M, 1 / n);
    const pn = M.ctx.createStereoPanner(); pn.pan.value = (k / Math.max(1, n - 1)) * 1.2 - 0.6;
    o.connect(og).connect(pn).connect(lp);
  }
  lp.connect(hp).connect(body).connect(env).connect(out);
  if (mode === 'spiccato') {
    env.gain.setValueAtTime(0, Math.max(0, M.t(g0)));
    for (let i = 0; i < notes.length; i++) {
      const T = M.t(notes[i][0]), a = notes[i][2];
      env.gain.setTargetAtTime(a, T, 0.006);
      env.gain.setTargetAtTime(a * 0.12, T + noteLen, 0.03);
    }
    env.gain.setTargetAtTime(0, M.t(g1), release / 3);
  } else {
    const T0 = Math.max(0, M.t(g0));
    env.gain.setValueAtTime(0, T0);
    env.gain.linearRampToValueAtTime(notes[0][2], T0 + attack);
    for (let i = 1; i < notes.length; i++) env.gain.setTargetAtTime(notes[i][2], M.t(notes[i][0]), 0.25);
    env.gain.setTargetAtTime(0, M.t(g1), release / 3);
    if (mode === 'tremolo') {
      const tg = gain(M, 1);
      env.disconnect(); env.connect(tg).connect(out);
      curve(M, tg.gain, g0, stop, x => { const ph = (x - g0) * trem; const fr = ph - Math.floor(ph); return 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * fr), 1.5); }, trem * 16);
    }
  }
  return lp;
}

// ---------------------------------------------------------------- drone voice (one pitch of the tower)
export function droneVoice(M, out, g0, g1, f, ampFn, { seed = 'dr', bright = 6, detune = 7, pans = [-0.7, 0, 0.7], rate = 20 } = {}) {
  const r = R(seed + f);
  const w = wave(M, 'tower', 28, n => Math.pow(n, -1.15) * (n % 2 ? 1 : 0.75));
  const lp = biquad(M, 'lowpass', f * bright, 0.7);
  const fn = (seed + 'lfo');
  const sA = r() * 1000, sB = r() * 1000;
  curve(M, lp.frequency, g0, g1, x => (f * bright + 420) * (1 + 0.45 * Math.sin(2 * Math.PI * x * (0.05 + (sA % 7) / 100) + sA)), 10);
  const env = gain(M, 0);
  curve(M, env.gain, g0, g1, x => ampFn(x) * (1 + 0.22 * Math.sin(2 * Math.PI * x * (0.07 + (sB % 5) / 100) + sB)), rate);
  pans.forEach((p, i) => {
    const d = (i - (pans.length - 1) / 2) * detune + (r() - 0.5) * 3;
    const o = osc(M, null, f, g0, g1 + 0.1, { wave: w });
    const ph = r() * 6.28, cr = 0.11 + r() * 0.13;
    curve(M, o.detune, g0, g1, x => d + 2.5 * Math.sin(2 * Math.PI * cr * x + ph), 10);
    const pn = M.ctx.createStereoPanner(); pn.pan.value = p;
    const og = gain(M, 1 / pans.length);
    o.connect(og).connect(pn).connect(lp);
  });
  lp.connect(env).connect(out);
}

// ---------------------------------------------------------------- felted low piano-like note
export function lowNote(M, out, g, f, { amp = 0.4, dur = 9, seed = 'low' } = {}) {
  const B = 0.0003;
  const sum = gain(M, amp);
  const lp = biquad(M, 'lowpass', 1800, 0.5);
  sum.connect(lp).connect(out);
  for (let n = 1; n <= 14; n++) {
    const fn = f * n * Math.sqrt(1 + B * n * n);
    const a = Math.pow(n, -1.1) * (n === 1 ? 0.8 : 1) * Math.exp(-n / 9);
    const tau1 = dur * 0.12 / Math.sqrt(n), tau2 = dur * 0.45 / Math.pow(n, 0.7);
    for (const [k, w, tau] of [[1, 0.6, tau1], [1.0004, 0.4, tau2]]) {
      const o = osc(M, 'sine', fn * k, g, g + tau * 8);
      const e = gain(M, 0); perc(M, e.gain, g, { a: 0.006 + n * 0.0004, peak: a * w, tau });
      o.connect(e).connect(sum);
    }
  }
  const sub = osc(M, 'sine', f / 2, g, g + dur * 2);
  const se = gain(M, 0); perc(M, se.gain, g, { a: 0.05, peak: 0.35, tau: dur * 0.3 });
  sub.connect(se).connect(sum);
}

export function tinnitus(M, out, g, { f = 8000, amp = 0.02, dur = 6 } = {}) {
  const o = osc(M, 'sine', f, g, g + dur + 0.5);
  curve(M, o.detune, g, g + dur, x => 1.5 * Math.sin(2 * Math.PI * 0.7 * (x - g)), 20);
  const e = gain(M, 0);
  curve(M, e.gain, g, g + dur, x => { const u = (x - g) / dur; return amp * Math.min(1, u * 40) * Math.pow(1 - u, 2.2); }, 60);
  o.connect(e).connect(out);
}
