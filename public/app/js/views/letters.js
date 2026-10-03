// 信箱：月亮的回信 + 时光信
import { api } from '../api.js';
import { h, esc, modal, toast, fmtDate, sleep, quiet, confirmBox } from '../ui.js';
import { refreshCounts } from '../main.js';

const waxChar = l => l.meta?.crisis ? '安' : l.kind === 'reply' ? '月' : '时';
const postSvg = `<svg viewBox="0 0 30 36"><rect width="30" height="36" fill="#D7E7DD"/><circle cx="20" cy="12" r="6" fill="#C4473A" opacity=".85"/><path d="M0 26c6-4 10-1 15-3s9-5 15-3v16H0z" fill="#93BAA6"/></svg>`;

export async function lettersView(root) {
  root.innerHTML = `<div class="wrap view-in">
    <div class="mail-head"><div><p class="h-eyebrow">てがみ</p><h1 class="h-title">信箱</h1>
      <p class="muted" style="margin:8px 0 0">月亮读过你的手帐后写来的回信，和你寄给未来的时光信，都收在这里。</p></div>
      <button class="btn ink" id="compose"><svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/></svg>写一封时光信</button></div>
    <section class="mail-sec"><h3>已寄到 <small id="dueN"></small></h3><div class="mailbox" id="due"></div></section>
    <section class="mail-sec"><h3>在路上 <small id="pendN"></small></h3><div class="mailbox" id="pending"></div></section>
  </div>`;
  root.querySelector('#compose').addEventListener('click', () => composeLetter(() => lettersView(root)));
  let letters = [];
  try { ({ letters } = await api.letters()); } catch (e) { toast(e.message); }
  const due = letters.filter(l => l.due), pend = letters.filter(l => !l.due).sort((a, b) => a.deliverAt - b.deliverAt);
  root.querySelector('#dueN').textContent = due.length ? `${due.length} 封` : '';
  root.querySelector('#pendN').textContent = pend.length ? `${pend.length} 封` : '';
  const dueEl = root.querySelector('#due'), pendEl = root.querySelector('#pending');
  dueEl.innerHTML = due.length ? '' : `<div class="empty-note">信箱还空着。写完一页手帐，可以请月亮回一封信。</div>`;
  pendEl.innerHTML = pend.length ? '' : `<div class="empty-note">还没有寄往未来的信。写一封给一个月后、一年后的自己吧。</div>`;
  due.forEach((l, i) => {
    const b = h(`<button type="button" class="env${l.openedAt ? ' opened' : ' unread'}" style="--i:${i}" aria-label="${esc(l.title)}，${l.openedAt ? '已读' : '未拆'}">
      <span class="stamp-post">${postSvg}</span><span class="wax">${waxChar(l)}</span>
      <span class="meta"><b>${esc(l.title)}</b><span>${fmtDate(l.deliverAt)}</span></span></button>`);
    b.addEventListener('click', async () => { await openLetter(l); b.classList.remove('unread'); b.classList.add('opened'); });
    dueEl.append(b);
  });
  pend.forEach((l, i) => {
    const days = Math.ceil((l.deliverAt - Date.now()) / 864e5);
    const b = h(`<button type="button" class="env pending" style="--i:${i}" aria-label="${esc(l.title)}，还有 ${days} 天寄到">
      <span class="count">还有 ${days} 天 · ${fmtDate(l.deliverAt)} 寄到</span><span class="wax">${waxChar(l)}</span>
      <span class="meta"><b>${esc(l.title)}</b><span>封于 ${fmtDate(l.createdAt)}</span></span></button>`);
    b.addEventListener('click', () => { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); toast(`这封信还在路上，${fmtDate(l.deliverAt)} 才能拆开`); });
    pendEl.append(b);
  });
}

// 拆信：信封 → 揭开火漆 → 信纸展开 → 逐段落墨
export async function openLetter(letter) {
  const stage = h(`<div class="letter-stage">
    <div class="big-env" role="button" tabindex="0" aria-label="拆开信封"><div class="flap"></div><span class="wax">${waxChar(letter)}</span></div>
  </div>`);
  const m = modal(stage);
  m.el.classList.remove('modal'); m.el.style.cssText = 'width:min(560px,100%)';
  const env = stage.querySelector('.big-env');
  let opened = false;
  const open = async () => {
    if (opened) return; opened = true;
    env.classList.add('open'); await sleep(750);
    const paras = String(letter.body || '').split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean);
    const last = paras.length > 1 && paras[paras.length - 1].length <= 8 ? paras.pop() : '';
    const paper = h(`<article class="letter-paper" tabindex="-1"><h4>${esc(letter.title)}</h4>
      ${paras.map((p, i) => `<p class="para" style="--i:${i}">${esc(p)}</p>`).join('')}
      ${last ? `<p class="para sign" style="--i:${paras.length}">${esc(last)}</p>` : ''}
      ${letter.meta?.ai ? `<p class="para ai-label" style="--i:${paras.length + 1}">此信由 AI 生成，仅供陪伴，不构成专业建议</p>` : ''}
      ${(letter.meta?.crisis || letter.meta?.flagged) ? `<div class="para hotline" style="--i:${paras.length + 1}">如果你此刻很难受，可以拨打全国统一心理援助热线 <b>12356</b>。紧急情况请拨打 <b>110</b> 或 <b>120</b>。</div>` : ''}
      <div class="row para" style="--i:${paras.length + 2};display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn small" data-close>收好这封信</button></div>
    </article>`);
    stage.append(paper);
    paper.querySelector('[data-close]').addEventListener('click', m.close);
    env.classList.add('gone');
    setTimeout(() => { env.style.display = 'none'; paper.style.marginTop = '0'; }, quiet() ? 0 : 800);
    paper.focus({ preventScroll: true });
    if (letter.id && !letter.openedAt) { try { await api.openLetter(letter.id); letter.openedAt = Date.now(); refreshCounts(); } catch {} }
  };
  env.addEventListener('click', open);
  env.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  setTimeout(open, quiet() ? 0 : 900);
  return new Promise(r => { const iv = setInterval(() => { if (!m.back.isConnected) { clearInterval(iv); r(); } }, 300); });
}

// 写时光信
export function composeLetter(onSent) {
  const now = new Date();
  const opts = [['一个月后', 30], ['半年后', 182], ['一年后', 365], ['三年后', 365 * 3]];
  const m = modal(`<button class="x" data-close aria-label="关闭">×</button>
    <h3>写给未来的自己</h3>
    <form class="compose" style="display:grid;gap:14px">
      <div class="field"><label for="lt">信的名字</label><input id="lt" maxlength="30" placeholder="给一年后的我" autocomplete="off"></div>
      <div class="field"><label for="lb">想说的话</label><textarea id="lb" maxlength="5000" placeholder="现在的你，在想些什么？" required></textarea></div>
      <div class="field"><label>什么时候寄到</label><div class="when">${opts.map(([n, d], i) => `<button type="button" data-d="${d}" class="${i === 2 ? 'on' : ''}">${n}</button>`).join('')}<button type="button" data-d="custom">选个日子</button></div>
        <input type="date" id="ld" hidden min="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}"></div>
      <p class="err" id="lerr"></p>
      <div class="row" style="margin-top:0"><button type="button" class="btn" data-close>先不寄</button><button class="btn shu" type="submit">封缄寄出</button></div>
    </form>`, { wide: false });
  const f = m.el.querySelector('form'), date = m.el.querySelector('#ld');
  let days = 365, custom = false;
  m.el.querySelectorAll('.when button').forEach(b => b.addEventListener('click', () => {
    m.el.querySelectorAll('.when button').forEach(x => x.classList.toggle('on', x === b));
    custom = b.dataset.d === 'custom'; date.hidden = !custom; if (!custom) days = Number(b.dataset.d); else date.focus();
  }));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const body = m.el.querySelector('#lb').value.trim(), title = m.el.querySelector('#lt').value.trim();
    let at;
    if (custom) { if (!date.value) return (m.el.querySelector('#lerr').textContent = '请选一个日子'); const [y, mo, d] = date.value.split('-').map(Number); at = new Date(y, mo - 1, d, 9, 0).getTime(); }
    else { const t = new Date(now); t.setDate(t.getDate() + days); t.setHours(9, 0, 0, 0); at = t.getTime(); }
    if (body.length < 2) return (m.el.querySelector('#lerr').textContent = '信里写点什么吧');
    try {
      const { letter } = await api.sendLetter({ title, body, deliverAt: at });
      await foldAndFly(m.el);
      m.close();
      toast(`已封缄寄出，${fmtDate(letter.deliverAt)} 寄到`, { seal: '时' });
      refreshCounts(); onSent?.();
    } catch (err) { m.el.querySelector('#lerr').textContent = err.message; }
  });
}

async function foldAndFly(box) {
  if (quiet()) return;
  const r = box.getBoundingClientRect();
  box.classList.add('fold'); await sleep(650);
  const env = h('<div class="fly-env"><i></i></div>');
  env.style.left = (r.left + r.width / 2 - 60) + 'px'; env.style.top = (r.top + r.height / 2 - 40) + 'px';
  document.body.append(env);
  const target = document.querySelector('[data-nav="letters"]')?.getBoundingClientRect();
  await sleep(450);
  const dx = target ? target.left + target.width / 2 - (r.left + r.width / 2) : 300, dy = target ? target.top - (r.top + r.height / 2) : -300;
  await env.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx * .5}px, ${dy * .5 - 80}px) rotate(-14deg) scale(.7)`, opacity: 1, offset: .5 }, { transform: `translate(${dx}px, ${dy}px) rotate(8deg) scale(.15)`, opacity: .2 }],
    { duration: 1000, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' }).finished;
  env.remove();
}

export async function deleteLetterFlow(letter) {
  if (await confirmBox('撕掉这封信？', '撕掉后就找不回来了。', '撕掉', true)) await api.deleteLetter(letter.id);
}
