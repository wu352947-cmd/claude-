// 密码哈希（scrypt）与会话（随机令牌，库里只存哈希）
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { now } from './db.js';

const SESSION_DAYS = 30;
export const COOKIE = 'sg_sid';

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, s, k] = String(stored).split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const key = Buffer.from(k, 'base64');
  const test = scryptSync(pw, Buffer.from(s, 'base64'), key.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, test);
}

const sha = t => createHash('sha256').update(t).digest('hex');

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha(token), userId, t, t + SESSION_DAYS * 864e5);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function userFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(token), now());
  return row || null;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function validCredentials(username, password) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_一-龥]{2,20}$/.test(username))
    return '用户名需为 2–20 位中文、字母、数字或下划线';
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    return '密码长度需在 8–72 位之间';
  return null;
}
