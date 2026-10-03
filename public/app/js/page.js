// 手帐页：渲染（只读 / 可编辑）+ 贴纸与照片的拖拽、旋转、缩放
import { photoUrl } from './site.js';
import { h, esc, quiet } from './ui.js';
import { STICKER_MAP } from './stickers.js';
import { MOODS, faceSvg } from './faces.js';
import { parseDay, termOf, moonOf, moonPath, lunarOf, WEEK, cnDate } from './calendar.js';

const WEATHER = [['晴', 'sun'], ['云', 'cloud'], ['雨', 'rain'], ['雪', 'snow'], ['风', 'wind'], ['雾', 'fog']];
export const PROMPTS = ['今天有什么值得被记住的小事？', '此刻窗外是什么样子？', '今天，谁让你笑了一下？', '如果给今天起个名字，会叫什么？',
  '身体今天感觉怎么样？', '有什么话想留给明天的自己？', '今天吃到的最好吃的东西是什么？', '这个节气，你注意到了哪些变化？',
  '今天有没有一个想停下来多看一会儿的瞬间？', '最近在期待什么？', '今天放过自己的一件事是？', '如果今天是一种颜色，会是什么颜色？'];

let uid = 0;
// 同一枚贴纸会出现多次，给 SVG 内部 id 加上唯一后缀，避免引用串到别的实例
export const uniqSvg = svg => { const s = '_' + (++uid).toString(36); return svg.replace(/id="([^"]+)"/g, `id="$1${s}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${s})`); };
const newId = () => Math.random().toString(36).slice(2, 10);

// 纸张的逻辑尺寸：所有设备按同一宽度排版，再整体缩放，文字换行与贴纸位置处处一致
export const LW = 760, LH = 1040;

export function createPage({ day, entry, editable = false, onChange, promptIndex }) {
  const d = parseDay(day), term = termOf(d), moon = moonOf(d), lunar = lunarOf(d);
  const data = { mood: entry?.mood || '', body: entry?.body || '', page: { stickers: [], photos: [], weather: '', ...(entry?.page || {}) } };
  let selected = null, k = 1, suggest = '', wxTouched = !!data.page.weather;
  const frame = h(`<div class="page-frame"></div>`);
  const el = h(`<article class="page" aria-label="${d.getMonth() + 1}月${d.getDate()}日的手帐">
    <div class="page-head">
      <div class="date-big">${String(d.getDate()).padStart(2, '0')}</div>
      <div class="date-meta"><b>${cnDate(d)} · 星期${WEEK[d.getDay()]}</b><span>${esc(lunar.year)}${esc(lunar.month)}${esc(lunar.day)} · ${term.name} · ${term.hou}</span></div>
      <div class="right">
        <div class="weather" role="group" aria-label="天气">${WEATHER.map(([c]) => `<button type="button" data-w="${c}" aria-label="${c}" aria-pressed="false" ${editable ? '' : 'disabled'}>${c}</button>`).join('')}</div>
        <svg class="moon-ico" viewBox="0 0 40 40" aria-label="月相：${moon.name}"><circle cx="20" cy="20" r="15" fill="var(--line)"/><path d="${moonPath(moon.phase, 20, 20, 15)}" fill="#F1CF7A"/></svg>
      </div>
    </div>
    <div class="moods" role="group" aria-label="今天的心情">${MOODS.map(m => `<button type="button" class="mood" data-m="${m.k}" aria-pressed="false" ${editable ? '' : 'disabled'}>${faceSvg(m)}<span>${m.n}</span></button>`).join('')}</div>
    ${editable ? `<p class="prompt-line"><span class="q"></span><button type="button" class="swap">换一个</button></p>
      <label class="sr" for="writing-${day}">今天的手帐</label>
      <textarea class="writing" id="writing-${day}" placeholder="慢慢写，写什么都可以。" spellcheck="false" maxlength="20000"></textarea>`
      : `<p class="read-body"></p>`}
    <div class="page-foot"><span class="saved"><i></i><span class="st">${editable ? '已收好' : ''}</span></span><span class="count"></span></div>
    <div class="layer"></div>
  </article>`);
  frame.append(el);
  const layer = el.querySelector('.layer'), ta = el.querySelector('.writing');

  const paintMood = () => el.querySelectorAll('.mood').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === data.mood));
  const paintWeather = () => el.querySelectorAll('.weather button').forEach(b => { const on = b.dataset.w === data.page.weather; b.classList.toggle('on', on); b.classList.toggle('suggest', !data.page.weather && b.dataset.w === suggest); b.setAttribute('aria-pressed', on); });
  const paintCount = () => { el.querySelector('.count').textContent = data.body ? `${[...data.body.replace(/\s/g, '')].length} 字` : ''; };
  const fit = () => {
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.max(380, ta.scrollHeight + 8) + 'px'; }
    k = Math.min(1, (frame.clientWidth || LW) / LW);
    el.style.transform = k < 1 ? `scale(${k})` : '';
    frame.style.height = Math.ceil(el.offsetHeight * k) + 'px';
    frame.classList.toggle('small', k < 0.86);
  };
  // 当天还没选天气时，第一次动笔就把实时天气落到纸上（用户自己点过天气则不再干预）
  const changed = () => { if (suggest && !wxTouched && !data.page.weather) { data.page.weather = suggest; wxTouched = true; paintWeather(); } paintCount(); onChange?.(snapshot()); };
  const snapshot = () => JSON.parse(JSON.stringify(data));

  paintMood(); paintWeather();
  if (!editable) el.querySelector('.saved').remove();
  if (ta) ta.value = data.body;
  else el.querySelector('.read-body').textContent = data.body || '这一页没有写字，只留下了心情和贴纸。';
  paintCount();

  // 小屏幕：纸张缩小后字太小，点正文时打开一张全屏书写纸
  function openSheet() {
    if (document.querySelector('.write-sheet')) return;
    const sheet = h(`<div class="write-sheet" role="dialog" aria-modal="true" aria-label="书写">
      <div class="ws-top"><span>${cnDate(d)} · ${term.name}</span><button type="button" class="btn small ink">写好了</button></div>
      <p class="ws-q">${esc(el.querySelector('.prompt-line .q')?.textContent || '')}</p>
      <textarea class="ws-ta" maxlength="20000" placeholder="慢慢写，写什么都可以。" spellcheck="false"></textarea></div>`);
    const t = sheet.querySelector('textarea'); t.value = data.body;
    t.addEventListener('input', () => { data.body = t.value; ta.value = t.value; changed(); });
    const close = () => { sheet.classList.add('out'); setTimeout(() => { sheet.remove(); fit(); }, 320); };
    sheet.querySelector('button').addEventListener('click', close);
    sheet.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.append(sheet); setTimeout(() => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 60);
  }

  if (editable) {
    let pi = promptIndex ?? (d.getDate() + d.getMonth()) % PROMPTS.length;
    const q = el.querySelector('.prompt-line .q');
    const showQ = () => { q.textContent = '今日小问 · ' + PROMPTS[pi % PROMPTS.length]; };
    showQ();
    el.querySelector('.swap').addEventListener('click', () => { pi++; q.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 400 }); showQ(); });
    el.querySelectorAll('.mood').forEach(b => b.addEventListener('click', () => {
      data.mood = data.mood === b.dataset.m ? '' : b.dataset.m; paintMood();
      if (!quiet()) b.querySelector('svg').animate([{ transform: 'scale(.7) rotate(10deg)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1.18)' }], { duration: 600, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      changed();
    }));
    el.querySelectorAll('.weather button').forEach(b => b.addEventListener('click', () => { wxTouched = true; data.page.weather = data.page.weather === b.dataset.w ? '' : b.dataset.w; paintWeather(); changed(); }));
    ta.addEventListener('input', () => { data.body = ta.value; fit(); changed(); });
    ta.addEventListener('pointerdown', e => { if (k < 0.86) { e.preventDefault(); openSheet(); } });
    ta.addEventListener('focus', () => { if (k < 0.86) { ta.blur(); openSheet(); } });
    el.addEventListener('pointerdown', e => { if (!e.target.closest('.stk')) select(null); });
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (!selected || !el.isConnected) return;
    if (/input|textarea/i.test(document.activeElement?.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeItem(selected); }
    if (e.key === 'Escape') select(null);
  }

  // ---------- 贴纸与照片（坐标以纸张逻辑宽度为单位） ----------
  const nodes = new Map();
  function sizeOf(item) {
    if (item.type === 'photo') { const pw = 0.26 * LW; return [pw, pw * 1.22]; }
    const def = STICKER_MAP[item.k]; if (!def) return [0, 0];
    const sw = def.w * LW * (item.s || 1); return [sw, sw * def.ar];
  }
  function place(item, node) {
    const [sw, sh] = sizeOf(item);
    node.style.width = sw + 'px'; node.style.height = sh + 'px';
    const tf = `translate(${(item.x * LW - sw / 2).toFixed(1)}px, ${(item.y * LW - sh / 2).toFixed(1)}px) rotate(${(item.r || 0).toFixed(1)}deg)`;
    node.style.setProperty('--tf', tf); node.style.transform = tf;
  }
  function render(item, land) {
    let node;
    if (item.type === 'photo') {
      node = h(`<div class="stk photo-stk${land ? ' dev' : ''}" tabindex="${editable ? 0 : -1}" aria-label="照片"><img alt="手帐里的照片" src="${photoUrl(item.id)}" draggable="false" loading="lazy"><span class="cap">${esc(item.cap || '')}</span></div>`);
    } else {
      const def = STICKER_MAP[item.k]; if (!def) return;
      node = h(`<div class="stk" tabindex="${editable ? 0 : -1}" aria-label="贴纸：${def.name}">${uniqSvg(def.svg)}</div>`);
    }
    if (editable) {
      node.append(h(`<button type="button" class="hdl del" aria-label="撕掉">×</button>`), h(`<span class="hdl rot" aria-label="旋转缩放"><svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-2-4M11 1v3h3"/></svg></span>`));
      bindDrag(item, node);
    }
    nodes.set(item, node); layer.append(node); place(item, node);
    if (land && !quiet()) { node.classList.add('land'); node.addEventListener('animationend', () => node.classList.remove('land'), { once: true }); }
  }
  function select(item) {
    if (selected) nodes.get(selected)?.classList.remove('sel');
    selected = item;
    if (item) { const n = nodes.get(item); n.classList.add('sel'); layer.append(n); }
  }
  function removeItem(item) {
    const node = nodes.get(item); if (!node) return;
    const list = item.type === 'photo' ? data.page.photos : data.page.stickers;
    list.splice(list.indexOf(item), 1); nodes.delete(item); if (selected === item) selected = null;
    if (quiet()) node.remove(); else { node.classList.add('peel'); setTimeout(() => node.remove(), 450); }
    changed();
  }
  function bindDrag(item, node) {
    node.querySelector('.del').addEventListener('pointerdown', e => e.stopPropagation());
    node.querySelector('.del').addEventListener('click', e => { e.stopPropagation(); removeItem(item); });
    const rot = node.querySelector('.rot');
    rot.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault(); rot.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect(), cx = r.left + item.x * LW * k, cy = r.top + item.y * LW * k;
      const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), d0 = Math.hypot(e.clientX - cx, e.clientY - cy), r0 = item.r || 0, s0 = item.s || 1;
      const move = ev => {
        item.r = Math.max(-180, Math.min(180, r0 + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI));
        if (item.type !== 'photo') item.s = Math.max(0.4, Math.min(2.5, s0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0));
        place(item, node);
      };
      const up = () => { rot.removeEventListener('pointermove', move); rot.removeEventListener('pointerup', up); changed(); };
      rot.addEventListener('pointermove', move); rot.addEventListener('pointerup', up);
    });
    node.addEventListener('pointerdown', e => {
      if (e.target.closest('.hdl')) return;
      e.preventDefault(); e.stopPropagation(); select(item); node.setPointerCapture(e.pointerId); node.classList.add('drag');
      const sx = e.clientX, sy = e.clientY, x0 = item.x, y0 = item.y, maxY = el.offsetHeight / LW + 0.05; let moved = false;
      const move = ev => {
        const dx = (ev.clientX - sx) / (LW * k), dy = (ev.clientY - sy) / (LW * k); if (Math.abs(dx) + Math.abs(dy) > 0.003) moved = true;
        item.x = Math.max(-0.05, Math.min(1.05, x0 + dx)); item.y = Math.max(-0.05, Math.min(maxY, y0 + dy)); place(item, node);
      };
      const up = () => { node.classList.remove('drag'); node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); if (moved) changed(); };
      node.addEventListener('pointermove', move); node.addEventListener('pointerup', up);
    });
    node.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.03 : 0.008, map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (map[e.key]) { e.preventDefault(); e.stopPropagation(); item.x += map[e.key][0]; item.y += map[e.key][1]; place(item, node); changed(); }
    });
    node.addEventListener('focus', () => select(item));
  }
  data.page.stickers.forEach(s => render(s, false));
  data.page.photos.forEach(p => { p.type = 'photo'; render(p, false); });

  const ro = new ResizeObserver(fit);
  ro.observe(frame);
  requestAnimationFrame(fit);

  // 新贴纸落在纸张当前可见的区域里
  function freeSpot(wFrac) {
    const r = el.getBoundingClientRect(), hFrac = el.offsetHeight / LW, s = LW * k;
    const top = Math.max(0.12, (Math.max(0, -r.top) + 80) / s), bot = Math.min(hFrac - 0.08, (Math.min(r.height, innerHeight - r.top) - 60) / s);
    const y = bot > top ? top + Math.random() * (bot - top) : Math.min(hFrac - 0.1, 0.5);
    return { x: 0.14 + Math.random() * 0.72, y, r: (Math.random() - 0.5) * 24 * (wFrac > 0.2 ? 0.3 : 1) };
  }
  return {
    suggestWeather(c) { if (!editable) return; suggest = c || ''; paintWeather(); },
    el: frame, page: el,
    data: snapshot,
    addSticker(kk) {
      const def = STICKER_MAP[kk]; if (!def) return;
      if (data.page.stickers.length >= 80) return false;
      const item = { id: newId(), k: kk, s: 1, ...freeSpot(def.w) };
      data.page.stickers.push(item); render(item, true); select(item); changed(); return true;
    },
    addPhoto(id) {
      if (data.page.photos.length >= 4) return false;
      const item = { id, type: 'photo', cap: `${d.getMonth() + 1}.${d.getDate()}`, ...freeSpot(.26) };
      data.page.photos.push(item); render(item, true); select(item); changed(); return true;
    },
    setStatus(text, busy) { const s = el.querySelector('.saved'); if (!s) return; s.classList.toggle('busy', !!busy); s.querySelector('.st').textContent = text; },
    sealMark(ts, animate) {
      el.querySelector('.page-seal')?.remove();
      const dd = new Date(ts);
      const mark = h(`<div class="page-seal" aria-label="已封存"><div><b>封</b>${dd.getMonth() + 1}月${dd.getDate()}日</div></div>`);
      el.append(mark);
      if (animate && !quiet()) {
        el.classList.add('sealing'); mark.classList.add('slam');
        setTimeout(() => { const b = h('<span class="ink-burst"></span>'); b.style.left = (mark.offsetLeft + mark.offsetWidth / 2) + 'px'; b.style.top = (mark.offsetTop + mark.offsetHeight / 2) + 'px'; el.append(b); setTimeout(() => b.remove(), 900); }, 380);
        setTimeout(() => el.classList.remove('sealing'), 700);
      }
    },
    fit,
    destroy() { ro.disconnect(); document.removeEventListener('keydown', onKey); }
  };
}

// 书架上的缩略页
export function miniPage(entry, i, todayKey) {
  const d = parseDay(entry.day);
  const ex = (entry.body || '').replace(/\s+/g, ' ').slice(0, 60);
  const m = MOODS.find(x => x.k === entry.mood);
  const items = [...(entry.page?.stickers || []).slice(0, 5), ...(entry.page?.photos || []).slice(0, 1).map(p => ({ ...p, type: 'photo' }))];
  const stk = items.map(it => {
    if (it.type === 'photo') return `<span class="stk-mini" style="left:${(it.x * 100 - 13).toFixed(1)}%;top:${(it.y * 75 - 12).toFixed(1)}%;width:26%;transform:rotate(${it.r || 0}deg);background:#fff;padding:2%"><img src="${photoUrl(it.id)}" alt="" loading="lazy" style="aspect-ratio:1;object-fit:cover"></span>`;
    const def = STICKER_MAP[it.k]; if (!def) return '';
    const w = def.w * (it.s || 1) * 100;
    return `<span class="stk-mini" style="left:${(it.x * 100 - w / 2).toFixed(1)}%;top:${(it.y * 75 - w * def.ar * .75 / 2).toFixed(1)}%;width:${w.toFixed(1)}%;aspect-ratio:${1 / def.ar};transform:rotate(${it.r || 0}deg)">${uniqSvg(def.svg)}</span>`;
  }).join('');
  return `<button type="button" class="mini${entry.day === todayKey ? ' today-mark' : ''}" style="--i:${i}" data-day="${entry.day}" aria-label="${d.getMonth() + 1}月${d.getDate()}日${m ? '，' + m.n : ''}">
    <span class="n">${d.getDate()}</span>${m ? `<span class="md" style="background:${m.c}"></span>` : ''}<span class="ex">${esc(ex)}</span>${stk}${entry.sealedAt ? '<span class="sealed">封</span>' : ''}</button>`;
}
