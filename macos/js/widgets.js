/* Desktop widgets (macOS 14+): drag widgets out of Notification Center onto the desktop. They sit under every window,
   turn tinted when an app is in front and full colour when the desktop is active. Also: click the wallpaper to reveal the desktop. */
(function () {
  const { h, $, $$ } = OS;
  const wm = OS.wm;
  const SIZE = { s: [170, 170], m: [356, 170] };
  const GRID = 10;
  const load = () => OS.store.get('desk.widgets', []);
  const save = (list) => OS.store.set('desk.widgets', list);
  let layer = null;

  function ensureLayer() {
    if (layer) return layer;
    layer = h('div#desk-widgets', { 'aria-label': '桌面小组件' });
    $('#desktop').after(layer);
    return layer;
  }

  function render() {
    ensureLayer().replaceChildren();
    load().forEach((w) => {
      const el = OS.makeWidget(w.kind);
      if (!el) return;
      el.classList.add('desk-widget');
      el.dataset.id = w.id;
      el.style.left = w.x + 'px';
      el.style.top = w.y + 'px';
      movable(el, w.id);
      layer.appendChild(el);
    });
    redrawClocks();
  }

  const clampPos = (x, y, kind) => {
    const [w, hh] = SIZE[(OS.widgetKinds[kind] || {}).size || 's'];
    const scr = wm.screen();
    const top = wm.menubarH() + 8;
    return {
      x: Math.round(Math.max(8, Math.min(scr.w - w - 8, x)) / GRID) * GRID,
      y: Math.round(Math.max(top, Math.min(scr.h - hh - 90, y)) / GRID) * GRID,
    };
  };

  // shared drag: lift a ghost of the widget and follow the pointer (compositor-only movement)
  function drag(e, el, { onStart, onDrop, fromNC }) {
    if (e.button !== 0) return;
    const start = wm.pt(e);
    const r0 = el.getBoundingClientRect();
    const scale = OS.scale || 1;
    const off = { x: (e.clientX - r0.left) / scale, y: (e.clientY - r0.top) / scale };
    let ghost = null;
    const move = (ev) => {
      const p = wm.pt(ev);
      if (!ghost) {
        if (Math.hypot(p.x - start.x, p.y - start.y) < 5) return;
        el._dragged = true;
        onStart && onStart();
        ghost = el.cloneNode(true);
        ghost.classList.add('desk-widget', 'widget-ghost');
        ghost.style.left = '0px';
        ghost.style.top = '0px';
        ghost.style.width = r0.width / scale + 'px';
        ghost.style.height = r0.height / scale + 'px';
        $('#overlays').appendChild(ghost);
        if (!fromNC) el.style.opacity = '0';
      }
      const x = p.x - off.x, y = p.y - off.y;
      wm.nextFrame('wdrag', () => ghost && (ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.04)`));
      ghost._pos = { x, y };
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      wm.cancelFrame('wdrag');
      setTimeout(() => (el._dragged = false), 0);
      if (!ghost) return;
      const pos = ghost._pos;
      ghost.remove();
      el.style.opacity = '';
      const overBar = ev.clientY < wm.menubarH() * (OS.scale || 1) || (ev.target instanceof Element && ev.target.closest('#dock-wrap'));
      onDrop(overBar ? null : pos);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function movable(el, id) {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      drag(e, el, {
        onDrop(pos) {
          if (!pos) return;
          const list = load();
          const w = list.find((x) => x.id === id);
          if (!w) return;
          Object.assign(w, clampPos(pos.x, pos.y, w.kind));
          save(list);
          render();
        },
      });
    });
    el.addEventListener('click', (e) => el._dragged && (e.stopPropagation(), e.preventDefault()), true);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      OS.showMenu(
        OS.buildMenu([
          { label: '移除小组件', action: () => (save(load().filter((x) => x.id !== id)), render()) },
          { sep: true },
          { label: '编辑小组件…', action: () => OS.nc && OS.nc.open && OS.nc.open() },
        ]),
        { x: wm.pt(e).x, y: wm.pt(e).y }
      );
    });
  }

  function add(kind, pos) {
    const list = load();
    list.push({ id: OS.uid(), kind, ...clampPos(pos.x, pos.y, kind) });
    save(list);
    render();
    const el = layer.lastElementChild;
    el && !OS.reducedMotion() && el.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { ...OS.spring('bouncy') });
  }

  const redrawClocks = () => layer && $$('canvas', layer).forEach((c) => c._draw && c._draw());
  setInterval(() => !document.hidden && layer && layer.childElementCount && redrawClocks(), 1000);
  // refresh live content (calendar, reminders, weather) once a minute
  setInterval(() => !document.hidden && load().length && render(), 60000);

  // desktop active (no app window in front) → full colour widgets
  const syncActive = () => document.body.classList.toggle('desk-active', !wm.focused);
  ['focus', 'windows'].forEach((ev) => OS.on(ev, () => wm.nextFrame('deskActive', syncActive)));

  OS.deskWidgets = {
    render,
    add,
    // make a Notification Center widget draggable onto the desktop
    draggable(el, closeNC) {
      el.addEventListener('pointerdown', (e) => {
        drag(e, el, {
          fromNC: true,
          onStart: closeNC,
          onDrop: (pos) => pos && add(el.dataset.kind, pos),
        });
      });
      el.addEventListener('click', (e) => el._dragged && (e.stopPropagation(), e.preventDefault()), true);
    },
  };

  /* click the wallpaper to move every window aside and reveal the desktop */
  let downAt = null;
  document.addEventListener('pointerdown', (e) => {
    downAt = e.target === $('#desktop') && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  });
  document.addEventListener('pointerup', (e) => {
    if (!downAt || e.target !== $('#desktop') || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    downAt = null;
    const mode = OS.settings.clickWallpaper || 'stage';
    if (mode !== 'always' && !(mode === 'stage' && OS.settings.stageManager)) return;
    const sd = OS.showDesktop;
    const any = wm.windows.some((w) => w.space === OS.spaces.currentSpace() && w.state !== 'min' && !w.hiddenApp);
    if (sd && (sd.active || any)) sd.toggle();
  });
  // bring the windows back when an app is chosen again
  OS.on('focus', () => OS.showDesktop && OS.showDesktop.active && wm.focused && OS.showDesktop.toggle());

  OS.on('boot', render);
  window.addEventListener('resize', OS.debounce(() => load().length && render(), 200));
  if (document.readyState !== 'loading') setTimeout(render, 0);
  else document.addEventListener('DOMContentLoaded', render);
})();
