// 设置：昵称、外观、安静模式、导出、注销
import { api } from '../api.js';
import { h, esc, toast, modal, confirmBox } from '../ui.js';
import { state, applyPrefs } from '../main.js';
import { codeFieldsHtml, bindCodeFields } from '../codefield.js';
import { resetFlow } from './auth.js';

export function settingsView(root) {
  const u = state.user, s = u.settings || {};
  root.innerHTML = `<div class="wrap view-in"><p class="h-eyebrow">せってい</p><h1 class="h-title">设置</h1>
  <div class="settings" style="margin-top:24px">
    <section class="paper set-row"><div><h4>昵称</h4><p>月亮回信时会这样称呼你</p></div>
      <form id="nickF" style="display:flex;gap:8px;align-items:center"><div class="field"><label class="sr" for="nick">昵称</label><input id="nick" maxlength="20" value="${esc(u.nickname)}"></div><button class="btn small">保存</button></form></section>
    <section class="paper set-row"><div><h4>纸张颜色</h4><p>跟随系统，或固定为日间 / 夜间</p></div>
      <div class="seg" id="theme">${[['auto', '跟随系统'], ['light', '日'], ['dark', '夜']].map(([k, n]) => `<button type="button" data-v="${k}" class="${(s.theme || 'auto') === k ? 'on' : ''}">${n}</button>`).join('')}</div></section>
    <section class="paper set-row"><div><h4>安静模式</h4><p>关掉飘落物和大部分动画，只留下纸和字</p></div>
      <div class="seg" id="quiet"><button type="button" data-v="0" class="${s.quiet ? '' : 'on'}">关</button><button type="button" data-v="1" class="${s.quiet ? 'on' : ''}">开</button></div></section>
    <section class="paper set-row"><div><h4>每日提醒</h4><p>选一个时间，加入手机日历；到点会轻轻提醒你写一页</p></div>
      <div style="display:flex;gap:8px;align-items:center"><label class="sr" for="rmd">提醒时间</label><input type="time" id="rmd" value="${esc(s.reminder || '22:00')}" class="time-in"><button class="btn small" id="ics">加入日历</button></div></section>
    <section class="paper set-row"><div><h4>导出我的手帐</h4><p>下载全部文字、心情、贴纸布局与信件（JSON）</p></div><button class="btn small" id="exp">导出</button></section>
    <section class="paper set-row"><div><h4>月亮回信</h4><p>${state.config.ai ? `已开启 · 每天最多 ${state.config.aiDaily} 封 · 回信由 AI 生成` : '尚未开启'}</p></div></section>
    <section class="paper set-row"><div><h4>让月亮记得最近的事</h4><p>开启后，回信时会参考你最近 30 天里写过的几页，像老朋友一样问问后来怎样了。<br>这些内容只在你请求回信时发送给 AI 服务，随时可以关闭。</p></div>
      <div class="seg" id="memory"><button type="button" data-v="0" class="${s.memory ? '' : 'on'}">关</button><button type="button" data-v="1" class="${s.memory ? 'on' : ''}">开</button></div></section>
    <section class="paper set-row"><div><h4>手机号</h4><p>${u.phone ? `已绑定 ${esc(u.phone)}，可用验证码登录与找回密码` : '绑定后可以用验证码登录、找回密码'}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${!u.phone && state.config.sms ? '<button class="btn small" id="bind">绑定手机号</button>' : ''}${u.phone && state.config.sms ? `<button class="btn small" id="setpw">${u.hasPassword ? '修改密码' : '设置密码'}</button>` : ''}</div></section>
    <section class="paper set-row"><div><h4>账号</h4><p>${esc(u.username)} · ${new Date(u.createdAt).getFullYear()} 年加入</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" id="logout">退出登录</button><button class="btn small danger" id="del">注销账号</button></div></section>
    <p class="muted" style="font-size:13px"><a href="/privacy.html">隐私政策</a> · <a href="/terms.html">用户协议</a> · 心里难受时可拨打全国统一心理援助热线 12356</p>
  </div></div>`;
  const save = async patch => { try { const r = await api.updateMe(patch); state.user = r.user; applyPrefs(); return true; } catch (e) { toast(e.message); return false; } };
  root.querySelector('#nickF').addEventListener('submit', async e => { e.preventDefault(); if (await save({ nickname: root.querySelector('#nick').value })) toast('好的，记住啦'); });
  const seg = (id, fn) => root.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', async () => {
    root.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); await fn(b.dataset.v);
  }));
  seg('theme', v => save({ settings: { theme: v } }));
  seg('quiet', v => save({ settings: { quiet: v === '1' } }));
  seg('memory', async v => { if (await save({ settings: { memory: v === '1' } })) toast(v === '1' ? '月亮会记得你最近写过的事' : '月亮只读当天这一页'); });
  root.querySelector('#ics').addEventListener('click', async () => {
    const t = root.querySelector('#rmd').value || '22:00';
    await save({ settings: { reminder: t } });
    const [hh, mm] = t.split(':'), d = new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const start = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${hh}${mm}00`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//shiguang//journal//CN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:shiguang-reminder-${Date.now()}@${location.host}`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
      'SUMMARY:写一页拾光手帐', `DESCRIPTION:今天的纸还空着，写一句也好。\\n${location.origin}/app/`, `URL:${location.origin}/app/`,
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:写一页拾光手帐', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = h(`<a href="${url}" download="拾光手帐提醒.ics"></a>`); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`已生成每天 ${t} 的日历提醒，打开文件即可加入日历`);
  });
  root.querySelector('#exp').addEventListener('click', async () => {
    try {
      const data = await api.exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = h(`<a href="${url}" download="拾光手帐-${new Date().toISOString().slice(0, 10)}.json"></a>`); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); toast(`已导出 ${data.entries.length} 页手帐`);
    } catch (e) { toast(e.message); }
  });
  root.querySelector('#logout').addEventListener('click', async () => { if (await confirmBox('要退出登录吗？', '手帐都安全地存在云端，下次登录就能看到。', '退出')) { await api.logout().catch(() => {}); location.hash = ''; location.reload(); } });
  root.querySelector('#bind')?.addEventListener('click', () => {
    const m = modal(`<button class="x" data-close aria-label="关闭">×</button><h3>绑定手机号</h3><form style="display:grid;gap:14px" novalidate>${codeFieldsHtml('bd')}<p class="err"></p>
      <div class="row" style="margin-top:0"><button type="button" class="btn" data-close>取消</button><button class="btn ink">绑定</button></div></form>`);
    const err = m.el.querySelector('.err'), cf = bindCodeFields(m.el, 'bd', 'bind', t => { err.textContent = t; });
    m.el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      try { const r = await api.bindPhone({ phone: cf.phone(), code: cf.code() }); cf.stop(); state.user = r.user; m.close(); toast('手机号已绑定'); settingsView(root); }
      catch (ex) { err.textContent = ex.message; }
    });
  });
  root.querySelector('#setpw')?.addEventListener('click', () => resetFlow(user => { state.user = user; settingsView(root); }, { title: u.hasPassword ? '修改密码' : '设置密码' }));
  root.querySelector('#del').addEventListener('click', () => {
    if (!u.hasPassword && u.phone) return deleteByCode();
    const m = modal(`<button class="x" data-close aria-label="关闭">×</button><h3 class="danger">注销账号</h3>
      <p class="muted">账号、全部手帐、照片和信件都会被永久删除，无法恢复。建议先导出一份。</p>
      <form style="display:grid;gap:12px"><div class="field"><label for="dp">输入密码确认</label><input id="dp" type="password" autocomplete="current-password" required></div><p class="err"></p>
      <div class="row" style="margin-top:0"><button type="button" class="btn" data-close>再想想</button><button class="btn shu">永久注销</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api.deleteMe(m.el.querySelector('#dp').value); location.href = '/'; }
      catch (err) { m.el.querySelector('.err').textContent = err.message; }
    });
  });
  function deleteByCode() {
    const m = modal(`<button class="x" data-close aria-label="关闭">×</button><h3 class="danger">注销账号</h3>
      <p class="muted">账号、全部手帐、照片和信件都会被永久删除，无法恢复。建议先导出一份。请输入绑定的手机号接收验证码。</p>
      <form style="display:grid;gap:12px" novalidate>${codeFieldsHtml('dl')}<p class="err"></p>
      <div class="row" style="margin-top:0"><button type="button" class="btn" data-close>再想想</button><button class="btn shu">永久注销</button></div></form>`);
    const err = m.el.querySelector('.err'), cf = bindCodeFields(m.el, 'dl', 'delete', t => { err.textContent = t; });
    m.el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api.deleteMeByCode(cf.code()); location.href = '/'; } catch (ex) { err.textContent = ex.message; }
    });
  }
}
