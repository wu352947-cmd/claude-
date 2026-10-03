// AI 回信：可插拔的模型提供方
//   AI_PROVIDER=deepseek | qwen | openai-compatible  —— 国内已备案模型，走各家兼容 OpenAI 的 Chat Completions 接口
//   AI_PROVIDER=anthropic                            —— Claude（官方 SDK，需另行 npm install @anthropic-ai/sdk；不对中国大陆提供服务，供海外部署）
//   AI_PROVIDER=mock                                 —— 本地开发演示用的模板信，不调用任何模型
// 未配置时功能关闭，前端会显示“回信服务尚未开启”。

const PRESETS = {
  deepseek: { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  qwen: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  'openai-compatible': { baseURL: '', model: '' }
};

export function aiConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || '').trim();
  if (!provider) return { enabled: false };
  if (provider === 'mock') return { enabled: true, provider };
  if (provider === 'anthropic') {
    return { enabled: !!env.ANTHROPIC_API_KEY, provider, model: env.AI_MODEL || 'claude-opus-5-5' };
  }
  const p = PRESETS[provider];
  if (!p) return { enabled: false, error: `未知的 AI_PROVIDER：${provider}` };
  const baseURL = (env.AI_BASE_URL || p.baseURL).replace(/\/$/, '');
  const model = env.AI_MODEL || p.model;
  return { enabled: !!(env.AI_API_KEY && baseURL && model), provider, baseURL, model, apiKey: env.AI_API_KEY };
}

const SYSTEM = `你是“拾光手帐”里的月亮，会给写手帐的人回一封短信。
写信的原则：
- 用中文，温柔、具体、克制，像一位读过很多书的老朋友。150 到 260 字，分 3 到 5 段，不用标题、不用列表、不用表情符号。
- 先接住对方今天写下的具体细节（某件事、某个人、某种天气），让人感到被认真读过；不要泛泛地说“你很棒”“一切都会好的”。
- 不说教，不下诊断，不给医疗、法律、投资方面的建议，不评判对方的选择。
- 可以自然地带一点当下的节气、月相或季节景物，但不要堆砌辞藻。
- 结尾给一个很小、今晚或明天就能做到的温柔提议，然后落款“月亮”。
- 如果对方流露出伤害自己或活不下去的念头，请认真回应，并明确建议拨打全国统一心理援助热线 12356，紧急时拨打 110 或 120。`;

export function buildPrompt({ nickname, day, term, moon, mood, body }) {
  const who = nickname ? `写信人的昵称是“${nickname}”。` : '';
  return `${who}今天是 ${day}，节气在${term}附近，${moon}。
今天的心情：${mood || '没有标注'}。
今天的手帐内容：
"""
${String(body || '').slice(0, 2000)}
"""
请写一封回信。`;
}

async function viaOpenAICompatible(cfg, user) {
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      temperature: 0.8,
      max_tokens: 900
    }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) throw Object.assign(new Error(`模型服务返回 ${res.status}`), { status: res.status });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('模型没有返回内容');
  return text.trim();
}

async function viaAnthropic(cfg, user) {
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
  catch { throw new Error('未安装 @anthropic-ai/sdk，请先 npm install @anthropic-ai/sdk'); }
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: user }]
    });
    if (response.stop_reason === 'refusal') throw new Error('这一次没能写出回信');
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) throw new Error('模型没有返回内容');
    return text;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw Object.assign(new Error('回信的人有点多，请稍后再试'), { status: 429 });
    if (error instanceof Anthropic.AuthenticationError) throw new Error('Claude API 密钥无效');
    if (error instanceof Anthropic.APIError) throw Object.assign(new Error(`Claude API 错误 ${error.status}`), { status: error.status });
    throw error;
  }
}

function viaMock(_cfg, _user, ctx) {
  const first = String(ctx.body || '').split(/[。！？\n]/).map(s => s.trim()).find(Boolean) || '今天的这一页';
  return [
    `读到你写的“${first.slice(0, 24)}”，我在云后面停了一会儿。`,
    `${ctx.term}前后的夜晚，风会比白天诚实一些。你把今天认认真真地记了下来，这件事本身就很好。`,
    '今晚早一点关灯吧，把窗帘留一道缝，我会在那里。',
    '月亮'
  ].join('\n\n');
}

export async function writeReply(cfg, ctx) {
  const user = buildPrompt(ctx);
  if (cfg.provider === 'mock') return viaMock(cfg, user, ctx);
  if (cfg.provider === 'anthropic') return viaAnthropic(cfg, user);
  return viaOpenAICompatible(cfg, user);
}
