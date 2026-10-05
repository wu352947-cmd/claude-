// 为 /history/ 下载只含页面所用字符的字体子集，自托管到 public/history/fonts（站点 CSP 只允许同源字体）
// 改了页面文字后重新运行：node tools/fetch-history-fonts.mjs
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const DIR = new URL('../public/history/', import.meta.url);
const OUT = new URL('fonts/', DIR);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = (url, enc) => execFileSync('curl', ['-sSL', '--retry', '3', '-A', UA, url], { encoding: enc, maxBuffer: 64 << 20 });

const sources = (await Promise.all(['index.html', 'history.js', 'sameyear.js'].map(f => readFile(new URL(f, DIR), 'utf8')))).join('');
const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const text = [...new Set(ascii + sources.replace(/\s/g, ''))].filter(c => c.codePointAt(0) >= 32).sort().join('');

// [Google Fonts 家族, 本地家族名, 轴, 子集文字]
const FAMILIES = [
  ['Noto Serif SC', 'Noto Serif SC W', 'wght@300;600', text],
  ['Noto Sans SC', 'Noto Sans SC W', 'wght@400', text],
  ['Bodoni Moda', 'Bodoni Moda W', 'opsz,wght@6..96,400', '0123456789'],
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
let out = '/* 由 tools/fetch-history-fonts.mjs 生成，勿手改 */\n';
for (const [family, local, axes, chars] of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axes}&text=${encodeURIComponent(chars)}&display=swap`;
  let css = get(url, 'utf8');
  if (!css.includes('@font-face')) throw new Error(`${family}: ${css.slice(0, 200)}`);
  for (const u of new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))) {
    const name = createHash('sha1').update(u).digest('hex').slice(0, 16) + '.woff2';
    await writeFile(new URL(name, OUT), get(u, 'buffer'));
    css = css.split(u).join(`/history/fonts/${name}`);
  }
  out += css.replaceAll(`'${family}'`, `'${local}'`);
}
await writeFile(new URL('fonts.css', OUT), out);
const files = (await readdir(OUT)).filter(f => f.endsWith('.woff2'));
console.log(`done: ${files.length} files, ${text.length} chars`);
