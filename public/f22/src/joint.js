/* ---------- joint command: operational design, phases, staff proposals and the joint operations centre ----------
   Inlined into navwar.js (shares its scope).
   A theatre commander does not fly the jets. Before the battle he fixes the operation: the main and the supporting
   direction, the concept of operations (its phases), the task organisation of the fleet, the apportionment of the
   air effort, the rules of engagement and how much the staff may decide alone. In battle the staff turns that into
   sorties and salvos and brings him the decisions it may not take alone - command by negation: a proposal executes
   when its time runs out unless the commander vetoes it. Each phase ends at a decision point. Both sides run the same
   process; the AI commander approves its own staff. */

const AXES = { N: '北翼', C: '中央', S: '南翼' };
const axisOff = a => a === 'N' ? 1 : a === 'S' ? -1 : 0;
const GROUPS = {
  cv: ['航母核心', '航母与舰载机联队，舰队的中心'],
  train: ['后勤编队', '补给舰跟随航母：补充干扰弹与弹药、维持甲板出动节奏；被击沉后航母周转变慢'],
  sag: ['水面突击群', '突击阶段前出接敌，以舰舰导弹与舰炮打击敌水面舰艇'],
  screen: ['防空掩护群', '环绕航母组成区域防空，拦截来袭导弹与飞机'],
  asw: ['反潜警戒群', '在主攻轴线前方组成反潜屏障，发现潜艇即转入猎杀'],
  reserve: ['预备队', '在航母后方保存战力，由你决定投入时机'],
  fwd: ['前出伏击', '潜艇沿主攻方向前出，伏击敌水面舰艇'],
  esc: ['伴随护航', '潜艇在编队前方警戒，猎杀接近的敌潜艇']
};
const SHIP_GROUPS = ['sag', 'screen', 'asw', 'reserve'], SUB_GROUPS = ['fwd', 'esc'];
// points on the map the commander can put a group on: [command key, button label, who]
const DEPLOY = [['sagPt', '突击群前出到此', '水面突击群'], ['aswPt', '反潜群警戒此处', '反潜警戒群'], ['subPt', '潜艇伏击于此', '前出潜艇'], ['capPt', '巡逻屏障设于此', '战斗机巡逻屏障']];
const AP_KEYS = [['air', '制空'], ['strike', '对海突击'], ['isr', '预警侦察'], ['asw', '反潜'], ['ewt', '电子战 · 加油']];
const ROE = {
  wcs: {
    free: ['武器自由', '参谋部可对射程内任何敌舰发起打击；防空导弹拦截一切敌方空中目标。'],
    tight: ['武器限制', '进攻性火力只打主攻目标，其他目标需你批准；防空导弹只在高命中概率距离开火，节省弹药。'],
    hold: ['武器保持', '所有进攻性火力（齐射、攻击编队、远程火力）逐项请示；防空只打直接威胁本舰的目标。']
  },
  emcon: {
    A: ['A 级 · 全面静默', '全部舰艇雷达关机，只靠预警机与数据链；敌方难以发现我舰队，遭攻击的舰自动开机。'],
    B: ['B 级 · 限制辐射', '航母与预备队静默，掩护群与反潜群雷达工作：敌方先看到的是外围护卫舰。'],
    C: ['C 级 · 不限制', '全部雷达开机，探测与拦截效果最好，但舰队位置暴露。']
  },
  auth: {
    full: ['全权委托', '参谋长全权指挥：实时调整兵力分配、主攻目标、编组与阶段转换，决策点也由他定，只向你报告。你可随时收回。'],
    delegate: ['授权参谋', '日常出动与火力由参谋部自行决断；兵力分配、主攻目标与阶段转换等战役级决定仍请示你。'],
    negation: ['否决式指挥', '参谋部提出建议并倒计时，到时自动执行，除非你否决（美军 CWC 的指挥方式）。'],
    approve: ['逐项审批', '每一项建议都要你批准才执行，过期作废。']
  }
};
// phases: posture on entry (apportionment, EMCON level, tactics), whether the surface action group pushes and the
// alpha strike is released, how long the staff expects it to take, and its measure of progress [0..1, label]
const PHASES = {
  find: { name: '侦察预警', goal: '定位敌航母（识破假目标）', max: 900, ap: { air: 30, strike: 15, isr: 35, asw: 10, ewt: 10 }, emcon: 'A', navy: 'balanced', air: 'sweep', sag: false, alpha: false,
    prog: side => { const f = foeCarrierFix(side); return [f ? 1 : 0, f ? `已定位${f.name}` : '卫星、超视距雷达与预警机搜索中']; } },
  air: { name: '夺取制空', goal: '击落敌机 6 架或击落敌预警机', max: 600, ap: { air: 50, strike: 20, isr: 15, asw: 5, ewt: 10 }, emcon: 'B', navy: 'balanced', air: 'hunt', sag: false, alpha: false,
    prog: (side, C) => { const L = game.ledger, k = L.air[foe(side)] - C.ph.base.air, a = L.aew[side] - C.ph.base.aew; return [Math.max(k / 6, a > 0 ? 1 : 0), `击落敌机 ${k} / 6${a > 0 ? ' · 敌预警机已被击落' : ''}`]; } },
  strike: { name: '主攻突击', goal: '主攻目标完好度降至 40% 以下', max: 720, ap: { air: 25, strike: 50, isr: 10, asw: 5, ewt: 10 }, emcon: 'C', navy: 'focus', air: 'mass', sag: true, alpha: true, prog: strikeProg },
  exploit: { name: '扩张战果', goal: '摧毁敌方战争潜力', max: 1e9, ap: { air: 30, strike: 40, isr: 10, asw: 10, ewt: 10 }, emcon: 'C', navy: 'strike', air: 'balanced', sag: true, alpha: true,
    prog: side => [0, `敌战争潜力 ${Math.round(potential(foe(side)) / potential0[foe(side)] * 100)}%`] },
  hide: { name: '隐蔽待机', goal: '先敌定位敌航母', max: 900, ap: { air: 40, strike: 25, isr: 25, asw: 5, ewt: 5 }, emcon: 'A', navy: 'balanced', air: 'cap', sag: false, alpha: false,
    prog: side => { const f = foeCarrierFix(side); return [f ? 1 : 0, f ? `已定位${f.name} · 立即出击` : '全舰队静默，等待目标出现']; } },
  blow: { name: '雷霆一击', goal: '一次饱和突击重创主攻目标', max: 600, ap: { air: 35, strike: 45, isr: 10, asw: 0, ewt: 10 }, emcon: 'C', navy: 'focus', air: 'mass', sag: true, alpha: true, prog: strikeProg },
  shield: { name: '外层防御', goal: '打掉敌携弹攻击机 4 架，挫败敌方攻势', max: 420, ap: { air: 55, strike: 15, isr: 15, asw: 10, ewt: 5 }, emcon: 'B', navy: 'ring', air: 'cap', sag: false, alpha: false,
    prog: (side, C) => { const a = game.ledger.archers[side] - C.ph.base.archers, q = (game.t - C.ph.t0) / 360; return [Math.max(a / 4, foeCarrierFix(side) ? q : 0), `打掉射手 ${a} / 4 · 坚守 ${Math.floor((game.t - C.ph.t0) / 60)} / 6 分钟`]; } },
  counter: { name: '转入反击', goal: '主攻目标完好度降至 40% 以下', max: 720, ap: { air: 35, strike: 40, isr: 10, asw: 5, ewt: 10 }, emcon: 'C', navy: 'focus', air: 'mass', sag: true, alpha: true, prog: strikeProg },
  lure: { name: '佯动牵制', goal: '诱使敌方打击佯动方向（骗走 4 枚导弹）', max: 480, ap: { air: 30, strike: 30, isr: 20, asw: 10, ewt: 10 }, emcon: 'A', navy: 'balanced', air: 'sweep', sag: true, alpha: false, phantom: true, second: true,
    prog: (side, C) => { const f = game.ledger.fooled[side] - C.ph.base.fooled, q = (game.t - C.ph.t0) / 420; return [Math.max(f / 4, foeCarrierFix(side) ? q : 0), `骗走敌弹 ${f} / 4 · 牵制 ${Math.floor((game.t - C.ph.t0) / 60)} / 7 分钟`]; } }
};
function strikeProg(side, C) {
  if ((game.flags[side === 'cn' ? 'sunkUSCV' : 'sunkCNCV'] || 0) > C.ph.base.cv) return [1, '敌航母已被击沉'];
  const m = intentTarget(side);
  if (!m) return [0, '主攻目标未定'];
  const f = m.hp / m.maxHp;
  return [clamp((1 - f) / 0.6, 0, 1), `${m.name} 完好度 ${hitOnce(side, m) ? `约 ${Math.round(f * 20) * 5}%` : '未打击'}`];
}
const CONCEPTS = {
  decisive: { name: '先夺制空 · 再行突击', phases: ['find', 'air', 'strike', 'exploit'], desc: '标准的海上进攻战役：侦察定位 → 夺取制空权 → 集中突击敌航母 → 扩张战果。稳健，节奏较慢。' },
  ambush: { name: '静默伏击 · 雷霆一击', phases: ['hide', 'blow', 'exploit'], desc: '全程电磁静默隐蔽待机，先敌定位后以全部兵力一次饱和突击。快而险，先敌发现是关键。' },
  defense: { name: '外层防御 · 后发制人', phases: ['shield', 'counter', 'exploit'], desc: '先以战斗机与防空舰消耗来袭机群——打射手而不是箭，待敌攻势受挫再转入反击。稳妥，主动权在敌。' },
  feint: { name: '声东击西 · 侧翼突击', phases: ['lure', 'strike', 'exploit'], desc: '突击群与电子佯动在助攻方向制造主攻假象，诱敌转移火力；主力静默接敌，从主攻方向突然出击。' }
};

/* ---------- small helpers ---------- */
const planOf = side => game.plans && game.plans[side];
const phaseOf = side => { const C = command[side]; return C.ph ? PHASES[C.ph.id] : null; };
const apOf = side => command[side].ap || { air: 30, strike: 35, isr: 15, asw: 10, ewt: 10 };
const roeOf = side => command[side].roe || { wcs: 'free', emcon: 'C' };
const cmdSeat = side => side === game.side && game.role === 'cmd' && game.mode === 'play';
const authOf = () => (command[game.side] || {}).auth || 'negation';
const mmss = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// a real (not phantom) enemy carrier held within the last 90 s
function foeCarrierFix(side) {
  let best = null;
  for (const [e, tr] of picture[side]) if (e.kind === 'ship' && e.carrier && !e.phantom && e.alive && !e.dying && game.t - tr.t < 90 && (!best || e.value > best.value)) best = e;
  return best;
}
const hitOnce = (side, e) => e.hp < e.maxHp * 0.98;
// emission control per ship: EMCON A (the "emcon" tactic) silences everything; B silences the carriers, the
// reserve and the submarines while the screen radiates; a ship under attack always lights up
function shipQuiet(s) {
  if (s.emconBreak > game.t) return false;
  if (tac(s.side).navy === 'emcon') return true;
  return roeOf(s.side).emcon === 'B' && (s.carrier || s.grp === 'reserve');
}
function setEmcon(side, lv, quiet = false) {
  const C = command[side];
  C.roe = C.roe || { wcs: 'free', emcon: 'C' };
  C.roe.emcon = lv;
  if (lv === 'A') { if (tac(side).navy !== 'emcon') { C.preEmcon = tac(side).navy; setTactic('navy', 'emcon', side, quiet); } }
  else if (tac(side).navy === 'emcon' && !C.dodge) setTactic('navy', C.preEmcon && C.preEmcon !== 'emcon' ? C.preEmcon : 'balanced', side, quiet);
}
// the perpendicular to an axis that points north (-z): a flank offset of +1 is the northern flank
function latN(from, to, out) {
  out.set(to.x - from.x, 0, to.z - from.z); const L = out.length() || 1;
  out.set(out.z / L, 0, -out.x / L);
  if (out.z > 0) out.negate();
  return out;
}
// may the staff release this offensive fire on its own? 'go', 'ask' (a proposal to the commander) or 'no'
function release(side, tgt) {
  const w = roeOf(side).wcs;
  if (w === 'free' || (w === 'tight' && tgt === intentTarget(side))) return 'go';
  return side === game.side && game.role === 'cmd' ? 'ask' : side === game.side ? 'go' : 'no';
}
function jlog(side, text, color = '#cfe8ff') { const C = command[side]; (C.jlog = C.jlog || []).unshift({ t: game.t, text, color }); if (C.jlog.length > 40) C.jlog.length = 40; }

/* ---------- the plan ---------- */
// the staff's plan for a side; the recommended one (the player's starting point) or a varied one for the AI
function staffPlan(side, rec) {
  const pickC = rec ? (side === 'cn' ? 'decisive' : 'defense')
    : side === 'cn' ? (Math.random() < 0.45 ? 'decisive' : Math.random() < 0.5 ? 'ambush' : 'feint')
    : (Math.random() < 0.45 ? 'defense' : Math.random() < 0.6 ? 'decisive' : 'feint');
  const main = rec ? 'C' : ['N', 'C', 'C', 'S'][Math.floor(Math.random() * 4)];
  const second = pickC === 'feint' ? (main === 'N' ? 'S' : main === 'S' ? 'N' : (Math.random() < 0.5 ? 'N' : 'S')) : 'none';
  return { concept: pickC, main, second, groups: staffGroups(side, pickC), ap: Object.assign({}, PHASES[CONCEPTS[pickC].phases[0]].ap), reserve: pickC === 'ambush' ? 10 : 20,
    roe: { wcs: rec && side === 'us' ? 'tight' : 'free', emcon: PHASES[CONCEPTS[pickC].phases[0]].emcon }, auth: 'negation' };
}
// task organisation: the hardest-hitting pair forms the surface action group, the best sonar ships the ASW screen,
// one destroyer is held back, the rest guard the carriers; submarines go forward (one stays with the fleet when
// the plan is defensive)
function staffGroups(side, concept) {
  const g = {}, U = FLEET[side].units;
  const pref = side === 'cn' ? { sag: [2, 5], asw: [8, 9], reserve: [7] } : { sag: [2, 8], asw: [9, 4], reserve: [7] };
  U.forEach(([cls], i) => {
    const S = CLS[cls], k = side + i;
    if (S.carrier) g[k] = 'cv';
    else if (S.supply) g[k] = 'train';
    else if (S.sub) g[k] = concept === 'defense' && U.slice(0, i).some(([c]) => CLS[c].sub) ? 'esc' : 'fwd';
    else g[k] = pref.sag.slice(0, concept === 'defense' ? 1 : 2).includes(i) ? 'sag' : pref.asw.includes(i) ? 'asw' : pref.reserve.includes(i) || (concept === 'defense' && i === pref.sag[1]) ? 'reserve' : 'screen';
  });
  return g;
}
function validPlan(P, side) {
  if (!P || !CONCEPTS[P.concept] || !P.ap || !P.roe || !P.groups) return false;
  return FLEET[side].units.every((u, i) => P.groups[side + i]);
}
// battle start: both sides' plans go into force
function initJoint() {
  game.plans = {};
  game.ledger.phases = { cn: [], us: [] };
  game.jstat = { approved: 0, vetoed: 0, auto: 0, dps: 0 };
  dpQueue.length = 0; $('dp').hidden = true;
  for (const side of ['cn', 'us']) {
    const mine = side === game.side && game.role !== 'watch';
    const P = mine && game.role === 'cmd' && validPlan(game.planDraft, side) ? JSON.parse(JSON.stringify(game.planDraft)) : staffPlan(side, mine);
    P.phases = CONCEPTS[P.concept].phases.slice();
    game.plans[side] = P;
    const C = command[side];
    Object.assign(C, { ap: Object.assign({}, P.ap), roe: { wcs: P.roe.wcs, emcon: P.roe.emcon }, auth: P.auth || 'negation', props: [], veto: {}, alerts: [], jlog: [], cc: {}, sagOrder: 'auto', screenK: 1, subOrder: null, resvOut: false, branched: false });
    let ri = 0;
    for (const s of ships) if (s.side === side) { s.grp = P.groups[s.key] || (s.carrier ? 'cv' : s.S.sub ? 'fwd' : 'screen'); if (s.grp === 'reserve') s.resIdx = ri++; }
    // the air reserve: a share of each deck's strike aircraft that only the commander (or an alpha strike) commits
    C.resvN = {};
    for (const h of ships.concat(bases)) if (h.side === side && h.hangar) C.resvN[h.name] = Math.round(['j15', 'j16', 'fa18'].reduce((n, t) => n + (h.hangar[t] || 0), 0) * (P.reserve || 0) / 100);
    enterPhase(side, 0, 'start');
  }
  renderProps();
}
function enterPhase(side, i, why) {
  const C = command[side], P = planOf(side), id = P.phases[i], ph = PHASES[id], L = game.ledger, f = foe(side);
  C.ph = { i, id, t0: game.t, hold: 0, dp: false, prog: 0, label: '', base: { air: L.air[f], aew: L.aew[side], archers: L.archers[side], fooled: L.fooled[side], cv: game.flags[side === 'cn' ? 'sunkUSCV' : 'sunkCNCV'] || 0 } };
  if (why === 'start') setEmcon(side, C.roe.emcon, true);
  else { C.ap = Object.assign({}, ph.ap); setEmcon(side, ph.emcon, true); }
  if (C.roe.emcon !== 'A' && tac(side).navy !== ph.navy) setTactic('navy', ph.navy, side, true);
  setTactic('air', ph.air, side, true);
  C.tacT = 45;
  if (ph.phantom) C.phT = Math.min(C.phT ?? 240, 40);
  if (ph.alpha) C.alphaCd = Math.min(C.alphaCd ?? 420, 30);
  L.phases[side].push({ id, t: game.t });
  if (why !== 'start') chron(`${SIDES[side].short}转入「${ph.name}」`, side);
  const n = P.phases.length, label = `第 ${i + 1} 阶段 / 共 ${n} · ${ph.name}`;
  jlog(side, `${why === 'start' ? '作战开始' : why === 'branch' ? '启动应急预案' : '转入'} · ${label}`, GOLD);
  if (side === game.side && game.role !== 'watch') {
    if (why !== 'start') {
      game.card = { title: label, sub: ph.goal, goal: `${CONCEPTS[P.concept].name} · 兵力分配与战术按阶段预案调整`, t: 5.5, max: 5.5 };
      radio('战区指挥部', `${why === 'branch' ? '启动应急预案，' : ''}全线转入${label}：${ph.goal}。`, GOLD);
      Music.stinger(id === 'strike' || id === 'blow' || id === 'counter');
    } else radio('战区指挥部', `作战决心：${CONCEPTS[P.concept].name}，主攻方向${AXES[P.main]}${P.second !== 'none' ? `，助攻方向${AXES[P.second]}` : ''}。${label}。`, GOLD);
  } else if (why !== 'start' && game.side && game.role !== 'watch' && Math.random() < 0.55) {
    radio('技术侦察', `截获敌指挥网：敌转入「${ph.name}」阶段。`, '#ffd28a');
    alertJ(game.side, 'sig' + id, `PIR-3 敌方作战阶段变化：「${ph.name}」`, 'hi');
  }
}

/* ---------- each staff cycle: phase progress, decision points, CCIR, standing proposals ---------- */
function updateJoint(side, dt) {
  const C = command[side], P = planOf(side);
  if (!P || !C.ph) return;
  staffBrain(side, dt);
  updateUAV(side, dt);
  C.jT = (C.jT || 0) - dt;
  if (C.jT > 0) return;
  C.jT = 2;
  sitrep(side);
  const ph = PHASES[C.ph.id], [p, label] = ph.prog(side, C);
  C.ph.prog = p; C.ph.label = label;
  ccirCheck(side);
  if (C.ph.dp || game.over) return;
  const next = P.phases[C.ph.i + 1];
  const hurt = ships.find(s => s.side === side && s.carrier && s.alive && !s.dying && s.hp < s.maxHp * 0.5);
  if (!C.branched && hurt && C.ph.id !== 'shield' && game.t > C.ph.hold) decisionPoint(side, 'branch', hurt);
  else if (next && p >= 1 && game.t > C.ph.hold) decisionPoint(side, 'done');
  else if (next && game.t - C.ph.t0 > ph.max && game.t > C.ph.hold) decisionPoint(side, 'late');
  standingProposals(side);
}
function decisionPoint(side, kind, hurt) {
  const C = command[side], P = planOf(side), ph = PHASES[C.ph.id], nid = P.phases[C.ph.i + 1], nx = nid && PHASES[nid];
  let dp;
  if (kind === 'branch') dp = {
    title: '决策点 · 航母遭受重创', text: `${hurt.name}完好度跌破 50%。应急预案：转入「外层防御」——舰队收拢环形防空，战斗机全力掩护，暂停进攻约 6 分钟，然后恢复原计划。`,
    opts: [{ label: '启动应急预案', run: () => { C.branched = true; P.phases.splice(C.ph.i + 1, 0, 'shield'); enterPhase(side, C.ph.i + 1, 'branch'); } },
      { label: '坚持原计划', run: () => { C.branched = true; jlog(side, '指挥员决定：航母受创，坚持原计划'); } }],
    def: side === game.side ? 0 : (Math.random() < 0.65 ? 0 : 1)
  };
  else dp = {
    title: kind === 'done' ? `决策点 · 「${ph.name}」目标达成` : `决策点 · 「${ph.name}」已超时`,
    text: kind === 'done' ? `${C.ph.label}。参谋部建议转入第 ${C.ph.i + 2} 阶段「${nx.name}」：${nx.goal}。` : `本阶段已进行 ${Math.floor((game.t - C.ph.t0) / 60)} 分钟仍未达成（${C.ph.label}）。可以转入「${nx.name}」，或延长本阶段 3 分钟。`,
    opts: [{ label: `转入「${nx.name}」`, run: () => enterPhase(side, C.ph.i + 1, kind) },
      { label: '延长本阶段 3 分钟', run: () => { C.ph.hold = game.t + 180; jlog(side, `指挥员决定：「${ph.name}」延长 3 分钟`); } }],
    def: side !== game.side && kind === 'done' && Math.random() < 0.12 ? 1 : 0
  };
  C.ph.dp = true;
  dp.side = side; dp.done = () => { if (C.ph) C.ph.dp = false; };
  decide(dp);
}
// the commander decides at the console; anyone else's staff takes its own recommendation
function decide(dp) {
  if (cmdSeat(dp.side) && authOf() !== 'full') {
    dpQueue.push(dp);
    if (game.scale > 1) { game.scale = 1; game.autoCruise = false; $('b-scale').textContent = '时间 ×1'; }
    Sound.beep(700, 0.12, 0.08); pending.push({ t: game.t + 0.15, fn: () => Sound.beep(940, 0.12, 0.08) });
    showDP();
    return;
  }
  const o = dp.opts[dp.def];
  o.run(); dp.done();
  if (dp.side === game.side && game.role !== 'watch') radio('战区指挥部', `${dp.title.replace('决策点 · ', '')}：参谋部决定${o.label}。`, '#9fd4ff');
}
// CCIR: what the commander must know at once (priority intelligence and friendly force information requirements)
function alertJ(side, key, text, level = 'info') {
  const C = command[side];
  C.cc = C.cc || {};
  if (C.cc['k_' + key] > game.t) return;
  C.cc['k_' + key] = game.t + 120;
  (C.alerts = C.alerts || []).unshift({ t: game.t, text, level });
  if (C.alerts.length > 30) C.alerts.length = 30;
  if (side !== game.side || game.role !== 'cmd') return;
  radio('CCIR', text, level === 'crit' ? '#ff5a4f' : level === 'hi' ? '#ffd28a' : '#9fd4ff');
  if (level === 'crit' && game.scale > 1) { game.scale = 1; game.autoCruise = false; $('b-scale').textContent = '时间 ×1'; message('关键情况 · 恢复实时', text, '#ff5a4f', 2.4); }
}
function ccirCheck(side) {
  if (side !== game.side || game.role === 'watch') return;
  const C = command[side], cc = C.cc = C.cc || {};
  const cv = foeCarrierFix(side);
  if (cv && !cc.cvFix) { cc.cvFix = true; alertJ(side, 'cvfix', `PIR-1 敌航母定位：${cv.name}`, 'hi'); }
  else if (!cv && cc.cvFix && ![...picture[side].keys()].some(e => e.carrier && !e.phantom && e.alive)) { cc.cvFix = false; alertJ(side, 'cvlost', 'PIR-1 敌航母航迹丢失', 'hi'); }
  const centre = fleetCentre(side);
  if (centre) {
    const raid = [...picture[side]].filter(([e, tr]) => e.kind === 'plane' && e.alive && !e.dying && e.ashmN > 0 && game.t - tr.t < 10 && tr.pos.distanceTo(centre) < 150000).length;
    if (raid >= 6) alertJ(side, 'raid', `PIR-2 敌大规模空袭来袭：${raid} 架携弹攻击机`, 'crit');
    const sub = C.aswTgt && C.aswTgt.alive ? C.aswTgt : null;
    if (sub) alertJ(side, 'sub', `PIR-4 敌潜艇接近航母：${sub.name}，反潜群已出动`, 'hi');
  }
  for (const s of ships) if (s.side === side && s.carrier && s.alive && !s.dying) {
    const f = s.hp / s.maxHp, lv = f < 0.3 ? 3 : f < 0.55 ? 2 : f < 0.8 ? 1 : 0;
    if (lv > (cc['cv' + s.key] || 0)) { cc['cv' + s.key] = lv; alertJ(side, 'cvhp' + s.key + lv, `FFIR-1 ${s.name}受损，完好度 ${Math.round(f * 100)}%`, lv >= 2 ? 'crit' : 'hi'); }
  }
  const M = magazines(side);
  if (M.sam0 && M.sam / M.sam0 < 0.3) alertJ(side, 'sam', `FFIR-2 舰队防空导弹余量 ${Math.round(M.sam / M.sam0 * 100)}%（垂发单元无法海上补充）`, 'hi');
  const A = airStock(side);
  if (A.strike0 && A.strike / A.strike0 < 0.3) alertJ(side, 'air', `FFIR-3 可用攻击机余量 ${Math.round(A.strike / A.strike0 * 100)}%`, 'hi');
  if (game.t > 120 && !planes.some(p => p.side === side && p.alive && p.T.aew && p.airborne)) { cc.noAew = (cc.noAew || 0) + 2; if (cc.noAew > 60) alertJ(side, 'aew', 'FFIR-4 空中预警中断：无预警机在空', 'hi'); } else cc.noAew = 0;
  const Cf = command[foe(side)];
  if ((Cf.satT ?? 99) < 25 && !(Cf.satEnd > game.t)) alertJ(side, 'sat', `敌侦察卫星约 ${Math.ceil(Cf.satT)} 秒后过顶`, 'info');
}
// standing staff work: committing the reserve when the moment comes
function standingProposals(side) {
  const C = command[side], ph = phaseOf(side), main = intentTarget(side);
  if (!C.resvOut && ph && ph.alpha && main && hitOnce(side, main) && main.hp < main.maxHp * 0.75 && Object.values(C.resvN || {}).some(n => n > 0))
    staffAct(side, { key: 'resv-air', title: '投入航空预备队', detail: `${main.name}已受损（约 ${Math.round(main.hp / main.maxHp * 20) * 5}%），以预备队攻击机追加一波打击扩大战果`, ttl: 25, run: () => commitReserve(side, 'air') });
  const inbound = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side !== side && m.target && m.target.carrier && m.target.side === side).length;
  if (inbound >= 6 && ships.some(s => s.side === side && s.grp === 'reserve' && s.alive && !s.dying))
    staffAct(side, { key: 'resv-ship', title: '预备队舰艇加入防空', detail: `${inbound} 枚反舰导弹扑向航母，预备队驱逐舰前出加入掩护群`, ttl: 12, run: () => commitReserve(side, 'ship') });
}
function commitReserve(side, what) {
  const C = command[side];
  if (what === 'air') {
    C.resvOut = true;
    const main = intentTarget(side);
    let n = 0;
    if (main) for (const h of ships.concat(bases)) if (h.side === side && h.alive && !h.dying && h.hangar && (C.resvN[h.name] || 0) > 0 && launchPackage(h, main, { n: Math.max(4, C.resvN[h.name]), esc: 2 })) n++;
    for (const k in C.resvN) C.resvN[k] = 0;
    jlog(side, `投入航空预备队${n ? `，${n} 个攻击编队出动` : ''}`, GOLD);
    if (side === game.side) radio('战区指挥部', `航空预备队投入战斗${main ? `，目标${main.name}` : ''}！`, GOLD);
  } else {
    let n = 0;
    for (const s of ships) if (s.side === side && s.grp === 'reserve' && s.alive && !s.dying) { s.grp = what === 'sag' ? 'sag' : 'screen'; n++; }
    jlog(side, `预备队 ${n} 艘舰艇编入${what === 'sag' ? '水面突击群' : '防空掩护群'}`, GOLD);
    if (side === game.side) radio('舰队司令部', `预备队 ${n} 艘舰艇编入${what === 'sag' ? '水面突击群' : '防空掩护群'}。`, '#9fd4ff');
  }
}
// sustainment: what is left in the magazines and on the decks
function magazines(side) {
  const r = { sam: 0, sam0: 0, ashm: 0, ashm0: 0, ships: [] };
  for (const s of ships) if (s.side === side && s.alive && !s.dying) {
    const sam = Object.values(s.sam).reduce((a, b) => a + b, 0), sam0 = Object.values(s.S.sam).reduce((a, b) => a + b, 0) + (s.S.sm3 || 0);
    const ashm = Object.values(s.ashm).reduce((a, b) => a + b, 0) + (s.tlamN || 0), ashm0 = Object.values(s.S.ashm).reduce((a, b) => a + b, 0) + (s.S.tlam || 0);
    r.sam += sam; r.sam0 += sam0; r.ashm += ashm; r.ashm0 += ashm0;
    r.ships.push({ s, sam, sam0, ashm, ashm0 });
  }
  return r;
}
function airStock(side) {
  const r = { strike: 0, strike0: 0, fighter: 0, types: {} };
  for (const h of ships.concat(bases)) if (h.side === side && h.alive && !h.dying && h.hangar) {
    for (const [t, n] of Object.entries(h.hangar)) { r.types[t] = (r.types[t] || 0) + n; if (['j15', 'j16', 'fa18'].includes(t)) r.strike += n; if (['j35', 'f35c', 'j15', 'fa18', 'j16'].includes(t)) r.fighter += n; }
    for (const q of h.ready) if (['j15', 'j16', 'fa18'].includes(q.type)) r.strike++;
  }
  for (const h of ships.concat(bases)) if (h.side === side && (h.kind === 'base' ? h.wing0 : h.S && h.S.wing)) for (const t of ['j15', 'j16', 'fa18']) r.strike0 += ((h.kind === 'base' ? h.wing0 : h.S.wing)[t] || 0);
  return r;
}

/* ---------- command by negation: staff proposals ---------- */
let propN = 0;
const dpQueue = [];
// the staff wants to do something it may not do alone; for the AI side (or a commander away at a console) it just does
function staffAct(side, p) {
  const C = command[side];
  if (!cmdSeat(side)) { if (!p.valid || p.valid()) p.run(); return true; }
  const mode = authOf();
  if (mode === 'full' || (mode === 'delegate' && !p.strategic)) { p.run(); game.jstat.auto++; jlog(side, `参谋部执行：${p.title}${p.detail ? ' · ' + p.detail : ''}`); radio('参谋部', `已执行：${p.title}。`, '#9fd4ff'); return true; }
  C.props = C.props || [];
  if (C.props.some(q => q.key === p.key) || (C.veto || {})[p.key] > game.t) return false;
  p.t0 = game.wall || 0; p.ttl = (p.ttl || 20) * (mode === 'approve' ? 2 : 1); p.id = ++propN;
  C.props.push(p);
  // too many open at once: the oldest is settled the way the authority level says
  while (C.props.length > 4) settleProp(C.props[0], mode === 'approve' ? 'expire' : 'auto');
  renderProps();
  Sound.beep(1050, 0.05, 0.04);
  return false;
}
function settleProp(p, how) {
  const C = command[game.side];
  const i = C.props.indexOf(p); if (i < 0) return;
  C.props.splice(i, 1);
  if (how === 'approve' || how === 'auto') {
    if (!p.valid || p.valid()) p.run();
    game.jstat[how === 'approve' ? 'approved' : 'auto']++;
    jlog(game.side, `${how === 'approve' ? '批准' : '默认执行'}：${p.title}${p.detail ? ' · ' + p.detail : ''}`, how === 'approve' ? '#8dffb4' : '#9fd4ff');
  } else if (how === 'veto') {
    C.veto[p.key] = game.t + (p.hold || 150); game.jstat.vetoed++;
    jlog(game.side, `否决：${p.title}`, '#ff8a78');
    radio('参谋部', `明白，取消「${p.title}」。`, '#9fb0ba');
  } else { C.veto[p.key] = game.t + 60; jlog(game.side, `过期未批：${p.title}`, '#9fb0ba'); }
  renderProps();
}
function renderProps() {
  const box = $('props'); if (!box) return;
  const C = command[game.side] || {}, list = game.role === 'cmd' && game.mode === 'play' ? (C.props || []) : [];
  box.hidden = !list.length;
  const mode = authOf();
  box.innerHTML = list.slice(-(HH < 520 ? 2 : 4)).map(p => `<div class="prop" data-id="${p.id}"><b>参谋部建议 · ${p.title}</b><span>${p.detail || ''}</span><div class="pbar"><i id="pb${p.id}"></i></div>
    <div class="pacts"><button type="button" data-a="approve">批准</button><button type="button" data-a="veto">否决</button><em id="pt${p.id}">${mode === 'approve' ? '待批' : '到时执行'}</em></div></div>`).join('');
  for (const el of box.querySelectorAll('.prop')) for (const b of el.querySelectorAll('button')) b.onclick = () => { const p = C.props.find(q => q.id === +el.dataset.id); if (p) settleProp(p, b.dataset.a); };
}
function showDP() {
  const dp = dpQueue[0], el = $('dp');
  if (!dp) { el.hidden = true; return; }
  if (!dp.t0) dp.t0 = game.wall || 0;
  dp.ttl = authOf() === 'approve' ? 90 : 40;
  el.innerHTML = `<div class="dpc"><p class="eyebrow">战区联合指挥中心</p><h3>${dp.title}</h3><p>${dp.text}</p>
    <div class="dopts">${dp.opts.map((o, i) => `<button type="button" data-i="${i}" class="${i === dp.def ? 'rec' : ''}">${o.label}${i === dp.def ? '<small>参谋部建议</small>' : ''}</button>`).join('')}</div>
    <div class="pbar"><i id="dpbar"></i></div><em id="dpt"></em></div>`;
  el.hidden = false;
  for (const b of el.querySelectorAll('.dopts button')) b.onclick = () => resolveDP(+b.dataset.i, true);
}
function resolveDP(i, byHand) {
  const dp = dpQueue.shift(); if (!dp) return;
  const o = dp.opts[i];
  o.run(); dp.done(); game.jstat.dps++;
  jlog(dp.side, `${byHand ? '指挥员决策' : '超时按参谋建议'}：${o.label}`, GOLD);
  if (!byHand) radio('参谋部', `决策时限已到，按建议执行：${o.label}。`, '#9fd4ff');
  showDP();
}
// per frame (wall clock, so time compression does not eat the commander's thinking time)
function updateJointUI(rdt) {
  if (game.mode !== 'play') return;
  game.wall = (game.wall || 0) + rdt;
  if (game.role !== 'cmd') { if (!$('props').hidden) $('props').hidden = true; return; }
  const C = command[game.side], mode = authOf();
  for (const p of (C.props || []).slice()) {
    if (p.valid && !p.valid()) { settleProp(p, 'expire'); continue; }
    const left = p.ttl - (game.wall - p.t0);
    if (left <= 0) { settleProp(p, mode === 'approve' ? 'expire' : 'auto'); continue; }
    const bar = $('pb' + p.id); if (bar) bar.style.width = `${(left / p.ttl * 100).toFixed(1)}%`;
    const tx = $('pt' + p.id); if (tx) tx.textContent = `${mode === 'approve' ? '过期' : '执行'} ${Math.ceil(left)}s`;
  }
  const dp = dpQueue[0];
  if (dp) {
    const left = dp.ttl - (game.wall - dp.t0);
    if (left <= 0) resolveDP(dp.def, false);
    else { const b = $('dpbar'); if (b) b.style.width = `${(left / dp.ttl * 100).toFixed(1)}%`; const t = $('dpt'); if (t) t.textContent = `${Math.ceil(left)} 秒后按参谋部建议执行`; }
  }
  if (JC.open) { JC.t -= rdt; if (JC.t <= 0 && !JC.press) { JC.t = 1; renderJCC(); } }
}

/* ---------- the pre-battle planning screen ---------- */
function openPlan() {
  const side = game.side, saved = store.get('plan_' + side, null);
  game.planDraft = validPlan(saved, side) ? saved : staffPlan(side, true);
  renderPlan();
  show('plan');
}
function planWarnings(P, side) {
  const out = [], g = Object.values(P.groups), C = CONCEPTS[P.concept];
  const n = k => g.filter(x => x === k).length;
  if (!n('asw')) out.push(['未编组反潜警戒群', `敌方 ${FLEET[foe(side)].units.filter(([c]) => CLS[c].sub).length} 艘潜艇可能潜近航母，只能临时抽调护航舰猎潜。`]);
  if (!n('sag') && C.phases.some(id => PHASES[id].sag)) out.push(['无水面突击群', '突击阶段只能依靠舰载机与远程火力。']);
  if (n('screen') < 3) out.push(['掩护群不足 3 艘', '航母区域防空薄弱，饱和攻击下拦截通道不够。']);
  if (P.ap.air < 20) out.push(['制空兵力不足 20%', '攻击编队缺乏护航，战斗机巡逻稀疏。']);
  if (P.ap.isr < 10) out.push(['预警侦察不足 10%', '可能长时间无法定位敌航母，假目标更难识破。']);
  if (P.roe.emcon === 'C' && ['ambush', 'feint'].includes(P.concept)) out.push(['电磁管控与构想矛盾', `「${C.name}」依赖隐蔽，C 级管控会让敌方更早发现我舰队。`]);
  if (P.roe.wcs === 'hold') out.push(['武器保持', '所有进攻性火力都要你逐项批准，节奏会变慢。']);
  if (!P.reserve) out.push(['未保留预备队', '出现意外时无兵力可调。']);
  else if (P.reserve > 30) out.push(['预备队过大', `${P.reserve}% 的攻击机按兵不动，突击强度下降。`]);
  if (P.concept === 'feint' && (P.second === 'none' || P.second === P.main)) out.push(['助攻方向未定', '声东击西需要与主攻方向不同的助攻方向。']);
  if (!out.length) out.push(['方案可行', '参谋部无异议。']);
  return out;
}
// the staff's war game of the plan against the intelligence picture (orders of battle, full magazines)
function planEstimate(P, side) {
  const fo = foe(side), out = [];
  let D = 0, cvHp = 0;
  for (const [c, , , sx, sz] of FLEET[fo].units) {
    const S = CLS[c]; if (S.sub || Math.hypot(sx, sz) > 10000) continue;
    D += Math.min(Object.values(S.sam).reduce((a, b) => a + b, 0), S.channels * 2) * 0.2 + (S.ciws || 0) * 0.4;
    if (S.carrier && !cvHp) cvHp = S.hp;
  }
  // the first wave: one package per deck at the planned strength, the island or the bombers, the ships' cells
  const per = clamp(Math.round(6 * P.ap.strike / 35), 2, 14);
  let N = 0;
  for (const [c] of FLEET[side].units) { const w = CLS[c].wing; if (!w) continue; const st = (w.j15 || 0) + (w.fa18 || 0); N += Math.min(Math.round(st * (1 - P.reserve / 100)), per) * 2; }
  N += side === 'cn' ? per * 2 + 16 : 8 + 10;
  const hits = Math.max(0, N * 0.85 - D) * 0.85, need = Math.ceil((cvHp / (AVG_ASHM_DMG * 0.85) + D) / 0.85);
  out.push(['首波突击推演', `约 ${N} 枚反舰导弹对敌航母编队（估计拦截能力 ${D.toFixed(0)} 枚/波）：预计命中 ${hits.toFixed(0)} 枚，约为击沉一艘航母所需（${need} 枚）的 ${Math.round(Math.min(1, (hits * AVG_ASHM_DMG) / cvHp) * 100)}%—${hits < 1 ? `——单一波次无法突破，必须以联合火力（舰射、空射${side === 'cn' ? '与东风' : '与战斧'}）同时抵达，凑足 ${need} 枚以上` : `——需要 ${Math.ceil(cvHp / (hits * AVG_ASHM_DMG))} 波`}`]);
  // the air battle: fighters committed by the air share, by quality, against the enemy's whole wing
  let own = 0, them = 0;
  for (const [c] of FLEET[side].units) for (const [t, n] of Object.entries(CLS[c].wing || {})) own += (FQ[t] || 0) * n;
  if (side === 'cn') for (const [t, n] of Object.entries(baseWing())) own += (FQ[t] || 0) * n;
  for (const [c] of FLEET[fo].units) for (const [t, n] of Object.entries(CLS[c].wing || {})) them += (FQ[t] || 0) * n;
  if (fo === 'cn') for (const [t, n] of Object.entries(baseWing())) them += (FQ[t] || 0) * n;
  const share = P.ap.air / 100 + 0.25, R = Math.pow((own * share) / (them * 0.45), 2);
  out.push(['空战推演', `兰彻斯特平方律：投入制空的战斗力 ${(own * share).toFixed(0)} 对敌方典型投入 ${(them * 0.45).toFixed(0)}，战斗力比 ${R.toFixed(2)}——${R > 1.5 ? '有望夺取制空权' : R > 0.8 ? '空中将是均势消耗战' : '制空不利，攻击编队将遭受严重损失'}`]);
  return out;
}
function renderPlan() {
  const P = game.planDraft, side = game.side, fo = foe(side), body = $('plan-body');
  const seg = (k, opts, cur) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const d = Math.round(Math.hypot(FLEET[fo].origin[0] - FLEET[side].origin[0], FLEET[fo].origin[1] - FLEET[side].origin[1]) / 1000);
  const intel = side === 'cn'
    ? `美军福特号、里根号双航母打击群（提康德罗加级 ×2、伯克级 ×9、弗吉尼亚级 ×4，随队补给舰），第三航母打击群、日美澳联合编队与第七舰队驱逐舰支队正在向战区集结，预计在我以东约 ${d} km 海域，正以电磁静默向西航渡；关岛 B-1B、B-2 隐身轰炸机与水面舰战斧可从战区外打击，P-8A 反潜巡逻机将猎杀我潜艇。敌最可能采取外层防御、以 F-35C / F/A-18E 携 LRASM 分布式打击。`
    : `解放军福建舰、山东舰双航母编队（055 ×3、052D ×6、054A ×2、093B ×2、039B ×2，随队 901 型补给舰），辽宁舰编队、第二水面群、东部战区支援群与第二潜艇群在后方待命，预计在我以西约 ${d} km 海域；永暑、美济、渚碧三座岛礁机场驻歼-16、轰-6K，海南陆基航空兵可随时增援，火箭军东风-21D / 26 可对航母实施弹道打击。敌最可能以饱和协同打击与反舰弹道导弹先发制人。`;
  const units = FLEET[side].units.map(([c, name], i) => ({ key: side + i, c, name, S: CLS[c] }));
  body.innerHTML = `
  <div class="pgrid">
    <section class="psec"><h3>① 敌情判断 · 主攻方向</h3>
      <canvas id="plan-map"></canvas>
      <p class="pnote">${intel}</p>
      <div class="prow"><i>主攻方向</i>${seg('main', Object.entries(AXES), P.main)}</div>
      <div class="prow"><i>助攻方向</i>${seg('second', [['none', '不设'], ...Object.entries(AXES)], P.second)}</div>
    </section>
    <section class="psec"><h3>② 作战构想 · 阶段计划</h3>
      <div class="concepts">${Object.entries(CONCEPTS).map(([k, c]) => `<button type="button" class="concept${k === P.concept ? ' on' : ''}" data-k="concept" data-v="${k}"><b>${c.name}</b><span class="chain">${c.phases.map((id, j) => `<em>${j + 1} ${PHASES[id].name}</em>`).join('<s>›</s>')}</span><small>${c.desc}</small></button>`).join('')}</div>
    </section>
    <section class="psec span2"><h3>③ 兵力编组</h3>
      <div class="orbat">${units.map(u => u.S.carrier || u.S.supply ? `<div class="orow"><b>${u.name}</b><span>${u.S.type}</span><div class="seg fixed"><button type="button" class="on" disabled>${u.S.carrier ? '航母核心' : '后勤编队'}</button></div></div>`
        : `<div class="orow"><b>${u.name}</b><span>${u.S.type}</span>${seg('g:' + u.key, (u.S.sub ? SUB_GROUPS : SHIP_GROUPS).map(g => [g, GROUPS[g][0]]), P.groups[u.key])}</div>`).join('')}</div>
      <p class="pnote">${SHIP_GROUPS.map(g => `<b>${GROUPS[g][0]}</b>：${GROUPS[g][1]}`).join('　')}</p>
    </section>
    <section class="psec"><h3>④ 兵力分配 · 第一阶段</h3>
      <div class="sliders">${AP_KEYS.map(([k, l]) => `<label><i>${l}</i><input type="range" min="0" max="80" step="1" data-ap="${k}" value="${P.ap[k]}"><b id="apv-${k}">${P.ap[k]}%</b></label>`).join('')}
      <label class="resv"><i>航空预备队</i><input type="range" min="0" max="40" step="5" data-resv="1" value="${P.reserve}"><b id="apv-resv">${P.reserve}%</b></label></div>
      <p class="pnote">分配比例决定巡逻机数量、攻击编队规模与出动间隔、预警机与侦察出动、反潜与电子战 / 加油兵力。后续阶段按阶段预案调整，作战中可随时修改。预备队攻击机只在你下令或大规模打击时投入。</p>
    </section>
    <section class="psec"><h3>⑤ 交战规则 · 指挥方式</h3>
      <div class="prow"><i>武器控制</i>${seg('wcs', Object.entries(ROE.wcs).map(([k, v]) => [k, v[0]]), P.roe.wcs)}</div>
      <div class="prow"><i>电磁管控</i>${seg('emcon', Object.entries(ROE.emcon).map(([k, v]) => [k, v[0]]), P.roe.emcon)}</div>
      <div class="prow"><i>参谋权限</i>${seg('auth', Object.entries(ROE.auth).map(([k, v]) => [k, v[0]]), P.auth)}</div>
      <p class="pnote">${ROE.wcs[P.roe.wcs][1]}<br>${ROE.emcon[P.roe.emcon][1]}<br>${ROE.auth[P.auth][1]}</p>
    </section>
    <section class="psec span2"><h3>⑥ 国家体系特性 · 后续梯队</h3>
      <div class="natgrid"><ul class="staffnote">${NAT[side].pros.map(([a, b]) => `<li class="est"><b>${a}</b> ${b}</li>`).join('')}</ul><ul class="staffnote">${NAT[side].cons.map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join('')}</ul></div>
      <p class="pnote"><b>后续梯队（战中在联合指挥中心「增援梯队」投入）</b>：${ECHELONS[side].map(E => `<b>${E.name}</b>（${Math.round(E.ready / 60)} 分钟后可用，${Math.round(E.eta / 60)} 分钟抵达${E.uses > 1 ? `，${E.uses} 次` : ''}）`).join('；')}。</p>
    </section>
    <section class="psec span2"><h3>参谋部意见 · 兵棋推演</h3><ul class="staffnote">${planEstimate(P, side).map(([a, b]) => `<li class="est"><b>${a}</b> ${b}</li>`).join('')}${planWarnings(P, side).map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join('')}</ul></section>
  </div>`;
  for (const sg of body.querySelectorAll('.seg:not(.fixed)')) for (const b of sg.querySelectorAll('button')) b.onclick = () => {
    const k = sg.dataset.k, v = b.dataset.v;
    if (k === 'main' || k === 'second') P[k] = v;
    else if (k.startsWith('g:')) P.groups[k.slice(2)] = v;
    else if (k === 'wcs' || k === 'emcon') P.roe[k] = v;
    else if (k === 'auth') P.auth = v;
    renderPlan();
  };
  for (const b of body.querySelectorAll('.concept')) b.onclick = () => {
    const was = P.concept; P.concept = b.dataset.v;
    if (was !== P.concept) {
      const f = PHASES[CONCEPTS[P.concept].phases[0]]; P.ap = Object.assign({}, f.ap); P.roe.emcon = f.emcon;
      if (P.concept === 'feint' && P.second === 'none') P.second = P.main === 'N' ? 'S' : 'N';
      // the staff re-organises the force for the new concept unless the commander has already set it by hand
      if (JSON.stringify(P.groups) === JSON.stringify(staffGroups(side, was))) P.groups = staffGroups(side, P.concept);
    }
    renderPlan();
  };
  for (const r of body.querySelectorAll('input[data-ap]')) r.oninput = () => { setAp(P.ap, r.dataset.ap, +r.value); for (const [k] of AP_KEYS) { $('apv-' + k).textContent = P.ap[k] + '%'; const o = body.querySelector(`input[data-ap="${k}"]`); if (o !== r) o.value = P.ap[k]; } };
  for (const r of body.querySelectorAll('input[data-ap]')) r.onchange = () => renderPlan();
  const rv = body.querySelector('input[data-resv]'); rv.oninput = () => { P.reserve = +rv.value; $('apv-resv').textContent = P.reserve + '%'; }; rv.onchange = () => renderPlan();
  drawPlanMap();
}
// change one share and rescale the others so the whole stays 100
function setAp(ap, key, v) {
  v = clamp(Math.round(v), 0, 80);
  const others = AP_KEYS.map(([k]) => k).filter(k => k !== key), rest = others.reduce((a, k) => a + ap[k], 0);
  ap[key] = v;
  const want = 100 - v;
  for (const k of others) ap[k] = rest > 0 ? Math.round(ap[k] * want / rest) : Math.round(want / others.length);
  const err = 100 - AP_KEYS.reduce((a, [k]) => a + ap[k], 0);
  const big = others.sort((a, b) => ap[b] - ap[a])[0]; ap[big] = Math.max(0, ap[big] + err);
}
function drawPlanMap() {
  const cv = $('plan-map'); if (!cv) return;
  const P = game.planDraft, side = game.side, fo = foe(side);
  const W = cv.clientWidth || 320, H = cv.clientHeight || 170, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const o0 = FLEET[side].origin, e0 = FLEET[fo].origin, cx = (o0[0] + e0[0]) / 2, cz = (o0[1] + e0[1]) / 2;
  const span = 200000, s = Math.min(W / span, H / (span * 0.6)), P2 = (x, z) => [W / 2 + (x - cx) * s, H / 2 + (z - cz) * s];
  g.fillStyle = '#071521'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(141,255,180,0.07)';
  for (let x = -160000; x <= 160000; x += 20000) { const [a] = P2(x, 0); g.beginPath(); g.moveTo(a, 0); g.lineTo(a, H); g.stroke(); }
  for (let z = -120000; z <= 120000; z += 20000) { const [, b] = P2(0, z); g.beginPath(); g.moveTo(0, b); g.lineTo(W, b); g.stroke(); }
  for (const F of REEFS) { const [x, y] = P2(F.x, F.z); g.fillStyle = F.type === 2 ? 'rgba(60,140,170,0.18)' : 'rgba(98,214,205,0.5)'; g.beginPath(); g.ellipse(x, y, Math.max(1, F.rx * s), Math.max(1, F.rz * s), F.rot, 0, Math.PI * 2); g.fill(); }
  for (const I of BASE_LANDS) { const [x, y] = P2(I.x, I.z); g.fillStyle = '#d6c89e'; g.fillRect(x - 3, y - 3, 6, 6); g.font = `500 10px ${SANS}`; g.fillStyle = '#d6c89e'; g.textAlign = 'center'; g.fillText(I.name, x, y - 7); }
  const o = FLEET[side].origin, e = FLEET[fo].origin, [ox, oy] = P2(o[0], o[1]), [ex, ey] = P2(e[0], e[1]);
  g.strokeStyle = 'rgba(255,138,120,0.6)'; g.setLineDash([3, 4]); g.beginPath(); g.ellipse(ex, ey, 32000 * s, 26000 * s, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.font = `600 11px ${SANS}`; g.textAlign = 'center'; g.fillStyle = '#ff8a78'; g.fillText('敌航母编队（估计）', ex, ey - 26000 * s - 6);
  const arrow = (code, col, w, dash) => {
    const lat = latN(new V3(o[0], 0, o[1]), new V3(e[0], 0, e[1]), new V3()).multiplyScalar(axisOff(code) * 30000);
    const [tx, ty] = P2(e[0] + lat.x * 0.9, e[1] + lat.z * 0.9), [mx, my] = P2((o[0] + e[0]) / 2 + lat.x, (o[1] + e[1]) / 2 + lat.z);
    g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.moveTo(ox, oy); g.quadraticCurveTo(mx, my, tx, ty); g.stroke(); g.setLineDash([]);
    const a = Math.atan2(ty - my, tx - mx); g.fillStyle = col; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - Math.cos(a - 0.5) * 12, ty - Math.sin(a - 0.5) * 12); g.lineTo(tx - Math.cos(a + 0.5) * 12, ty - Math.sin(a + 0.5) * 12); g.closePath(); g.fill();
    return [mx, my];
  };
  if (P.second !== 'none') { const [mx, my] = arrow(P.second, 'rgba(143,200,255,0.8)', 2, [6, 5]); g.fillStyle = '#8fc8ff'; g.font = `600 10px ${SANS}`; g.fillText(`助攻 · ${AXES[P.second]}`, mx, my - 8); }
  { const [mx, my] = arrow(P.main, 'rgba(227,178,87,0.95)', 5); g.fillStyle = GOLD; g.font = `700 11px ${SANS}`; g.fillText(`主攻 · ${AXES[P.main]}`, mx, my - 10); }
  g.fillStyle = SIDES[side].color; g.beginPath(); g.arc(ox, oy, 5, 0, Math.PI * 2); g.fill(); g.font = `600 11px ${SANS}`; g.fillText('我航母编队', ox, oy + (oy > H - 30 ? -10 : 18));
  g.fillStyle = 'rgba(238,243,245,0.5)'; g.font = `500 9px ${MONO}`; g.textAlign = 'left'; g.fillText('N ↑   网格 20 km', 6, 12);
}
$('b-plan-go').onclick = () => { store.set('plan_' + game.side, game.planDraft); startGame(); };
$('b-plan-staff').onclick = () => { game.planDraft = staffPlan(game.side, true); renderPlan(); };
$('b-plan-back').onclick = () => brief();
addEventListener('resize', () => { if (!$('plan').hidden) drawPlanMap(); });

/* ---------- the joint operations centre (in battle) ---------- */
const JC = { open: false, tab: 'sit', t: 0, press: false };
function toggleJCC(tab) {
  if (game.mode !== 'play' || game.role !== 'cmd') return;
  JC.open = tab ? true : !JC.open;
  if (tab) JC.tab = tab;
  $('jcc').hidden = !JC.open;
  $('cm-jcc')?.classList.toggle('on', JC.open);
  if (JC.open) { JC.t = 0; renderJCC(); }
}
function renderJCC() {
  if (!JC.open) return;
  const side = game.side, C = command[side], P = planOf(side);
  if (!P || !C.ph) return;
  for (const b of document.querySelectorAll('#jcc-tabs button')) b.classList.toggle('on', b.dataset.t === JC.tab);
  const ph = PHASES[C.ph.id];
  $('jcc-phase').textContent = `${mmss(game.t)} · 第 ${C.ph.i + 1}/${P.phases.length} 阶段 ${ph.name} · ${ROE.auth[C.auth][0]}`;
  const body = $('jcc-body'), keep = body.scrollTop;
  body.innerHTML = JCC_TABS[JC.tab](side, C, P);
  body.scrollTop = keep;
  for (const b of body.querySelectorAll('[data-act]')) b.onclick = () => { jccAct(b.dataset.act, b.dataset.v); JC.t = 0.05; };
  for (const s of body.querySelectorAll('select[data-grp]')) s.onchange = () => { const sh = ships.find(x => x.key === s.dataset.grp); if (sh) { sh.grp = s.value; if (s.value !== 'sag') sh.sag = false; if (s.value !== 'asw') sh.hunt = null; radio('舰队司令部', `${sh.name}编入${GROUPS[s.value][0]}。`, '#9fd4ff'); jlog(side, `${sh.name}编入${GROUPS[s.value][0]}`); } JC.t = 0.05; };
  for (const r of body.querySelectorAll('input[data-ap]')) {
    r.oninput = () => { setAp(C.ap, r.dataset.ap, +r.value); for (const [k] of AP_KEYS) { const o = body.querySelector(`input[data-ap="${k}"]`); if (o !== r) o.value = C.ap[k]; const v = $('jap-' + k); if (v) v.textContent = C.ap[k] + '%'; } };
    r.onchange = () => { jlog(side, `调整兵力分配：${AP_KEYS.map(([k, l]) => `${l} ${C.ap[k]}%`).join(' · ')}`); radio('空中指挥', '收到新的兵力分配，按新比例组织出动。', '#9fd4ff'); JC.t = 0.05; };
  }
}
const jbar = (v, col = '#8fc8ff') => `<span class="jbar"><i style="width:${Math.round(clamp(v, 0, 1) * 100)}%;background:${col}"></i></span>`;
const segJ = (act, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const JCC_TABS = {
  // the situation: phase, balance, CCIR
  sit(side, C, P) {
    const ph = PHASES[C.ph.id], fo = foe(side), next = P.phases[C.ph.i + 1];
    const pm = potential(side) / potential0[side], pf = potential(fo) / potential0[fo];
    const myF = planes.filter(p => p.side === side && p.alive && p.airborne && p.mrm + p.srm > 0).length;
    const foF = [...picture[side].keys()].filter(e => e.kind === 'plane' && e.alive && !e.dying && e.T.mrm > 0).length;
    const inb = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side !== side && m.target && m.target.side === side).length;
    const cv = foeCarrierFix(side), cvT = cv && picture[side].get(cv);
    return `<div class="jphase"><b>第 ${C.ph.i + 1} 阶段 · ${ph.name}</b><span>${ph.goal}</span>${jbar(C.ph.prog, GOLD)}<em>${C.ph.label} · 已进行 ${mmss(game.t - C.ph.t0)}</em>
      ${next ? `<button type="button" data-act="nextphase">提前转入「${PHASES[next].name}」</button>` : ''}</div>
      <div class="jgrid">
        <div><i>我方战争潜力</i>${jbar(pm, '#8fc8ff')}<b>${Math.round(pm * 100)}%</b></div>
        <div><i>敌方战争潜力（估计）</i>${jbar(pf, '#ff8a78')}<b>${Math.round(pf / 0.1) * 10}%</b></div>
        <div><i>空中力量对比（战斗机）</i><b>${myF} : ${foF}${foF ? ` · ${(myF / foF).toFixed(1)} 倍` : ''}</b></div>
        <div><i>来袭反舰导弹</i><b style="color:${inb ? '#ff5a4f' : 'inherit'}">${inb}</b></div>
        <div><i>敌航母</i><b>${cv ? `${cv.name} · 航迹 ${Math.round(game.t - cvT.t)} s${cvT.coarse ? ' · 粗略' : ''}` : '未掌握'}</b></div>
        <div><i>主攻目标</i><b>${intentTarget(side) ? intentTarget(side).name : intentState(side) ? '指定海域' : '未定'}</b></div>
      </div>
      <h4>指挥员关键信息需求（CCIR）</h4>
      <ul class="jlist">${(C.alerts || []).slice(0, 10).map(a => `<li class="${a.level}"><em>${mmss(a.t)}</em>${a.text}</li>`).join('') || '<li>暂无</li>'}</ul>`;
  },
  // the joint integrated prioritized target list
  tgt(side, C) {
    const main = intentTarget(side), rows = [];
    for (const [e, tr] of picture[side]) {
      if ((e.kind !== 'ship' && e.kind !== 'base') || !e.alive || e.dying) continue;
      const age = game.t - tr.t, sub = e.S && e.S.sub;
      const score = sub ? -1 : e.value * (e.carrier ? 2 : 1) * (e === main ? 3 : 1) * (age < 60 ? 1 : 0.5);
      const pk = (C.pkgs || []).filter(k => k.tgt === e && (k.phase === 'form' || k.phase === 'push')).length;
      const ms = missiles.filter(m => m.alive && m.side === side && m.target === e).length;
      rows.push({ e, tr, age, sub, score, pk, ms });
    }
    rows.sort((a, b) => b.score - a.score);
    const q = r => r.tr.coarse ? `粗略 ${Math.round(r.age)}s` : r.age < 15 ? '精确' : `${Math.round(r.age)}s 前`;
    const bda = r => hitOnce(side, r.e) ? `约 ${Math.round(r.e.hp / r.e.maxHp * 20) * 5}%` : '未打击';
    return `<p class="jnote">目标按价值、主攻方向与航迹质量排序。BDA 为毁伤评估（估计值）。粗略航迹（卫星 / 超视距雷达）可以引导攻击编队，导弹末段需要自行搜索。</p>
      <table class="jtab"><thead><tr><th>#</th><th>目标</th><th>航迹</th><th>评估</th><th>在途</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.e === main ? 'main' : ''}"><td>${r.sub ? '潜' : i + 1}</td><td><b>${r.e.name}</b><small>${r.e.kind === 'base' ? '岛礁机场' : r.e.S.type}</small></td><td>${q(r)}</td><td>${r.sub ? '—' : bda(r)}</td><td>${r.pk ? `${r.pk} 编队 ` : ''}${r.ms ? `${r.ms} 弹` : ''}${!r.pk && !r.ms ? '—' : ''}</td>
        <td class="acts">${r.sub ? `<button type="button" data-act="asw" data-v="${r.e.key}">反潜猎杀</button>` : `${r.e === main ? '<em>主攻</em>' : `<button type="button" data-act="main" data-v="${r.e.key || r.e.name}">设为主攻</button>`}<button type="button" data-act="pkg" data-v="${r.e.key || r.e.name}">${hitOnce(side, r.e) ? '再次打击' : '攻击编队'}</button><button type="button" data-act="salvo" data-v="${r.e.key || r.e.name}">舰艇齐射</button><button type="button" data-act="joint" data-v="${r.e.key || r.e.name}">联合火力</button>`}</td></tr>`).join('') || '<tr><td colspan="6">态势图中暂无敌方水面目标</td></tr>'}
      </tbody></table>`;
  },
  // task organisation and the state of each group
  frc(side, C) {
    const mine = ships.filter(s => s.side === side && s.alive && !s.dying);
    const grpOrder = { sag: ['sagOrder', [['auto', '按阶段'], ['push', '前出接敌'], ['hold', '撤回编队']]], screen: ['screenK', [['0.6', '收拢'], ['1', '标准'], ['1.4', '展开']]], reserve: ['resv', [['screen', '投入掩护'], ['sag', '投入突击']]], fwd: ['subOrder', [['', '按计划'], ['fwd', '全部前出'], ['esc', '全部护航']]] };
    const status = s => s.hunt ? `猎潜 → ${s.hunt.name}` : s.sag ? '前出接敌' : s.grp === 'reserve' ? '后方待命' : s.S.sub ? `深 ${Math.round(s.depth)} m` : '编队';
    let html = '';
    for (const g of ['cv', 'sag', 'screen', 'asw', 'reserve', 'fwd', 'esc']) {
      const list = mine.filter(s => s.grp === g);
      if (!list.length && g !== 'reserve') continue;
      const o = grpOrder[g];
      html += `<div class="jgrp"><h4>${GROUPS[g][0]} <small>${list.length} 艘</small></h4>${o && list.length ? segJ('grp-' + g, o[1], g === 'screen' ? String(C.screenK || 1) : g === 'reserve' ? '' : g === 'fwd' ? (C.subOrder || '') : C[o[0]]) : ''}
        ${list.map(s => { const M = magazines(side).ships.find(x => x.s === s); return `<div class="jship"><b>${s.name}</b>${jbar(s.hp / s.maxHp, s.hp < s.maxHp * 0.5 ? '#ff8a78' : '#8dffb4')}<span>${status(s)}${M && M.sam0 ? ` · 防空弹 ${M.sam}` : ''}${M && M.ashm0 ? ` · 反舰弹 ${M.ashm}` : ''}</span>${s.carrier || s.S.supply ? '' : `<select data-grp="${s.key}">${(s.S.sub ? SUB_GROUPS : SHIP_GROUPS).map(x => `<option value="${x}"${x === s.grp ? ' selected' : ''}>${GROUPS[x][0]}</option>`).join('')}</select>`}</div>`; }).join('') || '<p class="jnote">预备队已全部投入</p>'}</div>`;
    }
    const dep = DEPLOY.filter(([k]) => C[k]);
    html += `<div class="jgrp"><h4>地图部署 <small>在战术地图上点选海域下达</small></h4>${dep.length ? dep.map(([k, , who]) => `<div class="jship"><b>${who}</b><span>${Math.round(C[k].x / 1000)}, ${Math.round(C[k].z / 1000)} km</span><span></span><button type="button" data-act="undeploy" data-v="${k}">取消</button></div>`).join('') : '<p class="jnote">尚未指定部署点——各群按计划阵位行动。</p>'}</div>`;
    const air = planes.filter(p => p.side === side && p.alive && !p.dying && p.airborne);
    const by = r => air.filter(p => p.role === r).length;
    const resv = Object.values(C.resvN || {}).reduce((a, b) => a + b, 0);
    html += `<div class="jgrp"><h4>航空兵 <small>空中 ${air.length} 架</small></h4>
      <div class="jgrid"><div><i>空中巡逻 / 扫荡</i><b>${by('cap') + by('sweep')}</b></div><div><i>突击 / 护航</i><b>${by('strike') + by('bomber')} / ${by('escort')}</b></div><div><i>预警 / 电子战 / 加油</i><b>${by('aew')} / ${by('ew')} / ${by('tank')}</b></div>
      <div><i>航空预备队</i><b>${C.resvOut ? '已投入' : `${resv} 架`}</b>${!C.resvOut && resv ? '<button type="button" data-act="resv-air">投入预备队</button>' : ''}</div></div>
      ${(C.pkgs || []).filter(k => k.phase === 'form' || k.phase === 'push').map(k => `<div class="jship"><b>第 ${k.id} 攻击编队${k.alpha ? '（大规模）' : ''}</b><span>${k.phase === 'form' ? `集结 ${k.ready || 0}/${k.total || 0}` : '已出发'} → ${k.tgt.name}</span></div>`).join('')}
      ${ships.filter(h => h.side === side && h.carrier && h.alive && !h.dying).map(h => `<div class="jship"><b>${h.name}</b><span>${h.alpha > game.t ? '大规模出动' : h.cyc ? (h.cyc.phase === 'launch' ? '弹射窗口' : '回收窗口') : ''} · 待射 ${(h.queue || []).length} · 待降 ${(h.stack || []).length} · 机库 ${Object.values(h.hangar).reduce((a, b) => a + b, 0)} · 整备 ${h.ready.length}</span></div>`).join('')}</div>`;
    return html;
  },
  // apportionment: the share of the air effort by mission
  ap(side, C) {
    const air = planes.filter(p => p.side === side && p.alive && !p.dying && p.airborne);
    const act = { air: ['cap', 'sweep', 'escort'], strike: ['strike', 'bomber'], isr: ['aew'], asw: [], ewt: ['ew', 'tank'] };
    return `<p class="jnote">联合空中作战的兵力分配：决定参谋部如何安排出动——巡逻机数量、攻击编队规模与间隔、预警机与侦察、反潜兵力、电子战与空中加油。转入新阶段时按预案重置。</p>
      <div class="sliders">${AP_KEYS.map(([k, l]) => `<label><i>${l}</i><input type="range" min="0" max="80" step="1" data-ap="${k}" value="${C.ap[k]}"><b id="jap-${k}">${C.ap[k]}%</b><small>${k === 'asw' ? `猎潜舰 ${ships.filter(s => s.side === side && s.hunt && s.alive).length}` : `在空 ${air.filter(p => act[k].includes(p.role)).length}`}</small></label>`).join('')}</div>
      <div class="row"><button type="button" data-act="appreset">恢复「${PHASES[C.ph.id].name}」阶段预案</button></div>`;
  },
  // rules of engagement and sustainment
  roe(side, C) {
    const M = magazines(side), A = airStock(side), low = planes.filter(p => p.side === side && p.alive && p.airborne && p.fuel < p.T.fuel * 0.25).length;
    const tk = planes.filter(p => p.side === side && p.alive && p.airborne && p.role === 'tank').length;
    const fires = side === 'cn' ? `火箭军东风：剩余 ${command.cn.dfN ?? 7} 个波次（每波 8 枚）` : `B-1B：剩余 ${command.us.b1b} 架 · 战斧 ${ships.filter(s => s.side === 'us' && s.alive).reduce((a, s) => a + (s.tlamN || 0), 0)} 枚`;
    return `<div class="prow"><i>武器控制</i>${segJ('wcs', Object.entries(ROE.wcs).map(([k, v]) => [k, v[0]]), C.roe.wcs)}</div>
      <div class="prow"><i>电磁管控</i>${segJ('emcon', Object.entries(ROE.emcon).map(([k, v]) => [k, v[0]]), tac(side).navy === 'emcon' ? 'A' : C.roe.emcon)}</div>
      <div class="prow"><i>参谋权限</i>${segJ('auth', Object.entries(ROE.auth).map(([k, v]) => [k, v[0]]), C.auth)}</div>
      <p class="jnote">${ROE.wcs[C.roe.wcs][1]} ${ROE.emcon[tac(side).navy === 'emcon' ? 'A' : C.roe.emcon][1]}</p>
      <h4>弹药（垂发单元无法海上补充）</h4>
      <div class="jgrid"><div><i>舰队防空导弹</i>${jbar(M.sam / (M.sam0 || 1), '#8fc8ff')}<b>${M.sam} / ${M.sam0}</b></div><div><i>反舰 / 对陆导弹</i>${jbar(M.ashm / (M.ashm0 || 1), '#ffc861')}<b>${M.ashm} / ${M.ashm0}</b></div></div>
      <table class="jtab"><tbody>${M.ships.filter(x => !x.s.carrier).map(x => `<tr><td><b>${x.s.name}</b></td><td>防空 ${jbar(x.sam / (x.sam0 || 1))} ${x.sam}</td><td>反舰 ${jbar(x.ashm / (x.ashm0 || 1), '#ffc861')} ${x.ashm}</td></tr>`).join('')}</tbody></table>
      <h4>航空保障</h4>
      <div class="jgrid"><div><i>可用攻击机</i>${jbar(A.strike / (A.strike0 || 1), '#ffc861')}<b>${A.strike} / ${A.strike0}</b></div><div><i>机库</i><b>${Object.entries(A.types).filter(([, n]) => n > 0).map(([t, n]) => `${AC[t].name} ${n}`).join(' · ') || '空'}</b></div>
      <div><i>低油量在空</i><b>${low}</b></div><div><i>加油机在空</i><b>${tk}</b></div><div><i>战区火力</i><b>${fires}</b></div><div><i>${UAV[side].name}</i><b>${C.uav ? (C.uav.up ? '在空侦察' : C.uav.n > 0 ? '准备起飞' : '已全部损失') + ` · 剩余 ${C.uav.n} 架` : '—'}</b></div><div><i>联合火力</i><b>${C.jfCd > game.t ? `${Math.ceil(C.jfCd - game.t)} 秒后可组织` : '可组织'}</b></div></div>`;
  },
  // the staff's estimate: salvo model per target, the air balance, the chief of staff's reasoning
  est(side, C) {
    const ab = C.ab || airBalance(side), B = C.brain;
    return `<p class="jnote">参谋部的兵棋推演：舰艇对抗按齐射模型（Hughes）估算——敌编队每波可拦截 D 枚，我方 N 枚导弹按航迹质量 σ 到达，超出拦截能力的部分命中；敌方弹药按满载估计。空战按兰彻斯特平方律比较双方战斗机的数量与质量。</p>
      <div class="jgrid"><div><i>空中战斗力（含预警机加成）</i><b>我 ${ab.own.toFixed(0)} : 敌 ${ab.them.toFixed(0)}</b></div><div><i>兰彻斯特战斗力比</i>${jbar(ab.R / 3, ab.R < 0.8 ? '#ff8a78' : '#8dffb4')}<b>${ab.R.toFixed(2)}${ab.R < 0.8 ? ' · 劣势' : ab.R > 1.8 ? ' · 优势' : ' · 均势'}</b></div></div>
      <table class="jtab"><thead><tr><th>目标</th><th>拦截能力 D</th><th>可用火力 N</th><th>航迹 σ</th><th>预计命中</th><th>毁伤概率</th><th>击沉需</th></tr></thead><tbody>
      ${(C.est || []).map(q => `<tr class="${q.e === intentTarget(side) ? 'main' : ''}"><td><b>${q.e.name}</b><small>${q.x.n} 艘防空舰</small></td><td>${q.x.D.toFixed(0)}</td><td>${q.pot.total}<small>机 ${q.pot.air} · 舰 ${q.pot.sea}</small></td><td>${q.x.sig.toFixed(1)}</td><td>${q.x.hits.toFixed(1)}</td><td>${jbar(q.x.pk, q.x.pk > 0.6 ? '#8dffb4' : q.x.pk > 0.3 ? '#ffc861' : '#ff8a78')} ${Math.round(q.x.pk * 100)}%</td><td>${q.x.need} 枚</td></tr>`).join('') || '<tr><td colspan="7">等待目标情报</td></tr>'}
      </tbody></table>
      <h4>参谋长判断 ${B ? `<small>${mmss(B.t)}</small>` : ''}</h4>
      <ul class="jlist">${B ? B.lines.map(l => `<li>${l}</li>`).join('') : '<li>首次推演进行中</li>'}</ul>`;
  },
  // the echelons held back: when to commit each is the commander's call
  ech(side) {
    const ST = { ok: ['可投入', '#8dffb4'], notready: ['准备中', '#9fb0ba'], enroute: ['在途', '#ffd28a'], rearm: ['再次出动准备中', '#9fb0ba'], used: ['已投入', '#9fb0ba'], nobase: ['机场已毁', '#ff8a78'] }, st = echState(side);
    return `<p class="jnote">后续梯队是战区的战略预备队：未投入时计入战争潜力，投入后才能作战、也可能被歼灭。投入得早，可以在敌方远程火力最猛时增加目标与火力；投入得晚，可以在对手弹药耗尽后一锤定音。${side === 'us' ? '美军远离本土，梯队抵达更慢。' : '我方主场作战，梯队距离近、抵达快。'}</p>
      <table class="jtab"><tbody>${ECHELONS[side].map(E => { const a = echAvail(side, E), x = st[E.id] || {}, left = E.uses - (x.called || 0);
        const when = a === 'notready' ? `${mmss(E.ready - game.t)} 后可投入` : a === 'enroute' ? `${mmss(x.due - game.t)} 后抵达` : a === 'rearm' ? `${mmss(x.due + 240 - game.t)} 后可再次投入` : `抵达需 ${Math.round(E.eta / 60)} 分钟`;
        return `<tr><td><b>${E.name}</b><small>${E.sub}</small></td><td><b style="color:${ST[a][1]}">${ST[a][0]}</b><small>${when}${E.uses > 1 ? ` · 剩余 ${left} 次` : ''}</small></td><td class="acts">${a === 'ok' ? `<button type="button" data-act="ech" data-v="${E.id}">投入</button>` : ''}</td></tr>`; }).join('')}</tbody></table>
      <h4>国家体系特性</h4><ul class="jlist">${NAT[side].pros.map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join('')}${NAT[side].cons.map(([a, b]) => `<li class="warn"><b>${a}</b> ${b}</li>`).join('')}</ul>`;
  },
  // the plan: concept, phases, the decision log
  plan(side, C, P) {
    return `<p class="jnote"><b>${CONCEPTS[P.concept].name}</b> · 主攻方向${AXES[P.main]}${P.second !== 'none' ? ` · 助攻方向${AXES[P.second]}` : ''}。${CONCEPTS[P.concept].desc}</p>
      <ol class="jphases">${P.phases.map((id, i) => `<li class="${i < C.ph.i ? 'done' : i === C.ph.i ? 'now' : ''}"><b>${i + 1} · ${PHASES[id].name}</b><span>${PHASES[id].goal}</span><small>分配 ${AP_KEYS.map(([k, l]) => `${l.split(' ')[0]} ${PHASES[id].ap[k]}`).join(' / ')} · 电磁 ${PHASES[id].emcon} 级${PHASES[id].alpha ? ' · 允许大规模打击' : ''}${PHASES[id].sag ? ' · 突击群前出' : ''}</small></li>`).join('')}</ol>
      <h4>指挥日志</h4><ul class="jlist">${(C.jlog || []).slice(0, 14).map(l => `<li><em>${mmss(l.t)}</em><span style="color:${l.color}">${l.text}</span></li>`).join('')}</ul>`;
  }
};
function jccAct(a, v) {
  const side = game.side, C = command[side];
  const find = k => [...picture[side].keys()].find(e => (e.key || e.name) === k && e.alive && !e.dying);
  if (a === 'nextphase') { const P = planOf(side); if (P.phases[C.ph.i + 1]) { jlog(side, '指挥员决定：提前转入下一阶段', GOLD); enterPhase(side, C.ph.i + 1, 'order'); } }
  else if (a === 'main') { const e = find(v); if (e) { designate(e); message('主攻目标已变更', e.name, GOLD, 2); jlog(side, `主攻目标改为${e.name}`, GOLD); } }
  else if (a === 'pkg') { const e = find(v); if (e) { let n = 0; for (const h of cmdCarriers().concat(bases.filter(b => b.side === side && b.alive))) if (launchPackage(h, e, { n: 6, esc: 2 })) n++; jlog(side, `命令：对${e.name}出动 ${n} 个攻击编队`); if (!n) message('机库无可用攻击机', '', '#9fb0ba', 1.6); } }
  else if (a === 'salvo') { const e = find(v); if (e) { const n = fleetStrike(side, e); jlog(side, n ? `命令：舰艇齐射 ${n} 枚，目标${e.name}` : `舰艇齐射：${e.name}超出射程`); if (!n) message('无舰艇在射程内', e.name, '#9fb0ba', 1.6); } }
  else if (a === 'joint') { const e = find(v); if (e) orderJointFires(e); }
  else if (a === 'asw') { const e = find(v); if (e) { game.desigShip = e; jlog(side, `命令：反潜猎杀${e.name}`); } }
  else if (a === 'resv-air') commitReserve(side, 'air');
  else if (a === 'ech') callEchelon(side, v);
  else if (a === 'undeploy') { C[v] = null; jlog(side, `取消部署：${DEPLOY.find(d => d[0] === v)[2]}`); }
  else if (a === 'grp-sag') { C.sagOrder = v; jlog(side, `水面突击群：${{ auto: '按阶段行动', push: '前出接敌', hold: '撤回编队' }[v]}`); }
  else if (a === 'grp-screen') { C.screenK = +v; jlog(side, `掩护群阵位：${{ 0.6: '收拢', 1: '标准', 1.4: '展开' }[v]}`); }
  else if (a === 'grp-reserve') commitReserve(side, v);
  else if (a === 'grp-fwd') { C.subOrder = v || null; jlog(side, `潜艇：${v === 'fwd' ? '全部前出伏击' : v === 'esc' ? '全部伴随护航' : '按计划'}`); }
  else if (a === 'appreset') { C.ap = Object.assign({}, PHASES[C.ph.id].ap); jlog(side, '兵力分配恢复阶段预案'); }
  else if (a === 'wcs') { C.roe.wcs = v; radio('战区指挥部', `武器控制状态：${ROE.wcs[v][0]}。`, GOLD); jlog(side, `武器控制：${ROE.wcs[v][0]}`, GOLD); }
  else if (a === 'emcon') { setEmcon(side, v); radio('舰队司令部', `电磁管控 ${ROE.emcon[v][0]}。`, '#9fd4ff'); jlog(side, `电磁管控：${ROE.emcon[v][0]}`); cmdButtons(); }
  else if (a === 'auth') { C.auth = v; radio('参谋部', `指挥方式：${ROE.auth[v][0]}。${ROE.auth[v][1]}`, '#9fd4ff'); renderProps(); cmdButtons(); }
}
for (const b of document.querySelectorAll('#jcc-tabs button')) b.onclick = () => { JC.tab = b.dataset.t; JC.t = 0; renderJCC(); };
$('jcc-close').onclick = () => toggleJCC();
{
  const j = $('jcc');
  j.addEventListener('pointerdown', () => { JC.press = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) j.addEventListener(ev, () => { JC.press = false; });
}
// the commander's line in the force panel and the objectives corner
function phaseLine(side) {
  const C = command[side], P = planOf(side); if (!C.ph || !P) return null;
  const ph = PHASES[C.ph.id], n = Math.round(clamp(C.ph.prog, 0, 1) * 10);
  return `第 ${C.ph.i + 1}/${P.phases.length} 阶段 · ${ph.name} ${'▮'.repeat(n)}${'▯'.repeat(10 - n)} ${C.ph.label}`;
}

/* ---------- the chief of staff: estimates and running re-planning ----------
   The staff reasons with the planner's classic models rather than with the omniscient game state:
   - salvo model (after Hughes): a group's defence intercepts up to D missiles per wave (fire channels x shots in
     the engagement window x Pk against anti-ship missiles, plus point defence); of N missiles fired, scouting effectiveness s (a fresh, fine
     track or a coarse satellite fix) decides how many arrive, D are stopped, the rest hit; enemy magazines are
     assumed full (that is all intelligence knows);
   - Lanchester's square law for the air battle: fighting strength goes as (numbers x quality)^2;
   - expected payoff of a target: value x kill probability with the missiles actually available.
   Every minute it re-weighs the apportionment, the main target, the screen and the tempo, and says why. The AI
   side's chief of staff does the same, so both commanders are equally sharp. */
const AVG_ASHM_DMG = 190;
// the interceptions a target's group can make against one wave (estimate from its class data, full magazines)
function defenceOf(side, tgt, exclude) {
  const tp = trackPos(side, tgt, new V3()) || tgt.pos;
  let D = 0, n = 0;
  for (const [e, tr] of picture[side]) {
    if ((e.kind !== 'ship' && e.kind !== 'base') || !e.alive || e.dying || (e.S && e.S.sub) || e === exclude) continue;
    if (e !== tgt && tr.pos.distanceTo(tp) > 10000) continue;
    const S = e.kind === 'base' ? Object.assign({ ciws: 2 }, e.spec) : e.S;
    const sam = Object.values(S.sam || {}).reduce((a, b) => a + b, 0);
    // two shots per fire channel in the short window a sea-skimmer is above the horizon; against anti-ship
    // missiles (low, fast, manoeuvring) an interceptor kills about one time in five
    D += Math.min(sam, (S.channels || 2) * 2) * 0.2 + (S.ciws || 0) * 0.4;
    n++;
  }
  return { D, n };
}
function salvoEstimate(side, tgt, N, exclude) {
  const { D, n } = defenceOf(side, tgt, exclude), tr = picture[side].get(tgt);
  const sig = tr && !tr.coarse && game.t - tr.t < 30 ? 0.9 : tr ? 0.6 : 0.3;
  const hits = Math.max(0, N * sig - D) * 0.85;                 // decoys and soft kill take their share
  const hp = Math.max(1, tgt.hp);
  const need = Math.ceil((hp / (AVG_ASHM_DMG * 0.85) + D) / sig);
  return { D, n, sig, hits, pk: clamp(hits * AVG_ASHM_DMG / hp, 0, 1), need };
}
// anti-ship missiles the side can put into one wave against a point (aircraft on deck outside the reserve, the
// bombers, the ships' cells within reach)
function strikePotential(side, tp) {
  const C = command[side];
  let air = 0, sea = 0;
  for (const h of ships.concat(bases)) if (h.side === side && h.alive && !h.dying && h.hangar) {
    const n = ['j15', 'j16', 'fa18'].reduce((a, t) => a + (h.hangar[t] || 0), 0) - (C.resvOut ? 0 : (C.resvN || {})[h.name] || 0);
    air += Math.min(12, Math.max(0, n)) * 2 + (h.hangar.h6k ? Math.min(3, h.hangar.h6k) * 6 : 0);
  }
  if (side === 'us') air += Math.min(2, C.b1b || 0) * 16;
  for (const s of ships) if (s.side === side && s.alive && !s.dying && !s.S.sub)
    for (const [k, n] of Object.entries(s.ashm)) if (n > 0 && MSL[k].range * 0.95 > s.pos.distanceTo(tp)) sea += Math.min(n, 4);
  return { air, sea: Math.min(sea, side === 'cn' ? 16 : 10), total: air + Math.min(sea, side === 'cn' ? 16 : 10) };
}
// Lanchester square law: fighting strength of each side's fighter force
const FQ = { j35: 1.6, f35c: 1.7, j20: 1.65, j15: 1, j16: 1.05, fa18: 1.05 };
function airBalance(side) {
  const fo = foe(side);
  let own = 0, them = 0;
  for (const p of planes) if (p.side === side && p.alive && !p.dying && p.airborne && p.mrm > 0) own += FQ[p.type] || 1;
  for (const h of ships.concat(bases)) if (h.side === side && h.alive && !h.dying && h.hangar) for (const [t, n] of Object.entries(h.hangar)) own += (FQ[t] || 0) * n * 0.35;
  for (const [e] of picture[side]) if (e.kind === 'plane' && e.alive && !e.dying && e.T.mrm > 0) them += FQ[e.type] || 1;
  // what intelligence believes is still on the enemy decks: the order of battle less the losses seen
  let foeWing = 0;
  for (const [cls] of FLEET[fo].units) for (const [t, n] of Object.entries(CLS[cls].wing || {})) foeWing += (FQ[t] || 0) * n;
  if (fo === 'cn') for (const [t, n] of Object.entries(baseWing())) foeWing += (FQ[t] || 0) * n;
  them += Math.max(0, foeWing - game.ledger.air[fo] * 1.1) * 0.35;
  const aewO = planes.some(p => p.side === side && p.alive && p.T.aew && p.airborne) ? 1.2 : 0.85;
  const aewF = [...picture[side].keys()].some(e => e.kind === 'plane' && e.alive && e.T.aew) ? 1.2 : 0.9;
  const R = Math.pow((own * aewO) / Math.max(1, them * aewF), 2);
  return { own: own * aewO, them: them * aewF, R };
}
// one staff cycle: estimates, then the decisions they support
function staffBrain(side, dt) {
  const C = command[side], P = planOf(side), ph = phaseOf(side);
  if (!P || !ph || game.over) return;
  C.brainT = (C.brainT ?? 25) - dt;
  if (C.brainT > 0) return;
  C.brainT = 60;
  const fo = foe(side), lines = [], est = [];
  const centre = fleetCentre(side) || ZERO;
  const ab = airBalance(side);
  lines.push(`空中力量对比（兰彻斯特平方律）${ab.own.toFixed(0)} : ${ab.them.toFixed(0)}，战斗力比 ${ab.R.toFixed(2)}${ab.R < 0.7 ? '，我处劣势' : ab.R > 1.8 ? '，我占明显优势' : ''}`);
  // targets: expected payoff of a full wave against each
  const main = intentTarget(side), I = intentState(side);
  let best = null, bestSc = 0;
  for (const [e, tr] of picture[side]) {
    if ((e.kind !== 'ship' && e.kind !== 'base') || !e.alive || e.dying || (e.S && e.S.sub) || game.t - tr.t > 150) continue;
    const pot = strikePotential(side, tr.pos), x = salvoEstimate(side, e, pot.total);
    const sc = e.value * (e.carrier ? 1.8 : 1) * (0.25 + x.pk) * (e === main ? 1.25 : 1);
    est.push({ e, x, pot, sc });
    if (sc > bestSc) { bestSc = sc; best = e; }
  }
  est.sort((a, b) => b.sc - a.sc);
  C.est = est.slice(0, 8);
  C.ab = ab;
  // 1) the main effort: the highest expected payoff; a carrier wrapped in too strong an umbrella is peeled first
  if (main && main.carrier) {
    const me = est.find(q => q.e === main);
    if (me && me.x.pk < 0.3) {
      let peel = null, gain = 0;
      for (const q of est) if (q.e !== main && q.e.kind === 'ship' && q.e.alive) {
        const tp = trackPos(side, q.e, new V3()); if (!tp || tp.distanceTo(trackPos(side, main, new V3()) || main.pos) > 15000) continue;
        const g = me.x.D - defenceOf(side, main, q.e).D;
        if (g > gain && q.x.pk > 0.5) { gain = g; peel = q.e; }
      }
      if (peel) {
        lines.push(`${main.name}防空拦截能力约 ${me.x.D.toFixed(0)} 枚/波，现有一波 ${me.pot.total} 枚只能达成 ${Math.round(me.x.pk * 100)}% 毁伤；先打掉${peel.name}可削弱其 ${gain.toFixed(0)} 枚拦截能力`);
        const pe = peel, held = I && I.src === 'player';
        staffAct(side, { key: 'peel:' + pe.key, strategic: true, title: '剥离防空 · 转移主攻', detail: `先打${pe.name}（${main.name}的防空支柱），再打航母——现有火力对航母毁伤概率仅 ${Math.round(me.x.pk * 100)}%`, ttl: 25, hold: 300,
          valid: () => pe.alive && !pe.dying && (!held || authOf() === 'full'), run: () => { setIntent(side, { tgt: pe }); intentOrders(side); jlog(side, `参谋长：主攻转向${pe.name}，剥离敌航母防空`, GOLD); } });
      }
    }
  } else if (best && best !== main && !(I && I.src === 'player' && main) && bestSc > 0) {
    const q = est[0];
    lines.push(`最佳目标：${best.name}，一波 ${q.pot.total} 枚可达成约 ${Math.round(q.x.pk * 100)}% 毁伤（需约 ${q.x.need} 枚击沉）`);
  }
  // 2) apportionment: from the phase's plan, corrected by the estimates
  const want = Object.assign({}, ph.ap), why = [];
  if (ab.R < 0.7) { want.air += 15; want.strike -= 10; want.isr -= 5; why.push('空中劣势，加强制空'); }
  else if (ab.R > 2 && ph.alpha) { want.air -= 10; want.strike += 10; why.push('制空优势，转向突击'); }
  if (!foeCarrierFix(side)) { want.isr += 10; want.strike -= 10; why.push('敌航母位置不明，加强侦察'); }
  if (C.aswTgt && C.aswTgt.alive) { want.asw += 10; want.strike -= 5; want.isr -= 5; why.push('敌潜艇威胁航母，加强反潜'); }
  const inbound = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side === fo && m.target && m.target.side === side).length;
  if (inbound > 10) { want.air += 5; want.ewt -= 5; why.push(`${inbound} 枚导弹来袭`); }
  for (const k of Object.keys(want)) want[k] = Math.max(0, want[k]);
  const tot = Object.values(want).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(want)) want[k] = Math.round(want[k] * 100 / tot);
  const diff = AP_KEYS.reduce((a, [k]) => a + Math.abs(want[k] - C.ap[k]), 0);
  if (why.length && diff >= 12) {
    lines.push(`兵力分配建议：${AP_KEYS.map(([k, l]) => `${l.split(' ')[0]} ${want[k]}`).join(' / ')}（${why.join('；')}）`);
    staffAct(side, { key: 'ap:' + AP_KEYS.map(([k]) => want[k]).join('-'), strategic: true, title: '调整兵力分配', detail: `${why.join('；')}：${AP_KEYS.map(([k, l]) => `${l.split(' ')[0]} ${C.ap[k]}→${want[k]}`).join(' · ')}`, ttl: 25, hold: 180,
      run: () => { C.ap = Object.assign({}, want); jlog(side, `参谋长：兵力分配调整为 ${AP_KEYS.map(([k, l]) => `${l.split(' ')[0]} ${want[k]}`).join(' / ')}`, GOLD); } });
  }
  // 3) the screen: a missile storm on a thin screen pulls the surface action group back
  const screen = ships.filter(s => s.side === side && s.alive && !s.dying && s.grp === 'screen').length;
  const sag = ships.filter(s => s.side === side && s.alive && !s.dying && s.grp === 'sag');
  if (inbound >= 10 && screen < 3 && sag.length) {
    lines.push(`掩护群只剩 ${screen} 艘，面对 ${inbound} 枚来袭导弹拦截通道不足`);
    staffAct(side, { key: 'sag2screen', strategic: true, title: '突击群回撤加强防空', detail: `掩护群只剩 ${screen} 艘，${inbound} 枚导弹来袭：${sag.map(s => s.name).join('、')}回撤编入掩护群`, ttl: 12, hold: 240,
      run: () => { for (const s of sag) { s.grp = 'screen'; s.sag = false; } jlog(side, '参谋长：突击群回撤加强防空', GOLD); } });
  }
  // the enemy's intent, read from his weapons
  const ei = enemyIntent(side);
  if (ei) lines.push(`敌情研判：敌方打击重心指向${ei.tgt.name}（在途导弹与攻击机折合 ${Math.round(ei.n)}）${ei.tgt.carrier ? '——敌意在我航母' : ''}`);
  // 5) joint fires: when the war game says one wave can do it
  const jt = intentTarget(side);
  if (jt && jt.kind === 'ship' && !(C.jfCd > game.t) && fresh(side, jt, 60)) {
    const JP = jointFiresPlan(side, jt);
    if (JP.N >= 16 && JP.x.pk >= 0.45) {
      lines.push(`联合火力推演：${JP.N} 枚可同时抵达${jt.name}，毁伤概率约 ${Math.round(JP.x.pk * 100)}%`);
      C.jfCd = game.t + 90;
      staffAct(side, { key: 'jf:' + jt.key, strategic: true, title: '联合火力打击', detail: jointFiresText(JP), ttl: 25, hold: 180, valid: () => jt.alive && !jt.dying, run: () => jointFires(side, jointFiresPlan(side, jt)) });
    }
  }
  // 4) tempo: when the enemy is breaking, go for the kill
  const pm = potential(side) / potential0[side], pf = potential(fo) / potential0[fo];
  lines.push(`战争潜力 我 ${Math.round(pm * 100)}% · 敌（估计）${Math.round(pf / 0.1) * 10}%`);
  const last = P.phases.length - 1;
  if (pf < 0.6 && pm > pf + 0.15 && C.ph.i < last && !C.ph.dp) {
    lines.push('敌方战争潜力接近崩溃，建议立即转入扩张战果');
    staffAct(side, { key: 'exploit', strategic: true, title: '提前转入扩张战果', detail: `敌战争潜力估计已降至 ${Math.round(pf * 100)}%，乘胜追击`, ttl: 20, hold: 300,
      run: () => { const i = P.phases.indexOf('exploit'); if (i > C.ph.i) enterPhase(side, i, 'order'); } });
  }
  C.brain = { t: game.t, lines };
}

/* ---------- 联合火力打击: joint fires with one time on target ----------
   Every launcher that can reach the target - surface ships, submarines, the Rocket Force's ballistic missiles,
   the US Navy's maritime-strike Tomahawks - is scheduled so that everything arrives in the same few seconds:
   the defence meets one wave far beyond its fire channels instead of several it can work through. */
function jointFiresPlan(side, tgt) {
  const tp = trackPos(side, tgt, new V3()) || tgt.pos.clone(), tr = picture[side].get(tgt), age = tr ? game.t - tr.t : 999;
  const items = [], count = { ship: 0, sub: 0, df: 0, mst: 0 };
  for (const s of ships) if (s.side === side && s.alive && !s.dying && s !== flagship) {
    const d = s.pos.distanceTo(tp);
    for (const [k, n] of Object.entries(s.ashm)) {
      const S = MSL[k]; if (!(n > 0) || S.arm || S.range * 0.95 < d) continue;
      const v = S.sprint ? (S.v + S.sprint) / 2 : S.profile === 'hyper' ? S.v * 0.8 : S.v;
      for (let j = 0; j < Math.min(n, s.S.sub ? 4 : 8); j++) { items.push({ kind: s.S.sub ? 'sub' : 'ship', s, k, tof: d / v + 3 }); count[s.S.sub ? 'sub' : 'ship']++; }
    }
    if (side === 'us' && tgt.kind === 'ship' && (s.tlamN || 0) > 0) for (let j = 0; j < Math.min(s.tlamN, 12); j++) { items.push({ kind: 'mst', s, k: 'mst', tof: d / MSL.mst.v + 3 }); count.mst++; }
  }
  // ballistic missiles need a fix no older than 30 s (they fly 50 s; the target moves 800 m in that time)
  if (side === 'cn' && tgt.kind === 'ship' && (command.cn.dfN ?? 7) > 0 && age < 30 && tr && !tr.coarse) for (let j = 0; j < 8; j++) { items.push({ kind: 'df', k: j % 2 ? 'df26' : 'df21d', tof: 55 }); count.df++; }
  // the slowest shooters (subsonic Tomahawks) set the time on target; nothing waits longer than ten minutes
  const fit = items.filter(i => i.tof < 600).sort((a, b) => (b.kind === 'df') - (a.kind === 'df') || a.tof - b.tof).slice(0, 120);
  for (const k in count) count[k] = 0;
  for (const i of fit) count[i.kind]++;
  const N = fit.length, T = N ? Math.max(...fit.map(i => i.tof)) + 3 : 0;
  return { tgt, items: fit, N, T, count, x: salvoEstimate(side, tgt, N), age };
}
function jointFiresText(P) {
  const c = P.count, parts = [c.df && `东风 ${c.df} 枚`, c.mst && `海上打击战斧 ${c.mst} 枚`, c.ship && `舰射反舰导弹 ${c.ship} 枚`, c.sub && `潜射 ${c.sub} 枚`].filter(Boolean).join(' + ');
  return `${parts || '无可用火力'}，共 ${P.N} 枚，统一在 ${Math.round(P.T)} 秒后抵达${P.tgt.name}。敌编队估计拦截能力 ${P.x.D.toFixed(0)} 枚/波，预计命中 ${P.x.hits.toFixed(0)} 枚，毁伤概率约 ${Math.round(P.x.pk * 100)}%。`;
}
function jointFires(side, P) {
  if (!P || !P.N) return 0;
  const C = command[side], tgt = P.tgt, t0 = game.t;
  // a Rocket Force wave is one of its six
  if (P.count.df) { command.cn.dfN = (command.cn.dfN ?? 7) - 1; command.cn.dfCd = Math.max(command.cn.dfCd ?? 0, 300); }
  for (const it of P.items) {
    const at = t0 + P.T - it.tof;
    if (it.kind === 'df') { /* counted above */ }
    else if (it.kind === 'mst') it.s.tlamN--;
    else it.s.ashm[it.k]--;
    pending.push({ t: at, fn: () => {
      if (!tgt.alive || tgt.dying) return;
      let m = null;
      if (it.kind === 'df') m = launchBallistic(side, tgt, it.k);
      else if (it.s.alive && !it.s.dying) m = launchASHM(it.s, tgt, it.k);
      if (m && !P.cined && game.t - t0 > 1) { P.cined = true; cineOn('salvo', m); }
    } });
  }
  C.jfCd = game.t + 360;
  chron(`${SIDES[side].short}联合火力打击：${P.N} 枚导弹统一时间扑向${tgt.name}`, side, true);
  jlog(side, `联合火力打击 · ${jointFiresText(P)}`, GOLD);
  if (side === game.side) { radio('联合火力协调', `${side === 'cn' ? '饱和协同打击' : '分布式杀伤'}开始！${jointFiresText(P)}`, GOLD); message('联合火力打击', `${P.N} 枚 · ${Math.round(P.T)} 秒后同时抵达 ${tgt.name}`, GOLD, 3.5); Music.stinger(true); }
  else if (game.side && game.role !== 'watch') radio('预警', `侦测到敌方大规模协同齐射！多方向、多类型导弹正在升空，判断目标${tgt.name}！`, '#ff5a4f');
  return P.N;
}
// the commander's order: the plan is war-gamed and put to him before it fires
function orderJointFires(tgt) {
  const side = game.side, C = command[side];
  if (!tgt) { message('先指定主攻目标', '在战术地图或目标清单上选择敌舰', '#9fb0ba', 1.8); return; }
  if (C.jfCd > game.t) { message('联合火力准备中', `${Math.ceil(C.jfCd - game.t)} 秒后可再次组织`, '#9fb0ba', 1.8); return; }
  const P = jointFiresPlan(side, tgt);
  if (P.N < 4) { message('火力不足', `只有 ${P.N} 枚导弹能打到${tgt.name}`, '#9fb0ba', 2); return; }
  decide({ side, title: `联合火力打击 · ${tgt.name}`, text: `参谋部推演：${jointFiresText(P)}${P.age > 30 && side === 'cn' ? '（航迹已超过 30 秒，火箭军不参加——需要新鲜定位）' : ''}`,
    opts: [{ label: '执行联合火力打击', run: () => jointFires(side, jointFiresPlan(side, tgt)) }, { label: '取消', run: () => {} }], def: 0, done: () => {} });
}

/* ---------- theatre ISR drones: the kill web's long eyes ----------
   The PLA's WZ-7 and the US Navy's MQ-4C Triton hold high orbits ahead of their fleets and feed coarse but
   steady tracks of everything on the surface within ~160 km; flown into a long-range SAM umbrella with the radar
   on, they get shot down. Each side has two airframes. */
const UAV = { cn: { name: '无侦-7', n: 2 }, us: { name: 'MQ-4C 人鱼海神', n: 2 } };
function updateUAV(side, dt) {
  const C = command[side], U = C.uav || (C.uav = { n: UAV[side].n, up: false, pos: new V3(), next: 60, tick: 0 });
  if (!U.up) {
    if (U.n > 0 && game.t > U.next) { U.up = true; if (side === game.side) radio('战区侦察', `${UAV[side].name}进入侦察航线。`, '#9fd4ff'); }
    return;
  }
  const c = fleetCentre(side); if (!c) return;
  axisDir(side, c, _in1);
  U.pos.copy(c).addScaledVector(_in1, 60000).setY(16000);
  U.tick -= dt; if (U.tick > 0) return;
  U.tick = 15;
  const foe_ = foe(side);
  for (const e of ships) if (e.side === foe_ && e.alive && !e.dying && !submerged(e) && Math.hypot(e.pos.x - U.pos.x, e.pos.z - U.pos.z) < 160000 && Math.random() < 0.8) isrFix(side, e, shipQuiet(e) ? 2600 : 1400);
  // a long-range SAM ship with its radar on near the orbit can reach it
  const threat = ships.find(e => e.side === foe_ && e.alive && !e.dying && !shipQuiet(e) && (e.sam.sm6 > 0 || e.sam.hhq9 > 0) && Math.hypot(e.pos.x - U.pos.x, e.pos.z - U.pos.z) < 60000);
  if (threat && Math.random() < 0.18) {
    U.up = false; U.n--; U.next = game.t + 240;
    const k = threat.sam.sm6 > 0 ? 'sm6' : 'hhq9'; threat.sam[k]--;
    chron(`${UAV[side].name}被${threat.name}的${MSL[k].name}击落`, side);
    if (side === game.side) radio('战区侦察', `${UAV[side].name}被敌${MSL[k].name}击落！${U.n ? '备份机 4 分钟后接替。' : '无人侦察机已全部损失。'}`, '#ff8a78');
    else if (game.side && game.role !== 'watch') radio('战果', `${threat.name}击落敌${UAV[side].name}高空侦察机！`, '#8dffb4');
  }
}

/* ---------- situation reports and the enemy's intent ---------- */
function sitrep(side) {
  const C = command[side];
  if (side !== game.side || game.role === 'watch') return;
  C.repT = (C.repT ?? 300) - 2;
  if (C.repT > 0) return;
  C.repT = 300;
  const L = game.ledger, fo = foe(side);
  const pm = Math.round(potential(side) / potential0[side] * 100), pf = Math.round(potential(fo) / potential0[fo] * 20) * 5;
  const ph = phaseOf(side);
  const text = `战况通报（${Math.floor(game.t / 60)} 分）：我方损失舰艇 ${L.sunk[side].length} 艘、飞机 ${L.air[side]} 架；敌方损失舰艇 ${L.sunk[fo].length} 艘、飞机 ${L.air[fo]} 架。战争潜力 我 ${pm}% · 敌约 ${pf}%。${ph ? `目前处于「${ph.name}」阶段。` : ''}`;
  radio('战区指挥部', text, '#ffd28a');
  jlog(side, text, '#ffd28a');
}
// what the enemy is going for, read from his weapons in flight and his strike aircraft
function enemyIntent(side) {
  const fo = foe(side), hits = new Map();
  for (const m of missiles) if (m.alive && m.side === fo && m.cls === 'ashm' && m.target && m.target.side === side) hits.set(m.target, (hits.get(m.target) || 0) + 1);
  for (const [e] of picture[side]) if (e.kind === 'plane' && e.alive && e.ashmN > 0 && e.task && e.task.target && e.task.target.side === side) hits.set(e.task.target, (hits.get(e.task.target) || 0) + 0.5);
  let best = null, n = 0;
  for (const [u, k] of hits) if (k > n) { n = k; best = u; }
  return best ? { tgt: best, n } : null;
}
