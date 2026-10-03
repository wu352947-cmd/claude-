// 程序化音效：环境低鸣、滴水、低语、心跳、脚步、机弩、石像摩擦、编钟……全部用 WebAudio 合成
import { rand, pick } from './util.js';

export class Audio {
  constructor() {
    this.ctx = null; this.enabled = true; this.volume = 0.9;
    this.loops = new Map();
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.dry = c.createGain(); this.dry.connect(this.master);
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(4.2, 2.6);
    this.wet = c.createGain(); this.wet.gain.value = 0.55;
    this.verb.connect(this.wet); this.wet.connect(this.master);
    this.noiseBuf = this.makeNoise(3, 'white');
    this.brownBuf = this.makeNoise(4, 'brown');
    this.listener = c.listener;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  impulse(sec, decay) {
    const c = this.ctx, len = (c.sampleRate * sec) | 0, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }
  makeNoise(sec, kind) {
    const c = this.ctx, len = (c.sampleRate * sec) | 0, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  // 输出：普通（带混响）或 3D 定位
  out(node, { reverb = 0.5, pos = null, ref = 2, max = 40 } = {}) {
    const c = this.ctx;
    let tail = node;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = 1.2;
      p.positionX.value = pos.x || 0; p.positionY.value = pos.y ?? 1.2; p.positionZ.value = pos.z || 0;
      node.connect(p); tail = p;
      node._panner = p;
    }
    tail.connect(this.dry);
    if (reverb > 0) { const s = c.createGain(); s.gain.value = reverb; tail.connect(s); s.connect(this.verb); }
    return tail;
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02); l.positionY.setTargetAtTime(pos.y, t, 0.02); l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02); l.forwardY.setTargetAtTime(fwd.y, t, 0.02); l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  noise(buf = this.noiseBuf, loop = false) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }
  env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }

  get ok() { return this.enabled && this.ctx && this.ctx.state !== 'closed'; }

  // ---------------- 环境声 ----------------
  startAmbience(kind = 'tomb') {
    if (!this.ok) return;
    this.stopAmbience();
    const c = this.ctx, t = c.currentTime;
    const bus = c.createGain(); bus.gain.value = 0; bus.gain.linearRampToValueAtTime(1, t + 4);
    this.out(bus, { reverb: 0.4 });
    const nodes = [bus];
    // 低频嗡鸣
    const base = { tunnel: 41, pit: 36.7, traps: 43.6, sealed: 34.6, palace: 32.7 }[kind] || 38;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 6;
    const dg = c.createGain(); dg.gain.value = 0.11; lp.connect(dg); dg.connect(bus);
    for (const [m, det] of [[1, -7], [1, 6], [1.5, 3], [2, -4]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * m; o.detune.value = det;
      const g = c.createGain(); g.gain.value = m === 1 ? 0.5 : 0.18; o.connect(g); g.connect(lp); o.start(); nodes.push(o);
    }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.05; const lg = c.createGain(); lg.gain.value = 70;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); nodes.push(lfo);
    // 地底风声
    const n = this.noise(this.brownBuf, true);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.8;
    const ng = c.createGain(); ng.gain.value = kind === 'tunnel' ? 0.16 : 0.09;
    n.connect(bp); bp.connect(ng); ng.connect(bus); n.start(); nodes.push(n);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.07; const lg2 = c.createGain(); lg2.gain.value = 240;
    lfo2.connect(lg2); lg2.connect(bp.frequency); lfo2.start(); nodes.push(lfo2);
    if (kind === 'palace') {
      // 水银流动的低沉汩汩声
      const m = this.noise(this.brownBuf, true); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const mg = c.createGain(); mg.gain.value = 0.25; m.connect(f); f.connect(mg); mg.connect(bus); m.start(); nodes.push(m);
    }
    this.amb = { nodes, bus, kind };
    this.scheduleOneShots();
  }
  stopAmbience() {
    clearTimeout(this.oneShotTimer);
    if (!this.amb) return;
    const { nodes, bus } = this.amb, t = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => nodes.forEach(n => { try { n.stop?.(); n.disconnect(); } catch { } }), 1700);
    this.amb = null;
  }
  scheduleOneShots() {
    clearTimeout(this.oneShotTimer);
    const next = () => {
      if (!this.amb) return;
      const r = Math.random();
      const far = { x: this.lp.x + rand(-18, 18), y: rand(0, 3), z: this.lp.z + rand(-18, 18) };
      if (r < 0.32) this.drip(far);
      else if (r < 0.5) this.knock(far);
      else if (r < 0.66) this.whisper(far, 0.35);
      else if (r < 0.8) this.creak(far);
      else if (r < 0.9) this.distantChant();
      else this.debris(far);
      this.oneShotTimer = setTimeout(next, rand(4500, 13000));
    };
    this.oneShotTimer = setTimeout(next, rand(3000, 6000));
  }
  lp = { x: 0, z: 0 };

  drip(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(rand(1400, 2200), t); o.frequency.exponentialRampToValueAtTime(rand(500, 700), t + 0.08);
    this.env(g, t, 0.003, 0.25, 0.12); o.connect(g); this.out(g, { reverb: 1.2, pos }); o.start(t); o.stop(t + 0.3);
  }
  knock(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < (Math.random() < 0.5 ? 1 : 3); i++) {
      const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 300; this.env(g, t + i * 0.42, 0.004, 0.9, 0.18);
      n.connect(f); f.connect(g); this.out(g, { reverb: 1, pos }); n.start(t + i * 0.42, rand(0, 2), 0.3);
    }
  }
  creak(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; const b = rand(60, 110);
    o.frequency.setValueAtTime(b, t);
    for (let i = 1; i < 12; i++) o.frequency.linearRampToValueAtTime(b * rand(0.85, 1.25), t + i * 0.12);
    f.type = 'bandpass'; f.frequency.value = rand(600, 1200); f.Q.value = 9;
    this.env(g, t, 0.2, 0.18, 1.3); o.connect(f); f.connect(g); this.out(g, { reverb: 0.9, pos }); o.start(t); o.stop(t + 1.6);
  }
  debris(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 8; i++) {
      const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain(), tt = t + i * rand(0.04, 0.12);
      f.type = 'bandpass'; f.frequency.value = rand(800, 3000); f.Q.value = 2; this.env(g, tt, 0.002, rand(0.1, 0.3), 0.06);
      n.connect(f); f.connect(g); this.out(g, { reverb: 0.8, pos }); n.start(tt, rand(0, 2), 0.1);
    }
  }
  // 低语：噪声经过元音共振峰滤波，再做音节般的起伏
  whisper(pos, vol = 0.5, dur = 2.4) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(this.noiseBuf);
    const g = c.createGain(); g.gain.value = 0;
    const formants = pick([[700, 1220], [400, 2000], [300, 870], [600, 1040], [500, 1700]]);
    const mix = c.createGain(); mix.gain.value = 1;
    for (const f0 of formants) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = f0; f.Q.value = 7;
      for (let i = 0; i < 10; i++) f.frequency.setValueAtTime(f0 * rand(0.8, 1.2), t + i * dur / 10);
      n.connect(f); f.connect(mix);
    }
    mix.connect(g);
    const syl = Math.max(3, (dur * 4) | 0);
    for (let i = 0; i < syl; i++) {
      const st = t + i * dur / syl;
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(vol * rand(0.3, 1), st + 0.05); g.gain.linearRampToValueAtTime(0.0001, st + dur / syl * 0.9);
    }
    this.out(g, { reverb: 0.7, pos, ref: 1.5 });
    n.start(t, rand(0, 1), dur + 0.2);
  }
  distantChant() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain();
    this.env(g, t, 2.5, 0.05, 4);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.connect(g);
    const root = pick([110, 98, 116.5]);
    for (const m of [1, 1.2, 1.5, 2.01]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = root * m;
      const v = c.createOscillator(); v.frequency.value = rand(4, 6); const vg = c.createGain(); vg.gain.value = 3;
      v.connect(vg); vg.connect(o.frequency); o.connect(f); o.start(t); o.stop(t + 7); v.start(t); v.stop(t + 7);
    }
    this.out(g, { reverb: 1.6 });
  }

  // ---------------- 玩家与事件 ----------------
  step(surface = 'stone', run = false) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    const fr = { dirt: 500, stone: 1500, brick: 1100, wood: 700, palace: 1900 }[surface] || 1200;
    f.type = 'bandpass'; f.frequency.value = fr * rand(0.8, 1.2); f.Q.value = 1.2;
    this.env(g, t, 0.004, (run ? 0.45 : 0.28) * rand(0.7, 1), surface === 'dirt' ? 0.14 : 0.09);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0.35 }); n.start(t, rand(0, 2.5), 0.25);
    if (surface !== 'dirt') {
      const n2 = this.noise(), f2 = c.createBiquadFilter(), g2 = c.createGain();
      f2.type = 'highpass'; f2.frequency.value = 3500; this.env(g2, t + 0.02, 0.002, 0.06, 0.04);
      n2.connect(f2); f2.connect(g2); this.out(g2, { reverb: 0.4 }); n2.start(t + 0.02, rand(0, 2.5), 0.08);
    }
  }
  breath(heavy) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = heavy ? 900 : 700; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(heavy ? 0.14 : 0.06, t + 0.35); g.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0.2 }); n.start(t, rand(0, 2), 1);
  }
  heartbeat(vol = 0.6) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (const [dt, v] of [[0, 1], [0.24, 0.7]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
      this.env(g, t + dt, 0.01, vol * v, 0.2); o.connect(g); this.out(g, { reverb: 0.05 }); o.start(t + dt); o.stop(t + dt + 0.3);
    }
  }
  click() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 2500; this.env(g, t, 0.001, 0.35, 0.03);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0.1 }); n.start(t, 0, 0.05);
  }
  // 编钟音色：非谐泛音，悠长衰减
  bell(freq = 523, vol = 0.25, when = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + when;
    for (const [m, a, d] of [[1, 1, 3.2], [2.76, 0.45, 1.6], [5.4, 0.25, 0.8], [0.5, 0.3, 4], [8.93, 0.12, 0.4]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq * m; this.env(g, t, 0.004, vol * a, d);
      o.connect(g); this.out(g, { reverb: 0.8 }); o.start(t); o.stop(t + d + 0.1);
    }
  }
  pickup() { this.bell(784, 0.18); this.bell(1175, 0.1, 0.12); }
  motif() { [392, 440, 523, 440, 330, 294].forEach((f, i) => this.bell(f, 0.2, i * 0.55)); }
  stinger(vol = 1) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain();
    this.env(g, t, 0.01, 0.55 * vol, 1.8);
    for (const f of [277, 293, 415, 440, 622, 659, 880]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.94, t + 1.8);
      const og = c.createGain(); og.gain.value = 0.12; o.connect(og); og.connect(g); o.start(t); o.stop(t + 2);
    }
    const n = this.noise(), f = c.createBiquadFilter(), ng = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.6; this.env(ng, t, 0.005, 0.6 * vol, 0.7);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t, 0, 1);
    this.out(g, { reverb: 0.9 });
    // 低频冲击
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    this.env(og, t, 0.005, 0.9 * vol, 0.7); o.connect(og); this.out(og, { reverb: 0.2 }); o.start(t); o.stop(t + 0.8);
  }
  twang(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    this.env(g, t, 0.002, 0.5, 0.3); o.connect(g); this.out(g, { reverb: 0.6, pos }); o.start(t); o.stop(t + 0.4);
    const n = this.noise(), f = c.createBiquadFilter(), ng = c.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.35); f.Q.value = 2;
    this.env(ng, t, 0.01, 0.35, 0.3); n.connect(f); f.connect(ng); this.out(ng, { reverb: 0.4, pos }); n.start(t, 0, 0.5);
  }
  thud(pos, vol = 0.6) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 900; this.env(g, t, 0.002, vol, 0.15);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0.5, pos }); n.start(t, rand(0, 2), 0.2);
  }
  plateClick(pos) {
    if (!this.ok) return;
    this.thud(pos, 0.4);
    const c = this.ctx, t = c.currentTime + 0.05, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = 1800; this.env(g, t, 0.001, 0.12, 0.03);
    o.connect(g); this.out(g, { reverb: 0.5, pos }); o.start(t); o.stop(t + 0.06);
  }
  windup(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 900 + i * 120;
      this.env(g, t + i * 0.09, 0.001, 0.05, 0.03); o.connect(g); this.out(g, { reverb: 0.4, pos, ref: 3 }); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.05);
    }
  }
  hurt() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(500, t + 0.3); f.Q.value = 3;
    this.env(g, t, 0.01, 0.5, 0.35); n.connect(f); f.connect(g); this.out(g, { reverb: 0.2 }); n.start(t, 0, 0.5);
    this.thud(null, 0.8);
  }
  grind(id, pos, on) {
    // 石像移动时的摩擦声（循环、定位）
    if (!this.ok) return;
    let L = this.loops.get(id);
    if (!L) {
      const c = this.ctx, n = this.noise(this.brownBuf, true), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.frequency.value = 260; f.Q.value = 1.5; g.gain.value = 0;
      n.connect(f); f.connect(g); this.out(g, { reverb: 0.5, pos, ref: 2.5 }); n.start();
      L = { n, g, f }; this.loops.set(id, L);
    }
    const t = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(on ? 0.9 : 0, t, on ? 0.05 : 0.08);
    L.f.frequency.setTargetAtTime(220 + Math.random() * 120, t, 0.1);
    if (pos && L.g._panner) { L.g._panner.positionX.value = pos.x; L.g._panner.positionY.value = pos.y ?? 1; L.g._panner.positionZ.value = pos.z; }
  }
  loopVoice(id, pos, vol) {
    // 鬼魂身上一直萦绕的气声
    if (!this.ok) return;
    let L = this.loops.get(id);
    if (!L) {
      const c = this.ctx, n = this.noise(this.noiseBuf, true), f = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 6; f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 8;
      g.gain.value = 0; n.connect(f); n.connect(f2); f.connect(g); f2.connect(g); this.out(g, { reverb: 0.8, pos, ref: 1.5 }); n.start();
      const l = c.createOscillator(); l.frequency.value = 0.3; const lg = c.createGain(); lg.gain.value = 200; l.connect(lg); lg.connect(f.frequency); l.start();
      L = { n, g, f, l }; this.loops.set(id, L);
    }
    L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.2);
    if (L.g._panner) { L.g._panner.positionX.value = pos.x; L.g._panner.positionY.value = pos.y ?? 1.4; L.g._panner.positionZ.value = pos.z; }
  }
  stopLoops() {
    for (const L of this.loops.values()) { try { L.n.stop(); L.l?.stop(); L.g.disconnect(); } catch { } }
    this.loops.clear();
  }
  wail(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(320, t); o.frequency.linearRampToValueAtTime(520, t + 0.6); o.frequency.linearRampToValueAtTime(260, t + 2);
    const v = c.createOscillator(); v.frequency.value = 7; const vg = c.createGain(); vg.gain.value = 14; v.connect(vg); vg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4;
    this.env(g, t, 0.3, 0.3, 1.8); o.connect(f); f.connect(g); this.out(g, { reverb: 1.2, pos }); o.start(t); v.start(t); o.stop(t + 2.3); v.stop(t + 2.3);
  }
  rumble(dur = 3, vol = 0.8) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(this.brownBuf), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 140;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.3); g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0.6 }); n.start(t, 0, dur + 0.2);
    this.debris({ x: this.lp.x + rand(-4, 4), y: 3, z: this.lp.z + rand(-4, 4) });
  }
  stoneDoor(pos, dur = 3) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(this.brownBuf), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 180; f.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.2); g.gain.setValueAtTime(1, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (let i = 0; i < dur * 6; i++) f.frequency.setValueAtTime(140 + Math.random() * 120, t + i / 6);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0.8, pos, ref: 4 }); n.start(t, 0, dur + 0.2);
    setTimeout(() => this.thud(pos, 1), dur * 1000);
  }
  lever(pos) {
    if (!this.ok) return;
    this.creak(pos); setTimeout(() => this.thud(pos, 0.9), 450);
    setTimeout(() => this.bell(196, 0.15), 600);
  }
  flashFlicker() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 5000; this.env(g, t, 0.001, 0.05, 0.05);
    n.connect(f); f.connect(g); this.out(g, { reverb: 0 }); n.start(t, 0, 0.1);
  }
}
