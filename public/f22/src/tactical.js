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
  C.tacT = 70;
  const foeKnown = !!enemyFleet(side);
  const carriers = ships.filter(s => s.side === side && s.carrier && s.alive && !s.dying);
  const hurt = carriers.some(s => s.hp < s.maxHp * 0.6);
  const inbound = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side !== side).length;
  setTactic('navy', !foeKnown ? (Math.random() < 0.5 ? 'emcon' : 'balanced') : hurt || inbound > 10 ? 'ring' : Math.random() < 0.35 ? 'strike' : Math.random() < 0.5 ? 'disperse' : 'balanced', side);
  const aew = [...picture[side].keys()].some(e => e.kind === 'plane' && e.T.aew);
  setTactic('air', !foeKnown ? 'sweep' : aew && Math.random() < 0.5 ? 'hunt' : hurt ? 'cap' : Math.random() < 0.4 ? 'mass' : Math.random() < 0.5 ? 'low' : 'balanced', side);
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
  const foeC = enemyFleet(side);
  let point = foeC ? (trackPos(side, foeC, new V3()) || foeC.pos.clone()) : new V3(side === 'cn' ? 30000 : -30000, 0, 0);
  if (t === 'hunt') for (const [e, tr] of picture[side]) if (e.kind === 'plane' && e.T.aew && e.alive) { point = tr.pos.clone(); break; }
  // stop short of the enemy ships' missile umbrella
  const own = fleetCentre(side) || ZERO;
  const dir = _a.subVectors(point, own).setY(0); const L = dir.length();
  if (foeC && t === 'sweep') point = own.clone().addScaledVector(dir.normalize(), Math.max(0, L - 30000));
  let n = 0;
  for (const h of homes) for (let i = 0; i < 2 && n < 4; i++) { const ty = ['j35', 'f35c', 'fa18', 'j15'].find(x => h.hangar[x] > 0); if (ty) { const p = launchFrom(h, ty, 'sweep', { point, hunt: t === 'hunt' }); if (p) n++; } }
  if (n && side === game.side) radio('空中指挥', `${n} 架战斗机${t === 'hunt' ? '前出猎杀敌预警机' : '执行战斗机扫荡'}。`, '#9fd4ff');
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
  if (TM.open) { TM.follow = true; TM.sel = null; renderTacOrders(); renderTacCard(); }
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
  // the player's own unit: impossible to miss
  if (own && own.pos) {
    const [x, y] = P(own.pos.x, own.pos.z), hdg = own.kind === 'plane' ? Math.atan2(own.fwd.z, own.fwd.x) : -own.heading, pulse = 14 + Math.sin(game.t * 4) * 3;
    hc.strokeStyle = GOLD; hc.lineWidth = 2; hc.beginPath(); hc.arc(x, y, pulse, 0, Math.PI * 2); hc.stroke();
    hc.save(); hc.translate(x, y); hc.rotate(hdg); hc.fillStyle = GOLD; hc.beginPath(); hc.moveTo(10, 0); hc.lineTo(-7, -6); hc.lineTo(-3, 0); hc.lineTo(-7, 6); hc.closePath(); hc.fill(); hc.restore();
    hc.font = `700 11px ${SANS}`; hc.fillStyle = GOLD; hc.textAlign = 'center'; hc.fillText('你', x, y - pulse - 5);
  }
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
  if (!best) { TM.sel = null; renderTacCard(); return; }
  if (best.n > 1 && TM.span > 12000) { const [wx, wz] = tacToWorld(best.x, best.y); TM.cx = wx; TM.cz = wz; TM.follow = false; TM.span = Math.max(8000, TM.span / 2.6); return; }
  TM.sel = best.top.u;
  if (best.top.enemy) designate(TM.sel);
  renderTacCard();
}
function designate(e) {
  if (e.kind === 'ship' || e.kind === 'base') game.ashmSel = e;
  game.gunTgt = e;
  if (game.role === 'pilot' && e.kind === 'plane') { game.lock.desig = e; game.lockManual = game.t + 30; }
  Sound.beep(1500, 0.05, 0.05);
}
function renderTacCard() {
  const el = $('tac-card'), u = TM.sel;
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
    acts.push(['设为目标', () => { designate(u); message('目标指定', u.name || type, GOLD, 1.2); }]);
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
