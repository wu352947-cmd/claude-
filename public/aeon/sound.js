/* ÆON — a generative score, synthesised in the browser (no audio files).
   Every chapter has its own chord; moving between chapters crossfades them.
   Hovering a work rings a soft bell; the seal lands with a low thump. */
(function () {
  'use strict';
  var A = null, master, verb, bus, voices = [], on = false, chordKey = null;

  // just-intonation chords, Hz
  var CHORDS = {
    '序': [73.42, 110, 146.83, 220, 329.63],            // D, open fifths
    'I': [73.42, 77.78, 110, 155.56, 220],              // D phrygian, the desert
    'II': [65.41, 98, 130.81, 196, 293.66, 329.63],     // C add9, marble
    'III': [98, 146.83, 196, 220, 293.66, 329.63],      // G pentatonic, silk
    'IV': [87.31, 130.81, 174.61, 220, 261.63, 329.63], // F maj7, rebirth
    'V': [55, 82.41, 110, 130.81, 164.81, 246.94],      // A minor add9, the sea
    'VI': [82.41, 123.47, 164.81, 246.94, 369.99, 493.88], // E, high and open
    '终': [73.42, 110, 146.83, 185, 220]                // D major, home
  };

  function impulse(sec) {
    var len = A.sampleRate * sec, b = A.createBuffer(2, len, A.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }
  function init() {
    A = new (window.AudioContext || window.webkitAudioContext)();
    master = A.createGain(); master.gain.value = 0; master.connect(A.destination);
    verb = A.createConvolver(); verb.buffer = impulse(5.5);
    var wet = A.createGain(); wet.gain.value = .55;
    bus = A.createBiquadFilter(); bus.type = 'lowpass'; bus.frequency.value = 1400; bus.Q.value = .4;
    bus.connect(master); bus.connect(verb); verb.connect(wet); wet.connect(master);
    // wind: filtered noise, slowly breathing
    var n = A.createBufferSource(); n.buffer = impulse(4); n.loop = true;
    var nf = A.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 520; nf.Q.value = .7;
    var ng = A.createGain(); ng.gain.value = .012;
    var lfo = A.createOscillator(), lg = A.createGain(); lfo.frequency.value = .05; lg.gain.value = 260;
    lfo.connect(lg); lg.connect(nf.frequency); lfo.start();
    n.connect(nf); nf.connect(ng); ng.connect(bus); n.start();
  }
  function voice(f, i) {
    var g = A.createGain(); g.gain.value = 0; g.connect(bus);
    var amp = .05 / (1 + i * .35);
    var oscs = [-4, 4].map(function (cents, k) {
      var o = A.createOscillator();
      o.type = k ? 'sine' : 'triangle';
      o.frequency.value = f; o.detune.value = cents;
      var trem = A.createOscillator(), tg = A.createGain();
      trem.frequency.value = .07 + Math.random() * .1; tg.gain.value = 3;
      trem.connect(tg); tg.connect(o.detune); trem.start();
      o.connect(g); o.start();
      return [o, trem];
    });
    var t = A.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 4 + i * .6);
    return { g: g, oscs: oscs };
  }
  function play(key) {
    if (!A || key === chordKey) return;
    chordKey = key;
    var t = A.currentTime, old = voices;
    old.forEach(function (v) {
      v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + 4);
      v.oscs.forEach(function (p) { p[0].stop(t + 4.2); p[1].stop(t + 4.2); });
    });
    voices = (CHORDS[key] || CHORDS['序']).map(voice);
  }
  function bell(freq, vol) {
    if (!on) return;
    var t = A.currentTime, car = A.createOscillator(), mod = A.createOscillator(), mg = A.createGain(), g = A.createGain();
    car.frequency.value = freq; mod.frequency.value = freq * 3.5; mg.gain.value = freq * 1.2;
    mod.connect(mg); mg.connect(car.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
    mg.gain.exponentialRampToValueAtTime(1, t + 2);
    car.connect(g); g.connect(bus); g.connect(verb);
    car.start(t); mod.start(t); car.stop(t + 3.3); mod.stop(t + 3.3);
  }
  var PENTA = [587.33, 659.25, 739.99, 880, 987.77, 1174.66];

  window.AeonSound = {
    toggle: function (key) {
      if (!A) init();
      if (A.state === 'suspended') A.resume();
      on = !on;
      var t = A.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(on ? .9 : 0, t + (on ? 2.5 : 1));
      if (on) { chordKey = null; play(key); }
      return on;
    },
    chapter: function (key) { if (on) play(key); },
    hover: function () { bell(PENTA[(Math.random() * PENTA.length) | 0], .025); },
    thump: function () {
      if (!on) return;
      var t = A.currentTime, o = A.createOscillator(), g = A.createGain();
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + .35);
      g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.0001, t + .6);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + .65);
    },
    get on() { return on; }
  };
})();
