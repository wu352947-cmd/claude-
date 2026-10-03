// 拾光手帐 · 服务端（零依赖：node:http + node:sqlite）
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openDb, now, parseJson } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, destroySession, validCredentials, COOKIE } from './auth.js';
import { aiConfig, writeReply } from './ai.js';
import { crisisSignal, CRISIS_LETTER, HOTLINES } from './safety.js';
import { smsConfig, sendCode, validPhone, maskPhone, newCode, codeHash, sameHash } from './sms.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { termOf, moonOf, parseDay, isDayKey, SEASON_CN } from '../public/app/js/calendar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

export function createApp(opts = {}) {
  const env = { ...process.env, ...opts.env };
  const DATA = env.DATA_DIR || join(ROOT, 'data');
  const UPLOADS = join(DATA, 'uploads');
  const db = opts.db || openDb(env.DB_FILE || join(DATA, 'shiguang.db'));
  const ai = aiConfig(env);
  const sms = smsConfig(env);
  const SECRET = env.APP_SECRET || loadSecret(DATA);
  const AI_DAILY = Number(env.AI_DAILY_LIMIT || 3);
  const ICP = env.SITE_ICP || '';
  const COOKIE_SECURE = (env.COOKIE_SECURE || 'auto').toLowerCase();
  const MOODS = new Set(['', 'happy', 'calm', 'sweet', 'tired', 'blue']);

  // ---------- helpers ----------
  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
    res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
    res.end(isJson ? JSON.stringify(body) : body);
  };
  const fail = (res, status, message, extra = {}) => send(res, status, { error: message, ...extra });
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const isHttps = req => req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const setSession = (req, res, token, maxAge) => {
    const secure = COOKIE_SECURE === 'true' || (COOKIE_SECURE === 'auto' && isHttps(req));
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  };
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('内容太大了'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  const readJson = async (req, limit = 256 * 1024) => {
    const buf = await readBody(req, limit);
    if (!buf.length) return {};
    try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('请求格式不正确'), { status: 400 }); }
  };
  const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

  // 简单的内存限流（单实例部署足够；多实例请换成 Redis）
  const buckets = new Map();
  const limited = (key, max, windowMs) => {
    const t = now(); const b = buckets.get(key) || { n: 0, reset: t + windowMs };
    if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
    b.n++; buckets.set(key, b);
    return b.n > max;
  };
  setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 600_000).unref();

  const publicUser = u => ({ id: u.id, username: u.username, nickname: u.nickname || u.username, settings: parseJson(u.settings, {}), createdAt: u.created_at,
    phone: maskPhone(u.phone), hasPassword: String(u.pass_hash).startsWith('scrypt$') });

  // ---------- 短信验证码 ----------
  const PURPOSES = new Set(['login', 'reset', 'bind', 'delete']);
  function checkCode(phone, purpose, code) {
    const row = db.prepare('SELECT * FROM sms_codes WHERE phone = ? AND purpose = ?').get(phone, purpose);
    if (!row || row.expires_at < now()) return '验证码已过期，请重新获取';
    if (row.attempts >= 5) return '错误次数太多，请重新获取验证码';
    if (!sameHash(row.code_hash, codeHash(SECRET, phone, purpose, String(code || '').trim()))) {
      db.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE phone = ? AND purpose = ?').run(phone, purpose);
      return '验证码不对';
    }
    db.prepare('DELETE FROM sms_codes WHERE phone = ? AND purpose = ?').run(phone, purpose);
    return null;
  }
  const userByPhone = phone => db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

  // ---------- page sanitizing ----------
  const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const str = (v, max) => String(v ?? '').slice(0, max);
  function cleanPage(page, userId) {
    const p = page && typeof page === 'object' ? page : {};
    const stickers = (Array.isArray(p.stickers) ? p.stickers : []).slice(0, 80).map(s => ({
      id: str(s.id, 16), k: str(s.k, 24), x: num(s.x, -0.1, 1.1, 0.5), y: num(s.y, -0.1, 1.1, 0.5),
      r: num(s.r, -180, 180), s: num(s.s, 0.4, 2.5, 1), t: str(s.t, 2)
    })).filter(s => /^[a-z0-9-]+$/.test(s.k));
    const owned = new Set(db.prepare('SELECT id FROM uploads WHERE user_id = ?').all(userId).map(r => r.id));
    const photos = (Array.isArray(p.photos) ? p.photos : []).slice(0, 4).filter(ph => owned.has(ph.id)).map(ph => ({
      id: ph.id, x: num(ph.x, -0.1, 1.1, 0.5), y: num(ph.y, -0.1, 1.1, 0.5), r: num(ph.r, -45, 45), cap: str(ph.cap, 30)
    }));
    const weather = str(p.weather, 12);
    return { stickers, photos, weather };
  }
  const entryOut = r => r && ({ day: r.day, mood: r.mood, body: r.body, page: parseJson(r.page, {}), sealedAt: r.sealed_at, updatedAt: r.updated_at });
  const letterOut = (r, t = now()) => {
    const due = r.deliver_at <= t;
    return { id: r.id, kind: r.kind, day: r.day, title: r.title, createdAt: r.created_at, deliverAt: r.deliver_at, openedAt: r.opened_at,
      due, body: due ? r.body : null, meta: parseJson(r.meta, {}) };
  };

  // ---------- API ----------
  async function api(req, res, url, user) {
    const m = req.method, p = url.pathname;
    const need = () => { if (!user) throw Object.assign(new Error('请先登录'), { status: 401 }); };

    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/config' && m === 'GET') return send(res, 200, { ai: ai.enabled, aiDaily: AI_DAILY, icp: ICP, hotlines: HOTLINES, sms: sms.enabled });

    if (p === '/api/auth/sms/send' && m === 'POST') {
      if (!sms.enabled) return fail(res, 503, '短信服务尚未开启');
      const { phone, purpose } = await readJson(req);
      if (!validPhone(phone)) return fail(res, 400, '请输入正确的手机号');
      if (!PURPOSES.has(purpose)) return fail(res, 400, '请求不正确');
      if ((purpose === 'bind' || purpose === 'delete') && !user) return fail(res, 401, '请先登录');
      if (purpose === 'reset' && !userByPhone(phone)) return fail(res, 404, '这个手机号还没有绑定手帐');
      if (purpose === 'bind' && userByPhone(phone)) return fail(res, 409, '这个手机号已经绑定了别的手帐');
      if (purpose === 'delete' && user.phone !== phone) return fail(res, 400, '请使用账号绑定的手机号');
      if (limited('smsip:' + clientIp(req), 20, 3600_000)) return fail(res, 429, '获取验证码太频繁了，请稍后再试');
      const last = db.prepare('SELECT created_at FROM sms_codes WHERE phone = ? AND purpose = ?').get(phone, purpose);
      if (last && now() - last.created_at < 60_000) return fail(res, 429, '验证码已发送，请 60 秒后再试', { cooldown: Math.ceil((60_000 - (now() - last.created_at)) / 1000) });
      if (limited('smsday:' + phone, 10, 864e5)) return fail(res, 429, '今天获取验证码的次数用完了');
      const code = newCode();
      try { await sendCode(sms, phone, code); } catch (err) { console.error('[sms]', err.message); return fail(res, 502, '短信没能发出，请稍后再试'); }
      db.prepare(`INSERT INTO sms_codes (phone, purpose, code_hash, attempts, created_at, expires_at) VALUES (?,?,?,0,?,?)
                  ON CONFLICT(phone, purpose) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, created_at = excluded.created_at, expires_at = excluded.expires_at`)
        .run(phone, purpose, codeHash(SECRET, phone, purpose, code), now(), now() + 300_000);
      return send(res, 200, { ok: true, cooldown: 60, ...(sms.debug ? { debugCode: code } : {}) });
    }
    if (p === '/api/auth/sms/login' && m === 'POST') {
      const { phone, code, agree, nickname } = await readJson(req);
      if (!validPhone(phone)) return fail(res, 400, '请输入正确的手机号');
      let u = userByPhone(phone);
      if (!u && !agree) return fail(res, 400, '请先阅读并同意用户协议与隐私政策');
      const bad = checkCode(phone, 'login', code); if (bad) return fail(res, 400, bad);
      let fresh = false;
      if (!u) {
        let username; do { username = 'yue' + phone.slice(-4) + String(Math.floor(Math.random() * 1e4)).padStart(4, '0'); } while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username));
        const r = db.prepare('INSERT INTO users (username, pass_hash, nickname, phone, created_at) VALUES (?,?,?,?,?)')
          .run(username, '!nopass', str(nickname, 20).trim() || '拾光人', phone, now());
        u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid); fresh = true;
      }
      const s = createSession(db, u.id);
      setSession(req, res, s.token, s.maxAge);
      return send(res, fresh ? 201 : 200, { user: publicUser(u), fresh });
    }
    if (p === '/api/auth/reset' && m === 'POST') {
      const { phone, code, password } = await readJson(req);
      if (!validPhone(phone)) return fail(res, 400, '请输入正确的手机号');
      if (typeof password !== 'string' || password.length < 8 || password.length > 72) return fail(res, 400, '密码长度需在 8–72 位之间');
      const u = userByPhone(phone); if (!u) return fail(res, 404, '这个手机号还没有绑定手帐');
      const bad = checkCode(phone, 'reset', code); if (bad) return fail(res, 400, bad);
      db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(password), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      const s = createSession(db, u.id);
      setSession(req, res, s.token, s.maxAge);
      return send(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
    }
    if (p === '/api/me/phone' && m === 'POST') {
      if (!user) return fail(res, 401, '请先登录');
      const { phone, code } = await readJson(req);
      if (!validPhone(phone)) return fail(res, 400, '请输入正确的手机号');
      if (userByPhone(phone)) return fail(res, 409, '这个手机号已经绑定了别的手帐');
      const bad = checkCode(phone, 'bind', code); if (bad) return fail(res, 400, bad);
      db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, user.id);
      return send(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
    }

    if (p === '/api/auth/register' && m === 'POST') {
      if (limited('reg:' + clientIp(req), Number(env.REGISTER_LIMIT_PER_HOUR || 10), 3600_000)) return fail(res, 429, '注册太频繁了，请稍后再试');
      const { username, password, nickname, agree } = await readJson(req);
      const bad = validCredentials(username, password); if (bad) return fail(res, 400, bad);
      if (!agree) return fail(res, 400, '请先阅读并同意用户协议与隐私政策');
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return fail(res, 409, '这个用户名已经有人用了');
      const r = db.prepare('INSERT INTO users (username, pass_hash, nickname, created_at) VALUES (?,?,?,?)')
        .run(username, hashPassword(password), str(nickname, 20).trim() || username, now());
      const s = createSession(db, Number(r.lastInsertRowid));
      setSession(req, res, s.token, s.maxAge);
      return send(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) });
    }
    if (p === '/api/auth/login' && m === 'POST') {
      const { username, password } = await readJson(req);
      if (limited('login:' + clientIp(req) + ':' + String(username).toLowerCase(), 8, 900_000)) return fail(res, 429, '尝试次数太多，请 15 分钟后再试');
      const u = validPhone(username) ? userByPhone(username) : db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
      if (!u || !verifyPassword(String(password || ''), u.pass_hash)) return fail(res, 401, '用户名或密码不对');
      const s = createSession(db, u.id);
      setSession(req, res, s.token, s.maxAge);
      return send(res, 200, { user: publicUser(u) });
    }
    if (p === '/api/auth/logout' && m === 'POST') {
      destroySession(db, cookies(req)[COOKIE]);
      setSession(req, res, '', 0);
      return send(res, 200, { ok: true });
    }

    if (p === '/api/me' && m === 'GET') {
      need();
      const t = now();
      const counts = {
        entries: db.prepare('SELECT COUNT(*) n FROM entries WHERE user_id = ?').get(user.id).n,
        unread: db.prepare('SELECT COUNT(*) n FROM letters WHERE user_id = ? AND deliver_at <= ? AND opened_at IS NULL').get(user.id, t).n,
        pending: db.prepare('SELECT COUNT(*) n FROM letters WHERE user_id = ? AND deliver_at > ?').get(user.id, t).n
      };
      return send(res, 200, { user: publicUser(user), counts, ai: ai.enabled });
    }
    if (p === '/api/me' && m === 'PATCH') {
      need();
      const b = await readJson(req);
      const settings = { ...parseJson(user.settings, {}) };
      if (b.settings && typeof b.settings === 'object') {
        if (['auto', 'light', 'dark'].includes(b.settings.theme)) settings.theme = b.settings.theme;
        if (typeof b.settings.quiet === 'boolean') settings.quiet = b.settings.quiet;
        if (typeof b.settings.onboarded === 'boolean') settings.onboarded = b.settings.onboarded;
        if (typeof b.settings.memory === 'boolean') settings.memory = b.settings.memory;
        if (typeof b.settings.reminder === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.settings.reminder)) settings.reminder = b.settings.reminder;
      }
      const nickname = b.nickname !== undefined ? (str(b.nickname, 20).trim() || user.username) : user.nickname;
      db.prepare('UPDATE users SET nickname = ?, settings = ? WHERE id = ?').run(nickname, JSON.stringify(settings), user.id);
      return send(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
    }
    if (p === '/api/me' && m === 'DELETE') {
      need();
      const { password, code } = await readJson(req);
      if (code !== undefined) { const bad = user.phone ? checkCode(user.phone, 'delete', code) : '账号没有绑定手机号'; if (bad) return fail(res, 400, bad); }
      else if (!verifyPassword(String(password || ''), user.pass_hash)) return fail(res, 401, '密码不对，账号没有删除');
      const files = db.prepare('SELECT id, mime FROM uploads WHERE user_id = ?').all(user.id);
      for (const f of files) await unlink(join(UPLOADS, f.id + extOf(f.mime))).catch(() => {});
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      setSession(req, res, '', 0);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/export' && m === 'GET') {
      need();
      const data = {
        exportedAt: new Date().toISOString(), site: '拾光手帐',
        user: publicUser(user),
        entries: db.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY day').all(user.id).map(entryOut),
        letters: db.prepare('SELECT * FROM letters WHERE user_id = ? ORDER BY created_at').all(user.id).map(r => ({ ...letterOut(r), body: r.body })),
        photos: db.prepare('SELECT id, mime, size, created_at FROM uploads WHERE user_id = ?').all(user.id)
      };
      return send(res, 200, data, { 'Content-Disposition': `attachment; filename="shiguang-${new Date().toISOString().slice(0, 10)}.json"` });
    }

    // entries
    if (p === '/api/entries' && m === 'GET') {
      need();
      const month = url.searchParams.get('month');
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const rows = db.prepare('SELECT * FROM entries WHERE user_id = ? AND day LIKE ? ORDER BY day').all(user.id, month + '-%');
        return send(res, 200, { entries: rows.map(entryOut) });
      }
      const rows = db.prepare('SELECT day, mood, sealed_at FROM entries WHERE user_id = ? ORDER BY day DESC LIMIT 400').all(user.id);
      return send(res, 200, { days: rows.map(r => ({ day: r.day, mood: r.mood, sealed: !!r.sealed_at })) });
    }
    let mm;
    if ((mm = p.match(/^\/api\/entries\/(\d{4}-\d{2}-\d{2})(\/seal|\/reply)?$/))) {
      need();
      const day = mm[1];
      if (!isDayKey(day)) return fail(res, 400, '日期不正确');
      if (parseDay(day) > new Date(now() + 864e5)) return fail(res, 400, '还不能写未来的手帐');
      const row = () => db.prepare('SELECT * FROM entries WHERE user_id = ? AND day = ?').get(user.id, day);
      if (!mm[2] && m === 'GET') {
        const reply = db.prepare("SELECT * FROM letters WHERE user_id = ? AND kind = 'reply' AND day = ? ORDER BY id DESC LIMIT 1").get(user.id, day);
        return send(res, 200, { entry: entryOut(row()) || null, reply: reply ? letterOut(reply) : null });
      }
      if (!mm[2] && m === 'PUT') {
        const b = await readJson(req);
        const mood = MOODS.has(b.mood) ? b.mood : '';
        const body = str(b.body, 20000);
        const page = JSON.stringify(cleanPage(b.page, user.id));
        db.prepare(`INSERT INTO entries (user_id, day, mood, body, page, updated_at) VALUES (?,?,?,?,?,?)
                    ON CONFLICT(user_id, day) DO UPDATE SET mood = excluded.mood, body = excluded.body, page = excluded.page, updated_at = excluded.updated_at`)
          .run(user.id, day, mood, body, page, now());
        return send(res, 200, { entry: entryOut(row()), crisis: crisisSignal(body) });
      }
      if (!mm[2] && m === 'DELETE') {
        db.prepare('DELETE FROM entries WHERE user_id = ? AND day = ?').run(user.id, day);
        return send(res, 200, { ok: true });
      }
      if (mm[2] === '/seal' && m === 'POST') {
        if (!row()) return fail(res, 404, '这一页还是空白的');
        db.prepare('UPDATE entries SET sealed_at = COALESCE(sealed_at, ?) WHERE user_id = ? AND day = ?').run(now(), user.id, day);
        return send(res, 200, { entry: entryOut(row()) });
      }
      if (mm[2] === '/reply' && m === 'POST') {
        const e = row();
        if (!e || e.body.replace(/\s/g, '').length < 10) return fail(res, 400, '多写几句吧，月亮想读到你的这一天');
        const existing = db.prepare("SELECT * FROM letters WHERE user_id = ? AND kind = 'reply' AND day = ? ORDER BY id DESC LIMIT 1").get(user.id, day);
        if (existing) return send(res, 200, { letter: letterOut(existing), existing: true });
        const t = now();
        const insert = (title, body, meta) => {
          const r = db.prepare('INSERT INTO letters (user_id, kind, day, title, body, meta, created_at, deliver_at) VALUES (?,?,?,?,?,?,?,?)')
            .run(user.id, 'reply', day, title, body, JSON.stringify(meta), t, t);
          return letterOut(db.prepare('SELECT * FROM letters WHERE id = ?').get(r.lastInsertRowid));
        };
        if (crisisSignal(e.body)) return send(res, 201, { letter: insert(CRISIS_LETTER.title, CRISIS_LETTER.body, { crisis: true, hotlines: HOTLINES }) });
        if (!ai.enabled) return fail(res, 503, '回信服务尚未开启', { code: 'ai_disabled' });
        const today = new Date(t).toISOString().slice(0, 10);
        const used = db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').get(user.id, today)?.count || 0;
        if (used >= AI_DAILY) return fail(res, 429, `今天的回信已经寄出 ${AI_DAILY} 封了，明天再来吧`);
        if (limited('ai:' + user.id, 2, 60_000)) return fail(res, 429, '月亮正在写上一封信，请稍等一会儿');
        const d = parseDay(day), term = termOf(d), moon = moonOf(d);
        let text;
        try {
          text = await writeReply(ai, { nickname: user.nickname, day: `${d.getMonth() + 1}月${d.getDate()}日`, term: term.name,
            moon: `月相是${moon.name}`, mood: { happy: '开心', calm: '平静', sweet: '小确幸', tired: '有点累', blue: '想哭' }[e.mood] || '', body: e.body });
        } catch (err) {
          console.error('[ai]', err.message);
          return fail(res, 502, '月亮暂时没能写好回信，过一会儿再试试');
        }
        db.prepare('INSERT INTO ai_usage (user_id, day, count) VALUES (?,?,1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1').run(user.id, today);
        const flagged = crisisSignal(text);
        return send(res, 201, { letter: insert(`${SEASON_CN[term.season]}日回信`, text, { ai: true, provider: ai.provider, model: ai.model || '', flagged }) });
      }
    }

    // 年度画卷：一年里每一页的摘要
    if ((mm = p.match(/^\/api\/year\/(\d{4})$/)) && m === 'GET') {
      need();
      const y = mm[1];
      const rows = db.prepare('SELECT day, mood, body, page, sealed_at FROM entries WHERE user_id = ? AND day LIKE ? ORDER BY day').all(user.id, y + '-%');
      const replies = new Set(db.prepare("SELECT day FROM letters WHERE user_id = ? AND kind = 'reply' AND day LIKE ?").all(user.id, y + '-%').map(r => r.day));
      const years = db.prepare("SELECT DISTINCT substr(day, 1, 4) y FROM entries WHERE user_id = ? ORDER BY y").all(user.id).map(r => r.y);
      const days = rows.map(r => {
        const pg = parseJson(r.page, {}), text = r.body.replace(/\s+/g, ' ').trim();
        return { day: r.day, mood: r.mood, chars: [...r.body.replace(/\s/g, '')].length, sealed: !!r.sealed_at, stickers: (pg.stickers || []).length,
          photos: (pg.photos || []).length, weather: pg.weather || '', reply: replies.has(r.day), excerpt: [...text].slice(0, 48).join('') };
      });
      return send(res, 200, { year: Number(y), years, days, letters: db.prepare("SELECT COUNT(*) n FROM letters WHERE user_id = ? AND kind = 'reply' AND day LIKE ?").get(user.id, y + '-%').n });
    }

    // letters
    if (p === '/api/letters' && m === 'GET') {
      need();
      const t = now();
      const rows = db.prepare('SELECT * FROM letters WHERE user_id = ? ORDER BY deliver_at DESC, id DESC').all(user.id);
      return send(res, 200, { letters: rows.map(r => letterOut(r, t)) });
    }
    if (p === '/api/letters' && m === 'POST') {
      need();
      const b = await readJson(req);
      const body = str(b.body, 5000).trim(), title = str(b.title, 30).trim();
      const deliverAt = Number(b.deliverAt);
      if (body.length < 2) return fail(res, 400, '信里写点什么吧');
      if (!Number.isFinite(deliverAt) || deliverAt < now() + 3600_000 || deliverAt > now() + 10 * 365 * 864e5)
        return fail(res, 400, '寄送时间需要在一小时之后、十年之内');
      const count = db.prepare("SELECT COUNT(*) n FROM letters WHERE user_id = ? AND kind = 'future' AND deliver_at > ?").get(user.id, now()).n;
      if (count >= 50) return fail(res, 400, '在路上的信已经很多了，等它们先寄到吧');
      const r = db.prepare('INSERT INTO letters (user_id, kind, title, body, meta, created_at, deliver_at) VALUES (?,?,?,?,?,?,?)')
        .run(user.id, 'future', title || '给未来的自己', body, '{}', now(), deliverAt);
      return send(res, 201, { letter: letterOut(db.prepare('SELECT * FROM letters WHERE id = ?').get(r.lastInsertRowid)) });
    }
    if ((mm = p.match(/^\/api\/letters\/(\d+)(\/open)?$/))) {
      need();
      const r = db.prepare('SELECT * FROM letters WHERE id = ? AND user_id = ?').get(Number(mm[1]), user.id);
      if (!r) return fail(res, 404, '没有找到这封信');
      if (mm[2] && m === 'POST') {
        if (r.deliver_at > now()) return fail(res, 403, '这封信还在路上');
        db.prepare('UPDATE letters SET opened_at = COALESCE(opened_at, ?) WHERE id = ?').run(now(), r.id);
        return send(res, 200, { letter: letterOut(db.prepare('SELECT * FROM letters WHERE id = ?').get(r.id)) });
      }
      if (!mm[2] && m === 'DELETE') {
        db.prepare('DELETE FROM letters WHERE id = ?').run(r.id);
        return send(res, 200, { ok: true });
      }
    }

    // uploads（照片仅本人可见）
    if (p === '/api/uploads' && m === 'POST') {
      need();
      const mime = String(req.headers['content-type'] || '').split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return fail(res, 415, '只支持 JPG、PNG、WebP 图片');
      if (db.prepare('SELECT COUNT(*) n FROM uploads WHERE user_id = ?').get(user.id).n >= 500) return fail(res, 400, '照片空间满了');
      const buf = await readBody(req, 4 * 1024 * 1024);
      if (!magicOk(buf, mime)) return fail(res, 415, '文件内容不是有效的图片');
      const id = randomBytes(12).toString('base64url');
      await mkdir(UPLOADS, { recursive: true });
      await writeFile(join(UPLOADS, id + extOf(mime)), buf);
      db.prepare('INSERT INTO uploads (id, user_id, mime, size, created_at) VALUES (?,?,?,?,?)').run(id, user.id, mime, buf.length, now());
      return send(res, 201, { id, url: `/api/uploads/${id}` });
    }
    if ((mm = p.match(/^\/api\/uploads\/([A-Za-z0-9_-]{16})$/)) && m === 'GET') {
      need();
      const f = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(mm[1], user.id);
      if (!f) return fail(res, 404, '没有找到这张照片');
      res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': f.size, 'Cache-Control': 'private, max-age=31536000, immutable' });
      return createReadStream(join(UPLOADS, f.id + extOf(f.mime))).pipe(res);
    }

    return fail(res, 404, '没有这个接口');
  }

  // ---------- static ----------
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
  async function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return fail(res, 403, '禁止访问');
    let st; try { st = await stat(file); } catch { st = null; }
    if (st?.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); return res.end(); }
    if (!st) {
      const nf = await readFile(join(PUBLIC, '404.html'), 'utf8').catch(() => '页面不存在');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(nf);
    }
    const ext = extname(file);
    const type = TYPES[ext] || 'application/octet-stream';
    const long = /\/(fonts|assets)\//.test(file);
    if (ext === '.html') {
      const html = (await readFile(file, 'utf8')).replaceAll('%%ICP%%', ICP ? `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${escapeHtml(ICP)}</a>` : '');
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': long ? 'public, max-age=2592000' : 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }

  const SECURITY = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };

  return createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-sg'] !== '1') return fail(res, 403, '请求来源无效');
        const user = userFromToken(db, cookies(req)[COOKIE]);
        return await api(req, res, url, user);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405, '不支持的请求');
      return await serveStatic(req, res, url);
    } catch (err) {
      if (!res.headersSent) fail(res, err.status || 500, err.status ? err.message : '服务器开了个小差，请稍后再试');
      if (!err.status) console.error(err);
    }
  });
}

// 验证码哈希用的服务端密钥：优先 APP_SECRET，否则首次启动时生成并保存在数据目录
function loadSecret(dir) {
  const f = join(dir, 'secret.key');
  try { return readFileSync(f, 'utf8').trim(); } catch {}
  mkdirSync(dir, { recursive: true });
  const k = randomBytes(32).toString('hex'); writeFileSync(f, k, { mode: 0o600 }); return k;
}

const extOf = mime => ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.bin');
function magicOk(b, mime) {
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return false;
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  createApp().listen(port, () => {
    const ai = aiConfig();
    console.log(`拾光手帐 运行在 http://localhost:${port}  ·  AI 回信：${ai.enabled ? ai.provider : '未开启'}${ai.error ? '（' + ai.error + '）' : ''}`);
  });
}
