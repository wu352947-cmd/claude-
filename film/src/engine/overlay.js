// 2D typography layer composited above the graded image (below grain).
// Draws title cards, the year odometer HUD, and any per-scene overlay hooks.
import * as THREE from 'three';
import { CARDS, YEARS } from '../titles.js';
import { FONTS, drawSpaced, measure } from './text.js';
import { track, smoothstep, clamp, ease } from './util.js';

export const INK = '#ece4d3';
export const DIM = 'rgba(236,228,211,0.55)';

export class Overlay {
  constructor(w, h, scale = 1) {
    this.w = w; this.h = h; this.s = scale;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  async load() {
    const strings = [];
    for (const c of CARDS) for (const k of ['zh', 'en', 'ref', 'num', 'lines']) if (c[k]) strings.push(Array.isArray(c[k]) ? c[k].join('') : c[k]);
    for (const p of YEARS.places) strings.push(p.zh, p.en);
    const all = strings.join('') + '公元前年0123456789 BCE·';
    const loads = [];
    for (const w of [200, 300, 500, 700, 900]) loads.push(document.fonts.load(`${w} 40px ${FONTS.serifZh}`, all));
    for (const w of [300, 400]) loads.push(document.fonts.load(`${w} 40px ${FONTS.sansZh}`, all));
    for (const st of ['normal', 'italic']) for (const w of [300, 400, 500, 600]) loads.push(document.fonts.load(`${st} ${w} 40px ${FONTS.serifEn}`, all));
    for (const w of [200, 300, 400]) loads.push(document.fonts.load(`${w} 40px "JetBrains Mono"`, all));
    await Promise.all(loads);
  }

  // helpers available to scene overlay hooks
  api() {
    const g = this.g, s = this.s;
    return {
      g, W: this.w, H: this.h, s, FONTS, INK, DIM,
      font: (weight, px, fam, style = '') => `${style} ${weight} ${px * s}px ${fam}`.trim(),
      text: (str, x, y, { font, color = INK, align = 'center', spacing = 0, alpha = 1, blur = 0, baseline = 'middle' } = {}) => {
        if (alpha <= 0.002) return 0;
        this.dirty = true;
        g.save();
        g.font = font;
        const w = measure(g, str, spacing * s);
        const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        if (blur > 0.25) {
          // cheap blur: rasterise small, scale up with smoothing (canvas filter is far too slow on SwiftShader)
          const px = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]);
          const k = 1 / (1 + blur * s * 0.35), pad = px;
          const tw = Math.ceil((w + pad * 2) * k), th = Math.ceil(px * 2.2 * k);
          const tc = this.tmp || (this.tmp = document.createElement('canvas'));
          if (tc.width < tw || tc.height < th) { tc.width = Math.max(tc.width, tw); tc.height = Math.max(tc.height, th); }
          const tg = tc.getContext('2d');
          tg.clearRect(0, 0, tw + 2, th + 2);
          tg.save(); tg.scale(k, k);
          tg.font = font; tg.fillStyle = color; tg.textBaseline = 'middle';
          drawSpaced(tg, str, pad, px * 1.1, spacing * s);
          tg.restore();
          g.globalAlpha = clamp(alpha); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          const yOff = baseline === 'middle' ? 0 : px * 0.35;
          g.drawImage(tc, 0, 0, tw, th, x0 - pad, y - px * 1.1 + yOff, tw / k, th / k);
        } else {
          g.globalAlpha = clamp(alpha); g.fillStyle = color; g.textBaseline = baseline;
          drawSpaced(g, str, x0, y, spacing * s);
        }
        g.restore();
        return w;
      },
      measure: (str, font, spacing = 0) => { g.save(); g.font = font; const w = measure(g, str, spacing * s); g.restore(); return w; },
    };
  }

  draw(t, hooks = []) {
    const g = this.g;
    const wasDirty = this.dirty;
    this.dirty = false;
    if (wasDirty) g.clearRect(0, 0, this.w, this.h);
    const A = this.api();
    for (const c of CARDS) {
      if (t < c.t0 || t > c.t1) continue;
      const fin = c.fadeIn ?? 1.4, fout = c.fadeOut ?? 1.2;
      const a = smoothstep(c.t0, c.t0 + fin, t) * (1 - smoothstep(c.t1 - fout, c.t1, t));
      const blur = (1 - smoothstep(c.t0, c.t0 + fin * 1.2, t)) * 10 + smoothstep(c.t1 - fout, c.t1, t) * 6;
      const life = (t - c.t0) / (c.t1 - c.t0);
      CARD_STYLES[c.kind](A, c, a, blur, life, t);
    }
    if (track(YEARS.opacity, t) > 0.001) { this.dirty = true; drawYear(A, t); }
    if (hooks.length) this.dirty = true;
    for (const h of hooks) { g.save(); h(A); g.restore(); }
    // only re-upload when something was drawn now or last frame (uploads are expensive)
    if (this.dirty || wasDirty) this.texture.needsUpdate = true;
  }
}

const CARD_STYLES = {
  epigraph(A, c, a, blur, life) {
    const { W, H, font } = A;
    const drift = life * 2.5;
    A.text(c.zh, W / 2, H * 0.40, { font: font(300, 38, FONTS.serifZh), spacing: 7 + drift, alpha: a, blur });
    A.text(c.en, W / 2, H * 0.40 + 62 * A.s, { font: font(300, 29, FONTS.serifEn, 'italic'), spacing: 1.2 + drift * 0.3, alpha: a * 0.92, blur });
    A.text(c.ref, W / 2, H * 0.40 + 122 * A.s, { font: font(500, 16, FONTS.serifEn), spacing: 7 + drift, alpha: a * 0.66, blur, color: INK });
  },
  title(A, c, a, blur, life) {
    const { W, H, font } = A;
    const sc = 1 + (1 - ease.outCubic(clamp(life * 3))) * 0.06;
    A.g.save();
    A.g.translate(W / 2, H * 0.47); A.g.scale(sc, sc); A.g.translate(-W / 2, -H * 0.47);
    A.text('巴别', W / 2 + 34 * A.s, H * 0.45, { font: font(200, 176, FONTS.serifZh), spacing: 68 + life * 10, alpha: a, blur });
    A.text('B A B E L', W / 2 + 8 * A.s, H * 0.45 + 150 * A.s, { font: font(400, 30, FONTS.serifEn), spacing: 16 + life * 8, alpha: a * 0.9, blur });
    A.g.restore();
  },
  era(A, c, a, blur, life) {
    const { W, H, font } = A;
    const y = H * 0.5;
    A.text(c.num, W / 2, y - 74 * A.s, { font: font(500, 17, FONTS.serifEn), spacing: 10, alpha: a * 0.75, blur });
    A.text(c.zh, W / 2 + 4 * A.s, y, { font: font(300, 62, FONTS.serifZh), spacing: 8, alpha: a, blur });
    A.text(c.en, W / 2 + 6 * A.s, y + 66 * A.s, { font: font(500, 17, FONTS.serifEn), spacing: 14 + life * 4, alpha: a * 0.8, blur });
  },
  quote(A, c, a, blur, life) {
    const { W, H, font } = A;
    const drift = life * 2;
    const y0 = H * 0.5 - (c.lines.length * 54 + 90) * A.s / 2;
    c.lines.forEach((l, i) => A.text(l, W / 2, y0 + i * 54 * A.s, { font: font(300, 34, FONTS.serifZh), spacing: 5 + drift, alpha: a, blur }));
    const ye = y0 + c.lines.length * 54 * A.s + 22 * A.s;
    (c.en || []).forEach((l, i) => A.text(l, W / 2, ye + i * 38 * A.s, { font: font(300, 26, FONTS.serifEn, 'italic'), spacing: 1 + drift * 0.3, alpha: a * 0.9, blur }));
    A.text(c.ref, W / 2, ye + (c.en || []).length * 38 * A.s + 34 * A.s, { font: font(500, 16, FONTS.serifEn), spacing: 7 + drift, alpha: a * 0.62, blur });
  },
  credit(A, c, a, blur) {
    const { W, H, font } = A;
    let y = H * 0.5 - ((c.rows.length - 1) * 46 * A.s) / 2;
    for (const r of c.rows) {
      const st = { big: [300, 40, FONTS.serifZh, '', 14], name: [500, 30, FONTS.serifEn, '', 18], zh: [300, 22, FONTS.serifZh, '', 8], en: [500, 15, FONTS.serifEn, '', 8], it: [300, 22, FONTS.serifEn, 'italic', 1], gap: null }[r[0]];
      if (st) A.text(r[1], W / 2, y, { font: font(st[0], st[1], st[2], st[3]), spacing: st[4], alpha: a * (r[0] === 'en' ? 0.62 : 1), blur });
      y += (r[0] === 'gap' ? 26 : r[0] === 'big' ? 62 : r[0] === 'name' ? 52 : 40) * A.s;
    }
  },
};

// Year odometer, lower-left. YEARS.keys = [[t, year], ...]; YEARS.opacity track; YEARS.places spans.
function drawYear(A, t) {
  const op = track(YEARS.opacity, t);
  if (op <= 0.001) return;
  const { g, s, font, H } = A;
  const v = track(YEARS.keys, t, 'inOutCubic');
  const x = 96 * s, y = H - 104 * s;
  const n = Math.abs(v), bce = v < 0;
  const settled = Math.abs(track(YEARS.keys, t + 0.25, 'inOutCubic') - v) < 0.5;
  g.save();
  g.globalAlpha = op;
  // rule
  g.fillStyle = 'rgba(236,228,211,0.45)';
  g.fillRect(x, y - 30 * s, 34 * s, 1 * s);
  // label
  const fz = font(300, 17, FONTS.serifZh);
  A.text(bce ? '公元前' : '公元', x, y, { font: fz, align: 'left', spacing: 4, alpha: op * 0.8 });
  const lw = A.measure(bce ? '公元前' : '公元', fz, 4) + 12 * s;
  // odometer digits
  const fd = font(300, 26, '"JetBrains Mono"');
  g.font = fd; const cw = g.measureText('0').width + 2 * s;
  const digits = Math.max(1, String(Math.floor(n)).length);
  const lineH = 30 * s;
  g.save();
  g.beginPath(); g.rect(x + lw - 2 * s, y - lineH * 0.55, cw * digits + 4 * s, lineH * 1.1); g.clip();
  g.fillStyle = INK; g.textBaseline = 'middle';
  for (let i = 0; i < digits; i++) {
    const p = Math.pow(10, digits - 1 - i);
    const whole = Math.floor(n / p);
    let frac = 0;
    const rem = n - whole * p;
    if (p === 1) frac = rem; else if (rem > p - 1) frac = rem - (p - 1);
    const d0 = whole % 10, d1 = (d0 + 1) % 10;
    const dx = x + lw + i * cw;
    g.globalAlpha = op;
    g.fillText(String(d0), dx, y - frac * lineH);
    g.fillText(String(d1), dx, y + (1 - frac) * lineH);
  }
  g.restore();
  A.text(bce ? '年' : '年', x + lw + cw * digits + 10 * s, y, { font: fz, align: 'left', spacing: 4, alpha: op * 0.8 });
  // place line
  for (const p of YEARS.places) {
    if (t < p.t0 || t > p.t1) continue;
    const a = op * smoothstep(p.t0, p.t0 + 1.2, t) * (1 - smoothstep(p.t1 - 1, p.t1, t)) * (settled ? 1 : 0.3);
    const en = `${Math.round(n)} ${bce ? 'BCE' : 'CE'}  ·  ${p.en}`;
    A.text(p.zh, x, y + 34 * s, { font: font(300, 17, FONTS.serifZh), align: 'left', spacing: 6, alpha: a * 0.85 });
    A.text(en, x, y + 60 * s, { font: font(500, 14, FONTS.serifEn), align: 'left', spacing: 4, alpha: a * 0.66 });
  }
  g.restore();
}
