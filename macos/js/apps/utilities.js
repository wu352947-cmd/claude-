/* App Store, FaceTime, Contacts, Activity Monitor, Freeform, Voice Memos, Stocks */
(function () {
  const { h, $$, glyph } = OS;
  const wm = OS.wm;

  /* ======================================================================
     App Store
     ====================================================================== */
  const STORE = [
    { id: 'ext-word', name: 'Microsoft Word', icon: 'word', cat: '效率', sub: '创建、编辑与共享文稿', rating: 4.6 },
    { id: 'ext-excel', name: 'Microsoft Excel', icon: 'excel', cat: '效率', sub: '电子表格与数据分析', rating: 4.6 },
    { id: 'ext-ppt', name: 'Microsoft PowerPoint', icon: 'powerpoint', cat: '效率', sub: '演示文稿', rating: 4.5 },
    { id: 'ext-vscode', name: 'Visual Studio Code', icon: 'vscode', cat: '开发', sub: '代码编辑器', rating: 4.8 },
    { id: 'ext-resolve', name: 'DaVinci Resolve', icon: 'resolve', cat: '创作', sub: '专业剪辑与调色', rating: 4.7 },
    { id: 'ext-spotify', name: 'Spotify', icon: 'spotify', cat: '音乐', sub: '音乐与播客', rating: 4.4 },
    { id: 'ext-chrome', name: 'Google Chrome', icon: 'chrome', cat: '工具', sub: '网页浏览器', rating: 4.3 },
    { id: 'chess', name: '国际象棋', icon: 'chess', cat: '游戏', sub: '经典棋盘游戏', rating: 4.2, builtIn: true },
    { id: 'freeform', name: '无边记', icon: 'freeform', cat: '创作', sub: '无限画布上的头脑风暴', rating: 4.5, builtIn: true },
    { id: 'stocks', name: '股市', icon: 'stocks', cat: '财务', sub: '追踪行情', rating: 4.1, builtIn: true },
    { id: 'voicememos', name: '语音备忘录', icon: 'voicememos', cat: '工具', sub: '录制音频', rating: 4.3, builtIn: true },
    { id: 'ext-books', name: '图书', icon: 'books', cat: '阅读', sub: '读书与有声书', rating: 4.6 },
  ];
  OS.registerApp({
    id: 'appstore', name: 'App Store', icon: 'appstore', keywords: ['app store', 'store', '应用商店', '下载'], width: 1040, height: 660, minWidth: 640, minHeight: 420, singleton: true,
    description: '发现并下载 Mac App。',
    create(win) {
      const st = { tab: 'discover', installed: OS.store.get('appstore.installed', {}) };
      const side = h('nav.side', { 'data-drag': '' });
      const main = h('div.as-main');
      const root = h('div.app.appstore', h('div.split', side, h('div.pane', h('div.tbar', { 'data-drag': '' }), main)));
      win.body.appendChild(root);
      const TABS = [['discover', '探索', 'star'], ['create', '创作', 'paintbrush'], ['work', '工作', 'paperplane'], ['play', '游戏', 'gamecontroller'], ['develop', '开发', 'terminal'], ['categories', '类别', 'grid'], ['updates', '更新', 'arrow-up-circle']];
      function renderSide() {
        side.innerHTML = '';
        side.append(h('div.side-top', { 'data-drag': '' }), h('label.side-search', h('span', { html: glyph('search') }), h('input', { id: 'as-search', type: 'search', placeholder: '搜索', onkeydown: (e) => e.stopPropagation(), oninput: (e) => ((st.q = e.target.value.trim()), (st.tab = 'search'), render()) })));
        TABS.forEach(([id, l, g]) => {
          const r = h('div.sb-item' + (st.tab === id ? '.active' : ''), h('span.sb-ico', { html: glyph(g) }), h('span.sb-label', l));
          r.onclick = () => ((st.tab = id), (st.q = ''), render());
          side.appendChild(r);
        });
        side.appendChild(h('div.as-user', h('div.st-avatar', { html: glyph('person') }), h('b', OS.user.name)));
      }
      const isInstalled = (a) => a.builtIn ? !!OS.apps[a.id] : st.installed[a.id];
      function getBtn(a) {
        const b = h('button.as-get');
        const sync = () => (b.textContent = isInstalled(a) ? '打开' : '获取');
        sync();
        b.onclick = (e) => {
          e.stopPropagation();
          if (isInstalled(a)) {
            if (a.builtIn && OS.apps[a.id]) return OS.launch(a.id);
            return OS.alert({ title: `无法打开“${a.name}”`, message: '这是第三方 App 的展示，在这台虚拟 Mac 上无法运行。', icon: OS.icon(a.icon) });
          }
          b.disabled = true;
          b.textContent = '';
          b.classList.add('loading');
          const ring = h('span.as-ring');
          b.appendChild(ring);
          let p = 0;
          const t = setInterval(() => {
            p += 4 + Math.random() * 10;
            ring.style.setProperty('--p', Math.min(100, p));
            if (p >= 100) {
              clearInterval(t);
              st.installed[a.id] = true;
              OS.store.set('appstore.installed', st.installed);
              b.classList.remove('loading');
              b.disabled = false;
              ring.remove();
              sync();
              OS.notify({ app: 'appstore', title: '已安装', body: `“${a.name}”已经可以使用。`, icon: OS.icon(a.icon), silent: true });
            }
          }, 120);
        };
        return b;
      }
      const card = (a) => h('div.as-app', h('img', { src: OS.icon(a.icon), alt: '' }), h('div.as-app-txt', h('b', a.name), h('small', a.sub)), getBtn(a));
      function render() {
        renderSide();
        main.innerHTML = '';
        const tabName = (TABS.find((t) => t[0] === st.tab) || [, '搜索'])[1];
        if (st.tab === 'updates') {
          main.append(h('h1.as-h1', '更新'), h('div.as-empty', h('span', { html: glyph('checkmark-circle-fill') }), h('b', '所有 App 均为最新'), h('small', '上次检查：刚刚')));
          return;
        }
        const filter = { create: ['创作', '音乐'], work: ['效率', '财务'], play: ['游戏'], develop: ['开发', '工具'] }[st.tab];
        let list = filter ? STORE.filter((a) => filter.includes(a.cat)) : STORE;
        if (st.tab === 'search') list = STORE.filter((a) => (a.name + a.sub + a.cat).toLowerCase().includes((st.q || '').toLowerCase()));
        main.append(h('h1.as-h1', st.tab === 'search' ? `“${st.q}”的结果` : tabName));
        if (st.tab === 'discover') {
          main.append(
            h('div.as-hero',
              h('div.as-hero-card', { style: { background: 'linear-gradient(120deg,#1d2671,#c33764)' } }, h('small', '编辑推荐'), h('h2', '为创作者准备的 Mac'), h('p', '剪辑、调色与设计，从这些 App 开始。'), h('div.as-hero-icons', ...['resolve', 'freeform', 'vscode'].map((i) => h('img', { src: OS.icon(i), alt: '' })))),
              h('div.as-hero-card', { style: { background: 'linear-gradient(120deg,#0f9b0f,#00b4db)' } }, h('small', '本周游戏'), h('h2', '经典重温'), h('p', '国际象棋：与 Mac 对弈。'), h('div.as-hero-icons', h('img', { src: OS.icon('chess'), alt: '' })))
            ),
            h('h2.as-h2', '必备 App')
          );
        }
        main.append(h('div.as-grid', ...list.map(card)));
        if (!list.length) main.append(h('div.as-empty', h('b', '没有结果')));
      }
      render();
    },
  });

  /* ======================================================================
     FaceTime
     ====================================================================== */
  OS.registerApp({
    id: 'facetime', name: 'FaceTime 通话', icon: 'facetime', keywords: ['facetime', 'video', 'camera', '视频', '通话'], width: 860, height: 560, minWidth: 560, minHeight: 380, singleton: true, quitOnClose: true,
    description: '与朋友进行视频和语音通话。',
    reopen(win, args) {
      if (args.call) win.state_.call(args.call);
    },
    create(win, args) {
      const st = (win.state_ = {});
      const video = h('video.ft-video', { autoplay: true, muted: true, playsinline: true });
      const placeholder = h('div.ft-ph', h('span', { html: glyph('video') }), h('b', '摄像头未开启'), h('small', '允许浏览器使用摄像头后即可看到自己的画面。'), h('button.btn.primary', { onclick: () => startCam() }, '打开摄像头'));
      const callUI = h('div.ft-call', { hidden: true });
      const recents = h('div.ft-list');
      const side = h('nav.side.ft-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), h('div.ft-actions', h('button.btn.primary.ft-new', { onclick: () => st.call('林晓') }, h('span', { html: glyph('video-fill') }), ' 新建 FaceTime'), h('button.btn', { onclick: () => OS.toast('已拷贝 FaceTime 链接', 'square-on-square') }, '创建链接')), h('div.sb-head', '最近通话'), recents);
      const stage = h('div.ft-stage', video, placeholder, callUI, h('div.ft-bar', h('button.ft-btn', { 'aria-label': '静音', html: glyph('mic'), onclick: (e) => e.currentTarget.classList.toggle('off') }), h('button.ft-btn', { 'aria-label': '摄像头', html: glyph('video'), onclick: (e) => (e.currentTarget.classList.toggle('off'), video.classList.toggle('hidden')) }), h('button.ft-btn.end', { 'aria-label': '结束', html: glyph('phone'), onclick: () => st.end() })));
      const root = h('div.app.facetime', h('div.split', side, h('div.pane', stage)));
      win.body.appendChild(root);
      const calls = OS.store.get('facetime.recents', [{ name: '林晓', t: Date.now() - 3600000 * 5, kind: '视频' }, { name: '妈妈', t: Date.now() - 86400000, kind: '音频' }, { name: '周远', t: Date.now() - 86400000 * 3, kind: '视频' }]);
      function renderRecents() {
        recents.innerHTML = '';
        calls.forEach((c) => {
          const r = h('div.ft-row', h('div.ms-av', { style: { background: 'linear-gradient(135deg,#84fab0,#8fd3f4)' } }, c.name.slice(-1)), h('div', h('b', c.name), h('small', `FaceTime ${c.kind} · ${OS.fmt.relative(c.t)}`)), h('button.tb-btn', { 'aria-label': '呼叫', html: glyph('video'), onclick: () => st.call(c.name) }));
          recents.appendChild(r);
        });
      }
      async function startCam() {
        try {
          st.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          video.srcObject = st.stream;
          placeholder.hidden = true;
        } catch (e) {
          placeholder.querySelector('b').textContent = '无法使用摄像头';
          placeholder.querySelector('small').textContent = '浏览器拒绝了摄像头访问，或这台设备没有摄像头。';
        }
      }
      st.call = (name) => {
        callUI.hidden = false;
        callUI.innerHTML = '';
        callUI.append(h('div.ft-callee', h('div.ms-av.big', { style: { background: 'linear-gradient(135deg,#f6d365,#fda085)' } }, name.slice(-1)), h('b', name), h('small.ft-status', 'FaceTime 视频…')));
        root.classList.add('calling');
        OS.sound.play('facetime');
        st.ring = setInterval(() => OS.sound.play('facetime'), 2800);
        st.timeout = setTimeout(() => {
          clearInterval(st.ring);
          const s = callUI.querySelector('.ft-status');
          s && (s.textContent = '无应答');
          calls.unshift({ name, t: Date.now(), kind: '视频' });
          OS.store.set('facetime.recents', calls.slice(0, 12));
          renderRecents();
          setTimeout(() => st.end(), 1800);
        }, 8000);
      };
      st.end = () => {
        clearInterval(st.ring);
        clearTimeout(st.timeout);
        callUI.hidden = true;
        root.classList.remove('calling');
      };
      win.on('close', () => {
        st.end();
        st.stream && st.stream.getTracks().forEach((t) => t.stop());
      });
      renderRecents();
      startCam();
      if (args.call) st.call(args.call);
    },
  });

  /* ======================================================================
     Contacts
     ====================================================================== */
  OS.registerApp({
    id: 'contacts', name: '通讯录', icon: 'contacts', keywords: ['contacts', 'address book', '联系人', '通讯录'], width: 720, height: 500, minWidth: 520, minHeight: 360, singleton: true,
    description: '管理联系人。',
    reopen(win, args) {
      if (args.id) win.state_.open(args.id);
    },
    create(win, args) {
      const list = OS.store.get('contacts.list', null) || [{ id: 'me', name: OS.user.name + '（我）', phone: '188 8888 0000', email: 'guest@icloud.com', grad: 'linear-gradient(135deg,#a8b8d0,#6b7a93)' }, ...OS.contactsSeed.filter((c) => !c.group)];
      OS.store.set('contacts.list', list);
      const st = (win.state_ = { cur: args.id || list[1].id });
      const listEl = h('div.ct-list');
      const card = h('div.ct-card');
      const root = h('div.app.contacts', h('div.split', h('nav.side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), h('div.sb-item.active', h('span.sb-ico', { html: glyph('person-2') }), h('span.sb-label', '所有联系人')), h('div.sb-item', h('span.sb-ico', { html: glyph('cloud') }), h('span.sb-label', 'iCloud'))), h('div.ct-mid', h('div.tbar', { 'data-drag': '' }, h('div.tb-spacer', { 'data-drag': '' }), h('button.tb-btn', { 'aria-label': '新建联系人', html: glyph('plus'), onclick: () => st.add() })), listEl), h('div.pane', h('div.tbar', { 'data-drag': '' }), card)));
      win.body.appendChild(root);
      function render() {
        listEl.innerHTML = '';
        list.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh')).forEach((c) => {
          const r = h('div.ct-row' + (st.cur === c.id ? '.on' : ''), c.name);
          r.onclick = () => st.open(c.id);
          listEl.appendChild(r);
        });
        const c = list.find((x) => x.id === st.cur);
        card.innerHTML = '';
        if (!c) return;
        const field = (label, key) => {
          const inp = h('input.ct-in', { id: 'ct-' + key, value: c[key] || '', placeholder: label });
          inp.addEventListener('keydown', (e) => e.stopPropagation());
          inp.onchange = () => ((c[key] = inp.value), OS.store.set('contacts.list', list), render());
          return h('div.ct-field', h('small', label), inp);
        };
        card.append(
          h('div.ct-head', h('div.ms-av.big', { style: { background: c.grad || 'linear-gradient(135deg,#84fab0,#8fd3f4)' } }, c.name.replace('（我）', '').slice(-1)), h('h2', c.name)),
          h('div.ct-actions', ...[['bubble', '信息', () => OS.launch('messages', { cid: c.id })], ['phone', '呼叫', () => OS.toast('通过 iPhone 拨打：' + (c.phone || ''))], ['video', '视频', () => OS.launch('facetime', { call: c.name })], ['mail', '邮件', () => OS.launch('mailcompose', { to: c.email || '' })]].map(([g, l, fn]) => h('button.ct-act', { onclick: fn }, h('span', { html: glyph(g) }), h('small', l)))),
          field('电话', 'phone'), field('电子邮件', 'email'), field('生日', 'birthday'), field('备注', 'note')
        );
      }
      st.open = (id) => ((st.cur = id), render());
      st.add = () => {
        const c = { id: OS.uid(), name: '新联系人', grad: 'linear-gradient(135deg,#cfd9df,#e2ebf0)' };
        list.push(c);
        OS.store.set('contacts.list', list);
        st.open(c.id);
      };
      render();
    },
  });

  /* ======================================================================
     Activity Monitor
     ====================================================================== */
  OS.registerApp({
    id: 'activity', name: '活动监视器', icon: 'activitymonitor', keywords: ['activity monitor', 'task manager', 'cpu', 'memory', '任务管理器', '进程'], width: 860, height: 560, minWidth: 600, minHeight: 380, singleton: true,
    description: '查看正在运行的进程与资源使用情况。',
    create(win) {
      const st = { tab: 'cpu', sort: 'cpu', sel: null, hist: Array(80).fill(0), hist2: Array(80).fill(0) };
      const tabs = h('div.tb-group.seg.text', ...[['cpu', 'CPU'], ['mem', '内存'], ['energy', '能耗'], ['disk', '磁盘'], ['net', '网络']].map(([k, l]) => h('button.tb-btn' + (k === 'cpu' ? '.on' : ''), { dataset: { k }, onclick: () => (($$('button', tabs).forEach((b) => b.classList.toggle('on', b.dataset.k === k))), (st.tab = k), render()) }, l)));
      const quitBtn = h('button.tb-btn', { title: '停止', 'aria-label': '停止所选进程', html: glyph('xmark'), onclick: () => st.sel && OS.apps[st.sel] && wm.quit(st.sel) });
      const table = h('div.am-table');
      const chart = h('canvas.am-chart', { width: 360, height: 90 });
      const stats = h('div.am-stats');
      const root = h('div.app.activity', h('div.tbar', { 'data-drag': '' }, h('div.tb-title', '活动监视器'), h('div.tb-group', quitBtn, h('button.tb-btn', { 'aria-label': '信息', html: glyph('info'), onclick: () => st.sel && OS.aboutApp(OS.apps[st.sel] || { name: st.sel, icon: 'activitymonitor' }) })), h('div.tb-spacer', { 'data-drag': '' }), tabs), table, h('div.am-foot', stats, h('div.am-chartbox', h('small', 'CPU 负载'), chart)));
      win.body.appendChild(root);

      // measure real frame pacing as a load signal
      let frames = 0, lastT = performance.now(), load = 0.1, raf;
      const meter = (t) => {
        frames++;
        if (t - lastT > 1000) {
          const fps = (frames * 1000) / (t - lastT);
          load = Math.max(0.04, Math.min(0.95, (60 - fps) / 60 + 0.06 + wm.windows.length * 0.02 + (OS.music && OS.music.state().playing ? 0.05 : 0)));
          frames = 0;
          lastT = t;
        }
      };
      wm.loop(win, meter);
      const procs = () => {
        const sys = [['kernel_task', 'cpu'], ['WindowServer', 'display'], ['Dock', 'dock-icon'], ['Spotlight', 'search'], ['SystemUIServer', 'menubar-icon'], ['coreaudiod', 'speaker'], ['mds_stores', 'hdd'], ['loginwindow', 'lock']];
        const appList = [...OS.running.keys()].map((id) => ({ id, name: OS.apps[id].name, icon: OS.icon(OS.apps[id].icon), app: true }));
        const all = [...appList, ...sys.map(([n, g]) => ({ id: n, name: n, glyph: g }))];
        all.forEach((p, i) => {
          const seed = (p.name.length * 13 + i * 7) % 17;
          p.cpu = +(p.app ? load * 20 * (0.4 + Math.random()) + seed / 10 : seed / 6 * Math.random() + (p.id === 'WindowServer' ? load * 25 : 0)).toFixed(1);
          p.mem = p.app ? 80 + seed * 22 + (wm.appWindows(p.id).length * 60) : 20 + seed * 30;
          p.energy = +(p.cpu * 0.8).toFixed(1);
          p.threads = 4 + seed;
          p.pid = 200 + i * 37;
          p.disk = (seed * 1.3).toFixed(1);
          p.net = (p.app ? seed * 3.1 : seed * 0.4).toFixed(1);
        });
        return all;
      };
      function render() {
        const list = procs();
        const cols = { cpu: [['cpu', '% CPU'], ['threads', '线程'], ['pid', 'PID']], mem: [['mem', '内存'], ['threads', '线程'], ['pid', 'PID']], energy: [['energy', '能耗影响'], ['cpu', '% CPU'], ['pid', 'PID']], disk: [['disk', '写入字节 (MB)'], ['pid', 'PID']], net: [['net', '已发送 (KB)'], ['pid', 'PID']] }[st.tab];
        const key = cols[0][0];
        list.sort((a, b) => b[key] - a[key]);
        table.innerHTML = '';
        table.append(h('div.am-row.head', h('span', '进程名称'), ...cols.map(([, l]) => h('span', l))));
        list.forEach((p) => {
          const r = h('div.am-row' + (st.sel === p.id ? '.sel' : ''), h('span.am-name', p.icon ? h('img', { src: p.icon, alt: '' }) : h('i.am-g', { html: glyph(p.glyph) }), p.name), ...cols.map(([k]) => h('span', k === 'mem' ? OS.fmt.size(p.mem * 1e6) : String(p[k]))));
          r.onclick = () => ((st.sel = p.id), render());
          table.appendChild(r);
        });
        const mem = performance.memory ? performance.memory.usedJSHeapSize : 0;
        stats.innerHTML = '';
        stats.append(
          h('div', h('small', '系统：'), h('b', (load * 38).toFixed(2) + '%')),
          h('div', h('small', '用户：'), h('b', (load * 52).toFixed(2) + '%')),
          h('div', h('small', '闲置：'), h('b', (100 - load * 90).toFixed(2) + '%')),
          h('div', h('small', '线程：'), h('b', String(1800 + wm.windows.length * 42))),
          h('div', h('small', '进程：'), h('b', String(410 + OS.running.size))),
          mem ? h('div', h('small', '页面内存：'), h('b', OS.fmt.size(mem))) : null
        );
        st.hist.push(load * 0.55);
        st.hist.shift();
        st.hist2.push(load * 0.4);
        st.hist2.shift();
        const x = chart.getContext('2d');
        const W = chart.width, H = chart.height;
        x.clearRect(0, 0, W, H);
        x.fillStyle = OS.isDark() ? '#111' : '#000';
        x.fillRect(0, 0, W, H);
        const plot = (arr, col, base) => {
          x.fillStyle = col;
          arr.forEach((v, i) => {
            const bh = v * H;
            const b0 = base ? base[i] * H : 0;
            x.fillRect((i / arr.length) * W, H - bh - b0, W / arr.length - 1, bh);
          });
        };
        plot(st.hist2, '#ff3b30');
        plot(st.hist, '#30d158', st.hist2);
      }
      const t = setInterval(render, 1500);
      win.on('close', () => (clearInterval(t), cancelAnimationFrame(raf)));
      render();
    },
  });

  /* ======================================================================
     Freeform — infinite whiteboard
     ====================================================================== */
  OS.registerApp({
    id: 'freeform', name: '无边记', icon: 'freeform', keywords: ['freeform', 'whiteboard', 'draw', '画板', '白板'], width: 980, height: 640, minWidth: 520, minHeight: 360,
    description: '在无限画布上自由创作。',
    create(win) {
      const st = { tool: 'pen', color: '#1d1d1f', zoom: 1, panX: 0, panY: 0 };
      let board = OS.store.get('freeform.board', null) || {
        strokes: [],
        items: [
          { id: 'i1', kind: 'note', x: 80, y: 80, w: 180, h: 160, color: '#fff3a3', text: '把想法写在便签上，拖动来整理。' },
          { id: 'i2', kind: 'note', x: 300, y: 120, w: 180, h: 160, color: '#c9f2c7', text: '双击空白处添加文本。' },
          { id: 'i3', kind: 'shape', x: 560, y: 90, w: 160, h: 110, color: '#5e5ce6', shape: 'rect' },
          { id: 'i4', kind: 'text', x: 90, y: 300, w: 380, h: 50, color: '#1d1d1f', text: '无边记 · 头脑风暴' },
        ],
      };
      const save = OS.debounce(() => OS.store.set('freeform.board', board), 400);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('ff-svg');
      const layer = h('div.ff-layer');
      const world = h('div.ff-world', svg, layer);
      const canvas = h('div.ff-canvas', world);
      const toolBtn = (id, g, label) => h('button.tb-btn' + (st.tool === id ? '.on' : ''), { dataset: { tool: id }, title: label, 'aria-label': label, html: glyph(g), onclick: () => setTool(id) });
      const colors = ['#1d1d1f', '#ff3b30', '#ff9500', '#28cd41', '#007aff', '#af52de'];
      const toolbar = h('div.tbar', { 'data-drag': '' },
        h('div.tb-title', '我的白板'),
        h('div.tb-spacer', { 'data-drag': '' }),
        h('div.tb-group.ff-tools', toolBtn('select', 'cursor', '选择'), toolBtn('pen', 'scribble', '画笔'), toolBtn('note', 'note-sticky', '便签'), toolBtn('text', 'textformat', '文本'), toolBtn('shape', 'rectangle', '形状'), toolBtn('eraser', 'eraser', '橡皮擦')),
        h('div.tb-group.ff-colors', ...colors.map((c) => h('button.ff-color' + (c === st.color ? '.on' : ''), { style: { background: c }, 'aria-label': '颜色', onclick: (e) => (($$('.ff-color', toolbar).forEach((b) => b.classList.toggle('on', b === e.currentTarget))), (st.color = c)) }))),
        h('div.tb-group', h('button.tb-btn', { 'aria-label': '缩小', html: glyph('zoom-out'), onclick: () => zoom(-0.1) }), h('button.tb-btn', { 'aria-label': '放大', html: glyph('zoom-in'), onclick: () => zoom(0.1) }), h('button.tb-btn', { 'aria-label': '清空', title: '清空白板', html: glyph('trash'), onclick: async () => (await OS.alert({ title: '清空白板？', icon: OS.icon('freeform'), buttons: [{ label: '取消' }, { label: '清空', primary: true }], win })) === 1 && ((board = { strokes: [], items: [] }), save(), render()) }))
      );
      const root = h('div.app.freeform', toolbar, canvas);
      win.body.appendChild(root);

      function setTool(t) {
        st.tool = t;
        $$('.ff-tools button', toolbar).forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
        canvas.dataset.tool = t;
      }
      function zoom(d) {
        st.zoom = Math.max(0.3, Math.min(2.5, st.zoom + d));
        applyView();
      }
      const applyView = () => (world.style.transform = `translate(${st.panX}px, ${st.panY}px) scale(${st.zoom})`);
      const toWorld = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / OS.scale - st.panX) / st.zoom, y: ((e.clientY - r.top) / OS.scale - st.panY) / st.zoom };
      };
      function render() {
        svg.innerHTML = '';
        board.strokes.forEach((s) => {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', s.d);
          p.setAttribute('stroke', s.color);
          p.setAttribute('stroke-width', s.w || 3);
          p.setAttribute('fill', 'none');
          p.setAttribute('stroke-linecap', 'round');
          p.setAttribute('stroke-linejoin', 'round');
          p.dataset.id = s.id;
          svg.appendChild(p);
        });
        layer.innerHTML = '';
        board.items.forEach((it) => {
          const el = h('div.ff-item.' + it.kind, { dataset: { id: it.id }, style: { left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px', background: it.kind === 'note' ? it.color : it.kind === 'shape' ? it.color : 'transparent', color: it.kind === 'text' ? it.color : '' } });
          if (it.shape === 'circle') el.style.borderRadius = '50%';
          if (it.kind !== 'shape') {
            const t = h('div.ff-text', { contenteditable: 'true', spellcheck: 'false' }, it.text || '');
            t.addEventListener('input', () => ((it.text = t.textContent), save()));
            t.addEventListener('keydown', (e) => e.stopPropagation());
            t.addEventListener('pointerdown', (e) => st.tool === 'select' || e.stopPropagation());
            el.appendChild(t);
          }
          el.appendChild(h('div.ff-handle'));
          layer.appendChild(el);
        });
      }
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const p0 = toWorld(e);
        const itemEl = e.target.closest('.ff-item');
        if (st.tool === 'eraser') {
          const sid = e.target.dataset && e.target.dataset.id;
          if (itemEl) board.items = board.items.filter((x) => x.id !== itemEl.dataset.id);
          else if (sid) board.strokes = board.strokes.filter((s) => s.id !== sid);
          save();
          return render();
        }
        if (itemEl && (st.tool === 'select' || st.tool === 'pen' && false || e.target.classList.contains('ff-handle') || st.tool !== 'pen')) {
          const it = board.items.find((x) => x.id === itemEl.dataset.id);
          const resize = e.target.classList.contains('ff-handle');
          const o = { x: it.x, y: it.y, w: it.w, h: it.h };
          const mv = (ev) => {
            const p = toWorld(ev);
            if (resize) (it.w = Math.max(40, o.w + p.x - p0.x)), (it.h = Math.max(30, o.h + p.y - p0.y));
            else (it.x = o.x + p.x - p0.x), (it.y = o.y + p.y - p0.y);
            Object.assign(itemEl.style, { left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px' });
          };
          const up = () => (window.removeEventListener('pointermove', mv), window.removeEventListener('pointerup', up), save());
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', up);
          return;
        }
        if (st.tool === 'pen') {
          const s = { id: OS.uid(), color: st.color, w: 3, d: `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}` };
          board.strokes.push(s);
          render();
          const path = svg.lastChild;
          const mv = (ev) => {
            const p = toWorld(ev);
            s.d += ` L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            path.setAttribute('d', s.d);
          };
          const up = () => (window.removeEventListener('pointermove', mv), window.removeEventListener('pointerup', up), save());
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', up);
        } else if (st.tool === 'note' || st.tool === 'text' || st.tool === 'shape') {
          const noteColors = ['#fff3a3', '#c9f2c7', '#ffd3e0', '#cfe8ff'];
          board.items.push({ id: OS.uid(), kind: st.tool, x: p0.x - 80, y: p0.y - 60, w: st.tool === 'text' ? 240 : 170, h: st.tool === 'text' ? 44 : st.tool === 'shape' ? 110 : 150, color: st.tool === 'note' ? noteColors[board.items.length % 4] : st.color, text: '', shape: st.tool === 'shape' && board.items.length % 2 ? 'circle' : 'rect' });
          save();
          render();
          const t = layer.lastChild.querySelector('.ff-text');
          t && t.focus();
          setTool('select');
        } else if (st.tool === 'select' && !itemEl) {
          // pan the board
          const o = { x: st.panX, y: st.panY }, c0 = { x: e.clientX, y: e.clientY };
          const mv = (ev) => ((st.panX = o.x + (ev.clientX - c0.x) / OS.scale), (st.panY = o.y + (ev.clientY - c0.y) / OS.scale), applyView());
          const up = () => (window.removeEventListener('pointermove', mv), window.removeEventListener('pointerup', up));
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', up);
        }
      });
      canvas.addEventListener('dblclick', (e) => {
        if (e.target.closest('.ff-item')) return;
        const p = toWorld(e);
        board.items.push({ id: OS.uid(), kind: 'text', x: p.x, y: p.y - 20, w: 240, h: 44, color: st.color, text: '' });
        save();
        render();
        layer.lastChild.querySelector('.ff-text').focus();
      });
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) zoom(-e.deltaY / 400);
        else (st.panX -= e.deltaX / OS.scale), (st.panY -= e.deltaY / OS.scale), applyView();
      }, { passive: false });
      setTool('pen');
      render();
      applyView();
    },
  });

  /* ======================================================================
     Voice Memos
     ====================================================================== */
  OS.registerApp({
    id: 'voicememos', name: '语音备忘录', icon: 'voicememos', keywords: ['voice memos', 'record', 'recorder', '录音'], width: 720, height: 460, minWidth: 520, minHeight: 340, singleton: true,
    description: '用麦克风录制声音。',
    create(win) {
      const st = { recs: [], rec: null };
      const list = h('div.vm-list');
      const wave = h('canvas.vm-wave', { width: 600, height: 140 });
      const time = h('div.vm-time', '00:00.00');
      const recBtn = h('button.vm-rec', { 'aria-label': '录音' }, h('i'));
      const info = h('small.vm-info', '点按红色按钮开始录音');
      const root = h('div.app.voicememos', h('div.split', h('nav.side.vm-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), h('div.sb-head', '所有录音'), list), h('div.pane.vm-pane', h('div.tbar', { 'data-drag': '' }), h('div.vm-stage', time, wave, recBtn, info))));
      win.body.appendChild(root);
      function renderList() {
        list.innerHTML = '';
        if (!st.recs.length) list.appendChild(h('div.vm-empty', '没有录音'));
        st.recs.forEach((r, i) => {
          const audio = h('audio', { src: r.url, controls: true });
          list.appendChild(h('div.vm-item', h('b', r.name), h('small', `${OS.fmt.dateTime(new Date(r.t))} · ${r.dur.toFixed(1)} 秒`), audio));
        });
      }
      let raf, analyser, t0;
      function draw() {
        const x = wave.getContext('2d');
        const W = wave.width, H = wave.height;
        x.clearRect(0, 0, W, H);
        x.fillStyle = '#ff3b30';
        if (analyser) {
          const d = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteTimeDomainData(d);
          for (let i = 0; i < 60; i++) {
            const v = Math.abs(d[Math.floor((i / 60) * d.length)] - 128) / 128;
            const bh = Math.max(3, v * H * 1.8);
            x.fillRect(i * (W / 60) + 2, (H - bh) / 2, W / 60 - 4, bh);
          }
          const e = (Date.now() - t0) / 1000;
          time.textContent = `${String(Math.floor(e / 60)).padStart(2, '0')}:${(e % 60).toFixed(2).padStart(5, '0')}`;
        } else {
          for (let i = 0; i < 60; i++) x.fillRect(i * (W / 60) + 2, H / 2 - 1.5, W / 60 - 4, 3);
        }
      }
      draw();
      wm.loop(win, draw, 30);
      recBtn.onclick = async () => {
        if (st.rec) {
          st.rec.stop();
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ctx = OS.sound.ctx();
          const src = ctx.createMediaStreamSource(stream);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          src.connect(analyser);
          const chunks = [];
          st.rec = new MediaRecorder(stream);
          st.rec.ondataavailable = (e) => chunks.push(e.data);
          st.rec.onstop = () => {
            const dur = (Date.now() - t0) / 1000;
            st.recs.unshift({ name: `新录音 ${st.recs.length + 1}`, url: URL.createObjectURL(new Blob(chunks, { type: st.rec.mimeType })), t: Date.now(), dur });
            stream.getTracks().forEach((t) => t.stop());
            analyser = null;
            st.rec = null;
            recBtn.classList.remove('on');
            info.textContent = '录音已存储';
            renderList();
          };
          t0 = Date.now();
          st.rec.start();
          recBtn.classList.add('on');
          info.textContent = '正在录音… 再次点按以停止';
        } catch (e) {
          info.textContent = '无法使用麦克风：浏览器拒绝了访问或没有麦克风。';
          OS.sound.play('error');
        }
      };
      win.on('close', () => (cancelAnimationFrame(raf), st.rec && st.rec.stop()));
      renderList();
    },
  });

  /* ======================================================================
     Stocks (simulated quotes, labeled as such)
     ====================================================================== */
  OS.registerApp({
    id: 'stocks', name: '股市', icon: 'stocks', keywords: ['stocks', 'market', '股票', '行情'], width: 860, height: 560, minWidth: 560, minHeight: 380, singleton: true,
    description: '追踪你关注的股票（演示数据）。',
    create(win) {
      const SYMS = [['AAPL', 'Apple Inc.', 228], ['MSFT', 'Microsoft', 432], ['NVDA', 'NVIDIA', 124], ['GOOGL', 'Alphabet', 168], ['TSLA', 'Tesla', 251], ['AMZN', 'Amazon', 186], ['0700.HK', '腾讯控股', 418]];
      const series = {};
      SYMS.forEach(([s, , p], k) => {
        let v = p * 0.96;
        series[s] = Array.from({ length: 120 }, (_, i) => (v += (Math.sin(i / 9 + k) + (Math.random() - 0.48)) * p * 0.004));
      });
      const st = { cur: 'AAPL' };
      const list = h('div.sk-list');
      const detail = h('div.sk-detail');
      const root = h('div.app.stocks', h('div.split', h('nav.side.sk-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), h('div.sk-head', h('b', '股市'), h('small', OS.fmt.date(new Date()))), list), h('div.pane', h('div.tbar', { 'data-drag': '' }), detail)));
      win.body.appendChild(root);
      const spark = (arr, up, W = 70, H = 28) => {
        const min = Math.min(...arr), max = Math.max(...arr);
        const pts = arr.map((v, i) => `${(i / (arr.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(' ');
        return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${pts}" fill="none" stroke="${up ? '#30d158' : '#ff453a'}" stroke-width="1.6"/></svg>`;
      };
      function render() {
        list.innerHTML = '';
        SYMS.forEach(([s, n]) => {
          const a = series[s];
          const last = a[a.length - 1], first = a[0];
          const chg = ((last - first) / first) * 100;
          const r = h('div.sk-row' + (st.cur === s ? '.on' : ''), h('div', h('b', s), h('small', n)), h('span', { html: spark(a.slice(-40), chg >= 0) }), h('div.sk-q', h('b', last.toFixed(2)), h('span.sk-chg' + (chg >= 0 ? '.up' : '.down'), (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%')));
          r.onclick = () => ((st.cur = s), render());
          list.appendChild(r);
        });
        const [s, n] = SYMS.find((x) => x[0] === st.cur);
        const a = series[s];
        const last = a[a.length - 1], chg = ((last - a[0]) / a[0]) * 100;
        detail.innerHTML = '';
        detail.append(
          h('div.sk-title', h('h1', s), h('span', n)),
          h('div.sk-price', h('b', last.toFixed(2)), h('span.sk-chg' + (chg >= 0 ? '.up' : '.down'), `${chg >= 0 ? '+' : ''}${(last - a[0]).toFixed(2)} (${chg.toFixed(2)}%)`)),
          h('div.sk-chart', { html: spark(a, chg >= 0, 560, 200).replace('stroke-width="1.6"', 'stroke-width="2"') }),
          h('div.sk-grid', ...[['开盘', a[0].toFixed(2)], ['最高', Math.max(...a).toFixed(2)], ['最低', Math.min(...a).toFixed(2)], ['成交量', (Math.random() * 50 + 20).toFixed(1) + 'M'], ['市盈率', (Math.random() * 20 + 18).toFixed(2)], ['52 周高', (Math.max(...a) * 1.12).toFixed(2)]].map(([k, v]) => h('div', h('small', k), h('b', v)))),
          h('div.sk-note', '模拟行情，仅供演示，不构成投资建议。')
        );
      }
      const t = setInterval(() => {
        Object.values(series).forEach((a) => {
          a.push(a[a.length - 1] * (1 + (Math.random() - 0.495) * 0.004));
          a.shift();
        });
        render();
      }, 3000);
      win.on('close', () => clearInterval(t));
      render();
    },
  });

  /* ======================================================================
     Chess (two-player board with legal-ish piece moves and a simple AI)
     ====================================================================== */
  OS.registerApp({
    id: 'chess', name: '国际象棋', icon: 'chess', keywords: ['chess', '象棋', 'game'], width: 560, height: 620, minWidth: 420, minHeight: 470, singleton: true,
    description: '与 Mac 对弈。',
    create(win) {
      const START = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];
      let B = START.map((r) => r.split(''));
      let turn = 'w', sel = null, moves = [], status = '你执白先行';
      const PIECE = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
      const boardEl = h('div.chess-board');
      const statusEl = h('div.chess-status');
      win.body.appendChild(h('div.app.chess', h('div.tbar', { 'data-drag': '' }, h('div.tb-title', '国际象棋'), h('div.tb-spacer', { 'data-drag': '' }), h('button.btn', { onclick: () => ((B = START.map((r) => r.split(''))), (turn = 'w'), (status = '新对局'), render()) }, '新对局')), h('div.chess-wrap', boardEl), statusEl));
      const color = (p) => (p === '.' ? null : p === p.toUpperCase() ? 'w' : 'b');
      function pseudo(r, c) {
        const p = B[r][c], col = color(p), t = p.toLowerCase(), out = [];
        const add = (rr, cc) => rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && color(B[rr][cc]) !== col && out.push([rr, cc]);
        const ray = (dr, dc) => {
          for (let i = 1; i < 8; i++) {
            const rr = r + dr * i, cc = c + dc * i;
            if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
            if (B[rr][cc] === '.') out.push([rr, cc]);
            else {
              if (color(B[rr][cc]) !== col) out.push([rr, cc]);
              break;
            }
          }
        };
        if (t === 'p') {
          const d = col === 'w' ? -1 : 1;
          if (B[r + d] && B[r + d][c] === '.') {
            out.push([r + d, c]);
            if ((col === 'w' ? r === 6 : r === 1) && B[r + 2 * d][c] === '.') out.push([r + 2 * d, c]);
          }
          [-1, 1].forEach((dc) => B[r + d] && B[r + d][c + dc] && color(B[r + d][c + dc]) && color(B[r + d][c + dc]) !== col && out.push([r + d, c + dc]));
        }
        if (t === 'n') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([a, b]) => add(r + a, c + b));
        if (t === 'k') [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => add(r + a, c + b));
        if (t === 'r' || t === 'q') [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => ray(a, b));
        if (t === 'b' || t === 'q') [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => ray(a, b));
        return out;
      }
      const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
      function move(a, b) {
        const cap = B[b[0]][b[1]];
        B[b[0]][b[1]] = B[a[0]][a[1]];
        B[a[0]][a[1]] = '.';
        if (B[b[0]][b[1]] === 'P' && b[0] === 0) B[b[0]][b[1]] = 'Q';
        if (B[b[0]][b[1]] === 'p' && b[0] === 7) B[b[0]][b[1]] = 'q';
        OS.sound.play('tick');
        if (cap.toLowerCase() === 'k') {
          status = color(cap) === 'b' ? '将死！你赢了' : 'Mac 赢了';
          turn = 'over';
          return;
        }
        turn = turn === 'w' ? 'b' : 'w';
      }
      function ai() {
        let best = null, bestScore = -1e9;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (color(B[r][c]) === 'b') pseudo(r, c).forEach((m) => {
          const tgt = B[m[0]][m[1]];
          const score = (tgt === '.' ? 0 : VAL[tgt.toLowerCase()] * 10) + Math.random() * 2 + (m[0] > r && B[r][c] === 'p' ? 0.5 : 0);
          if (score > bestScore) (bestScore = score), (best = [[r, c], m]);
        });
        if (best) move(best[0], best[1]);
        status = turn === 'over' ? status : '轮到你了';
        render();
      }
      function render() {
        boardEl.innerHTML = '';
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const p = B[r][c];
          const sq = h('div.sq' + ((r + c) % 2 ? '.dark' : '') + (sel && sel[0] === r && sel[1] === c ? '.sel' : '') + (moves.some((m) => m[0] === r && m[1] === c) ? '.hint' : ''), p !== '.' ? h('span.pc.' + color(p), PIECE[p.toLowerCase()]) : null);
          sq.onclick = () => {
            if (turn !== 'w') return;
            if (sel && moves.some((m) => m[0] === r && m[1] === c)) {
              move(sel, [r, c]);
              sel = null;
              moves = [];
              render();
              if (turn === 'b') {
                status = 'Mac 正在思考…';
                render();
                setTimeout(ai, 500);
              }
              return;
            }
            if (color(p) === 'w') (sel = [r, c]), (moves = pseudo(r, c));
            else (sel = null), (moves = []);
            render();
          };
          boardEl.appendChild(sq);
        }
        statusEl.textContent = status;
      }
      render();
    },
  });
})();
