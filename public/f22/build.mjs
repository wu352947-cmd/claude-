// Inlines the shared model and terrain into each page.
// Outputs: *.body.html (published as artifacts) and standalone documents for the site.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const read = f => readFileSync(here + f, 'utf8');
const model = read('src/model.js'), terrain = read('src/terrain.js'), aircraft = read('src/aircraft.js'), world = read('src/world.js'), raptorhd = read('src/raptorglb.js'), navy = read('src/navy.js'), navyhd = read('src/navyhd.js');
const doc = body => `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${body}</html>\n`;
for (const [name, body, page] of [['viewer', 'f22.body.html', 'index.html'], ['game', 'game.body.html', 'game.html'], ['navwar', 'navwar.body.html', 'navwar.html']]) {
  const js = read(`src/${name}.js`).replace('/*@MODEL@*/', () => model).replace('/*@TERRAIN@*/', () => terrain).replace('/*@AIRCRAFT@*/', () => aircraft).replace('/*@WORLD@*/', () => world).replace('/*@RAPTORHD@*/', () => raptorhd).replace('/*@NAVY@*/', () => navy).replace('/*@NAVYHD@*/', () => navyhd);
  const out = read(`src/${name}.head.html`) + '<script type="module">\n' + js + '</script>\n';
  writeFileSync(here + body, out);
  writeFileSync(here + page, doc(out));
  console.log(name, (out.length / 1024).toFixed(0) + ' KB');
}
