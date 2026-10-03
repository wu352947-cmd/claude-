// 新手仪式：用聚光灯带着写下第一页（选心情 → 写一句 → 贴贴纸 → 盖印）
import { h, sleep } from './ui.js';

export function startCoach({ root, page, onFinish }) {
  const steps = [
    { sel: '.page .moods', text: '先选一个此刻的心情。', done: () => !!page.data().mood },
    { sel: '.page .writing', text: '写下一句话，长短都可以。今天发生的小事、此刻的感受，都好。', done: () => page.data().body.trim().length >= 2 && !document.querySelector('.write-sheet') },
    { sel: '#sgrid', text: '从这里挑一枚贴纸，贴到纸上。贴好后可以拖动、旋转。', done: () => page.data().page.stickers.length > 0 },
    { sel: '#sealBtn', text: '最后，盖上你的第一枚印。', done: () => root.querySelector('#sealBtn')?.disabled }
  ];
  let i = -1, raf = 0, alive = true;
  const hole = h('<div class="coach-hole" aria-hidden="true"></div>');
  const tip = h(`<div class="coach-tip" role="dialog" aria-live="polite"><p class="ct-step"></p><p class="ct-text"></p><button type="button" class="linkish ct-skip">跳过引导</button></div>`);
  const finish = async skipped => {
    if (!alive) return; alive = false; cancelAnimationFrame(raf); hole.remove(); tip.remove();
    if (!skipped) await outro();
    onFinish?.();
  };
  tip.querySelector('.ct-skip').addEventListener('click', () => finish(true));

  const intro = h(`<div class="coach-card" role="dialog" aria-modal="true"><div class="cc-paper">
    <p class="cc-seal">拾</p><h2>欢迎翻开你的手帐</h2>
    <p>这是一本只属于你的手帐。每天一页，节气为序，写完可以封存，也可以请月亮回一封信。</p>
    <p class="muted">我们先一起写下第一页，大约半分钟。</p>
    <div class="row"><button type="button" class="btn" data-skip>以后再说</button><button type="button" class="btn ink" data-go>翻开第一页</button></div></div></div>`);
  document.body.append(intro);
  intro.querySelector('[data-skip]').addEventListener('click', () => { intro.remove(); finish(true); });
  intro.querySelector('[data-go]').addEventListener('click', async () => { intro.classList.add('out'); await sleep(450); intro.remove(); document.body.append(hole, tip); next(); });

  function next() {
    i++;
    if (i >= steps.length) return finish(false);
    const st = steps[i], t = root.querySelector(st.sel);
    if (!t) return next();
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tip.querySelector('.ct-step').textContent = `第 ${i + 1} 步 · 共 ${steps.length} 步`;
    tip.querySelector('.ct-text').textContent = st.text;
    tip.classList.remove('pop'); void tip.offsetWidth; tip.classList.add('pop');
  }
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const st = steps[i]; if (!st) return;
    const t = root.querySelector(st.sel); if (!t) return;
    const r = t.getBoundingClientRect(), pad = 10;
    hole.style.transform = `translate(${r.left - pad}px, ${r.top - pad}px)`; hole.style.width = r.width + pad * 2 + 'px'; hole.style.height = Math.min(r.height, innerHeight * .6) + pad * 2 + 'px';
    const below = r.bottom + 150 < innerHeight;
    const tx = Math.max(12, Math.min(innerWidth - 332, r.left)), ty = below ? r.bottom + pad + 12 : Math.max(12, r.top - pad - 12 - tip.offsetHeight);
    tip.style.transform = `translate(${tx}px, ${ty}px)`;
    if (st.done()) { steps[i] = null; setTimeout(next, 650); }
  }
  loop();

  async function outro() {
    await sleep(1300);
    const card = h(`<div class="coach-card" role="dialog" aria-modal="true"><div class="cc-paper">
      <p class="cc-seal">成</p><h2>第一页完成了</h2>
      <p>每写一天，「画卷」里的山水就会长出一段；心情会为山顶着色，封存的日子水上会有一叶小舟。</p>
      <p class="muted">明天见。</p><div class="row"><a class="btn" href="#/scroll" data-x>去看看画卷</a><button type="button" class="btn ink" data-x>好的</button></div></div></div>`);
    document.body.append(card);
    await new Promise(r => card.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', r)));
    card.classList.add('out'); await sleep(450); card.remove();
  }
}
