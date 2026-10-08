/* Calendar */
(function () {
  const { h, $$, glyph } = OS;
  const CALS = [
    { id: 'home', name: '家庭', color: '#007aff' },
    { id: 'work', name: '工作', color: '#ff9500' },
    { id: 'personal', name: '个人', color: '#af52de' },
    { id: 'holiday', name: '中国节假日', color: '#28cd41' },
  ];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  function seed() {
    const t = new Date();
    const e = (off, title, start, end, cal, extra = {}) => ({ id: OS.uid(), title, date: iso(addDays(t, off)), start, end, cal, color: CALS.find((c) => c.id === cal).color, ...extra });
    const y = t.getFullYear();
    return [
      e(0, '设计评审', '10:00', '11:00', 'work', { location: '会议室 4' }),
      e(0, '午餐', '12:30', '13:30', 'personal', { location: '园区咖啡厅' }),
      e(0, '健身', '18:30', '19:30', 'personal'),
      e(1, '产品发布彩排', '14:00', '16:00', 'work', { location: '剧院' }),
      e(2, '家庭晚餐', '19:00', '21:00', 'home'),
      e(3, '一对一沟通', '09:30', '10:00', 'work'),
      e(5, '徒步：翡翠湾', '08:00', '12:00', 'personal'),
      e(-2, '牙医预约', '15:00', '15:45', 'home'),
      e(7, '季度规划', '13:00', '17:00', 'work'),
      { id: 'h1', title: '元旦', date: `${y}-01-01`, allDay: true, cal: 'holiday', color: '#28cd41' },
      { id: 'h2', title: '劳动节', date: `${y}-05-01`, allDay: true, cal: 'holiday', color: '#28cd41' },
      { id: 'h3', title: '国庆节', date: `${y}-10-01`, allDay: true, cal: 'holiday', color: '#28cd41' },
      { id: 'h4', title: '圣诞节', date: `${y}-12-25`, allDay: true, cal: 'holiday', color: '#28cd41' },
    ];
  }
  let events = OS.store.get('calendar.events', null) || seed();
  const save = () => (OS.store.set('calendar.events', events), OS.emit('calendar'));
  save();

  // reminders for upcoming events (notification 5 minutes before start)
  const notified = new Set();
  setInterval(() => {
    const now = new Date();
    events.forEach((ev) => {
      if (ev.allDay || ev.date !== iso(now) || notified.has(ev.id)) return;
      const [hh, mm] = ev.start.split(':').map(Number);
      const diff = (hh * 60 + mm) - (now.getHours() * 60 + now.getMinutes());
      if (diff <= 5 && diff >= 0) {
        notified.add(ev.id);
        OS.notify({ app: 'calendar', title: ev.title, body: `${ev.start}–${ev.end}${ev.location ? ' · ' + ev.location : ''}` });
      }
    });
  }, 30000);

  OS.registerApp({
    id: 'calendar', name: '日历', icon: 'calendar', keywords: ['calendar', 'events', '日程', 'schedule'], width: 1000, height: 650, minWidth: 620, minHeight: 420, singleton: true,
    description: '安排日程、会议与提醒。',
    menus: (win) => [
      { title: '文件', items: [{ label: '新建日程', key: '⌘N', action: () => win && win.state_.newEvent() }] },
      { title: '显示', items: [
        ...[['day', '按日', '⌘1'], ['week', '按周', '⌘2'], ['month', '按月', '⌘3'], ['year', '按年', '⌘4']].map(([v, l, k]) => ({ label: l, key: k, checked: win && win.state_.view === v, action: () => win && win.state_.setView(v) })),
        { sep: true },
        { label: '前往今天', key: '⌘T', action: () => win && win.state_.today() },
      ] },
    ],
    onKey(win, e) {
      if (e.target.closest('input,textarea,[contenteditable]')) return;
      const st = win.state_;
      if (OS.cmd(e) && /^Digit[1-4]$/.test(e.code)) return e.preventDefault(), st.setView(['day', 'week', 'month', 'year'][+e.code.slice(-1) - 1]);
      if (OS.cmd(e) && e.code === 'KeyT') return e.preventDefault(), st.today();
      if (OS.cmd(e) && e.code === 'KeyN') return e.preventDefault(), st.newEvent();
      if (e.key === 'ArrowLeft') st.shift(-1);
      if (e.key === 'ArrowRight') st.shift(1);
      if ((e.key === 'Backspace' || e.key === 'Delete') && st.selected) st.remove(st.selected);
    },
    create(win) {
      const st = (win.state_ = { view: OS.store.get('calendar.view', 'month'), cursor: new Date(), hidden: new Set(), selected: null });
      const sidebar = h('nav.side', { 'data-drag': '' });
      const title = h('div.cal-title');
      const seg = h('div.tb-group.seg.text', ...[['day', '日'], ['week', '周'], ['month', '月'], ['year', '年']].map(([v, l]) => h('button.tb-btn', { dataset: { v }, onclick: () => st.setView(v) }, l)));
      const search = h('input.tb-search-input', { id: 'cal-search', type: 'search', placeholder: '搜索' });
      const toolbar = h('div.tbar', { 'data-drag': '' },
        h('div.tb-group', h('button.tb-btn', { title: '日历', 'aria-label': '日历', html: glyph('sidebar'), onclick: () => root.classList.toggle('no-sidebar') }), h('button.tb-btn', { title: '新建日程', 'aria-label': '新建日程', html: glyph('plus'), onclick: () => st.newEvent() })),
        h('div.tb-spacer', { 'data-drag': '' }),
        seg,
        h('div.tb-spacer', { 'data-drag': '' }),
        h('label.tb-search', h('span', { html: glyph('search') }), search)
      );
      const nav = h('div.cal-nav', title, h('div.cal-navbtns', h('button.tb-btn', { 'aria-label': '上一个', html: glyph('chevron-left'), onclick: () => st.shift(-1) }), h('button.cal-today', { onclick: () => st.today() }, '今天'), h('button.tb-btn', { 'aria-label': '下一个', html: glyph('chevron-right'), onclick: () => st.shift(1) })));
      const body = h('div.cal-body');
      const root = h('div.app.calendar', h('div.split', sidebar, h('div.pane', toolbar, nav, body)));
      win.body.appendChild(root);

      const visible = () => events.filter((e) => !st.hidden.has(e.cal) && (!st.q || (e.title + (e.location || '')).toLowerCase().includes(st.q)));
      const on = (d) => visible().filter((e) => e.date === iso(d)).sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || (a.start || '').localeCompare(b.start || ''));

      function mini() {
        const c = st.miniCursor || new Date(st.cursor);
        const first = new Date(c.getFullYear(), c.getMonth(), 1);
        const start = addDays(first, -first.getDay());
        const grid = h('div.mini-grid', ...WD.map((w) => h('span.mini-wd', w)));
        for (let i = 0; i < 42; i++) {
          const d = addDays(start, i);
          const cls = (d.getMonth() !== c.getMonth() ? '.dim' : '') + (iso(d) === iso(new Date()) ? '.today' : '') + (iso(d) === iso(st.cursor) ? '.sel' : '') + (on(d).length ? '.has' : '');
          const b = h('button.mini-d' + cls, d.getDate());
          b.onclick = () => ((st.cursor = d), (st.miniCursor = null), render());
          grid.appendChild(b);
        }
        return h('div.mini-cal',
          h('div.mini-head', h('b', `${c.getFullYear()}年${c.getMonth() + 1}月`), h('span', h('button', { 'aria-label': '上个月', html: glyph('chevron-left'), onclick: () => ((st.miniCursor = new Date(c.getFullYear(), c.getMonth() - 1, 1)), renderSide()) }), h('button', { 'aria-label': '下个月', html: glyph('chevron-right'), onclick: () => ((st.miniCursor = new Date(c.getFullYear(), c.getMonth() + 1, 1)), renderSide()) }))),
          grid
        );
      }
      function renderSide() {
        sidebar.innerHTML = '';
        sidebar.append(h('div.side-top', { 'data-drag': '' }), h('div.sb-head', 'iCloud'));
        CALS.forEach((c) => {
          const row = h('label.cal-check', h('input', { type: 'checkbox', id: 'cal-show-' + c.id, checked: !st.hidden.has(c.id), style: { '--c': c.color }, onchange: (e) => (e.target.checked ? st.hidden.delete(c.id) : st.hidden.add(c.id), render()) }), h('span', c.name));
          sidebar.appendChild(row);
        });
        sidebar.appendChild(mini());
      }

      function chip(ev) {
        const el = h('div.cal-chip' + (ev.allDay ? '.allday' : '') + (st.selected === ev.id ? '.sel' : ''), { style: { '--c': ev.color }, title: ev.title },
          ev.allDay ? null : h('span.cal-chip-dot'), h('span.cal-chip-t', ev.title), ev.allDay ? null : h('span.cal-chip-time', ev.start));
        el.onclick = (e) => {
          e.stopPropagation();
          st.selected = ev.id;
          editor(ev, el);
        };
        return el;
      }

      function monthView() {
        const c = st.cursor;
        const first = new Date(c.getFullYear(), c.getMonth(), 1);
        const start = addDays(first, -first.getDay());
        const weeks = Math.ceil((first.getDay() + new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()) / 7);
        const grid = h('div.cal-month', { style: { gridTemplateRows: `auto repeat(${weeks}, 1fr)` } }, ...WD.map((w) => h('div.cal-wd', '周' + w)));
        for (let i = 0; i < weeks * 7; i++) {
          const d = addDays(start, i);
          const evs = on(d);
          const cell = h('div.cal-cell' + (d.getMonth() !== c.getMonth() ? '.dim' : '') + (d.getDay() % 6 === 0 ? '.weekend' : ''),
            h('div.cal-date' + (iso(d) === iso(new Date()) ? '.today' : ''), d.getDate() === 1 ? `${d.getMonth() + 1}月${d.getDate()}日` : d.getDate()),
            ...evs.slice(0, 3).map(chip),
            evs.length > 3 ? h('div.cal-more', `还有 ${evs.length - 3} 项`) : null
          );
          cell.ondblclick = () => st.newEvent(d);
          cell.onclick = () => ((st.selected = null), $$('.cal-chip.sel', body).forEach((x) => x.classList.remove('sel')));
          grid.appendChild(cell);
        }
        return grid;
      }
      function timeView(days) {
        const start = days === 1 ? new Date(st.cursor) : addDays(st.cursor, -st.cursor.getDay());
        const head = h('div.cal-th', h('div.cal-gutter'), ...Array.from({ length: days }, (_, i) => {
          const d = addDays(start, i);
          return h('div.cal-thd' + (iso(d) === iso(new Date()) ? '.today' : ''), h('span', '周' + WD[d.getDay()]), h('b', d.getDate()));
        }));
        const allday = h('div.cal-allday', h('div.cal-gutter', '全天'), ...Array.from({ length: days }, (_, i) => h('div.cal-adcol', ...on(addDays(start, i)).filter((e) => e.allDay).map(chip))));
        const grid = h('div.cal-tgrid');
        const hours = h('div.cal-hours');
        for (let hh = 0; hh < 24; hh++) hours.appendChild(h('div.cal-hour', hh ? `${hh}:00` : ''));
        grid.appendChild(hours);
        for (let i = 0; i < days; i++) {
          const d = addDays(start, i);
          const col = h('div.cal-col' + (iso(d) === iso(new Date()) ? '.today' : ''));
          for (let hh = 0; hh < 24; hh++) col.appendChild(h('div.cal-slot', { dataset: { h: hh } }));
          on(d).filter((e) => !e.allDay).forEach((ev) => {
            const [sh, sm] = ev.start.split(':').map(Number);
            const [eh, em] = ev.end.split(':').map(Number);
            const top = (sh + sm / 60) * 48, height = Math.max(20, (eh + em / 60 - sh - sm / 60) * 48);
            const b = h('div.cal-block' + (st.selected === ev.id ? '.sel' : ''), { style: { top: top + 'px', height: height + 'px', '--c': ev.color } }, h('b', ev.title), h('small', `${ev.start}–${ev.end}`), ev.location ? h('small', ev.location) : null);
            b.onclick = (e) => (e.stopPropagation(), (st.selected = ev.id), editor(ev, b));
            col.appendChild(b);
          });
          if (iso(d) === iso(new Date())) {
            const n = new Date();
            col.appendChild(h('div.cal-now', { style: { top: (n.getHours() + n.getMinutes() / 60) * 48 + 'px' } }, h('span', OS.fmt.time(n))));
          }
          col.ondblclick = (e) => {
            const slot = e.target.closest('.cal-slot');
            if (slot) st.newEvent(d, +slot.dataset.h);
          };
          grid.appendChild(col);
        }
        const scroller = h('div.cal-tscroll', grid);
        setTimeout(() => (scroller.scrollTop = 7.5 * 48), 0);
        return h('div.cal-time.days-' + days, head, allday, scroller);
      }
      function yearView() {
        const y = st.cursor.getFullYear();
        return h('div.cal-year', ...Array.from({ length: 12 }, (_, m) => {
          const first = new Date(y, m, 1);
          const start = addDays(first, -first.getDay());
          const g = h('div.cy-grid', ...WD.map((w) => h('span.cy-wd', w)));
          for (let i = 0; i < 42; i++) {
            const d = addDays(start, i);
            g.appendChild(h('span.cy-d' + (d.getMonth() !== m ? '.dim' : '') + (iso(d) === iso(new Date()) ? '.today' : '') + (d.getMonth() === m && on(d).length ? '.has' : ''), d.getDate()));
          }
          const box = h('div.cy-month', h('b' + (m === new Date().getMonth() && y === new Date().getFullYear() ? '.cur' : ''), `${m + 1}月`), g);
          box.onclick = () => ((st.cursor = new Date(y, m, 1)), st.setView('month'));
          return box;
        }));
      }

      function render() {
        $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
        const c = st.cursor;
        title.innerHTML = '';
        if (st.view === 'year') title.append(h('b', `${c.getFullYear()}年`));
        else if (st.view === 'day') title.append(h('b', `${c.getFullYear()}年${c.getMonth() + 1}月${c.getDate()}日`), h('span', ' 星期' + WD[c.getDay()]));
        else title.append(h('b', `${c.getFullYear()}年`), h('span', `${c.getMonth() + 1}月`));
        body.innerHTML = '';
        body.appendChild(st.view === 'month' ? monthView() : st.view === 'week' ? timeView(7) : st.view === 'day' ? timeView(1) : yearView());
        renderSide();
      }
      st.render = render;
      st.setView = (v) => {
        st.view = v;
        OS.store.set('calendar.view', v);
        render();
      };
      st.today = () => ((st.cursor = new Date()), render());
      st.shift = (d) => {
        const c = new Date(st.cursor);
        if (st.view === 'month') c.setMonth(c.getMonth() + d, 1);
        else if (st.view === 'week') c.setDate(c.getDate() + 7 * d);
        else if (st.view === 'day') c.setDate(c.getDate() + d);
        else c.setFullYear(c.getFullYear() + d);
        st.cursor = c;
        render();
      };
      st.newEvent = (d = st.cursor, hour = 9) => {
        const ev = { id: OS.uid(), title: '新日程', date: iso(d), start: `${String(hour).padStart(2, '0')}:00`, end: `${String(Math.min(23, hour + 1)).padStart(2, '0')}:00`, cal: 'home', color: CALS[0].color };
        events.push(ev);
        save();
        st.selected = ev.id;
        render();
        const el = body.querySelector('.cal-chip.sel, .cal-block.sel');
        editor(ev, el, true);
      };
      st.remove = (id) => {
        events = events.filter((e) => e.id !== id);
        st.selected = null;
        save();
        render();
      };

      function editor(ev, anchor, fresh) {
        root.querySelector('.cal-pop')?.remove();
        const t = h('input.cal-in.big', { id: 'cal-ev-title', value: ev.title });
        const ad = h('input', { type: 'checkbox', id: 'cal-ev-allday', checked: !!ev.allDay });
        const date = h('input.cal-in', { id: 'cal-ev-date', type: 'date', value: ev.date });
        const s = h('input.cal-in', { id: 'cal-ev-start', type: 'time', value: ev.start || '09:00' });
        const e2 = h('input.cal-in', { id: 'cal-ev-end', type: 'time', value: ev.end || '10:00' });
        const loc = h('input.cal-in', { id: 'cal-ev-loc', placeholder: '添加位置', value: ev.location || '' });
        const notes = h('textarea.cal-in', { id: 'cal-ev-notes', placeholder: '添加备注', rows: 2 });
        notes.value = ev.notes || '';
        const cal = h('select.cal-in', { id: 'cal-ev-cal' }, ...CALS.map((c) => h('option', { value: c.id, selected: c.id === ev.cal }, c.name)));
        const pop = h('div.cal-pop.glass',
          t,
          h('div.cal-prow', h('label', ad, ' 全天')),
          h('div.cal-prow', date),
          h('div.cal-prow.times', s, h('span', '至'), e2),
          h('div.cal-prow', cal),
          h('div.cal-prow', loc),
          h('div.cal-prow', notes),
          h('div.cal-pbtns', h('button.btn', { onclick: () => (pop.remove(), st.remove(ev.id)) }, '删除'), h('button.btn.primary', { onclick: commit }, '完成'))
        );
        function commit() {
          Object.assign(ev, { title: t.value.trim() || '新日程', allDay: ad.checked, date: date.value || ev.date, start: s.value, end: e2.value < s.value ? s.value : e2.value, location: loc.value, notes: notes.value, cal: cal.value, color: CALS.find((c) => c.id === cal.value).color });
          save();
          pop.remove();
          if (ev.date) st.cursor = parse(ev.date);
          render();
        }
        pop.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') commit();
          if (e.key === 'Escape') pop.remove();
        });
        root.appendChild(pop);
        const r = (anchor || body).getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        let x = (r.right - rr.left) / OS.scale + 8, y = (r.top - rr.top) / OS.scale - 20;
        if (x + 280 > rr.width / OS.scale) x = (r.left - rr.left) / OS.scale - 290;
        y = Math.max(50, Math.min(y, rr.height / OS.scale - 380));
        Object.assign(pop.style, { left: Math.max(8, x) + 'px', top: y + 'px' });
        setTimeout(() => (t.focus(), fresh && t.select()), 30);
        const outside = (e) => {
          if (!pop.contains(e.target)) {
            document.removeEventListener('pointerdown', outside, true);
            if (pop.isConnected) commit();
          }
        };
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
      }
      search.addEventListener('input', () => ((st.q = search.value.trim().toLowerCase()), render()));
      search.addEventListener('keydown', (e) => e.stopPropagation());
      const timer = setInterval(() => st.view !== 'month' && st.view !== 'year' && !root.querySelector('.cal-pop') && render(), 60000);
      win.on('close', () => clearInterval(timer));
      render();
    },
  });
})();
