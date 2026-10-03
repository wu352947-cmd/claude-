// 场景里的一切活物与机关：拾取物、笔记、遗骸、陶俑、活俑、鬼魂、机弩、机关砖、门、桥、灯、铜椁、守陵将军……
import * as THREE from 'three';
import * as MD from './models.js';
import { S } from './world.js';
import { clamp, rand, lerp } from './util.js';
import { mulberry } from './rng.js';
import { scratchTexture } from './textures.js';

const cache = {};
export const cached = (k, fn) => (cache[k] ||= fn());

const ITEM = {
  battery: '电池', herb: '药瓶', tally: '虎符', gear: '机关铜件', pearl: '夜明珠'
};

function glint(G, color = 0xffe6b0, scale = 0.45) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.glint, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(scale);
  return s;
}

// 找格子旁边的一面墙：返回朝向（远离墙）的角度与靠墙偏移
function wallSide(world, spot) {
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    if (world.isWall(spot.cx + dx, spot.cz + dz)) return { dx, dz, yaw: Math.atan2(-dx, -dz) };
  }
  return null;
}

// ---------------- 基类 ----------------
class Entity {
  constructor(G) { this.G = G; this.objs = []; this.dead = false; }
  add(o) { this.G.scene.add(o); this.objs.push(o); return o; }
  update() { }
  remove() {
    this.dead = true;
    for (const o of this.objs) { o.removeFromParent(); o.traverse?.(c => { if (c.material?.map && c.isSprite) c.material.dispose(); }); }
    const i = this.G.interactables.indexOf(this); if (i >= 0) this.G.interactables.splice(i, 1);
  }
}

// ---------------- 拾取物 ----------------
export class Pickup extends Entity {
  constructor(G, spot, opt) {
    super(G);
    this.item = opt.item; this.id = opt.id; this.name = opt.name || ITEM[opt.item];
    const mats = { battery: G.mats.plain, herb: G.mats.plain, tally: G.mats.bronzeVC, gear: G.mats.bronzeVC, pearl: G.pearlMat };
    const ox = opt.ox ?? rand(-0.4, 0.4), oz = opt.oz ?? rand(-0.4, 0.4);
    this.mesh = this.add(new THREE.Mesh(cached('item_' + this.item, () => MD.itemGeometry(this.item)), mats[this.item]));
    this.mesh.position.set(spot.x + ox, opt.y ?? 0.02, spot.z + oz);
    this.mesh.rotation.y = rand(0, 6.28);
    this.mesh.scale.setScalar(this.item === 'battery' ? 1.5 : 1.25);
    this.mesh.castShadow = true;
    this.g = this.add(glint(G, this.item === 'pearl' ? 0xbfe8ff : 0xffe2a8, this.item === 'tally' || this.item === 'gear' ? 0.6 : 0.4));
    this.g.position.set(this.mesh.position.x, this.mesh.position.y + 0.18, this.mesh.position.z);
    this.pos = this.mesh.position.clone(); this.pos.y += 0.1;
    this.phase = rand(0, 6);
    G.interactables.push(this);
    if (this.item === 'pearl') { this.light = { pos: this.pos, color: 0x9fd8ff, power: 2.2, radius: 5 }; G.lamps.push(this.light); }
  }
  prompt() { return '拾取' + this.name; }
  use() {
    const G = this.G, st = G.state;
    switch (this.item) {
      case 'battery':
        if (st.battery < 55) { st.battery = 100; G.toast('换上新电池，手电亮了起来'); } else { st.spares++; G.toast('备用电池 +1（没电时自动更换）'); }
        break;
      case 'herb': st.hp = Math.min(100, st.hp + 40); st.sanity = Math.min(100, st.sanity + 15); G.toast('服下药，喉咙里一阵苦涩，伤口不那么疼了'); break;
      default: G.give(this.id, this.name);
    }
    G.audio.pickup();
    if (this.light) G.lamps.splice(G.lamps.indexOf(this.light), 1);
    this.remove();
  }
  update(dt, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 3 + this.phase);
    this.g.material.opacity = 0.35 + p * 0.65;
    this.g.scale.setScalar((this.item === 'tally' || this.item === 'gear' ? 0.5 : 0.32) * (0.8 + p * 0.4));
  }
}

// ---------------- 笔记（竹简 / 信） ----------------
export class Note extends Entity {
  constructor(G, spot, opt) {
    super(G);
    this.note = opt.note;
    const ws = wallSide(G.world, spot);
    const x = spot.x + (ws ? ws.dx * 0.55 : 0), z = spot.z + (ws ? ws.dz * 0.55 : 0);
    const isLetter = G.notes[this.note].kind === 'letter';
    this.mesh = this.add(new THREE.Mesh(
      isLetter ? cached('letter', () => new THREE.BoxGeometry(0.22, 0.01, 0.3)) : cached('item_note', () => MD.itemGeometry('note')),
      isLetter ? G.paperMat : G.mats.plain));
    this.mesh.position.set(x, 0.02, z); this.mesh.rotation.y = rand(-0.6, 0.6);
    this.mesh.receiveShadow = true;
    if (opt.decor) decor(G, { ...spot, x: x + 0.3, z: z + 0.2 }, opt.decor, this);
    this.g = this.add(glint(G, 0xfff0d0, 0.4)); this.g.position.set(x, 0.2, z);
    this.pos = new THREE.Vector3(x, 0.1, z);
    G.interactables.push(this);
  }
  prompt() { return '阅读'; }
  use() { this.G.readNote(this.note); this.G.audio.pickup(); this.remove(); }
  update(dt, t) { this.g.material.opacity = 0.4 + 0.4 * Math.sin(t * 2.4); }
}

// ---------------- 装饰 ----------------
export function decor(G, spot, kind, owner) {
  const put = m => (owner ? owner.add(m) : G.addStatic(m));
  const r = mulberry((spot.cx * 31 + spot.cz * 17) | 0);
  if (kind === 'bones' || kind === 'bonesBig') {
    const n = kind === 'bonesBig' ? 6 : 1;
    for (let i = 0; i < n; i++) {
      const m = put(new THREE.Mesh(cached('bones' + (i % 3), () => MD.bonePileGeometry(i * 7 + 3, 10)), G.mats.bone));
      m.position.set(spot.x + (r() - 0.5) * (n > 1 ? 3 : 0.8), 0, spot.z + (r() - 0.5) * (n > 1 ? 3 : 0.8)); m.rotation.y = r() * 6;
      m.castShadow = true;
    }
  } else if (kind === 'bag') {
    const m = put(new THREE.Mesh(cached('bag', () => new THREE.BoxGeometry(0.45, 0.3, 0.25)), G.mats.cloth));
    m.position.set(spot.x, 0.15, spot.z); m.rotation.y = 0.5; m.castShadow = true;
  } else if (kind === 'fallen') {
    const m = put(new THREE.Mesh(cached('log', () => new THREE.CylinderGeometry(0.16, 0.18, 4.4, 9)), G.mats.wood));
    m.position.set(spot.x, 1.2, spot.z); m.rotation.set(0.1, 0.3, 1.05); m.castShadow = true;
    G.world.obstacles.push({ x: spot.x - 0.9, z: spot.z, r: 0.35 });
    for (let i = 0; i < 5; i++) {
      const rk = put(new THREE.Mesh(cached('rock' + (i % 3), () => MD.rockGeometry(i + 1, 0.25)), G.mats.earth));
      rk.position.set(spot.x + (r() - 0.5) * 2, 0.08, spot.z + (r() - 0.5) * 1.6);
    }
  }
}

// ---------------- 遗骸（可能带东西） ----------------
export class Corpse extends Entity {
  constructor(G, spot, opt) {
    super(G);
    const ws = wallSide(G.world, spot) || { dx: 0, dz: -1, yaw: 0 };
    const x = spot.x + ws.dx * 0.62, z = spot.z + ws.dz * 0.62;
    const geo = cached('corpse' + (opt.seed || 1), () => MD.corpseGeometry(opt.seed || 1));
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ws.yaw;
    g.add(new THREE.Mesh(geo.bones, G.mats.bone), new THREE.Mesh(geo.cloth, G.mats.cloth), new THREE.Mesh(geo.lamp, G.mats.plain));
    g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    if (opt.arrows) {
      for (let i = 0; i < 4; i++) {
        const a = new THREE.Mesh(cached('arrow', MD.arrowGeometry), G.mats.plain);
        a.position.set(rand(-0.15, 0.15), rand(0.35, 0.7), rand(0.0, 0.15)); a.rotation.set(rand(-0.4, 0.4), rand(2.6, 3.6), 0);
        g.add(a);
      }
    }
    this.add(g);
    G.world.obstacles.push({ x, z, r: 0.35 });
    this.pos = new THREE.Vector3(x, 0.5, z);
    this.opt = opt;
    if (opt.item || opt.note) {
      G.interactables.push(this);
      this.g = this.add(glint(G, 0xffe2a8, 0.4)); this.g.position.set(x + Math.sin(ws.yaw) * 0.4, 0.3, z + Math.cos(ws.yaw) * 0.4);
    }
  }
  prompt() { return '翻找遗骸'; }
  use() {
    const { item, note, id, name } = this.opt, G = this.G;
    if (note) G.readNote(note);
    if (item === 'battery') { if (G.state.battery < 55) G.state.battery = 100; else G.state.spares++; G.toast('从遗骸的帆布包里摸出一节电池'); }
    else if (item === 'herb') { G.state.hp = Math.min(100, G.state.hp + 40); G.toast('遗骸怀里有半瓶药'); }
    else if (item) G.give(id, name);
    G.audio.pickup();
    this.opt = {};
    const i = G.interactables.indexOf(this); if (i >= 0) G.interactables.splice(i, 1);
    this.g?.removeFromParent();
  }
  update(dt, t) { if (this.g) this.g.material.opacity = 0.4 + 0.4 * Math.sin(t * 2.4); }
}

// ---------------- 灯 ----------------
export class Lamp extends Entity {
  constructor(G, spot, opt) {
    super(G);
    const kind = opt.kind || 'stand';
    const ws = kind === 'lantern' || kind === 'bowl' ? wallSide(G.world, spot) : null;
    const x = spot.x + (ws ? ws.dx * 0.55 : 0), z = spot.z + (ws ? ws.dz * 0.55 : 0);
    let fy = 1.36, color = 0xffa040, power = opt.dim ? 3 : 7;
    if (kind === 'lantern') {
      const m = this.add(new THREE.Mesh(cached('lantern', () => MD.itemGeometry('battery')), G.mats.plain));
      m.position.set(x, 0, z); m.scale.setScalar(2.4);
      const bulb = this.add(new THREE.Mesh(cached('bulb', () => new THREE.SphereGeometry(0.06, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })));
      bulb.position.set(x, 0.25, z); this.bulb = bulb;
      fy = 0.3; color = 0xffe2b0; power = 4;
    } else {
      const geo = cached('lamp_' + kind, () => MD.lampGeometry(kind === 'bowl' ? 'bowl' : 'stand'));
      const m = this.add(new THREE.Mesh(geo, G.mats.bronze)); m.position.set(x, 0, z); m.castShadow = true;
      fy = kind === 'bowl' ? 0.6 : 1.36;
      G.world.obstacles.push({ x, z, r: 0.3 });
      this.flame = this.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.flame, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
      this.flame.position.set(x, fy + 0.12, z); this.flame.scale.set(0.22, 0.38, 1);
      this.halo = this.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.glow, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 })));
      this.halo.position.set(x, fy + 0.1, z); this.halo.scale.setScalar(opt.dim ? 0.9 : 1.6);
    }
    this.light = { pos: new THREE.Vector3(x, fy + 0.25, z), color, power: opt.fake ? power * 0.6 : power, radius: opt.dim ? 5 : 7, fake: !!opt.fake, base: power, kind };
    G.lamps.push(this.light);
    this.phase = rand(0, 10); this.kind = kind;
  }
  update(dt, t) {
    const fl = 0.82 + 0.1 * Math.sin(t * 9 + this.phase) + 0.08 * Math.sin(t * 23.7 + this.phase * 2);
    let k = fl;
    if (this.kind === 'lantern') { k = Math.random() < 0.01 ? 0.1 : 1; if (this.bulb) this.bulb.material.color.setScalar(k); }
    if (this.G.flags.escape) k *= 0.6 + 0.4 * Math.random();
    this.light.power = this.light.base * k;
    if (this.flame) { this.flame.scale.set(0.2 + 0.04 * fl, 0.34 + 0.1 * fl, 1); this.halo.material.opacity = 0.28 * fl; }
  }
}

// ---------------- 静态陶俑（批量实例化） ----------------
export function buildWarriorBatch(G, list) {
  // list: [{x,z,yaw,kind}]
  const groups = {};
  for (const w of list) { const key = w.kind + ((w.v ?? 0)); (groups[key] ||= []).push(w); }
  const dummy = new THREE.Object3D();
  for (const [key, arr] of Object.entries(groups)) {
    const kind = arr[0].kind, v = arr[0].v ?? 0;
    const geo = cached('war_' + kind + v, () => MD.warriorGeometry(kind, 11 + v * 7));
    const im = new THREE.InstancedMesh(geo, G.mats.terracotta, arr.length);
    arr.forEach((w, i) => {
      dummy.position.set(w.x, 0, w.z); dummy.rotation.set(0, w.yaw, 0);
      dummy.scale.setScalar(w.s || 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      G.world.obstacles.push({ x: w.x, z: w.z, r: kind === 'general' ? 0.4 : 0.34 });
    });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    G.addStatic(im);
  }
}

// ---------------- 活俑：只在没人看着时移动 ----------------
export class Statue extends Entity {
  constructor(G, spot, opt = {}) {
    super(G);
    this.kind = opt.kind || 'soldier';
    const v = opt.v ?? (spot.cx + spot.cz) % 3;
    this.group = this.add(new THREE.Group());
    const body = new THREE.Mesh(cached('war_' + this.kind + v, () => MD.warriorGeometry(this.kind, 11 + v * 7)), G.mats.terracotta);
    body.castShadow = true; body.receiveShadow = true;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyes = new THREE.Mesh(cached('eyes', MD.warriorEyes), this.eyeMat);
    this.group.add(body, eyes);
    this.scale = opt.scale || 1;
    this.group.scale.setScalar(this.scale);
    this.home = { x: spot.x, z: spot.z };
    this.pos = new THREE.Vector3(spot.x, 0, spot.z);
    this.yaw = opt.yaw ?? Math.PI / 2;
    this.ob = { x: spot.x, z: spot.z, r: 0.34 * this.scale };
    G.world.obstacles.push(this.ob);
    this.speed = opt.speed || 1.9; this.chaseSpeed = opt.chaseSpeed; this.lookSpeed = opt.lookSpeed || 0;
    this.id = 'statue' + Math.random();
    this.moving = false; this.stun = 0; this.wasSeen = true; this.movedUnseen = 0;
    this.awake = opt.awake ?? true; this.range = opt.range || 20; this.damage = opt.damage || 38;
    this.sync();
  }
  sync() { this.group.position.set(this.pos.x, 0, this.pos.z); this.group.rotation.y = this.yaw; this.ob.x = this.pos.x; this.ob.z = this.pos.z; }
  update(dt, t) {
    const G = this.G, P = G.player.pos;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    const seen = G.isObserved(this.pos, 1.5 * this.scale);
    // 眼睛：暗处里两点暗红
    const glow = this.awake ? (seen ? 0.35 : 1) : 0;
    this.eyeMat.color.setRGB(2.4 * glow, 0.25 * glow, 0.1 * glow);
    if (this.stun > 0) { this.stun -= dt; this.setMove(false); return; }
    if (!this.awake || dist > this.range) { this.setMove(false); return; }
    let sp = seen ? this.lookSpeed : this.speed;
    if (seen && this.movedUnseen > 1.2 && dist < 7) { G.addSanity(-6); G.audio.thud(this.pos, 0.3); }
    if (seen) this.movedUnseen = 0;
    if (sp <= 0) { this.setMove(false); this.wasSeen = true; return; }
    this.wasSeen = seen;
    // 寻路
    let tx = P.x, tz = P.z;
    if (!(dist < 6 && G.world.los(this.pos.x, this.pos.z, P.x, P.z))) {
      const [pcx, pcz] = G.world.cellOf(P.x, P.z);
      const step = G.world.nextStep(this.pos.x, this.pos.z, G.world.flow(pcx, pcz));
      if (step) { tx = step.x; tz = step.z; }
    }
    const mx = tx - this.pos.x, mz = tz - this.pos.z, ml = Math.hypot(mx, mz) || 1;
    const step = Math.min(sp * dt, ml);
    this.pos.x += mx / ml * step; this.pos.z += mz / ml * step;
    this.ob.off = true; G.world.collide(this.pos, 0.3 * this.scale); this.ob.off = false;
    this.yaw = Math.atan2(dx, dz);
    if (!seen) this.movedUnseen += dt;
    this.setMove(true);
    this.sync();
    if (dist < 0.95 * this.scale + 0.1) this.attack();
  }
  setMove(on) {
    if (on !== this.moving) { this.moving = on; }
    this.G.audio.grind(this.id, { x: this.pos.x, y: 1, z: this.pos.z }, on);
  }
  attack() {
    const G = this.G;
    G.hurt(this.damage, '陶俑', this.pos);
    G.scare('statue');
    // 退回原处，等你再一次背过身去
    const far = this.findHide();
    this.pos.x = far.x; this.pos.z = far.z; this.stun = 3.5; this.sync();
  }
  findHide() {
    const G = this.G, P = G.player.pos;
    for (let k = 0; k < 40; k++) {
      const c = G.world.randomFloor();
      if (c && Math.hypot(c.x - P.x, c.z - P.z) > 12 && !G.isObserved(new THREE.Vector3(c.x, 0, c.z), 1.5)) return c;
    }
    return this.home;
  }
  remove() { this.G.audio.grind(this.id, null, false); super.remove(); }
}

// ---------------- 鬼魂：殉葬的工匠 ----------------
export class Ghost extends Entity {
  constructor(G, spot) {
    super(G);
    this.mat = MD.ghostMaterial();
    this.group = this.add(new THREE.Group());
    this.group.add(new THREE.Mesh(cached('ghost', MD.ghostGeometry), this.mat));
    this.faceMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9, depthWrite: false });
    this.group.add(new THREE.Mesh(cached('ghostFace', MD.ghostFace), this.faceMat));
    this.pos = new THREE.Vector3(spot.x, 0, spot.z);
    this.state = 'wander'; this.target = null; this.lost = 0; this.alpha = 1; this.respawn = 0;
    this.id = 'ghost' + Math.random(); this.yaw = 0; this.wailT = 0;
  }
  pickWander() {
    const W = this.G.world;
    const [cx, cz] = W.cellOf(this.pos.x, this.pos.z);
    for (let k = 0; k < 30; k++) {
      const tx = cx + ((Math.random() * 13) | 0) - 6, tz = cz + ((Math.random() * 13) | 0) - 6;
      if (W.inside(tx, tz) && !W.isBlocked(tx, tz)) { this.target = [tx, tz]; this.tflow = this.bfs(tx, tz); return; }
    }
  }
  bfs(tx, tz) {
    const W = this.G.world, saved = W.flowCache, key = W.flowKey;
    W.flowCache = null; const d = W.flow(tx, tz); W.flowCache = saved; W.flowKey = key; return d;
  }
  update(dt, t) {
    const G = this.G, P = G.player.pos;
    this.mat.uniforms.uTime.value = t;
    if (this.respawn > 0) {
      this.respawn -= dt; this.mat.uniforms.uAlpha.value = 0; this.faceMat.opacity = 0;
      G.audio.loopVoice(this.id, this.pos, 0);
      if (this.respawn <= 0) {
        for (let k = 0; k < 40; k++) { const c = G.world.randomFloor(); if (c && Math.hypot(c.x - P.x, c.z - P.z) > 14) { this.pos.set(c.x, 0, c.z); break; } }
        this.state = 'wander'; this.target = null;
      }
      return;
    }
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    const los = dist < 14 && G.world.los(this.pos.x, this.pos.z, P.x, P.z);
    // 感知：灯光、奔跑的脚步、靠得太近
    const fl = G.flash;
    let lit = false;
    if (fl.on && los && dist < 12) {
      const fwd = G.camFwd; const ang = (fwd.x * -dx + fwd.z * -dz) / (Math.hypot(fwd.x, fwd.z) * dist + 1e-5);
      lit = ang > 0.82 || dist < 6.5;
    }
    const heard = G.player.running && G.player.speed > 0.5 && dist < 10;
    if (lit || heard || dist < 2.4) { if (this.state !== 'chase') { G.audio.wail(this.pos); G.addSanity(-4); } this.state = 'chase'; this.lost = 0; }
    else if (this.state === 'chase') { this.lost += dt; if (this.lost > 5) { this.state = 'wander'; this.target = null; } }
    let tx, tz, sp;
    if (this.state === 'chase') {
      sp = 2.75;
      if (los && dist < 6) { tx = P.x; tz = P.z; }
      else { const [pcx, pcz] = G.world.cellOf(P.x, P.z); const s = G.world.nextStep(this.pos.x, this.pos.z, G.world.flow(pcx, pcz)); if (s) { tx = s.x; tz = s.z; } }
      this.wailT -= dt; if (this.wailT < 0) { this.wailT = rand(3, 6); G.audio.whisper(this.pos, 0.6, 1.4); }
    } else {
      sp = 0.9;
      if (!this.target) this.pickWander();
      if (this.tflow) {
        const s = G.world.nextStep(this.pos.x, this.pos.z, this.tflow);
        if (s) { tx = s.x; tz = s.z; } else this.target = null;
        const [cx, cz] = G.world.cellOf(this.pos.x, this.pos.z);
        if (this.target && cx === this.target[0] && cz === this.target[1]) this.target = null;
      }
    }
    if (tx !== undefined) {
      const mx = tx - this.pos.x, mz = tz - this.pos.z, ml = Math.hypot(mx, mz) || 1;
      this.pos.x += mx / ml * Math.min(sp * dt, ml); this.pos.z += mz / ml * Math.min(sp * dt, ml);
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 4);
    }
    this.group.position.set(this.pos.x, 0.08 + Math.sin(t * 1.6) * 0.06, this.pos.z);
    this.group.rotation.y = this.state === 'chase' ? Math.atan2(dx, dz) : this.yaw;
    // 被手电照着时更清晰、更狰狞
    const a = (lit ? 1 : 0.65) * (0.75 + 0.25 * Math.sin(t * 7 + this.yaw));
    this.mat.uniforms.uAlpha.value = a; this.faceMat.opacity = 0.9 * a;
    this.mat.uniforms.uColor.value.setRGB(this.state === 'chase' ? 0.8 : 0.55, this.state === 'chase' ? 0.6 : 0.85, this.state === 'chase' ? 0.6 : 0.8);
    G.audio.loopVoice(this.id, { x: this.pos.x, y: 1.4, z: this.pos.z }, dist < 16 ? 0.5 : 0);
    if (dist < 6) { G.flickerFlash(0.5 * (1 - dist / 6)); G.addSanity(-dt * 5 * (1 - dist / 6)); }
    if (dist < 0.85) {
      G.hurt(28, '殉葬的工匠', this.pos); G.addSanity(-25); G.scare('ghost');
      this.respawn = 8;
    }
  }
  remove() { this.G.audio.loopVoice(this.id, this.pos, 0); super.remove(); }
}

// ---------------- 机弩 ----------------
export class Emitter extends Entity {
  constructor(G, spot, opt) {
    super(G);
    this.dir = { x: opt.dir[0], z: opt.dir[1] };
    this.cx = spot.cx; this.cz = spot.cz;
    this.face = new THREE.Vector3(spot.x + this.dir.x * (S / 2 - 0.05), 1.25, spot.z + this.dir.z * (S / 2 - 0.05));
    const m = this.add(new THREE.Mesh(cached('xbow', MD.crossbowGeometry), G.mats.bronzeVC));
    m.position.copy(this.face); m.rotation.y = Math.atan2(this.dir.x, this.dir.z); m.castShadow = true;
    this.period = opt.period || 0; this.t = (spot.cx * 0.37) % (this.period || 1); this.wound = false;
  }
  fire(target) {
    const G = this.G;
    let dx = this.dir.x, dz = this.dir.z;
    if (target) { dx = target.x - this.face.x; dz = target.z - this.face.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    const sx = this.face.x + dx * 0.35, sz = this.face.z + dz * 0.35;
    const max = G.world.rayDist(sx, sz, dx, dz, 40);
    G.spawn(new Arrow(G, new THREE.Vector3(sx, 1.25, sz), dx, dz, max));
    G.audio.twang(this.face);
  }
  update(dt) {
    if (!this.period) return;
    this.t += dt;
    const P = this.G.player.pos, near = Math.hypot(P.x - this.face.x, P.z - this.face.z) < 14;
    if (!this.wound && this.t > this.period - 0.55) { this.wound = true; if (near) this.G.audio.windup(this.face); }
    if (this.t >= this.period) { this.t -= this.period; this.wound = false; if (near) this.fire(); }
  }
}

export class Arrow extends Entity {
  constructor(G, pos, dx, dz, max) {
    super(G);
    this.mesh = this.add(new THREE.Mesh(cached('arrow', MD.arrowGeometry), G.mats.plain));
    this.mesh.position.copy(pos); this.mesh.rotation.y = Math.atan2(dx, dz);
    this.dx = dx; this.dz = dz; this.max = max; this.trav = 0; this.speed = 24; this.stuck = false;
  }
  update(dt) {
    if (this.stuck) return;
    const G = this.G, P = G.player.pos, p = this.mesh.position;
    const step = Math.min(this.speed * dt, this.max - this.trav);
    const ox = p.x, oz = p.z;
    p.x += this.dx * step; p.z += this.dz * step; this.trav += step;
    // 与玩家的线段距离
    const vx = p.x - ox, vz = p.z - oz, wx = P.x - ox, wz = P.z - oz;
    const tt = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1);
    const d = Math.hypot(wx - vx * tt, wz - vz * tt);
    if (d < 0.36 && !G.dead) { G.hurt(30, '机弩', p); G.audio.thud(p, 0.9); this.remove(); return; }
    if (this.trav >= this.max - 0.01) {
      this.stuck = true; p.x -= this.dx * 0.25; p.z -= this.dz * 0.25;
      G.audio.thud({ x: p.x, y: 1.2, z: p.z }, 0.5);
      G.stuckArrows.push(this);
      if (G.stuckArrows.length > 30) G.stuckArrows.shift().remove();
    }
  }
}

export class Plate extends Entity {
  constructor(G, spot) {
    super(G);
    this.cx = spot.cx; this.cz = spot.cz; this.spot = spot;
    const m = this.add(new THREE.Mesh(cached('plate', () => new THREE.BoxGeometry(1.7, 0.06, 1.7)), G.plateMat));
    m.position.set(spot.x, 0.02, spot.z); m.receiveShadow = true; this.mesh = m;
    this.armed = true; this.cool = 0; this.worldRef = G.world;
  }
  update(dt) {
    const G = this.G, [pcx, pcz] = G.world.cellOf(G.player.pos.x, G.player.pos.z);
    const on = pcx === this.cx && pcz === this.cz && Math.hypot(G.player.pos.x - this.spot.x, G.player.pos.z - this.spot.z) < 0.95;
    this.cool -= dt;
    this.mesh.position.y = lerp(this.mesh.position.y, on ? -0.01 : 0.02, dt * 10);
    if (on && this.armed && this.cool <= 0) {
      this.armed = false; this.cool = 1.6;
      G.audio.plateClick(this.spot);
      const target = { x: this.spot.x, z: this.spot.z };
      setTimeout(() => { if (G.world === this.worldRef) for (const e of G.emitters) if (e.cx === this.cx && !e.period) e.fire(target); }, 280);
    }
    if (!on) this.armed = true;
  }
}

// ---------------- 拉杆 ----------------
export class Lever extends Entity {
  constructor(G, spot, opt) {
    super(G);
    const ws = wallSide(G.world, spot);
    const x = spot.x + (ws ? ws.dx * 0.6 : 0), z = spot.z + (ws ? ws.dz * 0.6 : 0);
    const geo = cached('lever', MD.leverGeometry);
    const base = this.add(new THREE.Mesh(geo.base, G.mats.stone.clone()));
    base.material.vertexColors = true; base.position.set(x, 0, z); base.rotation.y = ws ? ws.yaw : 0; base.castShadow = true;
    this.pivot = new THREE.Group(); this.pivot.position.set(0, 0.95, 0); base.add(this.pivot);
    this.handle = new THREE.Mesh(geo.handle, G.mats.bronzeVC); this.pivot.add(this.handle); this.handle.castShadow = true;
    this.pivot.rotation.x = -0.7;
    this.pos = new THREE.Vector3(x, 1, z); this.target = opt.target; this.pulled = false; this.anim = 0;
    G.world.obstacles.push({ x, z, r: 0.35 });
    this.g = this.add(glint(G, 0xffd890, 0.4)); this.g.position.set(x, 1.6, z);
    G.interactables.push(this);
  }
  prompt() { return '扳动机括'; }
  use() {
    if (this.pulled) return;
    this.pulled = true; this.anim = 0.001;
    const G = this.G; G.audio.lever(this.pos);
    const i = G.interactables.indexOf(this); if (i >= 0) G.interactables.splice(i, 1);
    this.g.removeFromParent();
    setTimeout(() => G.onLever(this.target), 700);
  }
  update(dt) {
    if (this.anim > 0 && this.anim < 1) { this.anim = Math.min(1, this.anim + dt * 1.8); this.pivot.rotation.x = lerp(-0.7, 0.7, this.anim * this.anim); }
    if (this.g?.parent) this.g.material.opacity = 0.5 + 0.4 * Math.sin(performance.now() / 300);
  }
}

// ---------------- 门 ----------------
export class Door extends Entity {
  constructor(G, spot, opt) {
    super(G);
    this.opt = opt; this.spot = spot;
    const W = G.world, H = W.def.theme.height;
    const alongZ = W.isWall(spot.cx - 1, spot.cz) && W.isWall(spot.cx + 1, spot.cz);
    const mat = opt.hidden ? W.material(W.def.theme.wall) : opt.style === 'bronze' ? G.mats.bronzeOrnate.clone() : G.mats.stone.clone();
    if (!opt.hidden) mat.vertexColors = true;
    const geo = opt.hidden ? new THREE.BoxGeometry(S, H, S) : MD.doorGeometry(S, H);
    if (opt.hidden) { // 与墙同材质的整块
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * S / 2.4, uv.getY(i) * H / 2.4);
      const c = new Float32Array(geo.attributes.position.count * 3).fill(0.85); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.translate(0, H / 2, 0);
    }
    this.mesh = this.add(new THREE.Mesh(geo, mat));
    this.mesh.position.set(spot.x, 0, spot.z); this.mesh.rotation.y = alongZ ? 0 : Math.PI / 2;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    W.setBlock(spot.cx, spot.cz, 1, 1);
    this.pos = new THREE.Vector3(spot.x, 1.2, spot.z);
    this.open = false; this.anim = 0; this.H = H;
    if (!opt.hidden) G.interactables.push(this);
    this.range = 2.6;
  }
  prompt() { return this.ready() ? '打开' : '查看'; }
  ready() { return this.opt.needs.every(n => this.G.state.inv.has(n) || this.G.flags[n]); }
  use() {
    if (this.open) return;
    if (this.ready()) this.doOpen();
    else this.G.toast(this.opt.locked || '打不开');
  }
  doOpen() {
    if (this.open) return;
    this.open = true; this.anim = 0.0001;
    const G = this.G;
    G.audio.stoneDoor(this.pos, 3); G.shake(0.25);
    const i = G.interactables.indexOf(this); if (i >= 0) G.interactables.splice(i, 1);
    if (this.opt.needs.includes('tallyL')) G.toast('两半虎符严丝合缝，铜门沉入地下');
    if (this.opt.needs.includes('gear1')) G.toast('三枚铜件嵌回机括，中羡门轰然下沉');
  }
  update(dt) {
    if (this.anim > 0 && this.anim < 1) {
      this.anim = Math.min(1, this.anim + dt / 3);
      this.mesh.position.y = -this.anim * (this.H + 0.1);
      this.mesh.position.x = this.spot.x + Math.sin(this.anim * 80) * 0.01;
      if (this.anim > 0.55) this.G.world.setBlock(this.spot.cx, this.spot.cz, 0, 0);
    }
  }
}

// ---------------- 地宫：可升起的铜桥 ----------------
export class BridgeSeg extends Entity {
  constructor(G, spot) {
    super(G);
    this.spot = spot;
    const m = this.add(new THREE.Mesh(cached('bridge', () => {
      const g = new THREE.BoxGeometry(S * 0.96, 0.3, S); g.translate(0, -0.15, 0); return g;
    }), G.mats.bronzeOrnate));
    m.position.set(spot.x, -1.4, spot.z); m.castShadow = true; m.receiveShadow = true;
    this.mesh = m; this.anim = 0; this.up = false;
  }
  raise(instant) {
    if (this.up) return; this.up = true; this.anim = instant ? 1 : 0.0001;
    if (instant) { this.mesh.position.y = 0.02; this.G.world.setBlock(this.spot.cx, this.spot.cz, 0, 0); }
    else this.G.audio.stoneDoor(this.mesh.position, 2.5);
  }
  update(dt) {
    if (this.anim > 0 && this.anim < 1) {
      this.anim = Math.min(1, this.anim + dt / 2.5);
      this.mesh.position.y = lerp(-1.4, 0.02, 1 - Math.pow(1 - this.anim, 3));
      if (this.anim >= 1) this.G.world.setBlock(this.spot.cx, this.spot.cz, 0, 0);
    }
  }
}

// ---------------- 地宫：铜椁 ----------------
export class Coffin extends Entity {
  constructor(G, center, spot) {
    super(G);
    const geo = cached('coffin', MD.coffinGeometry);
    this.group = this.add(new THREE.Group()); this.group.position.set(center.x, 0, center.z);
    const steps = new THREE.Mesh(geo.steps, G.world.material('stone'));
    const body = new THREE.Mesh(geo.body, G.mats.bronzeOrnate.clone()); body.material.vertexColors = true;
    this.lid = new THREE.Mesh(geo.lid, body.material); this.lid.position.y = 2.5;
    this.group.add(steps, body, this.lid);
    this.group.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    this.inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.glow, color: 0x7fb8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.inner.position.set(0, 2.6, 0); this.inner.scale.set(4, 2, 1); this.group.add(this.inner);
    this.pos = new THREE.Vector3(spot.x, 1.5, spot.z - 0.6); this.range = 3.2;
    this.state = 0; this.t = 0; this.center = center;
    G.interactables.push(this);
    this.light = { pos: new THREE.Vector3(center.x, 3.2, center.z), color: 0x8fc0ff, power: 0, radius: 9, base: 0 };
    G.lamps.push(this.light);
  }
  prompt() { return '推开椁盖'; }
  use() {
    if (this.state) return;
    this.state = 1; this.t = 0;
    const G = this.G; G.cutscene = 4.2;
    G.audio.stoneDoor(this.pos, 3.5); G.shake(0.3);
    const i = G.interactables.indexOf(this); if (i >= 0) G.interactables.splice(i, 1);
  }
  openInstant() { this.state = 3; this.lid.position.set(1.9, 2.25, 0.4); this.lid.rotation.set(0.1, 0.35, 0.25); this.inner.material.opacity = 0.5; const i = this.G.interactables.indexOf(this); if (i >= 0) this.G.interactables.splice(i, 1); }
  update(dt) {
    if (this.state === 1) {
      this.t += dt;
      const k = Math.min(1, this.t / 3.5), e = k * k * (3 - 2 * k);
      this.lid.position.set(e * 1.9, 2.5 - e * 0.25, e * 0.4); this.lid.rotation.set(e * 0.1, e * 0.35, e * 0.25);
      this.inner.material.opacity = e * 0.7; this.light.base = e * 9; this.light.power = this.light.base;
      if (k >= 1) { this.state = 2; this.G.onCoffinOpened(); }
    } else if (this.state >= 2) { this.light.power = this.light.base * (0.8 + 0.2 * Math.sin(performance.now() / 120)); }
  }
}

// ---------------- 触发器 ----------------
export class Trigger extends Entity {
  constructor(G, spot, opt, fn) { super(G); this.spot = spot; this.r = opt.radius || 1.4; this.fn = fn; this.done = false; }
  update() {
    if (this.done) return;
    const P = this.G.player.pos;
    if (Math.hypot(P.x - this.spot.x, P.z - this.spot.z) < this.r) { this.done = true; this.fn(); }
  }
}

// 第一章尽头一闪而过的人影
export class Apparition extends Entity {
  constructor(G, spot) {
    super(G);
    this.mat = MD.ghostMaterial(); this.mat.uniforms.uColor.value.setRGB(0.35, 0.38, 0.4);
    this.group = this.add(new THREE.Group());
    this.group.add(new THREE.Mesh(cached('ghost', MD.ghostGeometry), this.mat));
    this.group.add(new THREE.Mesh(cached('ghostFace', MD.ghostFace), new THREE.MeshBasicMaterial({ color: 0 })));
    this.group.position.set(spot.x, 0, spot.z); this.group.visible = false;
    this.pos = new THREE.Vector3(spot.x, 0, spot.z); this.phase = 0; this.seenT = 0;
  }
  update(dt, t) {
    const G = this.G, P = G.player.pos;
    this.mat.uniforms.uTime.value = t;
    const d = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    if (this.phase === 0 && d < 10 && G.world.los(P.x, P.z, this.pos.x, this.pos.z)) { this.phase = 1; this.group.visible = true; }
    if (this.phase === 1) {
      this.group.rotation.y = Math.atan2(P.x - this.pos.x, P.z - this.pos.z);
      if (G.isObserved(this.pos, 1.5)) this.seenT += dt;
      if (this.seenT > 0.7 || d < 4) {
        this.phase = 2; G.flickerFlash(1); G.audio.stinger(0.5); G.addSanity(-12); G.shake(0.15);
        setTimeout(() => { this.group.visible = false; }, 140);
        G.subtitle('……那是什么？');
      }
    }
  }
}

// 墙上的抓痕与刻字
const SCRATCH = [['放我出去'], ['母', '归'], ['十一'], ['门下矣'], ['饥'], ['勿应'], ['正'], ['火灭'], ['吾名']];
export function scratch(G, spot, i) {
  const ws = wallSide(G.world, spot); if (!ws) return;
  const lines = SCRATCH[i % SCRATCH.length];
  const tex = cached('scr' + i, () => scratchTexture(lines, i + 3));
  const m = new THREE.Mesh(cached('scrPlane', () => new THREE.PlaneGeometry(1.6, 0.8)), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(spot.x + ws.dx * (S / 2 - 0.02), 1.35 + rand(-0.2, 0.2), spot.z + ws.dz * (S / 2 - 0.02));
  m.rotation.y = ws.yaw;
  m.receiveShadow = true;
  G.addStatic(m);
}

// ---------------- 守陵将军（终章追逐） ----------------
export class Guardian extends Statue {
  constructor(G, spot) {
    super(G, spot, { kind: 'general', scale: 1.45, speed: 3.25, lookSpeed: 1.05, range: 200, damage: 75, v: 0 });
    this.eyeBoost = 1;
  }
  update(dt, t) {
    super.update(dt, t);
    this.eyeMat.color.setRGB(3.5, 0.4, 0.15);
  }
  attack() {
    const G = this.G;
    G.hurt(this.damage, '守陵的将军', this.pos); G.scare('statue');
    this.stun = 2.2;
    const dx = G.player.pos.x - this.pos.x, dz = G.player.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    G.player.vel.x += dx / l * 7; G.player.vel.z += dz / l * 7;
  }
}
