// Contact sheet for review: stills every `step` seconds between from..to, tiled with timecodes.
// usage: node tools/sheet.mjs <from> <to> <step> [cols=4] [scale=0.25]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './serve.mjs';

const [from, to, step, cols = '4', scale = '0.25'] = process.argv.slice(2);
const times = [];
for (let t = +from; t <= +to + 1e-6; t += +step) times.push(+t.toFixed(2));
const dir = path.join(ROOT, 'out', `sheet_${from}_${to}`);
fs.rmSync(dir, { recursive: true, force: true });
execFileSync('node', [path.join(ROOT, 'tools/still.mjs'), '--scale', scale, '--out', dir, ...times.map(String)], { stdio: 'inherit' });
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const font = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const labeled = files.map(f => {
  const t = parseFloat(f.slice(1, -4));
  const tc = `${Math.floor(t / 60)}\\:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const o = path.join(dir, 'L' + f);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, f), '-vf', `drawtext=fontfile=${font}:text='${tc}':x=8:y=8:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.5`, o]);
  return o;
});
const rows = Math.ceil(labeled.length / +cols);
const outFile = path.join(ROOT, 'out', `sheet_${from}_${to}.png`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob', '-i', path.join(dir, 'Lt*.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', outFile]);
console.log(outFile);
