// 由 src/journal.html（也是在线 Artifact 版本）生成部署用的 public/index.html：
// 换成本地字体、加上产品入口、页脚协议与备案号占位（%%ICP%% 由服务端在输出时替换）
import { readFile, writeFile } from 'node:fs/promises';
const src = await readFile(new URL('../src/journal.html', import.meta.url), 'utf8');
const rules = [
  [/<link rel="preconnect"[^>]*>\n/g, ''],
  [/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="/fonts/fonts.css">\n<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">\n<link rel="manifest" href="/manifest.webmanifest">\n<meta name="description" content="拾光手帐：日系与中式审美的个人手帐。每天一页，节气为序，月亮回信。">'],
  ['<button class="theme-btn" id="themeBtn"', '<a class="nav-cta" href="/app/">登录 · 开始写</a>\n    <button class="theme-btn" id="themeBtn"'],
  ['<a class="btn ink" href="#today">翻开今天', '<a class="btn ink" href="/app/#/register">开始写我的手帐'],
  ['心情、待办、喝水和打卡，记在这一页。内容只保存在你自己的浏览器里。', '这是试玩页，内容只存在这台设备的浏览器里。<a href="/app/#/register">新建一本手帐</a>，就能每天一页、云端同步、请月亮回信。'],
  ['<br><span id="footYear">', '<br><a href="/privacy.html">隐私政策</a> · <a href="/terms.html">用户协议</a> · 心里难受时可拨打心理援助热线 12356 %%ICP%%<br><span id="footYear">'],
  ['</style>', '.nav-cta{margin-left:6px;padding:7px 16px;border-radius:18px;background:var(--ink);color:var(--paper);text-decoration:none;font-family:var(--f-display);font-size:14px;letter-spacing:.12em;white-space:nowrap;transition:transform .4s var(--spring)}\n.nav-cta:hover{transform:translateY(-2px)}\n@media (max-width:760px){.nav-cta{margin-left:auto}.theme-btn{margin-left:0}}\n</style>']
];
let out = src;
for (const [a, b] of rules) {
  const before = out; out = out.replace(a, b);
  if (out === before) throw new Error('构建规则没有命中：' + String(a).slice(0, 60));
}
const html = `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${out}\n</body>\n</html>\n`;
await writeFile(new URL('../public/index.html', import.meta.url), html);
console.log('public/index.html 已生成');
