/* ---------- campaign: 太平洋血泪 · 龙与鹰 ----------
   Inlined into navwar.js (shares its scope).
   - Prologue: a strategic map of the South China Sea drawn stroke by stroke, narration, in-engine flyovers of both
     fleets, letterboxed, over a synthesised score (string drone, choir pad, war drums).
   - Chapters: each side has its own missions with a clear objective, checked live; finishing one raises the next.
   - Cinematic shots: the camera briefly cuts to the moments that matter (a saturation salvo leaving the cells, ballistic
     missiles re-entering, a carrier going down), letterboxed with a subtitle; any tap skips back.
   - Epilogue: the cost, in words, over the last shot of the battle. */

const CAMPAIGN = {
  title: '太平洋血泪', sub: '龙与鹰',
  prologue: {
    common: [
      ['2031 年 · 南海', 'year'],
      ['七十二小时的对峙，在一架侦察机坠海的那一刻结束。', ''],
      ['没有人能说清，是谁先按下了发射键。', ''],
      ['数分钟内，局部摩擦升级为两个大国之间的全面海空决战。', ''],
      ['这一战，将决定未来半个世纪太平洋的秩序。', 'big']
    ],
    cn: [['龙 · 中国人民解放军海军', 'side'], ['福建舰、山东舰双航母编队，055 万吨大驱领衔的水面舰队，岛礁陆基航空兵与火箭军。', ''], ['命令只有一句：夺取制海权。', 'big']],
    us: [['鹰 · 美国海军第七舰队', 'side'], ['福特号与里根号双航母打击群，宙斯盾舰队，潜伏在深海的弗吉尼亚级，与从关岛起飞的 B-1B。', ''], ['命令只有一句：守住航道，击溃对手。', 'big']]
  },
  chapters: {
    cn: [
      { title: '序章 · 龙出深海', line: '双航母编队驶出三亚。空警-600 弹射升空，为舰队睁开眼睛。', goal: '起飞预警机，建立战场空情', check: () => planes.some(p => p.side === 'cn' && p.T.aew && p.state === 'air') },
      { title: '第一章 · 寻鹰', line: '东方海天之间，美军双航母打击群隐入了电磁静默。卫星、超视距雷达与预警机，一寸一寸地找。', goal: '发现敌方航母（真目标）', check: () => [...picture.cn.keys()].some(e => e.kind === 'ship' && e.carrier && !e.phantom) },
      { title: '第二章 · 夺取制空', line: '歼-35 与歼-15 前出。先打掉敌人的眼睛，再谈打他的拳头。', goal: '击落敌机 6 架，或击落一架 E-2D', check: () => game.ledger.air.us >= 6 || game.ledger.aew.cn >= 1 },
      { title: '第三章 · 饱和之潮', line: '攻击编队在集结点汇合，舰队的垂发单元同时开启。数十枚鹰击统一时间扑向敌阵。', goal: '反舰导弹命中敌舰 8 次', check: () => dbg.hitBy.cn >= 8 },
      { title: '第四章 · 东风破浪', line: '大陆深处，火箭军的发射车竖起了东风。航母杀手，从太空俯冲而下。', goal: '东风命中敌舰，或击沉任意一艘敌舰', check: () => game.flags.dfHit > 0 || game.flags.sunkUS > 0 },
      { title: '第五章 · 血染南海', line: '海面燃烧，钢铁在下沉。只要敌航母还在，这场仗就没有结束。', goal: '击沉一艘敌方航母，同时守住永暑礁', check: () => game.flags.sunkUSCV > 0 },
      { title: '终章 · 龙吟九霄', line: '最后的力量全部压上。为了那些没能回家的人，打完这一仗。', goal: '夺取制海权：摧毁敌方战争潜力', check: () => false }
    ],
    us: [
      { title: '序章 · 鹰巢', line: '福特号飞行甲板上，弹射器的轰鸣此起彼伏。E-2D 鹰眼起飞。', goal: '起飞预警机，建立战场空情', check: () => planes.some(p => p.side === 'us' && p.T.aew && p.state === 'air') },
      { title: '第一章 · 雷霆之眼', line: '鹰眼的雷达扫过南海。福建舰编队，就在西方地平线之外——如果那不是诱饵的话。', goal: '发现敌方航母（真目标）', check: () => [...picture.us.keys()].some(e => e.kind === 'ship' && e.carrier && !e.phantom) },
      { title: '第二章 · 外层空战', line: '射手，而不是箭。在轰-6K 和歼-15 发射之前，把它们打下来。', goal: '击落携弹的敌攻击机 / 轰炸机 4 架', check: () => game.ledger.archers.us >= 4 },
      { title: '第三章 · 盾与矛', line: '宙斯盾雷达捕捉到大气层外的再入目标——东风。标准-3，发射！', goal: '拦截东风 2 枚，或拦截来袭反舰导弹 20 枚', check: () => (game.flags.bmKill || 0) >= 2 || ['sam', 'ciws', 'decoy'].reduce((a, k) => a + ((dbg.fate.cn || {})[k] || 0), 0) >= 20 },
      { title: '第四章 · 分布式杀伤', line: 'LRASM、战斧、鱼叉——从天空、海面与深海，同时出拳。', goal: '反舰导弹命中敌舰 8 次', check: () => dbg.hitBy.us >= 8 },
      { title: '第五章 · 铁与火', line: '海面燃烧，钢铁在下沉。只要敌航母还在，这场仗就没有结束。', goal: '击沉一艘敌方航母', check: () => game.flags.sunkCNCV > 0 },
      { title: '终章 · 最后的黎明', line: '剩下的战力只够打一场。为了那些没能回家的人，打完这一仗。', goal: '夺取制海权：摧毁敌方战争潜力', check: () => false }
    ]
  },
  end: {
    win: {
      cn: ['美军双航母打击群失去作战能力，残存舰艇向东撤出南海。', '胜利的代价写在每一艘燃烧的军舰上，写在海面漂浮的救生筏上。', '龙守住了家门。但太平洋记住了这一天的血与泪。'],
      us: ['解放军双航母编队失去作战能力，南海暂时恢复了平静。', '胜利的代价写在每一艘燃烧的军舰上，写在海面漂浮的救生筏上。', '鹰守住了航道。但太平洋记住了这一天的血与泪。']
    },
    draw: {
      cn: ['两支舰队都已精疲力竭，谁也没能把对方赶出南海。', '海面上漂满了残骸与油污。谈判桌上的每一句话，都带着硝烟的味道。', '太平洋记住了这一天的血与泪。'],
      us: ['两支舰队都已精疲力竭，谁也没能把对方赶出南海。', '海面上漂满了残骸与油污。谈判桌上的每一句话，都带着硝烟的味道。', '太平洋记住了这一天的血与泪。']
    },
    lose: {
      cn: ['我方编队战争潜力耗尽，残存舰艇被迫撤离战区。', '将士们已经尽了全力。这场失败，将被反复复盘、铭记。', '太平洋记住了这一天的血与泪。'],
      us: ['打击群战争潜力耗尽，被迫撤出南海。', '水兵们已经尽了全力。这场失败，将被反复复盘、铭记。', '太平洋记住了这一天的血与泪。']
    }
  }
};

/* ---------- music: a small synthesised orchestra ---------- */
const Music = {
  bus: null, drone: null,
  init() {
    if (this.bus || !Sound.ctx) return;
    const ctx = Sound.ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.55;
    // a long reverb from a decaying noise impulse
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    this.bus.connect(Sound.master); this.bus.connect(verb); verb.connect(wet); wet.connect(Sound.master);
  },
  // sustained low strings: detuned saws through a slowly opening filter
  strings(notes, dur, vol = 0.07, t0 = 0) {
    if (!this.bus) return;
    const ctx = Sound.ctx, t = ctx.currentTime + t0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(1400, t + dur * 0.6); f.frequency.linearRampToValueAtTime(500, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g); g.connect(this.bus);
    for (const n of notes) for (const det of [-7, 0, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = n; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.1);
    }
  },
  // choir: saws through two vowel formants with a slow vibrato
  choir(notes, dur, vol = 0.05, t0 = 0) {
    if (!this.bus) return;
    const ctx = Sound.ctx, t = ctx.currentTime + t0;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const [fq, q] of [[720, 8], [1150, 10]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; bp.connect(g); this['_f' + fq] = bp; }
    g.connect(this.bus);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lfo.start(t); lfo.stop(t + dur);
    for (const n of notes) for (const det of [-5, 4]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = n; o.detune.value = det; lg.connect(o.detune);
      o.connect(this._f720); o.connect(this._f1150); o.start(t); o.stop(t + dur + 0.1);
    }
  },
  // war drum: a pitched thump with a skin of noise
  drum(t0 = 0, vol = 0.5, f = 62) {
    if (!this.bus) return;
    const ctx = Sound.ctx, t = ctx.currentTime + t0;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 1.2);
    const s = ctx.createBufferSource(); s.buffer = Sound.noise; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(nf); nf.connect(ng); ng.connect(this.bus); s.start(t, Math.random()); s.stop(t + 0.3);
  },
  // brass-like swell for chapter cards
  horn(notes, dur, vol = 0.06, t0 = 0) {
    if (!this.bus) return;
    const ctx = Sound.ctx, t = ctx.currentTime + t0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(2400, t + dur * 0.35); f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g); g.connect(this.bus);
    for (const n of notes) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = n; o.connect(f); o.start(t); o.stop(t + dur + 0.1); }
  },
  // A minor: the prologue theme
  prologue() {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    const A1 = 55, E2 = 82.4, A2 = 110, C3 = 130.8, E3 = 164.8, F2 = 87.3, G2 = 98, D3 = 146.8;
    this.strings([A1, E2, A2], 12, 0.08, 0);
    this.strings([F2, C3, A2], 10, 0.07, 10);
    this.strings([G2, D3, G2 * 2], 10, 0.07, 19);
    this.strings([A1, E2, A2, E3], 16, 0.09, 28);
    this.choir([220, 261.6, 329.6], 14, 0.045, 6);
    this.choir([174.6, 220, 261.6], 12, 0.045, 19);
    this.choir([220, 277.2, 329.6, 440], 16, 0.05, 30);
    for (let i = 0; i < 8; i++) this.drum(8 + i * 1.5, 0.35);
    for (let i = 0; i < 16; i++) this.drum(28 + i * 0.75, 0.25 + (i % 4 === 0 ? 0.25 : 0));
    this.horn([110, 164.8, 220], 6, 0.05, 30); this.horn([130.8, 196, 261.6], 6, 0.05, 36);
  },
  stinger(big = false) {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    this.drum(0, 0.6, 55); this.drum(0.35, 0.4, 60);
    this.horn(big ? [110, 164.8, 220, 277.2] : [110, 164.8, 220], big ? 4.5 : 3, 0.06, 0.1);
    this.strings([55, 82.4, 110], big ? 6 : 4, 0.06, 0);
  },
  end(win) {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    if (win) { this.strings([110, 164.8, 220, 277.2], 12, 0.08); this.choir([220, 277.2, 329.6, 440], 12, 0.05, 1); this.horn([220, 277.2, 329.6], 7, 0.05, 3); }
    else { this.strings([55, 82.4, 110, 130.8], 14, 0.08); this.choir([220, 261.6, 329.6], 13, 0.045, 1); }
    for (let i = 0; i < 4; i++) this.drum(i * 2.2, 0.3, 50);
  }
};

/* ---------- campaign progress ---------- */
function campaignStart() {
  game.camp = { i: 0, t: 0, done: [] };
  game.flags.sunkUS = game.flags.sunkCN = game.flags.sunkUSCV = game.flags.sunkCNCV = 0;
  chapterCard(0);
}
function chapterCard(i) {
  const C = CAMPAIGN.chapters[game.side][i];
  game.card = { title: C.title, sub: C.line, goal: C.goal, t: 6.5, max: 6.5 };
  game.chapter = i + 1;
  radio(game.side === 'cn' ? '舰队司令部' : '第七舰队', C.line, '#ffd28a');
  Music.stinger(i >= 3);
}
function updateCampaign(dt) {
  const K = game.camp; if (!K) return;
  K.t += dt;
  const list = CAMPAIGN.chapters[game.side];
  const C = list[K.i];
  if (C && K.t > 4 && C.check()) {
    K.done.push(K.i);
    message('任务完成', C.goal, '#8dffb4', 3);
    if (K.i + 1 < list.length) { K.i++; K.t = 0; chapterCard(K.i); }
  }
}
// sinkings feed the objectives
function campaignSunk(unit) {
  const f = game.flags;
  if (unit.side === 'us') { f.sunkUS = (f.sunkUS || 0) + 1; if (unit.carrier) f.sunkUSCV = (f.sunkUSCV || 0) + 1; }
  if (unit.side === 'cn') { f.sunkCN = (f.sunkCN || 0) + 1; if (unit.carrier) f.sunkCNCV = (f.sunkCNCV || 0) + 1; }
  if (unit.carrier) cineOn('carrier', unit);
}
function drawObjectives() {
  const K = game.camp; if (!K || game.mode !== 'play' || game.cine) return;
  const C = CAMPAIGN.chapters[game.side][K.i]; if (!C) return;
  const compact = HH < 480;
  const x = scopeBox.r ? scopeBox.x - scopeBox.r - 12 : HW - (compact ? 10 : 16), y = compact ? 44 : 50;
  hc.save();
  hc.textAlign = 'right';
  hc.font = `700 ${compact ? 11 : 12}px ${SANS}`; hc.fillStyle = GOLD; hc.fillText(C.title, x, y);
  hc.font = `500 ${compact ? 10 : 11}px ${SANS}`; hc.fillStyle = '#e9f2f7'; hc.fillText(`◆ ${C.goal}`, x, y + 16);
  // the operation's phase (the chapters tell the story; the phases are the commander's plan)
  const J = command[game.side], P = planOf(game.side);
  if (J.ph && P && game.role !== 'cmd') { hc.font = `500 ${compact ? 9 : 10}px ${SANS}`; hc.fillStyle = 'rgba(255,210,138,0.85)'; hc.fillText(`战区 · 第 ${J.ph.i + 1}/${P.phases.length} 阶段 ${PHASES[J.ph.id].name} · ${J.ph.label}`, x, y + 31); }
  hc.restore();
}

/* ---------- cinematic camera ---------- */
// a shot: { dur, sub, fn(t, dt) that places the camera }; a cine is a list of shots
function cinePlay(shots, onDone) {
  game.cine = { shots, i: 0, t: 0, onDone };
  game.snap = 2;
}
function cineStop(skip = false) {
  const c = game.cine; game.cine = null; game.snap = 2;
  if (c && c.onDone && !skip) c.onDone();
}
function updateCine(dt) {
  const c = game.cine; if (!c) return false;
  const sh = c.shots[c.i];
  if (!sh) { cineStop(); return false; }
  // the cut frame after a shot change passes a huge dt to snap the camera; the shot clock must not jump with it
  const now = performance.now(), step = c.last ? Math.min((now - c.last) / 1000, 0.5) : 0;
  c.last = now;
  c.t += step;
  sh.fn(c.t, dt);
  if (c.t >= sh.dur) { c.i++; c.t = 0; c.last = 0; game.snap = 2; }
  return true;
}
// shots built from live units
const shot = {
  orbit(u, dist, elev, spin, dur, sub) { return { dur, sub, fn: (t) => { const a = (u.heading || 0) + 2.2 + spin * t; const p = u.pos; camera.position.set(p.x + Math.cos(a) * dist, Math.max(4, (p.y || 0) + elev), p.z - Math.sin(a) * dist); camera.up.copy(Y_AXIS); camera.lookAt(p.x, (p.y || 0) + (u.h || 10) * 0.5, p.z); fov = 42; } }; },
  low(u, dur, sub) { return { dur, sub, fn: (t) => { const s = u; toWorld(s, s.S.L * (0.9 - t * 0.06), 6, s.S.L * 0.45, camPos); camera.position.copy(camPos); camera.up.copy(Y_AXIS); toWorld(s, 0, s.h * 0.45, 0, _d); camera.lookAt(_d); fov = 40; } }; },
  chase(m, dur, sub) { return { dur, sub, fn: (t, dt) => { if (m.alive) chaseMissile(m, Math.max(dt, 0.02)); fov = 55; } }; },
  watch(from, getTarget, dur, sub) { return { dur, sub, fn: () => { camera.position.copy(from); camera.up.copy(Y_AXIS); const tg = getTarget(); if (tg) camera.lookAt(tg); fov = 34; } }; },
  pan(p0, p1, look, dur, sub) { return { dur, sub, fn: (t) => { const k = smooth(0, dur, t); camera.position.lerpVectors(p0, p1, k); camera.up.copy(Y_AXIS); camera.lookAt(look); fov = 45; } }; }
};
// event cinematics: short, letterboxed, skippable. Pilots keep their own camera
function cineOn(kind, obj) {
  if (game.mode !== 'play' || game.cine || game.role === 'pilot' || !settings.cine) return;
  if (game.t - (game.lastCine || -99) < 25 && kind !== 'carrier') return;
  game.lastCine = game.t;
  if (kind === 'salvo' && obj) {
    const o = obj.owner && obj.owner.kind === 'ship' ? obj.owner : null;
    cinePlay([o ? shot.orbit(o, o.S.L * 1.2, 30, 0.08, 2.5, `${o.name} · 垂直发射`) : shot.chase(obj, 2.5, ''), shot.chase(obj, 4, `${obj.spec.name} · 目标 ${obj.target ? obj.target.name : ''}`)]);
  } else if (kind === 'ballistic' && obj) {
    const tgt = obj.target;
    const from = tgt ? tgt.pos.clone().add(new V3(900, 60, 700)) : camera.position.clone();
    cinePlay([shot.chase(obj, 3.5, `${obj.spec.name} · 再入大气层`), shot.watch(from, () => obj.alive ? obj.pos : null, 4, tgt ? `目标 ${tgt.name} · 末段机动` : '')]);
  } else if (kind === 'carrier' && obj) {
    cinePlay([shot.orbit(obj, obj.S.L * 1.5, 60, 0.05, 6, `${obj.name} 正在下沉`)]);
  }
}

/* ---------- prologue ---------- */
// a stylised strategic map: coastlines (lon, lat), drawn stroke by stroke, then the two fleets converge
const MAP = {
  china: [[105.8, 21.6], [107.5, 21.6], [108.5, 21.7], [109.7, 21.5], [110.4, 20.9], [110.2, 21.9], [111.6, 21.6], [113.2, 22.2], [114.2, 22.6], [116.5, 22.9], [117.8, 24.0], [118.6, 24.6], [119.6, 25.8], [120.4, 27.3], [121.4, 28.6], [122.0, 30.0]],
  hainan: [[108.6, 19.2], [109.6, 18.3], [110.5, 18.6], [111.0, 19.6], [110.6, 20.1], [109.6, 20.0], [108.7, 19.7], [108.6, 19.2]],
  taiwan: [[120.1, 23.0], [120.7, 22.0], [121.5, 22.7], [121.9, 24.6], [121.5, 25.3], [120.6, 24.6], [120.1, 23.0]],
  vietnam: [[105.8, 21.6], [106.7, 20.6], [105.9, 19.0], [106.6, 17.4], [108.0, 16.0], [109.0, 14.5], [109.3, 12.6], [109.0, 11.4], [107.8, 10.6], [106.6, 9.6], [105.1, 8.7], [104.8, 10.4]],
  luzon: [[120.6, 18.5], [122.2, 18.4], [122.3, 16.5], [121.6, 15.9], [121.6, 14.3], [124.0, 13.0], [123.0, 12.4], [120.9, 13.8], [120.6, 14.6], [119.8, 16.2], [120.4, 16.6], [120.6, 18.5]],
  palawan: [[117.2, 8.3], [118.2, 8.9], [119.6, 10.5], [119.4, 11.2], [118.5, 10.2], [117.2, 8.3]],
  borneo: [[109.6, 1.8], [110.4, 1.7], [111.5, 2.5], [113.0, 3.2], [114.2, 4.6], [115.4, 5.2], [116.1, 6.2], [117.3, 6.9], [118.0, 6.0], [119.2, 5.3]]
};
function drawPrologueMap(g, W, H, t, side) {
  const lon0 = 104, lon1 = 126, lat0 = 4, lat1 = 26;
  const sc = Math.min(W / (lon1 - lon0), H / (lat1 - lat0)) * 0.92;
  const ox = W / 2 - (lon0 + lon1) / 2 * sc, oy = H / 2 + (lat0 + lat1) / 2 * sc;
  const P = ([lo, la]) => [ox + lo * sc, oy - la * sc];
  g.fillStyle = '#04080c'; g.fillRect(0, 0, W, H);
  // grid
  g.strokeStyle = 'rgba(120,170,200,0.08)'; g.lineWidth = 1;
  for (let lo = 104; lo <= 126; lo += 2) { const [x] = P([lo, 0]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let la = 4; la <= 26; la += 2) { const [, y] = P([0, la]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // coastlines drawn progressively
  const k = clamp(t / 6, 0, 1);
  g.strokeStyle = 'rgba(200,220,232,0.75)'; g.lineWidth = 1.6;
  for (const line of Object.values(MAP)) {
    const n = Math.max(2, Math.floor(line.length * k));
    g.beginPath(); line.slice(0, n).forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  }
  g.font = `600 ${Math.round(sc * 0.7)}px ${SANS}`; g.fillStyle = `rgba(200,220,232,${0.5 * k})`; g.textAlign = 'center';
  { const [x, y] = P([114.5, 14]); g.fillText('南  海', x, y); }
  g.font = `500 ${Math.round(sc * 0.42)}px ${SANS}`;
  for (const [txt, lo, la] of [['海南', 109.6, 19.2], ['吕宋', 121.2, 16.2], ['南沙群岛', 114.2, 9.8], ['西沙群岛', 111.8, 16.6], ['巴士海峡', 121, 20.8]]) { const [x, y] = P([lo, la]); g.fillText(txt, x, y); }
  // the island base
  if (t > 5) { const [x, y] = P([112.89, 9.55]); g.fillStyle = '#ff7a6b'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = `rgba(255,170,160,${0.8 * k})`; g.textAlign = 'left'; g.fillText('永暑礁', x + 7, y + 4); g.textAlign = 'center'; }
  // fleets converge
  const u = clamp((t - 6) / 14, 0, 1);
  const cn = [[111.0, 17.6], [114.2, 15.4]], us = [[123.5, 19.6], [117.4, 15.6]];
  const fleet = (path, col, label) => {
    const a = P(path[0]), b = P(path[1]);
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    g.strokeStyle = col; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 7 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); g.fill();
    g.font = `700 ${Math.round(sc * 0.42)}px ${SANS}`; g.textAlign = 'left'; g.fillText(label, x + 12, y - 8);
  };
  if (t > 6) { fleet(cn, '#ff7a6b', '福建舰 · 山东舰编队'); fleet(us, '#7fb7ff', '福特号 · 里根号打击群'); }
  // DF-26 reach from the mainland, B-1B from Guam (off the map to the east)
  if (t > 12) {
    const r = clamp((t - 12) / 3, 0, 1); const [x, y] = P([108.5, 23.5]);
    g.strokeStyle = `rgba(255,122,107,${0.5 * r})`; g.lineWidth = 1.2; g.setLineDash([3, 5]);
    g.beginPath(); g.arc(x, y, sc * 18 * r, -0.2, 1.4); g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(255,122,107,${0.8 * r})`; g.font = `600 ${Math.round(sc * 0.38)}px ${SANS}`; g.fillText('火箭军 · 东风-21D / 26 射程', x + sc * 6, y + sc * 8.5);
  }
  if (t > 14) {
    const r = clamp((t - 14) / 3, 0, 1), [x0, y0] = P([126, 13.5]), [x1, y1] = P([120.5, 14.5]);
    g.strokeStyle = `rgba(127,183,255,${0.6 * r})`; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * r, y0 + (y1 - y0) * r); g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(127,183,255,${0.8 * r})`; g.textAlign = 'right'; g.fillText('B-1B · 关岛', x0 - 6, y0 - 8);
  }
  // vignette
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
// runs the prologue; calls done() when it ends or is skipped
function runPrologue(done) {
  const el = $('cine'), cv = $('cine-map'), tx = $('cine-text');
  el.hidden = false; $('cine-skip').hidden = false;
  game.mode = 'cine';
  Sound.init(); Music.prologue();
  const lines = CAMPAIGN.prologue.common.concat(CAMPAIGN.prologue[game.side]);
  let t = 0, last = performance.now(), li = -1, raf = 0, ended = false;
  const T_MAP = 20, T_LINE = 4.2, total = T_MAP + 22;
  const own = ships.find(s => s.side === game.side && s.carrier), foeC = ships.find(s => s.side !== game.side && s.carrier);
  const esc = ships.find(s => s.side === game.side && !s.carrier && !s.S.sub);
  // the flyover runs on the 3D view behind the map once the map has faded
  const shots = [own && shot.orbit(own, 700, 120, 0.05, 7), esc && shot.low(esc, 6), foeC && shot.orbit(foeC, 900, 200, -0.04, 7), own && shot.orbit(own, 260, 40, 0.09, 6)].filter(Boolean);
  const finish = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); el.hidden = true; cineStop(true); done(); };
  $('cine-skip').onclick = finish;
  const step = () => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.5); last = now; t += dt;
    const dpr = Math.min(devicePixelRatio, 2), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (t < T_MAP) { cv.style.opacity = String(clamp(t / 1.2, 0, 1) * clamp((T_MAP - t) / 1.5, 0, 1)); drawPrologueMap(g, W, H, t, game.side); }
    else { cv.style.opacity = '0'; if (!game.cine && shots.length) { const loop = () => { if (!ended) cinePlay(shots.slice(), loop); }; loop(); } }
    const nl = Math.min(lines.length - 1, Math.floor(t / T_LINE));
    if (nl !== li) {
      li = nl; const [txt, kind] = lines[li];
      tx.className = kind; tx.textContent = txt;
      tx.style.animation = 'none'; void tx.offsetWidth; tx.style.animation = '';
    }
    if (t > total) { finish(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
// the epilogue: the closing words over the last shot
function runEpilogue(win, done) {
  const el = $('cine'), tx = $('cine-text');
  el.hidden = false; $('cine-map').style.opacity = '0'; $('cine-skip').hidden = false;
  Music.end(win);
  const lines = CAMPAIGN.end[game.result && game.result.tier === 'draw' ? 'draw' : win ? 'win' : 'lose'][game.side];
  let i = 0, timer = 0, ended = false;
  const finish = () => { if (ended) return; ended = true; clearInterval(timer); el.hidden = true; done(); };
  $('cine-skip').onclick = finish;
  const showLine = () => { if (i >= lines.length) { finish(); return; } tx.className = i === lines.length - 1 ? 'big' : ''; tx.textContent = lines[i++]; tx.style.animation = 'none'; void tx.offsetWidth; tx.style.animation = ''; };
  showLine(); timer = setInterval(showLine, 4200);
}
