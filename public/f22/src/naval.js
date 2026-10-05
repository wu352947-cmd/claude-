/* ---------- naval warfare: handling, modules, submarines, torpedoes, strategic strikes, abilities ----------
   Inlined into navwar.js (shares its scope).
   Handling: surface combatants and submarines move on a compressed tactical clock (as in naval action games):
   faster acceleration, tighter turns and 2.2x ground speed, so a destroyer duel plays out in minutes. Carriers keep
   real speed so deck operations stay true. The bridge telegraph has six steps.
   Damage: hits can knock out modules (gun, engine, rudder, radar), start fires and flooding, and a heavy hit on a
   loaded VLS can set off the magazine.
   Submarines: invisible to radar below periscope depth, heard by hull sonar and towed arrays at a range that grows
   with their speed and every transient they make (launches, pings). They kill with heavyweight torpedoes.
   Strategic strikes: the PLA Rocket Force's DF-21D / DF-26 anti-ship ballistic missiles, the US Navy's Tomahawks.
   Abilities: each class has its own set with cooldowns, used by the player and by AI captains alike. */
const TACT = {
  surface: { move: 2.2, turn: 2.2, acc: 5, bite: 1.0 },
  carrier: { move: 1, turn: 1.4, acc: 2.2, bite: 1.8 },
  sub: { move: 1.9, turn: 2.0, acc: 4, bite: 1.2 }
};
const tact = s => s.S.sub ? TACT.sub : s.carrier ? TACT.carrier : TACT.surface;
const GEARS = [['后退', -0.3], ['停车', 0], ['1/4', 0.25], ['1/2', 0.5], ['3/4', 0.75], ['全速', 1]];

MSL.df21d = { name: '东风-21D', cls: 'ashm', profile: 'ballistic', v: 2900, range: 1e7, dmg: 430, rcs: 0.5, call: '火箭军 东风-21D' };
MSL.df26 = { name: '东风-26', cls: 'ashm', profile: 'ballistic', v: 3200, range: 1e7, dmg: 500, rcs: 0.55, call: '火箭军 东风-26' };
MSL.tlam = { name: '战斧', cls: 'ashm', profile: 'sub', v: 245, range: 1.6e6, dmg: 130, rcs: 0.7, skim: 12 };
MSL.mst = { name: '海上打击战斧', cls: 'ashm', profile: 'sub', v: 245, range: 1e6, dmg: 200, rcs: 0.7, skim: 8, smart: true };
// anti-radiation missiles: home on a radiating ship's radar (a quiet ship gives them nothing to home on)
MSL.aargm = { name: 'AARGM-ER', cls: 'ashm', profile: 'high', v: 1050, range: 60000, dmg: 55, rcs: 0.4, cruise: 9000, skimAt: 7000, arm: true };
MSL.yj91 = { name: '鹰击-91', cls: 'ashm', profile: 'high', v: 1100, range: 55000, dmg: 60, rcs: 0.5, cruise: 8000, skimAt: 7000, arm: true };
MSL.sm3 = { name: '标准-3', cls: 'sam', v: 3000, range: 400000, pk: 1.5, exo: true };   // pk scaled by PK_MUL.ballistic
PK_MUL.ballistic = 0.38;
CIWS_PK.ballistic = 0.03;
const TORP = {
  yu6: { name: '鱼-6 重型鱼雷', v: 32, range: 30000, dmg: 430, seek: 2600 },
  mk48: { name: 'Mk 48 重型鱼雷', v: 33, range: 32000, dmg: 450, seek: 2800 },
  light: { name: '轻型反潜鱼雷', v: 24, range: 3000, dmg: 160, seek: 1500 }
};
const torps = [];

/* ---------- ribbons: what your own weapons just did (命中, 击穿, 起火, 进水, 殉爆, 击沉, 拦截...) ---------- */
function ribbon(text, color = '#ffd28a') {
  game.ribbons = game.ribbons || [];
  const r = game.ribbons.find(x => x.text === text && x.t > 1.5);
  if (r) { r.n++; r.t = 3; return; }
  game.ribbons.push({ text, color, n: 1, t: 3 });
  if (game.ribbons.length > 5) game.ribbons.shift();
}
const playerOwns = src => src && src.owner && (src.owner === player || src.owner === flagship || (flagship && src.owner.owner === flagship));

/* ---------- module damage ---------- */
function moduleHit(s, dmg, src, kind) {
  s.mods = s.mods || { gun: 0, engine: 0, rudder: 0 };
  const mine_ = playerOwns(src);
  if (kind === 'torp') {
    s.flood = Math.min(4, (s.flood || 0) + 1.6);
    s.list = clamp(s.list + rand(0.02, 0.05) * (Math.random() < 0.5 ? -1 : 1), -0.12, 0.12);
    if (mine_) ribbon('进水', '#7fc8ff');
    if (Math.random() < 0.5) { s.mods.engine = 45; if (mine(s)) radio(s.name, '轮机舱进水，航速下降！', '#ff8a78'); }
  }
  const roll = Math.random();
  if (dmg > 40 && roll < 0.18 && s.gun) { s.mods.gun = 35; if (mine_) ribbon('主炮损毁'); if (s === flagship) message('主炮损毁', '损管抢修中', '#ff8a78', 2); }
  else if (dmg > 40 && roll < 0.3) { s.mods.engine = Math.max(s.mods.engine, 30); if (mine_) ribbon('动力受损'); if (s === flagship) message('动力受损', '航速减半', '#ff8a78', 2); }
  else if (dmg > 40 && roll < 0.4) { s.mods.rudder = 18; s.rudderJam = s.helm; if (mine_) ribbon('舵机卡死'); if (s === flagship) message('舵机卡死', '舵角锁定 18 秒', '#ff8a78', 2); }
  // magazine: a heavy hit on a ship with missiles still in its cells can set them off
  const cells = Object.values(s.ashm).reduce((a, b) => a + b, 0) + Object.values(s.sam).reduce((a, b) => a + b, 0);
  if (!s.carrier && !s.S.sub && dmg >= 150 && cells > 12 && Math.random() < 0.06) {
    s.hp -= s.maxHp * 0.6;
    for (let i = 0; i < 4; i++) explode(toWorld(s, rand(-0.2, 0.3) * s.S.L, s.h * rand(0.3, 0.8), rand(-5, 5)), 3.2, null);
    for (let i = 0; i < 60; i++) { _d.set(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize().multiplyScalar(rand(40, 140)); fire.emit(s.pos.x, s.h, s.pos.z, _d.x, _d.y, _d.z, rand(1, 2.4), 20, 70, 1.4, 0.8, 0.4, 1, 0.6, 18); }
    message(`${s.name} 弹药库殉爆`, mine(s) ? '垂发单元连锁爆炸' : '一击致命', mine(s) ? '#ff8a78' : '#8dffb4', 4);
    if (mine_) ribbon('殉爆', '#ff6a4a');
    game.shake = Math.max(game.shake, 2.4);
  }
}
function updateModules(s, dt) {
  const M = s.mods; if (!M) return;
  const k = s.dcT > 0 ? 3 : 1;
  for (const key of ['gun', 'engine', 'rudder']) if (M[key] > 0) M[key] = Math.max(0, M[key] - dt * k);
  if (s.flood > 0) {
    s.hp -= s.flood * 1.1 * dt;
    s.flood = Math.max(0, s.flood - dt * (s.dcT > 0 ? 0.12 : 0.01));
    if (s.hp <= 0) sinkShip(s, null);
  }
}

/* ---------- submarines ---------- */
const isSub = e => e && e.kind === 'ship' && e.S.sub;
const submerged = e => isSub(e) && e.depth > 6;
// how far a sensor ship can hear this submarine: quiet when slow and deep, loud when fast, launching or pinging
function subNoise(sub) {
  const sp = Math.abs(sub.speed) / sub.S.vmax;
  let k = 0.3 + 0.7 * sp * sp;
  if (game.t - (sub.lastLaunch || -99) < 30) k *= 2.6;
  if (sub.pingT > 0) k *= 3;
  if (sub.depth > 90) k *= 0.8;
  return k;
}
let sonarT = 0;
function updateSonar(dt) {
  sonarT -= dt;
  if (sonarT > 0) return;
  sonarT = 1;
  for (const sub of ships) {
    if (!sub.alive || sub.dying || !isSub(sub)) continue;
    const noise = subNoise(sub);
    for (const s of ships) {
      if (!s.alive || s.dying || s.side === sub.side || !s.S.sonar) continue;
      const R = s.S.sonar * noise * (s.pingT > 0 ? 2.2 : 1) * (isSub(s) ? 1.2 : 1);
      if (s.pos.distanceTo(sub.pos) > R) continue;
      const P = picture[s.side];
      let tr = P.get(sub);
      if (!tr) { tr = { pos: new V3(), vel: new V3(), t: 0, first: game.t }; P.set(sub, tr); if (mine(s) || mine(sub)) radio(mine(s) ? s.name : '潜艇', mine(s) ? `声呐接触！水下目标，方位 ${bearingTo(s, sub)}。` : '我们被敌方声呐发现了！', mine(s) ? '#ffd28a' : '#ff8a78'); }
      tr.pos.copy(sub.pos); tr.vel.copy(sub.vel); tr.t = game.t; tr.sonar = true;
      break;
    }
  }
  // submarines hear surface ships a long way off and share them over the data link
  for (const sub of ships) {
    if (!sub.alive || sub.dying || !isSub(sub)) continue;
    for (const s of ships) {
      if (!s.alive || s.dying || s.side === sub.side || isSub(s)) continue;
      if (s.pos.distanceTo(sub.pos) > sub.S.sonar * (s.speed > 10 ? 1.2 : 0.8)) continue;
      const P = picture[sub.side];
      let tr = P.get(s);
      if (!tr) { tr = { pos: new V3(), vel: new V3(), t: 0, first: game.t }; P.set(s, tr); }
      tr.pos.copy(s.pos); tr.vel.copy(s.vel); tr.t = game.t;
      if (!firstSeen[sub.side]) { firstSeen[sub.side] = true; onFirstContact(sub.side, s); }
    }
  }
}
function bearingTo(a, b) { return String(Math.round(((90 - headingOf(_e.subVectors(b.pos, a.pos)) / D2R) % 360 + 360) % 360)).padStart(3, '0') + '°'; }
// the submarine's depth: periscope 18 m, patrol 60 m, deep 140 m. Hull goes under; the periscope leaves a feather
function updateDepth(s, dt) {
  if (!isSub(s)) return;
  const want = s.depthWant ?? 60;
  s.depth = s.depth ?? 60;
  s.depth += clamp(want - s.depth, -6 * dt, 6 * dt);
}
function torpedo(owner, target, type, aimDir) {
  const T = TORP[type];
  const from = owner.kind === 'ship' ? toWorld(owner, owner.S.L * 0.42, 0, 0, new V3()) : owner.pos.clone();
  from.y = -Math.min(owner.depth || 8, 30);
  const dir = aimDir ? aimDir.clone().setY(0).normalize() : _a.subVectors(target.pos, from).setY(0).normalize().clone();
  const t = { kind: 'torp', spec: T, type, range: T.range, side: owner.side, owner, target, pos: from, dir, speed: T.v * 0.6, run: 0, alive: true, seeking: false, decoyRoll: false, h: 0, name: T.name, vel: new V3() };
  torps.push(t); dbg.torps = (dbg.torps || 0) + 1;
  if (owner.kind === 'ship') owner.lastLaunch = game.t;
  if (near(from, 6000)) Sound.burst(0.6, 600, 120, clamp(1 - from.distanceTo(camera.position) / 6000, 0, 0.4));
  return t;
}
function updateTorps(dt) {
  for (let i = torps.length - 1; i >= 0; i--) {
    const t = torps[i];
    t.speed += (t.spec.v * TACT.sub.move - t.speed) * (1 - Math.exp(-dt * 0.8));
    const tg = t.target;
    // wire-guided toward the target's track, then the seeker takes over inside its acquisition range
    if (tg && tg.alive && !tg.dying) {
      const d = tg.pos.distanceTo(t.pos);
      if (!t.seeking && d < t.spec.seek) t.seeking = true;
      if (t.seeking || fresh(t.side, tg, 8) || t.type === 'light') {
        const tgo = d / Math.max(t.speed, 10);
        _a.copy(tg.pos).addScaledVector(tg.vel || ZERO, tgo * 0.9).sub(t.pos).setY(0).normalize();
        const ang = Math.acos(clamp(_a.dot(t.dir), -1, 1)), cr = t.dir.x * _a.z - t.dir.z * _a.x;
        const rate = (t.seeking ? 0.5 : 0.18) * dt;
        t.dir.applyAxisAngle(Y_AXIS, -Math.sign(cr) * Math.min(ang, rate)).normalize();
      }
      // torpedo decoys (Nixie / countermeasure) seduce a homing torpedo once
      if (t.seeking && !t.decoyRoll && tg.kind === 'ship' && d < 1500) {
        t.decoyRoll = true;
        if (tg.decoys > 0 && Math.random() < 0.3) { tg.decoys--; t.target = null; if (mine(tg)) radio(tg.name, '鱼雷诱饵生效！', '#9fd4ff'); }
      }
    }
    t.vel.copy(t.dir).multiplyScalar(t.speed);
    t.pos.addScaledVector(t.vel, dt);
    t.run += t.speed * dt;
    // a wake of bubbles on the surface
    if (near(t.pos, 4000) && Math.random() < dt * 14) smoke.emit(t.pos.x, 0.3, t.pos.z, 0, 0.4, 0, 3, 2, 7, 0.9, 0.95, 0.97, 0.55, 0.2);
    let hit = null;
    for (const s of ships) {
      if (!s.alive || s.dying || s.side === t.side) continue;
      if (Math.abs(s.pos.x - t.pos.x) > s.radius + 20 || Math.abs(s.pos.z - t.pos.z) > s.radius + 20) continue;
      _b.copy(t.pos); _b.y = isSub(s) ? -s.depth : -3;
      if (insideShip(s, _b, 3) || (isSub(s) && s.pos.distanceTo(_c.set(t.pos.x, s.pos.y, t.pos.z)) < 25)) { hit = s; break; }
    }
    if (hit) {
      const p = _b.set(t.pos.x, 0, t.pos.z).clone();
      // the column of water from a keel-breaking hit
      if (near(p, 15000)) for (let k = 0; k < 90; k++) { _d.set(rand(-0.25, 0.25), 1, rand(-0.25, 0.25)).normalize().multiplyScalar(rand(30, 95)); smoke.emit(p.x, 1, p.z, _d.x, _d.y, _d.z, rand(2.5, 4.5), 12, 60, 0.94, 0.96, 0.98, 0.95, 0.5, 16); }
      dbg.torpHit = (dbg.torpHit || 0) + 1;
      damageShip(hit, t.spec.dmg * rand(0.85, 1.15), { owner: t.owner, kind: 'torp', name: t.spec.name }, p);
      if (playerOwns({ owner: t.owner })) ribbon('鱼雷命中', '#7fc8ff');
      torps.splice(i, 1); continue;
    }
    if (t.run > t.spec.range) torps.splice(i, 1);
  }
}
// anti-submarine rocket: flies to the contact, drops a homing lightweight torpedo
function launchASW(s, sub) {
  s.asw--; s.aswCd = 25; dbg.asw = (dbg.asw || 0) + 1;
  const tp = trackPos(s.side, sub, new V3()) || sub.pos.clone();
  const from = toWorld(s, s.S.L * 0.2, s.h * 0.4, 0, new V3());
  const m = { kind: 'msl', cls: 'asw', side: s.side, owner: s, target: sub, aim: tp, pos: from, prev: from.clone(), dir: new V3(0, 1, 0), vel: new V3(), speed: 260, age: 0, alive: true,
    mesh: mslMesh(geoM.sub, 0.8), rcs: 0.1, h: 0, spec: { name: s.side === 'cn' ? '鱼-8 反潜导弹' : 'ASROC 反潜火箭', cls: 'asw' } };
  missiles.push(m);
  for (let i = 0; i < 12; i++) smoke.emit(from.x, from.y, from.z, rand(-5, 5), rand(5, 14), rand(-5, 5), rand(2, 4), 8, 30, 0.9, 0.9, 0.9, 0.7, 0.6);
  if (mine(s)) radio(s.name, `${m.spec.name}发射，攻击水下目标！`, '#9fd4ff');
}
function updateASW(m, i, dt) {
  // mid-course update over the datalink: the drop point follows the held track, led by the boat's motion
  if (m.target && m.target.alive && fresh(m.side, m.target, 6) && trackPos(m.side, m.target, m.aim)) {
    const hd0 = Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z);
    m.aim.addScaledVector(m.target.vel || ZERO, Math.min(hd0 / Math.max(m.speed, 100), 40));
  }
  const hd = Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z);
  _md.subVectors(m.aim, m.pos).setY(0).normalize();
  const up = clamp((hd - 600) / 4000, -0.6, 0.6);
  _md.y = up; _md.normalize();
  steer(m, _md, 1.2, dt);
  m.prev.copy(m.pos);
  m.vel.copy(m.dir).multiplyScalar(m.speed); m.pos.addScaledVector(m.vel, dt);
  trail(m, 1, 5, 0.9);
  m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.dir);
  if (hd < 400 || m.pos.y < 2) {
    splash(m.pos, 0.6);
    const lt = torpedo({ kind: 'drop', pos: m.pos.clone().setY(-20), side: m.side, depth: 20 }, m.target, 'light', _a.subVectors(m.target.pos, m.pos));
    lt.owner = m.owner; lt.seeking = true;
    endMissile(m, i, false);
  }
}
// what the submarine AI does: creep toward the enemy, close to torpedo range, fire, go deep and run
function subAI(s, dt) {
  const foes = [...picture[s.side]].filter(([e, tr]) => e.kind === 'ship' && e.alive && !e.dying && !isSub(e) && game.t - tr.t < 60);
  let best = null, bd = 1e12;
  // the main target pulls hardest: a submarine goes for it over a closer escort
  const main = intentTarget(s.side);
  for (const [e] of foes) { const d = e.pos.distanceTo(s.pos) - (e.carrier ? 4000 : 0) - (e === main ? 25000 : 0); if (d < bd) { bd = d; best = e; } }
  if (best && best.pos.distanceTo(s.pos) > 45000) best = null;
  s.aiT = (s.aiT || 0) - dt;
  const C = command[s.side];
  let want = C.course, spd = 6, depth = 90;
  // no contact close enough: the boats run ahead of the fleet down the main axis to an ambush position
  const ip = (C.subPt && (C.subOrder || s.grp) !== 'esc') ? _c.copy(C.subPt) : intentPos(s.side, _c);
  const esc = (C.subOrder || s.grp) === 'esc';
  if (esc && best && best.pos.distanceTo(s.pos) > 20000) best = null;
  if (esc && !best) {
    // close escort: a few km ahead of the carriers on the axis, listening for enemy boats
    const g = ships.find(x => x.side === s.side && x.carrier && x.alive && !x.dying);
    if (g) { axisDir(s.side, g.pos, _d); _c.copy(g.pos).addScaledVector(_d, 7000); const d = _c.distanceTo(s.pos); want = headingOf(_c.sub(s.pos)); spd = d > 3000 ? 12 : 5; depth = 80; }
  } else if (ip && !best) { const d = ip.distanceTo(s.pos); if (d > 12000) { want = headingOf(_c.sub(s.pos)); spd = 11; depth = 120; } }
  if (best) {
    const d = best.pos.distanceTo(s.pos);
    want = headingOf(_a.subVectors(best.pos, s.pos));
    spd = d > 16000 ? 13 : 6;
    depth = d < 16000 ? 50 : 100;
    if (s.aiT <= 0 && d < 14000 && s.torpsN > 0) {
      s.aiT = 50;
      const n = Math.min(s.torpsN, best.carrier ? 4 : 2);
      for (let k = 0; k < n; k++) { const off = (k - (n - 1) / 2) * 0.05; const dir = _b.subVectors(best.pos, s.pos).setY(0).normalize().applyAxisAngle(Y_AXIS, off); torpedo(s, best, s.S.torpType, dir); s.torpsN--; }
      if (mine(s)) radio(s.name, `${n} 枚鱼雷出管，目标${best.name}。`, '#9fd4ff');
      else if (game.side && Math.random() < 0.7) radio('声呐', `鱼雷入水声！${n} 条鱼雷来袭！`, '#ff8a78');
      s.evadeT = 40;
    } else if (s.aiT <= 0 && d > 20000 && d < 70000 && Object.values(s.ashm).some(n => n > 0) && fresh(s.side, best, 20)) {
      s.aiT = 120;
      const k = Object.keys(s.ashm).find(x => s.ashm[x] > 0 && MSL[x].range * 0.95 > d);
      if (k) { for (let j = 0; j < Math.min(3, s.ashm[k]); j++) pending.push({ t: game.t + j * 1.5, fn: () => { if (s.alive && !s.dying && s.ashm[k] > 0) { s.ashm[k]--; launchASHM(s, best, k); s.lastLaunch = game.t; } } }); }
    }
  }
  if (s.evadeT > 0) { s.evadeT -= dt; want = wrapA(want + Math.PI * 0.7); spd = 12; depth = 140; }
  // a sub that knows it is being hunted goes deep and fast, dropping a noisemaker
  if (torps.some(t => t.target === s && t.pos.distanceTo(s.pos) < 3000) && s.decoys > 0 && (s.decoyCd || 0) <= 0) { s.decoys--; s.decoyCd = 20; for (const t of torps) if (t.target === s && Math.random() < 0.45) t.target = null; }
  s.decoyCd = (s.decoyCd || 0) - dt;
  s.depthWant = depth;
  s.rudder = clamp(wrapA(s.heading - want) * 2.5, -1, 1);
  s.order = spd;
}
// surface ships: hear torpedoes, turn away, fire ASW at sonar contacts
function shipASW(s, dt) {
  if (s.dying || isSub(s)) return;
  s.aswCd = (s.aswCd || 0) - dt;
  if (s.asw > 0 && s.aswCd <= 0) {
    let tgt = null, bd = 20000;
    // a fresh contact can be engaged out to 20 km; a hunter on an older datum closes to 12 km before it shoots
    for (const [e, tr] of picture[s.side]) if (isSub(e) && e.alive && !e.dying) { const age = game.t - tr.t, d = e.pos.distanceTo(s.pos); if ((age < 6 || (e === s.hunt && age < 20 && d < 12000)) && d < bd) { bd = d; tgt = e; } }
    if (tgt && (s !== flagship || game.ai)) launchASW(s, tgt);
  }
  const inbound = torps.find(t => t.side !== s.side && t.pos.distanceTo(s.pos) < 3500 && t.dir.dot(_a.subVectors(s.pos, t.pos).normalize()) > 0.6);
  if (inbound && !s.torpWarned) { s.torpWarned = game.t; if (mine(s)) radio(s.name, '鱼雷来袭！规避！', '#ff5a4f'); }
  if (!inbound) s.torpWarned = 0;
  if (inbound && s !== flagship) { s.evadeT = 12; s.evadeDir = headingOf(_a.subVectors(s.pos, inbound.pos)); }
}

/* ---------- strategic strikes ---------- */
// anti-ship ballistic missile: re-enters from the west at hypersonic speed, terminal manoeuvre, seeker on the carrier
function launchBallistic(side, target, type) {
  const spec = MSL[type];
  const aim = trackPos(side, target, new V3()) || target.pos.clone();
  const from = new V3(aim.x - 115000 + rand(-6000, 6000), 72000, aim.z + rand(-15000, 15000));
  const dir = _a.subVectors(aim, from).normalize().clone();
  const m = { kind: 'msl', cls: 'ashm', spec, side, owner: { kind: 'rocketforce', side, name: '火箭军', pos: from.clone() }, target, aim, pos: from, prev: from.clone(), dir,
    vel: dir.clone().multiplyScalar(spec.v), speed: spec.v, age: 0, alive: true, mesh: mslMesh(geoM.hyper, 1.4), locked: false, seekerOn: false, decoyRoll: new Set(),
    rcs: 3, h: 0, engaged: 0, phase: 'midcourse', weave: rand(0, 6), range: 1e9 };
  missiles.push(m); dbg.ashm++; dbg.by[side]++;
  return m;
}
function updateBallistic(m, i, dt) {
  const S = m.spec;
  if (m.target && m.target.alive && !m.target.dying && fresh(m.side, m.target, 10)) trackPos(m.side, m.target, m.aim);
  if (m.pos.y < 25000) m.rcs = 0.6;
  if (!m.seekerOn && m.pos.y < 30000) { m.seekerOn = true; const t = acquire(m); if (t) { m.target = t; m.locked = true; } m.phase = 'terminal'; }
  if (m.locked && m.target && m.target.alive) { const d = m.target.pos.distanceTo(m.pos); m.aim.copy(m.target.pos).addScaledVector(m.target.vel || ZERO, d / m.speed); }
  _md.subVectors(m.aim, m.pos).normalize();
  // terminal manoeuvre: a corkscrew that defeats a straight intercept
  if (m.phase === 'terminal' && m.pos.y > 2500) { _a.set(-_md.z, 0, _md.x).normalize(); _md.addScaledVector(_a, Math.sin(game.t * 2.2 + m.weave) * 0.18).normalize(); }
  steer(m, _md, m.phase === 'terminal' ? 0.5 : 0.15, dt);
  m.speed += ((m.phase === 'terminal' ? S.v * 0.7 : S.v) - m.speed) * (1 - Math.exp(-dt * 0.3));
  m.prev.copy(m.pos);
  m.vel.copy(m.dir).multiplyScalar(m.speed);
  m.pos.addScaledVector(m.vel, dt);
  // re-entry plasma
  if (near(m.pos, 60000)) {
    const glow = m.pos.y < 45000 ? 1 : 0.4;
    fire.emit(m.pos.x, m.pos.y, m.pos.z, m.vel.x * 0.9, m.vel.y * 0.9, m.vel.z * 0.9, 0.08, 60 * glow, 30, 1.6, 1.0, 0.6, 1);
    if (Math.random() < 0.6) smoke.emit(m.pos.x, m.pos.y, m.pos.z, 0, 0, 0, 3, 18, 60, 0.95, 0.9, 0.85, 0.5 * glow, 0.2);
  }
  m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.dir);
  if (m.pos.y < 60) {
    let hit = null;
    for (const s of ships) if (s.alive && !s.dying && s.side !== m.side && !submerged(s)) { const steps = Math.max(1, Math.ceil(m.prev.distanceTo(m.pos) / 10)); for (let k = 1; k <= steps; k++) { _d.lerpVectors(m.prev, m.pos, k / steps); if (insideShip(s, _d, 6)) { hit = s; break; } } if (hit) break; }
    if (hit) { dbg.hit++; dbg.hitBy[m.side]++; game.flags.dfHit = (game.flags.dfHit || 0) + 1; damageShip(hit, S.dmg * rand(0.85, 1.15), { owner: m.owner, kind: 'missile', name: S.name }, _d.clone()); explode(_d, 4, null); if (hit.carrier) { hit.deckClosed = game.t + 90; if (mine(hit) || game.side === m.side) radio(mine(hit) ? hit.name : '火箭军', mine(hit) ? '飞行甲板被击穿！弹射器停止工作！' : `东风命中${hit.name}！`, mine(hit) ? '#ff5a4f' : '#8dffb4'); } endMissile(m, i, false); return; }
    if (m.pos.y < 0.5) {
      // a near miss still sends a shock wave through a hull close by
      for (const s of ships) if (s.alive && !s.dying && s.side !== m.side && s.pos.distanceTo(_d.set(m.pos.x, 0, m.pos.z)) < s.radius + 60) damageShip(s, S.dmg * 0.25, { owner: m.owner, kind: 'missile', name: S.name }, null);
      for (let k = 0; k < 60; k++) { _d.set(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize().multiplyScalar(rand(40, 120)); smoke.emit(m.pos.x, 1, m.pos.z, _d.x, _d.y, _d.z, rand(3, 5), 16, 80, 0.94, 0.96, 0.98, 0.95, 0.4, 14); }
      dbg.miss++; endMissile(m, i, false);
    }
  }
}
// the PLA Rocket Force: a volley at the most valuable carrier the picture holds
function rocketForce(side, n = 4, type = 'df21d') {
  let tgt = null;
  for (const [e, tr] of picture[side]) if (e.kind === 'ship' && e.carrier && e.alive && !e.dying && game.t - tr.t < 30 && !tr.coarse && (!tgt || e.value > tgt.value)) tgt = e;
  // the main effort, if it is a ship with a fresh enough track for a ballistic shot
  const main = intentTarget(side);
  if (main && main.kind === 'ship' && fresh(side, main, 30)) tgt = main;
  if (!tgt) return false;
  for (let k = 0; k < n; k++) pending.push({ t: game.t + k * 1.6, fn: () => { if (tgt.alive) { const m = launchBallistic(side, tgt, type); if (k === 0) cineOn('ballistic', m); } } });
  const mineSide = side === game.side;
  chron(`火箭军 ${n} 枚${MSL[type].name}从大陆腾空，扑向${tgt.name}`, side, true);
  radio(mineSide ? '南部战区' : 'SPY-6 / 宙斯盾', mineSide ? `火箭军 ${n} 枚${MSL[type].name}已发射，目标${tgt.name}，约 50 秒后抵达。` : `弹道导弹来袭！${n} 枚，目标${tgt.name}！`, mineSide ? '#ffd28a' : '#ff5a4f');
  if (!mineSide) message('弹道导弹来袭', `${MSL[type].name} × ${n} · 目标 ${tgt.name}`, '#ff5a4f', 4);
  return true;
}
// Tomahawk strike from every US ship with cells left: land attack on the island base, or maritime strike on a ship
function tomahawk(side, target, max = 16) {
  const shooters = ships.filter(s => s.side === side && s.alive && !s.dying && (s.tlamN || 0) > 0);
  let n = 0;
  for (const s of shooters) {
    const k = Math.min(s.tlamN, target.kind === 'base' ? 8 : 4);
    for (let j = 0; j < k && n < max; j++, n++) { s.tlamN--; const sh = s, idx = n; pending.push({ t: game.t + idx * 0.9, fn: () => { if (sh.alive && !sh.dying) { const m = launchASHM(sh, target, target.kind === 'base' ? 'tlam' : 'mst'); if (idx === 0) cineOn('salvo', m); } } }); }
  }
  if (n) radio(side === game.side ? '打击协调' : '侦听', side === game.side ? `${n} 枚战斧巡航导弹发射，目标${target.name}。` : `敌方巡航导弹齐射！${n} 枚飞向${target.name}！`, side === game.side ? '#9fd4ff' : '#ff8a78');
  return n;
}
// saturation strike: every surface combatant on the side fires at one target so the missiles arrive together
function fleetStrike(side, tgt, from) {
  const shooters = ships.filter(s => s.side === side && s.alive && !s.dying && !s.S.sub && Object.values(s.ashm).some(n => n > 0));
  const plan = [];
  for (const s of shooters) {
    const tp = trackPos(side, tgt, _b) || tgt.pos;
    const d = tp.distanceTo(s.pos);
    const order = tgt.carrier ? ['yj21', 'yj18', 'mst', 'yj83', 'sm6s', 'harpoon'] : ['yj18', 'yj83', 'sm6s', 'harpoon', 'yj21'];
    let n = 0;
    for (const k of order) while (s.ashm[k] > 0 && MSL[k].range * 0.95 > d && n < 6) { s.ashm[k]--; n++; plan.push({ s, k, d }); }
  }
  if (!plan.length) return 0;
  const tof = plan.map(p => p.d / (MSL[p.k].sprint ? (MSL[p.k].v + MSL[p.k].sprint) / 2 : MSL[p.k].v));
  const maxT = Math.max(...tof);
  plan.forEach((p, i) => pending.push({ t: game.t + maxT - tof[i] + (i % 6) * 0.35, fn: () => { if (p.s.alive && !p.s.dying) { const m = launchASHM(p.s, tgt, p.k); if (i === 0 && from === flagship) cineOn('salvo', m); } } }));
  radio(side === game.side ? '舰队司令部' : '侦听', side === game.side ? `${side === 'cn' ? '饱和协同打击' : '分布式杀伤'}：${plan.length} 枚反舰导弹齐射，目标${tgt.name}，统一时间抵达！` : `大规模齐射信号！${plan.length} 枚反舰导弹正在升空！`, side === game.side ? '#ffd28a' : '#ff5a4f');
  return plan.length;
}

/* ---------- abilities ---------- */
// each: name, cd (s), dur (s, if timed), can(s) -> bool, use(s, target) -> bool (true = used)
const ABIL = {
  salvo:  { name: '反舰齐射', short: '齐射', key: 'KeyR', cd: 10, can: s => Object.values(s.ashm).some(n => n > 0), use: (s, t) => captainSalvo(s, t) },
  fleet:  { name: s => s.side === 'cn' ? '饱和协同打击' : '分布式杀伤', short: s => s.side === 'cn' ? '饱和打击' : '分布杀伤', key: 'Digit1', cd: 150, can: s => !!game.ashmSel, use: (s, t) => t ? fleetStrike(s.side, t, s) > 0 : false },
  aegis:  { name: s => s.side === 'cn' ? '海红旗区域防空网' : '宙斯盾全力防空', short: '防空全开', key: 'Digit2', cd: 90, dur: 25, can: s => Object.values(s.sam).some(n => n > 0), use: s => { s.aegisT = 25; return true; } },
  ew:     { name: '电子战干扰', short: '电子干扰', key: 'Digit3', cd: 70, dur: 20, use: s => { s.ewT = 20; for (const m of missiles) if (m.cls === 'ashm' && m.target === s && m.locked && Math.random() < 0.35) { m.locked = false; m.seekerOn = false; m.seekT = 6; m.aim.add(_a.set(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(900)); } return true; } },
  sprint: { name: '主机超负荷', short: '全速冲刺', key: 'Digit4', cd: 60, dur: 20, use: s => { s.sprintT = 20; return true; } },
  sonar:  { name: '主动声呐', short: '主动声呐', key: 'Digit5', cd: 50, dur: 25, use: s => { s.pingT = 25; return true; } },
  asw:    { name: '反潜攻击', short: '反潜', key: 'Digit6', cd: 20, can: s => s.asw > 0, use: s => { let t = null, bd = 20000; for (const [e, tr] of picture[s.side]) if (isSub(e) && e.alive && game.t - tr.t < 8) { const d = e.pos.distanceTo(s.pos); if (d < bd) { bd = d; t = e; } } if (!t) { message('无水下目标', '先用主动声呐搜索', '#9fb0ba', 1.6); return false; } launchASW(s, t); return true; } },
  tlam:   { name: '战斧巡航导弹', short: '战斧', key: 'Digit7', cd: 120, can: s => (s.tlamN || 0) > 0, use: (s, t) => { const tg = t || bases.find(b => b.alive && known(s.side, b)); if (!tg) { message('无打击目标', '选择目标或等待侦察', '#9fb0ba', 1.6); return false; } return tomahawk(s.side, tg, 12) > 0; } },
  torp:   { name: '鱼雷齐射', short: '鱼雷', key: 'KeyE', cd: 8, can: s => s.torpsN > 0, use: (s, t) => subTorpedoes(s, t) },
  depth:  { name: '深度', short: '深度', key: 'KeyQ', cd: 0.5, use: s => { const D = [18, 60, 140]; const i = D.indexOf(s.depthWant ?? 60); s.depthWant = D[(i + 1) % 3]; message(`深度 ${s.depthWant} 米`, s.depthWant === 18 ? '潜望镜深度 · 可发射导弹 · 易被发现' : s.depthWant === 140 ? '深潜 · 最安静' : '巡航深度', '#9fd4ff', 1.6); return true; } },
  strike: { name: '出动攻击波', short: '攻击波', key: 'Digit8', cd: 120, can: s => s.carrier, use: (s, t) => carrierStrike(s, t) },
  alpha:  { name: '大规模打击', short: '大规模', key: 'Digit0', cd: 600, can: s => s.carrier && !!(intentTarget(s.side) || game.ashmSel), use: (s, t) => !!alphaStrike(s, (t && t.kind !== 'plane' && !(t.S && t.S.sub) ? t : null) || intentTarget(s.side)) },
  cap:    { name: '加强空中巡逻', short: '加强巡逻', key: 'Digit9', cd: 60, can: s => s.carrier, use: s => { let n = 0; for (let i = 0; i < 4; i++) { const ty = ['j35', 'f35c', 'fa18', 'j15'].find(x => s.hangar[x] > 0); if (ty) { launchFrom(s, ty, 'cap', { off: rand(6000, 14000), latZ: rand(-9000, 9000) }); n++; } } if (n) radio(s.name, `${n} 架战斗机加强空中巡逻。`, '#9fd4ff'); return n > 0; } },
  dc:     { name: '损管', short: '损管', key: 'KeyK', cd: 90, dur: 25, use: s => { s.dcT = 25; message('损管队全力抢修', '灭火、堵漏、抢修主炮与动力 · 25 秒', '#e3b257', 2); radio(s.name, '全舰损管！', '#9fd4ff'); return true; } },
  decoy:  { name: '诱饵', short: '诱饵', key: 'KeyX', cd: 15, can: s => s.decoys > 0, use: s => { fireDecoy(s); return true; } }
};
function abilitiesOf(s) {
  if (s.S.sub) return ['torp', 'salvo', 'depth', 'sprint', 'sonar', 'decoy', 'dc'];
  if (s.carrier) return ['strike', 'alpha', 'cap', 'aegis', 'ew', 'sprint', 'decoy', 'dc'];
  const a = ['salvo', 'fleet', 'aegis', 'ew', 'sprint', 'sonar', 'asw'];
  if (s.S.tlam) a.push('tlam');
  return a.concat(['decoy', 'dc']);
}
const abilName = (id, s) => { const A = ABIL[id]; return typeof A.name === 'function' ? A.name(s) : A.name; };
const abilShort = (id, s) => { const A = ABIL[id]; return typeof A.short === 'function' ? A.short(s) : A.short; };
function useAbility(s, id, target) {
  const A = ABIL[id];
  s.cd = s.cd || {};
  if ((s.cd[id] || 0) > game.t) { if (s === flagship) message(`${abilName(id, s)} 冷却中`, `${Math.ceil(s.cd[id] - game.t)} 秒`, '#9fb0ba', 1.2); return false; }
  if (A.can && !A.can(s)) { if (s === flagship) message(`${abilName(id, s)} 不可用`, '', '#9fb0ba', 1.2); return false; }
  const ok = A.use(s, target ?? game.ashmSel);
  if (ok) { s.cd[id] = game.t + A.cd; if (s === flagship && A.dur) message(abilName(id, s), `持续 ${A.dur} 秒`, '#e3b257', 1.8); }
  return ok;
}
// the player's (or an AI captain's) own anti-ship salvo at the designated target
function captainSalvo(s, t) {
  if (!t) { if (s === flagship) message('无目标', '需要舰载机、预警机或潜艇发现敌舰', '#9fb0ba', 1.8); return false; }
  const d = (trackPos(s.side, t, _b) || t.pos).distanceTo(s.pos);
  const types = Object.keys(s.ashm).filter(x => s.ashm[x] > 0 && MSL[x].range * 0.95 > d).sort((a, b) => MSL[b].dmg - MSL[a].dmg);
  if (!types.length) { if (s === flagship) { const anyN = Object.values(s.ashm).reduce((a, b) => a + b, 0); message(anyN ? '超出射程' : '反舰导弹耗尽', anyN ? `目标 ${(d / 1000).toFixed(0)} km` : '', '#ffc861', 1.6); } return false; }
  if (s.S.sub && s.depth > 30) { if (s === flagship) message('深度过大', '上浮到潜望镜深度（Q）才能发射导弹', '#ffc861', 1.8); return false; }
  const n = Math.min(s.S.sub ? 3 : 4, types.reduce((a, x) => a + s.ashm[x], 0));
  let fired = 0;
  for (const x of types) while (s.ashm[x] > 0 && fired < n) { s.ashm[x]--; const kk = x, i = fired; pending.push({ t: game.t + fired * 0.8, fn: () => { if (s.alive && !s.dying) { const m = launchASHM(s, t, kk); s.lastLaunch = game.t; if (i === 0 && s === flagship) cineOn('salvo', m); } } }); fired++; }
  if (s === flagship) { message(`齐射 ${fired} 枚`, `目标 ${t.name} · ${(d / 1000).toFixed(0)} km`, '#e3b257', 2.2); radio(s.name, `${fired} 枚反舰导弹发射，目标${t.name}！`, '#9fd4ff'); }
  return true;
}
function subTorpedoes(s, t) {
  let dir = null;
  if (t && t.kind === 'ship') dir = _b.subVectors(t.pos, s.pos).setY(0).normalize().clone();
  else { camera.getWorldDirection(_b).setY(0).normalize(); dir = _b.clone(); t = null; }
  const n = Math.min(3, s.torpsN);
  for (let k = 0; k < n; k++) { torpedo(s, t, s.S.torpType, dir.clone().applyAxisAngle(Y_AXIS, (k - (n - 1) / 2) * 0.045)); s.torpsN--; }
  if (s === flagship) { message(`${n} 枚鱼雷出管`, t ? `目标 ${t.name} · 线导 · 末段自导` : '沿镜头方向直航 · 末段自导', '#7fc8ff', 2); radio(s.name, '鱼雷出管！', '#9fd4ff'); }
  return n > 0;
}
function carrierStrike(s, t) {
  t = t || intentTarget(s.side) || bestTarget(s.side, s.pos, 160000);
  if (!t) { if (s === flagship) message('无打击目标', '等待预警机发现敌舰', '#9fb0ba', 1.6); return false; }
  const k = launchPackage(s, t, { n: 6, esc: 2 });
  if (!k) { if (s === flagship) message('机库无可用攻击机', '', '#9fb0ba', 1.6); return false; }
  return true;
}
// AI captains use their abilities by the same rules
function abilityAI(s, dt) {
  if (s === flagship && !game.ai) return;
  s.abT = (s.abT || rand(0, 2)) - dt;
  if (s.abT > 0) return;
  s.abT = 2;
  const list = abilitiesOf(s);
  const inbound = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side !== s.side && m.pos.distanceTo(s.pos) < 30000).length;
  const atMe = missiles.some(m => m.alive && m.cls === 'ashm' && m.target === s && m.pos.distanceTo(s.pos) < 15000);
  if (list.includes('aegis') && inbound >= 4) useAbility(s, 'aegis');
  if (list.includes('ew') && atMe) useAbility(s, 'ew');
  if (list.includes('dc') && (s.fires > 1.5 || s.flood > 0.8 || (s.mods && s.mods.engine > 0))) useAbility(s, 'dc');
  if (list.includes('sprint') && (atMe || s.evadeT > 0)) useAbility(s, 'sprint');
  if (list.includes('sonar') && s.S.sonar && !s.S.sub && Math.random() < 0.08) useAbility(s, 'sonar');
}
function tickAbilities(s, dt) {
  for (const k of ['aegisT', 'ewT', 'sprintT', 'pingT']) if (s[k] > 0) s[k] -= dt;
}
// submerged boats: hidden under the opaque sea, shown as a sonar ghost to their own side (and to the enemy once heard)
const ghostMat = { cn: new THREE.MeshBasicMaterial({ color: 0xff8a70, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }),
  us: new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }) };
function subLook(s) {
  const deep = s.depth > 6;
  const show = deep && (mine(s) || game.role === 'watch' || fresh(game.side, s, 8));
  if (show !== s.ghost) {
    s.ghost = show;
    s.obj.traverse(m => { if (m.isMesh) { m.userData.mat = m.userData.mat || m.material; m.material = show ? ghostMat[s.side] : m.userData.mat; m.renderOrder = show ? 6 : 0; } });
  }
  s.obj.visible = !deep || show;
}

