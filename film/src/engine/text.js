// Typography helpers: font loading, text → particle points, glyph atlases.
import * as THREE from 'three';

export const FONTS = {
  serifZh: '"Noto Serif SC"',
  sansZh: '"Noto Sans SC"',
  serifEn: '"Cormorant Garamond"',
  mono: '"JetBrains Mono", "Noto Sans SC"',
};

// Make sure the glyphs of `text` are loaded for `font` (a CSS font shorthand, e.g. '300 64px "Noto Serif SC"').
// CJK fonts are split by unicode-range, so loading must be done per string.
export async function ensureFont(font, text) {
  await document.fonts.load(font, text);
}

// Rasterise text and return sampled points (in pixels, origin at the text block centre, y up).
// opts: { font, lines:[str], lineHeight, letterSpacing(px), step(px sampling grid), threshold(0..255), jitter }
export function textToPoints(opts) {
  const { font, lines, lineHeight = 1.3, letterSpacing = 0, step = 3, threshold = 128, align = 'center' } = opts;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]);
  const widths = lines.map(l => measure(g, l, letterSpacing));
  const W = Math.ceil(Math.max(...widths) + size), H = Math.ceil(lines.length * size * lineHeight + size);
  c.width = W; c.height = H;
  g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const y = size * 0.5 + (i + 0.5) * size * lineHeight;
    const x0 = align === 'center' ? (W - widths[i]) / 2 : size / 2;
    drawSpaced(g, l, x0, y, letterSpacing);
  });
  const data = g.getImageData(0, 0, W, H).data;
  const pts = [];
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const a = data[(y * W + x) * 4 + 3];
    if (a >= threshold) pts.push(x - W / 2, H / 2 - y, a / 255);
  }
  return { points: new Float32Array(pts), count: pts.length / 3, width: W, height: H };
}

export function measure(g, s, letterSpacing = 0) {
  return g.measureText(s).width + letterSpacing * Math.max(0, [...s].length - 1);
}
export function drawSpaced(g, s, x, y, letterSpacing = 0, stroke = false) {
  if (!letterSpacing) { stroke ? g.strokeText(s, x, y) : g.fillText(s, x, y); return; }
  for (const ch of s) { stroke ? g.strokeText(ch, x, y) : g.fillText(ch, x, y); x += g.measureText(ch).width + letterSpacing; }
}

// Glyph atlas: renders each char into a cell of a square grid texture.
// Returns { texture, cols, rows, uv(i) -> [u0,v0,u1,v1], count }.
export function glyphAtlas(chars, { font, cell = 64, color = '#fff' } = {}) {
  const list = [...chars];
  const cols = Math.ceil(Math.sqrt(list.length));
  const rows = Math.ceil(list.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * cell; c.height = rows * cell;
  const g = c.getContext('2d');
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  list.forEach((ch, i) => {
    const f = Array.isArray(font) ? font[i % font.length] : font;
    g.font = f;
    const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * cell + cell / 2;
    const w = g.measureText(ch).width;
    if (w > cell * 0.92) { g.save(); g.translate(x, y); g.scale(cell * 0.92 / w, cell * 0.92 / w); g.fillText(ch, 0, 0); g.restore(); }
    else g.fillText(ch, x, y);
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return {
    texture, cols, rows, count: list.length, canvas: c,
    uv: i => { const x = i % cols, y = Math.floor(i / cols); return [x / cols, 1 - (y + 1) / rows, (x + 1) / cols, 1 - y / rows]; },
  };
}
