// 内容加密：手帐正文与信件在数据库里以 AES-256-GCM 加密存储
// 密钥：ENTRY_KEY（64 位十六进制）；未配置时首次启动生成并保存到数据目录（生产环境建议放在数据目录之外，单独备份）
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'enc1:';

export function loadKey(env, dataDir) {
  if (env.ENTRY_KEY) {
    const k = Buffer.from(env.ENTRY_KEY.trim(), 'hex');
    if (k.length !== 32) throw new Error('ENTRY_KEY 需要是 64 位十六进制（32 字节）');
    return k;
  }
  const f = join(dataDir, 'entry.key');
  try { return Buffer.from(readFileSync(f, 'utf8').trim(), 'hex'); } catch {}
  mkdirSync(dataDir, { recursive: true });
  const k = randomBytes(32); writeFileSync(f, k.toString('hex'), { mode: 0o600 });
  console.warn('[crypto] 未配置 ENTRY_KEY，已生成密钥并保存在 ' + f + '，请妥善备份；丢失密钥将无法解密已有内容');
  return k;
}

export function makeCodec(key) {
  return {
    enc(text) {
      const s = String(text ?? '');
      if (!s || s.startsWith(PREFIX)) return s;
      const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(s, 'utf8'), c.final()]);
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
    },
    dec(text) {
      const s = String(text ?? '');
      if (!s.startsWith(PREFIX)) return s;
      const b = Buffer.from(s.slice(PREFIX.length), 'base64');
      const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    }
  };
}
