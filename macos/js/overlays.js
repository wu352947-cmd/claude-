/* System overlays: notifications, Spotlight, Launchpad, Mission Control, Control Center, Notification Center,
   App Switcher, Siri, screenshots, Quick Look, Force Quit, Show Desktop. */
(function () {
  const { h, $, $$, glyph, clamp } = OS;
  const wm = OS.wm;
  const layer = () => $('#overlays');

  /* ======================================================================
     Notifications (banners + history for Notification Center)
     ====================================================================== */
  OS.notifications = OS.store.get('notifications', []).slice(0, 30);
  const saveNotes = OS.debounce(() => OS.store.set('notifications', OS.notifications.slice(0, 30)), 300);
  let bannerStack;
  OS.notify = function ({ app = 'finder', title, body = '', icon, action, silent, sticky, buttons }) {
    const a = OS.apps[app];
    const n = { id: OS.uid(), app, title, body, time: Date.now(), icon: icon || (a ? OS.icon(a.icon) : OS.icon('finder')) };
    if (!sticky) {
      OS.notifications.unshift(n);
      saveNotes();
      OS.emit('notifications');
    }
    if (OS.settings.focus) return n; // Focus mode silences banners
    if (!bannerStack) layer().appendChild((bannerStack = h('div.banner-stack')));
    const close = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    };
    const el = h('div.banner.glass', { role: 'status' },
      h('img.banner-icon', { src: n.icon, alt: '' }),
      h('div.banner-text',
        h('div.banner-top', h('b', title), h('span.banner-time', '现在')),
        body && h('div.banner-body', body)
      ),
      h('button.banner-x', { 'aria-label': '关闭', html: glyph('xmark'), onclick: (e) => (e.stopPropagation(), close()) }),
      buttons && h('div.banner-btns', buttons.map((b) => h('button', { onclick: (e) => (e.stopPropagation(), b.action && b.action(), close()) }, b.label)))
    );
    el.addEventListener('click', () => {
      close();
      action ? action() : a && !a.action && OS.launch(app);
    });
    let t = setTimeout(close, sticky ? 12000 : 5200);
    el.addEventListener('mouseenter', () => clearTimeout(t));
    el.addEventListener('mouseleave', () => (t = setTimeout(close, 2500)));
    bannerStack.prepend(el);
    while (bannerStack.children.length > 3) bannerStack.lastChild.remove();
    if (!silent) OS.sound.play(app === 'messages' ? 'message' : 'notify');
    return n;
  };

  OS.toast = (msg, g = 'info') => {
    const t = h('div.hud-toast.glass', h('span', { html: glyph(g) }), h('span', msg));
    layer().appendChild(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2200);
  };
  /* brightness / volume HUD (Tahoe shows a small capsule under the menu bar) */
  let hudEl, hudT;
  OS.hud = (kind, value) => {
    if (!hudEl) layer().appendChild((hudEl = h('div.level-hud.glass')));
    hudEl.innerHTML = '';
    hudEl.append(h('span.lh-icon', { html: glyph(kind === 'volume' ? (value ? 'speaker' : 'speaker-slash') : 'sun-fill') }), h('div.lh-bar', h('i', { style: { width: value + '%' } })));
    hudEl.classList.add('show');
    clearTimeout(hudT);
    hudT = setTimeout(() => hudEl.classList.remove('show'), 1400);
  };
  OS.notifyHUD = () => {};

  /* ======================================================================
     Spotlight
     ====================================================================== */
  const sp = (OS.spotlight = { el: null });
  const UNITS = [
    { re: /^(-?[\d.]+)\s*(°?c|摄氏度)\s*(?:to|in|=|转)?\s*(°?f|华氏度)?$/i, fn: (v) => [`${OS.formatNumber(v * 9 / 5 + 32)} °F`, `${v} °C`] },
    { re: /^(-?[\d.]+)\s*(°?f|华氏度)\s*(?:to|in|=|转)?\s*(°?c|摄氏度)?$/i, fn: (v) => [`${OS.formatNumber(((v - 32) * 5) / 9)} °C`, `${v} °F`] },
    { re: /^([\d.]+)\s*(km|公里|千米)\s*(?:to|in|=|转)?\s*(mi|英里)?$/i, fn: (v) => [`${OS.formatNumber(v * 0.621371)} 英里`, `${v} 公里`] },
    { re: /^([\d.]+)\s*(mi|miles?|英里)\s*(?:to|in|=|转)?\s*(km|公里)?$/i, fn: (v) => [`${OS.formatNumber(v * 1.609344)} 公里`, `${v} 英里`] },
    { re: /^([\d.]+)\s*(kg|公斤|千克)\s*(?:to|in|=|转)?\s*(lbs?|磅)?$/i, fn: (v) => [`${OS.formatNumber(v * 2.20462)} 磅`, `${v} 公斤`] },
    { re: /^([\d.]+)\s*(lbs?|磅)\s*(?:to|in|=|转)?\s*(kg|公斤)?$/i, fn: (v) => [`${OS.formatNumber(v * 0.453592)} 公斤`, `${v} 磅`] },
    { re: /^([\d.]+)\s*(usd|\$|美元)\s*(?:to|in|=|转)?\s*(cny|rmb|人民币|元)?$/i, fn: (v) => [`¥${OS.formatNumber(v * 7.12)}`, `$${v} 美元 · 估算汇率 7.12`] },
    { re: /^([\d.]+)\s*(cny|rmb|人民币|元|¥)\s*(?:to|in|=|转)?\s*(usd|美元)?$/i, fn: (v) => [`$${OS.formatNumber(v / 7.12)}`, `¥${v} · 估算汇率 7.12`] },
    { re: /^([\d.]+)\s*(inch|in|英寸)\s*(?:to|in|=|转)?\s*(cm|厘米)?$/i, fn: (v) => [`${OS.formatNumber(v * 2.54)} 厘米`, `${v} 英寸`] },
  ];
  const SETTINGS_PANES = () => (OS.apps.settings && OS.apps.settings.panes ? OS.apps.settings.panes() : []);

  function spResults(q) {
    const res = [];
    const ql = q.toLowerCase().trim();
    if (!ql) return res;
    // calculator
    if (/[\d)]\s*[-+*/×÷^%!]|^\s*(sqrt|sin|cos|tan|log|ln)\(|π/.test(q)) {
      const v = OS.calc(q);
      if (v != null) res.push({ group: '计算器', title: OS.formatNumber(v), sub: q.trim() + ' =', icon: OS.icon('calculator'), big: true, run: () => (navigator.clipboard && navigator.clipboard.writeText(String(v)).catch(() => {}), OS.toast('已拷贝结果')), preview: () => h('div.sp-prev-calc', h('div.spc-q', q + ' ='), h('div.spc-a', OS.formatNumber(v))) });
    }
    for (const u of UNITS) {
      const m = ql.match(u.re);
      if (m) {
        const [a, b] = u.fn(parseFloat(m[1]));
        res.push({ group: '转换', title: a, sub: b, icon: OS.icon('calculator'), big: true, run: () => navigator.clipboard && navigator.clipboard.writeText(a).catch(() => {}), preview: () => h('div.sp-prev-calc', h('div.spc-q', b), h('div.spc-a', a)) });
        break;
      }
    }
    // apps
    const apps = Object.values(OS.apps)
      .filter((a) => !a.hidden)
      .map((a) => {
        const names = [a.name, a.id, ...(a.keywords || [])].map((s) => s.toLowerCase());
        let score = 0;
        names.forEach((n) => {
          if (n === ql) score = Math.max(score, 100);
          else if (n.startsWith(ql)) score = Math.max(score, 80);
          else if (n.includes(ql)) score = Math.max(score, 50);
        });
        return { a, score };
      })
      .filter((x) => x.score)
      .sort((x, y) => y.score - x.score);
    apps.slice(0, 6).forEach(({ a }) =>
      res.push({ group: '应用程序', title: a.name, sub: '应用程序', icon: OS.icon(a.icon), run: () => OS.launch(a.id), preview: () => h('div.sp-prev-app', h('img', { src: OS.icon(a.icon), alt: '' }), h('div.spp-name', a.name), h('div.spp-meta', `版本 ${a.version || '26.1'} · ${OS.fmt.size(a.size || 48000000)}`), h('div.spp-desc', a.description || '')) })
    );
    // settings panes
    SETTINGS_PANES()
      .filter((p) => p.label.toLowerCase().includes(ql) || (p.keywords || '').toLowerCase().includes(ql))
      .slice(0, 3)
      .forEach((p) => res.push({ group: '系统设置', title: p.label, sub: '系统设置', icon: OS.icon('settings'), glyph: p.glyph, color: p.color, run: () => OS.launch('settings', { pane: p.id }) }));
    // files
    OS.vfs.search(ql, 8).forEach(({ path, node }) =>
      res.push({
        group: node.type === 'dir' ? '文件夹' : '文稿',
        title: node.name,
        sub: path.replace(OS.vfs.HOME, '~'),
        icon: OS.vfs.iconFor(node, path),
        run: () => OS.vfs.open(path),
        preview: () => node.kind === 'image' ? h('div.sp-prev-img', h('img', { src: node.src, alt: '' }), h('div.spp-meta', node.name)) : node.kind === 'text' ? h('pre.sp-prev-text', (node.content || '').slice(0, 900)) : h('div.sp-prev-app', h('img', { src: OS.vfs.iconFor(node, path), alt: '' }), h('div.spp-name', node.name), h('div.spp-meta', OS.vfs.kindLabel(node))),
      })
    );
    // notes, reminders, calendar from app stores
    (OS.store.get('notes', []) || []).filter((n) => (n.title + n.text).toLowerCase().includes(ql)).slice(0, 3).forEach((n) =>
      res.push({ group: '备忘录', title: n.title || '新备忘录', sub: (n.text || '').slice(0, 40), icon: OS.icon('notes'), run: () => OS.launch('notes', { id: n.id }) })
    );
    (OS.store.get('contacts.list', null) || []).filter((c) => c.name.toLowerCase().includes(ql)).slice(0, 2).forEach((c) =>
      res.push({ group: '通讯录', title: c.name, sub: c.phone || '', icon: OS.icon('contacts'), run: () => OS.launch('contacts', { id: c.id }) })
    );
    // web
    res.push({ group: '网页', title: `搜索网页：“${q.trim()}”`, sub: 'Safari 浏览器', icon: OS.icon('safari'), run: () => OS.launch('safari', { search: q.trim() }) });
    return res;
  }

  sp.open = (preset = '') => {
    if (sp.el) return sp.input.focus();
    OS.closeMenus();
    const input = h('input.sp-input', { id: 'spotlight-input', type: 'text', placeholder: '聚焦搜索', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div.sp-list', { role: 'listbox' });
    const prev = h('div.sp-preview');
    const body = h('div.sp-body', list, prev);
    const quick = h('div.sp-quick',
      ...[['apps', '应用程序', 'grid', () => OS.launch('launchpad')], ['files', '文件', 'folder', () => OS.launch('finder', { path: '~/Documents' })], ['actions', '操作', 'sparkles', () => OS.launch('shortcutsHelp')], ['clip', '剪贴板', 'square-on-square', () => OS.toast('剪贴板历史为空')]].map(([id, label, g, fn]) =>
        h('button.sp-chip', { title: label, 'aria-label': label, html: glyph(g), onclick: () => (sp.close(), fn()) })
      )
    );
    const panel = h('div.spotlight.glass', { role: 'dialog', 'aria-label': '聚焦' }, h('div.sp-bar', h('span.sp-glass', { html: glyph('search') }), input, quick), body);
    const veil = h('div.sp-veil', panel);
    veil.addEventListener('pointerdown', (e) => e.target === veil && sp.close());
    layer().appendChild(veil);
    sp.el = veil;
    sp.input = input;
    let results = [], sel = 0;

    const render = () => {
      const q = input.value;
      results = spResults(q);
      sel = 0;
      list.innerHTML = '';
      panel.classList.toggle('has-results', !!q.trim());
      quick.hidden = !!q.trim();
      let g = null;
      results.forEach((r, i) => {
        if (r.group !== g) {
          g = r.group;
          list.appendChild(h('div.sp-group', g));
        }
        const row = h('div.sp-row' + (r.big ? '.big' : ''), { role: 'option', dataset: { i } },
          r.glyph ? h('span.sp-ico.glyph', { html: glyph(r.glyph), style: { background: r.color } }) : h('img.sp-ico', { src: r.icon, alt: '' }),
          h('div.sp-txt', h('div.sp-title', r.title), r.sub && h('div.sp-sub', r.sub))
        );
        row.addEventListener('mousemove', () => i !== sel && select(i));
        row.addEventListener('click', () => go(i));
        list.appendChild(row);
      });
      select(0);
    };
    const select = (i) => {
      sel = i;
      $$('.sp-row', list).forEach((r) => r.classList.toggle('sel', +r.dataset.i === i));
      const r = results[i];
      prev.innerHTML = '';
      if (r && r.preview) prev.appendChild(r.preview());
      else if (r) prev.appendChild(h('div.sp-prev-app', r.glyph ? h('span.sp-ico.glyph.huge', { html: glyph(r.glyph), style: { background: r.color } }) : h('img', { src: r.icon, alt: '' }), h('div.spp-name', r.title), h('div.spp-meta', r.sub || '')));
      const row = list.querySelector(`.sp-row[data-i="${i}"]`);
      row && row.scrollIntoView({ block: 'nearest' });
    };
    const go = (i) => {
      const r = results[i];
      if (!r) return;
      sp.close();
      r.run();
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') (e.preventDefault(), results.length && select((sel + 1) % results.length));
      else if (e.key === 'ArrowUp') (e.preventDefault(), results.length && select((sel - 1 + results.length) % results.length));
      else if (e.key === 'Enter') (e.preventDefault(), go(sel));
      else if (e.key === 'Escape') {
        e.preventDefault();
        input.value ? ((input.value = ''), render()) : sp.close();
      } else if ((e.ctrlKey || e.altKey) && e.code === 'Space') (e.preventDefault(), sp.close());
    });
    input.value = preset;
    render();
    requestAnimationFrame(() => input.focus());
  };
  sp.close = () => {
    if (!sp.el) return;
    const el = sp.el;
    sp.el = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 160);
  };
  sp.toggle = () => (sp.el ? sp.close() : sp.open());

  /* ======================================================================
     Launchpad
     ====================================================================== */
  OS.registerApp({
    id: 'launchpad', name: '启动台', icon: 'launchpad', keywords: ['launchpad', 'apps', '应用程序'], noDock: false,
    action() {
      if ($('.launchpad')) return closeLaunchpad();
      openLaunchpad();
    },
  });
  let lpPage = 0;
  function openLaunchpad() {
    OS.closeMenus();
    sp.close();
    const order = OS.store.get('launchpad.order', null);
    let apps = Object.values(OS.apps).filter((a) => !a.hidden && a.id !== 'launchpad');
    if (order) apps.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
    const per = 35;
    const search = h('input.lp-search', { id: 'launchpad-search', type: 'search', placeholder: '搜索' });
    const pagesEl = h('div.lp-pages');
    const dots = h('div.lp-dots');
    const lp = h('div.launchpad', { role: 'dialog', 'aria-label': '启动台' }, h('div.lp-bg', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }), h('div.lp-top', h('div.lp-search-wrap', h('span', { html: glyph('search') }), search)), pagesEl, dots);
    const render = (list) => {
      pagesEl.innerHTML = '';
      dots.innerHTML = '';
      const pages = Math.max(1, Math.ceil(list.length / per));
      lpPage = Math.min(lpPage, pages - 1);
      for (let p = 0; p < pages; p++) {
        const grid = h('div.lp-grid');
        list.slice(p * per, (p + 1) * per).forEach((a, i) => {
          const it = h('button.lp-app', { style: { '--i': i } }, a.id === 'calendar' ? h('div.lp-icon-wrap', OS.calendarIcon()) : h('img', { src: OS.icon(a.icon), alt: '', draggable: 'false' }), h('span', a.name));
          it.addEventListener('click', () => {
            closeLaunchpad();
            setTimeout(() => OS.launch(a.id), 120);
          });
          grid.appendChild(it);
        });
        pagesEl.appendChild(h('div.lp-page', grid));
        const dot = h('button.lp-dot', { 'aria-label': `第 ${p + 1} 页`, onclick: () => goPage(p) });
        dots.appendChild(dot);
      }
      goPage(lpPage, false);
    };
    const goPage = (p, anim = true) => {
      const n = pagesEl.children.length;
      lpPage = clamp(p, 0, n - 1);
      pagesEl.style.transition = anim ? '' : 'none';
      pagesEl.style.transform = `translateX(${-lpPage * 100}%)`;
      $$('.lp-dot', dots).forEach((d, i) => d.classList.toggle('on', i === lpPage));
      dots.hidden = n < 2;
    };
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      lpPage = 0;
      render(q ? apps.filter((a) => [a.name, a.id, ...(a.keywords || [])].some((s) => s.toLowerCase().includes(q))) : apps);
    });
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') closeLaunchpad();
      if (e.key === 'Enter') {
        const first = lp.querySelector('.lp-app');
        first && first.click();
      }
      if (e.key === 'ArrowRight' && !search.value) goPage(lpPage + 1);
      if (e.key === 'ArrowLeft' && !search.value) goPage(lpPage - 1);
    });
    lp.addEventListener('click', (e) => {
      if (e.target === lp || e.target.classList.contains('lp-page') || e.target.classList.contains('lp-grid') || e.target.classList.contains('lp-pages')) closeLaunchpad();
    });
    let wheelLock = false;
    lp.addEventListener('wheel', (e) => {
      if (wheelLock || Math.abs(e.deltaX) + Math.abs(e.deltaY) < 20) return;
      wheelLock = true;
      goPage(lpPage + ((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1));
      setTimeout(() => (wheelLock = false), 500);
    }, { passive: true });
    // swipe with pointer
    let sx = null;
    pagesEl.addEventListener('pointerdown', (e) => (sx = e.clientX));
    pagesEl.addEventListener('pointerup', (e) => {
      if (sx != null && Math.abs(e.clientX - sx) > 60) goPage(lpPage + (e.clientX < sx ? 1 : -1));
      sx = null;
    });
    layer().appendChild(lp);
    document.body.classList.add('launchpad-open');
    render(apps);
    requestAnimationFrame(() => {
      lp.classList.add('in');
      search.focus();
    });
  }
  function closeLaunchpad() {
    const lp = $('.launchpad');
    if (!lp) return;
    lp.classList.remove('in');
    lp.classList.add('out');
    document.body.classList.remove('launchpad-open');
    setTimeout(() => lp.remove(), 300);
  }
  OS.closeLaunchpad = closeLaunchpad;

  /* ======================================================================
     Mission Control & App Exposé (real windows are transformed in place)
     ====================================================================== */
  const mc = (OS.mission = { active: false });
  mc.open = (appId) => {
    if (mc.active) return mc.close();
    OS.closeMenus();
    sp.close();
    closeLaunchpad();
    mc.active = true;
    mc.appId = typeof appId === 'string' ? appId : null;
    const scr = wm.screen();
    document.body.classList.add('mission');
    const ov = h('div.mc-overlay');
    const bar = h('div.mc-spaces');
    if (!mc.appId) {
      OS.spaces.list.forEach((s, i) => {
        const th = h('div.mc-space' + (i === OS.spaces.current ? '.cur' : ''), { title: '桌面 ' + (i + 1), dataset: { i } },
          h('div.mc-space-thumb', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } },
            ...wm.windows.filter((w) => w.space === s && w.state !== 'min').map((w) => h('div.mc-mini', { style: { left: (w.bounds.x / scr.w) * 100 + '%', top: (w.bounds.y / scr.h) * 100 + '%', width: (w.bounds.w / scr.w) * 100 + '%', height: (w.bounds.h / scr.h) * 100 + '%' } }))
          ),
          h('span.mc-space-name', '桌面 ' + (i + 1)),
          OS.spaces.list.length > 1 ? h('button.mc-space-x', { 'aria-label': '移除桌面', html: glyph('xmark'), onclick: (e) => (e.stopPropagation(), OS.spaces.remove(i), mc.close(), setTimeout(() => mc.open(), 380)) }) : null
        );
        th.addEventListener('click', () => {
          OS.spaces.go(i);
          mc.close();
        });
        bar.appendChild(th);
      });
      bar.appendChild(h('button.mc-add', { 'aria-label': '添加桌面', title: '添加桌面', html: glyph('plus'), onclick: () => (OS.spaces.add(), mc.close(), setTimeout(() => mc.open(), 380)) }));
      ov.appendChild(bar);
    }
    layer().appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    ov.addEventListener('click', (e) => e.target === ov && mc.close());

    // compute grid layout for visible windows
    const wins = wm.windows.filter((w) => w.space === OS.spaces.currentSpace() && w.state !== 'min' && !w.hiddenApp && (!mc.appId || w.app.id === mc.appId));
    const top = mc.appId ? 60 : 150, pad = 50, bottom = 60;
    const W = scr.w - pad * 2, H = scr.h - top - bottom;
    const n = wins.length;
    if (!n) {
      ov.appendChild(h('div.mc-empty', mc.appId ? '没有窗口' : ''));
    }
    let cols = Math.ceil(Math.sqrt(n * (W / H) / 1.4));
    cols = clamp(cols, 1, n || 1);
    const rows = Math.ceil(n / cols);
    const cw = W / cols, ch = H / rows;
    // order by original position (left-to-right, top-to-bottom) for spatial continuity
    const ordered = wins.slice().sort((a, b) => a.bounds.y + a.bounds.x / 3 - (b.bounds.y + b.bounds.x / 3));
    mc.items = ordered.map((w, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const offset = ((cols - inRow) * cw) / 2;
      const s = Math.min((cw - 36) / w.bounds.w, (ch - 50) / w.bounds.h, 0.8);
      const tx = pad + offset + c * cw + (cw - w.bounds.w * s) / 2;
      const ty = top + r * ch + (ch - w.bounds.h * s) / 2;
      w.el.classList.add('mc-win');
      w.el.style.transformOrigin = '0 0';
      w.el.style.transform = `translate(${tx - w.bounds.x}px, ${ty - w.bounds.y}px) scale(${s})`;
      const label = h('div.mc-label', h('img', { src: OS.icon(w.app.icon), alt: '' }), h('span', w.title));
      label.style.left = tx + (w.bounds.w * s) / 2 + 'px';
      label.style.top = ty + w.bounds.h * s + 10 + 'px';
      ov.appendChild(label);
      const pick = (e) => {
        if (!mc.active) return;
        e.stopPropagation();
        e.preventDefault();
        mc.close(w);
      };
      w._mcPick = pick;
      w.el.addEventListener('pointerdown', pick, true);
      w.el.addEventListener('mouseenter', (w._mcEnter = () => label.classList.add('show')));
      w.el.addEventListener('mouseleave', (w._mcLeave = () => label.classList.remove('show')));
      return w;
    });
  };
  mc.close = (focusWin) => {
    if (!mc.active) return;
    mc.active = false;
    document.body.classList.remove('mission');
    (mc.items || []).forEach((w) => {
      w.el.style.transform = '';
      w.el.removeEventListener('pointerdown', w._mcPick, true);
      w.el.removeEventListener('mouseenter', w._mcEnter);
      w.el.removeEventListener('mouseleave', w._mcLeave);
      setTimeout(() => w.el.classList.remove('mc-win'), 420);
    });
    const ov = $('.mc-overlay');
    if (ov) {
      ov.classList.remove('in');
      setTimeout(() => ov.remove(), 380);
    }
    if (focusWin && focusWin.el) wm.focus(focusWin);
  };
  mc.toggle = () => (mc.active ? mc.close() : mc.open());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && mc.active && mc.close(), true);

  /* ======================================================================
     Show Desktop: push every window off-screen
     ====================================================================== */
  const sd = (OS.showDesktop = { active: false });
  sd.toggle = () => {
    sd.active = !sd.active;
    const scr = wm.screen();
    wm.windows.filter((w) => w.space === OS.spaces.currentSpace()).forEach((w) => {
      if (sd.active) {
        const cx = w.bounds.x + w.bounds.w / 2, cy = w.bounds.y + w.bounds.h / 2;
        const dx = cx < scr.w / 2 ? -(w.bounds.x + w.bounds.w - 40) : scr.w - w.bounds.x - 40;
        const dy = cy < scr.h / 2 ? -(w.bounds.y + w.bounds.h - 40) : scr.h - w.bounds.y - 40;
        w.el.classList.add('sd-hide');
        w.el.style.transform = `translate(${dx}px, ${dy}px)`;
      } else {
        w.el.style.transform = '';
        setTimeout(() => w.el.classList.remove('sd-hide'), 450);
      }
    });
    document.body.classList.toggle('showing-desktop', sd.active);
  };

  /* ======================================================================
     App Switcher (⌥Tab)
     ====================================================================== */
  const mru = [];
  OS.on('focus', (id) => {
    const i = mru.indexOf(id);
    if (i >= 0) mru.splice(i, 1);
    mru.unshift(id);
  });
  const sw = (OS.switcher = { el: null, idx: 0 });
  sw.next = (back) => {
    const apps = ['finder', ...mru.filter((id) => id !== 'finder')].filter((id, i, a) => (OS.running.has(id) || id === 'finder') && a.indexOf(id) === i);
    // the most recent app first
    const list = mru.filter((id) => OS.running.has(id) || id === 'finder').concat(apps).filter((v, i, a) => a.indexOf(v) === i);
    if (!sw.el) {
      sw.list = list;
      sw.idx = list.length > 1 ? 1 : 0;
      sw.el = h('div.switcher.glass', { role: 'listbox' }, list.map((id) => h('div.sw-item', { dataset: { id } }, h('img', { src: OS.icon(OS.apps[id].icon), alt: '' }))), h('div.sw-name'));
      layer().appendChild(sw.el);
      const onUp = (e) => {
        if (e.key === 'Alt' || e.key === 'Meta' || e.key === 'Control') {
          document.removeEventListener('keyup', onUp, true);
          sw.commit();
        }
      };
      document.addEventListener('keyup', onUp, true);
      $$('.sw-item', sw.el).forEach((it, i) => it.addEventListener('click', () => ((sw.idx = i), sw.commit())));
    } else {
      sw.idx = (sw.idx + (back ? -1 : 1) + sw.list.length) % sw.list.length;
    }
    $$('.sw-item', sw.el).forEach((it, i) => it.classList.toggle('sel', i === sw.idx));
    sw.el.querySelector('.sw-name').textContent = OS.apps[sw.list[sw.idx]].name;
  };
  sw.commit = () => {
    if (!sw.el) return;
    const id = sw.list[sw.idx];
    sw.el.remove();
    sw.el = null;
    if (id === 'finder' && !wm.appWindows('finder').length) return wm.blurAll();
    OS.showAllApps();
    if (!wm.focusApp(id)) OS.launch(id);
  };

  /* ======================================================================
     Control Center
     ====================================================================== */
  const cc = (OS.cc = { el: null });
  function ccToggle(label, g, key, sub) {
    const on = !!OS.settings[key];
    const el = h('button.cc-toggle' + (on ? '.on' : ''), { 'aria-pressed': on },
      h('span.cc-circle', { html: glyph(g) }),
      h('span.cc-tlabel', h('b', label), h('small', sub ? sub(on) : on ? '打开' : '关闭'))
    );
    el.onclick = () => {
      OS.setSetting(key, !OS.settings[key]);
      cc.render();
    };
    return el;
  }
  function slider(id, g, value, oninput, onchange) {
    const input = h('input.cc-range', { id, type: 'range', min: 0, max: 100, value });
    const fill = () => input.style.setProperty('--v', input.value + '%');
    fill();
    input.addEventListener('input', () => (fill(), oninput(+input.value)));
    input.addEventListener('change', () => onchange && onchange(+input.value));
    return h('div.cc-slider', h('span.cc-sicon', { html: glyph(g) }), input);
  }
  cc.render = () => {
    if (!cc.el) return;
    const np = OS.music && OS.music.state();
    cc.el.innerHTML = '';
    cc.el.append(
      h('div.cc-grid',
        h('div.cc-tile.cc-conn',
          ccToggle('Wi-Fi', 'wifi', 'wifi', (on) => (on ? OS.store.get('wifiName', 'Apple Park') : '关闭')),
          ccToggle('蓝牙', 'bluetooth', 'bluetooth', (on) => (on ? '打开' : '关闭')),
          (() => {
            const el = h('button.cc-toggle' + (OS.settings.airdrop !== 'off' ? '.on' : ''), h('span.cc-circle', { html: glyph('airdrop') }), h('span.cc-tlabel', h('b', '隔空投送'), h('small', OS.settings.airdrop === 'off' ? '关闭' : OS.settings.airdrop === 'all' ? '所有人' : '仅限联系人')));
            el.onclick = () => (OS.setSetting('airdrop', { off: 'contacts', contacts: 'all', all: 'off' }[OS.settings.airdrop] || 'contacts'), cc.render());
            return el;
          })()
        ),
        h('div.cc-col',
          (() => {
            const el = h('button.cc-tile.cc-focus' + (OS.settings.focus ? '.on' : ''), h('span.cc-circle', { html: glyph('moon') }), h('span.cc-tlabel', h('b', '专注模式'), h('small', OS.settings.focus ? '勿扰模式' : '关闭')));
            el.onclick = () => (OS.setSetting('focus', !OS.settings.focus), cc.render());
            return el;
          })(),
          h('div.cc-pair',
            (() => {
              const el = h('button.cc-tile.cc-small' + (OS.settings.stageManager ? '.on' : ''), { title: '台前调度' }, h('span', { html: glyph('stage-manager') }), h('small', '台前调度'));
              el.onclick = () => (OS.setSetting('stageManager', !OS.settings.stageManager), cc.render());
              return el;
            })(),
            (() => {
              const el = h('button.cc-tile.cc-small', { title: '屏幕镜像' }, h('span', { html: glyph('screen-mirror') }), h('small', '屏幕镜像'));
              el.onclick = () => OS.toast('未找到可用的 AirPlay 设备');
              return el;
            })()
          )
        ),
        h('div.cc-tile.cc-wide',
          h('div.cc-title', '显示器'),
          slider('cc-brightness', 'sun-fill', OS.settings.brightness, (v) => OS.setSetting('brightness', Math.max(8, v))),
          h('div.cc-row-btns',
            (() => {
              const b = h('button.cc-pill' + (OS.isDark() ? '.on' : ''), h('span', { html: glyph('circle-half') }), '深色模式');
              b.onclick = () => (OS.setSetting('appearance', OS.isDark() ? 'light' : 'dark'), cc.render());
              return b;
            })(),
            (() => {
              const b = h('button.cc-pill' + (OS.settings.nightShift ? '.on' : ''), h('span', { html: glyph('sun') }), '夜览');
              b.onclick = () => (OS.setSetting('nightShift', !OS.settings.nightShift), cc.render());
              return b;
            })()
          )
        ),
        h('div.cc-tile.cc-wide',
          h('div.cc-title', '声音'),
          slider('cc-volume', 'speaker', OS.settings.volume, (v) => OS.setSetting('volume', v), () => OS.sound.play('volume'))
        ),
        h('div.cc-tile.cc-wide.cc-np',
          h('div.cc-art', { style: { background: np && np.track ? np.track.art : 'linear-gradient(135deg,#fc5c7d,#6a82fb)' } }, h('span', { html: glyph('play') })),
          h('div.cc-np-txt', h('b', np && np.track ? np.track.title : '音乐'), h('small', np && np.track ? np.track.artist : '未在播放')),
          h('div.cc-np-ctl',
            h('button', { 'aria-label': '上一首', html: glyph('prev'), onclick: () => OS.music && OS.music.prev() }),
            h('button', { 'aria-label': '播放或暂停', html: glyph(np && np.playing ? 'pause' : 'play'), onclick: () => (OS.music ? OS.music.toggle() : OS.launch('music'), setTimeout(cc.render, 60)) }),
            h('button', { 'aria-label': '下一首', html: glyph('next'), onclick: () => OS.music && OS.music.next() })
          )
        ),
        h('div.cc-tile.cc-wide.cc-edit', h('button.cc-edit-btn', { onclick: () => (cc.close(), OS.launch('settings', { pane: 'controlcenter' })) }, '编辑控制'))
      )
    );
  };
  cc.open = () => {
    if (cc.el) return;
    OS.closeMenus();
    nc.close();
    cc.el = h('div.control-center.glass.overlay-panel', { role: 'dialog', 'aria-label': '控制中心' });
    layer().appendChild(cc.el);
    cc.render();
    $('#mb-cc') && $('#mb-cc').classList.add('open');
    setTimeout(() => document.addEventListener('pointerdown', ccOutside, true), 0);
  };
  function ccOutside(e) {
    if (cc.el && !cc.el.contains(e.target) && !e.target.closest('#mb-cc')) cc.close();
  }
  cc.close = () => {
    if (!cc.el) return;
    const el = cc.el;
    cc.el = null;
    $('#mb-cc') && $('#mb-cc').classList.remove('open');
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
    document.removeEventListener('pointerdown', ccOutside, true);
  };
  cc.toggle = () => (cc.el ? cc.close() : cc.open());
  OS.on('music', () => cc.render());

  /* ======================================================================
     Notification Center + widgets
     ====================================================================== */
  const nc = (OS.nc = { el: null });
  function analog(tz, label, size = 64) {
    const c = h('canvas.w-clock', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
    const draw = () => {
      const x = c.getContext('2d');
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
      const night = now.getHours() < 6 || now.getHours() >= 18;
      const S = size * 2, r = S / 2;
      x.clearRect(0, 0, S, S);
      x.fillStyle = night ? '#1c1c1e' : '#fff';
      x.beginPath();
      x.arc(r, r, r - 2, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = night ? '#fff' : '#111';
      x.font = `500 ${S * 0.12}px Inter, -apple-system, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        x.fillText(i, r + Math.cos(a) * r * 0.74, r + Math.sin(a) * r * 0.74);
      }
      const hand = (ang, len, w, col) => {
        x.strokeStyle = col;
        x.lineWidth = w;
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(r, r);
        x.lineTo(r + Math.cos(ang - Math.PI / 2) * len, r + Math.sin(ang - Math.PI / 2) * len);
        x.stroke();
      };
      const hrs = now.getHours() % 12 + now.getMinutes() / 60, mins = now.getMinutes() + now.getSeconds() / 60;
      hand((hrs / 12) * Math.PI * 2, r * 0.48, S * 0.045, night ? '#fff' : '#111');
      hand((mins / 60) * Math.PI * 2, r * 0.7, S * 0.03, night ? '#fff' : '#111');
      hand((now.getSeconds() / 60) * Math.PI * 2, r * 0.78, S * 0.012, '#ff9500');
      x.fillStyle = '#ff9500';
      x.beginPath();
      x.arc(r, r, S * 0.025, 0, Math.PI * 2);
      x.fill();
    };
    draw();
    c._draw = draw;
    return h('div.w-clock-cell', c, h('span', label), h('small', (() => {
      const off = (new Date(new Date().toLocaleString('en-US', { timeZone: tz })) - new Date(new Date().toLocaleString('en-US'))) / 3600000;
      return off === 0 ? '今天' : (off > 0 ? '+' : '') + Math.round(off) + '小时';
    })()));
  }
  function widgets() {
    const now = new Date();
    const events = (OS.store.get('calendar.events', []) || []).filter((e) => e.date === now.toISOString().slice(0, 10)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const reminders = (OS.store.get('reminders', null) || []).filter((r) => !r.done).slice(0, 4);
    const wx = OS.store.get('weather.cache', null);
    const cal = h('div.widget.w-cal',
      h('div.w-cal-left', h('div.w-cal-wd', OS.fmt.week(now).replace('周', '星期')), h('div.w-cal-day', now.getDate()), h('div.w-cal-next', events.length ? '' : '今天没有更多日程')),
      h('div.w-cal-events', events.slice(0, 3).map((e) => h('div.w-ev', { style: { '--c': e.color || '#ff3b30' } }, h('b', e.title), h('small', e.allDay ? '全天' : `${e.start}–${e.end}`))))
    );
    cal.onclick = () => (nc.close(), OS.launch('calendar'));
    const weather = h('div.widget.w-weather' + (wx ? '' : '.sample'),
      h('div.w-wx-city', (wx && wx.city) || '上海', h('span', { html: glyph('location') })),
      h('div.w-wx-temp', (wx ? Math.round(wx.temp) : 22) + '°'),
      h('div.w-wx-cond', (wx && wx.cond) || '多云'),
      h('div.w-wx-hl', `最高 ${wx ? Math.round(wx.hi) : 25}° 最低 ${wx ? Math.round(wx.lo) : 17}°`)
    );
    weather.onclick = () => (nc.close(), OS.launch('weather'));
    const clocks = h('div.widget.w-clocks', analog(Intl.DateTimeFormat().resolvedOptions().timeZone, '本地'), analog('America/Los_Angeles', '库比蒂诺'), analog('Europe/London', '伦敦'), analog('Asia/Tokyo', '东京'));
    clocks.onclick = () => (nc.close(), OS.launch('clock'));
    const rem = h('div.widget.w-rem', h('div.w-rem-head', h('span.w-rem-ico', { html: glyph('list') }), h('b', '提醒事项'), h('span.w-rem-count', reminders.length)),
      reminders.length ? reminders.map((r) => h('div.w-rem-item', h('span.w-rem-c'), r.title)) : h('div.w-rem-empty', '全部完成'));
    rem.onclick = () => (nc.close(), OS.launch('reminders'));
    const bat = h('div.widget.w-bat',
      h('div.w-bat-ring', { style: { '--p': Math.round(OS.battery.level * 100) } }, h('span', { html: glyph('laptop') })),
      h('div', h('b', Math.round(OS.battery.level * 100) + '%'), h('small', OS.battery.charging ? '正在充电' : 'MacBook Pro'))
    );
    const photo = h('div.widget.w-photo', { style: { backgroundImage: `url("${OS.wallpaperThumb('tahoe-beach-dusk').replace('thumbs', 'wallpapers')}")` } }, h('div.w-photo-cap', h('b', '精选照片'), h('small', '太浩湖 · 黄昏')));
    photo.onclick = () => (nc.close(), OS.launch('photos'));
    return h('div.widgets', cal, h('div.w-row', weather, rem), clocks, h('div.w-row', bat, photo));
  }
  nc.render = () => {
    if (!nc.el) return;
    nc.el.innerHTML = '';
    const list = h('div.nc-notes');
    if (OS.notifications.length) {
      const groups = {};
      OS.notifications.slice(0, 12).forEach((n) => (groups[n.app] = groups[n.app] || []).push(n));
      list.appendChild(h('div.nc-head', h('b', '通知'), h('button.nc-clear', { onclick: () => ((OS.notifications = []), saveNotes(), nc.render()) }, '清除全部')));
      Object.values(groups).forEach((g) => {
        const n = g[0];
        const card = h('div.nc-card.glass-inner' + (g.length > 1 ? '.stacked' : ''),
          h('img.banner-icon', { src: n.icon, alt: '' }),
          h('div.banner-text', h('div.banner-top', h('b', n.title), h('span.banner-time', OS.fmt.relative(n.time))), h('div.banner-body', n.body), g.length > 1 ? h('div.nc-more', `还有 ${g.length - 1} 条通知`) : null),
          h('button.banner-x', { 'aria-label': '清除', html: glyph('xmark'), onclick: (e) => (e.stopPropagation(), (OS.notifications = OS.notifications.filter((x) => x.app !== n.app)), saveNotes(), nc.render()) })
        );
        card.onclick = () => (nc.close(), OS.apps[n.app] && OS.launch(n.app));
        list.appendChild(card);
      });
    }
    nc.el.append(list, widgets(), h('button.nc-edit', { onclick: () => OS.toast('拖动小组件到桌面即可添加（演示）') }, '编辑小组件'));
  };
  let ncTimer;
  nc.open = () => {
    if (nc.el) return;
    OS.closeMenus();
    cc.close();
    nc.el = h('div.notification-center.overlay-panel', { role: 'complementary', 'aria-label': '通知中心' });
    layer().appendChild(nc.el);
    nc.render();
    ncTimer = setInterval(() => $$('.w-clock', nc.el).forEach((c) => c._draw && c._draw()), 1000);
    setTimeout(() => document.addEventListener('pointerdown', ncOutside, true), 0);
  };
  function ncOutside(e) {
    if (nc.el && !nc.el.contains(e.target) && !e.target.closest('#mb-clock')) nc.close();
  }
  nc.close = () => {
    if (!nc.el) return;
    const el = nc.el;
    nc.el = null;
    clearInterval(ncTimer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
    document.removeEventListener('pointerdown', ncOutside, true);
  };
  nc.toggle = () => (nc.el ? nc.close() : nc.open());
  OS.on('notifications', () => nc.render());

  /* ======================================================================
     Siri (Apple Intelligence style glow + type to Siri)
     ====================================================================== */
  const siri = (OS.siri = { el: null });
  function siriAnswer(q) {
    const t = q.trim();
    const lower = t.toLowerCase();
    const app = Object.values(OS.apps).find((a) => !a.hidden && (t.includes(a.name) || (a.keywords || []).some((k) => lower.includes(k.toLowerCase()))));
    if (/^(打开|启动|open)/i.test(t) && app) return OS.launch(app.id), `正在打开“${app.name}”。`;
    if (/几点|时间|time/.test(lower)) return `现在是 ${OS.fmt.time(new Date())}。`;
    if (/日期|几号|星期|周几|date/.test(lower)) return `今天是 ${OS.fmt.date(new Date())}，${OS.fmt.week(new Date()).replace('周', '星期')}。`;
    if (/天气|weather/.test(lower)) {
      const wx = OS.store.get('weather.cache', null);
      OS.launch('weather');
      return wx ? `${wx.city}现在 ${Math.round(wx.temp)}°，${wx.cond}。` : '我帮你打开了“天气”。';
    }
    if (/深色|dark/.test(lower)) return OS.setSetting('appearance', 'dark'), '已切换到深色模式。';
    if (/浅色|light/.test(lower)) return OS.setSetting('appearance', 'light'), '已切换到浅色模式。';
    if (/播放|音乐|play/.test(lower)) return OS.launch('music', { play: true }), '开始播放音乐。';
    if (/暂停|pause|stop/.test(lower)) return OS.music && OS.music.pause(), '已暂停。';
    if (/截屏|screenshot/.test(lower)) return setTimeout(() => OS.screenshot('screen'), 600), '好的，马上截屏。';
    if (/勿扰|专注/.test(lower)) return OS.setSetting('focus', !OS.settings.focus), OS.settings.focus ? '已打开勿扰模式。' : '已关闭勿扰模式。';
    if (/锁定|lock/.test(lower)) return setTimeout(() => OS.power.lock(), 800), '正在锁定屏幕。';
    if (/提醒我|remind/.test(lower)) {
      const title = t.replace(/^.*?提醒我/, '').trim() || t;
      const list = OS.store.get('reminders', null) || [];
      list.unshift({ id: OS.uid(), title, done: false, list: 'reminders', created: Date.now() });
      OS.store.set('reminders', list);
      OS.emit('reminders');
      return `好的，我会提醒你“${title}”。`;
    }
    if (/计时|timer/.test(lower)) {
      const m = t.match(/(\d+)\s*(分钟|分|min)/);
      const s = t.match(/(\d+)\s*(秒|s)/);
      const secs = (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0) || 60;
      OS.launch('clock', { tab: 'timer', seconds: secs });
      return `计时器已设为 ${Math.floor(secs / 60)} 分 ${secs % 60} 秒。`;
    }
    const v = OS.calc(t.replace(/等于几|是多少|等于|[?？]/g, ''));
    if (v != null && /\d/.test(t)) return `答案是 ${OS.formatNumber(v)}。`;
    if (/你好|hello|hi\b/.test(lower)) return `你好，${OS.user.name}。有什么可以帮你？`;
    if (/你是谁|who are you/.test(lower)) return '我是这台 Mac 上的 Siri。我可以打开应用、查天气、设置计时器、切换深色模式、做算术。';
    if (app) return OS.launch(app.id), `正在打开“${app.name}”。`;
    OS.launch('safari', { search: t });
    return `这是网上关于“${t}”的结果。`;
  }
  siri.open = () => {
    if (siri.el) return siri.input.focus();
    OS.closeMenus();
    const input = h('input.siri-input', { id: 'siri-input', type: 'text', placeholder: '询问 Siri…', autocomplete: 'off' });
    const reply = h('div.siri-reply');
    const box = h('div.siri-box.glass', h('span.siri-orb'), input);
    const el = h('div.siri', h('div.siri-glow'), h('div.siri-stack', reply, box));
    el.addEventListener('pointerdown', (e) => e.target === el && siri.close());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') siri.close();
      if (e.key === 'Enter' && input.value.trim()) {
        const q = input.value;
        input.value = '';
        box.classList.add('thinking');
        setTimeout(() => {
          box.classList.remove('thinking');
          const a = siriAnswer(q);
          reply.innerHTML = '';
          reply.append(h('div.siri-q', q), h('div.siri-a.glass', a));
          reply.classList.add('show');
          if ('speechSynthesis' in window && OS.settings.sounds) {
            try {
              const u = new SpeechSynthesisUtterance(a);
              u.lang = 'zh-CN';
              u.volume = OS.settings.volume / 100;
              speechSynthesis.speak(u);
            } catch (err) {}
          }
        }, 650);
      }
    });
    layer().appendChild(el);
    siri.el = el;
    siri.input = input;
    requestAnimationFrame(() => (el.classList.add('in'), input.focus()));
  };
  siri.close = () => {
    if (!siri.el) return;
    const el = siri.el;
    siri.el = null;
    el.classList.remove('in');
    setTimeout(() => el.remove(), 400);
    try {
      speechSynthesis.cancel();
    } catch (e) {}
  };
  siri.toggle = () => (siri.el ? siri.close() : siri.open());

  /* ======================================================================
     Screenshots (html2canvas is loaded on first use)
     ====================================================================== */
  OS.screenshot = async function (mode = 'screen') {
    const target = mode === 'window' && wm.focused ? wm.focused.el : $('#screen');
    OS.sound.play('shutter');
    const flash = h('div.shot-flash');
    (mode === 'window' && wm.focused ? wm.focused.el : $('#screen')).appendChild(flash);
    setTimeout(() => flash.remove(), 500);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `截屏 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.jpg`;
    try {
      await OS.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const canvas = await window.html2canvas(target, {
        backgroundColor: null,
        scale: Math.min(1, 1400 / target.offsetWidth),
        logging: false,
        useCORS: true,
        ignoreElements: (el) => el.classList && (el.classList.contains('shot-flash') || el.classList.contains('banner-stack') || el.classList.contains('shot-thumb')),
      });
      const url = canvas.toDataURL('image/jpeg', 0.82);
      const path = OS.vfs.HOME + '/Desktop/' + OS.vfs.uniqueName('~/Desktop', name);
      OS.vfs.write(path, null, { kind: 'image', src: url, size: Math.round(url.length * 0.75) });
      const th = h('div.shot-thumb', h('img', { src: url, alt: '截屏' }));
      th.onclick = () => (th.remove(), OS.launch('preview', { path }));
      layer().appendChild(th);
      setTimeout(() => th.classList.add('out'), 4500);
      setTimeout(() => th.remove(), 5000);
    } catch (err) {
      OS.notify({ app: 'finder', title: '无法截屏', body: '截屏组件需要联网加载，请检查网络后重试。' });
    }
  };

  /* ======================================================================
     Quick Look
     ====================================================================== */
  OS.quickLook = (path) => {
    if ($('.quicklook')) return $('.quicklook').remove();
    const node = path === '/' ? null : OS.vfs.resolve(path);
    if (!node) return;
    const content = node.kind === 'image' ? h('img.ql-img', { src: node.src, alt: node.name }) : node.type === 'dir' ? h('div.ql-folder', h('img', { src: OS.vfs.iconFor(node, path), alt: '' }), h('b', node.name), h('small', `${node.children.length} 个项目`)) : node.kind === 'text' ? h('pre.ql-text', node.content || '') : h('div.ql-folder', h('img', { src: OS.vfs.iconFor(node, path), alt: '' }), h('b', node.name), h('small', OS.vfs.kindLabel(node)));
    const ql = h('div.quicklook.glass', { role: 'dialog', 'aria-label': '快速查看' },
      h('div.ql-bar', h('button.ql-x', { 'aria-label': '关闭', html: glyph('xmark'), onclick: () => ql.remove() }), h('span.ql-title', node.name), h('button.ql-open', { onclick: () => (ql.remove(), OS.vfs.open(path)) }, node.kind === 'image' ? '用“预览”打开' : node.type === 'dir' ? '在访达中打开' : '用“文本编辑”打开')),
      h('div.ql-body', content)
    );
    layer().appendChild(ql);
    const key = (e) => {
      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        ql.remove();
        document.removeEventListener('keydown', key, true);
      }
    };
    document.addEventListener('keydown', key, true);
  };

  /* ======================================================================
     Trash, Force Quit, About, Get Info, Shortcuts help (small system apps)
     ====================================================================== */
  OS.emptyTrash = async () => {
    const n = OS.vfs.trashCount();
    if (!n) return;
    const r = await OS.alert({ title: '确定要永久抹掉废纸篓中的项目吗？', message: '此操作无法撤销。', icon: OS.icon('trash-full'), buttons: [{ label: '取消' }, { label: '清倒废纸篓', primary: true }], destructive: true });
    if (r === 1) OS.vfs.emptyTrash();
  };
  OS.registerApp({ id: 'trash', name: '废纸篓', icon: 'trash', hidden: true, action: () => OS.launch('finder', { path: '~/.Trash' }) });

  OS.forceQuit = () => OS.launch('forcequit');
  OS.registerApp({
    id: 'forcequit', name: '强制退出应用程序', icon: 'activitymonitor', hidden: true, singleton: true, resizable: false, chrome: 'standard', width: 420, height: 400, quitOnClose: true, noDock: true,
    create(win) {
      let sel = null;
      const list = h('div.fq-list');
      const btn = h('button.btn.primary', { disabled: true, onclick: () => sel && (wm.quit(sel), render()) }, '强制退出');
      const render = () => {
        list.innerHTML = '';
        ['finder', ...[...OS.running.keys()].filter((id) => id !== 'finder' && id !== 'forcequit')].forEach((id) => {
          const a = OS.apps[id];
          const row = h('div.fq-row' + (sel === id ? '.sel' : ''), h('img', { src: OS.icon(a.icon), alt: '' }), h('span', a.name));
          row.onclick = () => ((sel = id), (btn.disabled = false), (btn.textContent = id === 'finder' ? '重新开启' : '强制退出'), render());
          list.appendChild(row);
        });
      };
      win.body.append(h('div.fq', h('p.fq-note', '如果应用程序在一段时间内没有响应，请选择其名称并点按“强制退出”。'), list, h('div.fq-foot', h('small', '你可以按 ⌥⌘⎋ 打开此窗口。'), btn)));
      render();
      win.on('close', OS.on('windows', render));
    },
  });

  OS.registerApp({
    id: 'about', name: '关于本机', icon: 'settings', hidden: true, singleton: true, resizable: false, width: 300, height: 470, quitOnClose: true, noDock: true, windowClass: 'about-win',
    create(win) {
      const official = 'https://www.apple.com/v/macbook-pro/ax/images/overview/contrast/macbook_pro_14_16__ns1ipedt40qm_large_2x.png';
      const img = h('img.about-img', { src: official, alt: 'MacBook Pro', draggable: 'false' });
      img.onerror = () => (img.onerror = null, (img.src = 'assets/mbp-official.png'));
      const row = (k, v) => h('div.about-row', h('span', k), h('b', v));
      win.body.append(
        h('div.about', { 'data-drag': '' },
          img,
          h('div.about-name', 'MacBook Pro'),
          h('div.about-sub', '14 英寸，2025'),
          h('div.about-specs',
            row('芯片', 'Apple M5'),
            row('内存', '24 GB'),
            row('启动磁盘', 'Macintosh HD'),
            row('序列号', 'C02ZT0WEBMAC'),
            row('macOS', `Tahoe ${OS.version}`)
          ),
          h('button.btn', { onclick: () => OS.launch('settings', { pane: 'about' }) }, '更多信息…'),
          h('div.about-foot', '™ 和 © 1983–2026 Apple Inc. 保留一切权利。界面复刻，仅用于学习演示。')
        )
      );
    },
  });

  OS.registerApp({
    id: 'info', name: '简介', icon: 'finder', hidden: true, resizable: false, width: 290, height: 470, chrome: 'standard', alwaysNew: true, noDock: true,
    create(win, { path, node }) {
      const n = node || OS.vfs.resolve(path);
      win.setTitle(`“${n.name || 'Macintosh HD'}”简介`);
      const size = path === '/' ? '494.38 GB 中的 213.6 GB 可用' : OS.fmt.size(OS.vfs.sizeOf(n));
      const sec = (title, ...rows) => h('details.info-sec', { open: true }, h('summary', title), h('div.info-rows', ...rows));
      const r = (k, v) => h('div.info-row', h('span', k), h('b', v));
      const comment = h('textarea.info-comment', { id: 'info-comment-' + win.id, placeholder: '添加注释' });
      comment.value = n.comment || '';
      comment.onchange = () => path !== '/' && OS.vfs.write(path, null, { comment: comment.value });
      win.body.append(
        h('div.info',
          h('div.info-head', h('img', { src: path === '/' ? OS.icon('hd') : OS.vfs.iconFor(n, path), alt: '' }), h('div', h('b', n.name || 'Macintosh HD'), h('small', size), h('small', '修改时间：' + OS.fmt.dateTime(new Date(n.mtime || Date.now()))))),
          sec('通用', r('种类：', path === '/' ? '宗卷' : OS.vfs.kindLabel(n)), r('大小：', size), r('位置：', path === '/' ? '/' : OS.vfs.parentOf(path).replace(OS.vfs.HOME, '~')), r('创建时间：', OS.fmt.dateTime(new Date(n.ctime || n.mtime || Date.now())))),
          sec('注释', comment),
          sec('共享与权限', r(OS.user.short + '（我）', '读与写'), r('staff', '只读'), r('everyone', '只读'))
        )
      );
    },
  });

  OS.registerApp({
    id: 'shortcutsHelp', name: '键盘快捷键', icon: 'shortcuts', hidden: true, singleton: true, chrome: 'standard', width: 460, height: 560, noDock: true,
    create(win) {
      win.body.append(h('div.kbd-help', h('p', '在浏览器里，部分 ⌘ 组合键会被浏览器占用，所以这里也提供了 Ctrl 与 ⌥ 的替代按法。'), h('div.kbd-list', OS.shortcuts.map(([k, v]) => h('div.kbd-row', h('kbd', k), h('span', v))))));
    },
  });
})();
