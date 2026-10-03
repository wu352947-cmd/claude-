import * as THREE from 'three';
import { World } from './world.js';
import { Agent, WeaponState, RADIUS } from './agent.js';
import { Bot, Planner, SKILL } from './bot.js';
import { CharacterModel, weaponWorldModel } from './character.js';
import { Effects } from './effects.js';
import { ViewModel, makeGrenade, makeC4 } from './viewmodel.js';
import { WEAPONS, EQUIP, computeDamage } from './weapons.js';
import { SPAWNS, SITES } from './mapdata.js';
import { SKINS, SKIN_BY_ID } from './skins.js';

const BOT_NAMES = ['Zeus', 'Ghost', 'Viper', 'Falcon', 'Shadow', 'Blaze', 'Raven', 'Cobra', 'Nomad', 'Wolf', 'Titan', 'Hawk', 'Storm', 'Jackal', 'Rook', 'Spectre', 'Bandit', 'Echo'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3();

export class Game {
  constructor(renderer, assets, audio, hud, settings) {
    this.renderer = renderer; this.assets = assets; this.audio = audio; this.hud = hud; this.settings = settings;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
    this.time = 0; this.agents = []; this.projectiles = []; this.drops = [];
    this.setupScene();
    this.world = new World();
    this.scene.add(this.world.build(assets));
    this.world.placeProps(assets);
    this.effects = new Effects(this.scene, assets, audio);
    this.vm = new ViewModel(assets, renderer);
    this.vm.setEnv(this.env);
    this.planner = new Planner(this);
    this.bomb = { planted: false, dropped: false, carrier: null, pos: new THREE.Vector3(), site: null, timer: 0, defuser: null, defuseT: 0, mesh: null };
    audio.occlusion = (x, y, z) => { const c = this.camera.position; return !this.world.los(c, _v3.set(x, y + 0.3, z)); };
    this.renderer.shadowMap.needsUpdate = true;
  }

  setupScene() {
    const s = this.scene, A = this.assets;
    s.fog = new THREE.Fog(0xd9c7a6, 70, 330);
    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.MeshBasicMaterial({ map: A.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.rotation.y = 2.1; sky.renderOrder = -1; s.add(sky); this.sky = sky;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromEquirectangular(A.sky).texture; s.environment = this.env;
    s.environmentIntensity = 0.55;
    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0xb08a5a, 0.85); s.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
    sun.position.set(70, 120, 55); sun.target.position.set(0, 0, 0);
    sun.castShadow = true; const sz = this.settings.quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
    const c = sun.shadow.camera; c.left = -100; c.right = 100; c.top = 100; c.bottom = -100; c.near = 20; c.far = 320;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    s.add(sun); s.add(sun.target); this.sun = sun;
    // blob shadow texture
    this.blobMat = new THREE.MeshBasicMaterial({ map: A.fx.circle_05, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
    this.blobMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'vec4 tx = texture2D(map, vMapUv); diffuseColor.a *= tx.r;'); };
  }

  // ------------------------------------------------------------------ match setup
  start(opts) {
    // opts: {mode:'defuse'|'tdm', team:'T'|'CT', difficulty, teamSize, playerName, skins}
    this.clearMatch();
    this.mode = opts.mode; this.opts = opts;
    this.skill = SKILL[opts.difficulty] ?? SKILL.hard;
    this.score = { T: 0, CT: 0 }; this.round = 0; this.lossStreak = { T: 1, CT: 1 }; this.history = [];
    this.winTarget = opts.mode === 'tdm' ? 50 : 8; this.tdmTime = 6 * 60;
    const n = opts.teamSize || 5;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    this.player = this.addAgent({ name: opts.playerName || '你', team: opts.team, isPlayer: true, skins: opts.skins || {} });
    for (let i = 0; i < n - 1; i++) this.addAgent({ name: names.pop(), team: opts.team, isBot: true });
    const enemy = opts.team === 'T' ? 'CT' : 'T';
    for (let i = 0; i < n; i++) this.addAgent({ name: names.pop(), team: enemy, isBot: true });
    for (const a of this.agents) {
      a.money = this.mode === 'tdm' ? 16000 : 800;
      a.giveWeapon(a.team === 'T' ? 'glock' : 'usp');
    }
    this.hookPlayer();
    this.killStreakT = 0;
    this.startRound();
  }

  addAgent(o) {
    const a = new Agent(this, o);
    if (o.isBot) {
      // bots carry random skins (from the shared catalog)
      for (const w of ['ak47', 'm4a4', 'awp', 'deagle', 'usp', 'glock', 'ump45']) if (Math.random() < 0.45) { const pool = SKINS.filter(s => s.weapon === w); if (pool.length) a.skins[w] = pool[Math.floor(Math.random() * pool.length)].id + '#' + Math.random().toFixed(2); }
      a.brain = new Bot(a, this, this.skill * (0.88 + Math.random() * 0.24));
    }
    a.char = new CharacterModel(this.assets, a.team, this.scene);
    a.char.root.visible = !o.isPlayer;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), this.blobMat); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1;
    this.scene.add(blob); a.blob = blob;
    this.agents.push(a);
    return a;
  }

  hookPlayer() {
    const p = this.player;
    p.onSwitch = () => this.equipVM();
    p.onReload = ws => { this.vm.startReload(ws.def.shellReload ? ws.def.reload : ws.def.reload); };
    p.onLand = v => { this.vm.land(v); this.audio.play('land', { volume: 0.4 }); };
    p.onJump = () => this.footstep(p, true);
  }

  equipVM() {
    const p = this.player; const def = p.currentDef();
    const ws = p.ws;
    const skin = ws ? (ws.skin || p.skins[ws.id]) : (p.cur === 'knife' ? p.skins.knife : null);
    this.vm.equip(def, p.cur === 'knife' ? p.skins.knife : skin, p.team, def.deploy || 0.7);
    this.audio.play('deploy', { volume: 0.5 });
  }

  clearMatch() {
    for (const a of this.agents) { a.char.dispose(this.scene); this.scene.remove(a.blob); }
    this.agents = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
    if (this.bomb.mesh) this.scene.remove(this.bomb.mesh);
    this.bomb = { planted: false, dropped: false, carrier: null, pos: new THREE.Vector3(), site: null, timer: 0, defuser: null, defuseT: 0, mesh: null };
    this.effects.clear();
  }

  // ------------------------------------------------------------------ rounds
  startRound() {
    this.round++;
    this.phase = 'freeze'; this.freeze = true;
    this.phaseT = this.mode === 'tdm' ? 3 : (this.round === 1 ? 10 : 8);
    this.roundTime = 115; this.buyTimeLeft = 20;
    this.hotSite = null; this.roundEndReason = null; this.firstBlood = false;
    for (const p of this.projectiles) this.scene.remove(p.mesh); this.projectiles = [];
    for (const d of this.drops) this.scene.remove(d.mesh); this.drops = [];
    if (this.bomb.mesh) this.scene.remove(this.bomb.mesh);
    this.bomb = { planted: false, dropped: false, carrier: null, pos: new THREE.Vector3(), site: null, timer: 0, defuser: null, defuseT: 0, mesh: null, beepT: 0 };
    this.effects.clear();
    const used = { T: 0, CT: 0 };
    const ordered = this.agents.slice().sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0));
    for (const a of ordered) {
      if (!a.alive || this.mode === 'tdm') {
        // dead players lose their guns
        if (!a.alive && this.round > 1) { a.inv.primary = null; if (!a.inv.secondary) a.giveWeapon(a.team === 'T' ? 'glock' : 'usp'); a.inv.grenades = []; a.armor = 0; a.helmet = false; a.inv.kit = false; }
      }
      a.inv.c4 = false;
      const sp = SPAWNS[a.team][used[a.team]++ % SPAWNS[a.team].length];
      const yaw = a.team === 'T' ? 0 : Math.PI;
      a.spawn(sp[0] + (Math.random() - 0.5) * 1.5, sp[1] + (Math.random() - 0.5) * 1.5, yaw + (Math.random() - 0.5) * 0.4);
      a.char.reset(); a.char.root.visible = !a.isPlayer;
      if (a.inv.secondary) { a.inv.secondary.ammo = a.inv.secondary.def.mag; a.inv.secondary.reserve = a.inv.secondary.def.reserve; }
      if (a.inv.primary) { a.inv.primary.ammo = a.inv.primary.def.mag; a.inv.primary.reserve = a.inv.primary.def.reserve; }
    }
    if (this.mode === 'defuse') {
      const ts = this.agents.filter(a => a.team === 'T');
      const carrier = ts.find(a => a.isPlayer) && Math.random() < 0.5 ? this.player : ts[Math.floor(Math.random() * ts.length)];
      carrier.inv.c4 = true; this.bomb.carrier = carrier;
    }
    if (this.mode === 'tdm') for (const a of this.agents) this.tdmLoadout(a);
    this.planner.newRound();
    this.equipVM();
    this.hud.onRoundStart(this);
  }

  tdmLoadout(a) {
    const pick = a.isPlayer ? (this.tdmPick || (a.team === 'T' ? 'ak47' : 'm4a4')) : (Math.random() < 0.18 ? 'awp' : a.team === 'T' ? 'ak47' : 'm4a4');
    if (!a.inv.primary || a.inv.primary.id !== pick) a.giveWeapon(pick);
    a.armor = 100; a.helmet = true;
    if (!a.inv.secondary) a.giveWeapon(a.team === 'T' ? 'glock' : 'usp');
    a.switchTo('primary', true);
  }

  endRound(winner, reason) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.phaseT = 5; this.roundEndReason = reason;
    if (winner) {
      this.score[winner]++;
      const loser = winner === 'T' ? 'CT' : 'T';
      const winMoney = reason === 'bomb' ? 3500 : reason === 'defuse' ? 3500 : reason === 'time' ? 3250 : 3250;
      const lossMoney = 1400 + 500 * Math.min(4, this.lossStreak[loser] - 1);
      for (const a of this.agents) a.money = Math.min(16000, a.money + (a.team === winner ? winMoney : lossMoney) + (a.team === 'T' && this.bomb.planted && a.team !== winner ? 800 : 0));
      this.lossStreak[winner] = Math.max(1, this.lossStreak[winner] - 1); this.lossStreak[loser]++;
      // MVP: most kills on winning team
      const mvp = this.agents.filter(a => a.team === winner).sort((a, b) => b.roundKills - a.roundKills)[0];
      if (mvp) mvp.mvps++;
      this.history.push(winner);
      this.hud.onRoundEnd(this, winner, reason, mvp);
      this.audio.play(winner === this.player.team ? 'ui_buy' : 'clink2', { volume: 0.6 });
    }
  }

  checkRoundEnd() {
    if (this.mode !== 'defuse' || this.phase !== 'live') return;
    const aliveT = this.agents.some(a => a.team === 'T' && a.alive), aliveCT = this.agents.some(a => a.team === 'CT' && a.alive);
    if (!aliveCT) return this.endRound('T', 'elim');
    if (!aliveT && !this.bomb.planted) return this.endRound('CT', 'elim');
  }

  // ------------------------------------------------------------------ economy
  buy(a, id) {
    const W = WEAPONS[id], E = EQUIP[id];
    if (this.mode === 'defuse' && !this.canBuy(a)) return false;
    const item = W || E; if (!item) return false;
    if (item.team && item.team !== a.team) return false;
    const price = this.mode === 'tdm' ? 0 : item.price;
    if (a.money < price) return false;
    if (W) {
      if (W.slot === 'grenade') { if (a.inv.grenades.length >= 3 || a.inv.grenades.includes(id)) return false; }
      else if (a.inv[W.slot] && a.inv[W.slot].id === id) return false;
      if (W.slot === 'primary' || W.slot === 'secondary') {
        const old = a.inv[W.slot]; if (old && this.mode === 'defuse' && old.id !== 'glock' && old.id !== 'usp') this.dropWeapon(a, W.slot, true);
      }
      a.giveWeapon(id);
      if (this.mode === 'tdm' && W.slot === 'primary' && a.isPlayer) this.tdmPick = id;
      if (W.slot !== 'grenade') a.switchTo(W.slot, a.cur === W.slot);
      if (a.isPlayer && W.slot !== 'grenade') this.equipVM();
    } else {
      if (id === 'vest') { if (a.armor >= 100) return false; a.armor = 100; }
      if (id === 'vesthelm') { if (a.armor >= 100 && a.helmet) return false; a.armor = 100; a.helmet = true; }
      if (id === 'kit') { if (a.inv.kit) return false; a.inv.kit = true; }
    }
    a.money -= price;
    if (a.isPlayer) this.audio.play('ui_buy', { volume: 0.6 });
    return true;
  }

  canBuy(a) {
    if (this.mode === 'tdm') return true;
    if (!a.alive) return false;
    if (this.phase === 'freeze') return true;
    if (this.phase === 'live' && this.buyTimeLeft > 0) {
      const sp = SPAWNS[a.team][0]; return Math.hypot(a.pos.x - sp[0], a.pos.z - sp[1]) < 26;
    }
    return false;
  }

  botBuy(a, skill) {
    if (this.mode === 'tdm') return;
    const m = () => a.money;
    const rifle = a.team === 'T' ? 'ak47' : 'm4a4';
    const team = this.agents.filter(x => x.team === a.team);
    const hasAwp = team.some(x => x.inv.primary && x.inv.primary.id === 'awp');
    const teamAvg = team.reduce((s, x) => s + x.money, 0) / team.length;
    const fullBuy = m() >= (a.team === 'T' ? 3700 : 4100) || (teamAvg > 3500 && m() >= 3000);
    if (!a.inv.primary) {
      if (m() >= 5750 && !hasAwp && Math.random() < 0.3) this.buy(a, 'awp');
      else if (fullBuy) this.buy(a, rifle);
      else if (this.round > 1 && m() >= 2000 && Math.random() < 0.5) this.buy(a, Math.random() < 0.6 ? 'ump45' : 'nova');
      else if (this.round === 1 || m() < 2000) { if (m() >= 700 && Math.random() < 0.5) this.buy(a, 'deagle'); }
    }
    if (m() >= 1000 && a.inv.primary) this.buy(a, 'vesthelm'); else if (m() >= 650 && (a.inv.primary || this.round === 1)) this.buy(a, 'vest');
    if (a.team === 'CT' && m() >= 400 && Math.random() < 0.6) this.buy(a, 'kit');
    if (m() >= 300 && Math.random() < 0.7) this.buy(a, 'he');
    if (m() >= 300 && Math.random() < 0.6) this.buy(a, 'smoke');
    if (m() >= 200 && Math.random() < 0.6) this.buy(a, 'flash');
    if (a.inv.primary) a.switchTo('primary', true);
  }

  // ------------------------------------------------------------------ combat
  hitboxes(a) {
    // returns list of [group, kind, params]
    const h = a.height, p = a.pos;
    const fx = -Math.sin(a.yaw) * 0.04, fz = -Math.cos(a.yaw) * 0.04;
    return [
      ['head', 's', p.x + fx, p.y + h - 0.16, p.z + fz, 0.155],
      ['chest', 'c', p.x, p.y + h - 0.62, p.y + h - 0.3, p.z, 0.27],
      ['stomach', 'c', p.x, p.y + h - 0.95, p.y + h - 0.62, p.z, 0.25],
      ['legs', 'c', p.x, p.y + 0.02, p.y + h - 0.95, p.z, 0.24],
    ];
  }

  rayAgent(o, d, a, maxT) {
    // quick reject
    const cx = a.pos.x - o.x, cz = a.pos.z - o.z; const t0 = cx * d.x + cz * d.z;
    const px = o.x + d.x * t0 - a.pos.x, pz = o.z + d.z * t0 - a.pos.z;
    if (px * px + pz * pz > 1 && (cx * cx + cz * cz) > 2) return null;
    let best = null;
    for (const hb of this.hitboxes(a)) {
      let t = null;
      if (hb[1] === 's') t = raySphere(o, d, hb[2], hb[3], hb[4], hb[5]);
      else t = rayCyl(o, d, hb[2], hb[3], hb[4], hb[5], hb[6]);
      if (t !== null && t < maxT && (!best || t < best.t)) best = { t, group: hb[0] };
    }
    return best;
  }

  fireWeapon(a, ws, inacc) {
    const d = ws.def; const eye = a.eye(_v);
    const own = a === this.player;
    const pellets = d.pellets || 1;
    this.audio.shot(d.id, eye, own);
    this.emitSound(a, eye, d.type === 'pistol' ? 70 : 110);
    // muzzle position (for tracer origins / third person flash)
    let mz;
    if (own) { this.camera.updateMatrixWorld(); mz = this.vm.muzzleWorld(this.camera, _v2); this.vm.shoot(d); }
    else {
      const f = a.forward(_d); mz = _v2.copy(eye).addScaledVector(f, 0.9); mz.y -= 0.12;
      const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw); mz.x += rx * 0.12; mz.z += rz * 0.12;
      this.effects.muzzle(mz.x, mz.y, mz.z, f.x, f.y, f.z, d.type === 'sniper' || d.type === 'shotgun' ? 1.4 : 1);
    }
    if (own) {
      // ejected brass from the right side of the gun
      const cam = this.camera; const right = _v3.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion); const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      if (d.type !== 'shotgun' || true) {
        const cp = cam.position.clone().addScaledVector(fw, 0.45).addScaledVector(right, 0.16).addScaledVector(up, -0.12);
        this.effects.casing(cp, right, up, fw); this.effects.casings[this.effects.casings.length - 1].near = true;
      }
      this.effects.light.position.copy(cam.position).addScaledVector(fw, 1); this.effects.light.intensity = 4; this.effects.lightT = 0.05;
    }
    const dir = new THREE.Vector3();
    let anyHit = false, hsKill = false;
    const hitAgents = new Map();
    for (let k = 0; k < pellets; k++) {
      a.shotDir(pellets > 1 ? Math.max(inacc, 0) + 0 : inacc, dir);
      if (pellets > 1) { // shotgun spread pattern
        const r = THREE.MathUtils.degToRad(d.spread) * Math.sqrt(Math.random()); const an = Math.random() * 6.283;
        const right = _d.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); const up = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, Math.cos(an) * r).addScaledVector(up, Math.sin(an) * r).normalize();
      }
      const res = this.traceBullet(a, eye, dir, d, hitAgents);
      if (res.end && (k === 0 || Math.random() < 0.3)) {
        if (own ? Math.random() < 0.5 : Math.random() < 0.7) this.effects.tracerLine(mz.x, mz.y, mz.z, res.end.x, res.end.y, res.end.z);
      }
      if (res.hitAgent) anyHit = true;
    }
    // apply grouped damage (shotguns sum pellets)
    for (const [victim, info] of hitAgents) {
      const died = this.damage(victim, a, d, info.dmg, info.group, { dir: info.dir, armorLoss: info.armorLoss, wall: info.wall });
      if (a === this.player) this.hud.hitMarker(info.group === 'head', died);
    }
  }

  traceBullet(a, origin, dir, d, hitAgents) {
    const maxDist = 220;
    const hits = this.world.raycastAll(origin, dir, maxDist, []);
    const ahits = [];
    for (const b of this.agents) {
      if (b === a || !b.alive) continue;
      const h = this.rayAgent(origin, dir, b, maxDist);
      if (h) ahits.push({ t: h.t, agent: b, group: h.group });
    }
    const events = hits.map(h => ({ ...h, kind: 'w' })).concat(ahits.map(h => ({ ...h, kind: 'a' }))).sort((p, q) => p.t - q.t);
    let mult = 1, budget = (d.pen || 1) * 0.42, wall = false; let end = null, hitAgent = false;
    for (const ev of events) {
      if (ev.kind === 'a') {
        if (ev.agent.team === a.team && !this.settings.friendlyFire) continue;
        if (hitAgents.has(ev.agent)) { const inf = hitAgents.get(ev.agent); const r = computeDamage(d, ev.t, ev.group, ev.agent, mult); inf.dmg += r.dmg; inf.armorLoss += r.armorLoss; if (ev.group === 'head') inf.group = 'head'; }
        else { const r = computeDamage(d, ev.t, ev.group, ev.agent, mult); hitAgents.set(ev.agent, { dmg: r.dmg, armorLoss: r.armorLoss, group: ev.group, dir: dir.clone(), wall }); }
        const hp = _v3.copy(origin).addScaledVector(dir, ev.t);
        this.effects.bloodHit(hp.x, hp.y, hp.z, dir.x, dir.y, dir.z, ev.group === 'head', this.world);
        this.audio.play(ev.group === 'head' && (ev.agent.helmet) ? 'headshot' : (Math.random() < 0.5 ? 'hit_body1' : 'hit_body2'), { pos: hp, volume: 0.8, maxDist: 60, pitchVar: 0.1 });
        hitAgent = true;
        mult *= 0.55; if (d.type !== 'sniper') { end = hp.clone(); break; }
        continue;
      }
      const p = _v3.copy(origin).addScaledVector(dir, ev.t);
      end = p.clone();
      const n = ev.normal;
      const s = ev.solid;
      this.effects.impact(p.x, p.y, p.z, n[0], n[1], n[2], s ? s.mat : 'ground');
      if (!s) break;
      // penetration
      const thick = Math.max(0.02, ev.tOut - ev.t);
      const cost = thick * s.pen;
      if (s.kind === 'building' || s.kind === 'roof' || cost > budget) break;
      budget -= cost; mult *= Math.max(0.15, 1 - cost / ((d.pen || 1) * 0.42) * 0.65 - 0.12); wall = true;
      const ex = _v3.copy(origin).addScaledVector(dir, ev.tOut);
      this.effects.impact(ex.x, ex.y, ex.z, dir.x, dir.y, dir.z, s.mat, true);
    }
    if (!end) end = origin.clone().addScaledVector(dir, 120);
    return { end, hitAgent };
  }

  knifeAttack(a, heavy) {
    if (a === this.player) this.vm.slash(heavy);
    this.audio.play(Math.random() < 0.5 ? 'swish1' : 'swish2', { pos: a.isPlayer ? null : a.eye(_v), volume: 0.6, pitchVar: 0.1 });
    const eye = a.eye(_v); const f = a.forward(_d);
    // find target in front within range
    let best = null, bd = 1e9;
    for (const b of this.agents) {
      if (b === a || !b.alive || (b.team === a.team && !this.settings.friendlyFire)) continue;
      const h = this.rayAgent(eye, f, b, 2.0);
      const dist = a.pos.distanceTo(b.pos);
      if ((h || dist < 1.4) && dist < bd) {
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const dot = (dx * f.x + dz * f.z) / (Math.hypot(dx, dz) || 1);
        if (dot > 0.6) { best = b; bd = dist; }
      }
    }
    if (best) {
      // backstab check
      const bf = best.forward(_v2); const back = (f.x * bf.x + f.z * bf.z) > 0.5;
      const dmg = heavy ? (back ? 180 : 65) : (back ? 90 : 40);
      setTimeout(() => {
        if (!best.alive || !a.alive) return;
        this.audio.play('knife_hit', { pos: best.eye(_v), volume: 0.9 });
        this.effects.bloodHit(best.pos.x, best.pos.y + 1.3, best.pos.z, f.x, 0, f.z, false, this.world);
        const died = this.damage(best, a, WEAPONS.knife, dmg, 'chest', { dir: f.clone(), noArmor: true });
        if (a === this.player) this.hud.hitMarker(false, died);
      }, heavy ? 180 : 90);
    } else {
      const h = this.world.raycast(eye, f, 1.8);
      if (h && h.solid) setTimeout(() => this.audio.play('metal_hit', { pos: eye, volume: 0.4, rate: 1.3 }), 90);
    }
  }

  damage(victim, attacker, weapon, dmg, group, opts = {}) {
    if (!victim.alive) return false;
    if (victim.spawnProt && this.time < victim.spawnProt) return false;
    if (opts.armorLoss) victim.armor = Math.max(0, victim.armor - opts.armorLoss);
    victim.hp -= dmg; victim.lastDamageT = this.time;
    victim.slowT = 0.3;
    if (attacker && attacker !== victim) {
      victim.lastAttacker = attacker;
      victim.damageDealt = victim.damageDealt || {};
      attacker.damageDealt[victim.id] = (attacker.damageDealt[victim.id] || 0) + dmg;
    }
    // aim punch when hit
    victim.kickVY += 14 * (group === 'head' ? 2 : 1); victim.kickVX += (Math.random() - 0.5) * 10;
    if (victim.brain) victim.brain.onDamaged(attacker);
    if (victim === this.player) {
      let ang = null;
      if (attacker && attacker !== victim) { const dx = attacker.pos.x - victim.pos.x, dz = attacker.pos.z - victim.pos.z; ang = Math.atan2(-dx, -dz) - victim.yaw; }
      this.hud.playerHurt(dmg, ang);
      this.audio.play('grunt' + Math.floor(Math.random() * 10), { volume: 0.35 });
    }
    if (victim.hp <= 0) { this.kill(victim, attacker, weapon, group === 'head', opts); return true; }
    return false;
  }

  kill(victim, attacker, weapon, headshot, opts) {
    victim.hp = 0; victim.alive = false; victim.deaths++;
    const dir = opts.dir || new THREE.Vector3(0, 0, 1);
    victim.char.die(dir.x, dir.z, headshot);
    this.audio.play('grunt' + Math.floor(Math.random() * 10), { pos: victim.eye(_v), volume: 0.8, maxDist: 50 });
    // drop weapons / bomb
    if (victim.inv.primary) this.dropWeapon(victim, 'primary');
    else if (victim.inv.secondary && victim.inv.secondary.def.id !== 'glock' && victim.inv.secondary.def.id !== 'usp') this.dropWeapon(victim, 'secondary');
    if (victim.inv.c4) this.dropBomb(victim);
    let assister = null;
    if (attacker && attacker !== victim && weapon && weapon.id !== 'c4') {
      if (attacker.team !== victim.team) {
        attacker.kills++; attacker.roundKills++; attacker.score += 2;
        attacker.money = Math.min(16000, attacker.money + (weapon && weapon.reward ? weapon.reward : 300));
      } else { attacker.kills--; attacker.money = Math.max(0, attacker.money - 300); }
      // assist: someone else dealt >= 41 damage
      for (const b of this.agents) if (b !== attacker && b.team !== victim.team && (b.damageDealt[victim.id] || 0) >= 41) { b.assists++; b.score++; assister = b; break; }
    }
    for (const b of this.agents) delete b.damageDealt[victim.id];
    const first = !this.firstBlood; this.firstBlood = true;
    this.hud.killFeed(attacker, victim, weapon, headshot, opts.wall, assister);
    if (attacker === this.player && victim.team !== attacker.team) this.hud.playerKill(attacker.roundKills, headshot, victim, first);
    if (victim === this.player) this.onPlayerDeath(attacker);
    if (this.mode === 'tdm') {
      if (attacker && attacker.team !== victim.team) this.score[attacker.team]++;
      victim.respawnT = this.time + 3;
      if (this.score[attacker?.team] >= this.winTarget) this.endMatch(attacker.team);
    } else this.checkRoundEnd();
  }

  onPlayerDeath(killer) {
    this.deathCam = { t: 0, killer, pos: this.camera.position.clone() };
    this.spectate = null;
    this.vm.root.visible = false;
    this.player.char.root.visible = true;
    this.hud.playerDied(killer);
  }

  emitSound(a, pos, radius, kind = 'shot') {
    for (const b of this.agents) if (b.brain && b.alive) b.brain.hear({ x: pos.x, y: pos.y, z: pos.z, agent: a, kind, radius });
  }

  footstep(a, jump) {
    const g = this.world.floorRaster;
    const zone = this.world.zoneAt(a.pos.x, a.pos.z);
    const stone = /道|路|中|A点|小|门|洞/.test(zone);
    const name = `step_${stone ? 'stone' : 'sand'}_${a.stepSide ? 'L' : 'R'}${1 + Math.floor(Math.random() * 3)}`;
    if (a === this.player) this.audio.play(name, { volume: 0.32, pitchVar: 0.08 });
    else this.audio.play(name, { pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, volume: 1.0, ref: 2.5, roll: 0.9, pitchVar: 0.08, maxDist: 32, occlude: true });
    this.emitSound(a, a.pos, 20, 'step');
  }

  sound(a, name, vol = 1, delay = 0) {
    if (a === this.player) this.audio.play(name, { volume: vol, delay });
    else this.audio.play(name, { pos: a.eye(_v), volume: vol, maxDist: 30, delay });
  }

  spotted(by, enemy) {
    const z = this.world.zoneAt(enemy.pos.x, enemy.pos.z);
    const site = this.inSite(enemy.pos);
    if (site) this.hotSite = { site, t: this.time };
    // radio callout for player team
    if (by.team === this.player.team && this.mode === 'defuse') {
      if (!this._lastCall || this.time - this._lastCall > 6) { this._lastCall = this.time; this.hud.radio(by, `发现敌人 — ${z || '附近'}`); }
    }
    for (const b of this.agents) if (b.brain && b.team === by.team && b !== by && b.alive) {
      const m = b.brain.memory.get(enemy.id); if (!m || this.time - m.t > 2) b.brain.memory.set(enemy.id, { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z, t: this.time, info: true });
    }
  }

  inSite(p) {
    for (const k in SITES) { const s = SITES[k]; if (p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1) return k; }
    return null;
  }

  // ------------------------------------------------------------------ drops / bomb
  dropWeapon(a, slot, silent) {
    const ws = a.inv[slot]; if (!ws) return;
    a.inv[slot] = null;
    const mesh = weaponWorldModel(this.assets, ws.id);
    const eye = a.eye(_v);
    mesh.position.copy(eye); this.scene.add(mesh);
    const f = a.forward(_d);
    const drop = { ws, mesh, pos: eye.clone(), vel: new THREE.Vector3(f.x * 3, 2, f.z * 3), t: 0, rest: false, rot: Math.random() * 6 };
    this.drops.push(drop);
    if (this.drops.length > 24) { const o = this.drops.shift(); this.scene.remove(o.mesh); }
    if (a.cur === slot) a.switchTo(a.inv.primary ? 'primary' : a.inv.secondary ? 'secondary' : 'knife', true);
    if (a === this.player) this.equipVM();
  }

  dropBomb(a) {
    a.inv.c4 = false; this.bomb.carrier = null; this.bomb.dropped = true;
    this.bomb.pos.set(a.pos.x, this.world.groundAt(a.pos.x, a.pos.z, 0.2, a.pos.y + 0.5), a.pos.z);
    if (!this.bomb.mesh) { this.bomb.mesh = makeC4(); this.bomb.mesh.scale.setScalar(3); this.scene.add(this.bomb.mesh); }
    this.bomb.mesh.position.copy(this.bomb.pos).add(new THREE.Vector3(0, 0.06, 0));
    if (a.cur === 'c4') a.switchTo(a.inv.primary ? 'primary' : 'secondary', true);
    if (a.team === this.player.team) this.hud.radio(null, '炸弹已掉落！');
  }

  updateDrops(dt) {
    for (const d of this.drops) {
      if (!d.rest) {
        d.vel.y -= 14 * dt; d.pos.addScaledVector(d.vel, dt);
        const g = this.world.groundAt(d.pos.x, d.pos.z, 0.1, d.pos.y + 0.2);
        if (d.pos.y <= g + 0.05) { d.pos.y = g + 0.05; d.vel.set(0, 0, 0); d.rest = true; this.audio.play('metal_hit', { pos: d.pos, volume: 0.35, maxDist: 20, rate: 1.2 }); }
        d.t += dt;
      }
      d.mesh.position.copy(d.pos); d.mesh.rotation.set(d.rest ? Math.PI / 2 : d.t * 6, d.rot, 0);
      d.mesh.rotation.order = 'YXZ';
      if (d.rest) { d.mesh.rotation.set(0, d.rot, Math.PI / 2); }
    }
    // pickups (auto when slot empty)
    for (const a of this.agents) {
      if (!a.alive) continue;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i]; if (!d.rest) continue;
        if (Math.hypot(d.pos.x - a.pos.x, d.pos.z - a.pos.z) > 1.1) continue;
        const slot = d.ws.def.slot;
        const want = !a.inv[slot] || (a.brain && slot === 'primary' && a.inv.primary && a.inv.primary.def.price < d.ws.def.price - 500 && a.brain.target == null);
        if (want) {
          if (a.inv[slot]) this.dropWeapon(a, slot, true);
          a.inv[slot] = d.ws; this.scene.remove(d.mesh); this.drops.splice(i, 1);
          if (a === this.player) { this.audio.play('cock', { volume: 0.6 }); this.hud.toast(`拾取 ${d.ws.def.name}`); }
          if (!a.isPlayer && slot === 'primary') a.switchTo('primary', true);
          break;
        }
      }
      if (this.bomb.dropped && a.team === 'T' && Math.hypot(this.bomb.pos.x - a.pos.x, this.bomb.pos.z - a.pos.z) < 1.1) {
        this.bomb.dropped = false; a.inv.c4 = true; this.bomb.carrier = a; this.scene.remove(this.bomb.mesh); this.bomb.mesh = null;
        if (a === this.player) this.hud.toast('你拾取了炸弹');
      }
    }
  }

  nearestDrop(a) {
    let best = null, bd = 1.8;
    for (const d of this.drops) { const dd = Math.hypot(d.pos.x - a.pos.x, d.pos.z - a.pos.z); if (d.rest && dd < bd) { bd = dd; best = d; } }
    return best;
  }

  pickup(a) {
    const d = this.nearestDrop(a); if (!d) return;
    const slot = d.ws.def.slot;
    if (a.inv[slot]) this.dropWeapon(a, slot, true);
    a.inv[slot] = d.ws; this.scene.remove(d.mesh); this.drops.splice(this.drops.indexOf(d), 1);
    a.switchTo(slot, true); if (a === this.player) { this.equipVM(); this.audio.play('cock', { volume: 0.6 }); }
  }

  updateBomb(dt) {
    const B = this.bomb;
    // planting
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.inv.c4 && a.cur === 'c4' && a.input.use && a.onGround && this.inSite(a.pos) && this.phase === 'live') {
        a.plantT = (a.plantT || 0) + dt; a.input.mx = a.input.mf = 0;
        if (a === this.player) this.hud.progress('正在安放炸弹', a.plantT / 3.2);
        if (Math.floor(a.plantT * 4) !== Math.floor((a.plantT - dt) * 4)) this.audio.play('ui_click', { pos: a.pos, volume: 0.5, maxDist: 15 });
        if (a.plantT >= 3.2) this.plantBomb(a);
      } else if (a.plantT) { a.plantT = 0; if (a === this.player) this.hud.progress(null); }
    }
    if (!B.planted) return;
    B.timer -= dt;
    B.beepT -= dt;
    const rate = B.timer > 20 ? 1 : B.timer > 10 ? 0.6 : B.timer > 5 ? 0.35 : 0.15;
    if (B.beepT <= 0) { B.beepT = rate; this.audio.play('beep', { pos: B.pos, volume: 0.9, ref: 6, roll: 0.6, maxDist: 90 }); if (B.led) B.led.material.color.set(0xff0000); setTimeout(() => B.led && B.led.material.color.set(0x330000), 100); }
    // defusing
    let defuser = null;
    for (const a of this.agents) if (a.alive && a.team === 'CT' && a.input.use && Math.hypot(a.pos.x - B.pos.x, a.pos.z - B.pos.z) < 1.6 && Math.abs(a.pos.y - B.pos.y) < 1.2) { defuser = a; break; }
    if (defuser) {
      if (B.defuser !== defuser) { B.defuser = defuser; B.defuseT = 0; this.sound(defuser, 'cock', 0.6); }
      B.defuseT += dt; defuser.input.mx = defuser.input.mf = 0;
      const need = defuser.inv.kit ? 5 : 10;
      if (defuser === this.player) this.hud.progress(defuser.inv.kit ? '拆除中（拆弹器）' : '拆除中', B.defuseT / need);
      if (B.defuseT >= need) {
        B.planted = false; this.hud.progress(null); this.hud.center('炸弹已被拆除', '#7fc4ff');
        defuser.score += 2; defuser.money += 300;
        this.endRound('CT', 'defuse'); return;
      }
    } else if (B.defuser) { if (B.defuser === this.player) this.hud.progress(null); B.defuser = null; B.defuseT = 0; }
    if (B.timer <= 0) {
      B.planted = false;
      this.explode(B.pos.x, B.pos.y + 0.3, B.pos.z, 500, 28, null, true);
      this.scene.remove(B.mesh); B.mesh = null;
      this.endRound('T', 'bomb');
    }
  }

  plantBomb(a) {
    const B = this.bomb;
    a.inv.c4 = false; a.plantT = 0; B.carrier = null; B.planted = true; B.site = this.inSite(a.pos); B.timer = 40; B.beepT = 0;
    B.pos.set(a.pos.x, a.pos.y, a.pos.z);
    B.mesh = makeC4(); B.mesh.scale.setScalar(3); B.mesh.position.copy(B.pos).add(new THREE.Vector3(0, 0.06, 0)); this.scene.add(B.mesh);
    B.led = B.mesh.children[2]; B.led.material = B.led.material.clone();
    a.score += 2; a.money += 300;
    a.switchTo(a.inv.primary ? 'primary' : 'secondary', true);
    if (a === this.player) { this.hud.progress(null); this.equipVM(); }
    this.phase = 'post';
    this.hud.center('炸弹已安放', '#ff6040'); this.hud.bombPlanted(B.site);
    this.audio.play('ui_buy', { volume: 0.8, rate: 0.7 });
    this.hotSite = { site: B.site, t: this.time };
    for (const b of this.agents) if (b.brain) { b.brain.goal = null; b.brain.state = 'idle'; }
  }

  // ------------------------------------------------------------------ grenades
  throwGrenade(a, id) {
    if (!id) return;
    const eye = a.eye(_v); const f = a.forward(_d);
    const mesh = makeGrenade(); mesh.scale.setScalar(2.2);
    if (id === 'flash') mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x8a9aa8, metalness: 0.5, roughness: 0.4 });
    if (id === 'smoke') mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x9aa070, metalness: 0.2, roughness: 0.6 });
    this.scene.add(mesh);
    const speed = 17;
    const p = { id, owner: a, mesh, pos: eye.clone().addScaledVector(f, 0.5), vel: f.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(a.vel, 0.8), t: 0, fuse: id === 'smoke' ? 2.2 : 1.6, still: 0, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) };
    this.projectiles.push(p);
    this.sound(a, 'swish2', 0.5);
    if (a === this.player) this.vm.throwAnim();
    if (a.team === this.player.team && a !== this.player) this.hud.radio(a, { he: '投掷手雷！', flash: '投掷闪光弹！', smoke: '投掷烟雾弹！' }[id]);
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.t += dt;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const h = dt / sub; p.vel.y -= 14 * h;
        const sp = p.vel.length();
        if (sp > 0.01) {
          const dir = _v3.copy(p.vel).divideScalar(sp);
          const hit = this.world.raycast(p.pos, dir, sp * h + 0.05);
          if (hit) {
            const n = _d.set(hit.normal[0], hit.normal[1], hit.normal[2]);
            p.pos.addScaledVector(dir, Math.max(0, hit.t - 0.05));
            const vn = p.vel.dot(n); p.vel.addScaledVector(n, -1.55 * vn); p.vel.multiplyScalar(0.55);
            if (Math.abs(vn) > 2) this.audio.play('clink2', { pos: p.pos, volume: 0.5, maxDist: 30, rate: 1.1 });
          } else p.pos.addScaledVector(p.vel, h);
        }
      }
      if (p.vel.length() < 0.5) p.still += dt;
      p.mesh.position.copy(p.pos); p.mesh.rotation.x += p.spin.x * dt * (p.still ? 0 : 1); p.mesh.rotation.y += p.spin.y * dt * (p.still ? 0 : 1);
      const detonate = p.id === 'smoke' ? (p.still > 0.4 || p.t > 3) : p.t > p.fuse;
      if (detonate) {
        this.projectiles.splice(i, 1); this.scene.remove(p.mesh);
        if (p.id === 'he') this.explode(p.pos.x, p.pos.y, p.pos.z, 98, 11, p.owner, false);
        if (p.id === 'flash') this.flashbang(p.pos, p.owner);
        if (p.id === 'smoke') { this.effects.smokeGrenade(p.pos.x, p.pos.y, p.pos.z); this.audio.play('explosion_far', { pos: p.pos, volume: 0.25, rate: 2.2 }); }
      }
    }
  }

  explode(x, y, z, maxDmg, radius, owner, isBomb) {
    this.effects.explosion(x, y, z);
    if (isBomb) { for (let i = 0; i < 3; i++) setTimeout(() => this.effects.explosion(x + (Math.random() - 0.5) * 6, y + Math.random() * 2, z + (Math.random() - 0.5) * 6), i * 120); }
    const c = this.camera.position; const d = Math.hypot(c.x - x, c.y - y, c.z - z);
    this.audio.play(d < 40 ? 'explosion' : 'explosion_far', { pos: { x, y, z }, volume: isBomb ? 1.4 : 1.1, ref: 15, roll: 0.5, reverb: 0.6, bass: 1.0, occlude: false });
    this.shake = Math.max(this.shake || 0, Math.max(0, 1 - d / (radius * 3)) * (isBomb ? 1.5 : 0.8));
    const center = _v.set(x, y + 0.3, z);
    for (const a of this.agents) {
      if (!a.alive) continue;
      const dist = Math.hypot(a.pos.x - x, a.pos.y + 1 - y, a.pos.z - z);
      if (dist > radius) continue;
      if (!isBomb && !this.world.los(center, _v2.set(a.pos.x, a.pos.y + 1, a.pos.z))) continue;
      let dmg = maxDmg * Math.pow(1 - dist / radius, isBomb ? 1.2 : 1.6);
      if (a.armor > 0 && !isBomb) { dmg *= 0.57; a.armor = Math.max(0, a.armor - dmg * 0.3); }
      if (owner && owner.team === a.team && owner !== a && !this.settings.friendlyFire) continue;
      if (dmg >= 1) this.damage(a, owner, isBomb ? { id: 'c4', name: 'C4', reward: 0 } : WEAPONS.he, Math.round(dmg), 'chest', { dir: _d.set(a.pos.x - x, 0, a.pos.z - z).normalize().clone(), noArmor: true });
    }
  }

  flashbang(pos, owner) {
    this.effects.flashBurst(pos.x, pos.y, pos.z);
    this.audio.play('explosion_far', { pos, volume: 0.9, rate: 1.6, occlude: false });
    for (const a of this.agents) {
      if (!a.alive) continue;
      const eye = a.eye(_v); const d = eye.distanceTo(pos);
      if (d > 30 || !this.world.los(eye, _v2.copy(pos).add(new THREE.Vector3(0, 0.2, 0)))) continue;
      const f = a.forward(_d); const to = _v2.copy(pos).sub(eye).normalize(); const dot = f.dot(to);
      let t = (dot > 0.3 ? 4.2 : dot > -0.3 ? 2.2 : 0.8) * Math.max(0.2, 1 - d / 30) * 1.2;
      if (owner && owner.team === a.team && owner !== a) t *= 0.8;
      a.flashT = Math.max(a.flashT, t); a.flashMax = a.flashT;
      if (a === this.player) this.hud.flash(t);
    }
  }

  // ------------------------------------------------------------------ main loop
  update(dt, input) {
    this.time += dt;
    const P = this.player;
    // phases
    if (this.phase === 'freeze') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'live'; this.freeze = false; this.hud.center(this.mode === 'tdm' ? '团队竞技开始！' : '回合开始', '#fff'); this.audio.play('ui_click', { volume: 0.8 }); }
    } else if (this.phase === 'live' || this.phase === 'post') {
      if (this.phase === 'live') { this.buyTimeLeft -= dt; if (this.mode === 'defuse') this.roundTime -= dt; }
      if (this.mode === 'defuse' && this.phase === 'live' && this.roundTime <= 0) this.endRound('CT', 'time');
      if (this.mode === 'tdm') { this.tdmTime -= dt; if (this.tdmTime <= 0) this.endMatch(this.score.T === this.score.CT ? null : this.score.T > this.score.CT ? 'T' : 'CT'); }
    } else if (this.phase === 'end') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.score.T >= this.winTarget || this.score.CT >= this.winTarget || this.round >= this.winTarget * 2 - 1) this.endMatch(this.score.T > this.score.CT ? 'T' : this.score.CT > this.score.T ? 'CT' : null);
        else this.startRound();
      }
    }
    if (this.phase === 'over') { this.renderCam(dt); return; }

    // player input
    if (P.alive) input.apply(P, dt, this);
    // bots
    for (const a of this.agents) if (a.brain && a.alive) a.brain.update(dt);
    if (this.freeze) for (const a of this.agents) { a.input.mx = a.input.mf = 0; a.input.jump = false; a.input.fire = this.freeze ? false : a.input.fire; }
    for (const a of this.agents) a.update(dt);
    // TDM respawns
    if (this.mode === 'tdm') for (const a of this.agents) if (!a.alive && a.respawnT && this.time > a.respawnT) this.respawnTDM(a);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    if (this.mode === 'defuse') this.updateBomb(dt);
    this.effects.update(dt, this.world);
    // characters
    for (const a of this.agents) {
      const ws = a.ws; const def = a.currentDef();
      a.char.setWeapon(this.assets, def.type === 'grenade' ? null : def.id === 'c4' ? null : def.id);
      if (a.char.gun && !a.char.gun.userData.skinned) { a.char.gun.userData.skinned = true; const sk = ws ? (ws.skin || a.skins[ws.id]) : null; if (sk) import('./skins.js').then(m => { const s = sk.split('#'); m.applySkin(a.char.gun, { ...SKIN_BY_ID[s[0]], wear: +s[1] || 0 }, this.assets, a.team); }); }
      const firing = ws && this.time - ws.lastShot < 0.15;
      if (a !== P || !P.alive) a.char.update(dt, a.pos, a.yaw, a.alive ? a.pitch : 0, a.speed2D(), a.crouchT, firing, ws && ws.reloading);
      a.blob.position.set(a.pos.x, a.pos.y + 0.03, a.pos.z); a.blob.visible = a.alive && a !== P;
    }
    this.renderCam(dt);
  }

  respawnTDM(a) {
    const sp = SPAWNS[a.team]; let best = sp[0], bs = -1;
    for (const s of sp) { let md = 1e9; for (const e of this.agents) if (e.alive && e.team !== a.team) md = Math.min(md, Math.hypot(e.pos.x - s[0], e.pos.z - s[1])); if (md > bs) { bs = md; best = s; } }
    a.respawnT = 0; a.spawn(best[0] + (Math.random() - 0.5) * 2, best[1] + (Math.random() - 0.5) * 2, a.team === 'T' ? 0 : Math.PI);
    a.char.reset(); a.char.root.visible = !a.isPlayer; a.spawnProt = this.time + 2;
    this.tdmLoadout(a);
    if (a.brain) { a.brain.goal = null; a.brain.target = null; }
    if (a === this.player) { this.deathCam = null; this.spectate = null; this.vm.root.visible = true; this.equipVM(); this.hud.playerRespawn(); }
  }

  endMatch(winner) {
    if (this.phase === 'over') return;
    this.phase = 'over'; this.winner = winner;
    this.hud.matchOver(this, winner);
  }

  renderCam(dt) {
    const P = this.player, cam = this.camera;
    let viewAgent = P;
    if (!P.alive) {
      if (this.deathCam && this.deathCam.t < 2.4) {
        this.deathCam.t += dt;
        const k = this.deathCam.killer && this.deathCam.killer !== P ? this.deathCam.killer : null;
        const c = P.pos.clone().add(new THREE.Vector3(0, 2.2 + this.deathCam.t * 0.4, 0));
        const back = new THREE.Vector3(Math.sin(this.time * 0.3) * 2.5, 0, Math.cos(this.time * 0.3) * 2.5);
        cam.position.copy(c).add(back);
        cam.lookAt(k ? k.eye(_v) : P.pos);
        this.finishCam(dt, null); return;
      }
      // spectate a living teammate (third-person chase)
      if (!this.spectate || !this.spectate.alive) { this.spectate = this.agents.find(a => a.alive && a.team === P.team) || this.agents.find(a => a.alive); if (this.spectate) this.hud.spectating(this.spectate); }
      const s = this.spectate;
      if (s) {
        const f = s.forward(_d); const eye = s.eye(_v);
        const want = _v2.copy(eye).addScaledVector(f, -2.6); want.y += 0.6;
        const hit = this.world.raycast(eye, _v3.copy(want).sub(eye).normalize(), eye.distanceTo(want));
        if (hit) want.copy(eye).addScaledVector(_v3, Math.max(0.3, hit.t - 0.2));
        cam.position.lerp(want, Math.min(1, dt * 10));
        cam.lookAt(_v3.copy(eye).addScaledVector(f, 10));
      }
      this.finishCam(dt, null); return;
    }
    const eye = P.eye(_v);
    cam.position.copy(eye);
    const yaw = P.yaw - THREE.MathUtils.degToRad(P.viewPunchX) + P.kickX * 0.002;
    const pitch = P.pitch + THREE.MathUtils.degToRad(P.viewPunchY) + P.kickY * 0.0025;
    cam.rotation.set(0, 0, 0, 'YXZ'); cam.rotation.order = 'YXZ'; cam.rotation.y = yaw; cam.rotation.x = pitch;
    cam.rotation.z = -P.kickX * 0.0008 + (P.input.mx || 0) * -0.004;
    this.finishCam(dt, P);
  }

  finishCam(dt, P) {
    const cam = this.camera;
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake * 0.15; cam.position.y += (Math.random() - 0.5) * this.shake * 0.15; this.shake = Math.max(0, this.shake - dt * 1.8); }
    const ws = P && P.ws; const scoped = ws && ws.def.scope && ws.scoped ? ws.def.scope[ws.scoped - 1] : 0;
    const baseFov = this.settings.fov || 74;
    const targetFov = scoped ? scoped : baseFov;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 18);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, -Math.sin(cam.rotation.y), -Math.cos(cam.rotation.y));
    if (P) this.vm.update(dt, P, cam, cam.aspect, !!scoped);
    this.scoped = !!scoped;
  }

  render() {
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (this.player && this.player.alive && !this.scoped && this.phase !== 'over') {
      r.autoClear = false; r.clearDepth();
      r.render(this.vm.scene, this.vm.camera);
    }
  }
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z; const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c; if (h < 0) return null; const t = -b - Math.sqrt(h); return t >= 0 ? t : null;
}
function rayCyl(o, d, cx, y0, y1, cz, r) {
  // vertical cylinder
  const ox = o.x - cx, oz = o.z - cz; const a = d.x * d.x + d.z * d.z; const b = ox * d.x + oz * d.z; const c = ox * ox + oz * oz - r * r;
  if (a < 1e-9) return null;
  const h = b * b - a * c; if (h < 0) return null;
  const t = (-b - Math.sqrt(h)) / a; if (t < 0) return null;
  const y = o.y + d.y * t; if (y < y0 || y > y1) return null;
  return t;
}
