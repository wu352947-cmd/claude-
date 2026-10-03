// 短信验证码：可插拔的发送通道
//   SMS_PROVIDER=aliyun  阿里云短信（需 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET / SMS_SIGN_NAME / SMS_TEMPLATE_CODE）
//   SMS_PROVIDER=mock    开发用：验证码打印到控制台；SMS_DEBUG=1 时还会在接口响应里返回（仅限本地调试，切勿在生产开启）
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { aliyunRpc } from './aliyun.js';

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

async function sendAliyun(cfg, phone, code) {
  const { status, data } = await aliyunRpc('dysmsapi.aliyuncs.com', {
    Action: 'SendSms', PhoneNumbers: phone, RegionId: 'cn-hangzhou', SignName: cfg.sign,
    TemplateCode: cfg.template, TemplateParam: JSON.stringify({ code }), Version: '2017-05-25'
  }, { keyId: cfg.keyId, secret: cfg.secret });
  if (data.Code !== 'OK') throw new Error(`短信发送失败：${data.Code || status} ${data.Message || ''}`.trim());
}

export async function sendCode(cfg, phone, code) {
  if (cfg.provider === 'mock') { console.log(`[sms] ${maskPhone(phone)} 验证码 ${code}`); return; }
  if (cfg.provider === 'aliyun') return sendAliyun(cfg, phone, code);
  throw new Error('短信服务未配置');
}
