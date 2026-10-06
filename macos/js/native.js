/* Native feel: rubber-band overscroll on every scroll view, and trackpad swipes between Spaces that follow the fingers. */
(function () {
  const { $ } = OS;
  const wm = OS.wm;

  /* ---------- rubber-band scrolling ---------- */
  // Content keeps moving past the edge with growing resistance, then springs back the moment the fingers lift.
  const scrollable = new WeakMap();
  const canScrollY = (el) => {
    let v = scrollable.get(el);
    if (v === undefined) {
      const o = getComputedStyle(el).overflowY;
      v = o === 'auto' || o === 'scroll';
      scrollable.set(el, v);
    }
    return v && el.scrollHeight > el.clientHeight + 1;
  };
  const SKIP = '.leaflet-container, canvas, .launchpad, .no-elastic, input[type="range"], .menu, #dock-wrap';
  let band = null; // { el, off, raf, timer }
  const MAX = 90;
  const setOff = (b, v) => {
    b.off = v;
    const t = v ? `translate3d(0, ${v.toFixed(2)}px, 0)` : '';
    for (const c of b.el.children) c.style.transform = t;
  };
  const release = (b, v0 = 0) => {
    // critically damped spring back to rest (optionally kicked with the incoming scroll velocity)
    let x = b.off, vel = v0, last = performance.now();
    const k = 260, c = 2 * Math.sqrt(k);
    const step = (t) => {
      const dt = Math.min(0.032, (t - last) / 1000);
      last = t;
      vel += (-k * x - c * vel) * dt;
      x += vel * dt;
      if (Math.abs(x) < 0.3 && Math.abs(vel) < 4) {
        setOff(b, 0);
        b.el.classList.remove('rubber');
        if (band === b) band = null;
        return;
      }
      setOff(b, x);
      b.raf = requestAnimationFrame(step);
    };
    b.raf = requestAnimationFrame(step);
  };
  document.addEventListener(
    'wheel',
    (e) => {
      if (OS.reducedMotion() || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || notched(e)) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(SKIP)) return;
      let el = t;
      while (el && el !== document.body && !canScrollY(el)) el = el.parentElement;
      if (!el || el === document.body || !el.closest('.win')) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const atTop = el.scrollTop <= 0 && dy < 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && dy > 0;
      if (!atTop && !atBottom) {
        if (band && band.el === el && band.off) {
          // reversing out of the band: give the distance back first
          cancelAnimationFrame(band.raf);
          release(band);
        }
        return;
      }
      if (!band || band.el !== el) {
        if (band) (cancelAnimationFrame(band.raf), setOff(band, 0), band.el.classList.remove('rubber'));
        band = { el, off: 0, raf: 0, timer: 0 };
        el.classList.add('rubber');
      }
      cancelAnimationFrame(band.raf);
      // resistance grows with distance, like UIScrollView / NSScrollView
      const ratio = 1 - Math.abs(band.off) / MAX;
      const next = Math.max(-MAX, Math.min(MAX, band.off - dy * 0.35 * Math.max(0.05, ratio)));
      const b = band;
      wm.nextFrame('rubber', () => setOff(b, next));
      b.off = next;
      clearTimeout(b.timer);
      b.timer = setTimeout(() => release(b), 90);
    },
    { passive: true }
  );

  /* ---------- momentum for notched mouse wheels ---------- */
  // Trackpads already deliver momentum; a notched wheel jumps in fixed steps. Give it a glide that decays like
  // NSScrollView and bounces when it runs into the end.
  function notched(e) {
    if (e.deltaMode === 1) return true;
    const w = e.wheelDeltaY;
    return e.deltaX === 0 && !!w && Math.abs(w) >= 120 && w % 120 === 0;
  }
  const glides = new WeakMap();
  function findScroller(t) {
    let el = t;
    while (el && el !== document.body && !canScrollY(el)) el = el.parentElement;
    return el && el !== document.body && el.closest('.win') ? el : null;
  }
  function bounce(el, v) {
    if (band && band.el !== el) (cancelAnimationFrame(band.raf), setOff(band, 0), band.el.classList.remove('rubber'));
    if (!band || band.el !== el) {
      band = { el, off: 0, raf: 0, timer: 0 };
      el.classList.add('rubber');
    }
    cancelAnimationFrame(band.raf);
    // scroll velocity (px/frame) → overshoot velocity (px/s), content moves opposite to scroll direction
    release(band, Math.max(-1400, Math.min(1400, -v * 60 * 0.7)));
  }
  document.addEventListener(
    'wheel',
    (e) => {
      if (!notched(e) || e.ctrlKey || OS.reducedMotion()) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(SKIP)) return;
      const el = findScroller(t);
      if (!el) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      let g = glides.get(el);
      if (!g) glides.set(el, (g = { v: 0, raf: 0, last: 0, pos: el.scrollTop }));
      if (!g.raf) g.pos = el.scrollTop;
      g.v += dy * 0.16;
      if (g.raf) return;
      g.last = performance.now();
      const step = (now) => {
        const dt = Math.min(48, now - g.last) / 16.667;
        g.last = now;
        const max = el.scrollHeight - el.clientHeight;
        g.pos += g.v * dt;
        g.v *= Math.pow(0.9, dt);
        if (g.pos <= 0 || g.pos >= max) {
          g.pos = Math.max(0, Math.min(max, g.pos));
          el.scrollTop = g.pos;
          if (Math.abs(g.v) > 2) bounce(el, g.v);
          g.v = 0;
          g.raf = 0;
          return;
        }
        el.scrollTop = g.pos;
        if (Math.abs(g.v) < 0.15) return (g.raf = 0), (g.v = 0);
        g.raf = requestAnimationFrame(step);
      };
      g.raf = requestAnimationFrame(step);
    },
    { passive: false }
  );

  /* ---------- Spaces swipe ---------- */
  // Two-finger horizontal swipe on the desktop drags the Spaces strip 1:1, then settles on a spring.
  let swipe = null; // { dx, timer, t, v }
  const track = () => $('#spaces-track');
  const settle = () => {
    const s = swipe;
    swipe = null;
    if (!s) return;
    const w = wm.screen().w;
    const cur = OS.spaces.current;
    let target = cur;
    const flick = Math.abs(s.v) > 0.6;
    if (s.dx > w * 0.2 || (flick && s.v > 0)) target = cur + 1;
    if (s.dx < -w * 0.2 || (flick && s.v < 0)) target = cur - 1;
    target = Math.max(0, Math.min(OS.spaces.list.length - 1, target));
    if (target !== cur) OS.spaces.go(target);
    else {
      const sp = OS.spring('snappy');
      const tr = track();
      tr.style.transition = `transform ${sp.duration}ms ${sp.easing}`;
      tr.style.transform = `translateX(${-cur * 100}%)`;
      OS.spaces.park();
    }
  };
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.4 || Math.abs(e.deltaX) < 1) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest('.win, #dock-wrap, #menubar, #overlays, .menu, .launchpad, .mission')) return;
      if (document.body.classList.contains('mission')) return;
      const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      const now = performance.now();
      if (!swipe) ((swipe = { dx: 0, timer: 0, t: now, v: 0 }), OS.spaces.wake());
      swipe.v = swipe.v * 0.6 + (dx / Math.max(8, now - swipe.t)) * 0.4;
      swipe.t = now;
      const n = OS.spaces.list.length, cur = OS.spaces.current, w = wm.screen().w;
      swipe.dx += dx;
      // rubber-band past the first and last Space
      let shown = swipe.dx;
      if ((cur === 0 && shown < 0) || (cur === n - 1 && shown > 0)) shown = Math.sign(shown) * w * 0.12 * (1 - Math.exp(-Math.abs(shown) / (w * 0.12)));
      shown = Math.max(-w, Math.min(w, shown));
      const s = swipe;
      wm.nextFrame('swipe', () => {
        const tr = track();
        tr.style.transition = 'none';
        tr.style.transform = `translateX(calc(${-cur * 100}% - ${shown.toFixed(1)}px))`;
      });
      clearTimeout(s.timer);
      s.timer = setTimeout(() => (wm.cancelFrame('swipe'), settle()), 110);
    },
    { passive: true }
  );

  /* ---------- adaptive quality ---------- */
  // Sample frame pacing only while something is moving. If the machine keeps missing frames, drop live blur for the session.
  const root = document.documentElement;
  try {
    if (sessionStorage.getItem('macos.liteGlass') === '1') root.classList.add('lite-glass');
  } catch (e) {}
  let sampling = false, strikes = 0;
  const sample = () => {
    if (sampling || root.classList.contains('lite-glass') || document.hidden) return;
    sampling = true;
    const deltas = [];
    let last = 0;
    const f = (t) => {
      if (last) deltas.push(t - last);
      last = t;
      if (deltas.length < 45) return requestAnimationFrame(f);
      sampling = false;
      const slow = deltas.filter((d) => d > 26).length / deltas.length;
      strikes = slow > 0.5 ? strikes + 1 : Math.max(0, strikes - 1);
      if (strikes >= 3) {
        root.classList.add('lite-glass');
        try {
          sessionStorage.setItem('macos.liteGlass', '1');
        } catch (e) {}
      }
    };
    requestAnimationFrame(f);
  };
  let lastKick = 0;
  const kick = () => {
    const t = performance.now();
    if (t - lastKick > 1500) ((lastKick = t), sample());
  };
  ['pointermove', 'wheel'].forEach((ev) => document.addEventListener(ev, kick, { passive: true }));
  OS.on('windows', kick);
  OS.liteGlass = (on) => {
    root.classList.toggle('lite-glass', on);
    strikes = 0;
    try {
      on ? sessionStorage.setItem('macos.liteGlass', '1') : sessionStorage.removeItem('macos.liteGlass');
    } catch (e) {}
  };
})();
