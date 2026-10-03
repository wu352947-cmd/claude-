// Render the score (src/audio/score.js) in headless Chromium and write out/score.wav
// (stereo, 48 kHz, 24-bit PCM).
// usage: node tools/audio.mjs [--from sec] [--to sec] [--out file.wav] [--rate 48000] [--solo bus,bus]  (solo = debug stems)
import fs from 'node:fs';
import path from 'node:path';
import { openFilm } from './browser.mjs';
import { ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const from = parseFloat(opt('from', '0')), to = parseFloat(opt('to', '260'));
const sampleRate = parseInt(opt('rate', '48000'), 10);
const solo = opt('solo', null)?.split(',') || null;
const outFile = path.resolve(ROOT, opt('out', 'out/score.wav'));

// The page POSTs raw float32 chunks here: /__audio?ch=0|1&off=<frame>
let L = null, R = null;
const hook = (req, res) => {
  if (!req.url.startsWith('/__audio')) return false;
  const u = new URL(req.url, 'http://x');
  const parts = [];
  req.on('data', d => parts.push(d));
  req.on('end', () => {
    const buf = Buffer.concat(parts);
    const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    (u.searchParams.get('ch') === '0' ? L : R).set(f, parseInt(u.searchParams.get('off'), 10));
    res.end('ok');
  });
  return true;
};

const t0 = Date.now();
const { page, close, logs } = await openFilm('', { hook });
const info = await page.evaluate(async ([from, to, sampleRate, solo]) => {
  const m = await import('/src/audio/score.js');
  const t = performance.now();
  const buf = await m.renderScore({ sampleRate, from, to, solo });
  const ms = performance.now() - t;
  window.__score = buf;
  return { length: buf.length, sampleRate: buf.sampleRate, ms, stats: m.renderScore.stats };
}, [from, to, sampleRate, solo]);
L = new Float32Array(info.length); R = new Float32Array(info.length);
await page.evaluate(async () => {
  const buf = window.__score, CH = 48000 * 10;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let off = 0; off < d.length; off += CH) {
      const part = d.slice(off, Math.min(d.length, off + CH));
      await fetch(`/__audio?ch=${c}&off=${off}`, { method: 'POST', body: part.buffer });
    }
  }
});
await close();

// 24-bit PCM WAV
const n = info.length, bytes = n * 2 * 3;
const wav = Buffer.alloc(44 + bytes);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 6, 28); wav.writeUInt16LE(6, 32); wav.writeUInt16LE(24, 34);
wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
let peak = 0, sumL = 0, sumR = 0, o = 44;
for (let i = 0; i < n; i++) {
  for (const X of [L, R]) {
    const x = X[i];
    const a = Math.abs(x); if (a > peak) peak = a;
    let v = Math.round(Math.max(-1, Math.min(1, x)) * 8388607);
    wav.writeIntLE(v, o, 3); o += 3;
  }
  sumL += L[i]; sumR += R[i];
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, wav);
console.log(`wrote ${path.relative(ROOT, outFile)}`);
console.log(`duration ${(n / sampleRate).toFixed(3)} s  (${from}–${to})  ${sampleRate} Hz stereo 24-bit`);
console.log(`sample peak ${(20 * Math.log10(peak + 1e-12)).toFixed(2)} dBFS   DC L ${(sumL / n).toExponential(2)} R ${(sumR / n).toExponential(2)}`);
console.log(`render ${(info.ms / 1000).toFixed(1)} s in browser, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('segments', JSON.stringify(info.stats.segments), 'limiter', JSON.stringify(info.stats.limiter));
const errs = logs.filter(l => /error|exception/i.test(l));
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
