// 登录 / 注册：手机号验证码（默认）与账号密码两种方式
import { api } from '../api.js';
import { modal, toast } from '../ui.js';
import { state } from '../main.js';
import { codeFieldsHtml, bindCodeFields } from '../codefield.js';

const agreeHtml = id => `<label class="agree"><input type="checkbox" id="${id}"><span>我已阅读并同意 <a href="/terms.html" target="_blank">用户协议</a> 与 <a href="/privacy.html" target="_blank">隐私政策</a></span></label>`;

export function authView(root, onDone) {
  const smsOn = !!state.config.sms;
  let mode = smsOn ? 'phone' : 'login';
  root.innerHTML = `<div class="auth">
    <div class="auth-art" aria-hidden="true"><div class="moon-gate"><img src="/assets/gate-dawn.jpg" alt=""></div><div class="title">拾光手帐</div>
      <div class="seal"><span>月</span><span>白</span><span>小</span><span>记</span></div></div>
    <div class="auth-card paper"><span class="tape" style="top:-10px;left:30px;transform:rotate(-4deg)"></span>
      <p class="h-eyebrow">ようこそ</p><h1 class="h-title" style="font-size:30px">把日子写成一页一页温柔的纸</h1>
      <div class="tabs" role="tablist">
        ${smsOn ? '<button type="button" role="tab" data-m="phone">手机号</button>' : ''}
        <button type="button" role="tab" data-m="login">账号密码</button>
        <button type="button" role="tab" data-m="register">用户名注册</button>
      </div>
      <form novalidate id="fPhone" ${smsOn ? '' : 'hidden'}>
        ${codeFieldsHtml('lg')}
        <div class="field"><label for="pnn">昵称（新用户选填）</label><input id="pnn" maxlength="20" placeholder="月亮会这样称呼你"></div>
        ${agreeHtml('pag')}
        <p class="err" role="alert"></p>
        <button class="btn ink" type="submit">翻开手帐</button>
        <p class="muted" style="font-size:12px;margin:0">未注册的手机号会自动新建一本手帐。</p>
      </form>
      <form novalidate id="fPass" ${smsOn ? 'hidden' : ''}>
        <div class="field"><label for="un">用户名或手机号</label><input id="un" autocomplete="username" required maxlength="20" placeholder="2–20 位中文、字母或数字"></div>
        <div class="field reg" hidden><label for="nn">昵称（选填）</label><input id="nn" maxlength="20" placeholder="月亮会这样称呼你"></div>
        <div class="field"><label for="pw">密码</label><input id="pw" type="password" autocomplete="current-password" required minlength="8" maxlength="72" placeholder="至少 8 位"></div>
        <div class="reg" hidden>${agreeHtml('ag')}</div>
        <p class="err" role="alert"></p>
        <button class="btn ink" type="submit" id="go">翻开手帐</button>
        ${smsOn ? '<button type="button" class="linkish" id="forgot">忘记密码？用手机验证码重设</button>' : ''}
      </form>
      <p class="muted" style="font-size:12px;margin:16px 0 0"><a href="/">← 回到首页</a></p>
    </div></div>`;
  const $ = s => root.querySelector(s);
  const setMode = m => {
    mode = m;
    root.querySelectorAll('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-selected', b.dataset.m === m); });
    $('#fPhone').hidden = m !== 'phone'; $('#fPass').hidden = m === 'phone';
    root.querySelectorAll('#fPass .reg').forEach(e => e.hidden = m !== 'register');
    $('#pw').autocomplete = m === 'register' ? 'new-password' : 'current-password';
    $('#un').placeholder = m === 'register' ? '2–20 位中文、字母或数字' : '用户名或手机号';
    $('#go').textContent = m === 'register' ? '新建我的手帐' : '翻开手帐';
    root.querySelectorAll('.err').forEach(e => e.textContent = '');
  };
  root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  setMode(location.hash === '#/register' ? (smsOn ? 'phone' : 'register') : mode);

  if (smsOn) {
    const err = $('#fPhone .err');
    const cf = bindCodeFields(root, 'lg', 'login', m => { err.textContent = m; });
    $('#fPhone').addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      const btn = $('#fPhone button[type=submit]'); btn.disabled = true;
      try { const r = await api.smsLogin({ phone: cf.phone(), code: cf.code(), agree: $('#pag').checked, nickname: $('#pnn').value.trim() }); cf.stop(); onDone(r.user, r.fresh); }
      catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });
    $('#forgot').addEventListener('click', () => resetFlow(onDone));
  }
  $('#fPass').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#fPass .err'); err.textContent = ''; $('#go').disabled = true;
    try {
      const body = { username: $('#un').value.trim(), password: $('#pw').value };
      const r = mode === 'register' ? await api.register({ ...body, nickname: $('#nn').value.trim(), agree: $('#ag').checked }) : await api.login(body);
      onDone(r.user, mode === 'register');
    } catch (ex) { err.textContent = ex.message; }
    $('#go').disabled = false;
  });
  setTimeout(() => (smsOn && mode === 'phone' ? $('#lg-ph') : $('#un')).focus(), 300);
}

// 忘记密码 / 设置密码：验证码 + 新密码
export function resetFlow(onDone, { phoneFull = '', title = '用手机验证码重设密码' } = {}) {
  const m = modal(`<button class="x" data-close aria-label="关闭">×</button><h3>${title}</h3>
    <form style="display:grid;gap:14px" novalidate>${codeFieldsHtml('rs', { phone: phoneFull })}
      <div class="field"><label for="rs-pw">新密码</label><input id="rs-pw" type="password" autocomplete="new-password" minlength="8" maxlength="72" placeholder="至少 8 位"></div>
      <p class="err"></p><div class="row" style="margin-top:0"><button type="button" class="btn" data-close>取消</button><button class="btn ink">保存新密码</button></div></form>`);
  const err = m.el.querySelector('.err');
  const cf = bindCodeFields(m.el, 'rs', 'reset', t => { err.textContent = t; });
  m.el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    try { const r = await api.resetPassword({ phone: cf.phone(), code: cf.code(), password: m.el.querySelector('#rs-pw').value }); cf.stop(); m.close(); toast('新密码已保存'); onDone?.(r.user, false); }
    catch (ex) { err.textContent = ex.message; }
  });
}
