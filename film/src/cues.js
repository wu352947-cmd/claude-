// Shared sync points between picture and sound. Global film time, seconds.
// Both the scenes and the score read this file, so they stay frame-accurate.

// The cursor — the film's visual rhyme (prologue, apex of the last tower, epilogue).
export const CURSOR = {
  x: 0.335, y: 0.42,        // start position as a fraction of the 1920×804 frame (top-left origin)
  w: 3, h: 34,              // px at 1920 wide
  color: '#ece4d3',
  period: 1.06,             // blink period; visible for the first half of each period
};
export function cursorVisible(t, lastKeyTime = -1e9) {
  // solid while typing (within 0.5 s of a keystroke), otherwise blinking
  if (t - lastKeyTime < 0.5) return 1;
  const ph = ((t - lastKeyTime) % CURSOR.period) / CURSOR.period;
  return ph < 0.5 ? 1 : 0;
}

// Typing events. kind: 'type' (append text), 'back' (delete one char), 'nl' (new line, with a style).
// Line styles: 'zh' (Chinese, 40px mono-ish), 'en' (28px, dimmer), 'cmt' (20px grey comment).
export const TYPING_PROLOGUE = [
  [6.40, 'nl', 'zh'],
  [6.40, 'type', '一部'], [6.62, 'type', '关于'], [6.80, 'type', '人类'], [7.05, 'type', '的'], [7.18, 'type', '电影'],
  [8.10, 'back'], [8.18, 'back'], [8.26, 'back'], [8.34, 'back'], [8.42, 'back'],
  [8.80, 'type', '我们'], [9.02, 'type', '的'], [9.14, 'type', '电影'], [9.30, 'type', '。'],
  [9.90, 'nl', 'en'],
  [9.90, 'type', 'A'], [10.02, 'type', ' FILM'], [10.20, 'type', ' ABOUT'], [10.38, 'type', ' US'], [10.52, 'type', '.'],
  [11.60, 'nl', 'gap'],
  [11.60, 'nl', 'cmt'],
  [11.60, 'type', '// '], [11.70, 'type', '编剧'], [11.84, 'type', ' · 导演'], [12.00, 'type', ' · 作曲'], [12.14, 'type', ' · 渲染'],
  [12.30, 'type', '：'], [12.42, 'type', 'Opus'], [12.56, 'type', ' 5.5'],
  [13.10, 'nl', 'cmt'],
  [13.10, 'type', '// '], [13.20, 'type', 'written,'], [13.34, 'type', ' directed,'], [13.48, 'type', ' scored'], [13.58, 'type', ' &'],
  [13.68, 'type', ' rendered'], [13.84, 'type', ' by'], [13.96, 'type', ' Opus'], [14.08, 'type', ' 5.5'], [14.24, 'type', ' —'],
  [14.36, 'type', ' in'], [14.46, 'type', ' code'],
];
export const DISINTEGRATE = 16.0;   // text → sand grains

export const TYPING_EPILOGUE = [
  [227.60, 'nl', 'zh'],
  [227.60, 'type', '这一次'], [227.86, 'type', '，'],
  [230.20, 'type', '我们'], [230.40, 'type', '要'], [230.52, 'type', '建造'], [230.72, 'type', '什么'], [230.92, 'type', '？'],
  [231.80, 'nl', 'en'],
  [231.80, 'type', 'This'], [231.92, 'type', ' time'], [232.06, 'type', ' —'], [232.20, 'type', ' what'], [232.34, 'type', ' shall'],
  [232.48, 'type', ' we'], [232.60, 'type', ' build'], [232.76, 'type', '?'],
];
export const EPILOGUE_CUT = 237.6;  // text + cursor vanish (hard cut)

// Hits and sync points.
export const HITS = {
  cursorIn: 2.5,
  braam: 33.0,            // title
  starGlint: 80.0,        // Orion glint over the pyramid
  quake: 90.5,            // Pharos earthquake
  emberOut: 93.0,
  bellsWood: [101.2, 102.6, 103.9, 105.0, 106.0, 107.0],   // wind bells as the camera passes each eave
  bigBell: 108.4,         // cathedral bell
  gearMorph: 127.0,
  flash: 146.0,           // white flash, absolute silence 0.6 s
  lowNote: 149.0,
  liftoff: 157.0,
  towerErupt: 188.0,
  cutToBlack: 208.0,
  returnFromBlack: 216.0,
  lowBellD: 238.0,
  finalBlinks: [258.8, 259.86],
};

// Harmonic tower of fifths: pitch class added at each time (D first).
export const FIFTHS = [
  [0.0, 'D'], [24.0, 'A'], [46.0, 'E'], [68.0, 'B'], [82.0, 'F#'] /* Wood: no new note — the bells play D E F# A B pentatonic */, [108.4, 'C#'],
  [129.0, 'G#'], [136.0, 'D#'], [180.0, 'A#'], [184.0, 'F'], [190.0, 'C'], [196.0, 'G'],
];
// Sky (154–176) thins back to the pure D–A fifth; Word restacks everything to all twelve by 196.
// Pulse of labour (bpm) — accelerates through the ages.
export const PULSE = [[38, 60], [58, 80], [67, 0], [128, 120], [146, 0], [177, 120], [188, 160], [208, 0]];
