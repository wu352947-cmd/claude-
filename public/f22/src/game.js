import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*@MODEL@*/
/*@AIRCRAFT@*/
/*@TERRAIN@*/
/*@WORLD@*/

/* =========================================================
   猛禽制空: dogfight game built on the procedural F-22A.
   World: metres, y up. Aircraft local frame: +x nose, +y up, +z right.
   Every aircraft (player, wingman, enemies) flies the same flight model;
   the AI pilot drives that model through the same stick, throttle and weapons.
   ========================================================= */
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const X_AXIS = new V3(1, 0, 0), Y_AXIS = new V3(0, 1, 0), Z_AXIS = new V3(0, 0, 1), ZERO = new V3();
const _qA = new Q();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const groundAt = (x, z) => Math.max(terrainH(x, z), 0);

const store = {
  get(k, d) { try { const v = localStorage.getItem('raptor.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('raptor.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const settings = {
  invert: store.get('invert', false),
  quality: store.get('quality', isTouch ? 'low' : 'high'),
  sound: store.get('sound', true),
  time: store.get('time', 'dusk'),
  wingman: store.get('wingman', true)
};
let best = store.get('best', 0);
const HQ = () => settings.quality === 'high';

/* ---------- renderer & world ---------- */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 1.5, 42000);
scene.add(camera);
const world = createWorld({ scene, renderer, hq: HQ(), time: settings.time });
const { fogColor, FOG_D, SUN, sunLight, sams, base } = world;

/* ---------- particles ---------- */
class Particles {
  constructor(max, additive, map) {
    this.max = max; this.n = 0; this.additive = additive;
    this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 4); this.s = new Float32Array(max);
    this.v = new Float32Array(max * 3); this.base = new Float32Array(max * 4);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.sa = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa); g.setAttribute('aColor', this.ca); g.setAttribute('aSize', this.sa);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: { value: 600 }, uFogColor: { value: fogColor }, uFogDensity: { value: FOG_D } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC; varying float vDist;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z;
          gl_Position = projectionMatrix * mv; gl_PointSize = min(aSize * uScale / max(vDist, 1.0), 900.0); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uFogColor; uniform float uFogDensity; varying vec4 vC; varying float vDist;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          float f = 1.0 - exp(-pow(uFogDensity * vDist, 2.0));
          ${additive ? 'gl_FragColor = vec4(vC.rgb * t.a * vC.a * (1.0 - f), 1.0);'
                     : 'gl_FragColor = vec4(mix(vC.rgb, uFogColor, f), t.a * vC.a);'}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 0, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, k = i * 3, c = i * 4;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.base[c] = r; this.base[c + 1] = g; this.base[c + 2] = b; this.base[c + 3] = a;
    this.life[i] = this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.drag[i] = drag; this.grav[i] = grav;
    this.s[i] = s0;
  }
  move(from, to) {
    for (let j = 0; j < 3; j++) { this.p[to * 3 + j] = this.p[from * 3 + j]; this.v[to * 3 + j] = this.v[from * 3 + j]; }
    for (let j = 0; j < 4; j++) { this.base[to * 4 + j] = this.base[from * 4 + j]; this.c[to * 4 + j] = this.c[from * 4 + j]; }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from]; this.s[to] = this.s[from];
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.move(--this.n, i); continue; }
      const k = i * 3, c = i * 4, d = Math.exp(-this.drag[i] * dt);
      this.v[k] *= d; this.v[k + 1] = this.v[k + 1] * d - this.grav[i] * dt; this.v[k + 2] *= d;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.s[i] = lerp(this.s0[i], this.s1[i], 1 - (1 - t) * (1 - t));
      this.c[c] = this.base[c];
      if (this.additive) {
        this.c[c + 1] = this.base[c + 1] * (1 - 0.55 * t); this.c[c + 2] = this.base[c + 2] * (1 - 0.85 * t);
        this.c[c + 3] = this.base[c + 3] * Math.pow(1 - t, 1.4);
      } else {
        this.c[c + 1] = this.base[c + 1]; this.c[c + 2] = this.base[c + 2];
        this.c[c + 3] = this.base[c + 3] * Math.min(1, t * 10) * (1 - t);
      }
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.pa.needsUpdate = true; this.ca.needsUpdate = true; this.sa.needsUpdate = true;
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}
const fire = new Particles(3200, true, world.glowTex);
const smoke = new Particles(2800, false, world.smokeTex);

/* ---------- tracers ---------- */
const MAX_BULLETS = 460;
const tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  MAX_BULLETS);
tracerMesh.frustumCulled = false;
tracerMesh.renderOrder = 5;
for (let i = 0; i < MAX_BULLETS; i++) tracerMesh.setColorAt(i, new THREE.Color(1, 1, 1));
scene.add(tracerMesh);
const COL_BLUE_TRACER = new THREE.Color(1.6, 1.1, 0.45), COL_RED_TRACER = new THREE.Color(1.7, 0.45, 0.35);

/* ---------- aircraft data ---------- */
// pitch/roll in rad/s at full stick, thrust and drag tuned so mil power cruises ~300 m/s and afterburner ~400 m/s
const TYPES = {
  raptor:  { name: 'F-22A', hp: 100, radius: 7.5, pitch: 0.9, roll: 2.8, mil: 64, ab: 116, drag: 6.9e-4, tvc: true, stealth: 1, srm: 2, mrm: 6, ammo: 480, cm: 30, srmType: 'aim9', mrmType: 'aim120', radar: true },
  flanker: { name: '侧卫型', hp: 150, radius: 9, pitch: 0.84, roll: 2.3, mil: 58, ab: 108, drag: 7.1e-4, tvc: false, stealth: 1, srm: 2, mrm: 2, ammo: 150, cm: 6, srmType: 'r73', mrmType: 'r27', score: 160, radar: true, rwr: '27' },
  fulcrum: { name: '支点型', hp: 100, radius: 7.5, pitch: 0.9, roll: 2.6, mil: 56, ab: 104, drag: 7.3e-4, tvc: false, stealth: 1, srm: 2, mrm: 0, ammo: 150, cm: 6, srmType: 'r73', score: 120, radar: true, rwr: '29' },
  ucav:    { name: '幽灵无人机', hp: 55, radius: 6.5, pitch: 0.96, roll: 3.0, mil: 72, ab: 72, drag: 6.6e-4, tvc: false, stealth: 2.2, srm: 0, mrm: 0, ammo: 120, cm: 0, score: 100, radar: false },
  bomber:  { name: '重型轰炸机', hp: 700, radius: 18, pitch: 0.24, roll: 0.55, mil: 30, ab: 60, drag: 4.6e-4, tvc: false, stealth: 0.8, srm: 0, mrm: 0, ammo: 0, cm: 14, score: 600, radar: false }
};
// seeker: ir (decoyed by flares) or radar (decoyed by chaff, beaming and terrain masking)
const MSL = {
  aim9:   { name: 'AIM-9X', call: 'FOX 2', seeker: 'ir', vmax: 980, accel: 560, burn: 3.6, turn: 2.6, fuse: 20, range: 4500, fov: 1.05, lockT: 0.45, dmg: 230, life: 9, geo: 'aim9', hold: 2.6 },
  aim120: { name: 'AIM-120D', call: 'FOX 3', seeker: 'radar', vmax: 1250, accel: 420, burn: 7, turn: 1.45, fuse: 26, range: 15000, fov: 0.6, lockT: 1.0, dmg: 230, life: 24, geo: 'amraam', hold: 2.6 },
  r73:    { name: 'R-73', seeker: 'ir', vmax: 860, accel: 480, burn: 3.5, turn: 1.0, fuse: 15, range: 3600, fov: 0.9, lockT: 0.8, dmg: 45, life: 9, geo: 'aim9', hold: 1.2 },
  r27:    { name: 'R-27', seeker: 'radar', vmax: 950, accel: 380, burn: 6, turn: 0.72, fuse: 16, range: 9000, fov: 0.55, lockT: 2.0, dmg: 50, life: 18, geo: 'amraam', hold: 1.2 },
  sam:    { name: 'SAM', seeker: 'radar', vmax: 1050, accel: 330, burn: 8, turn: 0.62, fuse: 22, range: 14000, fov: 2.0, lockT: 3, dmg: 60, life: 22, geo: 'amraam', hold: 1.2 }
};
const WAVE_NAMES = { flanker: '侧卫型', fulcrum: '支点型', ucav: '幽灵无人机', bomber: '轰炸机' };

/* ---------- models ---------- */
const playerJet = F22.build({ physical: HQ(), detail: HQ() ? 1 : 0.75, gear: true, shadows: true, anisotropy: 8 });
scene.add(playerJet.group);
playerJet.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const mslMat = playerJet.materials.missileMat;
const amraamGeo = F22.missileGeometry(), aim9Geo = F22.aim9Geometry();
const wingProto = F22.bake(F22.build({ physical: false, detail: 0.55, gear: false, cockpit: true, bay: false, lights: true, plumes: false, shadows: false, anisotropy: 4 }));
const protos = {};
for (const t of ['flanker', 'fulcrum', 'ucav', 'bomber']) { const c = Craft.build(t, 4); protos[t] = { obj: F22.bake(c), exhausts: c.exhausts }; }
const RAPTOR_EXHAUSTS = [[-9.9, -0.15, 0.62], [-9.9, -0.15, -0.62]];

class Plane {
  constructor(team, type, obj, opts = {}) {
    this.team = team; this.type = type; this.T = TYPES[type]; this.obj = obj; this.kind = 'plane';
    this.exhausts = (opts.exhausts || RAPTOR_EXHAUSTS).map(e => new V3(...e));
    this.pos = new V3(); this.q = new Q(); this.vel = new V3();
    this.fwd = new V3(1, 0, 0); this.up = new V3(0, 1, 0); this.right = new V3(0, 0, 1);
    this.speed = 250; this.maxHp = this.hp = this.T.hp; this.alive = true; this.dying = false;
    this.c = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false, tvc: false };
    this.g = 1; this.gStress = 0; this.authority = 1; this.stall = false; this.boost = false;
    this.gunCd = 0; this.cmCd = 0; this.cm = this.T.cm; this.srm = this.T.srm; this.mrm = this.T.mrm; this.ammo = this.T.ammo;
    this.pilot = null; this.name = opts.name || this.T.name; this.radius = this.T.radius;
    this.spin = new V3(); this.dieT = 0; this.bombed = false; this.escaped = false; this.painting = false;
    this.rate = new V3();   // body rates: x roll, y pitch, z yaw (rad/s)
    this.alpha = 0;         // angle of attack: the nose rides above the flight path
  }
  axes() {
    this.fwd.set(1, 0, 0).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.right.set(0, 0, 1).applyQuaternion(this.q);
  }
  integrate(dt) { this.vel.copy(this.fwd).multiplyScalar(this.speed); this.pos.addScaledVector(this.vel, dt); this.sync(); }
  // q is the flight-path frame; the airframe is drawn pitched up by the angle of attack
  sync() { this.obj.position.copy(this.pos); this.obj.quaternion.copy(this.q).multiply(_qA.setFromAxisAngle(Z_AXIS, this.alpha)); }
  nose(out) { const ca = Math.cos(this.alpha), sa = Math.sin(this.alpha); return out.copy(this.fwd).multiplyScalar(ca).addScaledVector(this.up, sa); }
}
const _m4 = new THREE.Matrix4();
function setBasis(q, f, u) {
  const up = u.clone().addScaledVector(f, -f.dot(u)).normalize();
  _m4.makeBasis(f, up, new V3().crossVectors(f, up));
  q.setFromRotationMatrix(_m4);
}

const player = new Plane('blue', 'raptor', playerJet.group, { name: 'Raptor 1' });
let wingman = null;
let enemies = [];

/* ---------- audio: synthesised with WebAudio, no files ---------- */
const Sound = {
  ctx: null, master: null, noise: null,
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = settings.sound ? 0.7 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const bb = ctx.createBuffer(1, len, ctx.sampleRate), bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = bb; src.loop = true;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 500;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    src.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); src.start();
    const hiss = ctx.createBufferSource(); hiss.buffer = buf; hiss.loop = true;
    this.hissF = ctx.createBiquadFilter(); this.hissF.type = 'bandpass'; this.hissF.frequency.value = 2400; this.hissF.Q.value = 0.6;
    this.hissG = ctx.createGain(); this.hissG.gain.value = 0;
    hiss.connect(this.hissF); this.hissF.connect(this.hissG); this.hissG.connect(this.master); hiss.start();
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master); o.start(); return { o, g }; };
    this.tone = osc('square', 1700);
    this.rwr = osc('sawtooth', 620);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg); lg.connect(this.rwr.o.frequency); lfo.start();
  },
  setVolume(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05); },
  engine(throttle, boost, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engF.frequency.setTargetAtTime(260 + throttle * 520 + boost * 700, t, 0.15);
    this.engG.gain.setTargetAtTime(on ? 0.3 + boost * 0.18 : 0, t, 0.2);
    this.hissG.gain.setTargetAtTime(on ? 0.025 + boost * 0.05 : 0, t, 0.2);
  },
  lockTone(on) { if (this.ctx) this.tone.g.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.02); },
  rwrTone(on) { if (this.ctx) this.rwr.g.gain.setTargetAtTime(on ? 0.025 : 0, this.ctx.currentTime, 0.05); },
  burst(dur, f0, f1, vol, type = 'lowpass', q = 0.8) {
    if (!this.ctx || vol <= 0.003) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  beep(freq, dur, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  gun() { this.burst(0.07, 2600, 900, 0.22, 'bandpass', 0.7); this.burst(0.05, 300, 120, 0.25); },
  boom(dist, big = 1) { const v = clamp(1 - dist / 5000, 0, 1) * 0.9 * big; this.burst(1.8 * big, 1100, 60, v); this.burst(0.25, 3000, 400, v * 0.5, 'bandpass'); },
  launch(vol = 0.45) { this.burst(1.3, 2400, 300, vol, 'bandpass', 0.5); this.burst(0.5, 400, 80, vol * 0.9); },
  hit() { this.burst(0.18, 500, 90, 0.5); this.beep(140, 0.06, 0.15); },
  flare() { this.burst(0.35, 4000, 1500, 0.18, 'highpass'); }
};

/* ---------- input ---------- */
const input = { stickX: 0, stickY: 0, keys: new Set(), gun: false, boost: false, brake: false, tvc: false, msl: false, flare: false };
addEventListener('keydown', e => {
  if (game.mode !== 'play' && game.mode !== 'paused') return;
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(k);
  if (k === 'KeyF' || k === 'KeyK') input.msl = true;
  if (k === 'KeyX' || k === 'KeyL') input.flare = true;
  if (k === 'KeyT') toggleAI();
  if (k === 'KeyC') togglePadlock();
  if (k === 'KeyP' || k === 'Escape') togglePause();
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.gun = input.boost = input.brake = input.tvc = false; });
{
  const zone = $('stick-zone'), base_ = $('stick-base'), knob = $('stick-knob');
  let id = null, ox = 0, oy = 0;
  const R = 62;
  const home = () => { base_.style.left = ''; base_.style.top = ''; knob.style.transform = ''; };
  zone.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; zone.setPointerCapture(id);
    const r = zone.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    base_.style.left = (e.clientX - r.left) + 'px'; base_.style.top = (e.clientY - r.top) + 'px';
    e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const cx = dx / R, cy = -dy / R;
    input.stickX = cx * (0.35 + 0.65 * Math.abs(cx));
    input.stickY = cy * (0.35 + 0.65 * Math.abs(cy));
  });
  const end = e => { if (e.pointerId !== id) return; id = null; input.stickX = input.stickY = 0; home(); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  const hold = (el, key) => {
    const on = e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); input[key] = true; el.classList.add('on'); };
    const off = () => { input[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  };
  const tap = (el, fn) => el.addEventListener('pointerdown', e => {
    e.preventDefault(); fn(); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 140);
  });
  hold($('b-gun'), 'gun'); hold($('b-ab'), 'boost'); hold($('b-brake'), 'brake'); hold($('b-tvc'), 'tvc');
  tap($('b-msl'), () => { input.msl = true; }); tap($('b-flare'), () => { input.flare = true; });
  tap($('b-cam'), () => togglePadlock());
  $('b-ai').addEventListener('click', () => toggleAI());
  $('touch').addEventListener('contextmenu', e => e.preventDefault());
}
function readInput() {
  const k = input.keys;
  let pitch = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + input.stickY;
  if (settings.invert) pitch = -pitch;
  const roll = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stickX;
  const yaw = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
  return {
    pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), yaw,
    gun: input.gun || k.has('Space') || k.has('KeyJ'),
    boost: input.boost || k.has('ShiftLeft') || k.has('ShiftRight'),
    brake: input.brake || k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyZ'),
    tvc: input.tvc || k.has('KeyV')
  };
}

/* ---------- game state ---------- */
const game = {
  mode: 'loading', t: 0, score: 0, kills: 0, wave: 0, lock: { target: null, t: 0, locked: false, kind: 'aim120', need: 1, los: true, losT: 0 },
  waveClear: 0, msgs: [], radio: [], shake: 0, combo: 0, comboT: 0, flash: 0,
  bayT: 0, bay: 0, sideT: 0, side: 0, mslCd: 0, deadT: 0, warnBeep: 0, lockBeep: 0, menuA: 0, cause: '',
  ai: false, aiOverride: 0, padlock: false, padBlend: 0, slowT: 0, slowCd: 0, pending: [], gear: 0, gearT: 0, painted: false
};
const bullets = [], missiles = [], flares = [], debris = [];
const camQ = new Q();
let camDist = 26, fov = 62;

function message(text, sub = '', color = '#8dffb4', dur = 2.2) {
  game.msgs.push({ text, sub, color, t: dur, dur });
  if (game.msgs.length > 3) game.msgs.shift();
}
function radio(from, text, color = '#cfe8ff') {
  game.radio.push({ from, text, color, t: 4.5 });
  if (game.radio.length > 3) game.radio.shift();
}

/* ---------- flight model shared by every aircraft ---------- */
const _q = new Q();
function flight(pl, c, dt) {
  const T = pl.T;
  pl.axes();
  let pitch = c.pitch;
  const tv = c.tvc && T.tvc;
  pl.stall = pl.speed < 112;
  if (pl.stall && !tv) pitch -= (112 - pl.speed) / 60;
  const spdF = clamp((pl.speed - 80) / 190, tv ? 0.8 : 0.3, 1);
  // fly-by-wire rate command: body rates build toward the stick demand instead of snapping to it
  const R = pl.rate;
  R.y += (pitch * T.pitch * spdF * (tv ? 1.8 : 1) * pl.authority - R.y) * (1 - Math.exp(-dt / 0.15));
  R.x += (c.roll * T.roll * pl.authority - R.x) * (1 - Math.exp(-dt / 0.12));
  R.z += ((c.yaw || 0) * 0.35 - R.z) * (1 - Math.exp(-dt / 0.25));
  const pr = R.y, rr = R.x, yr = R.z;
  pl.q.multiply(_q.setFromAxisAngle(Z_AXIS, pr * dt));
  pl.q.multiply(_q.setFromAxisAngle(X_AXIS, rr * dt));
  pl.q.multiply(_q.setFromAxisAngle(Y_AXIS, -yr * dt));
  pl.q.normalize(); pl.axes();
  pl.boost = c.boost && !c.brake;
  const dmgF = pl.hp < pl.maxHp * 0.3 ? 0.78 : 1;
  const thrust = (pl.boost ? T.ab : c.brake ? 12 : T.mil) * dmgF;
  const drag = T.drag * pl.speed * pl.speed + Math.abs(pitch) * pl.speed * 0.045 * spdF * (tv ? 3.4 : 1) + (c.brake ? pl.speed * 0.13 : 0);
  pl.speed = clamp(pl.speed + (thrust - drag - 9.81 * pl.fwd.y) * dt, 60, 620);
  pl.g = 1 + Math.abs(pr) * pl.speed / 9.81 * 0.36;
  // angle of attack grows with load and with low speed; thrust vectoring lets the F-22 go far past the normal limit
  const qd = (260 / Math.max(pl.speed, 80)) ** 2;
  const aT = clamp((0.045 + (pl.g - 1) * 0.028 * (pr < 0 ? -1 : 1)) * qd, -0.2, tv ? 1.1 : 0.45);
  pl.alpha += (aT - pl.alpha) * (1 - Math.exp(-dt / 0.25));
  // sustained load above 7.5 G builds G stress; past 3.5 the pilot greys out and loses stick authority
  pl.gStress = Math.max(0, pl.gStress + (pl.g > 7.5 ? (pl.g - 7.5) * 0.45 : -1.3) * dt);
  pl.authority = pl.gStress > 3.5 ? 0.6 : 1;
  pl.integrate(dt);
  pl.pos.y -= (1 - smooth(90, 150, pl.speed)) * 22 * dt;
  pl.sync();
}

/* ---------- AI pilot (enemies, wingman, and the player's AI mode) ---------- */
const MODE_TEXT = { pullup: '拉起避地', notch: '切向置尾 · 规避雷达弹', break: '急转摆脱导弹', bvr: '超视距接敌', pursuit: '领先追踪',
  guns: '机炮咬尾', lag: '滞后追踪 · 防冲前', strike: '攻击防空阵地', formation: '编队飞行', patrol: '巡逻', route: '直飞目标', egress: '脱离', energy: '俯冲增速' };
class Pilot {
  constructor(pl, skill) {
    Object.assign(this, { pl, skill, target: null, threat: null, think: 0, lockT: 0, mslCd: rand(3, 7), mode: 'patrol', desired: new V3(1, 0, 0) });
    this.react = lerp(0.7, 0.05, skill);
  }
}
const blueTeam = () => [player, wingman].filter(p => p && p.alive && !p.dying);
const redAir = () => enemies.filter(e => e.alive && !e.dying);
const hostilesOf = pl => pl.team === 'blue' ? redAir() : blueTeam();
const alliesOf = pl => pl.team === 'blue' ? blueTeam() : redAir();
const inFlightAt = (owner, tgt) => missiles.some(m => m.alive && m.owner === owner && m.target === tgt);
function losClear(a, b) {
  for (let i = 1; i < 10; i++) {
    const t = i / 10, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    if (y < terrainH(x, z) + 8) return false;
  }
  return true;
}
const _ai1 = new V3(), _ai2 = new V3(), _ai3 = new V3(), _ai4 = new V3();
function aiAssess(pl) {
  const P = pl.pilot, sk = P.skill;
  if (pl.type === 'bomber') { P.target = null; }
  else {
    let bestT = null, bs = 1e9;
    for (const h of hostilesOf(pl)) {
      _ai1.subVectors(h.pos, pl.pos);
      const d = _ai1.length(), off = pl.fwd.angleTo(_ai1);
      const aimingAtMe = Math.max(0, -h.fwd.dot(_ai1) / d);
      const s = d / 1000 + off * 1.4 - aimingAtMe * 1.2 * sk + (h === P.target ? -1.2 : 0) + (h.hp / h.maxHp) * 0.6 - (h.type === 'bomber' ? (pl.team === 'blue' ? 6 : 2.5) : 0);
      if (s < bs) { bs = s; bestT = h; }
    }
    if (pl.team === 'blue' && (!bestT || bs > 7)) {
      for (const s of sams) if (s.alive && s.active) { const d = s.pos.distanceTo(pl.pos) / 1000 + 2; if (d < bs) { bs = d; bestT = s; } }
    }
    if (bestT !== P.target) P.lockT = 0;
    P.target = bestT;
  }
  P.threat = null;
  let td = lerp(2500, 14000, sk);
  for (const m of missiles) if (m.alive && m.target === pl && m.age > 0.3) { const d = m.pos.distanceTo(pl.pos); if (d < td) { td = d; P.threat = m; } }
}
function stickToward(pl, d, c, sk) {
  const f = d.dot(pl.fwd), u = d.dot(pl.up), r = d.dot(pl.right);
  const ang = Math.acos(clamp(f, -1, 1));
  if (ang < 0.07) {                                          // fine tracking: pitch and rudder, wings toward level
    c.pitch = clamp(u * 18, -1, 1); c.yaw = clamp(r * 16, -1, 1);
    c.roll = clamp(r * 5 + pl.right.y * 1.4, -1, 1);
    return;
  }
  if (u < 0 && ang < 0.6 && Math.abs(r) < -u * 1.2) {        // modestly below: push rather than roll inverted
    c.pitch = clamp(u * 4, -0.8, 0); c.roll = clamp(r * 4 + pl.right.y * 1.2, -1, 1);
    return;
  }
  const phi = Math.atan2(r, u);                              // bank to put the target in the lift plane, then pull
  c.roll = clamp(phi * (1.6 + sk), -1, 1);
  c.pitch = clamp(Math.min(1, ang * 2.6) * (0.2 + 0.8 * clamp(1 - Math.abs(phi) / 1.25, 0, 1)), 0, 1);
}
function aiControl(pl, dt) {
  const P = pl.pilot, sk = P.skill, c = pl.c, d = P.desired;
  pl.axes();
  c.pitch = c.roll = c.yaw = 0; c.boost = c.brake = c.tvc = false;
  P.think -= dt;
  if (P.think <= 0) { P.think = P.react; aiAssess(pl); }
  const out = { gun: false, srm: false, mrm: false, cm: false };
  const a1 = _ai1.copy(pl.pos).addScaledVector(pl.vel, 3), a2 = _ai2.copy(pl.pos).addScaledVector(pl.vel, 7);
  const floor = Math.max(groundAt(a1.x, a1.z), groundAt(a2.x, a2.z), groundAt(pl.pos.x, pl.pos.z)) + (pl.type === 'bomber' ? 700 : 260 + (1 - sk) * 240);
  const t = P.target, m = P.threat;
  pl.painting = false;
  if (pl.pos.y + Math.min(pl.vel.y, 0) * 5 < floor) {
    P.mode = 'pullup';
    d.set(pl.fwd.x, 0, pl.fwd.z).normalize().addScaledVector(Y_AXIS, 1.3).normalize();
    c.boost = true;
  } else if (pl.type === 'bomber') {
    bomberRoute(pl, d);
    if (m && m.pos.distanceTo(pl.pos) < 2500) out.cm = true;
  } else if (m && m.alive) {
    const los = _ai3.subVectors(m.pos, pl.pos), md = los.length();
    los.multiplyScalar(1 / md);
    if (m.spec.seeker === 'radar' && md > 2400) {
      P.mode = 'notch';                                      // put the missile on the beam and drop into ground clutter
      d.set(-los.z, 0, los.x).normalize();
      if (d.dot(pl.fwd) < 0) d.negate();
      d.y = clamp((Math.max(floor + 500, 1200) - pl.pos.y) / 1600, -0.45, 0.25);
      d.normalize();
      c.boost = true;
      out.cm = md < 5500;
    } else {
      P.mode = 'break';                                      // hard turn across the missile's line of sight
      const pu = _ai4.copy(pl.up).addScaledVector(los, -pl.up.dot(los)).normalize();
      d.copy(pl.fwd).addScaledVector(los, -pl.fwd.dot(los)).normalize().multiplyScalar(0.5).add(pu).normalize();
      if (pl.pos.y < floor + 700) d.y = Math.max(d.y, 0.15);
      c.tvc = sk > 0.45 && md < 1600 && pl.speed > 150;
      c.boost = md > 900 || pl.speed < 220;
      out.cm = md < 2000;
    }
  } else if (t) {
    aiAttack(pl, t, d, c, out, dt);
  } else if (pl.team === 'blue' && pl !== player && player.alive) {
    P.mode = 'formation';
    const L = player;
    const slot = _ai3.copy(L.pos).addScaledVector(L.right, 55).addScaledVector(L.fwd, -40).addScaledVector(L.up, 6).addScaledVector(L.vel, 1.5);
    const ahead = _ai4.subVectors(slot, pl.pos).dot(pl.fwd);
    d.subVectors(slot, pl.pos);
    const dist = d.length();
    d.normalize();
    if (dist < 90) d.lerp(L.fwd, 0.75).normalize();
    c.boost = ahead > 120; c.brake = ahead < -50;
  } else {
    P.mode = 'patrol';
    d.set(-pl.pos.x, 0, -pl.pos.z).normalize().applyAxisAngle(Y_AXIS, 0.6).setY((2200 - pl.pos.y) / 3000).normalize();
  }
  for (const o of alliesOf(pl)) {
    if (o === pl) continue;
    _ai1.subVectors(pl.pos, o.pos);
    const dd = _ai1.length();
    if (dd < 230 && dd > 0.1) d.addScaledVector(_ai1.multiplyScalar(1 / dd), (230 - dd) / 230 * 1.2);
  }
  const hd = Math.hypot(pl.pos.x, pl.pos.z);
  if (hd > 9600 && pl.type !== 'bomber') d.add(_ai1.set(-pl.pos.x, 0, -pl.pos.z).normalize().multiplyScalar((hd - 9600) / 400));
  if (pl.pos.y > 7000) d.y -= 0.6;
  d.normalize();
  stickToward(pl, d, c, sk);
  if (pl.gStress > 1.6) c.pitch *= 0.7;
  if (out.cm && pl.cm > 0 && pl.cmCd <= 0 && (pl.team === 'blue' || Math.random() < 0.35 + sk * 0.6)) { dispense(pl); pl.cmCd = lerp(1.8, 0.75, sk); }
  return out;
}
function aiAttack(pl, t, d, c, out, dt) {
  const P = pl.pilot, sk = P.skill;
  const to = _ai3.subVectors(t.pos, pl.pos), dist = to.length();
  const tv = t.vel || ZERO, off = pl.fwd.angleTo(to);
  if (t.kind === 'sam') {
    P.mode = 'strike';
    d.copy(to).normalize();
    if (dist > 2600 && pl.pos.y - t.pos.y < 700) d.y += 0.18;
    c.boost = pl.speed < 280;
    if (dist < 1300 && off < 0.05 && pl.ammo > 0) out.gun = true;
  } else if (dist > 1500) {
    P.mode = dist > 5000 ? 'bvr' : 'pursuit';
    d.copy(t.pos).addScaledVector(tv, clamp(dist / 1000, 0, 2.5) * (0.3 + 0.7 * sk)).sub(pl.pos).normalize();
    if (dist > 6000 && pl.pos.y < t.pos.y + 1200) d.y += 0.06;
    c.boost = pl.speed < 330 || dist > 4500;
  } else {
    P.mode = 'guns';
    d.copy(t.pos).addScaledVector(tv, dist / 1150).sub(pl.pos).normalize();
    const closure = _ai4.subVectors(pl.vel, tv).dot(to) / dist;
    if (dist < 260 && closure > 80 && off < 0.5) { c.brake = true; P.mode = 'lag'; }
    else c.boost = pl.speed < 280;
    const aimOff = pl.fwd.angleTo(d);
    if (aimOff > 0.45 && pl.T.tvc && sk > 0.55 && pl.speed > 140) c.tvc = true;
    const cone = pl.team === 'blue' ? 0.075 : 0.035 + (1 - sk) * 0.03;
    if (aimOff < cone && dist < 1150 && pl.ammo > 0) out.gun = true;
  }
  if (pl.speed < 165 && !c.tvc && P.mode !== 'lag') { d.y = Math.min(d.y, -0.08); c.boost = true; P.mode = 'energy'; }
  // seeker lock and missile envelope
  const sees = off < 0.65 && dist < 15000;
  P.lockT = sees ? P.lockT + dt / ((t.T && t.T.stealth) || 1) : Math.max(0, P.lockT - dt * 2);
  pl.painting = pl.team === 'red' && pl.T.radar && sees && dist < 12000 && t === player;
  P.mslCd -= dt;
  if (P.mslCd > 0 || inFlightAt(pl, t) || (pl.team === 'red' && game.wave < 2)) return;
  const srm = MSL[pl.T.srmType], mrm = MSL[pl.T.mrmType];
  if (pl.srm > 0 && srm && t.kind !== 'sam' && P.lockT > srm.lockT && dist > 350 && dist < srm.range * (0.6 + 0.3 * sk) && off < 0.8) out.srm = true;
  else if (pl.mrm > 0 && mrm && P.lockT > mrm.lockT && dist > (pl.team === 'blue' ? 900 : 2600) && dist < mrm.range * (0.5 + 0.35 * sk) && off < 0.5 && losClear(pl.pos, t.pos)) out.mrm = true;
}
function bomberRoute(pl, d) {
  const P = pl.pilot, hdist = Math.hypot(base.x - pl.pos.x, base.z - pl.pos.z);
  if (!pl.bombed) {
    P.mode = 'route';
    d.set(base.x - pl.pos.x, (3000 - pl.pos.y) * 2, base.z - pl.pos.z).normalize();
    if (hdist < 900) bombBase(pl);
  } else {
    P.mode = 'egress';
    d.set(pl.pos.x - base.x, (3200 - pl.pos.y) * 2, pl.pos.z - base.z).normalize();
    if (hdist > 12500) { pl.escaped = true; pl.alive = false; scene.remove(pl.obj); message('轰炸机脱离', '', '#ff8a78', 1.6); }
  }
}
function bombBase(pl) {
  pl.bombed = true;
  base.hp = Math.max(0, base.hp - 34);
  for (let i = 0; i < 9; i++) game.pending.push({ t: 1.6 + i * 0.22, pos: new V3(base.x + rand(-900, 900), base.y, base.z + rand(-260, 300)) });
  radio('塔台', base.hp > 0 ? `基地遭到轰炸！完好度 ${base.hp}%` : '基地被摧毁……', '#ff8a78');
  if (base.hp <= 0 && game.mode === 'play') { game.cause = '基地被摧毁'; game.mode = 'dead'; game.deadT = 4; }
}

/* ---------- weapons ---------- */
function fireBullet(from, dir, owner, speed = 1150) {
  if (bullets.length >= MAX_BULLETS) return;
  bullets.push({ pos: from.clone(), prev: from.clone(), vel: dir.clone().multiplyScalar(speed).add(owner.vel), life: 1.7, owner });
}
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();
function segDist(p0, p1, c) {
  _a.subVectors(p1, p0); const l2 = _a.lengthSq();
  const t = l2 > 0 ? clamp(_b.subVectors(c, p0).dot(_a) / l2, 0, 1) : 0;
  return _c.copy(p0).addScaledVector(_a, t).distanceTo(c);
}
function shootGun(pl, aimDir, err) {
  if (pl.gunCd > 0 || pl.ammo <= 0) return;
  pl.gunCd = pl === player ? 1 / 25 : 0.085;
  pl.ammo -= pl === player ? 4 : 1;
  const dir = aimDir.clone();
  dir.x += rand(-err, err); dir.y += rand(-err, err); dir.z += rand(-err, err);
  _a.set(2.6, 0.55, 1.25).applyQuaternion(pl.q).add(pl.pos);
  fireBullet(_a, dir.normalize(), pl, pl.team === 'blue' ? 1150 : 1000);
  fire.emit(_a.x, _a.y, _a.z, pl.vel.x, pl.vel.y, pl.vel.z, 0.05, 2.2, 3.5, 1.5, 1.2, 0.7, 1);
  if (pl === player) { if (Math.random() < 0.5) Sound.gun(); game.shake = Math.max(game.shake, 0.12); }
  else { const d = pl.pos.distanceTo(player.pos); if (d < 1500 && Math.random() < 0.25) Sound.burst(0.06, 1800, 700, 0.06 * (1 - d / 1500), 'bandpass'); }
}
function launchMissile(owner, target, kind) {
  const spec = MSL[kind];
  const mesh = new THREE.Mesh(spec.geo === 'aim9' ? aim9Geo : amraamGeo, mslMat);
  if (kind === 'sam') mesh.scale.setScalar(1.7);
  scene.add(mesh);
  let pos, dir, vel, drop;
  if (owner.kind === 'sam') {
    pos = owner.pos.clone().add(new V3(rand(-6, 6), 4, rand(-6, 6)));
    dir = target.pos.clone().sub(pos).normalize().lerp(Y_AXIS, 0.6).normalize();
    vel = dir.clone().multiplyScalar(40); drop = 0;
    for (let i = 0; i < 24; i++) smoke.emit(pos.x, pos.y, pos.z, rand(-15, 15), rand(0, 8), rand(-15, 15), rand(3, 6), 8, 30, 0.8, 0.78, 0.74, 0.7, 0.8);
  } else {
    owner.axes();
    const bay = owner.type === 'raptor';
    pos = owner.pos.clone().addScaledVector(owner.up, bay ? -1.7 : -0.7).addScaledVector(owner.fwd, bay ? -1 : 0);
    if (bay && kind === 'aim9') pos.addScaledVector(owner.right, owner.srm % 2 ? -1.7 : 1.7);
    dir = owner.fwd.clone();
    vel = owner.vel.clone().addScaledVector(owner.up, bay ? -12 : -3);
    drop = bay ? 0.3 : 0.08;
  }
  const m = { kind, spec, owner, team: owner.team || 'red', target, pos, prev: pos.clone(), dir, vel, speed: owner.speed || 40,
    age: 0, drop, alive: true, mesh, lostT: 0, losT: 0, los: true, cmSeen: -1 };
  missiles.push(m);
  if (owner === player) Sound.launch();
  else Sound.launch(clamp(1 - owner.pos.distanceTo(player.pos) / 5000, 0, 0.3));
  if (owner.team === 'blue') radio(owner.name, `${spec.call}！${target ? (target.T ? target.T.name : target.name) : '无锁定'}`, '#9fd4ff');
  if (target === player) message(owner.kind === 'sam' ? 'SAM 发射' : '敌方导弹发射', spec.seeker === 'ir' ? '红外制导 · 投放干扰弹或急转' : '雷达制导 · 切向置尾并投放箔条', '#ff5a4f', 2);
  return m;
}
function launchFrom(pl, target, kind) {
  if (MSL[kind].seeker === 'ir') { if (pl.srm <= 0) return false; pl.srm--; }
  else { if (pl.mrm <= 0) return false; pl.mrm--; }
  launchMissile(pl, target, kind);
  if (pl === player) {
    if (kind === 'aim9') game.sideT = 1.0; else game.bayT = 1.1;
    game.mslCd = 0.55;
  }
  return true;
}
function firePlayerMissile() {
  const p = player, L = game.lock;
  if (game.mslCd > 0) return;
  let kind = L.target ? L.kind : (p.mrm > 0 ? 'aim120' : 'aim9');
  if (kind === 'aim9' && p.srm <= 0) kind = 'aim120';
  if (kind === 'aim120' && p.mrm <= 0) kind = 'aim9';
  if (!launchFrom(p, L.locked ? L.target : null, kind)) { message('导弹已用完', '', '#9fb0ba', 1.2); return; }
  if (!L.locked) message('未锁定发射', '导弹将直线飞行', '#9fb0ba', 1.2);
}
function dispense(pl) {
  pl.cm--;
  pl.axes();
  const fresh = [];
  for (let i = 0; i < 3; i++) {
    const side = i % 2 ? 1 : -1;
    const v = pl.vel.clone().multiplyScalar(0.55).addScaledVector(pl.up, -rand(20, 40)).addScaledVector(pl.right, side * rand(25, 55)).addScaledVector(pl.fwd, -rand(10, 30));
    const f = { kind: 'flare', pos: pl.pos.clone().addScaledVector(pl.fwd, -6), vel: v, life: rand(3.5, 4.5), alive: true, radius: 0, name: '干扰弹' };
    flares.push(f); fresh.push(f);
  }
  // chaff: a short-lived glittering bloom behind the aircraft
  for (let i = 0; i < 26; i++) {
    _d.randomDirection().multiplyScalar(rand(8, 30));
    fire.emit(pl.pos.x - pl.fwd.x * 10, pl.pos.y - pl.fwd.y * 10, pl.pos.z - pl.fwd.z * 10, pl.vel.x * 0.3 + _d.x, pl.vel.y * 0.3 + _d.y, pl.vel.z * 0.3 + _d.z, rand(0.8, 1.6), 1.6, 0.8, 0.9, 0.95, 1.1, 0.8, 1.5, 3);
  }
  const vl = pl.vel.length() || 1;
  for (const m of missiles) {
    if (!m.alive || m.target !== pl || m.age < 0.3 || m.cmSeen === game.t) continue;
    m.cmSeen = game.t;
    const los = _d.subVectors(m.pos, pl.pos), dist = los.length();
    const beam = 1 - Math.abs(pl.vel.dot(los) / (vl * dist));
    const blue = m.team === 'blue';
    const chance = m.spec.seeker === 'ir' ? (blue ? 0.3 : 0.8) * (dist < 400 ? 0.6 : 1) : (blue ? 0.12 : 0.22) + (blue ? 0.35 : 0.55) * beam;
    if (Math.random() < chance) {
      m.target = m.spec.seeker === 'ir' ? fresh[Math.floor(Math.random() * fresh.length)] : null;
      if (pl === player || pl === wingman) radio(pl.name, m.spec.seeker === 'ir' ? '导弹被干扰弹诱偏！' : '箔条奏效，雷达弹丢失目标！', '#9fd4ff');
    }
  }
  if (pl === player) Sound.flare();
}
function explode(pos, scale = 1, vel = null) {
  const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
  for (let i = 0; i < 4; i++) fire.emit(pos.x, pos.y, pos.z, vx, vy, vz, 0.25, 50 * scale, 110 * scale, 1.4, 1.2, 1.0, 1);
  for (let i = 0; i < 30 * scale; i++) {
    _d.randomDirection().multiplyScalar(rand(8, 45) * scale);
    fire.emit(pos.x, pos.y, pos.z, _d.x + vx, _d.y + vy, _d.z + vz, rand(0.6, 1.4), rand(10, 18) * scale, rand(30, 55) * scale, 1.3, 0.75, 0.35, 0.9, 1.6);
  }
  for (let i = 0; i < 26 * scale; i++) {
    _d.randomDirection().multiplyScalar(rand(60, 180));
    fire.emit(pos.x, pos.y, pos.z, _d.x + vx, _d.y + vy, _d.z + vz, rand(0.5, 1.2), 2.4, 1.2, 1.5, 1.1, 0.6, 1, 0.8, 30);
  }
  for (let i = 0; i < 18 * scale; i++) {
    _d.randomDirection().multiplyScalar(rand(5, 22) * scale);
    const g = rand(0.13, 0.26);
    smoke.emit(pos.x, pos.y, pos.z, _d.x + vx * 0.5, _d.y + 3, _d.z + vz * 0.5, rand(3.5, 6.5), 22 * scale, rand(80, 130) * scale, g, g, g * 1.05, 0.85, 0.5, -1.5);
  }
  const d = pos.distanceTo(camera.position);
  game.shake = Math.max(game.shake, clamp(1.8 * scale * (1 - d / 1600), 0, 2.2));
  Sound.boom(d, scale);
}
const debrisGeo = new THREE.BoxGeometry(1.2, 0.3, 0.8);
const debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.8, metalness: 0.4 });
function spawnDebris(pos, vel, n, size = 1) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMat);
    mesh.scale.setScalar(rand(0.6, 1.6) * size);
    mesh.position.copy(pos);
    scene.add(mesh);
    debris.push({ mesh, vel: vel.clone().multiplyScalar(0.6).add(_d.randomDirection().multiplyScalar(rand(30, 80))), life: rand(2, 3.5), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)) });
  }
}

/* ---------- damage & kills ---------- */
function applyDamage(tgt, dmg, src) {
  if (tgt.kind === 'sam') damageSam(tgt, dmg, src);
  else if (tgt.kind === 'plane') damagePlane(tgt, dmg, src);
}
function damagePlane(pl, dmg, src) {
  if (!pl.alive || pl.dying) return;
  pl.hp -= dmg;
  if (pl === player) {
    game.flash = Math.min(1, game.flash + dmg / 40);
    game.shake = Math.max(game.shake, dmg > 20 ? 1.6 : 0.5);
    Sound.hit();
    if (player.hp <= 0) killPlayer(src.kind === 'missile' ? `被 ${src.name} 击落` : src.kind === 'gun' ? '被机炮击落' : '坠毁');
    return;
  }
  if (pl.hp <= 0) destroyPlane(pl, src);
}
function destroyPlane(pl, src) {
  pl.dying = true; pl.dieT = rand(2.2, 3.8);
  pl.vel.copy(pl.fwd).multiplyScalar(pl.speed * 0.75);
  pl.spin.set(rand(-3, 3), 0, rand(-1.2, 1.2));
  const big = pl.type === 'bomber';
  explode(pl.pos, big ? 1.5 : 0.8, pl.vel);
  spawnDebris(pl.pos, pl.vel, big ? 10 : 5, big ? 2 : 1);
  if (pl.team === 'red') {
    const by = src.owner;
    if (by === player) {
      game.kills++;
      game.comboT > 0 ? game.combo++ : (game.combo = 1);
      game.comboT = 7;
      const pts = ((pl.T.score || 100) + game.wave * 20) * game.combo + (src.kind === 'gun' ? 60 : 0);
      game.score += pts;
      message(src.kind === 'gun' ? '机炮击落' : '击落', `${pl.T.name}  +${pts}${game.combo > 1 ? `  连杀 ×${game.combo}` : ''}`, '#8dffb4', 2.4);
      radio(player.name, `Splash！击落${pl.T.name}`, '#9fd4ff');
      if (!reduced && game.slowCd <= 0 && !game.ai) { game.slowT = 0.8; game.slowCd = 6; }
    } else if (by === wingman) {
      game.score += Math.round((pl.T.score || 100) / 2);
      radio(wingman.name, `Splash！击落${pl.T.name}`, '#9fd4ff');
    } else {
      game.score += Math.round((pl.T.score || 100) / 3);
      message(`${pl.T.name}坠毁`, '', '#8dffb4', 1.6);
    }
  } else if (pl === wingman) {
    radio(wingman.name, '我被击中了，弹射！', '#ff8a78');
  }
}
function killPlayer(cause) {
  if (!player.alive) return;
  player.alive = false; player.hp = 0;
  game.cause = cause; game.mode = 'dead'; game.deadT = 3.2;
  explode(player.pos, 1.6, player.vel);
  spawnDebris(player.pos, player.vel, 8, 1.3);
  playerJet.group.visible = false;
  Sound.lockTone(false); Sound.rwrTone(false); Sound.engine(0, 0, false);
}
function damageSam(s, dmg, src) {
  if (!s.alive) return;
  s.hp -= dmg;
  if (s.hp > 0) return;
  s.alive = false; s.burnT = 40;
  explode(s.pos, 1.3, null);
  s.group.scale.set(1, 0.5, 1); s.group.rotation.z = 0.15;
  if (src.owner === player) { game.score += 250; message('防空阵地摧毁', '+250', '#8dffb4', 2.2); radio(player.name, 'SAM 阵地已摧毁！', '#9fd4ff'); }
  else if (src.owner === wingman) { game.score += 120; radio(wingman.name, 'SAM 阵地已摧毁！', '#9fd4ff'); }
}

/* ---------- waves ---------- */
const CALLSIGNS = ['毒蛇', '红狼', '幽灵', '刀锋', '蝮蛇', '黑鹰', '雷霆', '赤焰', '寒鸦', '铁砧', '风暴', '血鹰'];
function waveList(n) {
  if (n === 1) return ['fulcrum', 'fulcrum'];
  if (n === 2) return ['ucav', 'ucav', 'ucav', 'fulcrum'];
  if (n === 3) return ['flanker', 'fulcrum', 'fulcrum'];
  if (n % 4 === 0) return ['bomber', 'bomber', 'fulcrum', 'flanker', ...(n >= 8 ? ['flanker', 'ucav', 'ucav'] : [])];
  const pool = ['fulcrum', 'flanker', 'ucav', 'flanker', 'fulcrum'];
  return Array.from({ length: Math.min(3 + Math.floor(n / 2), 8) }, (_, i) => pool[(i + n) % pool.length]);
}
function spawnEnemy(type, skill, anchor, i, facing) {
  const pr = protos[type];
  const e = new Plane('red', type, pr.obj.clone(), { exhausts: pr.exhausts });
  e.name = `${CALLSIGNS[(game.wave * 3 + i) % CALLSIGNS.length]}-${i + 1}`;
  e.pilot = new Pilot(e, type === 'bomber' ? 0.5 : skill);
  scene.add(e.obj);
  e.pos.copy(anchor).add(new V3(rand(-700, 700), rand(-200, 300), rand(-700, 700)));
  if (type === 'bomber') e.pos.addScaledVector(facing, -i * 250);
  e.pos.y = Math.max(e.pos.y, groundAt(e.pos.x, e.pos.z) + 800);
  setBasis(e.q, facing.clone().applyAxisAngle(Y_AXIS, type === 'bomber' ? 0 : rand(-0.4, 0.4)), Y_AXIS);
  e.speed = type === 'bomber' ? 240 : 260;
  e.axes(); e.sync();
  enemies.push(e);
}
function spawnWingman(near) {
  wingman = new Plane('blue', 'raptor', wingProto.clone(), { name: 'Raptor 2' });
  wingman.pilot = new Pilot(wingman, 0.85);
  scene.add(wingman.obj);
  near.axes();
  wingman.pos.copy(near.pos).addScaledVector(near.right, 60).addScaledVector(near.fwd, -45);
  wingman.q.copy(near.q); wingman.speed = near.speed;
  wingman.axes(); wingman.sync();
}
function startWave(n) {
  game.wave = n;
  const list = waveList(n), skill = Math.min(0.25 + n * 0.09, 0.95);
  const bomberWave = list.includes('bomber');
  let anchor, facing;
  if (bomberWave) {
    const a = rand(0, Math.PI * 2);
    anchor = new V3(base.x + Math.cos(a) * 10500, 3000, base.z + Math.sin(a) * 10500);
    facing = new V3(base.x - anchor.x, 0, base.z - anchor.z).normalize();
  } else {
    player.axes();
    const h = new V3(player.fwd.x, 0, player.fwd.z).normalize().applyAxisAngle(Y_AXIS, rand(-0.8, 0.8));
    anchor = player.pos.clone().addScaledVector(h, rand(5200, 6600));
    anchor.y = clamp(player.pos.y + rand(-300, 800), 1200, 3800);
    facing = player.pos.clone().sub(anchor).setY(0).normalize();
  }
  list.forEach((t, i) => spawnEnemy(t, skill, anchor, i, facing));
  const counts = {};
  for (const t of list) counts[t] = (counts[t] || 0) + 1;
  const summary = Object.entries(counts).map(([t, c]) => `${WAVE_NAMES[t]} ×${c}`).join(' · ');
  if (bomberWave) { message(`第 ${n} 波 · 轰炸机来袭`, '拦截轰炸机，保卫基地', '#ff8a78', 3.4); radio('预警机', '轰炸机编队距基地 10 公里，立即拦截！', '#ffd28a'); }
  else { message(`第 ${n} 波`, summary, '#e3b257', 3.2); radio('预警机', `发现敌机：${summary}`, '#ffd28a'); }
  if (n === 3) radio('预警机', '注意，岛上地空导弹阵地开机。低空飞行可躲避雷达。', '#ffd28a');
  if (settings.wingman && (!wingman || !wingman.alive || wingman.dying) && n > 1) {
    if (wingman) scene.remove(wingman.obj);
    spawnWingman(player);
    radio('Raptor 2', '僚机归队。', '#9fd4ff');
  }
}

/* ---------- player ---------- */
const ctlS = { pitch: 0, roll: 0, yaw: 0, brake: 0, tvc: 0 };
function updatePlayer(dt) {
  const p = player, inp = readInput();
  p.axes();
  const manual = Math.abs(inp.pitch) + Math.abs(inp.roll) + Math.abs(inp.yaw) > 0.15;
  let out = { gun: inp.gun, srm: false, mrm: false, cm: false };
  if (game.ai && !manual) {
    out = aiControl(p, dt);
    if (inp.gun) out.gun = true;
    game.aiOverride = Math.max(0, game.aiOverride - dt);
  } else {
    if (game.ai) game.aiOverride = 1;
    let roll = inp.roll;
    if (Math.abs(roll) < 0.05) roll += clamp(p.right.y * 1.3, -0.5, 0.5) * smooth(-0.2, 0.3, p.up.y);
    Object.assign(p.c, { pitch: inp.pitch, roll, yaw: inp.yaw, boost: inp.boost, brake: inp.brake, tvc: inp.tvc });
    p.pilot.think = 0;
    const hd = Math.hypot(p.pos.x, p.pos.z);
    if (hd > 10500) {
      const side = Math.sign(new V3().crossVectors(p.fwd, new V3(-p.pos.x, 0, -p.pos.z)).y) || 1;
      p.q.premultiply(_q.setFromAxisAngle(Y_AXIS, side * 0.45 * dt));
    }
  }
  if (game.ai && inp.boost) p.c.boost = true;
  if (game.gearT > 0) p.c.boost = true;
  game.out = Math.hypot(p.pos.x, p.pos.z) > 9500;
  flight(p, p.c, dt);
  // control surfaces, leading-edge droop, speedbrake and thrust vectoring follow the stick
  const k = 1 - Math.exp(-dt * 10);
  ctlS.pitch += (p.c.pitch - ctlS.pitch) * k; ctlS.roll += (p.c.roll - ctlS.roll) * k; ctlS.yaw += (p.c.yaw - ctlS.yaw) * k;
  ctlS.brake += ((p.c.brake ? 1 : 0) - ctlS.brake) * k; ctlS.tvc += ((p.c.tvc ? 1 : 0) - ctlS.tvc) * k;
  const lef = clamp(Math.abs(ctlS.pitch) * 0.7 + smooth(200, 130, p.speed) * 0.6 + game.gear * 0.5, 0, 1);
  playerJet.pose({ pitch: ctlS.pitch, roll: ctlS.roll, yaw: ctlS.yaw, lef, brake: ctlS.brake, flap: game.gear * 0.6, vector: ctlS.pitch * (1 + ctlS.tvc) });
  playerJet.setAB(p.boost ? 1 : p.c.brake ? 0.05 : 0.2, game.t);
  if (p.g > 5.5 && Math.random() < 0.9) {
    for (const s of [1, -1]) {
      _a.set(-3.9, -0.38, 6.7 * s).applyQuaternion(p.q).add(p.pos);
      smoke.emit(_a.x, _a.y, _a.z, p.vel.x * 0.92, p.vel.y * 0.92, p.vel.z * 0.92, 0.7, 0.8, 3.2, 0.95, 0.96, 1, 0.35, 3);
    }
  }
  if (p.alpha > 0.22) game.shake = Math.max(game.shake, (p.alpha - 0.22) * 0.5);   // airframe buffet at high alpha
  if ((ctlS.tvc > 0.5 && p.speed < 260) || p.alpha > 0.3) { // vapour over the wing in high-alpha turns
    _a.set(-1, 1.2, 0).applyQuaternion(p.q).add(p.pos);
    smoke.emit(_a.x, _a.y, _a.z, p.vel.x * 0.95, p.vel.y * 0.95, p.vel.z * 0.95, 0.35, 6, 12, 0.95, 0.96, 1, 0.25, 4);
  }
  if (p.hp < 40) {
    _a.set(-8, 0.2, 0).applyQuaternion(p.q).add(p.pos);
    smoke.emit(_a.x, _a.y, _a.z, p.vel.x * 0.85, p.vel.y * 0.85, p.vel.z * 0.85, 2.2, 3, 12, 0.18, 0.18, 0.19, 0.6, 2);
  }
  game.agl = p.pos.y - groundAt(p.pos.x, p.pos.z);
  if (game.agl < 3) { killPlayer(terrainH(p.pos.x, p.pos.z) > 1 ? '撞地坠毁' : '坠海'); return; }

  updateLock(dt);
  p.gunCd -= dt;
  const gt = gunSolution(p);
  if (out.gun) {
    const dir = (game.ai && !manual) ? p.pilot.desired.clone() : p.nose(new V3());
    if (gt) dir.lerp(_b.copy(game.leadPoint).sub(p.pos).normalize(), 0.85).normalize();
    shootGun(p, dir, 0.004);
  }
  game.mslCd -= dt;
  if (game.ai && !manual) {
    const t = p.pilot.target;
    if (out.srm && game.mslCd <= 0) { if (launchFrom(p, t, 'aim9')) p.pilot.mslCd = 2.2; }
    else if (out.mrm && game.mslCd <= 0) { if (launchFrom(p, t, 'aim120')) p.pilot.mslCd = 3; }
  }
  if (input.msl) { input.msl = false; firePlayerMissile(); }
  if (input.flare) { input.flare = false; if (p.cm > 0 && p.cmCd <= 0) { dispense(p); p.cmCd = 0.7; } else if (p.cm <= 0) message('干扰弹用完', '', '#9fb0ba', 1); }
  p.cmCd -= dt;
  game.bayT -= dt; game.sideT -= dt;
  const kb = 1 - Math.exp(-dt * 9);
  game.bay += ((game.bayT > 0 ? 1 : 0) - game.bay) * kb;
  game.side += ((game.sideT > 0 ? 1 : 0) - game.side) * kb;
  playerJet.setBay(game.bay, Math.min(6, p.mrm + (game.bayT > 0 ? 1 : 0)));
  playerJet.setSideBay(game.side, p.srm + (game.sideT > 0 ? 1 : 0));
  // gear retracts shortly after take-off
  if (game.gearT > 0) { game.gearT -= dt; if (game.gearT <= 0) radio(player.name, '起落架收起，爬升出海。', '#9fd4ff'); }
  game.gear += ((game.gearT > 0 ? 1 : 0) - game.gear) * (1 - Math.exp(-dt * 2.2));
  playerJet.setGear(1 - game.gear);
}
function gunSolution(p) {
  game.gunTarget = null;
  let bestE = null, bestA = 0.11;
  const nose = p.nose(new V3());
  for (const e of redAir()) {
    const d = e.pos.distanceTo(p.pos);
    if (d > 1600) continue;
    const ang = nose.angleTo(_b.copy(e.pos).addScaledVector(e.vel, d / 1150).sub(p.pos));
    if (ang < bestA) { bestA = ang; bestE = e; }
  }
  if (bestE) {
    game.gunTarget = bestE;
    game.leadPoint = (game.leadPoint || new V3()).copy(bestE.pos).addScaledVector(bestE.vel, bestE.pos.distanceTo(p.pos) / 1150);
  }
  return bestE;
}
function updateLock(dt) {
  const p = player, L = game.lock;
  let bestT = null, bs = 1e9;
  const cands = redAir().concat(sams.filter(s => s.alive && s.active));
  for (const e of cands) {
    _a.subVectors(e.pos, p.pos);
    const d = _a.length(), ang = p.fwd.angleTo(_a);
    const ir = e.kind === 'plane' && p.srm > 0 && d < MSL.aim9.range && ang < MSL.aim9.fov;
    const rad = p.mrm > 0 && d < MSL.aim120.range && ang < MSL.aim120.fov;
    if (!ir && !rad) continue;
    const s = ang + d / 20000 - (e === L.target ? 0.35 : 0);
    if (s < bs) { bs = s; bestT = e; }
  }
  if (bestT !== L.target) { L.target = bestT; L.t = 0; L.losT = 0; }
  if (L.target) {
    _a.subVectors(L.target.pos, p.pos);
    const d = _a.length(), ang = p.fwd.angleTo(_a);
    L.kind = L.target.kind === 'plane' && p.srm > 0 && d < MSL.aim9.range * 0.9 && ang < MSL.aim9.fov ? 'aim9' : p.mrm > 0 ? 'aim120' : 'aim9';
    L.need = MSL[L.kind].lockT * ((L.target.T && L.target.T.stealth) || 1);
    L.losT -= dt;
    if (L.losT <= 0) { L.losT = 0.25; L.los = L.kind === 'aim9' || losClear(p.pos, L.target.pos); }
    L.t = L.los ? Math.min(L.t + dt, L.need + 1) : Math.max(0, L.t - dt);
    const was = L.locked;
    L.locked = L.t >= L.need;
    if (L.locked && !was) Sound.beep(2000, 0.08, 0.06);
  } else L.locked = false;
  Sound.lockTone(L.locked && (p.srm + p.mrm) > 0);
  if (L.target && !L.locked) { game.lockBeep -= dt; if (game.lockBeep <= 0) { Sound.beep(1150, 0.04, 0.035); game.lockBeep = 0.2; } }
}

/* ---------- AI aircraft (enemies and wingman) ---------- */
function updateAI(pl, dt) {
  if (pl.dying) { updateDying(pl, dt); return; }
  const out = aiControl(pl, dt);
  if (!pl.alive) return;                               // a bomber that escaped this frame
  flight(pl, pl.c, dt);
  pl.gunCd -= dt; pl.cmCd -= dt;
  const P = pl.pilot, t = P.target;
  if (out.gun && t) shootGun(pl, P.desired, lerp(0.03, 0.004, P.skill));
  if (out.srm && t) { if (launchFrom(pl, t, pl.T.srmType)) P.mslCd = pl.team === 'blue' ? 2.5 : lerp(16, 7, P.skill); }
  else if (out.mrm && t) { if (launchFrom(pl, t, pl.T.mrmType)) P.mslCd = pl.team === 'blue' ? 3 : lerp(18, 8, P.skill); }
  for (const ex of pl.exhausts) {
    _a.copy(ex).applyQuaternion(pl.q).add(pl.pos);
    fire.emit(_a.x, _a.y, _a.z, pl.vel.x * 0.9, pl.vel.y * 0.9, pl.vel.z * 0.9, 0.08, pl.boost ? 5 : 3, 1.5, 1.4, 0.7, 0.3, 0.9);
  }
  if (pl.hp < pl.maxHp * 0.55) {
    _a.copy(pl.exhausts[0]).applyQuaternion(pl.q).add(pl.pos);
    smoke.emit(_a.x, _a.y, _a.z, pl.vel.x * 0.8, pl.vel.y * 0.8, pl.vel.z * 0.8, 2.2, 3, 14, 0.16, 0.16, 0.17, 0.7, 1.5);
  }
  if (pl.g > 5.5 && Math.random() < 0.6 && pl.type !== 'bomber') {
    for (const s of [1, -1]) { _c.set(-3.9, -0.38, 6.7 * s).applyQuaternion(pl.q).add(pl.pos); smoke.emit(_c.x, _c.y, _c.z, pl.vel.x * 0.92, pl.vel.y * 0.92, pl.vel.z * 0.92, 0.6, 0.8, 3, 0.95, 0.96, 1, 0.3, 3); }
  }
  if (pl.pos.y < groundAt(pl.pos.x, pl.pos.z) + 3) destroyPlane(pl, { owner: null, kind: 'crash' });
}
function updateDying(pl, dt) {
  pl.dieT -= dt;
  pl.vel.y -= 22 * dt;
  pl.pos.addScaledVector(pl.vel, dt);
  pl.obj.position.copy(pl.pos);
  pl.obj.rotateX(pl.spin.x * dt); pl.obj.rotateZ(pl.spin.z * dt);
  for (let i = 0; i < 2; i++) {
    fire.emit(pl.pos.x + rand(-2, 2), pl.pos.y + rand(-2, 2), pl.pos.z + rand(-2, 2), pl.vel.x * 0.2, pl.vel.y * 0.2, pl.vel.z * 0.2, rand(0.4, 0.8), 8, 18, 1.3, 0.7, 0.3, 0.9);
    smoke.emit(pl.pos.x, pl.pos.y, pl.pos.z, pl.vel.x * 0.1, 2, pl.vel.z * 0.1, rand(3, 5), 10, 46, 0.12, 0.12, 0.13, 0.8, 0.3, -2);
  }
  if (pl.dieT <= 0 || pl.pos.y < groundAt(pl.pos.x, pl.pos.z)) {
    explode(pl.pos, pl.type === 'bomber' ? 2 : 1.4, null);
    pl.alive = false; scene.remove(pl.obj);
  }
}

/* ---------- SAM sites ---------- */
function updateSams(dt) {
  for (const s of sams) {
    if (!s.alive) {
      if (s.burnT > 0) { s.burnT -= dt; if (Math.random() < 0.5) smoke.emit(s.pos.x + rand(-6, 6), s.pos.y, s.pos.z + rand(-6, 6), rand(-2, 2), rand(12, 20), rand(-2, 2), rand(5, 8), 10, 60, 0.14, 0.14, 0.15, 0.7, 0.2, -1); }
      continue;
    }
    s.active = game.wave >= 3 && game.mode === 'play';
    s.painting = false;
    if (!s.active || !player.alive) { s.lockT = 0; continue; }
    const d = s.pos.distanceTo(player.pos), agl = player.pos.y - groundAt(player.pos.x, player.pos.z);
    s.losT = (s.losT || 0) - dt;
    if (s.losT <= 0) { s.losT = 0.5; s.los = d < 12500 && losClear(s.pos, player.pos); }
    if (s.los && agl > 220) { s.lockT += dt; s.painting = true; } else s.lockT = Math.max(0, s.lockT - dt * 0.5);
    s.cd -= dt;
    if (s.lockT > 3 && s.cd <= 0 && d < 11500) { launchMissile(s, player, 'sam'); s.cd = rand(13, 18); radio('预警机', 'SAM 发射！注意规避！', '#ff8a78'); }
  }
}

/* ---------- projectiles ---------- */
const dummy = new THREE.Object3D();
function updateBullets(dt) {
  let n = 0;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.prev.copy(b.pos);
    b.vel.y -= 9.81 * dt;
    b.pos.addScaledVector(b.vel, dt);
    b.life -= dt;
    let hit = false;
    const blue = b.owner.team === 'blue';
    for (const e of (blue ? redAir() : blueTeam())) {
      if (segDist(b.prev, b.pos, e.pos) < e.radius + 2) {
        applyDamage(e, blue ? 13 : 2.8, { owner: b.owner, kind: 'gun', name: '机炮' }); hit = true;
        for (let k = 0; k < 6; k++) { _d.randomDirection().multiplyScalar(40); fire.emit(b.pos.x, b.pos.y, b.pos.z, e.vel.x + _d.x, e.vel.y + _d.y, e.vel.z + _d.z, 0.25, 2.5, 1, 1.5, 1.2, 0.7, 1); }
        if (b.owner === player && Math.random() < 0.4) Sound.beep(320, 0.03, 0.05);
        break;
      }
    }
    if (!hit && blue) for (const s of sams) if (s.alive && segDist(b.prev, b.pos, s.pos) < s.radius) { applyDamage(s, 13, { owner: b.owner, kind: 'gun' }); hit = true; break; }
    if (!hit && b.pos.y < terrainH(b.pos.x, b.pos.z)) { smoke.emit(b.pos.x, b.pos.y, b.pos.z, 0, 8, 0, 1.2, 2, 8, 0.55, 0.5, 0.42, 0.6, 1, 5); hit = true; }
    if (!hit && b.pos.y < 0) { smoke.emit(b.pos.x, 0, b.pos.z, 0, 14, 0, 1.2, 2, 9, 0.9, 0.93, 0.95, 0.6, 1, 9); hit = true; }
    if (hit || b.life <= 0) { bullets.splice(i, 1); continue; }
    _a.copy(b.vel).normalize();
    dummy.position.copy(b.pos).addScaledVector(_a, -8);
    dummy.quaternion.setFromUnitVectors(X_AXIS, _a);
    dummy.scale.set(16, 0.32, 0.32);
    dummy.updateMatrix();
    tracerMesh.setMatrixAt(n, dummy.matrix);
    tracerMesh.setColorAt(n, blue ? COL_BLUE_TRACER : COL_RED_TRACER);
    n++;
  }
  tracerMesh.count = n;
  tracerMesh.instanceMatrix.needsUpdate = true;
  if (tracerMesh.instanceColor) tracerMesh.instanceColor.needsUpdate = true;
}
const _md = new V3(), _ml = new V3();
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i], S = m.spec;
    m.age += dt;
    m.prev.copy(m.pos);
    if (m.age < m.drop) {
      m.vel.y -= 9.81 * dt;
      m.pos.addScaledVector(m.vel, dt);
    } else {
      m.speed = m.age < S.burn ? Math.min(m.speed + S.accel * dt, S.vmax) : Math.max(m.speed - 55 * dt, 200);
      const t = m.target;
      if (t && t.alive && !t.dying) {
        _ml.subVectors(t.pos, m.pos);
        const dist = _ml.length();
        if (m.dir.angleTo(_ml) > 1.35 && m.age > 1) m.target = null;          // target left the seeker gimbal limit
        else {
          if (S.seeker === 'radar' && t.kind === 'plane') {
            m.losT -= dt;
            if (m.losT <= 0) { m.losT = 0.3; m.los = losClear(m.pos, t.pos); }
            if (!m.los) m.lostT += dt; else m.lostT = Math.max(0, m.lostT - dt * 0.5);
            const vl = t.vel.length();
            if (vl > 1) {                                                         // doppler notch: target crossing the missile's view near the ground
              const beam = 1 - Math.abs(t.vel.dot(_ml) / (vl * dist));
              if (beam > 0.88 && t.pos.y - groundAt(t.pos.x, t.pos.z) < 3500) m.lostT += dt * 0.7;
            }
            if (m.lostT > S.hold) { m.target = null; if (t === player || t === wingman) radio(t.name, '雷达弹丢失目标！', '#9fd4ff'); }
          }
          if (m.target) {
            const tgo = dist / Math.max(m.speed, 300);
            _md.copy(t.pos).addScaledVector(t.vel || ZERO, tgo).sub(m.pos).normalize();
            const ang = m.dir.angleTo(_md);
            _a.crossVectors(m.dir, _md);
            const turn = S.turn * clamp(m.speed / 600, 0.4, 1.2);
            if (ang > 1e-4 && _a.lengthSq() > 1e-12) m.dir.applyAxisAngle(_a.normalize(), Math.min(ang, turn * dt)).normalize();
          }
        }
      }
      m.vel.copy(m.dir).multiplyScalar(m.speed);
      m.pos.addScaledVector(m.vel, dt);
      for (let k = 0; k < 2; k++) {
        _a.lerpVectors(m.prev, m.pos, k / 2).addScaledVector(m.dir, -2);
        smoke.emit(_a.x, _a.y, _a.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(2.6, 3.6), 1.6, S.seeker === 'ir' ? rand(5, 8) : rand(7, 11), 0.86, 0.87, 0.88, 0.55, 0.4, -0.5);
      }
      _a.copy(m.pos).addScaledVector(m.dir, -2.1);
      fire.emit(_a.x, _a.y, _a.z, m.vel.x * 0.8, m.vel.y * 0.8, m.vel.z * 0.8, 0.06, 3.4, 1.2, 1.5, 1.2, 0.8, 1);
    }
    m.mesh.position.copy(m.pos);
    m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.age < m.drop ? _d.copy(m.vel).normalize() : m.dir);
    let boom = false;
    const t = m.target;
    if (m.age > 0.5 && t && t.alive && !t.dying && segDist(m.prev, m.pos, t.pos) < S.fuse + (t.radius || 0) * 0.5) {
      boom = true;
      applyDamage(t, S.dmg, { owner: m.owner, kind: 'missile', name: S.name });
    }
    if (!boom && m.age > 0.5) {
      for (const e of (m.team === 'blue' ? redAir() : blueTeam())) if (segDist(m.prev, m.pos, e.pos) < 12 + e.radius * 0.4) { applyDamage(e, S.dmg, { owner: m.owner, kind: 'missile', name: S.name }); boom = true; break; }
    }
    if (m.age > S.life || m.pos.y < terrainH(m.pos.x, m.pos.z) || m.pos.y < 0) boom = true;
    if (boom) { explode(m.pos, 0.6, null); scene.remove(m.mesh); m.alive = false; missiles.splice(i, 1); }
  }
}
function updateFlares(dt) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i];
    f.vel.multiplyScalar(Math.exp(-dt * 1.2)); f.vel.y -= 18 * dt;
    f.pos.addScaledVector(f.vel, dt);
    f.life -= dt;
    fire.emit(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 0.1, 7, 3, 1.6, 1.4, 1.1, 1);
    smoke.emit(f.pos.x, f.pos.y, f.pos.z, 0, 1, 0, 2.2, 1.5, 7, 0.88, 0.88, 0.9, 0.45, 0.5);
    if (f.life <= 0) { f.alive = false; flares.splice(i, 1); }
  }
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.vel.y -= 14 * dt; d.vel.multiplyScalar(Math.exp(-dt * 0.4));
    d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt;
    d.life -= dt;
    const p = d.mesh.position;
    fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 3, 6, 1.3, 0.7, 0.3, 0.8);
    smoke.emit(p.x, p.y, p.z, 0, 1, 0, 2, 2, 12, 0.14, 0.14, 0.15, 0.6, 0.6);
    if (d.life <= 0 || p.y < groundAt(p.x, p.z)) { scene.remove(d.mesh); debris.splice(i, 1); }
  }
}

/* ---------- camera ---------- */
const camTarget = new V3(), chasePos = new V3(), chaseLook = new V3(), chaseUp = new V3(), padPos = new V3(), padLook = new V3();
function nearestHostile() {
  let bestE = null, bd = 1e9;
  for (const e of redAir()) { const d = e.pos.distanceTo(player.pos); if (d < bd) { bd = d; bestE = e; } }
  return bestE;
}
function updateCamera(dt, mode) {
  const p = player;
  if (mode === 'menu') {
    game.menuA += dt * 0.12;
    const off = new V3(Math.cos(game.menuA) * 34, 6 + Math.sin(game.menuA * 0.7) * 3, Math.sin(game.menuA) * 34)
      .applyQuaternion(_q.setFromAxisAngle(Y_AXIS, Math.atan2(-p.fwd.z, p.fwd.x)));
    camera.position.copy(p.pos).add(off);
    camera.up.copy(Y_AXIS);
    camera.lookAt(camTarget.copy(p.pos).addScaledVector(p.fwd, 4));
    fov = 50;
  } else if (mode === 'dead') {
    game.menuA += dt * 0.25;
    camera.position.copy(p.pos).add(new V3(Math.cos(game.menuA) * 140, 60, Math.sin(game.menuA) * 140));
    camera.up.copy(Y_AXIS);
    camera.lookAt(p.pos);
  } else {
    camQ.slerp(p.q, 1 - Math.exp(-dt * 4.5));
    const back = _a.set(-1, 0, 0).applyQuaternion(camQ), up = _b.set(0, 1, 0).applyQuaternion(camQ), fw = _c.set(1, 0, 0).applyQuaternion(camQ);
    camDist += ((p.boost ? 31 : 25) - camDist) * (1 - Math.exp(-dt * 2));
    chasePos.copy(p.pos).addScaledVector(back, camDist).addScaledVector(up, 6.2);
    chaseLook.copy(p.pos).addScaledVector(fw, 30).addScaledVector(up, 2.4);
    chaseUp.copy(up);
    // padlock view keeps the jet in front of the camera and the target beyond it
    const tgt = game.lock.target || (game.ai && p.pilot.target) || nearestHostile();
    game.padBlend += ((game.padlock && tgt ? 1 : 0) - game.padBlend) * (1 - Math.exp(-dt * 4));
    let pb = game.padBlend;
    if (tgt && pb > 0.001) {
      const away = _d.subVectors(p.pos, tgt.pos).normalize();
      padPos.copy(p.pos).addScaledVector(away, 34).addScaledVector(Y_AXIS, 8);
      padLook.copy(p.pos).addScaledVector(away, -60);
    } else pb = 0;
    camera.position.copy(chasePos).lerp(padPos, pb);
    camera.up.copy(chaseUp).lerp(Y_AXIS, pb).normalize();
    camera.lookAt(camTarget.copy(chaseLook).lerp(padLook, pb));
    fov += ((p.boost ? 72 : 62) - fov) * (1 - Math.exp(-dt * 2));
  }
  const floor = groundAt(camera.position.x, camera.position.z) + 3;
  if (camera.position.y < floor) camera.position.y = floor;
  if (game.shake > 0.01 && !reduced) {
    const s = game.shake;
    camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
    game.shake *= Math.exp(-dt * 6);
  }
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  sunLight.target.position.copy(p.pos);
  sunLight.position.copy(p.pos).addScaledVector(SUN, 100);
}

/* ---------- HUD ---------- */
const hud = $('hud'), hc = hud.getContext('2d');
let HW = 0, HH = 0, HDPR = 1;
const HUDC = '#8dffb4', WARN = '#ff5a4f', GOLD = '#e3b257', BLUE = '#8fc8ff', AMBER = '#ffc861';
const MONO = '"IBM Plex Mono", ui-monospace, monospace', SANS = '"Noto Sans SC", "PingFang SC", sans-serif';
const _p = new V3();
function proj(v) {
  _p.copy(v).project(camera);
  return { x: (_p.x + 1) / 2 * HW, y: (1 - _p.y) / 2 * HH, behind: _p.z > 1, ndc: [_p.x, _p.y] };
}
const onScreen = pp => !pp.behind && pp.x > 0 && pp.x < HW && pp.y > 0 && pp.y < HH;
function edgeArrow(v, color, label) {
  const pp = proj(v);
  let nx = pp.ndc[0], ny = pp.ndc[1];
  if (pp.behind) { nx = -nx; ny = -ny; }
  const ang = Math.atan2(-ny, nx), cx = HW / 2, cy = HH / 2, rx = HW / 2 - 70, ry = HH / 2 - 70;
  const k = 1 / Math.max(Math.abs(Math.cos(ang)) / rx, Math.abs(Math.sin(ang)) / ry);
  const x = cx + Math.cos(ang) * k, y = cy + Math.sin(ang) * k;
  hc.save();
  hc.fillStyle = color;
  if (label) { hc.font = `600 11px ${MONO}`; hc.textAlign = 'center'; hc.fillText(label, x - Math.cos(ang) * 26, y - Math.sin(ang) * 26 + 4); }
  hc.translate(x, y); hc.rotate(ang);
  hc.beginPath(); hc.moveTo(16, 0); hc.lineTo(-6, -10); hc.lineTo(-2, 0); hc.lineTo(-6, 10); hc.closePath(); hc.fill();
  hc.restore();
}
function bar(x, y, w, v, col) {
  hc.strokeRect(x, y, w, 7);
  hc.save(); hc.fillStyle = col; hc.fillRect(x + 1.5, y + 1.5, (w - 3) * clamp(v, 0, 1), 4); hc.restore();
}
function drawHUD(dt) {
  hc.setTransform(HDPR, 0, 0, HDPR, 0, 0);
  hc.clearRect(0, 0, HW, HH);
  $('gloc').style.opacity = (game.mode === 'play' ? smooth(1.8, 4, player.gStress) * 0.88 : 0).toFixed(3);
  if (game.mode !== 'play' && game.mode !== 'paused') { Sound.rwrTone(false); return; }
  const p = player, L = game.lock, compact = HH < 480, cx = HW / 2, cy = HH / 2;
  hc.lineWidth = 1.5; hc.strokeStyle = HUDC; hc.fillStyle = HUDC;
  if (HQ()) { hc.shadowColor = 'rgba(141,255,180,0.6)'; hc.shadowBlur = 4; }

  // pitch ladder around the flight path marker
  {
    const fh = new V3(p.fwd.x, 0, p.fwd.z);
    if (fh.lengthSq() < 1e-6) fh.set(1, 0, 0);
    fh.normalize();
    const rh = new V3(-fh.z, 0, fh.x), centre = new V3(), tmp = new V3();
    const pitchDeg = Math.asin(clamp(p.fwd.y, -1, 1)) * 180 / Math.PI;
    hc.save(); hc.globalAlpha = 0.75; hc.font = `500 10px ${MONO}`;
    for (let a = Math.ceil((pitchDeg - 22) / 10) * 10; a <= pitchDeg + 22; a += 10) {
      if (a < -90 || a > 90) continue;
      const r = a * Math.PI / 180;
      centre.copy(fh).multiplyScalar(Math.cos(r)).addScaledVector(Y_AXIS, Math.sin(r)).multiplyScalar(1000).add(p.pos);
      const c0 = proj(centre);
      if (c0.behind) continue;
      const e1 = proj(tmp.copy(centre).addScaledVector(rh, 90)), e2 = proj(tmp.copy(centre).addScaledVector(rh, -90));
      const g1 = proj(tmp.copy(centre).addScaledVector(rh, 26)), g2 = proj(tmp.copy(centre).addScaledVector(rh, -26));
      hc.setLineDash(a < 0 ? [6, 5] : []);
      hc.beginPath();
      if (a === 0) { hc.moveTo(e1.x * 1.6 - c0.x * 0.6, e1.y * 1.6 - c0.y * 0.6); hc.lineTo(e2.x * 1.6 - c0.x * 0.6, e2.y * 1.6 - c0.y * 0.6); }
      else { hc.moveTo(e1.x, e1.y); hc.lineTo(g1.x, g1.y); hc.moveTo(g2.x, g2.y); hc.lineTo(e2.x, e2.y); }
      hc.stroke();
      if (a !== 0) { hc.textAlign = 'left'; hc.fillText(String(Math.abs(a)), e1.x + 4, e1.y + 3); }
    }
    hc.setLineDash([]); hc.restore();
    // flight path marker: where the jet is actually going
    const fp = proj(tmp.copy(p.pos).addScaledVector(p.fwd, 1000));
    if (!fp.behind) {
      hc.beginPath(); hc.arc(fp.x, fp.y, 6, 0, Math.PI * 2);
      hc.moveTo(fp.x - 6, fp.y); hc.lineTo(fp.x - 16, fp.y); hc.moveTo(fp.x + 6, fp.y); hc.lineTo(fp.x + 16, fp.y);
      hc.moveTo(fp.x, fp.y - 6); hc.lineTo(fp.x, fp.y - 12); hc.stroke();
    }
  }
  // gun boresight along the nose, and the gun pipper
  const bs = proj(_a.copy(p.pos).addScaledVector(p.nose(new V3()), 700));
  if (!bs.behind) {
    hc.beginPath(); hc.arc(bs.x, bs.y, 15, 0, Math.PI * 2); hc.stroke();
    hc.beginPath();
    hc.moveTo(bs.x - 26, bs.y); hc.lineTo(bs.x - 17, bs.y); hc.moveTo(bs.x + 17, bs.y); hc.lineTo(bs.x + 26, bs.y);
    hc.moveTo(bs.x, bs.y - 26); hc.lineTo(bs.x, bs.y - 17);
    hc.stroke(); hc.fillRect(bs.x - 1.5, bs.y - 1.5, 3, 3);
  }
  if (game.gunTarget && game.leadPoint) {
    const lp = proj(game.leadPoint), d = game.gunTarget.pos.distanceTo(p.pos);
    if (!lp.behind) {
      hc.save(); hc.strokeStyle = GOLD; hc.fillStyle = GOLD; hc.beginPath();
      hc.moveTo(lp.x, lp.y - 9); hc.lineTo(lp.x + 9, lp.y); hc.lineTo(lp.x, lp.y + 9); hc.lineTo(lp.x - 9, lp.y); hc.closePath();
      if (d < 1150) { hc.fill(); hc.font = `600 10px ${SANS}`; hc.textAlign = 'center'; hc.fillText('射程内', lp.x, lp.y + 22); } else hc.stroke();
      hc.restore();
    }
  }

  // targets
  const nearest = nearestHostile();
  const targets = redAir().concat(sams.filter(s => s.alive && (s.active || s.pos.distanceTo(p.pos) < 9000)));
  for (const e of targets) {
    const d = e.pos.distanceTo(p.pos), pp = proj(e.pos);
    if (!onScreen(pp)) continue;
    const isT = e === L.target, locked = isT && L.locked;
    const s = clamp((e.kind === 'sam' ? 7000 : 5200) / d, 11, e.type === 'bomber' ? 46 : 34);
    hc.save();
    hc.strokeStyle = locked ? WARN : isT ? HUDC : e.kind === 'sam' ? '#e98cff' : 'rgba(255,120,100,0.92)';
    hc.fillStyle = hc.strokeStyle;
    if (e.kind === 'sam') {
      hc.beginPath(); hc.moveTo(pp.x, pp.y - s); hc.lineTo(pp.x + s, pp.y); hc.lineTo(pp.x, pp.y + s); hc.lineTo(pp.x - s, pp.y); hc.closePath(); hc.stroke();
    } else if (locked) { hc.lineWidth = 2; hc.strokeRect(pp.x - s, pp.y - s, s * 2, s * 2); }
    else {
      const c = s * 0.7;
      hc.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { hc.moveTo(pp.x + sx * s, pp.y + sy * (s - c)); hc.lineTo(pp.x + sx * s, pp.y + sy * s); hc.lineTo(pp.x + sx * (s - c), pp.y + sy * s); }
      hc.stroke();
    }
    if (isT && !locked) {
      const r = lerp(70, s * 1.3, clamp(L.t / L.need, 0, 1));
      hc.save(); hc.translate(pp.x, pp.y); hc.rotate(game.t * 3); hc.strokeRect(-r / 1.414, -r / 1.414, r * 1.414, r * 1.414); hc.restore();
    }
    hc.font = `600 11px ${MONO}`; hc.textAlign = 'left';
    hc.fillText((d / 1000).toFixed(1), pp.x + s + 5, pp.y + s);
    if (isT || d < 2500) { hc.font = `500 11px ${SANS}`; hc.fillText(e.kind === 'sam' ? 'SAM' : e.T.name, pp.x + s + 5, pp.y - s + 10); }
    if (locked) { hc.font = `700 12px ${SANS}`; hc.textAlign = 'center'; hc.fillText(`锁定 ${MSL[L.kind].name}`, pp.x, pp.y - s - 7); }
    if (e.hp < e.maxHp) hc.fillRect(pp.x - s, pp.y + s + 5, (s * 2) * Math.max(e.hp, 0) / e.maxHp, 2.5);
    hc.restore();
  }
  if (wingman && wingman.alive && !wingman.dying) {
    const pp = proj(wingman.pos);
    if (onScreen(pp)) {
      hc.save(); hc.strokeStyle = BLUE; hc.fillStyle = BLUE;
      hc.beginPath(); hc.moveTo(pp.x - 9, pp.y - 4); hc.lineTo(pp.x, pp.y + 4); hc.lineTo(pp.x + 9, pp.y - 4); hc.stroke();
      hc.font = `500 10px ${MONO}`; hc.textAlign = 'center'; hc.fillText('R2', pp.x, pp.y + 17); hc.restore();
    }
  }
  const offT = L.target || nearest;
  if (offT && !onScreen(proj(offT.pos))) edgeArrow(offT.pos, 'rgba(255,120,100,0.95)', (offT.pos.distanceTo(p.pos) / 1000).toFixed(1));

  // missile warning and radar warning receiver
  const threats = missiles.filter(m => m.alive && m.target === p);
  let tm = null, td = 1e9;
  for (const m of threats) { const dd = m.pos.distanceTo(p.pos); if (dd < td) { td = dd; tm = m; } }
  if (tm) {
    for (const m of threats) edgeArrow(m.pos, WARN, (m.pos.distanceTo(p.pos) / 1000).toFixed(1));
    if (Math.floor(game.t * 6) % 2 === 0) {
      hc.save(); hc.fillStyle = WARN; hc.font = `800 ${compact ? 20 : 26}px ${SANS}`; hc.textAlign = 'center';
      hc.fillText(`导弹来袭 · ${tm.spec.seeker === 'ir' ? '红外' : '雷达'}`, cx, HH * 0.3); hc.restore();
    }
    game.warnBeep -= dt;
    if (game.warnBeep <= 0) { Sound.beep(td < 1200 ? 1300 : 950, 0.06, 0.06); game.warnBeep = td < 1200 ? 0.1 : 0.22; }
  }
  const emitters = redAir().filter(e => e.painting).concat(sams.filter(s => s.alive && s.painting));
  game.painted = emitters.length > 0;
  Sound.rwrTone(game.painted && !tm);
  if (game.painted && !tm) {
    hc.save(); hc.fillStyle = AMBER; hc.font = `700 ${compact ? 15 : 18}px ${SANS}`; hc.textAlign = 'center';
    hc.fillText('雷达照射', cx, HH * 0.3); hc.restore();
  }

  // speed and altitude
  // on touch screens the boxes sit higher and closer in so the thumb buttons stay clear
  const boxY = isTouch ? cy - 70 : cy - 14, gap = isTouch ? Math.min(HW * 0.2, 190) : Math.min(HW * 0.3, 260);
  hc.font = `600 ${compact ? 16 : 18}px ${MONO}`;
  hc.textAlign = 'right'; hc.strokeRect(cx - gap - 84, boxY, 84, 28); hc.fillText(String(Math.round(p.speed * 3.6)), cx - gap - 8, boxY + 20);
  hc.textAlign = 'left'; hc.strokeRect(cx + gap, boxY, 84, 28); hc.fillText(String(Math.round(p.pos.y)), cx + gap + 8, boxY + 20);
  hc.font = `500 10px ${MONO}`;
  hc.textAlign = 'right'; hc.fillText('KM/H', cx - gap, boxY - 6); hc.fillText(`M ${(p.speed / 340).toFixed(2)}`, cx - gap, boxY + 44);
  hc.save(); if (p.g > 8) hc.fillStyle = WARN; hc.fillText(`G ${p.g.toFixed(1)}`, cx - gap, boxY + 58); hc.fillText(`α ${(p.alpha * 180 / Math.PI).toFixed(0)}°`, cx - gap, boxY + 72); hc.restore();
  hc.textAlign = 'left'; hc.fillText('ALT M', cx + gap, boxY - 6); hc.fillText(`AGL ${Math.max(0, Math.round(game.agl || 0))}`, cx + gap, boxY + 44);
  const tags = [p.boost && '加力', p.c.tvc && '矢量', p.c.brake && '减速板'].filter(Boolean);
  hc.save(); hc.fillStyle = GOLD; hc.font = `700 11px ${SANS}`; hc.textAlign = 'right';
  tags.forEach((t, i) => hc.fillText(t, cx - gap - 90, boxY + 19 + i * 15)); hc.restore();

  // heading tape
  const hdg = ((Math.atan2(p.fwd.x, -p.fwd.z) * 180 / Math.PI) + 360) % 360, tapeY = compact ? 26 : 34, ppd = 4;
  hc.save(); hc.beginPath(); hc.rect(cx - 150, tapeY - 18, 300, 40); hc.clip();
  hc.font = `500 11px ${MONO}`; hc.textAlign = 'center';
  for (let d = Math.floor((hdg - 40) / 5) * 5; d <= hdg + 40; d += 5) {
    const x = cx + (d - hdg) * ppd, dd = ((d % 360) + 360) % 360;
    hc.beginPath(); hc.moveTo(x, tapeY); hc.lineTo(x, tapeY + (dd % 10 === 0 ? 8 : 4)); hc.stroke();
    if (dd % 30 === 0) hc.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] || String(dd / 10).padStart(2, '0'), x, tapeY - 4);
  }
  hc.restore();
  hc.beginPath(); hc.moveTo(cx, tapeY + 11); hc.lineTo(cx - 5, tapeY + 18); hc.lineTo(cx + 5, tapeY + 18); hc.closePath(); hc.fill();
  if (game.ai) {
    hc.save(); hc.fillStyle = GOLD; hc.font = `700 ${compact ? 12 : 13}px ${SANS}`; hc.textAlign = 'center';
    hc.fillText(game.aiOverride > 0 ? 'AI 自动空战 · 手动接管中' : `AI 自动空战 · ${MODE_TEXT[p.pilot.mode] || ''}`, cx, tapeY + 36);
    hc.restore();
  }

  // status block
  const sx = 16, sy = compact ? 18 : 22;
  hc.textAlign = 'left';
  hc.font = `700 ${compact ? 15 : 17}px ${MONO}`; hc.fillText(String(game.score).padStart(6, '0'), sx, sy + 6);
  hc.font = `500 11px ${SANS}`;
  hc.fillText(`第 ${game.wave} 波 · 剩余 ${redAir().length} 架`, sx, sy + 24);
  bar(sx, sy + 34, 120, p.hp / 100, p.hp > 40 ? HUDC : WARN);
  hc.font = `500 10px ${MONO}`; hc.fillText(`机体 ${Math.max(0, Math.round(p.hp))}%`, sx + 128, sy + 41);
  const sel = L.target ? L.kind : null;
  hc.fillText(`机炮 ${p.ammo}  ${sel === 'aim9' ? '▸' : ''}AIM-9X ${p.srm}  ${sel === 'aim120' ? '▸' : ''}AIM-120 ${p.mrm}  干扰 ${p.cm}`, sx, sy + 56);
  let ly = sy + 72;
  if (base.hp < 100 || enemies.some(e => e.type === 'bomber' && e.alive && !e.dying)) {
    bar(sx, ly - 7, 120, base.hp / 100, base.hp > 40 ? AMBER : WARN);
    hc.fillText(`基地 ${base.hp}%`, sx + 128, ly); ly += 16;
  }
  if (wingman && settings.wingman) {
    hc.save(); hc.fillStyle = BLUE;
    hc.fillText(wingman.alive && !wingman.dying ? `僚机 R2 · ${MODE_TEXT[wingman.pilot.mode] || ''}` : '僚机 R2 · 已损失', sx, ly);
    hc.restore();
  }

  // radar (6 km, heading up) with the RWR ring around it
  const R = compact ? 46 : 58, rx = HW - R - 16, ry = R + (compact ? 14 : 18), range = 6000;
  hc.save();
  hc.fillStyle = 'rgba(6,14,12,0.45)'; hc.beginPath(); hc.arc(rx, ry, R, 0, Math.PI * 2); hc.fill(); hc.stroke();
  hc.globalAlpha = 0.35; hc.beginPath(); hc.arc(rx, ry, R / 2, 0, Math.PI * 2); hc.stroke(); hc.globalAlpha = 1;
  const fl = Math.hypot(p.fwd.x, p.fwd.z) || 1, hx = p.fwd.x / fl, hz = p.fwd.z / fl;
  const rel = (wx, wz) => { const dx = wx - p.pos.x, dz = wz - p.pos.z; return [dx * -hz + dz * hx, dx * hx + dz * hz]; };
  const dot = (wx, wz, col, r) => {
    let [s, f] = rel(wx, wz); s /= range; f /= range;
    const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
    hc.fillStyle = col; hc.beginPath(); hc.arc(rx + s * R, ry - f * R, r, 0, Math.PI * 2); hc.fill();
  };
  for (const e of redAir()) dot(e.pos.x, e.pos.z, e === L.target ? WARN : e.type === 'bomber' ? '#ffb070' : '#ff8a78', e.type === 'bomber' ? 4 : 3);
  for (const s of sams) if (s.alive && s.active) dot(s.pos.x, s.pos.z, '#e98cff', 2.5);
  if (wingman && wingman.alive && !wingman.dying) dot(wingman.pos.x, wingman.pos.z, BLUE, 3);
  dot(base.x, base.z, AMBER, 2.5);
  for (const m of missiles) if (m.alive) dot(m.pos.x, m.pos.z, m.target === p ? WARN : '#ffffff', 1.6);
  hc.font = `700 9px ${MONO}`; hc.textAlign = 'center';
  for (const e of emitters) {
    const [s, f] = rel(e.pos.x, e.pos.z), a = Math.atan2(s, f);
    hc.fillStyle = AMBER; hc.fillText(e.kind === 'sam' ? 'SA' : (e.T.rwr || '??'), rx + Math.sin(a) * (R + 9), ry - Math.cos(a) * (R + 9) + 3);
  }
  for (const m of threats) { const [s, f] = rel(m.pos.x, m.pos.z), a = Math.atan2(s, f); hc.fillStyle = WARN; hc.fillText('M', rx + Math.sin(a) * (R + 9), ry - Math.cos(a) * (R + 9) + 3); }
  hc.fillStyle = HUDC; hc.beginPath(); hc.moveTo(rx, ry - 6); hc.lineTo(rx - 4, ry + 4); hc.lineTo(rx + 4, ry + 4); hc.closePath(); hc.fill();
  hc.restore();

  // warnings
  const warns = [];
  if ((game.agl ?? 1e9) < 350 && p.fwd.y < -0.05) warns.push('拉起');
  if (p.stall) warns.push('失速');
  if (p.gStress > 2.4) warns.push('过载 · 视野变窄');
  if (game.out) warns.push('返回作战空域');
  if (p.ammo <= 0 && p.srm + p.mrm === 0) warns.push('弹药耗尽');
  if (warns.length && Math.floor(game.t * 4) % 2 === 0) {
    hc.save(); hc.fillStyle = WARN; hc.font = `800 ${compact ? 17 : 21}px ${SANS}`; hc.textAlign = 'center';
    warns.forEach((w, i) => hc.fillText(w, cx, HH * 0.66 + i * 26)); hc.restore();
  }

  // messages and radio
  let my = HH * (compact ? 0.2 : 0.22);
  hc.textAlign = 'center';
  for (const m of game.msgs) {
    hc.globalAlpha = clamp(m.t / 0.4, 0, 1); hc.fillStyle = m.color;
    hc.font = `800 ${compact ? 18 : 22}px ${SANS}`; hc.fillText(m.text, cx, my);
    if (m.sub) { hc.font = `500 12px ${SANS}`; hc.fillText(m.sub, cx, my + 18); }
    my += m.sub ? 44 : 30;
  }
  hc.globalAlpha = 1;
  hc.textAlign = 'left';
  let ry2 = HH - (isTouch ? (compact ? 128 : 150) : 60) - (game.radio.length - 1) * 17;
  const rxl = isTouch ? HW * 0.3 : 16;
  for (const r of game.radio) {
    hc.globalAlpha = clamp(r.t / 0.5, 0, 1);
    hc.font = `600 11px ${MONO}`; hc.fillStyle = r.color; hc.fillText(`${r.from}：`, rxl, ry2);
    const wdt = hc.measureText(`${r.from}：`).width;
    hc.font = `500 12px ${SANS}`; hc.fillStyle = '#e9f2f7'; hc.fillText(r.text, rxl + wdt, ry2);
    ry2 += 17;
  }
  hc.globalAlpha = 1;
  hc.shadowBlur = 0;
}

/* ---------- flow ---------- */
const screens = { menu: $('menu'), pause: $('pause'), over: $('over') };
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  const playing = name === null;
  $('touch').hidden = !(playing && isTouch);
  $('b-pause').hidden = !playing;
  $('b-ai').hidden = !playing;
}
function resetPlayer() {
  Object.assign(player, { speed: 150, hp: 100, alive: true, dying: false, srm: 2, mrm: 6, ammo: 480, cm: 30, gStress: 0, authority: 1, boost: false });
  player.pilot = new Pilot(player, 1.0);
  player.pos.set(base.x + 1650, base.y + 60, base.z);
  setBasis(player.q, new V3(1, 0.17, 0).normalize(), Y_AXIS);
  player.axes(); player.integrate(0);
  playerJet.group.visible = true;
  camQ.copy(player.q);
}
function clearWorld() {
  for (const e of enemies) scene.remove(e.obj);
  if (wingman) scene.remove(wingman.obj);
  for (const m of missiles) scene.remove(m.mesh);
  for (const d of debris) scene.remove(d.mesh);
  enemies = []; wingman = null; missiles.length = 0; bullets.length = 0; flares.length = 0; debris.length = 0;
  fire.clear(); smoke.clear(); tracerMesh.count = 0;
  for (const s of sams) { s.alive = true; s.hp = s.maxHp; s.lockT = 0; s.active = false; s.burnT = 0; s.group.scale.set(1, 1, 1); s.group.rotation.z = 0; }
  base.hp = 100;
}
function startGame(withAI = false) {
  Sound.init();
  clearWorld();
  resetPlayer();
  Object.assign(game, { mode: 'play', score: 0, kills: 0, wave: 0, waveClear: 6, msgs: [], radio: [], combo: 0, comboT: 0,
    bayT: 0, bay: 0, sideT: 0, side: 0, mslCd: 0, flash: 0, shake: 0, ai: withAI, aiOverride: 0, padlock: false, padBlend: 0,
    slowT: 0, slowCd: 0, pending: [], gear: 1, gearT: 2.2 });
  game.lock = { target: null, t: 0, locked: false, kind: 'aim120', need: 1, los: true, losT: 0 };
  $('b-cam').classList.remove('on');
  if (settings.wingman) {
    spawnWingman(player);
    wingman.pos.addScaledVector(player.fwd, -260).addScaledVector(Y_AXIS, 40);
    wingman.sync();
  }
  radio('塔台', 'Raptor 1，起飞许可。祝好运。', '#ffd28a');
  message('紧急起飞', withAI ? 'AI 自动空战已接管 · 拖动摇杆可随时接管' : '爬升，向东出海迎敌', '#e3b257', 3);
  updateAIButton();
  show(null);
  if (isTouch) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    screen.orientation?.lock?.('landscape').catch(() => {});
    if (innerHeight > innerWidth) toast('横屏游玩体验更佳', 3500);
  }
  navigator.wakeLock?.request?.('screen').catch(() => {});
}
function toMenu() {
  clearWorld();
  resetPlayer();
  player.pos.set(base.x + 2500, 1500, base.z + 1800);
  player.speed = 230;
  playerJet.setGear(1);
  game.mode = 'menu'; game.ai = false;
  Sound.engine(0, 0, false); Sound.lockTone(false); Sound.rwrTone(false);
  $('best').textContent = best;
  show('menu');
}
function togglePause() {
  if (game.mode === 'play') { game.mode = 'paused'; show('pause'); Sound.engine(0, 0, false); Sound.lockTone(false); Sound.rwrTone(false); Sound.ctx?.suspend?.(); }
  else if (game.mode === 'paused') { game.mode = 'play'; show(null); Sound.ctx?.resume?.(); }
}
function toggleAI() {
  if (game.mode !== 'play') return;
  game.ai = !game.ai;
  player.pilot.think = 0;
  message(game.ai ? 'AI 自动空战 开启' : 'AI 自动空战 关闭', game.ai ? '拖动摇杆可随时临时接管' : '你有控制权', '#e3b257', 1.8);
  updateAIButton();
}
function updateAIButton() { const b = $('b-ai'); b.classList.toggle('on', game.ai); b.setAttribute('aria-pressed', String(game.ai)); }
function togglePadlock() { game.padlock = !game.padlock; $('b-cam').classList.toggle('on', game.padlock); }
function gameOver() {
  game.mode = 'over';
  Sound.engine(0, 0, false); Sound.lockTone(false); Sound.rwrTone(false);
  if (game.score > best) { best = game.score; store.set('best', best); }
  $('over-title').textContent = game.cause || '被击落';
  $('over-tag').textContent = game.score >= best && game.score > 0 ? '新纪录' : '任务结束';
  $('o-score').textContent = game.score; $('o-kills').textContent = game.kills; $('o-wave').textContent = game.wave; $('o-best').textContent = best;
  show('over');
}
let toastTimer = 0;
function toast(text, ms) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }

$('b-start').onclick = () => startGame(false);
$('b-watch').onclick = () => startGame(true);
$('b-again').onclick = () => startGame(game.ai);
$('b-restart').onclick = () => { Sound.ctx?.resume?.(); startGame(game.ai); };
$('b-resume').onclick = togglePause;
$('b-quit').onclick = () => { Sound.ctx?.resume?.(); toMenu(); };
$('b-home').onclick = toMenu;
$('b-pause').onclick = togglePause;
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'play') togglePause(); });

const TIME_ORDER = ['dusk', 'dawn', 'noon'];
function renderSettings() {
  $('s-invert').querySelector('b').textContent = settings.invert ? '上推俯冲' : '上推爬升';
  $('s-quality').querySelector('b').textContent = HQ() ? '高' : '流畅';
  $('s-sound').querySelector('b').textContent = settings.sound ? '开' : '关';
  $('s-time').querySelector('b').textContent = world.TIMES[settings.time].label;
  $('s-wing').querySelector('b').textContent = settings.wingman ? '开' : '关';
}
$('s-invert').onclick = () => { settings.invert = !settings.invert; store.set('invert', settings.invert); renderSettings(); };
$('s-sound').onclick = () => { settings.sound = !settings.sound; store.set('sound', settings.sound); Sound.setVolume(settings.sound); renderSettings(); };
$('s-quality').onclick = () => { settings.quality = HQ() ? 'low' : 'high'; store.set('quality', settings.quality); applyQuality(); renderSettings(); };
$('s-time').onclick = () => { settings.time = TIME_ORDER[(TIME_ORDER.indexOf(settings.time) + 1) % TIME_ORDER.length]; store.set('time', settings.time); world.setTime(settings.time); renderSettings(); };
$('s-wing').onclick = () => { settings.wingman = !settings.wingman; store.set('wingman', settings.wingman); renderSettings(); };
function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, HQ() ? 2 : 1.25));
  sunLight.castShadow = HQ();
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  HDPR = Math.min(devicePixelRatio, 2); HW = w; HH = h;
  hud.width = Math.round(w * HDPR); hud.height = Math.round(h * HDPR);
  const scale = renderer.domElement.height * camera.projectionMatrix.elements[5] * 0.5;
  fire.mat.uniforms.uScale.value = scale; smoke.mat.uniforms.uScale.value = scale;
}
addEventListener('resize', resize);

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), 0.05);
  if (game.mode === 'paused') { renderer.render(scene, camera); return; }
  game.slowT -= rdt; game.slowCd -= rdt;
  update(game.slowT > 0 ? rdt * 0.3 : rdt);
  renderer.render(scene, camera);
  drawHUD(rdt);
}
function update(dt) {
  game.t += dt;
  world.update(game.t);
  if (game.mode === 'menu') {
    player.axes();
    const bank = 0.35 + Math.sin(game.t * 0.2) * 0.15;
    const desired = player.fwd.clone().applyAxisAngle(Y_AXIS, 0.08 * dt * 10).setY((1500 - player.pos.y) / 4000).normalize();
    const nf = player.fwd.clone().lerp(desired, 0.5).normalize();
    setBasis(player.q, nf, player.up.clone().lerp(new V3(0, 1, 0).applyAxisAngle(nf, bank), 0.05));
    player.axes();
    player.speed = 230;
    player.integrate(dt);
    playerJet.pose({ pitch: 0.05, roll: Math.sin(game.t * 0.4) * 0.15 });
    playerJet.setAB(0.2, game.t);
    playerJet.setBay(0); playerJet.setSideBay(0);
  } else if (game.mode === 'play') {
    updatePlayer(dt);
    Sound.engine(player.c.brake ? 0.2 : 0.65, player.boost ? 1 : 0, player.alive);
    if (game.waveClear > 0) {
      game.waveClear -= dt;
      if (game.waveClear <= 0) startWave(game.wave + 1);
    } else if (!enemies.some(e => e.alive && !e.dying)) {
      const bonus = 300 * game.wave + (base.hp === 100 ? 200 : 0);
      game.score += bonus;
      player.hp = Math.min(100, player.hp + 30);
      Object.assign(player, { ammo: 480, srm: 2, mrm: 6, cm: 30 });
      if (wingman) Object.assign(wingman, { ammo: 480, srm: 2, mrm: 6, cm: 30, hp: Math.min(100, wingman.hp + 30) });
      message('空域清空', `奖励 +${bonus} · 补给完成 · 机体修复`, '#e3b257', 3);
      radio('预警机', '空域清空，干得漂亮。下一波正在集结。', '#ffd28a');
      game.waveClear = 5;
    }
    game.comboT -= dt;
  } else if (game.mode === 'dead') {
    game.deadT -= dt;
    if (game.deadT <= 0) gameOver();
  }
  if (game.mode === 'play' || game.mode === 'dead' || game.mode === 'over') {
    for (const e of enemies) if (e.alive) updateAI(e, dt);
    enemies = enemies.filter(e => e.alive);
    if (wingman && wingman.alive) updateAI(wingman, dt);
    updateSams(dt);
    updateBullets(dt); updateMissiles(dt); updateFlares(dt); updateDebris(dt);
    for (let i = game.pending.length - 1; i >= 0; i--) {
      const b = game.pending[i];
      b.t -= dt;
      if (b.t <= 0) { b.pos.y = groundAt(b.pos.x, b.pos.z) + 4; explode(b.pos, 1.2, null); game.pending.splice(i, 1); }
    }
  }
  for (const m of game.msgs) m.t -= dt;
  game.msgs = game.msgs.filter(m => m.t > 0);
  for (const r of game.radio) r.t -= dt;
  game.radio = game.radio.filter(r => r.t > 0);
  game.flash = Math.max(0, game.flash - dt * 1.4);
  $('flash').style.opacity = game.flash.toFixed(3);
  $('msl-n').textContent = player.srm + player.mrm; $('flr-n').textContent = player.cm;
  fire.update(dt); smoke.update(dt);
  updateCamera(dt, game.mode === 'menu' ? 'menu' : (game.mode === 'dead' || game.mode === 'over') ? 'dead' : 'play');
}

/* ---------- boot ---------- */
renderSettings();
applyQuality();
toMenu();
camera.position.set(player.pos.x + 30, player.pos.y + 6, player.pos.z);
clock.getDelta();
frame();
window.__raptorReady = true;
$('loading').hidden = true;
window.__raptor = { game, player, get wingman() { return wingman; }, enemies: () => enemies, missiles, sams, base, startGame, input, update, toggleAI };
