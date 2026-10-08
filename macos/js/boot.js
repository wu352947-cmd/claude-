/* Power: boot chime, Apple logo progress, lock screen, sleep, restart, shut down, log out. Starts the system. */
(function () {
  const { h, $, glyph } = OS;
  const wm = OS.wm;
  const power = (OS.power = {});
  const layer = () => $('#overlays');

  function clearScreenLayer() {
    document.querySelectorAll('.power-layer').forEach((x) => x.remove());
  }

  /* 1. black "power off" screen */
  power.off = () => {
    document.body.classList.remove('desktop-ready', 'locked');
    clearScreenLayer();
    const el = h('div.power-layer.power-off', { role: 'button', tabindex: 0, 'aria-label': '开机' },
      h('div.po-btn', { html: glyph('power') }),
      h('div.po-hint', '点按或按任意键开机')
    );
    const start = () => {
      el.removeEventListener('click', start);
      document.removeEventListener('keydown', start);
      power.boot();
    };
    el.addEventListener('click', start);
    document.addEventListener('keydown', start);
    $('#screen').appendChild(el);
    el.focus();
  };

  /* 2. chime + Apple logo + progress bar */
  power.boot = () => {
    clearScreenLayer();
    OS.sound.play('chime');
    const bar = h('div.boot-bar', h('i'));
    const el = h('div.power-layer.boot', h('div.boot-logo', { html: glyph('apple') }), bar);
    $('#screen').appendChild(el);
    const fill = bar.querySelector('i');
    const steps = [[300, 8], [700, 22], [1100, 40], [1500, 63], [1900, 81], [2300, 94], [2600, 100]];
    const quick = OS.reducedMotion();
    steps.forEach(([t, p]) => setTimeout(() => (fill.style.width = p + '%'), quick ? t / 4 : t));
    setTimeout(() => {
      el.classList.add('out');
      power.lock(true);
      setTimeout(() => el.remove(), 700);
    }, quick ? 800 : 3000);
  };

  /* 3. lock / login screen */
  power.lock = (fromBoot) => {
    OS.closeMenus();
    OS.spotlight.close();
    OS.cc.close();
    OS.nc.close();
    OS.closeLaunchpad && OS.closeLaunchpad();
    document.querySelectorAll('.lock').forEach((x) => x.remove());
    document.body.classList.add('locked');
    const time = h('div.lock-time');
    const date = h('div.lock-date');
    const tick = () => {
      const d = new Date();
      date.textContent = `${d.getMonth() + 1}月${d.getDate()}日${OS.fmt.week(d).replace('周', '星期')}`;
      time.textContent = `${d.getHours() % (OS.settings.clock24 ? 24 : 12) || (OS.settings.clock24 ? 0 : 12)}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    tick();
    const timer = setInterval(tick, 1000);
    const pw = h('input.lock-pw', { id: 'lock-password', type: 'password', placeholder: '输入密码', autocomplete: 'current-password', 'aria-label': '密码' });
    const go = h('button.lock-go', { 'aria-label': '登录', html: glyph('arrow-right') });
    const hint = h('div.lock-hint', '任意密码均可登录 · 也可直接按回车');
    const avatar = h('div.lock-avatar', { html: glyph('person') });
    const el = h('div.power-layer.lock' + (fromBoot ? '.from-boot' : ''), { role: 'dialog', 'aria-label': '登录' },
      h('div.lock-bg', { style: { backgroundImage: `url("${OS.currentWallpaperFile()}")` } }),
      h('div.lock-top', date, time),
      h('div.lock-user',
        avatar,
        h('div.lock-name', OS.user.name),
        h('div.lock-field', pw, go),
        hint
      ),
      h('div.lock-power',
        h('button', { onclick: () => power.sleep() }, h('span', { html: glyph('sleep') }), '睡眠'),
        h('button', { onclick: () => power.restart() }, h('span', { html: glyph('restart') }), '重新启动'),
        h('button', { onclick: () => power.shutdown() }, h('span', { html: glyph('power') }), '关机')
      )
    );
    const unlock = () => {
      el.classList.add('unlocking');
      clearInterval(timer);
      document.body.classList.remove('locked');
      setTimeout(() => el.remove(), 700);
      if (!OS.started) start();
      else document.body.classList.add('desktop-ready');
    };
    go.onclick = unlock;
    pw.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') unlock();
    });
    el.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('button,input')) pw.focus();
    });
    $('#screen').appendChild(el);
    setTimeout(() => pw.focus(), 400);
    document.body.classList.remove('desktop-ready');
  };

  /* sleep: black screen, any input wakes to lock screen */
  power.sleep = () => {
    OS.closeMenus();
    const el = h('div.power-layer.sleep');
    $('#screen').appendChild(el);
    document.body.classList.remove('desktop-ready');
    const wasLocked = document.body.classList.contains('locked');
    setTimeout(() => {
      const wake = () => {
        document.removeEventListener('keydown', wake);
        el.removeEventListener('click', wake);
        el.classList.add('out');
        setTimeout(() => el.remove(), 500);
        if (!wasLocked) power.lock();
      };
      document.addEventListener('keydown', wake);
      el.addEventListener('click', wake);
    }, 500);
  };

  function shutdownAnim(then) {
    OS.closeMenus();
    document.body.classList.remove('desktop-ready');
    // quit every app politely
    [...OS.running.keys()].forEach((id) => wm.quit(id));
    OS.music && OS.music.pause();
    const el = h('div.power-layer.shutdown', h('div.spinner'));
    $('#screen').appendChild(el);
    setTimeout(then, 1600);
  }
  power.shutdown = () => shutdownAnim(() => power.off());
  power.restart = () => shutdownAnim(() => (clearScreenLayer(), setTimeout(power.boot, 900)));
  power.logout = () => shutdownAnim(() => (clearScreenLayer(), power.lock()));

  /* confirm dialog with 60-second countdown, like macOS */
  power.confirm = async (kind) => {
    const map = {
      restart: ['确定要现在重新启动电脑吗？', '重新启动', power.restart],
      shutdown: ['确定要现在关闭电脑吗？', '关机', power.shutdown],
      logout: ['确定要退出所有应用程序并退出登录吗？', '退出登录', power.logout],
    };
    const [title, label, fn] = map[kind];
    let secs = 60;
    const msgId = 'pw-count-' + Date.now();
    const p = OS.alert({ title, message: `如果不执行任何操作，电脑将在 ${secs} 秒后自动${label}。`, icon: OS.icon('settings'), buttons: [{ label: '取消' }, { label, primary: true }] });
    const msg = document.querySelector('.alert:last-of-type .alert-msg');
    if (msg) msg.id = msgId;
    const t = setInterval(() => {
      secs--;
      const m = document.getElementById(msgId);
      if (m) m.textContent = `如果不执行任何操作，电脑将在 ${secs} 秒后自动${label}。`;
      if (secs <= 0) {
        clearInterval(t);
        const btn = document.querySelector('.alert .btn.primary');
        btn && btn.click();
      }
    }, 1000);
    const r = await p;
    clearInterval(t);
    if (r === 1) fn();
  };

  /* ---------- first start after login ---------- */
  function start() {
    OS.started = true;
    document.body.classList.add('desktop-ready', 'reveal');
    setTimeout(() => document.body.classList.remove('reveal'), 1400);
    const loginItems = OS.store.get('loginItems', []);
    loginItems.forEach((id, i) => setTimeout(() => OS.launch(id), 900 + i * 300));
    if (!OS.store.get('welcomed', false)) {
      OS.store.set('welcomed', true);
      setTimeout(() => OS.launch('finder', { path: '~/Desktop', instant: true }), 1200);
      setTimeout(() => OS.notify({ app: 'tips', title: '欢迎使用 macOS Tahoe', body: '按 Ctrl + 空格 打开聚焦搜索，或点按程序坞中的“启动台”浏览所有应用。', icon: OS.icon('settings') }), 2200);
    } else {
      setTimeout(() => OS.notify({ app: 'tips', title: `欢迎回来，${OS.user.name}`, body: '你上次打开的文件都还在桌面上。', icon: OS.icon('finder'), silent: true }), 1800);
    }
    OS.emit('started');
  }

  /* ---------- go ---------- */
  OS.registerApp({ id: 'tips', name: '提示', icon: 'settings', hidden: true, action: () => OS.launch('shortcutsHelp') });

  window.addEventListener('DOMContentLoaded', () => {
    OS.initShell();
    $('#screen').classList.remove('booting');
    // first visit in this browser session: full power-on; afterwards straight to the lock screen
    if (OS.session.get('booted')) power.lock(true);
    else {
      OS.session.set('booted', '1');
      power.off();
    }
  });
})();
