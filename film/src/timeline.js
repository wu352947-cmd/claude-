// Master timeline of BABEL. All times in seconds (24 fps).
// Overlapping segments cross-fade in HDR over the overlap window.
export const W = 1920, H = 804, FPS = 24;   // 2.39:1 active picture; padded to 1080 on encode
export const DURATION = 260;

export const SEGMENTS = [
  { scene: 'prologue', start: 0,     end: 39.5 },   // cursor → sand → epigraph → title
  { scene: 'mud',      start: 38,    end: 69 },     // I   泥  Uruk ziggurat, -4000 → -3000
  { scene: 'stone',    start: 67.5,  end: 83 },     // II  石  Giza, -2560
  { scene: 'fire',     start: 81.5,  end: 94.5 },   // III 火  Pharos, -280
  { scene: 'wood',     start: 94,    end: 108.5 },  // IV  木  Yingxian pagoda, 1056
  { scene: 'faith',    start: 108,   end: 128.5 },  // V   信  Cologne cathedral, 1248
  { scene: 'iron',     start: 127.5, end: 154.5 },  // VI  铁  gears → lattice → city → 1945
  { scene: 'sky',      start: 153.5, end: 176.5 },  // VII 天  launch tower, Earthrise, 1969
  { scene: 'word',     start: 176,   end: 227 },    // VIII 言 network → tower of all scripts, 2026
  { scene: 'epilogue', start: 226,   end: 260 },    // the cursor asks; credits
];

// Global fades applied after grading (0..1). Overlay text is drawn above these.
export const MASTER = {
  black: [[0, 0], [207.9, 0], [208.0, 1, 'linear'], [215.4, 1], [216.6, 0], [258.6, 0], [259.6, 1]],
  white: [[0, 0], [145.96, 0], [146.0, 1, 'linear'], [146.7, 1], [149.5, 0, 'outCubic']],
};
