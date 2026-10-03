// 生成在线试玩版（Artifact）：手帐应用 + 浏览器内模拟接口，数据只存在本机。
// 用法：node tools/build-demo.mjs <输出目录>   输出 index.html、files.json（Artifact 的 files 映射）
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { excludeGlyphs } from './font-utils.mjs';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL((process.argv[2] || 'dist-demo').replace(/\/?$/, '/'), `file://${process.cwd()}/`);
const read = p => readFile(new URL(p, ROOT), 'utf8');
await mkdir(OUT, { recursive: true });
const files = {};
const put = async (path, text) => { const u = new URL(path, OUT); await mkdir(new URL('./', u), { recursive: true }); await writeFile(u, text); files[path] = u.pathname; };

// 字体：西文与标题字体走 Google Fonts（Artifact 允许），并修补 ZCOOL 小薇的“回”；霞鹜文楷自带
const FAMILIES = 'family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Klee+One:wght@400;600&family=Ma+Shan+Zheng&family=ZCOOL+XiaoWei&display=swap';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const gcss = execFileSync('curl', ['-sSL', '--retry', '3', '-A', UA, `https://fonts.googleapis.com/css2?${FAMILIES}`], { encoding: 'utf8' });
if (!gcss.includes('fonts.gstatic.com')) throw new Error('没有取到 Google Fonts 样式');
await put('fonts.css', excludeGlyphs(gcss, 'ZCOOL XiaoWei', [0x56de]));
await put('lxgw/lxgw.css', (await read('public/fonts/lxgw/lxgw.css')).replaceAll('/fonts/lxgw/', ''));
for (const f of await readdir(new URL('public/fonts/lxgw/', ROOT))) {
  if (!f.endsWith('.woff2')) continue;
  await cp(new URL(`public/fonts/lxgw/${f}`, ROOT), new URL(`lxgw/${f}`, OUT)); files[`lxgw/${f}`] = new URL(`lxgw/${f}`, OUT).pathname;
}

// 应用：样式、脚本、图片
await put('app/app.css', await read('public/app/app.css'));
const walk = async dir => (await readdir(new URL(dir, ROOT), { withFileTypes: true })).flatMap(d => d.isDirectory() ? [] : [dir + d.name]);
const jsFiles = [...await walk('public/app/js/'), ...await walk('public/app/js/views/'), ...await walk('public/app/js/demo/')];
for (const f of jsFiles) await put(f.replace('public/', ''), await read(f));
await cp(new URL('public/assets/gate-dawn.jpg', ROOT), new URL('assets/gate-dawn.jpg', OUT)); files['assets/gate-dawn.jpg'] = new URL('assets/gate-dawn.jpg', OUT).pathname;

// 协议页：独立页面，路径改成相对
for (const p of ['privacy.html', 'terms.html']) {
  await put(p, (await read(`public/${p}`))
    .replace(/<link rel="icon"[^>]*>/, '')
    .replace('/fonts/fonts.css', 'fonts.css').replace('/fonts/lxgw/lxgw.css', 'lxgw/lxgw.css').replace('/app/app.css', 'app/app.css')
    .replace('<a href="/">', '<a href="index.html">'));
}

// 页面本体：去掉文档骨架，换成相对路径与试玩入口
const app = await read('public/app/index.html');
const head = `<title>拾光手帐试玩</title>
<meta name="description" content="拾光手帐在线试玩：每天一页，节气为序，月亮回信。内容只保存在这台设备的浏览器里。">
<meta name="theme-color" content="#EEF1EC">
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="lxgw/lxgw.css">
<link rel="stylesheet" href="app/app.css">\n`;
const body = app.slice(app.indexOf('<body>') + 6, app.indexOf('</body>')).replace('<script type="module" src="/app/js/main.js"></script>', '<script type="module" src="app/js/demo/demo.js"></script>');
if (!body.includes('demo/demo.js')) throw new Error('入口脚本替换失败');
await writeFile(new URL('index.html', OUT), head + body.trim() + '\n');
await writeFile(new URL('files.json', OUT), JSON.stringify(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v])), null, 1));
console.log(`试玩版已生成：${new URL('index.html', OUT).pathname}（附带 ${Object.keys(files).length} 个文件）`);
