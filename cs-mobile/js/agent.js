import * as THREE from 'three';
import { WEAPONS, speedOf, unitsToM } from './weapons.js';

// CS movement constants (converted to meters)
const GRAVITY = unitsToM(800);
const JUMP_V = unitsToM(301.993);
const FRICTION = 5.2, STOPSPEED = unitsToM(80), ACCEL = 5.5, AIRACCEL = 12, AIR_WISH_CAP = unitsToM(30);
export const RADIUS = 0.36, STAND_H = 1.83, CROUCH_H = 1.3, STAND_EYE = 1.64, CROUCH_EYE = 1.18, STEP = 0.5;

export class WeaponState {
  constructor(id, skin = null) {
    this.def = WEAPONS[id]; this.id = id; this.skin = skin;
    this.ammo = this.def.mag || 0; this.reserve = this.def.reserve || 0;
    this.nextFire = 0; this.reloadEnd = 0; this.reloading = false; this.shellReload = false;
    this.shots = 0; this.punchX = 0; this.punchY = 0; this.inaccFire = 0; this.scoped = 0; this.lastShot = -9;
    this.burst = 0;
  }
}

let AGENT_ID = 0;
export class Agent {
  constructor(game, o) {
    this.game = game; this.id = AGENT_ID++;
    this.name = o.name; this.team = o.team; this.isBot = !!o.isBot; this.isPlayer = !!o.isPlayer;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.crouchT = 0; this.onGround = true; this.landT = 0; this.airTime = 0;
    this.hp = 100; this.armor = 0; this.helmet = false; this.money = 800; this.alive = false;
    this.kills = 0; this.deaths = 0; this.assists = 0; this.mvps = 0; this.score = 0; this.roundKills = 0; this.damageDealt = {};
    this.inv = { primary: null, secondary: null, knife: new WeaponState('knife'), grenades: [], c4: false, kit: false };
    this.cur = 'knife'; this.prevSlot = 'secondary'; this.deployEnd = 0;
    this.input = { mx: 0, mf: 0, jump: false, crouch: false, walk: false, fire: false, fire2: false, reload: false, use: false };
    this.prevFire = false; this.prevFire2 = false;
    this.viewPunchX = 0; this.viewPunchY = 0; this.kickX = 0; this.kickY = 0; this.kickVX = 0; this.kickVY = 0;
    this.stepAcc = 0; this.stepSide = 0; this.flashT = 0; this.flashMax = 0;
    this.useT = 0; this.lastDamageT = -9; this.lastAttacker = null;
    this.skins = o.skins || {};
  }

  get ws() { return this.cur === 'grenade' || this.cur === 'c4' ? null : this.inv[this.cur]; }
  get height() { return STAND_H + (CROUCH_H - STAND_H) * this.crouchT; }
  get eyeH() { return STAND_EYE + (CROUCH_EYE - STAND_EYE) * this.crouchT; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  speed2D() { return Math.hypot(this.vel.x, this.vel.z); }

  spawn(x, z, yaw) {
    const g = this.game.world.groundAt(x, z, 0.3, 3);
    this.pos.set(x, g, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.hp = 100; this.alive = true; this.crouchT = 0; this.onGround = true; this.flashT = 0;
    for (const s of ['primary', 'secondary', 'knife']) { const w = this.inv[s]; if (w) { w.reloading = false; w.scoped = 0; w.shots = 0; w.punchX = w.punchY = 0; w.inaccFire = 0; } }
    this.roundKills = 0; this.useT = 0;
    this.switchTo(this.inv.primary ? 'primary' : this.inv.secondary ? 'secondary' : 'knife', true);
  }

  giveWeapon(id, skin) {
    const d = WEAPONS[id];
    if (d.slot === 'grenade') { this.inv.grenades.push(id); return; }
    const ws = new WeaponState(id, skin ?? this.skins[id] ?? null);
    this.inv[d.slot] = ws;
    return ws;
  }

  switchTo(slot, instant = false) {
    if (slot === 'grenade' && !this.inv.grenades.length) return;
    if (slot === 'c4' && !this.inv.c4) return;
    if (slot !== 'grenade' && slot !== 'c4' && !this.inv[slot]) return;
    if (slot === this.cur && !instant) return;
    const old = this.ws; if (old) { old.reloading = false; old.scoped = 0; }
    if (this.cur !== slot) this.prevSlot = this.cur;
    this.cur = slot;
    const def = this.currentDef();
    this.deployEnd = this.game.time + (instant ? 0 : (def.deploy || 0.6));
    this.useT = 0;
    if (this.onSwitch) this.onSwitch(slot);
  }

  currentDef() {
    if (this.cur === 'grenade') return WEAPONS[this.inv.grenades[0]] || WEAPONS.knife;
    if (this.cur === 'c4') return { id: 'c4', name: 'C4 炸弹', type: 'c4', speed: 250, deploy: 0.6 };
    return this.ws.def;
  }

  cycleWeapon() {
    const order = ['primary', 'secondary', 'knife', 'grenade', 'c4'];
    let i = order.indexOf(this.cur);
    for (let k = 1; k <= order.length; k++) {
      const s = order[(i + k) % order.length];
      if (s === 'grenade' ? this.inv.grenades.length : s === 'c4' ? this.inv.c4 : this.inv[s]) { this.switchTo(s); return; }
    }
  }

  maxSpeed() {
    const def = this.currentDef();
    let s = speedOf(def, this.ws && this.ws.scoped);
    if (this.input.walk) s *= 0.52;
    s *= 1 - 0.66 * this.crouchT;
    if (this.landT > 0) s *= 0.75;
    if (this.slowT > 0) s *= 0.6;   // tagging when hit
    return s;
  }

  // ---------------- movement ----------------
  updateMovement(dt) {
    const w = this.game.world, inp = this.input;
    // crouch transition (CS: ~0.2s)
    const wantC = inp.crouch ? 1 : 0;
    if (wantC < this.crouchT) {
      // standing up: check headroom
      const ceil = w.ceilingAt(this.pos.x, this.pos.z, RADIUS, this.pos.y + CROUCH_H - 0.05);
      if (ceil - this.pos.y < STAND_H + 0.02) { /* blocked */ } else this.crouchT = Math.max(0, this.crouchT - dt * 5);
    } else this.crouchT = Math.min(1, this.crouchT + dt * 6);
    if (this.landT > 0) this.landT -= dt;
    if (this.slowT > 0) this.slowT -= dt;

    // wish direction from local input
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // input: mx = strafe right, mf = forward
    let wx = inp.mx * cy - inp.mf * sy, wz = -inp.mx * sy - inp.mf * cy;
    let wl = Math.hypot(wx, wz); const mag = Math.min(1, Math.hypot(inp.mx, inp.mf));
    if (wl > 1e-4) { wx /= wl; wz /= wl; }
    const maxS = this.maxSpeed();
    const wishSpeed = maxS * mag;
    const v = this.vel;
    if (this.onGround) {
      // friction
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const control = Math.max(sp, STOPSPEED); const drop = control * FRICTION * dt;
        const ns = Math.max(0, sp - drop) / sp; v.x *= ns; v.z *= ns;
      }
      accelerate(v, wx, wz, wishSpeed, ACCEL, dt);
      // clamp to max speed (no bhop speed gain on ground)
      const s2 = Math.hypot(v.x, v.z); if (s2 > maxS && mag > 0) { v.x *= maxS / s2; v.z *= maxS / s2; }
      if (inp.jump && this.crouchT < 0.9) {
        v.y = JUMP_V; this.onGround = false; this.airTime = 0;
        if (this.onJump) this.onJump();
      }
    } else {
      airAccelerate(v, wx, wz, wishSpeed, dt);
      v.y -= GRAVITY * dt;
      this.airTime += dt;
    }

    // integrate horizontally with collision (substeps for speed)
    const steps = Math.max(1, Math.ceil(Math.hypot(v.x, v.z) * dt / 0.25));
    const hgt = this.height;
    const px = this.pos.x, pz = this.pos.z;
    for (let i = 0; i < steps; i++) {
      this.pos.x += v.x * dt / steps; this.pos.z += v.z * dt / steps;
      w.collide(this.pos, RADIUS, hgt, this.onGround ? STEP : 0.05);
    }
    // project velocity on blocked axes
    const realVX = (this.pos.x - px) / dt, realVZ = (this.pos.z - pz) / dt;
    if (Math.abs(realVX) < Math.abs(v.x) * 0.95) v.x = realVX;
    if (Math.abs(realVZ) < Math.abs(v.z) * 0.95) v.z = realVZ;

    // vertical
    const ground = w.groundAt(this.pos.x, this.pos.z, RADIUS, this.pos.y + (this.onGround ? STEP : Math.max(0.05, -v.y * dt + 0.05)));
    if (this.onGround) {
      if (this.pos.y - ground > STEP + 0.05) { this.onGround = false; v.y = 0; this.airTime = 0; }
      else { this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 18); if (Math.abs(ground - this.pos.y) < 0.01) this.pos.y = ground; v.y = 0; }
    } else {
      this.pos.y += v.y * dt;
      const ceil = w.ceilingAt(this.pos.x, this.pos.z, RADIUS, this.pos.y + 0.5);
      if (this.pos.y + hgt > ceil) { this.pos.y = ceil - hgt; if (v.y > 0) v.y = 0; }
      if (this.pos.y <= ground) {
        const impact = -v.y;
        this.pos.y = ground; v.y = 0; this.onGround = true;
        if (this.airTime > 0.25) { this.landT = 0.2; if (this.onLand) this.onLand(impact); }
        if (impact > 11) this.game.damage(this, null, null, Math.round((impact - 11) * 9), 'legs', { fall: true });
      }
    }
    // keep inside map
    const H = 82; this.pos.x = Math.max(-H, Math.min(H, this.pos.x)); this.pos.z = Math.max(-H, Math.min(H, this.pos.z));

    // footsteps (running only — walking/crouching is silent like CS)
    const sp = Math.hypot(v.x, v.z);
    if (this.onGround && sp > 2.9 && !inp.walk && this.crouchT < 0.5) {
      this.stepAcc += sp * dt;
      if (this.stepAcc > 1.75) { this.stepAcc = 0; this.stepSide ^= 1; this.game.footstep(this); }
    }
  }

  // ---------------- weapons ----------------
  inaccuracy() {
    const ws = this.ws; if (!ws || !ws.def.inacc) return 0;
    const I = ws.def.inacc; const sp = this.speed2D(); const maxS = speedOf(ws.def, ws.scoped);
    let base = this.crouchT > 0.5 ? I.crouch : I.stand;
    if (ws.def.scope) base = ws.scoped ? I.scoped : I.stand;
    const moveF = Math.max(0, (sp - maxS * 0.34) / (maxS * 0.66));
    let a = base + I.move * Math.min(1, moveF);
    if (!this.onGround) a += I.jump;
    a += ws.inaccFire;
    return a;
  }

  updateWeapon(dt) {
    const t = this.game.time, inp = this.input;
    const ws = this.ws;
    // grenade / c4 handling
    if (this.cur === 'grenade') {
      if (inp.fire && !this.prevFire && t >= this.deployEnd) this.throwPending = true;
      if (this.throwPending && !inp.fire) { this.throwPending = false; this.game.throwGrenade(this, this.inv.grenades.shift()); this.deployEnd = t + 0.6; if (!this.inv.grenades.length) this.switchTo(this.prevSlot !== 'grenade' && this.inv[this.prevSlot] ? this.prevSlot : (this.inv.primary ? 'primary' : this.inv.secondary ? 'secondary' : 'knife')); }
      this.prevFire = inp.fire; return;
    }
    if (this.cur === 'c4') { this.prevFire = inp.fire; return; }
    if (!ws) return;
    const d = ws.def;
    // recoil recovery
    const sinceShot = t - ws.lastShot;
    const cycle = 60 / (d.rpm || 600);
    if (sinceShot > cycle * 1.2) {
      const k = Math.exp(-dt * (d.recoilRecover || 5));
      ws.punchX *= k; ws.punchY *= k;
      ws.shots = Math.max(0, ws.shots - dt * (d.rpm || 600) / 60 * 1.6);
    }
    ws.inaccFire *= Math.exp(-dt / Math.max(0.05, (d.inacc?.recovery || 0.3)) * 2.2);
    // visual punch follows weapon punch
    const vk = 1 - Math.exp(-dt * 30);
    this.viewPunchX += (ws.punchX * 0.5 - this.viewPunchX) * vk; this.viewPunchY += (ws.punchY * 0.55 - this.viewPunchY) * vk;
    // spring kick
    this.kickVX += (-this.kickX * 260 - this.kickVX * 22) * dt; this.kickVY += (-this.kickY * 260 - this.kickVY * 22) * dt;
    this.kickX += this.kickVX * dt; this.kickY += this.kickVY * dt;

    // reload progress
    if (ws.reloading && t >= ws.reloadEnd) {
      if (d.shellReload) {
        if (ws.reserve > 0 && ws.ammo < d.mag) { ws.ammo++; ws.reserve--; this.game.sound(this, 'shell_insert', 0.6); }
        if (ws.ammo < d.mag && ws.reserve > 0 && !inp.fire) ws.reloadEnd = t + d.reload; else { ws.reloading = false; this.game.sound(this, 'pump', 0.7); ws.nextFire = t + 0.3; }
      } else {
        const need = d.mag - ws.ammo; const take = Math.min(need, ws.reserve); ws.ammo += take; ws.reserve -= take; ws.reloading = false;
      }
    }
    // scope toggle
    if (inp.fire2 && !this.prevFire2 && d.scope && !ws.reloading) { ws.scoped = (ws.scoped + 1) % (d.scope.length + 1); this.game.sound(this, 'ui_click', 0.4); }
    if (inp.fire2 && !this.prevFire2 && d.type === 'knife' && t >= ws.nextFire && t >= this.deployEnd) { this.game.knifeAttack(this, true); ws.nextFire = t + 1.1; }
    this.prevFire2 = inp.fire2;
    // reload request
    if ((inp.reload || (ws.ammo === 0 && d.mag && ws.reserve > 0 && t >= ws.nextFire)) && !ws.reloading && d.mag && ws.ammo < d.mag && ws.reserve > 0 && t >= this.deployEnd) this.startReload(ws);
    // firing
    const canTrigger = d.auto ? inp.fire : (inp.fire && !this.prevFire);
    if (canTrigger && t >= ws.nextFire && t >= this.deployEnd) {
      if (d.type === 'knife') { this.game.knifeAttack(this, false); ws.nextFire = t + 0.5; }
      else if (ws.reloading && d.shellReload && ws.ammo > 0) { ws.reloading = false; }
      else if (!ws.reloading) {
        if (ws.ammo > 0) this.fire(ws);
        else if (!this.prevFire) { this.game.sound(this, 'dryfire', 0.5); ws.nextFire = t + 0.25; }
      }
    }
    this.prevFire = inp.fire;
  }

  startReload(ws) {
    const d = ws.def;
    ws.reloading = true; ws.scoped = 0;
    ws.reloadEnd = this.game.time + (d.shellReload ? 0.45 : d.reload);
    ws.reloadStart = this.game.time;
    this.game.sound(this, d.shellReload ? 'shell_insert' : d.type === 'pistol' ? 'reload_pistol' : d.type === 'sniper' ? 'reload_rifle' : d.type === 'smg' ? 'reload_smg' : 'reload_rifle', 0.7, d.shellReload ? 0 : 0.15);
    if (this.onReload) this.onReload(ws);
  }

  fire(ws) {
    const d = ws.def, t = this.game.time;
    ws.ammo--; ws.nextFire = t + 60 / d.rpm; ws.lastShot = t;
    const idx = Math.min(d.pattern.length - 1, Math.floor(ws.shots));
    const inacc = this.inaccuracy();
    // bullet direction: view + full punch
    const pat = d.pattern[idx];
    ws.punchX = pat[0] * (d.punch || 1) * 0.9; ws.punchY = pat[1] * (d.punch || 1) * 0.9;
    ws.shots += 1;
    ws.inaccFire = Math.min(ws.inaccFire + (d.inacc?.fire || 0.5), 6);
    this.kickVY += 9 * (d.punch || 1) * (0.8 + Math.random() * 0.4); this.kickVX += (Math.random() - 0.5) * 6 * (d.punch || 1);
    this.game.fireWeapon(this, ws, inacc);
    if (d.scope && ws.scoped) { const keep = ws.scoped; ws.scoped = 0; ws.rescope = keep; setTimeout(() => { if (this.ws === ws && !ws.reloading && this.alive) ws.scoped = ws.rescope; }, 60000 / d.rpm * 0.95); }
    if (d.id === 'nova') setTimeout(() => this.alive && this.game.sound(this, 'pump', 0.55), 330);
    if (d.id === 'awp') setTimeout(() => this.alive && this.game.sound(this, 'bolt', 0.6), 380);
    if (d.id === 'r8') setTimeout(() => this.alive && this.game.sound(this, 'cock', 0.4), 250);
  }

  // final aim direction including recoil & spread
  shotDir(inacc, out = new THREE.Vector3()) {
    const ws = this.ws;
    const px = ws ? ws.punchX : 0, py = ws ? ws.punchY : 0;
    const yaw = this.yaw - THREE.MathUtils.degToRad(px), pitch = this.pitch + THREE.MathUtils.degToRad(py);
    const cp = Math.cos(pitch);
    out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    if (inacc > 0) {
      // uniform-ish random in cone (CS uses r = rand * inacc, biased to center)
      const r = THREE.MathUtils.degToRad(inacc) * Math.sqrt(Math.random()) * (0.6 + Math.random() * 0.4);
      const a = Math.random() * Math.PI * 2;
      const right = _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const up = _u.crossVectors(right, out).normalize();
      out.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    return out;
  }

  update(dt) {
    if (!this.alive) return;
    this.updateMovement(dt);
    this.updateWeapon(dt);
    if (this.flashT > 0) this.flashT -= dt;
  }
}
const _r = new THREE.Vector3(), _u = new THREE.Vector3();

function airAccelerate(v, wx, wz, wishSpeed, dt) {
  const capped = Math.min(wishSpeed, AIR_WISH_CAP);
  const cur = v.x * wx + v.z * wz; const add = capped - cur; if (add <= 0) return;
  const as = Math.min(AIRACCEL * wishSpeed * dt, add);
  v.x += as * wx; v.z += as * wz;
}

function accelerate(v, wx, wz, wishSpeed, accel, dt) {
  const cur = v.x * wx + v.z * wz; const add = wishSpeed - cur; if (add <= 0) return;
  const as = Math.min(accel * dt * wishSpeed, add);
  v.x += as * wx; v.z += as * wz;
}
