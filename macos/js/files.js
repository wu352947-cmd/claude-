/* File-level native behaviours shared by Finder, the desktop and document windows:
   undo / redo of file operations, spring-loaded folders, dragging files anywhere, and title-bar proxy icons. */
(function () {
  const { h, $, $$ } = OS;
  const wm = OS.wm;
  const vfs = OS.vfs;

  /* ---------- undo / redo (Edit ▸ Undo Move, Undo Move to Trash, …) ---------- */
  const undoStack = [], redoStack = [];
  let mode = null, depth = 0, group = null, replaying = null;
  function record(label, inverse) {
    const stack = mode === 'undo' ? redoStack : undoStack;
    if (!mode) redoStack.length = 0;
    if (!group || group.stack !== stack) {
      group = { label: replaying || label, ops: [], stack };
      stack.push(group);
      if (stack.length > 50) stack.shift();
      setTimeout(() => (group = null), 0); // everything done in one task is one undo step
    }
    group.ops.push(inverse);
  }
  const wrap = (name, label, inverse) => {
    const orig = vfs[name];
    vfs[name] = function (...args) {
      depth++;
      try {
        const r = orig.apply(this, args);
        if (r && depth === 1) {
          const inv = inverse(args, r);
          inv && record(label, inv);
        }
        return r;
      } finally {
        depth--;
      }
    };
  };
  wrap('move', '移动', ([from], to) => () => vfs.move(to, vfs.parentOf(from), vfs.baseName(from)));
  wrap('rename', '重新命名', ([path], to) => () => vfs.rename(to, vfs.baseName(path)));
  wrap('trash', '移到废纸篓', (args, to) => () => vfs.putBack(to));
  wrap('putBack', '放回原处', (args, to) => () => vfs.trash(to));
  wrap('mkdir', '新建文件夹', ([path]) => () => vfs.remove(vfs.norm(path)));
  wrap('copy', '拷贝', (args, to) => () => vfs.remove(to));
  function run(from, as) {
    const g = from.pop();
    if (!g) return OS.sound && OS.sound.play && OS.sound.play('error');
    group = null;
    mode = as;
    replaying = g.label; // "Redo Move to Trash", not "Redo Put Back"
    try {
      g.ops.slice().reverse().forEach((f) => f());
    } finally {
      mode = null;
      group = null;
      replaying = null;
    }
  }
  OS.fileUndo = {
    undo: () => run(undoStack, 'undo'),
    redo: () => run(redoStack, 'redo'),
    can: (k) => (k === 'redo' ? redoStack : undoStack).length > 0,
    label: (k) => {
      const s = k === 'redo' ? redoStack : undoStack;
      return (k === 'redo' ? '重做' : '撤销') + (s.length ? s[s.length - 1].label : '');
    },
  };
  // ⌘Z / ⇧⌘Z while Finder (or the desktop) is frontmost and no text field has focus
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
      if (wm.activeApp() !== 'finder') return;
      e.preventDefault();
      e.stopPropagation();
      e.shiftKey ? OS.fileUndo.redo() : OS.fileUndo.undo();
    },
    true
  );

  /* ---------- spring-loaded folders ---------- */
  // hover a dragged item over a folder: it flashes, then springs open so you can keep drilling down
  const spring = { el: null, timer: 0 };
  OS.springLoad = (el, open) => {
    if (el === spring.el) return;
    clearTimeout(spring.timer);
    if (spring.el) spring.el.classList.remove('spring-armed', 'spring-flash');
    spring.el = el;
    if (!el) return;
    el.classList.add('spring-armed');
    spring.timer = setTimeout(() => {
      el.classList.add('spring-flash');
      OS.sound && OS.sound.play && OS.sound.play('tick');
      spring.timer = setTimeout(() => {
        el.classList.remove('spring-flash', 'spring-armed');
        spring.el = null;
        open();
      }, 280);
    }, 650);
  };
  const winOf = (el) => wm.windows.find((w) => w.el.contains(el));
  // what a folder-ish element opens to when it springs
  function springTarget(el) {
    const path = el.dataset.path || el.dataset.drop || el.dataset.dropPath;
    if (!path) return null;
    const n = vfs.resolve(path);
    if (!n || n.type !== 'dir') return null;
    const w = winOf(el);
    if (w && w.app.id === 'finder' && w.state_ && w.state_.go) return () => (w.state_.go(path), wm.focus(w));
    return () => OS.launch('finder', { path });
  }
  OS.springTarget = springTarget;

  /* ---------- drag files anywhere (Finder items, proxy icons) ---------- */
  OS.dragFiles = (e, paths, { icon, sourceWin, onDone, onMoved } = {}) => {
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null, target = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      if (!ghost) {
        ghost = h('div.fd-ghost', h('img', { src: icon || OS.icon('document'), alt: '' }), paths.length > 1 ? h('span', paths.length) : null);
        $('#overlays').appendChild(ghost);
      }
      const p = wm.pt(ev);
      ghost.style.left = p.x - 24 + 'px';
      ghost.style.top = p.y - 24 + 'px';
      ghost.style.display = 'none';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.display = '';
      $$('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
      target = null;
      let dirEl = under && under.closest('[data-dir="1"], [data-drop], .dock-item.trash, .desk-icon, #desktop');
      if (dirEl && dirEl.classList.contains('desk-icon')) {
        const n = vfs.resolve(dirEl.dataset.path);
        if (!n || n.type !== 'dir') dirEl = $('#desktop');
      }
      if (dirEl && !(dirEl.dataset.path && paths.includes(dirEl.dataset.path))) {
        target = dirEl;
        dirEl.classList.add('drop-hover');
      }
      const springer = target && target.id !== 'desktop' && !target.classList.contains('trash') ? springTarget(target) : null;
      OS.springLoad(springer ? target : null, springer || (() => {}));
      const dockApp = !target && OS.dock.dropTarget(ev.clientX, ev.clientY, paths);
      if (!dockApp) OS.dock.dropTarget(-1, -1, []);
      if (dockApp) target = 'dock:' + dockApp;
      if (!target && under) {
        const w = under.closest('.win[data-drop-path]');
        if (w && (!sourceWin || w !== sourceWin.el)) (target = w), w.classList.add('drop-hover');
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      OS.springLoad(null);
      if (!ghost) return;
      ghost.remove();
      $$('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
      if (!target) return;
      if (typeof target === 'string') return OS.dock.dropOpen(target.slice(5), paths);
      let moved;
      if (target.classList.contains('trash')) moved = paths.map((p) => [p, vfs.trash(p)]);
      else {
        const dest = target.id === 'desktop' ? vfs.HOME + '/Desktop' : target.dataset.path || target.dataset.drop || target.dataset.dropPath;
        if (!dest) return;
        moved = paths.map((p) => [p, vfs.move(p, dest)]);
      }
      onMoved && moved.forEach(([a, b]) => b && onMoved(a, b));
      onDone && onDone();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---------- proxy icon in a document title ---------- */
  // the little document icon next to a window title: drag it to move/open the file, ⌘-click or right-click
  // the title for the path menu
  OS.proxyIcon = (win, titleEl, getPath, setPath) => {
    const img = h('img.proxy-icon', { alt: '', draggable: 'false', title: '' });
    titleEl.prepend(img);
    titleEl.classList.add('has-proxy');
    const refresh = () => {
      const p = getPath();
      const n = p && vfs.resolve(p);
      img.hidden = !n;
      if (n) img.src = vfs.iconFor(n, p);
    };
    refresh();
    const off = OS.on('window:title', (w) => w === win && refresh());
    const offFs = OS.on('vfs:change', refresh);
    win.on('close', () => (off && off(), offFs && offFs()));
    img.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || img.hidden) return;
      e.stopPropagation();
      e.preventDefault();
      const p = getPath();
      OS.dragFiles(e, [p], { icon: img.src, sourceWin: win, onMoved: (a, b) => setPath && setPath(b) });
    });
    const pathMenu = (e) => {
      const p = getPath();
      if (!p || !vfs.resolve(p)) return;
      e.preventDefault();
      e.stopPropagation();
      const chain = [];
      for (let cur = p; ; cur = vfs.parentOf(cur)) {
        chain.push(cur);
        if (cur === '/') break;
      }
      const r = titleEl.getBoundingClientRect();
      OS.showMenu(
        OS.buildMenu(
          chain.map((c, i) => ({
            label: vfs.displayName(c),
            img: vfs.iconFor(vfs.resolve(c), c),
            disabled: i === 0,
            action: () => OS.launch('finder', { path: c, select: chain[i - 1] }),
          }))
        ),
        { x: r.left / OS.scale, y: r.bottom / OS.scale + 4 }
      );
    };
    titleEl.addEventListener('contextmenu', pathMenu);
    titleEl.addEventListener('pointerdown', (e) => (e.metaKey || e.ctrlKey) && e.button === 0 && pathMenu(e));
    return refresh;
  };
})();
