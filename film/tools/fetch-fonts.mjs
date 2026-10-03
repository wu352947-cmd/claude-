// Downloads every web font the film uses into film/fonts/ and writes fonts/fonts.css
// pointing at the local copies, so renders are deterministic and offline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'fonts');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const FAMILIES = [
  'Noto+Serif+SC:wght@200;300;500;700;900',
  'Noto+Sans+SC:wght@300;400',
  'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400',
  'JetBrains+Mono:wght@200;300;400',
  // scripts for the tower of all languages
  'Noto+Sans+Cuneiform', 'Noto+Sans+Egyptian+Hieroglyphs', 'Noto+Sans+Phoenician',
  'Noto+Sans+Linear+B', 'Noto+Sans+Old+Persian', 'Noto+Sans+Brahmi', 'Noto+Sans+Runic',
  'Noto+Serif:wght@400', 'Noto+Naskh+Arabic:wght@400', 'Noto+Serif+Devanagari:wght@400',
  'Noto+Serif+Hebrew:wght@400', 'Noto+Serif+Ethiopic:wght@400', 'Noto+Serif+Tibetan:wght@400',
  'Noto+Serif+Thai:wght@400', 'Noto+Serif+KR:wght@400', 'Noto+Serif+JP:wght@400',
  'Noto+Sans+Mongolian', 'Noto+Serif+Armenian:wght@400', 'Noto+Serif+Georgian:wght@400',
  'Noto+Sans+Cherokee:wght@400', 'Noto+Serif+Tamil:wght@400',
];

fs.mkdirSync(OUT, { recursive: true });
let css = '';
for (const fam of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${fam}&display=block`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) { console.error('skip', fam, res.status); continue; }
  let text = await res.text();
  const urls = [...new Set([...text.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
  await Promise.all(urls.map(async u => {
    const name = crypto.createHash('sha1').update(u).digest('hex').slice(0, 16) + '.woff2';
    const file = path.join(OUT, name);
    if (!fs.existsSync(file)) {
      const r = await fetch(u);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    text = text.split(u).join(name);
  }));
  css += `/* ${fam} */\n` + text + '\n';
  console.log('ok', fam, urls.length, 'files');
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), css);
