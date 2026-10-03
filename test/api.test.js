import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';

const dir = mkdtempSync(join(tmpdir(), 'sg-'));
const server = createApp({ env: { DATA_DIR: dir, DB_FILE: join(dir, 't.db'), AI_PROVIDER: 'mock', AI_DAILY_LIMIT: '2', COOKIE_SECURE: 'false', REGISTER_LIMIT_PER_HOUR: '100', SMS_PROVIDER: 'mock', SMS_DEBUG: '1', APP_SECRET: 'test-secret' } });
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, path, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(base + path, {
      method, headers: { 'x-sg': '1', cookie, ...(body && !isBuf ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? (isBuf ? body : JSON.stringify(body)) : undefined
    });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  };
}
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

test('注册、登录、会话', async () => {
  const a = client();
  assert.equal((await a('POST', '/api/auth/register', { username: 'yue', password: 'short', agree: true })).status, 400);
  assert.equal((await a('POST', '/api/auth/register', { username: 'yue', password: 'moonlight88' })).status, 400, '必须同意协议');
  const r = await a('POST', '/api/auth/register', { username: 'yue', password: 'moonlight88', nickname: '小月', agree: true });
  assert.equal(r.status, 201);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await a('GET', '/api/me')).data.user.nickname, '小月');
  assert.equal((await a('POST', '/api/auth/register', { username: 'YUE', password: 'moonlight88', agree: true })).status, 409);
  await a('POST', '/api/auth/logout');
  assert.equal((await a('GET', '/api/me')).status, 401);
  assert.equal((await a('POST', '/api/auth/login', { username: 'yue', password: 'wrongpass1' })).status, 401);
  assert.equal((await a('POST', '/api/auth/login', { username: 'yue', password: 'moonlight88' })).status, 200);
});

test('缺少 x-sg 头的写请求被拒绝（CSRF）', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', body: '{}' });
  assert.equal(res.status, 403);
});

test('手帐读写、封存、隔离', async () => {
  const a = client(); const b = client();
  await a('POST', '/api/auth/register', { username: 'hana', password: 'sakura2026', agree: true });
  await b('POST', '/api/auth/register', { username: 'kaze', password: 'autumnwind', agree: true });
  const put = await a('PUT', `/api/entries/${today}`, { mood: 'calm', body: '今天去巷口买了一袋糖炒栗子，回家路上桂花很香。',
    page: { stickers: [{ id: 's1', k: 'flower', x: 0.3, y: 0.4, r: 12, s: 1 }, { k: '<script>' }], photos: [{ id: 'notmine1234567890' }] } });
  assert.equal(put.status, 200);
  assert.equal(put.data.entry.page.stickers.length, 1, '非法贴纸被过滤');
  assert.equal(put.data.entry.page.photos.length, 0, '不属于自己的照片被过滤');
  assert.equal(put.data.crisis, false);
  assert.equal((await b('GET', `/api/entries/${today}`)).data.entry, null, '别人看不到');
  assert.equal((await a('POST', `/api/entries/${today}/seal`)).data.entry.sealedAt > 0, true);
  const month = today.slice(0, 7);
  assert.equal((await a('GET', `/api/entries?month=${month}`)).data.entries.length, 1);
  assert.equal((await a('PUT', '/api/entries/2026-02-30', { body: 'x' })).status, 400);
});

test('AI 回信：mock、复用、危机信号、每日上限', async () => {
  const a = client();
  await a('POST', '/api/auth/register', { username: 'tsuki', password: 'moonmoon11', agree: true });
  assert.equal((await a('POST', `/api/entries/${today}/reply`)).status, 400, '空白页不能回信');
  await a('PUT', `/api/entries/${today}`, { mood: 'tired', body: '加班到很晚，地铁上看到一轮很圆的月亮，忽然有点想家。' });
  const r1 = await a('POST', `/api/entries/${today}/reply`);
  assert.equal(r1.status, 201); assert.match(r1.data.letter.body, /月亮/); assert.equal(r1.data.letter.meta.ai, true);
  const r2 = await a('POST', `/api/entries/${today}/reply`);
  assert.equal(r2.data.existing, true, '同一天只回一封');
  const y = new Date(Date.now() - 864e5); const yd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  await a('PUT', `/api/entries/${yd}`, { body: '最近真的觉得活着没意思，不想活了。' });
  const c = await a('POST', `/api/entries/${yd}/reply`);
  assert.equal(c.status, 201); assert.equal(c.data.letter.meta.crisis, true); assert.match(c.data.letter.body, /12356/);
});

test('时光信：未到期不可读', async () => {
  const a = client();
  await a('POST', '/api/auth/register', { username: 'tegami', password: 'letters123', agree: true });
  assert.equal((await a('POST', '/api/letters', { body: '你好呀', deliverAt: Date.now() + 60_000 })).status, 400);
  const r = await a('POST', '/api/letters', { title: '一年后', body: '希望你还记得今天的桂花。', deliverAt: Date.now() + 365 * 864e5 });
  assert.equal(r.status, 201); assert.equal(r.data.letter.body, null);
  assert.equal((await a('POST', `/api/letters/${r.data.letter.id}/open`)).status, 403);
  assert.equal((await a('GET', '/api/me')).data.counts.pending, 1);
});

test('照片上传：类型校验与权限', async () => {
  const a = client(); const b = client();
  await a('POST', '/api/auth/register', { username: 'photo', password: 'polaroid1', agree: true });
  await b('POST', '/api/auth/register', { username: 'other', password: 'polaroid2', agree: true });
  const fake = await a('POST', '/api/uploads', Buffer.from('not an image'), { 'content-type': 'image/png' });
  assert.equal(fake.status, 415);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');
  const up = await a('POST', '/api/uploads', png, { 'content-type': 'image/png' });
  assert.equal(up.status, 201);
  assert.equal((await a('GET', up.data.url)).status, 200);
  assert.equal((await b('GET', up.data.url)).status, 404, '别人拿不到我的照片');
});

test('导出与注销账号', async () => {
  const a = client();
  await a('POST', '/api/auth/register', { username: 'bye', password: 'farewell99', agree: true });
  await a('PUT', `/api/entries/${today}`, { body: '最后一页' });
  const ex = await a('GET', '/api/export');
  assert.equal(ex.data.entries.length, 1);
  assert.equal((await a('DELETE', '/api/me', { password: 'nope' })).status, 401);
  assert.equal((await a('DELETE', '/api/me', { password: 'farewell99' })).status, 200);
  assert.equal((await a('POST', '/api/auth/login', { username: 'bye', password: 'farewell99' })).status, 401);
});

test('静态文件与安全头', async () => {
  const res = await fetch(base + '/app/js/calendar.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(base + '/../server/index.js')).status !== 200, true);
});

test('手机号：验证码登录、自动注册、冷却、密码登录与重置', async () => {
  const a = client();
  assert.equal((await a('POST', '/api/auth/sms/send', { phone: '12345', purpose: 'login' })).status, 400);
  const s1 = await a('POST', '/api/auth/sms/send', { phone: '13800138000', purpose: 'login' });
  assert.equal(s1.status, 200); assert.match(s1.data.debugCode, /^\d{6}$/);
  assert.equal((await a('POST', '/api/auth/sms/send', { phone: '13800138000', purpose: 'login' })).status, 429, '60 秒冷却');
  assert.equal((await a('POST', '/api/auth/sms/login', { phone: '13800138000', code: s1.data.debugCode })).status, 400, '新用户需同意协议');
  assert.equal((await a('POST', '/api/auth/sms/login', { phone: '13800138000', code: '000000', agree: true })).status, 400, '错误验证码');
  const lg = await a('POST', '/api/auth/sms/login', { phone: '13800138000', code: s1.data.debugCode, agree: true, nickname: '阿桂' });
  assert.equal(lg.status, 201); assert.equal(lg.data.user.phone, '138****8000'); assert.equal(lg.data.user.hasPassword, false);
  assert.equal((await a('POST', '/api/auth/sms/login', { phone: '13800138000', code: s1.data.debugCode, agree: true })).status, 400, '验证码只能用一次');
  await a('POST', '/api/auth/logout');
  // 忘记密码 → 设置密码 → 用手机号 + 密码登录
  const s2 = await a('POST', '/api/auth/sms/send', { phone: '13800138000', purpose: 'reset' });
  assert.equal((await a('POST', '/api/auth/reset', { phone: '13800138000', code: s2.data.debugCode, password: 'osmanthus9' })).status, 200);
  await a('POST', '/api/auth/logout');
  const pl = await a('POST', '/api/auth/login', { username: '13800138000', password: 'osmanthus9' });
  assert.equal(pl.status, 200); assert.equal(pl.data.user.hasPassword, true);
  assert.equal((await a('POST', '/api/auth/sms/send', { phone: '13900139000', purpose: 'reset' })).status, 404, '未绑定的号码不能重置');
});

test('手机号：绑定与验证码注销', async () => {
  const a = client();
  await a('POST', '/api/auth/register', { username: 'bindme', password: 'binding123', agree: true });
  const s = await a('POST', '/api/auth/sms/send', { phone: '13700137000', purpose: 'bind' });
  assert.equal((await a('POST', '/api/me/phone', { phone: '13700137000', code: s.data.debugCode })).data.user.phone, '137****7000');
  const b = client();
  await b('POST', '/api/auth/register', { username: 'other2', password: 'binding456', agree: true });
  assert.equal((await b('POST', '/api/auth/sms/send', { phone: '13700137000', purpose: 'bind' })).status, 409, '号码已被占用');
  const d = await a('POST', '/api/auth/sms/send', { phone: '13700137000', purpose: 'delete' });
  assert.equal((await a('DELETE', '/api/me', { code: d.data.debugCode })).status, 200);
  assert.equal((await a('POST', '/api/auth/login', { username: 'bindme', password: 'binding123' })).status, 401);
});
