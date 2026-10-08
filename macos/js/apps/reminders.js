/* Reminders */
(function () {
  const { h, $$, glyph } = OS;
  const LISTS = [
    { id: 'reminders', name: '提醒事项', color: '#007aff' },
    { id: 'family', name: '家庭', color: '#ff9500' },
    { id: 'work', name: '工作', color: '#ff3b30' },
    { id: 'shopping', name: '购物', color: '#28cd41' },
  ];
  const today = () => new Date().toISOString().slice(0, 10);
  function seed() {
    const t = Date.now();
    return [
      { id: 'r1', title: '给妈妈打电话', list: 'family', due: today(), done: false, created: t },
      { id: 'r2', title: '提交季度报告', list: 'work', due: today(), flagged: true, done: false, created: t, notes: '附上用户调研数据' },
      { id: 'r3', title: '预约理发', list: 'reminders', done: false, created: t },
      { id: 'r4', title: '燕麦奶', list: 'shopping', done: false, created: t },
      { id: 'r5', title: '整理桌面文件', list: 'reminders', done: true, created: t - 86400000 },
      { id: 'r6', title: '准备周会材料', list: 'work', due: new Date(Date.now() + 86400000).toISOString().slice(0, 10), done: false, created: t },
    ];
  }
  const load = () => OS.store.get('reminders', null) || seed();
  let items = load();
  let saving = false;
  const save = () => {
    saving = true;
    OS.store.set('reminders', items);
    OS.emit('reminders');
    saving = false;
  };
  save();
  // another part of the system (Siri, widgets) changed the list
  OS.on('reminders', () => !saving && (items = load()));

  OS.registerApp({
    id: 'reminders', name: '提醒事项', icon: 'reminders', keywords: ['reminders', 'todo', '待办', 'tasks'], width: 820, height: 560, minWidth: 520, minHeight: 360, singleton: true,
    description: '记录待办事项，按时提醒。',
    menus: (win) => [{ title: '文件', items: [{ label: '新建提醒事项', key: '⌘N', action: () => win && win.state_.add() }] }],
    onKey(win, e) {
      if (OS.cmd(e) && e.code === 'KeyN') (e.preventDefault(), win.state_.add());
    },
    create(win) {
      const st = (win.state_ = { list: 'today', showDone: false });
      const sidebar = h('nav.side', { 'data-drag': '' });
      const main = h('div.rm-main');
      const toolbar = h('div.tbar', { 'data-drag': '' }, h('div.tb-spacer', { 'data-drag': '' }), h('div.tb-group', h('button.tb-btn', { title: '新建提醒事项', 'aria-label': '新建提醒事项', html: glyph('plus'), onclick: () => st.add() })));
      const root = h('div.app.reminders', h('div.split', sidebar, h('div.pane', toolbar, main)));
      win.body.appendChild(root);

      const SMART = [
        { id: 'today', name: '今天', g: 'calendar', color: '#007aff', filter: (r) => !r.done && r.due && r.due <= today() },
        { id: 'scheduled', name: '计划', g: 'calendar', color: '#ff3b30', filter: (r) => !r.done && r.due },
        { id: 'all', name: '全部', g: 'tray', color: '#3a3a3c', filter: (r) => !r.done },
        { id: 'flagged', name: '旗标', g: 'flag', color: '#ff9500', filter: (r) => !r.done && r.flagged },
        { id: 'completed', name: '已完成', g: 'check', color: '#8e8e93', filter: (r) => r.done },
      ];
      function renderSide() {
        sidebar.innerHTML = '';
        sidebar.append(h('div.side-top', { 'data-drag': '' }));
        const tiles = h('div.rm-tiles', ...SMART.map((s) => {
          const t = h('button.rm-tile' + (st.list === s.id ? '.on' : ''), { style: { '--c': s.color } }, h('span.rm-tile-ico', { html: glyph(s.g) }), h('b.rm-tile-n', items.filter(s.filter).length), h('span.rm-tile-name', s.name));
          t.onclick = () => ((st.list = s.id), render());
          return t;
        }));
        sidebar.append(tiles, h('div.sb-head', '我的列表'));
        LISTS.forEach((l) => {
          const row = h('div.sb-item' + (st.list === l.id ? '.active' : ''), h('span.rm-dot', { style: { background: l.color }, html: glyph('list') }), h('span.sb-label', l.name), h('span.sb-count', items.filter((r) => r.list === l.id && !r.done).length));
          row.onclick = () => ((st.list = l.id), render());
          sidebar.appendChild(row);
        });
      }
      function current() {
        const smart = SMART.find((s) => s.id === st.list);
        if (smart) return { name: smart.name, color: smart.color, items: items.filter(smart.filter), smart: true };
        const l = LISTS.find((x) => x.id === st.list);
        return { name: l.name, color: l.color, items: items.filter((r) => r.list === l.id && (st.showDone || !r.done)) };
      }
      function row(r) {
        const check = h('button.rm-check' + (r.done ? '.done' : ''), { 'aria-label': r.done ? '标记为未完成' : '标记为已完成', style: { '--c': (LISTS.find((l) => l.id === r.list) || LISTS[0]).color } });
        const title = h('div.rm-title', { contenteditable: 'true', spellcheck: 'false' }, r.title);
        const meta = h('div.rm-meta', r.due ? h('span' + (r.due < today() && !r.done ? '.late' : ''), r.due === today() ? '今天' : r.due) : null, r.notes ? h('span', r.notes) : null, st.list.length < 10 && SMART.some((s) => s.id === st.list) ? h('span', (LISTS.find((l) => l.id === r.list) || {}).name) : null);
        const flag = h('button.rm-flag' + (r.flagged ? '.on' : ''), { 'aria-label': '旗标', html: glyph('flag'), onclick: () => ((r.flagged = !r.flagged), save(), render()) });
        const info = h('button.rm-info', { 'aria-label': '详细信息', html: glyph('info'), onclick: (e) => details(r, e) });
        const el = h('div.rm-row' + (r.done ? '.done' : ''), check, h('div.rm-text', title, meta), flag, info);
        check.onclick = () => {
          r.done = !r.done;
          if (r.done) OS.sound.play('pop');
          el.classList.toggle('done', r.done);
          check.classList.toggle('done', r.done);
          save();
          setTimeout(render, r.done ? 700 : 0);
        };
        title.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            title.blur();
            st.add();
          }
          if (e.key === 'Backspace' && !title.textContent) {
            e.preventDefault();
            items = items.filter((x) => x !== r);
            save();
            render();
          }
        });
        title.addEventListener('blur', () => {
          const v = title.textContent.trim();
          if (!v) items = items.filter((x) => x !== r);
          else r.title = v;
          save();
          renderSide();
        });
        el.dataset.id = r.id;
        return el;
      }
      function details(r, e) {
        OS.contextMenu(e, [
          { head: '提醒日期' },
          { label: '今天', checked: r.due === today(), action: () => ((r.due = today()), save(), render()) },
          { label: '明天', action: () => ((r.due = new Date(Date.now() + 86400000).toISOString().slice(0, 10)), save(), render()) },
          { label: '下周', action: () => ((r.due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)), save(), render()) },
          { label: '无日期', checked: !r.due, action: () => ((r.due = null), save(), render()) },
          { sep: true },
          { label: '移到列表', submenu: LISTS.map((l) => ({ label: l.name, swatch: l.color, checked: r.list === l.id, action: () => ((r.list = l.id), save(), render()) })) },
          { sep: true },
          { label: '删除', danger: true, action: () => ((items = items.filter((x) => x !== r)), save(), render()) },
        ]);
      }
      function render() {
        renderSide();
        const c = current();
        main.innerHTML = '';
        main.append(
          h('div.rm-head', h('h1', { style: { color: c.color } }, c.name), h('b.rm-count', { style: { color: c.color } }, c.items.length)),
          !c.smart ? h('button.rm-showdone', { onclick: () => ((st.showDone = !st.showDone), render()) }, st.showDone ? '隐藏已完成' : `显示已完成（${items.filter((r) => r.list === st.list && r.done).length}）`) : null,
          h('div.rm-list', ...c.items.map(row)),
          !c.items.length ? h('div.rm-empty', st.list === 'completed' ? '没有已完成的提醒事项' : '没有提醒事项') : null,
          st.list !== 'completed' ? h('button.rm-add', { onclick: () => st.add() }, h('span', { html: glyph('plus') }), '新提醒事项') : null
        );
      }
      st.add = () => {
        const list = LISTS.some((l) => l.id === st.list) ? st.list : 'reminders';
        const r = { id: OS.uid(), title: '', list, done: false, created: Date.now(), due: st.list === 'today' ? today() : null, flagged: st.list === 'flagged' };
        items.push(r);
        render();
        const t = main.querySelector(`[data-id="${r.id}"] .rm-title`);
        t && t.focus();
      };
      const off = OS.on('reminders', () => !main.contains(document.activeElement) && render());
      win.on('close', off);
      render();
    },
  });
})();
