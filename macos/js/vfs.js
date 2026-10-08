/* Virtual file system persisted in localStorage. Paths use "/" and ~ for the home folder. */
(function () {
  const HOME = '/Users/guest';
  const KEY = 'vfs.v2';

  const now = Date.now();
  const day = 86400000;
  const f = (name, kind, extra = {}) => ({ name, type: 'file', kind, mtime: extra.mtime || now - Math.random() * 20 * day, ...extra });
  const d = (name, children = [], extra = {}) => ({ name, type: 'dir', mtime: extra.mtime || now - Math.random() * 40 * day, children, ...extra });

  const welcome = `欢迎使用 macOS Tahoe Web

这是一台运行在浏览器里的 Mac。几个可以先试试的操作：

• 按 Ctrl + 空格（或点按菜单栏右上角的放大镜）打开聚焦搜索，输入应用名称、文件名或算式。
• 把窗口拖到屏幕左右边缘或顶部，松开即可平铺；把鼠标停在绿色按钮上会出现更多排列方式。
• 按 F3 或 Ctrl + ↑ 打开调度中心，顶部可以新建桌面。
• 点按菜单栏的时间打开通知中心，点按开关图标打开控制中心。
• 在“终端”里输入 help 查看可用命令，例如 neofetch、ls、open Safari。
• 按 Ctrl + Shift + 3 截屏，截图会存到桌面。

你在这里创建的文件、备忘录、日程都会保存在这台浏览器上。`;

  function seed() {
    return d('', [
      d('Applications', [], { system: true }),
      d('System', [d('Library', [d('CoreServices', [f('SystemVersion.plist', 'text', { content: '<plist><dict><key>ProductVersion</key><string>26.1</string></dict></plist>' })])])], { system: true }),
      d('Library', [d('Desktop Pictures', OS.wallpapers.map((w) => f(w.name + '.jpg', 'image', { src: OS.wallpaperSrc(w.light), size: 412000 })))], { system: true }),
      d('Users', [
        d('guest', [
          d('Desktop', [
            f('欢迎使用 macOS.txt', 'text', { content: welcome, mtime: now - 3600000 }),
            d('项目', [
              f('发布计划.txt', 'text', { content: '十月发布计划\n\n1. 完成界面走查\n2. 准备演示视频\n3. 撰写发布说明\n4. 安排媒体沟通' }),
              f('设计稿.jpg', 'image', { src: OS.wallpaperSrc('tahoe-beach-dusk'), size: 412000 }),
            ]),
            f('Tahoe 湖畔.jpg', 'image', { src: OS.wallpaperSrc('tahoe-beach-day'), size: 575000 }),
          ]),
          d('Documents', [
            f('读书笔记.txt', 'text', {
              content: '《设计心理学》读书笔记\n\n· 可供性：物体自身的属性提示了它能被如何使用。\n· 意符：告诉人们该在哪里操作的信号。\n· 映射：控制与结果之间的空间对应关系。\n· 反馈：每一次操作都应该立刻得到可感知的回应。',
            }),
            f('旅行计划.txt', 'text', { content: '太浩湖三日游\n\n第一天：抵达南太浩，傍晚去翡翠湾看日落\n第二天：环湖自驾，午餐在塔霍城\n第三天：清晨划桨板，中午返程' }),
            d('工作', [f('周报.txt', 'text', { content: '本周完成\n- 程序坞放大动画\n- 窗口贴靠\n- 聚焦搜索的计算器\n\n下周计划\n- 调度中心\n- 多桌面切换' })]),
          ]),
          d('Downloads', [
            f('Sequoia.jpg', 'image', { src: OS.wallpaperSrc('sequoia-light'), size: 217000 }),
            f('Sonoma 暗色.jpg', 'image', { src: OS.wallpaperSrc('sonoma-dark'), size: 250000 }),
            f('使用手册.txt', 'text', { content: 'Mac 使用手册（节选）\n\n按住 Option 键点按绿色按钮可以缩放窗口而不进入全屏。\n按 Option + Tab 切换应用。' }),
          ]),
          d('Pictures', OS.wallpapers.map((w) => f(w.name + '.jpg', 'image', { src: OS.wallpaperSrc(w.light), size: 300000 }))),
          d('Music', [d('音乐库')]),
          d('Movies', []),
          d('.Trash', [], { hidden: true }),
        ]),
        d('Shared', []),
      ]),
    ]);
  }

  let root = OS.store.get(KEY, null);
  if (!root) root = seed();

  const save = OS.debounce(() => {
    if (!OS.store.set(KEY, root)) console.warn('VFS: storage full');
    OS.emit('vfs');
  }, 250);
  const touch = () => {
    OS.emit('vfs:change');
    save();
  };

  function norm(path) {
    if (!path) return HOME;
    if (path === '~') return HOME;
    if (path.startsWith('~/')) path = HOME + path.slice(1);
    const parts = [];
    path.split('/').forEach((p) => {
      if (!p || p === '.') return;
      if (p === '..') parts.pop();
      else parts.push(p);
    });
    return '/' + parts.join('/');
  }
  function resolve(path) {
    path = norm(path);
    if (path === '/') return root;
    let node = root;
    for (const part of path.slice(1).split('/')) {
      if (!node || node.type !== 'dir') return null;
      if (node === root && part === 'Applications') return appsDir();
      node = node.children.find((c) => c.name === part);
    }
    return node || null;
  }
  function appsDir() {
    const real = root.children.find((c) => c.name === 'Applications');
    const list = Object.values(OS.apps)
      .filter((a) => !a.hidden)
      .map((a) => ({ name: a.name + '.app', type: 'file', kind: 'app', appId: a.id, mtime: now - 30 * day, size: a.size || 48000000 }));
    return Object.assign({}, real, { children: list, virtual: true });
  }
  const parentOf = (path) => norm(path).replace(/\/[^/]+$/, '') || '/';
  const baseName = (path) => norm(path).split('/').pop();

  function ext(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toLowerCase() : '';
  }
  function kindFromName(name) {
    const e = ext(name);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(e)) return 'image';
    if (['txt', 'md', 'rtf', 'js', 'css', 'html', 'json', 'plist', 'sh'].includes(e)) return 'text';
    if (['mp3', 'm4a', 'wav'].includes(e)) return 'audio';
    if (e === 'app') return 'app';
    if (e === 'pdf') return 'pdf';
    return 'text';
  }
  function uniqueName(dirPath, name) {
    const dir = resolve(dirPath);
    if (!dir || dir.type !== 'dir') return name;
    if (!dir.children.some((c) => c.name === name)) return name;
    const e = ext(name);
    const stem = e ? name.slice(0, -(e.length + 1)) : name;
    for (let i = 2; ; i++) {
      const n = e ? `${stem} ${i}.${e}` : `${stem} ${i}`;
      if (!dir.children.some((c) => c.name === n)) return n;
    }
  }

  const VFS = {
    HOME,
    norm,
    resolve,
    parentOf,
    baseName,
    ext,
    kindFromName,
    uniqueName,
    exists: (p) => !!resolve(p),
    list(path, { hidden = false } = {}) {
      const n = resolve(path);
      if (!n || n.type !== 'dir') return null;
      return n.children.filter((c) => hidden || !(c.hidden || c.name.startsWith('.')));
    },
    read(path) {
      const n = resolve(path);
      return n && n.type === 'file' ? n.content ?? '' : null;
    },
    write(path, content, extra = {}) {
      path = norm(path);
      const dir = resolve(parentOf(path));
      if (!dir || dir.type !== 'dir' || dir.virtual) return null;
      let n = dir.children.find((c) => c.name === baseName(path));
      if (n && n.type === 'dir') return null;
      if (!n) {
        n = f(baseName(path), extra.kind || kindFromName(path), { ctime: Date.now() });
        dir.children.push(n);
      }
      if (content != null) n.content = content;
      Object.assign(n, extra);
      n.size = extra.size || (typeof n.content === 'string' ? new Blob([n.content]).size : n.size || 0);
      n.mtime = Date.now();
      touch();
      return n;
    },
    mkdir(path) {
      path = norm(path);
      const dir = resolve(parentOf(path));
      if (!dir || dir.type !== 'dir' || dir.virtual) return null;
      if (dir.children.some((c) => c.name === baseName(path))) return null;
      const n = d(baseName(path), [], { mtime: Date.now() });
      dir.children.push(n);
      touch();
      return n;
    },
    /* move node; returns new path */
    move(from, toDir, newName) {
      from = norm(from);
      const node = resolve(from);
      const src = resolve(parentOf(from));
      const dst = resolve(toDir);
      if (!node || !src || !dst || dst.type !== 'dir' || dst.virtual || src.virtual) return null;
      if (norm(toDir).startsWith(from + '/') || norm(toDir) === from) return null;
      const name = newName || node.name;
      const finalName = parentOf(from) === norm(toDir) && name === node.name ? name : uniqueName(toDir, name);
      src.children = src.children.filter((c) => c !== node);
      node.name = finalName;
      node.mtime = Date.now();
      dst.children.push(node);
      touch();
      return norm(toDir + '/' + finalName);
    },
    rename(path, name) {
      const node = resolve(path);
      if (!node || !name || name.includes('/')) return null;
      const dir = resolve(parentOf(path));
      if (dir.children.some((c) => c !== node && c.name === name)) return null;
      node.name = name;
      node.mtime = Date.now();
      touch();
      return norm(parentOf(path) + '/' + name);
    },
    copy(from, toDir) {
      const node = resolve(from);
      const dst = resolve(toDir);
      if (!node || !dst || dst.type !== 'dir' || dst.virtual) return null;
      const clone = JSON.parse(JSON.stringify(node));
      clone.name = uniqueName(toDir, node.name.replace(/(\.[^.]+)?$/, ' 副本$1'));
      clone.mtime = Date.now();
      dst.children.push(clone);
      touch();
      return norm(toDir + '/' + clone.name);
    },
    trash(path) {
      const node = resolve(path);
      if (!node) return null;
      node.origin = parentOf(path);
      const r = VFS.move(path, HOME + '/.Trash');
      if (r) OS.sound.play('trash');
      return r;
    },
    putBack(path) {
      const node = resolve(path);
      if (!node) return null;
      return VFS.move(path, node.origin && resolve(node.origin) ? node.origin : HOME + '/Desktop');
    },
    remove(path) {
      path = norm(path);
      const dir = resolve(parentOf(path));
      if (!dir || dir.virtual) return false;
      const before = dir.children.length;
      dir.children = dir.children.filter((c) => c.name !== baseName(path));
      touch();
      return dir.children.length !== before;
    },
    emptyTrash() {
      const t = resolve(HOME + '/.Trash');
      const n = t.children.length;
      t.children = [];
      touch();
      if (n) OS.sound.play('trash');
      return n;
    },
    trashCount: () => (resolve(HOME + '/.Trash') || { children: [] }).children.length,
    sizeOf(node) {
      if (node.type === 'file') return node.size || (node.content ? node.content.length : 0);
      return node.children.reduce((s, c) => s + VFS.sizeOf(c), 0);
    },
    /* search the user's files by name and text content */
    search(q, limit = 30) {
      q = q.toLowerCase();
      const out = [];
      (function walk(node, path) {
        if (out.length >= limit) return;
        for (const c of node.children || []) {
          if (c.name.startsWith('.')) continue;
          const p = path + '/' + c.name;
          if (c.name.toLowerCase().includes(q) || (c.type === 'file' && typeof c.content === 'string' && c.content.length < 50000 && c.content.toLowerCase().includes(q)))
            out.push({ path: p, node: c });
          if (c.type === 'dir') walk(c, p);
        }
      })(resolve(HOME), HOME);
      return out;
    },
    kindLabel(node) {
      if (node.type === 'dir') return '文件夹';
      return { image: (ext(node.name) || 'JPEG').toUpperCase() + ' 图像', text: ext(node.name) === 'txt' ? '纯文本文稿' : '文稿', app: '应用程序', audio: '音频', pdf: 'PDF 文稿' }[node.kind] || '文稿';
    },
    /* icon image URL for a node */
    iconFor(node, path = '') {
      if (node.type === 'dir') {
        const special = { Desktop: 'folder-desktop', Documents: 'folder-documents', Downloads: 'folder-downloads', Music: 'folder-music', Pictures: 'folder-pictures', guest: 'home' };
        if (path && parentOf(path) === HOME && special[node.name]) return OS.icon(special[node.name]);
        if (path === HOME) return OS.icon('home');
        return OS.icon('folder');
      }
      if (node.kind === 'app') return OS.icon(OS.apps[node.appId]?.icon || 'document');
      if (node.kind === 'image') return OS.thumbOf(node.src);
      if (node.kind === 'text') return OS.icon('textedit');
      return OS.icon('document');
    },
    /* open with default app */
    open(path) {
      path = norm(path);
      const node = resolve(path);
      if (!node) return;
      if (node.type === 'dir') return OS.launch('finder', { path });
      if (node.kind === 'app') return OS.launch(node.appId);
      if (node.kind === 'image') return OS.launch('preview', { path });
      return OS.launch('textedit', { path });
    },
    reset() {
      root = seed();
      touch();
    },
    displayName(path) {
      path = norm(path);
      const map = { [HOME]: OS.user.short, [HOME + '/Desktop']: '桌面', [HOME + '/Documents']: '文稿', [HOME + '/Downloads']: '下载', [HOME + '/Pictures']: '图片', [HOME + '/Music']: '音乐', [HOME + '/Movies']: '影片', [HOME + '/.Trash']: '废纸篓', '/Applications': '应用程序', '/': 'Macintosh HD', '/Users': '用户', '/Library': '资源库', '/System': '系统' };
      return map[path] || baseName(path);
    },
  };
  OS.vfs = VFS;
})();
