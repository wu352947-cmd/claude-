/* ---------- command interface: unit picker, respawn, spectator, ability bar, theatre support ----------
   Inlined into navwar.js (shares its scope). */

/* ---------- what the player can take: every ship, every aircraft type with airframes left, or any airborne jet ---------- */
function airInventory(side) {
  const inv = {};
  for (const h of ships.concat(bases)) {
    if (h.side !== side || !h.alive || h.dying || !h.hangar) continue;
    for (const [t, n] of Object.entries(h.hangar)) if (n > 0) { inv[t] = inv[t] || { n: 0, homes: [] }; inv[t].n += n; inv[t].homes.push([h, n]); }
  }
  if (side === 'us' && command.us.b1b > 0) inv.b1b = { n: command.us.b1b, homes: [[null, command.us.b1b]], guam: true };
  return inv;
}
const AC_NOTE = {
  j15: '舰载多用途 · 霹雳-15 ×4、霹雳-10 ×2、鹰击-83K ×2', j35: '隐身制空 · 霹雳-15 ×4 内埋', j15d: '电子战 · 压制敌雷达与导弹', kj600: '舰载预警 · 130 km 雷达',
  j16: '陆基多用途 · 岛礁跑道起飞', h6k: '远程轰炸 · 鹰击-12 ×2', fa18: '舰载多用途 · AIM-120D ×4、LRASM ×2', ea18g: '电子战 · 压制敌雷达与导弹',
  f35c: '隐身制空 · AIM-120D ×4 内埋', e2d: '舰载预警 · 140 km 雷达', b1b: '远程轰炸 · LRASM ×4 · 从战区外突入'
};
function shipNote(s) {
  const a = Object.entries(s.ashm).filter(([, n]) => n > 0).map(([k, n]) => `${MSL[k].name} ×${n}`).join('、');
  const sam = Object.entries(s.sam).filter(([, n]) => n > 0).map(([k, n]) => `${MSL[k].name} ×${n}`).join('、');
  if (s.S.sub) return `鱼雷 ×${s.torpsN}${a ? ' · ' + a : ''}${s.tlamN ? ` · 战斧 ×${s.tlamN}` : ''}`;
  if (s.carrier) return `舰载机 ${Object.values(s.hangar).reduce((x, y) => x + y, 0)} 架 · ${sam}`;
  return [sam, a, s.tlamN ? `战斧 ×${s.tlamN}` : ''].filter(Boolean).join(' · ');
}
function pickButton(list, title, sub, tag, fn, dim = false) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pick' + (dim ? ' dim' : '');
  b.innerHTML = `<b>${title}</b><span>${sub}</span><i>${tag}</i>`;
  b.onclick = fn; list.appendChild(b);
}
// the role screen: tabs for ships, aircraft and command / spectator
function chooseSide(side) {
  game.side = side;
  $('role-title').textContent = SIDES[side].name;
  game.roleTab = game.roleTab || 'ship';
  renderRoles();
  show('role');
}
function renderRoles() {
  const side = game.side, list = $('role-list'); list.innerHTML = '';
  for (const b of document.querySelectorAll('#role-tabs button')) b.classList.toggle('on', b.dataset.t === game.roleTab);
  const go = (role, pick) => () => { game.role = role; game.pick = pick; brief(); };
  if (game.roleTab === 'ship') {
    for (const s of ships.filter(x => x.side === side)) pickButton(list, `${s.name}${s.S.number ? ' · ' + s.S.number : ''}`, `${s.S.type} · ${shipNote(s)}`, s.S.sub ? '艇长' : '舰长', go('captain', s.key));
  } else if (game.roleTab === 'air') {
    const inv = {};
    for (const s of ships.filter(x => x.side === side && x.carrier)) for (const [t, n] of Object.entries(s.S.wing)) { inv[t] = inv[t] || []; inv[t].push(`${s.name} ${n}`); }
    if (side === 'cn') for (const [t, n] of Object.entries(BASE.wing)) { inv[t] = inv[t] || []; inv[t].push(`岛礁 ${n}`); }
    if (side === 'us') inv.b1b = ['关岛 12'];
    for (const [t, homes] of Object.entries(inv)) pickButton(list, AC[t].name, `${AC_NOTE[t] || ''} · ${homes.join(' / ')} 架`, '飞行员', go('pilot', t));
  } else {
    pickButton(list, '战区指挥官', '上将视角：战前定下作战决心（主攻方向、作战构想、兵力编组、兵力分配、交战规则），战中在联合指挥中心按阶段指挥，参谋部提出建议由你批准或否决 · 随时接管任一己方单位', '指挥', go('cmd', null));
    pickButton(list, '观战', '双方 AI 对决 · 任意切换单位 · 自由镜头 · 自动导播', '观战', go('watch', null));
  }
}
for (const b of document.querySelectorAll('#role-tabs button')) b.onclick = () => { game.roleTab = b.dataset.t; renderRoles(); };

// take a seat: a ship, an aircraft type from a home that still has one, or an airborne jet already in the fight
function takeRole(role, pick, home) {
  game.role = role; game.pick = pick; game.view = 0; game.ai = false; game.snap = 3; game.cine = null;
  if (player && player.alive && player !== pick) { player.name = player.name.replace('（你）', ''); }
  player = null; flagship = null;
  const side = game.side;
  if (role === 'pilot') {
    let p = null;
    if (pick && pick.kind === 'plane') {
      // take over an airborne aircraft: the AI hands over the controls
      p = pick; p.name = `${p.T.name}（你）`;
    } else if (pick === 'b1b') {
      if (command.us.b1b <= 0) { takeRole('watch'); return; }
      command.us.b1b--;
      p = new Plane('us', 'b1b', null);
      p.pilot = new Pilot(p, 0.9); p.role = 'bomber'; p.task = { target: bestTarget('us', new V3(), 200000) };
      p.pos.set(THEATRE.air - 14000, 7000, rand(-25000, 25000)); setBasis(p.q, new V3(-1, 0, 0), Y_AXIS); p.speed = 260; p.axes(); p.sync();
      p.name = 'B-1B（你）'; planes.push(p);
    } else {
      const h = home || ships.concat(bases).filter(x => x.side === side && x.alive && !x.dying && x.hangar && x.hangar[pick] > 0).sort((a, b) => b.hangar[pick] - a.hangar[pick])[0];
      if (!h) { takeRole('watch'); return; }
      h.hangar[pick]--;
      p = new Plane(side, pick, h);
      p.pilot = new Pilot(p, 0.9); p.role = 'cap'; p.name = `${AC[pick].name}（你）`;
      planes.push(p);
      if (!spotOnCatapult(p)) { p.state = 'deck'; p.deckT = 3; }
      player = p; launchWingman(p);
    }
    player = p;
    $('b-scale').textContent = '时间 ×1'; game.scale = 1;
    sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -70; sunLight.shadow.camera.right = sunLight.shadow.camera.top = 70;
  } else if (role === 'captain') {
    flagship = (typeof pick === 'object' && pick) || ships.find(s => s.key === pick && s.alive && !s.dying) || ships.find(s => s.side === side && s.alive && !s.dying);
    if (!flagship) { takeRole('watch'); return; }
    game.ashmSel = null; flagship.course = flagship.heading; flagship.helmT = 0;
    flagship.gear = clamp(Math.round(flagship.order / flagship.S.vmax * 4) + 1, 1, 5);
    sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -260; sunLight.shadow.camera.right = sunLight.shadow.camera.top = 260;
    buildAbilityBar(flagship); setGear(flagship.gear);
  }
  sunLight.shadow.camera.far = 1200; sunLight.shadow.camera.updateProjectionMatrix();
  $('pilot-ctl').hidden = role !== 'pilot';
  $('cap-ctl').hidden = role !== 'captain'; $('gun-ctl').hidden = true; game.gunsight = false;
  $('gears').hidden = $('abil').hidden = role !== 'captain';
  const cam = role === 'watch' || role === 'cmd';
  $('specbar').hidden = !cam; $('spec').hidden = true; game.roster = false;
  $('cmdbar').hidden = role !== 'cmd';
  $('stick-zone').hidden = cam && game.spec !== 'free';
  $('b-ai').hidden = cam;
  $('b-ai').textContent = role === 'captain' ? (flagship && flagship.S.sub ? 'AI 艇长' : 'AI 舰长') : 'AI 驾驶';
  if (role === 'captain') {
    $('c-salvo').innerHTML = flagship.S.sub ? '潜射<br>导弹' : flagship.carrier ? '攻击波' : '反舰<br>齐射';
    $('c-gun').hidden = !flagship.gun;
  }
  if (cam) { game.spec = game.spec || 'auto'; specButtons(); }
  if (role === 'cmd') { cmdButtons(); renderProps(); showDP(); if (game.mode === 'play' && game.t > 1) message('战区指挥', '「指挥中心」查看态势、目标、兵力与交战规则 · 「切换单位」可随时接管', GOLD, 2.4); }
  else {
    // the commander leaves the console: the staff settles what was waiting, the way the authority level says
    if (JC.open) toggleJCC();
    while (dpQueue.length) resolveDP(dpQueue[0].def, false);
    const C = command[game.side];
    if (C && C.props) for (const p of C.props.slice()) settleProp(p, authOf() === 'approve' ? 'expire' : 'auto');
    $('dp').hidden = true; $('props').hidden = true;
  }
}

/* ---------- after losing an aircraft or a ship: fly again, take over, take a ship, or watch ---------- */
function deathChoices() {
  const list = $('dead-list'); list.innerHTML = '';
  const side = game.side;
  const add = (label, sub, fn, tag = '') => pickButton(list, label, sub, tag, () => { fn(); game.mode = 'play'; show(null); });
  const inv = airInventory(side);
  const total = Object.values(inv).reduce((a, x) => a + x.n, 0);
  const last = game.pick && typeof game.pick === 'string' && inv[game.pick] ? game.pick : null;
  if (last) add(`继续出击 · ${AC[last].name}`, `同型机剩余 ${inv[last].n} 架`, () => takeRole('pilot', last), '再战');
  for (const [t, x] of Object.entries(inv)) if (t !== last) add(`出击 · ${AC[t].name}`, `${x.guam ? '关岛' : x.homes.map(([h, n]) => `${h.name} ${n}`).join(' / ')} 架`, () => takeRole('pilot', t), '飞行员');
  const air = planes.filter(p => p.side === side && p.alive && !p.dying && p.state === 'air' && p !== player).slice(0, 6);
  for (const p of air) add(`接管空中 · ${p.name}`, `${MODE_TEXT[p.pilot && p.pilot.mode] || p.role} · 高度 ${Math.round(p.pos.y)} m`, () => takeRole('pilot', p), '接管');
  for (const s of ships.filter(s => s.side === side && s.alive && !s.dying)) add(`指挥 ${s.name}`, `${s.S.type} · 舰体 ${Math.round(s.hp / s.maxHp * 100)}%`, () => takeRole('captain', s), s.S.sub ? '艇长' : '舰长');
  add('战区指挥官', '指挥全部兵力 · 随时接管任一单位', () => takeRole('cmd'), '指挥');
  add('观战', '自由镜头 · 自动导播', () => takeRole('watch'), '观战');
  $('dead-title').textContent = game.cause || '任务中断';
  $('dead-sub').textContent = total ? `本方空军尚余 ${total} 架战机可以出击` : '本方舰载航空兵已经耗尽';
  show('dead');
}

/* ---------- ability bar and engine telegraph ---------- */
function buildAbilityBar(s) {
  const bar = $('abil'); bar.innerHTML = '';
  const list = abilitiesOf(s).filter(id => !['decoy', 'dc'].includes(id) && !(id === 'salvo' && !s.S.sub));
  let n = 0;
  for (const id of list) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ab'; b.dataset.id = id;
    const key = id === 'torp' ? 'E' : id === 'depth' ? 'Q' : id === 'salvo' ? 'R' : String(++n);
    b.innerHTML = `<i></i><b>${abilShort(id, s)}</b><small>${isTouch ? '' : key}</small>`;
    b.title = abilName(id, s);
    b.addEventListener('pointerdown', e => { e.preventDefault(); input.abil = id; });
    bar.appendChild(b);
  }
  game.abilT = 0;
}
function updateAbilityUI(dt) {
  game.abilT = (game.abilT || 0) - dt;
  if (game.abilT > 0 || !flagship) return;
  game.abilT = 0.15;
  const s = flagship;
  for (const b of $('abil').children) {
    const id = b.dataset.id, A = ABIL[id], left = Math.max(0, (s.cd[id] || 0) - game.t);
    b.style.setProperty('--cd', A.cd ? (left / A.cd).toFixed(3) : 0);
    const active = (id === 'aegis' && s.aegisT > 0) || (id === 'ew' && s.ewT > 0) || (id === 'sprint' && s.sprintT > 0) || (id === 'sonar' && s.pingT > 0) || (id === 'depth' && s.depthWant !== 60);
    b.classList.toggle('act', !!active);
    b.classList.toggle('off', !!(A.can && !A.can(s)));
    if (id === 'depth') b.querySelector('b').textContent = `深度 ${s.depthWant ?? 60}m`;
  }
}
for (const b of document.querySelectorAll('#gears button')) b.addEventListener('pointerdown', e => { e.preventDefault(); if (b.dataset.step) setGear(flagship.gear + +b.dataset.step); else setGear(+b.dataset.g); });

/* ---------- spectator: follow any unit of either side, free camera, auto director, take control ---------- */
function specUnits(filter = game.specFilter || 'all') {
  const out = [];
  const ok = u => filter === 'all' || filter === u.side || (filter === 'ship' && u.kind === 'ship') || (filter === 'air' && u.kind === 'plane') || (filter === 'msl' && u.kind === 'msl');
  for (const s of ships) if (s.alive && !s.dying && ok(s)) out.push(s);
  for (const b of bases) if (b.alive && (filter === 'all' || filter === b.side || filter === 'ship')) out.push(b);
  for (const p of planes) if (p.alive && !p.dying && p.state === 'air' && ok(p)) out.push(p);
  if (filter === 'msl' || filter === 'all') for (const m of missiles) if (m.alive && m.cls === 'ashm' && ok(m)) out.push(m);
  return out;
}
function specFollow(u) {
  game.focus = u; game.spec = 'follow'; game.snap = 2; game.viewT = 1e9;
  specButtons();
}
function specButtons() {
  $('sp-auto').classList.toggle('on', game.spec === 'auto');
  $('sp-free').classList.toggle('on', game.spec === 'free');
  $('sp-list').classList.toggle('on', !$('spec').hidden);
  const f = game.focus;
  $('sp-take').hidden = !(f && f.side === game.side && (f.kind === 'ship' || (f.kind === 'plane' && f.state === 'air')));
  $('stick-zone').hidden = camRole() && game.spec !== 'free';
}
function renderSpecList() {
  if (game.roster) { renderRoster(); return; }
  $('spec-tabs').hidden = false; const rh = $('spec').querySelector('.rhead'); if (rh) rh.remove();
  const ul = $('spec-list'); ul.innerHTML = '';
  for (const u of specUnits()) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; if (u === game.focus) b.className = 'on';
    const what = u.kind === 'ship' ? `${u.S.type} · ${Math.round(u.hp / u.maxHp * 100)}%${u.S.sub ? ` · 深 ${Math.round(u.depth)} m` : ''}` : u.kind === 'base' ? '岛礁机场' : u.kind === 'plane' ? `${MODE_TEXT[u.pilot && u.pilot.mode] || u.role} · ${Math.round(u.pos.y)} m` : `${u.spec.name} → ${u.target ? u.target.name : '?'}`;
    b.innerHTML = `<b>${u.name}</b><em style="color:${u.side === 'cn' ? 'var(--cn)' : 'var(--us)'}">${u.side === 'cn' ? '解放军' : '美军'}</em><span>${what}</span>`;
    b.onclick = () => { specFollow(u); renderSpecList(); };
    li.appendChild(b); ul.appendChild(li);
  }
}
$('sp-list').onclick = () => { game.roster = false; $('spec').hidden = !$('spec').hidden; if (!$('spec').hidden) renderSpecList(); specButtons(); };
$('sp-auto').onclick = () => { game.spec = 'auto'; game.viewT = 0; specButtons(); };
$('sp-free').onclick = () => {
  game.spec = game.spec === 'free' ? 'follow' : 'free';
  if (game.spec === 'free') { freeCam.pos.copy(camera.position); camera.getWorldDirection(_a); freeCam.yaw = Math.atan2(-_a.z, _a.x); freeCam.pitch = Math.asin(clamp(_a.y, -1, 1)); }
  specButtons();
};
const cycleFocus = d => { const list = specUnits(); if (!list.length) return; const i = list.indexOf(game.focus); specFollow(list[(i + d + list.length) % list.length]); if (!$('spec').hidden) renderSpecList(); };
$('sp-prev').onclick = () => cycleFocus(-1);
$('sp-next').onclick = () => cycleFocus(1);
$('sp-take').onclick = () => {
  const f = game.focus;
  if (!f || f.side !== game.side) return;
  if (f.kind === 'ship') takeRole('captain', f);
  else if (f.kind === 'plane') takeRole('pilot', f);
};
for (const b of document.querySelectorAll('#spec-tabs button')) b.onclick = () => { game.specFilter = b.dataset.f; for (const x of document.querySelectorAll('#spec-tabs button')) x.classList.toggle('on', x === b); renderSpecList(); };
// free camera: drag to look, the stick flies, pinch / wheel changes altitude
const freeCam = { pos: new V3(0, 400, 0), yaw: 0, pitch: -0.2 };
function updateFreeCam(dt) {
  const fc = freeCam, k = input.keys;
  const fx = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + input.rawY, sx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + input.rawX;
  const v = clamp(fc.pos.y * 1.2, 80, 2500) * (k.has('ShiftLeft') ? 3 : 1);
  _a.set(Math.cos(fc.yaw), 0, -Math.sin(fc.yaw)); _b.set(Math.sin(fc.yaw), 0, Math.cos(fc.yaw));
  fc.pos.addScaledVector(_a, fx * v * dt).addScaledVector(_b, sx * v * dt);
  if (k.has('KeyE')) fc.pos.y += v * dt; if (k.has('KeyQ')) fc.pos.y -= v * dt;
  fc.pos.y = clamp(fc.pos.y * Math.pow(game.zoom || 1, dt * 2), 6, 30000);
  game.zoom += (1 - (game.zoom || 1)) * (1 - Math.exp(-dt * 3));
  camera.position.copy(fc.pos);
  camera.up.copy(Y_AXIS);
  camera.lookAt(_c.copy(fc.pos).add(_d.set(Math.cos(fc.yaw) * Math.cos(fc.pitch), Math.sin(fc.pitch), -Math.sin(fc.yaw) * Math.cos(fc.pitch))));
}

/* ---------- the unit roster: jump into any friendly unit at any moment, from any role ---------- */
function toggleRoster() {
  if (game.mode !== 'play') return;
  const open = !(game.roster && !$('spec').hidden);
  game.roster = open; $('spec').hidden = !open;
  $('b-units').classList.toggle('on', open);
  if (open) renderRoster();
}
function renderRoster() {
  const side = game.side, ul = $('spec-list'); ul.innerHTML = '';
  $('spec-tabs').hidden = true;
  let rh = $('spec').querySelector('.rhead');
  if (!rh) { rh = document.createElement('div'); rh.className = 'rhead'; $('spec').insertBefore(rh, ul); }
  rh.innerHTML = `<span>切换单位 · ${SIDES[side].name}</span><button type="button">关闭</button>`;
  rh.querySelector('button').onclick = toggleRoster;
  const sep = t => { const li = document.createElement('li'); li.className = 'sep'; li.textContent = t; ul.appendChild(li); };
  const add = (title, sub, tag, fn, on = false) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; if (on) b.className = 'on';
    b.innerHTML = `<b>${title}</b><em style="color:var(--gold)">${tag}</em><span>${sub}</span>`;
    b.onclick = () => { game.roster = false; $('spec').hidden = true; $('b-units').classList.remove('on'); fn(); };
    li.appendChild(b); ul.appendChild(li);
  };
  if (game.role !== 'cmd') add('战区指挥官', '回到全局指挥 · 主攻方向、编队、大规模打击', '指挥', () => takeRole('cmd'));
  sep('舰艇');
  for (const s of ships.filter(x => x.side === side && x.alive && !x.dying))
    add(s.name, `${s.S.type} · 完好 ${Math.round(s.hp / s.maxHp * 100)}%${s.carrier ? ` · 机库 ${Object.values(s.hangar).reduce((a, b) => a + b, 0)}` : ''}${s.S.sub ? ` · 深 ${Math.round(s.depth)} m` : ''}`, s.S.sub ? '艇长' : '舰长', () => takeRole('captain', s), s === flagship);
  const air = planes.filter(p => p.side === side && p.alive && !p.dying && p.state === 'air');
  if (air.length) sep(`空中 · ${air.length} 架`);
  for (const p of air.sort((a, b) => (b.ashmN > 0) - (a.ashmN > 0) || a.name.localeCompare(b.name)))
    add(p.name.replace('（你）', ''), `${MODE_TEXT[p.pilot && p.pilot.mode] || p.role} · ${Math.round(p.pos.y)} m · 油 ${Math.round(p.fuel / p.T.fuel * 100)}%`, '接管', () => takeRole('pilot', p), p === player);
  const inv = airInventory(side);
  if (Object.keys(inv).length) sep('机库 · 新出击');
  for (const [t, x] of Object.entries(inv)) add(`出击 · ${AC[t].name}`, `${x.guam ? '关岛' : x.homes.map(([h, n]) => `${h.name} ${n}`).join(' / ')} 架`, '飞行员', () => takeRole('pilot', t));
}
// the theatre commander's order bar
function cmdCarriers() { return ships.filter(s => s.side === game.side && s.carrier && s.alive && !s.dying); }
function cmdTarget() { const t = intentTarget(game.side) || (game.ashmSel && game.ashmSel.alive && !game.ashmSel.dying && !(game.ashmSel.S && game.ashmSel.S.sub) ? game.ashmSel : null); return t; }
const cmdCd = { alpha: 600, strike: 120, cap: 60, feint: 300 };
function cmdReady(k) { game.cmdT = game.cmdT || {}; return !(game.cmdT[k] > game.t); }
function cmdUse(k) { game.cmdT[k] = game.t + cmdCd[k]; cmdButtons(); }
function cmdButtons() {
  if (game.role !== 'cmd') return;
  game.cmdT = game.cmdT || {};
  const lab = (id, name, k) => { const left = k && game.cmdT[k] > game.t ? Math.ceil(game.cmdT[k] - game.t) : 0; const b = $(id); b.innerHTML = `${name}${left ? `<small>${left}s</small>` : ''}`; b.classList.toggle('cd', !!left); };
  lab('cm-alpha', '大规模打击', 'alpha'); lab('cm-strike', '攻击编队', 'strike'); lab('cm-cap', '加强巡逻', 'cap'); lab('cm-feint', '电子佯动', 'feint');
  $('cm-emcon').classList.toggle('on', tac(game.side).navy === 'emcon');
  const C = command[game.side], ph = phaseOf(game.side), P = planOf(game.side);
  $('cm-jcc').innerHTML = `指挥中心${ph && P ? `<small>${C.ph.i + 1}/${P.phases.length} ${ph.name}</small>` : ''}`;
  $('cm-staff').innerHTML = `参谋权限<small>${ROE.auth[authOf()][0]}</small>`;
}
$('cm-alpha').onclick = () => {
  if (!cmdReady('alpha')) return;
  const t = cmdTarget(); if (!t) { message('先指定主攻目标', '在战术地图上点选敌舰', '#9fb0ba', 1.8); return; }
  let n = 0; for (const h of cmdCarriers()) if (alphaStrike(h, t)) n++;
  if (n) { cmdUse('alpha'); command[game.side].alphaCd = 900; radio('战区指挥', `命令：${n} 艘航母甲板全力出动，对${t.name}实施大规模打击！`, GOLD); }
  else message('无法发起大规模打击', '航母机库攻击机不足', '#9fb0ba', 1.8);
};
$('cm-strike').onclick = () => {
  if (!cmdReady('strike')) return;
  const t = cmdTarget(); if (!t) { message('先指定主攻目标', '在战术地图上点选敌舰', '#9fb0ba', 1.8); return; }
  let n = 0; for (const h of cmdCarriers().concat(bases.filter(b => b.side === game.side && b.alive))) if (launchPackage(h, t, { n: 6, esc: 2 })) n++;
  if (n) cmdUse('strike'); else message('机库无可用攻击机', '', '#9fb0ba', 1.6);
};
$('cm-cap').onclick = () => {
  if (!cmdReady('cap')) return;
  let n = 0;
  for (const h of cmdCarriers()) for (let i = 0; i < 3; i++) { const ty = ['j35', 'f35c', 'fa18', 'j15'].find(x => h.hangar[x] > 0); if (ty && launchFrom(h, ty, 'cap', { off: rand(10000, 20000), latZ: rand(-12000, 12000) })) n++; }
  if (n) { cmdUse('cap'); radio('空中指挥', `${n} 架战斗机紧急升空，加强舰队空中巡逻。`, '#9fd4ff'); }
};
$('cm-emcon').onclick = () => {
  const C = command[game.side], A = tac(game.side).navy === 'emcon';
  if (A) setEmcon(game.side, C.emconWas || 'B');
  else { C.emconWas = C.roe.emcon === 'A' ? 'B' : C.roe.emcon; setEmcon(game.side, 'A'); }
  jlog(game.side, `电磁管控：${ROE.emcon[C.roe.emcon][0]}`);
  cmdButtons();
};
$('cm-feint').onclick = () => {
  if (!cmdReady('feint')) return;
  if (deployPhantom(game.side)) { cmdUse('feint'); if (tac(game.side).navy !== 'emcon') message('建议配合电磁静默', '真编队的雷达信号会让佯动失去意义', '#ffc861', 2.2); }
  else message('无法佯动', '需要航母编队在场', '#9fb0ba', 1.6);
};
$('cm-staff').onclick = () => { const order = ['negation', 'approve', 'delegate'], C = command[game.side]; C.auth = order[(order.indexOf(authOf()) + 1) % 3]; radio('参谋部', `指挥方式：${ROE.auth[C.auth][0]}。${ROE.auth[C.auth][1]}`, '#9fd4ff'); jlog(game.side, `参谋权限：${ROE.auth[C.auth][0]}`); renderProps(); cmdButtons(); };
$('cm-jcc').onclick = () => toggleJCC();

/* ---------- theatre support: the side's strategic card, open to every role ---------- */
function supportReady() { return game.mode === 'play' && game.t > (game.supportT || 120); }
function callSupport() {
  if (!supportReady()) { message('战区支援准备中', `${Math.ceil((game.supportT || 120) - game.t)} 秒`, '#9fb0ba', 1.6); return; }
  let ok = false;
  if (game.side === 'cn') ok = rocketForce('cn', 4, (game.supportN || 0) % 2 ? 'df26' : 'df21d');
  else {
    const t = game.ashmSel || bestTarget('us', fleetCentre('us') || new V3(), 220000);
    if (t && command.us.b1b > 0) {
      for (let i = 0; i < 2 && command.us.b1b > 0; i++) {
        command.us.b1b--;
        const pl = new Plane('us', 'b1b', null);
        pl.pilot = new Pilot(pl, 0.75); pl.role = 'bomber'; pl.task = { target: t };
        pl.name = `B-1B ${callsign('us')}`;
        pl.pos.set(THEATRE.air - 14000, 6500, rand(-15000, 15000) + i * 500); setBasis(pl.q, new V3(-1, 0, 0), Y_AXIS); pl.speed = 260; pl.axes(); pl.sync();
        planes.push(pl);
      }
      radio('空中指挥', `B-1B 双机携 8 枚 LRASM 突入，目标${t.name}。`, '#9fd4ff');
      ok = true;
    }
  }
  if (ok) { game.supportT = game.t + 300; game.supportN = (game.supportN || 0) + 1; }
  else message('无法呼叫支援', game.side === 'cn' ? '需要实时掌握敌航母位置' : '无可用目标或 B-1B 已耗尽', '#9fb0ba', 2);
}
