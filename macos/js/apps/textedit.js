/* TextEdit */
(function () {
  const { h, glyph } = OS;
  const vfs = OS.vfs;

  OS.registerApp({
    id: 'textedit', name: '文本编辑', icon: 'textedit', keywords: ['textedit', 'text', '文本', 'editor', 'txt'], width: 680, height: 560, minWidth: 360, minHeight: 240, alwaysNew: true,
    description: '编辑纯文本与多信息文本文稿。',
    menus: (win) => {
      const st = win && win.state_;
      return [
        { title: '文件', items: [
          { label: '新建', key: '⌘N', action: () => OS.newWindow('textedit', {}) },
          { label: '打开…', key: '⌘O', action: () => OS.launch('finder', { path: '~/Documents' }) },
          { sep: true },
          { label: '关闭', key: '⌘W', disabled: !win, action: () => win.close() },
          { label: '存储…', key: '⌘S', disabled: !st, action: () => st.save() },
          { label: '复制', disabled: !st, action: () => st.saveAs() },
          { label: '重新命名…', disabled: !st || !st.path, action: () => st.renameFile() },
          { label: '在访达中显示', disabled: !st || !st.path, action: () => OS.launch('finder', { path: vfs.parentOf(st.path), select: vfs.baseName(st.path) }) },
        ] },
        { title: '格式', items: [
          { label: st && st.plain ? '制作多信息文本' : '制作纯文本', key: '⇧⌘T', disabled: !st, action: () => st.togglePlain() },
          { sep: true },
          { label: '粗体', key: '⌘B', action: () => document.execCommand('bold') },
          { label: '斜体', key: '⌘I', action: () => document.execCommand('italic') },
          { label: '下划线', key: '⌘U', action: () => document.execCommand('underline') },
          { sep: true },
          { label: '左对齐', action: () => document.execCommand('justifyLeft') },
          { label: '居中', action: () => document.execCommand('justifyCenter') },
          { label: '右对齐', action: () => document.execCommand('justifyRight') },
        ] },
      ];
    },
    create(win, args) {
      const path = args.path ? vfs.norm(args.path) : null;
      const node = path ? vfs.resolve(path) : null;
      const st = (win.state_ = { path, dirty: false, plain: !node || vfs.ext(path) !== 'rtf' });
      const doc = h('div.te-doc', { contenteditable: 'true', spellcheck: 'false' });
      if (node) {
        if (vfs.ext(path) === 'rtf') doc.innerHTML = node.content || '';
        else doc.textContent = node.content || '';
      }
      const fontSel = h('select.te-select', { id: 'te-font-' + win.id, 'aria-label': '字体' }, ...['苹方', 'Helvetica', 'Georgia', 'Menlo'].map((f) => h('option', f)));
      const sizeSel = h('select.te-select.small', { id: 'te-size-' + win.id, 'aria-label': '字号' }, ...[10, 12, 13, 14, 16, 18, 24, 36].map((s) => h('option', { value: s, selected: s === 14 }, s)));
      const btn = (g, label, cmd) => h('button.te-btn', { title: label, 'aria-label': label, html: glyph(g), onmousedown: (e) => e.preventDefault(), onclick: () => (document.execCommand(cmd), dirty()) });
      const color = h('input.te-color', { id: 'te-color-' + win.id, type: 'color', value: '#1d1d1f', title: '文本颜色', 'aria-label': '文本颜色' });
      const ruler = h('div.te-ruler', fontSel, sizeSel, h('span.te-sep'), color, h('span.te-sep'), btn('bold', '粗体', 'bold'), btn('italic', '斜体', 'italic'), btn('underline', '下划线', 'underline'), btn('strike', '删除线', 'strikeThrough'), h('span.te-sep'), btn('align-left', '左对齐', 'justifyLeft'), btn('align-center', '居中', 'justifyCenter'), btn('align-right', '右对齐', 'justifyRight'), h('span.te-sep'), btn('list', '列表', 'insertUnorderedList'));
      const teName = h('span.te-name');
      const titleBar = h('div.te-title', { 'data-drag': '' }, h('span.te-proxy', teName), h('span.te-edited'));
      const status = h('div.te-status');
      const root = h('div.app.textedit', titleBar, ruler, h('div.te-page', doc), status);
      win.body.appendChild(root);
      OS.proxyIcon(win, titleBar.querySelector('.te-proxy'), () => st.path, (p) => ((st.path = p), updateTitle()));

      const fonts = { 苹方: 'var(--font)', Helvetica: 'Helvetica, Arial, sans-serif', Georgia: 'Georgia, serif', Menlo: 'var(--mono)' };
      fontSel.onchange = () => (doc.style.fontFamily = fonts[fontSel.value]);
      sizeSel.onchange = () => (doc.style.fontSize = sizeSel.value + 'px');
      color.oninput = () => (doc.focus(), document.execCommand('foreColor', false, color.value), dirty());

      function updateTitle() {
        const name = st.path ? vfs.baseName(st.path) : '未命名';
        root.querySelector('.te-name').textContent = name;
        root.querySelector('.te-edited').textContent = st.dirty ? ' — 已编辑' : '';
        win.setTitle(name + (st.dirty ? ' — 已编辑' : ''));
        root.classList.toggle('plain', st.plain);
        const text = doc.innerText || '';
        status.textContent = `${text.replace(/\s/g, '').length} 个字符 · ${text.split(/\n/).filter((l) => l.trim()).length} 段`;
      }
      function dirty() {
        st.dirty = true;
        updateTitle();
        autosave();
      }
      const autosave = OS.debounce(() => st.path && st.dirty && st.save(true), 1500);
      st.save = async (silent) => {
        if (!st.path) return st.saveAs();
        const content = st.plain ? doc.innerText : doc.innerHTML;
        vfs.write(st.path, content, { kind: 'text' });
        st.dirty = false;
        updateTitle();
        if (!silent) OS.toast('已存储', 'check');
      };
      st.saveAs = async () => {
        const name = await OS.alert({ title: '存储为：', message: '文稿将存储到“文稿”文件夹。', icon: OS.icon('textedit'), input: { value: (st.path ? vfs.baseName(st.path).replace(/(\.\w+)$/, ' 副本$1') : '未命名') + (st.path ? '' : st.plain ? '.txt' : '.rtf') }, buttons: [{ label: '取消' }, { label: '存储', primary: true }], win });
        if (!name) return;
        st.path = vfs.norm('~/Documents/' + vfs.uniqueName('~/Documents', name));
        await st.save();
      };
      st.renameFile = async () => {
        const name = await OS.alert({ title: '重新命名', icon: OS.icon('textedit'), input: { value: vfs.baseName(st.path) }, buttons: [{ label: '取消' }, { label: '重新命名', primary: true }], win });
        if (name) {
          const np = vfs.rename(st.path, name);
          if (np) (st.path = np), updateTitle();
        }
      };
      st.togglePlain = () => {
        st.plain = !st.plain;
        if (st.plain) doc.textContent = doc.innerText;
        dirty();
      };
      win.beforeClose = () => {
        if (!st.dirty || st.path) {
          if (st.dirty) st.save(true);
          return true;
        }
        OS.alert({ title: '要存储对文稿“未命名”所做的更改吗？', message: '如果不存储，你的更改将会丢失。', icon: OS.icon('textedit'), buttons: [{ label: '不存储' }, { label: '取消' }, { label: '存储…', primary: true }], win }).then(async (r) => {
          if (r === 0) OS.wm.close(win, true);
          if (r === 2) {
            await st.saveAs();
            if (!st.dirty) OS.wm.close(win, true);
          }
        });
        return false;
      };

      doc.addEventListener('input', dirty);
      doc.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const cmd = OS.cmd(e);
        if (cmd && e.code === 'KeyS') (e.preventDefault(), e.shiftKey ? st.saveAs() : st.save());
        else if (cmd && ['KeyB', 'KeyI', 'KeyU'].includes(e.code) && !st.plain) (e.preventDefault(), document.execCommand({ KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' }[e.code]), dirty());
        else if (cmd && ['KeyW', 'KeyM', 'KeyQ', 'KeyN'].includes(e.code)) {
          e.preventDefault();
          if (e.code === 'KeyN') OS.newWindow('textedit', {});
          else document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey }));
        }
      });
      updateTitle();
      setTimeout(() => doc.focus(), 60);
    },
  });
})();
