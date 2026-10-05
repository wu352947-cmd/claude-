/* ---------- campaign: 太平洋血泪 · 龙与鹰 · 南海大会战 ----------
   Inlined into navwar.js (shares its scope).
   The story is told at the scale of the battle, not of a task list: five acts that open when the whole theatre
   reaches them (the hunt, the battle for the sky, the missile storm, the twilight of the carriers, the last
   battle), each told from the player's side, with the history that weighs on it.
   - Prologue: a classified terminal, a century of naval battles, the strategic map, an in-engine flyover of both
     fleets under film grain, and the title.
   - Acts: a letterboxed act card (and, for the commander and the spectator, a cut to the moment that opened it).
   - Finale: the last shot of the battle, the verdict stamped, the battle's chronicle, the tally and the dead,
     then the after-action report. */

const CAMPAIGN = {
  title: '太平洋血泪', sub: '龙与鹰',
  terminal: {
    cn: ['绝密 · 南部战区联合作战指挥中心', '2031 年 10 月 17 日 04:12（北京时间）', '态势：美军双航母打击群越过巴士海峡，向南沙方向高速机动', '命令：航母编队即刻出航，岛礁机场一级战备，火箭军进入发射阵地'],
    us: ['TOP SECRET · 美国印太司令部 / 第七舰队', '2031 年 10 月 16 日 20:12（祖鲁时间）', '态势：解放军双航母编队驶出三亚，永暑礁机场进入一级战备', '命令：第 5、第 12 航母打击群前出南海，关岛轰炸机联队待命']
  },
  history: [
    ['1894 · 黄海', '铁甲舰的炮火映红了海面。一个古老的国家，在这片海上第一次读懂了「制海权」三个字的分量。'],
    ['1942 · 中途岛', '五分钟，三艘航母燃起大火。从那一天起，海战的胜负由天空决定。'],
    ['1944 · 莱特湾', '人类史上规模最大的海战。此后八十七年，再没有两支航母舰队正面交锋。'],
    ['2031 · 南海', '直到今天。']
  ],
  prologue: {
    common: [
      ['七十二小时的对峙，在一架侦察机坠海的那一刻结束。', ''],
      ['没有人能说清，是谁先按下了发射键。', ''],
      ['两个核大国都在克制——战火被约束在南海，约束在常规武器之内。', ''],
      ['但在这片海上，这将是一场倾尽全力的大会战。', 'big']
    ],
    cn: [['龙 · 中国人民解放军海军', 'side'], ['福建舰、山东舰，十艘驱护舰，两艘攻击核潜艇；永暑礁上的歼-16 与轰-6K；大陆深处，火箭军的东风已经竖起。', ''], ['甲午之后一百三十七年，中国海军第一次以全部力量，迎战世界上最强大的海军。', ''], ['命令只有一句：夺取制海权。', 'big']],
    us: [['鹰 · 美国海军第七舰队', 'side'], ['福特号、里根号两个航母打击群，八艘宙斯盾舰，两艘弗吉尼亚级潜艇；关岛的 B-1B 已经挂上了 LRASM。', ''], ['中途岛之后，美国海军从未在大洋上输掉过一场舰队决战。', ''], ['命令只有一句：守住航道，击溃对手。', 'big']]
  },
  // the acts of the battle; each opens when the whole theatre reaches it
  acts: [
    { num: '第一幕', title: '暗战', sub: '千里海疆上，两支舰队彼此寻找', stakes: '先敌发现，先敌开火',
      cn: '雷达关机，舰队在夜色里向东潜行。卫星每一次过顶，都是一次生死的掷骰。谁先看见对方，谁就握住了第一刀。',
      us: '打击群熄灭了所有辐射源。E-2D 在高空凝视西方，侦察卫星划过南海——在这片海上，被看见就意味着被击中。' },
    { num: '第二幕', title: '天穹之争', sub: '数百架战机在南海上空交锋', stakes: '夺取制空权',
      cn: '歼-35 掠过云层，霹雳-15 拖着白烟扑向远方。这是一场看不见对手的空战——先打掉对方的眼睛，再折断它的翅膀。',
      us: 'F-35C 在敌方雷达的盲区里滑行，AIM-120D 一枚接一枚离架。制空权不是赢来的，是用飞行员的命换来的。',
      open: () => !!(foeCarrierFix('cn') || foeCarrierFix('us')) },
    { num: '第三幕', title: '怒海狂潮', sub: '导弹的潮水扑向舰队', stakes: '突破对方的防空网',
      cn: '数十个垂发单元同时掀开盖板。鹰击-18 贴着浪尖飞行，鹰击-21 从大气层边缘俯冲而下——这是饱和打击，是对宙斯盾的终极考验。',
      us: '「吸血鬼！吸血鬼！」作战情报中心的屏幕被来袭目标填满。标准-6 一次次冲天而起，另一边，LRASM 正贴着海面无声逼近。',
      open: () => game.ledger.air.cn + game.ledger.air.us >= 14 || dbg.hitBy.cn + dbg.hitBy.us >= 4 },
    { num: '第四幕', title: '巨舰的黄昏', sub: '钢铁巨兽在燃烧', stakes: '击沉敌方航母，保住自己的航母',
      cn: '1944 年莱特湾之后，人类再没见过航母之间的决斗。今天，海面上燃烧的不只是钢铁，还有一个时代的傲慢。',
      us: '莱特湾之后八十七年，航母第一次在舰队决战中流血。损管队在火海里奔跑——每一分钟，都有人再也走不出那些舱室。',
      open: () => game.ledger.sunk.cn.length + game.ledger.sunk.us.length > 0 || ships.some(s => s.carrier && s.alive && s.hp < s.maxHp * 0.6) },
    { num: '第五幕', title: '最后的决战', sub: '残存的力量全部压上', stakes: '摧毁敌方战争潜力',
      cn: '弹药告急，甲板上的飞机越来越少。参谋们不再说话，所有人都在等最后一道命令。为了那些没能回家的人——打完这一仗。',
      us: '垂发单元见了底，飞行员一天出击了四次。没有援兵，没有退路。为了那些没能回家的人——打完这一仗。',
      open: () => ['cn', 'us'].some(x => potential(x) / potential0[x] < 0.62) }
  ],
  finale: {
    win: {
      cn: ['硝烟散去时，南海的海面上已没有美国航母的踪影。', '这是中国海军一百三十七年来第一场舰队决战的胜利——它属于每一个在甲板上、在发射舱里、在深海中坚守到最后的人。', '历史会记住这一天。而每一个胜利者都知道：长眠海底的，同样是有名有姓的人。'],
      us: ['硝烟散去时，解放军的双航母编队已退出南海。', '中途岛之后又一场舰队决战，美国海军守住了它的大洋——代价是许多再也回不了家的水兵。', '历史会记住这一天。而每一个胜利者都知道：长眠海底的，同样是有名有姓的人。']
    },
    pyrrhic: {
      cn: ['我们赢下了海面，却失去了自己的航母。', '胜利的消息传回大陆的时候，港口里有太多家属等不到归来的舰。', '这是一场惨胜。历史会记住它的荣耀，也会记住它的代价。'],
      us: ['我们赢下了海面，却失去了自己的航母。', '胜利的消息传回圣迭戈的时候，码头上有太多家属等不到归来的舰。', '这是一场惨胜。历史会记住它的荣耀，也会记住它的代价。']
    },
    draw: {
      cn: ['两支舰队都已流尽了血，谁也没能把对方赶出南海。', '外交官们走进了谈判室，他们手中的每一张牌，都是用舰队换来的。', '太平洋记住了这一天的血与泪。'],
      us: ['两支舰队都已流尽了血，谁也没能把对方赶出南海。', '外交官们走进了谈判室，他们手中的每一张牌，都是用舰队换来的。', '太平洋记住了这一天的血与泪。']
    },
    lose: {
      cn: ['我们的舰队打光了最后一枚导弹。', '残存的舰艇借着夜色撤向西方。甲午的海水再一次漫过记忆——但这一次，没有一个人退缩。', '失败会被复盘、被铭记，被一代人反复咀嚼。总有一天，他们会回来。'],
      us: ['打击群打光了最后一枚标准-6。', '残存的舰艇向东撤出南海。自中途岛以来，美国海军第一次在舰队决战中失去了海洋。', '失败会被复盘、被铭记。太平洋的秩序，从这一天起被改写。']
    }
  },
  grades: { S: '传奇统帅', A: '海上名将', B: '沉稳的指挥官', C: '苦战余生', D: '败军之将' }
};
// film grain for the cinematics: a tile of noise
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  try { $('cine').style.setProperty('--grain', `url(${c.toDataURL()})`); } catch (_) { /* no grain */ }
}
// crews, for the memorial (approximate complements; aircraft crew per airframe)
const CREW = { fujian: 3000, shandong: 2000, t055: 310, t052d: 280, t054a: 165, t093b: 110, ford: 4550, reagan: 5000, tico: 330, burke: 320, virginia: 135 };
const AC_CREW = { j15: 1, j35: 1, kj600: 5, j16: 2, j15d: 2, h6k: 4, fa18: 1, f35c: 1, ea18g: 2, e2d: 5, b1b: 4 };

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
  // the title: a hit on the drums and brass with a choir swell
  titleHit() {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    this.drum(0, 0.9, 45); this.drum(0.02, 0.6, 70); this.drum(0.6, 0.5, 50); this.drum(1.2, 0.7, 45);
    this.horn([110, 164.8, 220, 277.2, 329.6], 7, 0.08, 0.05);
    this.choir([220, 277.2, 329.6, 440], 9, 0.06, 0.2);
    this.strings([55, 82.4, 110, 164.8], 10, 0.09, 0);
  },
  // act cues: each act a little darker or more driven than the last
  act(i) {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    const roots = [[55, 82.4, 110], [61.7, 92.5, 123.5], [49, 73.4, 98], [43.7, 65.4, 87.3], [55, 82.4, 110, 130.8]][i] || [55, 82.4, 110];
    this.strings(roots, 9, 0.08, 0);
    this.choir(roots.map(f => f * 4), 8, 0.04, 0.6);
    for (let k = 0; k < 4 + i * 2; k++) this.drum(k * (i >= 2 ? 0.45 : 0.7), k % 4 === 0 ? 0.55 : 0.32, i >= 3 ? 48 : 58);
    this.horn(roots.map(f => f * 2), 5, 0.06, 0.3);
  },
  // the finale: a long rise for a victory, a lament for a defeat
  finale(tier) {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    const win = tier === 'decisive' || tier === 'win';
    if (win) {
      this.strings([110, 164.8, 220, 277.2], 16, 0.09); this.choir([220, 277.2, 329.6, 440], 16, 0.06, 2); this.horn([220, 277.2, 329.6, 440], 10, 0.06, 5);
      for (let i = 0; i < 12; i++) this.drum(5 + i * 0.6, i % 4 === 0 ? 0.6 : 0.3, 50);
    } else if (tier === 'draw' || tier === 'pyrrhic') {
      this.strings([73.4, 110, 146.8, 174.6], 16, 0.08); this.choir([293.7, 349.2, 440], 15, 0.05, 2);
      for (let i = 0; i < 6; i++) this.drum(4 + i * 1.6, 0.35, 48);
    } else {
      this.strings([55, 65.4, 82.4, 110], 18, 0.09); this.choir([220, 261.6, 329.6], 16, 0.05, 3);
      for (let i = 0; i < 5; i++) this.drum(2 + i * 2.4, 0.4, 42);
    }
  },
  end(win) {
    if (!settings.sound) return;
    this.init(); if (!this.bus) return;
    if (win) { this.strings([110, 164.8, 220, 277.2], 12, 0.08); this.choir([220, 277.2, 329.6, 440], 12, 0.05, 1); this.horn([220, 277.2, 329.6], 7, 0.05, 3); }
    else { this.strings([55, 82.4, 110, 130.8], 14, 0.08); this.choir([220, 261.6, 329.6], 13, 0.045, 1); }
    for (let i = 0; i < 4; i++) this.drum(i * 2.2, 0.3, 50);
  }
};

/* ---------- the battle in acts ---------- */
function campaignStart() {
  game.camp = { i: 0, t: 0, done: [], last: -99 };
  game.flags.sunkUS = game.flags.sunkCN = game.flags.sunkUSCV = game.flags.sunkCNCV = 0;
  game.chron = game.chron || [];
  actCard(0);
}
// the battle's chronicle, for the finale
function chron(text, side = null, big = false) {
  if (!game.chron) game.chron = [];
  game.chron.push({ t: game.t, text, side, big });
  if (game.chron.length > 80) game.chron.splice(1, 1);
}
function actCard(i) {
  const A = CAMPAIGN.acts[i], side = game.side;
  game.chapter = i + 1;
  chron(`${A.num} · ${A.title}`, null, true);
  const el = $('act');
  el.innerHTML = `<div class="abar"></div><div class="abody"><em>${A.num}</em><h2>${A.title}</h2><p class="asub">${A.sub}</p><p class="atext">${A[side] || A.cn}</p></div><div class="abar b"></div>`;
  el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(game.actTimer); game.actTimer = setTimeout(() => { el.hidden = true; }, 9000);
  radio(side === 'cn' ? '战区指挥部' : '第七舰队', `${A.num} · ${A.title}——${A.sub}。`, '#ffd28a');
  Music.act(i);
  // the commander and the spectator see the moment that opened the act
  if (i > 0) cineOn('act', actSubject(i));
}
function actSubject(i) {
  if (i === 1) return planes.find(p => p.alive && p.airborne && p.pilot && ['bvr', 'pursuit', 'guns', 'vector'].includes(p.pilot.mode)) || planes.find(p => p.alive && p.airborne && p.T.aew);
  if (i === 2) return missiles.find(m => m.alive && m.cls === 'ashm' && m.target) || ships.find(s => s.alive && s.fires > 0.5);
  if (i === 3) return ships.find(s => s.dying) || ships.filter(s => s.carrier && s.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  return ships.find(s => s.side === game.side && s.carrier && s.alive) || ships.find(s => s.alive);
}
function updateCampaign(dt) {
  const K = game.camp; if (!K) return;
  K.t += dt;
  const next = CAMPAIGN.acts[K.i + 1];
  // one act at a time, and never two cards within 45 s
  if (next && K.t > 45 && next.open()) { K.done.push(K.i); K.i++; K.t = 0; actCard(K.i); }
}
// sinkings feed the story
function campaignSunk(unit) {
  const f = game.flags;
  if (unit.side === 'us') { f.sunkUS = (f.sunkUS || 0) + 1; if (unit.carrier) f.sunkUSCV = (f.sunkUSCV || 0) + 1; }
  if (unit.side === 'cn') { f.sunkCN = (f.sunkCN || 0) + 1; if (unit.carrier) f.sunkCNCV = (f.sunkCNCV || 0) + 1; }
  chron(unit.kind === 'base' ? `${unit.name}被摧毁` : `${unit.name}${unit.carrier ? '（航母）' : ''}沉没`, unit.side, !!unit.carrier || unit.kind === 'base');
  if (unit.carrier) cineOn('carrier', unit);
}
// the objectives corner: the act, what is at stake, and the state of the battle in three words
function drawObjectives() {
  const K = game.camp; if (!K || game.mode !== 'play' || game.cine) return;
  const A = CAMPAIGN.acts[K.i]; if (!A) return;
  const compact = HH < 480, me = game.side, fo = foe(me);
  const x = scopeBox.r ? scopeBox.x - scopeBox.r - 12 : HW - (compact ? 10 : 16), y = compact ? 44 : 50;
  hc.save();
  hc.textAlign = 'right';
  hc.font = `700 ${compact ? 11 : 12}px ${SANS}`; hc.fillStyle = GOLD; hc.fillText(`${A.num} · ${A.title}`, x, y);
  hc.font = `500 ${compact ? 10 : 11}px ${SANS}`; hc.fillStyle = '#e9f2f7'; hc.fillText(`战役态势 · ${A.stakes}`, x, y + 16);
  const ab = command[me].ab, R = ab ? ab.R : null, pm = potential(me) / potential0[me], pf = potential(fo) / potential0[fo];
  const air = R == null ? '未明' : R > 1.8 ? '我优' : R < 0.6 ? '敌优' : '争夺';
  const sea = pm - pf > 0.12 ? '我优' : pf - pm > 0.12 ? '敌优' : '争夺';
  hc.font = `500 ${compact ? 9 : 10}px ${SANS}`; hc.fillStyle = 'rgba(207,232,255,0.85)';
  hc.fillText(`制空 ${air} · 制海 ${sea} · 战争潜力 ${Math.round(pm * 100)}% : ${Math.round(pf / 0.05) * 5}%`, x, y + 31);
  const J = command[me], P = planOf(me);
  if (J.ph && P && game.role !== 'cmd') { hc.fillStyle = 'rgba(255,210,138,0.85)'; hc.fillText(`战区 · 第 ${J.ph.i + 1}/${P.phases.length} 阶段 ${PHASES[J.ph.id].name} · ${J.ph.label}`, x, y + 45); }
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
  // a camera path in a ship's frame (it sails with the ship): points [ahead, up, starboard], looking at a point
  // in the same frame; Catmull-Rom through the points, eased
  path(u, pts, look, dur, sub, fv = 40) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(...p)));
    return { dur, sub, fn: (t) => { const k = smooth(0, dur, t), q = curve.getPoint(k); toWorld(u, q.x, q.y, q.z, camPos); camera.position.copy(camPos); camera.up.copy(Y_AXIS); toWorld(u, look[0], look[1], look[2], _d); camera.lookAt(_d); fov = fv; } };
  },
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
  } else if (kind === 'act' && obj) {
    if (obj.kind === 'msl') cinePlay([shot.chase(obj, 4.5, '')]);
    else if (obj.kind === 'plane') cinePlay([shot.orbit(obj, 90, 18, 0.25, 4.5, '')]);
    else cinePlay([shot.orbit(obj, (obj.S ? obj.S.L : 300) * 1.6, 70, 0.05, 5, '')]);
  } else if (kind === 'carrier' && obj) {
    cinePlay([shot.orbit(obj, obj.S.L * 1.5, 60, 0.05, 6, `${obj.name} 正在下沉`)]);
  }
}

/* ---------- the strategic map of the prologue ---------- */
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
  // a radar sweep from the island base
  { const [x, y] = P([112.89, 9.55]), a = t * 1.4, R = sc * 9;
    const sw = g.createRadialGradient(x, y, 0, x, y, R); sw.addColorStop(0, 'rgba(141,255,180,0.0)'); sw.addColorStop(1, 'rgba(141,255,180,0.10)');
    g.fillStyle = sw; g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, a - 0.6, a); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(141,255,180,0.08)'; for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(x, y, R * r, 0, Math.PI * 2); g.stroke(); } }
  // coastlines drawn progressively, with a glow
  const k = clamp(t / 6, 0, 1);
  g.shadowColor = 'rgba(150,200,230,0.8)'; g.shadowBlur = 6;
  g.strokeStyle = 'rgba(200,220,232,0.75)'; g.lineWidth = 1.6;
  for (const line of Object.values(MAP)) {
    const n = Math.max(2, Math.floor(line.length * k));
    g.beginPath(); line.slice(0, n).forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  }
  g.shadowBlur = 0;
  // the first island chain
  if (t > 3) {
    const r = clamp((t - 3) / 3, 0, 1), chain = [[129, 30], [124.5, 25.2], [121.9, 24.6], [121.2, 18.6], [120.2, 14.5], [119.4, 11.2], [117.2, 8.3], [116, 5.5]];
    g.strokeStyle = `rgba(255,200,120,${0.45 * r})`; g.lineWidth = 1.4; g.setLineDash([8, 6]);
    g.beginPath(); chain.slice(0, Math.max(2, Math.ceil(chain.length * r))).forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    const [lx, ly] = P([122.6, 21.4]); g.fillStyle = `rgba(255,200,120,${0.7 * r})`; g.font = `600 ${Math.round(sc * 0.36)}px ${SANS}`; g.textAlign = 'left'; g.fillText('第一岛链', lx, ly);
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
/* ---------- prologue ---------- */
// a sequence of timed beats on the cinematic overlay; tap "跳过" ends it
function runPrologue(done) {
  const el = $('cine'), cv = $('cine-map'), tx = $('cine-text'), ty = $('cine-type'), ti = $('cine-title');
  el.hidden = false; el.classList.add('film'); $('cine-skip').hidden = false;
  game.mode = 'cine';
  Sound.init(); Music.prologue();
  const side = game.side, term = CAMPAIGN.terminal[side], hist = CAMPAIGN.history;
  const lines = CAMPAIGN.prologue.common, sideLines = CAMPAIGN.prologue[side];
  const own = ships.find(s => s.side === side && s.carrier), foeC = ships.find(s => s.side !== side && s.carrier);
  const esc = ships.find(s => s.side === side && !s.carrier && !s.S.sub && s.S.L > 150);
  const L = own ? own.S.L : 300;
  // the flyover: over the waves onto the carrier, a crane up over the formation, along an escort, across to the
  // enemy on the horizon, and the hero shot from the bow
  const shots = [
    own && shot.path(own, [[L * 5, 5, L * 1.2], [L * 2.6, 9, L * 0.6], [L * 0.9, 22, L * 0.28]], [0, 20, 0], 7, '', 38),
    own && shot.path(own, [[-L * 0.6, 30, -L * 0.7], [-L * 2, 260, -L * 2.2], [-L * 3.4, 900, -L * 3]], [L * 3, 0, L], 7, '', 46),
    esc && shot.path(esc, [[esc.S.L * 0.5, 9, esc.S.L * 0.55], [-esc.S.L * 0.3, 12, esc.S.L * 0.6]], [esc.S.L * 0.2, 14, 0], 5.5, '', 40),
    foeC && shot.orbit(foeC, 1300, 260, -0.03, 6, ''),
    own && shot.path(own, [[L * 0.95, 6, L * 0.16], [L * 0.62, 12, L * 0.1]], [0, 34, 0], 6, '', 42)
  ].filter(Boolean);
  // beats: [start, kind, payload]
  const beats = [];
  let t0 = 0.6;
  term.forEach((l, i) => beats.push([t0 + i * 1.5, 'type', l]));
  t0 += term.length * 1.5 + 1.8;
  beats.push([t0, 'clear']);
  hist.forEach(([h, txt], i) => beats.push([t0 + 0.4 + i * 3.6, 'hist', [h, txt, i === hist.length - 1]]));
  t0 += 0.4 + hist.length * 3.6 + 0.4;
  const T_MAP = t0;
  beats.push([T_MAP, 'map']);
  lines.forEach((l, i) => beats.push([T_MAP + 1 + i * 4, 'line', l]));
  const T_3D = T_MAP + 1 + lines.length * 4 + 1;
  beats.push([T_3D, '3d']);
  sideLines.forEach((l, i) => beats.push([T_3D + 0.8 + i * 5, 'line', l]));
  const T_TITLE = T_3D + 0.8 + sideLines.length * 5 + 0.5;
  beats.push([T_TITLE, 'title']);
  const total = T_TITLE + 6.5;
  let t = 0, last = performance.now(), bi = 0, raf = 0, ended = false, mapOn = false;
  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    el.hidden = true; el.classList.remove('film'); ty.innerHTML = ''; ti.hidden = true; ti.className = ''; tx.textContent = '';
    cineStop(true); done();
  };
  $('cine-skip').onclick = finish;
  const showLine = ([txt, kind]) => { tx.className = kind; tx.textContent = txt; tx.style.animation = 'none'; void tx.offsetWidth; tx.style.animation = ''; };
  const step = () => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.5); last = now; t += dt;
    while (bi < beats.length && t >= beats[bi][0]) {
      const [, kind, p] = beats[bi++];
      if (kind === 'type') { const d = document.createElement('div'); d.className = 'tl'; ty.appendChild(d); typeOut(d, p); }
      else if (kind === 'clear') ty.classList.add('out');
      else if (kind === 'hist') {
        ty.innerHTML = ''; ty.classList.remove('out');
        tx.className = p[2] ? 'year' : 'hist'; tx.innerHTML = `<b>${p[0]}</b><span>${p[1]}</span>`;
        tx.style.animation = 'none'; void tx.offsetWidth; tx.style.animation = '';
        Music.drum(0, p[2] ? 0.7 : 0.35, p[2] ? 45 : 60);
      }
      else if (kind === 'map') { mapOn = true; tx.textContent = ''; }
      else if (kind === 'line') showLine(p);
      else if (kind === '3d') { mapOn = false; cv.style.opacity = '0'; if (!game.cine && shots.length) { const loop = () => { if (!ended) cinePlay(shots.slice(), loop); }; loop(); } }
      else if (kind === 'title') {
        tx.textContent = '';
        ti.innerHTML = `<h1>${CAMPAIGN.title}</h1><p class="tl2">龙 <span>与</span> 鹰</p><p class="tl3">南 海 大 会 战</p>`;
        ti.hidden = false; ti.className = ''; void ti.offsetWidth; ti.className = 'go';
        Music.titleHit(); game.flash = 0.35;
      }
    }
    const dpr = Math.min(devicePixelRatio, 2), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (t < T_MAP) { cv.style.opacity = '1'; const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#020406'; g.fillRect(0, 0, cv.width || 1, cv.height || 1); }
    if (mapOn) {
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mt = t - T_MAP;
      cv.style.opacity = String(clamp(mt / 1.2, 0, 1) * clamp((T_3D - t) / 1.2, 0, 1));
      drawPrologueMap(g, W, H, mt * 1.15, side);
    }
    if (t > total) { finish(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
// a classified-terminal line typed out with key clicks
function typeOut(el, text) {
  let i = 0;
  const tick = () => {
    if (!el.isConnected) return;
    el.textContent = text.slice(0, ++i) + (i < text.length ? '▌' : '');
    if (i % 2 === 0) Sound.beep(1800 + Math.random() * 600, 0.012, 0.015);
    if (i < text.length) setTimeout(tick, 28);
  };
  tick();
}

/* ---------- finale ---------- */
// the last shot, the verdict stamped, the chronicle and the dead, then the after-action report
function battleCasualties(side) {
  let n = 0;
  const L = game.ledger;
  // ships: a third of the crew of a ship that went down, a share of the crew of a damaged one
  for (const name of L.sunk[side]) { const u = FLEET[side].units.find(x => x[1] === name); n += u ? (CREW[u[0]] || 300) * 0.36 : name === BASE.name ? 260 : 0; }
  for (const s of ships) if (s.side === side && s.alive && !s.dying) n += (CREW[s.S.cls] || 300) * (1 - s.hp / s.maxHp) * 0.1;
  for (const b of bases) if (b.side === side && b.alive) n += 400 * (1 - b.hp / b.maxHp) * 0.15;
  n += (L.crew ? L.crew[side] : 0);
  return Math.round(n);
}
// the losses set against the great carrier battles: how bad was it, really
function historyCompare(me, them) {
  const L = game.ledger, n = side => FLEET[side].units.filter(([, name]) => L.sunk[side].includes(name)).length, N = side => FLEET[side].units.length;
  const cv = side => FLEET[side].units.filter(([c, name]) => CLS[c].carrier && L.sunk[side].includes(name)).length;
  const pct = side => Math.round(n(side) / N(side) * 100);
  return `${SIDES[me].short}沉没 ${n(me)}/${N(me)} 艘（${pct(me)}%，航母 ${cv(me)}）· ${SIDES[them].short}沉没 ${n(them)}/${N(them)} 艘（${pct(them)}%，航母 ${cv(them)}）——对照：中途岛日军四艘航母全部沉没，美军损失一艘；莱特湾日军损失约 29 艘军舰、约占参战兵力四成，此后再未能组织舰队决战。`;
}
function runFinale(win, done) {
  const R = game.result || { tier: win ? 'win' : 'lose', why: '' }, T = RESULT_TIERS[R.tier], me = game.side, them = foe(me), L = game.ledger;
  const el = $('finale'), cine = settings.cine;
  game.mode = 'cine';
  // the battle is over: every console and open question goes away
  if (TM.open) toggleMap();
  for (const id of ['touch', 'topbar', 'props', 'dp', 'jcc', 'act', 'spec']) $(id).hidden = true;
  dpQueue.length = 0; JC.open = false;
  for (const k of ['cn', 'us']) command[k].props = [];
  Music.finale(R.tier);
  const key = R.tier === 'decisive' || R.tier === 'win' ? 'win' : R.tier === 'pyrrhic' ? 'pyrrhic' : R.tier === 'draw' ? 'draw' : 'lose';
  const words = CAMPAIGN.finale[key][me];
  // the last shot: our flagship if she still floats, else the wreck, then high over the battle
  const own = ships.find(s => s.side === me && s.carrier && s.alive && !s.dying) || ships.find(s => s.side === me && s.alive && !s.dying);
  const wreck = ships.find(s => s.dying) || ships.find(s => s.alive);
  const shots = [own && shot.orbit(own, own.S.L * 2.2, 90, 0.035, 9, ''), wreck && wreck !== own && shot.orbit(wreck, wreck.S.L * 1.8, 50, -0.05, 7, '')].filter(Boolean);
  if (cine && shots.length) cinePlay(shots.concat(shots));
  const casMe = battleCasualties(me), casThem = battleCasualties(them);
  const evs = (game.chron || []).slice(-22);
  el.innerHTML = `<div class="fwords"></div>
    <div class="fstamp"><em>南海大会战 · ${Math.floor(game.t / 60)} 分钟</em><h1 style="--c:${T.color}">${T.name}</h1><p>${R.why || ''}</p><p class="hist">${historyCompare(me, them)}</p></div>
    <div class="fbody">
      <section class="fchron"><h3>战史</h3><ol>${evs.map(e => `<li class="${e.big ? 'big' : ''}${e.side ? ' s-' + (e.side === me ? 'me' : 'them') : ''}"><em>${String(Math.floor(e.t / 60)).padStart(2, '0')}:${String(Math.floor(e.t % 60)).padStart(2, '0')}</em>${e.text}</li>`).join('')}</ol></section>
      <section class="ftally"><h3>代价</h3>
        <div class="trow"><i></i><b>${SIDES[me].short}</b><b>${SIDES[them].short}</b></div>
        <div class="trow"><i>损失舰艇</i><b data-n="${L.sunk[me].length}">0</b><b data-n="${L.sunk[them].length}">0</b></div>
        <div class="trow"><i>损失飞机</i><b data-n="${L.air[me]}">0</b><b data-n="${L.air[them]}">0</b></div>
        <div class="trow"><i>反舰导弹命中</i><b data-n="${dbg.hitBy[me] || 0}">0</b><b data-n="${dbg.hitBy[them] || 0}">0</b></div>
        <div class="trow"><i>剩余战争潜力</i><b data-n="${Math.round((R.pm || 0) * 100)}" data-s="%">0</b><b data-n="${Math.round((R.pt || 0) * 100)}" data-s="%">0</b></div>
        <div class="trow cas"><i>伤亡（估计）</i><b data-n="${casMe}">0</b><b data-n="${casThem}">0</b></div>
        <p class="mem">谨以此战，纪念在这片海上消逝的约 ${(casMe + casThem).toLocaleString('zh-CN')} 名官兵。</p>
        <button type="button" class="btn primary" id="f-next">战役总结</button>
      </section>
    </div>`;
  el.hidden = false; el.className = cine ? '' : 'nocine';
  let ended = false;
  const timers = [];
  const at = (s, fn) => timers.push(setTimeout(fn, s * 1000));
  const finish = () => { if (ended) return; ended = true; timers.forEach(clearTimeout); el.hidden = true; el.className = ''; cineStop(true); done(); };
  $('f-next').onclick = finish;
  // the words over the picture
  const fw = el.querySelector('.fwords');
  const t0 = cine ? 0 : -9;
  words.forEach((w, i) => at(t0 + 0.6 + i * 3.4, () => { fw.textContent = w; fw.className = 'fwords on' + (i === words.length - 1 ? ' big' : ''); }));
  at(t0 + 0.6 + words.length * 3.4, () => { fw.className = 'fwords'; });
  // the verdict: stamped
  at(Math.max(0.3, t0 + 1.2 + words.length * 3.4), () => { el.classList.add('stamp'); Music.drum(0, 0.95, 42); Music.drum(0.05, 0.6, 80); game.flash = 0.5; game.shake = 1.2; });
  // the chronicle and the tally
  at(Math.max(1.6, t0 + 3.4 + words.length * 3.4), () => {
    el.classList.add('report');
    el.querySelectorAll('.fchron li').forEach((li, i) => setTimeout(() => li.classList.add('on'), i * 120));
    const t1 = performance.now();
    const cnt = () => { if (ended) return; const k = clamp((performance.now() - t1) / 2600, 0, 1), e = 1 - Math.pow(1 - k, 3);
      el.querySelectorAll('.ftally b[data-n]').forEach(b => { b.textContent = Math.round(+b.dataset.n * e).toLocaleString('zh-CN') + (b.dataset.s || ''); });
      if (k < 1) requestAnimationFrame(cnt); };
    requestAnimationFrame(cnt);
  });
}
