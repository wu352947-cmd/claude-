// 声景与呼吸：左下角的小砚台按钮 → 声景面板；“呼吸一会儿”打开全屏的圆窗呼吸
import { h, quiet } from './ui.js';
import { url } from './site.js';
import { termOf } from './calendar.js';
import { SCENES, seasonScene, play, stop, setVolume, status, onSound, cue } from './sound.js';

const ICON = {
  rain: `<svg viewBox="0 0 64 64"><path class="cl" d="M14 30a10 10 0 0 1 4-19 14 14 0 0 1 26 2 9 9 0 0 1 4 17z"/><g class="drops"><path d="M20 38l-3 8M32 38l-3 8M44 38l-3 8M26 48l-3 8M38 48l-3 8"/></g></svg>`,
  chime: `<svg viewBox="0 0 64 64"><path class="cl" d="M32 4v8"/><g class="swing"><path class="bell" d="M20 28a12 12 0 0 1 24 0v4H20z"/><path d="M32 32v12"/><rect class="tan" x="27" y="44" width="10" height="16" rx="2"/></g></svg>`,
  insects: `<svg viewBox="0 0 64 64"><circle class="moon" cx="46" cy="16" r="7"/><path class="grass" d="M10 60c2-14 6-22 10-28M18 60c0-12 2-20 6-26M30 60c-1-10 2-20 8-28M42 60c0-10 4-16 10-22M50 60c2-8 4-12 8-16"/><g class="notes"><circle cx="24" cy="26" r="1.4"/><circle cx="38" cy="22" r="1.4"/><circle cx="30" cy="16" r="1.4"/></g></svg>`,
  fire: `<svg viewBox="0 0 64 64"><path class="cl" d="M10 54h44M14 60h36"/><path class="flame f1" d="M32 50c-10 0-14-8-10-16 2 4 5 5 6 4-2-8 4-16 10-20-1 8 6 12 6 22 0 6-4 10-12 10z"/><path class="flame f2" d="M32 50c-4 0-6-3-5-7 2 2 4 1 4-1 3 2 6 4 6 8 0 0-2 0-5 0z"/></svg>`,
  bowl: `<svg viewBox="0 0 64 64"><path class="cl" d="M10 34h44c0 12-10 20-22 20S10 46 10 34z"/><path class="cl" d="M26 58h12"/><g class="waves"><path d="M24 26c0-4 4-4 4-8M32 26c0-4 4-4 4-8M40 26c0-4 4-4 4-8"/></g></svg>`
};
const PATTERNS = [
  { k: 'calm', name: '平静', note: '吸 4 · 呼 6', steps: [['in', 4], ['out', 6]] },
  { k: 'box', name: '方块', note: '吸 4 · 停 4 · 呼 4 · 停 4', steps: [['in', 4], ['hold', 4], ['out', 4], ['rest', 4]] },
  { k: 'sleep', name: '入眠', note: '吸 4 · 停 7 · 呼 8', steps: [['in', 4], ['hold', 7], ['out', 8]] }
];
const WORD = { in: ['吸气', 'すう'], hold: ['停一停', 'とめる'], out: ['呼气', 'はく'], rest: ['停一停', 'やすむ'] };

let dock = null;
export function mountCalm() {
  if (dock) return;
  dock = h(`<button type="button" class="calm-dock" aria-label="声景与呼吸" aria-expanded="false">
    <span class="ripple"></span><span class="ripple r2"></span>
    <svg viewBox="0 0 40 40" aria-hidden="true"><path class="moonp" d="M25 8a12 12 0 1 0 7 21A13 13 0 0 1 25 8z"/><g class="eq"><rect x="8" y="27" width="2.4" height="6" rx="1.2"/><rect x="12" y="25" width="2.4" height="8" rx="1.2"/><rect x="16" y="28" width="2.4" height="5" rx="1.2"/></g></svg></button>`);
  document.body.append(dock);
  const sync = s => { dock.classList.toggle('playing', s.playing); };
  onSound(sync); sync(status());
  dock.addEventListener('click', () => (document.querySelector('.calm-pop') ? closePanel() : openPanel()));
}

let pop = null, offSound = null;
function closePanel() {
  if (!pop) return;
  const p = pop; pop = null; offSound?.(); dock.setAttribute('aria-expanded', 'false');
  p.classList.add('out'); setTimeout(() => p.remove(), 300);
  document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc);
}
const outside = e => { if (pop && !pop.contains(e.target) && !dock.contains(e.target)) closePanel(); };
const esc = e => { if (e.key === 'Escape') { closePanel(); dock.focus(); } };

function openPanel() {
  const season = termOf(new Date()).season, suggest = seasonScene(season);
  let pat = 'calm', mins = 1;
  pop = h(`<div class="calm-pop" role="dialog" aria-label="声景与呼吸">
    <h4><span>声景</span><small>おと</small></h4>
    <div class="scenes">${SCENES.map(s => `<button type="button" class="scene" data-k="${s.k}" aria-pressed="false">
      <span class="ic">${ICON[s.k]}</span><b>${s.name}</b><small>${s.sub}</small>${s.k === suggest ? '<em>当季</em>' : ''}</button>`).join('')}</div>
    <label class="vol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="w" d="M16 9a4 4 0 0 1 0 6"/></svg>
      <input type="range" min="0" max="100" aria-label="音量"><span class="v"></span></label>
    <p class="muted hint">声音都是在你的设备上现场合成的，戴上耳机更好听。</p>
    <hr>
    <h4><span>呼吸一会儿</span><small>いき</small></h4>
    <div class="pills" data-g="pat">${PATTERNS.map((p, i) => `<button type="button" data-v="${p.k}" class="${i ? '' : 'on'}" title="${p.note}">${p.name}</button>`).join('')}</div>
    <p class="muted hint pat-note">${PATTERNS[0].note}</p>
    <div class="pills" data-g="mins">${[1, 3, 5].map((m, i) => `<button type="button" data-v="${m}" class="${i ? '' : 'on'}">${m} 分钟</button>`).join('')}</div>
    <button type="button" class="btn ink breathe-go">跟着圆窗呼吸</button>
  </div>`);
  document.body.append(pop);
  dock.setAttribute('aria-expanded', 'true');
  const range = pop.querySelector('input[type=range]'), v = pop.querySelector('.vol .v');
  const sync = s => {
    pop?.querySelectorAll('.scene').forEach(b => { const on = b.dataset.k === s.k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    range.value = Math.round(s.vol * 100); v.textContent = Math.round(s.vol * 100);
  };
  offSound = onSound(sync); sync(status());
  pop.querySelectorAll('.scene').forEach(b => b.addEventListener('click', () => { status().k === b.dataset.k ? stop() : play(b.dataset.k); }));
  range.addEventListener('input', () => setVolume(range.value / 100));
  pop.querySelectorAll('.pills').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (g.dataset.g === 'pat') { pat = b.dataset.v; pop.querySelector('.pat-note').textContent = PATTERNS.find(p => p.k === pat).note; } else mins = Number(b.dataset.v);
  })));
  pop.querySelector('.breathe-go').addEventListener('click', () => { closePanel(); breathe(PATTERNS.find(p => p.k === pat), mins); });
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc); }, 0);
  (pop.querySelector('.scene.on') || pop.querySelector('.scene')).focus({ preventScroll: true });
}

// ---------- 圆窗呼吸 ----------
export function breathe(pattern = PATTERNS[0], mins = 1) {
  const cycle = pattern.steps.reduce((a, [, s]) => a + s, 0), rounds = Math.max(2, Math.round(mins * 60 / cycle));
  const still = quiet();
  const el = h(`<div class="breathe" role="dialog" aria-modal="true" aria-label="呼吸练习">
    <canvas class="motes" aria-hidden="true"></canvas>
    <div class="b-top"><span>${pattern.name} · ${pattern.note}</span><span class="b-left"></span></div>
    <div class="b-stage">
      <div class="b-halo"></div>
      <svg class="b-ring" viewBox="0 0 200 200" aria-hidden="true"><circle class="track" cx="100" cy="100" r="96"/><circle class="prog" cx="100" cy="100" r="96" pathLength="100"/>
        ${Array.from({ length: rounds }, (_, i) => { const a = -Math.PI / 2 + i / rounds * Math.PI * 2; return `<circle class="tick" data-i="${i}" cx="${100 + Math.cos(a) * 96}" cy="${100 + Math.sin(a) * 96}" r="2.6"/>`; }).join('')}</svg>
      <div class="b-gate"><img src="${url('assets/gate-dawn.jpg')}" alt=""><i></i></div>
    </div>
    <div class="b-text"><p class="b-word" aria-live="polite">放松肩膀</p><p class="b-kana">跟着圆窗，慢慢来</p><p class="b-count"></p></div>
    <div class="b-foot"><button type="button" class="btn small b-cue" aria-pressed="true">提示音 · 开</button><button type="button" class="btn small b-end">结束</button></div>
  </div>`);
  document.body.append(el);
  document.documentElement.classList.add('breathing');
  const $ = s => el.querySelector(s);
  const gate = $('.b-gate'), halo = $('.b-halo'), prog = $('.prog'), word = $('.b-word'), kana = $('.b-kana'), count = $('.b-count'), left = $('.b-left');
  let cues = true, raf = 0, ended = false;
  $('.b-cue').addEventListener('click', e => { cues = !cues; e.currentTarget.textContent = `提示音 · ${cues ? '开' : '关'}`; e.currentTarget.setAttribute('aria-pressed', cues); });
  const close = () => { cancelAnimationFrame(raf); el.classList.add('out'); document.documentElement.classList.remove('breathing'); document.removeEventListener('keydown', key); removeEventListener('resize', resize); setTimeout(() => el.remove(), 600); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  $('.b-end').addEventListener('click', close);
  setTimeout(() => $('.b-end').focus({ preventScroll: true }), 50);

  // 光点：吸气时向圆窗聚拢，呼气时散开
  const cv = $('.motes'), g2 = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  const motes = Array.from({ length: still ? 0 : 70 }, () => ({ a: Math.random() * Math.PI * 2, d: .55 + Math.random() * .9, s: .6 + Math.random() * 1.8, w: (Math.random() - .5) * .0016, tw: Math.random() * 6 }));
  const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
  resize(); addEventListener('resize', resize);
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#D6A246';

  const SMALL = .7, ease = x => .5 - Math.cos(Math.PI * x) / 2;
  const t0 = performance.now() + 2600, total = rounds * cycle * 1000;
  let lastPhase = -1, lastRound = -1, sc = SMALL;
  gate.style.setProperty('--s', SMALL);
  const frame = now => {
    raf = requestAnimationFrame(frame);
    const el0 = now - t0;
    if (el0 < 0) { sc = SMALL; draw(now, SMALL, 'prep'); return; }
    if (el0 >= total) { if (!ended) finish(); draw(now, SMALL, 'end'); return; }
    const round = Math.floor(el0 / (cycle * 1000)); let tIn = el0 / 1000 - round * cycle, pi = 0;
    while (tIn >= pattern.steps[pi][1]) { tIn -= pattern.steps[pi][1]; pi++; }
    const [kind, dur] = pattern.steps[pi], p = tIn / dur;
    sc = kind === 'in' ? SMALL + (1 - SMALL) * ease(p) : kind === 'out' ? 1 - (1 - SMALL) * ease(p) : kind === 'hold' ? 1 : SMALL;
    const ph = round * 10 + pi;
    if (ph !== lastPhase) {
      lastPhase = ph; word.textContent = WORD[kind][0]; kana.textContent = WORD[kind][1];
      el.dataset.phase = kind; if (cues) cue(kind === 'in' ? 'in' : kind === 'out' ? 'out' : 'soft');
    }
    if (round !== lastRound) { lastRound = round; el.querySelectorAll('.tick').forEach(t => t.classList.toggle('done', Number(t.dataset.i) < round)); }
    count.textContent = Math.ceil(dur - tIn);
    prog.style.strokeDashoffset = 100 - p * 100;
    const remain = Math.ceil((total - el0) / 1000);
    left.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
    draw(now, sc, kind);
  };
  function draw(now, s, kind) {
    if (!still) { gate.style.setProperty('--s', s.toFixed(4)); halo.style.setProperty('--s', s.toFixed(4)); }
    else { halo.style.opacity = .25 + (s - SMALL) / (1 - SMALL) * .6; }
    if (!motes.length) return;
    const W = cv.width, H = cv.height, cx = W / 2, cy = H * .46, R0 = Math.min(W, H) * .2;
    g2.clearRect(0, 0, W, H); g2.fillStyle = acc;
    const pull = (s - SMALL) / (1 - SMALL);
    for (const m of motes) {
      m.a += m.w;
      const r = R0 * (1.25 + m.d * (1.6 - pull * 1.1));
      const x = cx + Math.cos(m.a) * r, y = cy + Math.sin(m.a) * r * .92;
      g2.globalAlpha = (.25 + .45 * (.5 + .5 * Math.sin(now / 900 + m.tw))) * (kind === 'end' ? .4 : 1);
      g2.beginPath(); g2.arc(x, y, m.s * dpr, 0, Math.PI * 2); g2.fill();
    }
  }
  function finish() {
    ended = true; el.dataset.phase = 'end'; if (cues) cue('end');
    el.querySelectorAll('.tick').forEach(t => t.classList.add('done')); prog.style.strokeDashoffset = 0;
    word.textContent = '做完了'; kana.textContent = `${rounds} 轮呼吸。愿你此刻松快一些`; count.textContent = ''; left.textContent = '';
    const foot = $('.b-foot');
    foot.innerHTML = `<button type="button" class="btn small b-again">再来一轮</button><button type="button" class="btn small ink b-write">去写今天</button>`;
    foot.querySelector('.b-again').addEventListener('click', () => { close(); setTimeout(() => breathe(pattern, mins), 300); });
    foot.querySelector('.b-write').addEventListener('click', () => { close(); location.hash = '#/today'; });
    foot.querySelector('.b-write').focus({ preventScroll: true });
  }
  raf = requestAnimationFrame(frame);
}
