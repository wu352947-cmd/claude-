import * as THREE from 'three';
import { HOLDS, ROUTES, SITES } from './mapdata.js';
import { WEAPONS } from './weapons.js';

const D2R = Math.PI / 180;
const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export const SKILL = { easy: 0.3, normal: 0.55, hard: 0.78, expert: 0.95 };

export class Bot {
  constructor(agent, game, skill) {
    this.a = agent; this.g = game; this.skill = skill;
    this.state = 'idle'; this.path = null; this.pi = 0; this.goal = null; this.repathT = 0;
    this.target = null; this.seenT = 0; this.reactT = 0; this.memory = new Map();   // enemy id -> {x,y,z,t}
    this.errYaw = 0; this.errPitch = 0; this.burstLeft = 0; this.pauseT = 0; this.strafeT = 0; this.strafeDir = 1;
    this.thinkT = Math.random() * 0.1; this.stuckT = 0; this.lastPos = new THREE.Vector3(); this.lookYaw = 0; this.lookPitch = 0;
    this.heard = null; this.role = null; this.holdSpot = null; this.waitT = 0; this.crouchSpray = false;
    this.headAim = Math.random() < this.headChance();
    this.turnRate = (380 + 620 * skill) * D2R;
  }

  headChance() { return 0.18 + 0.62 * this.skill; }

  // ---------- perception ----------
  canSee(e) {
    const a = this.a; if (!e.alive || a.flashT > 0.6) return false;
    const eye = a.eye(_e);
    const tgt = _t.set(e.pos.x, e.pos.y + e.height - 0.2, e.pos.z);
    const dx = tgt.x - eye.x, dz = tgt.z - eye.z; const d = Math.hypot(dx, dz);
    if (d > 115) return false;
    const fy = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    const cosA = (dx * fy + dz * fz) / (d || 1);
    if (d > 2.5 && cosA < Math.cos(75 * D2R)) return false;   // ~150° FOV
    if (this.g.effects.smokeBlocks(eye, tgt)) return false;
    if (this.g.world.los(eye, tgt)) return true;
    // chest / feet visible?
    tgt.y = e.pos.y + e.height * 0.55;
    if (this.g.world.los(eye, tgt)) return true;
    return false;
  }

  hear(ev) {
    // ev: {x,y,z,agent,kind,radius}
    if (!this.a.alive || ev.agent.team === this.a.team) return;
    const d = Math.hypot(ev.x - this.a.pos.x, ev.z - this.a.pos.z);
    if (d > ev.radius) return;
    this.memory.set(ev.agent.id, { x: ev.x, y: ev.y, z: ev.z, t: this.g.time, heard: true });
    if (!this.target && (!this.heard || this.g.time - this.heard.t > 1.5)) this.heard = { x: ev.x, y: ev.y, z: ev.z, t: this.g.time };
  }

  onDamaged(att) {
    if (att && att.team !== this.a.team) {
      this.memory.set(att.id, { x: att.pos.x, y: att.pos.y, z: att.pos.z, t: this.g.time });
      if (!this.target) this.heard = { x: att.pos.x, y: att.pos.y + 1.4, z: att.pos.z, t: this.g.time, urgent: true };
    }
  }

  // ---------- main ----------
  update(dt) {
    const a = this.a, g = this.g; if (!a.alive) return;
    const inp = a.input;
    inp.fire = false; inp.fire2 = false; inp.reload = false; inp.jump = false; inp.use = false;
    if (g.freeze) { inp.mx = inp.mf = 0; this.buyThink(); return; }
    if (this.nade && this.runNade(dt)) return;
    // step out of fire
    const fire = g.inFire(a.pos);
    if (fire) { const dx = a.pos.x - fire.x, dz = a.pos.z - fire.z, L = Math.hypot(dx, dz) || 1; this.moveToward(a.pos.x + dx / L * 4, a.pos.z + dz / L * 4, 1); if (this.target) this.combat(dt); const k = Math.min(1, dt * 10); a.yaw += angDiff(this.lookYaw, a.yaw) * k; a.pitch += (this.lookPitch - a.pitch) * k; return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.09 + Math.random() * 0.04; this.think(); }

    if (this.target && this.target.alive) this.combat(dt);
    else this.navigate(dt);

    // apply smoothed look
    const maxTurn = this.turnRate * dt * (this.target ? 1 : 0.6);
    const dy = angDiff(this.lookYaw, a.yaw); a.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy * Math.min(1, dt * (8 + 10 * this.skill))));
    const dp = this.lookPitch - a.pitch; a.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp * Math.min(1, dt * (8 + 10 * this.skill))));
    a.pitch = Math.max(-1.4, Math.min(1.4, a.pitch));
    // stuck handling
    if (Math.abs(inp.mx) + Math.abs(inp.mf) > 0.3) {
      if (this.lastPos.distanceToSquared(a.pos) < 0.0009) { this.stuckT += dt; if (this.stuckT > 0.5) { inp.jump = true; inp.mx = Math.random() < 0.5 ? -1 : 1; } if (this.stuckT > 1.4) { this.path = null; this.stuckT = 0; } }
      else this.stuckT = Math.max(0, this.stuckT - dt);
    }
    this.lastPos.copy(a.pos);
  }

  think() {
    const a = this.a, g = this.g;
    // find visible enemies
    let best = null, bestScore = 1e9;
    this.spot = this.spot || new Map();
    for (const e of g.agents) {
      if (e.team === a.team || !e.alive) continue;
      if (this.canSee(e)) {
        // noticing distant targets takes time (small on screen); moving targets are noticed faster
        const dd = a.pos.distanceTo(e.pos);
        const need = e === this.target ? 0 : Math.max(0, (dd - 12) / 60) * (1.25 - this.skill) * (e.speed2D() > 2 ? 0.6 : 1.2);
        const acc = (this.spot.get(e.id) || 0) + 0.1;
        this.spot.set(e.id, acc);
        if (acc < need) continue;
        const d = a.pos.distanceTo(e.pos);
        const fy = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
        const off = 1 - ((e.pos.x - a.pos.x) * fy + (e.pos.z - a.pos.z) * fz) / (d || 1);
        const score = d + off * 25 + (e === this.target ? -15 : 0);
        if (score < bestScore) { bestScore = score; best = e; }
        this.memory.set(e.id, { x: e.pos.x, y: e.pos.y, z: e.pos.z, t: g.time, seen: true });
        // tell teammates (radio info)
        g.spotted(a, e);
      } else this.spot.set(e.id, 0);
    }
    if (best && best !== this.target) {
      const fresh = !this.target;
      this.target = best;
      // reaction time: faster for high skill; slower for targets at screen edge
      const d = a.pos.distanceTo(best.pos);
      const ang = Math.abs(angDiff(Math.atan2(-(best.pos.x - a.pos.x), -(best.pos.z - a.pos.z)), a.yaw));
      this.reactT = g.time + (0.42 - 0.27 * this.skill) * rnd(0.8, 1.3) + ang * 0.12 * (1.2 - this.skill) + (fresh ? 0 : -0.05);
      // initial aim error (a "flick"): proportional to how far we must turn
      const err = (1.6 + ang * 7 * (1.1 - this.skill) + d * 0.02) * (1.25 - this.skill) * D2R;
      const ea = Math.random() * Math.PI * 2;
      this.errYaw = Math.cos(ea) * err; this.errPitch = Math.sin(ea) * err * 0.6;
      this.headAim = Math.random() < this.headChance() * (d > 60 ? 0.35 : d > 35 ? 0.7 : 1);
      this.burstLeft = 0; this.pauseT = 0; this.crouchSpray = Math.random() < 0.15 + 0.3 * this.skill && d > 12;
      if (a.ws && a.ws.def.scope && !a.ws.scoped) a.input.fire2 = true;
    }
    if (!best && this.target) {
      // lost sight: remember last position
      if (!this.target.alive || g.time - (this.memory.get(this.target.id)?.t || 0) > 0.35) {
        const m = this.memory.get(this.target.id);
        if (m && this.target.alive) this.heard = { x: m.x, y: m.y + 1.4, z: m.z, t: g.time, chase: true };
        this.target = null;
      }
    }
  }

  // ---------- combat ----------
  combat(dt) {
    const a = this.a, g = this.g, e = this.target, inp = a.input;
    const ws = a.ws;
    // switch to a gun if holding knife/grenade
    if (a.cur !== 'primary' && a.inv.primary && (a.inv.primary.ammo > 0 || a.inv.primary.reserve > 0)) a.switchTo('primary');
    else if ((a.cur === 'knife' || a.cur === 'grenade' || a.cur === 'c4') && a.inv.secondary) a.switchTo('secondary');
    const eye = a.eye(_e);
    const d = a.pos.distanceTo(e.pos);
    const aimY = this.headAim ? e.pos.y + e.height - 0.17 : e.pos.y + e.height - 0.55;
    // lead moving targets slightly (skill dependent) and lag behind (reaction)
    const lead = (this.skill - 0.55) * 0.12;
    const tx = e.pos.x + e.vel.x * lead, tz = e.pos.z + e.vel.z * lead;
    const dx = tx - eye.x, dy = aimY - eye.y, dz = tz - eye.z; const hd = Math.hypot(dx, dz);
    let yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, hd);
    // error decays (aim settles on target)
    const settle = Math.exp(-dt * (2.5 + 9 * this.skill));
    this.errYaw *= settle; this.errPitch *= settle;
    // micro jitter
    const jit = (1 - this.skill) * 0.35 * D2R;
    yaw += this.errYaw + (Math.random() - 0.5) * jit; pitch += this.errPitch + (Math.random() - 0.5) * jit;
    // recoil compensation (pull down against the spray pattern)
    if (ws && ws.def.pattern) {
      const comp = 0.35 + 0.6 * this.skill;
      pitch -= ws.punchY * D2R * comp; yaw += ws.punchX * D2R * comp;
    }
    this.lookYaw = yaw; this.lookPitch = pitch;

    if (!ws || !ws.def) return;
    const def = ws.def;
    // reload when empty & take cover
    if (def.mag && ws.ammo === 0) { inp.reload = true; this.retreat(dt, e); return; }
    if (def.type === 'knife') { this.chase(dt, e, d); if (d < 2) inp.fire = true; return; }
    if (def.scope && !ws.scoped && !ws.reloading) { if (!this._scopeT || g.time > this._scopeT) { inp.fire2 = true; this._scopeT = g.time + 0.4; } }

    // aim error angle vs target size
    const curErr = Math.hypot(angDiff(a.yaw, yaw), a.pitch - pitch);
    const tgtSize = Math.atan2(this.headAim ? 0.13 : 0.28, Math.max(1, d));
    const ready = g.time >= this.reactT;
    // movement while fighting: strafe between bursts, stop to shoot (counter-strafe)
    const close = d < 10, mid = d < 28;
    const wantShoot = ready && curErr < tgtSize * (1.3 + (1 - this.skill)) + 0.004;
    const lowHp = a.hp < 35 && d > 8 && Math.random() < 0.02 * (1 - this.skill);
    if (lowHp) { this.retreat(dt, e); }
    else this.combatMove(dt, d, wantShoot && this.pauseT <= 0);

    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (!wantShoot) return;
    // shot discipline by distance
    const spd = a.speed2D();
    const stillEnough = def.type === 'shotgun' || def.type === 'smg' || close || spd < 1.0 + (1 - this.skill) * 2;
    if (!stillEnough) return;
    if (def.auto) {
      if (this.burstLeft <= 0) this.burstLeft = close ? 14 : mid ? Math.round(rnd(3, 6)) : Math.round(rnd(1, 3));
      inp.fire = true;
      if (ws.shots >= this.burstLeft) { this.burstLeft = 0; this.pauseT = close ? 0.08 : mid ? rnd(0.2, 0.35) : rnd(0.3, 0.5); this.headAim = Math.random() < this.headChance(); }
    } else {
      if (g.time >= ws.nextFire && (ws.inaccFire < 0.6 || close || def.type === 'shotgun')) inp.fire = true;
    }
  }

  combatMove(dt, d, shooting) {
    const a = this.a, inp = a.input;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = rnd(0.25, 0.7); }
    if (shooting && a.ws && a.ws.def.type !== 'smg' && a.ws.def.type !== 'shotgun' && d > 9) {
      // counter strafe: input opposite to current velocity to stop instantly
      const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
      const vr = a.vel.x * cy - a.vel.z * sy; const vf = -a.vel.x * sy - a.vel.z * cy;
      inp.mx = Math.abs(vr) > 0.6 ? -Math.sign(vr) : 0; inp.mf = Math.abs(vf) > 0.6 ? -Math.sign(vf) : 0;
      inp.crouch = this.crouchSpray && this.skill > 0.4;
      inp.walk = false;
    } else {
      inp.crouch = false;
      inp.mx = this.strafeDir * (this.skill > 0.3 ? 1 : 0.5);
      inp.mf = d > 25 && this.skill > 0.6 ? 0.25 : d < 4 ? -0.6 : 0;
      if (Math.random() < 0.003 * this.skill && d < 15) inp.jump = true;
    }
  }

  retreat(dt, e) {
    const a = this.a, inp = a.input;
    // back off away from enemy while strafing
    const dx = a.pos.x - e.pos.x, dz = a.pos.z - e.pos.z; const L = Math.hypot(dx, dz) || 1;
    this.moveToward(a.pos.x + dx / L * 3 + (Math.random() - 0.5), a.pos.z + dz / L * 3, 1);
  }

  chase(dt, e, d) { this.moveToward(e.pos.x, e.pos.z, 1); }

  moveToward(x, z, speed = 1) {
    const a = this.a, inp = a.input;
    const dx = x - a.pos.x, dz = z - a.pos.z; const L = Math.hypot(dx, dz); if (L < 0.05) { inp.mx = inp.mf = 0; return; }
    const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    // local: right=(cos,−sin), fwd=(−sin,−cos)
    inp.mx = (dx * cy - dz * sy) / L * speed; inp.mf = (-dx * sy - dz * cy) / L * speed;
  }

  // ---------- navigation / objectives ----------
  setGoal(x, z, state = 'move', look = null) {
    this.goal = { x, z, look }; this.state = state; this.path = null; this.repathT = 0;
  }

  navigate(dt) {
    const a = this.a, g = this.g, inp = a.input;
    inp.crouch = false; inp.walk = false;
    // reload in downtime
    const ws = a.ws;
    if (ws && ws.def.mag && ws.ammo < ws.def.mag * 0.5 && ws.reserve > 0 && !ws.reloading) inp.reload = true;
    if (a.cur !== 'primary' && a.inv.primary && a.cur !== 'c4' && !this.planting) a.switchTo('primary');
    if (ws && ws.scoped && !this.holding) inp.fire2 = true;

    // react to sounds
    if (this.heard && g.time - this.heard.t < 6) {
      const h = this.heard;
      const look = Math.atan2(-(h.x - a.pos.x), -(h.z - a.pos.z));
      this.lookYaw = look; this.lookPitch = Math.atan2(h.y - (a.pos.y + 1.6), Math.hypot(h.x - a.pos.x, h.z - a.pos.z));
      const dist = Math.hypot(h.x - a.pos.x, h.z - a.pos.z);
      const committed = this.state === 'toplant' || this.state === 'defuse' || this.state === 'retake' || this.state === 'getbomb' || this.planting;
      if ((h.chase || h.urgent) && !h.handled && !committed && dist < 45 && Math.random() < 0.45 + this.skill * 0.35) {
        h.handled = true;
        this.setGoal(h.x, h.z, 'search');
      }
      if (!h.naded && dist > 12 && dist < 32 && Math.random() < 0.02) { const nid = ['he', 'incgrenade', 'molotov'].find(x => a.inv.grenades.includes(x)); if (nid) { h.naded = true; this.throwAt(h.x, h.y - 1.2, h.z, nid); } }
      if (g.time - h.t > 5) this.heard = null;
    }

    this.g.planner.tick(this);
    if (!this.goal) { inp.mx = inp.mf = 0; this.idleLook(dt); return; }
    const gd = Math.hypot(this.goal.x - a.pos.x, this.goal.z - a.pos.z);
    if (gd < 1.0) {
      inp.mx = inp.mf = 0; this.path = null;
      if (this.goal.look) { this.lookYaw = Math.atan2(-(this.goal.look[0] - a.pos.x), -(this.goal.look[1] - a.pos.z)); this.lookPitch = 0; this.holding = true; if (a.ws && a.ws.def.scope && !a.ws.scoped && Math.random() < 0.05) inp.fire2 = true; }
      else this.idleLook(dt);
      if (this.state === 'search') { this.goal = null; this.state = 'idle'; }
      return;
    }
    this.holding = false;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0) {
      this.path = g.world.findPath(a.pos.x, a.pos.z, this.goal.x, this.goal.z, g.planner.avoidFn(this));
      this.pi = 1; this.repathT = 4 + Math.random() * 2;
      if (!this.path) { this.goal = null; this.state = 'idle'; inp.mx = inp.mf = 0; return; }
    }
    // follow path
    let wp = this.path[this.pi];
    while (wp && Math.hypot(wp.x - a.pos.x, wp.z - a.pos.z) < 0.7) { this.pi++; wp = this.path[this.pi]; }
    if (!wp) { this.path = null; inp.mx = inp.mf = 0; return; }
    this.moveToward(wp.x, wp.z, 1);
    // look ahead along path, checking angles
    if (!this.heard) {
      const ahead = this.path[Math.min(this.path.length - 1, this.pi + 1)];
      this.lookYaw = Math.atan2(-(ahead.x - a.pos.x), -(ahead.z - a.pos.z)) + Math.sin(g.time * 0.9 + this.a.id) * 0.35;
      this.lookPitch = 0;
    }
    // walk quietly when close to enemy positions late in the approach
    inp.walk = this.sneak && gd < 25;
  }

  idleLook(dt) {
    this.lookYaw += Math.sin(this.g.time * 0.6 + this.a.id * 3) * dt * 0.6;
  }

  // ---------- grenades ----------
  throwAt(x, y, z, id) {
    const a = this.a;
    if (this.nade || !a.inv.grenades.includes(id) || this.target) return false;
    const eye = a.eye(_e);
    const dx = x - eye.x, dz = z - eye.z, dy = y - eye.y; const d = Math.hypot(dx, dz);
    if (d < 6 || d > 42) return false;
    // ballistic search for the pitch that lands closest to the target distance
    let best = 0.3, be = 1e9;
    for (let p = -0.1; p < 1.1; p += 0.04) {
      const vx = Math.cos(p) * 17, vy = Math.sin(p) * 17 + 2.2;
      // time when y reaches dy on the way down
      const disc = vy * vy - 2 * 14 * (dy); if (disc < 0) continue;
      const t = (vy + Math.sqrt(disc)) / 14; const r = vx * t;
      if (Math.abs(r - d) < be) { be = Math.abs(r - d); best = p; }
    }
    a.inv.grenades.splice(a.inv.grenades.indexOf(id), 1); a.inv.grenades.unshift(id);
    this.nade = { yaw: Math.atan2(-dx, -dz), pitch: best, phase: 0, t: 0 };
    a.switchTo('grenade');
    return true;
  }

  runNade(dt) {
    const a = this.a, inp = a.input, n = this.nade; n.t += dt;
    inp.mx = inp.mf = 0; this.lookYaw = n.yaw; this.lookPitch = n.pitch;
    const k = Math.min(1, dt * 12); a.yaw += (n.yaw - a.yaw) * k; a.pitch += (n.pitch - a.pitch) * k;
    if (a.cur !== 'grenade' || n.t > 3) { this.nade = null; return false; }
    if (n.phase === 0 && this.g.time >= a.deployEnd && Math.abs(angDiff(a.yaw, n.yaw)) < 0.05) { inp.fire = true; n.phase = 1; }
    else if (n.phase === 1) { inp.fire = false; n.phase = 2; n.done = this.g.time + 0.3; }
    else if (n.phase === 2 && this.g.time > n.done) { this.nade = null; }
    return true;
  }

  // ---------- economy ----------
  buyThink() {
    if (this.bought) return; this.bought = true;
    this.g.botBuy(this.a, this.skill);
  }
}

// Team strategy coordinator
export class Planner {
  constructor(game) { this.g = game; this.plan = {}; }

  newRound() {
    const g = this.g;
    this.plan = {};
    const tSite = Math.random() < 0.5 ? 'A' : 'B';
    this.plan.T = { site: tSite, executeT: g.time + 18 + Math.random() * 20, gathered: false, lurker: null };
    const bots = g.agents.filter(a => a.isBot);
    // CT roles
    const cts = g.agents.filter(a => a.team === 'CT');
    const roles = ['A', 'B', 'MID', 'A', 'B', 'LONG', 'TUN', 'A'];
    cts.forEach((a, i) => { if (a.brain) { a.brain.role = roles[i % roles.length]; const hs = HOLDS[a.brain.role]; const h = hs[(i * 3 + Math.floor(Math.random() * hs.length)) % hs.length]; a.brain.holdSpot = h; a.brain.setGoal(h[0], h[1], 'hold', [h[2], h[3]]); } });
    // T routes
    const ts = g.agents.filter(a => a.team === 'T');
    const routes = ROUTES[tSite];
    ts.forEach((a, i) => {
      if (!a.brain) return;
      const r = routes[i % routes.length].map(p => [p[0] + (Math.random() - 0.5) * 3, p[1] + (Math.random() - 0.5) * 3]);
      a.brain.route = r; a.brain.ri = 0; a.brain.sneak = Math.random() < 0.3;
      if (i === ts.length - 1 && ts.length > 3 && Math.random() < 0.4) { const other = ROUTES[tSite === 'A' ? 'B' : 'A'][0]; a.brain.route = other.slice(0, 4); a.brain.lurk = true; }
      a.brain.state = 'route'; a.brain.goal = null;
    });
    for (const b of bots) { b.brain.bought = false; b.brain.target = null; b.brain.heard = null; b.brain.memory.clear(); b.brain.planting = false; }
  }

  avoidFn(bot) { return null; }

  // player radio commands
  command(cmd, team) {
    const g = this.g; const bots = g.agents.filter(a => a.brain && a.team === team && a.alive);
    for (const a of bots) a.brain.order = null;
    if (cmd === 'follow' || cmd === 'hold') { for (const a of bots) a.brain.order = { kind: cmd, until: g.time + 25 }; return; }
    if ((cmd === 'A' || cmd === 'B') && team === 'T' && this.plan.T) {
      const P = this.plan.T; P.site = cmd; P.executeT = g.time + 4; P.utility = 0;
      bots.forEach((a, i) => {
        const routes = ROUTES[cmd]; const r = routes[i % routes.length];
        let bi = 0, bd = 1e9; r.forEach((p, k) => { const d = Math.hypot(p[0] - a.pos.x, p[1] - a.pos.z); if (d < bd) { bd = d; bi = k; } });
        a.brain.route = r.map(p => [p[0] + (Math.random() - 0.5) * 3, p[1] + (Math.random() - 0.5) * 3]); a.brain.ri = bi; a.brain.lurk = false; a.brain.state = 'route'; a.brain.goal = null;
      });
      return;
    }
    if ((cmd === 'A' || cmd === 'B') && team === 'CT') {
      bots.forEach((a, i) => { const hs = HOLDS[cmd]; const h = hs[i % hs.length]; a.brain.role = cmd; a.brain.holdSpot = h; a.brain.setGoal(h[0], h[1], 'rotate', [h[2], h[3]]); });
    }
  }

  tick(bot) {
    const g = this.g, a = bot.a;
    if (bot.order && g.time < bot.order.until && !g.bomb.planted) {
      const o = bot.order;
      if (o.kind === 'follow') {
        const p = g.player; if (!p.alive) { bot.order = null; return; }
        if (!bot.goal || g.time > (o.next || 0)) { o.next = g.time + 1.5; const q = g.world.randomNavNear(p.pos.x - Math.sin(p.yaw) * -2.5, p.pos.z - Math.cos(p.yaw) * -2.5, 3); bot.setGoal(q.x, q.z, 'follow'); }
        if (Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) < 4) { bot.goal = null; a.input.mx = a.input.mf = 0; bot.lookYaw = p.yaw + (Math.random() - 0.5) * 0.6; }
        return;
      }
      if (o.kind === 'hold') { bot.goal = null; a.input.mx = a.input.mf = 0; return; }
    }
    if (g.mode === 'tdm') return this.tickTDM(bot);
    if (a.team === 'T') this.tickT(bot); else this.tickCT(bot);
  }

  tickTDM(bot) {
    const g = this.g, a = bot.a;
    if (bot.goal && bot.state !== 'idle') return;
    // hunt: go towards last known enemy or a random hot zone
    let tgt = null, best = 1e9;
    for (const [id, m] of bot.memory) { const age = g.time - m.t; if (age < 12 && age < best) { best = age; tgt = m; } }
    if (!tgt) {
      const enemies = g.agents.filter(e => e.team !== a.team && e.alive);
      if (enemies.length && Math.random() < 0.35) { const e = enemies[Math.floor(Math.random() * enemies.length)]; tgt = { x: e.pos.x + (Math.random() - 0.5) * 20, z: e.pos.z + (Math.random() - 0.5) * 20 }; }
      else { const keys = Object.keys(HOLDS); const hs = HOLDS[keys[Math.floor(Math.random() * keys.length)]]; const h = hs[Math.floor(Math.random() * hs.length)]; tgt = { x: h[0], z: h[1] }; }
    }
    const p = g.world.randomNavNear(tgt.x, tgt.z, 3);
    bot.setGoal(p.x, p.z, 'hunt');
  }

  tickT(bot) {
    const g = this.g, a = bot.a, P = this.plan.T; if (!P) return;
    const site = SITES[P.site];
    if (g.bomb.planted) {
      if (this.fleeBomb(bot)) return;
      // post plant: guard bomb from cover
      if (bot.state !== 'post') {
        const hs = HOLDS[g.bomb.site];
        const h = hs[Math.floor(Math.random() * hs.length)];
        bot.setGoal(h[0] + (Math.random() - 0.5) * 2, h[1] + (Math.random() - 0.5) * 2, 'post', [g.bomb.pos.x, g.bomb.pos.z]);
      }
      return;
    }
    // bomb carrier at site -> plant
    if (a.inv.c4) {
      const inSite = g.inSite(a.pos);
      if (inSite) {
        bot.planting = true;
        if (a.cur !== 'c4') a.switchTo('c4');
        a.input.mx = a.input.mf = 0; a.input.use = true; bot.goal = null;
        return;
      }
    }
    // dropped bomb: nearest T goes to pick it up
    if (g.bomb.dropped && !g.bomb.planted) {
      const ts = g.agents.filter(x => x.team === 'T' && x.alive);
      const nearest = ts.sort((p, q) => p.pos.distanceTo(g.bomb.pos) - q.pos.distanceTo(g.bomb.pos))[0];
      if (nearest === a) { if (!bot.goal || bot.state !== 'getbomb') bot.setGoal(g.bomb.pos.x, g.bomb.pos.z, 'getbomb'); return; }
    }
    if (bot.state === 'route' || !bot.goal) {
      const r = bot.route; if (!r) return;
      // wait at the second-to-last point until execute time (group up)
      const stage = r.length - 2;
      if (bot.ri >= r.length) {
        // inside site: if carrier, plant spot; else hold an angle
        if (a.inv.c4) { const px = (site.x0 + site.x1) / 2 + (Math.random() - 0.5) * 8, pz = (site.z0 + site.z1) / 2 + (Math.random() - 0.5) * 6; bot.setGoal(px, pz, 'toplant'); }
        else { const hs = HOLDS[P.site]; const h = hs[Math.floor(Math.random() * hs.length)]; bot.setGoal(h[0], h[1], 'siteHold', [h[2], h[3]]); }
        return;
      }
      if (bot.ri > stage && g.time < P.executeT && !bot.lurk) { bot.goal = null; bot.idleLook(0.1); a.input.mx = a.input.mf = 0; return; }
      if (bot.ri > stage && !bot.lurk && (P.utility || 0) < 3 && g.time < P.executeT + 6) {
        const hs = HOLDS[P.site]; const h = hs[(P.utility || 0) % hs.length];
        const id = a.inv.grenades.includes('smoke') ? 'smoke' : a.inv.grenades.includes('molotov') ? 'molotov' : a.inv.grenades.includes('flash') ? 'flash' : null;
        if (id && bot.throwAt(h[0], 1, h[1], id)) { P.utility = (P.utility || 0) + 1; return; }
      }
      const p = r[bot.ri];
      if (!bot.goal || Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) < 2.5) {
        if (bot.goal) bot.ri++;
        const q = r[Math.min(bot.ri, r.length - 1)];
        bot.goal = { x: q[0], z: q[1] }; bot.state = 'route'; bot.path = null;
      }
    }
    if (bot.state === 'toplant' && !bot.goal) bot.state = 'route';
    // execute timing: if most T are staged, go early
    if (!P.gathered && g.time > P.executeT - 12) {
      const ts = g.agents.filter(x => x.team === 'T' && x.alive && x.brain);
      if (ts.length && ts.filter(x => x.brain.route && x.brain.ri >= x.brain.route.length - 2).length >= Math.ceil(ts.length * 0.6)) { P.executeT = Math.min(P.executeT, g.time + 2); P.gathered = true; }
    }
  }

  tickCT(bot) {
    const g = this.g, a = bot.a;
    if (g.bomb.planted) {
      const b = g.bomb.pos;
      const d = Math.hypot(a.pos.x - b.x, a.pos.z - b.z);
      const need = (a.inv.kit ? 5 : 10) + (d > 2 ? d / 5.5 : 0);
      if (g.bomb.timer < need && g.bomb.defuser !== a) { if (this.fleeBomb(bot, true)) return; }
      // closest CT defuses, others cover
      const cts = g.agents.filter(x => x.team === 'CT' && x.alive);
      const defuser = cts.sort((p, q) => p.pos.distanceTo(b) - q.pos.distanceTo(b))[0];
      if (defuser === a) {
        if (d < 1.3) { a.input.mx = a.input.mf = 0; a.input.use = true; a.input.crouch = true; bot.goal = null; bot.state = 'defuse'; this.lookAtBomb(bot); return; }
        if (bot.state !== 'retake' || !bot.goal) bot.setGoal(b.x, b.z, 'retake');
      } else if (bot.state !== 'cover') {
        const p = g.world.randomNavNear(b.x, b.z, 7);
        bot.setGoal(p.x, p.z, 'cover', [b.x + (Math.random() - 0.5) * 30, b.z + (Math.random() - 0.5) * 30]);
      }
      return;
    }
    // rotate if enemies were spotted in a site
    const hot = g.hotSite;
    if (hot && g.time - hot.t < 15 && bot.role !== hot.site && bot.state !== 'rotate' && Math.random() < 0.02) {
      const hs = HOLDS[hot.site]; const h = hs[Math.floor(Math.random() * hs.length)];
      bot.setGoal(h[0], h[1], 'rotate', [h[2], h[3]]);
      return;
    }
    if (!bot.goal && bot.holdSpot && bot.state !== 'search') {
      const h = bot.holdSpot; bot.setGoal(h[0], h[1], 'hold', [h[2], h[3]]);
    }
  }

  // run out of the blast radius when the bomb is about to blow
  fleeBomb(bot, force) {
    const g = this.g, a = bot.a, b = g.bomb.pos;
    const d = Math.hypot(a.pos.x - b.x, a.pos.z - b.z);
    if (!force && g.bomb.timer > 7) return false;
    if (d > 32) { bot.goal = null; a.input.mx = a.input.mf = 0; return true; }
    if (bot.state !== 'flee') {
      const ang = Math.atan2(a.pos.z - b.z, a.pos.x - b.x);
      const p = g.world.randomNavNear(b.x + Math.cos(ang) * 40, b.z + Math.sin(ang) * 40, 8);
      bot.setGoal(p.x, p.z, 'flee');
    }
    return true;
  }

  lookAtBomb(bot) { const b = this.g.bomb.pos, a = bot.a; bot.lookYaw = Math.atan2(-(b.x - a.pos.x), -(b.z - a.pos.z)); bot.lookPitch = -0.7; }
}
