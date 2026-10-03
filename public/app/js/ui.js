// 通用界面：toast、弹窗、DOM 小工具
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const sleep = ms => new Promise(r => setTimeout(r, document.documentElement.classList.contains('quiet') ? Math.min(ms, 60) : ms));
export const quiet = () => document.documentElement.classList.contains('quiet') || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function toast(msg, { seal = '' } = {}) {
  const el = h(`<div class="toast">${seal ? `<i>${esc(seal)}</i>` : ''}<span>${esc(msg)}</span></div>`);
  document.getElementById('toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2800);
}

export function modal(inner, { onClose, wide } = {}) {
  const back = h(`<div class="modal-back" role="dialog" aria-modal="true"></div>`);
  const box = typeof inner === 'string' ? h(`<div class="modal">${inner}</div>`) : inner;
  if (wide) box.style.width = 'min(760px,100%)';
  back.append(box);
  const prev = document.activeElement;
  const close = () => {
    if (!back.isConnected) return;
    back.classList.add('out'); document.removeEventListener('keydown', key);
    setTimeout(() => { back.remove(); prev?.focus?.(); }, 330); onClose?.();
  };
  const key = e => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', key);
  document.getElementById('modalRoot').append(back);
  setTimeout(() => (box.querySelector('[autofocus],input,textarea,button') || box).focus?.(), 60);
  box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el: box, back, close };
}

export function confirmBox(title, text, okLabel = '确定', danger = false) {
  return new Promise(resolve => {
    let done = false;
    const m = modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row"><button class="btn" data-close>再想想</button><button class="btn ${danger ? 'shu' : 'ink'}" data-ok>${esc(okLabel)}</button></div>`,
      { onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); m.close(); });
  });
}

export const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
export const fmtTime = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
