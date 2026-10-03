// 我的千里江山：把一年的手帐画成一卷青绿山水
// 写得多的日子山高，心情为峰顶着色，季节决定点景；贴纸成树、照片成屋、封存有舟、回信有灯、满月有月。
import { api } from '../api.js';
import { h, esc, toast, quiet, sleep } from '../ui.js';
import { termOf, moonOf, JQ, dayKey, parseDay, pad } from '../calendar.js';
import { MOOD_MAP } from '../faces.js';
import { state } from '../main.js';

const CN = '〇一二三四五六七八九';
const cnYear = y => String(y).split('').map(d => CN[d]).join('');
const MONTH_LABEL = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const MOOD_TINT = { happy: '#E8B44E', calm: '#5FA79A', sweet: '#E79AAA', tired: '#9C8EC2', blue: '#4F74B0' };

// 确定性噪声（同一年同一个人，每次画出来都一样）
const hash = n => { n = (n << 13) ^ n; const t = (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) & 0x7fffffff; return 1 - t / 1073741824; };
const noise = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i + s * 7919) * (1 - u) + hash(i + 1 + s * 7919) * u; };
const fbm = (x, s) => noise(x, s) * .55 + noise(x * 2.1, s + 1) * .27 + noise(x * 4.3, s + 2) * .13 + noise(x * 8.7, s + 3) * .05;
const rnd = (i, s) => (hash(i * 31 + s * 977) + 1) / 2;

export async function scrollView(root, yearArg) {
  const now = new Date(), curY = now.getFullYear();
  let year = /^\d{4}$/.test(yearArg || '') ? Number(yearArg) : curY;
  if (year > curY) year = curY;
  root.innerHTML = `<div class="wrap view-in juan-view">
    <div class="book-head"><div><p class="h-eyebrow">えまき</p><h1 class="h-title">我的千里江山</h1>
      <p class="muted" style="margin:8px 0 0;max-width:36em">每写一天，画卷就长出一段山水。写得多的日子山更高，心情为峰顶着色，贴纸成了树，照片成了水边人家，封存的日子水上有一叶小舟。</p></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="seg" id="years"></div><button class="btn small" id="exp"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>导出长图</button></div></div>
    <figure class="juan" id="juan">
      <span class="roller l" aria-hidden="true"></span>
      <div class="silk" id="silk" tabindex="0" aria-label="年度画卷，可左右拖动或用方向键浏览"><canvas id="jc"></canvas><div class="jcol" hidden></div><div class="jtip" hidden></div></div>
      <span class="roller r" aria-hidden="true"></span>
    </figure>
    <div class="jmonths" id="months"></div>
    <div class="book-stats" id="jstats" style="margin-top:18px"></div>
  </div>`;

  let data;
  try { data = await api.year(year); } catch (e) { toast(e.message); return; }
  const years = [...new Set([...data.years.map(Number), curY])].sort();
  root.querySelector('#years').innerHTML = years.map(y => `<button type="button" data-y="${y}" class="${y === year ? 'on' : ''}">${y}</button>`).join('');
  root.querySelectorAll('#years button').forEach(b => b.addEventListener('click', () => { location.hash = `#/scroll/${b.dataset.y}`; }));

  // ---------- 数据 ----------
  const nDays = Math.round((new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / 864e5);
  const todayIdx = year === curY ? Math.round((new Date(curY, now.getMonth(), now.getDate()) - new Date(year, 0, 1)) / 864e5) : year < curY ? nDays - 1 : -1;
  const byIdx = new Array(nDays).fill(null);
  for (const d of data.days) { const i = Math.round((parseDay(d.day) - new Date(year, 0, 1)) / 864e5); if (i >= 0 && i < nDays) byIdx[i] = d; }
  const written = data.days.length, chars = data.days.reduce((n, d) => n + d.chars, 0);
  const moods = data.days.map(d => d.mood).filter(Boolean);
  const topMood = moods.length ? Object.entries(moods.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1])[0][0] : '';
  root.querySelector('#jstats').innerHTML = `<span><b>${written}</b>页</span><span><b>${chars}</b>字</span><span><b>${data.days.filter(d => d.sealed).length}</b>页封存</span><span><b>${data.letters}</b>封回信</span>${topMood ? `<span>这一年最常见的心情 · ${MOOD_MAP[topMood].n}</span>` : ''}`;

  const seasonOf = [], fullMoon = [], termAt = new Map();
  for (let i = 0; i < nDays; i++) {
    const dt = new Date(year, 0, 1 + i); seasonOf[i] = termOf(dt).season;
    const a = moonOf(new Date(year, 0, 1 + i, 21)).phase; fullMoon[i] = Math.abs(a - .5) < .017;
  }
  JQ.forEach(([name, , m, d]) => { const i = Math.round((new Date(year, m - 1, d) - new Date(year, 0, 1)) / 864e5); if (i >= 0 && i < nDays) termAt.set(i, name); });

  // ---------- 画卷几何 ----------
  const silk = root.querySelector('#silk'), cv = root.querySelector('#jc'), tip = root.querySelector('.jtip'), col = root.querySelector('.jcol');
  const small = innerWidth < 720;
  const H = small ? 330 : 440, DW = small ? 22 : 28, LEAD = small ? 300 : 380, TAIL = 260;
  const total = LEAD + nDays * DW + TAIL, STEP = 2, N = Math.ceil(total / STEP) + 2, WY = H * .86;
  const seed = year % 1000;
  // 每一天的“山势”信号：写了的日子按字数抬高，封存再高一点；平滑成连绵的山
  const raw = byIdx.map((d, i) => i > todayIdx ? 0 : d ? .26 + .58 * Math.min(1, Math.log1p(d.chars) / Math.log1p(500)) + (d.sealed ? .06 : 0) + Math.min(.08, d.stickers * .02) : .04);
  const sm = raw.map((_, i) => { let s = 0, w = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j < 0 || j >= nDays) continue; const g = Math.exp(-k * k / 3); s += raw[j] * g; w += g; } return s / w; });
  const sigAt = x => { const p = (x - LEAD) / DW;
    if (p < 0) { const b = Math.max(0, (p + 4) / 4), e = b * b * (3 - 2 * b); return .05 * (1 - e) + sm[0] * e; }
    if (p > nDays) { const b = Math.max(0, 1 - (p - nDays) / 4); return .05 * (1 - b) + sm[nDays - 1] * b; } const i = Math.max(0, Math.min(nDays - 1, Math.floor(p))), j = Math.min(nDays - 1, i + 1), f = Math.min(1, Math.max(0, p - i)); return sm[i] * (1 - f) + sm[j] * f; };
  const ridge = new Float32Array(N), far = new Float32Array(N), near = new Float32Array(N);
  for (let j = 0; j < N; j++) {
    const x = j * STEP, s = sigAt(x);
    const shape = .72 + .5 * Math.abs(fbm(x * .0065, seed)) + .1 * fbm(x * .03, seed + 5);
    ridge[j] = WY - H * Math.max(.07, (.1 + s * .66 * shape + .035 * fbm(x * .06, seed + 9)));
    far[j] = WY - H * (.38 + .17 * fbm(x * .0032, seed + 20) + .05 * fbm(x * .02, seed + 21));
    near[j] = WY - H * (.05 + .045 * (fbm(x * .018, seed + 40) + 1));
  }
  const at = (arr, x) => arr[Math.max(0, Math.min(N - 1, Math.round(x / STEP)))];
  const dayX = i => LEAD + i * DW;

  // 绢本纹理
  const tex = document.createElement('canvas'); tex.width = 240; tex.height = 240;
  { const t = tex.getContext('2d'); t.fillStyle = '#E8D9B8'; t.fillRect(0, 0, 240, 240);
    for (let i = 0; i < 700; i++) { t.fillStyle = `rgba(${120 + rnd(i, 1) * 60 | 0},${95 + rnd(i, 2) * 50 | 0},${60 + rnd(i, 3) * 40 | 0},${.015 + rnd(i, 4) * .03})`; t.fillRect(rnd(i, 5) * 240, rnd(i, 6) * 240, 1, 3 + rnd(i, 7) * 12); }
    for (let i = 0; i < 260; i++) { t.fillStyle = `rgba(110,85,50,${.02 + rnd(i, 12) * .025})`; t.fillRect(rnd(i, 13) * 240, rnd(i, 14) * 240, 3 + rnd(i, 15) * 18, 1); }
    for (let i = 0; i < 400; i++) { t.fillStyle = `rgba(255,250,235,${.04 + rnd(i, 8) * .05})`; t.fillRect(rnd(i, 9) * 240, rnd(i, 10) * 240, 1.2, 4 + rnd(i, 11) * 14); } }

  // ---------- 绘制（只画可见的一段） ----------
  function paint(ctx, vx, VW, reveal = 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VW * reveal, H); ctx.clip();
    ctx.translate(-vx, 0);
    const x0 = Math.max(0, vx - 40), x1 = Math.min(total, vx + VW + 40);
    const pat = ctx.createPattern(tex, 'repeat'); ctx.fillStyle = pat; ctx.fillRect(x0, 0, x1 - x0, H);
    for (let k = Math.floor(x0 / 700); k <= x1 / 700; k++) { // 岁月的水渍
      const cx = k * 700 + rnd(k, 30) * 500, cy = rnd(k, 31) * H, r = 120 + rnd(k, 32) * 200;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(150,115,60,.10)'); g.addColorStop(1, 'rgba(150,115,60,0)'); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const iFrom = Math.max(0, Math.floor((x0 - LEAD) / DW)), iTo = Math.min(nDays - 1, Math.ceil((x1 - LEAD) / DW));
    // 满月
    for (let i = iFrom; i <= Math.min(iTo, todayIdx); i++) if (fullMoon[i]) {
      const x = dayX(i) + DW / 2, y = H * .13; const g = ctx.createRadialGradient(x, y, 0, x, y, 34); g.addColorStop(0, 'rgba(255,248,225,.75)'); g.addColorStop(1, 'rgba(255,248,225,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 34, y - 34, 68, 68); ctx.fillStyle = '#FBF3DC'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
    }
    const path = (arr, base) => { ctx.beginPath(); ctx.moveTo(x0, base); for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, at(arr, x)); ctx.lineTo(x1, base); ctx.closePath(); };
    // 远山
    path(far, WY); ctx.fillStyle = 'rgba(96,128,140,.30)'; ctx.fill();
    let g = ctx.createLinearGradient(0, H * .35, 0, H * .7); g.addColorStop(0, 'rgba(240,232,210,0)'); g.addColorStop(.6, 'rgba(240,232,210,.55)'); g.addColorStop(1, 'rgba(240,232,210,0)');
    ctx.fillStyle = g; ctx.fillRect(x0, H * .35, x1 - x0, H * .35);
    // 主峰：石青 → 石绿 → 赭石
    path(ridge, WY);
    g = ctx.createLinearGradient(0, H * .12, 0, WY); g.addColorStop(0, '#3F6FA6'); g.addColorStop(.32, '#5A90A8'); g.addColorStop(.58, '#7EA56C'); g.addColorStop(1, '#C8A465');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    for (let i = iFrom - 2; i <= Math.min(iTo + 2, todayIdx); i++) { // 心情为峰顶晕染：以峰顶为中心的柔和色团，相邻日子自然交融
      const d = byIdx[i]; if (!d?.mood) continue; const cx = dayX(i) + DW / 2, top = at(ridge, cx), rx = DW * 1.9, ry = H * .26;
      ctx.save(); ctx.translate(cx, top + ry * .35); ctx.scale(1, ry / rx);
      const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); mg.addColorStop(0, MOOD_TINT[d.mood] + '88'); mg.addColorStop(.55, MOOD_TINT[d.mood] + '33'); mg.addColorStop(1, MOOD_TINT[d.mood] + '00');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.lineCap = 'round'; // 皴笔：顺着山势往下的弯曲笔触
    for (let x = Math.floor(x0 / 7) * 7; x < x1; x += 7) {
      const r = at(ridge, x), depth = WY - r; if (depth < 34) continue;
      const slope = (at(ridge, x + 6) - at(ridge, x - 6)) / 12;
      for (let k = 0; k < 2; k++) {
        if (rnd(x * 3 + k, 53) < .35) continue;
        const yy = r + 6 + rnd(x + k, 50) * depth * .55, l = 8 + rnd(x + k, 51) * 14, dx = Math.max(-1, Math.min(1, slope)) * l * .6, sx = x + rnd(x, 52) * 5;
        ctx.strokeStyle = `rgba(30,48,52,${(.12 + .16 * (1 - (yy - r) / depth)).toFixed(3)})`; ctx.lineWidth = .9 + rnd(x + k, 54) * .5;
        ctx.beginPath(); ctx.moveTo(sx, yy); ctx.quadraticCurveTo(sx + dx * .3 + 2, yy + l * .5, sx + dx, yy + l); ctx.stroke();
      }
    }
    for (let i = iFrom; i <= Math.min(iTo, todayIdx); i++) { // 冬日积雪
      if (seasonOf[i] !== 3) continue; const xa = dayX(i), xb = xa + DW;
      ctx.beginPath(); ctx.moveTo(xa, at(ridge, xa)); for (let x = xa; x <= xb; x += STEP) ctx.lineTo(x, at(ridge, x));
      for (let x = xb; x >= xa; x -= STEP) ctx.lineTo(x, at(ridge, x) + 9 + 6 * (fbm(x * .08, 60) + 1)); ctx.closePath(); ctx.fillStyle = 'rgba(250,250,246,.88)'; ctx.fill();
    }
    ctx.restore();
    path(ridge, WY); ctx.strokeStyle = 'rgba(40,36,30,.62)'; ctx.lineWidth = 1.3; ctx.stroke();
    // 点景：贴纸成树，照片成屋，回信有灯
    for (let i = iFrom; i <= Math.min(iTo, todayIdx); i++) {
      const d = byIdx[i]; if (!d) continue; const x = dayX(i), s = seasonOf[i];
      for (let k = 0; k < Math.min(4, d.stickers); k++) { const tx = x + 4 + rnd(i * 5 + k, 70) * (DW - 6); tree(ctx, tx, at(ridge, tx) + 2 + rnd(i + k, 71) * 10, .8 + rnd(i + k, 72) * .5, s); }
      if (d.photos) hut(ctx, x + DW * .5, WY - 2, Math.min(1.4, .9 + d.photos * .15));
      if (d.reply) lantern(ctx, x + DW * .6, at(ridge, x + DW * .6) + 18);
    }
    // 近岸
    path(near, WY + 2); ctx.fillStyle = 'rgba(92,120,78,.85)'; ctx.fill();
    // 江水
    g = ctx.createLinearGradient(0, WY, 0, H); g.addColorStop(0, 'rgba(176,196,180,.85)'); g.addColorStop(1, 'rgba(150,172,160,.9)'); ctx.fillStyle = g; ctx.fillRect(x0, WY, x1 - x0, H - WY);
    ctx.strokeStyle = 'rgba(70,95,90,.35)'; ctx.lineWidth = .8;
    for (let x = Math.floor(x0 / 14) * 14; x < x1; x += 14) { const y = WY + 6 + rnd(x, 80) * (H - WY - 10); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 2, x + 9, y); ctx.stroke(); }
    for (let i = iFrom; i <= Math.min(iTo, todayIdx); i++) if (byIdx[i]?.sealed) boat(ctx, dayX(i) + DW * .5, WY + (H - WY) * .45, small ? .8 : 1);
    // 节气写在水上
    ctx.fillStyle = 'rgba(60,60,50,.55)'; ctx.font = `${small ? 10 : 11}px "ZCOOL XiaoWei", serif`; ctx.textAlign = 'center';
    for (const [i, name] of termAt) { if (i < iFrom - 2 || i > iTo + 2) continue; const x = dayX(i) + DW / 2; [...name].forEach((c, k) => ctx.fillText(c, x, WY + 15 + k * 12)); }
    // 月份写在天上
    for (let mth = 0; mth < 12; mth++) {
      const i = Math.round((new Date(year, mth, 1) - new Date(year, 0, 1)) / 864e5), x = dayX(i); if (x < x0 - 30 || x > x1 + 30) continue;
      ctx.strokeStyle = 'rgba(196,71,58,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 12); ctx.stroke();
      ctx.fillStyle = 'rgba(50,40,30,.7)'; ctx.font = `${small ? 14 : 16}px "Ma Shan Zheng", serif`; [...MONTH_LABEL[mth]].forEach((c, k) => ctx.fillText(c, x + 12, 26 + k * 18));
    }
    // 今日之后：未完待续
    if (todayIdx >= 0 && todayIdx < nDays - 1) {
      const fx = dayX(todayIdx + 1);
      if (fx < x1) {
        const fg = ctx.createLinearGradient(fx, 0, fx + 160, 0); fg.addColorStop(0, 'rgba(232,217,184,0)'); fg.addColorStop(1, 'rgba(232,217,184,1)');
        ctx.fillStyle = fg; ctx.fillRect(fx, 0, 160, H); ctx.fillStyle = pat; ctx.fillRect(fx + 160, 0, Math.max(0, x1 - fx - 160), H);
        ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(80,60,40,.35)'; ctx.beginPath(); ctx.moveTo(fx + 4, H * .12); ctx.lineTo(fx + 4, H * .9); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(50,40,30,.72)'; ctx.font = `${small ? 24 : 30}px "Ma Shan Zheng", serif`;
        [...'未完待续'].forEach((c, k) => ctx.fillText(c, fx + 90, H * .3 + k * (small ? 30 : 38)));
        seal(ctx, dayX(todayIdx) + DW / 2, at(ridge, dayX(todayIdx) + DW / 2) - 22, '今', 20);
      }
    }
    // 引首：题字与名章
    if (x0 < LEAD) {
      ctx.strokeStyle = 'rgba(120,90,50,.45)'; ctx.lineWidth = 1; [LEAD - 22, LEAD - 16].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H - 10); ctx.stroke(); });
      ctx.fillStyle = 'rgba(40,32,24,.88)'; ctx.font = `${small ? 38 : 50}px "Ma Shan Zheng", serif`;
      [...'我的千里江山'].forEach((c, k) => ctx.fillText(c, LEAD - (small ? 80 : 100), (small ? 48 : 62) + k * (small ? 40 : 54)));
      ctx.font = `${small ? 13 : 15}px "ZCOOL XiaoWei", serif`; ctx.fillStyle = 'rgba(60,48,36,.75)';
      const sub = `${cnYear(year)}年 · ${state.user?.nickname || ''} 记`; [...sub].forEach((c, k) => ctx.fillText(c, LEAD - (small ? 150 : 190), (small ? 60 : 78) + k * (small ? 16 : 19)));
      seal(ctx, LEAD - (small ? 150 : 190), (small ? 70 : 92) + sub.length * (small ? 16 : 19), [...(state.user?.nickname || '拾')][0], small ? 24 : 30);
      seal(ctx, LEAD - (small ? 60 : 70), H - (small ? 40 : 52), '拾光', small ? 26 : 32, true);
    }
    if (todayIdx === nDays - 1 && x1 > total - TAIL) {
      ctx.fillStyle = 'rgba(40,32,24,.8)'; ctx.font = '30px "Ma Shan Zheng", serif'; [...'岁末卷终'].forEach((c, k) => ctx.fillText(c, total - TAIL / 2, H * .25 + k * 38));
      seal(ctx, total - TAIL / 2, H * .25 + 4 * 38 + 10, '终', 26);
    }
    ctx.restore();
  }

  // ---------- 视口、拖拽、惯性、展开动画 ----------
  const ctx = cv.getContext('2d');
  let VW = 0, D = 1, vx = 0, target = 0, vel = 0, reveal = quiet() ? 1 : 0, dirty = true, raf = 0, hoverI = -1;
  const maxX = () => Math.max(0, total - VW);
  function resize() { D = Math.min(2, devicePixelRatio || 1); VW = silk.clientWidth; cv.width = VW * D; cv.height = H * D; cv.style.height = H + 'px'; ctx.setTransform(D, 0, 0, D, 0, 0); target = Math.min(target, maxX()); dirty = true; }
  resize();
  target = vx = todayIdx >= 0 ? Math.max(0, Math.min(maxX(), dayX(todayIdx) - VW * .72)) : 0;
  const juan = root.querySelector('#juan');
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!drag) { if (Math.abs(vel) > .2) { target += vel; vel *= .93; } else vel = 0; }
    target = Math.max(0, Math.min(maxX(), target));
    const nv = vx + (target - vx) * (quiet() ? 1 : .2);
    if (Math.abs(nv - vx) > .05) { vx = nv; dirty = true; }
    if (reveal < 1) { reveal = Math.min(1, reveal + 1 / 110); dirty = true; juan.style.setProperty('--rvn', easeOut(reveal).toFixed(4)); }
    if (dirty) { paint(ctx, vx, VW, easeOut(reveal)); dirty = false; if (hoverI >= 0) placeHover(); }
  }
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  let drag = null;
  silk.addEventListener('pointerdown', e => { drag = { x: e.clientX, t0: target, last: e.clientX, moved: false }; silk.setPointerCapture(e.pointerId); vel = 0; });
  silk.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; target = drag.t0 - dx; vel = -(e.clientX - drag.last) * .9; drag.last = e.clientX; }
    hoverAt(e);
  });
  const end = e => { if (drag && !drag.moved) openAt(e); drag = null; };
  silk.addEventListener('pointerup', end); silk.addEventListener('pointercancel', () => { drag = null; });
  silk.addEventListener('pointerleave', () => { hoverI = -1; tip.hidden = col.hidden = true; });
  silk.addEventListener('wheel', e => { e.preventDefault(); target += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.2; }, { passive: false });
  silk.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { target += DW * 7; e.preventDefault(); } if (e.key === 'ArrowLeft') { target -= DW * 7; e.preventDefault(); } });
  const idxAt = e => { const r = silk.getBoundingClientRect(); return Math.floor((e.clientX - r.left + vx - LEAD) / DW); };
  function hoverAt(e) {
    if (e.pointerType === 'touch' && drag?.moved) return;
    const i = idxAt(e); hoverI = i >= 0 && i < nDays && i <= todayIdx ? i : -1;
    if (hoverI < 0) { tip.hidden = col.hidden = true; return; }
    placeHover();
  }
  function placeHover() {
    const i = hoverI, d = byIdx[i], dt = new Date(year, 0, 1 + i), x = dayX(i) - vx;
    col.hidden = false; col.style.transform = `translateX(${x}px)`; col.style.width = DW + 'px';
    tip.hidden = false;
    tip.innerHTML = `<b>${dt.getMonth() + 1}月${dt.getDate()}日</b>${termAt.get(i) ? ` · ${termAt.get(i)}` : ''}<br>${d ? `${d.mood ? MOOD_MAP[d.mood].n + ' · ' : ''}${d.chars} 字${d.sealed ? ' · 已封存' : ''}<span>${esc(d.excerpt)}</span>` : '<span>这一天没有写</span>'}<i>${d ? '点一下翻开这一页' : '点一下补写这一天'}</i>`;
    const tx = Math.max(8, Math.min(VW - 228, x + DW + 10));
    tip.style.transform = `translate(${tx}px, ${Math.max(8, Math.min(H - 150, at(ridge, dayX(i)) - 60))}px)`;
  }
  function openAt(e) { const i = idxAt(e); if (i < 0 || i >= nDays || i > todayIdx) return; location.hash = `#/day/${dayKey(new Date(year, 0, 1 + i))}`; }

  // 月份书签
  root.querySelector('#months').innerHTML = MONTH_LABEL.map((m, k) => {
    const days = new Date(year, k + 1, 0).getDate(), n = data.days.filter(d => d.day.slice(5, 7) === pad(k + 1)).length;
    const startI = Math.round((new Date(year, k, 1) - new Date(year, 0, 1)) / 864e5);
    return `<button type="button" data-i="${startI}" ${startI > todayIdx ? 'disabled' : ''} aria-label="${m}，写了 ${n} 页"><span>${m}</span><i style="--d:${(n / days).toFixed(3)}"></i></button>`;
  }).join('');
  root.querySelectorAll('#months button').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.i); target = i === 0 ? 0 : dayX(i) - 60; vel = 0; }));

  // 导出长图
  root.querySelector('#exp').addEventListener('click', async () => {
    const btn = root.querySelector('#exp'); btn.disabled = true; toast('正在装裱长卷…');
    await sleep(50);
    try {
      const c = document.createElement('canvas'), end = Math.min(total, todayIdx >= 0 ? dayX(todayIdx + 1) + 300 : total);
      c.width = end; c.height = H; paint(c.getContext('2d'), 0, end, 1);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const url = URL.createObjectURL(blob), a = h(`<a href="${url}" download="我的千里江山-${year}.png"></a>`); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000); toast('长图已保存', { seal: '卷' });
    } catch { toast('长图没能生成，请稍后再试'); }
    btn.disabled = false;
  });

  const ro = new ResizeObserver(resize); ro.observe(silk);
  await Promise.all(['50px "Ma Shan Zheng"', '15px "ZCOOL XiaoWei"'].map(f => document.fonts.load(f, '我的千里江山未完待续一二三四五六七八九十月立春雨水惊蛰')).concat(sleep(0))).catch(() => {});
  dirty = true; frame();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

// ---------- 点景小物 ----------
function tree(c, x, y, s, season) {
  c.strokeStyle = 'rgba(60,45,30,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 9 * s); c.stroke();
  const col = season === 0 ? '#E9A6B4' : season === 1 ? '#3E7A4E' : season === 2 ? (x % 3 < 1.5 ? '#C9502F' : '#E0A23A') : '#2F5A46';
  c.fillStyle = col;
  if (season === 0 || season === 2) { [[0, -11], [-3, -8], [3, -8], [0, -6]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx * s, y + dy * s, 2.6 * s, 0, 7); c.fill(); }); }
  else { for (let k = 0; k < 3; k++) { const w = (6 - k * 1.5) * s, yy = y - (4 + k * 3.2) * s; c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x + w, yy); c.lineTo(x, yy - 4 * s); c.closePath(); c.fill(); }
    if (season === 3) { c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.moveTo(x - 2 * s, y - 13 * s); c.lineTo(x + 2 * s, y - 13 * s); c.lineTo(x, y - 15.5 * s); c.closePath(); c.fill(); } }
}
function hut(c, x, y, s) {
  c.fillStyle = '#EFE4CC'; c.fillRect(x - 6 * s, y - 7 * s, 12 * s, 7 * s);
  c.fillStyle = '#5B4636'; c.beginPath(); c.moveTo(x - 9 * s, y - 7 * s); c.lineTo(x, y - 13 * s); c.lineTo(x + 9 * s, y - 7 * s); c.closePath(); c.fill();
  c.fillStyle = '#E3B65E'; c.fillRect(x - 1.5 * s, y - 5 * s, 3 * s, 3 * s);
}
function lantern(c, x, y) {
  const g = c.createRadialGradient(x, y, 0, x, y, 14); g.addColorStop(0, 'rgba(255,214,140,.9)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(x - 14, y - 14, 28, 28);
  c.fillStyle = '#D9473A'; c.beginPath(); c.ellipse(x, y, 2.6, 3.4, 0, 0, 7); c.fill();
}
function boat(c, x, y, s) {
  c.fillStyle = '#3B3128'; c.beginPath(); c.moveTo(x - 11 * s, y); c.quadraticCurveTo(x, y + 5 * s, x + 11 * s, y); c.lineTo(x + 8 * s, y + 3 * s); c.quadraticCurveTo(x, y + 6 * s, x - 8 * s, y + 3 * s); c.closePath(); c.fill();
  c.fillRect(x - 1, y - 9 * s, 1.2, 9 * s); c.beginPath(); c.arc(x - 1, y - 10 * s, 1.6 * s, 0, 7); c.fill();
  c.strokeStyle = '#3B3128'; c.lineWidth = .8; c.beginPath(); c.moveTo(x + 2 * s, y - 4 * s); c.lineTo(x + 10 * s, y + 4 * s); c.stroke();
}
function seal(c, x, y, text, size, round) {
  c.save(); c.translate(x, y); c.rotate(-.08);
  c.fillStyle = 'rgba(196,71,58,.88)';
  if (round) { c.beginPath(); c.arc(0, 0, size / 2, 0, 7); c.fill(); } else c.fillRect(-size / 2, -size / 2, size, size);
  c.fillStyle = '#FBF3E6'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const ch = [...text]; c.font = `${size * (ch.length > 1 ? .4 : .62)}px "Ma Shan Zheng", serif`;
  if (ch.length > 1) { c.fillText(ch[0], 0, -size * .2); c.fillText(ch[1], 0, size * .22); } else c.fillText(ch[0], 0, size * .04);
  c.restore();
}
