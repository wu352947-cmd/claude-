import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// real-world lengths (m) used to normalise third-person weapon models
export const WORLD_LEN = { ak47: 0.88, m4a4: 0.86, awp: 1.18, ump45: 0.69, nova: 1.0, xm1014: 1.0, glock: 0.19, usp: 0.2, deagle: 0.27, r8: 0.3, knife: 0.3, he: 0.12, flash: 0.12, smoke: 0.12, c4: 0.3 };

const TEAM_TINT = { T: new THREE.Color(0xd8b98a), CT: new THREE.Color(0x8fa7c8) };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

// normalised weapon world-model cache
const gunCache = {};
export function weaponWorldModel(assets, id) {
  if (!gunCache[id]) {
    const src = assets.models['w_' + id];
    const g = new THREE.Group();
    if (src) {
      const o = src.scene.clone(true);
      o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.vertexColors = true; m.material.roughness = 0.5; m.material.metalness = 0.3; m.castShadow = true; } });
      const bb = new THREE.Box3().setFromObject(o); const sz = bb.getSize(_v);
      const len = id === 'knife' ? Math.max(sz.x, sz.y, sz.z) : sz.z;
      const s = (WORLD_LEN[id] || 0.5) / len; o.scale.setScalar(s);
      const bb2 = new THREE.Box3().setFromObject(o);
      // origin at rear-top of the gun (stock end / pistol grip top) so it can be shouldered
      o.position.set(-(bb2.min.x + bb2.max.x) / 2, -bb2.max.y + (bb2.max.y - bb2.min.y) * 0.18, -bb2.max.z);
      g.add(o);
      g.userData.len = bb2.max.z - bb2.min.z; g.userData.h = bb2.max.y - bb2.min.y;
    }
    gunCache[id] = g;
  }
  const c = gunCache[id].clone(true); c.userData = { ...gunCache[id].userData }; return c;
}

export class CharacterModel {
  constructor(assets, team, scene) {
    const src = assets.models.soldier;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(src.scene);
    this.model.rotation.y = Math.PI / 2; // soldier natively faces +X; turn it to face -Z (our forward)
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of src.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const k of ['Idle', 'Walk', 'Run']) { const a = this.actions[k]; a.play(); a.setEffectiveWeight(k === 'Idle' ? 1 : 0); }
    this.bones = {};
    this.model.traverse(o => {
      if (o.isBone) this.bones[o.name.replace('mixamorig', '').replace(':', '')] = o;
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (!/visor/i.test(o.name)) o.material.color.copy(TEAM_TINT[team] || TEAM_TINT.T);
        else o.material.color.set(team === 'CT' ? 0x223355 : 0x442211);
      }
    });
    this.team = team;
    this.gun = null; this.gunId = null;
    this.weights = { Idle: 1, Walk: 0, Run: 0 };
    this.dead = false; this.deathT = 0; this.crouch = 0;
    // blob shadow
    scene.add(this.root);
    this.upperLen = this.lowerLen = 0;
  }

  setWeapon(assets, id) {
    if (this.gunId === id) return;
    if (this.gun) this.root.remove(this.gun);
    this.gunId = id;
    this.gun = id ? weaponWorldModel(assets, id) : null;
    if (this.gun) this.root.add(this.gun);
  }

  // speed m/s, yaw rad, pitch rad (+ up), crouch 0..1
  update(dt, pos, yaw, pitch, speed, crouch, firing, reloading) {
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    if (this.dead) { this.updateDeath(dt); this.mixer.update(dt); return; }
    // blend locomotion
    const w = this.weights;
    const tRun = speed > 4.2 ? 1 : 0, tWalk = speed > 0.4 && speed <= 4.2 ? 1 : 0, tIdle = 1 - tRun - tWalk;
    const k = 1 - Math.exp(-dt * 10);
    w.Idle += (tIdle - w.Idle) * k; w.Walk += (tWalk - w.Walk) * k; w.Run += (tRun - w.Run) * k;
    this.actions.Idle.setEffectiveWeight(w.Idle); this.actions.Walk.setEffectiveWeight(w.Walk); this.actions.Run.setEffectiveWeight(w.Run);
    this.actions.Walk.timeScale = Math.max(0.6, speed / 1.6); this.actions.Run.timeScale = Math.max(0.7, speed / 5.5);
    this.mixer.update(dt);
    this.crouch = crouch;
    this.pose(pitch, crouch, firing, reloading);
  }

  pose(pitch, crouch, firing, reloading) {
    const B = this.bones; if (!B.Hips) return;
    // crouch: lower hips and fold legs
    if (crouch > 0.01) {
      B.Hips.position.z -= 38 * crouch;           // cm in armature space (z is up)
      for (const s of ['Left', 'Right']) {
        const up = B[s + 'UpLeg'], lo = B[s + 'Leg'], ft = B[s + 'Foot'];
        if (up) up.rotateX(-1.25 * crouch);
        if (lo) lo.rotateX(1.95 * crouch);
        if (ft) ft.rotateX(-0.6 * crouch);
      }
    }
    // torso twist toward aim and pitch
    const sp = B.Spine1 || B.Spine, sp2 = B.Spine2;
    if (sp) { sp.rotation.x = 0; sp.rotation.y = 0; sp.rotation.z = 0; sp.rotateX(-pitch * 0.45); }
    if (sp2) { sp2.rotation.set(0, 0, 0); sp2.rotateX(-pitch * 0.45); }
    if (B.Spine) B.Spine.rotation.set(0.05 + crouch * 0.25, 0, 0);
    if (B.Neck) B.Neck.rotation.set(0, 0, 0);
    if (B.Head) B.Head.rotation.set(-pitch * 0.15, 0, 0);
    this.model.updateMatrixWorld(true);

    // weapon placement: shouldered in front of the right shoulder, pointing along aim
    if (!this.gun) return;
    const sh = B.RightArm.getWorldPosition(_v);
    const chest = (B.Spine2 || B.Spine1).getWorldPosition(_v2);
    const yaw = this.root.rotation.y;
    const fwd = _v3.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const isPistol = (this.gun.userData.len || 0.5) < 0.35;
    const g = this.gun;
    if (isPistol) {
      // arms extended, pistol held at eye line
      g.position.copy(chest).addScaledVector(fwd, 0.5);
      g.position.y += 0.18;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw); g.position.x += rx * 0.02; g.position.z += rz * 0.02;
    } else {
      g.position.copy(sh).addScaledVector(fwd, -0.05);
      g.position.y -= 0.03;
      const rx = Math.cos(yaw) * -0.07, rz = -Math.sin(yaw) * -0.07; g.position.x += rx; g.position.z += rz;
    }
    if (reloading) { g.position.y -= 0.12; }
    // orient: gun -Z along fwd
    _m.lookAt(_v2.set(0, 0, 0), fwd, Y);
    g.quaternion.setFromRotationMatrix(_m);
    if (reloading) g.rotateZ(0.6);
    this.root.updateMatrixWorld(true);
    // convert gun world transform into root-local (gun is child of root)
    const inv = _m.copy(this.root.matrixWorld).invert();
    g.position.applyMatrix4(inv);
    g.quaternion.premultiply(_q.setFromRotationMatrix(inv));
    g.updateMatrixWorld(true);

    // two-bone IK: right hand to grip, left hand to fore-grip
    const len = g.userData.len || 0.8;
    const grip = _gp.set(0, -0.06, isPistol ? -0.04 : -len * 0.27).applyMatrix4(g.matrixWorld);
    const fore = _fp.set(0, -0.03, isPistol ? -0.02 : -Math.min(0.42, len * 0.5)).applyMatrix4(g.matrixWorld);
    const pole = _pp.copy(sh).add(_tmp.set(Math.cos(yaw) * 0.4, -0.6, -Math.sin(yaw) * 0.4));
    this.ik(B.RightArm, B.RightForeArm, B.RightHand, grip, pole);
    const shL = B.LeftArm.getWorldPosition(_tmp2);
    const poleL = _pp.copy(shL).add(_tmp.set(-Math.cos(yaw) * 0.5, -0.6, Math.sin(yaw) * 0.5));
    this.ik(B.LeftArm, B.LeftForeArm, B.LeftHand, isPistol ? grip.clone().addScaledVector(fwd, -0.02) : fore, poleL);
  }

  ik(upper, lower, hand, target, pole) {
    if (!upper || !lower || !hand) return;
    const a = upper.getWorldPosition(_a), b = lower.getWorldPosition(_b), c = hand.getWorldPosition(_c);
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const d = Math.min(a.distanceTo(target), (l1 + l2) * 0.999);
    const dir = _d.copy(target).sub(a).normalize();
    // elbow position via law of cosines
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const pv = _e.copy(pole).sub(a); pv.addScaledVector(dir, -pv.dot(dir)).normalize();
    const elbow = _f.copy(a).addScaledVector(dir, Math.cos(ang) * l1).addScaledVector(pv, Math.sin(ang) * l1);
    this.pointBone(upper, elbow);
    upper.updateMatrixWorld(true);
    this.pointBone(lower, _g.copy(a).addScaledVector(dir, d));
  }

  // rotate bone so its +Y axis (towards child) points at world target
  pointBone(bone, target) {
    bone.updateMatrixWorld(true);
    const p = bone.getWorldPosition(_h);
    const want = _i.copy(target).sub(p).normalize();
    const wq = bone.getWorldQuaternion(_q);
    const cur = _j.copy(Y).applyQuaternion(wq);
    const delta = _q2.setFromUnitVectors(cur, want);
    const newW = delta.multiply(wq);
    const parentW = bone.parent.getWorldQuaternion(_k);
    bone.quaternion.copy(parentW.invert().multiply(newW));
    bone.updateMatrixWorld(true);
  }

  die(dirX, dirZ, headshot) {
    this.dead = true; this.deathT = 0;
    this.deathDir = Math.atan2(dirX, dirZ) - this.root.rotation.y;
    this.deathSide = Math.random() < 0.5 ? -1 : 1; this.deathHead = headshot;
    for (const k in this.actions) this.actions[k].timeScale = 0.3;
    if (this.gun) { this.dropGun = this.gun; }
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.65); const e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
    const B = this.bones;
    // fall backwards relative to hit direction with knees buckling
    this.model.rotation.x = -e * 1.45 * Math.cos(this.deathDir);
    this.model.rotation.z = e * 1.45 * Math.sin(this.deathDir) * 0.6 + e * 0.2 * this.deathSide;
    this.model.position.y = -e * 0.0;
    if (B.Hips) B.Hips.position.z -= 20 * e;
    if (B.LeftUpLeg) B.LeftUpLeg.rotateX(-0.6 * e);
    if (B.RightUpLeg) B.RightUpLeg.rotateX(-0.3 * e);
    if (B.LeftLeg) B.LeftLeg.rotateX(0.9 * e);
    if (B.RightArm) B.RightArm.rotateZ(0.8 * e);
    if (B.LeftArm) B.LeftArm.rotateZ(-0.8 * e);
    if (this.gun) { this.gun.position.y = Math.max(-0.9 * e, this.gun.position.y - dt * 3); this.gun.rotation.z += dt * 3 * (1 - e); }
  }

  reset() {
    this.dead = false; this.model.rotation.set(0, Math.PI / 2, 0); this.model.position.set(0, 0, 0);
    for (const k in this.actions) this.actions[k].timeScale = 1;
  }

  dispose(scene) { scene.remove(this.root); }
}
const _gp = new THREE.Vector3(), _fp = new THREE.Vector3(), _pp = new THREE.Vector3(), _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3(), _i = new THREE.Vector3(), _j = new THREE.Vector3(), _k = new THREE.Quaternion();
