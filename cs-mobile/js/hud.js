import { WEAPONS, EQUIP, BUY_MENU } from './weapons.js';
import { SITES } from './mapdata.js';

const $ = id => document.getElementById(id);
const TEAMNAME = { T: '恐怖分子', CT: '反恐精英' };
const STREAK = ['', '', '双杀', '三杀', '四杀', 'ACE 五杀！'];

export class HUD {
  constructor(icons, audio) {
    this.icons = icons; this.audio = audio;
    this.el = $('hud');
    this.radar = $('radar'); this.rctx = this.radar.getContext('2d');
    this.feed = $('killfeed'); this.crossEls = ['ch-t', 'ch-b', 'ch-l', 'ch-r'].map($);
    this.hurtT = 0; this.flashT = 0; this.flashMax = 0; this.radarT = 0; this.lastBombBlink = 0;
    this.buyOpen = false; this.scoreOpen = false;
  }

  bind(game) {
    this.game = game;
    this.buildRadarImage();
    this.buildBuyMenu();
  }

  // ---------------- radar ----------------
  buildRadarImage() {
    const w = this.game.world; const N = w.navN || 84; const c = document.createElement('canvas'); c.width = c.height = N * 4;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(20,18,14,0.0)'; x.fillRect(0, 0, c.width, c.height);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const m = w.floorRaster[j * N + i];
      if (!m) continue;
      x.fillStyle = m === 'tiles' ? '#8a7a64' : m === 'cobble' ? '#7d725f' : m === 'concrete' ? '#6a665e' : '#8c8068';
      x.fillRect(i * 4, j * 4, 4, 4);
    }
    // platforms / walls
    for (const s of w.solids) {
      if (s.kind === 'building' || s.kind === 'roof') continue;
      const X = (s.min[0] + 84) / 2 * 4, Z = (s.min[2] + 84) / 2 * 4, W = (s.max[0] - s.min[0]) / 2 * 4, H = (s.max[2] - s.min[2]) / 2 * 4;
      x.fillStyle = s.kind === 'platform' || s.kind === 'stair' ? 'rgba(200,185,150,0.55)' : 'rgba(40,36,30,0.9)';
      x.fillRect(X, Z, W, H);
    }
    // outline edges
    x.strokeStyle = 'rgba(255,240,210,0.35)'; x.lineWidth = 1;
    for (const k in SITES) { const s = SITES[k]; x.fillStyle = 'rgba(255,90,60,0.18)'; x.fillRect((s.x0 + 84) * 2, (s.z0 + 84) * 2, (s.x1 - s.x0) * 2, (s.z1 - s.z0) * 2); x.fillStyle = 'rgba(255,200,120,0.95)'; x.font = 'bold 22px Teko, sans-serif'; x.fillText(s.label, ((s.x0 + s.x1) / 2 + 84) * 2 - 6, ((s.z0 + s.z1) / 2 + 84) * 2 + 8); }
    this.radarImg = c;
  }

  drawRadar() {
    const g = this.game, P = g.player, ctx = this.rctx, R = this.radar.width;
    const view = g.spectate && !P.alive ? g.spectate : P;
    ctx.clearRect(0, 0, R, R);
    ctx.save();
    ctx.beginPath(); ctx.arc(R / 2, R / 2, R / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(12,14,16,0.72)'; ctx.fillRect(0, 0, R, R);
    const scale = 2.6; // px per meter on the radar canvas (radarImg is 2px/m)
    ctx.translate(R / 2, R / 2); ctx.rotate(view.yaw); ctx.scale(scale / 2, scale / 2);
    ctx.drawImage(this.radarImg, -(view.pos.x + 84) * 2, -(view.pos.z + 84) * 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // entities
    const toR = (x, z) => {
      const dx = (x - view.pos.x) * scale, dz = (z - view.pos.z) * scale;
      const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
      return [R / 2 + dx * c - dz * s, R / 2 + dx * s + dz * c];
    };
    for (const a of g.agents) {
      if (!a.alive || a === view) continue;
      const friendly = a.team === P.team;
      const seen = friendly || (a.lastSpotted && g.time - a.lastSpotted < 1.2);
      if (!seen) continue;
      const [x, y] = toR(a.pos.x, a.pos.z);
      ctx.fillStyle = friendly ? (a.team === 'T' ? '#f2c14e' : '#6fb3ff') : '#ff3b30';
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    const B = g.bomb;
    if ((B.planted || B.dropped || B.carrier) && P.team === 'T' || B.planted) {
      const bp = B.carrier ? B.carrier.pos : B.pos; const [x, y] = toR(bp.x, bp.z);
      if (B.planted || B.dropped) { ctx.fillStyle = (Math.floor(g.time * 3) % 2 && B.planted) ? '#ff2a1a' : '#ff8a3a'; ctx.fillRect(x - 4, y - 3, 8, 6); }
    }
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(R / 2, R / 2 - 7); ctx.lineTo(R / 2 - 5, R / 2 + 5); ctx.lineTo(R / 2, R / 2 + 2); ctx.lineTo(R / 2 + 5, R / 2 + 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(R / 2, R / 2, R / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const g = this.game, P = g.player; if (!g || !P) return;
    // mark enemies spotted by our team (for radar)
    for (const a of g.agents) if (a.team !== P.team && a.alive) {
      for (const b of g.agents) if (b.team === P.team && b.alive && b.brain && b.brain.target === a) { a.lastSpotted = g.time; break; }
    }
    this.radarT -= dt; if (this.radarT <= 0) { this.radarT = 1 / 20; this.drawRadar(); }
    // top bar
    const t = g.mode === 'tdm' ? g.tdmTime : g.phase === 'freeze' ? g.phaseT : g.phase === 'post' ? g.bomb.timer : g.roundTime;
    const tt = Math.max(0, Math.ceil(t));
    $('timer').textContent = g.phase === 'post' ? '' : `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('low', g.phase === 'live' && t < 10);
    $('bombicon').style.display = g.phase === 'post' ? 'block' : 'none';
    $('score-t').textContent = g.score.T; $('score-ct').textContent = g.score.CT;
    const aliveT = g.agents.filter(a => a.team === 'T' && a.alive).length, aliveCT = g.agents.filter(a => a.team === 'CT' && a.alive).length;
    const pips = (team, n, tot) => Array.from({ length: tot }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    const totT = g.agents.filter(a => a.team === 'T').length, totCT = g.agents.filter(a => a.team === 'CT').length;
    const ph = `${aliveT}|${aliveCT}`;
    if (this._pips !== ph) { this._pips = ph; $('alive-t').innerHTML = pips('T', aliveT, totT); $('alive-ct').innerHTML = pips('CT', aliveCT, totCT); }
    $('roundno').textContent = g.mode === 'tdm' ? `目标 ${g.winTarget} 击杀` : `第 ${g.round} 回合 · 先胜 ${g.winTarget}`;
    // player status
    const view = P.alive ? P : (g.spectate || P);
    $('hp').textContent = Math.max(0, Math.ceil(view.hp)); $('armor').textContent = Math.ceil(view.armor);
    $('hpbar').style.width = Math.max(0, view.hp) + '%';
    $('helm').style.opacity = view.helmet ? 1 : 0.25;
    $('money').textContent = '$' + P.money;
    const ws = view.ws; const def = view.currentDef();
    $('wname').textContent = def.name;
    if (ws && ws.def.mag) { $('ammo').textContent = ws.ammo; $('reserve').textContent = '/ ' + ws.reserve; $('ammo').classList.toggle('low', ws.ammo <= Math.ceil(ws.def.mag * 0.2)); }
    else { $('ammo').textContent = def.type === 'grenade' ? view.inv.grenades.length : '∞'; $('reserve').textContent = ''; $('ammo').classList.remove('low'); }
    $('reloadhint').style.display = ws && ws.reloading ? 'block' : 'none';
    const zone = g.world.zoneAt(view.pos.x, view.pos.z); $('zone').textContent = zone;
    // crosshair
    const inacc = P.alive ? P.inaccuracy() : 0;
    const fovScale = window.innerHeight / (2 * Math.tan(g.camera.fov * Math.PI / 360));
    const gap = Math.min(80, 4 + Math.tan(inacc * Math.PI / 180) * fovScale * 0.9);
    const show = P.alive && !g.scoped && !(ws && ws.def.type === 'sniper');
    $('crosshair').style.display = show ? 'block' : 'none';
    this.crossEls[0].style.transform = `translate(-50%, ${-gap - 9}px)`; this.crossEls[1].style.transform = `translate(-50%, ${gap}px)`;
    this.crossEls[2].style.transform = `translate(${-gap - 9}px, -50%)`; this.crossEls[3].style.transform = `translate(${gap}px, -50%)`;
    $('scope').style.display = g.scoped ? 'block' : 'none';
    if (g.scoped) $('scope').classList.toggle('moving', inacc > 0.5);
    // hurt / flash overlays
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
    const low = P.alive && P.hp < 30 ? 0.25 + Math.sin(g.time * 5) * 0.08 : 0;
    $('hurt').style.opacity = Math.max(this.hurtT, low);
    if (this.flashT > 0) { this.flashT -= dt; $('flashov').style.opacity = Math.min(1, this.flashT / Math.max(0.5, this.flashMax * 0.5)); } else $('flashov').style.opacity = 0;
    // context buttons
    const usable = P.alive && ((P.inv.c4 && g.inSite(P.pos) && g.phase === 'live') || (P.team === 'CT' && g.bomb.planted && Math.hypot(P.pos.x - g.bomb.pos.x, P.pos.z - g.bomb.pos.z) < 1.6));
    $('btn-use').classList.toggle('show', !!usable);
    $('btn-use').textContent = P.inv.c4 && g.inSite(P.pos) ? '安放' : '拆除';
    const drop = P.alive ? g.nearestDrop(P) : null;
    $('btn-pick').classList.toggle('show', !!drop); if (drop) $('btn-pick').textContent = '拾取 ' + drop.ws.def.name;
    $('btn-buy').classList.toggle('show', g.canBuy(P));
    if (this.buyOpen && !g.canBuy(P)) this.toggleBuy(false);
    if (this.buyOpen) this.refreshBuy();
    $('freeze').style.display = g.phase === 'freeze' ? 'block' : 'none';
    if (g.phase === 'freeze') $('freeze').textContent = g.mode === 'tdm' ? `准备 ${Math.ceil(g.phaseT)}` : `购买阶段 ${Math.ceil(g.phaseT)}`;
    // weapon slots
    const slots = ['primary', 'secondary', 'knife', 'grenade', 'c4'];
    const key = slots.map(s => s === 'grenade' ? P.inv.grenades.join(',') : s === 'c4' ? P.inv.c4 : (P.inv[s] && P.inv[s].id)).join('|') + P.cur;
    if (this._slots !== key) {
      this._slots = key;
      for (const s of slots) {
        const el = $('slot-' + s); if (!el) continue;
        let id = s === 'grenade' ? P.inv.grenades[0] : s === 'c4' ? (P.inv.c4 ? 'c4' : null) : (P.inv[s] && P.inv[s].id);
        el.style.display = id ? 'flex' : 'none';
        el.classList.toggle('active', P.cur === s);
        if (id) el.innerHTML = `<img src="${this.icons[id] || ''}">${s === 'grenade' && P.inv.grenades.length > 1 ? `<b>x${P.inv.grenades.length}</b>` : ''}`;
      }
    }
    if (this.scoreOpen) this.renderScore();
    // spectate label
    $('spectate').style.display = !P.alive && g.spectate && g.mode === 'defuse' ? 'block' : 'none';
    if (!P.alive && g.spectate && (this._specHp !== g.spectate.hp || this._spec !== g.spectate)) { this._specHp = g.spectate.hp; this._spec = g.spectate; this.spectating(g.spectate); }
    if (!P.alive && g.mode === 'tdm' && P.respawnT) { $('respawn').style.display = 'block'; $('respawn').textContent = `${Math.max(0, P.respawnT - g.time).toFixed(1)} 秒后重生`; } else $('respawn').style.display = 'none';
    // fps
    const now = performance.now(); this.fpsN = (this.fpsN || 0) + 1;
    if (!this.fpsT0) this.fpsT0 = now;
    if (now - this.fpsT0 > 500) { $('fps').textContent = Math.round(this.fpsN * 1000 / (now - this.fpsT0)) + ' FPS'; this.fpsT0 = now; this.fpsN = 0; }
  }

  // ---------------- events ----------------
  onRoundStart(g) {
    this.toggleBuy(false);
    $('roundend').classList.remove('show');
    $('bombplanted').classList.remove('show');
    this.progress(null);
    if (g.mode === 'defuse') this.center(g.round === 1 ? `你是${TEAMNAME[g.player.team]}` : `第 ${g.round} 回合`, g.player.team === 'T' ? '#f2c14e' : '#6fb3ff', g.player.team === 'T' ? (g.player.inv.c4 ? '你携带了炸弹 — 前往 A 或 B 包点安放' : '保护炸弹携带者，进攻包点') : '守住 A / B 包点，阻止炸弹安放');
    this.feed.innerHTML = '';
    $('spectate').style.display = 'none';
  }

  onRoundEnd(g, winner, reason, mvp) {
    const el = $('roundend');
    const txt = { elim: '全部消灭', bomb: '炸弹已爆炸', defuse: '炸弹已拆除', time: '时间耗尽' }[reason] || '';
    el.className = 'show ' + (winner === 'T' ? 't' : 'ct');
    el.innerHTML = `<div class="re-title">${TEAMNAME[winner]}获胜</div><div class="re-sub">${txt}</div>${mvp ? `<div class="re-mvp">★ MVP：${mvp.name} <small>${mvp.roundKills} 击杀</small></div>` : ''}`;
    this.audio.play(winner === g.player.team ? 'sting_win' : 'sting_lose', { volume: 0.55 });
  }

  killFeed(att, vic, weapon, hs, wall, assist) {
    const row = document.createElement('div'); row.className = 'kf';
    const P = this.game.player;
    if (att === P || vic === P) row.classList.add('me');
    const cls = a => a ? (a.team === 'T' ? 't' : 'ct') : '';
    const icon = weapon && this.icons[weapon.id] ? `<img src="${this.icons[weapon.id]}">` : `<span class="wtxt">${weapon ? weapon.name : ''}</span>`;
    row.innerHTML = `${att && att !== vic ? `<span class="${cls(att)}">${att.name}</span>${assist ? `<span class="assist"> + ${assist.name}</span>` : ''}` : ''}${icon}${wall ? '<i class="kicon wb">⟋</i>' : ''}${hs ? '<i class="kicon hs">✛</i>' : ''}<span class="${cls(vic)}">${vic.name}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 6000); setTimeout(() => row.remove(), 7000);
  }

  playerKill(n, hs, victim, first) {
    const el = $('killbanner');
    el.innerHTML = `<div class="kb-icon ${hs ? 'hs' : ''}">${hs ? '爆头' : '击杀'}</div>${n >= 2 ? `<div class="kb-streak">${STREAK[Math.min(5, n)]}</div>` : first ? '<div class="kb-streak fb">首杀</div>' : ''}<div class="kb-name">${victim.name}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    this.audio.play('headshot', { volume: hs ? 0.7 : 0.35, rate: hs ? 1 : 1.4 });
  }

  hitMarker(head, kill) {
    const el = $('hitmarker'); el.className = ''; void el.offsetWidth; el.className = 'show' + (kill ? ' kill' : head ? ' head' : '');
    if (!kill) this.audio.play('clink2', { volume: head ? 0.4 : 0.18, rate: head ? 1.6 : 2.2 });
  }

  playerHurt(dmg, ang) {
    this.hurtT = Math.min(0.85, this.hurtT + dmg / 60);
    if (ang !== null) {
      const d = document.createElement('div'); d.className = 'dmgdir';
      d.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`;
      $('dmgdirs').appendChild(d); setTimeout(() => d.remove(), 1200);
    }
  }

  playerDied(killer) {
    const el = $('deathinfo');
    el.innerHTML = killer && killer !== this.game.player ? `被 <b class="${killer.team === 'T' ? 't' : 'ct'}">${killer.name}</b> 击杀 · 剩余 ${killer.hp} HP` : '你阵亡了';
    el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500);
    this.toggleBuy(false);
  }
  playerRespawn() { $('deathinfo').classList.remove('show'); }
  spectating(a) { $('spectate').innerHTML = `观战中 · <b class="${a.team === 'T' ? 't' : 'ct'}">${a.name}</b> · ${a.hp} HP`; }

  flash(t) { this.flashT = t; this.flashMax = t; }
  center(msg, color = '#fff', sub = '') {
    const el = $('center'); el.innerHTML = `<div style="color:${color}">${msg}</div>${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  radio(a, msg) {
    const el = document.createElement('div'); el.className = 'radio';
    el.innerHTML = a ? `<b class="${a.team === 'T' ? 't' : 'ct'}">${a.name}</b> ${msg}` : msg;
    $('radiolog').appendChild(el); setTimeout(() => el.remove(), 4500);
    while ($('radiolog').children.length > 3) $('radiolog').firstChild.remove();
  }
  progress(label, k) {
    const el = $('progress');
    if (!label) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.querySelector('span').textContent = label; el.querySelector('i').style.width = Math.min(100, k * 100) + '%';
  }
  bombPlanted(site) { const el = $('bombplanted'); el.textContent = `炸弹已安放在 ${site} 点`; el.classList.add('show'); }

  // ---------------- buy menu ----------------
  buildBuyMenu() {
    const root = $('buymenu-items'); root.innerHTML = '';
    if (!this._bmBound) { this._bmBound = true; document.querySelector('#buymenu [data-close]').addEventListener('click', e => { e.stopPropagation(); this.toggleBuy(false); }); }
    const g = this.game, P = g.player;
    for (const cat of BUY_MENU) {
      const col = document.createElement('div'); col.className = 'buycat';
      col.innerHTML = `<h4>${cat.cat}</h4>`;
      for (const id of cat.items) {
        const it = WEAPONS[id] || EQUIP[id];
        if (it.team && it.team !== P.team) continue;
        const b = document.createElement('button'); b.className = 'buyitem'; b.dataset.id = id;
        b.innerHTML = `<img src="${this.icons[id] || ''}"><span class="bn">${it.name}</span><span class="bp">$${it.price}</span>`;
        b.addEventListener('click', e => { e.stopPropagation(); if (g.buy(P, id)) { b.classList.add('bought'); setTimeout(() => b.classList.remove('bought'), 300); } else this.audio.play('dryfire', { volume: 0.4 }); this.refreshBuy(); });
        col.appendChild(b);
      }
      root.appendChild(col);
    }
  }
  refreshBuy() {
    const g = this.game, P = g.player;
    $('buymoney').textContent = g.mode === 'tdm' ? '团队竞技：免费' : '$' + P.money;
    $('buytime').textContent = g.phase === 'freeze' ? `购买时间 ${Math.ceil(g.phaseT + 20)}s` : `剩余 ${Math.max(0, Math.ceil(g.buyTimeLeft))}s`;
    for (const b of document.querySelectorAll('.buyitem')) {
      const it = WEAPONS[b.dataset.id] || EQUIP[b.dataset.id];
      b.classList.toggle('poor', g.mode !== 'tdm' && P.money < it.price);
      const owned = (WEAPONS[b.dataset.id] && P.inv[it.slot] && P.inv[it.slot].id === b.dataset.id) || (b.dataset.id === 'kit' && P.inv.kit) || (b.dataset.id === 'vesthelm' && P.helmet && P.armor >= 100);
      b.classList.toggle('owned', !!owned);
    }
  }
  toggleBuy(v) {
    this.buyOpen = v ?? !this.buyOpen;
    if (this.buyOpen && this.game && !this.game.canBuy(this.game.player)) this.buyOpen = false;
    $('buymenu').classList.toggle('show', this.buyOpen);
    if (this.buyOpen) { this.buildBuyMenu(); this.refreshBuy(); }
  }

  // ---------------- scoreboard ----------------
  toggleScore(v) { this.scoreOpen = v ?? !this.scoreOpen; if (this.scoreOpen && !this._sbBound) { this._sbBound = true; document.getElementById('scoreboard').addEventListener('click', () => this.toggleScore(false)); } $('scoreboard').classList.toggle('show', this.scoreOpen); if (this.scoreOpen) this.renderScore(); }
  renderScore() {
    const g = this.game;
    const rows = team => g.agents.filter(a => a.team === team).sort((a, b) => b.score - a.score || b.kills - a.kills).map(a =>
      `<tr class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}"><td>${a.name}${a.inv.c4 ? ' 💣' : ''}</td><td>${a.kills}</td><td>${a.assists}</td><td>${a.deaths}</td><td>${a.mvps ? '★' + a.mvps : ''}</td><td>${a.score}</td><td>${a.team === g.player.team ? '$' + a.money : ''}</td></tr>`).join('');
    const hist = (g.history || []).map(w => `<i class="${w === 'T' ? 't' : 'ct'}"></i>`).join('');
    $('scoreboard').innerHTML = `<div class="sb-head"><span class="t">恐怖分子 ${g.score.T}</span><span class="hist">${hist}</span><span class="ct">${g.score.CT} 反恐精英</span></div>
      <table><thead><tr><th>玩家</th><th>击杀</th><th>助攻</th><th>死亡</th><th>MVP</th><th>得分</th><th>金钱</th></tr></thead>
      <tbody class="ct">${rows('CT')}</tbody><tbody class="t">${rows('T')}</tbody></table>`;
  }

  matchOver(g, winner) {
    const P = g.player; const won = winner === P.team;
    const kd = (P.kills / Math.max(1, P.deaths)).toFixed(2);
    const coins = 40 + P.kills * 12 + P.mvps * 20 + (won ? 120 : 30);
    this.lastReward = { coins, won, kills: P.kills, deaths: P.deaths, mvps: P.mvps };
    const el = $('matchover');
    el.innerHTML = `<div class="mo-box ${won ? 'win' : winner ? 'lose' : ''}">
      <div class="mo-title">${winner ? (won ? '胜利' : '失败') : '平局'}</div>
      <div class="mo-score"><span class="t">${g.score.T}</span> : <span class="ct">${g.score.CT}</span></div>
      <div class="mo-stats"><div><b>${P.kills}</b>击杀</div><div><b>${P.deaths}</b>死亡</div><div><b>${P.assists}</b>助攻</div><div><b>${kd}</b>K/D</div><div><b>${P.mvps}</b>MVP</div></div>
      <div class="mo-coins">+${coins} 金币</div>
      <button id="mo-back" class="btn primary">返回大厅</button></div>`;
    el.classList.add('show');
    $('mo-back').onclick = () => { el.classList.remove('show'); this.onExit && this.onExit(this.lastReward); };
  }
}
