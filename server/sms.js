// 短信验证码：可插拔的发送通道
//   SMS_PROVIDER=aliyun  阿里云短信（需 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET / SMS_SIGN_NAME / SMS_TEMPLATE_CODE）
//   SMS_PROVIDER=mock    开发用：验证码打印到控制台；SMS_DEBUG=1 时还会在接口响应里返回（仅限本地调试，切勿在生产开启）
import { createHmac, randomUUID, randomInt, timingSafeEqual } from 'node:crypto';

export function smsConfig(env = process.env) {
  const provider = (env.SMS_PROVIDER || '').trim();
  if (provider === 'mock') return { enabled: true, provider, debug: env.SMS_DEBUG === '1' };
  if (provider === 'aliyun') {
    const ok = env.ALIYUN_ACCESS_KEY_ID && env.ALIYUN_ACCESS_KEY_SECRET && env.SMS_SIGN_NAME && env.SMS_TEMPLATE_CODE;
    return { enabled: !!ok, provider, keyId: env.ALIYUN_ACCESS_KEY_ID, secret: env.ALIYUN_ACCESS_KEY_SECRET, sign: env.SMS_SIGN_NAME, template: env.SMS_TEMPLATE_CODE };
  }
  return { enabled: false };
}

export const validPhone = p => typeof p === 'string' && /^1[3-9]\d{9}$/.test(p);
export const maskPhone = p => p ? p.slice(0, 3) + '****' + p.slice(7) : '';
export const newCode = () => String(randomInt(0, 1e6)).padStart(6, '0');
export const codeHash = (secret, phone, purpose, code) => createHmac('sha256', secret).update(`${phone}|${purpose}|${code}`).digest('hex');
export const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 阿里云 RPC 签名（HMAC-SHA1，签名版本 1.0）
const pct = s => encodeURIComponent(s).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~');
async function sendAliyun(cfg, phone, code) {
  const params = {
    AccessKeyId: cfg.keyId, Action: 'SendSms', Format: 'JSON', PhoneNumbers: phone, RegionId: 'cn-hangzhou',
    SignName: cfg.sign, SignatureMethod: 'HMAC-SHA1', SignatureNonce: randomUUID(), SignatureVersion: '1.0',
    TemplateCode: cfg.template, TemplateParam: JSON.stringify({ code }), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), Version: '2017-05-25'
  };
  const query = Object.keys(params).sort().map(k => `${pct(k)}=${pct(params[k])}`).join('&');
  const signature = createHmac('sha1', cfg.secret + '&').update(`GET&${pct('/')}&${pct(query)}`).digest('base64');
  const res = await fetch(`https://dysmsapi.aliyuncs.com/?Signature=${pct(signature)}&${query}`, { signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => ({}));
  if (data.Code !== 'OK') throw new Error(`短信发送失败：${data.Code || res.status} ${data.Message || ''}`.trim());
}

export async function sendCode(cfg, phone, code) {
  if (cfg.provider === 'mock') { console.log(`[sms] ${maskPhone(phone)} 验证码 ${code}`); return; }
  if (cfg.provider === 'aliyun') return sendAliyun(cfg, phone, code);
  throw new Error('短信服务未配置');
}
