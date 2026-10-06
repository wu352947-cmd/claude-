/* Safari */
(function () {
  const { h, $$, glyph } = OS;

  const FAVORITES = [
    { name: 'Apple', url: 'https://www.apple.com.cn/', c: '#1d1d1f' },
    { name: '维基百科', url: 'https://zh.wikipedia.org/wiki/MacOS', c: '#636366' },
    { name: 'iCloud', url: 'https://www.icloud.com.cn/', c: '#3b82f6' },
    { name: 'GitHub', url: 'https://github.com/', c: '#24292f' },
    { name: '哔哩哔哩', url: 'https://www.bilibili.com/', c: '#fb7299' },
    { name: '知乎', url: 'https://www.zhihu.com/', c: '#0066ff' },
    { name: 'MDN', url: 'https://developer.mozilla.org/zh-CN/', c: '#111' },
    { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/export/embed.html?bbox=-120.2%2C38.85%2C-119.9%2C39.25&layer=mapnik', c: '#7ebc6f' },
    { name: 'Example', url: 'https://example.com/', c: '#8e8e93' },
    { name: 'CERN 首个网站', url: 'https://info.cern.ch/hypertext/WWW/TheProject.html', c: '#0033a0' },
    { name: 'Apple 开发者', url: 'https://developer.apple.com/cn/', c: '#0a84ff' },
    { name: '人机界面指南', url: 'https://developer.apple.com/cn/design/human-interface-guidelines/', c: '#5e5ce6' },
  ];
  // sites known to refuse being shown inside another page
  const BLOCKED = /(^|\.)(apple\.com(\.cn)?|icloud\.com(\.cn)?|google\.[a-z.]+|github\.com|bilibili\.com|zhihu\.com|baidu\.com|youtube\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|taobao\.com|jd\.com|weibo\.com|qq\.com|bing\.com|mozilla\.org|amazon\.[a-z.]+|netflix\.com|reddit\.com|linkedin\.com|openai\.com|anthropic\.com|claude\.ai)$/i;

  const host = (u) => {
    try {
      return new URL(u).hostname;
    } catch (e) {
      return '';
    }
  };
  function toUrl(input) {
    const t = input.trim();
    if (!t) return null;
    if (/^safari:/.test(t)) return t;
    if (/^https?:\/\//i.test(t)) return t;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) && !/\s/.test(t)) return 'https://' + t;
    return 'https://zh.wikipedia.org/w/index.php?search=' + encodeURIComponent(t);
  }
  const monogram = (name, c) => h('div.sf-mono', { style: { background: c } }, name.replace(/^(.).*$/u, '$1').toUpperCase());

  OS.registerApp({
    id: 'safari', name: 'Safari 浏览器', icon: 'safari', keywords: ['safari', 'browser', '浏览器', 'web'], width: 1040, height: 660, minWidth: 480, minHeight: 300,
    description: '快速、私密、省电的网页浏览器。',
    reopen(win, args) {
      if (args.url || args.search) win.state_.newTab(args.url ? args.url : toUrl(args.search));
    },
    menus: (win) => {
      const st = win && win.state_;
      return [
        { title: '文件', items: [
          { label: '新建窗口', key: '⌘N', action: () => OS.newWindow('safari') },
          { label: '新建标签页', key: '⌘T', disabled: !st, action: () => st.newTab() },
          { label: '打开位置…', key: '⌘L', disabled: !st, action: () => st.focusAddress() },
          { sep: true },
          { label: '关闭标签页', key: '⌘W', disabled: !st, action: () => st.closeTab(st.active) },
          { label: '关闭窗口', key: '⇧⌘W', disabled: !win, action: () => win.close() },
        ] },
        { title: '显示', items: [
          { label: '显示标签页概览', key: '⇧⌘\\', disabled: !st, action: () => st.overview() },
          { label: '重新载入页面', key: '⌘R', disabled: !st, action: () => st.reload() },
          { sep: true },
          { label: '放大', key: '⌘+', disabled: !st, action: () => st.zoom(0.1) },
          { label: '缩小', key: '⌘-', disabled: !st, action: () => st.zoom(-0.1) },
          { label: '实际大小', key: '⌘0', disabled: !st, action: () => st.zoom(0) },
        ] },
        { title: '历史记录', items: [
          { label: '显示起始页', disabled: !st, action: () => st.nav('safari:start') },
          { label: '返回', key: '⌘[', disabled: !st, action: () => st.back() },
          { label: '前进', key: '⌘]', disabled: !st, action: () => st.fwd() },
          { sep: true },
          { head: '最近访问' },
          ...OS.store.get('safari.history', []).slice(0, 8).map((x) => ({ label: x.title || x.url, action: () => st ? st.nav(x.url) : OS.launch('safari', { url: x.url }) })),
          { sep: true },
          { label: '清除历史记录…', action: () => (OS.store.set('safari.history', []), OS.toast('已清除历史记录')) },
        ] },
        { title: '书签', items: [
          { label: '添加书签…', key: '⌘D', disabled: !st, action: () => st.bookmark() },
          { sep: true },
          { head: '个人收藏' },
          ...FAVORITES.slice(0, 8).map((f) => ({ label: f.name, action: () => (st ? st.nav(f.url) : OS.launch('safari', { url: f.url })) })),
          ...OS.store.get('safari.bookmarks', []).map((b) => ({ label: b.title, action: () => st && st.nav(b.url) })),
        ] },
      ];
    },
    onKey(win, e) {
      const st = win.state_;
      const cmd = OS.cmd(e);
      if (cmd && e.code === 'KeyL') return e.preventDefault(), st.focusAddress();
      if (cmd && e.code === 'KeyR') return e.preventDefault(), st.reload();
      if (cmd && e.code === 'KeyD') return e.preventDefault(), st.bookmark();
      if (e.altKey && e.code === 'KeyT') return e.preventDefault(), st.newTab();
    },
    create(win, args) {
      const st = (win.state_ = { tabs: [], active: null, zoomLevel: 1 });
      const tabsEl = h('div.sf-tabs');
      const addr = h('input.sf-addr', { id: 'safari-addr-' + win.id, type: 'text', placeholder: '搜索或输入网站名称', spellcheck: 'false', autocomplete: 'off' });
      const addrDisplay = h('div.sf-addr-display');
      const progress = h('div.sf-progress');
      const addrWrap = h('div.sf-addr-wrap', h('span.sf-addr-ico', { html: glyph('search') }), addr, addrDisplay, h('button.sf-reload', { 'aria-label': '重新载入', title: '重新载入', html: glyph('reload'), onclick: () => st.reload() }), progress);
      const backBtn = h('button.tb-btn', { 'aria-label': '返回', html: glyph('chevron-left'), onclick: () => st.back() });
      const fwdBtn = h('button.tb-btn', { 'aria-label': '前进', html: glyph('chevron-right'), onclick: () => st.fwd() });
      const toolbar = h('div.tbar.sf-bar', { 'data-drag': '' },
        h('div.tb-group', h('button.tb-btn', { 'aria-label': '边栏', title: '显示边栏', html: glyph('sidebar'), onclick: () => root.classList.toggle('sf-side-open') }), backBtn, fwdBtn),
        h('div.tb-spacer', { 'data-drag': '' }),
        h('button.tb-btn.sf-shield', { 'aria-label': '隐私报告', title: '隐私报告', html: glyph('shield-half'), onclick: () => OS.toast('Safari 已阻止 12 个跟踪器对你进行画像', 'shield') }),
        addrWrap,
        h('div.tb-spacer', { 'data-drag': '' }),
        h('div.tb-group',
          h('button.tb-btn', { 'aria-label': '共享', title: '共享', html: glyph('share'), onclick: () => st.share() }),
          h('button.tb-btn', { 'aria-label': '新建标签页', title: '新建标签页', html: glyph('plus'), onclick: () => st.newTab() }),
          h('button.tb-btn', { 'aria-label': '标签页概览', title: '显示标签页概览', html: glyph('tabs'), onclick: () => st.overview() })
        )
      );
      const views = h('div.sf-views');
      const side = h('aside.sf-side',
        h('div.sb-head', '书签'),
        ...FAVORITES.slice(0, 6).map((f) => h('div.sb-item', { onclick: () => st.nav(f.url) }, h('span.sb-ico', { html: glyph('bookmark') }), h('span.sb-label', f.name))),
        h('div.sb-head', '阅读列表'),
        h('div.sb-item', { onclick: () => st.nav('https://zh.wikipedia.org/wiki/苹果公司') }, h('span.sb-ico', { html: glyph('book') }), h('span.sb-label', '苹果公司 - 维基百科'))
      );
      const root = h('div.app.safari', toolbar, tabsEl, h('div.sf-main', side, views));
      win.body.appendChild(root);

      function tabEl(t) {
        const el = h('div.sf-tab', { role: 'tab' }, h('span.sf-tab-ico', t.url.startsWith('safari:') ? { html: glyph('star') } : monogram(t.title || host(t.url) || '·', '#8e8e93')), h('span.sf-tab-title', t.title || '起始页'), h('button.sf-tab-x', { 'aria-label': '关闭标签页', html: glyph('xmark'), onclick: (e) => (e.stopPropagation(), st.closeTab(t)) }));
        el.onclick = () => st.select(t);
        el.onauxclick = (e) => e.button === 1 && st.closeTab(t);
        return el;
      }
      function renderTabs() {
        tabsEl.innerHTML = '';
        tabsEl.hidden = st.tabs.length < 2;
        st.tabs.forEach((t) => {
          t.tabEl = tabEl(t);
          t.tabEl.classList.toggle('on', t === st.active);
          tabsEl.appendChild(t.tabEl);
        });
      }
      function updateBar() {
        const t = st.active;
        if (!t) return;
        backBtn.disabled = t.i <= 0;
        fwdBtn.disabled = t.i >= t.hist.length - 1;
        if (document.activeElement !== addr) {
          addr.value = t.url.startsWith('safari:') ? '' : t.url;
          addrDisplay.innerHTML = '';
          if (!t.url.startsWith('safari:')) addrDisplay.append(h('span.sf-lock', { html: glyph('lock-fill') }), host(t.url).replace(/^www\./, ''));
        }
        addrWrap.classList.toggle('empty', t.url.startsWith('safari:'));
        win.setTitle(t.title || '起始页');
      }

      /* ---------- pages ---------- */
      function startPage(t) {
        const hist = OS.store.get('safari.history', []).slice(0, 6);
        const page = h('div.sf-start',
          h('div.sf-start-bg', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }),
          h('div.sf-start-inner',
            h('h2', '个人收藏'),
            h('div.sf-fav-grid', FAVORITES.map((f) => h('button.sf-fav', { onclick: () => st.nav(f.url) }, monogram(f.name, f.c), h('span', f.name)))),
            hist.length ? h('h2', '经常访问') : null,
            hist.length ? h('div.sf-fav-grid.small', hist.map((x) => h('button.sf-fav', { onclick: () => st.nav(x.url) }, monogram(x.title || host(x.url), '#636366'), h('span', x.title || host(x.url))))) : null,
            h('h2', '隐私报告'),
            h('div.sf-privacy', h('span.sf-priv-ico', { html: glyph('shield-half') }), h('div', h('b', '12'), h('p', '在过去七天里，Safari 浏览器阻止了 12 个跟踪器对你进行画像，并对它们隐藏了你的 IP 地址。'))),
            h('h2', '阅读列表'),
            h('div.sf-reading',
              ...[['macOS Tahoe 的 Liquid Glass 设计', 'zh.wikipedia.org', 'https://zh.wikipedia.org/wiki/MacOS_Tahoe'], ['Apple 人机界面指南', 'developer.apple.com', 'https://developer.apple.com/cn/design/human-interface-guidelines/'], ['太浩湖', 'zh.wikipedia.org', 'https://zh.wikipedia.org/wiki/太浩湖']].map(([t2, d, u]) =>
                h('button.sf-read', { onclick: () => st.nav(u) }, h('div.sf-read-thumb', { style: { backgroundImage: `url("${OS.wallpaperThumb(['tahoe-light', 'sequoia-light', 'tahoe-beach-day'][d.length % 3])}")` } }), h('div', h('b', t2), h('small', d)))
              )
            )
          )
        );
        return page;
      }
      function errorPage(title, msg, url) {
        return h('div.sf-error', h('div.sf-err-ico', { html: glyph('globe') }), h('h1', title), h('p', msg), url ? h('a.btn.primary', { href: url, target: '_blank', rel: 'noopener' }, '在新的浏览器标签页中打开') : null);
      }
      function loadInto(t) {
        t.view.innerHTML = '';
        progress.className = 'sf-progress';
        const url = t.url;
        if (url === 'safari:start') {
          t.title = '起始页';
          t.view.appendChild(startPage(t));
          return done();
        }
        if (!OS.settings.wifi) {
          t.title = '无法打开页面';
          t.view.appendChild(errorPage('你未接入互联网。', '你的电脑似乎未接入互联网。打开控制中心中的 Wi-Fi 后再试。'));
          return done();
        }
        const hn = host(url);
        t.title = hn.replace(/^www\./, '');
        if (BLOCKED.test(hn)) {
          t.view.appendChild(errorPage('该网站不允许在其他页面中显示', `“${hn}”通过安全策略禁止被嵌入到其他网页里，所以无法在这台虚拟 Mac 的 Safari 中显示。`, url));
          return done();
        }
        const frame = h('iframe.sf-frame', { src: url, title: hn, referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox' });
        frame.style.zoom = st.zoomLevel;
        const hint = h('div.sf-hint', '如果页面一直空白，说明该网站禁止被嵌入。', h('a', { href: url, target: '_blank', rel: 'noopener' }, '在新标签页中打开'));
        t.view.append(frame, hint);
        progress.classList.add('loading');
        let loaded = false;
        frame.addEventListener('load', () => {
          loaded = true;
          if (/wikipedia/.test(hn)) {
            const m = decodeURIComponent(url).match(/wiki\/([^?#]+)|search=([^&]+)/);
            if (m) t.title = (m[1] || m[2]).replace(/_/g, ' ') + ' - 维基百科';
          }
          done();
          setTimeout(() => hint.classList.add('fade'), 2500);
        });
        setTimeout(() => !loaded && (done(), hint.classList.add('show')), 6000);
        updateBar();
        renderTabs();
      }
      function done() {
        progress.className = 'sf-progress done';
        setTimeout(() => (progress.className = 'sf-progress'), 400);
        updateBar();
        renderTabs();
      }
      // replace inner done for iframe load
      const _load = loadInto;

      /* ---------- tab API ---------- */
      st.newTab = (url = 'safari:start') => {
        const t = { id: OS.uid(), url, hist: [url], i: 0, view: h('div.sf-view') };
        views.appendChild(t.view);
        st.tabs.push(t);
        st.select(t);
        _load(t);
        if (url === 'safari:start') setTimeout(() => addr.focus(), 60);
        return t;
      };
      st.select = (t) => {
        st.active = t;
        st.tabs.forEach((x) => x.view.classList.toggle('on', x === t));
        renderTabs();
        updateBar();
      };
      st.closeTab = (t) => {
        if (!t) return;
        const i = st.tabs.indexOf(t);
        st.tabs.splice(i, 1);
        t.view.remove();
        if (!st.tabs.length) return win.close();
        if (st.active === t) st.select(st.tabs[Math.max(0, i - 1)]);
        renderTabs();
      };
      st.nav = (url) => {
        const t = st.active;
        if (!t) return st.newTab(url);
        t.hist = t.hist.slice(0, t.i + 1);
        t.hist.push(url);
        t.i = t.hist.length - 1;
        t.url = url;
        _load(t);
        if (!url.startsWith('safari:')) {
          const hs = OS.store.get('safari.history', []).filter((x) => x.url !== url);
          setTimeout(() => {
            hs.unshift({ url, title: t.title, time: Date.now() });
            OS.store.set('safari.history', hs.slice(0, 40));
          }, 1200);
        }
      };
      st.back = () => {
        const t = st.active;
        if (!t || t.i <= 0) return;
        t.i--;
        t.url = t.hist[t.i];
        _load(t);
      };
      st.fwd = () => {
        const t = st.active;
        if (!t || t.i >= t.hist.length - 1) return;
        t.i++;
        t.url = t.hist[t.i];
        _load(t);
      };
      st.reload = () => st.active && _load(st.active);
      st.focusAddress = () => (addr.focus(), addr.select());
      st.zoom = (d) => {
        st.zoomLevel = d === 0 ? 1 : Math.min(3, Math.max(0.5, st.zoomLevel + d));
        $$('iframe', views).forEach((f) => (f.style.zoom = st.zoomLevel));
        $$('.sf-start-inner', views).forEach((f) => (f.style.zoom = st.zoomLevel));
      };
      st.bookmark = () => {
        const t = st.active;
        if (!t || t.url.startsWith('safari:')) return;
        const b = OS.store.get('safari.bookmarks', []);
        b.push({ url: t.url, title: t.title });
        OS.store.set('safari.bookmarks', b);
        OS.toast('已添加到书签', 'bookmark');
      };
      st.share = () => {
        const t = st.active;
        if (!t || t.url.startsWith('safari:')) return;
        navigator.clipboard && navigator.clipboard.writeText(t.url).then(() => OS.toast('已拷贝链接', 'square-on-square'), () => OS.toast(t.url));
      };
      st.overview = () => {
        if (root.querySelector('.sf-overview')) return root.querySelector('.sf-overview').remove();
        const ov = h('div.sf-overview', h('div.sf-ov-grid', st.tabs.map((t) => {
          const card = h('div.sf-ov-card' + (t === st.active ? '.on' : ''), h('div.sf-ov-thumb', t.url === 'safari:start' ? h('div.sf-ov-start', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }) : monogram(t.title || '·', '#8e8e93')), h('div.sf-ov-title', t.title || '起始页'));
          card.onclick = () => (st.select(t), ov.remove());
          return card;
        }), h('button.sf-ov-new', { 'aria-label': '新建标签页', html: glyph('plus'), onclick: () => (ov.remove(), st.newTab()) })));
        root.appendChild(ov);
      };

      addr.addEventListener('focus', () => {
        addrWrap.classList.add('focus');
        setTimeout(() => addr.select(), 0);
      });
      addr.addEventListener('blur', () => (addrWrap.classList.remove('focus'), updateBar()));
      addr.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const u = toUrl(addr.value);
          if (u) {
            addr.blur();
            st.nav(u);
          }
        }
        if (e.key === 'Escape') addr.blur();
      });
      addrDisplay.addEventListener('click', () => addr.focus());

      st.newTab(args.url || (args.search ? toUrl(args.search) : 'safari:start'));
    },
  });
})();
