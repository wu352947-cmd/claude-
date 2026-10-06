/* Finder */
(function () {
  const { h, $, $$, glyph } = OS;
  const vfs = OS.vfs;
  const HOME = vfs.HOME;

  const SIDEBAR = [
    { head: '个人收藏' },
    { id: 'airdrop', label: '隔空投送', glyph: 'airdrop' },
    { id: 'recents', label: '最近使用', glyph: 'clock' },
    { path: '/Applications', label: '应用程序', glyph: 'grid' },
    { path: HOME + '/Desktop', label: '桌面', glyph: 'desktop' },
    { path: HOME + '/Documents', label: '文稿', glyph: 'doc' },
    { path: HOME + '/Downloads', label: '下载', glyph: 'download' },
    { path: HOME, label: OS.user.short, glyph: 'house' },
    { head: 'iCloud' },
    { id: 'icloud', path: HOME + '/Documents', label: 'iCloud 云盘', glyph: 'cloud' },
    { path: '/Users/Shared', label: '共享', glyph: 'person-2' },
    { head: '位置' },
    { path: '/', label: 'Macintosh HD', glyph: 'hdd' },
    { path: HOME + '/.Trash', label: '废纸篓', glyph: 'trash' },
    { head: '标签' },
    ...[['#ff3b30', '红色'], ['#ff9500', '橙色'], ['#ffcc00', '黄色'], ['#28cd41', '绿色'], ['#007aff', '蓝色'], ['#af52de', '紫色'], ['#8e8e93', '灰色']].map(([c, l]) => ({ tag: c, label: l })),
  ];

  function allFiles() {
    const out = [];
    (function walk(n, p) {
      (n.children || []).forEach((c) => {
        if (c.name.startsWith('.')) return;
        const cp = p + '/' + c.name;
        if (c.type === 'dir') walk(c, cp);
        else out.push({ path: cp, node: c });
      });
    })(vfs.resolve(HOME), HOME);
    return out;
  }

  OS.registerApp({
    id: 'finder', name: '访达', icon: 'finder', keywords: ['finder', 'files', '文件', '访达'], width: 900, height: 540, minWidth: 520, minHeight: 300,
    description: '浏览、整理与查找 Mac 上的文件。',
    reopen(win, args) {
      if (args && args.path) win.state_.go(args.path, args.select);
    },
    menus: (win) => {
      const st = win && win.state_;
      return [
        {
          title: '文件',
          items: [
            { label: '新建访达窗口', key: '⌘N', action: () => OS.newWindow('finder') },
            { label: '新建文件夹', key: '⇧⌘N', disabled: !st || !st.writable(), action: () => st.newFolder() },
            { label: '新建文本文稿', disabled: !st || !st.writable(), action: () => st.newText() },
            { sep: true },
            { label: '打开', key: '⌘O', disabled: !st || !st.sel.size, action: () => st.openSel() },
            { label: '关闭窗口', key: '⌘W', disabled: !win, action: () => win.close() },
            { sep: true },
            { label: '显示简介', key: '⌘I', disabled: !st || !st.sel.size, action: () => [...st.sel].forEach((p) => OS.getInfo(p)) },
            { label: '重新命名', disabled: !st || st.sel.size !== 1, action: () => st.rename([...st.sel][0]) },
            { label: '复制', key: '⌘D', disabled: !st || !st.sel.size, action: () => [...st.sel].forEach((p) => vfs.copy(p, vfs.parentOf(p))) },
            { label: '快速查看', key: '⌘Y', disabled: !st || !st.sel.size, action: () => OS.quickLook([...st.sel][0]) },
            { sep: true },
            { label: '移到废纸篓', key: '⌘⌫', disabled: !st || !st.sel.size, action: () => st.trashSel() },
            { sep: true },
            { label: '查找', key: '⌘F', disabled: !st, action: () => st.focusSearch() },
          ],
        },
        {
          title: '编辑',
          items: [
            { label: '撤销', key: '⌘Z', disabled: true },
            { sep: true },
            { label: '拷贝', key: '⌘C', disabled: !st || !st.sel.size, action: () => st.copySel() },
            { label: '粘贴项目', key: '⌘V', disabled: !st || !OS.finderClipboard, action: () => st.paste() },
            { label: '全选', key: '⌘A', disabled: !st, action: () => st.selectAll() },
          ],
        },
        {
          title: '显示',
          items: [
            ...[['icon', '为图标'], ['list', '为列表'], ['column', '为分栏'], ['gallery', '为画廊']].map(([v, l], i) => ({ label: l, key: '⌘' + (i + 1), checked: st && st.view === v, disabled: !st, action: () => st.setView(v) })),
            { sep: true },
            { label: '使用分组', disabled: true },
            { label: '排序方式', submenu: [['name', '名称'], ['kind', '种类'], ['mtime', '修改日期'], ['size', '大小']].map(([k, l]) => ({ label: l, checked: st && st.sort === k, action: () => st && st.setSort(k) })) },
            { sep: true },
            { label: st && st.showPath ? '隐藏路径栏' : '显示路径栏', key: '⌥⌘P', disabled: !st, action: () => st.togglePath() },
            { label: st && st.showSidebar ? '隐藏边栏' : '显示边栏', key: '⌃⌘S', disabled: !st, action: () => st.toggleSidebar() },
            { label: '显示预览', key: '⇧⌘P', disabled: !st, action: () => st.togglePreview() },
          ],
        },
        {
          title: '前往',
          items: [
            { label: '返回', key: '⌘[', disabled: !st || !st.canBack(), action: () => st.back() },
            { label: '前进', key: '⌘]', disabled: !st || !st.canFwd(), action: () => st.fwd() },
            { label: '上层文件夹', key: '⌘↑', disabled: !st, action: () => st.up() },
            { sep: true },
            ...[['recents', '最近使用', '⇧⌘F'], [HOME + '/Documents', '文稿', '⇧⌘O'], [HOME + '/Desktop', '桌面', '⇧⌘D'], [HOME + '/Downloads', '下载', '⌥⌘L'], [HOME, '个人', '⇧⌘H'], ['/', '电脑', '⇧⌘C'], ['airdrop', '隔空投送', '⇧⌘R'], ['/Applications', '应用程序', '⇧⌘A']].map(([p, l, k]) => ({ label: l, key: k, action: () => (st ? st.go(p) : OS.launch('finder', { path: p })) })),
            { sep: true },
            { label: '前往文件夹…', key: '⇧⌘G', action: async () => {
              const v = await OS.alert({ title: '前往文件夹', message: '输入路径，例如 ~/Documents', icon: OS.icon('finder'), input: { value: '~/' }, buttons: [{ label: '取消' }, { label: '前往', primary: true }] });
              if (v) vfs.resolve(v) ? (st ? st.go(vfs.norm(v)) : OS.launch('finder', { path: v })) : OS.alert({ title: '找不到该文件夹。', icon: OS.icon('finder') });
            } },
          ],
        },
      ];
    },
    onKey(win, e) {
      const st = win.state_;
      if (!st) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const cmd = OS.cmd(e);
      if (cmd && /^Digit[1-4]$/.test(e.code)) return e.preventDefault(), st.setView(['icon', 'list', 'column', 'gallery'][+e.code.slice(-1) - 1]);
      if (cmd && e.code === 'BracketLeft') return e.preventDefault(), st.back();
      if (cmd && e.code === 'BracketRight') return e.preventDefault(), st.fwd();
      if (cmd && e.key === 'ArrowUp') return e.preventDefault(), st.up();
      if (cmd && e.key === 'ArrowDown') return e.preventDefault(), st.openSel();
      if (cmd && e.code === 'KeyA') return e.preventDefault(), st.selectAll();
      if (cmd && e.code === 'KeyC') return e.preventDefault(), st.copySel();
      if (cmd && e.code === 'KeyV') return e.preventDefault(), st.paste();
      if (cmd && e.code === 'KeyI') return e.preventDefault(), [...st.sel].forEach((p) => OS.getInfo(p));
      if (cmd && e.code === 'KeyD') return e.preventDefault(), [...st.sel].forEach((p) => vfs.copy(p, vfs.parentOf(p)));
      if (cmd && e.code === 'KeyF') return e.preventDefault(), st.focusSearch();
      if (cmd && e.shiftKey && e.code === 'KeyN') return e.preventDefault(), st.newFolder();
      if (cmd && (e.key === 'Backspace' || e.key === 'Delete')) return e.preventDefault(), st.trashSel();
      if (cmd && e.code === 'KeyO') return e.preventDefault(), st.openSel();
      if (e.key === 'Enter' && st.sel.size === 1) return e.preventDefault(), st.rename([...st.sel][0]);
      if (e.key === ' ' && st.sel.size) return e.preventDefault(), OS.quickLook([...st.sel][0]);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return e.preventDefault(), st.arrow(e.key, e.shiftKey);
      if (e.key.length === 1 && !cmd && !e.altKey) st.typeSelect(e.key);
    },
    create(win, args) {
      const st = (win.state_ = {
        path: vfs.norm(args.path || HOME + '/Desktop'),
        special: null,
        hist: [],
        fwdStack: [],
        view: OS.store.get('finder.view', 'icon'),
        sort: OS.store.get('finder.sort', 'name'),
        sel: new Set(),
        anchor: null,
        query: '',
        showPath: OS.store.get('finder.pathbar', true),
        showSidebar: true,
        showPreview: false,
      });
      if (['recents', 'airdrop'].includes(args.path)) {
        st.special = args.path;
        st.path = null;
      }

      /* ---------- DOM ---------- */
      const sidebar = h('nav.side', { 'data-drag': '' });
      const back = h('button.tb-btn', { 'aria-label': '返回', title: '返回', html: glyph('chevron-left'), onclick: () => st.back() });
      const fwd = h('button.tb-btn', { 'aria-label': '前进', title: '前进', html: glyph('chevron-right'), onclick: () => st.fwd() });
      const title = h('div.tb-title');
      const viewSeg = h('div.tb-group.seg',
        ...[['icon', 'grid', '图标'], ['list', 'list', '列表'], ['column', 'columns', '分栏'], ['gallery', 'gallery', '画廊']].map(([v, g, l]) =>
          h('button.tb-btn', { dataset: { v }, 'aria-label': l, title: l, html: glyph(g), onclick: () => st.setView(v) })
        )
      );
      const search = h('input.tb-search-input', { id: 'finder-search-' + win.id, type: 'search', placeholder: '搜索' });
      const content = h('div.fd-content', { tabindex: 0 });
      const pathbar = h('div.fd-pathbar');
      const status = h('div.fd-status');
      const preview = h('aside.fd-preview');
      const toolbar = h('div.tbar', { 'data-drag': '' },
        h('div.tb-group', back, fwd),
        title,
        h('div.tb-spacer', { 'data-drag': '' }),
        viewSeg,
        h('div.tb-group',
          h('button.tb-btn', { 'aria-label': '共享', title: '共享', html: glyph('share'), onclick: () => OS.toast('隔空投送：附近没有可用的设备') }),
          h('button.tb-btn', { 'aria-label': '标签', title: '编辑标签', html: glyph('tag'), onclick: (e) => st.sel.size && OS.contextMenu(e, OS.itemMenu([...st.sel], { rename: st.rename }).slice(-2)) }),
          h('button.tb-btn', { 'aria-label': '操作', title: '操作', html: glyph('ellipsis-circle'), onclick: (e) => OS.contextMenu(e, bgMenu()) })
        ),
        h('label.tb-search', h('span', { html: glyph('search') }), search)
      );
      const main = h('div.pane', toolbar, h('div.fd-body', content, preview), pathbar, status);
      const root = h('div.app.finder', h('div.split', sidebar, main));
      win.body.appendChild(root);

      /* ---------- helpers ---------- */
      st.writable = () => st.path && !st.special && !vfs.resolve(st.path)?.virtual && st.path !== '/';
      const cur = () => (st.special === 'recents' ? null : st.path);

      function items() {
        let list;
        if (st.query) {
          list = vfs.search(st.query, 80).map(({ path, node }) => ({ path, node }));
        } else if (st.special === 'recents') {
          list = allFiles().sort((a, b) => b.node.mtime - a.node.mtime).slice(0, 40);
        } else if (st.special && st.special.startsWith('tag:')) {
          const c = st.special.slice(4);
          list = allFiles().filter((f) => f.node.tags && f.node.tags.includes(c));
        } else {
          const showHidden = st.path === HOME + '/.Trash';
          list = (vfs.list(st.path, { hidden: false }) || (showHidden ? vfs.resolve(st.path).children : [])).map((n) => ({ path: vfs.norm(st.path + '/' + n.name), node: n }));
          if (showHidden) list = vfs.resolve(st.path).children.map((n) => ({ path: vfs.norm(st.path + '/' + n.name), node: n }));
        }
        const s = st.sort;
        list.sort((a, b) => {
          if (s === 'name') return (b.node.type === 'dir') - (a.node.type === 'dir') || a.node.name.localeCompare(b.node.name, 'zh');
          if (s === 'mtime') return b.node.mtime - a.node.mtime;
          if (s === 'size') return vfs.sizeOf(b.node) - vfs.sizeOf(a.node);
          return vfs.kindLabel(a.node).localeCompare(vfs.kindLabel(b.node), 'zh') || a.node.name.localeCompare(b.node.name, 'zh');
        });
        return list;
      }
      const label = (it) => (vfs.parentOf(it.path) === HOME ? vfs.displayName(it.path) : it.node.name.replace(/\.app$/, ''));
      const iconOf = (it) => vfs.iconFor(it.node, it.path);

      /* ---------- navigation ---------- */
      st.go = (p, select) => {
        const prev = st.special || st.path;
        if (p === 'recents' || p === 'airdrop' || (p && p.startsWith('tag:'))) {
          st.special = p;
          st.path = null;
        } else {
          p = vfs.norm(p);
          const n = vfs.resolve(p);
          if (!n) return;
          if (n.type !== 'dir') return vfs.open(p);
          st.special = null;
          st.path = p;
        }
        if (prev !== (st.special || st.path)) {
          st.hist.push(prev);
          st.fwdStack = [];
        }
        st.sel = new Set(select ? [vfs.norm(st.path + '/' + select)] : []);
        st.query = '';
        search.value = '';
        render();
      };
      st.back = () => {
        if (!st.hist.length) return;
        st.fwdStack.push(st.special || st.path);
        const p = st.hist.pop();
        setLoc(p);
      };
      st.fwd = () => {
        if (!st.fwdStack.length) return;
        st.hist.push(st.special || st.path);
        setLoc(st.fwdStack.pop());
      };
      function setLoc(p) {
        if (p === 'recents' || p === 'airdrop' || (p && p.startsWith('tag:'))) (st.special = p), (st.path = null);
        else (st.special = null), (st.path = p);
        st.sel.clear();
        render();
      }
      st.canBack = () => st.hist.length > 0;
      st.canFwd = () => st.fwdStack.length > 0;
      st.up = () => st.path && st.path !== '/' && st.go(vfs.parentOf(st.path), vfs.baseName(st.path));
      st.setView = (v) => {
        st.view = v;
        OS.store.set('finder.view', v);
        render();
      };
      st.setSort = (k) => {
        st.sort = k;
        OS.store.set('finder.sort', k);
        render();
      };
      st.togglePath = () => {
        st.showPath = !st.showPath;
        OS.store.set('finder.pathbar', st.showPath);
        render();
      };
      st.toggleSidebar = () => {
        st.showSidebar = !st.showSidebar;
        root.classList.toggle('no-sidebar', !st.showSidebar);
      };
      st.togglePreview = () => {
        st.showPreview = !st.showPreview;
        render();
      };
      st.focusSearch = () => search.focus();

      /* ---------- selection & actions ---------- */
      st.openSel = () => [...st.sel].forEach((p) => {
        const n = vfs.resolve(p);
        if (n && n.type === 'dir') st.go(p);
        else vfs.open(p);
      });
      st.trashSel = () => {
        const inTrash = st.path === HOME + '/.Trash';
        [...st.sel].forEach((p) => (inTrash ? vfs.remove(p) : vfs.trash(p)));
        st.sel.clear();
      };
      st.selectAll = () => {
        st.sel = new Set(items().map((i) => i.path));
        paintSel();
      };
      st.copySel = () => {
        OS.finderClipboard = [...st.sel];
        OS.toast(`已拷贝 ${st.sel.size} 个项目`, 'square-on-square');
      };
      st.paste = () => {
        if (!OS.finderClipboard || !st.writable()) return;
        OS.finderClipboard.forEach((p) => vfs.resolve(p) && vfs.copy(p, st.path));
      };
      st.newFolder = () => {
        if (!st.writable()) return;
        const name = vfs.uniqueName(st.path, '未命名文件夹');
        vfs.mkdir(st.path + '/' + name);
        st.sel = new Set([vfs.norm(st.path + '/' + name)]);
        render();
        setTimeout(() => st.rename(vfs.norm(st.path + '/' + name)), 30);
      };
      st.newText = () => {
        if (!st.writable()) return;
        const name = vfs.uniqueName(st.path, '未命名.txt');
        vfs.write(st.path + '/' + name, '');
        st.sel = new Set([vfs.norm(st.path + '/' + name)]);
        render();
        setTimeout(() => st.rename(vfs.norm(st.path + '/' + name)), 30);
      };
      st.rename = (p) => {
        const el = content.querySelector(`[data-path="${CSS.escape(p)}"] .fd-name`);
        if (!el || vfs.resolve(vfs.parentOf(p))?.virtual) return;
        const old = vfs.baseName(p);
        const input = h('input.fd-rename', { id: 'fd-rename', value: old });
        el.replaceWith(input);
        input.focus();
        const dot = old.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : old.length);
        let done = false;
        const commit = (ok) => {
          if (done) return;
          done = true;
          if (ok && input.value.trim() && input.value.trim() !== old) {
            const np = vfs.rename(p, input.value.trim());
            if (np) st.sel = new Set([np]);
            else OS.alert({ title: `名称“${input.value.trim()}”已被使用。`, message: '请选取其他名称。', icon: OS.icon('finder') });
          }
          render();
          content.focus();
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit(true);
          if (e.key === 'Escape') commit(false);
        });
        input.addEventListener('blur', () => commit(true));
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
      };
      st.arrow = (key, extend) => {
        const list = items();
        if (!list.length) return;
        const paths = list.map((i) => i.path);
        let i = paths.indexOf(st.anchor && st.sel.has(st.anchor) ? st.anchor : [...st.sel].pop());
        let cols = 1;
        if (st.view === 'icon') {
          const first = content.querySelector('.fd-item');
          cols = first ? Math.max(1, Math.floor(content.clientWidth / first.offsetWidth)) : 1;
        }
        if (st.view === 'column' && key === 'ArrowRight' && i >= 0 && list[i].node.type === 'dir') return st.go(paths[i]);
        if (st.view === 'column' && key === 'ArrowLeft') return st.up();
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key];
        if (st.view === 'list' || st.view === 'column') {
          if (key === 'ArrowLeft' || key === 'ArrowRight') return;
        }
        i = i < 0 ? 0 : OS.clamp(i + (st.view === 'list' || st.view === 'column' ? Math.sign(step) : step), 0, paths.length - 1);
        if (extend) st.sel.add(paths[i]);
        else st.sel = new Set([paths[i]]);
        st.anchor = paths[i];
        paintSel();
        const el = content.querySelector(`[data-path="${CSS.escape(paths[i])}"]`);
        el && el.scrollIntoView({ block: 'nearest' });
      };
      let typeBuf = '', typeT;
      st.typeSelect = (ch) => {
        clearTimeout(typeT);
        typeBuf += ch.toLowerCase();
        typeT = setTimeout(() => (typeBuf = ''), 800);
        const hit = items().find((i) => label(i).toLowerCase().startsWith(typeBuf));
        if (hit) {
          st.sel = new Set([hit.path]);
          paintSel();
        }
      };

      function paintSel() {
        $$('[data-path]', content).forEach((el) => el.classList.toggle('sel', st.sel.has(el.dataset.path)));
        updateStatus();
        if (st.showPreview || st.view === 'gallery') renderPreview();
      }

      /* ---------- render ---------- */
      function renderSidebar() {
        sidebar.innerHTML = '';
        sidebar.appendChild(h('div.side-top', { 'data-drag': '' }));
        SIDEBAR.forEach((it) => {
          if (it.head) return sidebar.appendChild(h('div.sb-head', it.head));
          const key = it.id && !it.path ? it.id : it.tag ? 'tag:' + it.tag : it.path;
          const active = it.id === 'icloud' ? false : (st.special || st.path) === key;
          const row = h('div.sb-item' + (active ? '.active' : ''), { tabindex: 0, dataset: it.path && !it.id ? { drop: it.path } : {} },
            it.tag ? h('span.sb-tag', { style: { background: it.tag } }) : h('span.sb-ico', { html: glyph(it.glyph) }),
            h('span.sb-label', it.label)
          );
          row.onclick = () => st.go(key);
          if (it.path === HOME + '/.Trash') row.addEventListener('contextmenu', (e) => OS.contextMenu(e, [{ label: '清倒废纸篓', disabled: !vfs.trashCount(), action: () => OS.emptyTrash() }]));
          sidebar.appendChild(row);
        });
      }

      function updateStatus() {
        const list = items();
        const free = '213.6 GB 可用';
        status.textContent = st.sel.size ? `已选择 ${st.sel.size} 项（共 ${list.length} 项），${free}` : `${list.length} 个项目，${free}`;
      }

      function renderPath() {
        pathbar.innerHTML = '';
        pathbar.hidden = !st.showPath || !!st.special;
        if (!st.path) return;
        const parts = st.path === '/' ? [''] : ['', ...st.path.slice(1).split('/')];
        parts.forEach((p, i) => {
          const full = i === 0 ? '/' : '/' + parts.slice(1, i + 1).join('/');
          const n = i === 0 ? { name: 'Macintosh HD', type: 'dir' } : vfs.resolve(full);
          if (!n) return;
          if (i) pathbar.appendChild(h('span.fd-crumb-sep', { html: glyph('chevron-right') }));
          const c = h('button.fd-crumb', { 'data-drop': full }, h('img', { src: i === 0 ? OS.icon('hd') : vfs.iconFor(n, full), alt: '' }), i === 0 ? 'Macintosh HD' : vfs.displayName(full));
          c.ondblclick = () => st.go(full);
          c.onclick = () => st.go(full);
          pathbar.appendChild(c);
        });
      }

      function renderPreview() {
        preview.innerHTML = '';
        const show = st.showPreview && st.view !== 'gallery';
        preview.hidden = !show;
        if (!show) return;
        const p = [...st.sel][0];
        const n = p && vfs.resolve(p);
        if (!n) return preview.appendChild(h('div.fd-prev-empty', '未选择项目'));
        preview.append(
          n.kind === 'image' ? h('img.fd-prev-img', { src: n.src, alt: '' }) : h('img.fd-prev-icon', { src: vfs.iconFor(n, p), alt: '' }),
          h('div.fd-prev-name', n.name),
          h('div.fd-prev-kind', `${vfs.kindLabel(n)} — ${OS.fmt.size(vfs.sizeOf(n))}`),
          h('div.fd-prev-sec', '信息'),
          h('div.fd-prev-row', h('span', '修改时间'), h('b', OS.fmt.dateTime(new Date(n.mtime)))),
          n.type === 'dir' ? h('div.fd-prev-row', h('span', '项目'), h('b', String(n.children.length))) : null
        );
      }

      function itemEl(it, cls) {
        const n = it.node;
        const isImg = n.kind === 'image';
        const el = h('div.fd-item.' + cls + (st.sel.has(it.path) ? '.sel' : ''), { dataset: { path: it.path, dir: n.type === 'dir' ? '1' : '' } });
        const tags = n.tags && n.tags.length ? h('span.fd-tags', n.tags.map((c) => h('i', { style: { background: c } }))) : null;
        if (cls === 'icon') {
          el.append(h('div.fd-thumb' + (isImg ? '.img' : ''), h('img', { src: iconOf(it), alt: '', loading: 'lazy', draggable: 'false' })), h('div.fd-name', label(it)), tags);
        } else if (cls === 'row') {
          el.append(
            h('div.fd-c.name', h('img', { src: iconOf(it), alt: '', loading: 'lazy', draggable: 'false' }), h('span.fd-name', label(it)), tags),
            h('div.fd-c.date', OS.fmt.relative(n.mtime).replace('现在', '刚刚')),
            h('div.fd-c.size', n.type === 'dir' ? '--' : OS.fmt.size(vfs.sizeOf(n))),
            h('div.fd-c.kind', vfs.kindLabel(n))
          );
        } else {
          el.append(h('img', { src: iconOf(it), alt: '', loading: 'lazy', draggable: 'false' }), h('span.fd-name', label(it)), tags, n.type === 'dir' ? h('span.fd-chev', { html: glyph('chevron-right') }) : null);
        }
        return el;
      }

      function render() {
        win.el.dataset.dropPath = st.writable() ? st.path : '';
        if (!st.writable()) delete win.el.dataset.dropPath;
        const name = st.special === 'recents' ? '最近使用' : st.special === 'airdrop' ? '隔空投送' : st.special && st.special.startsWith('tag:') ? SIDEBAR.find((s) => s.tag === st.special.slice(4)).label : vfs.displayName(st.path);
        title.textContent = st.query ? `正在搜索“${st.query}”` : name;
        win.setTitle(name);
        back.disabled = !st.canBack();
        fwd.disabled = !st.canFwd();
        $$('button', viewSeg).forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
        renderSidebar();
        content.innerHTML = '';
        content.className = 'fd-content view-' + st.view;

        if (st.special === 'airdrop') {
          content.className = 'fd-content view-airdrop';
          content.append(h('div.airdrop', h('div.ad-radar', h('i'), h('i'), h('i'), h('span', { html: glyph('airdrop') })), h('p', '隔空投送让你可以与附近的人立即共享。'), h('p.small', '允许这些人发现我：仅限联系人'), h('div.ad-hint', '附近没有找到使用隔空投送的人')));
          renderPath();
          updateStatus();
          return;
        }
        if (st.path === HOME + '/.Trash' && !st.query) {
          content.appendChild(h('div.fd-trashbar', h('span', '废纸篓'), h('button.btn', { disabled: !vfs.trashCount(), onclick: () => OS.emptyTrash() }, '清倒')));
        }
        const list = items();
        if (!list.length) {
          content.appendChild(h('div.fd-empty', st.query ? '没有结果' : st.path === HOME + '/.Trash' ? '废纸篓是空的' : '此文件夹为空'));
        } else if (st.view === 'icon') {
          const grid = h('div.fd-grid');
          list.forEach((it) => grid.appendChild(itemEl(it, 'icon')));
          content.appendChild(grid);
        } else if (st.view === 'list') {
          const hd = h('div.fd-head',
            ...[['name', '名称'], ['mtime', '修改日期'], ['size', '大小'], ['kind', '种类']].map(([k, l]) => h('div.fd-c.' + (k === 'mtime' ? 'date' : k) + (st.sort === k ? '.sorted' : ''), { onclick: () => st.setSort(k) }, l, st.sort === k ? h('span', { html: glyph('chevron-down') }) : null))
          );
          const rows = h('div.fd-rows');
          list.forEach((it) => rows.appendChild(itemEl(it, 'row')));
          content.append(hd, rows);
        } else if (st.view === 'column') {
          // Miller columns: every ancestor of the current folder gets a column
          const cols = h('div.fd-columns');
          const base = st.path || HOME;
          const chain = [];
          let p = base;
          while (true) {
            chain.unshift(p);
            if (p === '/' || p === HOME || chain.length > 4) break;
            p = vfs.parentOf(p);
          }
          chain.forEach((dir, ci) => {
            const col = h('div.fd-col');
            const next = chain[ci + 1];
            const kids = ci === chain.length - 1 ? list : (vfs.list(dir) || []).map((n) => ({ path: vfs.norm(dir + '/' + n.name), node: n })).sort((a, b) => a.node.name.localeCompare(b.node.name, 'zh'));
            kids.forEach((it) => {
              const el = itemEl(it, 'col');
              if (it.path === next) el.classList.add('trail');
              col.appendChild(el);
            });
            cols.appendChild(col);
          });
          // preview column for a selected file
          const s = [...st.sel][0];
          const sn = s && vfs.resolve(s);
          if (sn && sn.type === 'file') cols.appendChild(h('div.fd-col.fd-colprev', sn.kind === 'image' ? h('img', { src: sn.src, alt: '' }) : h('img.icon', { src: vfs.iconFor(sn, s), alt: '' }), h('b', sn.name), h('small', `${vfs.kindLabel(sn)} — ${OS.fmt.size(vfs.sizeOf(sn))}`)));
          content.appendChild(cols);
          requestAnimationFrame(() => (cols.scrollLeft = cols.scrollWidth));
        } else if (st.view === 'gallery') {
          const s = [...st.sel][0] || list[0].path;
          if (!st.sel.size) st.sel.add(s);
          const sn = vfs.resolve(s);
          const stage = h('div.fd-gal-stage', sn.kind === 'image' ? h('img', { src: sn.src, alt: '' }) : h('img.icon', { src: vfs.iconFor(sn, s), alt: '' }));
          const strip = h('div.fd-gal-strip');
          list.forEach((it) => {
            const el = h('div.fd-gal-item' + (st.sel.has(it.path) ? '.sel' : ''), { dataset: { path: it.path, dir: it.node.type === 'dir' ? '1' : '' }, title: it.node.name }, h('img', { src: iconOf(it), alt: '', loading: 'lazy', draggable: 'false' }));
            strip.appendChild(el);
          });
          content.append(h('div.fd-gallery', stage, h('div.fd-gal-name', sn.name), strip));
        }
        renderPath();
        renderPreview();
        updateStatus();
      }
      st.render = render;

      /* ---------- pointer interactions (select, open, drag & drop) ---------- */
      content.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const el = e.target.closest('[data-path]');
        if (!el) {
          if (!e.target.closest('input,button')) {
            st.sel.clear();
            paintSel();
            if (st.view === 'icon' || st.view === 'list') rubber(e);
          }
          return;
        }
        const p = el.dataset.path;
        if (OS.cmd(e)) st.sel.has(p) ? st.sel.delete(p) : st.sel.add(p);
        else if (e.shiftKey && st.anchor) {
          const paths = items().map((i) => i.path);
          const a = paths.indexOf(st.anchor), b = paths.indexOf(p);
          st.sel = new Set(paths.slice(Math.min(a, b), Math.max(a, b) + 1));
        } else if (!st.sel.has(p)) st.sel = new Set([p]);
        st.anchor = p;
        if (st.view === 'column') {
          const n = vfs.resolve(p);
          if (n && n.type === 'dir' && !OS.cmd(e)) {
            st.go(p);
            return;
          }
          render();
          return;
        }
        if (st.view === 'gallery') return render();
        paintSel();
        startDrag(e, el);
      });
      content.addEventListener('dblclick', (e) => {
        const el = e.target.closest('[data-path]');
        if (!el) return;
        const p = el.dataset.path;
        const n = vfs.resolve(p);
        if (n && n.type === 'dir') st.go(p);
        else vfs.open(p);
      });
      content.addEventListener('contextmenu', (e) => {
        const el = e.target.closest('[data-path]');
        if (el) {
          if (!st.sel.has(el.dataset.path)) {
            st.sel = new Set([el.dataset.path]);
            paintSel();
          }
          return OS.contextMenu(e, OS.itemMenu([...st.sel], { rename: st.rename }));
        }
        OS.contextMenu(e, bgMenu());
      });
      function bgMenu() {
        return [
          { label: '新建文件夹', disabled: !st.writable(), action: st.newFolder },
          { label: '新建文本文稿', disabled: !st.writable(), action: st.newText },
          { sep: true },
          { label: '显示简介', disabled: !st.path, action: () => OS.getInfo(st.path) },
          { sep: true },
          { label: '查看方式', submenu: [['icon', '为图标'], ['list', '为列表'], ['column', '为分栏'], ['gallery', '为画廊']].map(([v, l]) => ({ label: l, checked: st.view === v, action: () => st.setView(v) })) },
          { label: '排序方式', submenu: [['name', '名称'], ['kind', '种类'], ['mtime', '修改日期'], ['size', '大小']].map(([k, l]) => ({ label: l, checked: st.sort === k, action: () => st.setSort(k) })) },
          { sep: true },
          { label: '粘贴项目', disabled: !OS.finderClipboard || !st.writable(), action: st.paste },
          { label: '在终端中打开', disabled: !st.path, action: () => OS.launch('terminal', { cwd: st.path }) },
        ];
      }
      function rubber(e) {
        const r0 = content.getBoundingClientRect();
        const s = OS.scale;
        const sx = (e.clientX - r0.left) / s + content.scrollLeft, sy = (e.clientY - r0.top) / s + content.scrollTop;
        const band = h('div.fd-band');
        content.appendChild(band);
        const move = (ev) => {
          const x = (ev.clientX - r0.left) / s + content.scrollLeft, y = (ev.clientY - r0.top) / s + content.scrollTop;
          const L = Math.min(x, sx), T = Math.min(y, sy), W = Math.abs(x - sx), H = Math.abs(y - sy);
          Object.assign(band.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
          st.sel.clear();
          $$('[data-path]', content).forEach((el) => {
            const r = el.getBoundingClientRect();
            const ex = (r.left - r0.left) / s + content.scrollLeft, ey = (r.top - r0.top) / s + content.scrollTop;
            if (ex < L + W && ex + r.width / s > L && ey < T + H && ey + r.height / s > T) st.sel.add(el.dataset.path);
          });
          paintSel();
        };
        const up = () => {
          band.remove();
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }
      function startDrag(e, el) {
        const start = { x: e.clientX, y: e.clientY };
        let ghost = null, target = null;
        const paths = [...st.sel];
        const move = (ev) => {
          if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
          if (!ghost) {
            const img = el.querySelector('img');
            ghost = h('div.fd-ghost', h('img', { src: img ? img.src : OS.icon('document'), alt: '' }), paths.length > 1 ? h('span', paths.length) : null);
            $('#overlays').appendChild(ghost);
          }
          const p = OS.wm.pt(ev);
          ghost.style.left = p.x - 24 + 'px';
          ghost.style.top = p.y - 24 + 'px';
          ghost.style.display = 'none';
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          ghost.style.display = '';
          $$('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
          target = null;
          const dirEl = under && under.closest('[data-dir="1"], [data-drop], .dock-item.trash, #desktop');
          if (dirEl && !(dirEl.dataset.path && paths.includes(dirEl.dataset.path))) {
            target = dirEl;
            dirEl.classList.add('drop-hover');
          }
          if (!target && OS.dock.dropTarget(ev.clientX, ev.clientY, paths)) target = 'dock:' + OS.dock.dropTarget(ev.clientX, ev.clientY, paths);
          else OS.dock.dropTarget(-1, -1, []);
          if (!target && under) {
            const w = under.closest('.win[data-drop-path]');
            if (w && w !== win.el) (target = w), w.classList.add('drop-hover');
          }
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (!ghost) return;
          ghost.remove();
          $$('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
          if (!target) return;
          if (typeof target === 'string') return OS.dock.dropOpen(target.slice(5), paths);
          if (target.classList.contains('trash')) return paths.forEach((p) => vfs.trash(p));
          const dest = target.id === 'desktop' ? HOME + '/Desktop' : target.dataset.path || target.dataset.drop || target.dataset.dropPath;
          if (!dest) return;
          paths.forEach((p) => vfs.move(p, dest));
          st.sel.clear();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }
      // sidebar items as drop targets are handled through [data-drop]

      search.addEventListener('input', () => {
        st.query = search.value.trim();
        render();
      });
      search.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          search.value = '';
          st.query = '';
          render();
          content.focus();
        }
      });

      const off = OS.on('vfs:change', () => {
        if (st.path && !vfs.resolve(st.path)) st.path = HOME;
        render();
      });
      win.on('close', off);
      render();
      if (args.select) {
        st.sel = new Set([vfs.norm(st.path + '/' + args.select)]);
        paintSel();
      }
      setTimeout(() => content.focus(), 50);
    },
  });
})();
