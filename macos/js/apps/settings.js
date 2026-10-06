/* System Settings */
(function () {
  const { h, $$, glyph } = OS;
  const S = () => OS.settings;

  const PANES = [
    { id: 'wifi', label: 'Wi-Fi', glyph: 'wifi', color: '#0a84ff', group: 1, keywords: '无线 网络 wifi' },
    { id: 'bluetooth', label: '蓝牙', glyph: 'bluetooth', color: '#0a84ff', group: 1, keywords: 'bluetooth airpods' },
    { id: 'network', label: '网络', glyph: 'globe', color: '#0a84ff', group: 1, keywords: 'network vpn' },
    { id: 'notifications', label: '通知', glyph: 'bell', color: '#ff3b30', group: 2 },
    { id: 'sound', label: '声音', glyph: 'speaker', color: '#ff2d55', group: 2, keywords: '音量 volume' },
    { id: 'focus', label: '专注模式', glyph: 'moon', color: '#5e5ce6', group: 2, keywords: '勿扰' },
    { id: 'screentime', label: '屏幕使用时间', glyph: 'hourglass', color: '#5e5ce6', group: 2 },
    { id: 'general', label: '通用', glyph: 'gear', color: '#8e8e93', group: 3, keywords: '关于 更新 储存 抹掉 重置' },
    { id: 'appearance', label: '外观', glyph: 'circle-half', color: '#1c1c1e', group: 3, keywords: '深色 浅色 dark mode 强调色 主题' },
    { id: 'accessibility', label: '辅助功能', glyph: 'accessibility', color: '#0a84ff', group: 3, keywords: '透明度 动画' },
    { id: 'controlcenter', label: '控制中心', glyph: 'control', color: '#8e8e93', group: 3, keywords: '菜单栏 电池 时钟' },
    { id: 'siri', label: 'Apple 智能与 Siri', glyph: 'sparkles', color: '#bf5af2', group: 3 },
    { id: 'privacy', label: '隐私与安全性', glyph: 'hand-raised', color: '#0a84ff', group: 3 },
    { id: 'desktop', label: '桌面与程序坞', glyph: 'dock-icon', color: '#1c1c1e', group: 4, keywords: 'dock 程序坞 触发角 调度中心' },
    { id: 'displays', label: '显示器', glyph: 'sun-fill', color: '#0a84ff', group: 4, keywords: '亮度 夜览 分辨率' },
    { id: 'wallpaper', label: '墙纸', glyph: 'photo', color: '#32ade6', group: 4, keywords: '壁纸 背景 wallpaper' },
    { id: 'screensaver', label: '屏幕保护程序', glyph: 'display', color: '#30b0c7', group: 4 },
    { id: 'battery', label: '电池', glyph: 'bolt', color: '#28cd41', group: 4 },
    { id: 'lock', label: '锁定屏幕', glyph: 'lock-fill', color: '#1c1c1e', group: 5 },
    { id: 'touchid', label: '触控 ID 与密码', glyph: 'touchid', color: '#ff3b30', group: 5 },
    { id: 'users', label: '用户与群组', glyph: 'person-2', color: '#0a84ff', group: 5, keywords: '账户 名称' },
    { id: 'keyboard', label: '键盘', glyph: 'keyboard', color: '#8e8e93', group: 6, keywords: '快捷键' },
    { id: 'trackpad', label: '触控板', glyph: 'trackpad', color: '#8e8e93', group: 6 },
  ];

  /* ---------- small builders ---------- */
  const group = (title, ...rows) => h('section.st-group', title ? h('h3.st-gtitle', title) : null, h('div.st-rows', ...rows.flat().filter(Boolean)));
  const row = (label, ctrl, sub, opts = {}) => h('div.st-row' + (opts.cls ? '.' + opts.cls : ''), h('div.st-rlabel', opts.icon ? h('span.st-ricon', { style: { background: opts.iconColor || '#8e8e93' }, html: glyph(opts.icon) }) : null, h('div', h('div', label), sub ? h('small', sub) : null)), ctrl ? h('div.st-rctl', ctrl) : null);
  const toggle = (key, onChange) => {
    const input = h('input', { type: 'checkbox', id: 'st-' + key, checked: !!S()[key] });
    input.onchange = () => {
      OS.setSetting(key, input.checked);
      onChange && onChange(input.checked);
    };
    return h('label.switch', input, h('span'));
  };
  const localToggle = (id, val, fn) => h('label.switch', h('input', { type: 'checkbox', id, checked: val, onchange: (e) => fn && fn(e.target.checked) }), h('span'));
  const select = (key, options, onChange) => {
    const s = h('select.st-select', { id: 'st-sel-' + key }, ...options.map(([v, l]) => h('option', { value: v, selected: String(S()[key]) === String(v) }, l)));
    s.onchange = () => {
      const v = options.find(([x]) => String(x) === s.value)[0];
      OS.setSetting(key, v);
      onChange && onChange(v);
    };
    return s;
  };
  const slider = (key, min, max, step = 1, onInput, opts = {}) => {
    const r = h('input.st-range', { id: 'st-range-' + key, type: 'range', min, max, step, value: S()[key] });
    const fill = () => r.style.setProperty('--v', ((r.value - min) / (max - min)) * 100 + '%');
    fill();
    r.oninput = () => {
      fill();
      OS.setSetting(key, +r.value);
      onInput && onInput(+r.value);
    };
    return h('div.st-slider', opts.left ? h('small', opts.left) : null, r, opts.right ? h('small', opts.right) : null);
  };
  const button = (label, fn, cls = '') => h('button.btn' + cls, { onclick: fn }, label);

  /* ---------- pane renderers ---------- */
  const R = {
    account() {
      return [
        h('div.st-hero', h('div.st-avatar.big', { html: glyph('person') }), h('h2', OS.user.name), h('p', 'Apple 账户'), h('small', 'guest@icloud.com')),
        group('', row('个人信息', h('span.st-chev', { html: glyph('chevron-right') })), row('登录与安全性', h('span.st-chev', { html: glyph('chevron-right') })), row('付款与配送', h('span.st-chev', { html: glyph('chevron-right') })), row('iCloud', h('small', '已使用 12.4 GB / 50 GB'), null, { icon: 'cloud', iconColor: '#0a84ff' }), row('家人共享', h('small', '设置'), null, { icon: 'person-2', iconColor: '#0a84ff' })),
      ];
    },
    wifi(rerender) {
      return [
        group('', row('Wi-Fi', toggle('wifi', rerender), null, { icon: 'wifi', iconColor: '#0a84ff' }), S().wifi ? row(OS.store.get('wifiName', 'Apple Park'), h('span.st-badge', '已连接'), '安全 · 5 GHz · 信号强') : null),
        S().wifi ? group('已知网络', ...['Apple Park', 'Tahoe-5G', 'Starbucks WiFi'].map((n) => row(n, button('连接', () => (OS.store.set('wifiName', n), rerender())), null, { icon: 'wifi', iconColor: '#8e8e93' }))) : null,
        group('', row('询问是否加入网络', select('askJoin', [['notify', '通知'], ['ask', '询问'], ['off', '关']])), row('询问是否加入热点', select('askHotspot', [['ask', '询问'], ['never', '永不'], ['auto', '自动']]))),
      ];
    },
    bluetooth(rerender) {
      const devices = OS.store.get('bt.devices', { 'AirPods Pro': true, 'Magic Keyboard': true, 'Magic Mouse': false, 'Magic Trackpad': false });
      return [
        group('', row('蓝牙', toggle('bluetooth', rerender), `此 Mac 在蓝牙设置打开时显示为“${OS.user.host}”。`, { icon: 'bluetooth', iconColor: '#0a84ff' })),
        S().bluetooth ? group('我的设备', ...Object.entries(devices).map(([n, on]) => row(n, button(on ? '断开连接' : '连接', () => ((devices[n] = !on), OS.store.set('bt.devices', devices), rerender())), on ? '已连接' : '未连接', { icon: n.includes('Pods') ? 'speaker' : n.includes('Key') ? 'keyboard' : 'trackpad', iconColor: '#8e8e93' }))) : null,
        S().bluetooth ? group('附近的设备', row('正在搜索…', h('span.spinner.small'))) : null,
      ];
    },
    network() {
      return [group('', row('Wi-Fi', h('span.st-badge' + (S().wifi ? '' : '.off'), S().wifi ? '已连接' : '关闭'), null, { icon: 'wifi', iconColor: '#0a84ff' }), row('以太网', h('span.st-badge.off', '未连接'), null, { icon: 'network', iconColor: '#8e8e93' }), row('雷雳网桥', h('span.st-badge.off', '未连接'), null, { icon: 'bolt-outline', iconColor: '#8e8e93' })), group('', row('防火墙', h('small', '已启用')), row('VPN', button('添加 VPN 配置…', () => OS.toast('演示环境不支持 VPN'))))];
    },
    notifications() {
      const prefs = OS.store.get('notif.prefs', {});
      const apps = ['messages', 'mail', 'calendar', 'reminders', 'clock', 'music', 'appstore', 'safari'];
      return [
        group('通知中心', row('显示预览', select('notifPreview', [['always', '始终'], ['unlocked', '解锁时'], ['never', '永不']])), row('允许在锁屏时显示通知', localToggle('st-lock-notif', true))),
        group('应用程序通知', ...apps.filter((id) => OS.apps[id]).map((id) => row(OS.apps[id].name, localToggle('st-n-' + id, prefs[id] !== false, (v) => ((prefs[id] = v), OS.store.set('notif.prefs', prefs))), '横幅、声音、标记', { icon: null }))).map((r, i) => (r.querySelector('.st-rlabel').prepend(h('img.st-appicon', { src: OS.icon(OS.apps[apps.filter((id) => OS.apps[id])[i]].icon), alt: '' })), r)),
        group('', row('发送测试通知', button('发送', () => OS.notify({ app: 'settings', title: '测试通知', body: '通知看起来是这样的。' })))),
      ];
    },
    sound() {
      return [
        group('提示音', row('提示音', select('alertSound', [['notify', '玻璃'], ['message', '三全音'], ['pop', '气泡'], ['error', '低音']], (v) => OS.sound.play(v))), row('播放提示音时使用', h('small', 'MacBook Pro 扬声器')), row('提示音音量', slider('alertVol', 0, 100)), row('启动时播放声音', toggle('sounds')), row('播放用户界面音效', toggle('uiSounds')), row('更改音量时播放反馈', localToggle('st-vol-fb', true))),
        group('输出与输入', row('输出音量', slider('volume', 0, 100, 1, null, { left: h('span', { html: glyph('speaker-slash') }), right: h('span', { html: glyph('speaker') }) })), row('MacBook Pro 扬声器', h('span.st-badge', '已选择'), '内建'), row('AirPods Pro', h('small', S().bluetooth ? '已连接' : '不可用'), '蓝牙')),
        group('', row('播放启动和弦', button('试听', () => OS.sound.play('chime')))),
      ];
    },
    focus(rerender) {
      return [
        group('', row('勿扰模式', toggle('focus', rerender), S().focus ? '已打开 · 通知会被静音' : '关闭', { icon: 'moon', iconColor: '#5e5ce6' }), row('睡眠', localToggle('st-sleep-focus', false), '23:00 – 07:00', { icon: 'sleep', iconColor: '#30b0c7' }), row('工作', localToggle('st-work-focus', false), '工作日 9:00 – 18:00', { icon: 'person', iconColor: '#007aff' })),
        group('', row('跨设备共享', localToggle('st-share-focus', true)), row('专注模式状态', h('small', '打开'))),
      ];
    },
    screentime() {
      const mins = 60 + Math.floor(performance.now() / 60000);
      const bars = Array.from({ length: 7 }, (_, i) => 30 + ((i * 37) % 80));
      return [
        h('div.st-chart', h('div.st-chart-h', h('b', `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`), h('small', '今日')), h('div.st-bars', ...bars.map((v, i) => h('div.st-bar', { style: { height: v + '%' } }, h('small', '日一二三四五六'[i]))))),
        group('', row('应用与网站活动', localToggle('st-st-act', true)), row('停用时间', h('small', '关闭')), row('应用限额', h('small', '关闭')), row('内容与隐私', h('small', '关闭'))),
      ];
    },
    general() {
      const items = [['about', '关于本机', 'info', '#8e8e93'], ['update', '软件更新', 'gear', '#8e8e93'], ['storage', '储存空间', 'hdd', '#8e8e93'], ['login', '登录项与扩展', 'list', '#8e8e93'], ['language', '语言与地区', 'globe', '#0a84ff'], ['datetime', '日期与时间', 'calendar', '#0a84ff'], ['sharing', '共享', 'share', '#8e8e93'], ['transfer', '传输或还原', 'restart', '#8e8e93']];
      return [
        h('div.st-hero', h('div.st-hero-ico', { html: glyph('gear') }), h('h2', '通用'), h('p', '管理 Mac 的整体设置和偏好设置，如软件更新、设备语言、隔空播放等。')),
        group('', ...items.map(([id, l, g, c]) => {
          const r = row(l, h('span.st-chev', { html: glyph('chevron-right') }), null, { icon: g, iconColor: c, cls: 'link' });
          r.onclick = () => go(id);
          return r;
        })),
      ];
    },
    about() {
      const img = h('img.st-mbp', { src: 'https://www.apple.com/v/macbook-pro/ax/images/overview/contrast/macbook_pro_14_16__ns1ipedt40qm_large_2x.png', alt: 'MacBook Pro' });
      img.onerror = () => (img.onerror = null, (img.src = 'assets/mbp-official.png'));
      return [
        h('div.st-about', img, h('h2', 'MacBook Pro'), h('small', '14 英寸，2025')),
        group('', row('名称', h('small', OS.user.host)), row('芯片', h('small', 'Apple M5')), row('内存', h('small', '24 GB')), row('序列号', h('small', 'C02ZT0WEBMAC')), row('保修', h('small', '有效期至 2027 年 10 月 6 日'))),
        group('macOS', row(h('span', h('b', 'macOS Tahoe')), h('small', `版本 ${OS.version}`), null, { icon: 'apple', iconColor: '#1c1c1e' })),
        group('显示器', row('内建 Liquid 视网膜 XDR 显示屏', h('small', `14.2 英寸（${window.screen.width * (window.devicePixelRatio || 1)} × ${window.screen.height * (window.devicePixelRatio || 1)}）`))),
        group('', row('系统报告…', button('打开', () => OS.launch('activity'))), row('监管认证', h('small', '™ 和 © 1983–2026 Apple Inc.'))),
      ];
    },
    update(rerender, state) {
      const status = h('div.st-update', h('span.spinner.small'), h('span', '正在检查更新…'));
      setTimeout(() => {
        status.innerHTML = '';
        status.append(h('span.st-ok', { html: glyph('checkmark-circle-fill') }), h('div', h('b', '你的 Mac 已是最新版本'), h('small', `macOS Tahoe ${OS.version} · 上次检查：刚刚`)));
      }, 1600);
      return [group('', status), group('', row('自动更新', h('small', '仅安全响应和系统文件'))), group('', row('Beta 版更新', h('small', '关闭')))];
    },
    storage() {
      const user = OS.vfs.sizeOf(OS.vfs.resolve(OS.vfs.HOME));
      const cats = [['应用程序', 38e9, '#ff3b30'], ['文稿', 12e9 + user, '#ff9500'], ['照片', 41e9, '#ffcc00'], ['iCloud 云盘', 8e9, '#0a84ff'], ['macOS', 22e9, '#8e8e93'], ['系统数据', 159e9, '#c7c7cc']];
      const total = 494e9;
      const used = cats.reduce((a, c) => a + c[1], 0);
      return [
        group('', h('div.st-storage', h('div.st-st-top', h('b', 'Macintosh HD'), h('small', `已使用 ${OS.fmt.size(used)}，共 ${OS.fmt.size(total)}`)), h('div.st-st-bar', ...cats.map(([n, v, c]) => h('i', { title: n, style: { width: (v / total) * 100 + '%', background: c } }))), h('div.st-st-legend', ...cats.map(([n, v, c]) => h('span', h('i', { style: { background: c } }), n))))),
        group('建议', row('在 iCloud 中储存', button('储存在 iCloud…', () => OS.toast('已开启 iCloud 优化储存'))), row('自动清倒废纸篓', localToggle('st-auto-trash', false), '自动抹掉在废纸篓中存放超过 30 天的项目。'), row('废纸篓', button('立即清倒', () => OS.emptyTrash()), `${OS.vfs.trashCount()} 个项目`)),
      ];
    },
    login() {
      const items = OS.store.get('loginItems', []);
      return [group('登录时打开', ...(items.length ? items.map((id) => row(OS.apps[id].name, button('移除', () => (OS.store.set('loginItems', items.filter((x) => x !== id)), go('login'))))) : [row('没有项目', null, '在程序坞中右键点按应用，选择“选项 > 登录时打开”。')]))];
    },
    language() {
      return [group('', row('首选语言', h('small', '简体中文')), row('地区', h('small', '中国大陆')), row('日历', h('small', '公历')), row('温度', h('small', '摄氏度 (°C)')), row('度量衡', h('small', '公制')), row('一周的第一天', h('small', '星期日')))];
    },
    datetime() {
      return [group('', row('自动设定时间和日期', localToggle('st-auto-time', true), 'time.apple.com'), row('日期和时间', h('small', OS.fmt.dateTime(new Date()))), row('24 小时制时间', toggle('clock24')), row('在菜单栏中显示秒', toggle('clockSeconds')), row('时区', h('small', Intl.DateTimeFormat().resolvedOptions().timeZone)))];
    },
    sharing() {
      return [group('', row('文件共享', localToggle('st-share-files', false)), row('媒体共享', localToggle('st-share-media', false)), row('屏幕共享', localToggle('st-share-screen', false)), row('远程登录', localToggle('st-share-ssh', false))), group('', row('本地主机名', h('small', OS.user.host + '.local')))];
    },
    transfer() {
      return [
        group('', row('迁移助理', button('打开…', () => OS.toast('请在另一台 Mac 上打开迁移助理'))), row('抹掉所有内容和设置', button('抹掉…', async () => {
          const r = await OS.alert({ title: '抹掉所有内容和设置？', message: '这会删除你在这台虚拟 Mac 上的所有文件、备忘录、日程和设置，并重新启动。', icon: OS.icon('settings'), buttons: [{ label: '取消' }, { label: '抹掉', primary: true }], destructive: true });
          if (r !== 1) return;
          try {
            Object.keys(localStorage).filter((k) => k.startsWith('macos.')).forEach((k) => localStorage.removeItem(k));
            sessionStorage.removeItem('macos.booted');
          } catch (e) {}
          location.reload();
        }, '.destructive'), '将这台 Mac 还原为出厂设置。')),
      ];
    },
    appearance(rerender) {
      const mode = (id, label, cls) => {
        const b = h('button.st-mode' + (S().appearance === id ? '.on' : ''), h('div.st-mode-img.' + cls, h('i'), h('i')), h('span', label));
        b.onclick = () => (OS.setSetting('appearance', id), rerender());
        return b;
      };
      const accents = h('div.st-accents', ...Object.entries(OS.accents).map(([k, a]) => {
        const b = h('button.st-accent' + (S().accent === k ? '.on' : '') + (k === 'multicolor' ? '.multi' : ''), { title: a.label, 'aria-label': a.label, style: { background: k === 'multicolor' ? '' : a.light } });
        b.onclick = () => (OS.setSetting('accent', k), rerender());
        return b;
      }));
      const iconStyle = h('div.st-iconstyles', ...[['default', '默认'], ['dark', '深色'], ['clear', '透明'], ['tinted', '着色']].map(([k, l]) => {
        const b = h('button.st-istyle' + (S().iconStyle === k ? '.on' : ''), h('div.st-istyle-img.' + k, h('img', { src: OS.icon('safari'), alt: '' })), h('span', l));
        b.onclick = () => (OS.setSetting('iconStyle', k), rerender());
        return b;
      }));
      return [
        group('', row('外观', h('div.st-modes', mode('light', '浅色', 'light'), mode('dark', '深色', 'dark'), mode('auto', '自动', 'auto')), null, { cls: 'tall' })),
        group('', row('主题颜色', accents, OS.accents[S().accent].label, { cls: 'tall' }), row('突出显示颜色', select('highlight', [['accent', '强调色'], ['blue', '蓝色'], ['purple', '紫色'], ['pink', '粉色'], ['graphite', '石墨色']])), row('边栏图标大小', select('sidebarIcon', [['s', '小'], ['m', '中'], ['l', '大']])), row('允许在窗口中进行墙纸着色', toggle('tinting'))),
        group('图标与小组件样式', row('样式', iconStyle, null, { cls: 'tall' })),
        group('', row('显示滚动条', select('scrollbars', [['auto', '根据鼠标或触控板自动显示'], ['scroll', '滚动时'], ['always', '始终']]))),
      ];
    },
    accessibility(rerender) {
      return [
        group('视觉', row('降低透明度', toggle('reduceTransparency'), '让菜单栏、程序坞、窗口等使用不透明背景。'), row('增强对比度', localToggle('st-contrast', document.documentElement.classList.contains('high-contrast'), (v) => document.documentElement.classList.toggle('high-contrast', v))), row('减弱动态效果', localToggle('st-motion', !!OS.store.get('reduceMotion', false), (v) => (OS.store.set('reduceMotion', v), document.documentElement.classList.toggle('reduce-motion', v))))),
        group('', row('旁白', localToggle('st-vo', false), '旁白会朗读屏幕上的项目。'), row('缩放', localToggle('st-zoom', false)), row('朗读内容', button('朗读测试', () => { try { const u = new SpeechSynthesisUtterance('你好，我是这台 Mac 的朗读功能。'); u.lang = 'zh-CN'; speechSynthesis.speak(u); } catch (e) {} }))),
      ];
    },
    controlcenter() {
      return [
        group('控制中心模块', row('Wi-Fi', h('small', '在菜单栏中显示'), null, { icon: 'wifi', iconColor: '#0a84ff' }), row('蓝牙', h('small', '不在菜单栏中显示'), null, { icon: 'bluetooth', iconColor: '#0a84ff' }), row('专注模式', h('small', '激活时显示'), null, { icon: 'moon', iconColor: '#5e5ce6' }), row('正在播放', h('small', '激活时显示'), null, { icon: 'play', iconColor: '#ff2d55' })),
        group('其他模块', row('电池', toggle('showBattery'), null, { icon: 'bolt', iconColor: '#28cd41' }), row('显示百分比', localToggle('st-batt-pct', true))),
        group('仅限菜单栏', row('时钟', h('div.st-inline', h('small', '24 小时制'), toggle('clock24'))), row('显示秒', toggle('clockSeconds')), row('显示菜单栏背景', toggle('menubarBg'))),
      ];
    },
    siri() {
      return [h('div.st-hero', h('div.siri-orb.st-siri-orb'), h('h2', 'Apple 智能与 Siri'), h('p', '用自然语言和 Siri 对话，或输入问题。')), group('', row('Siri', localToggle('st-siri', true)), row('键盘快捷键', h('small', '⌥ + S')), row('语言', h('small', '中文（普通话 - 中国大陆）')), row('试一试', button('询问 Siri', () => OS.siri.open()))), group('', row('写作工具', localToggle('st-writing', true)), row('图乐园', localToggle('st-playground', true)))];
    },
    privacy() {
      return [group('隐私', ...[['定位服务', 'location', '#0a84ff'], ['通讯录', 'person-circle', '#8e8e93'], ['日历', 'calendar', '#ff3b30'], ['提醒事项', 'list', '#0a84ff'], ['照片', 'photo', '#ff9500'], ['摄像头', 'video', '#8e8e93'], ['麦克风', 'mic', '#ff9500'], ['屏幕与系统录音', 'display', '#5e5ce6']].map(([l, g, c]) => row(l, h('span.st-chev', { html: glyph('chevron-right') }), null, { icon: g, iconColor: c }))), group('安全性', row('允许从以下位置下载的应用程序', select('gatekeeper', [['store', 'App Store'], ['identified', 'App Store 与已知开发者']])), row('文件保险箱', h('small', '已为“Macintosh HD”打开')), row('锁定模式', button('打开…', () => OS.toast('锁定模式会限制部分功能'))))];
    },
    desktop(rerender) {
      const corner = (k, label) => {
        const s = h('select.st-select', { id: 'st-hc-' + k }, ...[['none', '—'], ['mission', '调度中心'], ['notifications', '通知中心'], ['launchpad', '启动台'], ['desktop', '桌面'], ['screensaver', '启动屏幕保护程序'], ['lock', '锁定屏幕']].map(([v, l]) => h('option', { value: v, selected: S().hotCorners[k] === v }, l)));
        s.onchange = () => OS.setSetting('hotCorners', Object.assign({}, S().hotCorners, { [k]: s.value }));
        return h('label.st-corner.' + k, h('small', label), s);
      };
      return [
        group('程序坞', row('大小', slider('dockSize', 32, 80, 1, null, { left: '小', right: '大' })), row('放大', h('div.st-inline', toggle('dockMagnify', rerender), S().dockMagnify ? slider('dockMagSize', 56, 128, 1, null, { left: '小', right: '大' }) : null)), row('置于屏幕上的位置', h('div.st-seg', ...[['left', '左边'], ['bottom', '底部'], ['right', '右边']].map(([v, l]) => h('button' + (S().dockPosition === v ? '.on' : ''), { onclick: () => (OS.setSetting('dockPosition', v), rerender()) }, l)))), row('最小化窗口时使用', select('minimizeEffect', [['genie', '神奇效果'], ['scale', '缩放效果']])), row('连按窗口标题栏以', select('doubleClickTitle', [['zoom', '缩放'], ['minimize', '最小化'], ['none', '不执行任何操作']])), row('自动隐藏和显示程序坞', toggle('dockAutohide')), row('在程序坞中显示建议 App 和最近使用的 App', toggle('dockShowRecents'))),
        group('桌面与台前调度', row('显示项目', toggle('desktopIcons'), '在桌面上显示文件与文件夹'), row('台前调度', toggle('stageManager'))),
        group('窗口', row('将窗口拖到屏幕边缘以平铺', localToggle('st-tile-edge', true)), row('平铺的窗口之间留有边距', localToggle('st-tile-margin', true))),
        group('调度中心', row('根据最近的使用情况自动重新排列空间', localToggle('st-mc-rearrange', false)), row('切换到某个应用时，切换到包含该应用已打开窗口的空间', localToggle('st-mc-switch', true)), row('触发角', h('div.st-corners', corner('tl', '左上'), corner('tr', '右上'), corner('bl', '左下'), corner('br', '右下')), null, { cls: 'tall' })),
      ];
    },
    displays(rerender) {
      const res = (id, label, scale) => {
        const b = h('button.st-res' + ((S().resolution || 'default') === id ? '.on' : ''), h('div.st-res-img', { style: { '--k': scale } }, h('i')), h('span', label));
        b.onclick = () => (OS.setSetting('resolution', id), rerender());
        return b;
      };
      return [
        h('div.st-display', h('div.st-display-mon', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }), h('b', '内建显示器'), h('small', '14.2 英寸 Liquid 视网膜 XDR 显示屏')),
        group('', row('分辨率', h('div.st-resolutions', res('larger', '更大字体', 1.15), res('default', '默认', 1), res('more', '更多空间', 0.85)), null, { cls: 'tall' })),
        group('', row('亮度', slider('brightness', 8, 100, 1)), row('自动调节亮度', localToggle('st-autobright', true)), row('原彩显示', toggle('trueTone'), '自动调整显示器以使颜色在不同的环境光照条件下保持一致。'), row('夜览', toggle('nightShift'), '日落后让显示器颜色偏暖。')),
        group('', row('预设', select('preset', [['xdr', 'Apple XDR 显示屏 (P3-1600 尼特)'], ['p3', 'Apple 显示屏 (P3-500 尼特)'], ['web', 'Internet 与 Web (sRGB)']])), row('刷新率', select('refresh', [['promotion', 'ProMotion'], ['60', '60 赫兹'], ['120', '120 赫兹']]))),
      ];
    },
    wallpaper(rerender) {
      const cur = OS.wallpapers.find((w) => w.id === S().wallpaper);
      const tile = (w) => {
        const b = h('button.st-wp' + (S().wallpaper === w.id ? '.on' : ''), { title: w.name }, h('img', { src: OS.wallpaperThumb(w.light), alt: w.name, loading: 'lazy' }), w.dynamic ? h('span.st-wp-dyn', { html: glyph('circle-half') }) : null);
        b.onclick = () => (OS.setSetting('wallpaper', w.id), rerender());
        return b;
      };
      const upload = h('button.st-wp.add', { title: '添加照片', 'aria-label': '添加照片', html: glyph('plus') });
      upload.onclick = () => {
        const inp = h('input', { type: 'file', accept: 'image/*' });
        inp.onchange = () => {
          const f = inp.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              const s = Math.min(1, 2560 / img.width);
              c.width = img.width * s;
              c.height = img.height * s;
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              OS.store.set('customWallpaper', c.toDataURL('image/jpeg', 0.82));
              OS.setSetting('wallpaper', 'custom');
              rerender();
            };
            img.src = r.result;
          };
          r.readAsDataURL(f);
        };
        inp.click();
      };
      return [
        h('div.st-wp-current', h('div.st-wp-preview', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }), h('div', h('b', cur ? cur.name : '自定照片'), h('small', cur && cur.dynamic ? '动态：随外观在浅色与深色之间切换' : '静态'), cur && cur.dynamic ? h('div.st-inline', h('small', '随外观自动切换'), toggle('dynamicWallpaper')) : null)),
        group('macOS 墙纸', h('div.st-wps', ...OS.wallpapers.map(tile), upload)),
        group('', row('在所有空间中显示', localToggle('st-wp-all', true)), row('点按墙纸以显示桌面', select('clickWallpaper', [['always', '始终'], ['stage', '仅在台前调度中']]))),
      ];
    },
    screensaver() {
      return [
        h('div.st-ss-preview', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }, h('div.st-ss-clock', OS.fmt.time(new Date()))),
        group('', row('屏幕保护程序', select('screensaverKind', [['drift', '漂移'], ['aerial', '航拍 · 太浩湖']])), row('立即预览', button('预览', () => OS.screensaver.start()))),
        group('', row('不活跃多久后开启屏幕保护程序', select('screensaverAfter', [[0, '永不'], [1, '1 分钟'], [5, '5 分钟'], [10, '10 分钟']]))),
      ];
    },
    battery() {
      const pct = Math.round(OS.battery.level * 100);
      const bars = Array.from({ length: 24 }, (_, i) => Math.max(10, Math.min(100, pct + (24 - i) * 1.6 - (i % 5) * 3)));
      return [
        group('', row('低电量模式', select('lowPower', [['never', '永不'], ['battery', '仅使用电池时'], ['adapter', '仅使用电源适配器时'], ['always', '始终']])), row('电池健康', h('small', '正常'), '最大容量 98%')),
        h('div.st-chart', h('div.st-chart-h', h('b', `电池电量 ${pct}%`), h('small', OS.battery.real ? '来自浏览器的电池信息' : '过去 24 小时')), h('div.st-bars.green', ...bars.map((v, i) => h('div.st-bar', { style: { height: v + '%' } }, i % 6 === 0 ? h('small', (i + 1) + '时') : null)))),
        group('', row('选项…', button('打开', () => OS.toast('优化电池充电已开启')))),
      ];
    },
    lock() {
      return [group('', row('不活跃时启动屏幕保护程序', select('screensaverAfter', [[0, '永不'], [1, '1 分钟'], [5, '5 分钟'], [10, '10 分钟']])), row('在使用电池供电且不活跃时关闭显示器', h('small', '2 分钟')), row('启动屏幕保护程序或关闭显示器后需要密码', h('small', '立即'))), group('', row('在锁定屏幕时显示用户名和照片', localToggle('st-ls-name', true)), row('立即锁定屏幕', button('锁定', () => OS.power.lock()))), group('', row('显示睡眠、重新启动和关机按钮', localToggle('st-ls-power', true)))];
    },
    touchid() {
      return [h('div.st-hero', h('div.st-hero-ico.red', { html: glyph('touchid') }), h('h2', '触控 ID 与密码')), group('', row('右手食指', button('移除', () => OS.toast('已移除指纹'))), row('添加指纹', button('添加…', () => OS.toast('请将手指放在触控 ID 上')))), group('', row('使用触控 ID 解锁 Mac', localToggle('st-tid-unlock', true)), row('使用触控 ID 进行 Apple Pay', localToggle('st-tid-pay', true))), group('', row('登录密码', button('更改…', () => OS.toast('演示环境中任意密码均可登录'))))];
    },
    users(rerender) {
      const name = h('input.st-text', { id: 'st-username', value: OS.user.name });
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.onchange = () => {
        const v = name.value.trim() || '访客';
        OS.user.name = v;
        OS.setSetting('userName', v);
        OS.refreshMenubar();
        rerender();
      };
      return [
        h('div.st-hero', h('div.st-avatar.big', { html: glyph('person') }), h('h2', OS.user.name), h('p', '管理员')),
        group('', row('全名', name), row('账户名称', h('small', OS.user.short)), row('主目录', h('small', OS.vfs.HOME))),
        group('', row('自动以此身份登录', localToggle('st-autologin', false)), row('客人用户', localToggle('st-guest', false))),
      ];
    },
    keyboard() {
      return [group('', row('按键重复速率', slider('keyRepeat', 1, 10)), row('重复前延迟', slider('keyDelay', 1, 10)), row('按下 🌐 键时'.replace('🌐', '地球仪'), select('globeKey', [['input', '更改输入法'], ['emoji', '显示表情与符号'], ['dictation', '开始听写']]))), group('', row('键盘快捷键…', button('查看', () => OS.showShortcuts()))), group('输入法', row('简体拼音', h('small', '已启用')), row('ABC', h('small', '已启用')))];
    },
    trackpad() {
      return [group('光标与点按', row('跟踪速度', slider('trackSpeed', 1, 10)), row('点按', select('click', [['light', '轻'], ['medium', '中'], ['firm', '重']])), row('轻点来点按', localToggle('st-tap', true)), row('辅助点按', h('small', '双指点按或轻点'))), group('滚动缩放', row('自然滚动', localToggle('st-natural', true)), row('放大或缩小', h('small', '双指张开'))), group('更多手势', row('在全屏幕应用之间轻扫', h('small', '三指左右轻扫')), row('调度中心', h('small', '三指向上轻扫')), row('启动台', h('small', '拇指和三指合拢')))];
    },
  };
  const SUB = { about: 'general', update: 'general', storage: 'general', login: 'general', language: 'general', datetime: 'general', sharing: 'general', transfer: 'general' };
  const SUBLABEL = { about: '关于本机', update: '软件更新', storage: '储存空间', login: '登录项与扩展', language: '语言与地区', datetime: '日期与时间', sharing: '共享', transfer: '传输或还原', account: OS.user.name };

  let go = () => {};

  OS.registerApp({
    id: 'settings', name: '系统设置', icon: 'settings', keywords: ['settings', 'preferences', 'system', '设置', '偏好设置'], width: 780, height: 600, minWidth: 640, minHeight: 420, singleton: true,
    description: '调整 Mac 的外观、程序坞、显示器、声音等设置。',
    panes: () => PANES,
    reopen(win, args) {
      if (args.pane) win.state_.go(args.pane);
    },
    create(win, args) {
      const st = (win.state_ = { pane: args.pane || 'appearance', hist: [] });
      const nav = h('div.st-nav');
      const search = h('input.st-search', { id: 'settings-search', type: 'search', placeholder: '搜索' });
      const side = h('nav.side.st-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), h('label.side-search', h('span', { html: glyph('search') }), search), nav);
      const title = h('div.tb-title');
      const backBtn = h('button.tb-btn', { 'aria-label': '返回', html: glyph('chevron-left'), onclick: () => st.back() });
      const fwdBtn = h('button.tb-btn', { 'aria-label': '前进', html: glyph('chevron-right'), disabled: true });
      const content = h('div.st-content');
      const root = h('div.app.settings', h('div.split', side, h('div.pane', h('div.tbar', { 'data-drag': '' }, h('div.tb-group', backBtn, fwdBtn), title), content)));
      win.body.appendChild(root);

      function renderNav() {
        nav.innerHTML = '';
        const q = search.value.trim().toLowerCase();
        const acct = h('div.st-acct' + (st.pane === 'account' ? '.active' : ''), h('div.st-avatar', { html: glyph('person') }), h('div', h('b', OS.user.name), h('small', 'Apple 账户')));
        acct.onclick = () => st.go('account');
        if (!q) nav.appendChild(acct);
        let g = 0;
        PANES.filter((p) => !q || (p.label + (p.keywords || '')).toLowerCase().includes(q)).forEach((p) => {
          if (p.group !== g && !q) {
            g = p.group;
            nav.appendChild(h('div.st-gap'));
          }
          const active = st.pane === p.id || SUB[st.pane] === p.id;
          const r = h('div.sb-item.st-item' + (active ? '.active' : ''), h('span.st-icon', { style: { background: p.color }, html: glyph(p.glyph) }), h('span.sb-label', p.label));
          r.onclick = () => st.go(p.id, true);
          nav.appendChild(r);
        });
      }
      function render() {
        renderNav();
        const p = PANES.find((x) => x.id === st.pane);
        title.textContent = p ? p.label : SUBLABEL[st.pane] || '';
        win.setTitle(title.textContent);
        backBtn.disabled = !st.hist.length;
        content.innerHTML = '';
        const nodes = (R[st.pane] || R.general)(render);
        content.append(...[].concat(nodes).filter(Boolean));
        content.scrollTop = 0;
      }
      st.go = (id, fresh) => {
        if (id === st.pane) return;
        st.hist.push(st.pane);
        if (fresh && !SUB[id]) st.hist = [st.pane];
        st.pane = id;
        render();
      };
      st.back = () => {
        if (!st.hist.length) return;
        st.pane = st.hist.pop();
        render();
      };
      go = (id) => st.go(id);
      search.addEventListener('input', renderNav);
      search.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const first = nav.querySelector('.st-item');
          first && first.click();
        }
      });
      const off = OS.on('setting', ({ key }) => {
        // keep panes in sync when settings change elsewhere (Control Center, menu bar…)
        if (['wifi', 'bluetooth', 'focus', 'appearance', 'wallpaper', 'brightness', 'nightShift', 'volume'].includes(key) && !content.contains(document.activeElement)) render();
      });
      win.on('close', off);
      render();
    },
  });

  /* ---------- screen saver ---------- */
  let ssIdle;
  OS.screensaver = {
    start() {
      if (document.querySelector('.screensaver')) return;
      const files = OS.wallpapers.map((w) => OS.wallpaperSrc(w.light));
      let i = 0;
      const img = h('div.ss-img', { style: { backgroundImage: `url("${files[0]}")` } });
      const clock = h('div.ss-clock');
      const el = h('div.screensaver', img, clock);
      const tick = () => (clock.innerHTML = `<b>${OS.fmt.time(new Date())}</b><span>${OS.fmt.date(new Date())} ${OS.fmt.week(new Date()).replace('周', '星期')}</span>`);
      tick();
      const t1 = setInterval(tick, 1000);
      const t2 = setInterval(() => {
        i = (i + 1) % files.length;
        img.classList.remove('pan');
        void img.offsetWidth;
        img.style.backgroundImage = `url("${files[i]}")`;
        img.classList.add('pan');
      }, 9000);
      img.classList.add('pan');
      document.getElementById('screen').appendChild(el);
      const stop = () => {
        clearInterval(t1);
        clearInterval(t2);
        el.classList.add('out');
        setTimeout(() => el.remove(), 500);
        ['pointermove', 'keydown', 'pointerdown'].forEach((ev) => document.removeEventListener(ev, stop, true));
      };
      setTimeout(() => ['pointermove', 'keydown', 'pointerdown'].forEach((ev) => document.addEventListener(ev, stop, true)), 800);
    },
  };
  // idle timer for the screen saver
  const resetIdle = () => {
    clearTimeout(ssIdle);
    const m = +OS.settings.screensaverAfter || 0;
    if (m && document.body.classList.contains('desktop-ready')) ssIdle = setTimeout(() => OS.screensaver.start(), m * 60000);
  };
  ['pointermove', 'keydown', 'pointerdown'].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));
})();
