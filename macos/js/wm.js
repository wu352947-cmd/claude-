/* Window manager: windows, focus, drag/resize, tiling, minimize (genie), full screen, Spaces, dialogs. */
(function () {
  const { h, $, clamp } = OS;
  const wm = (OS.wm = { windows: [], z: 100, focused: null });
  const running = (OS.running = new Map()); // appId -> { windows: Set }

  /* ---------- Spaces ---------- */
  OS.spaces = { list: [], current: 0 };
  function makeSpace() {
    const el = h('div.space');
    $('#spaces-track').appendChild(el);
    const s = { id: OS.uid(), el };
    OS.spaces.list.push(s);
    layoutSpaces();
    OS.emit('spaces');
    return s;
  }
  function layoutSpaces() {
    OS.spaces.list.forEach((s, i) => (s.el.style.left = i * 100 + '%'));
    $('#spaces-track').style.transform = `translateX(${-OS.spaces.current * 100}%)`;
  }
  OS.spaces.add = () => makeSpace();
  OS.spaces.remove = (i) => {
    if (OS.spaces.list.length <= 1) return;
    const s = OS.spaces.list[i];
    const target = OS.spaces.list[i === 0 ? 1 : i - 1];
    wm.windows.filter((w) => w.space === s).forEach((w) => {
      w.space = target;
      target.el.appendChild(w.el);
    });
    s.el.remove();
    OS.spaces.list.splice(i, 1);
    OS.spaces.current = Math.min(OS.spaces.current, OS.spaces.list.length - 1);
    layoutSpaces();
    OS.emit('spaces');
  };
  OS.spaces.go = (i, animate = true) => {
    i = clamp(i, 0, OS.spaces.list.length - 1);
    const track = $('#spaces-track');
    track.style.transition = animate && !OS.reducedMotion() ? 'transform .55s cubic-bezier(.3,.9,.25,1)' : 'none';
    if (i === OS.spaces.current) {
      if (animate) {
        // rubber-band at the ends
        track.animate([{ transform: track.style.transform }, { transform: `translateX(${-i * 100 + (i === 0 ? 3 : -3)}%)` }, { transform: track.style.transform }], { duration: 380, easing: 'ease-out' });
      }
      return;
    }
    OS.spaces.current = i;
    layoutSpaces();
    OS.emit('spaces');
    const top = wm.windows.filter((w) => w.space === OS.spaces.list[i] && w.state !== 'min').sort((a, b) => b.z - a.z)[0];
    if (top) wm.focus(top);
    else wm.blurAll();
    OS.notifyHUD && OS.notifyHUD('space', i);
  };
  OS.spaces.currentSpace = () => OS.spaces.list[OS.spaces.current];

  /* ---------- geometry ---------- */
  wm.screen = () => {
    const s = $('#screen');
    return { w: s.clientWidth, h: s.clientHeight };
  };
  wm.menubarH = () => (document.body.classList.contains('menubar-hidden') ? 0 : $('#menubar').offsetHeight || 28);
  /* usable work area (not covered by menu bar or a visible Dock) */
  wm.area = () => {
    const { w, h: H } = wm.screen();
    const top = wm.menubarH();
    let left = 0,
      right = w,
      bottom = H;
    if (!OS.settings.dockAutohide) {
      const dock = $('#dock');
      const pos = OS.settings.dockPosition;
      const size = OS.settings.dockSize + 22;
      if (pos === 'bottom') bottom -= size;
      else if (pos === 'left') left += size;
      else right -= size;
      if (!dock) bottom = H;
    }
    return { x: left, y: top, w: right - left, h: bottom - top };
  };
  /* convert a client pointer coordinate into #screen coordinates (screen may be scaled on small viewports) */
  wm.pt = (e) => {
    const r = $('#screen').getBoundingClientRect();
    return { x: (e.clientX - r.left) / OS.scale, y: (e.clientY - r.top) / OS.scale };
  };

  /* ---------- window creation ---------- */
  wm.create = function (app, opts = {}) {
    const area = wm.area();
    const W = Math.min(opts.width || app.width || 760, area.w - 20);
    const H = Math.min(opts.height || app.height || 500, area.h - 16);
    const count = wm.windows.filter((w) => w.app === app).length;
    const cascade = (wm.windows.length % 6) * 26;
    let x = opts.x ?? Math.round(area.x + (area.w - W) / 2 + (count ? cascade : 0) - (count ? 60 : 0));
    let y = opts.y ?? Math.round(area.y + Math.max(8, (area.h - H) / 2 - 30) + (count ? cascade : 0));
    x = clamp(x, area.x, area.x + area.w - 80);
    y = clamp(y, area.y, area.y + area.h - 60);

    const win = {
      id: OS.uid(),
      app,
      title: opts.title || app.name,
      state: 'normal',
      z: ++wm.z,
      bounds: { x, y, w: W, h: H },
      space: OS.spaces.currentSpace(),
      handlers: {},
      minW: app.minWidth || 300,
      minH: app.minHeight || 200,
    };
    win.on = (ev, fn) => ((win.handlers[ev] = win.handlers[ev] || []).push(fn), win);
    win.fire = (ev, d) => (win.handlers[ev] || []).forEach((fn) => fn(d));

    const tl = h('div.tl', { 'data-nodrag': '' },
      h('button.tl-btn.tl-close', { title: '关闭', 'aria-label': '关闭', onclick: (e) => (e.stopPropagation(), wm.close(win)) }, h('i', { html: '<svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg>' })),
      h('button.tl-btn.tl-min', { title: '最小化', 'aria-label': '最小化', onclick: (e) => (e.stopPropagation(), wm.minimize(win)) }, h('i', { html: '<svg viewBox="0 0 12 12"><path d="M2.8 6h6.4"/></svg>' })),
      h('button.tl-btn.tl-max', {
        title: '进入全屏幕', 'aria-label': '全屏幕',
        onclick: (e) => {
          e.stopPropagation();
          if (e.altKey) wm.zoom(win);
          else wm.toggleFull(win);
        },
      }, h('i', { html: '<svg viewBox="0 0 12 12"><path d="M3.2 7.6V3.2h4.4z M8.8 4.4v4.4H4.4z" fill="currentColor" stroke="none"/></svg>' }))
    );
    if (app.resizable === false) tl.querySelector('.tl-max').classList.add('disabled');

    const body = h('div.win-body');
    const el = h('div.win', { 'data-app': app.id, role: 'dialog', 'aria-label': win.title }, tl, body);
    if (app.chrome === 'standard') {
      const tb = h('div.win-titlebar', { 'data-drag': '' }, h('span.win-title', win.title));
      el.insertBefore(tb, body);
      el.classList.add('has-titlebar');
      win.titleEl = tb.querySelector('.win-title');
    }
    if (app.windowClass) el.classList.add(...app.windowClass.split(' '));
    if (app.resizable !== false) {
      ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((d) => el.appendChild(h('div.rz.rz-' + d, { 'data-rz': d })));
    }
    win.el = el;
    win.body = body;
    win.setTitle = (t) => {
      win.title = t;
      el.setAttribute('aria-label', t);
      if (win.titleEl) win.titleEl.textContent = t;
      OS.emit('window:title', win);
    };
    win.close = () => wm.close(win);
    win.focus = () => wm.focus(win);
    wm.applyBounds(win);
    el.style.zIndex = win.z;
    win.space.el.appendChild(el);
    wm.windows.push(win);

    if (!running.has(app.id)) running.set(app.id, { windows: new Set() });
    running.get(app.id).windows.add(win);

    el.addEventListener('pointerdown', (e) => onPointerDown(e, win), true);
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('[data-drag]') && !e.target.closest('button,input,textarea,select,a,[data-nodrag]')) {
        if (OS.settings.doubleClickTitle === 'minimize') wm.minimize(win);
        else wm.zoom(win);
      }
    });
    attachGreenHover(win, tl.querySelector('.tl-max'));

    try {
      app.create(win, opts.args || {});
    } catch (err) {
      console.error(err);
      body.appendChild(h('div.app-error', '这个应用遇到了问题：' + err.message));
    }
    if (opts.maximized) wm.zoom(win, false);

    // open animation
    if (!OS.reducedMotion()) {
      el.animate(
        [
          { opacity: 0, transform: 'scale(.92) translateY(10px)', filter: 'blur(3px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
        ],
        { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1.05)' }
      );
    }
    wm.focus(win);
    OS.emit('app:open', app.id);
    OS.emit('windows');
    return win;
  };

  wm.applyBounds = (win) => {
    const b = win.bounds;
    Object.assign(win.el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
  };

  /* ---------- focus ---------- */
  wm.focus = (win) => {
    if (!win || win.closed) return;
    if (win.space !== OS.spaces.currentSpace()) {
      OS.spaces.go(OS.spaces.list.indexOf(win.space));
    }
    if (win.state === 'min') return wm.restore(win);
    if (wm.focused !== win || win.z !== wm.z) {
      win.z = ++wm.z;
      win.el.style.zIndex = win.z;
    }
    wm.windows.forEach((w) => w.el.classList.toggle('focused', w === win));
    const prev = wm.focused;
    wm.focused = win;
    if (prev !== win) {
      prev && prev.fire('blur');
      win.fire('focus');
      OS.emit('focus', win.app.id);
    }
  };
  wm.blurAll = () => {
    wm.windows.forEach((w) => w.el.classList.remove('focused'));
    wm.focused && wm.focused.fire('blur');
    wm.focused = null;
    OS.emit('focus', 'finder');
  };
  wm.activeApp = () => (wm.focused ? wm.focused.app.id : 'finder');
  wm.appWindows = (appId) => wm.windows.filter((w) => w.app.id === appId);
  wm.focusApp = (appId) => {
    const wins = wm.appWindows(appId).sort((a, b) => b.z - a.z);
    const vis = wins.filter((w) => w.state !== 'min');
    if (vis.length) {
      // bring all of the app's windows forward, keep order
      vis.slice().reverse().forEach((w) => {
        w.z = ++wm.z;
        w.el.style.zIndex = w.z;
      });
      wm.focus(vis[0]);
    } else if (wins.length) wm.restore(wins[0]);
    return wins.length > 0;
  };
  function topVisible(exclude) {
    return wm.windows
      .filter((w) => w !== exclude && w.state !== 'min' && w.space === OS.spaces.currentSpace())
      .sort((a, b) => b.z - a.z)[0];
  }

  /* ---------- close / quit ---------- */
  wm.close = (win, force) => {
    if (!win || win.closed) return;
    if (!force && win.beforeClose && win.beforeClose() === false) return;
    win.closed = true;
    win.fire('close');
    const done = () => {
      win.el.remove();
      wm.windows = wm.windows.filter((w) => w !== win);
      const r = running.get(win.app.id);
      if (r) {
        r.windows.delete(win);
        if (!r.windows.size && (win.app.quitOnClose || win.app.id !== 'finder') && win.app.quitOnClose !== false) {
          if (win.app.quitOnClose) running.delete(win.app.id);
        }
      }
      if (wm.focused === win) {
        wm.focused = null;
        const next = topVisible(win);
        if (next && next.app === win.app) wm.focus(next);
        else if (running.has(win.app.id) && win.app.id !== 'finder') {
          // app keeps running without windows; keep menu bar on it
          OS.emit('focus', win.app.id);
          wm.ghostApp = win.app.id;
        } else if (next) wm.focus(next);
        else wm.blurAll();
      }
      OS.emit('windows');
    };
    if (OS.reducedMotion()) return done();
    win.el.style.pointerEvents = 'none';
    win.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 180, easing: 'ease-in' }).onfinish = done;
  };
  wm.quit = (appId) => {
    const app = OS.apps[appId];
    if (!app) return;
    if (appId === 'finder') {
      wm.appWindows('finder').forEach((w) => wm.close(w, true));
      return;
    }
    wm.appWindows(appId).forEach((w) => wm.close(w, true));
    running.delete(appId);
    app.onQuit && app.onQuit();
    if (wm.ghostApp === appId) wm.ghostApp = null;
    setTimeout(() => {
      if (!wm.focused) {
        const n = topVisible();
        n ? wm.focus(n) : wm.blurAll();
      }
      OS.emit('windows');
    }, 200);
  };

  /* ---------- minimize (genie / scale) ---------- */
  wm.minimize = (win) => {
    if (win.state === 'min') return;
    if (win.state === 'full') wm.toggleFull(win, false);
    win.prevState = win.state;
    win.state = 'min';
    OS.emit('windows'); // dock creates thumbnail slot first
    requestAnimationFrame(() => {
      const target = OS.dock && OS.dock.minimizedSlot(win);
      const r = win.el.getBoundingClientRect();
      const done = () => {
        win.el.style.visibility = 'hidden';
        win.el.classList.add('minimized');
        if (wm.focused === win) {
          const next = topVisible(win);
          next ? wm.focus(next) : (wm.focused = null, OS.emit('focus', win.app.id));
        }
        OS.emit('windows');
      };
      if (!target || OS.reducedMotion()) return done();
      const t = target.getBoundingClientRect();
      const s = OS.scale;
      const dx = (t.left + t.width / 2 - (r.left + r.width / 2)) / s;
      const dy = (t.top + t.height / 2 - (r.top + r.height / 2)) / s;
      const sc = Math.min(t.width / r.width, t.height / r.height);
      win.el.style.pointerEvents = 'none';
      const genie = OS.settings.minimizeEffect === 'genie';
      const frames = genie
        ? [
            { transform: 'none', clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)', opacity: 1, offset: 0 },
            { transform: `translate(${dx * 0.18}px, ${dy * 0.42}px) scale(.82, .62)`, clipPath: 'polygon(0 0,100% 0,72% 100%,28% 100%)', opacity: 1, offset: 0.42 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, clipPath: 'polygon(30% 0,70% 0,52% 100%,48% 100%)', opacity: 0.4, offset: 1 },
          ]
        : [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.3 },
          ];
      win.el.animate(frames, { duration: genie ? 520 : 360, easing: 'cubic-bezier(.55,.05,.4,1)' }).onfinish = () => {
        win.el.style.pointerEvents = '';
        done();
      };
    });
  };
  wm.restore = (win) => {
    if (win.state !== 'min') return wm.focus(win);
    const slot = OS.dock && OS.dock.minimizedSlot(win);
    win.state = win.prevState === 'max' ? 'max' : 'normal';
    win.el.style.visibility = '';
    win.el.classList.remove('minimized');
    if (win.space !== OS.spaces.currentSpace()) {
      win.space = OS.spaces.currentSpace();
      win.space.el.appendChild(win.el);
    }
    if (slot && !OS.reducedMotion()) {
      const t = slot.getBoundingClientRect();
      const r = win.el.getBoundingClientRect();
      const s = OS.scale;
      const dx = (t.left + t.width / 2 - (r.left + r.width / 2)) / s;
      const dy = (t.top + t.height / 2 - (r.top + r.height / 2)) / s;
      const sc = Math.min(t.width / r.width, t.height / r.height);
      win.el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.4, clipPath: 'polygon(30% 0,70% 0,52% 100%,48% 100%)' },
          { transform: `translate(${dx * 0.18}px, ${dy * 0.42}px) scale(.82, .62)`, clipPath: 'polygon(0 0,100% 0,72% 100%,28% 100%)', opacity: 1, offset: 0.58 },
          { transform: 'none', opacity: 1, clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' },
        ],
        { duration: 480, easing: 'cubic-bezier(.3,.6,.3,1)' }
      );
    }
    wm.focus(win);
    OS.emit('windows');
  };

  /* ---------- zoom / full screen / tiling ---------- */
  function animateBounds(win, nb, ms = 340) {
    const el = win.el;
    if (OS.reducedMotion()) {
      win.bounds = nb;
      return wm.applyBounds(win);
    }
    el.classList.add('animating');
    win.bounds = nb;
    wm.applyBounds(win);
    clearTimeout(win._animT);
    win._animT = setTimeout(() => {
      el.classList.remove('animating');
      win.fire('resize');
    }, ms);
  }
  wm.zoom = (win, animate = true) => {
    if (win.app.resizable === false) return;
    if (win.state === 'full') return wm.toggleFull(win, false);
    const a = wm.area();
    if (win.state === 'max' || win.state === 'tiled') {
      win.state = 'normal';
      animate ? animateBounds(win, win.saved || win.bounds) : ((win.bounds = win.saved || win.bounds), wm.applyBounds(win));
    } else {
      win.saved = { ...win.bounds };
      win.state = 'max';
      const nb = { x: a.x + 6, y: a.y + 4, w: a.w - 12, h: a.h - 10 };
      animate ? animateBounds(win, nb) : ((win.bounds = nb), wm.applyBounds(win));
    }
    win.el.classList.toggle('maximized', win.state === 'max');
  };
  wm.toggleFull = (win, on) => {
    if (win.app.resizable === false) return;
    on = on ?? win.state !== 'full';
    if (on) {
      if (win.state !== 'max' && win.state !== 'tiled') win.saved = { ...win.bounds };
      win.state = 'full';
      const { w, h: H } = wm.screen();
      win.el.classList.add('fullscreen');
      document.body.classList.add('has-fullscreen');
      animateBounds(win, { x: 0, y: 0, w, h: H }, 420);
      wm.focus(win);
    } else {
      win.state = 'normal';
      win.el.classList.remove('fullscreen');
      document.body.classList.toggle('has-fullscreen', wm.windows.some((w) => w.state === 'full' && w !== win));
      animateBounds(win, win.saved || win.bounds, 420);
    }
    OS.emit('windows');
  };
  /* tile positions used by edge snapping, the green-button menu and the Window menu */
  wm.tileRect = (where) => {
    const a = wm.area();
    const g = 6;
    const hw = (a.w - g * 3) / 2,
      hh = (a.h - g * 3) / 2;
    const L = a.x + g,
      T = a.y + g,
      R = a.x + g * 2 + hw,
      B = a.y + g * 2 + hh;
    const full = { x: L, y: T, w: a.w - g * 2, h: a.h - g * 2 };
    return {
      fill: full,
      left: { x: L, y: T, w: hw, h: full.h },
      right: { x: R, y: T, w: hw, h: full.h },
      top: { x: L, y: T, w: full.w, h: hh },
      bottom: { x: L, y: B, w: full.w, h: hh },
      tl: { x: L, y: T, w: hw, h: hh },
      tr: { x: R, y: T, w: hw, h: hh },
      bl: { x: L, y: B, w: hw, h: hh },
      br: { x: R, y: B, w: hw, h: hh },
      center: (() => {
        const w = Math.min(a.w * 0.62, 1100),
          hh2 = Math.min(a.h * 0.72, 760);
        return { x: a.x + (a.w - w) / 2, y: a.y + (a.h - hh2) / 2, w, h: hh2 };
      })(),
    }[where];
  };
  wm.tile = (win, where) => {
    if (win.app.resizable === false && where !== 'center') return;
    if (win.state === 'full') wm.toggleFull(win, false);
    if (win.state === 'normal') win.saved = { ...win.bounds };
    const r = wm.tileRect(where);
    if (!r) return;
    win.state = where === 'center' ? 'normal' : 'tiled';
    win.el.classList.remove('maximized');
    animateBounds(win, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    wm.focus(win);
  };

  /* green button hover → arrangement menu (macOS Sequoia / Tahoe) */
  function attachGreenHover(win, btn) {
    let t;
    btn.addEventListener('mouseenter', () => {
      if (win.app.resizable === false) return;
      t = setTimeout(() => showTileMenu(win, btn), 650);
    });
    btn.addEventListener('mouseleave', () => clearTimeout(t));
  }
  function tileIcon(kind) {
    const rects = {
      left: '<rect x="2" y="2" width="9" height="16" rx="1.5"/>',
      right: '<rect x="13" y="2" width="9" height="16" rx="1.5"/>',
      top: '<rect x="2" y="2" width="20" height="7.5" rx="1.5"/>',
      bottom: '<rect x="2" y="10.5" width="20" height="7.5" rx="1.5"/>',
      fill: '<rect x="2" y="2" width="20" height="16" rx="1.5"/>',
      center: '<rect x="6" y="4.5" width="12" height="11" rx="1.5"/>',
      lr: '<rect x="2" y="2" width="9" height="16" rx="1.5"/><rect x="13" y="2" width="9" height="16" rx="1.5" opacity=".45"/>',
      four: '<rect x="2" y="2" width="9" height="7.5" rx="1.2"/><rect x="13" y="2" width="9" height="7.5" rx="1.2" opacity=".45"/><rect x="2" y="10.5" width="9" height="7.5" rx="1.2" opacity=".45"/><rect x="13" y="10.5" width="9" height="7.5" rx="1.2" opacity=".45"/>',
    }[kind];
    return `<svg viewBox="0 0 24 20"><rect x=".75" y=".75" width="22.5" height="18.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/><g fill="currentColor">${rects}</g></svg>`;
  }
  function showTileMenu(win, btn) {
    const r = btn.getBoundingClientRect();
    const others = wm.windows.filter((w) => w !== win && w.state !== 'min' && w.space === win.space).sort((a, b) => b.z - a.z);
    const cell = (kind, label, fn) => h('button.tile-cell', { title: label, 'aria-label': label, html: tileIcon(kind), onclick: () => (OS.closeMenus(), fn()) });
    const menu = h('div.menu.tile-menu',
      h('div.menu-head', '移动与调整大小'),
      h('div.tile-row', cell('left', '左', () => wm.tile(win, 'left')), cell('right', '右', () => wm.tile(win, 'right')), cell('top', '上', () => wm.tile(win, 'top')), cell('bottom', '下', () => wm.tile(win, 'bottom'))),
      h('div.menu-head', '填充与排列'),
      h('div.tile-row',
        cell('fill', '填充', () => wm.tile(win, 'fill')),
        cell('center', '居中', () => wm.tile(win, 'center')),
        cell('lr', '左右排列', () => {
          wm.tile(win, 'left');
          if (others[0]) wm.tile(others[0], 'right'), wm.focus(win);
        }),
        cell('four', '四分排列', () => {
          wm.tile(win, 'tl');
          ['tr', 'bl', 'br'].forEach((p, i) => others[i] && wm.tile(others[i], p));
          wm.focus(win);
        })
      ),
      h('div.menu-sep'),
      h('div.menu-item', { onclick: () => (OS.closeMenus(), wm.toggleFull(win)) }, h('span.mi-label', win.state === 'full' ? '退出全屏幕' : '全屏幕'), h('span.mi-key', '⌃⌘F'))
    );
    OS.showMenu(menu, { x: r.left / OS.scale - 4, y: r.bottom / OS.scale + 6, client: false });
  }

  /* ---------- pointer: drag, resize, edge snapping ---------- */
  function onPointerDown(e, win) {
    if (e.button !== 0) {
      wm.focus(win);
      return;
    }
    if (wm.focused !== win) wm.focus(win);
    const rz = e.target.closest('[data-rz]');
    const drag = !rz && e.target.closest('[data-drag]') && !e.target.closest('button,input,textarea,select,a,[contenteditable="true"],[data-nodrag],.tl');
    if (!rz && !drag) return;
    if (win.state === 'full') return;
    e.preventDefault();
    const start = wm.pt(e);
    const b0 = { ...win.bounds };
    const scr = wm.screen();
    let moved = false;
    let snap = null;
    const prev = $('#snap-preview');
    const el = win.el;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);

    const move = (ev) => {
      const p = wm.pt(ev);
      const dx = p.x - start.x,
        dy = p.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!moved) {
        moved = true;
        el.classList.add(rz ? 'resizing' : 'dragging');
        document.body.classList.add(rz ? 'is-resizing' : 'is-dragging');
        // un-tile on drag: restore saved size, keep pointer at the same relative x
        if (drag && (win.state === 'max' || win.state === 'tiled') && win.saved) {
          const rel = (start.x - b0.x) / b0.w;
          b0.w = win.saved.w;
          b0.h = win.saved.h;
          b0.x = start.x - rel * b0.w;
          win.state = 'normal';
          el.classList.remove('maximized');
        }
      }
      if (drag) {
        const mb = wm.menubarH();
        const nb = { ...win.bounds, w: b0.w, h: b0.h, x: Math.round(b0.x + dx), y: Math.round(Math.max(mb, b0.y + dy)) };
        win.bounds = nb;
        wm.applyBounds(win);
        // snapping zones
        const edge = 4;
        let s = null;
        if (p.y <= mb + 2) s = p.x < 60 ? 'tl' : p.x > scr.w - 60 ? 'tr' : 'fill';
        else if (p.x <= edge) s = p.y > scr.h - 80 ? 'bl' : 'left';
        else if (p.x >= scr.w - edge) s = p.y > scr.h - 80 ? 'br' : 'right';
        if (s !== snap) {
          snap = s;
          if (s) {
            const r = wm.tileRect(s);
            Object.assign(prev.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
            prev.classList.add('show');
          } else prev.classList.remove('show');
        }
      } else {
        const d = rz.dataset.rz;
        let { x, y, w, h: H } = b0;
        if (d.includes('e')) w = Math.max(win.minW, b0.w + dx);
        if (d.includes('s')) H = Math.max(win.minH, b0.h + dy);
        if (d.includes('w')) {
          w = Math.max(win.minW, b0.w - dx);
          x = b0.x + b0.w - w;
        }
        if (d.includes('n')) {
          H = Math.max(win.minH, b0.h - dy);
          y = Math.max(wm.menubarH(), b0.y + b0.h - H);
          H = b0.y + b0.h - y;
        }
        win.bounds = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(H) };
        win.state = 'normal';
        el.classList.remove('maximized');
        wm.applyBounds(win);
        win.fire('resize');
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.classList.remove('resizing', 'dragging');
      document.body.classList.remove('is-resizing', 'is-dragging');
      prev.classList.remove('show');
      if (moved && drag && snap) {
        win.saved = { ...win.bounds, w: b0.w, h: b0.h };
        win.state = 'normal';
        wm.tile(win, snap);
      }
      if (moved) win.fire('resize');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* keep windows inside the screen when the viewport changes */
  window.addEventListener('resize', () => {
    const a = wm.area();
    wm.windows.forEach((w) => {
      if (w.state === 'full') {
        const s = wm.screen();
        w.bounds = { x: 0, y: 0, w: s.w, h: s.h };
      } else if (w.state === 'max') {
        w.bounds = { x: a.x + 6, y: a.y + 4, w: a.w - 12, h: a.h - 10 };
      } else {
        w.bounds.w = Math.min(w.bounds.w, a.w);
        w.bounds.h = Math.min(w.bounds.h, a.h);
        w.bounds.x = clamp(w.bounds.x, a.x - w.bounds.w + 100, a.x + a.w - 100);
        w.bounds.y = clamp(w.bounds.y, a.y, a.y + a.h - 40);
      }
      wm.applyBounds(w);
      w.fire('resize');
    });
  });

  /* ---------- launching ---------- */
  OS.launch = function (appId, args) {
    const app = OS.apps[appId];
    if (!app) return null;
    if (app.action) {
      app.action(args || {});
      return null;
    }
    const existing = wm.appWindows(appId);
    if (existing.length && (app.singleton || (!args && !app.alwaysNew))) {
      const w = existing.sort((a, b) => b.z - a.z)[0];
      if (w.state === 'min') wm.restore(w);
      else wm.focusApp(appId);
      if (args && app.reopen) app.reopen(w, args);
      return w;
    }
    const first = !running.has(appId) || !existing.length;
    if (first && OS.dock) OS.dock.bounce(appId);
    const delay = first && !OS.reducedMotion() && !(args && args.instant) ? 260 : 0;
    if (delay) {
      if (!running.has(appId)) running.set(appId, { windows: new Set() });
      OS.emit('windows');
      setTimeout(() => wm.create(app, { args, ...(args && args.window) }), delay);
      return null;
    }
    return wm.create(app, { args, ...(args && args.window) });
  };
  OS.newWindow = (appId, args) => {
    const app = OS.apps[appId];
    if (!app || app.action) return;
    if (app.singleton) return OS.launch(appId, args);
    return wm.create(app, { args: args || {} });
  };

  /* ---------- system alert & sheets ---------- */
  OS.alert = function ({ title, message = '', icon, buttons = [{ label: '好', primary: true }], input, win, destructive }) {
    return new Promise((resolve) => {
      const veil = h('div.alert-veil');
      let field;
      const finish = (v) => {
        panel.classList.add('out');
        veil.classList.add('out');
        setTimeout(() => veil.remove(), 160);
        resolve(v);
      };
      const panel = h('div.alert', { role: 'alertdialog', 'aria-label': title },
        h('img.alert-icon', { src: icon || OS.icon('finder'), alt: '' }),
        h('div.alert-title', title),
        message && h('div.alert-msg', message),
        input && (field = h('input.alert-input', { id: 'alert-input', type: 'text', value: input.value || '', placeholder: input.placeholder || '' })),
        h('div.alert-btns', buttons.map((b, i) =>
          h('button.btn' + (b.primary ? '.primary' : '') + (b.destructive ? '.destructive' : ''), {
            onclick: () => finish(input ? (b.primary ? field.value : null) : i),
          }, b.label)
        ))
      );
      veil.appendChild(panel);
      (win ? win.el : $('#overlays')).appendChild(veil);
      if (win) veil.classList.add('sheet');
      setTimeout(() => (field ? (field.focus(), field.select()) : panel.querySelector('.btn.primary')?.focus()), 30);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const pi = buttons.findIndex((b) => b.primary);
          finish(input ? field.value : pi);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          const cancel = buttons.findIndex((b) => !b.primary);
          finish(input ? null : cancel === -1 ? 0 : cancel);
        }
        e.stopPropagation();
      });
      OS.sound.play(destructive ? 'error' : 'pop');
    });
  };

  OS.boot = OS.boot || {};
  OS.boot.initSpaces = () => {
    makeSpace();
  };
})();
