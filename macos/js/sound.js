/* System sounds, synthesized live with Web Audio (no audio files shipped). */
(function () {
  let ctx = null;
  let master = null;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.connect(ctx.destination);
      setVol();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function setVol() {
    if (master) master.gain.value = Math.pow(OS.settings.volume / 100, 1.6);
  }
  OS.on('setting:volume', setVol);

  function noiseBuffer(c, secs) {
    const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function tone(c, { freq, type = 'sine', start = 0, dur = 0.4, gain = 0.3, attack = 0.005, out = master, detune = 0 }) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const t = c.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const sounds = {
    /* The startup chord: F♯ major spread over three octaves with a slow bloom */
    chime(c) {
      const out = c.createGain();
      out.gain.value = 0.55;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      out.connect(lp).connect(master);
      // simple reverb tail via feedback delay
      const d = c.createDelay();
      d.delayTime.value = 0.11;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      lp.connect(d).connect(fb).connect(d);
      fb.connect(master);
      const notes = [46.25, 92.5, 138.59, 185, 233.08, 277.18, 369.99, 466.16];
      notes.forEach((f, i) => {
        [0, 7, -6].forEach((det) => {
          tone(c, { freq: f, type: i < 2 ? 'sawtooth' : 'triangle', dur: 4.2, gain: i < 2 ? 0.05 : 0.07, attack: 0.02, out, detune: det });
        });
      });
    },
    /* Short glassy ping used for notifications */
    notify(c) {
      tone(c, { freq: 1318.5, dur: 0.5, gain: 0.18 });
      tone(c, { freq: 1975.5, dur: 0.6, gain: 0.12, start: 0.09 });
      tone(c, { freq: 2637, dur: 0.4, gain: 0.05, start: 0.09 });
    },
    message(c) {
      tone(c, { freq: 1567.98, dur: 0.18, gain: 0.16 });
      tone(c, { freq: 2093, dur: 0.3, gain: 0.14, start: 0.1 });
    },
    sent(c) {
      const o = c.createOscillator(),
        g = c.createGain(),
        t = c.currentTime;
      o.frequency.setValueAtTime(600, t);
      o.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.25);
    },
    /* "Funk"-like error */
    error(c) {
      tone(c, { freq: 220, type: 'square', dur: 0.18, gain: 0.06 });
      tone(c, { freq: 196, type: 'square', dur: 0.24, gain: 0.05, start: 0.06 });
    },
    pop(c) {
      const o = c.createOscillator(),
        g = c.createGain(),
        t = c.currentTime;
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.06);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.12);
    },
    /* Crumpled paper into the trash */
    trash(c) {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 0.5);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 0.8;
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 9; i++) g.gain.setValueAtTime(Math.random() * 0.35, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
    },
    /* Camera shutter */
    shutter(c) {
      [0, 0.09].forEach((s) => {
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c, 0.08);
        const hp = c.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1800;
        const g = c.createGain();
        const t = c.currentTime + s;
        g.gain.setValueAtTime(0.45, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        src.connect(hp).connect(g).connect(master);
        src.start(t);
      });
    },
    /* Volume feedback "pop" */
    volume(c) {
      tone(c, { freq: 880, dur: 0.08, gain: 0.12 });
    },
    tick(c) {
      tone(c, { freq: 3000, type: 'square', dur: 0.015, gain: 0.02 });
    },
    alarm(c) {
      for (let i = 0; i < 6; i++) {
        tone(c, { freq: 1760, dur: 0.12, gain: 0.15, start: i * 0.25 });
        tone(c, { freq: 2217, dur: 0.12, gain: 0.1, start: i * 0.25 + 0.12 });
      }
    },
    facetime(c) {
      [0, 0.9, 1.8].forEach((s) => {
        tone(c, { freq: 659.25, dur: 0.3, gain: 0.1, start: s });
        tone(c, { freq: 987.77, dur: 0.4, gain: 0.1, start: s + 0.15 });
      });
    },
  };

  OS.sound = {
    ctx: () => ac(),
    master: () => (ac(), master),
    play(name) {
      if (!OS.settings.sounds) return;
      if (name !== 'chime' && name !== 'notify' && name !== 'message' && name !== 'alarm' && !OS.settings.uiSounds) return;
      const c = ac();
      if (!c || !sounds[name]) return;
      try {
        sounds[name](c);
      } catch (e) {}
    },
  };
})();
