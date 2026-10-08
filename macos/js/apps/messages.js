/* Messages */
(function () {
  const { h, $$, glyph } = OS;

  const CONTACTS = [
    { id: 'c1', name: '林晓', grad: 'linear-gradient(135deg,#f6d365,#fda085)', phone: '138 0013 8000', email: 'linxiao@icloud.com' },
    { id: 'c2', name: '陈默', grad: 'linear-gradient(135deg,#84fab0,#8fd3f4)', phone: '139 2233 4455', email: 'chenmo@icloud.com' },
    { id: 'c3', name: '设计组', grad: 'linear-gradient(135deg,#a18cd1,#fbc2eb)', group: true },
    { id: 'c4', name: '妈妈', grad: 'linear-gradient(135deg,#ff9a9e,#fecfef)', phone: '137 6666 8888' },
    { id: 'c5', name: '周远', grad: 'linear-gradient(135deg,#667eea,#764ba2)', phone: '186 1234 5678', email: 'zhouyuan@me.com' },
  ];
  OS.contactsSeed = CONTACTS;
  const ago = (m) => Date.now() - m * 60000;
  function seed() {
    return {
      c1: [
        { me: false, text: '新系统用起来怎么样？', t: ago(130) },
        { me: true, text: '很顺滑，玻璃质感太好看了', t: ago(128) },
        { me: false, text: '周末一起去湖边拍日落吧 🌅'.replace(' 🌅', ''), t: ago(60) },
      ],
      c2: [
        { me: true, text: '那份设计稿我放在桌面的“项目”文件夹里了', t: ago(60 * 26) },
        { me: false, text: '收到，晚点看', t: ago(60 * 25) },
      ],
      c3: [
        { me: false, from: '周远', text: '菜单栏的对比度需要再调一下', t: ago(60 * 50) },
        { me: false, from: '林晓', text: '我做了深色模式的版本', t: ago(60 * 49) },
        { me: true, text: '好，明天评审一起看', t: ago(60 * 48) },
      ],
      c4: [{ me: false, text: '降温了，记得多穿点', t: ago(60 * 72) }],
      c5: [{ me: false, text: '下周的分享会你来讲开场？', t: ago(60 * 120) }],
    };
  }
  let threads = OS.store.get('messages.threads', null) || seed();
  const save = () => (OS.store.set('messages.threads', threads), OS.emit('messages'));

  const REPLIES = [
    [/你好|hi|hello|嗨/i, ['你好呀！', '嗨～在忙吗？']],
    [/吃|饭|午餐|晚餐/, ['好呀，去哪家？', '我想吃那家拉面', '今天不行，改天约']],
    [/周末|日落|拍/, ['周六傍晚六点湖边见', '记得带三脚架']],
    [/谢谢|感谢/, ['不客气～', '小事一桩']],
    [/[?？]$/, ['我想想……', '应该可以', '好问题，我晚点回你']],
    [/./, ['哈哈哈', '好的👌'.replace('👌', ''), '收到', '明白了', '真的吗？', '太棒了！']],
  ];
  function autoReply(cid, text) {
    const c = CONTACTS.find((x) => x.id === cid);
    const pool = REPLIES.find(([re]) => re.test(text))[1];
    const reply = pool[Math.floor(Math.random() * pool.length)];
    return { reply, from: c.group ? ['林晓', '周远', '陈默'][Math.floor(Math.random() * 3)] : null };
  }

  /* an incoming message shortly after login */
  OS.on('started', () => {
    if (OS.store.get('messages.greeted', false)) return;
    OS.store.set('messages.greeted', true);
    setTimeout(() => receive('c1', '今晚的发布会你看了吗？新 Mac 太漂亮了'), 14000);
  });
  function receive(cid, text, from) {
    threads[cid] = threads[cid] || [];
    threads[cid].push({ me: false, text, from, t: Date.now() });
    const unread = OS.store.get('messages.unread', {});
    const w = OS.wm.appWindows('messages')[0];
    const active = w && w.state_ && w.state_.cur === cid && OS.wm.focused === w;
    if (!active) {
      unread[cid] = (unread[cid] || 0) + 1;
      OS.store.set('messages.unread', unread);
      const c = CONTACTS.find((x) => x.id === cid);
      OS.notify({ app: 'messages', title: c.name, body: (from ? from + '：' : '') + text, action: () => OS.launch('messages', { cid }) });
    }
    save();
    updateBadge();
  }
  function updateBadge() {
    const n = Object.values(OS.store.get('messages.unread', {})).reduce((a, b) => a + b, 0);
    OS.dock && OS.dock.badge('messages', n);
  }
  OS.on('windows', () => setTimeout(updateBadge, 0));

  OS.registerApp({
    id: 'messages', name: '信息', icon: 'messages', keywords: ['messages', 'imessage', 'chat', '短信', '聊天'], width: 860, height: 580, minWidth: 520, minHeight: 360, singleton: true,
    description: '用 iMessage 信息与朋友保持联系。',
    reopen(win, args) {
      if (args.cid) win.state_.open(args.cid);
    },
    menus: (win) => [{ title: '文件', items: [{ label: '新信息', key: '⌘N', action: () => win && win.state_.compose() }, { sep: true }, { label: '删除对话…', disabled: !win, action: () => win && win.state_.del() }] }],
    create(win, args) {
      const st = (win.state_ = { cur: args.cid || OS.store.get('messages.cur', 'c1'), q: '' });
      const list = h('div.ms-list');
      const search = h('input.ms-search', { id: 'messages-search', type: 'search', placeholder: '搜索' });
      const side = h('nav.side.ms-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }, h('button.tb-btn.ms-compose', { title: '新信息', 'aria-label': '新信息', html: glyph('compose'), onclick: () => st.compose() })), h('label.side-search', h('span', { html: glyph('search') }), search), list);
      const head = h('div.ms-head', { 'data-drag': '' });
      const conv = h('div.ms-conv');
      const input = h('input.ms-input', { id: 'messages-input', type: 'text', placeholder: 'iMessage 信息', autocomplete: 'off' });
      const send = h('button.ms-send', { 'aria-label': '发送', html: glyph('arrow-up-circle') });
      const bar = h('div.ms-bar', h('button.ms-plus', { 'aria-label': '更多', html: glyph('plus'), onclick: (e) => OS.contextMenu(e, [{ label: '照片', glyph: 'photo', action: () => sendText('[照片]') }, { label: '表情贴图', glyph: 'sparkles', action: () => sendText('(•̀ᴗ•́)و') }, { label: '位置', glyph: 'location', action: () => sendText('我的位置：太浩湖南岸') }]) }), h('div.ms-field', input, send));
      const root = h('div.app.messages', h('div.split', side, h('div.pane.ms-pane', head, conv, bar)));
      win.body.appendChild(root);

      const avatar = (c, size = 40) => h('div.ms-av', { style: { background: c.grad, width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' } }, c.group ? h('span', { html: glyph('person-2') }) : c.name.slice(-1));
      function renderList() {
        list.innerHTML = '';
        const unread = OS.store.get('messages.unread', {});
        CONTACTS.filter((c) => !st.q || c.name.includes(st.q) || (threads[c.id] || []).some((m) => m.text.includes(st.q)))
          .sort((a, b) => ((threads[b.id] || []).slice(-1)[0]?.t || 0) - ((threads[a.id] || []).slice(-1)[0]?.t || 0))
          .forEach((c) => {
            const last = (threads[c.id] || []).slice(-1)[0];
            const row = h('div.ms-row' + (st.cur === c.id ? '.on' : ''),
              unread[c.id] ? h('span.ms-unread') : h('span.ms-unread.off'),
              avatar(c),
              h('div.ms-row-txt', h('div.ms-row-top', h('b', c.name), h('small', last ? OS.fmt.relative(last.t) : '')), h('div.ms-row-prev', last ? (last.me ? '' : last.from ? last.from + '：' : '') + last.text : ''))
            );
            row.onclick = () => st.open(c.id);
            row.oncontextmenu = (e) => OS.contextMenu(e, [{ label: '删除对话', action: () => st.del(c.id) }, { label: '标记为未读', action: () => { const u = OS.store.get('messages.unread', {}); u[c.id] = 1; OS.store.set('messages.unread', u); renderList(); updateBadge(); } }]);
            list.appendChild(row);
          });
      }
      function renderConv(animateLast) {
        const c = CONTACTS.find((x) => x.id === st.cur);
        head.innerHTML = '';
        conv.innerHTML = '';
        if (!c) return;
        head.append(h('div.ms-head-c', avatar(c, 28), h('b', c.name)), h('div.ms-head-btns', h('button.tb-btn', { 'aria-label': 'FaceTime 视频', title: 'FaceTime 视频', html: glyph('video'), onclick: () => OS.launch('facetime', { call: c.name }) }), h('button.tb-btn', { 'aria-label': '详细信息', html: glyph('info'), onclick: () => OS.launch('contacts', { id: c.id }) })));
        const msgs = threads[c.id] || [];
        let lastT = 0;
        msgs.forEach((m, i) => {
          if (m.t - lastT > 3600000) conv.appendChild(h('div.ms-time', OS.fmt.relative(m.t) === '现在' ? '现在' : `${OS.fmt.relative(m.t)} ${new Date(m.t).toDateString() === new Date().toDateString() ? '' : OS.fmt.time(new Date(m.t))}`.trim()));
          lastT = m.t;
          const next = msgs[i + 1];
          const tail = !next || next.me !== m.me || next.t - m.t > 60000;
          const b = h('div.ms-bubble' + (m.me ? '.me' : '.them') + (tail ? '.tail' : ''), m.text);
          b.ondblclick = () => {
            m.tap = m.tap ? null : '♥';
            save();
            renderConv();
          };
          const wrap = h('div.ms-msg' + (m.me ? '.me' : ''), m.from && !m.me ? h('div.ms-from', m.from) : null, b, m.tap ? h('span.ms-tap', { html: glyph('heart-fill') }) : null);
          if (animateLast && i === msgs.length - 1) wrap.classList.add('pop');
          conv.appendChild(wrap);
        });
        const lastMe = msgs.length && msgs[msgs.length - 1].me;
        if (lastMe) conv.appendChild(h('div.ms-status', st.typing ? '' : '已送达'));
        if (st.typing === c.id) conv.appendChild(h('div.ms-msg', h('div.ms-bubble.them.tail.typing', h('i'), h('i'), h('i'))));
        conv.scrollTop = conv.scrollHeight;
        win.setTitle(c.name);
      }
      function sendText(text) {
        const cid = st.cur;
        threads[cid] = threads[cid] || [];
        threads[cid].push({ me: true, text, t: Date.now() });
        save();
        OS.sound.play('sent');
        renderConv(true);
        renderList();
        // simulated reply
        const { reply, from } = autoReply(cid, text);
        setTimeout(() => {
          st.typing = cid;
          st.cur === cid && renderConv();
        }, 1200);
        setTimeout(() => {
          st.typing = null;
          receive(cid, reply, from);
          if (st.cur === cid) {
            renderConv(true);
            if (OS.wm.focused === win) OS.sound.play('message');
          }
          renderList();
        }, 2600 + Math.random() * 1600);
      }
      st.open = (cid) => {
        st.cur = cid;
        OS.store.set('messages.cur', cid);
        const u = OS.store.get('messages.unread', {});
        delete u[cid];
        OS.store.set('messages.unread', u);
        updateBadge();
        renderList();
        renderConv();
        input.focus();
      };
      st.compose = () => {
        OS.alert({ title: '新信息', message: '收件人：' + CONTACTS.map((c) => c.name).join('、'), icon: OS.icon('messages'), input: { placeholder: '输入联系人姓名' }, buttons: [{ label: '取消' }, { label: '开始', primary: true }], win }).then((v) => {
          const c = v && CONTACTS.find((x) => x.name.includes(v.trim()));
          if (c) st.open(c.id);
          else if (v) OS.toast('未找到联系人');
        });
      };
      st.del = async (cid = st.cur) => {
        const r = await OS.alert({ title: '确定要删除此对话吗？', message: '此操作无法撤销。', icon: OS.icon('messages'), buttons: [{ label: '取消' }, { label: '删除', primary: true }], destructive: true, win });
        if (r === 1) {
          threads[cid] = [];
          save();
          renderConv();
          renderList();
        }
      };
      const go = () => {
        const v = input.value.trim();
        if (!v) return;
        input.value = '';
        sendText(v);
      };
      send.onclick = go;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') go();
      });
      search.addEventListener('input', () => ((st.q = search.value.trim()), renderList()));
      search.addEventListener('keydown', (e) => e.stopPropagation());
      const off = OS.on('messages', () => (renderList(), !st.typing && renderConv()));
      win.on('close', off);
      win.on('focus', () => {
        const u = OS.store.get('messages.unread', {});
        if (u[st.cur]) st.open(st.cur);
      });
      st.open(st.cur);
    },
  });
})();
