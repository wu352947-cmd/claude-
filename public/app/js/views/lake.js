// 灯海：大家匿名放下的心愿灯，漂在同一片夜湖上，七天后漂远
// 画面 = 画布（夜空、远山、月亮与倒影、远处灯火、涟漪）+ 一盏盏可点的河灯（DOM，按远近缩放、漂移、起伏）
import { api } from '../api.js';
import { h, esc, toast, modal, confirmBox, quiet } from '../ui.js';
import { state } from '../main.js';
import { breathe } from '../calm.js';

const HUES = [['#F7C6CD', '#E48C9C'], ['#F8DC9C', '#E2A64A'], ['#CBE3D3', '#86B39C'], ['#DDD4F3', '#A497D3'], ['#F7CDB0', '#E39566']];
let uid = 0;
export function lanternSvg(hue = 0) {
  const [a, b] = HUES[hue % HUES.length], id = 'lt' + (++uid);
  const petal = (rot, dx, sc, fill) => `<path d="M0 0C-9-6-10-22 0-34C10-22 9-6 0 0z" fill="${fill}" transform="translate(${50 + dx} 70) rotate(${rot}) scale(${sc})"/>`;
  return `<svg viewBox="0 0 100 90" aria-hidden="true"><defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4D6"/><stop offset=".45" stop-color="#FFD98A" stop-opacity=".8"/><stop offset="1" stop-color="#FFB85C" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="50" cy="74" rx="34" ry="7" fill="${b}" opacity=".55"/>
    ${[-62, -36, 36, 62].map((r, i) => petal(r, [-10, -6, 6, 10][i], .95, `url(#${id}a)`)).join('')}
    <circle class="lt-core" cx="50" cy="52" r="22" fill="url(#${id}g)"/>
    <rect x="46" y="50" width="8" height="16" rx="2" fill="#FFF6E4"/>
    <path class="lt-flame" d="M50 36c4 5 5 9 0 13-5-4-4-8 0-13z" fill="#FFC85A"/>
    ${[-20, 0, 20].map((r, i) => petal(r, [-7, 0, 7][i], 1.05, `url(#${id}a)`)).join('')}
  </svg>`;
}

const ago = ts => { const m = (Date.now() - ts) / 60000; return m < 60 ? '刚刚' : m < 1440 ? `${Math.floor(m / 60)} 小时前` : `${Math.floor(m / 1440)} 天前`; };
const R = (a, b) => a + Math.random() * (b - a);

export async function lakeView(root) {
  root.innerHTML = `<div class="lake-view view-in">
    <div class="lake" id="lake">
      <canvas class="lake-sky" aria-hidden="true"></canvas>
      <div class="lake-lights" id="lights" role="list" aria-label="湖上的心愿灯"></div>
      <div class="lake-head"><p class="h-eyebrow">とうろう</p><h1 class="h-title">灯海</h1>
        <p class="lake-sub">把心愿放进湖里。灯是匿名的，大家看不到你是谁；七天后，它会慢慢漂远。</p>
        <p class="lake-stat" id="stat"></p></div>
      <button type="button" class="btn ink lake-go" id="launch"><svg viewBox="0 0 24 24"><path d="M12 3c2 3 3 5 0 8-3-3-2-5 0-8zM5 14c2 4 12 4 14 0M3 18c3 3 15 3 18 0"/></svg>放一盏灯</button>
      ${state.config.demo ? '<p class="lake-demo">试玩版的灯海是示例，你放的灯只存在这台设备上</p>' : ''}
    </div></div>`;
  const lake = root.querySelector('#lake'), cv = lake.querySelector('canvas'), ctx = cv.getContext('2d'), lights = root.querySelector('#lights');
  const still = quiet();
  let W = 0, H = 0, HZ = 0, dpr = 1, bg = null, raf = 0, alive = true, card = null;
  let stars = [], far = [], ripples = [], items = [];

  // ---------- 画布：静态部分预渲染，动态部分每帧画 ----------
  function ridge(seed, amp, base, rough) {
    const pts = [];
    for (let x = 0; x <= W + 8; x += 8) {
      const u = x / W;
      pts.push(base - amp * (.55 * Math.sin(u * 3.1 + seed) + .3 * Math.sin(u * 7.3 + seed * 2.1) + rough * Math.sin(u * 19 + seed * 3.7) + .25) );
    }
    return pts;
  }
  function paintStatic() {
    bg = document.createElement('canvas'); bg.width = W * dpr; bg.height = H * dpr;
    const g = bg.getContext('2d'); g.scale(dpr, dpr);
    let gr = g.createLinearGradient(0, 0, 0, HZ);
    gr.addColorStop(0, '#11172A'); gr.addColorStop(.55, '#272D50'); gr.addColorStop(1, '#5E5274'); g.fillStyle = gr; g.fillRect(0, 0, W, HZ + 1);
    gr = g.createRadialGradient(W * .5, HZ, 0, W * .5, HZ, W * .6); gr.addColorStop(0, 'rgba(236,160,118,.38)'); gr.addColorStop(1, 'rgba(236,160,118,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, HZ);
    // 月亮
    const mx = W * .8, my = H * .13, mr = Math.max(14, Math.min(W, H) * .038);
    gr = g.createRadialGradient(mx, my, mr * .8, mx, my, mr * 6); gr.addColorStop(0, 'rgba(246,227,176,.32)'); gr.addColorStop(1, 'rgba(246,227,176,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, HZ); g.fillStyle = '#F7E8C2'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    g.fillStyle = 'rgba(200,180,140,.25)'; for (const [dx, dy, r] of [[-.3, -.2, .22], [.25, .15, .16], [-.05, .35, .12]]) { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 7); g.fill(); }
    // 远山三层，水墨般由远及近加深
    [[1.3, HZ * .2, HZ, .35, 'rgba(78,84,124,.85)'], [4.2, HZ * .13, HZ, .2, 'rgba(47,52,86,.95)'], [7.7, HZ * .07, HZ + 1, .12, '#1D2238']].forEach(([seed, amp, base, rough, col]) => {
      const pts = ridge(seed, amp, base, rough); g.fillStyle = col; g.beginPath(); g.moveTo(0, HZ + 2);
      pts.forEach((y, i) => g.lineTo(i * 8, y)); g.lineTo(W, HZ + 2); g.closePath(); g.fill();
    });
    // 湖面
    gr = g.createLinearGradient(0, HZ, 0, H); gr.addColorStop(0, '#2A3352'); gr.addColorStop(.35, '#1A2139'); gr.addColorStop(1, '#0E1322');
    g.fillStyle = gr; g.fillRect(0, HZ, W, H - HZ);
    gr = g.createLinearGradient(0, HZ, 0, HZ + 30); gr.addColorStop(0, 'rgba(236,160,118,.25)'); gr.addColorStop(1, 'rgba(236,160,118,0)'); g.fillStyle = gr; g.fillRect(0, HZ, W, 30);
    stars = Array.from({ length: Math.round(W * HZ / 2600) }, () => ({ x: R(0, W), y: R(0, HZ * .85), s: R(.3, 1.2), ph: R(0, 7) }));
    far = Array.from({ length: Math.round(W / 14) }, () => ({ x: R(0, W), d: Math.pow(Math.random(), 1.8), v: R(.004, .012), ph: R(0, 7), c: Math.random() < .5 ? '255,205,130' : '255,170,140' }));
  }
  function frame(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    for (const s of stars) { ctx.globalAlpha = .35 + .5 * Math.sin(t / 900 + s.ph) ** 2; ctx.fillStyle = '#F4ECD8'; ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 7); ctx.fill(); }
    // 月亮碎在水里的倒影
    const mx = W * .8, mr = Math.max(14, Math.min(W, H) * .038);
    for (let y = HZ + 4, i = 0; y < H; y += 5, i++) {
      const k = (y - HZ) / (H - HZ), w = mr * (1.2 + k * 3) * (.6 + .4 * Math.sin(t / 700 + i * 1.7));
      ctx.globalAlpha = (1 - k) * .55 * (.5 + .5 * Math.sin(t / 500 + i * 2.3)); ctx.fillStyle = '#F6E3B0';
      ctx.fillRect(mx - w / 2 + Math.sin(t / 900 + i) * 6 * k, y, w, 1.6);
    }
    // 粼粼水纹
    ctx.strokeStyle = '#9FB2D8'; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const k = (i + (t / 6000) % 1) / 26, y = HZ + (H - HZ) * k ** 1.7;
      ctx.globalAlpha = .05 + .07 * k; ctx.beginPath();
      for (let x = 0; x <= W; x += 24) { const yy = y + Math.sin(x / 60 + t / 1500 + i) * (1 + k * 3); x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
    // 远处的灯火：靠近地平线的小光点，像一整片灯海
    for (const f of far) {
      f.x += f.v * (1 + f.d * 3); if (f.x > W + 4) f.x = -4;
      const y = HZ + 4 + f.d * (H - HZ) * .18, r = .8 + f.d * 2.2;
      ctx.globalAlpha = .55 + .35 * Math.sin(t / 400 + f.ph);
      const g = ctx.createRadialGradient(f.x, y, 0, f.x, y, r * 4); g.addColorStop(0, `rgba(${f.c},.95)`); g.addColorStop(1, `rgba(${f.c},0)`);
      ctx.fillStyle = g; ctx.fillRect(f.x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.globalAlpha *= .4; ctx.fillRect(f.x - r * .6, y + r * 2, r * 1.2, r * 4);
    }
    // 放灯时荡开的涟漪
    ripples = ripples.filter(r => t - r.t0 < 3200);
    for (const r of ripples) {
      const p = (t - r.t0) / 3200;
      for (let k = 0; k < 3; k++) { const q = p - k * .12; if (q <= 0) continue;
        ctx.globalAlpha = (1 - q) * .5; ctx.strokeStyle = '#FFE2A8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(r.x, r.y, q * r.s * 140, q * r.s * 26, 0, 0, 7); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 灯 ----------
  const place = (L, t) => {
    const z = L.z, y = HZ + (H - HZ) * (.07 + .86 * Math.pow(z, 1.25)), s = .3 + .8 * z;
    const x = ((L.x % 1) + 1) % 1 * (W + 160) - 80;
    const bob = still ? 0 : Math.sin(t / 1100 + L.ph) * 3 * s;
    L.sx = x; L.sy = y; L.ss = s;
    L.el.style.transform = `translate(${x.toFixed(1)}px,${(y + bob).toFixed(1)}px) scale(${s.toFixed(3)})`;
    L.el.style.zIndex = Math.round(z * 100);
    L.el.style.opacity = (.6 + .4 * z).toFixed(2);
  };
  function addLantern(d, opts = {}) {
    const el = h(`<button type="button" class="lantern${d.mine ? ' mine' : ''}${d.status === 'pending' || d.status === 'private' ? ' dim' : ''}" role="listitem"
      aria-label="${d.mine ? '我的灯' : '一盏心愿灯'}：${esc([...d.text].slice(0, 12).join(''))}"><i class="lt-halo"></i><i class="lt-refl"></i>${lanternSvg(d.hue)}${d.mine ? `<em>${d.status === 'pending' ? '待放行' : d.status === 'private' ? '只有你' : '我的'}</em>` : ''}</button>`);
    el.style.setProperty('--fl', R(.8, 1.4).toFixed(2) + 's'); el.style.setProperty('--fd', R(0, 1).toFixed(2) + 's');
    const L = { d, el, x: opts.x ?? Math.random(), z: opts.z ?? (d.mine ? R(.62, .9) : Math.pow(Math.random(), .8) * .9 + .04), ph: R(0, 7), v: R(.000004, .00001) };
    el.addEventListener('click', e => { e.stopPropagation(); openCard(L); });
    lights.append(el); items.push(L); place(L, performance.now());
    return L;
  }
  let last = performance.now();
  function loop(t) {
    if (!alive) return;
    const dt = Math.min(64, t - last); last = t;
    frame(t);
    for (const L of items) {
      if (L.launch) { const p = Math.min(1, (t - L.launch.t0) / 4200), e = 1 - (1 - p) ** 3; L.z = L.launch.from + (L.launch.to - L.launch.from) * e; L.x = L.launch.x0 + .05 * e; if (p >= 1) L.launch = null; }
      else L.x += L.v * dt * (.4 + L.z);
      place(L, t);
    }
    if (card) positionCard();
    raf = requestAnimationFrame(loop);
  }
  function resize() {
    const r = lake.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; HZ = H * (W < 600 ? .36 : .4);
    cv.width = W * dpr; cv.height = H * dpr; paintStatic();
    if (still) { frame(0); items.forEach(L => place(L, 0)); }
  }
  const ro = new ResizeObserver(resize); ro.observe(lake); resize();

  // ---------- 数据 ----------
  let lanterns = [];
  try { ({ lanterns } = await api.lanterns()); } catch (e) { toast(e.message); }
  if (!alive) return;
  lanterns.forEach(d => addLantern(d));
  const paintStat = () => {
    const others = items.filter(L => !L.d.mine).length, mine = items.filter(L => L.d.mine), warm = mine.reduce((a, L) => a + (L.d.warmth || 0), 0);
    root.querySelector('#stat').innerHTML = items.length ? `今晚湖上有 <b>${others + mine.length}</b> 盏灯${mine.length ? ` · 你的灯收到了 <b>${warm}</b> 份温暖` : ''}` : '湖面还很安静。放下第一盏灯吧。';
  };
  paintStat();
  if (still) { frame(0); } else raf = requestAnimationFrame(loop);

  // ---------- 点开一盏灯 ----------
  function closeCard() { if (!card) return; const c = card; card = null; items.forEach(L => L.el.classList.remove('sel')); c.el.classList.add('out'); setTimeout(() => c.el.remove(), 260); }
  function positionCard() {
    const { el, L } = card, lr = lake.getBoundingClientRect();
    if (innerWidth < 600) { el.style.left = '12px'; el.style.right = '12px'; el.style.bottom = '12px'; el.style.top = 'auto'; return; }
    const cw = el.offsetWidth, ch = el.offsetHeight, ax = L.sx, ay = L.sy - 96 * L.ss;
    let x = Math.min(W - cw - 12, Math.max(12, ax - cw / 2)), y = ay - ch - 14;
    if (y < 12) y = Math.min(H - ch - 12, L.sy + 16);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    void lr;
  }
  function openCard(L) {
    if (card?.L === L) return closeCard();
    closeCard();
    const d = L.d;
    const statusText = { pending: '正在等看护人放行，现在只有你看得见', private: '这盏灯只有你看得见', visible: d.warmth ? `已经收到 ${d.warmth} 份温暖` : '还没有人路过' }[d.status] || '';
    const el = h(`<div class="wish-card" role="dialog" aria-label="心愿">
      <button type="button" class="x" aria-label="关闭">×</button>
      <p class="wish-text">${esc(d.text)}</p>
      <p class="wish-meta">${ago(d.at)}放下${d.mine ? ` · ${statusText}` : d.warmth ? ` · 已有 <b class="wn">${d.warmth}</b> 份温暖` : ' · 还没有人路过'}</p>
      <div class="wish-act">${d.mine ? '<button type="button" class="btn small" data-a="recall">收回这盏灯</button>'
        : `<button type="button" class="btn small acc" data-a="warm" ${d.warmed ? 'disabled' : ''}>${d.warmed ? '已添过光' : '添一点光'}</button><button type="button" class="linkish" data-a="report">举报</button>`}</div></div>`);
    lake.append(el); card = { el, L }; L.el.classList.add('sel'); positionCard();
    el.querySelector('.x').addEventListener('click', closeCard);
    el.querySelector('[data-a="warm"]')?.addEventListener('click', async e => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await api.warmLantern(d.id); d.warmth = r.warmth; d.warmed = true; b.textContent = '已添过光';
        sparks(b, L); setTimeout(() => { L.el.classList.remove('glow'); void L.el.offsetWidth; L.el.classList.add('glow'); }, still ? 0 : 900);
        el.querySelector('.wish-meta').innerHTML = `${ago(d.at)}放下 · 已有 <b class="wn">${d.warmth}</b> 份温暖`;
      } catch (ex) { toast(ex.message); b.disabled = false; }
    });
    el.querySelector('[data-a="report"]')?.addEventListener('click', async () => {
      if (!(await confirmBox('举报这盏灯？', '如果它让你不舒服，或者内容不合适，看护人会尽快复核。', '举报', true))) return;
      try { await api.reportLantern(d.id, '不适宜'); closeCard(); fade(L); toast('谢谢你，看护人会尽快看看它'); } catch (ex) { toast(ex.message); }
    });
    el.querySelector('[data-a="recall"]')?.addEventListener('click', async () => {
      if (!(await confirmBox('收回这盏灯？', '收回后，它会从湖面上熄灭。', '收回'))) return;
      try { await api.deleteLantern(d.id); closeCard(); fade(L); } catch (ex) { toast(ex.message); }
    });
  }
  const fade = L => { L.el.classList.add('gone'); setTimeout(() => { L.el.remove(); items = items.filter(x => x !== L); paintStat(); }, 900); };
  // 添光：一串光点从按钮飞向那盏灯
  function sparks(btn, L) {
    if (still) return;
    const b = btn.getBoundingClientRect(), lr = lake.getBoundingClientRect();
    const tx = lr.left + L.sx, ty = lr.top + L.sy - 50 * L.ss;
    for (let i = 0; i < 12; i++) {
      const s = h('<i class="spark"></i>'); document.body.append(s);
      const x0 = b.left + b.width / 2 + R(-20, 20), y0 = b.top + R(0, b.height), mx = (x0 + tx) / 2 + R(-80, 80), my = Math.min(y0, ty) - R(30, 110);
      s.animate([{ transform: `translate(${x0}px,${y0}px) scale(.4)`, opacity: 0 }, { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: .45 }, { transform: `translate(${tx + R(-8, 8)}px,${ty}px) scale(.3)`, opacity: .2 }],
        { duration: R(800, 1100), delay: i * 40, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(() => s.remove());
    }
  }
  const onDoc = e => { if (card && !card.el.contains(e.target)) closeCard(); };
  const onKey = e => { if (e.key === 'Escape') closeCard(); };
  document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey);

  // ---------- 放一盏灯 ----------
  root.querySelector('#launch').addEventListener('click', () => {
    let hue = Math.floor(Math.random() * HUES.length);
    const m = modal(`<button class="x" data-close aria-label="关闭">×</button>
      <h3>放一盏灯</h3>
      <div class="lt-preview" style="--lit:0"><i class="lt-halo"></i><span class="pv">${lanternSvg(hue)}</span></div>
      <div class="hues" role="radiogroup" aria-label="灯的颜色">${HUES.map(([a, b], i) => `<button type="button" role="radio" data-h="${i}" style="--a:${a};--b:${b}" aria-checked="${i === hue}" aria-label="颜色 ${i + 1}"></button>`).join('')}</div>
      <form style="display:grid;gap:10px">
        <div class="field"><label for="wish" class="sr">心愿</label><textarea id="wish" maxlength="50" rows="2" placeholder="写下一个心愿，或者想对世界说的一句话"></textarea><span class="wc">0 / 50</span></div>
        <p class="muted" style="font-size:12px;margin:0">灯是匿名的。为了让湖面干净温柔，每盏灯都会经过看护，请不要写联系方式。</p>
        <p class="err"></p>
        <div class="row" style="margin-top:0"><button type="button" class="btn" data-close>先不放</button><button class="btn ink">放进湖里</button></div>
      </form>`);
    const pv = m.el.querySelector('.lt-preview'), ta = m.el.querySelector('#wish'), wc = m.el.querySelector('.wc');
    const paintHue = () => { m.el.querySelector('.pv').innerHTML = lanternSvg(hue); m.el.querySelectorAll('.hues button').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.h) === hue)); };
    m.el.querySelectorAll('.hues button').forEach(b => b.addEventListener('click', () => { hue = Number(b.dataset.h); paintHue(); }));
    ta.addEventListener('input', () => { const n = [...ta.value].length; wc.textContent = `${n} / 50`; pv.style.setProperty('--lit', Math.min(1, n / 16).toFixed(2)); });
    setTimeout(() => ta.focus(), 80);
    m.el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const err = m.el.querySelector('.err'); err.textContent = '';
      const text = ta.value.trim(); if ([...text].length < 2) return (err.textContent = '写一两句心愿吧');
      try {
        const r = await api.sendLantern({ text, hue });
        r.lantern.hue = r.lantern.hue ?? hue;
        m.close();
        const L = addLantern(r.lantern, { z: 1.08, x: .45 + R(-.05, .05) });
        L.launch = { t0: performance.now(), from: 1.08, to: R(.66, .84), x0: L.x };
        ripples.push({ x: L.sx, y: L.sy, s: 1, t0: performance.now() });
        if (still) { L.z = L.launch.to; L.launch = null; place(L, 0); frame(0); }
        paintStat();
        if (r.crisis) careBox();
        else toast(r.lantern.status === 'pending' ? '灯已经放下了。看护人确认后，大家就能看见它' : '灯漂出去了，会有人看见的', { seal: '灯' });
      } catch (ex) { err.textContent = ex.message; }
    });
  });
  function careBox() {
    const m = modal(`<h3>这盏灯，先替你收着</h3>
      <p class="muted">它只在你的湖上亮着，别人看不见。读到你写下的这些，很想先轻轻抱抱你。</p>
      <p>如果你此刻很难受，可以拨打全国统一心理援助热线 <b style="font-size:20px;color:var(--shu)">12356</b>，有人愿意听你说；紧急情况请拨打 110 或 120。</p>
      <div class="row"><button class="btn" data-close>我知道了</button><button class="btn ink" data-b>和圆窗一起呼吸一分钟</button></div>`);
    m.el.querySelector('[data-b]').addEventListener('click', () => { m.close(); breathe(); });
  }

  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); card?.el.remove(); };
}
