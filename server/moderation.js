// 灯海的内容审核：本地规则 → 机器审核（可选）→ 人工审核队列
//   MODERATION_PROVIDER=aliyun  阿里云内容安全“文本审核增强版”（复用 ALIYUN_ACCESS_KEY_ID / SECRET，需在控制台开通）
//   LANTERN_REVIEW=pre | post   未接机器审核时：pre（默认）= 先审后发，post = 先发后审（靠举报与巡查）
// 面向公众的 UGC 必须有审核能力。上线前请接入机器审核，并安排人巡查 /admin.html。
import { readFileSync } from 'node:fs';
import { aliyunRpc } from './aliyun.js';

export function moderationConfig(env = process.env) {
  const provider = (env.MODERATION_PROVIDER || '').trim();
  const review = env.LANTERN_REVIEW === 'post' ? 'post' : 'pre';
  if (provider === 'aliyun' && env.ALIYUN_ACCESS_KEY_ID && env.ALIYUN_ACCESS_KEY_SECRET)
    return { provider, review, keyId: env.ALIYUN_ACCESS_KEY_ID, secret: env.ALIYUN_ACCESS_KEY_SECRET, region: env.ALIYUN_GREEN_REGION || 'cn-shanghai' };
  return { provider: '', review };
}

// 基础词表：脏话、引流、色情、赌博与诈骗类。运营方可在 DATA_DIR/blocklist.txt 里每行追加一个词
const BASE = ['傻逼', '傻b', 'sb', '煞笔', '操你', '草泥马', '尼玛', '你妈', '妈的', '贱人', '婊子', '滚蛋', '废物',
  '约炮', '裸聊', '援交', '包夜', '色情', '黄片', '博彩', '赌博', '彩票群', '六合彩', '代开发票', '刷单', '兼职日结', '贷款', '网贷', '套现', '代孕', '枪支', '冰毒', '大麻'];
const CONTACT = [/https?:|www\.|\.(com|cn|net|top|xyz|vip)\b/i, /\d{6,}/, /(微信|威信|薇信|vx|v信|wx|加我|扣扣|qq|二维码|公众号|私信我|加群)/i];

export function loadBlocklist(dir) {
  try { return readFileSync(`${dir}/blocklist.txt`, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')); } catch { return []; }
}

export function localCheck(text, extra = []) {
  const t = String(text || '').trim();
  const flat = t.replace(/[\s·.,，。!！?？、~～*_\-]/g, '').toLowerCase();
  if ([...t].length < 2) return '写一两句心愿吧';
  if ([...t].length > 50) return '心愿最多 50 个字';
  if (CONTACT.some(p => p.test(flat))) return '灯上不能留联系方式或链接哦';
  if ([...BASE, ...extra].some(w => flat.includes(w.toLowerCase()))) return '这盏灯没能放出去，换个温柔一点的说法吧';
  return '';
}

// 返回 'pass' | 'block' | 'review'（服务出错时交给人工）
export async function machineCheck(cfg, text) {
  if (cfg.provider !== 'aliyun') return 'review';
  try {
    const { data } = await aliyunRpc(`green-cip.${cfg.region}.aliyuncs.com`, {
      Action: 'TextModerationPlus', Version: '2022-03-02', RegionId: cfg.region,
      Service: 'comment_detection_pro', ServiceParameters: JSON.stringify({ content: text })
    }, { keyId: cfg.keyId, secret: cfg.secret, timeout: 6000 });
    if (data.Code !== 200 || !data.Data) { console.error('moderation', data.Code, data.Message); return 'review'; }
    const level = String(data.Data.RiskLevel || '').toLowerCase();
    return level === 'none' ? 'pass' : level === 'high' ? 'block' : 'review';
  } catch (e) { console.error('moderation', e.message); return 'review'; }
}
