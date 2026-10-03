// 今日 / 任意一天的手帐页
import { api } from '../api.js';
import { h, esc, toast, modal, sleep, quiet, fmtTime } from '../ui.js';
import { createPage } from '../page.js';
import { STICKERS, CATS } from '../stickers.js';
import { dayKey, parseDay, termOf, JQ, cnDate } from '../calendar.js';
import { openLetter } from './letters.js';
import { state, refreshCounts } from '../main.js';

export async function todayView(root, day = dayKey(new Date())) {
  const today = dayKey(new Date());
  if (day > today) day = today;
  const d = parseDay(day), term = termOf(d), isToday = day === today;
  root.innerHTML = `<div class="wrap view-in">
    <div id="care"></div>
    <div class="today">
      <div class="page-col"><p class="h-eyebrow" style="margin-bottom:12px">${isToday ? 'きょうのページ' : 'あの日のページ'}</p><div id="pageHost"></div></div>
      <aside class="side" aria-label="工具">
        <section class="panel">
          <h4><span>${term.name} · ${term.hou}</span><small>${term.pinyin}</small></h4>
          <ul class="hou-list">${JQ[term.index][4].map((x, i) => `<li>${['一', '二', '三'][i]}候 · ${x}</li>`).join('')}</ul>
          <p class="muted" style="margin:8px 0 0;font-size:13px">距${term.next}还有 ${term.daysToNext} 天</p>
        </section>
        <section class="panel">
          <h4><span>贴纸</span><small>シール</small></h4>
          <div class="drawer-tabs" role="tablist">${CATS.map((c, i) => `<button type="button" role="tab" data-cat="${c}" class="${i ? '' : 'on'}" aria-selected="${!i}">${c}</button>`).join('')}</div>
          <div class="sticker-grid" id="sgrid"></div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
            <label class="btn small" for="photoIn" style="cursor:pointer"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l2-3h4l2 3"/></svg>贴一张照片</label>
            <input type="file" id="photoIn" accept="image/jpeg,image/png,image/webp" hidden>
            <span class="muted" style="font-size:12px">最多 4 张</span>
          </div>
        </section>
        <section class="panel ritual">
          <h4><span>今日的仪式</span><small>おまじない</small></h4>
          <button class="btn shu" id="sealBtn">封存这一页</button>
          <button class="btn" id="replyBtn">请月亮回一封信</button>
          <p id="ritualNote"></p>
        </section>
      </aside>
    </div></div>`;

  let entry = null, reply = null;
  try { ({ entry, reply } = await api.entry(day)); } catch (e) { toast(e.message); }
  let saveTimer = 0, pending = null, saving = false, lastSaved = entry?.updatedAt || 0;
  const page = createPage({ day, entry, editable: true, onChange: snap => { pending = snap; page.setStatus('正在收好…', true); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900); } });
  root.querySelector('#pageHost').append(page.el);
  if (entry?.sealedAt) page.sealMark(entry.sealedAt, false);
  page.setStatus(lastSaved ? `已收好 ${fmtTime(lastSaved)}` : '还是一张白纸', false);

  async function flush() {
    if (!pending || saving) return;
    const snap = pending; pending = null; saving = true;
    try {
      const r = await api.saveEntry(day, { mood: snap.mood, body: snap.body, page: snap.page });
      entry = r.entry; lastSaved = r.entry.updatedAt;
      page.setStatus(`已收好 ${fmtTime(lastSaved)}`, false);
      if (r.crisis) showCare();
    } catch (e) { page.setStatus(e.message, true); pending = pending || snap; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 5000); }
    saving = false;
    if (pending) flush();
  }
  const leave = () => { clearTimeout(saveTimer); if (pending) { const snap = pending; pending = null;
    fetch(`/api/entries/${day}`, { method: 'PUT', keepalive: true, headers: { 'x-sg': '1', 'content-type': 'application/json' }, body: JSON.stringify({ mood: snap.mood, body: snap.body, page: snap.page }) }); } };
  addEventListener('pagehide', leave);

  function showCare() {
    const key = 'sg.care.' + day;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch {}
    const c = h(`<div class="care" role="note"><div><b>这一页好像很沉。</b><br>如果你此刻很难受，可以拨打全国统一心理援助热线 <span class="num">12356</span>，有人愿意听你说；紧急情况请拨打 110 或 120。</div><button aria-label="收起">×</button></div>`);
    c.querySelector('button').addEventListener('click', () => c.remove());
    root.querySelector('#care').replaceChildren(c);
  }

  // 贴纸抽屉
  const grid = root.querySelector('#sgrid');
  const paintGrid = cat => {
    grid.innerHTML = STICKERS.filter(s => s.cat === cat).map(s => `<button type="button" data-k="${s.k}" aria-label="贴上${s.name}" title="${s.name}">${s.svg}</button>`).join('');
    grid.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (page.addSticker(b.dataset.k) === false) toast('这一页贴得满满的啦');
      else if (!quiet()) b.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1.1)' }, { transform: 'none' }], { duration: 400 });
    }));
  };
  paintGrid(CATS[0]);
  root.querySelectorAll('.drawer-tabs button').forEach(t => t.addEventListener('click', () => {
    root.querySelectorAll('.drawer-tabs button').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); }); paintGrid(t.dataset.cat);
  }));

  // 照片：浏览器里先压到 1600px 以内再上传
  root.querySelector('#photoIn').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      toast('照片正在显影…');
      const blob = await shrink(file, 1600);
      const { id } = await api.upload(blob, 'image/jpeg');
      if (page.addPhoto(id) === false) toast('一页最多贴 4 张照片');
    } catch (err) { toast(err.message || '这张照片读不出来，换一张试试'); }
  });

  // 封存
  const sealBtn = root.querySelector('#sealBtn'), note = root.querySelector('#ritualNote');
  const paintRitual = () => {
    sealBtn.textContent = entry?.sealedAt ? '已封存' : '封存这一页'; sealBtn.disabled = !!entry?.sealedAt;
    note.textContent = reply ? '月亮已经回过信了，可以在信箱里重读。' : state.config.ai ? `写完后可以请月亮回信，每天最多 ${state.config.aiDaily} 封。` : '月亮回信即将开放，先封存今天吧。';
    root.querySelector('#replyBtn').textContent = reply ? '重读月亮的回信' : '请月亮回一封信';
  };
  paintRitual();
  sealBtn.addEventListener('click', async () => {
    await flush();
    if (!entry) return toast('先写点什么，或者贴一枚贴纸吧');
    try { const r = await api.seal(day); entry = r.entry; page.sealMark(entry.sealedAt, true); paintRitual(); await sleep(900); toast(`${cnDate(d)}，已封存`, { seal: '封' }); }
    catch (e) { toast(e.message); }
  });

  // 月亮回信
  root.querySelector('#replyBtn').addEventListener('click', async () => {
    if (reply) return openLetter(reply);
    await flush();
    if (!state.config.ai) {
      const m = modal(`<button class="x" data-close aria-label="关闭">×</button><h3>月亮还在路上</h3><p class="muted">回信服务尚未开启。你可以先封存今天，或者写一封时光信给未来的自己。</p><div class="row"><button class="btn" data-close>好的</button><a class="btn ink" href="#/letters">去写时光信</a></div>`);
      m.el.querySelector('a').addEventListener('click', m.close); return;
    }
    const wait = modal(`<div class="moon-wait"><div class="orb"></div><p>月亮正在读你的这一页…</p><p class="muted" style="font-size:13px">回信由 AI 写成</p></div>`);
    if (!quiet()) flyCrane(page.el);
    try {
      const [r] = await Promise.all([api.reply(day), sleep(2600)]);
      reply = r.letter; wait.close(); paintRitual(); refreshCounts();
      await sleep(400); openLetter(reply);
    } catch (e) {
      wait.close();
      if (e.data?.code === 'ai_disabled') { state.config.ai = false; paintRitual(); }
      toast(e.message);
    }
  });

  return () => { leave(); removeEventListener('pagehide', leave); page.destroy(); };
}

async function shrink(file, max) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('这张照片读不出来，换一张 JPG 或 PNG 试试'); });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('照片处理失败')), 'image/jpeg', 0.86));
}

function flyCrane(from) {
  const r = from.getBoundingClientRect();
  const c = h(`<svg class="crane-fly" viewBox="0 0 140 110"><path d="M70 60L20 10l44 30z" fill="#E7B3B6"/><path d="M70 60L64 40 20 10z" fill="#C98E95"/><path d="M70 60l58-48-40 36z" fill="#A79AC8"/><path d="M70 60l18-12 40-36z" fill="#8A7DAE"/><path d="M70 60l-40 30 26-4z" fill="#E7B3B6"/><path d="M70 60l40 20-28 4z" fill="#A79AC8"/></svg>`);
  c.style.left = (r.left + r.width * .5) + 'px'; c.style.top = (r.top + Math.min(r.height, innerHeight) * .5) + 'px';
  document.body.append(c);
  c.animate([{ transform: 'translate(0,0) scale(.6) rotate(0)', opacity: 0 }, { transform: 'translate(-40px,-60px) scale(1) rotate(-8deg)', opacity: 1, offset: .2 },
    { transform: `translate(${innerWidth * .2}px,-${innerHeight * .5}px) scale(.5) rotate(10deg)`, opacity: 0 }], { duration: 2400, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(() => c.remove());
}
