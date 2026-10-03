// 手帐本：月历书架 + 翻页阅读
import { api } from '../api.js';
import { h, toast, quiet, sleep } from '../ui.js';
import { createPage, miniPage } from '../page.js';
import { dayKey, pad, WEEK } from '../calendar.js';
import { MOOD_MAP } from '../faces.js';

export async function bookView(root, month) {
  const now = new Date(), todayKey = dayKey(now);
  const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  if (!/^\d{4}-\d{2}$/.test(month || '') || month > cur) month = cur;
  const [y, m] = month.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`, next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  root.innerHTML = `<div class="wrap view-in">
    <div class="book-head">
      <div><p class="h-eyebrow">てちょう</p><h1 class="h-title">手帐本</h1></div>
      <div class="month-nav">
        <a class="round" href="#/book/${prev}" aria-label="上个月"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>
        <span class="lbl">${y} 年 ${m} 月</span>
        <a class="round" href="#/book/${next}" aria-label="下个月" ${next > cur ? 'hidden' : ''}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></a>
      </div>
    </div>
    <div class="book-stats" id="stats"></div>
    <div class="shelf" id="shelf" style="margin-top:22px"></div>
  </div>`;
  let entries = [];
  try { ({ entries } = await api.month(month)); } catch (e) { toast(e.message); }
  const byDay = Object.fromEntries(entries.map(e => [e.day, e]));
  const moods = entries.map(e => e.mood).filter(Boolean);
  const top = moods.length ? Object.entries(moods.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1])[0][0] : '';
  root.querySelector('#stats').innerHTML = `<span><b>${entries.length}</b>页</span><span><b>${entries.filter(e => e.sealedAt).length}</b>页已封存</span>
    <span><b>${entries.reduce((n, e) => n + [...(e.body || '').replace(/\s/g, '')].length, 0)}</b>字</span>${top ? `<span>最常见的心情 · ${MOOD_MAP[top].n}</span>` : ''}`;

  const shelf = root.querySelector('#shelf');
  const first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
  let html = [...WEEK].map(w => `<div class="wd">${w}</div>`).join('') + '<span></span>'.repeat(first);
  for (let i = 1; i <= days; i++) {
    const key = `${month}-${pad(i)}`, e = byDay[key];
    html += e ? miniPage(e, i, todayKey)
      : `<button type="button" class="mini empty${key > todayKey ? ' future' : ''}${key === todayKey ? ' today-mark' : ''}" data-empty="${key}" style="--i:${i}" aria-label="${m}月${i}日，还没有写"><span class="n">${i}</span></button>`;
  }
  shelf.innerHTML = html;
  shelf.addEventListener('click', ev => {
    const b = ev.target.closest('.mini'); if (!b) return;
    if (b.dataset.empty) location.hash = `#/day/${b.dataset.empty}`;
    else openReader(entries, b.dataset.day);
  });
}

function openReader(entries, startDay) {
  const list = entries.slice().sort((a, b) => a.day.localeCompare(b.day));
  let idx = list.findIndex(e => e.day === startDay), busy = false;
  const rd = h(`<div class="reader" role="dialog" aria-modal="true" aria-label="翻阅手帐">
    <div class="reader-top"><span class="lbl"></span><div style="display:flex;gap:8px"><a class="btn small" data-edit>改这一页</a><button class="btn small" data-close>合上</button></div></div>
    <div class="stage"><div class="leaf"></div></div>
    <div class="reader-foot"><button class="round" data-prev aria-label="前一页"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <span class="muted" data-pos></span><button class="round" data-next aria-label="后一页"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>
  </div>`);
  document.body.append(rd);
  const leaf = rd.querySelector('.leaf');
  let current = null;
  const mount = i => {
    current?.destroy();
    const e = list[i]; current = createPage({ day: e.day, entry: e, editable: false });
    leaf.replaceChildren(current.el); if (e.sealedAt) current.sealMark(e.sealedAt, false);
    const d = new Date(e.day + 'T00:00');
    rd.querySelector('.lbl').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    rd.querySelector('[data-pos]').textContent = `${i + 1} / ${list.length}`;
    rd.querySelector('[data-edit]').href = `#/day/${e.day}`;
    rd.querySelector('[data-prev]').disabled = i === 0; rd.querySelector('[data-next]').disabled = i === list.length - 1;
  };
  mount(idx);
  async function turn(dir) {
    const to = idx + dir; if (busy || to < 0 || to >= list.length) return;
    if (quiet()) { idx = to; return mount(idx); }
    busy = true;
    const rect = leaf.getBoundingClientRect();
    const overlay = h(`<div class="leaf-turn ${dir > 0 ? 'fwd' : 'back'}"><div class="f"></div><div class="b"></div></div>`);
    overlay.style.width = rect.width + 'px'; overlay.style.height = Math.min(rect.height, leaf.scrollHeight) + 'px';
    if (dir > 0) {
      overlay.querySelector('.f').append(leaf.firstElementChild.cloneNode(true));
      idx = to; mount(idx);
    } else {
      const tmp = createPage({ day: list[to].day, entry: list[to], editable: false });
      if (list[to].sealedAt) tmp.sealMark(list[to].sealedAt, false);
      overlay.querySelector('.f').append(tmp.el);
      leaf.parentElement.append(overlay); tmp.fit(); tmp.destroy();
    }
    if (!overlay.isConnected) leaf.parentElement.append(overlay);
    const lr = leaf.getBoundingClientRect(), sr = leaf.parentElement.getBoundingClientRect();
    overlay.style.left = (lr.left - sr.left) + 'px'; overlay.style.top = (lr.top - sr.top) + 'px';
    await sleep(1060);
    if (dir < 0) { idx = to; mount(idx); }
    overlay.remove(); busy = false;
  }
  const close = () => { rd.classList.add('out'); document.removeEventListener('keydown', key); setTimeout(() => { current?.destroy(); rd.remove(); }, 340); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') turn(1); if (e.key === 'ArrowLeft') turn(-1); };
  document.addEventListener('keydown', key);
  rd.querySelector('[data-close]').addEventListener('click', close);
  rd.querySelector('[data-edit]').addEventListener('click', close);
  rd.querySelector('[data-prev]').addEventListener('click', () => turn(-1));
  rd.querySelector('[data-next]').addEventListener('click', () => turn(1));
  let sx = null;
  rd.querySelector('.stage').addEventListener('pointerdown', e => { sx = e.clientX; });
  rd.querySelector('.stage').addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 60) turn(e.clientX < sx ? 1 : -1); sx = null; });
  rd.querySelector('[data-close]').focus();
}
