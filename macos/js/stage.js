/* Stage Manager: the active app sits center stage, every other app shrinks into a live, slightly tilted stack on the left. */
(function () {
  const wm = OS.wm;
  const MAX_GROUPS = 6, MAX_PER_GROUP = 3, STRIP_W = 150, LEFT = 18;
  let mru = [];
  const schedule = () => wm.nextFrame('stage', layout);
  OS.on('focus', (id) => {
    mru = [id, ...mru.filter((x) => x !== id)];
    schedule();
  });
  ['windows', 'spaces', 'setting:stageManager', 'showdesktop', 'mission'].forEach((ev) => OS.on(ev, schedule));
  window.addEventListener('resize', schedule);

  const settle = new WeakMap();
  function release(w) {
    if (!w._stage) return;
    w._stage = false;
    const el = w.el;
    // fly back to the real frame on the same spring, then drop the helper classes
    el.classList.add('sm-back');
    el.classList.remove('sm-strip', 'sm-gone');
    el.style.removeProperty('--sm');
    clearTimeout(settle.get(el));
    settle.set(el, setTimeout(() => el.classList.remove('sm-back'), OS.spring('window').duration + 40));
  }
  function place(w, t, gone) {
    const el = w.el;
    clearTimeout(settle.get(el));
    el.classList.remove('sm-back');
    w._stage = true;
    el.style.setProperty('--sm', t);
    el.classList.add('sm-strip');
    el.classList.toggle('sm-gone', !!gone);
  }

  function layout() {
    const want = !!OS.settings.stageManager;
    document.body.classList.toggle('stage-manager', want);
    const active = want && !document.body.classList.contains('mission') && !(OS.showDesktop && OS.showDesktop.active);
    const space = OS.spaces.currentSpace();
    if (!active) return wm.windows.forEach(release);
    const wins = wm.windows.filter((w) => !w.closed && w.state !== 'min' && w.state !== 'full' && !w.hiddenApp && !w.tabHidden && !w.tabHidden && w.space === space && w.bounds);
    wm.windows.filter((w) => !wins.includes(w)).forEach(release);
    const stageApp = wm.focused && wins.includes(wm.focused) ? wm.focused.app.id : mru.find((id) => wins.some((w) => w.app.id === id));
    wins.filter((w) => w.app.id === stageApp).forEach(release);

    const groups = new Map();
    wins
      .filter((w) => w.app.id !== stageApp)
      .sort((a, b) => b.z - a.z)
      .forEach((w) => (groups.get(w.app.id) || groups.set(w.app.id, []).get(w.app.id)).push(w));
    const apps = [...groups.keys()].sort((a, b) => (mru.indexOf(a) + 1 || 999) - (mru.indexOf(b) + 1 || 999));
    const scr = wm.screen(), mb = wm.menubarH();
    const n = Math.min(MAX_GROUPS, apps.length);
    const slotH = Math.min(160, (scr.h - mb - 140) / Math.max(1, n));
    const top0 = mb + (scr.h - mb - 90 - slotH * n) / 2;
    apps.forEach((id, gi) => {
      groups.get(id).forEach((w, k) => {
        const b = w.bounds;
        const s = Math.min(STRIP_W / b.w, (slotH - 26) / b.h);
        const g = Math.min(gi, n - 1);
        const x = LEFT + k * 7;
        const yc = top0 + g * slotH + slotH / 2 - k * 5;
        // origin is the window's left-centre; tilt away from the viewer like the real strip
        const t = `translate(${(x - b.x).toFixed(1)}px, ${(yc - (b.y + b.h / 2)).toFixed(1)}px) scale(${s.toFixed(4)}) perspective(${Math.round(b.w * 2.4)}px) rotateY(${14}deg)`;
        place(w, t, gi >= MAX_GROUPS || k >= MAX_PER_GROUP);
      });
    });
  }
  OS.stage = { layout: schedule };
})();
