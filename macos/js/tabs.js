/* Window tabs (AppKit automatic tabbing): Window ▸ Merge All Windows, New Tab, Move Tab to New Window, Show Next/Previous Tab.
   Tabs share one frame; only the selected tab's window is on screen. Drag a tab sideways to reorder, or down/up to tear it off. */
(function () {
  const { h, $$, glyph } = OS;
  const wm = OS.wm;
  const T = (OS.tabs = {});
  T.supports = (app) => !!app && !app.singleton && app.id !== 'safari' && app.resizable !== false && !app.noDock;

  const barHost = (w) => w.body.querySelector('.tbar, .te-title, .term-bar');

  function render(g) {
    g.wins.forEach((w) => {
      let bar = w._tabBar;
      if (!bar) {
        bar = w._tabBar = h('div.win-tabs', { 'data-drag': '' });
        const host = barHost(w);
        host ? host.after(bar) : w.body.prepend(bar);
      }
      bar.replaceChildren(
        ...g.wins.map((t) => tabEl(g, t)),
        h('button.wt-add', { 'data-nodrag': '', title: '新建标签页', 'aria-label': '新建标签页', html: glyph('plus'), onclick: () => T.newTab(g.active) })
      );
    });
  }

  function tabEl(g, t) {
    const el = h('div.wt-tab' + (t === g.active ? '.on' : ''), { 'data-nodrag': '', role: 'tab', title: t.title },
      h('button.wt-x', { 'aria-label': '关闭标签页', html: glyph('xmark'), onclick: (e) => (e.stopPropagation(), wm.close(t)) }),
      h('span.wt-title', t.title)
    );
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wt-x')) return;
      e.stopPropagation();
      activate(t);
      const start = wm.pt(e);
      let done = false;
      const move = (ev) => {
        if (done) return;
        const p = wm.pt(ev);
        // tear off: pull the tab out of the bar
        if (Math.abs(p.y - start.y) > 32 && g.wins.length > 1) {
          done = true;
          up();
          T.detach(t, { x: p.x - 120, y: p.y - 14 });
          return;
        }
        // reorder by pointer position among the tabs
        const tabs = $$('.wt-tab', t._tabBar);
        let idx = tabs.findIndex((x) => {
          const r = x.getBoundingClientRect();
          return ev.clientX < r.left + r.width / 2;
        });
        if (idx < 0) idx = tabs.length - 1;
        const cur = g.wins.indexOf(t);
        if (idx !== cur) {
          g.wins.splice(cur, 1);
          g.wins.splice(idx, 0, t);
          render(g);
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    return el;
  }

  function hide(w) {
    w.tabHidden = true;
    w.el.classList.add('tab-bg');
  }
  function show(w) {
    w.tabHidden = false;
    w.el.classList.remove('tab-bg');
  }
  // the newly selected tab takes over the exact frame, Space and stacking of the old one
  function activate(t) {
    const g = t.tabGroup;
    if (!g || g.active === t) return t && !t.tabHidden && focus0(t);
    const prev = g.active;
    t.bounds = { ...prev.bounds };
    t.saved = prev.saved && { ...prev.saved };
    t.state = prev.state === 'full' || prev.state === 'min' ? 'normal' : prev.state;
    t.el.classList.toggle('maximized', prev.el.classList.contains('maximized'));
    if (t.space !== prev.space) {
      t.space = prev.space;
      prev.space.el.appendChild(t.el);
    }
    wm.applyBounds(t);
    t.z = prev.z;
    t.el.style.zIndex = prev.z;
    show(t);
    hide(prev);
    g.active = t;
    focus0(t);
    render(g);
    t.fire('resize');
    OS.emit('windows');
  }

  function group(win) {
    if (win.tabGroup) return win.tabGroup;
    const g = { wins: [win], active: win };
    win.tabGroup = g;
    hook(win);
    return g;
  }
  function hook(w) {
    if (w._tabHook) return;
    w._tabHook = true;
    w.on('close', () => {
      const g = w.tabGroup;
      if (!g) return;
      const i = g.wins.indexOf(w);
      if (g.active === w && g.wins.length > 1) activate(g.wins[i + 1] || g.wins[i - 1]);
      remove(w);
    });
  }
  function remove(w) {
    const g = w.tabGroup;
    if (!g) return;
    g.wins = g.wins.filter((x) => x !== w);
    w.tabGroup = null;
    w._tabBar && w._tabBar.remove();
    w._tabBar = null;
    if (g.wins.length === 1) {
      const last = g.wins[0];
      last.tabGroup = null;
      last._tabBar && last._tabBar.remove();
      last._tabBar = null;
      show(last);
    } else render(g);
  }

  T.join = (into, w) => {
    const g = group(into);
    if (w.tabGroup) remove(w);
    w.tabGroup = g;
    hook(w);
    g.wins.splice(g.wins.indexOf(g.active) + 1, 0, w);
    hide(w);
    activate(w);
  };
  T.newTab = (win) => {
    if (!win || !T.supports(win.app)) return;
    const w = OS.newWindow(win.app.id);
    if (!w || !w.el) return;
    w.el.getAnimations().forEach((a) => a.finish());
    T.join(win, w);
  };
  T.merge = (appId = wm.activeApp()) => {
    const wins = wm.appWindows(appId).filter((w) => !w.closed && w.state !== 'min' && w.state !== 'full' && w.space === OS.spaces.currentSpace() && !w.hiddenApp);
    if (wins.length < 2 || !T.supports(wins[0].app)) return;
    const front = wins.includes(wm.focused) ? wm.focused : wins.slice().sort((a, b) => b.z - a.z)[0];
    wins.forEach((w) => w.tabGroup && w !== front && remove(w));
    const g = group(front);
    wins.filter((w) => w !== front && !g.wins.includes(w)).sort((a, b) => a.z - b.z).forEach((w) => {
      w.tabGroup = g;
      hook(w);
      g.wins.push(w);
      w.bounds = { ...front.bounds };
      wm.applyBounds(w);
      hide(w);
    });
    render(g);
    focus0(front);
    OS.emit('windows');
  };
  T.detach = (t, at) => {
    const g = t.tabGroup;
    if (!g) return;
    if (g.active === t) activate(g.wins[g.wins.indexOf(t) + 1] || g.wins[g.wins.indexOf(t) - 1]);
    remove(t);
    show(t);
    const b = t.bounds;
    t.bounds = { ...b, x: at ? at.x : b.x + 30, y: Math.max(wm.menubarH(), at ? at.y : b.y + 30) };
    t.state = 'normal';
    t.el.classList.remove('maximized');
    wm.applyBounds(t);
    focus0(t);
    !OS.reducedMotion() && t.el.animate([{ transform: 'scale(.96)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], OS.spring('snappy'));
    OS.emit('windows');
  };
  T.step = (win, d) => {
    const g = win && win.tabGroup;
    if (!g) return;
    const i = g.wins.indexOf(g.active);
    activate(g.wins[(i + d + g.wins.length) % g.wins.length]);
  };

  // focusing a background tab (Window menu, ⌥Tab, Dock) selects that tab
  const focus0 = wm.focus;
  wm.focus = (win) => (win && win.tabHidden && win.tabGroup ? activate(win) : focus0(win));
  OS.on('window:title', (w) => w && w.tabGroup && render(w.tabGroup));
})();
