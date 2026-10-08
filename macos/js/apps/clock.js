/* Clock — world clock, alarms, stopwatch, timer */
(function () {
  const { h, $$, glyph } = OS;
  const ZONES = [
    { name: '本地', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { name: '库比蒂诺', tz: 'America/Los_Angeles' },
    { name: '纽约', tz: 'America/New_York' },
    { name: '伦敦', tz: 'Europe/London' },
    { name: '巴黎', tz: 'Europe/Paris' },
    { name: '东京', tz: 'Asia/Tokyo' },
    { name: '悉尼', tz: 'Australia/Sydney' },
  ];
  const timer = { end: null, total: 0, paused: null };
  const stopwatch = { start: null, acc: 0, laps: [] };
  let alarms = OS.store.get('clock.alarms', [{ id: 'a1', time: '07:30', label: '起床', on: true }, { id: 'a2', time: '13:30', label: '午休结束', on: false }]);
  const fired = new Set();
  setInterval(() => {
    const n = new Date();
    const hm = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    alarms.forEach((a) => {
      const key = a.id + hm + n.toDateString();
      if (a.on && a.time === hm && !fired.has(key)) {
        fired.add(key);
        OS.sound.play('alarm');
        OS.notify({ app: 'clock', title: '闹钟', body: `${a.label || '闹钟'} · ${a.time}`, sticky: true, buttons: [{ label: '稍后提醒' }, { label: '停止' }] });
      }
    });
    if (timer.end && Date.now() >= timer.end) {
      timer.end = null;
      OS.sound.play('alarm');
      OS.notify({ app: 'clock', title: '计时器', body: '时间到', sticky: true });
      OS.emit('clock:timer');
    }
  }, 1000);

  function face(tz, size) {
    const c = h('canvas', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
    c._tz = tz;
    return c;
  }
  // Intl formatting is slow: cache each zone's UTC offset for a minute instead of formatting every frame
  const tzOff = new Map();
  const zoneNow = (tz) => {
    const t = Date.now();
    let o = tzOff.get(tz);
    if (!o || t - o.at > 60000) {
      const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: tz }));
      o = { at: t, off: d.getTime() - (t - (t % 1000)) };
      tzOff.set(tz, o);
    }
    return new Date(t + o.off);
  };
  const dials = new Map();
  function draw(c) {
    const now = zoneNow(c._tz);
    const S = c.width, r = S / 2;
    const night = now.getHours() < 6 || now.getHours() >= 18;
    const key = S + (night ? 'n' : 'd');
    const out = c.getContext('2d');
    out.clearRect(0, 0, S, S);
    if (dials.has(key)) return drawHands(out, now, S, r, night, dials.get(key));
    const dial = document.createElement('canvas');
    dial.width = dial.height = S;
    const x = dial.getContext('2d');
    x.fillStyle = night ? '#1c1c1e' : '#fff';
    x.beginPath();
    x.arc(r, r, r - 3, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      x.strokeStyle = night ? (big ? '#fff' : '#555') : big ? '#111' : '#bbb';
      x.lineWidth = big ? S * 0.012 : S * 0.005;
      x.beginPath();
      x.moveTo(r + Math.cos(a) * r * 0.86, r + Math.sin(a) * r * 0.86);
      x.lineTo(r + Math.cos(a) * r * (big ? 0.76 : 0.81), r + Math.sin(a) * r * (big ? 0.76 : 0.81));
      x.stroke();
    }
    x.fillStyle = night ? '#fff' : '#111';
    x.font = `500 ${S * 0.1}px Inter, -apple-system, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      x.fillText(i, r + Math.cos(a) * r * 0.62, r + Math.sin(a) * r * 0.62);
    }
    dials.set(key, dial);
    drawHands(out, now, S, r, night, dial);
  }
  function drawHands(x, now, S, r, night, dial) {
    x.drawImage(dial, 0, 0);
    const hand = (ang, len, w, col) => {
      x.strokeStyle = col;
      x.lineWidth = w;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(r - Math.cos(ang - Math.PI / 2) * len * 0.12, r - Math.sin(ang - Math.PI / 2) * len * 0.12);
      x.lineTo(r + Math.cos(ang - Math.PI / 2) * len, r + Math.sin(ang - Math.PI / 2) * len);
      x.stroke();
    };
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2, r * 0.45, S * 0.035, night ? '#fff' : '#111');
    hand((now.getMinutes() + sec / 60) / 60 * Math.PI * 2, r * 0.68, S * 0.025, night ? '#fff' : '#111');
    hand((sec / 60) * Math.PI * 2, r * 0.76, S * 0.01, '#ff9500');
    x.fillStyle = '#ff9500';
    x.beginPath();
    x.arc(r, r, S * 0.022, 0, Math.PI * 2);
    x.fill();
  }
  const pad = (n) => String(n).padStart(2, '0');
  const fmtMs = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}.${pad(Math.floor((ms % 1000) / 10))}`;

  OS.registerApp({
    id: 'clock', name: '时钟', icon: 'clock', keywords: ['clock', 'timer', 'alarm', 'stopwatch', '闹钟', '计时器', '秒表'], width: 860, height: 560, minWidth: 560, minHeight: 400, singleton: true,
    description: '世界时钟、闹钟、秒表与计时器。',
    reopen(win, args) {
      if (args.tab) win.state_.tab(args.tab, args);
    },
    create(win, args) {
      const st = (win.state_ = { cur: 'world' });
      const tabs = h('div.tb-group.seg.text', ...[['world', '世界时钟'], ['alarm', '闹钟'], ['stopwatch', '秒表'], ['timer', '计时器']].map(([k, l]) => h('button.tb-btn', { dataset: { k }, onclick: () => st.tab(k) }, l)));
      const body = h('div.ck-body');
      const root = h('div.app.clock', h('div.tbar.center', { 'data-drag': '' }, h('div.tb-spacer', { 'data-drag': '' }), tabs, h('div.tb-spacer', { 'data-drag': '' })), body);
      win.body.appendChild(root);
      const loop = () => {
        $$('canvas', body).forEach((c) => c._tz && draw(c));
        const sw = body.querySelector('.ck-sw-time');
        if (sw) sw.textContent = fmtMs(stopwatch.acc + (stopwatch.start ? Date.now() - stopwatch.start : 0));
        const tt = body.querySelector('.ck-timer-time');
        if (tt) {
          const left = timer.end ? Math.max(0, timer.end - Date.now()) : timer.paused ?? 0;
          const secs = Math.ceil(left / 1000);
          tt.textContent = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
          const ring = body.querySelector('.ck-ring');
          ring && ring.style.setProperty('--p', timer.total ? (left / timer.total) * 100 : 0);
        }
      };
      loop();
      OS.wm.loop(win, loop, 30);
      const offT = OS.on('clock:timer', () => st.cur === 'timer' && st.tab('timer'));
      win.on('close', offT);

      st.tab = (k, opts = {}) => {
        st.cur = k;
        $$('button', tabs).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        body.innerHTML = '';
        if (k === 'world') {
          body.appendChild(h('div.ck-world', ...ZONES.map((z) => {
            const t = new Date().toLocaleString('zh-CN', { timeZone: z.tz, hour: '2-digit', minute: '2-digit', weekday: 'short' });
            const off = Math.round((new Date(new Date().toLocaleString('en-US', { timeZone: z.tz })) - new Date()) / 3600000);
            return h('div.ck-zone', face(z.tz, 120), h('b', z.name), h('small', `${off === 0 ? '今天' : (off > 0 ? '+' : '') + off + ' 小时'} · ${t}`));
          })));
        } else if (k === 'alarm') {
          const list = h('div.ck-alarms');
          const renderA = () => {
            list.innerHTML = '';
            alarms.forEach((a) => {
              const sw = h('label.switch', h('input', { type: 'checkbox', id: 'alarm-' + a.id, checked: a.on, onchange: (e) => ((a.on = e.target.checked), OS.store.set('clock.alarms', alarms), row.classList.toggle('off', !a.on)) }), h('span'));
              const row = h('div.ck-alarm' + (a.on ? '' : '.off'), h('div', h('div.ck-al-time', a.time), h('small', a.label || '闹钟')), h('button.ck-del', { 'aria-label': '删除', html: glyph('trash'), onclick: () => ((alarms = alarms.filter((x) => x !== a)), OS.store.set('clock.alarms', alarms), renderA()) }), sw);
              list.appendChild(row);
            });
          };
          renderA();
          const tIn = h('input.cal-in', { id: 'alarm-new-time', type: 'time', value: '08:00' });
          const lIn = h('input.cal-in', { id: 'alarm-new-label', placeholder: '标签' });
          body.append(h('div.ck-add', tIn, lIn, h('button.btn.primary', { onclick: () => ((alarms.push({ id: OS.uid(), time: tIn.value, label: lIn.value, on: true })), OS.store.set('clock.alarms', alarms), renderA()) }, '添加闹钟')), list);
          [tIn, lIn].forEach((x) => x.addEventListener('keydown', (e) => e.stopPropagation()));
        } else if (k === 'stopwatch') {
          const laps = h('div.ck-laps');
          const renderLaps = () => {
            laps.innerHTML = '';
            const arr = stopwatch.laps;
            const min = Math.min(...arr), max = Math.max(...arr);
            arr.slice().reverse().forEach((l, i) => laps.appendChild(h('div.ck-lap' + (arr.length > 2 && l === min ? '.best' : arr.length > 2 && l === max ? '.worst' : ''), h('span', `计次 ${arr.length - i}`), h('span', fmtMs(l)))));
          };
          const startBtn = h('button.ck-round.green');
          const lapBtn = h('button.ck-round');
          const sync = () => {
            startBtn.textContent = stopwatch.start ? '停止' : '启动';
            startBtn.className = 'ck-round ' + (stopwatch.start ? 'red' : 'green');
            lapBtn.textContent = stopwatch.start || !stopwatch.acc ? '计次' : '复位';
          };
          startBtn.onclick = () => {
            if (stopwatch.start) (stopwatch.acc += Date.now() - stopwatch.start), (stopwatch.start = null);
            else stopwatch.start = Date.now();
            sync();
          };
          lapBtn.onclick = () => {
            if (stopwatch.start) {
              const total = stopwatch.acc + Date.now() - stopwatch.start;
              stopwatch.laps.push(total - stopwatch.laps.reduce((a, b) => a + b, 0));
            } else {
              stopwatch.acc = 0;
              stopwatch.laps = [];
            }
            renderLaps();
            sync();
          };
          sync();
          renderLaps();
          body.append(h('div.ck-sw', h('div.ck-sw-time', '00:00.00'), h('div.ck-btns', lapBtn, startBtn), laps));
        } else if (k === 'timer') {
          if (opts.seconds) {
            timer.total = opts.seconds * 1000;
            timer.end = Date.now() + timer.total;
            timer.paused = null;
          }
          const running = timer.end || timer.paused != null;
          if (!running) {
            const presets = [60, 180, 300, 600, 900, 1800, 3600];
            const hIn = h('input.ck-num', { id: 'timer-h', type: 'number', min: 0, max: 23, value: 0 });
            const mIn = h('input.ck-num', { id: 'timer-m', type: 'number', min: 0, max: 59, value: 5 });
            const sIn = h('input.ck-num', { id: 'timer-s', type: 'number', min: 0, max: 59, value: 0 });
            [hIn, mIn, sIn].forEach((x) => x.addEventListener('keydown', (e) => e.stopPropagation()));
            body.append(h('div.ck-timer-set',
              h('div.ck-pick', hIn, h('span', '小时'), mIn, h('span', '分钟'), sIn, h('span', '秒')),
              h('div.ck-presets', ...presets.map((s) => h('button.ck-preset', { onclick: () => ((hIn.value = Math.floor(s / 3600)), (mIn.value = Math.floor((s % 3600) / 60)), (sIn.value = s % 60)) }, s >= 3600 ? s / 3600 + ' 小时' : s / 60 + ' 分钟'))),
              h('button.ck-round.green.big', { onclick: () => {
                const secs = +hIn.value * 3600 + +mIn.value * 60 + +sIn.value;
                if (secs <= 0) return;
                timer.total = secs * 1000;
                timer.end = Date.now() + timer.total;
                st.tab('timer');
              } }, '开始')
            ));
          } else {
            const pause = h('button.ck-round.' + (timer.end ? 'orange' : 'green'), timer.end ? '暂停' : '继续');
            pause.onclick = () => {
              if (timer.end) (timer.paused = timer.end - Date.now()), (timer.end = null);
              else (timer.end = Date.now() + timer.paused), (timer.paused = null);
              st.tab('timer');
            };
            body.append(h('div.ck-timer', h('div.ck-ring', h('div.ck-timer-time')), h('div.ck-btns', h('button.ck-round', { onclick: () => ((timer.end = null), (timer.paused = null), st.tab('timer')) }, '取消'), pause)));
          }
        }
      };
      st.tab(args.tab || 'world', args);
    },
  });
})();
