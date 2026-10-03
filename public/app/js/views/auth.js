// 登录 / 注册
import { api } from '../api.js';
import { esc } from '../ui.js';

export function authView(root, onDone) {
  let mode = 'login';
  root.innerHTML = `<div class="auth">
    <div class="auth-art" aria-hidden="true"><div class="moon-gate"><img src="/assets/gate-dawn.jpg" alt=""></div><div class="title">拾光手帐</div>
      <div class="seal"><span>月</span><span>白</span><span>小</span><span>记</span></div></div>
    <div class="auth-card paper"><span class="tape" style="top:-10px;left:30px;transform:rotate(-4deg)"></span>
      <p class="h-eyebrow">ようこそ</p><h1 class="h-title" style="font-size:30px">把日子写成一页一页温柔的纸</h1>
      <div class="tabs" role="tablist"><button type="button" role="tab" data-m="login" class="on" aria-selected="true">登录</button><button type="button" role="tab" data-m="register" aria-selected="false">新建一本手帐</button></div>
      <form novalidate>
        <div class="field"><label for="un">用户名</label><input id="un" autocomplete="username" required maxlength="20" placeholder="2–20 位中文、字母或数字"></div>
        <div class="field reg" hidden><label for="nn">昵称（选填）</label><input id="nn" maxlength="20" placeholder="月亮会这样称呼你"></div>
        <div class="field"><label for="pw">密码</label><input id="pw" type="password" autocomplete="current-password" required minlength="8" maxlength="72" placeholder="至少 8 位"></div>
        <label class="agree reg" hidden><input type="checkbox" id="ag"><span>我已阅读并同意 <a href="/terms.html" target="_blank">用户协议</a> 与 <a href="/privacy.html" target="_blank">隐私政策</a></span></label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn ink" type="submit" id="go">翻开手帐</button>
      </form>
      <p class="muted" style="font-size:12px;margin:16px 0 0"><a href="/">← 回到首页</a></p>
    </div></div>`;
  const $ = s => root.querySelector(s);
  const setMode = m => {
    mode = m;
    root.querySelectorAll('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-selected', b.dataset.m === m); });
    root.querySelectorAll('.reg').forEach(e => e.hidden = m !== 'register');
    $('#pw').autocomplete = m === 'register' ? 'new-password' : 'current-password';
    $('#go').textContent = m === 'register' ? '新建我的手帐' : '翻开手帐'; $('#err').textContent = '';
  };
  root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  if (location.hash === '#/register') setMode('register');
  root.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault(); $('#err').textContent = ''; $('#go').disabled = true;
    try {
      const body = { username: $('#un').value.trim(), password: $('#pw').value };
      const r = mode === 'register' ? await api.register({ ...body, nickname: $('#nn').value.trim(), agree: $('#ag').checked }) : await api.login(body);
      onDone(r.user, mode === 'register');
    } catch (err) { $('#err').textContent = err.message; }
    $('#go').disabled = false;
  });
  setTimeout(() => $('#un').focus(), 300);
}
