// Render stills for review.
// usage: node tools/still.mjs [--scale 0.5] [--out dir] t1 t2 ...   (t in seconds, or a..b/n for n evenly spaced)
import fs from 'node:fs';
import path from 'node:path';
import { openFilm } from './browser.mjs';
import { ROOT } from './serve.mjs';

const args = process.argv.slice(2);
let scale = 0.5, out = path.join(ROOT, 'out/stills'), times = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scale') scale = parseFloat(args[++i]);
  else if (args[i] === '--out') out = path.resolve(args[++i]);
  else if (args[i].includes('..')) { const [a, rest] = args[i].split('..'); const [b, n] = rest.split('/'); const N = parseInt(n || '6'); for (let k = 0; k < N; k++) times.push(+a + (+b - +a) * k / (N - 1)); }
  else times.push(parseFloat(args[i]));
}
fs.mkdirSync(out, { recursive: true });
const { page, close } = await openFilm(`?scale=${scale}`, { scale });
await page.evaluate(([a, b]) => window.FILM.load(a, b), [Math.min(...times), Math.max(...times)]);
for (const t of times) {
  const t0 = Date.now();
  await page.evaluate(t => window.FILM.renderTime(t), t);
  const file = path.join(out, `t${t.toFixed(2).padStart(7, '0')}.png`);
  await page.locator('#film').screenshot({ path: file });
  console.log(file, `${Date.now() - t0}ms`);
}
await close();
