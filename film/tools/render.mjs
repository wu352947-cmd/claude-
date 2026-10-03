// Offline renderer: renders the film in 5-second chunks across parallel headless
// browsers, streaming raw frames into ffmpeg. Finished chunks are kept, so a
// re-run resumes where it stopped.
// usage: node tools/render.mjs [--from sec] [--to sec] [--workers 3] [--scale 1] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openFilm } from './browser.mjs';
import { ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const FPS = 24, CHUNK = 120;
const from = Math.round(parseFloat(opt('from', '0')) * FPS);
const to = Math.round(parseFloat(opt('to', '260')) * FPS);
const workers = parseInt(opt('workers', '3'), 10);
const scale = parseFloat(opt('scale', '1'));
const force = argv.includes('--force');
const dir = path.join(ROOT, 'out', scale === 1 ? 'chunks' : `chunks@${scale}`);
fs.mkdirSync(dir, { recursive: true });
const W = Math.round(1920 * scale), H = Math.round(804 * scale);

const jobs = [];
for (let c = Math.floor(from / CHUNK); c * CHUNK < to; c++) {
  const file = path.join(dir, `c${String(c).padStart(4, '0')}.mkv`);
  if (!force && fs.existsSync(file)) continue;
  jobs.push({ c, f0: c * CHUNK, f1: Math.min((c + 1) * CHUNK, 260 * FPS), file });
}
console.log(`${jobs.length} chunks to render with ${workers} workers`);
const t0 = Date.now();
let done = 0;

async function worker(id) {
  let sink = null;
  const hook = (req, res) => {
    if (!req.url.startsWith('/__frame')) return false;
    const parts = [];
    req.on('data', d => parts.push(d));
    req.on('end', () => {
      const buf = Buffer.concat(parts);
      if (sink.write(buf)) res.end('ok'); else sink.once('drain', () => res.end('ok'));
    });
    return true;
  };
  const { page, close } = await openFilm(`?scale=${scale}`, { scale, hook });
  while (jobs.length) {
    const j = jobs.shift();
    const tmp = j.file + '.part.mkv';
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '13', '-pix_fmt', 'yuv420p', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
    sink = ff.stdin;
    await page.evaluate(([a, b]) => window.FILM.load(a, b), [j.f0 / FPS, j.f1 / FPS]);
    const c0 = Date.now();
    for (let i = j.f0; i < j.f1; i++) await page.evaluate(i => window.FILM.postFrame(i), i);
    sink.end();
    await new Promise(r => ff.on('close', r));
    fs.renameSync(tmp, j.file);
    done++;
    const spf = (Date.now() - c0) / 1000 / (j.f1 - j.f0);
    const el = (Date.now() - t0) / 1000;
    console.log(`[w${id}] chunk ${j.c} (${(j.f0 / FPS).toFixed(0)}s) ${spf.toFixed(2)} s/frame · ${done} done · elapsed ${(el / 60).toFixed(1)} min`);
  }
  await close();
}
await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));
console.log('all chunks rendered');
