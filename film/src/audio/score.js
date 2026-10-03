// 巴别 BABEL — the score. Every sound is synthesised here, in the browser, with
// Web Audio OfflineAudioContexts. No samples.
//
//   renderScore({ sampleRate, from, to }) → AudioBuffer (stereo)
//
// The film is rendered as independent segments separated by its hard cuts
// (white flash 146.0, cut to black 208.0, epilogue cut 237.6) plus one near-silent
// seam (93.8, after the Pharos embers die). Each segment is its own
// OfflineAudioContext, so nothing — not even a reverb tail — leaks across a cut,
// and the segments render in parallel. Nodes are created lazily (ctx.suspend)
// so the graph only ever holds what is sounding.
import { TYPING_PROLOGUE, TYPING_EPILOGUE, HITS, FIFTHS, PULSE, EPILOGUE_CUT, DISINTEGRATE } from '../cues.js';
import { DURATION } from '../timeline.js';
import { Mix, R, PC, hz, mhz, midi, db, clamp, sstep, keyAt, gain, biquad, osc, ramp, curve, perc } from './core.js';
import { makeNoise, makeCrackle, makeGrains, makeIR, SPACES } from './buffers.js';
import * as I from './instruments.js';
import { formantVoice, babble } from './voices.js';
import * as A from './ambience.js';

const LAT = 288;                  // DynamicsCompressor look-ahead (frames at any rate: Chrome uses 6 ms @ 48k → measured 288)
const MASTER_GAIN = db(0);        // calibrated against EBU R128 (see tools/audio.mjs output)
const CEILING = db(-1.3);         // true-peak ceiling (4× oversampled detection)

// ------------------------------------------------------------------ segments
const SEGS = [
  { g0: 0, g1: 93.8, spaces: ['room', 'desert', 'hall', 'cathedral'] },
  { g0: 93.8, g1: HITS.flash, spaces: ['hall', 'cathedral'] },
  { g0: HITS.flash, g1: HITS.cutToBlack, spaces: ['hall', 'cathedral'] },
  { g0: HITS.returnFromBlack, g1: EPILOGUE_CUT, spaces: ['room', 'hall'] },
  { g0: EPILOGUE_CUT, g1: DURATION, spaces: ['hall', 'cathedral'] },
];

// ------------------------------------------------------------------ the tower of fifths
const ENTRY = Object.fromEntries(FIFTHS.map(([t, n]) => [n, t]));
const ORDER = FIFTHS.map(([, n]) => n);
const VOICING = { D: 'D2', A: 'A2', E: 'E3', B: 'B3', 'F#': 'F#4', 'C#': 'C#5', 'G#': 'G#5', 'D#': 'D#6', 'A#': 'A#3', F: 'F3', C: 'C4', G: 'G3' };
const VLEVEL = { D: 1, A: 0.85, E: 0.7, B: 0.55, 'F#': 0.42, 'C#': 0.3, 'G#': 0.2, 'D#': 0.12, 'A#': 0.5, F: 0.5, C: 0.42, G: 0.5 };
const SKY0 = 153.5, WORD0 = 176.5;
// restack time of the older notes when the Word section rebuilds the tower
const RESTACK = {};
ORDER.forEach((n, i) => { if (n !== 'D' && n !== 'A' && ENTRY[n] < SKY0) RESTACK[n] = WORD0 + 0.45 * (i - 2); });
function presence(n, t) {
  if (t < SKY0 - 7.5) return sstep(ENTRY[n] - 1.5, ENTRY[n] + 3.5, t);
  if (n === 'D' || n === 'A') return 1;
  if (t < WORD0) return 0;
  if (RESTACK[n] !== undefined) return sstep(RESTACK[n], RESTACK[n] + 1.5, t);
  return sstep(ENTRY[n] - 0.5, ENTRY[n] + 2.5, t);
}
const activePCs = t => ORDER.filter(n => presence(n, t) > 0.5);
// section level of the drone (global keyframes)
const DRONE_LVL = [
  [0, 0], [1, 0], [7, 0.16], [16, 0.2], [24, 0.3], [31, 0.35], [33, 0.8], [37, 0.55], [46, 0.55], [60, 0.5], [67, 0.75],
  [76, 0.85], [81, 0.55], [89, 0.55], [90.5, 0.7], [92.0, 0.12], [93.2, 0],
  [93.8, 0], [96, 0.3], [107.6, 0.3], [108.4, 0.2], [120, 0.28], [127, 0.32], [129, 0.5], [140, 0.65], [146, 0.85],
  [146.01, 0], [160, 0], [164, 0.22], [176, 0.3], [180, 0.55], [196, 0.8], [208, 1.0],
];

// ------------------------------------------------------------------ the labour pulse
const RAMP = 12;
function pulseGrid() {
  const groups = []; let cur = null;
  for (const [t, b] of PULSE) {
    if (b > 0) { if (!cur) { cur = []; groups.push(cur); } cur.push([t, b]); }
    else if (cur) { cur.push([t, 0]); cur = null; }
  }
  const beats = [];
  groups.forEach((grp, gi) => {
    let idx = 0;
    for (let k = 0; k < grp.length - 1; k++) {
      const [ta, ba] = grp[k], [tb, bb] = grp[k + 1];
      const rs = bb > 0 ? Math.max(ta, tb - RAMP) : tb;
      const bpm = t => (t < rs ? ba : ba + (bb - ba) * (t - rs) / (tb - rs));
      const dt = 0.0005, ph = [0];
      for (let t = ta; t < tb - 1e-9; t += dt) ph.push(ph[ph.length - 1] + bpm(t) / 60 * dt);
      const Phi = ph[ph.length - 1];
      const N = bb > 0 ? Math.max(4, Math.round(Phi / 4) * 4) : Math.ceil(Phi - 1e-6);
      const scale = bb > 0 ? N / Phi : 1;
      let j = 0;
      for (let n = 0; n < N; n++) {
        const target = n / scale;
        while (j < ph.length - 2 && ph[j + 1] < target) j++;
        const fr = (target - ph[j]) / ((ph[j + 1] - ph[j]) || 1);
        const t = ta + (j + fr) * dt;
        if (t < tb - 1e-6) beats.push({ t, p: 60 / (bpm(t) * scale), i: idx++, grp: gi });
      }
    }
  });
  return beats;
}

// ------------------------------------------------------------------ helpers
const pan = (M, out, p) => { const n = M.ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); n.connect(out); return n; };
function delayBus(M, out, time, fb = 0.35, wet = 0.5) {
  const inp = gain(M, 1);
  const dl = M.ctx.createDelay(2), dr = M.ctx.createDelay(2);
  dl.delayTime.value = time; dr.delayTime.value = time;
  const fl = gain(M, fb), fr = gain(M, fb), lp = biquad(M, 'lowpass', 3500, 0.5);
  const merger = M.ctx.createChannelMerger(2);
  const w = gain(M, wet);
  inp.connect(out);
  inp.connect(lp).connect(dl);
  dl.connect(fl).connect(dr); dr.connect(fr).connect(dl);
  dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
  merger.connect(w).connect(out);
  return inp;
}

// Choir voice: sustained formant voice following [[t, midi, amp, vowel?], ...]
function choirVoice(M, out, g0, g1, notes, { sex = 'm', seed = 'ch', vib = 22, breath = 0.1, attack = 1.5, release = 1.2, bright = 1 } = {}) {
  const ev = [];
  ev.push({ t: g0, f: mhz(notes[0][1]) * 0.985, v: notes[0][3] || 'a', amp: 0, tau: 0.05 });
  for (const [t, m, a, v] of notes) ev.push({ t: Math.max(g0 + 0.001, t), f: mhz(m), ftau: 0.08, amp: a, atau: t === notes[0][0] ? attack / 3 : 0.5, v, tau: 0.25 });
  ev.push({ t: g1 - release, amp: 0, atau: release / 3 });
  formantVoice(M, out, { g0, g1: g1 + 0.2, sex, events: ev, vib: x => vib * clamp((x - g0) / 1.5), breath, seed, jitter: 6, bright });
}

// ------------------------------------------------------------------ composition
function compose(M) {
  const at = (g, fn) => M.at(g, fn);

  // ---------- buses
  const BUS = {
    typing: () => M.bus('typing', { send: { room: 0.5, hall: 0.1 } }),
    drone: () => M.bus('drone', { send: { hall: 0.35, cathedral: M.g0 >= 93 && M.g0 < 146 ? 0.15 : 0.08 } }),
    murmur: () => M.bus('murmur', { send: { hall: 0.55, desert: 0.3 }, dry: 0.6 }),
    choir: () => M.bus('choir', { send: { hall: 0.55, cathedral: M.g0 > 90 ? 0.35 : 0.1, desert: 0.15 }, dry: 0.75 }),
    bells: () => M.bus('bells', { send: { hall: 0.45, cathedral: 0.25 }, dry: 0.85 }),
    big: () => M.bus('big', { send: { hall: 0.3, cathedral: 0.55 }, dry: 0.9 }),
    sfx: () => M.bus('sfx', { send: { hall: 0.15, desert: 0.25 } }),
    amb: () => M.bus('amb', { send: { desert: 0.15, hall: 0.05 } }),
    labour: () => M.bus('labour', { send: { desert: 0.35, hall: 0.18 } }),
    strings: () => M.bus('strings', { send: { hall: 0.45, cathedral: 0.1 }, dry: 0.85 }),
    organ: () => M.bus('organ', { send: { cathedral: 0.7, hall: 0.2 }, dry: 0.7 }),
    sub: () => M.bus('sub', { send: {} }),
    arp: () => { if (!M._arp) M._arp = delayBus(M, M.bus('arpOut', { send: { hall: 0.35 } }), 0.375 * 0.75, 0.38, 0.45); return M._arp; },
  };

  // ---------- the drone tower
  {
    const segLvl = x => keyAt(DRONE_LVL, x);
    for (const n of ORDER) {
      const f = hz(VOICING[n]);
      const ampFn = x => 0.06 * VLEVEL[n] * presence(n, x) * segLvl(x);
      // first moment it sounds within this segment
      let s = null, e = M.g1;
      for (let x = M.g0; x < M.g1; x += 0.25) if (ampFn(x) > 1e-4) { s = Math.max(M.g0, x - 0.3); break; }
      if (s === null || M.g0 >= 216) continue;
      const bright = M.g0 >= 120 ? 5 : 3.5;
      at(s, () => I.droneVoice(M, BUS.drone(), s, e, f, ampFn, { seed: 'tower' + n, bright }));
      if (n === 'D') at(s, () => {   // sub-octave hum
        const o = osc(M, 'sine', f / 2, s, e + 0.1);
        const g = gain(M, 0);
        curve(M, g.gain, s, e, x => ampFn(x) * 0.8, 20);
        o.connect(g).connect(M.bus('sub', { send: {} }));
      });
    }
  }

  // ---------- PROLOGUE 0 – 39.5
  // babel murmur: many tongues, far away
  at(0.8, () => {
    const bus = gain(M, 0);
    ramp(M, bus.gain, [[0.8, 0], [4.5, 0.3], [6.2, 0.2], [14.5, 0.2], [21.5, 0]]);
    const lp = biquad(M, 'lowpass', 2600, 0.5);
    bus.connect(lp).connect(BUS.murmur());
    for (let i = 0; i < 11; i++) {
      const r = R('mur' + i), sex = i % 2 ? 'f' : 'm';
      const f0 = sex === 'm' ? 92 + r() * 50 : 165 + r() * 80;
      const ev = babble('mur' + i, 0.9, 21.5, { sex, f0, level: 0.11 * (0.6 + r() * 0.6), rate: 0.85 + r() * 0.4 });
      formantVoice(M, pan(M, bus, -0.9 + 1.8 * ((i * 7) % 11) / 10), { g0: 0.85, g1: 22, sex, events: ev, breath: 0.25, seed: 'mur' + i, jitter: 18 });
    }
  });
  at(HITS.cursorIn, () => I.bell(M, pan(M, BUS.bells(), -0.25), HITS.cursorIn, hz('D6'), { kind: 'glass', dur: 3, amp: 0.012, strike: 0 }));

  // typing ticks
  const typing = (list, seed, ampScale = 1) => {
    const r = R(seed), SC = [74, 76, 78, 81, 83, 86, 88];
    let idx = 2, style = 'zh', col = 0;
    for (const [t, kind, txt] of list) {
      if (kind === 'nl') { style = txt; col = 0; idx = txt === 'en' ? 3 : txt === 'cmt' ? 2 : 2; continue; }
      if (kind === 'back') {
        col = Math.max(0, col - 1);
        at(t, () => I.backTick(M, pan(M, BUS.typing(), -0.32 + col * 0.05), t, mhz(col % 2 ? 57 : 62), 0.09 * ampScale));
        continue;
      }
      let m;
      const s = txt.trim();
      if (s === '。' || s === '.') m = 74;
      else if (/[？?]/.test(s)) m = 88;
      else {
        const step = [-2, -1, 1, 1, 2][Math.floor(r() * 5)];
        idx = clamp(idx + step, 0, SC.length - 1);
        m = SC[idx];
      }
      if (style === 'cmt') m -= 12;
      const a = (style === 'cmt' ? 0.045 : style === 'en' ? 0.055 : 0.065) * (0.85 + 0.3 * r()) * ampScale;
      const p = -0.32 + col * 0.05;
      col += Math.max(1, Math.round(s.length / 2));
      at(t, () => I.tick(M, pan(M, BUS.typing(), p), t, mhz(m), a));
    }
  };
  typing(TYPING_PROLOGUE, 'typeP');

  // text becomes sand; camera tilts down through the dark
  at(DISINTEGRATE, () => {
    A.sand(M, BUS.amb(), DISINTEGRATE, 46, [[DISINTEGRATE, 0], [16.6, 0.05], [19, 0.075], [23, 0.04], [26, 0.02], [31, 0.03], [33, 0.07], [36, 0.1], [39.5, 0.04], [44, 0.01], [46, 0]], { seed: 'sandP' });
    I.whoosh(M, BUS.sfx(), 16.3, 4.5, { amp: 0.02, f0: 2600, f1: 500, pan0: -0.2, pan1: 0.2, q: 0.6 });
  });
  // wind: plains, dust devil, mud, stone
  at(19.5, () => A.wind(M, BUS.amb(), 19.5, 93.4, [
    [19.5, 0], [24, 0.065], [30, 0.085], [32.6, 0.2], [33.2, 0.15], [36, 0.22], [39.5, 0.14], [42, 0.05], [56, 0.05], [60, 0.06],
    [64, 0.1], [68, 0.12], [72, 0.08], [76, 0.1], [77, 0.04], [82, 0.03], [84, 0], [93.4, 0]], { seed: 'windA', gust: 0.7, center: 480, whistle: 0.25 }));
  // gust riser into the title
  at(30.2, () => I.riser(M, BUS.sfx(), 30.2, HITS.braam, { amp: 0.09, f0: 250, f1: 3200, pitch: null, seed: 'gust', release: 0.15 }));
  // BRAAM — title
  at(HITS.braam - 0.05, () => {
    const g = HITS.braam;
    I.braam(M, BUS.big(), g, [hz('D1'), hz('D2'), hz('A2'), hz('D3')], { amp: 0.3, dur: 8, open: 2600 });
    I.subDrop(M, BUS.sub(), g, { f0: 75, f1: 28, dur: 2.4, amp: 0.55 });
    I.impact(M, BUS.big(), g, { amp: 0.42 });
    I.bell(M, BUS.big(), g, hz('D4'), { kind: 'church', dur: 9, amp: 0.1, bright: 0.8 });
  });
  // sand curtain wipe into MUD
  at(37.8, () => I.whoosh(M, BUS.sfx(), 37.8, 2.2, { amp: 0.12, f0: 500, f1: 4200, pan0: -0.95, pan1: 0.95, q: 0.5, seed: 'curtain' }));

  // ---------- MUD 38 – 69
  const beats = pulseGrid();
  for (const b of beats) {
    const { t, p, i, grp } = b;
    if (!M.has(t)) continue;
    const down = i % 4 === 0;
    if (grp === 0) {
      // hands on wet clay; three builders slightly apart
      const lvl = keyAt([[38, 0.15], [46, 0.19], [58, 0.24], [62, 0.22], [66.9, 0.03]], t) * (down ? 1.25 : 1);
      const r = R('hands' + i);
      for (let h = 0; h < 3; h++) {
        const tt = t + (h ? (r() - 0.3) * 0.03 : 0);
        at(tt, () => I.clayThump(M, pan(M, BUS.labour(), [0, -0.45, 0.5][h]), tt, lvl * (h ? 0.55 : 1), 'clay' + h));
      }
      if (t >= 58 && t < 66) { const tc = t + p / 2; at(tc, () => I.chisel(M, pan(M, BUS.labour(), 0.6), tc, 0.07 + 0.03 * (i % 2))); }
    } else if (grp === 1) ironBeat(b, down);
    else wordBeat(b, down);
  }
  // low male "ah"
  at(39, () => {
    const parts = [[50, 39, 'm', -0.3], [45, 39.5, 'm', 0.3], [50, 40.2, 'm', 0.1], [45, 41, 'm', -0.1], [52, 46.5, 'm', 0.45], [52, 47.2, 'm', -0.45]];
    parts.forEach(([m, g0, sex, p], k) => {
      const a = 0.06;
      choirVoice(M, pan(M, BUS.choir(), p), g0, 66, [[g0, m, a, 'a'], [52, m, a * 1.3, 'o'], [58, m, a * 1.5, 'a'], [62, m, a * 0.8, 'o']], { sex, seed: 'mudch' + k, vib: 12, breath: 0.12, attack: 3, release: 3 });
    });
  });
  // the crowd: the one language, distant
  at(38.5, () => {
    const bus = gain(M, 0);
    ramp(M, bus.gain, [[38.5, 0], [42, 0.8], [55, 0.8], [60, 0]]);
    const lp = biquad(M, 'lowpass', 1600, 0.5);
    bus.connect(lp).connect(BUS.murmur());
    for (let i = 0; i < 6; i++) {
      const r = R('crowd' + i), sex = i % 2 ? 'f' : 'm';
      const ev = babble('crowd' + i, 38.6, 60, { sex, f0: sex === 'm' ? 100 + r() * 40 : 180 + r() * 60, level: 0.08, rate: 1 });
      formantVoice(M, pan(M, bus, -0.8 + 1.6 * i / 5), { g0: 38.5, g1: 60.5, sex, events: ev, breath: 0.3, seed: 'crowd' + i });
    }
  });
  at(67.3, () => I.whoosh(M, BUS.sfx(), 67.3, 2.0, { amp: 0.1, f0: 400, f1: 3500, pan0: -0.95, pan1: 0.95, q: 0.5, seed: 'sandwall' }));

  // ---------- STONE 67.5 – 83
  at(68, () => A.wind(M, BUS.amb(), 68, 77.6, [[68, 0], [69.5, 0.06], [75.6, 0.09], [76.2, 0.03], [77.6, 0]], { seed: 'rush', gust: 0.95, center: 1100, gustRate: 3.2, whistle: 0.05 }));
  at(75.2, () => I.whoosh(M, BUS.sfx(), 75.2, 2.2, { amp: 0.12, f0: 300, f1: 2200, pan0: 0.2, pan1: -0.3, q: 0.6, seed: 'apex' }));
  at(69, () => {
    const v = [[50, 'm', -0.5, 0.055], [57, 'm', 0.5, 0.05], [62, 'f', -0.25, 0.036], [69, 'f', 0.25, 0.03], [50, 'm', 0.1, 0.036]];
    v.forEach(([m, sex, p, a], k) => choirVoice(M, pan(M, BUS.choir(), p), 69 + k * 0.4, 82.5,
      [[69 + k * 0.4, m, a, 'o'], [76, m, a * 1.35, 'a'], [80, m, a * 0.9, 'a']], { sex, seed: 'stone' + k, vib: 16, attack: 3.5, release: 2.2 }));
  });
  { const r = R('quarry'); for (let k = 0; k < 11; k++) { const t = 69.5 + r() * 6.5, pn = (r() - 0.5) * 1.6, a = 0.025 + r() * 0.03; at(t, () => I.chisel(M, pan(M, M.bus('far', { send: { desert: 0.9 }, dry: 0.3 }), pn), t, a, 'q' + k)); } }
  at(HITS.starGlint, () => {
    const g = HITS.starGlint;
    I.bell(M, pan(M, BUS.bells(), 0), g, hz('E6'), { kind: 'glass', dur: 7, amp: 0.07, strike: 0.15 });
    I.bell(M, pan(M, BUS.bells(), 0.2), g + 0.004, hz('B6'), { kind: 'glass', dur: 5, amp: 0.03, strike: 0 });
    I.riser(M, BUS.bells(), 80.6, 82.4, { amp: 0.03, f0: 3500, f1: 9000, pitch: null, seed: 'glint', release: 0.5 });
  });

  // ---------- FIRE 81.5 – 94.5
  at(82, () => A.sea(M, M.bus('sea', { send: { hall: 0.12 } }), 82, 93.6, [[82, 0], [83.8, 0.22], [90, 0.26], [90.5, 0.3], [92.4, 0.14], [93.5, 0]], { seed: 'pharos' }));
  at(83, () => {
    const parts = [[38, -0.5], [45, 0.5], [50, -0.2], [54, 0.25], [57, 0]];
    parts.forEach(([m, p], k) => {
      const f = mhz(m), a = 0.09 * (k < 2 ? 1 : 0.7);
      const notes = [[83, f, a * 0.35], [86, f, a * 0.65], [89.4, f, a], [90.5, f * 0.98, a * 1.1], [91.0, f * 0.9, a * 0.8], [91.6, f * 0.8, a * 0.45], [92.2, f * 0.7, a * 0.15]];
      I.strings(M, pan(M, BUS.strings(), p), 83, 92.6, notes, { mode: 'tremolo', trem: 11 + k * 0.4, cutoff: 1400 + m * 15, seed: 'trem' + k, attack: 1.2, release: 0.8 });
    });
  });
  at(HITS.quake, () => {
    const g = HITS.quake;
    I.impact(M, BUS.big(), g, { amp: 0.35, tone: 0.8, seed: 'crack' });
    A.quake(M, BUS.sfx(), g, { dur: 3.4, amp: 0.55 });
    A.debris(M, BUS.sfx(), g + 0.25, 92.8, { count: 42, amp: 0.22 });
    A.sparksWater(M, M.bus('sparks', { send: { hall: 0.2 } }), 91.0, 93.4, { amp: 0.09 });
  });

  // ---------- WOOD 94 – 108.5
  at(94, () => A.snow(M, BUS.amb(), 94, 108.6, [[94, 0], [95.6, 0.02], [107, 0.02], [108.3, 0]]));
  // first statement of the motif on bronze chime bells (编钟): D – A – E – F#
  [['D4', 96.6, -0.35], ['A4', 97.5, -0.1], ['E5', 98.4, 0.12], ['F#5', 99.3, 0.35]].forEach(([n, t, p], k) =>
    at(t, () => I.bell(M, pan(M, BUS.bells(), p), t, hz(n), { kind: 'bronze', dur: 5.5 - k * 0.4, amp: 0.09, strike: 0.3, seed: 'bz' + k })));
  at(96.6, () => I.bell(M, pan(M, BUS.bells(), -0.2), 96.6, hz('D3'), { kind: 'bronze', dur: 6, amp: 0.06, strike: 0.2, seed: 'bzlow' }));
  // wind bells on each eave, rising
  {
    const notes = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6'];
    const SC = [74, 76, 78, 81, 83, 86, 88, 90, 93];
    HITS.bellsWood.forEach((t, k) => {
      const p = k % 2 ? 0.35 : -0.35;
      at(t, () => I.bell(M, pan(M, BUS.bells(), p), t, hz(notes[k]), { kind: 'chime', dur: 4.5, amp: 0.07, strike: 0.12, seed: 'wb' + k, beat: 1.2 }));
      const r = R('grace' + k);
      const gi = SC.indexOf(midi(notes[k])) + 1 + Math.floor(r() * 2);
      const tg = t + 0.12 + r() * 0.1;
      at(tg, () => I.bell(M, pan(M, BUS.bells(), -p * 0.6), tg, mhz(SC[Math.min(SC.length - 1, gi)]), { kind: 'chime', dur: 2.5, amp: 0.02, strike: 0.05, seed: 'wg' + k }));
    });
    at(101.2, () => I.bell(M, pan(M, BUS.bells(), -0.1), 101.2, hz('D3'), { kind: 'bronze', dur: 6, amp: 0.045, seed: 'bzl2' }));
    at(105.0, () => I.bell(M, pan(M, BUS.bells(), 0.1), 105.0, hz('A2'), { kind: 'bronze', dur: 6, amp: 0.04, seed: 'bzl3' }));
  }
  at(107.6, () => I.whoosh(M, BUS.sfx(), 107.6, 0.95, { amp: 0.09, f0: 110, f1: 420, pan0: 0.7, pan1: -0.7, q: 0.7, seed: 'swing' }));

  // ---------- FAITH 108 – 128.5
  at(HITS.bigBell, () => {
    const g = HITS.bigBell;
    I.bell(M, BUS.big(), g, hz('D4'), { kind: 'church', dur: 18, amp: 0.3, bright: 0.85, strike: 0.35, seed: 'bigbell' });
    I.subDrop(M, BUS.sub(), g, { f0: 74, f1: 72, dur: 3, amp: 0.25 });
  });
  at(118.4, () => I.bell(M, M.bus('farbell', { send: { cathedral: 0.8 }, dry: 0.35 }), 118.4, hz('D4'), { kind: 'church', dur: 14, amp: 0.1, bright: 0.8, seed: 'bigbell2' }));
  const CHORDS = [
    [109.2, [38, 45, 50, 54, 61, 64, 69], 0.032],
    [114.6, [35, 42, 50, 57, 61, 64, 66], 0.036],
    [119.0, [40, 47, 54, 57, 61, 64, 69], 0.04],
    [122.6, [33, 45, 52, 59, 61, 64, 73], 0.044],
    [125.6, [40, 47, 54, 59, 61, 66, 71], 0.04],
  ];
  CHORDS.forEach(([t, notes, a], k) => {
    const t1 = k + 1 < CHORDS.length ? CHORDS[k + 1][0] + 0.12 : 128.2;
    notes.forEach((m, j) => at(t, () => I.organNote(M, pan(M, BUS.organ(), (j / 6) * 1.2 - 0.6), t, t1, mhz(m), 0.55 * a * (m < 45 ? 1.2 : 1) * (k === 4 ? 0.85 : 1), 'org' + k + j)));
  });
  at(112, () => {
    const voices = [[1, 'm', -0.6], [2, 'm', -0.3], [3, 'm', 0.3], [4, 'f', -0.15], [5, 'f', 0.15], [6, 'f', 0.6], [2, 'm', 0.6], [5, 'f', -0.6]];
    voices.forEach(([j, sex, p], k) => {
      const notes = CHORDS.filter(c => c[0] < 127).map(([t, ns], ci) => [Math.max(112 + k * 0.3, t), ns[j] + (sex === 'f' && ns[j] < 60 ? 12 : 0), 0.018 + ci * 0.0065, ci % 2 ? 'o' : 'a']);
      notes[0][0] = 112 + k * 0.3;
      choirVoice(M, pan(M, BUS.choir(), p), 112 + k * 0.3, 128.3, notes, { sex, seed: 'faith' + k, vib: 20, attack: 3, release: 1.6 });
    });
  });
  // gears begin to turn: clockwork accelerating into the iron pulse
  { let t = 124.6, k = 0; while (t < 128 - 0.02) { const tt = t, f = k % 2 ? 2600 : 3300, a = 0.03 + 0.05 * (t - 124.6) / 3.4; at(tt, () => I.gearTick(M, pan(M, BUS.labour(), k % 2 ? 0.3 : -0.3), tt, f, a)); const iv = 0.5 - 0.375 * (t - 124.6) / 3.4; t += iv; k++; } }

  // ---------- IRON 127.5 – 146
  function ironBeat({ t, p, i }, down) {
    const bar = Math.floor(i / 4), pos = i % 4;
    const late = t >= 136;
    at(t, () => I.piston(M, pan(M, BUS.labour(), -0.15), t, down ? 0.3 : 0.22));
    if (late) { const ta = t + p / 2; at(ta, () => I.piston(M, pan(M, BUS.labour(), 0.35), ta, 0.16, 'p2')); }
    if (pos === 1 || pos === 3) at(t, () => I.anvil(M, pan(M, BUS.labour(), 0.25), t, t < 136 ? hz('G#5') : hz('D#6'), 0.09));
    for (let s = 0; s < 4; s++) { const ts = t + s * p / 4, a = [0.05, 0.02, 0.035, 0.02][s] * (late ? 1.3 : 1); at(ts, () => I.gearTick(M, pan(M, BUS.labour(), 0.55), ts, 4100, a)); }
    if (pos === 3 && bar % 2 === 1) { const ts = t + p / 2; at(ts, () => I.steam(M, pan(M, BUS.labour(), -0.55), ts, 0.7, 0.05)); }
    if (bar % 2 === 0 && pos === 2 && t > 131 && t < 136) {   // riveting
      for (let k = 0; k < 8; k++) { const tr = t + 0.04 * k; at(tr, () => I.gearTick(M, pan(M, BUS.labour(), -0.7), tr, 2300, 0.035)); }
    }
  }
  at(136, () => {
    const cells = [[136, [52, 59, 56, 59]], [140, [54, 61, 57, 61]], [143, [56, 63, 59, 63]]];
    const notes = [];
    for (let t = 136, k = 0; t < 146 - 0.01; t += 0.125, k++) {
      const cell = cells.filter(c => c[0] <= t + 1e-6).pop()[1];
      notes.push([t, mhz(cell[k % 4]), 0.05 + 0.05 * (t - 136) / 10]);
    }
    I.strings(M, pan(M, BUS.strings(), -0.25), 136, 146, notes, { mode: 'spiccato', cutoff: 2600, seed: 'ost', noteLen: 0.07, n: 4 });
    const line = [[136, 71], [138, 73], [140, 75], [142, 76], [143, 78], [144, 80], [144.75, 81], [145.4, 83]].map(([t, m], k) => [t, mhz(m), 0.03 + k * 0.007]);
    I.strings(M, pan(M, BUS.strings(), 0.3), 136, 146.02, line, { mode: 'sustain', cutoff: 4000, seed: 'line', attack: 1.0, release: 0.01 });
    I.strings(M, pan(M, BUS.strings(), 0), 136, 146.02, line.map(([t, f, a]) => [t, f / 2, a * 0.8]), { mode: 'sustain', cutoff: 2500, seed: 'line2', attack: 1.0, release: 0.01 });
  });
  at(139.5, () => I.riser(M, BUS.sfx(), 139.5, HITS.flash, { amp: 0.14, f0: 180, f1: 8000, pitch: [hz('D2'), hz('D4')], seed: 'r146', release: 0.003 }));

  // ---------- FALL 146 – 154.5
  at(HITS.flash + 0.6, () => I.tinnitus(M, M.bus('tinn', {}), HITS.flash + 0.6, { f: 8000, amp: 0.0035, dur: 7 }));
  at(HITS.lowNote, () => I.lowNote(M, M.bus('low', { send: { hall: 0.6, cathedral: 0.25 } }), HITS.lowNote, hz('D2'), { amp: 0.1, dur: 10 }));

  // ---------- SKY 153.5 – 176.5
  at(SKY0, () => I.riser(M, BUS.sfx(), SKY0, HITS.liftoff, { amp: 0.08, f0: 120, f1: 900, pitch: null, seed: 'revswell', release: 0.8 }));
  at(154.4, () => A.rocket(M, M.bus('rocket', { send: { hall: 0.25 } }), 154.4, 169,
    [[154.4, 0], [156.2, 0.05], [157, 0.22], [159, 0.25], [161, 0.21], [163, 0.11], [166, 0.03], [169, 0]],
    [[154.4, 250], [157, 1100], [159, 900], [162, 350], [165, 130], [169, 70]]));
  at(HITS.liftoff, () => {
    const g = HITS.liftoff;
    I.impact(M, BUS.big(), g, { amp: 0.22, tone: 0.6, seed: 'lift' });
    I.braam(M, BUS.big(), g, [hz('D1'), hz('A1'), hz('D2')], { amp: 0.16, dur: 7, open: 800, seed: 'liftbraam' });
    I.subDrop(M, BUS.sub(), g, { f0: 50, f1: 30, dur: 4, amp: 0.3 });
  });
  at(163, () => {
    [[62, 'f', -0.3, 0.02], [69, 'f', 0.3, 0.018], [50, 'm', -0.1, 0.02], [57, 'm', 0.1, 0.018]].forEach(([m, sex, p, a], k) =>
      choirVoice(M, pan(M, BUS.choir(), p), 163 + k * 0.6, 177.5, [[163 + k * 0.6, m, a, 'u'], [170, m, a * 1.2, 'o']], { sex, seed: 'sky' + k, vib: 14, attack: 4, release: 1.5, breath: 0.15 }));
  });

  // ---------- WORD 176 – 208
  function wordBeat({ t, p, i }, down) {
    const fast = t >= HITS.towerErupt - 0.01;
    const r = R('wb' + i);
    // keyboard/data 16ths
    for (let s = 0; s < 4; s++) {
      const ts = t + s * p / 4;
      if (r() < (fast ? 0.92 : 0.7)) { const a = (0.035 + 0.035 * r()) * (s === 0 ? 1.3 : 1); const pn = (r() - 0.5) * 0.9; at(ts, () => I.keyClick(M, pan(M, BUS.labour(), pn), ts, a)); }
      const pb = fast ? 0.45 : 0.08 + 0.3 * (t - 177) / 11;
      if (r() < pb) {
        const pcs = activePCs(ts); const n = pcs[Math.floor(r() * pcs.length)];
        const f = mhz(PC[n] + 12 * (7 + Math.floor(r() * 2))); const pn = (r() - 0.5) * 1.8;
        at(ts, () => I.blip(M, pan(M, BUS.arp(), pn), ts, f, 0.012, 0.008 + r() * 0.01));
      }
    }
    at(t, () => I.softKick(M, BUS.labour(), t, fast ? (down ? 0.42 : 0.32) : 0.22));
    if (fast) {
      at(t, () => I.clayThump(M, pan(M, BUS.labour(), -0.3), t, 0.18, 'wclay'));
      if (i % 2) at(t, () => I.anvil(M, pan(M, BUS.labour(), 0.3), t, hz('A5'), 0.1, 'wanv'));
      const ta = t + p / 2; at(ta, () => I.piston(M, pan(M, BUS.labour(), 0.1), ta, 0.12, 'wp'));
    }
  }
  // arpeggio pulses climbing through the tower
  {
    const beatsW = beats.filter(b => b.grp === 2 && b.t >= 179);
    let k = 0;
    for (const b of beatsW) for (let s = 0; s < 4; s++) {
      const ts = b.t + s * b.p / 4;
      const pcs = activePCs(ts).map(n => PC[n]).sort((a, c) => a - c);
      const pool = []; for (const o of [4, 5]) for (const pc of pcs) pool.push(pc + 12 * (o + 1));
      const m = pool[k % pool.length]; k++;
      const a = 0.03 + 0.03 * clamp((ts - 179) / 20);
      at(ts, () => I.pluck(M, pan(M, BUS.arp(), Math.sin(k * 0.9) * 0.6), ts, mhz(m), a));
    }
  }
  at(184, () => I.riser(M, BUS.sfx(), 184, HITS.towerErupt, { amp: 0.11, f0: 200, f1: 6000, pitch: [hz('A1'), hz('A3')], seed: 'r188', release: 0.05 }));
  at(HITS.towerErupt - 0.05, () => {
    const g = HITS.towerErupt;
    I.braam(M, BUS.big(), g, [hz('D1'), hz('D2'), hz('A2'), hz('D3'), hz('E3')], { amp: 0.34, dur: 8, open: 3000, seed: 'erupt' });
    I.impact(M, BUS.big(), g, { amp: 0.4, seed: 'erupt' });
    I.subDrop(M, BUS.sub(), g, { f0: 80, f1: 30, dur: 2.5, amp: 0.5 });
  });
  // choir & organ: the twelve tongues pile up
  at(189, () => {
    const pcs = ['D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G'];
    pcs.forEach((n, k) => {
      const t0 = Math.max(189 + k * 0.25, ENTRY[n] >= 180 ? ENTRY[n] : 0);
      const sex = k % 2 ? 'f' : 'm';
      const m = PC[n] + (sex === 'm' ? 48 : 60) + (PC[n] < 5 ? 12 : 0) - (sex === 'm' && PC[n] > 7 ? 12 : 0);
      choirVoice(M, pan(M, BUS.choir(), ((k * 5) % 12) / 11 * 1.6 - 0.8), t0, 208.4, [[t0, m, 0.022, 'a'], [200, m, 0.032, 'a'], [205, m, 0.045, 'a']], { sex, seed: 'wordch' + k, vib: 26, attack: 2, release: 0.02, bright: 2 });
    });
  });
  for (const n of ORDER) {
    const t0 = Math.max(190, ENTRY[n] >= 190 ? ENTRY[n] : 190);
    const ms = [PC[n] + 36 + (PC[n] < 2 ? 12 : 0), PC[n] + 48 + (PC[n] < 2 ? 12 : 0)];
    for (const m of ms) at(t0, () => I.organNote(M, pan(M, BUS.organ(), ((PC[n] * 7) % 12) / 11 - 0.5), t0, 208.1, mhz(m), 0.022 * (m < 45 ? 1.2 : 1), 'worg' + n + m));
  }
  // strings ostinato 16ths and rising line
  at(192, () => {
    const cell = [50, 57, 52, 54];   // D A E F#
    const notes = [];
    const bs = beats.filter(b => b.grp === 2 && b.t >= 192);
    let k = 0;
    for (const b of bs) for (let s = 0; s < 4; s++) { const t = b.t + s * b.p / 4; notes.push([t, mhz(cell[k % 4] + (t > 200 ? 12 : 0)), 0.05 + 0.04 * (t - 192) / 16]); k++; }
    I.strings(M, pan(M, BUS.strings(), -0.3), 192, 208.02, notes, { mode: 'spiccato', cutoff: 3000, seed: 'wost', noteLen: 0.05, n: 4 });
    const line = [[192, 74], [196, 76], [199, 78], [201.5, 81], [203, 83], [204.5, 85], [205.7, 86], [206.8, 88]].map(([t, m], j) => [t, mhz(m), 0.035 + j * 0.006]);
    I.strings(M, pan(M, BUS.strings(), 0.3), 192, 208.02, line, { mode: 'sustain', cutoff: 4500, seed: 'wline', attack: 2, release: 0.01 });
  });
  // the motif, massive: D – A – E – F#, on bar downbeats
  {
    const bs = beats.filter(b => b.grp === 2 && b.t >= 196.5 && b.i % 4 === 0).slice(0, 4);
    const motif = [['D3', 'D2'], ['A3', 'A2'], ['E4', 'E3'], ['F#4', 'F#3']];
    bs.forEach((b, k) => {
      const [hi, lo] = motif[k];
      at(b.t - 0.05, () => {
        I.bell(M, pan(M, BUS.big(), (k - 1.5) * 0.25), b.t, hz(hi) * 2, { kind: 'church', dur: 10, amp: 0.3, bright: 0.9, strike: 0.4, seed: 'cm' + k });
        I.bell(M, pan(M, BUS.bells(), -(k - 1.5) * 0.3), b.t, hz(hi) * 4, { kind: 'bronze', dur: 5, amp: 0.12, seed: 'cmb' + k });
        I.braam(M, BUS.big(), b.t, [hz(lo), hz(hi)], { amp: 0.2, dur: 3.5, open: 2200, seed: 'cmbr' + k });
        I.impact(M, BUS.big(), b.t, { amp: 0.25, seed: 'cmi' + k });
      });
    });
  }
  at(202.6, () => I.riser(M, BUS.sfx(), 202.6, HITS.cutToBlack, { amp: 0.16, f0: 150, f1: 9000, pitch: [hz('D2'), hz('D5')], seed: 'r208', release: 0.003 }));

  // ---------- RETURN 216 – 237.6
  at(HITS.returnFromBlack, () => {
    const g0 = HITS.returnFromBlack, g1 = EPILOGUE_CUT;
    const lvl = x => 0.016 * sstep(g0, g0 + 3, x) * (1 - 0.35 * sstep(226, 229, x));
    I.droneVoice(M, BUS.drone(), g0, g1, hz('D2'), lvl, { seed: 'hum', bright: 3 });
    I.droneVoice(M, BUS.drone(), g0, g1, hz('A2'), x => lvl(x) * 0.35, { seed: 'hum5', bright: 3 });
    const o = osc(M, 'sine', hz('D1'), g0, g1 + 0.1); const g = gain(M, 0);
    curve(M, g.gain, g0, g1, x => lvl(x) * 1.0, 20); o.connect(g).connect(M.bus('sub', {}));
    A.textStream(M, M.bus('text', { send: { hall: 0.5 } }), g0 + 0.2, 227, [[216, 0], [217.5, 22], [222, 30], [225.5, 10], [227, 0]], { amp: 0.018 });
  });
  typing(TYPING_EPILOGUE, 'typeE');

  // ---------- CODA 237.6 – 260
  at(HITS.lowBellD, () => I.bell(M, M.bus('lowbell', { send: { hall: 0.5, cathedral: 0.45 }, dry: 0.9 }), HITS.lowBellD, hz('D3'), { kind: 'church', dur: 24, amp: 0.15, bright: 0.7, strike: 0.2, seed: 'lowD' }));
  at(240.5, () => {
    // the many tongues return, then converge one by one on a single D-major chord
    const bus = gain(M, 0);
    ramp(M, bus.gain, [[240.5, 0], [244, 1], [258.3, 1], [259.85, 0]]);
    const lp = biquad(M, 'lowpass', 5000, 0.5);
    bus.connect(lp).connect(M.bus('coda', { send: { hall: 0.6, cathedral: 0.25 }, dry: 0.8 }));
    const targets = [[50, 'm'], [69, 'f'], [57, 'm'], [62, 'f'], [54, 'm'], [66, 'f'], [45, 'm'], [74, 'f'], [50, 'm'], [62, 'f'], [57, 'm'], [69, 'f']];
    targets.forEach(([m, sex], i) => {
      const r = R('coda' + i);
      const tc = 245.2 + i * 0.72;
      const f0 = sex === 'm' ? 95 + r() * 45 : 170 + r() * 70;
      const ev = babble('coda' + i, 240.6 + r() * 1.5, tc, { sex, f0, level: 0.036, rate: 0.9 + r() * 0.3 });
      const a = 0.032 * (sex === 'f' ? 0.85 : 1);
      ev.push({ t: tc, f: mhz(m), ftau: 0.35, v: 'a', tau: 0.3, amp: a, atau: 0.5, voiced: 1 });
      ev.push({ t: 256, v: 'o', tau: 0.8 });
      formantVoice(M, pan(M, bus, -0.85 + 1.7 * ((i * 5) % 12) / 11), { g0: 240.5, g1: 259.9, sex, events: ev, breath: 0.12, seed: 'coda' + i, jitter: 10, vib: x => (x > tc + 0.5 ? 18 : 0) });
    });
  });
  [['D5', 252.4], ['A5', 253.3], ['E6', 254.2], ['F#6', 255.1]].forEach(([n, t], k) =>
    at(t, () => I.bell(M, pan(M, M.bus('codabells', { send: { hall: 0.6 } }), -0.3 + k * 0.2), t, hz(n), { kind: 'glass', dur: 5, amp: 0.035, strike: 0.04, seed: 'cb' + k })));
}

// ------------------------------------------------------------------ render
const cache = {};
function shared(sr) {
  if (cache[sr]) return cache[sr];
  const fake = { sampleRate: sr, createBuffer: (c, n, s) => new AudioBuffer({ numberOfChannels: c, length: n, sampleRate: s }) };
  const noise = {
    white: makeNoise(fake, 'white', 7), pink: makeNoise(fake, 'pink', 7), brown: makeNoise(fake, 'brown', 9),
    grains: makeGrains(fake, 6), crackle: makeCrackle(fake, 8),
  };
  const irs = {};
  for (const k in SPACES) irs[k] = makeIR(fake, SPACES[k]);
  return (cache[sr] = { noise, irs });
}

async function renderSegment(seg, sr, until, solo) {
  const { noise, irs } = shared(sr);
  const frames = Math.ceil((Math.min(seg.g1, until) - seg.g0) * sr);
  const ctx = new OfflineAudioContext(2, frames + LAT, sr);
  const spaces = {}; for (const s of seg.spaces) spaces[s] = irs[s];
  const M = new Mix(ctx, seg.g0, seg.g1, { spaces, noise });
  M.solo = solo;
  const hp1 = biquad(M, 'highpass', 25, 0.5412), hp2 = biquad(M, 'highpass', 25, 1.3066);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 2.2; comp.attack.value = 0.025; comp.release.value = 0.35;
  const mg = gain(M, MASTER_GAIN);
  M.out.connect(hp1).connect(hp2).connect(comp).connect(mg).connect(ctx.destination);
  compose(M);
  const t0 = performance.now();
  const buf = await M.render(frames + LAT);
  const ms = performance.now() - t0;
  return { seg, frames, L: buf.getChannelData(0).subarray(LAT, LAT + frames), R: buf.getChannelData(1).subarray(LAT, LAT + frames), ms };
}

// 4× oversampled true-peak look-ahead limiter (linked stereo), in place.
function limit(L, Rr, sr, ceiling) {
  const n = L.length;
  // windowed-sinc interpolation taps for fractional offsets 0.25, 0.5, 0.75
  const H = 8, taps = [0.25, 0.5, 0.75].map(fr => {
    const k = []; for (let j = -H + 1; j <= H; j++) { const x = j - fr; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / H); k.push(Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x) * w); } return k;
  });
  const req = new Float32Array(n);
  let over = 0;
  for (let i = 0; i < n; i++) {
    let pk = Math.max(Math.abs(L[i]), Math.abs(Rr[i]));
    if (pk > ceiling * 0.7) {
      for (const k of taps) for (const X of [L, Rr]) {
        let s = 0; for (let j = 0; j < 2 * H; j++) { const ix = i + j - H + 1; if (ix >= 0 && ix < n) s += X[ix] * k[j]; }
        pk = Math.max(pk, Math.abs(s));
      }
    }
    req[i] = pk > ceiling ? ceiling / pk : 1;
    if (pk > ceiling) over++;
  }
  if (!over) return { over: 0, minGain: 1 };
  const Lk = Math.round(sr * 0.0015), rel = 1 - Math.exp(-1 / (sr * 0.12));
  // forward-looking minimum over Lk samples (deque)
  const m = new Float32Array(n);
  const dq = new Int32Array(n); let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (t > h && req[dq[t - 1]] >= req[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + Lk) h++;
    m[i] = req[dq[h]];
  }
  // release smoothing, then moving average over Lk (so the gain ramps down before the peak)
  let g = 1;
  for (let i = 0; i < n; i++) { g = m[i] < g ? m[i] : g + (1 - g) * rel; if (g > m[i]) g = m[i]; m[i] = g; }
  let acc = 0, minG = 1;
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) { acc += m[i]; if (i >= Lk) acc -= m[i - Lk]; sm[i] = acc / Math.min(i + 1, Lk); }
  for (let i = 0; i < n; i++) { const gg = sm[i]; L[i] *= gg; Rr[i] *= gg; if (gg < minG) minG = gg; }
  return { over, minGain: minG };
}

export async function renderScore({ sampleRate = 48000, from = 0, to = DURATION, solo = null } = {}) {
  const sr = sampleRate;
  const N = Math.round(DURATION * sr);
  const L = new Float32Array(N), Rr = new Float32Array(N);
  const segs = SEGS.filter(s => s.g1 > from && s.g0 < to);
  const res = await Promise.all(segs.map(s => renderSegment(s, sr, to + 0.01, solo)));
  const stats = { segments: [] };
  for (const { seg, frames, L: l, R: r, ms } of res) {
    const off = Math.round(seg.g0 * sr);
    const n = Math.min(frames, N - off);
    L.set(l.subarray(0, n), off); Rr.set(r.subarray(0, n), off);
    // the cut: 3 ms raised-cosine at the end of every segment
    const F = Math.round(0.003 * sr);
    if (seg.g1 <= to) for (let i = 0; i < F; i++) { const w = 0.5 - 0.5 * Math.cos(Math.PI * i / F); L[off + n - 1 - i] *= w; Rr[off + n - 1 - i] *= w; }
    stats.segments.push({ g0: seg.g0, g1: seg.g1, ms: Math.round(ms) });
  }
  // the black: absolute digital silence
  L.fill(0, Math.round(HITS.cutToBlack * sr), Math.round(HITS.returnFromBlack * sr));
  Rr.fill(0, Math.round(HITS.cutToBlack * sr), Math.round(HITS.returnFromBlack * sr));
  L.fill(0, Math.round(HITS.flash * sr), Math.round((HITS.flash + 0.6) * sr));
  Rr.fill(0, Math.round(HITS.flash * sr), Math.round((HITS.flash + 0.6) * sr));
  const a = Math.max(0, Math.round(from * sr)), b = Math.min(N, Math.round(to * sr));
  const l = L.subarray(a, b), r = Rr.subarray(a, b);
  stats.limiter = limit(l, r, sr, CEILING);
  const out = new AudioBuffer({ numberOfChannels: 2, length: b - a, sampleRate: sr });
  out.copyToChannel(l, 0); out.copyToChannel(r, 1);
  renderScore.stats = stats;
  return out;
}
