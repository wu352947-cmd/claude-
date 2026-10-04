/* ---------- tactical picture: decluttered contact markers, radar scope, tactical map, tactics, wingmen ----------
   Inlined into navwar.js (shares its scope).
   Clutter rules: contacts that overlap on screen merge into one marker with a count; only the few contacts that
   matter most carry a text label (the designated target, inbound missiles, carriers, the nearest threat); friendly
   units are faint and unlabelled. The scope and the map group units the same way at their own scale.
   Tactics live in the map, not on the main screen: a fleet doctrine and an air doctrine per side, and orders for the
   player's wingman. The AI commanders choose their own doctrines by the same rules. */

/* ---------- screen-space clustering ---------- */
// items: { x, y, prio }; greedy by priority, each joins the first cluster within r pixels
function clusterPx(items, r) {
  items.sort((a, b) => b.prio - a.prio);
  const out = [];
  for (const it of items) {
    let c = null;
    for (const k of out) if ((k.x - it.x) ** 2 + (k.y - it.y) ** 2 < r * r) { c = k; break; }
    if (c) { c.n++; c.items.push(it); } else out.push({ x: it.x, y: it.y, n: 1, items: [it], top: it, prio: it.prio });
  }
  return out;
}
const KIND_NAME = { ship: '舰', plane: '机', msl: '弹', base: '岛' };
// symbols: enemy ship ◇, aircraft ⌄, missile ▸ (pointing along its track), base ▢; friendly drawn small and hollow
function glyph(g, x, y, it, scale = 1) {
  const e = it.u, enemy = it.enemy, s = (enemy ? 8 : 5) * scale;
  g.save();
  g.lineWidth = enemy ? 1.6 : 1.2;
  g.strokeStyle = g.fillStyle = it.color;
  g.globalAlpha *= it.alpha ?? 1;
  if (e.kind === 'ship' && !(e.S && e.S.sub)) { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); if (e.carrier) { g.globalAlpha *= 0.35; g.fill(); g.globalAlpha /= 0.35; } g.stroke(); }
  else if (e.kind === 'ship') { g.beginPath(); g.ellipse(x, y, s * 1.2, s * 0.55, 0, 0, Math.PI * 2); g.stroke(); }          // submarine
  else if (e.kind === 'base') { g.strokeRect(x - s, y - s, s * 2, s * 2); }
  else if (e.kind === 'plane') { g.beginPath(); g.moveTo(x - s, y - s * 0.5); g.lineTo(x, y + s * 0.6); g.lineTo(x + s, y - s * 0.5); g.stroke(); }
  else { g.beginPath(); g.arc(x, y, 2.6 * scale, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
function badge(g, x, y, n, color) {
  if (n < 2) return;
  g.save(); g.font = `700 10px ${MONO}`; const w = g.measureText(String(n)).width + 7;
  g.fillStyle = 'rgba(6,10,14,0.85)'; g.fillRect(x + 8, y - 15, w, 13);
  g.fillStyle = color; g.textAlign = 'left'; g.fillText(String(n), x + 11, y - 5); g.restore();
}

/* ---------- 3D view: contact markers ---------- */
function contactItems(from, rPlane, rShip, withFriends) {
  const items = [], me = game.side;
  const sel = game.ashmSel, lock = game.lock && game.lock.target, gt = game.gunTgt;
  for (const [e, tr] of picture[me]) {
    if (!e.alive || e.dying) continue;
    const p = e.kind === 'plane' || e.kind === 'msl' ? e.pos : tr.pos, d = p.distanceTo(from);
    if (e.kind === 'plane' && d > rPlane) continue;
    if ((e.kind === 'ship' || e.kind === 'base') && d > rShip) continue;
    if (e.kind === 'msl' && (d > 25000 || !(e.target && e.target.side === me))) continue;   // only missiles coming at us
    const pp = proj(p); if (!onScreen(pp)) continue;
    const chosen = e === sel || e === lock || e === gt;
    const prio = chosen ? 100 : e.kind === 'msl' ? 60 - d / 1000 : e.carrier ? 45 : e.kind === 'ship' || e.kind === 'base' ? 35 - d / 10000 : 25 - d / 2000;
    items.push({ x: pp.x, y: pp.y, prio, u: e, d, enemy: true, chosen, color: e.kind === 'msl' ? WARN : RED, alpha: game.t - tr.t > 3 ? 0.45 : 1 });
  }
  if (withFriends) for (const s of ships) if (s.side === me && s.alive && !s.dying && s !== flagship && !submerged(s)) {
    const d = s.pos.distanceTo(from); if (d > 60000 || d < 500) continue;
    const pp = proj(_a.copy(s.pos).setY(s.h)); if (!onScreen(pp)) continue;
    items.push({ x: pp.x, y: pp.y, prio: 1, u: s, d, enemy: false, color: BLUE, alpha: 0.55 });
  }
  return items;
}
function drawContacts(from, rPlane, rShip) {
  const items = contactItems(from, rPlane, rShip, game.role !== 'pilot');
  const enemies = clusterPx(items.filter(i => i.enemy), 26), friends = clusterPx(items.filter(i => !i.enemy), 22);
  for (const c of friends) { glyph(hc, c.x, c.y, c.top); }
  // labels for the few that matter, without overlapping each other
  const boxes = [];
  const free = (x, y, w, h) => { for (const b of boxes) if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return false; boxes.push({ x, y, w, h }); return true; };
  let labels = 0;
  for (const c of enemies) {
    glyph(hc, c.x, c.y, c.top, c.top.chosen ? 1.25 : 1);
    badge(hc, c.x, c.y, c.n, c.top.color);
    const t = c.top, e = t.u;
    const want = t.chosen || (labels < 3 && (e.kind !== 'plane' || t.d < 15000));
    if (!want) continue;
    const name = e.kind === 'msl' ? e.spec.name : e.kind === 'plane' ? e.T.name : e.name;
    const label = c.n > 1 && !t.chosen ? `${name} 等 ${c.n}` : name, dist = km(t.d) + ' km';
    hc.save(); hc.font = `600 11px ${SANS}`;
    const w = Math.max(hc.measureText(label).width, 40) + 6;
    if (free(c.x + 12, c.y - 12, w, 26)) {
      hc.globalAlpha = t.alpha;
      hc.fillStyle = t.chosen ? GOLD : t.color; hc.textAlign = 'left'; hc.fillText(label, c.x + 13, c.y - 1);
      hc.font = `500 10px ${MONO}`; hc.globalAlpha *= 0.8; hc.fillText(dist, c.x + 13, c.y + 11);
      if (!t.chosen) labels++;
    }
    hc.restore();
  }
}

/* ---------- radar scope (corner): own unit prominent, grouped contacts, tap to zoom, long view in the map ---------- */
const SCOPE_R = [20000, 40000, 80000, 160000];
const scopeBox = { x: 0, y: 0, r: 0 };
function drawScope(c, fwd, range) {
  const compact = HH < 480, R = compact ? 52 : 66, rx = HW - R - 14, ry = R + (compact ? 50 : 58);
  Object.assign(scopeBox, { x: rx, y: ry, r: R });
  range = SCOPE_R[game.scopeZ ?? SCOPE_R.indexOf(range)] || range;
  game.scopeZ = SCOPE_R.indexOf(range);
  hc.save();
  hc.fillStyle = 'rgba(5,12,16,0.62)'; hc.beginPath(); hc.arc(rx, ry, R, 0, Math.PI * 2); hc.fill();
  hc.strokeStyle = 'rgba(141,255,180,0.55)'; hc.lineWidth = 1.2; hc.stroke();
  hc.strokeStyle = 'rgba(141,255,180,0.16)'; hc.beginPath(); hc.arc(rx, ry, R / 2, 0, Math.PI * 2); hc.stroke();
  hc.beginPath(); hc.moveTo(rx, ry - R); hc.lineTo(rx, ry + R); hc.moveTo(rx - R, ry); hc.lineTo(rx + R, ry); hc.stroke();
  const fl = Math.hypot(fwd.x, fwd.z) || 1, hx = fwd.x / fl, hz = fwd.z / fl;
  const toScope = (wx, wz) => { const dx = wx - c.x, dz = wz - c.z; let s = (dx * -hz + dz * hx) / range, f = (dx * hx + dz * hz) / range; const l = Math.hypot(f, s); const edge = l > 1; if (edge) { f /= l; s /= l; } return { x: rx + s * R, y: ry - f * R, edge }; };
  const items = [];
  const me = game.side, own = player || flagship;
  for (const s of ships) if (s.side === me && s.alive && !s.dying && s !== own) { const q = toScope(s.pos.x, s.pos.z); items.push({ x: q.x, y: q.y, prio: s.carrier ? 3 : 2, u: s, enemy: false, color: BLUE, alpha: q.edge ? 0.4 : 0.85 }); }
  for (const p of planes) if (p.side === me && p.alive && p.airborne && p !== own) { const q = toScope(p.pos.x, p.pos.z); if (!q.edge) items.push({ x: q.x, y: q.y, prio: 1, u: p, enemy: false, color: BLUE, alpha: 0.7 }); }
  for (const [e, tr] of picture[me]) {
    if (!e.alive || e.dying) continue;
    if (e.kind === 'msl' && !(e.target && e.target.side === me)) continue;
    const q = toScope(tr.pos.x, tr.pos.z);
    items.push({ x: q.x, y: q.y, prio: e === game.ashmSel ? 100 : e.kind === 'msl' ? 50 : e.carrier ? 40 : 20, u: e, enemy: true, color: e.kind === 'msl' ? WARN : RED, alpha: q.edge ? 0.5 : 1, chosen: e === game.ashmSel || e === (game.lock && game.lock.target) });
  }
  for (const c2 of clusterPx(items.filter(i => !i.enemy), 6)) { glyph(hc, c2.x, c2.y, c2.top, 0.7); }
  for (const c2 of clusterPx(items.filter(i => i.enemy), 7)) {
    glyph(hc, c2.x, c2.y, c2.top, 0.75);
    if (c2.n > 1) { hc.font = `700 8px ${MONO}`; hc.fillStyle = c2.top.color; hc.textAlign = 'left'; hc.fillText(String(c2.n), c2.x + 5, c2.y - 4); }
    if (c2.top.chosen) { hc.strokeStyle = GOLD; hc.lineWidth = 1.4; hc.beginPath(); hc.arc(c2.x, c2.y, 7, 0, Math.PI * 2); hc.stroke(); }
  }
  // own unit: a bright arrow with a heading line
  hc.strokeStyle = GOLD; hc.lineWidth = 1; hc.globalAlpha = 0.5; hc.beginPath(); hc.moveTo(rx, ry); hc.lineTo(rx, ry - R); hc.stroke(); hc.globalAlpha = 1;
  hc.fillStyle = GOLD; hc.beginPath(); hc.moveTo(rx, ry - 8); hc.lineTo(rx - 5.5, ry + 5); hc.lineTo(rx, ry + 2.5); hc.lineTo(rx + 5.5, ry + 5); hc.closePath(); hc.fill();
  hc.font = `600 9px ${MONO}`; hc.fillStyle = 'rgba(238,243,245,0.75)'; hc.textAlign = 'center';
  hc.fillText(`${range / 1000} km`, rx, ry + R + 11);
  hc.font = `500 8px ${SANS}`; hc.fillStyle = 'rgba(238,243,245,0.45)'; hc.fillText('轻触缩放 · 长按地图', rx, ry + R + 21);
  hc.restore();
}
// taps on the scope: short tap cycles the range, long press opens the map
function scopeHit(x, y) { return scopeBox.r && Math.hypot(x - scopeBox.x, y - scopeBox.y) < scopeBox.r + 6; }

/* ---------- tactics ---------- */
const TACTICS = {
  navy: {
    balanced: { name: '均衡部署', desc: '标准护航阵位，水面突击群视情前出。' },
    ring:     { name: '环形防空', desc: '护航舰收拢到航母周围，防空火力相互掩护，命中率提高；不派突击群。' },
    strike:   { name: '前出突击', desc: '最多五艘战舰组成突击群逼近到舰炮射程，齐射更频繁；更容易被反击。' },
    disperse: { name: '分散机动', desc: '编队拉开、蛇形机动，来袭导弹更难命中；相互防空掩护减弱。' },
    emcon:    { name: '电磁静默', desc: '舰载雷达关机，敌方难以发现我舰；只靠预警机和数据链，遭攻击时自动开机。' },
    focus:    { name: '集火目标', desc: '全舰队的齐射与舰炮集中打击你指定的目标。' }
  },
  air: {
    balanced: { name: '均衡出动', desc: '空中巡逻与攻击波按需出动。' },
    cap:      { name: '空中掩护', desc: '更多战斗机守在舰队上空，攻击波减少。' },
    sweep:    { name: '战斗机扫荡', desc: '战斗机编队前出，主动寻歼敌方战斗机。' },
    hunt:     { name: '猎杀预警机', desc: '扫荡编队以敌方预警机为首要目标，致盲敌方舰队。' },
    low:      { name: '低空突防', desc: '攻击波更早转入贴海飞行，躲在雷达地平线下。' },
    mass:     { name: '饱和空袭', desc: '攻击波规模加倍、间隔拉长，一次压垮敌方防空。' }
  },
  wing: { follow: { name: '跟随掩护', desc: '僚机保持编队，只攻击威胁长机的敌机。' }, attack: { name: '攻击我的目标', desc: '僚机攻击你锁定或指定的目标。' }, free: { name: '自由交战', desc: '僚机自行选择目标。' } }
};
const tac = side => (game.tactic && game.tactic[side]) || { navy: 'balanced', air: 'balanced' };
function setTactic(kind, id, side = game.side) {
  game.tactic = game.tactic || { cn: { navy: 'balanced', air: 'balanced' }, us: { navy: 'balanced', air: 'balanced' } };
  if (game.tactic[side][kind] === id) return;
  game.tactic[side][kind] = id;
  if (side === game.side) { radio(kind === 'navy' ? '舰队司令部' : '空中指挥', `战术变更：${TACTICS[kind][id].name}。${TACTICS[kind][id].desc}`, '#ffd28a'); Sound.beep(1200, 0.05, 0.05); }
}
// the AI commanders pick their doctrines from the situation
function aiTactics(side, dt) {
  if (side === game.side && game.role !== 'watch') return;
  const C = command[side];
  C.tacT = (C.tacT ?? 30) - dt;
  if (C.tacT > 0) return;
  C.tacT = 45;
  // read the situation the way a staff would: what threatens us, what the enemy can still see, how strong the
  // main target's defences are, and who is winning the air
  const foeKnown = !!enemyFleet(side);
  const main = intentTarget(side);
  const carriers = ships.filter(s => s.side === side && s.carrier && s.alive && !s.dying);
  const hurt = carriers.some(s => s.hp < s.maxHp * 0.6);
  const inbound = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side !== side).length;
  const foeStrikers = [...picture[side].keys()].filter(e => e.kind === 'plane' && e.alive && !e.dying && e.ashmN > 0).length;
  const foeAew = [...picture[side].keys()].some(e => e.kind === 'plane' && e.alive && !e.dying && e.T.aew);
  const own = fleetCentre(side), mp = main && trackPos(side, main, new V3());
  const dMain = own && mp ? mp.distanceTo(own) : 1e9;
  // the main target's area-defence umbrella: SAM ships known within 15 km of it
  const umbrella = mp ? [...picture[side]].filter(([e, tr]) => e.kind === 'ship' && e.alive && !e.dying && !(e.S && e.S.sub) && tr.pos.distanceTo(mp) < 15000).length : 0;
  const myF = planes.filter(p => p.side === side && p.alive && p.airborne && p.mrm + p.srm > 0).length;
  const foeF = [...picture[side].keys()].filter(e => e.kind === 'plane' && e.alive && !e.dying && e.T.mrm > 0).length;
  const healthy = ships.filter(s => s.side === side && s.alive && !s.dying && !s.carrier && !s.S.sub && s.hp > s.maxHp * 0.7).length;
  const r = Math.random();
  const navy = !foeKnown ? (r < 0.6 ? 'emcon' : 'balanced')                    // hide while the scouts look
    : hurt || inbound > 8 || foeStrikers > 8 ? 'ring'                            // weather the storm
    : dMain < 70000 && healthy >= 5 && r < 0.6 ? 'strike'                        // close in for the kill
    : main && r < 0.5 ? 'focus'                                                  // everything on the main target
    : r < 0.5 ? 'disperse' : 'balanced';
  const air = !foeKnown ? 'sweep'
    : foeAew && foeF <= myF + 2 && r < 0.75 ? 'hunt'                             // put out the enemy's eyes first
    : hurt || foeStrikers > 6 ? 'cap'                                            // our carrier first
    : foeF > myF * 1.6 ? 'sweep'                                                 // win the air before striking
    : umbrella >= 4 ? (r < 0.55 ? 'mass' : 'low')                                // saturate or sneak under a strong umbrella
    : r < 0.5 ? 'mass' : 'balanced';
  const was = tac(side);
  setTactic('navy', navy, side); setTactic('air', air, side);
  // signals intelligence: the player sometimes learns of the enemy's change of plan
  if (side !== game.side && game.role !== 'watch' && (was.navy !== navy || was.air !== air) && Math.random() < 0.45)
    radio('技术侦察', `截获敌方指挥网：敌转入「${TACTICS.navy[navy].name}」/「${TACTICS.air[air].name}」。`, '#ffd28a');
}
// a fighter sweep or an AEW hunt: a few fighters push out ahead of the fleet
function airSweeps(side, dt) {
  const t = tac(side).air;
  if (t !== 'sweep' && t !== 'hunt') return;
  const C = command[side];
  C.swpT = (C.swpT ?? 20) - dt;
  if (C.swpT > 0) return;
  C.swpT = 110;
  const homes = ships.filter(s => s.side === side && s.carrier && s.alive && !s.dying);
  // sweeps clear the air along the main axis (the enemy group nearest us only when there is no main effort)
  const foeC = intentTarget(side) || enemyFleet(side);
  let point = intentPos(side, new V3()) || (foeC ? (trackPos(side, foeC, new V3()) || foeC.pos.clone()) : new V3(side === 'cn' ? 40000 : -40000, 0, 0));
  if (t === 'hunt') for (const [e, tr] of picture[side]) if (e.kind === 'plane' && e.T.aew && e.alive) { point = tr.pos.clone(); break; }
  // stop short of the enemy ships' missile umbrella
  const own = fleetCentre(side) || ZERO;
  const dir = _a.subVectors(point, own).setY(0); const L = dir.length();
  if (foeC && t === 'sweep') point = own.clone().addScaledVector(dir.normalize(), Math.max(0, L - 30000));
  let n = 0;
  for (const h of homes) for (let i = 0; i < 2 && n < 4; i++) { const ty = ['j35', 'f35c', 'fa18', 'j15'].find(x => h.hangar[x] > 0); if (ty) { const p = launchFrom(h, ty, 'sweep', { point, hunt: t === 'hunt' }); if (p) n++; } }
  if (n && side === game.side) radio('空中指挥', `${n} 架战斗机${t === 'hunt' ? '前出猎杀敌预警机' : '执行战斗机扫荡'}。`, '#9fd4ff');
}

/* ---------- commander's intent: one main effort per side ----------
   Every unit of a side orients on it: the fleet steers to its stand-off line on that axis, the surface action
   group and the submarines push down it, CAP stations, AEW orbits and fighter sweeps sit on it, stand-off
   jammers blind the target's sensors, and strike packages plus the ships' salvos converge on the main target
   with a time-on-target plan. The player's designation (or a direction picked on the map) is the intent for
   the player's side; AI commanders choose and hold their own main effort. */
const _in1 = new V3(), _in2 = new V3();
function intentState(side) { game.intent = game.intent || { cn: null, us: null }; return game.intent[side]; }
function setIntent(side, I) {
  game.intent = game.intent || { cn: null, us: null };
  game.intent[side] = I ? Object.assign({ t: game.t, src: 'ai' }, I) : null;
  if (I) game.intent[side].last = I.tgt ? (trackPos(side, I.tgt, new V3()) || I.tgt.pos.clone()) : I.point.clone();
  command[side].intentAck = false;
}
// the player's word: called on every designation of a ship / base, and on "main axis" picks on the map
function playerIntent(tgt, point) {
  if (!game.side || game.role === 'watch' || (tgt && tgt.S && tgt.S.sub)) return;   // a submarine is an ASW task, not a main effort
  const cur = intentState(game.side);
  if (tgt && cur && cur.tgt === tgt && cur.src === 'player') return;
  setIntent(game.side, tgt ? { tgt, src: 'player' } : { point: point.clone().setY(0), src: 'player' });
  intentOrders(game.side);
}
// the main target if it is still worth pursuing (alive); point intents have none
function intentTarget(side) {
  const I = intentState(side);
  return I && I.tgt && I.tgt.alive && !I.tgt.dying ? I.tgt : null;
}
// where the main effort points: the target's track (or its last known position), or the chosen point
function intentPos(side, out) {
  const I = intentState(side);
  if (!I) return null;
  if (I.tgt) {
    const tp = I.tgt.alive && !I.tgt.dying ? trackPos(side, I.tgt, out) : null;
    if (tp) { I.last.copy(tp); return out; }
    return out.copy(I.last);
  }
  return out.copy(I.point);
}
// unit vector along the axis of advance from a position (falls back to the enemy's side of the theatre)
function axisDir(side, from, out) {
  const ip = intentPos(side, _in1);
  if (ip) { out.set(ip.x - from.x, 0, ip.z - from.z); if (out.lengthSq() > 1e6) return out.normalize(); }
  return out.set(SIDES[side].foe === 'us' ? 1 : -1, 0, 0);
}
// AI commanders: commit to a main effort and hold it (a main effort that changes every minute is no main effort)
function updateIntent(side, dt) {
  const C = command[side], I = intentState(side);
  C.intT = (C.intT ?? 0) - dt;
  const dead = I && I.tgt && (!I.tgt.alive || I.tgt.dying);
  if (dead && I.src === 'player' && side === game.side) radio('作战指挥', `主攻目标${I.tgt.name}已被摧毁！按预案转入下一目标。`, GOLD);
  const playerHeld = I && I.src === 'player' && !dead && game.role !== 'watch' && side === game.side;
  if (playerHeld || (!dead && C.intT > 0 && I)) return;
  C.intT = 45;
  // a known carrier above all, then the most valuable surface combatant, then the island; a lost contact is held
  // for a while along its last known position before the commander gives up on it
  let best = null, bs = -1;
  for (const [e, tr] of picture[side]) {
    if ((e.kind !== 'ship' && e.kind !== 'base') || !e.alive || e.dying || (e.S && e.S.sub)) continue;
    const age = game.t - tr.t;
    if (age > 240) continue;
    const sc = e.value * (e.carrier ? 2.2 : e.kind === 'base' ? 1.2 : 1) * (0.5 + 0.5 * e.hp / e.maxHp) * (e === (I && I.tgt) ? 1.35 : 1) - age * 0.2;
    if (sc > bs) { bs = sc; best = e; }
  }
  const prev = I && I.tgt;
  if (best) { if (best !== prev) { setIntent(side, { tgt: best }); intentOrders(side); } else I.t = game.t; }
  else if (!I || dead) {
    // nothing known: reconnaissance in force toward where the enemy must be
    const o = FLEET[SIDES[side].foe].origin;
    setIntent(side, { point: new V3(o[0] * 0.6, 0, o[1] * 0.6) });
    intentOrders(side);
  }
}
// acknowledgements: every arm reports how it is supporting the main effort, so compliance is visible
function intentOrders(side) {
  const I = intentState(side), C = command[side];
  if (!I || side !== game.side) return;
  C.intentAck = true;
  const name = I.tgt ? I.tgt.name : '指定方向';
  const ships_ = ships.filter(s => s.side === side && s.alive && !s.dying);
  const air = planes.filter(p => p.side === side && p.alive && !p.dying && p.airborne && p !== player);
  const subs = ships_.filter(s => s.S.sub).length;
  const strikers = air.filter(p => (p.role === 'strike' || p.role === 'bomber') && p.ashmN > 0);
  // aircraft already out on a strike are retasked onto the main target (if it is a ship and within their reach)
  let re = 0;
  if (I.tgt) for (const p of strikers) if (p.task && p.task.target !== I.tgt && p.pos.distanceTo(I.tgt.pos) < 220000) { p.task.target = I.tgt; re++; }
  for (const k of Object.keys(C.strikeCd || {})) C.strikeCd[k] = Math.min(C.strikeCd[k], 30);   // the next package goes soon
  C.sweepAx = 0; C.swpT = Math.min(C.swpT ?? 0, 5); C.ewT = 0;
  const src = I.src === 'player' ? '指挥员命令' : '司令部决心';
  radio('作战指挥', `${src}：主攻方向——${name}。全部兵力向该方向集中。`, GOLD);
  pending.push({ t: game.t + 1.6, fn: () => radio('舰队司令部', `收到。编队转向主攻方向，水面突击群前出${subs ? `，${subs} 艘潜艇前出伏击` : ''}。`, '#9fd4ff') });
  pending.push({ t: game.t + 3.2, fn: () => radio('空中指挥', `收到。巡逻阵位前推，电子战机前出压制${re ? `，${re} 架在途攻击机改攻${name}` : ''}，${I.tgt ? `下一攻击波打击${name}` : '攻击波将打击该方向发现的目标'}。`, '#9fd4ff') });
}
// the station of an aircraft tasked against the main target: on the axis, `stand` metres short of it
function axisStation(side, from, stand, out) {
  const ip = intentPos(side, _in2);
  if (!ip) return null;
  const dx = from.x - ip.x, dz = from.z - ip.z, L = Math.hypot(dx, dz) || 1;
  return out.set(ip.x + dx / L * stand, 0, ip.z + dz / L * stand);
}
/* ---------- strike packages: form up, push, split, release, egress, assess ----------
   A package is launched over several minutes from the deck, so it first marshals at a rendezvous ahead of the
   carrier; when everyone is there (or the push time arrives) it pushes as one. Short of the target the strikers
   split to two initial points on either side of the axis, so the missiles come in from two bearings at once;
   after release they egress (swing to CAP or home) and the package reports battle damage. */
const PKG_FORM_MAX = 150;   // seconds the package waits for stragglers before it pushes anyway
function newPackage(side, home, tgt) {
  const C = command[side];
  const ax = axisDir(side, home.pos, new V3());
  const k = { side, home, tgt, members: [], t: game.t, phase: 'form', rv: home.pos.clone().addScaledVector(ax, 14000).setY(5000), id: (C.pkgN = (C.pkgN || 0) + 1) };
  C.pkgs = C.pkgs || []; C.pkgs.push(k);
  return k;
}
function joinPackage(k, p) {
  if (k.members.includes(p)) return;
  const n = k.members.length;
  k.members.push(p);
  // alternate sides of the axis: two attack groups, each a little wider than the last pair
  p.task = Object.assign(p.task || {}, { target: k.tgt, pkg: k, ipOff: (n % 2 ? -1 : 1) * (7000 + Math.floor(n / 2) * 900) });
}
// where a striker of a package should be going now (null: the normal attack logic takes over)
function pkgSteer(pl, task, out) {
  const k = task.pkg;
  if (!k || k.phase === 'done') return null;
  if (k.phase === 'form') { out.copy(k.rv); return 'marshal'; }
  const tp = trackPos(pl.side, k.tgt, _in1) || task.last || k.tgt.pos;
  const spec = MSL[pl.T.ashmType], rel = spec.range * 0.82;
  const dx = tp.x - k.rv.x, dz = tp.z - k.rv.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  // the initial point: on this aircraft's side of the axis, a few km outside its release range
  const back = rel + 9000;
  out.set(tp.x - ux * back - uz * task.ipOff, 0, tp.z - uz * back + ux * task.ipOff);
  if (task.ipDone || Math.hypot(out.x - pl.pos.x, out.z - pl.pos.z) < 4000 || Math.hypot(tp.x - pl.pos.x, tp.z - pl.pos.z) < rel) { task.ipDone = true; return null; }
  return 'push';
}
function updatePackages(side) {
  const C = command[side];
  C.pkgs = (C.pkgs || []).filter(k => k.phase !== 'gone');
  for (const k of C.pkgs) {
    const air = k.members.filter(p => p.alive && !p.dying && p.ashmN > 0 && p.task && p.task.pkg === k);
    const mineSide = side === game.side;
    if (k.phase === 'form') {
      const up = air.filter(p => p.airborne), there = up.filter(p => p.pos.distanceTo(k.rv) < 7000);
      k.ready = there.length; k.total = air.length;
      if (air.length && (there.length === air.length || game.t - k.t > PKG_FORM_MAX) && up.length) {
        k.phase = 'push'; k.pushT = game.t;
        // stragglers still on deck are released to attack on their own
        for (const p of air) if (!p.airborne) p.task.pkg = null;
        if (mineSide) radio('空中指挥', `第 ${k.id} 攻击编队集结完毕（${up.length} 架），全编队出发！目标${k.tgt.name}，分两路突击。`, GOLD);
        if (air.includes(player)) message('全编队出发 · PUSH', `目标 ${k.tgt.name} · 分两路进入初始点`, GOLD, 2.6);
      }
      if (!air.length) k.phase = 'gone';
      continue;
    }
    if (k.phase === 'push') {
      if (!k.tgt.alive || k.tgt.dying || !air.length) { k.phase = 'bda'; continue; }
      if (!k.jointDone) jointFor(side, k, air);
    }
    // assessment once the last of the package's missiles has hit or been stopped
    if (k.phase === 'bda' && !k.bdaT && !missiles.some(m => m.alive && m.pkg === k)) k.bdaT = game.t + 6;
    if (k.phase === 'bda' && k.bdaT && game.t > k.bdaT) {
      k.phase = 'gone';
      if (!mineSide) continue;
      const t = k.tgt;
      const st = !t.alive || t.dying ? '已被击沉' : t.hp > t.maxHp * 0.75 ? `轻伤（完好 ${Math.round(t.hp / t.maxHp * 100)}%），建议再次打击` : t.hp > t.maxHp * 0.4 ? `中度受损（完好 ${Math.round(t.hp / t.maxHp * 100)}%）` : `重创（完好 ${Math.round(t.hp / t.maxHp * 100)}%），丧失大部分战斗力`;
      const hits = k.hits || 0;
      radio('毁伤评估', `第 ${k.id} 攻击编队：发射 ${k.fired || 0} 枚，命中 ${hits} 枚。${t.name}${st}。`, '#9fd4ff');
    }
  }
}
// air-sea joint strike: once the package pushes, the surface ships hold their salvo and fire so that their
// missiles arrive with the aircraft's (one saturation wave, not two small ones)
function jointFor(side, k, air) {
  const C = command[side];
  const lead = air[0];
  const tp = trackPos(side, k.tgt, _in1); if (!tp || !lead) return;
  // one combined salvo per target: a second package against the same target within a minute rides the first
  if (C.jointLast === k.tgt && game.t - C.jointT < 60) { k.jointDone = true; return; }
  const spec = MSL[lead.T.ashmType], d = Math.hypot(tp.x - lead.pos.x, tp.z - lead.pos.z);
  const rel = spec.range * 0.82;
  const airImpact = Math.max(0, d - rel) / Math.max(200, lead.speed) * 1.08 + Math.min(d, rel) / spec.v + 4;
  const shooters = ships.filter(s => s.side === side && s.alive && !s.dying && s !== flagship && !s.S.sub && Object.keys(s.ashm).some(m => s.ashm[m] > 0 && MSL[m].range * 0.95 > tp.distanceTo(s.pos)));
  // the US Navy's long arm is the maritime-strike Tomahawk: timed so it arrives with the package's LRASMs
  if (!shooters.length && side === 'us' && (C.mstCd ?? 0) <= 60) {
    const tl = ships.filter(s => s.side === side && s.alive && !s.dying && (s.tlamN || 0) > 0);
    if (!tl.length) return;
    const tof = Math.max(...tl.map(s => tp.distanceTo(s.pos))) / MSL.mst.v;
    if (airImpact - tof < 4) {
      k.jointDone = true; C.jointLast = k.tgt; C.jointT = game.t;
      if (tomahawk(side, k.tgt, 8)) { C.mstCd = 150; if (side === game.side) radio('作战指挥', `分布式杀伤：海上打击型战斧与${air.length} 架攻击机的 LRASM 将同时抵达${k.tgt.name}！`, GOLD); }
    }
    return;
  }
  if (!shooters.length) return;
  const shipTof = Math.max(...shooters.map(s => tp.distanceTo(s.pos) / MSL[Object.keys(s.ashm).find(m => s.ashm[m] > 0)].v));
  if (airImpact - shipTof < 4) {
    k.jointDone = true;
    C.jointTgt = k.tgt; C.salvoCd = 0; C.jointLast = k.tgt; C.jointT = game.t;
    if (side === game.side) radio('作战指挥', `空海协同：舰艇齐射与${air.length} 架攻击机的导弹将同时抵达${k.tgt.name}！`, GOLD);
  }
}
function jointStrikes(side) { updatePackages(side); }

/* ---------- theatre ISR: reconnaissance satellites and over-the-horizon radar ----------
   Both sides get periodic satellite passes (SAR sees ships even under EMCON, but EMCON leaves the analysts a
   much poorer fix); the PLA also runs sky-wave OTH radar, which sees large emitting ships coarsely and is
   blinded by EMCON. These tracks are coarse and a few seconds old: good enough to cue a strike, a ballistic
   missile or a scout, not good enough to guide a SAM. */
const ISR = { cn: { period: 210, dur: 24, first: 70, oth: true }, us: { period: 260, dur: 24, first: 120, oth: false } };
function isrFix(side, e, err) {
  const P = picture[side], have = P.get(e);
  if (have && game.t - have.t < 12) return false;          // a sensor already holds a better track
  const tr = have || { pos: new V3(), vel: new V3(), t: 0, first: game.t };
  tr.pos.copy(e.pos).add(_in1.set(rand(-err, err), 0, rand(-err, err))); tr.vel.copy(e.vel); tr.t = game.t - 8; tr.coarse = err;
  if (!have) P.set(e, tr);
  return true;
}
function updateISR(side, dt) {
  const C = command[side], R = ISR[side], foe = SIDES[side].foe;
  C.satT = (C.satT ?? R.first) - dt;
  if (C.satT <= 0) {
    C.satT = R.period; C.satEnd = game.t + R.dur; C.satN = 0;
    if (side === game.side) radio(side === 'cn' ? '遥感卫星' : 'NRO', '侦察卫星过顶，开始成像搜索。', '#9fd4ff');
    else if (game.side && game.role !== 'watch') radio('预警', `敌方侦察卫星过顶 ${R.dur} 秒！电磁静默可降低我舰被定位精度。`, '#ffd28a');
  }
  if (C.satEnd > game.t) {
    C.satTick = (C.satTick || 0) - dt;
    if (C.satTick <= 0) {
      C.satTick = 6;
      for (const e of ships) if (e.side === foe && e.alive && !e.dying && !submerged(e)) {
        const quiet = tac(foe).navy === 'emcon' && !(e.emconBreak > game.t);
        if (Math.random() < (quiet ? 0.55 : 0.9) && isrFix(side, e, quiet ? 3500 : 1200)) C.satN++;
      }
    }
    if (game.t + 0.5 > C.satEnd && C.satN && side === game.side && !C.satSaid) { C.satSaid = true; radio(side === 'cn' ? '遥感卫星' : 'NRO', `本次过顶更新 ${C.satN} 批敌舰位置。`, '#9fd4ff'); }
  } else C.satSaid = false;
  if (R.oth) {
    C.othT = (C.othT ?? 20) - dt;
    if (C.othT <= 0) {
      C.othT = 30;
      for (const e of ships) if (e.side === foe && e.alive && !e.dying && !submerged(e) && (e.carrier || e.S.L > 150) && !(tac(foe).navy === 'emcon' && !(e.emconBreak > game.t)) && Math.random() < 0.7) isrFix(side, e, 6000);
    }
  }
}

/* ---------- anti-submarine warfare: hunter-killer groups ----------
   A submarine is never a main effort for missiles and strike aircraft (they cannot reach a submerged boat).
   Designating one - or an enemy boat closing on a carrier - sends a hunter-killer group: the escorts with
   sonar and ASW rockets run to the datum, slow down to listen, and prosecute the contact. */
function aswTasking(side, dt) {
  const C = command[side];
  C.aswT = (C.aswT ?? 0) - dt;
  if (C.aswT > 0) return;
  C.aswT = 3;
  const ds = game.desigShip;
  let tgt = null, ordered = false;
  if (side === game.side && game.role !== 'watch' && ds && ds.alive && !ds.dying && ds.S && ds.S.sub && ds.side !== side) { tgt = ds; ordered = true; }
  if (!tgt) {
    // the staff's own awareness: a hostile boat held within 35 km of a carrier is hunted
    const cv = ships.filter(x => x.side === side && x.carrier && x.alive && !x.dying);
    let bd = 35000;
    for (const [e, tr] of picture[side]) if (e.kind === 'ship' && e.S.sub && e.alive && !e.dying && game.t - tr.t < 60) for (const c of cv) { const d = tr.pos.distanceTo(c.pos); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt && C.aswTgt && C.aswTgt.alive && !C.aswTgt.dying && game.t - (C.aswSeen || 0) < 180) tgt = C.aswTgt;
  }
  const hunters = ships.filter(x => x.side === side && x.hunt && x.alive && !x.dying);
  if (!tgt) { for (const x of hunters) x.hunt = null; C.aswTgt = null; return; }
  const tr = picture[side].get(tgt);
  if (tr) C.aswSeen = Math.max(C.aswSeen || 0, tr.t);
  if (tgt !== C.aswTgt) { for (const x of hunters) x.hunt = null; hunters.length = 0; C.aswTgt = tgt; }
  // lost for three minutes: the search is called off (unless the commander keeps it designated)
  if (!ordered && game.t - (C.aswSeen || 0) > 180) { for (const x of hunters) x.hunt = null; C.aswTgt = null; return; }
  const want = Math.min(2, ships.filter(x => x.side === side && x.alive && !x.dying && !x.carrier && !x.S.sub).length - 1);
  if (hunters.length < want) {
    const datum = tr ? tr.pos : tgt.pos;
    const cand = ships.filter(x => x.side === side && x.alive && !x.dying && !x.carrier && !x.S.sub && !x.hunt && x !== flagship && x.asw > 0)
      .sort((a, b) => ((b.S.sonar || 0) > 0) - ((a.S.sonar || 0) > 0) || a.pos.distanceTo(datum) - b.pos.distanceTo(datum));
    const added = [];
    for (const x of cand.slice(0, want - hunters.length)) { x.hunt = tgt; x.sag = false; added.push(x.name); }
    if (added.length && side === game.side) radio('舰队司令部', `${added.join('、')}组成反潜猎杀群，高速前往${tgt.name}最后位置，到达后低速声呐搜索并实施攻击。`, '#9fd4ff');
    else if (!added.length && !hunters.length && ordered && !C.aswNone) { C.aswNone = true; radio('舰队司令部', '无可用反潜舰艇，只能保持规避。', '#ffd28a'); }
  }
}
// what a designated submarine means for the player's own unit, said once at the moment of designation
function subOrderNote() {
  if (game.role === 'pilot' && player) return player.T.aew ? '预警机保持监视 · 舰队派出反潜猎杀群' : '本机无反潜武器 · 舰队派出反潜猎杀群 · 你继续执行主攻方向任务';
  if (game.role === 'captain' && flagship) return flagship.asw > 0 || flagship.S.sub ? '反潜目标 · 本舰可用反潜火箭 / 鱼雷攻击 · 僚舰组成猎杀群' : '反潜目标 · 僚舰组成反潜猎杀群';
  return '反潜目标 · 舰队派出反潜猎杀群';
}

/* ---------- wingmen ---------- */
function launchWingman(lead) {
  const h = lead.home;
  if (!h || !h.hangar || !(h.hangar[lead.type] > 0) || lead.T.role === 'bomber' || lead.T.aew) return null;
  const w = launchFrom(h, lead.type, 'wing', { lead, slot: 170 });
  if (w) { w.name = `${lead.T.name} 僚机`; game.wingOrder = game.wingOrder || 'follow'; radio(w.name, '僚机就位，跟随长机。', '#9fd4ff'); }
  return w;
}
// the wingman's choice of target follows the player's order
function wingTarget(pl) {
  const L = pl.task && pl.task.lead, P = pl.pilot, order = game.wingOrder || 'follow';
  if (!L || !L.alive || L.dying) { pl.role = 'cap'; pl.task = { off: 12000 }; return; }
  if (order === 'attack') { const t = (game.lock && game.lock.target) || (game.gunTgt && game.gunTgt.kind === 'plane' ? game.gunTgt : null); if (t && t.alive && !t.dying) { if (P.target !== t) P.lockT = 0; P.target = t; } else if (P.target && P.target.pos.distanceTo(L.pos) > 9000) P.target = null; }
  else if (order === 'follow' && P.target && P.target.pos.distanceTo(L.pos) > 9000) P.target = null;
}

/* ---------- the tactical map ---------- */
const TM = { open: false, cx: 0, cz: 0, span: 90000, sel: null, follow: true, drag: null, pts: new Map(), pinch: 0, span0: 0, hits: [] };
function toggleMap() {
  TM.open = !TM.open; game.map = TM.open;
  $('b-map')?.classList.toggle('on', TM.open);
  $('tac').hidden = !TM.open; $('touch').style.visibility = $('topbar').style.visibility = TM.open ? 'hidden' : '';
  if (TM.open) { TM.follow = true; TM.sel = null; TM.pt = null; renderTacOrders(); renderTacCard(); }
}
function tacOwn() { return player || flagship || (game.role === 'watch' ? game.focus : null); }
function tacToScreen(x, z) { const s = Math.min(HW, HH) / TM.span; return [HW / 2 + (x - TM.cx) * s, HH / 2 + (z - TM.cz) * s]; }
function tacToWorld(px, py) { const s = Math.min(HW, HH) / TM.span; return [TM.cx + (px - HW / 2) / s, TM.cz + (py - HH / 2) / s]; }
function drawTacMap() {
  const own = tacOwn(), me = game.side;
  if (TM.follow && own && own.pos) { TM.cx += (own.pos.x - TM.cx) * 0.2; TM.cz += (own.pos.z - TM.cz) * 0.2; }
  const s = Math.min(HW, HH) / TM.span, P = (x, z) => tacToScreen(x, z);
  hc.save();
  hc.fillStyle = 'rgba(3,10,18,0.93)'; hc.fillRect(0, 0, HW, HH);
  // grid every 10 km (5 km when zoomed in), labelled at the left edge
  const step = TM.span > 150000 ? 20000 : TM.span > 50000 ? 10000 : 5000;
  hc.strokeStyle = 'rgba(141,255,180,0.07)'; hc.lineWidth = 1;
  const [wx0, wz0] = tacToWorld(0, 0), [wx1, wz1] = tacToWorld(HW, HH);
  for (let g = Math.floor(wx0 / step) * step; g <= wx1; g += step) { const [x] = P(g, 0); hc.beginPath(); hc.moveTo(x, 0); hc.lineTo(x, HH); hc.stroke(); }
  for (let g = Math.floor(wz0 / step) * step; g <= wz1; g += step) { const [, y] = P(0, g); hc.beginPath(); hc.moveTo(0, y); hc.lineTo(HW, y); hc.stroke(); }
  for (const I of ISLANDS) { const [x, y] = P(I.x, I.z); hc.fillStyle = 'rgba(201,187,142,0.8)'; hc.beginPath(); hc.ellipse(x, y, Math.max(2, I.rx * s), Math.max(1.5, I.rz * s), -(I.rot || 0), 0, Math.PI * 2); hc.fill(); }
  // own weapon envelopes around the player's unit
  if (own && own.pos && own.kind === 'ship') {
    const rings = [];
    const am = Object.keys(own.ashm || {}).filter(k => own.ashm[k] > 0).map(k => MSL[k].range); if (am.length) rings.push([Math.max(...am), '反舰导弹', AMBER]);
    const sm = Object.keys(own.sam || {}).filter(k => own.sam[k] > 0 && !MSL[k].exo).map(k => MSL[k].range); if (sm.length) rings.push([Math.max(...sm), '舰空导弹', BLUE]);
    if (own.gun) rings.push([own.gun.spec.maxR, '舰炮', HUDC]);
    if (own.torpsN) rings.push([14000, '鱼雷', '#7fc8ff']);
    for (const [r, l, col] of rings) { const [x, y] = P(own.pos.x, own.pos.z); hc.strokeStyle = col; hc.globalAlpha = 0.35; hc.setLineDash([4, 6]); hc.beginPath(); hc.arc(x, y, r * s, 0, Math.PI * 2); hc.stroke(); hc.setLineDash([]); hc.globalAlpha = 0.7; hc.fillStyle = col; hc.font = `500 10px ${SANS}`; hc.textAlign = 'center'; hc.fillText(`${l} ${km(r)} km`, x, y - r * s - 4); hc.globalAlpha = 1; }
  } else if (own && own.kind === 'plane' && own.T.mrmType) {
    const [x, y] = P(own.pos.x, own.pos.z), r = MSL[own.T.mrmType].range; hc.strokeStyle = BLUE; hc.globalAlpha = 0.35; hc.setLineDash([4, 6]); hc.beginPath(); hc.arc(x, y, r * s, 0, Math.PI * 2); hc.stroke(); hc.setLineDash([]); hc.globalAlpha = 1;
  }
  // units, grouped at this scale
  const items = [];
  const add = (u, pos, enemy, prio) => { const [x, y] = P(pos.x, pos.z); if (x < -40 || y < -40 || x > HW + 40 || y > HH + 40) return; items.push({ x, y, u, pos, enemy, prio, color: enemy ? (u.kind === 'msl' ? WARN : RED) : BLUE, chosen: u === TM.sel || u === game.ashmSel || u === (game.lock && game.lock.target), alpha: 1 }); };
  for (const sh of ships) if (sh.side === me && sh.alive && !sh.dying && sh !== own) add(sh, sh.pos, false, sh.carrier ? 30 : 20);
  for (const b of bases) if (b.side === me && b.alive) add(b, b.pos, false, 25);
  for (const p of planes) if (p.side === me && p.alive && !p.dying && p.airborne && p !== own) add(p, p.pos, false, p.T.aew ? 12 : 10);
  for (const [e, tr] of picture[me]) { if (!e.alive || e.dying) continue; if (e.kind === 'msl' && !(e.target && (e.target.side === me))) continue; add(e, tr.pos, true, e.carrier ? 45 : e.kind === 'ship' || e.kind === 'base' ? 40 : e.kind === 'msl' ? 35 : e.T && e.T.aew ? 32 : 30); }
  for (const m of missiles) if (m.alive && m.side === me && m.cls === 'ashm') { const [x, y] = P(m.pos.x, m.pos.z); hc.fillStyle = 'rgba(255,255,255,0.8)'; hc.fillRect(x - 1, y - 1, 2, 2); }
  for (const t of torps) if (t.side === me) { const [x, y] = P(t.pos.x, t.pos.z); hc.fillStyle = '#7fc8ff'; hc.fillRect(x - 1, y - 1, 2, 2); }
  TM.hits = [];
  for (const group of [items.filter(i => !i.enemy), items.filter(i => i.enemy)]) for (const c of clusterPx(group, 20)) {
    const t = c.top, u = t.u;
    // velocity leader for ships and aircraft
    // short course leaders: ships always (where they will be in a minute), aircraft only for the selection or when zoomed in
    if (u.vel && u.kind !== 'msl' && c.n === 1 && (u.kind === 'ship' || t.chosen || TM.span < 30000)) {
      const v = u.vel, k = (u.kind === 'ship' ? 60 : 8) * s;
      hc.strokeStyle = t.color; hc.globalAlpha = 0.45; hc.lineWidth = 1; hc.beginPath(); hc.moveTo(c.x, c.y); hc.lineTo(c.x + v.x * k, c.y + v.z * k); hc.stroke(); hc.globalAlpha = 1;
    }
    glyph(hc, c.x, c.y, t, c.n > 1 ? 1.15 : 1);
    badge(hc, c.x, c.y, c.n, t.color);
    if (c.items.some(i => i.chosen)) { hc.strokeStyle = GOLD; hc.lineWidth = 2; hc.beginPath(); hc.arc(c.x, c.y, 13, 0, Math.PI * 2); hc.stroke(); }
    // names only for ships and bases standing alone, or the group's lead when zoomed in
    if ((u.kind === 'ship' || u.kind === 'base') && (c.n === 1 || TM.span < 60000)) { hc.font = `500 10px ${SANS}`; hc.fillStyle = t.color; hc.globalAlpha = 0.85; hc.textAlign = 'left'; hc.fillText(c.n > 1 ? `${u.name} 等` : u.name, c.x + 11, c.y + 4); hc.globalAlpha = 1; }
    TM.hits.push(c);
  }
  // the designated target: a gold line from the player's unit, with range and what will hit it
  const dsub = game.desigShip && game.desigShip.S && game.desigShip.S.sub && game.desigShip.alive && !game.desigShip.dying ? game.desigShip : null;
  const tg = dsub || (game.ashmSel && game.ashmSel.alive && !game.ashmSel.dying ? game.ashmSel : null) || (game.lock.desig && game.lock.desig.alive && game.lockManual > game.t ? game.lock.desig : null);
  if (tg && own && own.pos) {
    const tp = trackPos(me, tg, _b) || tg.pos, [x0, y0] = P(own.pos.x, own.pos.z), [x1, y1] = P(tp.x, tp.z);
    hc.strokeStyle = GOLD; hc.lineWidth = 1.6; hc.setLineDash([7, 5]); hc.beginPath(); hc.moveTo(x0, y0); hc.lineTo(x1, y1); hc.stroke(); hc.setLineDash([]);
    hc.beginPath(); hc.arc(x1, y1, 16, 0, Math.PI * 2); hc.stroke();
    for (const a of [0, 1, 2, 3]) { const an = a * Math.PI / 2; hc.beginPath(); hc.moveTo(x1 + Math.cos(an) * 12, y1 + Math.sin(an) * 12); hc.lineTo(x1 + Math.cos(an) * 21, y1 + Math.sin(an) * 21); hc.stroke(); }
    const d = tp.distanceTo(own.pos), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const inbound = planes.filter(q => q.side === me && q.alive && q.task && q.task.target === tg && (q.role === 'strike' || q.role === 'bomber')).length;
    const isMain = intentTarget(me) === tg;
    const hk = dsub ? ships.filter(x => x.side === me && x.hunt === tg && x.alive && !x.dying).length : 0;
    const label = dsub ? `反潜目标 ${tg.name} · ${km(d)} km · ${hk ? `${hk} 艘猎杀舰前往` : '待派反潜舰'}`
      : `${isMain ? '主攻目标' : '目标'} ${tg.name || tg.T?.name} · ${km(d)} km${inbound ? ` · ${inbound} 架攻击机前往` : ''}`;
    hc.font = `700 12px ${SANS}`; const w = hc.measureText(label).width + 12;
    hc.fillStyle = 'rgba(6,10,14,0.85)'; hc.fillRect(mx - w / 2, my - 18, w, 20); hc.fillStyle = GOLD; hc.textAlign = 'center'; hc.fillText(label, mx, my - 4);
  }
  // the main effort: a broad arrow from the fleet down the axis, so the whole side's orientation is visible
  const ip = intentPos(me, new V3()), fc = fleetCentre(me);
  if (ip && fc) {
    const I = intentState(me), [x0, y0] = P(fc.x, fc.z), [x1, y1] = P(ip.x, ip.z), a = Math.atan2(y1 - y0, x1 - x0);
    hc.strokeStyle = 'rgba(227,178,87,0.28)'; hc.lineWidth = 10; hc.lineCap = 'round'; hc.beginPath(); hc.moveTo(x0, y0); hc.lineTo(x1 - Math.cos(a) * 18, y1 - Math.sin(a) * 18); hc.stroke(); hc.lineCap = 'butt';
    hc.fillStyle = 'rgba(227,178,87,0.5)'; hc.beginPath(); hc.moveTo(x1, y1); hc.lineTo(x1 - Math.cos(a - 0.45) * 26, y1 - Math.sin(a - 0.45) * 26); hc.lineTo(x1 - Math.cos(a + 0.45) * 26, y1 - Math.sin(a + 0.45) * 26); hc.closePath(); hc.fill();
    if (!I.tgt) { hc.strokeStyle = GOLD; hc.lineWidth = 1.5; hc.beginPath(); hc.arc(x1, y1, 9, 0, Math.PI * 2); hc.stroke(); }
    const pk = (command[me].pkgs || []).filter(k => (k.phase === 'form' || k.phase === 'push') && k.tgt === I.tgt).length;
    const lbl = `主攻方向 · ${I.tgt ? I.tgt.name : '指定海域'}${I.src === 'player' ? '' : '（司令部）'}${pk ? ` · ${pk} 个攻击编队在途` : ''}`;
    // the label sits by the arrowhead (the target line's label owns the midpoint); one label when they coincide
    const tgSame = I.tgt && (I.tgt === game.ashmSel);
    if (!tgSame) { hc.font = `700 11px ${SANS}`; hc.fillStyle = GOLD; hc.globalAlpha = 0.9; hc.textAlign = 'center'; hc.fillText(lbl, x1, y1 + (y1 > y0 ? 30 : -28)); hc.globalAlpha = 1; }
    TM.axisPk = pk;
  }
  // coarse fixes (satellite / OTH radar): an uncertainty circle instead of a precise position
  for (const [e, tr] of picture[me]) {
    if (!tr.coarse || !e.alive || e.dying || game.t - tr.t > 90) continue;
    const q = trackPos(me, e, _in2); if (!q) continue;
    const [x, y] = P(q.x, q.z);
    hc.strokeStyle = 'rgba(255,138,120,0.5)'; hc.setLineDash([2, 4]); hc.lineWidth = 1; hc.beginPath(); hc.arc(x, y, Math.max(7, (tr.coarse + (game.t - tr.t) * 12) * s), 0, Math.PI * 2); hc.stroke(); hc.setLineDash([]);
  }
  const Cm = command[me];
  if (Cm.satEnd > game.t) { hc.font = `700 11px ${SANS}`; hc.fillStyle = '#9fd4ff'; hc.textAlign = 'left'; hc.fillText(`🛰 己方侦察卫星过顶 · ${Math.ceil(Cm.satEnd - game.t)} s`, 16, 72); }
  const Cf = command[SIDES[me].foe];
  if (Cf.satEnd > game.t) { hc.font = `700 11px ${SANS}`; hc.fillStyle = '#ffd28a'; hc.textAlign = 'left'; hc.fillText(`⚠ 敌方侦察卫星过顶 · ${Math.ceil(Cf.satEnd - game.t)} s`, 16, 88); }
  // strike packages of the player's side: rendezvous, the two attack axes through their initial points, the target
  for (const k of command[me].pkgs || []) {
    if (k.phase !== 'form' && k.phase !== 'push') continue;
    const tp = trackPos(me, k.tgt, _in2) || k.tgt.pos; if (!tp) continue;
    const [rx, ry] = P(k.rv.x, k.rv.z), [tx, ty] = P(tp.x, tp.z);
    const dx = tp.x - k.rv.x, dz = tp.z - k.rv.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const ac = k.members.find(q => q.alive && q.T.ashmType);
    const back = (ac ? MSL[ac.T.ashmType].range * 0.82 : 30000) + 9000;
    hc.strokeStyle = 'rgba(143,200,255,0.55)'; hc.lineWidth = 1.2; hc.setLineDash([3, 5]);
    for (const sgn of [1, -1]) {
      const ix = tp.x - ux * back - uz * 7500 * sgn, iz = tp.z - uz * back + ux * 7500 * sgn, [qx, qy] = P(ix, iz);
      hc.beginPath(); hc.moveTo(rx, ry); hc.lineTo(qx, qy); hc.lineTo(tx, ty); hc.stroke();
      hc.fillStyle = 'rgba(143,200,255,0.8)'; hc.fillRect(qx - 2.5, qy - 2.5, 5, 5);
    }
    hc.setLineDash([]);
    hc.strokeStyle = BLUE; hc.lineWidth = 1.5; hc.beginPath(); hc.moveTo(rx, ry - 6); hc.lineTo(rx + 6, ry); hc.lineTo(rx, ry + 6); hc.lineTo(rx - 6, ry); hc.closePath(); hc.stroke();
    hc.font = `600 10px ${SANS}`; hc.fillStyle = BLUE; hc.textAlign = 'center';
    hc.fillText(k.phase === 'form' ? `第${k.id}编队 集结 ${k.ready || 0}/${k.total || 0} · ${Math.max(0, Math.ceil(PKG_FORM_MAX - (game.t - k.t)))}s` : `第${k.id}编队 已出发`, rx, ry - 10);
  }
  if (TM.pt) { const [x, y] = P(TM.pt.x, TM.pt.z); hc.strokeStyle = '#eef3f5'; hc.lineWidth = 1.5; hc.beginPath(); hc.moveTo(x - 8, y); hc.lineTo(x + 8, y); hc.moveTo(x, y - 8); hc.lineTo(x, y + 8); hc.stroke(); }
  // the player's own unit: impossible to miss
  if (own && own.pos) {
    const [x, y] = P(own.pos.x, own.pos.z), hdg = own.kind === 'plane' ? Math.atan2(own.fwd.z, own.fwd.x) : -own.heading, pulse = 14 + Math.sin(game.t * 4) * 3;
    hc.strokeStyle = GOLD; hc.lineWidth = 2; hc.beginPath(); hc.arc(x, y, pulse, 0, Math.PI * 2); hc.stroke();
    hc.save(); hc.translate(x, y); hc.rotate(hdg); hc.fillStyle = GOLD; hc.beginPath(); hc.moveTo(10, 0); hc.lineTo(-7, -6); hc.lineTo(-3, 0); hc.lineTo(-7, 6); hc.closePath(); hc.fill(); hc.restore();
    hc.font = `700 11px ${SANS}`; hc.fillStyle = GOLD; hc.textAlign = 'center'; hc.fillText('你', x, y - pulse - 5);
  }
  // confirmations (target set, tactic changed, salvo fired) show on the map too
  let my2 = 58;
  for (const m of game.msgs) { hc.globalAlpha = clamp(m.t / 0.4, 0, 1); hc.font = `800 15px ${SANS}`; hc.fillStyle = m.color; hc.textAlign = 'center'; hc.fillText(m.sub ? `${m.text} · ${m.sub}` : m.text, HW / 2, my2 + 14); my2 += 20; }
  hc.globalAlpha = 1;
  // scale bar
  const barM = step, barPx = barM * s;
  hc.strokeStyle = '#eef3f5'; hc.lineWidth = 1.5; hc.beginPath(); hc.moveTo(16, HH - 150); hc.lineTo(16 + barPx, HH - 150); hc.stroke();
  hc.font = `500 10px ${MONO}`; hc.fillStyle = '#eef3f5'; hc.textAlign = 'left'; hc.fillText(`${barM / 1000} km`, 16, HH - 156);
  hc.restore();
  $('tac-scale').textContent = `视野 ${Math.round(TM.span / 1000)} km`;
  TM.cardT = (TM.cardT || 0) - 1; if (TM.cardT <= 0) { TM.cardT = 15; renderTacCard(); }
}
// a tap: a group zooms in, a single unit is selected (and, if hostile, designated)
function tacTap(x, y) {
  let best = null, bd = 26;
  for (const c of TM.hits) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
  if (!best) { TM.sel = null; const [wx, wz] = tacToWorld(x, y); TM.pt = new V3(wx, 0, wz); renderTacCard(); return; }
  TM.pt = null;
  if (best.n > 1 && TM.span > 12000) { const [wx, wz] = tacToWorld(best.x, best.y); TM.cx = wx; TM.cz = wz; TM.follow = false; TM.span = Math.max(8000, TM.span / 2.6); return; }
  TM.sel = best.top.u;
  if (best.top.enemy) designate(TM.sel);
  renderTacCard();
}
function designate(e) {
  if (e.kind === 'ship' || e.kind === 'base') { game.ashmSel = e; game.desigShip = e; playerIntent(e); }
  game.gunTgt = e;
  if (game.role === 'pilot' && e.kind === 'plane') { game.lock.desig = e; game.lockManual = game.t + 30; }
  Sound.beep(1500, 0.05, 0.05);
}
function renderTacCard() {
  const el = $('tac-card'), u = TM.sel;
  if (!u && TM.pt && game.role !== 'watch') {
    // open sea: the commander can make it the side's direction of attack
    const own = tacOwn(), d = own && own.pos ? TM.pt.distanceTo(_a.copy(own.pos).setY(0)) : 0;
    el.innerHTML = `<b style="color:var(--gold, #e3b257)">海域 ${Math.round(TM.pt.x / 1000)}, ${Math.round(TM.pt.z / 1000)}</b><span>距你 ${km(d)} km</span><div class="acts"><button type="button" data-i="0">设为主攻方向</button></div>`;
    el.querySelector('button').onclick = () => { playerIntent(null, TM.pt); message('主攻方向已确定', '舰队、潜艇与空中力量向该海域集中', GOLD, 2.6); TM.pt = null; renderTacCard(); };
    el.hidden = false; return;
  }
  if (!u || !u.alive || u.dying) { el.hidden = true; return; }
  const own = tacOwn(), enemy = u.side !== game.side;
  const d = own && own.pos ? u.pos.distanceTo(own.pos) : 0;
  const brg = own && own.pos ? Math.round(((90 - headingOf(_a.subVectors(u.pos, own.pos)) / D2R) % 360 + 360) % 360) : 0;
  const type = u.kind === 'ship' ? u.S.type : u.kind === 'plane' ? u.T.name : u.kind === 'base' ? '岛礁机场' : u.spec ? u.spec.name : '';
  const hp = u.maxHp ? `${Math.round(u.hp / u.maxHp * 100)}%` : '';
  const spd = u.vel ? `${Math.round(u.vel.length() * 1.94)} 节` : '';
  let html = `<b style="color:${enemy ? 'var(--cn)' : 'var(--us)'}">${u.name || type}</b><span>${type}${enemy ? ' · 敌' : ' · 友'}</span>`;
  html += `<dl><dt>距离</dt><dd>${km(d)} km</dd><dt>方位</dt><dd>${String(brg).padStart(3, '0')}°</dd>${spd ? `<dt>速度</dt><dd>${spd}</dd>` : ''}${!enemy && hp ? `<dt>完好</dt><dd>${hp}</dd>` : ''}</dl>`;
  const acts = [];
  if (enemy) {
    const isT = u === game.ashmSel || u === game.lock.desig;
    const what = u.S && u.S.sub ? subOrderNote() : u.kind === 'plane' ? (game.role === 'pilot' ? '开 AI 驾驶将自动拦截' : '舰炮与防空优先对准它')
      : `全军主攻目标 · ${game.role === 'pilot' && player ? (player.ashmN > 0 ? '你的 AI 驾驶将前往攻击' : player.T.ew ? '你的 AI 驾驶将前出干扰压制' : player.T.aew ? '你的预警机转向监视它' : '你的 AI 驾驶将前出夺取制空') : '舰队、潜艇与攻击波向它集中'}`;
    acts.push([isT ? '✓ 当前目标' : u.kind === 'plane' ? '设为目标' : u.S && u.S.sub ? '反潜猎杀' : '设为主攻目标', () => { designate(u); message('目标已指定', `${u.name || type} · ${what}`, GOLD, 2.6); }]);
    if (flagship && (u.kind === 'ship' || u.kind === 'base')) {
      if (!flagship.S.sub && !flagship.carrier) acts.push(['反舰齐射', () => { designate(u); useAbility(flagship, 'salvo', u); }]);
      if (flagship.carrier) acts.push(['出动攻击波', () => { designate(u); useAbility(flagship, 'strike', u); }]);
      if (flagship.S.sub) acts.push(['鱼雷攻击', () => { designate(u); useAbility(flagship, 'torp', u); }]);
      if (flagship.tlamN > 0) acts.push(['战斧打击', () => { designate(u); useAbility(flagship, 'tlam', u); }]);
      if (tac(game.side).navy !== 'focus') acts.push(['舰队集火', () => { designate(u); setTactic('navy', 'focus'); renderTacOrders(); }]);
    }
  } else if (game.role === 'watch' || (u.kind === 'ship' || (u.kind === 'plane' && u.state === 'air'))) {
    acts.push(['镜头跟随', () => { toggleMap(); if (game.role === 'watch') specFollow(u); }]);
    if (u.kind === 'ship' || u.kind === 'plane') acts.push(['接管', () => { toggleMap(); takeRole(u.kind === 'ship' ? 'captain' : 'pilot', u); }]);
  }
  el.innerHTML = html + `<div class="acts">${acts.map((a, i) => `<button type="button" data-i="${i}">${a[0]}</button>`).join('')}</div>`;
  el.querySelectorAll('.acts button').forEach(b => b.onclick = () => { acts[+b.dataset.i][1](); renderTacCard(); });
  el.hidden = false;
}
function renderTacOrders() {
  const T = tac(game.side);
  const mk = (box, kind, cur) => {
    box.innerHTML = '';
    for (const [id, t] of Object.entries(TACTICS[kind])) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t.name; if (id === cur) b.className = 'on';
      b.onclick = () => { if (kind === 'wing') { game.wingOrder = id; radio('僚机', `收到：${t.name}。`, '#9fd4ff'); } else setTactic(kind, id); renderTacOrders(); $('tac-desc').textContent = t.desc; };
      b.onpointerenter = () => { $('tac-desc').textContent = t.desc; };
      box.appendChild(b);
    }
  };
  mk($('tac-navy'), 'navy', T.navy); mk($('tac-air'), 'air', T.air);
  const wing = planes.some(p => p.role === 'wing' && p.alive && p.task && p.task.lead === player);
  $('tac-wing-g').hidden = !wing;
  if (wing) mk($('tac-wing'), 'wing', game.wingOrder || 'follow');
  $('tac-desc').textContent = `舰队：${TACTICS.navy[T.navy].desc}　空中：${TACTICS.air[T.air].desc}`;
}
// gestures on the map: drag pans, pinch / wheel zooms, tap selects
{
  const hit = $('tac-hit');
  hit.addEventListener('pointerdown', e => { e.preventDefault(); try { hit.setPointerCapture(e.pointerId); } catch (_) {} TM.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }); if (TM.pts.size === 2) { const [a, b] = [...TM.pts.values()]; TM.pinch = Math.hypot(a.x - b.x, a.y - b.y); TM.span0 = TM.span; } });
  hit.addEventListener('pointermove', e => {
    const q = TM.pts.get(e.pointerId); if (!q) return;
    const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
    if (TM.pts.size >= 2) { const [a, b] = [...TM.pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (TM.pinch > 10) TM.span = clamp(TM.span0 * TM.pinch / d, 6000, 260000); return; }
    if (Math.hypot(e.clientX - q.x0, e.clientY - q.y0) > 6) { const sc = TM.span / Math.min(HW, HH); TM.cx -= dx * sc; TM.cz -= dy * sc; TM.follow = false; }
  });
  const up = e => { const q = TM.pts.get(e.pointerId); if (q && TM.pts.size === 1 && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < 8 && performance.now() - q.t0 < 400) tacTap(e.clientX, e.clientY); TM.pts.delete(e.pointerId); };
  hit.addEventListener('pointerup', up);
  for (const ev of ['pointercancel', 'lostpointercapture']) hit.addEventListener(ev, e => TM.pts.delete(e.pointerId));
  hit.addEventListener('wheel', e => { e.preventDefault(); TM.span = clamp(TM.span * (e.deltaY > 0 ? 1.15 : 0.87), 6000, 260000); }, { passive: false });
  $('tac-close').onclick = toggleMap;
  $('tac-me').onclick = () => { TM.follow = true; };
  $('tac-zin').onclick = () => { TM.span = Math.max(6000, TM.span / 1.6); };
  $('tac-zout').onclick = () => { TM.span = Math.min(260000, TM.span * 1.6); };
}
