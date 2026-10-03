// WebAudio engine: positional sounds, distance-based near/far gunshot blending,
// occlusion low-pass, convolution reverb and a compressor bus for heavy, punchy gunfire.
export class AudioEngine {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.buffers = {};
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 8; this.comp.ratio.value = 5; this.comp.attack.value = 0.002; this.comp.release.value = 0.18;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    // reverb send (outdoor slap + short tail)
    this.reverb = c.createConvolver(); this.reverb.buffer = this.makeIR(1.8, 2.6);
    this.revGain = c.createGain(); this.revGain.gain.value = 0.32;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
    this.occlusion = null; // fn(x,y,z) -> bool occluded
    this.sfxVolume = 1;
  }

  makeIR(seconds, decay) {
    const c = this.ctx, rate = c.sampleRate, len = Math.floor(rate * seconds);
    const b = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections cluster + diffuse tail
        const early = (i < rate * 0.09 && Math.random() < 0.004) ? (Math.random() * 2 - 1) * 0.9 : 0;
        d[i] = early + (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.5;
      }
    }
    return b;
  }

  async load(name, url) {
    const r = await fetch(url); const ab = await r.arrayBuffer();
    this.buffers[name] = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
  }

  unlock() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  setListener(x, y, z, fx, fz) { const L = this.listener; L.x = x; L.y = y; L.z = z; L.fx = fx; L.fz = fz; }

  // pan/gain for a world position relative to the listener (cheap 'equal power' panning)
  spatial(x, y, z) {
    const L = this.listener; const dx = x - L.x, dy = y - L.y, dz = z - L.z;
    const d = Math.hypot(dx, dy, dz);
    // right vector = forward x up
    const rx = -L.fz, rz = L.fx;
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    const front = d > 0.01 ? (dx * L.fx + dz * L.fz) / d : 1;
    return { d, pan: pan * 0.85, front };
  }

  play(name, o = {}) {
    const buf = this.buffers[name]; if (!buf || this.ctx.state !== 'running') return null;
    const c = this.ctx; const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = (o.rate || 1) * (o.pitchVar ? 1 + (Math.random() * 2 - 1) * o.pitchVar : 1);
    let node = src;
    let vol = (o.volume ?? 1) * this.sfxVolume;
    let lp = o.lowpass || 22000;
    let pan = 0;
    if (o.pos) {
      const s = this.spatial(o.pos.x, o.pos.y, o.pos.z);
      const ref = o.ref || 4, roll = o.roll ?? 1;
      vol *= ref / (ref + roll * Math.max(0, s.d - ref));
      if (o.maxDist && s.d > o.maxDist) return null;
      pan = s.pan;
      if (s.front < 0) lp = Math.min(lp, 9000 + 9000 * (1 + s.front));
      if (o.occlude !== false && this.occlusion && s.d > 3 && this.occlusion(o.pos.x, o.pos.y, o.pos.z)) { lp = Math.min(lp, 900); vol *= 0.55; }
      // air absorption
      lp = Math.min(lp, 22000 - Math.min(16000, s.d * 110));
    }
    if (vol < 0.003) return null;
    if (lp < 21000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    const g = c.createGain(); g.gain.value = vol; node.connect(g); node = g;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); node = p; }
    node.connect(this.master);
    if (o.reverb) { const rs = c.createGain(); rs.gain.value = o.reverb; g.connect(rs); rs.connect(this.reverb); }
    if (o.bass) {
      // low-end body layer taken from the same recording (makes shots feel heavy)
      const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 160; b.Q.value = 0.9;
      const bg = c.createGain(); bg.gain.value = o.bass * vol * 2.2;
      src.connect(b); b.connect(bg); bg.connect(this.master);
    }
    src.start(t);
    return src;
  }

  // gunshot: crossfade near/far recordings by distance
  shot(weapon, pos, own) {
    if (own) {
      this.play(weapon, { volume: 0.95, pitchVar: 0.035, reverb: 0.55, bass: 0.9 });
      return;
    }
    const s = this.spatial(pos.x, pos.y, pos.z);
    const near = Math.max(0, 1 - s.d / 55), far = Math.min(1, s.d / 22);
    if (near > 0.02) this.play(weapon, { pos, volume: near * 0.85, ref: 6, roll: 0.35, pitchVar: 0.04, reverb: 0.35, bass: 0.5 });
    if (far > 0.02) this.play(weapon + '_far', { pos, volume: far * 0.9, ref: 20, roll: 0.4, pitchVar: 0.04, reverb: 0.6, maxDist: 400 });
  }
}
