// The typing cursor — shared by the prologue (P1–P2) and the epilogue (E1).
// Everything is laid out in reference pixels of the 1920×804 frame and drawn through a
// canvas transform, so the same code draws the overlay (any render scale) and rasterises
// the exact layout that the prologue turns into sand grains at DISINTEGRATE.
import { CURSOR, cursorVisible } from '../cues.js';
import { FONTS } from '../engine/text.js';

export const REF_W = 1920, REF_H = 804;

// Line styles. alpha = text opacity; hi = opacity of highlighted runs ("Opus 5.5").
export const STYLES = {
  zh:  { size: 40, weight: 300, alpha: 1.0 },
  en:  { size: 28, weight: 300, alpha: 0.6 },
  cmt: { size: 20, weight: 400, alpha: 0.4, hi: 0.96 },
  gap: { size: 0 },
};
const HILITES = ['Opus 5.5'];
export const fontFor = (style, px = STYLES[style].size) => `${STYLES[style].weight} ${px}px ${FONTS.mono}`;

const hex = CURSOR.color.replace('#', '');
export const INK_RGB = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
const ink = a => `rgba(${INK_RGB},${a})`;

const TOKEN_FADE = 0.07;   // a token materialises over ~2 frames
const GLOW_DECAY = 0.38;   // freshly typed token glow (s)

// ---------------------------------------------------------------- layout
const layoutCache = new WeakMap();
// Static per-event-list data: line styles, line y positions, highlight masks, font strings.
export function layoutOf(events) {
  let L = layoutCache.get(events);
  if (L) return L;
  const lines = [];
  for (const e of events) {
    if (e[1] === 'nl') lines.push({ style: e[2], text: '', all: '' });
    else if (e[1] === 'type') { const l = lines[lines.length - 1]; l.text += e[2]; l.all += e[2]; }
    else if (e[1] === 'back') { const l = lines[lines.length - 1]; l.text = [...l.text].slice(0, -1).join(''); }
  }
  let y = CURSOR.y * REF_H, prevSize = 0, gap = 0;
  lines.forEach((l, i) => {
    const sz = STYLES[l.style].size;
    if (l.style === 'gap') { gap += 16; l.y = y; return; }
    if (i > 0) y += (prevSize + sz) * 0.75 + gap;
    gap = 0; prevSize = sz; l.y = y;
    const chars = [...l.text], mask = new Array(chars.length).fill(false);
    for (const h of HILITES) { let k = l.text.indexOf(h); while (k >= 0) { const c0 = [...l.text.slice(0, k)].length; for (let j = 0; j < [...h].length; j++) mask[c0 + j] = true; k = l.text.indexOf(h, k + 1); } }
    l.mask = mask;
  });
  L = { lines };
  layoutCache.set(events, L);
  return L;
}

export async function loadTypingFonts(events) {
  const { lines } = layoutOf(events);
  const by = {};
  for (const l of lines) if (l.style !== 'gap') by[l.style] = (by[l.style] || '') + l.all;
  await Promise.all(Object.entries(by).map(([st, s]) => document.fonts.load(fontFor(st), s + ' ')));
}

// Typing state at time t: lines with per-char birth times, time of the last keystroke.
export function typingState(events, t) {
  const lines = [];
  let lastKey = -1e9;
  for (const e of events) {
    if (e[0] > t) break;
    lastKey = e[0];
    if (e[1] === 'nl') lines.push({ style: e[2], chars: [] });
    else if (e[1] === 'type') { const l = lines[lines.length - 1]; for (const c of e[2]) l.chars.push({ c, t: e[0] }); }
    else if (e[1] === 'back') lines[lines.length - 1].chars.pop();
  }
  return { lines, lastKey };
}

let mctx = null;
const wcache = new Map();
function measure(font, s) {
  const k = font + '|' + s;
  let w = wcache.get(k);
  if (w === undefined) {
    mctx = mctx || document.createElement('canvas').getContext('2d');
    mctx.font = font; w = mctx.measureText(s).width; wcache.set(k, w);
  }
  return w;
}

// Soft-edged version of cursorVisible (box-filtered over ~2 frames).
export function cursorAlpha(t, anchor) {
  let a = 0;
  for (const d of [-0.03, -0.015, 0, 0.015, 0.03]) a += cursorVisible(t + d, anchor);
  return a / 5;
}

// ---------------------------------------------------------------- drawing
// Glow buffers (quarter and eighth resolution) — the cheap blur.
const glowBufs = new Map();
function glowBuf(W, H) {
  const k = W + 'x' + H;
  let b = glowBufs.get(k);
  if (!b) {
    const mk = (d) => { const c = document.createElement('canvas'); c.width = Math.ceil(W / d); c.height = Math.ceil(H / d); return { c, g: c.getContext('2d'), d }; };
    b = { q: mk(4), e: mk(10) };
    glowBufs.set(k, b);
  }
  return b;
}

function drawCursorRect(g, x, yc, h, a) {
  if (a <= 0.003) return;
  g.fillStyle = ink(a);
  g.fillRect(x, yc - h / 2, CURSOR.w, h);
}

// opts: { events, t, zoom=1, center=[x,y] (ref px), textAlpha=1, cursor=1, idleAnchor, glow=true, offset=[x,y] (ref px),
//         alphaFn (remaps each run's style opacity), W, H }
// g: a 2D context; s: device pixels per reference pixel.
export function drawTyping(g, s, opts) {
  const { events, t, zoom = 1, center = [REF_W / 2, REF_H / 2], textAlpha = 1, cursor = 1, idleAnchor = -1e9, glow = true, offset = [0, 0], alphaFn = null } = opts;
  const L = layoutOf(events);
  const st = typingState(events, t);
  const [cx, cy] = center;
  const setT = (gg, k) => gg.setTransform(k * zoom, 0, 0, k * zoom, k * (cx - cx * zoom - offset[0]), k * (cy - cy * zoom - offset[1]));
  const x0 = CURSOR.x * REF_W;
  const glowItems = [];   // [kind, args, alpha]

  setT(g, s);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  st.lines.forEach((l, i) => {
    if (l.style === 'gap' || !l.chars.length) return;
    const sty = STYLES[l.style], font = fontFor(l.style), y = L.lines[i].y, mask = L.lines[i].mask;
    g.font = font;
    // runs of chars that share a birth time and highlight state
    let j = 0, prefix = '';
    while (j < l.chars.length) {
      const b = l.chars[j].t, hi = !!mask[j];
      let run = '';
      let k = j;
      while (k < l.chars.length && l.chars[k].t === b && (!!mask[k] === !!mask[j])) { run += l.chars[k].c; k++; }
      const x = x0 + measure(font, prefix);
      const age = t - b;
      const aIn = Math.min(1, Math.max(0, age / TOKEN_FADE));
      const base = (alphaFn ? alphaFn(hi ? sty.hi : sty.alpha) : (hi ? sty.hi : sty.alpha)) * textAlpha;
      g.fillStyle = ink(base * aIn);
      g.fillText(run, x, y);
      const ga = (Math.exp(-age / GLOW_DECAY) * 0.85 + (hi ? 0.22 : 0)) * textAlpha * aIn;
      if (glow && ga > 0.01) glowItems.push(['text', font, run, x, y, ga * (hi ? 1 : sty.alpha)]);
      prefix += run;
      j = k;
    }
  });

  // cursor
  let cur = null;
  if (cursor > 0.001) {
    const li = st.lines.length ? st.lines.length - 1 : -1;
    let style = 'zh', y = CURSOR.y * REF_H, x = x0;
    if (li >= 0) {
      let lj = li;
      while (lj > 0 && st.lines[lj].style === 'gap') lj--;
      const l = st.lines[lj];
      style = l.style === 'gap' ? 'zh' : l.style; y = L.lines[lj].y;
      const txt = l.chars.map(c => c.c).join('');
      x = x0 + (txt ? measure(fontFor(style), txt) + 3 : 0);
    }
    const h = CURSOR.h * STYLES[style].size / 40;
    const anchor = st.lastKey > -1e8 ? st.lastKey : idleAnchor;
    const a = cursorAlpha(t, anchor) * cursor;
    drawCursorRect(g, x, y, h, a);
    if (glow && a > 0.003) glowItems.push(['cursor', x, y, h, a]);
    cur = { x, y, h, a };
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (glow && glowItems.length) compositeGlow(g, s, opts, setT, glowItems);
  return cur;
}

function compositeGlow(g, s, opts, setT, items) {
  const W = opts.W ?? g.canvas.width, H = opts.H ?? g.canvas.height;
  const { q, e } = glowBuf(W, H);
  q.g.setTransform(1, 0, 0, 1, 0, 0);
  q.g.clearRect(0, 0, q.c.width, q.c.height);
  setT(q.g, s / q.d);
  q.g.textBaseline = 'middle';
  // bounding box (reference px) of everything that glows — only that region is composited
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const it of items) {
    if (it[0] === 'text') {
      q.g.font = it[1]; q.g.fillStyle = ink(Math.min(1, it[5])); q.g.fillText(it[2], it[3], it[4]);
      const w = measure(it[1], it[2]), hh = parseFloat(it[1].match(/(\d+(?:\.\d+)?)px/)[1]);
      x0 = Math.min(x0, it[3]); x1 = Math.max(x1, it[3] + w); y0 = Math.min(y0, it[4] - hh); y1 = Math.max(y1, it[4] + hh);
    } else { // cursor: a slightly fattened bar so its halo reads as light, not as a smudge
      q.g.fillStyle = ink(Math.min(1, it[4]));
      q.g.fillRect(it[1] - 1.5, it[2] - it[3] / 2 - 1, CURSOR.w + 3, it[3] + 2);
      x0 = Math.min(x0, it[1]); x1 = Math.max(x1, it[1] + CURSOR.w); y0 = Math.min(y0, it[2] - it[3]); y1 = Math.max(y1, it[2] + it[3]);
    }
  }
  q.g.setTransform(1, 0, 0, 1, 0, 0);
  // reference box → device px (through the same transform), padded by the blur reach
  const m = new DOMMatrix(); setT({ setTransform: (a, b, c, d, ee, f) => m.setMatrixValue(`matrix(${a},${b},${c},${d},${ee},${f})`) }, s);
  const pad = 14 * e.d * s / 4;
  const bx0 = Math.max(0, m.a * x0 + m.e - pad), by0 = Math.max(0, m.d * y0 + m.f - pad);
  const bx1 = Math.min(W, m.a * x1 + m.e + pad), by1 = Math.min(H, m.d * y1 + m.f + pad);
  if (bx1 <= bx0 || by1 <= by0) return;
  e.g.setTransform(1, 0, 0, 1, 0, 0);
  e.g.clearRect(0, 0, e.c.width, e.c.height);
  e.g.imageSmoothingEnabled = true; e.g.imageSmoothingQuality = 'high';
  e.g.drawImage(q.c, 0, 0, e.c.width, e.c.height);
  g.save();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'lighter';
  const blit = (b, alpha) => {
    const sx = Math.floor(bx0 / b.d), sy = Math.floor(by0 / b.d), sw = Math.min(b.c.width - sx, Math.ceil(bx1 / b.d) - sx + 1), sh = Math.min(b.c.height - sy, Math.ceil(by1 / b.d) - sy + 1);
    if (sw <= 0 || sh <= 0) return;
    g.globalAlpha = alpha;
    g.drawImage(b.c, sx, sy, sw, sh, sx * b.d, sy * b.d, sw * b.d, sh * b.d);
  };
  blit(q, 0.55);
  blit(e, 0.5);
  g.restore();
}

// A lone cursor (used for the final blinks at frame centre).
export function drawLoneCursor(g, s, x, y, a, W, H) {
  if (a <= 0.003) return;
  const setT = (gg, k) => gg.setTransform(k, 0, 0, k, 0, 0);
  setT(g, s);
  drawCursorRect(g, x, y, CURSOR.h, a);
  g.setTransform(1, 0, 0, 1, 0, 0);
  compositeGlow(g, s, { W, H }, setT, [['cursor', x, y, CURSOR.h, a]]);
}
