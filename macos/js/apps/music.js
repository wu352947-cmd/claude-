/* Music — original tracks performed live by a small Web Audio synth (no audio files, no licensing) */
(function () {
  const { h, $$, glyph } = OS;

  const P = { I: [0, 4, 7], ii: [2, 5, 9], iii: [4, 7, 11], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16], bVII: [10, 14, 17], i: [0, 3, 7], iv: [5, 8, 12], v: [7, 10, 14], bVI: [8, 12, 15], bIII: [3, 7, 10] };
  const TRACKS = [
    { title: '湖面的晨光', artist: 'Tahoe Ensemble', album: '太浩湖', bpm: 84, root: 62, prog: ['I', 'V', 'vi', 'IV'], bars: 40, style: { pad: 1, arp: 1, bass: 1, drums: 0, bell: 1 }, art: 'linear-gradient(135deg,#ffd194,#70a1ff 60%,#3742fa)' },
    { title: '红杉之间', artist: 'Tahoe Ensemble', album: '太浩湖', bpm: 72, root: 57, prog: ['vi', 'IV', 'I', 'V'], bars: 36, style: { pad: 1, arp: 0, bass: 1, drums: 0, bell: 1 }, art: 'linear-gradient(135deg,#134e5e,#71b280)' },
    { title: '海岸公路', artist: 'Pacific Drive', album: '一号公路', bpm: 112, root: 60, prog: ['I', 'iii', 'IV', 'V'], bars: 48, style: { pad: 1, arp: 1, bass: 2, drums: 1, bell: 0 }, art: 'linear-gradient(135deg,#f83600,#f9d423)' },
    { title: '夜航', artist: 'Pacific Drive', album: '一号公路', bpm: 96, root: 55, prog: ['i', 'bVI', 'bIII', 'bVII'], bars: 44, style: { pad: 1, arp: 1, bass: 2, drums: 1, bell: 0 }, art: 'linear-gradient(135deg,#0f2027,#2c5364 50%,#8e44ad)' },
    { title: '玻璃的回声', artist: 'Liquid Glass', album: '折射', bpm: 100, root: 64, prog: ['IV', 'V', 'iii', 'vi'], bars: 40, style: { pad: 1, arp: 2, bass: 1, drums: 1, bell: 1 }, art: 'linear-gradient(135deg,#a1c4fd,#c2e9fb 45%,#fbc2eb)' },
    { title: '慢慢来', artist: 'Liquid Glass', album: '折射', bpm: 68, root: 59, prog: ['ii', 'V', 'I', 'vi'], bars: 32, style: { pad: 1, arp: 0, bass: 1, drums: 0, bell: 1 }, art: 'linear-gradient(135deg,#ee9ca7,#ffdde1)' },
    { title: '星群', artist: 'Night Shift', album: '夜览', bpm: 120, root: 62, prog: ['vi', 'V', 'IV', 'V'], bars: 52, style: { pad: 1, arp: 2, bass: 2, drums: 2, bell: 0 }, art: 'linear-gradient(135deg,#20002c,#cbb4d4)' },
    { title: '雪落无声', artist: 'Night Shift', album: '夜览', bpm: 76, root: 65, prog: ['I', 'vi', 'ii', 'V'], bars: 36, style: { pad: 1, arp: 1, bass: 0, drums: 0, bell: 1 }, art: 'linear-gradient(135deg,#e0eafc,#cfdef3 60%,#89a7c9)' },
  ];
  TRACKS.forEach((t, i) => {
    t.id = i;
    t.duration = (t.bars * 4 * 60) / t.bpm;
  });

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------------- engine ---------------- */
  const eng = { playing: false, idx: 0, offset: 0, startAt: 0, timer: null, shuffle: false, repeat: false };
  let out, verb, ctxRef;
  function setup() {
    const ctx = OS.sound.ctx();
    if (!ctx) return null;
    if (ctxRef === ctx && out) return ctx;
    ctxRef = ctx;
    out = ctx.createGain();
    out.gain.value = 0.9;
    // generated impulse response for a soft room
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    out.connect(OS.sound.master());
    out.connect(verb).connect(wet).connect(OS.sound.master());
    eng.analyser = ctx.createAnalyser();
    eng.analyser.fftSize = 64;
    out.connect(eng.analyser);
    return ctx;
  }
  let noise;
  function noiseBuf(ctx) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function voice(ctx, t, { f, type = 'sine', dur, gain, attack = 0.01, release = 0.3, cutoff, detune = 0, dest = out }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    let node = o;
    if (cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      node.connect(lp);
      node = lp;
    }
    node.connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function drum(ctx, t, kind) {
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.4);
    } else {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf(ctx);
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = ctx.createGain();
      const len = kind === 'hat' ? 0.05 : 0.18;
      g.gain.setValueAtTime(kind === 'hat' ? 0.09 : 0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      s.connect(f).connect(g).connect(out);
      s.start(t);
      s.stop(t + len + 0.02);
    }
  }
  /* schedule one sixteenth-note step */
  function step(ctx, tr, n, t) {
    const sixteenth = 60 / tr.bpm / 4;
    const bar = Math.floor(n / 16);
    const s = n % 16;
    const chord = P[tr.prog[bar % tr.prog.length]];
    const root = tr.root;
    const st = tr.style;
    const intro = bar < 2, outro = bar >= tr.bars - 2;
    if (s === 0 && st.pad) chord.forEach((c, i) => [-6, 6].forEach((dt) => voice(ctx, t, { f: mtof(root + c - 12 + (i === 0 ? 12 : 0)), type: 'sawtooth', dur: sixteenth * 16 + 0.3, gain: 0.018, attack: 0.6, release: 0.8, cutoff: 1300, detune: dt })));
    if (st.bass && !intro && (s === 0 || (st.bass > 1 && (s === 8 || s === 6 || s === 14)))) voice(ctx, t, { f: mtof(root + chord[0] - 24), type: 'triangle', dur: sixteenth * (s === 0 ? 6 : 2), gain: 0.2, attack: 0.01, release: 0.15 });
    if (st.arp && !outro && (st.arp > 1 || s % 2 === 0)) {
      const tones = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[0] + 12];
      const k = tones[(n / (st.arp > 1 ? 1 : 2)) % tones.length | 0];
      voice(ctx, t, { f: mtof(root + k + 12), type: st.arp > 1 ? 'square' : 'triangle', dur: sixteenth * 1.8, gain: st.arp > 1 ? 0.025 : 0.06, attack: 0.005, release: 0.12, cutoff: 3200 });
    }
    if (st.bell && (s === 0 || s === 10) && bar % 2 === 1) voice(ctx, t, { f: mtof(root + chord[2] + 24), type: 'sine', dur: 1.8, gain: 0.05, attack: 0.002, release: 1.6 });
    if (st.drums && !intro && !outro) {
      if (s % 8 === 0 || (st.drums > 1 && s === 10)) drum(ctx, t, 'kick');
      if (s % 8 === 4) drum(ctx, t, 'snare');
      if (s % 2 === 0 || st.drums > 1) drum(ctx, t, 'hat');
    }
  }
  function schedule() {
    const ctx = ctxRef;
    const tr = TRACKS[eng.idx];
    const sixteenth = 60 / tr.bpm / 4;
    while (eng.nextT < ctx.currentTime + 0.15) {
      if (eng.n >= tr.bars * 16) {
        clearInterval(eng.timer);
        eng.timer = null;
        setTimeout(() => (eng.repeat ? play(eng.idx, 0) : next(true)), Math.max(0, (eng.nextT - ctx.currentTime) * 1000 + 600));
        return;
      }
      step(ctx, tr, eng.n, eng.nextT);
      eng.n++;
      eng.nextT += sixteenth;
    }
  }
  function play(idx = eng.idx, offset = idx === eng.idx ? eng.offset : 0) {
    const ctx = setup();
    if (!ctx) return OS.toast('此浏览器不支持音频播放');
    stopTimer();
    eng.idx = idx;
    const tr = TRACKS[idx];
    const sixteenth = 60 / tr.bpm / 4;
    eng.n = Math.floor(offset / sixteenth);
    eng.offset = eng.n * sixteenth;
    eng.nextT = ctx.currentTime + 0.06;
    eng.startAt = eng.nextT - eng.offset;
    eng.playing = true;
    // fade in
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.25);
    eng.timer = setInterval(schedule, 25);
    schedule();
    OS.store.set('music.last', { idx });
    emit();
  }
  function stopTimer() {
    if (eng.timer) clearInterval(eng.timer);
    eng.timer = null;
  }
  function pause() {
    if (!eng.playing) return;
    eng.offset = position();
    eng.playing = false;
    stopTimer();
    if (out && ctxRef) {
      out.gain.cancelScheduledValues(ctxRef.currentTime);
      out.gain.setValueAtTime(out.gain.value, ctxRef.currentTime);
      out.gain.linearRampToValueAtTime(0.0001, ctxRef.currentTime + 0.25);
    }
    emit();
  }
  function position() {
    if (!eng.playing || !ctxRef) return eng.offset;
    return Math.min(TRACKS[eng.idx].duration, Math.max(0, ctxRef.currentTime - eng.startAt));
  }
  function next(auto) {
    const i = eng.shuffle ? Math.floor(Math.random() * TRACKS.length) : (eng.idx + 1) % TRACKS.length;
    if (auto === true || eng.playing) play(i, 0);
    else (eng.idx = i), (eng.offset = 0), emit();
  }
  function prev() {
    if (position() > 3) return eng.playing ? play(eng.idx, 0) : ((eng.offset = 0), emit());
    const i = (eng.idx - 1 + TRACKS.length) % TRACKS.length;
    eng.playing ? play(i, 0) : ((eng.idx = i), (eng.offset = 0), emit());
  }
  function emit() {
    OS.emit('music', OS.music.state());
    updateMenubar();
  }
  function updateMenubar() {
    const el = OS.menubar && OS.menubar.nowPlaying;
    if (!el) return;
    el.hidden = !eng.playing;
    el.innerHTML = eng.playing ? `<span class="np-bars"><i></i><i></i><i></i></span><span class="np-title">${OS.esc(TRACKS[eng.idx].title)}</span>` : '';
  }

  OS.music = {
    tracks: TRACKS,
    state: () => ({ playing: eng.playing, track: TRACKS[eng.idx], idx: eng.idx, pos: position(), shuffle: eng.shuffle, repeat: eng.repeat }),
    play: (i) => play(i ?? eng.idx, i != null && i !== eng.idx ? 0 : undefined),
    pause,
    toggle: () => (eng.playing ? pause() : play()),
    next: () => next(),
    prev,
    seek: (sec) => (eng.playing ? play(eng.idx, sec) : ((eng.offset = sec), emit())),
    analyser: () => eng.analyser,
  };
  const last = OS.store.get('music.last', null);
  if (last) eng.idx = last.idx || 0;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /* ---------------- app UI ---------------- */
  OS.registerApp({
    id: 'music', name: '音乐', icon: 'music', keywords: ['music', 'itunes', '歌曲', 'songs', 'player'], width: 1000, height: 640, minWidth: 640, minHeight: 400, singleton: true,
    description: '在资料库中播放和整理你的音乐。',
    reopen(win, args) {
      if (args.play) play();
    },
    onQuit: () => pause(),
    menus: () => [
      { title: '控制', items: [
        { label: eng.playing ? '暂停' : '播放', key: '空格', action: () => OS.music.toggle() },
        { label: '下一首', key: '⌘→', action: () => next() },
        { label: '上一首', key: '⌘←', action: () => prev() },
        { sep: true },
        { label: '随机播放', checked: eng.shuffle, action: () => ((eng.shuffle = !eng.shuffle), emit()) },
        { label: '重复', checked: eng.repeat, action: () => ((eng.repeat = !eng.repeat), emit()) },
      ] },
    ],
    onKey(win, e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ') (e.preventDefault(), OS.music.toggle());
      if (OS.cmd(e) && e.key === 'ArrowRight') next();
      if (OS.cmd(e) && e.key === 'ArrowLeft') prev();
    },
    create(win, args) {
      const st = { view: 'songs' };
      const sidebar = h('nav.side', { 'data-drag': '' });
      const content = h('div.mu-content');
      const playBtn = h('button.mu-play', { 'aria-label': '播放', onclick: () => OS.music.toggle() });
      const lcdTitle = h('div.mu-lcd-title');
      const lcdArtist = h('div.mu-lcd-artist');
      const lcdArt = h('div.mu-lcd-art');
      const prog = h('input.mu-prog', { id: 'music-progress', type: 'range', min: 0, max: 1000, value: 0, 'aria-label': '播放进度' });
      const tCur = h('span.mu-t'), tRem = h('span.mu-t');
      const vol = h('input.mu-vol', { id: 'music-volume', type: 'range', min: 0, max: 100, value: OS.settings.volume, 'aria-label': '音量' });
      const shufBtn = h('button.tb-btn.small', { 'aria-label': '随机播放', html: glyph('shuffle'), onclick: () => ((eng.shuffle = !eng.shuffle), emit()) });
      const repBtn = h('button.tb-btn.small', { 'aria-label': '重复', html: glyph('repeat'), onclick: () => ((eng.repeat = !eng.repeat), emit()) });
      const toolbar = h('div.tbar.mu-bar', { 'data-drag': '' },
        h('div.mu-ctl', shufBtn, h('button.tb-btn', { 'aria-label': '上一首', html: glyph('prev'), onclick: prev }), playBtn, h('button.tb-btn', { 'aria-label': '下一首', html: glyph('next'), onclick: () => next() }), repBtn),
        h('div.mu-lcd', lcdArt, h('div.mu-lcd-mid', lcdTitle, lcdArtist, h('div.mu-prog-row', tCur, prog, tRem))),
        h('div.mu-volrow', h('span', { html: glyph('speaker') }), vol)
      );
      const viz = h('canvas.mu-viz', { width: 200, height: 40 });
      const root = h('div.app.music', h('div.split', sidebar, h('div.pane', toolbar, content)));
      win.body.appendChild(root);

      const SIDE = [
        { head: 'Apple Music' }, { id: 'home', label: '主页', g: 'house' }, { id: 'new', label: '新发现', g: 'sparkles' }, { id: 'radio', label: '广播', g: 'airdrop' },
        { head: '资料库' }, { id: 'recent', label: '最近添加', g: 'clock' }, { id: 'artists', label: '艺人', g: 'person' }, { id: 'albums', label: '专辑', g: 'grid' }, { id: 'songs', label: '歌曲', g: 'list' },
        { head: '播放列表' }, { id: 'pl-focus', label: '专注工作', g: 'list' }, { id: 'pl-night', label: '深夜', g: 'list' },
      ];
      function renderSide() {
        sidebar.innerHTML = '';
        sidebar.append(h('div.side-top', { 'data-drag': '' }), h('label.side-search', h('span', { html: glyph('search') }), h('input', { id: 'music-search', type: 'search', placeholder: '搜索', oninput: (e) => ((st.q = e.target.value.trim()), (st.view = 'songs'), renderContent()), onkeydown: (e) => e.stopPropagation() })));
        SIDE.forEach((s) => {
          if (s.head) return sidebar.appendChild(h('div.sb-head', s.head));
          const row = h('div.sb-item' + (st.view === s.id ? '.active' : ''), h('span.sb-ico.red', { html: glyph(s.g) }), h('span.sb-label', s.label));
          row.onclick = () => ((st.view = s.id), renderSide(), renderContent());
          sidebar.appendChild(row);
        });
      }
      const art = (t, cls = '') => h('div.mu-art' + cls, { style: { background: t.art } }, h('span.mu-art-t', t.album));
      function songTable(list) {
        const tbl = h('div.mu-table', h('div.mu-row.head', h('span'), h('span', '名称'), h('span', '艺人'), h('span', '专辑'), h('span', '时长')));
        list.forEach((t) => {
          const playingThis = eng.idx === t.id;
          const row = h('div.mu-row' + (playingThis ? '.cur' : ''), { tabindex: 0 },
            h('span.mu-idx', playingThis && eng.playing ? h('span.np-bars', h('i'), h('i'), h('i')) : String(t.id + 1)),
            h('span.mu-name', h('div.mu-mini', { style: { background: t.art } }), t.title),
            h('span', t.artist), h('span', t.album), h('span', fmt(t.duration))
          );
          row.ondblclick = () => play(t.id, 0);
          row.onkeydown = (e) => e.key === 'Enter' && play(t.id, 0);
          row.oncontextmenu = (e) => OS.contextMenu(e, [{ label: '播放', action: () => play(t.id, 0) }, { label: '接着播放', action: () => OS.toast('已加入待播清单') }, { sep: true }, { label: '喜爱', glyph: 'star', action: () => OS.toast('已标记为喜爱', 'star') }]);
          tbl.appendChild(row);
        });
        return tbl;
      }
      function renderContent() {
        content.innerHTML = '';
        const q = (st.q || '').toLowerCase();
        if (st.view === 'home' || st.view === 'new' || st.view === 'radio') {
          const t0 = TRACKS[2];
          content.append(
            h('div.mu-hero', { style: { background: t0.art } }, h('div', h('small', st.view === 'radio' ? '电台 · 正在直播' : '为你推荐'), h('h1', st.view === 'radio' ? 'Tahoe 电台' : '今日精选'), h('p', '原创合成器音乐，在你的 Mac 上实时演奏。'), h('button.btn.primary', { onclick: () => play(2, 0) }, h('span', { html: glyph('play') }), ' 播放'))),
            h('h2.mu-h2', '最近播放'),
            h('div.mu-shelf', TRACKS.slice(0, 6).map((t) => {
              const c = h('div.mu-card', art(t), h('b', t.title), h('small', t.artist));
              c.onclick = () => play(t.id, 0);
              return c;
            }))
          );
          return;
        }
        if (st.view === 'albums' || st.view === 'artists') {
          const key = st.view === 'albums' ? 'album' : 'artist';
          const groups = [...new Set(TRACKS.map((t) => t[key]))];
          content.append(h('h1.mu-h1', st.view === 'albums' ? '专辑' : '艺人'), h('div.mu-albums', groups.map((g) => {
            const t = TRACKS.find((x) => x[key] === g);
            const c = h('div.mu-card' + (key === 'artist' ? '.round' : ''), art(t), h('b', g), h('small', key === 'album' ? t.artist : TRACKS.filter((x) => x.artist === g).length + ' 首歌曲'));
            c.onclick = () => ((st.view = 'songs'), (st.filter = { key, g }), renderSide(), renderContent());
            return c;
          })));
          return;
        }
        let list = TRACKS;
        if (st.view === 'recent') list = TRACKS.slice().reverse();
        if (st.view === 'pl-focus') list = TRACKS.filter((t) => t.bpm >= 96);
        if (st.view === 'pl-night') list = TRACKS.filter((t) => t.bpm < 96);
        if (st.view === 'songs' && st.filter) list = TRACKS.filter((t) => t[st.filter.key] === st.filter.g);
        if (q) list = TRACKS.filter((t) => (t.title + t.artist + t.album).toLowerCase().includes(q));
        const title = st.filter && st.view === 'songs' ? st.filter.g : SIDE.find((s) => s.id === st.view)?.label || '歌曲';
        content.append(h('div.mu-listhead', h('h1.mu-h1', title), st.filter ? h('button.btn', { onclick: () => ((st.filter = null), renderContent()) }, '显示全部') : null, h('button.btn.primary', { onclick: () => list[0] && play(list[0].id, 0) }, '播放')), songTable(list));
        st.filter = st.view === 'songs' ? st.filter : null;
      }
      function renderPlayer() {
        const s = OS.music.state();
        playBtn.innerHTML = glyph(s.playing ? 'pause' : 'play');
        lcdTitle.textContent = s.track.title;
        lcdArtist.textContent = `${s.track.artist} — ${s.track.album}`;
        lcdArt.style.background = s.track.art;
        shufBtn.classList.toggle('on', s.shuffle);
        repBtn.classList.toggle('on', s.repeat);
        win.setTitle(s.playing ? s.track.title : '音乐');
      }
      let dragging = false;
      prog.addEventListener('input', () => (dragging = true));
      prog.addEventListener('change', () => {
        dragging = false;
        OS.music.seek((prog.value / 1000) * TRACKS[eng.idx].duration);
      });
      vol.addEventListener('input', () => OS.setSetting('volume', +vol.value));
      const tick = setInterval(() => {
        const s = OS.music.state();
        if (!dragging) prog.value = (s.pos / s.track.duration) * 1000;
        prog.style.setProperty('--v', (prog.value / 10) + '%');
        tCur.textContent = fmt(s.pos);
        tRem.textContent = '-' + fmt(s.track.duration - s.pos);
      }, 250);
      const off = OS.on('music', () => {
        renderPlayer();
        if (st.view !== 'home' && st.view !== 'albums' && st.view !== 'artists') renderContent();
      });
      win.on('close', () => (clearInterval(tick), off()));
      renderSide();
      renderContent();
      renderPlayer();
      if (args.play) play();
    },
  });
})();
