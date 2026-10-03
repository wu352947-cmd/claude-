// 在线试玩版：在浏览器里模拟服务端接口，数据存在本机 localStorage。
// 接口与返回格式和 server/index.js 保持一致，前端代码无需改动。
import { termOf, moonOf, parseDay, dayKey, isDayKey, SEASON_CN, pad } from '../calendar.js';
import { SITE } from '../site.js';
import { CITY_MAP } from '../cities.js';

const KEY = 'sgdemo.v1';
const blank = () => ({ seq: 1, users: [], session: null, entries: {}, letters: [], usage: {}, codes: {} });
let db;
try { db = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { db = blank(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { throw err(507, '这台设备的浏览器存储满了，删掉几张照片再试'); } };
const now = () => Date.now();
const err = (status, error, extra = {}) => Object.assign(new Error(error), { status, body: { error, ...extra } });
const MOODS = new Set(['', 'happy', 'calm', 'sweet', 'tired', 'blue']);
const MOOD_CN = { happy: '开心', calm: '平静', sweet: '小确幸', tired: '有点累', blue: '想哭' };
const HOTLINES = [{ name: '全国统一心理援助热线', number: '12356' }, { name: '紧急情况请拨打', number: '110 / 120' }];
const CRISIS = [/想死/, /去死/, /不想活/, /活不下去/, /活着没(有)?意思/, /活着(好|太)累/, /自杀/, /轻生/, /寻死/, /结束(自己的)?生命/, /了结(自己|一切)/, /割腕/, /跳楼/, /跳河/, /遗书/, /不想(再)?醒来/, /伤害自己/, /自残/];
const crisis = t => CRISIS.some(p => p.test(String(t || '').replace(/\s+/g, '')));
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sgdemo|' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const mask = p => p ? p.slice(0, 3) + '****' + p.slice(7) : '';
const me = () => db.users.find(u => u.id === db.session) || null;
const pub = u => ({ id: u.id, username: u.username, nickname: u.nickname, settings: u.settings, createdAt: u.created_at, phone: mask(u.phone), hasPassword: !!u.pass });
const entriesOf = u => (db.entries[u.id] ||= {});
const entryOut = (day, e) => e && { day, mood: e.mood, body: e.body, page: e.page, sealedAt: e.sealedAt || null, updatedAt: e.updatedAt };
const letterOut = (l, t = now()) => ({ id: l.id, kind: l.kind, day: l.day || null, title: l.title, createdAt: l.createdAt, deliverAt: l.deliverAt, openedAt: l.openedAt || null, due: l.deliverAt <= t, body: l.deliverAt <= t ? l.body : null, meta: l.meta || {} });
const validName = n => typeof n === 'string' && /^[A-Za-z0-9_一-龥]{2,20}$/.test(n);
const validPhone = p => typeof p === 'string' && /^1[3-9]\d{9}$/.test(p);

function cleanPage(p, u) {
  const n = (v, lo, hi, d = 0) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const owned = new Set(Object.keys(localStorage).filter(k => k.startsWith(`sgdemo.photo.${u.id}.`)).map(k => k.split('.').pop()));
  return {
    stickers: (Array.isArray(p?.stickers) ? p.stickers : []).slice(0, 80).filter(s => /^[a-z0-9-]+$/.test(s.k || '')).map(s => ({ id: String(s.id || '').slice(0, 16), k: s.k, x: n(s.x, -.1, 1.1, .5), y: n(s.y, -.1, 3, .5), r: n(s.r, -180, 180), s: n(s.s, .4, 2.5, 1), t: '' })),
    photos: (Array.isArray(p?.photos) ? p.photos : []).slice(0, 4).filter(ph => owned.has(ph.id)).map(ph => ({ id: ph.id, x: n(ph.x, -.1, 1.1, .5), y: n(ph.y, -.1, 3, .5), r: n(ph.r, -45, 45), cap: String(ph.cap || '').slice(0, 30) })),
    weather: String(p?.weather || '').slice(0, 12)
  };
}

// ---------- 模板回信 ----------
// 按分句截取引文，不在半句中间断开
const clip = (s, n) => { let out = ''; for (const c of String(s).split(/(?<=[，,；;、])/)) { if (out && (out + c).length > n) break; out += c; } return out.slice(0, n).replace(/[，,；;、\s]+$/, ''); };
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const MOOD_LINE = {
  happy: ['开心的日子要好好收着，以后翻到这一页，嘴角还会跟着翘起来。', '你写字的时候大概是笑着的吧，纸都亮了一点。'],
  calm: ['平静是很难得的东西，它不吵，却能托住很多天。', '这样不急不慢的一天，像一杯温度刚好的茶。'],
  sweet: ['那些小小的好，攒起来就是很大的好。', '能看见这些细小的甜，说明你的心一直是软的。'],
  tired: ['累了就允许自己慢下来，今天能走到这里，已经很不容易。', '辛苦了。今晚不必再做什么，把自己交给被子就好。'],
  blue: ['想哭的时候就哭一会儿，眼泪也是在替你说话。', '难过不需要理由，也不需要马上好起来，我在这里陪你。'],
  '': ['谢谢你把今天写下来，哪怕只是几句，也是在好好对待自己。']
};
const SEASON_TIP = [
  ['明天出门时，找一找路边新冒出来的芽。', '泡一杯花茶，给自己十分钟什么都不做。'],
  ['晚上开窗听一会儿虫鸣再睡。', '切一块冰西瓜，慢慢吃完它。'],
  ['睡前把窗帘留一道缝，让月光进来一点。', '明天路过桂花树，停下来闻一闻。'],
  ['今晚喝一碗热汤，早一点钻进被窝。', '明早看看窗上有没有霜花。']
];
function templateLetter(e, day, recent) {
  const d = parseDay(day), t = termOf(d), mo = moonOf(d), seed = d.getDate() * 7 + d.getMonth() * 31 + e.body.length;
  const first = (e.body.split(/[。！？!?\n]/).map(s => s.trim()).find(Boolean) || '今天的这一页');
  return [
    `读到你写的“${clip(first, 22)}”，我在云后面停了一会儿。`,
    `${t.name}前后，${mo.name}挂在天上。${pick(MOOD_LINE[e.mood] || MOOD_LINE[''], seed)}`,
    ...(recent.length ? [`前几天你写到“${clip(recent[0].text.split(/[。！？!?]/)[0], 18)}”，后来怎么样了？`] : []),
    pick(SEASON_TIP[t.season], seed + 3),
    '月亮'
  ].join('\n\n');
}
const CRISIS_LETTER = { title: '给此刻的你', body: '读到你写下的这些，我很想先轻轻地抱一抱你。\n\n能把这么重的心事写出来，已经很不容易了。你现在的感受是真的，它值得被认真对待，也值得有人陪你一起扛。\n\n如果此刻你有伤害自己的念头，请先停一停，拨打全国统一心理援助热线 12356，那里有人愿意听你说；如果情况紧急，请直接拨打 110 或 120，或者去最近的医院。\n\n也可以现在就给一个信得过的人发一条消息，哪怕只是“我今天不太好”。\n\n这一页我替你收好了。明天的纸还是空白的，我们慢慢来。' };

// ---------- 路由 ----------
async function handle(method, path, q, b) {
  const u = me();
  const need = () => { if (!u) throw err(401, '请先登录'); };
  let m;
  if (path === '/api/config') return { ai: true, aiDaily: 3, icp: '', hotlines: HOTLINES, sms: true, weather: true, demo: true };
  if (path === '/api/auth/register' && method === 'POST') {
    if (!validName(b.username)) throw err(400, '用户名需为 2–20 位中文、字母、数字或下划线');
    if (typeof b.password !== 'string' || b.password.length < 8) throw err(400, '密码长度需在 8–72 位之间');
    if (!b.agree) throw err(400, '请先阅读并同意用户协议与隐私政策');
    if (db.users.some(x => x.username.toLowerCase() === b.username.toLowerCase())) throw err(409, '这个用户名已经有人用了');
    const nu = { id: db.seq++, username: b.username, pass: await sha(b.password), nickname: String(b.nickname || '').trim().slice(0, 20) || b.username, settings: {}, created_at: now(), phone: null };
    db.users.push(nu); db.session = nu.id; save(); return [201, { user: pub(nu) }];
  }
  if (path === '/api/auth/login' && method === 'POST') {
    const x = db.users.find(y => validPhone(b.username) ? y.phone === b.username : y.username.toLowerCase() === String(b.username || '').toLowerCase());
    if (!x || !x.pass || x.pass !== await sha(String(b.password || ''))) throw err(401, '用户名或密码不对');
    db.session = x.id; save(); return { user: pub(x) };
  }
  if (path === '/api/auth/logout') { db.session = null; save(); return { ok: true }; }
  if (path === '/api/auth/sms/send' && method === 'POST') {
    if (!validPhone(b.phone)) throw err(400, '请输入正确的手机号');
    if (b.purpose === 'reset' && !db.users.some(x => x.phone === b.phone)) throw err(404, '这个手机号还没有绑定手帐');
    if (b.purpose === 'bind' && db.users.some(x => x.phone === b.phone)) throw err(409, '这个手机号已经绑定了别的手帐');
    if (b.purpose === 'delete' && me()?.phone !== b.phone) throw err(400, '请使用账号绑定的手机号');
    const k = b.phone + '|' + b.purpose, last = db.codes[k];
    if (last && now() - last.at < 60_000) throw err(429, '验证码已发送，请 60 秒后再试', { cooldown: Math.ceil((60_000 - (now() - last.at)) / 1000) });
    const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    db.codes[k] = { code, at: now() }; save();
    return { ok: true, cooldown: 60, debugCode: code };
  }
  const useCode = (phone, purpose, code) => { const k = phone + '|' + purpose, c = db.codes[k]; if (!c || now() - c.at > 300_000) throw err(400, '验证码已过期，请重新获取'); if (c.code !== String(code || '').trim()) throw err(400, '验证码不对'); delete db.codes[k]; };
  if (path === '/api/auth/sms/login' && method === 'POST') {
    if (!validPhone(b.phone)) throw err(400, '请输入正确的手机号');
    let x = db.users.find(y => y.phone === b.phone);
    if (!x && !b.agree) throw err(400, '请先阅读并同意用户协议与隐私政策');
    useCode(b.phone, 'login', b.code);
    let fresh = false;
    if (!x) { x = { id: db.seq++, username: 'yue' + b.phone.slice(-4) + String(Math.floor(Math.random() * 1e4)).padStart(4, '0'), pass: null, nickname: String(b.nickname || '').trim().slice(0, 20) || '拾光人', settings: {}, created_at: now(), phone: b.phone }; db.users.push(x); fresh = true; }
    db.session = x.id; save(); return [fresh ? 201 : 200, { user: pub(x), fresh }];
  }
  if (path === '/api/auth/reset' && method === 'POST') {
    const x = db.users.find(y => y.phone === b.phone); if (!x) throw err(404, '这个手机号还没有绑定手帐');
    if (typeof b.password !== 'string' || b.password.length < 8) throw err(400, '密码长度需在 8–72 位之间');
    useCode(b.phone, 'reset', b.code); x.pass = await sha(b.password); db.session = x.id; save(); return { user: pub(x) };
  }
  if (path === '/api/demo/seed' && method === 'POST') { const x = seedSample(); return [201, { user: pub(x) }]; }

  if (path === '/api/me' && method === 'GET') {
    need(); const t = now(), mine = db.letters.filter(l => l.uid === u.id);
    return { user: pub(u), counts: { entries: Object.keys(entriesOf(u)).length, unread: mine.filter(l => l.deliverAt <= t && !l.openedAt).length, pending: mine.filter(l => l.deliverAt > t).length }, ai: true };
  }
  if (path === '/api/me' && method === 'PATCH') {
    need();
    if (b.nickname !== undefined) u.nickname = String(b.nickname).trim().slice(0, 20) || u.username;
    const s = b.settings || {};
    if (['auto', 'light', 'dark'].includes(s.theme)) u.settings.theme = s.theme;
    for (const k of ['quiet', 'onboarded', 'memory']) if (typeof s[k] === 'boolean') u.settings[k] = s[k];
    if (typeof s.city === 'string' && (s.city === '' || CITY_MAP[s.city])) u.settings.city = s.city;
    if (typeof s.reminder === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.reminder)) u.settings.reminder = s.reminder;
    save(); return { user: pub(u) };
  }
  if (path === '/api/me' && method === 'DELETE') {
    need();
    if (b.code !== undefined) useCode(u.phone || '', 'delete', b.code);
    else if (!u.pass || u.pass !== await sha(String(b.password || ''))) throw err(401, '密码不对，账号没有删除');
    Object.keys(localStorage).filter(k => k.startsWith(`sgdemo.photo.${u.id}.`)).forEach(k => localStorage.removeItem(k));
    db.users = db.users.filter(x => x !== u); delete db.entries[u.id]; db.letters = db.letters.filter(l => l.uid !== u.id); db.session = null; save(); return { ok: true };
  }
  if (path === '/api/me/phone' && method === 'POST') {
    need(); if (!validPhone(b.phone)) throw err(400, '请输入正确的手机号');
    if (db.users.some(x => x.phone === b.phone)) throw err(409, '这个手机号已经绑定了别的手帐');
    useCode(b.phone, 'bind', b.code); u.phone = b.phone; save(); return { user: pub(u) };
  }
  if (path === '/api/weather') { need(); const c = CITY_MAP[u.settings.city]; return { weather: c ? { city: c.name, ...mockWeather(c), at: now() } : null }; }
  if (path === '/api/export') { need(); return { exportedAt: new Date().toISOString(), site: '拾光手帐（试玩版）', user: pub(u), entries: Object.entries(entriesOf(u)).sort().map(([d, e]) => entryOut(d, e)), letters: db.letters.filter(l => l.uid === u.id).map(l => ({ ...letterOut(l), body: l.body })) }; }

  if (path === '/api/entries' && method === 'GET') {
    need(); const E = entriesOf(u);
    if (/^\d{4}-\d{2}$/.test(q.get('month') || '')) return { entries: Object.keys(E).filter(d => d.startsWith(q.get('month'))).sort().map(d => entryOut(d, E[d])) };
    return { days: Object.keys(E).sort().reverse().map(d => ({ day: d, mood: E[d].mood, sealed: !!E[d].sealedAt })) };
  }
  if ((m = path.match(/^\/api\/entries\/(\d{4}-\d{2}-\d{2})(\/seal|\/reply)?$/))) {
    need(); const day = m[1], E = entriesOf(u);
    if (!isDayKey(day)) throw err(400, '日期不正确');
    if (parseDay(day) > new Date(now() + 864e5)) throw err(400, '还不能写未来的手帐');
    if (!m[2] && method === 'GET') { const r = db.letters.filter(l => l.uid === u.id && l.kind === 'reply' && l.day === day).pop(); return { entry: entryOut(day, E[day]) || null, reply: r ? letterOut(r) : null }; }
    if (!m[2] && method === 'PUT') {
      E[day] = { ...(E[day] || {}), mood: MOODS.has(b.mood) ? b.mood : '', body: String(b.body || '').slice(0, 20000), page: cleanPage(b.page, u), updatedAt: now() };
      save(); return { entry: entryOut(day, E[day]), crisis: crisis(E[day].body) };
    }
    if (!m[2] && method === 'DELETE') { delete E[day]; save(); return { ok: true }; }
    if (m[2] === '/seal') { if (!E[day]) throw err(404, '这一页还是空白的'); E[day].sealedAt ||= now(); save(); return { entry: entryOut(day, E[day]) }; }
    if (m[2] === '/reply') {
      const e = E[day];
      if (!e || e.body.replace(/\s/g, '').length < 10) throw err(400, '多写几句吧，月亮想读到你的这一天');
      const ex = db.letters.filter(l => l.uid === u.id && l.kind === 'reply' && l.day === day).pop();
      if (ex) return { letter: letterOut(ex), existing: true };
      const t = now(), ins = (title, body, meta) => { const l = { id: db.seq++, uid: u.id, kind: 'reply', day, title, body, meta, createdAt: t, deliverAt: t }; db.letters.push(l); save(); return [201, { letter: letterOut(l) }]; };
      if (crisis(e.body)) return ins(CRISIS_LETTER.title, CRISIS_LETTER.body, { crisis: true, hotlines: HOTLINES });
      const k = new Date().toISOString().slice(0, 10) + '|' + u.id; if ((db.usage[k] || 0) >= 3) throw err(429, '今天的回信已经寄出 3 封了，明天再来吧');
      db.usage[k] = (db.usage[k] || 0) + 1;
      const from = dayKey(new Date(parseDay(day) - 30 * 864e5));
      const recent = u.settings.memory ? Object.keys(E).filter(d => d < day && d >= from).sort().reverse().slice(0, 4).map(d => ({ day: d, text: E[d].body.replace(/\s+/g, ' ').slice(0, 120) })).filter(r => r.text) : [];
      return ins(`${SEASON_CN[termOf(parseDay(day)).season]}日回信`, templateLetter(e, day, recent), { ai: true, demo: true });
    }
  }
  if ((m = path.match(/^\/api\/year\/(\d{4})$/))) {
    need(); const E = entriesOf(u), y = m[1];
    const days = Object.keys(E).filter(d => d.startsWith(y)).sort().map(d => { const e = E[d], text = e.body.replace(/\s+/g, ' ').trim();
      return { day: d, mood: e.mood, chars: [...e.body.replace(/\s/g, '')].length, sealed: !!e.sealedAt, stickers: (e.page?.stickers || []).length, photos: (e.page?.photos || []).length, weather: e.page?.weather || '', reply: db.letters.some(l => l.uid === u.id && l.kind === 'reply' && l.day === d), excerpt: [...text].slice(0, 48).join('') }; });
    return { year: Number(y), years: [...new Set(Object.keys(E).map(d => d.slice(0, 4)))].sort(), days, letters: db.letters.filter(l => l.uid === u.id && l.kind === 'reply' && (l.day || '').startsWith(y)).length };
  }
  if (path === '/api/letters' && method === 'GET') { need(); const t = now(); return { letters: db.letters.filter(l => l.uid === u.id).sort((a, b) => b.deliverAt - a.deliverAt || b.id - a.id).map(l => letterOut(l, t)) }; }
  if (path === '/api/letters' && method === 'POST') {
    need(); const body = String(b.body || '').trim().slice(0, 5000), at = Number(b.deliverAt);
    if (body.length < 2) throw err(400, '信里写点什么吧');
    if (!Number.isFinite(at) || at < now() + 3600_000) throw err(400, '寄送时间需要在一小时之后、十年之内');
    const l = { id: db.seq++, uid: u.id, kind: 'future', title: String(b.title || '').trim().slice(0, 30) || '给未来的自己', body, meta: {}, createdAt: now(), deliverAt: at };
    db.letters.push(l); save(); return [201, { letter: letterOut(l) }];
  }
  if ((m = path.match(/^\/api\/letters\/(\d+)(\/open)?$/))) {
    need(); const l = db.letters.find(x => x.id === Number(m[1]) && x.uid === u.id); if (!l) throw err(404, '没有找到这封信');
    if (m[2]) { if (l.deliverAt > now()) throw err(403, '这封信还在路上'); l.openedAt ||= now(); save(); return { letter: letterOut(l) }; }
    if (method === 'DELETE') { db.letters = db.letters.filter(x => x !== l); save(); return { ok: true }; }
  }
  if (path === '/api/uploads' && method === 'POST') {
    need(); if (!(b instanceof Blob)) throw err(415, '只支持 JPG、PNG、WebP 图片');
    const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    try { localStorage.setItem(`sgdemo.photo.${u.id}.${id}`, dataUrl); } catch { throw err(507, '这台设备的浏览器存储满了，试玩版最多存几张照片'); }
    return [201, { id, url: dataUrl }];
  }
  throw err(404, '没有这个接口');
}

// 照片：直接用本机保存的图片数据
SITE.photo = id => { const u = me(); return (u && localStorage.getItem(`sgdemo.photo.${u.id}.${id}`)) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; };

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const href = typeof input === 'string' ? input : input.url;
  if (!href.startsWith('/api/')) return realFetch(input, init);
  const u = new URL(href, 'http://demo'), method = (init.method || 'GET').toUpperCase();
  let body = init.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  try {
    const out = await handle(method, u.pathname, u.searchParams, body || {});
    const [status, data] = Array.isArray(out) ? out : [200, out];
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    if (!e.status) console.error(e);
    return new Response(JSON.stringify(e.body || { error: '出了点小问题，请刷新再试' }), { status: e.status || 500, headers: { 'content-type': 'application/json' } });
  }
};

// ---------- 示例手帐 ----------
const SAMPLE = {
  common: ['下班路上买了一袋糖炒栗子，边走边剥，手指都是甜的。', '给妈妈打了个电话，她说家里的猫又胖了。', '读完了一本小说的最后一章，坐在窗边发了很久的呆。',
    '中午在公司楼下晒了十分钟太阳，整个下午都很有精神。', '今天什么都没做成，但好好吃了三顿饭，也算数。', '和老朋友视频，聊到小时候一起偷摘邻居家的枇杷。',
    '加班到九点，地铁上有个小朋友冲我笑了一下。', '整理了书桌，找到一张去年写给自己的便签：慢慢来。', '学会了做番茄炒蛋，第一次没有放太多盐。',
    '下雨天，在咖啡店写了一下午东西，雨声刚刚好。', '去花市买了一盆薄荷，希望这次能养活。', '早上醒得早，看着天一点点亮起来。'],
  0: ['小区里的玉兰开了，白得像一盏一盏灯。', '换下了厚外套，风吹在脸上是软的。', '路边的樱花落了一地，踩上去不忍心。', '春雨下了一整天，阳台的绿萝冒了新叶。'],
  1: ['傍晚去河边散步，有萤火虫在草丛里一闪一闪。', '吃了今年第一块冰西瓜，咬下去是夏天的声音。', '蝉声很吵，但听着很安心。', '午后雷阵雨，雨停后天边挂了一道彩虹。'],
  2: ['巷口的桂花全开了，香气一直跟到家门口。', '银杏叶黄了，捡了一片夹进本子里。', '晚上的风凉了，翻出了那件旧毛衣。', '中秋和家人吃月饼，月亮又大又圆。'],
  3: ['下了今年第一场雪，楼下有人堆了一个歪歪的雪人。', '冬至吃了汤圆，芝麻馅的，烫到舌头。', '窗上结了霜花，用手指画了一个笑脸。', '围着暖气看了一部老电影，很好哭。']
};
const STK = { 0: ['sakura', 'plum', 'lotus', 'tea'], 1: ['lotus', 'tea', 'fan', 'star'], 2: ['maple', 'ginkgo', 'osmanthus', 'moon'], 3: ['plum', 'moon', 'lantern', 'seal-an'] };
function seedSample() {
  const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
  const u = { id: db.seq++, username: 'shili' + Math.floor(Math.random() * 1e5), pass: null, nickname: '小满', settings: { onboarded: true, memory: true, city: 'hangzhou' }, created_at: now() - 200 * 864e5, phone: null };
  db.users.push(u); const E = entriesOf(u);
  const today = new Date(), y = today.getFullYear(), moods = ['happy', 'calm', 'sweet', 'calm', 'tired', 'happy', 'blue', 'sweet'];
  for (let d = new Date(y, 0, 1); d < new Date(today.getFullYear(), today.getMonth(), today.getDate()); d.setDate(d.getDate() + 1)) {
    const i = Math.round((d - new Date(y, 0, 1)) / 864e5), r = rnd(i, 1); if (r < .3 && today - d > 8 * 864e5) continue;
    const season = termOf(d).season, pool = [...SAMPLE[season], ...SAMPLE.common];
    const n = 1 + Math.floor(rnd(i, 2) * 3), body = Array.from({ length: n }, (_, k) => pool[Math.floor(rnd(i, 3 + k) * pool.length)]).filter((s, k, a) => a.indexOf(s) === k).join('\n');
    const stickers = Array.from({ length: Math.floor(rnd(i, 7) * 4) }, (_, k) => ({ id: 'x' + k, k: STK[season][Math.floor(rnd(i, 8 + k) * 4)], x: .55 + rnd(i, 12 + k) * .35, y: .32 + k * .12, r: (rnd(i, 16 + k) - .5) * 30, s: .8 + rnd(i, 20 + k) * .5, t: '' }));
    E[dayKey(d)] = { mood: moods[Math.floor(rnd(i, 5) * moods.length)], body, page: { stickers, photos: [], weather: ['晴', '云', '雨', '风', '晴', '雾'][Math.floor(rnd(i, 6) * 6)] }, updatedAt: d.getTime() + 22 * 3600e3, sealedAt: rnd(i, 9) < .35 ? d.getTime() + 23 * 3600e3 : null };
  }
  const ly = new Date(y - 1, today.getMonth(), today.getDate());
  E[dayKey(ly)] = { mood: 'sweet', body: '一年前的今天，第一次一个人去看海。风很大，买了一个很甜的烤红薯，坐在堤坝上吃完了。', page: { stickers: [{ id: 'l1', k: 'cloud', x: .7, y: .3, r: 6, s: 1, t: '' }], photos: [], weather: '风' }, updatedAt: ly.getTime(), sealedAt: ly.getTime() };
  const days = Object.keys(E).filter(d => d.startsWith(String(y))).sort();
  days.filter((_, k) => k % 23 === 5).slice(0, 6).forEach((d, k) => {
    const t = parseDay(d).getTime() + 23.5 * 3600e3;
    db.letters.push({ id: db.seq++, uid: u.id, kind: 'reply', day: d, title: `${SEASON_CN[termOf(parseDay(d)).season]}日回信`, body: templateLetter(E[d], d, []), meta: { ai: true, demo: true }, createdAt: t, deliverAt: t, openedAt: k < 4 ? t + 600e3 : null });
  });
  const far = new Date(today); far.setFullYear(far.getFullYear() + 1);
  db.letters.push({ id: db.seq++, uid: u.id, kind: 'future', title: '给一年后的我', body: '希望你还记得今年秋天巷口的桂花。', meta: {}, createdAt: now() - 40 * 864e5, deliverAt: far.getTime() });
  const back = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2, 9);
  db.letters.push({ id: db.seq++, uid: u.id, kind: 'future', title: '春天写给秋天', body: '春天的我在想：到了秋天，你会不会已经学会了慢一点？如果还没有，也没关系。\n\n记得去看看银杏。', meta: {}, createdAt: new Date(y, 3, 2).getTime(), deliverAt: back.getTime() });
  db.session = u.id; save();
  return u;
}

// 模拟天气：与 server/weather.js 的 mock 相同，按城市与时间稳定变化
function mockWeather(city, t = new Date()) {
  const seed = [...city.k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + Math.floor(t / (3 * 3600_000));
  const x = Math.abs((Math.sin(seed) * 43758.5453) % 1), m = t.getMonth();
  const winter = m === 11 || m <= 1, summer = m >= 5 && m <= 7;
  const kind = x < .32 ? 'sun' : x < .58 ? 'cloud' : x < .78 ? (winter && city.lat > 30 ? 'snow' : 'rain') : x < .86 ? (summer ? 'thunder' : 'fog') : x < .93 ? 'wind' : 'fog';
  const text = { sun: '晴', cloud: '多云', rain: '小雨', snow: '小雪', thunder: '雷阵雨', fog: '薄雾', wind: '有风' }[kind] + '（模拟）';
  const h = t.getHours(), base = [4, 6, 11, 17, 22, 26, 29, 28, 24, 18, 11, 6][m] - (city.lat - 30) * .6;
  return { kind, text, temp: Math.round(base + Math.sin((h - 9) / 24 * Math.PI * 2) * 4), isDay: h >= 6 && h < 18 };
}
