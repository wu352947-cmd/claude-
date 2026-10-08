// 下载拉丁转写字体（IM Fell English 斜体，SIL OFL，可免费商用）的子集到 game/public/fonts。
// 国内无法直连 Google Fonts，所以自托管。地名的拉丁转写有增改后重新运行：
//   node kursk-wargame/tools/fonts/fetch-map-fonts.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const GAME = new URL('../../game/', import.meta.url);
const OUT = new URL('public/fonts/', GAME);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = (url, enc) => execFileSync('curl', ['-sSL', '--retry', '3', '-A', UA, url], { encoding: enc, maxBuffer: 64 << 20 });

const labels = JSON.parse(await readFile(new URL('data/maps/south.labels.json', GAME), 'utf8')).labels;
const latin = [...new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\'’-.,() ' + labels.map((l) => l.names.en ?? '').join(''))].sort().join('');

await mkdir(OUT, { recursive: true });
const css = get(`https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@1&text=${encodeURIComponent(latin)}`, 'utf8');
const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
if (!url) throw new Error('没有拿到字体文件');
const buf = get(url, 'buffer');
await writeFile(new URL('map-latin.woff2', OUT), buf);
// 记录已打包的字符，测试会检查地名转写是否都被覆盖
await writeFile(new URL('fonts.json', OUT), JSON.stringify({ latin }, null, 1) + '\n');
console.log(`IM Fell English ${(buf.length / 1024).toFixed(1)} KB`);
