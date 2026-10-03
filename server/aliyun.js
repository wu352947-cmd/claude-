// 阿里云 RPC 接口签名（HMAC-SHA1，签名版本 1.0）：短信与内容安全共用
import { createHmac, randomUUID } from 'node:crypto';
const pct = s => encodeURIComponent(s).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~');

export async function aliyunRpc(host, params, { keyId, secret, timeout = 10_000 }) {
  const all = { AccessKeyId: keyId, Format: 'JSON', SignatureMethod: 'HMAC-SHA1', SignatureNonce: randomUUID(), SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), ...params };
  const query = Object.keys(all).sort().map(k => `${pct(k)}=${pct(all[k])}`).join('&');
  const signature = createHmac('sha1', secret + '&').update(`GET&${pct('/')}&${pct(query)}`).digest('base64');
  const res = await fetch(`https://${host}/?Signature=${pct(signature)}&${query}`, { signal: AbortSignal.timeout(timeout) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
