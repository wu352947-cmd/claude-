// 下载地图字体的子集到 game/public/fonts（国内无法直连 Google Fonts，所以自托管）
// 只打包地图上实际用到的字：地名、图边带、界面固定文字。地名有增改后重新运行：
//   node kursk-wargame/tools/fonts/fetch-map-fonts.mjs
// 字体均为 SIL Open Font License，可免费商用。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const GAME = new URL('../../game/', import.meta.url);
const OUT = new URL('public/fonts/', GAME);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = (url, enc) => execFileSync('curl', ['-sSL', '--retry', '3', '-A', UA, url], { encoding: enc, maxBuffer: 64 << 20 });

// 固定文字（图边带、图例等），改了 furniture.ts 里的文字要同步加到这里
const FIXED = '库尔斯克南线别尔哥罗德奥博扬普罗霍罗夫卡比例尺公里每格指北图例林地村庄河流溪流主干公路土路铁路底图转绘草稿：·—0123456789,';

const labels = JSON.parse(await readFile(new URL('data/maps/south.labels.json', GAME), 'utf8')).labels;
const mapDef = JSON.parse(await readFile(new URL('data/maps/south.json', GAME), 'utf8'));
const zh = [...new Set(FIXED + mapDef.name.zh + labels.map((l) => l.names.zh).join(''))].sort().join('');
const latin = [...new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\'’-.,() ' + labels.map((l) => l.names.en ?? '').join(''))].sort().join('');

const FONTS = [
  { family: 'ZCOOL XiaoWei', query: 'ZCOOL+XiaoWei', text: zh, file: 'map-zh' },
  { family: 'Ma Shan Zheng', query: 'Ma+Shan+Zheng', text: '库尔斯克1943', file: 'map-title' },
  { family: 'IM Fell English', query: 'IM+Fell+English:ital@1', text: latin, file: 'map-latin' },
];

await mkdir(OUT, { recursive: true });
for (const f of FONTS) {
  const css = get(`https://fonts.googleapis.com/css2?family=${f.query}&text=${encodeURIComponent(f.text)}`, 'utf8');
  const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
  if (!url) throw new Error(`没有拿到 ${f.family} 的字体文件`);
  const buf = get(url, 'buffer');
  await writeFile(new URL(`${f.file}.woff2`, OUT), buf);
  console.log(f.family, `${(buf.length / 1024).toFixed(1)} KB`);
}
// 记录已打包的字符，测试会检查地名是否都被覆盖
await writeFile(new URL('fonts.json', OUT), JSON.stringify({ zh, latin }, null, 1) + '\n');
