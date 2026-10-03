// Environmental sound: wind, sand, sea, snow, earthquake, sparks, rocket, text stream.
import { R, clamp, keyAt, fbm, smoothNoise, gain, biquad, shaper, curve, ramp, eramp, perc, osc } from './core.js';
import { blip } from './instruments.js';

// Wind with gusts. level: keyframes [[g, amp]]; gust 0..1 how much it surges.
export function wind(M, out, g0, g1, level, { gust = 0.6, center = 500, whistle = 0.15, seed = 'wind', gustRate = 0.18 } = {}) {
  const gn = fbm(seed + 'g', gustRate), cn = fbm(seed + 'c', 0.11), wn = smoothNoise(seed + 'w', 0.07);
  const env = x => keyAt(level, x) * Math.max(0, 1 + gust * gn(x) * 1.4);
  // body: two decorrelated pink noises, band-passed
  for (const [ch, pan] of [['L', -0.75], ['R', 0.75]]) {
    const n = M.noise('pink', g0, g1 - g0 + 0.5, seed + ch);
    const bp = biquad(M, 'bandpass', center, 0.55);
    curve(M, bp.frequency, g0, g1, x => center * Math.pow(2, 0.9 * cn(x + (ch === 'L' ? 0 : 7)) + 0.6 * gn(x)), 20);
    const lp = biquad(M, 'lowpass', 2500, 0.5);
    const e = gain(M, 0);
    curve(M, e.gain, g0, g1, x => env(x + (ch === 'L' ? 0 : 0.35)), 40);
    const p = M.ctx.createStereoPanner(); p.pan.value = pan;
    n.connect(bp).connect(lp).connect(e).connect(p).connect(out);
  }
  // whistle: narrow resonance that bends with the gusts
  if (whistle > 0) {
    const n = M.noise('white', g0, g1 - g0 + 0.5, seed + 'wh');
    const bp = biquad(M, 'bandpass', 900, 14);
    curve(M, bp.frequency, g0, g1, x => 700 * Math.pow(2, 0.8 * wn(x) + 0.5 * gn(x)), 20);
    const e = gain(M, 0);
    curve(M, e.gain, g0, g1, x => whistle * env(x) * clamp(0.3 + gn(x)), 40);
    n.connect(bp).connect(e).connect(out);
  }
}

// Sand hiss: granular grit, high-passed.
export function sand(M, out, g0, g1, level, { seed = 'sand', hp = 2500, pan = 0 } = {}) {
  const src = M.ctx.createBufferSource(); src.buffer = M.noiseBufs.grains; src.loop = true;
  src.start(M.t(g0), R(seed)() * 5); src.stop(M.t(g1) + 0.1);
  const h = biquad(M, 'highpass', hp, 0.6), sh = biquad(M, 'highshelf', 7000, 0.7, -6);
  const e = gain(M, 0);
  const gn = fbm(seed, 0.4);
  curve(M, e.gain, g0, g1, x => keyAt(level, x) * (0.75 + 0.35 * gn(x)), 40);
  const p = M.ctx.createStereoPanner(); p.pan.value = pan;
  src.connect(h).connect(sh).connect(e).connect(p).connect(out);
}

// Sea: a low swell bed plus individual waves (swell → crash → wash).
export function sea(M, out, g0, g1, level, { seed = 'sea', period = 7.5 } = {}) {
  const r = R(seed);
  const bed = M.noise('brown', g0, g1 - g0 + 1, seed + 'bed');
  const lp = biquad(M, 'lowpass', 350, 0.6), e = gain(M, 0);
  const sn = fbm(seed + 'b', 0.15);
  curve(M, e.gain, g0, g1, x => keyAt(level, x) * 0.5 * (0.8 + 0.3 * sn(x)), 20);
  bed.connect(lp).connect(e).connect(out);
  let t = g0 - r() * 3;
  while (t < g1) {
    const sw = 2.2 + r() * 1.5, wash = 3 + r() * 2.5, crash = t + sw;
    if (crash > g0 + 0.5) {
      const ws = Math.max(g0, t), we = Math.min(g1 + 4, crash + wash);
      const a = keyAt(level, crash) * (0.6 + r() * 0.5);
      const pan = (r() - 0.5) * 1.4;
      const tt = t;
      M.at(ws, () => { const t = tt;
      // body
      const n = M.noise('pink', ws, we - ws + 0.2, seed + t);
      const f = biquad(M, 'lowpass', 400, 0.7);
      curve(M, f.frequency, ws, we, x => x < crash ? 300 + 900 * Math.pow(clamp((x - t) / sw), 2) : 300 + 2600 * Math.exp(-(x - crash) / 0.7), 40);
      const ge = gain(M, 0);
      curve(M, ge.gain, ws, we, x => a * (x < crash ? Math.pow(clamp((x - t) / sw), 2.2) : Math.exp(-(x - crash) / (wash * 0.35))), 50);
      const p = M.ctx.createStereoPanner(); p.pan.value = pan;
      n.connect(f).connect(ge).connect(p).connect(out);
      // foam hiss
      const n2 = M.noise('white', crash - 0.1, wash + 0.5, seed + t + 'f');
      const hp = biquad(M, 'highpass', 2500, 0.5), fe = gain(M, 0);
      perc(M, fe.gain, crash, { a: 0.15, peak: a * 0.18, tau: wash * 0.25 });
      const p2 = M.ctx.createStereoPanner(); p2.pan.value = -pan * 0.5;
      n2.connect(hp).connect(fe).connect(p2).connect(out);
      });
    }
    t += period * (0.7 + r() * 0.6);
  }
}

// Snow hush: almost nothing — a breath of high, soft noise.
export function snow(M, out, g0, g1, level, { seed = 'snow' } = {}) {
  const n = M.noise('pink', g0, g1 - g0 + 0.5, seed);
  const hp = biquad(M, 'highpass', 900, 0.5), lp = biquad(M, 'lowpass', 7000, 0.5);
  const e = gain(M, 0);
  const sn = fbm(seed, 0.12);
  curve(M, e.gain, g0, g1, x => keyAt(level, x) * (0.85 + 0.25 * sn(x)), 20);
  n.connect(hp).connect(lp).connect(e).connect(out);
}

// Earthquake: sub rumble with tremor pulses + groan.
export function quake(M, out, g, { dur = 4, amp = 0.8, seed = 'quake' } = {}) {
  const tr = fbm(seed + 't', 9), sl = fbm(seed + 's', 0.8);
  const n = M.noise('brown', g, dur + 1, seed);
  const lp1 = biquad(M, 'lowpass', 90, 0.8), lp2 = biquad(M, 'lowpass', 140, 0.6);
  const sh = shaper(M, 2.5);
  const e = gain(M, 0);
  const env = x => { const u = x - g; return u < 0.35 ? u / 0.35 : Math.exp(-(u - 0.35) / (dur * 0.38)); };
  curve(M, e.gain, g, g + dur, x => amp * env(x) * (0.7 + 0.5 * Math.abs(tr(x))), 120);
  n.connect(lp1).connect(sh).connect(lp2).connect(e).connect(out);
  // sub wobble
  const o = osc(M, 'sine', 31, g, g + dur + 0.5);
  curve(M, o.frequency, g, g + dur, x => 31 + 6 * sl(x), 30);
  const oe = gain(M, 0);
  curve(M, oe.gain, g, g + dur, x => amp * 0.6 * env(x), 60);
  o.connect(oe).connect(out);
  // stone groan
  const gs = osc(M, 'sawtooth', 52, g, g + dur);
  curve(M, gs.frequency, g, g + dur, x => 48 + 10 * sl(x + 3), 30);
  const bp = biquad(M, 'bandpass', 180, 3);
  curve(M, bp.frequency, g, g + dur, x => 150 + 120 * (sl(x + 9) + 1), 30);
  const ge = gain(M, 0);
  curve(M, ge.gain, g, g + dur, x => amp * 0.25 * env(x), 60);
  gs.connect(bp).connect(ge).connect(out);
}

// Falling stone debris: many low thuds and cracks.
export function debris(M, out, g0, g1, { count = 40, amp = 0.4, seed = 'debris' } = {}) {
  const r = R(seed);
  for (let i = 0; i < count; i++) {
    const t = g0 + (g1 - g0) * Math.pow(r(), 1.3);
    const a = amp * (0.25 + r() * 0.75) * (1 - 0.6 * (t - g0) / (g1 - g0));
    const pan = (r() - 0.5) * 1.6, f0 = 70 + r() * 90, bf = 400 + r() * 1400, bt = 0.03 + r() * 0.05;
    M.at(t, () => {
    const p = M.ctx.createStereoPanner(); p.pan.value = pan; p.connect(out);
    const o = osc(M, 'sine', f0, t, t + 0.6);
    eramp(M, o.frequency, [[t, f0], [t + 0.1, f0 * 0.5]]);
    const e = gain(M, 0); perc(M, e.gain, t, { a: 0.002, peak: a, tau: 0.07 });
    o.connect(e).connect(p);
    const n = M.noise('pink', t, 0.6, seed + i);
    const lp = biquad(M, 'bandpass', bf, 0.8);
    const ne = gain(M, 0); perc(M, ne.gain, t, { a: 0.001, peak: a * 0.7, tau: bt });
    n.connect(lp).connect(ne).connect(p);
    });
  }
}

// Sparks falling into water: a sizzle bed with crackle spikes + tiny bubble plinks.
export function sparksWater(M, out, g0, g1, { amp = 0.2, seed = 'sparks' } = {}) {
  const r = R(seed);
  const src = M.ctx.createBufferSource(); src.buffer = M.noiseBufs.crackle; src.loop = true;
  src.start(M.t(g0), r() * 5); src.stop(M.t(g1) + 0.5);
  const hp = biquad(M, 'highpass', 3000, 0.6), pk = biquad(M, 'peaking', 6500, 1, 4);
  const e = gain(M, 0);
  curve(M, e.gain, g0, g1, x => amp * Math.sin(Math.PI * clamp((x - g0) / (g1 - g0))) ** 0.7, 30);
  src.connect(hp).connect(pk).connect(e).connect(out);
  const hiss = M.noise('white', g0, g1 - g0 + 0.5, seed + 'h');
  const bp = biquad(M, 'bandpass', 5500, 0.9), he = gain(M, 0);
  const hn = fbm(seed + 'f', 6);
  curve(M, he.gain, g0, g1, x => amp * 0.25 * Math.sin(Math.PI * clamp((x - g0) / (g1 - g0))) * (0.5 + 0.5 * Math.abs(hn(x))), 60);
  hiss.connect(bp).connect(he).connect(out);
  // bubbles: rising chirps
  for (let i = 0; i < 70; i++) {
    const t = g0 + (g1 - g0) * r();
    const f = 900 + r() * 2600, ba = amp * 0.15 * r(), bp2 = (r() - 0.5) * 1.6;
    M.at(t, () => {
      const o = osc(M, 'sine', f, t, t + 0.08);
      eramp(M, o.frequency, [[t, f], [t + 0.03, f * 1.6]]);
      const pe = gain(M, 0); perc(M, pe.gain, t, { a: 0.001, peak: ba, tau: 0.012 });
      const p = M.ctx.createStereoPanner(); p.pan.value = bp2;
      o.connect(pe).connect(p).connect(out);
    });
  }
}

// Rocket: crackling low roar. level keys; lowpass keys model the thinning atmosphere.
export function rocket(M, out, g0, g1, level, cutoff, { seed = 'rocket' } = {}) {
  const r = R(seed);
  const n = M.noise('brown', g0, g1 - g0 + 1, seed);
  const lp = biquad(M, 'lowpass', 400, 0.7);
  curve(M, lp.frequency, g0, g1, x => keyAt(cutoff, x), 30);
  const sh = shaper(M, 1.8);
  const e = gain(M, 0);
  const rn = fbm(seed + 'r', 3);
  curve(M, e.gain, g0, g1, x => keyAt(level, x) * (0.85 + 0.25 * rn(x)), 60);
  n.connect(sh).connect(lp).connect(e).connect(out);
  // crackle (Mach diamonds / shock noise)
  const c = M.ctx.createBufferSource(); c.buffer = M.noiseBufs.crackle; c.loop = true;
  c.start(M.t(g0), r() * 5); c.stop(M.t(g1) + 0.5);
  const clp = biquad(M, 'lowpass', 3000, 0.5);
  curve(M, clp.frequency, g0, g1, x => keyAt(cutoff, x) * 4, 30);
  const chp = biquad(M, 'highpass', 150, 0.5);
  const ce = gain(M, 0);
  curve(M, ce.gain, g0, g1, x => keyAt(level, x) * 2.2, 30);
  c.connect(chp).connect(clp).connect(ce).connect(out);
  // sub
  const o = osc(M, 'sine', 34, g0, g1 + 0.5);
  const oe = gain(M, 0);
  curve(M, oe.gain, g0, g1, x => keyAt(level, x) * 0.5 * clamp(keyAt(cutoff, x) / 600), 30);
  o.connect(oe).connect(out);
}

// Text stream: fine glittering ticks of flowing characters.
export function textStream(M, out, g0, g1, density, { amp = 0.03, seed = 'text', scale = [74, 76, 78, 81, 83] } = {}) {
  const r = R(seed);
  let t = g0;
  while (t < g1) {
    const d = keyAt(density, t);
    if (d <= 0.01) { t += 0.05; continue; }
    t += -Math.log(1 - r() * 0.999) / d;
    if (t >= g1) break;
    const m = scale[Math.floor(r() * scale.length)] + 12 * Math.floor(r() * 2);
    const pn = (r() - 0.5) * 1.8, a = amp * (0.3 + r() * 0.7), tau = 0.01 + r() * 0.03, tt = t;
    M.at(tt, () => { const p = M.ctx.createStereoPanner(); p.pan.value = pn; p.connect(out); blip(M, p, tt, 440 * Math.pow(2, (m - 69) / 12), a, tau); });
  }
}
