import * as THREE from 'three';
import { applySkin, SKIN_BY_ID } from './skins.js';

// per-category placement (vm models share the "arms rig" coordinate frame: gun points -Z, eye ~origin)
const PLACE = {
  rifle: { p: [0.07, -0.03, 0.06], s: 1, r: [0, 0, 0] },
  sniper: { p: [0.12, -0.05, 0.12], s: 1, r: [0, 0, 0] },
  smg: { p: [0.11, -0.05, 0.13], s: 1, r: [0, 0, 0] },
  shotgun: { p: [0.07, -0.03, 0.06], s: 1, r: [0, 0, 0] },
  pistol: { p: [-0.12, 0.08, 0.1], s: 1, r: [0, 0, 0] },
  knife: { p: [0.06, -0.02, 0.04], s: 1, r: [-0.3, 0.12, 0.18] },
  grenade: { p: [0.1, 0.0, 0.1], s: 1, r: [-0.3, 0.1, 0.2] },
  c4: { p: [0.0, 0.05, 0.1], s: 1, r: [-0.3, 0.1, 0.2] },
};
export { PLACE };

export class ViewModel {
  constructor(assets, renderer) {
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 20);
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b5a45, 1.6); this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4); this.sun.position.set(-1.5, 3, 1.2); this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0xa8c4ff, 0.5); fill.position.set(2, 0.5, -1); this.scene.add(fill);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2); this.scene.add(this.flashLight);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.holder = new THREE.Group(); this.root.add(this.holder);
    this.models = {}; this.cur = null; this.curId = null;
    // muzzle flash sprites
    const fm = (tex, c) => new THREE.SpriteMaterial({ map: tex, color: c, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    this.flash1 = new THREE.Sprite(fm(assets.fx.muzzle_01, 0xffd59a)); this.flash2 = new THREE.Sprite(fm(assets.fx.muzzle_05, 0xffb060));
    this.flash1.visible = this.flash2.visible = false; this.flash1.renderOrder = this.flash2.renderOrder = 5;
    this.flashT = 0;
    // animation state
    this.t = 0; this.kick = 0; this.kickV = 0; this.rollK = 0; this.swayX = 0; this.swayY = 0; this.lastYaw = 0; this.lastPitch = 0;
    this.deployT = 1; this.deployDur = 1; this.reloadT = -1; this.reloadDur = 1; this.inspectT = -1; this.slashT = -1; this.slashHeavy = false;
    this.bobAmt = 0; this.landDip = 0; this.throwT = -1;
    this.team = 'T';
  }

  build(id, skinId, team) {
    const key = id + '|' + (skinId || '') + '|' + team;
    if (this.models[key]) return this.models[key];
    let src = this.assets.models['vm_' + (id === 'grenade' || id === 'c4' ? 'knife' : id)];
    if (!src) return null;
    const g = src.scene.clone(true);
    const skin = skinId ? { ...SKIN_BY_ID[skinId.split('#')[0]], wear: +(skinId.split('#')[1] || 0) } : null;
    applySkin(g, skin, this.assets, team);
    g.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material.envMap = this.envMap || null; } });
    const wrap = new THREE.Group(); wrap.add(g);
    // measure gun (excluding arms) to find muzzle
    const bb = new THREE.Box3();
    g.traverse(o => { if (o.isMesh && !o.name.startsWith('arms')) bb.expandByObject(o); });
    if (id === 'grenade' || id === 'c4') {
      g.traverse(o => { if (o.isMesh && !o.name.startsWith('arms')) o.visible = false; });
      const item = id === 'grenade' ? makeGrenade() : makeC4();
      // place in the right hand (where the knife handle was)
      const c = bb.getCenter(new THREE.Vector3());
      item.position.set(c.x, bb.min.y + 0.18, bb.max.z - 0.15); item.scale.setScalar(id === 'c4' ? 2.2 : 2.6);
      g.add(item);
    }
    const muzzle = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y - (bb.max.y - bb.min.y) * 0.18, bb.min.z);
    let mag = null; g.traverse(o => { if (o.name === 'mag') mag = o; });
    const m = { group: wrap, inner: g, muzzle, mag, magY: mag ? mag.position.y : 0, len: bb.max.z - bb.min.z };
    this.models[key] = m;
    return m;
  }

  setEnv(env) { this.envMap = env; this.scene.environment = env; }

  equip(def, skinId, team, deployDur) {
    const id = def.id === 'he' || def.id === 'flash' || def.id === 'smoke' ? 'grenade' : def.id;
    const m = this.build(id, skinId, team); if (!m) return;
    if (this.cur) this.holder.remove(this.cur.group);
    this.cur = m; this.curId = id; this.curType = def.type === 'grenade' ? 'grenade' : def.type;
    this.holder.add(m.group);
    const P = PLACE[this.curType] || PLACE.rifle;
    m.group.position.set(...P.p); m.group.scale.setScalar(P.s);
    m.inner.add(this.flash1); m.inner.add(this.flash2);
    this.flash1.position.copy(m.muzzle).add(new THREE.Vector3(0, 0, -0.15)); this.flash2.position.copy(m.muzzle).add(new THREE.Vector3(0, 0, -0.45));
    this.deployT = 0; this.deployDur = deployDur || 0.8; this.reloadT = -1; this.inspectT = -1; this.slashT = -1;
  }

  shoot(def) {
    const p = def.punch || 1;
    this.kickV += 3.2 * Math.min(2, p) + 1.5; this.rollK += (Math.random() - 0.5) * 0.06;
    if (this.curType !== 'knife') {
      this.flashT = 0.045;
      this.flash1.material.rotation = Math.random() * 6.28; this.flash2.material.rotation = Math.random() * 6.28;
      const big = def.type === 'sniper' || def.type === 'shotgun' ? 1.6 : def.type === 'pistol' ? 0.9 : 1.15;
      this.flash1.scale.setScalar(0.9 * big); this.flash2.scale.setScalar(1.3 * big);
      this.flashLight.intensity = 3; this.flashLight.position.set(0.25, -0.15, -0.8);
    }
    this.inspectT = -1;
  }

  startReload(dur) { this.reloadT = 0; this.reloadDur = dur; this.inspectT = -1; }
  slash(heavy) { this.slashT = 0; this.slashHeavy = heavy; }
  inspect() { if (this.reloadT < 0 && this.deployT >= this.deployDur) this.inspectT = 0; }
  throwAnim() { this.throwT = 0; }
  land(v) { this.landDip = Math.min(0.12, v * 0.012); }

  // world-space muzzle position for third-person-ish effects (tracers start)
  muzzleWorld(camera, out) {
    if (!this.cur) return out.set(0, 0, 0);
    this.cur.inner.updateMatrixWorld(true);
    out.copy(this.cur.muzzle).applyMatrix4(this.cur.inner.matrixWorld); // in vm camera space
    // vm camera sits at origin looking -Z with no rotation -> map to world camera
    out.applyMatrix4(camera.matrixWorld);
    return out;
  }

  update(dt, agent, camera, aspect, scoped) {
    this.t += dt;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    const m = this.cur; if (!m) return;
    this.root.visible = !scoped;
    // sway from look movement
    let dyaw = agent.yaw - this.lastYaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = agent.pitch - this.lastPitch; this.lastYaw = agent.yaw; this.lastPitch = agent.pitch;
    this.swayX += (Math.max(-0.08, Math.min(0.08, dyaw * 0.6)) - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (Math.max(-0.08, Math.min(0.08, dpitch * 0.6)) - this.swayY) * Math.min(1, dt * 10);
    // bob
    const sp = agent.speed2D(); const moving = agent.onGround ? Math.min(1, sp / 5) : 0;
    this.bobAmt += (moving - this.bobAmt) * Math.min(1, dt * 8);
    const bt = this.t * (6 + sp * 1.2);
    const bobX = Math.sin(bt * 0.5) * 0.018 * this.bobAmt, bobY = -Math.abs(Math.cos(bt * 0.5)) * 0.014 * this.bobAmt;
    const breathe = Math.sin(this.t * 1.6) * 0.003;
    // recoil spring
    this.kickV += (-this.kick * 220 - this.kickV * 20) * dt; this.kick += this.kickV * dt * 0.05;
    this.rollK *= Math.exp(-dt * 8);
    this.landDip *= Math.exp(-dt * 8);
    const P = PLACE[this.curType] || PLACE.rifle;
    let px = P.p[0] + bobX - this.swayX * 0.5, py = P.p[1] + bobY + breathe - this.landDip + this.swayY * 0.3, pz = P.p[2] + this.kick * 0.9;
    let rx = (P.r ? P.r[0] : 0) + this.kick * 1.4 - this.swayY * 0.4, ry = (P.r ? P.r[1] : 0) + this.swayX * 0.8, rz = (P.r ? P.r[2] : 0) + this.rollK + bobX * 0.6;
    if (agent.crouchT > 0.5) { px += 0.02; py += 0.01; }
    // deploy
    if (this.deployT < this.deployDur) {
      this.deployT += dt; const k = Math.min(1, this.deployT / this.deployDur); const e = 1 - Math.pow(1 - k, 3);
      py -= (1 - e) * 0.45; rx -= (1 - e) * 0.9; rz += (1 - e) * 0.4;
    }
    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt; const k = this.reloadT / this.reloadDur;
      if (k >= 1) this.reloadT = -1;
      else {
        const dip = Math.sin(Math.min(1, k) * Math.PI);
        if (this.curType === 'shotgun') { rz += 0.25 * dip; py -= 0.06 * dip; rx += 0.15 * dip; }
        else { py -= 0.16 * dip; rz += 0.6 * dip; rx += 0.25 * dip; px -= 0.05 * dip; }
        if (m.mag) { const md = k < 0.35 ? k / 0.35 : k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35; m.mag.position.y = m.magY - md * 1.4; m.mag.visible = !(k > 0.3 && k < 0.5); }
      }
    } else if (m.mag) { m.mag.position.y = m.magY; m.mag.visible = true; }
    // inspect (CS-style weapon look)
    if (this.inspectT >= 0) {
      this.inspectT += dt; const k = this.inspectT / 3.2;
      if (k >= 1) this.inspectT = -1;
      else {
        const a = Math.sin(Math.min(1, k * 1.2) * Math.PI) ;
        const b = k > 0.45 ? Math.sin((k - 0.45) / 0.55 * Math.PI) : 0;
        ry += 0.9 * a - 0.5 * b; rz += 0.7 * a + 0.4 * b; px += 0.08 * a; py += 0.05 * a; rx += 0.2 * b;
      }
    }
    // knife slash
    if (this.slashT >= 0) {
      this.slashT += dt; const dur = this.slashHeavy ? 0.55 : 0.32; const k = this.slashT / dur;
      if (k >= 1) this.slashT = -1;
      else { const s = Math.sin(k * Math.PI); if (this.slashHeavy) { rx -= 1.2 * s; pz -= 0.15 * s; } else { ry += 1.0 * s; rz -= 0.8 * s; px += 0.1 * s; } }
    }
    if (this.throwT >= 0) {
      this.throwT += dt; const k = this.throwT / 0.5;
      if (k >= 1) this.throwT = -1; else { const s = Math.sin(k * Math.PI); rx -= 1.4 * s; py += 0.1 * s; pz -= 0.2 * s; }
    }
    m.group.position.set(px, py, pz);
    m.group.rotation.set(rx, ry, rz);
    // flash
    if (this.flashT > 0) { this.flashT -= dt; this.flash1.visible = this.flash2.visible = true; this.flashLight.intensity *= 0.6; }
    else { this.flash1.visible = this.flash2.visible = false; this.flashLight.intensity = 0; }
  }
}

function makeGrenade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.6, metalness: 0.3 }));
  body.scale.y = 1.15; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0x8a8a80, metalness: 0.9, roughness: 0.3 }));
  top.position.y = 0.045; g.add(top);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.012), top.material); lever.position.set(0.016, 0.03, 0); lever.rotation.z = -0.3; g.add(lever);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 16), top.material); ring.position.set(-0.012, 0.062, 0); g.add(ring);
  return g;
}
function makeC4() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.07), new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.8 }));
  g.add(body);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.045), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
  pad.position.y = 0.023; g.add(pad);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
  led.position.set(0.04, 0.025, 0); g.add(led);
  return g;
}
export { makeGrenade, makeC4 };
