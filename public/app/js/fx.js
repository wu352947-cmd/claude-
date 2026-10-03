// 背景：季节飘落物（春樱 · 夏萤 · 秋叶 · 冬雪）+ 实时天气（雨、雷、雪、雾、云、阳光、星空、风）
// 数量克制，标签页隐藏或安静模式时暂停
import { quiet } from './ui.js';
export function startFx(canvas, season) {
  const ctx = canvas.getContext('2d'); let W = 0, H = 0, parts = [], raf = 0, last = performance.now();
  const colors = { spring: ['#F4BFC8', '#EFA9B6'], summer: ['rgba(230,240,150,.9)'], autumn: ['#E3A93E', '#D9672F', '#EBC24E'], winter: ['#DDE5EF', '#FFFFFF'] }[season];
  let wx = { kind: '', isDay: true }, drops = [], flakes = [], blobs = [], stars = [], gusts = [], flash = 0, nextFlash = 0, wind = 0;
  const dark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
  const resize = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * d; canvas.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const spawn = (p, top) => Object.assign(p, { x: Math.random() * W, y: top ? -20 : Math.random() * H, s: season === 'winter' ? 1.5 + Math.random() * 2.5 : season === 'summer' ? 1.5 + Math.random() : 5 + Math.random() * 6,
    vy: season === 'summer' ? (Math.random() - .5) * .15 : .25 + Math.random() * .45, vx: (Math.random() - .3) * .3, r: Math.random() * 6.3, vr: (Math.random() - .5) * .02, ph: Math.random() * 6.3, c: colors[Math.floor(Math.random() * colors.length)] });
  resize(); addEventListener('resize', () => { resize(); buildWeather(); });
  parts = Array.from({ length: Math.round(Math.min(26, W / 55)) }, () => spawn({}, false));

  // ---------- 天气层 ----------
  const R = (a, b) => a + Math.random() * (b - a);
  const drop = (p = {}, top) => Object.assign(p, { x: R(-W * .2, W * 1.05), y: top ? R(-H * .3, -10) : R(0, H), l: R(10, 22), v: R(9, 14), a: R(.18, .42) });
  const flake = (p = {}, top) => Object.assign(p, { x: R(0, W), y: top ? -10 : R(0, H), s: R(1.2, 3.6), v: R(.4, 1.1), ph: R(0, 7), a: R(.55, .95) });
  function buildWeather() {
    const k = wx.kind, area = W * H / (1280 * 800);
    drops = k === 'rain' || k === 'thunder' ? Array.from({ length: Math.round(110 * area) }, () => drop({}, false)) : [];
    flakes = k === 'snow' ? Array.from({ length: Math.round(90 * area) }, () => flake({}, false)) : [];
    blobs = k === 'fog' || k === 'cloud' || k === 'rain' || k === 'thunder' ? Array.from({ length: k === 'fog' ? 7 : 5 }, (_, i) => ({ x: R(-.2, 1.1) * W, y: k === 'fog' ? R(.2, 1) * H : R(-.05, .28) * H, r: R(.18, .34) * Math.max(W, H) * (k === 'fog' ? 1 : .7), v: R(.05, .16), seed: i })) : [];
    stars = k === 'sun' && !wx.isDay ? Array.from({ length: Math.round(70 * area) }, () => ({ x: R(0, W), y: R(0, H * .7), s: R(.4, 1.4), ph: R(0, 7) })) : [];
    gusts = k === 'wind' ? Array.from({ length: 6 }, () => ({ x: R(-W, 0), y: R(.1, .9) * H, len: R(.25, .5) * W, v: R(5, 9), amp: R(10, 30), a: R(.12, .25) })) : [];
    wind = k === 'wind' ? 2.4 : k === 'rain' || k === 'thunder' ? .6 : 0;
    nextFlash = performance.now() + R(4000, 12000);
  }
  function cloudShape(x, y, r, a, col) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.filter = 'blur(18px)';
    ctx.beginPath(); for (const [dx, dy, s] of [[0, 0, .5], [.42, .08, .38], [-.4, .1, .36], [.15, -.18, .4], [-.15, -.12, .32]]) { ctx.moveTo(x + dx * r + s * r, y + dy * r); ctx.arc(x + dx * r, y + dy * r, s * r, 0, 7); }
    ctx.fill(); ctx.restore();
  }
  function drawWeather(t, dt) {
    const k = wx.kind; if (!k) return;
    const dk = dark(), ink = dk ? '220,228,240' : '96,112,138';
    if (k === 'sun' && wx.isDay) { // 斜照进来的光
      ctx.save(); ctx.globalCompositeOperation = dk ? 'lighter' : 'source-over';
      const L = Math.hypot(W, H) * .8;
      for (let i = 0; i < 4; i++) { // 从右上角斜射下来的四束光，缓缓摆动
        const th = (118 + i * 13 + Math.sin(t / 6000 + i * 1.7) * 2.5) * Math.PI / 180, w = (2.2 + (i % 2) * 1.6) * Math.PI / 180;
        const g = ctx.createLinearGradient(W, 0, W + Math.cos(th) * L, Math.sin(th) * L);
        g.addColorStop(0, `rgba(255,214,140,${dk ? .06 : .2})`); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W, 0);
        ctx.lineTo(W + Math.cos(th - w) * L, Math.sin(th - w) * L); ctx.lineTo(W + Math.cos(th + w) * L, Math.sin(th + w) * L); ctx.closePath(); ctx.fill();
      }
      const glow = ctx.createRadialGradient(W, 0, 0, W, 0, Math.max(W, H) * .5);
      glow.addColorStop(0, `rgba(255,220,150,${dk ? .08 : .22})`); glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (stars.length) { // 晴夜：左上角一团月晕，满天细星
      const mg = ctx.createRadialGradient(W * .12, H * .1, 0, W * .12, H * .1, Math.max(W, H) * .35);
      mg.addColorStop(0, `rgba(246,227,176,${dk ? .12 : .3})`); mg.addColorStop(1, 'rgba(246,227,176,0)'); ctx.globalAlpha = 1; ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    }
    for (const s of stars) { s.ph += .02 * dt; ctx.globalAlpha = .3 + .6 * (.5 + .5 * Math.sin(s.ph)); ctx.fillStyle = dk ? '#F6E3B0' : '#7C8AA8'; ctx.beginPath(); ctx.arc(s.x, s.y, s.s * (dk ? 1 : 1.3), 0, 7); ctx.fill(); }
    if (blobs.length) {
      const col = k === 'fog' ? (dk ? 'rgba(170,180,200,1)' : 'rgba(196,205,220,1)') : dk ? 'rgba(120,130,150,1)' : (k === 'cloud' ? 'rgba(206,214,228,1)' : 'rgba(150,160,180,1)');
      for (const b of blobs) {
        b.x += b.v * dt * (1 + wind); if (b.x - b.r > W) b.x = -b.r;
        if (k === 'fog') { const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); g.addColorStop(0, col.replace(',1)', `,${dk ? .14 : .55})`)); g.addColorStop(1, col.replace(',1)', ',0)')); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
        else cloudShape(b.x, b.y, b.r, k === 'cloud' ? (dk ? .2 : .6) : (dk ? .22 : .35), col);
      }
    }
    if (drops.length) {
      ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineWidth = 1.1;
      const sx = .22 + wind * .08;
      for (const d of drops) {
        d.y += d.v * dt; d.x += d.v * sx * dt;
        if (d.y > H + 20) drop(d, true);
        ctx.strokeStyle = `rgba(${ink},${d.a})`; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * sx, d.y - d.l); ctx.stroke();
      }
    }
    for (const f of flakes) {
      f.ph += .02 * dt; f.y += f.v * dt; f.x += (Math.sin(f.ph) * .4 + wind * .3) * dt;
      if (f.y > H + 10) flake(f, true);
      ctx.globalAlpha = f.a; ctx.fillStyle = dk ? '#E8EEF6' : '#FFFFFF'; ctx.shadowColor = 'rgba(120,140,170,.5)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const g of gusts) { // 风：一笔一笔掠过的细线
      g.x += g.v * dt; if (g.x > W + g.len) Object.assign(g, { x: -g.len - R(0, W), y: R(.1, .9) * H });
      ctx.globalAlpha = g.a; ctx.strokeStyle = `rgba(${ink},1)`; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24, x = g.x - g.len + u * g.len, y = g.y + Math.sin(u * 5 + g.x / 140) * g.amp * Math.sin(u * Math.PI); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    if (k === 'thunder') {
      if (t > nextFlash) { flash = 1; nextFlash = t + R(7000, 18000); }
      if (flash > .01) { ctx.globalAlpha = flash * (dk ? .22 : .5); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); flash *= Math.pow(.86, dt); if (flash < .5 && flash > .45 && Math.random() < .5) flash = .8; }
    }
    ctx.globalAlpha = 1;
  }

  function draw(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
    if (season === 'summer') { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.s * 7); g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(230,240,150,0)'); ctx.globalAlpha = .45 + .45 * Math.sin(p.ph * 3); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.s * 7, 0, 7); ctx.fill(); }
    else if (season === 'winter') { ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, 7); ctx.fill(); }
    else if (season === 'spring') { const s = p.s; ctx.scale(Math.cos(p.ph), 1); ctx.globalAlpha = .85; ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(s * .9, s * .4, s * .7, -s * .8, s * .18, -s * .9); ctx.lineTo(0, -s * .55); ctx.lineTo(-s * .18, -s * .9); ctx.bezierCurveTo(-s * .7, -s * .8, -s * .9, s * .4, 0, s); ctx.fill(); }
    else { const s = p.s; ctx.scale(Math.cos(p.ph), 1); ctx.globalAlpha = .8; ctx.beginPath(); ctx.moveTo(0, s * .9); ctx.quadraticCurveTo(-s * 1.1, -s * .1, -s * .8, -s * .7); ctx.quadraticCurveTo(0, -s * 1.05, s * .8, -s * .7); ctx.quadraticCurveTo(s * 1.1, -s * .1, 0, s * .9); ctx.fill(); }
    ctx.restore();
  }
  function tick(t) {
    const dt = Math.min(3, (t - last) / 16.7); last = t; ctx.clearRect(0, 0, W, H);
    drawWeather(t, dt);
    // 下雨下雪时，飘落物少一些；起风时被吹得更快
    const n = wx.kind === 'rain' || wx.kind === 'thunder' || wx.kind === 'snow' ? Math.ceil(parts.length / 3) : parts.length;
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      p.ph += .015 * dt; p.x += (p.vx + Math.sin(p.ph) * .3 + wind * .8) * dt; p.y += p.vy * dt; p.r += p.vr * dt * (1 + wind);
      if (season === 'summer') { p.vx += (Math.random() - .5) * .03; p.vy += (Math.random() - .5) * .03; p.vx *= .98; p.vy *= .98; }
      if (p.y > H + 20 || p.x < -30 || p.x > W + 30 || p.y < -40) { spawn(p, season !== 'summer'); if (wind > 1) p.x = R(-30, W * .5); }
      draw(p);
    }
    raf = requestAnimationFrame(tick);
  }
  const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !quiet()) { last = performance.now(); raf = requestAnimationFrame(tick); } else ctx.clearRect(0, 0, W, H); };
  document.addEventListener('visibilitychange', vis); vis();
  return {
    refresh: vis,
    setWeather(w) { const k = w?.kind || '', d = w ? !!w.isDay : true; if (k === wx.kind && d === wx.isDay) return; wx = { kind: k, isDay: d }; buildWeather(); }
  };
}
