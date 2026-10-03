// 背景飘落物：随季节变化（春樱 · 夏萤 · 秋叶 · 冬雪），数量克制，标签页隐藏时暂停
import { quiet } from './ui.js';
export function startFx(canvas, season) {
  const ctx = canvas.getContext('2d'); let W = 0, H = 0, parts = [], raf = 0, last = performance.now();
  const colors = { spring: ['#F4BFC8', '#EFA9B6'], summer: ['rgba(230,240,150,.9)'], autumn: ['#E3A93E', '#D9672F', '#EBC24E'], winter: ['#DDE5EF', '#FFFFFF'] }[season];
  const resize = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * d; canvas.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const spawn = (p, top) => Object.assign(p, { x: Math.random() * W, y: top ? -20 : Math.random() * H, s: season === 'winter' ? 1.5 + Math.random() * 2.5 : season === 'summer' ? 1.5 + Math.random() : 5 + Math.random() * 6,
    vy: season === 'summer' ? (Math.random() - .5) * .15 : .25 + Math.random() * .45, vx: (Math.random() - .3) * .3, r: Math.random() * 6.3, vr: (Math.random() - .5) * .02, ph: Math.random() * 6.3, c: colors[Math.floor(Math.random() * colors.length)] });
  resize(); addEventListener('resize', resize);
  parts = Array.from({ length: Math.round(Math.min(26, W / 55)) }, () => spawn({}, false));
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
    for (const p of parts) {
      p.ph += .015 * dt; p.x += (p.vx + Math.sin(p.ph) * .3) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (season === 'summer') { p.vx += (Math.random() - .5) * .03; p.vy += (Math.random() - .5) * .03; p.vx *= .98; p.vy *= .98; }
      if (p.y > H + 20 || p.x < -30 || p.x > W + 30 || p.y < -40) spawn(p, season !== 'summer');
      draw(p);
    }
    raf = requestAnimationFrame(tick);
  }
  const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !quiet()) { last = performance.now(); raf = requestAnimationFrame(tick); } else ctx.clearRect(0, 0, W, H); };
  document.addEventListener('visibilitychange', vis); vis();
  return { refresh: vis };
}
