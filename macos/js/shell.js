/* Shell: menus, menu bar, Dock, desktop icons, appearance, keyboard shortcuts, hot corners. */
(function () {
  const { h, $, $$, clamp, glyph } = OS;
  const wm = OS.wm;

  /* ======================================================================
     Generic menus (menu bar dropdowns, context menus, submenus)
     ====================================================================== */
  let openMenus = [];
  OS.closeMenus = (instant) => {
    openMenus.forEach((m) => {
      if (instant || OS.reducedMotion()) return m.remove();
      m.classList.add('closing');
      setTimeout(() => m.remove(), 170);
    });
    openMenus = [];
    $$('.mb-item.open').forEach((x) => x.classList.remove('open'));
    menubarActive = false;
  };

  /** items: [{label, key, action, disabled, checked, sep, submenu, head, glyph, img, danger, custom}] */
  /* holding Option turns some menu items into their alternates, like AppKit's alternate menu items */
  const appWins = () => wm.appWindows(wm.activeApp()).filter((w) => !w.closed);
  function autoAlt(it) {
    const l = it.label;
    if (l === '关闭窗口' || l === '关闭') return { label: '全部关闭', key: '⌥⌘W', action: () => appWins().forEach((w) => wm.close(w)) };
    if (l === '最小化') return { label: '全部最小化', key: '⌥⌘M', action: () => appWins().forEach((w) => w.state !== 'min' && wm.minimize(w)) };
    if (l === '缩放') return { label: '全部缩放', action: () => appWins().forEach((w) => wm.zoom(w)) };
    if (/^退出“/.test(l)) return { label: '退出并保留窗口', key: '⌥⌘Q', action: it.action };
    if (l === '关于本机') return { label: '系统信息…', action: () => OS.launch('about') };
    if (l === '重新启动…') return { label: '重新启动', action: () => OS.power.restart() };
    if (l === '关机…') return { label: '关机', action: () => OS.power.shutdown() };
    if (/^隐藏“/.test(l)) return { label: '隐藏其他', key: '⌥⌘H', action: () => OS.hideOthers(wm.activeApp()) };
    if (l === '全部置于顶层') return { label: '排列在前面', action: () => wm.tileAll && wm.tileAll() };
    return null;
  }
  const optDown = (on) => document.body.classList.toggle('opt-down', on);
  window.addEventListener('keydown', (e) => e.key === 'Alt' && optDown(true));
  window.addEventListener('keyup', (e) => e.key === 'Alt' && optDown(false));
  window.addEventListener('blur', () => optDown(false));
  OS.buildMenu = function (items, level = 0) {
    const menu = h('div.menu', { role: 'menu' });
    let subTimer;
    items.forEach((it) => {
      if (!it) return;
      if (it.sep) return menu.appendChild(h('div.menu-sep'));
      if (it.head) return menu.appendChild(h('div.menu-head', it.head));
      if (it.custom) return menu.appendChild(it.custom);
      const alt = !it.submenu && !it.disabled ? it.alt || autoAlt(it) : null;
      const row = h('div.menu-item' + (it.disabled ? '.disabled' : '') + (it.danger ? '.danger' : '') + (alt ? '.has-alt' : ''), { role: 'menuitem', tabindex: -1 },
        h('span.mi-check', it.checked ? '✓' : ''),
        it.img ? h('img.mi-img', { src: it.img, alt: '' }) : it.glyph ? h('span.mi-glyph', { html: glyph(it.glyph) }) : null,
        h('span.mi-label' + (alt ? '.mi-main' : ''), it.label),
        alt ? h('span.mi-label.mi-alt', alt.label) : null,
        it.key || alt ? h('span.mi-key' + (alt ? '.mi-main' : ''), it.key || '') : null,
        alt ? h('span.mi-key.mi-alt', alt.key || '') : null,
        it.submenu ? h('span.mi-arrow', { html: glyph('chevron-right') }) : null
      );
      if (it.swatch) row.insertBefore(h('span.mi-swatch', { style: { background: it.swatch } }), row.querySelector('.mi-label'));
      if (it.submenu) {
        const openSub = () => {
          clearTimeout(subTimer);
          $$('.menu', document).forEach((m) => {
            if (+m.dataset.level > level) {
              m.remove();
              openMenus = openMenus.filter((x) => x !== m);
            }
          });
          menu.querySelectorAll('.menu-item.sub-open').forEach((x) => x.classList.remove('sub-open'));
          row.classList.add('sub-open');
          const sub = OS.buildMenu(typeof it.submenu === 'function' ? it.submenu() : it.submenu, level + 1);
          const r = row.getBoundingClientRect();
          OS.showMenu(sub, { x: r.right / OS.scale - 4, y: r.top / OS.scale - 6, keep: true, level: level + 1, flipFrom: r.left / OS.scale });
        };
        row.addEventListener('mouseenter', () => (subTimer = setTimeout(openSub, 120)));
        row.addEventListener('click', openSub);
      } else {
        row.addEventListener('mouseenter', () => {
          clearTimeout(subTimer);
          subTimer = setTimeout(() => {
            $$('.menu').forEach((m) => {
              if (+m.dataset.level > level) {
                m.remove();
                openMenus = openMenus.filter((x) => x !== m);
              }
            });
            menu.querySelectorAll('.menu-item.sub-open').forEach((x) => x.classList.remove('sub-open'));
          }, 150);
        });
        if (!it.disabled)
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            // macOS blinks the chosen item before closing
            row.classList.add('blink');
            const act = alt && (e.altKey || document.body.classList.contains('opt-down')) ? alt.action : it.action;
            setTimeout(() => {
              OS.closeMenus();
              act && act();
            }, 110);
          });
      }
      menu.appendChild(row);
    });
    return menu;
  };

  OS.showMenu = function (menu, { x, y, keep, level = 0, flipFrom, minWidth, align } = {}) {
    if (!keep) OS.closeMenus(true);
    menu.dataset.level = level;
    if (minWidth) menu.style.minWidth = minWidth + 'px';
    $('#overlays').appendChild(menu);
    const scr = wm.screen();
    const mw = menu.offsetWidth,
      mh = menu.offsetHeight;
    if (align === 'right') x = x - mw;
    if (x + mw > scr.w - 4) x = flipFrom != null ? flipFrom - mw + 4 : scr.w - mw - 4;
    if (y + mh > scr.h - 4) y = Math.max(wm.menubarH() + 2, scr.h - mh - 4);
    menu.style.left = Math.max(4, x) + 'px';
    menu.style.top = y + 'px';
    openMenus.push(menu);
    return menu;
  };

  OS.contextMenu = (e, items) => {
    e.preventDefault();
    e.stopPropagation();
    const p = wm.pt(e);
    OS.showMenu(OS.buildMenu(items), { x: p.x + 1, y: p.y + 1 });
  };

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.menu') && !e.target.closest('.mb-item')) OS.closeMenus();
  });

  /* keyboard navigation inside the last opened menu */
  document.addEventListener('keydown', (e) => {
    if (!openMenus.length) return;
    const menu = openMenus[openMenus.length - 1];
    const items = $$('.menu-item:not(.disabled)', menu);
    let i = items.findIndex((x) => x.classList.contains('kb'));
    if (e.key === 'Escape') {
      OS.closeMenus();
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      items.forEach((x) => x.classList.remove('kb'));
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[i] && items[i].classList.add('kb');
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      items[i].click();
    }
  }, true);

  /* ======================================================================
     Menu bar
     ====================================================================== */
  let menubarActive = false;
  const mb = {};
  OS.menubar = mb;

  function appleMenu() {
    const recents = OS.store.get('recentApps', []).slice(0, 6);
    return [
      { label: '关于本机', action: () => OS.launch('about') },
      { sep: true },
      { label: '系统设置…', action: () => OS.launch('settings') },
      { label: 'App Store…', action: () => OS.launch('appstore') },
      { sep: true },
      {
        label: '最近使用的项目',
        submenu: () => [
          { head: '应用程序' },
          ...(recents.length ? recents.map((id) => OS.apps[id] && { label: OS.apps[id].name, img: OS.icon(OS.apps[id].icon), action: () => OS.launch(id) }) : [{ label: '无', disabled: true }]),
          { sep: true },
          { label: '清除菜单', action: () => OS.store.set('recentApps', []) },
        ],
      },
      { sep: true },
      { label: '强制退出…', key: '⌥⌘⎋', action: () => OS.forceQuit() },
      { sep: true },
      { label: '睡眠', action: () => OS.power.sleep() },
      { label: '重新启动…', action: () => OS.power.confirm('restart') },
      { label: '关机…', action: () => OS.power.confirm('shutdown') },
      { sep: true },
      { label: '锁定屏幕', key: '⌃⌘Q', action: () => OS.power.lock() },
      { label: `退出登录“${OS.user.name}”…`, key: '⇧⌘Q', action: () => OS.power.confirm('logout') },
    ];
  }

  function appMenu(app) {
    return [
      { label: `关于“${app.name}”`, action: () => OS.aboutApp(app) },
      { sep: true },
      { label: '设置…', key: '⌘,', action: () => (app.settings ? app.settings() : OS.launch('settings')) },
      { sep: true },
      { label: '服务', submenu: [{ label: '没有可用的服务', disabled: true }, { label: '服务设置…', action: () => OS.launch('settings', { pane: 'keyboard' }) }] },
      { sep: true },
      { label: `隐藏“${app.name}”`, key: '⌘H', action: () => OS.hideApp(app.id) },
      { label: '隐藏其他', key: '⌥⌘H', action: () => OS.hideOthers(app.id) },
      { label: '全部显示', action: () => OS.showAllApps() },
      { sep: true },
      app.id === 'finder' ? { label: '清倒废纸篓…', key: '⇧⌘⌫', action: () => OS.emptyTrash() } : { label: `退出“${app.name}”`, key: '⌘Q', action: () => wm.quit(app.id) },
    ];
  }

  const exec = (cmd) => () => {
    try {
      document.execCommand(cmd);
    } catch (e) {}
  };
  const defaultEdit = () => [
    { label: '撤销', key: '⌘Z', action: exec('undo') },
    { label: '重做', key: '⇧⌘Z', action: exec('redo') },
    { sep: true },
    { label: '剪切', key: '⌘X', action: exec('cut') },
    { label: '拷贝', key: '⌘C', action: exec('copy') },
    { label: '粘贴', key: '⌘V', action: () => OS.toast('请使用键盘 ⌘V 粘贴') },
    { label: '全选', key: '⌘A', action: exec('selectAll') },
    { sep: true },
    { label: '自动填充', disabled: true },
    { label: '开始听写…', disabled: true },
    { label: '表情与符号', key: '🌐E', action: () => OS.emoji.open() },
  ];

  function windowMenu() {
    const w = wm.focused;
    const appId = wm.activeApp();
    const wins = wm.appWindows(appId);
    return [
      { label: '最小化', key: '⌘M', disabled: !w, action: () => w && wm.minimize(w) },
      { label: '缩放', disabled: !w, action: () => w && wm.zoom(w) },
      { label: '填充', key: '⌃🌐F', disabled: !w, action: () => w && wm.tile(w, 'fill') },
      { label: '居中', key: '⌃🌐C', disabled: !w, action: () => w && wm.tile(w, 'center') },
      { sep: true },
      {
        label: '移动与调整大小',
        disabled: !w,
        submenu: [
          { head: '移动与调整大小' },
          { label: '左', key: '⌃🌐←', action: () => wm.tile(w, 'left') },
          { label: '右', key: '⌃🌐→', action: () => wm.tile(w, 'right') },
          { label: '上', key: '⌃🌐↑', action: () => wm.tile(w, 'top') },
          { label: '下', key: '⌃🌐↓', action: () => wm.tile(w, 'bottom') },
          { sep: true },
          { label: '左上', action: () => wm.tile(w, 'tl') },
          { label: '右上', action: () => wm.tile(w, 'tr') },
          { label: '左下', action: () => wm.tile(w, 'bl') },
          { label: '右下', action: () => wm.tile(w, 'br') },
          { sep: true },
          { label: '返回', action: () => w.saved && ((w.state = 'normal'), (w.bounds = w.saved), wm.applyBounds(w)) },
        ],
      },
      { label: w && w.state === 'full' ? '退出全屏幕' : '进入全屏幕', key: '⌃⌘F', disabled: !w, action: () => w && wm.toggleFull(w) },
      { sep: true },
      { label: '移到下一个桌面', disabled: !w || OS.spaces.list.length < 2, action: () => OS.moveToSpace(w, OS.spaces.current + 1) },
      { sep: true },
      ...(w && OS.tabs && OS.tabs.supports(w.app)
        ? [
            { label: '新建标签页', action: () => OS.tabs.newTab(w) },
            { label: '显示上一个标签页', disabled: !w.tabGroup, action: () => OS.tabs.step(w, -1) },
            { label: '显示下一个标签页', disabled: !w.tabGroup, action: () => OS.tabs.step(w, 1) },
            { label: '将标签页移到新窗口', disabled: !w.tabGroup, action: () => OS.tabs.detach(w) },
            { label: '合并所有窗口', disabled: wins.filter((x) => x.state !== 'min').length < 2, action: () => OS.tabs.merge(appId) },
            { sep: true },
          ]
        : []),
      { label: '全部置于顶层', action: () => wm.focusApp(appId) },
      wins.length ? { sep: true } : null,
      ...wins.map((x) => ({ label: x.title, checked: x === w, action: () => wm.focus(x) })),
    ];
  }

  function helpMenu(app) {
    const field = h('input.menu-search', { id: 'help-search', type: 'search', placeholder: '搜索' });
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && field.value.trim()) {
        OS.closeMenus();
        OS.spotlight.open(field.value.trim());
      }
    });
    field.addEventListener('pointerdown', (e) => e.stopPropagation());
    setTimeout(() => field.focus(), 40);
    return [
      { custom: h('div.menu-search-wrap', h('span.mi-label', '搜索'), field) },
      { sep: true },
      { label: `“${app.name}”使用手册`, action: () => OS.launch('textedit', { path: '~/Desktop/欢迎使用 macOS.txt' }) },
      { label: '键盘快捷键', action: () => OS.showShortcuts() },
    ];
  }

  function menusFor(appId) {
    const app = OS.apps[appId] || OS.apps.finder;
    const list = [{ title: glyph('apple'), id: 'apple', items: appleMenu, cls: 'apple' }, { title: app.name, id: 'app', items: () => appMenu(app), cls: 'bold' }];
    const ms = typeof app.menus === 'function' ? app.menus(wm.focused && wm.focused.app === app ? wm.focused : null) : app.menus;
    let hasEdit = false;
    ms.forEach((m, i) => {
      if (m.title === '编辑') hasEdit = true;
      list.push({ title: m.title, id: 'm' + i, items: typeof m.items === 'function' ? m.items : () => m.items });
    });
    if (!hasEdit && app.id !== 'finder' && app.editMenu !== false) list.splice(3, 0, { title: '编辑', id: 'edit', items: defaultEdit });
    list.push({ title: '窗口', id: 'window', items: windowMenu });
    list.push({ title: '帮助', id: 'help', items: () => helpMenu(app) });
    return list;
  }

  function renderMenubar(appId) {
    const left = $('#mb-left');
    left.innerHTML = '';
    menusFor(appId).forEach((m) => {
      const el = h('div.mb-item' + (m.cls ? '.' + m.cls : ''), { role: 'menuitem', tabindex: 0, html: m.cls === 'apple' ? m.title : OS.esc(m.title) });
      const open = () => {
        OS.closeMenus(true);
        el.classList.add('open');
        menubarActive = true;
        const r = el.getBoundingClientRect();
        const menu = OS.buildMenu(m.items());
        OS.showMenu(menu, { x: r.left / OS.scale, y: wm.menubarH() + 1, keep: true });
        menubarActive = true;
        menu.classList.add('from-menubar');
      };
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (el.classList.contains('open')) OS.closeMenus();
        else open();
      });
      el.addEventListener('mouseenter', () => {
        if (menubarActive && !el.classList.contains('open')) open();
      });
      el.addEventListener('keydown', (e) => e.key === 'Enter' && open());
      left.appendChild(el);
    });
  }

  function buildMenubar() {
    const bar = $('#menubar');
    bar.innerHTML = '';
    const right = h('div#mb-right');
    bar.append(h('div#mb-left'), right);

    const item = (id, html, onClick, title) => {
      const el = h('div.mb-item.mb-status', { id, html, title, role: 'button', tabindex: 0 });
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onClick(el, e);
      });
      return el;
    };
    mb.nowPlaying = item('mb-np', '', (el) => OS.launch('music'), '正在播放');
    mb.nowPlaying.hidden = true;
    mb.battery = item('mb-battery', '', (el) => batteryMenu(el), '电池');
    mb.wifi = item('mb-wifi', glyph('wifi'), (el) => wifiMenu(el), 'Wi-Fi');
    mb.search = item('mb-search', glyph('search'), () => OS.spotlight.toggle(), '聚焦');
    mb.cc = item('mb-cc', glyph('control'), () => OS.cc.toggle(), '控制中心');
    mb.siri = item('mb-siri', '<span class="siri-orb-mini"></span>', () => OS.siri.toggle(), 'Siri');
    mb.clock = item('mb-clock', '', () => OS.nc.toggle(), '通知中心');
    right.append(mb.nowPlaying, mb.battery, mb.wifi, mb.search, mb.cc, mb.siri, mb.clock);
    renderMenubar('finder');
    updateClock();
    updateWifi();
    updateBattery();
  }

  function updateClock() {
    if (mb.clock) mb.clock.textContent = OS.fmt.menubar(new Date());
  }
  setInterval(updateClock, 1000);
  OS.on('setting:clock24', updateClock);
  OS.on('setting:clockSeconds', updateClock);

  function updateWifi() {
    mb.wifi && (mb.wifi.innerHTML = glyph(OS.settings.wifi ? 'wifi' : 'wifi-off'));
  }
  OS.on('setting:wifi', updateWifi);

  /* battery: real level via Battery Status API when the browser exposes it */
  OS.battery = { level: 0.86, charging: false };
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const upd = () => {
        OS.battery.level = b.level;
        OS.battery.charging = b.charging;
        OS.battery.real = true;
        updateBattery();
        OS.emit('battery');
      };
      upd();
      b.addEventListener('levelchange', upd);
      b.addEventListener('chargingchange', upd);
    }).catch(() => {});
  }
  function batteryIcon(level, charging) {
    const w = Math.max(1.5, 14 * level);
    const col = level <= 0.2 && !charging ? '#ff3b30' : 'currentColor';
    return `<svg class="batt" viewBox="0 0 28 13"><rect x=".7" y=".7" width="23" height="11.6" rx="3.2" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="2.6" y="2.6" width="${(w / 14) * 19.2}" height="7.8" rx="1.7" fill="${col}"/><path d="M25.6 4.6v3.8" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>${charging ? '<path d="M13.6 1.6L9.6 7h3l-.9 4.4 4.2-5.6h-3z" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>' : ''}</svg>`;
  }
  OS.batteryIcon = batteryIcon;
  function updateBattery() {
    if (!mb.battery) return;
    mb.battery.hidden = !OS.settings.showBattery;
    mb.battery.innerHTML = `<span class="batt-pct">${Math.round(OS.battery.level * 100)}%</span>` + batteryIcon(OS.battery.level, OS.battery.charging);
  }
  OS.on('setting:showBattery', updateBattery);

  function batteryMenu(el) {
    const r = el.getBoundingClientRect();
    const pct = Math.round(OS.battery.level * 100);
    OS.showMenu(
      OS.buildMenu([
        { custom: h('div.menu-title-row', h('b', '电池'), h('span', pct + '%')) },
        { custom: h('div.menu-note', OS.battery.charging ? '电源：电源适配器' : '电源：电池') },
        { sep: true },
        { head: '使用大量能耗的应用' },
        ...(wm.windows.length ? [...new Set(wm.windows.map((w) => w.app))].slice(0, 3).map((a) => ({ label: a.name, img: OS.icon(a.icon), action: () => OS.launch(a.id) })) : [{ label: '没有应用使用大量能耗', disabled: true }]),
        { sep: true },
        { label: '电池设置…', action: () => OS.launch('settings', { pane: 'battery' }) },
      ]),
      { x: r.right / OS.scale, y: wm.menubarH() + 1, align: 'right', minWidth: 270 }
    );
  }

  function wifiMenu(el) {
    const r = el.getBoundingClientRect();
    const toggle = h('label.switch', h('input', { type: 'checkbox', id: 'wifi-menu-switch', checked: OS.settings.wifi, onchange: (e) => (OS.setSetting('wifi', e.target.checked), OS.closeMenus(), setTimeout(() => wifiMenu(el), 10)) }), h('span'));
    const nets = ['Apple Park', 'Tahoe-5G', 'Starbucks WiFi', 'CMCC-Home', 'ChinaNet-8H2K'];
    const strength = (i) => `<span class="wifi-mini s${3 - Math.min(2, i >> 1)}">${glyph('wifi')}</span>`;
    OS.showMenu(
      OS.buildMenu([
        { custom: h('div.menu-title-row', h('b', 'Wi-Fi'), toggle) },
        ...(OS.settings.wifi
          ? [
              { sep: true },
              { head: '已连接网络' },
              { custom: h('div.menu-item.net.connected', h('span.net-icon', { html: glyph('wifi') }), h('span.mi-label', OS.store.get('wifiName', 'Apple Park')), h('span.mi-key', { html: glyph('lock') })) },
              { sep: true },
              { head: '其他网络' },
              ...nets
                .filter((n) => n !== OS.store.get('wifiName', 'Apple Park'))
                .map((n, i) => ({
                  custom: (() => {
                    const row = h('div.menu-item.net', h('span.net-icon.dim', { html: strength(i) }), h('span.mi-label', n), h('span.mi-key', { html: i % 2 ? '' : glyph('lock') }));
                    row.onclick = () => {
                      OS.closeMenus();
                      OS.store.set('wifiName', n);
                      OS.notify({ app: 'settings', title: 'Wi-Fi', body: `已连接到“${n}”` });
                    };
                    return row;
                  })(),
                })),
            ]
          : []),
        { sep: true },
        { label: 'Wi-Fi 设置…', action: () => OS.launch('settings', { pane: 'wifi' }) },
      ]),
      { x: r.right / OS.scale, y: wm.menubarH() + 1, align: 'right', minWidth: 280 }
    );
  }

  OS.on('focus', (appId) => {
    renderMenubar(appId);
    if (appId && appId !== 'finder') {
      const rec = OS.store.get('recentApps', []).filter((x) => x !== appId);
      rec.unshift(appId);
      OS.store.set('recentApps', rec.slice(0, 10));
    }
  });
  OS.on('window:title', () => {});
  OS.refreshMenubar = () => renderMenubar(wm.focused ? wm.focused.app.id : wm.ghostApp || 'finder');

  /* hide / show apps (⌘H) */
  OS.hideApp = (appId) => {
    wm.appWindows(appId).forEach((w) => {
      if (w.state === 'min') return;
      w.hiddenApp = true;
      w.el.classList.add('app-hidden');
    });
    const next = wm.windows.filter((w) => !w.hiddenApp && !w.tabHidden && w.state !== 'min' && w.space === OS.spaces.currentSpace()).sort((a, b) => b.z - a.z)[0];
    next ? wm.focus(next) : wm.blurAll();
  };
  OS.hideOthers = (appId) => [...OS.running.keys()].filter((id) => id !== appId).forEach(OS.hideApp);
  OS.showAllApps = () => wm.windows.forEach((w) => ((w.hiddenApp = false), w.el.classList.remove('app-hidden')));
  OS.on('focus', (appId) => wm.appWindows(appId).forEach((w) => ((w.hiddenApp = false), w.el.classList.remove('app-hidden'))));

  OS.moveToSpace = (win, i) => {
    if (!win || i < 0 || i >= OS.spaces.list.length) return;
    win.space = OS.spaces.list[i];
    win.space.el.appendChild(win.el);
    OS.spaces.go(i);
    wm.focus(win);
  };

  OS.aboutApp = (app) => {
    OS.alert({ title: app.name, icon: OS.icon(app.icon), message: `版本 ${app.version || '26.1'}\n\n© 2026 macOS Tahoe Web。界面复刻自 Apple 设计，仅供学习与演示。` });
  };

  /* ======================================================================
     Dock
     ====================================================================== */
  const DEFAULT_PINNED = ['finder', 'launchpad', 'safari', 'messages', 'mail', 'maps', 'photos', 'facetime', 'calendar', 'reminders', 'notes', 'music', 'freeform', 'appstore', 'settings', 'terminal'];
  // apps register after this file loads, so unknown ids are filtered at render time
  const dock = (OS.dock = { pinned: OS.store.get('dock.pinned', DEFAULT_PINNED) });
  let dockEl, mouseX = null, mouseY = null, rafPending = false;

  function dockItem(appId, extraCls = '') {
    const app = OS.apps[appId];
    const el = h('div.dock-item' + extraCls, { dataset: { app: appId }, role: 'button', tabindex: 0, 'aria-label': app.name },
      h('div.dock-label', app.name),
      h('div.dock-icon', appId === 'calendar' ? OS.calendarIcon() : h('img', { src: OS.icon(app.icon), alt: '', draggable: 'false' })),
      h('div.dock-dot')
    );
    el.addEventListener('click', () => {
      if (el._dragged) return;
      if (appId === 'launchpad' || appId === 'trash') return OS.launch(appId);
      const wins = wm.appWindows(appId);
      if (wins.length) {
        const vis = wins.filter((w) => w.state !== 'min' && !w.hiddenApp && !w.tabHidden);
        if (vis.length && wm.focused && wm.focused.app.id === appId && vis.length === wins.length) {
          wm.focusApp(appId);
        } else if (vis.length) wm.focusApp(appId);
        else {
          OS.showAllApps();
          const m = wins.filter((w) => w.state === 'min').sort((a, b) => b.z - a.z)[0];
          m ? wm.restore(m) : wm.focusApp(appId);
        }
      } else if (OS.running.has(appId) && appId !== 'finder') {
        OS.newWindow(appId);
      } else OS.launch(appId);
    });
    el.addEventListener('keydown', (e) => e.key === 'Enter' && el.click());
    el.addEventListener('contextmenu', (e) => dockContext(e, appId));
    enableDockDrag(el, appId);
    return el;
  }

  function dockContext(e, appId) {
    const app = OS.apps[appId];
    const wins = wm.appWindows(appId);
    const running = OS.running.has(appId);
    const pinned = dock.pinned.includes(appId);
    const items = [
      ...wins.map((w) => ({ label: w.title, checked: w === wm.focused, action: () => wm.restore(w) })),
      wins.length ? { sep: true } : null,
      appId !== 'finder' && appId !== 'trash'
        ? {
            label: '选项',
            submenu: [
              { label: '在程序坞中保留', checked: pinned, action: () => togglePin(appId) },
              { label: '登录时打开', checked: (OS.store.get('loginItems', []) || []).includes(appId), action: () => toggleLoginItem(appId) },
              { label: '在访达中显示', action: () => OS.launch('finder', { path: '/Applications', select: app.name + '.app' }) },
            ],
          }
        : null,
      appId === 'finder' ? { label: '新建访达窗口', action: () => OS.newWindow('finder') } : null,
      appId === 'finder' ? { label: '新建智能文件夹', disabled: true } : null,
      { sep: true },
      running && wins.length ? { label: '显示所有窗口', action: () => OS.mission.open(appId) } : null,
      running && wins.length ? { label: '隐藏', action: () => OS.hideApp(appId), alt: { label: '隐藏其他', action: () => OS.hideOthers(appId) } } : null,
      appId === 'trash' ? { label: '清倒废纸篓', disabled: !OS.vfs.trashCount(), action: () => OS.emptyTrash() } : null,
      appId === 'trash' ? { label: '打开', action: () => OS.launch('trash') } : null,
      running && appId !== 'finder' ? { label: '退出', action: () => wm.quit(appId), alt: { label: '强制退出', action: () => (wm.quit(appId), OS.sound && OS.sound.play && OS.sound.play('pop')) } } : !running && appId !== 'trash' && appId !== 'finder' ? { label: '打开', action: () => OS.launch(appId) } : null,
    ];
    OS.contextMenu(e, items);
  }
  function togglePin(appId) {
    dock.pinned = dock.pinned.includes(appId) ? dock.pinned.filter((x) => x !== appId) : [...dock.pinned, appId];
    OS.store.set('dock.pinned', dock.pinned);
    renderDock();
  }
  function toggleLoginItem(appId) {
    const l = OS.store.get('loginItems', []);
    OS.store.set('loginItems', l.includes(appId) ? l.filter((x) => x !== appId) : [...l, appId]);
  }
  dock.togglePin = togglePin;

  /* drag Dock icons to reorder; drag one out to remove it */
  function enableDockDrag(el, appId) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const start = wm.pt(e);
      let dragging = false,
        ghost,
        removeHint = false;
      el._dragged = false;
      const vertical = OS.settings.dockPosition !== 'bottom';
      const move = (ev) => {
        const p = wm.pt(ev);
        if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > 8) {
          if (!dock.pinned.includes(appId)) return;
          dragging = true;
          el._dragged = true;
          el.classList.add('dragging-src');
          ghost = h('img.dock-ghost', { src: OS.icon(OS.apps[appId].icon), alt: '' });
          ghost.style.width = ghost.style.height = OS.settings.dockSize + 'px';
          $('#overlays').appendChild(ghost);
        }
        if (!dragging) return;
        ghost.style.left = p.x - OS.settings.dockSize / 2 + 'px';
        ghost.style.top = p.y - OS.settings.dockSize / 2 + 'px';
        const dr = $('#dock').getBoundingClientRect();
        const far = vertical ? Math.abs(p.x - (dr.left + dr.width / 2) / OS.scale) > 140 : dr.top / OS.scale - p.y > 110;
        removeHint = far && appId !== 'finder';
        ghost.classList.toggle('remove', removeHint);
        if (!far) {
          // reorder among pinned
          const items = $$('.dock-item.pinned', dockEl);
          let idx = items.length;
          for (let i = 0; i < items.length; i++) {
            const r = items[i].getBoundingClientRect();
            const c = vertical ? (r.top + r.height / 2) / OS.scale : (r.left + r.width / 2) / OS.scale;
            if ((vertical ? p.y : p.x) < c) {
              idx = i;
              break;
            }
          }
          const cur = dock.pinned.indexOf(appId);
          if (idx > cur) idx--;
          if (idx !== cur && idx >= 1) {
            dock.pinned.splice(cur, 1);
            dock.pinned.splice(idx, 0, appId);
            const node = el;
            const ref = items.filter((x) => x !== node)[idx];
            ref ? ref.before(node) : items[items.length - 1].after(node);
          }
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!dragging) return;
        el.classList.remove('dragging-src');
        if (removeHint) {
          ghost.classList.add('poof');
          setTimeout(() => ghost.remove(), 400);
          OS.sound.play('pop');
          dock.pinned = dock.pinned.filter((x) => x !== appId);
        } else ghost.remove();
        OS.store.set('dock.pinned', dock.pinned);
        renderDock();
        setTimeout(() => (el._dragged = false), 50);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /* Keyed, incremental Dock rendering: existing items (and their images and listeners) are reused and
     only re-ordered, so launching or quitting an app never rebuilds or reloads the whole Dock. */
  const dockCache = new Map();
  function cached(key, make) {
    let el = dockCache.get(key);
    if (!el) dockCache.set(key, (el = make()));
    el._key = key;
    return el;
  }
  function renderDock() {
    dockEl = $('#dock');
    dock.pinned = dock.pinned.filter((id) => OS.apps[id]);
    const out = [];
    dock.pinned.forEach((id) => out.push(cached('p:' + id, () => dockItem(id, '.pinned'))));
    const extra = [...OS.running.keys()].filter((id) => !dock.pinned.includes(id) && OS.apps[id] && !OS.apps[id].hidden && !OS.apps[id].noDock);
    extra.forEach((id) => out.push(cached('r:' + id, () => dockItem(id))));
    if (OS.settings.dockShowRecents) {
      const rec = OS.store.get('recentApps', []).filter((id) => OS.apps[id] && !dock.pinned.includes(id) && !OS.running.has(id) && !OS.apps[id].noDock).slice(0, 3);
      if (rec.length) {
        out.push(cached('sep:recent', () => h('div.dock-sep')));
        rec.forEach((id) => out.push(cached('c:' + id, () => dockItem(id, '.recent'))));
      }
    }
    out.push(cached('sep:main', () => h('div.dock-sep')));
    out.push(cached('stack', () => {
      const dl = h('div.dock-item.stack', { role: 'button', tabindex: 0, 'aria-label': '下载' }, h('div.dock-label', '下载'), h('div.dock-icon', h('img', { src: OS.icon('folder-downloads'), alt: '', draggable: 'false' })), h('div.dock-dot'));
      dl.addEventListener('click', () => openStack(dl, '~/Downloads'));
      dl.addEventListener('contextmenu', (e) => OS.contextMenu(e, [{ label: '在访达中打开', action: () => OS.launch('finder', { path: '~/Downloads' }) }]));
      return dl;
    }));
    wm.windows.filter((w) => w.state === 'min').forEach((w) => {
      out.push(cached('m:' + w.id, () => {
        const m = h('div.dock-item.min-win', { dataset: { win: w.id }, role: 'button', tabindex: 0, 'aria-label': w.title }, h('div.dock-label', w.title), h('div.dock-icon', h('div.min-thumb', thumbFor(w)), h('img.min-badge', { src: OS.icon(w.app.icon), alt: '' })));
        m.addEventListener('click', () => wm.restore(w));
        return m;
      }));
    });
    out.push(cached('trash', () => {
      const tr = h('div.dock-item.trash', { dataset: { app: 'trash' }, role: 'button', tabindex: 0, 'aria-label': '废纸篓' }, h('div.dock-label', '废纸篓'), h('div.dock-icon', h('img', { src: OS.icon(OS.vfs.trashCount() ? 'trash-full' : 'trash'), alt: '', draggable: 'false' })), h('div.dock-dot'));
      tr.addEventListener('click', () => OS.launch('trash'));
      tr.addEventListener('contextmenu', (e) => dockContext(e, 'trash'));
      return tr;
    }));
    // drop stale entries, then reorder only if something changed
    const keys = new Set(out.map((e) => e._key));
    [...dockCache.keys()].forEach((k) => !keys.has(k) && dockCache.delete(k));
    const cur = [...dockEl.children];
    if (cur.length !== out.length || cur.some((e, i) => e !== out[i])) {
      const fresh = out.filter((e) => !e.isConnected);
      dockEl.replaceChildren(...out);
      // new items grow in like macOS
      if (!OS.reducedMotion() && OS.started) fresh.forEach((e) => e.classList.contains('dock-item') && e.animate([{ width: '0px', opacity: 0 }, { width: (dock.size || OS.settings.dockSize) + 'px', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    }
    updateIndicators();
    fitDock();
    magnify();
  }
  dock.schedule = () => wm.nextFrame('dock', renderDock);
  /* like macOS, shrink the Dock when its icons no longer fit the screen edge */
  function fitDock() {
    const vertical = OS.settings.dockPosition !== 'bottom';
    const scr = wm.screen();
    const avail = (vertical ? scr.h - wm.menubarH() : scr.w) - 24;
    const n = $$('.dock-item', dockEl).length;
    const seps = $$('.dock-sep', dockEl).length;
    const natural = n * (OS.settings.dockSize + 4) + seps * 13 + 12;
    dock.size = natural > avail ? Math.max(24, Math.floor(((avail - seps * 13 - 12) / n) - 4)) : OS.settings.dockSize;
    document.documentElement.style.setProperty('--dock-size', dock.size + 'px');
    const max = OS.settings.dockMagnify ? Math.max(dock.size, OS.settings.dockMagSize * (dock.size / OS.settings.dockSize)) : dock.size;
    dock.max = max;
    document.documentElement.style.setProperty('--dock-max', max + 'px');
    document.documentElement.style.setProperty('--dock-k', (dock.size / max).toFixed(4));
  }
  window.addEventListener('resize', OS.debounce(() => dockEl && (fitDock(), magnify()), 100));
  function thumbFor(w) {
    // static snapshot of the window chrome for the Dock thumbnail (taken once per minimize)
    const c = w.el.cloneNode(true);
    c.classList.remove('minimized');
    c.style.cssText = `position:absolute;left:0;top:0;width:${w.bounds.w}px;height:${w.bounds.h}px;visibility:visible;transform:scale(${OS.settings.dockSize / Math.max(w.bounds.w, w.bounds.h)});transform-origin:0 0;pointer-events:none;`;
    c.querySelectorAll('iframe,video,canvas').forEach((x) => x.replaceWith(h('div', { style: { width: '100%', height: '100%', background: 'var(--win-bg)' } })));
    const box = h('div.min-thumb-inner', c);
    const s = OS.settings.dockSize / Math.max(w.bounds.w, w.bounds.h);
    box.style.width = w.bounds.w * s + 'px';
    box.style.height = w.bounds.h * s + 'px';
    return box;
  }
  dock.minimizedSlot = (w) => (dockEl ? dockEl.querySelector(`.min-win[data-win="${w.id}"] .dock-icon`) : null);
  /* dropping files onto a Dock icon opens them with that app (the icon darkens when it can) */
  const ACCEPTS = {
    finder: () => true,
    terminal: () => true,
    preview: (n) => n.kind === 'image',
    textedit: (n) => n.type !== 'dir' && n.kind !== 'image' && n.kind !== 'app',
  };
  dock.dropTarget = (cx, cy, paths) => {
    let hit = null;
    if (dockEl && paths && paths.length) {
      for (const el of dockEl.querySelectorAll('.dock-item[data-app]')) {
        const ok = ACCEPTS[el.dataset.app];
        if (!ok) continue;
        const r = el.getBoundingClientRect();
        if (cx < r.left - 2 || cx > r.right + 2 || cy < r.top - 8 || cy > r.bottom + 8) continue;
        if (paths.every((p) => {
          const n = OS.vfs.resolve(p);
          return n && ok(n);
        })) hit = el;
        break;
      }
    }
    dockEl && dockEl.querySelectorAll('.dock-item.drop-target[data-app]:not(.trash)').forEach((x) => x !== hit && x.classList.remove('drop-target'));
    hit && hit.classList.add('drop-target');
    return hit ? hit.dataset.app : null;
  };
  dock.dropOpen = (appId, paths) => {
    dockEl && dockEl.querySelectorAll('.dock-item.drop-target').forEach((x) => x.classList.remove('drop-target'));
    const vfs = OS.vfs;
    paths.forEach((p, i) => {
      const n = vfs.resolve(p);
      if (!n) return;
      const dir = n.type === 'dir' ? p : vfs.parentOf(p);
      setTimeout(() => {
        if (appId === 'finder') OS.launch('finder', n.type === 'dir' ? { path: p } : { path: dir, select: p });
        else if (appId === 'terminal') OS.launch('terminal', { cwd: dir });
        else OS.launch(appId, { path: p });
      }, i * 120);
    });
    dock.bounce(appId);
  };
  dock.iconRect = (appId) => {
    const el = dockEl && dockEl.querySelector(`.dock-item[data-app="${appId}"] .dock-icon`);
    return el ? el.getBoundingClientRect() : null;
  };
  function updateIndicators() {
    $$('.dock-item[data-app]', dockEl).forEach((el) => el.classList.toggle('running', OS.running.has(el.dataset.app) || el.dataset.app === 'finder'));
  }
  dock.bounce = (appId) => {
    const el = dockEl && dockEl.querySelector(`.dock-item[data-app="${appId}"] .dock-icon`);
    if (!el || OS.reducedMotion()) return;
    const dy = OS.settings.dockPosition === 'bottom' ? 'translateY(-26px)' : OS.settings.dockPosition === 'left' ? 'translateX(22px)' : 'translateX(-22px)';
    el.animate([{ transform: 'none' }, { transform: dy, offset: 0.35 }, { transform: 'none', offset: 0.7 }, { transform: dy.replace('26', '10').replace('22', '8'), offset: 0.85 }, { transform: 'none' }], { duration: 760, easing: 'cubic-bezier(.3,.7,.4,1)' });
  };
  /* attention bounce (e.g. a notification from a background app) */
  dock.attention = (appId) => dock.bounce(appId);
  dock.badge = (appId, n) => {
    const el = dockEl && dockEl.querySelector(`.dock-item[data-app="${appId}"]`);
    if (!el) return;
    let b = el.querySelector('.dock-badge');
    if (!n) return b && b.remove();
    if (!b) el.querySelector('.dock-icon').appendChild((b = h('span.dock-badge')));
    b.textContent = n;
  };

  /* magnification: cosine falloff over ~3 icon widths around the pointer */
  /* Magnification is pure math over the un-magnified layout (like the real Dock): no layout reads per frame. */
  function magnify() {
    if (!dockEl) return;
    rafPending = false;
    const base = dock.size || OS.settings.dockSize;
    const max = OS.settings.dockMagnify ? Math.max(base, OS.settings.dockMagSize * (base / OS.settings.dockSize)) : base;
    const vertical = OS.settings.dockPosition !== 'bottom';
    const range = base * 3.2;
    const kids = dockEl.children;
    const scr = wm.screen();
    let total = 12;
    for (const el of kids) total += el.classList.contains('dock-sep') ? 13 : base + 4;
    let pos = (vertical ? scr.h / 2 : scr.w / 2) - total / 2 + 6;
    const m = vertical ? mouseY : mouseX;
    for (const el of kids) {
      if (el.classList.contains('dock-sep')) {
        pos += 13;
        continue;
      }
      const c = pos + 2 + base / 2;
      pos += base + 4;
      let s = base;
      if (m != null && max > base) {
        const d = Math.abs(m - c);
        if (d < range) s = base + (max - base) * Math.cos((d / range) * (Math.PI / 2)) ** 2;
      }
      const v = s.toFixed(1) + 'px';
      if (el._s !== v) {
        el._s = v;
        el.style.setProperty('--s', v);
        el.style.setProperty('--k', (s / max).toFixed(4));
      }
    }
  }
  function onDockMove(e) {
    const p = wm.pt(e);
    mouseX = p.x;
    mouseY = p.y;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(magnify);
    }
  }

  function openStack(anchor, path) {
    const items = (OS.vfs.list(path) || []).slice().sort((a, b) => b.mtime - a.mtime).slice(0, 12);
    const grid = h('div.stack-pop',
      h('div.stack-title', '下载'),
      h('div.stack-grid', items.length ? items.map((n) => {
        const p = OS.vfs.norm(path + '/' + n.name);
        const it = h('div.stack-item', { tabindex: 0 }, h('img', { src: OS.vfs.iconFor(n, p), alt: '' }), h('span', n.name));
        it.onclick = () => (OS.closeMenus(), OS.vfs.open(p));
        return it;
      }) : h('div.stack-empty', '没有项目')),
      h('button.stack-open', { onclick: () => (OS.closeMenus(), OS.launch('finder', { path })) }, '在访达中打开')
    );
    grid.classList.add('menu');
    const r = anchor.getBoundingClientRect();
    OS.showMenu(grid, { x: (r.left + r.width / 2) / OS.scale - 170, y: r.top / OS.scale - 10 });
    grid.style.top = r.top / OS.scale - grid.offsetHeight - 14 + 'px';
  }

  function applyDockLayout() {
    const wrap = $('#dock-wrap');
    wrap.className = 'pos-' + OS.settings.dockPosition + (OS.settings.dockAutohide ? ' autohide' : '');
    if (dockEl) fitDock();
    magnify();
  }
  ['dockPosition', 'dockAutohide', 'dockSize', 'dockMagnify', 'dockMagSize'].forEach((k) => OS.on('setting:' + k, applyDockLayout));
  OS.on('setting:dockShowRecents', () => renderDock());

  function initDock() {
    const wrap = $('#dock-wrap');
    const d = $('#dock');
    d.addEventListener('pointermove', onDockMove);
    d.addEventListener('pointerenter', () => d.classList.add('hovering'));
    d.addEventListener('pointerleave', () => {
      mouseX = mouseY = null;
      d.classList.remove('hovering');
      requestAnimationFrame(magnify);
    });
    d.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.dock-item')) return;
      OS.contextMenu(e, [
        { label: '打开放大', checked: OS.settings.dockMagnify, action: () => OS.setSetting('dockMagnify', !OS.settings.dockMagnify) },
        { label: '打开自动隐藏', checked: OS.settings.dockAutohide, action: () => OS.setSetting('dockAutohide', !OS.settings.dockAutohide) },
        { sep: true },
        { label: '置于屏幕上的位置：左边', checked: OS.settings.dockPosition === 'left', action: () => OS.setSetting('dockPosition', 'left') },
        { label: '置于屏幕上的位置：底部', checked: OS.settings.dockPosition === 'bottom', action: () => OS.setSetting('dockPosition', 'bottom') },
        { label: '置于屏幕上的位置：右边', checked: OS.settings.dockPosition === 'right', action: () => OS.setSetting('dockPosition', 'right') },
        { sep: true },
        { label: '最小化窗口时使用：神奇效果', checked: OS.settings.minimizeEffect === 'genie', action: () => OS.setSetting('minimizeEffect', 'genie') },
        { label: '最小化窗口时使用：缩放效果', checked: OS.settings.minimizeEffect === 'scale', action: () => OS.setSetting('minimizeEffect', 'scale') },
        { sep: true },
        { label: '程序坞设置…', action: () => OS.launch('settings', { pane: 'dock' }) },
      ]);
    });
    // autohide reveal
    let hideT;
    document.addEventListener('pointermove', (e) => {
      if (!OS.settings.dockAutohide && !document.body.classList.contains('has-fullscreen')) return;
      const p = wm.pt(e);
      const s = wm.screen();
      const pos = OS.settings.dockPosition;
      const near = pos === 'bottom' ? p.y > s.h - 6 : pos === 'left' ? p.x < 6 : p.x > s.w - 6;
      const over = wrap.matches(':hover');
      if (near) {
        clearTimeout(hideT);
        wrap.classList.add('reveal');
      } else if (!over && wrap.classList.contains('reveal')) {
        clearTimeout(hideT);
        hideT = setTimeout(() => !wrap.matches(':hover') && wrap.classList.remove('reveal'), 400);
      }
    });
    applyDockLayout();
    renderDock();
  }
  OS.on('windows', () => dock.schedule());
  OS.on('vfs:change', () => {
    const tr = dockEl && dockEl.querySelector('.trash img');
    if (tr) tr.src = OS.icon(OS.vfs.trashCount() ? 'trash-full' : 'trash');
  });

  /* Calendar's Dock icon shows today's date, like the real one */
  OS.calendarIcon = () => {
    const d = new Date();
    return h('div.cal-icon', h('div.cal-icon-m', OS.fmt.week(d).replace('周', '星期')), h('div.cal-icon-d', d.getDate()));
  };

  /* ======================================================================
     Desktop icons
     ====================================================================== */
  const desk = (OS.desktop = { selected: new Set() });
  const GRID_X = 100, GRID_Y = 104;

  function deskItems() {
    const list = [{ name: 'Macintosh HD', path: '/', node: { name: 'Macintosh HD', type: 'dir' }, icon: OS.icon('hd'), label: 'Macintosh HD' }];
    (OS.vfs.list('~/Desktop') || []).forEach((n) => list.push({ name: n.name, path: OS.vfs.HOME + '/Desktop/' + n.name, node: n, icon: OS.vfs.iconFor(n), label: n.name }));
    return list;
  }

  function renderDesktop() {
    const root = $('#desktop');
    root.innerHTML = '';
    if (!OS.settings.desktopIcons) return;
    const pos = OS.store.get('desk.pos', {});
    const scr = wm.screen();
    const top = wm.menubarH() + 10;
    const rows = Math.max(1, Math.floor((scr.h - top - 100) / GRID_Y));
    const taken = new Set(Object.values(pos).map((p) => p.c + ',' + p.r));
    let auto = 0;
    deskItems().forEach((it) => {
      let p = pos[it.path];
      if (!p) {
        while (taken.has(Math.floor(auto / rows) + ',' + (auto % rows))) auto++;
        p = { c: Math.floor(auto / rows), r: auto % rows };
        taken.add(p.c + ',' + p.r);
        auto++;
      }
      const x = scr.w - 16 - GRID_X - p.c * GRID_X;
      const y = top + p.r * GRID_Y;
      const isImg = it.node.kind === 'image';
      const el = h('div.desk-icon' + (desk.selected.has(it.path) ? '.selected' : ''), { dataset: { path: it.path }, style: { left: x + 'px', top: y + 'px' }, tabindex: 0 },
        h('div.desk-img' + (isImg ? '.thumb' : ''), h('img', { src: it.icon, alt: '', draggable: 'false', loading: 'lazy' })),
        h('div.desk-label', it.label)
      );
      root.appendChild(el);
    });
  }
  desk.render = renderDesktop;
  OS.on('vfs:change', () => renderDesktop());
  OS.on('setting:desktopIcons', () => renderDesktop());

  function selectDesk(paths) {
    desk.selected = new Set(paths);
    $$('.desk-icon').forEach((el) => el.classList.toggle('selected', desk.selected.has(el.dataset.path)));
  }
  desk.select = selectDesk;

  function initDesktop() {
    const root = $('#desktop');
    const scrEl = $('#screen');
    renderDesktop();
    window.addEventListener('resize', OS.debounce(renderDesktop, 200));

    // pointer on desktop background: rubber band selection
    scrEl.addEventListener('pointerdown', (e) => {
      const onDesk = e.target === root || e.target.id === 'wallpaper' || e.target.closest('#wallpaper') || e.target.classList.contains('space') || e.target.id === 'spaces-track';
      if (!onDesk || e.button !== 0) return;
      wm.blurAll();
      OS.showDesktop && OS.showDesktop.active && OS.showDesktop.toggle();
      selectDesk([]);
      const start = wm.pt(e);
      const band = h('div.rubber-band');
      root.appendChild(band);
      const move = (ev) => {
        const p = wm.pt(ev);
        const x = Math.min(p.x, start.x), y = Math.min(p.y, start.y), w = Math.abs(p.x - start.x), H = Math.abs(p.y - start.y);
        Object.assign(band.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: H + 'px' });
        const sel = [];
        $$('.desk-icon', root).forEach((el) => {
          const ex = el.offsetLeft, ey = el.offsetTop, ew = el.offsetWidth, eh = el.offsetHeight;
          if (ex < x + w && ex + ew > x && ey < y + H && ey + eh > y) sel.push(el.dataset.path);
        });
        selectDesk(sel);
      };
      const up = () => {
        band.remove();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    // icon interactions
    root.addEventListener('pointerdown', (e) => {
      const icon = e.target.closest('.desk-icon');
      if (!icon || e.button !== 0) return;
      e.stopPropagation();
      wm.blurAll();
      const path = icon.dataset.path;
      if (e.shiftKey || OS.cmd(e)) {
        const s = new Set(desk.selected);
        s.has(path) ? s.delete(path) : s.add(path);
        selectDesk([...s]);
      } else if (!desk.selected.has(path)) selectDesk([path]);
      const start = wm.pt(e);
      const els = $$('.desk-icon.selected', root);
      const origin = els.map((el) => ({ el, x: el.offsetLeft, y: el.offsetTop }));
      let moved = false, dirTarget = null;
      const move = (ev) => {
        const p = wm.pt(ev);
        const dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        origin.forEach((o) => {
          o.el.classList.add('dragging');
          o.el.style.left = o.x + dx + 'px';
          o.el.style.top = o.y + dy + 'px';
        });
        const tr = OS.dock.iconRect('trash');
        const over = tr && ev.clientX > tr.left - 8 && ev.clientX < tr.right + 8 && ev.clientY > tr.top - 8 && ev.clientY < tr.bottom + 8;
        $('.dock-item.trash') && $('.dock-item.trash').classList.toggle('drop-target', !!over);
        // highlight Finder windows as drop targets
        $$('.win[data-drop-path]').forEach((w) => w.classList.remove('drop-target'));
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.matches && x.matches('.win[data-drop-path]'));
        under && under.classList.add('drop-target');
        dock.dropTarget(ev.clientX, ev.clientY, origin.map((o) => o.el.dataset.path));
        // folders under the pointer (inside Finder windows or on the desktop) accept the drop and spring open
        $$('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
        const dir = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.matches && (x.matches('.win [data-dir="1"], .win [data-drop]') || (x.matches('.desk-icon:not(.selected)') && (OS.vfs.resolve(x.dataset.path) || {}).type === 'dir')));
        dirTarget = dir || null;
        dir && dir.classList.add('drop-hover');
        const sp = dir && OS.springTarget(dir);
        OS.springLoad(sp ? dir : null, sp || (() => {}));
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        OS.springLoad(null);
        $$('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
        if (!moved) return;
        if (dirTarget) {
          const dest = dirTarget.dataset.path || dirTarget.dataset.drop;
          $$('.win.drop-target').forEach((w) => w.classList.remove('drop-target'));
          origin.forEach((o) => o.el.dataset.path !== '/' && OS.vfs.move(o.el.dataset.path, dest));
          renderDesktop();
          return;
        }
        const trashEl = $('.dock-item.trash');
        const toTrash = trashEl && trashEl.classList.contains('drop-target');
        trashEl && trashEl.classList.remove('drop-target');
        const dockApp = dock.dropTarget(ev.clientX, ev.clientY, origin.map((o) => o.el.dataset.path));
        if (dockApp) {
          dock.dropOpen(dockApp, origin.map((o) => o.el.dataset.path));
          renderDesktop();
          return;
        }
        const winEl = $('.win.drop-target');
        $$('.win.drop-target').forEach((w) => w.classList.remove('drop-target'));
        if (toTrash) {
          origin.forEach((o) => o.el.dataset.path !== '/' && OS.vfs.trash(o.el.dataset.path));
          return;
        }
        if (winEl) {
          const dest = winEl.dataset.dropPath;
          origin.forEach((o) => o.el.dataset.path !== '/' && OS.vfs.move(o.el.dataset.path, dest));
          return;
        }
        // snap to grid and remember positions
        const pos = OS.store.get('desk.pos', {});
        const scr = wm.screen();
        const top = wm.menubarH() + 10;
        const used = new Set();
        Object.entries(pos).forEach(([k, v]) => !origin.some((o) => o.el.dataset.path === k) && used.add(v.c + ',' + v.r));
        origin.forEach((o) => {
          let c = Math.max(0, Math.round((scr.w - 16 - GRID_X - o.el.offsetLeft) / GRID_X));
          let r = Math.max(0, Math.round((o.el.offsetTop - top) / GRID_Y));
          while (used.has(c + ',' + r)) r++;
          used.add(c + ',' + r);
          pos[o.el.dataset.path] = { c, r };
        });
        OS.store.set('desk.pos', pos);
        renderDesktop();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    root.addEventListener('dblclick', (e) => {
      const icon = e.target.closest('.desk-icon');
      if (!icon) return;
      const p = icon.dataset.path;
      p === '/' ? OS.launch('finder', { path: '/' }) : OS.vfs.open(p);
    });

    // context menus
    scrEl.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.win,.menu,#dock-wrap,#menubar,.overlay-panel')) return;
      const icon = e.target.closest('.desk-icon');
      if (icon) {
        if (!desk.selected.has(icon.dataset.path)) selectDesk([icon.dataset.path]);
        return OS.contextMenu(e, itemMenu([...desk.selected]));
      }
      OS.contextMenu(e, [
        { label: '新建文件夹', action: newDesktopFolder },
        { sep: true },
        { label: '显示简介', action: () => OS.getInfo('~/Desktop') },
        { label: '更改墙纸…', action: () => OS.launch('settings', { pane: 'wallpaper' }) },
        { label: '编辑小组件…', action: () => OS.nc && OS.nc.open() },
        { label: '编辑小组件…', action: () => OS.nc.open() },
        { sep: true },
        { label: '使用叠放', disabled: true },
        {
          label: '排序方式',
          submenu: [
            { label: '无', action: () => (OS.store.set('desk.pos', {}), renderDesktop()) },
            { label: '名称', action: () => sortDesktop('name') },
            { label: '种类', action: () => sortDesktop('kind') },
            { label: '修改日期', action: () => sortDesktop('mtime') },
          ],
        },
        { label: '整理', action: () => (OS.store.set('desk.pos', {}), renderDesktop()) },
        { label: '查看显示选项', action: () => OS.launch('settings', { pane: 'desktop' }) },
      ]);
    });
    root.addEventListener('keydown', (e) => {
      const sel = [...desk.selected];
      if (!sel.length) return;
      if (e.key === 'Enter' && sel.length === 1 && sel[0] !== '/') {
        e.preventDefault();
        renameDesk(sel[0]);
      } else if (e.key === ' ') {
        e.preventDefault();
        OS.quickLook(sel[0]);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && OS.cmd(e)) {
        sel.filter((p) => p !== '/').forEach((p) => OS.vfs.trash(p));
      } else if (e.key === 'o' && OS.cmd(e)) {
        e.preventDefault();
        sel.forEach((p) => (p === '/' ? OS.launch('finder', { path: '/' }) : OS.vfs.open(p)));
      }
    });
  }
  function sortDesktop(by) {
    const items = deskItems().slice(1);
    items.sort((a, b) => (by === 'name' ? a.name.localeCompare(b.name, 'zh') : by === 'kind' ? (a.node.kind || 'dir').localeCompare(b.node.kind || 'dir') : b.node.mtime - a.node.mtime));
    const pos = { '/': { c: 0, r: 0 } };
    const rows = Math.max(1, Math.floor((wm.screen().h - 140) / GRID_Y));
    items.forEach((it, i) => (pos[it.path] = { c: Math.floor((i + 1) / rows), r: (i + 1) % rows }));
    OS.store.set('desk.pos', pos);
    renderDesktop();
  }
  function newDesktopFolder() {
    const name = OS.vfs.uniqueName('~/Desktop', '未命名文件夹');
    OS.vfs.mkdir('~/Desktop/' + name);
    setTimeout(() => renameDesk(OS.vfs.HOME + '/Desktop/' + name), 60);
  }
  function renameDesk(path) {
    const el = $(`.desk-icon[data-path="${CSS.escape(path)}"] .desk-label`);
    if (!el) return;
    const old = OS.vfs.baseName(path);
    const input = h('textarea.desk-rename', { id: 'desk-rename', rows: 1 });
    input.value = old;
    el.replaceWith(input);
    input.focus();
    const dot = old.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : old.length);
    let done = false;
    const commit = (ok) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (ok && v && v !== old) {
        const np = OS.vfs.rename(path, v);
        if (np) {
          const pos = OS.store.get('desk.pos', {});
          if (pos[path]) (pos[np] = pos[path]), delete pos[path], OS.store.set('desk.pos', pos);
        }
      }
      renderDesktop();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') (e.preventDefault(), commit(true));
      if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  desk.rename = renameDesk;

  /* shared item menu (desktop + Finder) */
  OS.itemMenu = itemMenu;
  function itemMenu(paths, opts = {}) {
    const one = paths.length === 1 ? paths[0] : null;
    const node = one && one !== '/' ? OS.vfs.resolve(one) : null;
    const inTrash = paths.every((p) => OS.vfs.norm(p).startsWith(OS.vfs.HOME + '/.Trash/'));
    const isImage = node && node.kind === 'image';
    return [
      { label: '打开', action: () => paths.forEach((p) => (p === '/' ? OS.launch('finder', { path: '/' }) : OS.vfs.open(p))) },
      node && node.type === 'file' && node.kind !== 'app'
        ? {
            label: '打开方式',
            submenu: [
              isImage ? { label: '预览（默认）', img: OS.icon('preview'), action: () => OS.launch('preview', { path: one }) } : { label: '文本编辑（默认）', img: OS.icon('textedit'), action: () => OS.launch('textedit', { path: one }) },
              isImage ? { label: '照片', img: OS.icon('photos'), action: () => OS.launch('photos') } : { label: '备忘录', img: OS.icon('notes'), action: () => OS.launch('notes', { importText: node.content, title: node.name }) },
              { label: '终端', img: OS.icon('terminal'), action: () => OS.launch('terminal', { cwd: OS.vfs.parentOf(one) }) },
            ],
          }
        : null,
      { sep: true },
      inTrash ? { label: '放回原处', action: () => paths.forEach((p) => OS.vfs.putBack(p)) } : { label: '移到废纸篓', disabled: paths.includes('/'), action: () => paths.forEach((p) => OS.vfs.trash(p)) },
      inTrash ? { label: '立即删除…', action: async () => (await OS.alert({ title: '确定要立即删除这些项目吗？', message: '此操作无法撤销。', icon: OS.icon('trash-full'), buttons: [{ label: '取消' }, { label: '删除', primary: true }], destructive: true })) === 1 && paths.forEach((p) => OS.vfs.remove(p)) } : null,
      { sep: true },
      { label: '显示简介', action: () => paths.forEach((p) => OS.getInfo(p)) },
      one && one !== '/' ? { label: '重新命名', action: () => (opts.rename ? opts.rename(one) : renameDesk(one)) } : null,
      { label: '压缩', disabled: paths.includes('/'), action: () => paths.forEach((p) => OS.vfs.write(OS.vfs.parentOf(p) + '/' + OS.vfs.uniqueName(OS.vfs.parentOf(p), OS.vfs.baseName(p) + '.zip'), '', { kind: 'pdf', size: Math.round(OS.vfs.sizeOf(OS.vfs.resolve(p)) * 0.6) })) },
      { label: '复制', disabled: paths.includes('/'), action: () => paths.forEach((p) => OS.vfs.copy(p, OS.vfs.parentOf(p))) },
      { label: '制作替身', disabled: true },
      { label: '快速查看', key: '空格', action: () => OS.quickLook(paths[0]) },
      { sep: true },
      { label: '拷贝', action: () => navigator.clipboard && navigator.clipboard.writeText(paths.map((p) => OS.vfs.baseName(p)).join('\n')).catch(() => {}) },
      { label: '共享…', glyph: 'share', action: () => OS.toast('隔空投送：附近没有可用的设备') },
      { sep: true },
      {
        custom: (() => {
          const row = h('div.menu-tags');
          ['#ff3b30', '#ff9500', '#ffcc00', '#28cd41', '#007aff', '#af52de', '#8e8e93'].forEach((c) => {
            const dot = h('span.tag-dot', { style: { background: c }, title: '标签' });
            dot.onclick = () => {
              paths.forEach((p) => {
                const n = OS.vfs.resolve(p);
                if (n && p !== '/') {
                  n.tags = n.tags && n.tags.includes(c) ? n.tags.filter((t) => t !== c) : [...(n.tags || []), c];
                  OS.vfs.write(p, null, { tags: n.tags });
                }
              });
              OS.closeMenus();
            };
            row.appendChild(dot);
          });
          return row;
        })(),
      },
      { label: '标签…', disabled: true },
    ];
  }

  /* Get Info window */
  OS.getInfo = (path) => {
    const node = path === '/' ? { name: 'Macintosh HD', type: 'dir', mtime: Date.now() - 90 * 86400000 } : OS.vfs.resolve(path);
    if (!node) return;
    OS.launch('info', { path, node });
  };

  /* ======================================================================
     Appearance: theme, accent, wallpaper, brightness, Night Shift
     ====================================================================== */
  let wpFlip = false;
  function applyAppearance() {
    const dark = OS.isDark();
    const root = document.documentElement;
    root.classList.toggle('os-dark', dark);
    root.classList.toggle('os-light', !dark);
    root.classList.toggle('reduce-transparency', !!OS.settings.reduceTransparency);
    root.classList.toggle('menubar-bg', !!OS.settings.menubarBg);
    root.classList.toggle('icons-dark', OS.settings.iconStyle === 'dark' || (OS.settings.iconStyle === 'auto' && dark));
    root.classList.toggle('icons-clear', OS.settings.iconStyle === 'clear');
    root.classList.toggle('icons-tinted', OS.settings.iconStyle === 'tinted');
    const acc = OS.accents[OS.settings.accent] || OS.accents.blue;
    root.style.setProperty('--accent', dark ? acc.dark : acc.light);
    root.style.setProperty('--accent-rgb', hexToRgb(dark ? acc.dark : acc.light));
    applyWallpaper();
    OS.emit('theme', dark);
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  OS.currentWallpaperFile = () => {
    const wp = OS.wallpapers.find((w) => w.id === OS.settings.wallpaper);
    if (!wp) {
      // custom uploaded wallpaper stored as data URL
      const custom = OS.store.get('customWallpaper', null);
      return custom || OS.wallpaperSrc('tahoe-light');
    }
    return OS.wallpaperSrc(OS.isDark() && OS.settings.dynamicWallpaper ? wp.dark : wp.light);
  };
  function applyWallpaper() {
    const src = OS.currentWallpaperFile();
    const a = $('#wp-a'), b = $('#wp-b');
    const cur = wpFlip ? b : a;
    if (cur.dataset.src === src) return;
    const next = wpFlip ? a : b;
    const token = (applyWallpaper.token = (applyWallpaper.token || 0) + 1);
    next.src = src;
    next.dataset.src = src;
    // decode off the main thread, then crossfade on the compositor
    (next.decode ? next.decode() : Promise.resolve()).catch(() => {}).then(() => {
      if (token !== applyWallpaper.token) return;
      requestAnimationFrame(() => {
        next.classList.add('on');
        cur.classList.remove('on');
      });
      wpFlip = !wpFlip;
      // sample wallpaper brightness for the menu bar text color (tiny canvas, idle time)
      const sample = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 64;
          c.height = 4;
          const x = c.getContext('2d');
          x.drawImage(next, 0, 0, next.naturalWidth, next.naturalHeight * 0.04, 0, 0, 64, 4);
          const d = x.getImageData(0, 0, 64, 4).data;
          let lum = 0;
          for (let i = 0; i < d.length; i += 4) lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          lum /= d.length / 4;
          document.documentElement.classList.toggle('wp-light-top', lum > 150);
        } catch (e) {}
      };
      (window.requestIdleCallback || setTimeout)(sample);
      OS.emit('wallpaper', src);
      (window.requestIdleCallback || setTimeout)(() => (OS.blurred(OS.thumbOf(src), 480, 14), OS.blurred(OS.thumbOf(src), 480, 16)));
    });
  }
  OS.applyAppearance = applyAppearance;
  ['appearance', 'accent', 'wallpaper', 'dynamicWallpaper', 'reduceTransparency', 'menubarBg', 'iconStyle'].forEach((k) => OS.on('setting:' + k, applyAppearance));
  OS.on('appearance', applyAppearance);
  // "auto" appearance also follows the time of day when the host has no preference
  setInterval(() => OS.settings.appearance === 'auto' && applyAppearance(), 60000);

  function applyBrightness() {
    const dim = ((100 - OS.settings.brightness) / 100) * 0.82;
    $('#brightness').style.opacity = dim;
    $('#brightness').classList.toggle('off', dim < 0.005);
    $('#nightshift').classList.toggle('on', !!OS.settings.nightShift);
  }
  OS.on('setting:brightness', applyBrightness);
  OS.on('setting:nightShift', applyBrightness);

  /* ======================================================================
     Scaling for small viewports: render a 1024-wide Mac and scale it down
     ====================================================================== */
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const MIN_W = 1024, MIN_H = 680;
    // Displays › Resolution: "larger text" zooms in, "more space" zooms out
    const k = { larger: 1.14, default: 1, more: 0.86 }[OS.settings.resolution || 'default'] || 1;
    const s = Math.min(1, vw / MIN_W, vh / MIN_H) * k;
    const scr = $('#screen');
    OS.scale = s;
    if (s !== 1) {
      scr.style.width = vw / s + 'px';
      scr.style.height = vh / s + 'px';
      scr.style.transform = `scale(${s})`;
    } else {
      scr.style.width = scr.style.height = scr.style.transform = '';
    }
    document.documentElement.classList.toggle('scaled', s !== 1);
    wm.invalidate();
  }
  window.addEventListener('resize', fit);
  OS.on('setting:resolution', () => {
    fit();
    window.dispatchEvent(new Event('resize'));
  });

  /* ======================================================================
     Keyboard shortcuts
     ====================================================================== */
  OS.shortcuts = [
    ['Ctrl/⌥ + 空格', '打开聚焦搜索'],
    ['F4 或 ⌥ + L', '打开启动台'],
    ['F3 或 Ctrl + ↑', '调度中心'],
    ['Ctrl + ← / →', '切换桌面'],
    ['⌥ + Tab', '切换应用'],
    ['⌘ + `', '在同一应用的窗口间切换'],
    ['⌘ + M', '最小化窗口'],
    ['⌘ + W / ⌥ + W', '关闭窗口'],
    ['⌘ + Q / ⌥ + Q', '退出应用'],
    ['⌘ + H', '隐藏应用'],
    ['⌘ + ,', '打开设置'],
    ['⌃ + ⌘ + F', '全屏幕'],
    ['Ctrl + Shift + 3', '截取整个屏幕'],
    ['Ctrl + Shift + 4', '截取窗口'],
    ['⌥ + ⌘ + Esc', '强制退出'],
    ['⌃ + ⌘ + Q', '锁定屏幕'],
    ['⌥ + S', 'Siri'],
    ['⌥ + N', '通知中心'],
    ['F11 / ⌥ + D', '显示桌面'],
  ];
  OS.showShortcuts = () => OS.launch('shortcutsHelp');

  function editable(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('desktop-ready')) return;
    const cmd = OS.cmd(e);
    const k = e.key;
    const w = wm.focused;
    const code = e.code;

    // Spotlight
    if ((e.ctrlKey && code === 'Space') || (e.altKey && code === 'Space') || (e.metaKey && code === 'Space')) {
      e.preventDefault();
      return OS.spotlight.toggle();
    }
    if (k === 'F4' || (e.altKey && code === 'KeyL')) return e.preventDefault(), OS.launch('launchpad');
    if (k === 'F3' || (e.ctrlKey && k === 'ArrowUp')) return e.preventDefault(), OS.mission.toggle();
    if (e.ctrlKey && k === 'ArrowDown') return e.preventDefault(), OS.mission.open(wm.activeApp());
    if (e.ctrlKey && !e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight') && !editable(e.target)) return e.preventDefault(), OS.spaces.go(OS.spaces.current + (k === 'ArrowLeft' ? -1 : 1));
    if (e.altKey && code === 'Tab') return e.preventDefault(), OS.switcher.next(e.shiftKey);
    if (e.ctrlKey && e.shiftKey && (code === 'Digit3' || code === 'Digit4')) return e.preventDefault(), OS.screenshot(code === 'Digit4' ? 'window' : 'screen');
    if (cmd && e.shiftKey && (code === 'Digit3' || code === 'Digit4')) return e.preventDefault(), OS.screenshot(code === 'Digit4' ? 'window' : 'screen');
    if (cmd && e.altKey && k === 'Escape') return e.preventDefault(), OS.forceQuit();
    if (e.ctrlKey && e.metaKey && code === 'KeyQ') return e.preventDefault(), OS.power.lock();
    if (e.altKey && code === 'KeyS' && !editable(e.target)) return e.preventDefault(), OS.siri.toggle();
    if (e.altKey && code === 'KeyN' && !editable(e.target)) return e.preventDefault(), OS.nc.toggle();
    if (k === 'F11' || (e.altKey && code === 'KeyD' && !editable(e.target))) return e.preventDefault(), OS.showDesktop.toggle();
    if (e.altKey && code === 'KeyW' && w) return e.preventDefault(), wm.close(w);
    if (e.altKey && code === 'KeyQ') return e.preventDefault(), wm.quit(wm.activeApp());
    if (e.altKey && code === 'KeyM' && w) return e.preventDefault(), wm.minimize(w);

    if (cmd) {
      if (code === 'KeyM' && w) return e.preventDefault(), wm.minimize(w);
      if (code === 'KeyW' && w) return e.preventDefault(), wm.close(w);
      if (code === 'KeyQ' && !e.ctrlKey) return e.preventDefault(), wm.quit(wm.activeApp());
      if (code === 'KeyH' && !e.altKey) return e.preventDefault(), OS.hideApp(wm.activeApp());
      if (code === 'KeyH' && e.altKey) return e.preventDefault(), OS.hideOthers(wm.activeApp());
      if (code === 'Comma') return e.preventDefault(), (OS.apps[wm.activeApp()].settings ? OS.apps[wm.activeApp()].settings() : OS.launch('settings'));
      if (code === 'KeyF' && e.ctrlKey && e.metaKey && w) return e.preventDefault(), wm.toggleFull(w);
      if (code === 'Backquote') {
        e.preventDefault();
        const list = wm.appWindows(wm.activeApp()).filter((x) => x.state !== 'min').sort((a, b) => a.z - b.z);
        if (list.length > 1) wm.focus(list[0]);
        return;
      }
      if (code === 'KeyN' && !editable(e.target) && (wm.activeApp() === 'finder' || !w)) return e.preventDefault(), OS.newWindow('finder');
    }
    if (k === 'Escape' && w && w.state === 'full' && !editable(e.target)) return wm.toggleFull(w, false);

    // let the focused app handle its own shortcuts
    if (w && w.app.onKey) w.app.onKey(w, e);
  });

  /* ======================================================================
     Hot corners
     ====================================================================== */
  function initHotCorners() {
    let t = null, last = null;
    const actions = {
      notifications: () => OS.nc.open(),
      launchpad: () => OS.launch('launchpad'),
      desktop: () => OS.showDesktop.toggle(),
      mission: () => OS.mission.open(),
      lock: () => OS.power.lock(),
      screensaver: () => OS.screensaver && OS.screensaver.start(),
      none: null,
    };
    document.addEventListener('pointermove', (e) => {
      if (!document.body.classList.contains('desktop-ready') || document.body.classList.contains('is-dragging')) return;
      const p = wm.pt(e), s = wm.screen();
      const c = p.x < 3 && p.y < 3 ? 'tl' : p.x > s.w - 3 && p.y < 3 ? 'tr' : p.x < 3 && p.y > s.h - 3 ? 'bl' : p.x > s.w - 3 && p.y > s.h - 3 ? 'br' : null;
      if (c === last) return;
      last = c;
      clearTimeout(t);
      if (c) {
        const a = actions[OS.settings.hotCorners[c]];
        if (a) t = setTimeout(a, 250);
      }
    });
  }

  /* ======================================================================
     Init
     ====================================================================== */
  OS.initShell = function () {
    const sp = OS.spring('window');
    document.documentElement.style.setProperty('--spring-dur', sp.duration + 'ms');
    document.documentElement.style.setProperty('--spring-ease', sp.easing);
    fit();
    OS.boot.initSpaces();
    applyAppearance();
    applyBrightness();
    buildMenubar();
    initDock();
    initDesktop();
    initHotCorners();
  };
})();
