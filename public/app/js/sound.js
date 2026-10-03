// 声景：用 Web Audio 现场合成（不用音频文件，没有版权问题，也不占流量）
// 每个场景 = 持续的底噪层 + 按调度器随机落下的“事件”（雨滴、虫鸣、风铃、炭火、钵声）
const PREF = 'sg.sound';
export const SCENES = [
  { k: 'rain', name: '听雨', sub: '檐下的细雨' },
  { k: 'chime', name: '风铃', sub: '廊下的风' },
  { k: 'insects', name: '虫鸣', sub: '秋夜的草丛' },
  { k: 'fire', name: '围炉', sub: '炭火噼啪' },
  { k: 'bowl', name: '颂钵', sub: '很慢的钟声' }
];
export const seasonScene = season => ['rain', 'chime', 'insects', 'fire'][season] || 'rain';

let ctx = null, master = null, current = null, timer = 0;
let prefs = { k: '', vol: .6 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch {}
const listeners = new Set();
const emit = () => listeners.forEach(f => f(status()));
const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch {} };
export const onSound = f => { listeners.add(f); return () => listeners.delete(f); };
export const status = () => ({ k: current?.k || '', last: prefs.k, vol: prefs.vol, playing: !!current });

export function audio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

// ---------- 小积木 ----------
const R = (a, b) => a + Math.random() * (b - a);
const gainN = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filt = (type, f, q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const panN = p => { const s = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (s.pan) s.pan.value = p; return s; };
const bufs = {};
function noise(type) {
  if (bufs[type]) return bufs[type];
  const len = ctx.sampleRate * 4, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else if (type === 'pink') { b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .2; }
      else d[i] = w * .5;
    }
    if (type === 'brown') { const drift = d[len - 1] - d[0]; for (let i = 0; i < len; i++) d[i] -= drift * i / (len - 1); } // 让循环首尾相接，不出“咔哒”声
  }
  return (bufs[type] = b);
}
function loop(type, rate = 1) { const s = ctx.createBufferSource(); s.buffer = noise(type); s.loop = true; s.playbackRate.value = rate; s.start(ctx.currentTime, Math.random() * 3); return s; }
function lfo(freq, depth, target) { const o = ctx.createOscillator(); o.frequency.value = freq; const g = gainN(depth); o.connect(g).connect(target); o.start(); return o; }

// 一声“叮”：若干个正弦分音各自衰减（风铃、钵、提示音共用）
export function ring(t, f, { partials = [[1, 1, 1]], gain = .1, pan = 0, out = null } = {}) {
  const dest = out || master, p = panN(pan); p.connect(dest);
  for (const [ratio, amp, decay] of partials) {
    const o = ctx.createOscillator(); o.frequency.value = f * ratio;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    o.connect(g).connect(p); o.start(t); o.stop(t + decay + .05);
  }
}

// ---------- 场景 ----------
const BUILD = {
  rain(out) {
    const hiss = loop('pink'), g = gainN(.32);
    hiss.connect(filt('highpass', 480)).connect(filt('lowpass', 3600)).connect(g).connect(out);
    const sw = lfo(.06, .1, g.gain);
    const roof = loop('brown'), rg = gainN(.3);
    roof.connect(filt('lowpass', 320)).connect(rg).connect(out);
    let drop = 0, drip = 0;
    return {
      nodes: [hiss, roof, sw],
      tick(t, ahead) {
        for (drop = Math.max(drop, t); drop < ahead; drop += R(.025, .16)) {
          const o = ctx.createOscillator(), f = R(1600, 4200), at = drop;
          o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * .55, at + .05);
          const e = ctx.createGain(); e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(R(.008, .04), at + .003); e.gain.exponentialRampToValueAtTime(.0001, at + .07);
          const p = panN(R(-.8, .8)); o.connect(e).connect(p).connect(out); o.start(at); o.stop(at + .08);
        }
        for (drip = Math.max(drip, t + .5); drip < ahead; drip += R(1.2, 4)) ring(drip, R(700, 1150), { partials: [[1, 1, .18], [2.3, .25, .08]], gain: .07, pan: R(-.4, .4), out });
      }
    };
  },
  chime(out) {
    const wind = loop('brown'), bp = filt('bandpass', 500, .6), g = gainN(.45);
    wind.connect(bp).connect(g).connect(out);
    const l1 = lfo(.05, 260, bp.frequency), l2 = lfo(.083, .18, g.gain);
    const notes = [1318, 1480, 1661, 1976, 2217, 2637];
    let gust = 0;
    return {
      nodes: [wind, l1, l2],
      tick(t, ahead) {
        for (gust = Math.max(gust, t + .3); gust < ahead; gust += R(2.5, 7)) {
          const n = 1 + Math.floor(R(0, 5));
          for (let i = 0, at = gust; i < n; i++, at += R(.08, .45))
            ring(at, notes[Math.floor(R(0, notes.length))] * R(.997, 1.003), { partials: [[1, 1, 2.6], [2.76, .35, 1.1], [5.4, .12, .5]], gain: R(.025, .06), pan: R(-.5, .5), out });
        }
      }
    };
  },
  insects(out) {
    const night = loop('pink'), ng = gainN(.1);
    night.connect(filt('lowpass', 1100)).connect(ng).connect(out);
    const voices = [0, 1, 2].map(i => {
      const o = ctx.createOscillator(), g = gainN(0), p = panN([-.6, .1, .7][i]);
      o.frequency.value = [4380, 4720, 5150][i]; o.connect(g).connect(p).connect(out); o.start();
      return { o, g, next: R(0, 1.5), period: R(.45, .8), amp: [.05, .036, .026][i] };
    });
    return {
      nodes: [night, ...voices.map(v => v.o)],
      tick(t, ahead) {
        for (const v of voices) for (v.next = Math.max(v.next, t); v.next < ahead; v.next += Math.random() < .12 ? R(2, 5) : v.period * R(.92, 1.08)) {
          const pulses = 3 + Math.floor(R(0, 2));
          for (let i = 0; i < pulses; i++) {
            const at = v.next + i * .045;
            v.g.gain.setValueAtTime(0, at); v.g.gain.linearRampToValueAtTime(v.amp, at + .008); v.g.gain.linearRampToValueAtTime(0, at + .028);
          }
        }
      }
    };
  },
  fire(out) {
    const body = loop('brown'), g = gainN(.45);
    body.connect(filt('lowpass', 520)).connect(g).connect(out);
    const hiss = loop('white'), hg = gainN(.012);
    hiss.connect(filt('highpass', 5200)).connect(hg).connect(out);
    let flick = 0, crack = 0;
    return {
      nodes: [body, hiss],
      tick(t, ahead) {
        for (flick = Math.max(flick, t); flick < ahead; flick += .15) g.gain.setTargetAtTime(R(.3, .58), flick, .08);
        for (crack = Math.max(crack, t); crack < ahead; crack += Math.random() < .25 ? R(.02, .06) : R(.08, .5)) {
          const s = ctx.createBufferSource(); s.buffer = noise('white'); s.playbackRate.value = R(.6, 1.6);
          const dur = R(.004, .022), e = ctx.createGain();
          e.gain.setValueAtTime(R(.06, .35), crack); e.gain.exponentialRampToValueAtTime(.0001, crack + dur);
          s.connect(filt('highpass', R(1000, 3200))).connect(e).connect(panN(R(-.5, .5))).connect(out);
          s.start(crack, R(0, 3), dur + .01);
        }
      }
    };
  },
  bowl(out) {
    const drone = [110, 110.6].map(f => { const o = ctx.createOscillator(); o.frequency.value = f; const g = gainN(.05); o.connect(g).connect(out); o.start(); return o; });
    let hit = 0;
    return {
      nodes: drone,
      tick(t, ahead) {
        for (hit = Math.max(hit, t + .4); hit < ahead; hit += R(13, 20)) bowlHit(hit, R(.85, 1.1), out);
      }
    };
  }
};
function bowlHit(t, k = 1, out = master, gain = .24) {
  const f = 196 * k;
  ring(t, f, { partials: [[1, 1, 11], [1.004, .7, 10], [2.71, .45, 7], [2.716, .3, 6.5], [5.15, .18, 3.5], [8.1, .06, 2]], gain, out });
}

// ---------- 播放控制 ----------
export function play(k) {
  if (!BUILD[k] || !audio()) return false;
  stopScene(); prefs.k = k; savePrefs();
  const out = gainN(0); out.connect(master);
  const t = ctx.currentTime;
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(1, t + 2.2);
  master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(prefs.vol, t, .3);
  current = { k, out, ...BUILD[k](out) };
  clearInterval(timer);
  timer = setInterval(() => { if (current) current.tick(ctx.currentTime, ctx.currentTime + 1.3); }, 150);
  current.tick(t, t + 1.3);
  emit(); return true;
}
function stopScene() {
  if (!current) return;
  const { out, nodes } = current, t = ctx.currentTime;
  out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 1.4);
  setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch {} }); out.disconnect(); }, 1600);
  current = null; clearInterval(timer);
}
export function stop() { stopScene(); emit(); }
export function setVolume(v) {
  prefs.vol = Math.min(1, Math.max(0, v)); savePrefs();
  if (ctx && current) master.gain.setTargetAtTime(prefs.vol, ctx.currentTime, .15);
  emit();
}

// 呼吸练习的提示音：吸气轻而高，呼气低而长
export function cue(kind) {
  if (!audio()) return;
  const t = ctx.currentTime + .02, g = Math.max(.25, prefs.vol);
  if (!current) master.gain.setTargetAtTime(g, t, .05);
  if (kind === 'in') ring(t, 528, { partials: [[1, 1, 2.4], [2.76, .25, .9]], gain: .07 });
  else if (kind === 'out') ring(t, 352, { partials: [[1, 1, 3.4], [2.71, .2, 1.2]], gain: .07 });
  else if (kind === 'end') bowlHit(t, 1, master, .12);
  else ring(t, 440, { partials: [[1, 1, 1.2]], gain: .03 });
}
