// SQLite 数据层（Node 22 内置 node:sqlite，无需额外依赖）
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash   TEXT NOT NULL,
      nickname    TEXT NOT NULL DEFAULT '',
      settings    TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day         TEXT NOT NULL,
      mood        TEXT NOT NULL DEFAULT '',
      body        TEXT NOT NULL DEFAULT '',
      page        TEXT NOT NULL DEFAULT '{}',
      sealed_at   INTEGER,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS letters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('reply','future')),
      day         TEXT,
      title       TEXT NOT NULL DEFAULT '',
      body        TEXT NOT NULL,
      meta        TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      deliver_at  INTEGER NOT NULL,
      opened_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS letters_user ON letters(user_id, deliver_at);
    CREATE TABLE IF NOT EXISTS uploads (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime        TEXT NOT NULL,
      size        INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day         TEXT NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS sms_codes (
      phone       TEXT NOT NULL,
      purpose     TEXT NOT NULL,
      code_hash   TEXT NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      PRIMARY KEY (phone, purpose)
    );
  `);
  // 灯海：匿名心愿灯（不加密：本就是公开内容）；status = pending 待审 / visible 已放行 / reported 被举报暂隐 / hidden 已下架 / private 仅自己可见
  db.exec(`
    CREATE TABLE IF NOT EXISTS lanterns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      hue         INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'pending',
      warmth      INTEGER NOT NULL DEFAULT 0,
      reports     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      reviewed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS lanterns_status ON lanterns(status, created_at);
    CREATE INDEX IF NOT EXISTS lanterns_user ON lanterns(user_id, created_at);
    CREATE TABLE IF NOT EXISTS lantern_marks (
      lantern_id  INTEGER NOT NULL REFERENCES lanterns(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('warm','report')),
      reason      TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (lantern_id, user_id, kind)
    );
  `);
  // 迁移：手机号（可为空，非空时唯一）
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users(phone) WHERE phone IS NOT NULL');
  return db;
}

export const now = () => Date.now();
export const parseJson = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
