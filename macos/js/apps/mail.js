/* Mail */
(function () {
  const { h, $$, glyph } = OS;
  const ago = (hrs) => Date.now() - hrs * 3600000;
  function seed() {
    return [
      { id: 'm1', box: 'inbox', from: 'Apple', addr: 'news@apple.com', subject: '欢迎使用 macOS Tahoe', preview: '认识全新的 Liquid Glass 设计……', body: '你好，\n\n欢迎使用 macOS Tahoe。全新的 Liquid Glass 设计让菜单栏、程序坞和窗口都变得更通透，界面元素会折射并反射周围的内容。\n\n· 在“系统设置 > 外观”中选择浅色、深色或自动。\n· 在“控制中心”里调整显示器亮度与声音。\n· 用聚焦搜索快速打开应用、文件和计算结果。\n\n祝使用愉快！\nApple', t: ago(1), unread: true, vip: true },
      { id: 'm2', box: 'inbox', from: '林晓', addr: 'linxiao@icloud.com', subject: '周末徒步计划', preview: '我把路线发给你了，周六早上八点出发……', body: '嗨，\n\n我把路线发给你了：从翡翠湾停车场出发，沿湖走到瀑布，往返大约 8 公里。\n\n周六早上八点出发，记得带水和防晒。\n\n林晓', t: ago(5), unread: true },
      { id: 'm3', box: 'inbox', from: '陈默', addr: 'chenmo@icloud.com', subject: '回复：设计稿反馈', preview: '整体方向很好，有三点小建议……', body: '整体方向很好，有三点小建议：\n\n1. 菜单栏文字在浅色墙纸上需要更深一点；\n2. 程序坞放大时边缘可以更柔和；\n3. 通知横幅的圆角和窗口保持一致。\n\n陈默', t: ago(26), flagged: true },
      { id: 'm4', box: 'inbox', from: 'iCloud', addr: 'noreply@icloud.com', subject: '你的 iCloud 储存空间', preview: '你已使用 50 GB 中的 12.4 GB……', body: '你已使用 50 GB 中的 12.4 GB。照片占用 8.1 GB，iCloud 云盘占用 3.2 GB，备份占用 1.1 GB。', t: ago(50) },
      { id: 'm5', box: 'inbox', from: '周远', addr: 'zhouyuan@me.com', subject: '分享会议程', preview: '下周四下午两点，大概一个半小时……', body: '下周四下午两点，大概一个半小时。你来讲开场十分钟可以吗？\n\n议程：\n- 开场\n- 设计系统更新\n- 问答', t: ago(80) },
      { id: 'm6', box: 'sent', from: '我', addr: 'guest@icloud.com', to: '陈默', subject: '设计稿', preview: '附件是最新的设计稿……', body: '附件是最新的设计稿，放在桌面“项目”文件夹里了。', t: ago(28) },
    ];
  }
  let mails = OS.store.get('mail.list', null) || seed();
  const save = () => (OS.store.set('mail.list', mails), OS.emit('mail'), updateBadge());
  const BOXES = [
    { id: 'inbox', name: '收件箱', g: 'tray' },
    { id: 'vip', name: 'VIP', g: 'star' },
    { id: 'flagged', name: '旗标', g: 'flag' },
    { id: 'drafts', name: '草稿', g: 'doc' },
    { id: 'sent', name: '已发送', g: 'paperplane' },
    { id: 'archive', name: '归档', g: 'archive' },
    { id: 'trash', name: '废纸篓', g: 'trash' },
  ];
  function updateBadge() {
    OS.dock && OS.dock.badge('mail', mails.filter((m) => m.box === 'inbox' && m.unread).length);
  }
  OS.on('windows', () => setTimeout(updateBadge, 0));
  OS.on('started', () => setTimeout(updateBadge, 500));

  OS.registerApp({
    id: 'mail', name: '邮件', icon: 'mail', keywords: ['mail', 'email', '邮件', '邮箱'], width: 1040, height: 640, minWidth: 640, minHeight: 380, singleton: true,
    description: '在一个地方管理你的所有电子邮件账户。',
    menus: (win) => [
      { title: '文件', items: [{ label: '新邮件', key: '⌘N', action: () => compose() }] },
      { title: '邮件', items: [
        { label: '回复', key: '⌘R', disabled: !win || !win.state_.sel, action: () => win.state_.reply() },
        { label: '转发', key: '⇧⌘F', disabled: !win || !win.state_.sel, action: () => win.state_.forward() },
        { sep: true },
        { label: '标记为未读', disabled: !win || !win.state_.sel, action: () => win.state_.toggleUnread() },
        { label: '旗标', disabled: !win || !win.state_.sel, action: () => win.state_.flag() },
        { label: '归档', key: '⌃⌘A', disabled: !win || !win.state_.sel, action: () => win.state_.move('archive') },
      ] },
    ],
    onKey(win, e) {
      if (e.target.closest('input,textarea')) return;
      const st = win.state_;
      if (OS.cmd(e) && e.code === 'KeyN') return e.preventDefault(), compose();
      if (OS.cmd(e) && e.code === 'KeyR') return e.preventDefault(), st.reply();
      if (e.key === 'Backspace' || e.key === 'Delete') st.move('trash');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') st.step(e.key === 'ArrowDown' ? 1 : -1);
    },
    create(win) {
      const st = (win.state_ = { box: 'inbox', sel: null, q: '' });
      const sidebar = h('nav.side', { 'data-drag': '' });
      const list = h('div.ml-list');
      const reader = h('div.ml-reader');
      const search = h('input.tb-search-input', { id: 'mail-search', type: 'search', placeholder: '搜索' });
      const tb = (g, l, fn) => h('button.tb-btn', { title: l, 'aria-label': l, html: glyph(g), onclick: fn });
      const toolbar = h('div.tbar', { 'data-drag': '' },
        h('div.ml-boxtitle'),
        h('div.tb-spacer', { 'data-drag': '' }),
        h('div.tb-group', tb('mail', '收取邮件', () => fetchMail()), tb('compose', '新邮件', () => compose())),
        h('div.tb-group', tb('archive', '归档', () => st.move('archive')), tb('trash', '删除', () => st.move('trash')), tb('reply', '回复', () => st.reply()), tb('forward', '转发', () => st.forward()), tb('flag', '旗标', () => st.flag())),
        h('label.tb-search', h('span', { html: glyph('search') }), search)
      );
      const root = h('div.app.mail', h('div.split', sidebar, h('div.pane', toolbar, h('div.ml-body', list, reader))));
      win.body.appendChild(root);

      const inBox = (m) => (st.box === 'vip' ? m.vip && m.box === 'inbox' : st.box === 'flagged' ? m.flagged && m.box !== 'trash' : m.box === st.box);
      const visible = () => mails.filter(inBox).filter((m) => !st.q || (m.from + m.subject + m.body).toLowerCase().includes(st.q)).sort((a, b) => b.t - a.t);

      function renderSide() {
        sidebar.innerHTML = '';
        sidebar.append(h('div.side-top', { 'data-drag': '' }), h('div.sb-head', '个人收藏'));
        BOXES.forEach((b) => {
          const n = b.id === 'inbox' ? mails.filter((m) => m.box === 'inbox' && m.unread).length : 0;
          const row = h('div.sb-item' + (st.box === b.id ? '.active' : ''), { dataset: { box: b.id } }, h('span.sb-ico', { html: glyph(b.g) }), h('span.sb-label', b.name), n ? h('span.sb-count', n) : null);
          row.onclick = () => ((st.box = b.id), (st.sel = null), render());
          sidebar.appendChild(row);
          if (b.id === 'flagged') sidebar.appendChild(h('div.sb-head', '邮箱'));
        });
      }
      function renderList() {
        list.innerHTML = '';
        const v = visible();
        root.querySelector('.ml-boxtitle').innerHTML = `<b>${BOXES.find((b) => b.id === st.box).name}</b><small>${v.length} 封邮件${st.box === 'inbox' ? `，${v.filter((m) => m.unread).length} 封未读` : ''}</small>`;
        if (!v.length) list.appendChild(h('div.ml-empty', '没有邮件'));
        v.forEach((m) => {
          const row = h('div.ml-row' + (st.sel === m.id ? '.on' : '') + (m.unread ? '.unread' : ''), { tabindex: 0 },
            h('span.ml-dot'),
            h('div.ml-row-body',
              h('div.ml-row-top', h('b', st.box === 'sent' ? m.to || m.from : m.from), h('small', OS.fmt.relative(m.t))),
              h('div.ml-subj', m.flagged ? h('span.ml-flag', { html: glyph('flag') }) : null, m.subject),
              h('div.ml-prev', m.preview)
            )
          );
          row.onclick = () => st.open(m.id);
          row.oncontextmenu = (e) => (st.open(m.id), OS.contextMenu(e, [{ label: '回复', action: st.reply }, { label: '转发', action: st.forward }, { sep: true }, { label: m.unread ? '标记为已读' : '标记为未读', action: st.toggleUnread }, { label: '旗标', action: st.flag }, { sep: true }, { label: '归档', action: () => st.move('archive') }, { label: '删除', action: () => st.move('trash') }]));
          list.appendChild(row);
        });
      }
      function renderReader() {
        reader.innerHTML = '';
        const m = mails.find((x) => x.id === st.sel);
        if (!m) return reader.appendChild(h('div.ml-none', h('span', { html: glyph('mail') }), '未选择邮件'));
        const initials = (m.from || '?').slice(0, 1);
        reader.append(
          h('div.ml-rhead',
            h('div.ml-av', initials),
            h('div.ml-rmeta', h('b', m.from), h('div.ml-subject', m.subject), h('small', `收件人：${m.to || OS.user.name}`)),
            h('small.ml-date', OS.fmt.dateTime(new Date(m.t)))
          ),
          h('div.ml-text', m.body)
        );
      }
      function render() {
        renderSide();
        renderList();
        renderReader();
      }
      st.open = (id) => {
        st.sel = id;
        const m = mails.find((x) => x.id === id);
        if (m && m.unread) (m.unread = false), save();
        render();
      };
      st.step = (d) => {
        const v = visible();
        const i = v.findIndex((m) => m.id === st.sel);
        const n = v[Math.max(0, Math.min(v.length - 1, i + d))];
        n && st.open(n.id);
      };
      st.move = (box) => {
        const m = mails.find((x) => x.id === st.sel);
        if (!m) return;
        if (box === 'trash' && m.box === 'trash') mails = mails.filter((x) => x !== m);
        else m.box = box;
        if (box === 'trash') OS.sound.play('trash');
        st.sel = null;
        save();
        render();
      };
      st.flag = () => {
        const m = mails.find((x) => x.id === st.sel);
        if (m) (m.flagged = !m.flagged), save(), render();
      };
      st.toggleUnread = () => {
        const m = mails.find((x) => x.id === st.sel);
        if (m) (m.unread = !m.unread), save(), render();
      };
      st.reply = () => {
        const m = mails.find((x) => x.id === st.sel);
        if (m) compose({ to: m.addr || m.from, subject: '回复：' + m.subject.replace(/^回复：/, ''), body: `\n\n在 ${OS.fmt.dateTime(new Date(m.t))}，${m.from} 写道：\n> ${m.body.split('\n').join('\n> ')}` });
      };
      st.forward = () => {
        const m = mails.find((x) => x.id === st.sel);
        if (m) compose({ subject: '转发：' + m.subject, body: `\n\n---------- 转发的邮件 ----------\n发件人：${m.from}\n主题：${m.subject}\n\n${m.body}` });
      };
      function fetchMail() {
        OS.toast('正在收取邮件…', 'reload');
        setTimeout(() => {
          if (mails.some((m) => m.id === 'm-new')) return OS.toast('没有新邮件');
          mails.push({ id: 'm-new', box: 'inbox', from: 'App Store', addr: 'no_reply@email.apple.com', subject: '本周精选 App', preview: '为你挑选的创意工具与游戏……', body: '本周精选：\n\n· Pixelmator Pro — 专业图像编辑\n· Things 3 — 优雅的任务管理\n· Final Cut Pro — 视频剪辑\n\n在 Mac App Store 中查看更多。', t: Date.now(), unread: true });
          save();
          render();
          OS.notify({ app: 'mail', title: 'App Store', body: '本周精选 App' });
        }, 1200);
      }
      search.addEventListener('input', () => ((st.q = search.value.trim().toLowerCase()), renderList()));
      search.addEventListener('keydown', (e) => e.stopPropagation());
      const off = OS.on('mail', render);
      win.on('close', off);
      st.sel = visible()[0]?.id;
      if (st.sel) st.open(st.sel);
      else render();
    },
  });

  /* compose window */
  function compose(pre = {}) {
    return OS.launch('mailcompose', pre);
  }
  OS.registerApp({
    id: 'mailcompose', name: '新邮件', icon: 'mail', hidden: true, noDock: true, alwaysNew: true, width: 620, height: 480, minWidth: 420, minHeight: 300,
    create(win, pre) {
      const to = h('input.mc-in', { id: 'mc-to-' + win.id, value: pre.to || '', placeholder: '' });
      const subj = h('input.mc-in', { id: 'mc-subj-' + win.id, value: pre.subject || '', placeholder: '' });
      const body = h('textarea.mc-body', { id: 'mc-body-' + win.id });
      body.value = pre.body || '';
      const send = h('button.tb-btn.mc-send', { title: '发送', 'aria-label': '发送', html: glyph('paperplane') });
      const root = h('div.app.mailcompose',
        h('div.tbar', { 'data-drag': '' }, h('div.tb-title', '新邮件'), h('div.tb-spacer', { 'data-drag': '' }), send),
        h('div.mc-field', h('label', { for: to.id }, '收件人：'), to),
        h('div.mc-field', h('label', '抄送：'), h('input.mc-in', { id: 'mc-cc-' + win.id })),
        h('div.mc-field', h('label', { for: subj.id }, '主题：'), subj),
        body
      );
      win.body.appendChild(root);
      const update = () => win.setTitle(subj.value || '新邮件');
      subj.addEventListener('input', update);
      [to, subj, body].forEach((x) => x.addEventListener('keydown', (e) => e.stopPropagation()));
      send.onclick = () => {
        if (!to.value.trim()) return OS.alert({ title: '这封邮件没有收件人。', message: '请至少输入一个收件人。', icon: OS.icon('mail'), win });
        mails.push({ id: OS.uid(), box: 'sent', from: '我', to: to.value.trim(), subject: subj.value || '（无主题）', preview: body.value.trim().slice(0, 40), body: body.value, t: Date.now() });
        save();
        OS.sound.play('sent');
        win.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-60px) scale(.8)', opacity: 0 }], { duration: 380, easing: 'ease-in' }).onfinish = () => OS.wm.close(win, true);
      };
      win.beforeClose = () => {
        if (body.value.trim() || subj.value.trim()) {
          mails.push({ id: OS.uid(), box: 'drafts', from: '我', to: to.value, subject: subj.value || '（无主题）', preview: body.value.slice(0, 40), body: body.value, t: Date.now() });
          save();
          OS.toast('已存入草稿');
        }
        return true;
      };
      setTimeout(() => (pre.to ? body : to).focus(), 60);
      update();
    },
  });
})();
