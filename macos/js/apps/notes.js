/* Notes */
(function () {
  const { h, $$, glyph } = OS;

  const SEED = () => {
    const t = Date.now();
    return [
      { id: 'n1', folder: 'notes', pinned: true, updated: t - 600000, html: '<h1>欢迎使用备忘录</h1><p>备忘录会自动保存。试试工具栏里的格式按钮，或者输入一个清单：</p><ul class="checklist"><li class="done">打开这台 Mac</li><li>拖动窗口到屏幕边缘体验平铺</li><li>在聚焦搜索里算一下 2^10</li></ul><p>按 <b>⌘N</b> 也可以从“文件”菜单新建备忘录。</p>' },
      { id: 'n2', folder: 'notes', updated: t - 86400000, html: '<h1>购物清单</h1><ul class="checklist"><li>牛奶</li><li class="done">咖啡豆</li><li>牛油果</li><li>全麦面包</li></ul>' },
      { id: 'n3', folder: 'notes', updated: t - 3 * 86400000, html: '<h1>灵感</h1><p>为每一个过渡动画设定一个“起点”和“落点”，用户就能看懂界面在做什么。</p><p><i>好的设计是尽可能少的设计。</i>— Dieter Rams</p>' },
      { id: 'n4', folder: 'work', updated: t - 5 * 86400000, html: '<h1>周会纪要</h1><h2>议题</h2><ol><li>Liquid Glass 的可读性</li><li>菜单栏透明度</li><li>新墙纸的发布节奏</li></ol><h2>结论</h2><p>先在深色模式下验证对比度。</p>' },
      { id: 'n5', folder: 'travel', updated: t - 12 * 86400000, html: '<h1>太浩湖</h1><p>翡翠湾日落 18:42。记得带外套，湖边风大。</p>' },
    ];
  };
  const FOLDERS = [
    { id: 'all', name: '所有 iCloud 备忘录', glyph: 'folder' },
    { id: 'notes', name: '备忘录', glyph: 'folder' },
    { id: 'work', name: '工作', glyph: 'folder' },
    { id: 'travel', name: '旅行', glyph: 'folder' },
    { id: 'trash', name: '最近删除', glyph: 'trash' },
  ];
  const textOf = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('li,p,h1,h2,h3,div,br').forEach((e) => e.append('\n'));
    return d.textContent.replace(/\n{2,}/g, '\n').trim();
  };
  const titleOf = (n) => textOf(n.html).split('\n')[0].slice(0, 60) || '新备忘录';

  let notes = OS.store.get('notes.v2', null) || SEED();
  const save = OS.debounce(() => {
    OS.store.set('notes.v2', notes);
    // a light index for Spotlight
    OS.store.set('notes', notes.filter((n) => n.folder !== 'trash').map((n) => ({ id: n.id, title: titleOf(n), text: textOf(n.html).slice(0, 300) })));
    OS.emit('notes');
  }, 300);
  save();

  OS.registerApp({
    id: 'notes', name: '备忘录', icon: 'notes', keywords: ['notes', '笔记', 'memo'], width: 920, height: 580, minWidth: 560, minHeight: 320, singleton: true,
    description: '记下想法、清单和草图，自动保存。',
    reopen(win, args) {
      if (args.id) win.state_.open(args.id);
      if (args.importText != null) win.state_.create(args.importText, args.title);
    },
    menus: (win) => {
      const st = win && win.state_;
      return [
        { title: '文件', items: [
          { label: '新建备忘录', key: '⌘N', action: () => (st ? st.create() : OS.launch('notes')) },
          { label: '新建文件夹', key: '⇧⌘N', disabled: true },
          { sep: true },
          { label: '置顶备忘录', disabled: !st, action: () => st.pin() },
          { label: '删除', disabled: !st, action: () => st.remove() },
        ] },
        { title: '格式', items: [
          { label: '标题', key: '⇧⌘T', action: () => document.execCommand('formatBlock', false, 'h1') },
          { label: '小标题', key: '⇧⌘H', action: () => document.execCommand('formatBlock', false, 'h2') },
          { label: '正文', key: '⇧⌘B', action: () => document.execCommand('formatBlock', false, 'p') },
          { sep: true },
          { label: '核对清单', key: '⇧⌘L', disabled: !st, action: () => st.checklist() },
          { label: '粗体', key: '⌘B', action: () => document.execCommand('bold') },
          { label: '斜体', key: '⌘I', action: () => document.execCommand('italic') },
          { label: '下划线', key: '⌘U', action: () => document.execCommand('underline') },
          { label: '删除线', action: () => document.execCommand('strikeThrough') },
        ] },
      ];
    },
    onKey(win, e) {
      const st = win.state_;
      if (OS.cmd(e) && e.code === 'KeyN' && !e.shiftKey) return e.preventDefault(), st.create();
      if (OS.cmd(e) && e.shiftKey && e.code === 'KeyL') return e.preventDefault(), st.checklist();
    },
    create(win, args) {
      const st = (win.state_ = { folder: 'all', current: null, q: '' });
      const sidebar = h('nav.side', { 'data-drag': '' });
      const list = h('div.nt-list');
      const search = h('input.tb-search-input', { id: 'notes-search', type: 'search', placeholder: '搜索' });
      const editor = h('div.nt-editor', { contenteditable: 'true', spellcheck: 'false', 'data-placeholder': '开始书写…' });
      const stamp = h('div.nt-stamp');
      const tb = (g, label, fn) => h('button.tb-btn', { title: label, 'aria-label': label, html: glyph(g), onmousedown: (e) => e.preventDefault(), onclick: fn });
      const toolbar = h('div.tbar', { 'data-drag': '' },
        h('div.tb-group', tb('sidebar', '显示/隐藏文件夹', () => root.classList.toggle('no-sidebar')), tb('trash', '删除', () => st.remove())),
        h('div.tb-spacer', { 'data-drag': '' }),
        h('div.tb-group', tb('compose', '新建备忘录', () => st.create())),
        h('div.tb-group',
          tb('textformat', '格式', (e) => OS.contextMenu(e, [
            { label: '标题', action: () => document.execCommand('formatBlock', false, 'h1') },
            { label: '小标题', action: () => document.execCommand('formatBlock', false, 'h2') },
            { label: '正文', action: () => document.execCommand('formatBlock', false, 'p') },
            { label: '等宽', action: () => document.execCommand('formatBlock', false, 'pre') },
            { sep: true },
            { label: '项目符号列表', action: () => document.execCommand('insertUnorderedList') },
            { label: '编号列表', action: () => document.execCommand('insertOrderedList') },
            { sep: true },
            { label: '粗体', key: '⌘B', action: () => document.execCommand('bold') },
            { label: '斜体', key: '⌘I', action: () => document.execCommand('italic') },
            { label: '下划线', key: '⌘U', action: () => document.execCommand('underline') },
            { label: '删除线', action: () => document.execCommand('strikeThrough') },
          ])),
          tb('checklist', '核对清单', () => st.checklist()),
          tb('table', '表格', () => st.table()),
          tb('photo', '插入照片', () => st.photo())
        ),
        h('div.tb-group', tb('lock', '锁定', () => OS.toast('使用 Touch ID 锁定备忘录（演示）', 'lock')), tb('share', '共享', () => st.share())),
        h('label.tb-search', h('span', { html: glyph('search') }), search)
      );
      const listPane = h('div.nt-listpane', h('div.nt-listhead', { 'data-drag': '' }, h('b.nt-folder-title'), h('small.nt-count')), list);
      const root = h('div.app.notes', h('div.split', sidebar, h('div.pane', toolbar, h('div.nt-body', listPane, h('div.nt-doc', stamp, editor)))));
      win.body.appendChild(root);

      const visible = () =>
        notes
          .filter((n) => (st.folder === 'all' ? n.folder !== 'trash' : n.folder === st.folder))
          .filter((n) => !st.q || textOf(n.html).toLowerCase().includes(st.q))
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);

      function renderSidebar() {
        sidebar.innerHTML = '';
        sidebar.append(h('div.side-top', { 'data-drag': '' }), h('div.sb-head', 'iCloud'));
        FOLDERS.forEach((f) => {
          const count = notes.filter((n) => (f.id === 'all' ? n.folder !== 'trash' : n.folder === f.id)).length;
          const row = h('div.sb-item' + (st.folder === f.id ? '.active' : ''), h('span.sb-ico.yellow', { html: glyph(f.glyph) }), h('span.sb-label', f.name), h('span.sb-count', count));
          row.onclick = () => {
            st.folder = f.id;
            st.current = null;
            render();
          };
          sidebar.appendChild(row);
        });
        sidebar.appendChild(h('div.sb-foot', h('button.sb-new', { onclick: () => OS.toast('新建文件夹（演示）') }, h('span', { html: glyph('plus') }), '新建文件夹')));
      }
      function group(ts) {
        const d = (Date.now() - ts) / 86400000;
        return d < 1 && new Date(ts).toDateString() === new Date().toDateString() ? '今天' : d < 2 ? '昨天' : d < 7 ? '过去 7 天' : d < 30 ? '过去 30 天' : '更早';
      }
      function renderList() {
        list.innerHTML = '';
        const v = visible();
        root.querySelector('.nt-folder-title').textContent = FOLDERS.find((f) => f.id === st.folder).name;
        root.querySelector('.nt-count').textContent = `${v.length} 个备忘录`;
        let g = null;
        v.forEach((n) => {
          const gname = n.pinned ? '已置顶' : group(n.updated);
          if (gname !== g) {
            g = gname;
            list.appendChild(h('div.nt-group', g));
          }
          const body = textOf(n.html).split('\n').slice(1).join(' ');
          const row = h('div.nt-item' + (st.current === n.id ? '.on' : ''), { dataset: { id: n.id } },
            h('b', titleOf(n)),
            h('div.nt-meta', h('span', OS.fmt.relative(n.updated).replace('现在', '刚刚')), h('span.nt-prev', body || '没有其他文本'))
          );
          row.onclick = () => st.open(n.id);
          row.oncontextmenu = (e) => OS.contextMenu(e, [
            { label: n.pinned ? '取消置顶' : '置顶备忘录', action: () => ((n.pinned = !n.pinned), save(), render()) },
            { label: '移到', submenu: FOLDERS.filter((f) => !['all', 'trash'].includes(f.id)).map((f) => ({ label: f.name, checked: n.folder === f.id, action: () => ((n.folder = f.id), save(), render()) })) },
            { sep: true },
            { label: st.folder === 'trash' ? '永久删除' : '删除', action: () => st.remove(n.id) },
          ]);
          list.appendChild(row);
        });
        if (!v.length) list.appendChild(h('div.nt-empty', st.q ? '没有结果' : '没有备忘录'));
      }
      function renderEditor() {
        const n = notes.find((x) => x.id === st.current);
        editor.hidden = !n;
        stamp.textContent = n ? OS.fmt.dateTime(new Date(n.updated)) : '';
        if (n && editor.dataset.id !== n.id) {
          editor.innerHTML = n.html;
          editor.dataset.id = n.id;
        }
        editor.contentEditable = n && n.folder !== 'trash' ? 'true' : 'false';
      }
      function render() {
        if (!st.current || !visible().some((n) => n.id === st.current)) st.current = visible()[0]?.id || null;
        renderSidebar();
        renderList();
        renderEditor();
      }

      st.open = (id) => {
        const n = notes.find((x) => x.id === id);
        if (!n) return;
        if (st.folder !== 'all' && n.folder !== st.folder) st.folder = 'all';
        st.current = id;
        render();
      };
      st.create = (text, title) => {
        const folder = ['all', 'trash'].includes(st.folder) ? 'notes' : st.folder;
        const html = text != null ? `<h1>${OS.esc(title || '导入的文本')}</h1>` + OS.esc(text).split('\n').map((l) => `<p>${l || '<br>'}</p>`).join('') : '<h1><br></h1>';
        const n = { id: OS.uid(), folder, updated: Date.now(), html };
        notes.unshift(n);
        st.current = n.id;
        st.q = '';
        search.value = '';
        save();
        render();
        editor.focus();
        const sel = window.getSelection();
        sel.selectAllChildren(editor.firstChild || editor);
        sel.collapseToStart();
      };
      st.remove = async (id = st.current) => {
        const n = notes.find((x) => x.id === id);
        if (!n) return;
        if (n.folder === 'trash') {
          const r = await OS.alert({ title: '确定要永久删除此备忘录吗？', message: '此操作无法撤销。', icon: OS.icon('notes'), buttons: [{ label: '取消' }, { label: '删除', primary: true }], destructive: true });
          if (r !== 1) return;
          notes = notes.filter((x) => x !== n);
        } else n.folder = 'trash';
        OS.sound.play('trash');
        st.current = null;
        save();
        render();
      };
      st.pin = () => {
        const n = notes.find((x) => x.id === st.current);
        if (n) (n.pinned = !n.pinned), save(), render();
      };
      st.checklist = () => {
        editor.focus();
        document.execCommand('insertUnorderedList');
        const li = window.getSelection().anchorNode && (window.getSelection().anchorNode.nodeType === 1 ? window.getSelection().anchorNode : window.getSelection().anchorNode.parentElement).closest('ul');
        li && li.classList.add('checklist');
        commit();
      };
      st.table = () => {
        editor.focus();
        document.execCommand('insertHTML', false, '<table class="nt-table"><tr><td>项目</td><td>状态</td></tr><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></table><p><br></p>');
        commit();
      };
      st.photo = () => {
        const inp = h('input', { type: 'file', accept: 'image/*' });
        inp.onchange = () => {
          const f = inp.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            // downscale before storing
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              const s = Math.min(1, 900 / img.width);
              c.width = img.width * s;
              c.height = img.height * s;
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              editor.focus();
              document.execCommand('insertHTML', false, `<img src="${c.toDataURL('image/jpeg', 0.8)}" alt=""><p><br></p>`);
              commit();
            };
            img.src = r.result;
          };
          r.readAsDataURL(f);
        };
        inp.click();
      };
      st.share = () => {
        const n = notes.find((x) => x.id === st.current);
        if (!n) return;
        navigator.clipboard && navigator.clipboard.writeText(textOf(n.html)).then(() => OS.toast('已拷贝备忘录文本', 'square-on-square'), () => {});
      };
      function commit() {
        const n = notes.find((x) => x.id === st.current);
        if (!n) return;
        n.html = editor.innerHTML;
        n.updated = Date.now();
        stamp.textContent = OS.fmt.dateTime(new Date(n.updated));
        save();
        // refresh the list row without re-rendering the editor
        const row = list.querySelector(`[data-id="${n.id}"]`);
        if (row) {
          row.querySelector('b').textContent = titleOf(n);
          row.querySelector('.nt-prev').textContent = textOf(n.html).split('\n').slice(1).join(' ') || '没有其他文本';
        }
      }
      editor.addEventListener('input', commit);
      editor.addEventListener('click', (e) => {
        const li = e.target.closest('ul.checklist > li');
        if (li && e.offsetX < 22) {
          li.classList.toggle('done');
          commit();
        }
      });
      editor.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const cmd = OS.cmd(e);
        if (cmd && ['KeyB', 'KeyI', 'KeyU'].includes(e.code)) {
          e.preventDefault();
          document.execCommand({ KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' }[e.code]);
        } else if (cmd && e.code === 'KeyN') {
          e.preventDefault();
          st.create();
        } else if (cmd && e.shiftKey && e.code === 'KeyL') {
          e.preventDefault();
          st.checklist();
        } else if (cmd && ['KeyW', 'KeyM', 'KeyQ'].includes(e.code)) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey }));
        }
      });
      search.addEventListener('input', () => {
        st.q = search.value.trim().toLowerCase();
        renderList();
      });
      search.addEventListener('keydown', (e) => e.stopPropagation());

      if (args.id) st.current = args.id;
      render();
      if (args.importText != null) st.create(args.importText, args.title);
    },
  });
})();
