// 下载 Google Fonts 的分片字体到 public/fonts，生成本地 fonts.css（国内无法直连 Google Fonts）
// 用法：node tools/fetch-fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FAMILIES = 'family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Klee+One:wght@400;600&family=Ma+Shan+Zheng&family=ZCOOL+XiaoWei&display=swap';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const OUT = new URL('../public/fonts/', import.meta.url);
const get = (url, enc) => execFileSync('curl', ['-sSL', '--retry', '3', '-A', UA, url], { encoding: enc, maxBuffer: 64 << 20 });

await mkdir(OUT, { recursive: true });
let css = get(`https://fonts.googleapis.com/css2?${FAMILIES}`, 'utf8');
const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
let n = 0;
for (const u of urls) {
  const name = createHash('sha1').update(u).digest('hex').slice(0, 16) + '.woff2';
  await writeFile(new URL(name, OUT), get(u, 'buffer'));
  css = css.split(u).join(`/fonts/${name}`);
  if (++n % 40 === 0) console.log(`${n}/${urls.length}`);
}
await writeFile(new URL('fonts.css', OUT), `/* 由 tools/fetch-fonts.mjs 生成，勿手改 */\n${css}`);
console.log(`done: ${urls.length} files`);
