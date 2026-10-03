// Entry point. Exposes window.FILM for the offline renderer, and a simple
// real-time preview player when opened with ?play.
import { Film, FPS, DURATION, SEGMENTS } from './engine/core.js';

const q = new URLSearchParams(location.search);
const scale = parseFloat(q.get('scale') || '1');
const samples = parseInt(q.get('samples') || '0', 10);
const film = new Film(document.getElementById('film'), { scale, samples });

function scenesFor(t0, t1) {
  return [...new Set(SEGMENTS.filter(s => s.end > t0 && s.start <= t1).map(s => s.scene))];
}

window.FILM = {
  FPS, DURATION, film,
  scenesFor,
  async load(t0 = 0, t1 = DURATION) { await film.load(scenesFor(t0, t1)); },
  renderTime: t => film.renderTime(t),
  renderFrame: i => film.renderFrame(i),
  // Render frame i and POST raw RGBA (bottom row first) to the render tool.
  async postFrame(i) {
    film.renderFrame(i);
    const gl = film.renderer.getContext();
    const buf = this._buf || (this._buf = new Uint8Array(film.w * film.h * 4));
    gl.readPixels(0, 0, film.w, film.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    await fetch('/__frame?i=' + i, { method: 'POST', body: buf });
  },
  // Render frame i and return raw RGBA as base64 (used by tools/render.mjs).
  frameB64(i) {
    film.renderFrame(i);
    const px = film.readPixels();
    let s = ''; const CH = 0x8000;
    for (let k = 0; k < px.length; k += CH) s += String.fromCharCode.apply(null, px.subarray(k, k + CH));
    return btoa(s);
  },
};

if (q.has('t')) {
  const t = parseFloat(q.get('t'));
  await window.FILM.load(t, t);
  film.renderTime(t);
  document.title = 'ready';
} else if (q.has('play')) {
  const from = parseFloat(q.get('play') || '0') || 0;
  await window.FILM.load(from, DURATION);
  const audio = new Audio('out/score.wav');
  audio.currentTime = from;
  const t0 = performance.now();
  audio.play().catch(() => {});
  const loop = () => { film.renderTime(from + (performance.now() - t0) / 1000); requestAnimationFrame(loop); };
  loop();
}
window.FILM_READY = true;
