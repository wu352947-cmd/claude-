// 手机号 + 验证码输入（带 60 秒倒计时）
import { api } from './api.js';
import { toast } from './ui.js';

export const codeFieldsHtml = (id, { phone = '', lockPhone = false } = {}) => `
  <div class="field"><label for="${id}-ph">手机号</label><input id="${id}-ph" inputmode="numeric" autocomplete="tel" maxlength="11" placeholder="11 位手机号" value="${phone}" ${lockPhone ? 'readonly' : ''}></div>
  <div class="field code-row"><label for="${id}-cd">验证码</label><div class="code-in"><input id="${id}-cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字"><button type="button" class="btn small" id="${id}-send">获取验证码</button></div></div>`;

export function bindCodeFields(root, id, purpose, onError) {
  const ph = root.querySelector(`#${id}-ph`), cd = root.querySelector(`#${id}-cd`), btn = root.querySelector(`#${id}-send`);
  let timer = 0;
  const countdown = n => {
    clearInterval(timer); btn.disabled = true;
    const tick = () => { btn.textContent = `${n}s 后重发`; if (n-- <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '重新获取'; } };
    tick(); timer = setInterval(tick, 1000);
  };
  btn.addEventListener('click', async () => {
    const phone = ph.dataset.full || ph.value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) return onError('请输入正确的手机号');
    btn.disabled = true;
    try {
      const r = await api.smsSend(phone, purpose); countdown(r.cooldown || 60); cd.focus();
      toast(r.debugCode ? `开发模式 · 验证码 ${r.debugCode}` : '验证码已发送');
    } catch (e) { btn.disabled = false; onError(e.message); if (e.data?.cooldown) countdown(e.data.cooldown); }
  });
  return { phone: () => ph.dataset.full || ph.value.trim(), code: () => cd.value.trim(), stop: () => clearInterval(timer) };
}
