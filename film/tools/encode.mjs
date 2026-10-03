// Final assembly: concatenates rendered chunks, letterboxes 1920×804 into 1920×1080,
// muxes the score, and two-pass encodes H.264 to a target file size.
// usage: node tools/encode.mjs [--size-mb 92] [--out ../BABEL.mp4] [--master]   (--master = high-bitrate CRF 16 copy)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const sizeMB = parseFloat(opt('size-mb', '92'));
const out = path.resolve(ROOT, opt('out', '../BABEL.mp4'));
const master = argv.includes('--master');
const DURATION = 260;

const dir = path.join(ROOT, 'out', 'chunks');
const chunks = fs.readdirSync(dir).filter(f => /^c\d{4}\.mkv$/.test(f)).sort();
const expected = Math.ceil(DURATION * 24 / 120);
if (chunks.length !== expected) { console.error(`expected ${expected} chunks, found ${chunks.length}`); process.exit(1); }
const list = path.join(ROOT, 'out', 'concat.txt');
fs.writeFileSync(list, chunks.map(c => `file '${path.join(dir, c)}'`).join('\n'));

const wav = path.join(ROOT, 'out', 'score.wav');
const hasAudio = fs.existsSync(wav);
const inputs = ['-f', 'concat', '-safe', '0', '-i', list, ...(hasAudio ? ['-i', wav] : [])];
const vf = 'pad=1920:1080:0:138:black,format=yuv420p';
const audioArgs = hasAudio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-an'];
const common = ['-vf', vf, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryslow', '-tune', 'film',
  '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1', '-r', '24', '-t', String(DURATION)];
const run = args => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-stats', ...args], { stdio: 'inherit' });

if (master) {
  const m = out.replace(/\.mp4$/, '.master.mp4');
  run([...inputs, ...common, '-crf', '16', ...audioArgs, '-movflags', '+faststart', m]);
  console.log('wrote', m);
} else {
  const audioKbps = hasAudio ? 192 : 0;
  const vKbps = Math.floor((sizeMB * 8 * 1024 * 0.985) / DURATION - audioKbps);
  console.log(`video ${vKbps} kbps, audio ${audioKbps} kbps`);
  const passlog = path.join(ROOT, 'out', 'x264pass');
  run([...inputs, ...common, '-b:v', `${vKbps}k`, '-pass', '1', '-passlogfile', passlog, '-an', '-f', 'mp4', '/dev/null']);
  run([...inputs, ...common, '-b:v', `${vKbps}k`, '-maxrate', `${vKbps * 2.2}k`, '-bufsize', `${vKbps * 4}k`, '-pass', '2', '-passlogfile', passlog,
    ...audioArgs, '-movflags', '+faststart', out]);
  console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1), 'MB');
}
