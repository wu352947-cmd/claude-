// 万年：滚动驱动的叙事页。无依赖；所有动画都由滚动位置或用户操作驱动，开场只有一段编排好的“倒带”。
import { DRAWINGS } from './drawings.js';
import { SAME_YEAR } from './sameyear.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const era = y => y < 0 ? '公元前' : '公元';

/* ---------- 里程表 ---------- */
function odometer(el, cols) {
  el.textContent = '';
  const parts = Array.from({ length: cols }, (_, i) => {
    const col = document.createElement('span'); col.className = 'odo-col';
    const strip = document.createElement('span'); strip.className = 'odo-strip';
    strip.style.setProperty('--i', i);
    for (let d = 0; d < 10; d++) { const s = document.createElement('span'); s.textContent = d; strip.append(s); }
    col.append(strip); el.append(col);
    return { col, strip };
  });
  return {
    set(n, { roll, instant } = {}) {
      const digits = String(Math.abs(Math.round(n))).padStart(cols, ' ');
      parts.forEach(({ col, strip }, i) => {
        const ch = digits[i];
        if (instant) { strip.style.transition = 'none'; col.style.transition = 'none'; }
        if (roll) strip.style.setProperty('--roll', roll);
        col.classList.toggle('is-off', ch === ' ');
        strip.style.setProperty('--d', ch === ' ' ? 0 : +ch);
        if (instant) { strip.offsetWidth; strip.style.transition = ''; col.style.transition = ''; }
      });
    }
  };
}

/* ---------- 开场：从今天倒带回公元前一万年 ---------- */
const heroOdo = odometer($('[data-odo="hero"]'), 5);
const heroEra = $('#heroEra');
const THIS_YEAR = 2026;
function rewind() {
  heroOdo.set(THIS_YEAR, { instant: true });
  heroEra.textContent = '公元';
  if (reduce) { heroOdo.set(10000, { instant: true }); heroEra.textContent = '公元前'; return; }
  setTimeout(() => {
    heroEra.style.opacity = 0;
    heroOdo.set(10000, { roll: '2.4s' });
    setTimeout(() => { heroEra.textContent = '公元前'; heroEra.style.opacity = ''; }, 900);
  }, 700);
}

/* ---------- 线描 ---------- */
for (const svg of $$('[data-draw]')) {
  svg.innerHTML = DRAWINGS[svg.dataset.draw]();
  svg._inks = $$('.ink', svg);
  svg._spin = $('[data-spin]', svg);
}
function drawTo(svg, t) {
  const inks = svg._inks, n = inks.length;
  // 前一笔还没画完，下一笔就起笔：像一只手在纸上移动
  const span = Math.min(.5, 3 / n);
  inks.forEach((p, i) => {
    const start = n === 1 ? 0 : (i / (n - 1)) * (1 - span);
    p.style.strokeDashoffset = 1 - easeOut(range(t, start, start + span));
  });
}

/* ---------- 场景测量 ---------- */
let vh = innerHeight, vw = innerWidth;
const chapters = $$('[data-scene="chapter"]').map(el => ({
  el, stage: $('.stage', el), art: $('.ch-art', el), ghost: $('.ch-ghost', el),
  year: +el.dataset.year, top: 0, h: 0, sp: 0, last: {}
}));
const scaleEl = $('#scale');
const scale = { el: scaleEl, top: 0, h: 0, sp: 0 };
const toneStops = [];

function measure() {
  vh = innerHeight; vw = innerWidth;
  const at = el => el.getBoundingClientRect().top + scrollY;
  for (const c of chapters) { c.top = at(c.el); c.h = c.el.offsetHeight; }
  scale.top = at(scaleEl); scale.h = scaleEl.offsetHeight;
  toneStops.length = 0;
  toneStops.push({ y: 0, c: hex('#14110D') }, { y: scale.top + scale.h - vh, c: hex('#14110D') });
  for (const c of chapters) toneStops.push({ y: c.top + c.h / 2 - vh / 2, c: hex(c.el.dataset.tone) });
  const sy = $('#sameyear'), now = $('#now');
  toneStops.push({ y: at(sy) - vh * .2, c: hex(sy.dataset.tone) }, { y: at(now) - vh * .3, c: hex('#090E20') });
  sizeRuler();
  sameYear.layout();
}

/* ---------- 底色随年代冷却 ---------- */
function hex(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
let lastTone = '';
function tone(y) {
  let i = 0; while (i < toneStops.length - 1 && toneStops[i + 1].y < y) i++;
  const a = toneStops[i], b = toneStops[Math.min(i + 1, toneStops.length - 1)];
  const t = b === a ? 0 : easeIO(clamp((y - a.y) / (b.y - a.y)));
  const c = a.c.map((v, k) => Math.round(mix(v, b.c[k], t)));
  const s = `rgb(${c})`;
  if (s !== lastTone) { document.documentElement.style.setProperty('--bg', s); lastTone = s; }
}

/* ---------- 右侧年份刻度 ---------- */
const dial = $('#dial');
const dialOdo = odometer($('[data-odo="dial"]', dial), 4);
const dialEra = $('[data-era]', dial);
let dialYear = null;
function setDial(c, fill) {
  dial.classList.toggle('is-on', !!c);
  dial.style.setProperty('--fill', fill);
  if (c && c.year !== dialYear) {
    dialYear = c.year;
    dialOdo.set(c.year, { roll: '1.1s' });
    dialEra.textContent = era(c.year);
  }
}

/* ---------- 尺度：一条一万两千年的线 ---------- */
const FROM = -10000, TO = THIS_YEAR;
const canvas = $('#rulerCanvas'), ctx = canvas.getContext('2d');
const marks = $$('#rulerMarks li').map((el, i) => ({ el, year: +el.dataset.year, row: [0, 0, 1, 0, 1, 0, 1, 0][i] }));
marks.forEach(m => m.el.dataset.row = m.row);
const notes = $$('.scale-note');
const rulerFrom = $('#rulerFrom');
let rw = 0, rh = 0, rulerKey = '';
function sizeRuler() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  rw = r.width; rh = r.height;
  canvas.width = Math.round(rw * dpr); canvas.height = Math.round(rh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rulerKey = '';
}
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const label = y => y < 0 ? `前${-y}` : `${y}`;
function renderScale(p) {
  const reveal = easeIO(range(p, .02, .5));           // 线走过的比例（按时间线性）
  const zoom = easeIO(range(p, .66, .9));               // 拉近到最后三百年
  const start = mix(FROM, 1700, zoom), end = TO;
  const key = `${reveal.toFixed(4)}|${zoom.toFixed(4)}|${rw}`;
  const noteIx = p < .24 ? 0 : p < .45 ? 1 : p < .66 ? 2 : 3;
  notes.forEach((n, i) => n.classList.toggle('is-on', i === noteIx));
  if (key === rulerKey) return;
  rulerKey = key;

  const x = y => (y - start) / (end - start) * rw;
  const base = rh - 70, gold = css('--gold'), hair = 'rgba(236,229,212,.16)', faint = 'rgba(236,229,212,.42)';
  ctx.clearRect(0, 0, rw, rh);

  // 刻度：按当前比例挑一个不挤的步长
  const steps = [2000, 1000, 500, 100, 50, 25, 10];
  const pxPerYear = rw / (end - start);
  const step = steps.filter(s => s * pxPerYear >= 46).pop() || steps[0];
  const major = step * 2;
  ctx.font = `400 12px "Bodoni Moda W", "Noto Serif SC W", serif`;
  ctx.textAlign = 'center';
  const revealedTo = FROM + reveal * (TO - FROM);
  for (let y = Math.ceil(start / step) * step; y <= end; y += step) {
    const xx = x(y); if (xx < -1 || xx > rw + 1) continue;
    const on = y <= revealedTo;
    const big = y % major === 0;
    ctx.fillStyle = on ? faint : hair;
    ctx.fillRect(Math.round(xx), base + 8, 1, big ? 12 : 6);
    // 没有公元 0 年；两端留给起止年份
    if (big && on && y !== 0 && xx > 130 && xx < rw - 70) ctx.fillText(label(y), xx, base + 38);
  }
  // 线：未走过的部分是一根发丝，走过的部分是金色
  ctx.fillStyle = hair; ctx.fillRect(0, base, rw, 1);
  const rx = clamp(x(revealedTo), 0, rw);
  ctx.fillStyle = gold; ctx.fillRect(0, base, rx, 1);
  if (reveal > 0 && reveal < 1) { ctx.beginPath(); ctx.arc(rx, base + .5, 3, 0, Math.PI * 2); ctx.fill(); }

  rulerFrom.textContent = zoom < .02 ? '公元前 10000' : label(Math.round(start / 10) * 10);
  for (const m of marks) {
    const xx = x(m.year);
    // 1700 年以后的三件事，在全尺度下会挤成一点，等拉近之后再出现
    const visible = m.year <= revealedTo && xx >= 0 && xx <= rw && (m.year < 1700 || zoom > .55);
    m.el.classList.toggle('is-on', visible);
    m.el.style.transform = `translate3d(${xx}px,0,0) translateX(-50%)`;
  }
}

/* ---------- 同一年 ---------- */
const sameYear = (() => {
  const stopsEl = $('#scrubStops'), knob = $('#scrubKnob'), scrub = $('#scrub'), fill = $('#scrubFill');
  const dots = $('#syDots'), cols = $('#syCols'), leads = $('#syLeads'), grid = $('#syGrid'), map = $('#syMap'), board = $('#syBoard');
  const LON = [-130, 160], LAT = [64, -42];
  const px = lon => (lon - LON[0]) / (LON[1] - LON[0]);
  const py = lat => (LAT[0] - lat) / (LAT[0] - LAT[1]);
  let idx = 0, w = 0, dragging = false, leadTimer = 0;

  const buttons = SAME_YEAR.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sy-stop'; b.setAttribute('role', 'radio');
    b.style.setProperty('--at', `${i / (SAME_YEAR.length - 1) * 100}%`);
    b.innerHTML = `<small>${era(s.year)}</small>${Math.abs(s.year)}`;
    b.setAttribute('aria-label', `${era(s.year)} ${Math.abs(s.year)} 年`);
    b.addEventListener('click', () => go(i));
    b.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); go(clamp(i + d, 0, SAME_YEAR.length - 1)); buttons[idx].focus(); }
    });
    stopsEl.append(b);
    return b;
  });
  const dotEls = [0, 1, 2, 3].map(() => { const li = document.createElement('li'); li.innerHTML = '<span></span>'; dots.append(li); return li; });
  const colEls = [0, 1, 2, 3].map(() => { const li = document.createElement('li'); cols.append(li); return li; });

  function drawGrid() {
    const W = map.clientWidth, H = map.clientHeight;
    let s = '';
    for (let lon = -120; lon <= 150; lon += 30) { const x = px(lon) * W; s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`; }
    for (let lat = 60; lat >= -40; lat -= 20) {
      const y = py(lat) * H;
      s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"${lat === 0 ? ' class="eq"' : ''}/>`;
      s += `<text x="${W}" y="${y - 6}" text-anchor="end">${lat === 0 ? '0°' : Math.abs(lat) + '°' + (lat > 0 ? 'N' : 'S')}</text>`;
    }
    grid.setAttribute('viewBox', `0 0 ${W} ${H}`);
    grid.innerHTML = s;
  }

  function drawLeads(animate) {
    if (getComputedStyle(leads).display === 'none') { leads.innerHTML = ''; return; }
    const b = board.getBoundingClientRect();
    let s = '';
    const n = SAME_YEAR[idx].places.length;
    SAME_YEAR[idx].places.forEach((p, i) => {
      const d = dotEls[i].getBoundingClientRect(), c = colEls[i].getBoundingClientRect();
      const x1 = d.left + d.width / 2 - b.left, y1 = d.top + d.height / 2 - b.top;
      const x2 = c.left - b.left + 1, y2 = c.top - b.top - 6;
      // 每条引线拐弯的高度错开，向左走的越靠左越高，向右走的越靠右越高，这样互不交叉
      const dir = Math.sign(x2 - x1) || 1, level = dir < 0 ? i : n - 1 - i;
      const ym = y2 - 18 - level * 12, r = Math.min(10, Math.abs(x2 - x1) / 2);
      s += `<path pathLength="1" d="M${f1(x1)} ${f1(y1 + 8)} L${f1(x1)} ${f1(ym - r)} Q${f1(x1)} ${f1(ym)} ${f1(x1 + dir * r)} ${f1(ym)} L${f1(x2 - dir * r)} ${f1(ym)} Q${f1(x2)} ${f1(ym)} ${f1(x2)} ${f1(ym + r)} L${f1(x2)} ${f1(y2)}"/>`;
    });
    leads.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
    leads.innerHTML = s;
    if (animate && !reduce) {
      leads.classList.add('is-hidden');
      leads.getBoundingClientRect();
      leads.classList.remove('is-hidden');
    }
  }

  function render(first) {
    const set = SAME_YEAR[idx];
    buttons.forEach((b, i) => { b.setAttribute('aria-checked', i === idx); b.tabIndex = i === idx ? 0 : -1; });
    // 地点按经度从西到东排列，小圆点从上一年的位置滑向这一年的位置
    set.places.forEach((p, i) => {
      const dot = dotEls[i];
      dot.style.setProperty('--x', `${px(p.lon) * 100}%`);
      dot.style.setProperty('--y', `${py(p.lat) * 100}%`);
      dot.querySelector('span').textContent = p.name;
      const col = colEls[i];
      col.classList.remove('is-on');
      const fillCol = () => {
        col.innerHTML = `<span class="sy-place">${p.name}<em>${fmtLat(p.lat)} ${fmtLon(p.lon)}</em></span><span class="sy-what">${p.what}</span>`;
        col.classList.add('is-on');
      };
      if (first || reduce) fillCol(); else setTimeout(fillCol, 260 + i * 90);
    });
    leads.classList.add('is-hidden');
    clearTimeout(leadTimer);
    leadTimer = setTimeout(() => drawLeads(true), first || reduce ? 0 : 950);
  }
  const f1 = v => v.toFixed(1);
  const fmtLat = v => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
  const fmtLon = v => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;

  function knobTo(k, s = 1) {
    knob.style.setProperty('--x', `${k * w}px`);
    knob.style.setProperty('--s', s);
    fill.parentElement.style.setProperty('--k', k);
  }
  function go(i, first) {
    const changed = i !== idx || first;
    idx = i;
    scrub.classList.remove('is-drag');
    knobTo(i / (SAME_YEAR.length - 1));
    if (changed) render(first);
  }

  // 拖动：手柄跟手，经过哪个年份就切到哪个年份，松手吸附
  const fromEvent = e => clamp((e.clientX - scrub.getBoundingClientRect().left) / w);
  scrub.addEventListener('pointerdown', e => {
    if (e.target.closest('.sy-stop') && e.pointerType !== 'touch' && e.target !== knob) return;
    dragging = true; scrub.setPointerCapture(e.pointerId); scrub.classList.add('is-drag');
    move(e);
  });
  function move(e) {
    if (!dragging) return;
    const k = fromEvent(e), n = SAME_YEAR.length - 1, near = Math.round(k * n);
    knobTo(k, 1.18);
    if (near !== idx) { idx = near; render(); }
  }
  scrub.addEventListener('pointermove', move);
  const end = () => { if (!dragging) return; dragging = false; go(idx); };
  scrub.addEventListener('pointerup', end);
  scrub.addEventListener('pointercancel', end);

  return {
    layout() {
      w = scrub.clientWidth;
      drawGrid();
      knobTo(idx / (SAME_YEAR.length - 1));
      drawLeads(false);
    },
    init() { go(0, true); }
  };
})();

/* ---------- 现在 ---------- */
const nowOdo = odometer($('[data-odo="now"]'), 4);
nowOdo.set(1991, { instant: true });
new IntersectionObserver(([e]) => {
  if (e.isIntersecting) nowOdo.set(THIS_YEAR, { roll: '1.8s' });
}, { threshold: .5 }).observe($('#now'));

$('#again').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  const wait = () => scrollY < 4 ? (rewind(), nowOdo.set(1991, { instant: true })) : requestAnimationFrame(wait);
  requestAnimationFrame(wait);
});

/* ---------- 导航 ---------- */
const nav = $('#nav');
const navLinks = $$('.nav nav a');
const navTargets = navLinks.map(a => $(a.getAttribute('href')));

/* ---------- 主循环：滚动位置 → 平滑进度 → 样式 ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(64, now - lastT) / 16.67; lastT = now;
  const k = reduce ? 1 : 1 - Math.pow(1 - .14, dt);   // 与帧率无关的阻尼
  const y = scrollY;

  nav.classList.toggle('is-solid', y > 40);
  let cur = -1;
  navTargets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < vh * .5) cur = i; });
  navLinks.forEach((a, i) => a.toggleAttribute('aria-current', i === cur));
  tone(y + vh / 2);

  // 尺度
  const sp = clamp((y - scale.top) / (scale.h - vh));
  scale.sp = mix(scale.sp, sp, k);
  if (Math.abs(scale.sp - sp) < 1e-4) scale.sp = sp;
  renderScale(scale.sp);

  // 九个时刻
  let active = null;
  for (const c of chapters) {
    const p = clamp((y + vh - c.top) / (c.h + vh));
    c.sp = mix(c.sp, p, k);
    if (Math.abs(c.sp - p) < 1e-4) c.sp = p;
    const q = c.sp;
    if (q <= 0 || q >= 1) { if (c.last.q === q) continue; }
    const v = {
      a: easeOut(range(q, .1, .28)), t: easeOut(range(q, .14, .34)), c: easeOut(range(q, .2, .4)),
      out: easeIO(range(q, .64, .8)), draw: range(q, .08, .58),
    };
    const st = c.stage.style;
    if (v.a !== c.last.a) st.setProperty('--in-a', v.a.toFixed(4));
    if (v.t !== c.last.t) st.setProperty('--in', v.t.toFixed(4));
    if (v.c !== c.last.c) st.setProperty('--in-c', v.c.toFixed(4));
    if (v.out !== c.last.out) st.setProperty('--out', v.out.toFixed(4));
    if (v.draw !== c.last.draw) {
      drawTo(c.art, reduce ? 1 : v.draw);
      if (c.art._spin) c.art._spin.setAttribute('transform', `rotate(${(q - .5) * c.art._spin.dataset.spin} 200 200)`);
    }
    if (!reduce) c.ghost.style.setProperty('--drift', ((.5 - q) * vw * .18).toFixed(1));
    c.last = { ...v, q };
    if (q > .22 && q < .72) active = c;
  }
  const first = chapters[0], lastC = chapters[chapters.length - 1];
  const fill = clamp((y - first.top) / (lastC.top + lastC.h - vh - first.top));
  setDial(active, fill.toFixed(4));

  requestAnimationFrame(frame);
}

/* ---------- 启动 ---------- */
function start() {
  measure();
  sameYear.init();
  rewind();
  requestAnimationFrame(() => document.documentElement.classList.add('is-loaded'));
  requestAnimationFrame(frame);
}
let rs = 0;
addEventListener('resize', () => { cancelAnimationFrame(rs); rs = requestAnimationFrame(measure); });
(document.fonts?.ready || Promise.resolve()).then(start);
