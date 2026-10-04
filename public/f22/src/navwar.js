import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*@MODEL@*/
/*@AIRCRAFT@*/
/*@WORLD@*/
/*@NAVY@*/
/*@NAVYHD@*/

/* =========================================================
   南海决战: a what-if sea-and-air battle between two carrier groups.
   World: metres, y up, sea level 0. Units: +x nose / bow, +y up, +z right / starboard.
   Every unit (ships, aircraft, missiles) runs the same rules for both sides; each side's
   AI commander and the player issue orders through those rules.
   Sensors respect the radar horizon; weapons fire only on tracks in the side's picture.
   ========================================================= */
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const X_AXIS = new V3(1, 0, 0), Y_AXIS = new V3(0, 1, 0), Z_AXIS = new V3(0, 0, 1), ZERO = new V3();
const D2R = Math.PI / 180;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const _qA = new Q(), _q = new Q();

const store = {
  get(k, d) { try { const v = localStorage.getItem('navwar.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('navwar.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const settings = {
  invert: store.get('invert', false),
  quality: store.get('quality', isTouch ? 'low' : 'high'),
  sound: store.get('sound', true),
  time: store.get('time', 'noon')
};
const HQ = () => settings.quality === 'high';

/* ---------- islands: one fortified reef with an airstrip, and a few sand cays ---------- */
const ISLANDS = [
  { x: -21000, z: -24000, rx: 2400, rz: 700, base: true, rot: 0.15 },
  { x: 6000, z: 21000, rx: 500, rz: 300 }, { x: -2000, z: -9000, rx: 300, rz: 200 }, { x: 15000, z: -20000, rx: 600, rz: 260 }
];
function terrainH(x, z) {
  let h = -60;
  for (const I of ISLANDS) {
    const c = Math.cos(I.rot || 0), s = Math.sin(I.rot || 0), dx = x - I.x, dz = z - I.z;
    const u = (dx * c + dz * s) / I.rx, v = (-dx * s + dz * c) / I.rz, d = Math.hypot(u, v);
    if (d < 1.6) h = Math.max(h, d < 1 ? (I.base ? 4 : 2.5) : lerp(I.base ? 4 : 2.5, -12, (d - 1) / 0.6));
  }
  return h;
}
const groundAt = (x, z) => Math.max(terrainH(x, z), 0);

/* ---------- renderer & world ---------- */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 1.5, 60000);
scene.add(camera);
const world = createWorld({ scene, renderer, hq: HQ(), time: settings.time, sea: true });
const { fogColor, FOG_D, SUN, sunLight } = world;
sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -60;
sunLight.shadow.camera.right = sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.far = 600;
sunLight.shadow.camera.updateProjectionMatrix();

/* ---------- particles (shared with 猛禽制空) ---------- */
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
const fire = new Particles(4000, true, world.glowTex);
const smoke = new Particles(5200, false, world.smokeTex);
// emitters near the camera get full detail; far away ones are thinned out
const near = (p, r = 6000) => p.distanceToSquared(camera.position) < r * r;

/* ---------- tracers ---------- */
const MAX_BULLETS = 700;
const tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX_BULLETS);
tracerMesh.frustumCulled = false; tracerMesh.renderOrder = 5;
for (let i = 0; i < MAX_BULLETS; i++) tracerMesh.setColorAt(i, new THREE.Color(1, 1, 1));
scene.add(tracerMesh);
const TRACER = { cn: new THREE.Color(1.7, 0.5, 0.35), us: new THREE.Color(1.6, 1.1, 0.45) };

/* ---------- sides ---------- */
const SIDES = {
  cn: {
    id: 'cn', name: '中国人民解放军海军', short: '解放军海军', color: '#ff7a6b', foe: 'us',
    perks: [
      ['饱和协同打击', '各舰反舰导弹统一时间齐射；鹰击-18 末段三倍音速突防，鹰击-21 高超音速俯冲。'],
      ['岛礁要塞', '岛礁机场起降歼-16 与轰-6K，岛上远程雷达与红旗-9 阵地扩展防御圈。'],
      ['电磁弹射', '福建舰三条电磁弹射器，满载起飞歼-15T、歼-35 与空警-600。']
    ]
  },
  us: {
    id: 'us', name: '美国海军', short: '美国海军', color: '#7fb7ff', foe: 'cn',
    perks: [
      ['协同作战能力 CEC', '舰空导弹可用 E-2D 与友舰数据拦截本舰雷达地平线以外的目标；标准-6 射程最远。'],
      ['隐身舰载航空', '福特号舰载机联队规模更大，F-35C 雷达截面极小，F/A-18E 挂载 LRASM 远程反舰导弹。'],
      ['远程轰炸', 'B-1B 编队从战区外分批突入，每架携带 4 枚 LRASM。']
    ]
  }
};
const foe = s => SIDES[s].foe;

/* ---------- aircraft ---------- */
// pitch / roll in rad/s at full stick; thrust and drag tuned so mil power cruises ~280 m/s; vs = stall speed (clean)
const AC = {
  j15:   { name: '歼-15T', side: 'cn', model: 'j15', hp: 130, radius: 9, pitch: 0.82, roll: 2.2, mil: 58, ab: 104, drag: 7.1e-4, vs: 66, rcs: 1, srm: 2, mrm: 4, srmType: 'pl10', mrmType: 'pl15', ashm: 2, ashmType: 'yj83', ammo: 150, cm: 24, radar: 42000, fuel: 1100, value: 12, gearH: 2.6, role: 'multi', cat: true },
  j35:   { name: '歼-35', side: 'cn', model: 'j35', hp: 110, radius: 7.5, pitch: 0.9, roll: 2.6, mil: 62, ab: 108, drag: 6.8e-4, vs: 62, rcs: 0.4, srm: 2, mrm: 4, srmType: 'pl10', mrmType: 'pl15', ashm: 0, ammo: 180, cm: 24, radar: 46000, fuel: 1100, value: 16, gearH: 2.3, role: 'fighter', cat: true },
  kj600: { name: '空警-600', side: 'cn', model: 'kj600', hp: 80, radius: 13, pitch: 0.3, roll: 0.8, mil: 34, ab: 34, drag: 9e-4, vs: 52, rcs: 1.3, srm: 0, mrm: 0, ashm: 0, ammo: 0, cm: 12, radar: 130000, aew: true, fuel: 2600, value: 22, gearH: 2.2, role: 'aew', cat: true },
  j16:   { name: '歼-16', side: 'cn', model: 'j16', hp: 140, radius: 9, pitch: 0.82, roll: 2.2, mil: 60, ab: 106, drag: 7.1e-4, vs: 68, rcs: 1, srm: 2, mrm: 4, srmType: 'pl10', mrmType: 'pl15', ashm: 2, ashmType: 'yj83', ammo: 150, cm: 24, radar: 44000, fuel: 1400, value: 12, gearH: 2.6, role: 'multi' },
  h6k:   { name: '轰-6K', side: 'cn', model: 'h6k', hp: 380, radius: 16, pitch: 0.26, roll: 0.6, mil: 40, ab: 40, drag: 5.4e-4, vs: 78, rcs: 1.6, srm: 0, mrm: 0, ashm: 2, ashmType: 'yj12', ammo: 0, cm: 16, radar: 30000, fuel: 3000, value: 25, gearH: 3, role: 'bomber' },
  fa18:  { name: 'F/A-18E', side: 'us', model: 'fa18', hp: 120, radius: 8, pitch: 0.86, roll: 2.4, mil: 56, ab: 100, drag: 7.2e-4, vs: 60, rcs: 0.9, srm: 2, mrm: 4, srmType: 'aim9', mrmType: 'aim120', ashm: 2, ashmType: 'lrasm', ammo: 400, cm: 24, radar: 44000, fuel: 1000, value: 12, gearH: 2.4, role: 'multi', cat: true },
  f35c:  { name: 'F-35C', side: 'us', model: 'f35c', hp: 105, radius: 7, pitch: 0.86, roll: 2.4, mil: 60, ab: 100, drag: 7.0e-4, vs: 58, rcs: 0.3, srm: 0, mrm: 4, srmType: 'aim9', mrmType: 'aim120', ashm: 0, ammo: 180, cm: 20, radar: 48000, fuel: 1100, value: 16, gearH: 2.2, role: 'fighter', cat: true },
  e2d:   { name: 'E-2D', side: 'us', model: 'e2d', hp: 80, radius: 13, pitch: 0.3, roll: 0.8, mil: 34, ab: 34, drag: 9e-4, vs: 52, rcs: 1.3, srm: 0, mrm: 0, ashm: 0, ammo: 0, cm: 12, radar: 140000, aew: true, fuel: 2600, value: 22, gearH: 2.2, role: 'aew', cat: true },
  b1b:   { name: 'B-1B', side: 'us', model: 'b1b', hp: 460, radius: 17, pitch: 0.3, roll: 0.7, mil: 62, ab: 80, drag: 4.8e-4, vs: 80, rcs: 0.9, srm: 0, mrm: 0, ashm: 4, ashmType: 'lrasm', ammo: 0, cm: 30, radar: 30000, fuel: 2400, value: 25, gearH: 3, role: 'bomber' }
};
/* ---------- weapons ---------- */
// air-to-air: seeker ir / radar as in 猛禽制空
// anti-ship: cls 'ashm', profile sub (sea-skimming), super (skim, sprint in the terminal phase), high (supersonic at altitude, dive at the end), hyper (boost-glide)
// SAM: cls 'sam', pk against aircraft; pkMul by threat class
const MSL = {
  pl10:   { name: '霹雳-10', call: '霹雳-10 发射', seeker: 'ir', vmax: 960, accel: 560, burn: 3.6, turn: 2.5, fuse: 20, range: 4500, fov: 1.05, lockT: 0.45, dmg: 200, life: 9, hold: 2.6 },
  pl15:   { name: '霹雳-15', call: '霹雳-15 发射', seeker: 'radar', vmax: 1300, accel: 420, burn: 8, turn: 1.4, fuse: 26, range: 17000, fov: 0.6, lockT: 1.0, dmg: 200, life: 26, hold: 2.6 },
  aim9:   { name: 'AIM-9X', call: 'FOX 2', seeker: 'ir', vmax: 980, accel: 560, burn: 3.6, turn: 2.6, fuse: 20, range: 4500, fov: 1.05, lockT: 0.45, dmg: 200, life: 9, hold: 2.6 },
  aim120: { name: 'AIM-120D', call: 'FOX 3', seeker: 'radar', vmax: 1250, accel: 420, burn: 7, turn: 1.45, fuse: 26, range: 16000, fov: 0.6, lockT: 1.0, dmg: 200, life: 24, hold: 2.6 },
  yj83:   { name: '鹰击-83', cls: 'ashm', profile: 'sub', v: 290, range: 40000, dmg: 120, rcs: 1, skim: 7 },
  yj18:   { name: '鹰击-18', cls: 'ashm', profile: 'super', v: 260, sprint: 950, sprintAt: 15000, range: 70000, dmg: 160, rcs: 1, skim: 8 },
  yj21:   { name: '鹰击-21', cls: 'ashm', profile: 'hyper', v: 1900, range: 95000, dmg: 260, rcs: 1.4, cruise: 18000 },
  yj12:   { name: '鹰击-12', cls: 'ashm', profile: 'high', v: 900, range: 75000, dmg: 200, rcs: 1.2, cruise: 9000, skimAt: 22000 },
  harpoon:{ name: '鱼叉', cls: 'ashm', profile: 'sub', v: 240, range: 36000, dmg: 110, rcs: 1, skim: 6 },
  lrasm:  { name: 'LRASM', cls: 'ashm', profile: 'sub', v: 255, range: 80000, dmg: 240, rcs: 0.45, skim: 6, smart: true, evade: 0.7 },
  sm6s:   { name: '标准-6 反舰', cls: 'ashm', profile: 'high', v: 1100, range: 45000, dmg: 80, rcs: 1, cruise: 12000, skimAt: 6000 },
  hhq9:   { name: '海红旗-9B', cls: 'sam', v: 1350, range: 34000, pk: 0.72 },
  hhq16:  { name: '海红旗-16', cls: 'sam', v: 1050, range: 17000, pk: 0.7 },
  hhq10:  { name: '海红旗-10', cls: 'sam', v: 820, range: 4800, pk: 0.68, short: true },
  sm6:    { name: '标准-6', cls: 'sam', v: 1350, range: 44000, pk: 0.76 },
  sm2:    { name: '标准-2', cls: 'sam', v: 1150, range: 28000, pk: 0.7 },
  essm:   { name: 'ESSM', cls: 'sam', v: 1150, range: 15000, pk: 0.72 },
  ram:    { name: 'RAM', cls: 'sam', v: 820, range: 4800, pk: 0.68, short: true }
};
// naval guns: muzzle velocity, quadratic drag fitted to the published maximum range, rate of fire, mount slew rates (deg/s)
const GUNS = {
  h130: { name: 'H/PJ-38 130 毫米舰炮', v0: 930, k: 3.831e-5, rate: 1.5, dmg: 22, ammo: 280, train: 40, elev: 25, x: 0.38, maxR: 29500 },
  mk45: { name: 'Mk 45 127 毫米舰炮', v0: 810, k: 4.454e-5, rate: 3.0, dmg: 19, ammo: 600, train: 30, elev: 20, x: 0.37, maxR: 24000 },
  h76:  { name: 'H/PJ-26 76 毫米舰炮', v0: 980, k: 1.064e-4, rate: 1.0, dmg: 9, ammo: 500, train: 50, elev: 35, x: 0.4, maxR: 16000 }
};
const PK_MUL = { plane: 0.6, sub: 0.48, super: 0.32, high: 0.42, hyper: 0.2 };
const CIWS_PK = { sub: 0.32, super: 0.16, high: 0.2, hyper: 0.06, plane: 0.3 };

/* ---------- ships ---------- */
// vmax m/s (31 kn = 16 m/s), turn deg/s at speed, mast = radar height m, channels = simultaneous SAM engagements
const SH = {
  fujian: { model: 'fujian', side: 'cn', name: '福建舰', hp: 2600, vmax: 16, turn: 0.9, mast: 48, radar: 100000, carrier: true, sam: { hhq10: 24 }, ashm: {}, channels: 4, ciws: 3, decoys: 10, value: 300, wing: { j15: 10, j35: 6, kj600: 2 }, top: 22, L: 316, B: 76 },
  t055:   { model: 't055', side: 'cn', name: '南昌舰', hp: 640, vmax: 15.5, turn: 1.6, mast: 40, radar: 115000, sam: { hhq9: 48, hhq10: 24 }, ashm: { yj21: 4, yj18: 14 }, channels: 8, ciws: 1, decoys: 8, gun: 'h130', value: 130, top: 30, L: 180, B: 20 },
  t052d:  { model: 't052d', side: 'cn', name: '昆明舰', hp: 470, vmax: 15.5, turn: 1.8, mast: 34, radar: 100000, sam: { hhq9: 32 }, ashm: { yj18: 10 }, channels: 6, ciws: 1, decoys: 8, gun: 'h130', value: 80, top: 26, L: 157, B: 18 },
  t052d2: { model: 't052d', side: 'cn', name: '长沙舰', hp: 470, vmax: 15.5, turn: 1.8, mast: 34, radar: 100000, sam: { hhq9: 32 }, ashm: { yj18: 10 }, channels: 6, ciws: 1, decoys: 8, gun: 'h130', value: 80, top: 26, L: 157, B: 18, number: '173' },
  t054a:  { model: 't054a', side: 'cn', name: '黄山舰', hp: 330, vmax: 14.5, turn: 2, mast: 28, radar: 80000, sam: { hhq16: 24 }, ashm: { yj83: 8 }, channels: 4, ciws: 1, decoys: 6, gun: 'h76', value: 50, top: 22, L: 134, B: 16 },
  ford:   { model: 'ford', side: 'us', name: '福特号', hp: 2800, vmax: 16.5, turn: 0.9, mast: 50, radar: 100000, carrier: true, sam: { essm: 16, ram: 21 }, ashm: {}, channels: 4, ciws: 3, decoys: 12, value: 340, wing: { fa18: 12, f35c: 8, e2d: 2 }, top: 24, L: 333, B: 78 },
  tico:   { model: 'tico', side: 'us', name: '普林斯顿号', hp: 560, vmax: 16, turn: 1.6, mast: 36, radar: 110000, sam: { sm6: 22, sm2: 40 }, ashm: { harpoon: 8, sm6s: 6 }, channels: 8, ciws: 2, decoys: 10, gun: 'mk45', value: 100, top: 28, L: 173, B: 17 },
  burke1: { model: 'burke', side: 'us', name: '杰克·H·卢卡斯号', hp: 480, vmax: 16, turn: 1.8, mast: 34, radar: 110000, sam: { sm6: 14, sm2: 22, essm: 24 }, ashm: { harpoon: 8, sm6s: 4 }, channels: 6, ciws: 2, decoys: 10, gun: 'mk45', value: 80, top: 26, L: 155, B: 20 },
  burke2: { model: 'burke', side: 'us', name: '平克尼号', hp: 480, vmax: 16, turn: 1.8, mast: 34, radar: 110000, sam: { sm6: 14, sm2: 22, essm: 24 }, ashm: { harpoon: 8, sm6s: 4 }, channels: 6, ciws: 2, decoys: 10, gun: 'mk45', value: 80, top: 26, L: 155, B: 20, number: '91' },
  burke3: { model: 'burke', side: 'us', name: '米利厄斯号', hp: 480, vmax: 16, turn: 1.8, mast: 34, radar: 110000, sam: { sm6: 14, sm2: 22, essm: 24 }, ashm: { harpoon: 8, sm6s: 4 }, channels: 6, ciws: 2, decoys: 10, gun: 'mk45', value: 80, top: 26, L: 155, B: 20, number: '69' }
};
// fleet stations (m) relative to the carrier, in the carrier's frame: +x ahead, +z starboard
const ORBAT = {
  cn: { origin: [-34000, 9000], heading: 0, ships: [['fujian', 0, 0], ['t055', 3200, 0], ['t052d', 900, 2800], ['t052d2', 900, -2800], ['t054a', -2600, 0]] },
  us: { origin: [36000, -6000], heading: Math.PI, ships: [['ford', 0, 0], ['tico', 3000, 0], ['burke1', 1000, 3000], ['burke2', 1000, -3000], ['burke3', -2800, 0]] }
};
const BASE = { side: 'cn', name: '前哨岛礁机场', hp: 1100, value: 200, mast: 60, radar: 120000, sam: { hhq9: 36 }, channels: 6, wing: { j16: 8, h6k: 6 }, isl: ISLANDS[0] };
const WIND = { dir: new V3(-0.85, 0, 0.53).normalize(), speed: 8 };   // wind blows toward this direction (from the north-east)

/* ---------- audio: synthesised with WebAudio (from 猛禽制空) ---------- */
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

/* ---------- game state ---------- */
const game = {
  mode: 'loading', t: 0, side: 'cn', role: 'pilot', pick: null, scale: 1, msgs: [], radio: [], shake: 0, flash: 0,
  map: false, chapter: 0, flags: {}, cause: '', over: null, ai: false, aiOverride: 0, view: 0, viewT: 0,
  lock: { target: null, t: 0, locked: false, kind: 'mrm', need: 1 }, ashmSel: null, mslCd: 0, warnBeep: 0, lockBeep: 0, menuA: 0,
  stats: { kills: 0, shipKills: 0, launches: 0, traps: 0, sorties: 0 }, focus: null, deadT: 0
};
const dbg = { fate: { cn: {}, us: {} }, by: { cn: 0, us: 0 }, hitBy: { cn: 0, us: 0 }, ashm: 0, samKill: 0, ciwsKill: 0, hit: 0, miss: 0, decoyed: 0, noSeeker: 0, samShot: 0 };
const ships = [], planes = [], missiles = [], bullets = [], flares = [], debris = [], decoys = [], shells = [];
const bases = [];
let player = null;          // the Plane the player flies (pilot role)
let flagship = null;        // the Ship the player commands (captain role)

function message(text, sub = '', color = '#8dffb4', dur = 2.4) {
  game.msgs.push({ text, sub, color, t: dur });
  if (game.msgs.length > 3) game.msgs.shift();
}
function radio(from, text, color = '#cfe8ff') {
  game.radio.push({ from, text, color, t: 5 });
  if (game.radio.length > 4) game.radio.shift();
}
const mine = u => u.side === game.side;
const sideColor = s => s === game.side ? '#9fd4ff' : '#ff8a78';

/* ---------- geometry helpers ---------- */
const fwdOf = (h, out = new V3()) => out.set(Math.cos(h), 0, -Math.sin(h));
const headingOf = v => Math.atan2(-v.z, v.x);
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
// ship-local (x ahead, z starboard) to world and back
function toWorld(s, lx, ly, lz, out = new V3()) {
  const c = Math.cos(s.heading), sn = Math.sin(s.heading);
  return out.set(s.pos.x + lx * c + lz * sn, s.pos.y + ly, s.pos.z - lx * sn + lz * c);
}
function toLocal(s, p, out = new V3()) {
  const c = Math.cos(s.heading), sn = Math.sin(s.heading), dx = p.x - s.pos.x, dz = p.z - s.pos.z;
  return out.set(dx * c - dz * sn, p.y - s.pos.y, dx * sn + dz * c);
}
const horizon = (h1, h2) => 4120 * (Math.sqrt(Math.max(h1, 1)) + Math.sqrt(Math.max(h2, 1)));

/* ---------- ships ---------- */
const shipProto = {};
class Ship {
  constructor(key) {
    const S = this.S = SH[key];
    this.key = key; this.kind = 'ship'; this.side = S.side; this.name = S.name; this.value = S.value;
    if (!shipProto[S.model + (S.number || '')]) shipProto[S.model + (S.number || '')] = Navy.ship(S.model, S.number);
    const built = shipProto[S.model + (S.number || '')];
    this.spec = built.spec;
    const hdKey = SHIP_HD[key], hd = hdKey && NavyHD.make(hdKey.m, { pla: hdKey.pla });
    this.obj = hd ? hd.group : built.group.clone();
    this.hd = !!hd;
    scene.add(this.obj);
    // level of detail: past a few km the detailed model gives way to the light procedural one
    if (hd) { this.lo = built.group.clone(); this.lo.visible = false; scene.add(this.lo); }
    this.pos = new V3(); this.vel = new V3(); this.heading = 0; this.speed = 10; this.order = 10; this.rudder = 0; this.helm = 0;
    this.hp = this.maxHp = S.hp; this.alive = true; this.sinking = 0; this.dying = false;
    this.sam = Object.assign({}, S.sam); this.ashm = Object.assign({}, S.ashm); this.decoys = S.decoys;
    this.channels = S.channels; this.busy = 0; this.samCd = 0; this.decoyCd = 0; this.gunCd = rand(2, 5); this.ciwsHeat = 0;
    this.gun = S.gun ? { spec: GUNS[S.gun], brg: 0, elv: 0.05, wantB: 0, wantE: 0.05, cd: rand(1, 3), ammo: GUNS[S.gun].ammo, fuse: 'HE', aimT: 0 } : null;
    this.dcT = 0; this.dcCd = 0;
    this.radius = S.L / 2; this.h = S.top; this.mast = S.mast; this.rcs = S.carrier ? 1.6 : key === 't055' ? 0.7 : 1;
    this.fires = 0; this.radarDmg = false; this.list = 0; this.trim = 0; this.station = null; this.wakeT = 0;
    this.hangar = Object.assign({}, S.wing || {}); this.ready = []; this.cats = []; this.lastLaunch = -99;
    if (S.carrier) {
      // the flight deck follows the model actually shown
      this.deck = Object.assign({}, Navy.CARRIERS[S.model]);
      if (hd && hd.deckY) { this.deck.deckY = hd.deckY; this.deck.cats = this.deck.cats.map(c => Object.assign({}, c, { x1: Math.min(c.x1, hdKey.catMax || c.x1) })); }
    }
    if (this.deck) this.cats = this.deck.cats.map(c => ({ c, busy: 0, plane: null }));
  }
  get carrier() { return !!this.S.carrier; }
  vmax() { return this.S.vmax * (this.hp < this.maxHp * 0.35 ? 0.45 : this.hp < this.maxHp * 0.6 ? 0.75 : 1); }
  sync() {
    const bob = Math.sin(game.t * 0.6 + this.pos.x * 0.001) * (this.carrier ? 0.15 : 0.35);
    this.obj.position.set(this.pos.x, bob - this.sinking * (this.S.top + 18), this.pos.z);
    const roll = this.list + Math.sin(game.t * 0.47 + this.pos.z * 0.001) * (this.carrier ? 0.004 : 0.02) - this.rudder * this.speed * 0.0016;
    const pitch = this.trim + Math.sin(game.t * 0.33 + this.pos.x * 0.002) * (this.carrier ? 0.002 : 0.008);
    this.obj.rotation.set(roll, this.heading, pitch, 'YZX');
    if (this.lo) { this.lo.position.copy(this.obj.position); this.lo.rotation.copy(this.obj.rotation); }
  }
}

// which uploaded model stands in for each ship / aircraft class (pla: tint a US-built model in PLA grey)
const SHIP_HD = {
  ford: { m: 'ford' }, fujian: { m: 'nimitz', pla: true, catMax: 140 }, t055: { m: 't055' }, t052d: { m: 't055' }, t052d2: { m: 't055' }, t054a: { m: 't051' },
  burke1: { m: 'burke' }, burke2: { m: 'burke' }, burke3: { m: 'burke' }, tico: { m: 'burke' }
};
const PLANE_HD = { fa18: { m: 'fa18' }, f35c: { m: 'f35' }, j35: { m: 'f35', pla: true, scale: 1.1 }, e2d: { m: 'e2d' }, kj600: { m: 'e2d', pla: true } };

/* ---------- island base ---------- */
function buildBase() {
  const I = BASE.isl, g = new THREE.Group();
  g.position.set(I.x, 0, I.z); g.rotation.y = -I.rot;
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 8, 48), new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 1 }));
  sand.scale.set(I.rx * 1.02, 1, I.rz * 1.02); sand.position.y = 0; g.add(sand);
  const shoal = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 48), new THREE.MeshStandardMaterial({ color: 0x5fb7b0, roughness: 0.4, transparent: true, opacity: 0.55 }));
  shoal.scale.set(I.rx * 1.45, 1, I.rz * 1.9); shoal.position.y = -0.5; g.add(shoal);
  const flat = (w, d, x, z, col, y = 4.05) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
  flat(3000, 55, 0, -120, 0x3c3f42);
  for (let x = -1400; x <= 1400; x += 60) flat(24, 1.2, x, -120, 0xeeeeea, 4.07);
  flat(2600, 22, 0, 60, 0x4a4c4f);
  flat(700, 180, -500, 320, 0x77797a);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8c6be, roughness: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.7 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry(34, 12, 26), mat, -760 + i * 44, 10, 360);
  add(new THREE.BoxGeometry(60, 18, 40), mat, 500, 13, 330);
  add(new THREE.CylinderGeometry(4, 6, 46, 10), mat, 760, 27, 300);
  const dome = add(new THREE.SphereGeometry(16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }), 760, 52, 300);
  dome.castShadow = false;
  for (const x of [900, 1050]) add(new THREE.CylinderGeometry(9, 9, 10, 18), new THREE.MeshStandardMaterial({ color: 0xe8e8e4 }), x, 9, 380);
  // HQ-9 launchers
  for (let i = 0; i < 4; i++) { const l = add(new THREE.BoxGeometry(11, 3, 3), dark, 1250 + (i % 2) * 30, 8, 250 + Math.floor(i / 2) * 30); l.rotation.z = 0.9; }
  scene.add(g);
  const base = {
    kind: 'base', side: BASE.side, name: BASE.name, value: BASE.value, hp: BASE.hp, maxHp: BASE.hp, alive: true, dying: false,
    pos: new V3(I.x, 4, I.z), vel: new V3(), radius: 1600, h: 50, mast: BASE.mast, rcs: 2, obj: g, isl: I,
    sam: Object.assign({}, BASE.sam), ashm: {}, channels: BASE.channels, busy: 0, samCd: 0, decoys: 0, decoyCd: 99, fires: 0, radarDmg: false,
    hangar: Object.assign({}, BASE.wing), ready: [], heading: -I.rot, S: { radar: BASE.radar, ciws: 2, gun: false, carrier: false, top: 50 },
    runway: { a: new V3(I.x, 4, I.z).add(new V3(-1450, 0, -120).applyAxisAngle(Y_AXIS, -I.rot)), dir: new V3(1, 0, 0).applyAxisAngle(Y_AXIS, -I.rot) },
    lastLaunch: -99
  };
  return base;
}

/* ---------- aircraft ---------- */
class Plane {
  constructor(side, type, home) {
    const T = this.T = AC[type];
    const hdKey = PLANE_HD[type], hd = hdKey && NavyHD.make(hdKey.m, { gearH: T.gearH, pla: hdKey.pla, scale: hdKey.scale });
    const m = hd ? { obj: hd.group, exhausts: hd.exhausts } : Navy.plane(T.model);
    this.obj = m.obj; scene.add(this.obj);
    this.setGearVis = hd ? hd.setGear : null; this.gearShown = false;
    this.exhausts = m.exhausts.map(e => new V3(...e));
    this.side = side; this.type = type; this.home = home; this.kind = 'plane'; this.name = T.name;
    this.pos = new V3(); this.q = new Q(); this.vel = new V3();
    this.fwd = new V3(1, 0, 0); this.up = new V3(0, 1, 0); this.right = new V3(0, 0, 1);
    this.speed = 200; this.hp = this.maxHp = T.hp; this.alive = true; this.dying = false;
    this.c = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false };
    this.g = 1; this.gStress = 0; this.authority = 1; this.stall = false; this.boost = false;
    this.gunCd = 0; this.cmCd = 0; this.rearm();
    this.pilot = null; this.radius = T.radius; this.rcs = T.rcs; this.h = 0; this.value = T.value;
    this.spin = new V3(); this.dieT = 0; this.painting = false;
    this.rate = new V3(); this.alpha = 0;
    this.state = 'air'; this.gear = 0; this.hook = false; this.landing = false; this.cat = null; this.catT = 0; this.deckT = 0;
    this.role = 'cap'; this.task = null; this.chaffT = -9;
  }
  rearm() { const T = this.T; Object.assign(this, { srm: T.srm, mrm: T.mrm, ashmN: T.ashm, ammo: T.ammo, cm: T.cm, fuel: T.fuel, hp: this.maxHp || T.hp }); }
  axes() {
    this.fwd.set(1, 0, 0).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.right.set(0, 0, 1).applyQuaternion(this.q);
  }
  integrate(dt) { this.vel.copy(this.fwd).multiplyScalar(this.speed); this.pos.addScaledVector(this.vel, dt); this.sync(); }
  sync() {
    this.obj.position.copy(this.pos); this.obj.quaternion.copy(this.q).multiply(_qA.setFromAxisAngle(Z_AXIS, this.alpha));
    if (this.setGearVis) { const d = this.gear > 0.5 || this.state === 'cat' || this.state === 'deck' || this.state === 'trap' || this.state === 'final'; if (d !== this.gearShown) { this.gearShown = d; this.setGearVis(d); } }
  }
  nose(out) { const ca = Math.cos(this.alpha), sa = Math.sin(this.alpha); return out.copy(this.fwd).multiplyScalar(ca).addScaledVector(this.up, sa); }
  get airborne() { return this.state === 'air' || this.state === 'final'; }
}
const _m4 = new THREE.Matrix4();
function setBasis(q, f, u) {
  const up = u.clone().addScaledVector(f, -f.dot(u)).normalize();
  _m4.makeBasis(f, up, new V3().crossVectors(f, up));
  q.setFromRotationMatrix(_m4);
}
function removePlane(pl) { pl.alive = false; scene.remove(pl.obj); const i = planes.indexOf(pl); if (i >= 0) planes.splice(i, 1); }

/* ---------- effects ---------- */
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _f = new V3();
function explode(pos, scale = 1, vel = null) {
  const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
  const k = near(pos, 9000) ? 1 : 0.35;
  for (let i = 0; i < 4; i++) fire.emit(pos.x, pos.y, pos.z, vx, vy, vz, 0.3, 50 * scale, 120 * scale, 1.4, 1.2, 1.0, 1);
  for (let i = 0; i < 30 * scale * k; i++) {
    _d.randomDirection().multiplyScalar(rand(8, 45) * scale);
    fire.emit(pos.x, pos.y, pos.z, _d.x + vx, _d.y + vy, _d.z + vz, rand(0.6, 1.4), rand(10, 18) * scale, rand(30, 55) * scale, 1.3, 0.75, 0.35, 0.9, 1.6);
  }
  for (let i = 0; i < 22 * scale * k; i++) {
    _d.randomDirection().multiplyScalar(rand(60, 180));
    fire.emit(pos.x, pos.y, pos.z, _d.x + vx, _d.y + vy, _d.z + vz, rand(0.5, 1.2), 2.4, 1.2, 1.5, 1.1, 0.6, 1, 0.8, 30);
  }
  for (let i = 0; i < 16 * scale * k; i++) {
    _d.randomDirection().multiplyScalar(rand(5, 22) * scale);
    const g = rand(0.13, 0.26);
    smoke.emit(pos.x, pos.y, pos.z, _d.x + vx * 0.5, _d.y + 3, _d.z + vz * 0.5, rand(3.5, 6.5), 22 * scale, rand(80, 130) * scale, g, g, g * 1.05, 0.85, 0.5, -1.5);
  }
  const d = pos.distanceTo(camera.position);
  game.shake = Math.max(game.shake, clamp(1.8 * scale * (1 - d / 2000), 0, 2.2));
  Sound.boom(d * 0.6, Math.min(scale, 2));
}
function splash(pos, big = 1) {
  if (!near(pos, 12000)) return;
  for (let i = 0; i < 26 * big; i++) {
    _d.set(rand(-1, 1), rand(2, 4), rand(-1, 1)).normalize().multiplyScalar(rand(20, 60) * big);
    smoke.emit(pos.x, 0.5, pos.z, _d.x, _d.y, _d.z, rand(1.6, 3), 6 * big, 28 * big, 0.92, 0.95, 0.97, 0.9, 0.6, 14);
  }
}
const debrisGeo = new THREE.BoxGeometry(1.2, 0.3, 0.8);
const debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.8, metalness: 0.4 });
function spawnDebris(pos, vel, n, size = 1) {
  if (!near(pos, 5000)) return;
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMat);
    mesh.scale.setScalar(rand(0.6, 1.6) * size);
    mesh.position.copy(pos);
    scene.add(mesh);
    debris.push({ mesh, vel: vel.clone().multiplyScalar(0.6).add(_d.randomDirection().multiplyScalar(rand(30, 80))), life: rand(2, 3.5), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)) });
  }
}

/* ---------- sensors and the tactical picture ----------
   Each side keeps one picture (datalinked). A contact enters it when any friendly sensor holds it:
   within radar range scaled by the target's radar cross-section, and above the radar horizon
   4.12 km * (sqrt(sensor height) + sqrt(target height)). Fighter radars look ahead (±60°); AEW, ships and the island see all round. */
const picture = { cn: new Map(), us: new Map() };
const firstSeen = { cn: false, us: false };
function sensorsOf(side) {
  const out = [];
  for (const s of ships) if (s.alive && !s.dying && s.side === side) out.push({ u: s, h: s.mast, r: s.S.radar * (s.radarDmg ? 0.5 : 1), cone: null });
  for (const b of bases) if (b.alive && b.side === side) out.push({ u: b, h: b.mast, r: b.S.radar * (b.radarDmg ? 0.5 : 1), cone: null });
  for (const p of planes) if (p.alive && !p.dying && p.side === side && p.airborne) out.push({ u: p, h: p.pos.y, r: p.T.radar, cone: p.T.aew ? null : p.fwd });
  return out;
}
function canSee(sn, e) {
  const d = sn.u.pos.distanceTo(e.pos);
  // sea clutter: anything skimming the waves is much harder to pick out
  const clutter = e.kind === 'msl' && e.pos.y < 40 ? 0.35 : e.kind === 'plane' && e.pos.y < 60 ? 0.6 : 1;
  if (d > sn.r * e.rcs * clutter) return false;
  const ht = e.kind === 'ship' ? e.h : e.kind === 'base' ? 30 : Math.max(e.pos.y, 1);
  if (d > horizon(sn.h, ht)) return false;
  if (sn.cone) { _a.subVectors(e.pos, sn.u.pos).divideScalar(d || 1); if (_a.dot(sn.cone) < 0.5) return false; }
  return true;
}
// does this particular platform hold the contact on its own sensors (no datalink)
function ownSees(u, e) {
  const sn = u.kind === 'plane' ? { u, h: u.pos.y, r: u.T.radar, cone: u.T.aew ? null : u.fwd } : { u, h: u.mast, r: u.S.radar * (u.radarDmg ? 0.5 : 1), cone: null };
  return canSee(sn, e);
}
function contactsOf(side) {
  const out = [];
  for (const s of ships) if (s.side !== side && s.alive && !s.dying) out.push(s);
  for (const b of bases) if (b.side !== side && b.alive) out.push(b);
  for (const p of planes) if (p.side !== side && p.alive && !p.dying && p.airborne) out.push(p);
  for (const m of missiles) if (m.side !== side && m.alive && m.cls === 'ashm') out.push(m);
  return out;
}
let sensorT = 0;
function updateSensors(dt) {
  sensorT -= dt;
  if (sensorT > 0) return;
  sensorT = 0.4;
  for (const side of ['cn', 'us']) {
    const P = picture[side], sens = sensorsOf(side);
    for (const e of contactsOf(side)) {
      let seen = false;
      for (const sn of sens) if (canSee(sn, e)) { seen = true; break; }
      if (!seen) continue;
      let tr = P.get(e);
      if (!tr) { tr = { pos: new V3(), vel: new V3(), t: 0, first: game.t }; P.set(e, tr); }
      tr.pos.copy(e.pos); tr.vel.copy(e.vel); tr.t = game.t;
      if (e.kind === 'ship' && !firstSeen[side]) { firstSeen[side] = true; onFirstContact(side, e); }
    }
    for (const [e, tr] of P) {
      const keep = e.kind === 'ship' || e.kind === 'base' ? 150 : 6;
      if (!e.alive || e.dying || game.t - tr.t > keep || (e.kind === 'plane' && !e.airborne)) P.delete(e);
    }
  }
}
// estimated position of a contact now (dead-reckoned from its last report)
function trackPos(side, e, out = new V3()) {
  const tr = picture[side].get(e);
  if (!tr) return null;
  return out.copy(tr.pos).addScaledVector(tr.vel, Math.min(game.t - tr.t, 60));
}
const known = (side, e) => picture[side].has(e);
const fresh = (side, e, age = 2) => { const tr = picture[side].get(e); return tr && game.t - tr.t < age; };

/* ---------- weapons ---------- */
const mslMat = new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.2, roughness: 0.45 });
const geoM = { mrm: F22.missileGeometry(), srm: F22.aim9Geometry(), sub: Navy.ashmGeometry('sub'), super: Navy.ashmGeometry('super'), hyper: Navy.ashmGeometry('hyper') };
geoM.high = geoM.super;
function mslMesh(geo, scale = 1) { const m = new THREE.Mesh(geo, mslMat); m.scale.setScalar(scale); scene.add(m); return m; }

// air-to-air
function launchAAM(owner, target, which) {
  const T = owner.T, kind = which === 'srm' ? T.srmType : T.mrmType, spec = MSL[kind];
  if (which === 'srm') { if (owner.srm <= 0) return null; owner.srm--; } else { if (owner.mrm <= 0) return null; owner.mrm--; }
  owner.axes();
  const pos = owner.pos.clone().addScaledVector(owner.up, -1.2);
  const m = { kind: 'msl', cls: 'aam', spec, side: owner.side, owner, target, pos, prev: pos.clone(), dir: owner.fwd.clone(),
    vel: owner.vel.clone().addScaledVector(owner.up, -6), speed: owner.speed, age: 0, drop: 0.2, alive: true,
    mesh: mslMesh(which === 'srm' ? geoM.srm : geoM.mrm), lostT: 0, cmSeen: -1, rcs: 0.1, h: 0 };
  missiles.push(m);
  if (owner === player) { Sound.launch(); game.stats.launches++; }
  else Sound.launch(clamp(1 - owner.pos.distanceTo(camera.position) / 5000, 0, 0.3));
  if (mine(owner) && (owner === player || Math.random() < 0.4)) radio(owner === player ? '你' : owner.name, `${spec.call}！${target.name}`, '#9fd4ff');
  if (target === player) message('敌方导弹发射', spec.seeker === 'ir' ? '红外制导 · 投放干扰弹或急转' : '雷达制导 · 切向置尾并投放箔条', '#ff5a4f', 2);
  return m;
}
// anti-ship
function launchASHM(owner, target, type, aimOverride) {
  const spec = MSL[type];
  const from = owner.kind === 'plane' ? owner.pos.clone().addScaledVector(owner.up, -1.5) : toWorld(owner, rand(-owner.radius * 0.3, owner.radius * 0.3), owner.h * 0.4, 0);
  const aim = aimOverride ? aimOverride.clone() : trackPos(owner.side, target) || target.pos.clone();
  const dir = owner.kind === 'plane' ? owner.fwd.clone() : new V3(0, 1, 0).lerp(_a.subVectors(aim, from).setY(0).normalize(), 0.25).normalize();
  const m = { kind: 'msl', cls: 'ashm', spec, side: owner.side, owner, target, aim, pos: from, prev: from.clone(), dir,
    vel: dir.clone().multiplyScalar(owner.kind === 'plane' ? owner.speed : 30), speed: owner.kind === 'plane' ? owner.speed : 30, age: 0, alive: true,
    mesh: mslMesh(geoM[spec.profile]), locked: false, seekerOn: false, decoyRoll: new Set(), rcs: 0.4 * spec.rcs, h: 0, engaged: 0, phase: 'boost',
    weave: rand(0, 6), range: spec.range * 1.15 };
  missiles.push(m); dbg.ashm++; dbg.by[m.side]++;
  if (owner.kind === 'ship') for (let i = 0; i < 26; i++) smoke.emit(from.x, from.y, from.z, rand(-6, 6), rand(4, 18), rand(-6, 6), rand(3, 6), 10, 40, 0.88, 0.86, 0.84, 0.75, 0.6);
  const d = from.distanceTo(camera.position);
  Sound.launch(clamp(1 - d / 6000, 0.02, 0.5));
  if (owner === player || owner === flagship) game.stats.launches++;
  if (!game.flags.firstSalvo) { game.flags.firstSalvo = true; chapterEvent('salvo', owner.side); }
  return m;
}
// surface-to-air
function launchSAM(owner, target, type) {
  owner.sam[type]--;
  const spec = MSL[type];
  const from = owner.kind === 'ship' ? toWorld(owner, rand(-owner.radius * 0.3, owner.radius * 0.3), owner.h * 0.4, 0) : owner.pos.clone().add(new V3(rand(-30, 30), 6, rand(-30, 30)));
  const m = { kind: 'msl', cls: 'sam', spec, side: owner.side, owner, target, pos: from, prev: from.clone(), dir: new V3(0, 1, 0), vel: new V3(0, 40, 0),
    speed: 40, age: 0, alive: true, mesh: mslMesh(geoM.mrm, spec.short ? 1.1 : 1.9), rcs: 0.1, h: 0, best: 1e9 };
  missiles.push(m);
  target.engaged = (target.engaged || 0) + 1; target.shots = (target.shots || 0) + 1; dbg.samShot++;
  owner.busy++;
  for (let i = 0; i < 14; i++) smoke.emit(from.x, from.y, from.z, rand(-5, 5), rand(5, 14), rand(-5, 5), rand(2, 4), 8, 30, 0.9, 0.9, 0.9, 0.7, 0.6);
  if (near(from, 5000)) Sound.launch(clamp(1 - from.distanceTo(camera.position) / 5000, 0.02, 0.4));
  if (target === player) message('舰空导弹来袭', '急转、投放箔条、贴海飞行', '#ff5a4f', 2);
}
function dispense(pl) {
  pl.cm--; pl.chaffT = game.t;
  pl.axes();
  const fresh = [];
  for (let i = 0; i < 3; i++) {
    const side = i % 2 ? 1 : -1;
    const v = pl.vel.clone().multiplyScalar(0.55).addScaledVector(pl.up, -rand(20, 40)).addScaledVector(pl.right, side * rand(25, 55)).addScaledVector(pl.fwd, -rand(10, 30));
    const f = { kind: 'flare', pos: pl.pos.clone().addScaledVector(pl.fwd, -6), vel: v, life: rand(3.5, 4.5), alive: true, radius: 0, name: '干扰弹' };
    flares.push(f); fresh.push(f);
  }
  if (near(pl.pos)) for (let i = 0; i < 20; i++) {
    _d.randomDirection().multiplyScalar(rand(8, 30));
    fire.emit(pl.pos.x - pl.fwd.x * 10, pl.pos.y - pl.fwd.y * 10, pl.pos.z - pl.fwd.z * 10, pl.vel.x * 0.3 + _d.x, pl.vel.y * 0.3 + _d.y, pl.vel.z * 0.3 + _d.z, rand(0.8, 1.6), 1.6, 0.8, 0.9, 0.95, 1.1, 0.8, 1.5, 3);
  }
  const vl = pl.vel.length() || 1;
  for (const m of missiles) {
    if (!m.alive || m.cls !== 'aam' || m.target !== pl || m.age < 0.3 || m.cmSeen === game.t) continue;
    m.cmSeen = game.t;
    const los = _d.subVectors(m.pos, pl.pos), dist = los.length();
    const beam = 1 - Math.abs(pl.vel.dot(los) / (vl * dist));
    const chance = m.spec.seeker === 'ir' ? 0.55 * (dist < 400 ? 0.6 : 1) : 0.18 + 0.45 * beam;
    if (Math.random() < chance) {
      m.target = m.spec.seeker === 'ir' ? fresh[Math.floor(Math.random() * fresh.length)] : null;
      if (pl === player) radio('你', m.spec.seeker === 'ir' ? '导弹被干扰弹诱偏！' : '箔条奏效，雷达弹丢失目标！', '#9fd4ff');
    }
  }
  if (pl === player) Sound.flare();
}
function fireDecoy(s) {
  s.decoys--; s.decoyCd = 18;
  const off = new V3(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(rand(260, 420));
  const d = { pos: s.pos.clone().add(off).setY(25), vel: WIND.dir.clone().multiplyScalar(WIND.speed), life: 26, alive: true, kind: 'decoy', name: '诱饵', side: s.side, owner: s };
  decoys.push(d);
  if (near(d.pos, 9000)) for (let i = 0; i < 40; i++) { _d.randomDirection().multiplyScalar(rand(5, 30)); fire.emit(d.pos.x, d.pos.y, d.pos.z, _d.x, _d.y + 10, _d.z, rand(1.5, 3), 4, 2, 1, 1, 1.1, 0.9, 1, 2); }
  if (s === flagship) radio(s.name, '发射干扰弹 / 诱饵！', '#9fd4ff');
}

/* ---------- damage ---------- */
function damagePlane(pl, dmg, src) {
  if (!pl.alive || pl.dying) return;
  pl.hp -= dmg;
  if (pl === player) {
    game.flash = Math.min(1, game.flash + dmg / 40);
    game.shake = Math.max(game.shake, dmg > 20 ? 1.6 : 0.5);
    Sound.hit();
    if (pl.hp <= 0) killPlayer(src.kind === 'missile' ? `被${src.name}击落` : src.kind === 'gun' ? '被机炮击落' : '坠毁');
    return;
  }
  if (pl.hp <= 0) destroyPlane(pl, src);
}
function destroyPlane(pl, src) {
  if (pl.dying) return;
  pl.dying = true; pl.dieT = rand(2.2, 3.8);
  pl.vel.copy(pl.fwd).multiplyScalar(pl.speed * 0.75);
  pl.spin.set(rand(-3, 3), 0, rand(-1.2, 1.2));
  explode(pl.pos, pl.T.role === 'bomber' ? 1.4 : 0.8, pl.vel);
  spawnDebris(pl.pos, pl.vel, 5);
  const by = src && src.owner;
  if (by === player) { game.stats.kills++; message('击落', pl.name, '#8dffb4', 2.2); radio('你', `击落一架${pl.name}！`, '#9fd4ff'); }
  else if (mine(pl) && Math.random() < 0.5) radio('塔台', `${pl.name}被击落。`, '#ff8a78');
  else if (!mine(pl) && Math.random() < 0.4) radio(SIDES[game.side].short, `击落敌${pl.name}。`, '#9fd4ff');
}
function killPlayer(cause) {
  if (!player || !player.alive) return;
  player.dying = true; player.dieT = 0.01;
  explode(player.pos, 1.4, player.vel);
  spawnDebris(player.pos, player.vel, 8, 1.3);
  player.alive = false; scene.remove(player.obj);
  const i = planes.indexOf(player); if (i >= 0) planes.splice(i, 1);
  game.cause = cause; game.deadT = 3; game.mode = 'dead';
  Sound.lockTone(false); Sound.rwrTone(false); Sound.engine(0, 0, false);
}
function damageShip(s, dmg, src, at) {
  if (!s.alive || s.dying) return;
  s.hp -= dmg;
  s.fires = Math.min(6, s.fires + (dmg > 60 ? 1 : 0.4));
  if (at) explode(at, dmg > 120 ? 2.2 : 1.4, null);
  if (s.hp < s.maxHp * 0.5 && !s.radarDmg && Math.random() < 0.5) { s.radarDmg = true; s.channels = Math.max(1, Math.floor(s.channels / 2)); if (mine(s)) radio(s.name, '雷达受损，火控通道减半！', '#ff8a78'); }
  s.list = clamp(s.list + rand(-0.012, 0.012) * dmg / 60, -0.08, 0.08);
  if (s === flagship) { game.flash = Math.min(1, game.flash + 0.5); game.shake = 2; }
  if (src && src.owner && (src.owner === player || src.owner === flagship)) message('命中', `${s.name}  -${Math.round(dmg)}`, '#8dffb4', 2);
  if (mine(s) && dmg > 50) radio(s.name, s.hp > s.maxHp * 0.5 ? '舰体中弹，损管队出动！' : '严重受损！航速下降！', '#ff8a78');
  if (s.hp <= 0) sinkShip(s, src);
}
function sinkShip(s, src) {
  s.dying = true; s.sinkT = 0; s.speed *= 0.3; s.order = 0;
  explode(toWorld(s, 0, s.h * 0.5, 0), 3, null);
  if (src && src.owner && (src.owner === player || src.owner === flagship)) game.stats.shipKills++;
  message(`${s.name}${s.carrier ? '' : ''}沉没`, mine(s) ? '我方舰艇损失' : '敌舰被击沉', mine(s) ? '#ff8a78' : '#8dffb4', 3.6);
  radio(mine(s) ? '舰队司令部' : SIDES[game.side].short, mine(s) ? `${s.name}正在下沉，弃舰！` : `确认击沉${s.name}！`, mine(s) ? '#ff8a78' : '#9fd4ff');
  // aircraft parked aboard go down with her
  if (s.carrier) { s.hangar = {}; s.ready = []; for (const c of s.cats) if (c.plane && c.plane !== player) removePlane(c.plane); }
  chapterEvent('sunk', s.side, s);
}
function damageBase(b, dmg, src, at) {
  if (!b.alive) return;
  b.hp -= dmg; b.fires = Math.min(6, b.fires + 0.6);
  if (at) explode(at, 1.8, null);
  if (b.hp < b.maxHp * 0.5 && !b.radarDmg) { b.radarDmg = true; if (mine(b)) radio(b.name, '岛礁雷达站被毁！', '#ff8a78'); }
  if (b.hp <= 0) {
    b.alive = false; b.hangar = {}; b.ready = [];
    explode(b.pos.clone().setY(30), 3.5, null);
    message(`${b.name}失去作战能力`, mine(b) ? '我方岛礁机场被摧毁' : '敌岛礁机场被摧毁', mine(b) ? '#ff8a78' : '#8dffb4', 3.6);
    chapterEvent('sunk', b.side, b);
  }
}
function applyDamage(t, dmg, src, at) {
  if (t.kind === 'plane') damagePlane(t, dmg, src);
  else if (t.kind === 'ship') damageShip(t, dmg, src, at);
  else if (t.kind === 'base') damageBase(t, dmg, src, at);
}
// is point p inside ship s (hull box, below its tallest structure)
function insideShip(s, p, pad = 0) {
  const l = toLocal(s, p, _c);
  const hb = s.carrier ? 26 : s.S.B / 2 + 3;
  const top = s.carrier ? s.deck.deckY - 1.5 : s.h;   // a carrier's flight deck is landed on, not crashed into
  return Math.abs(l.x) < s.S.L / 2 + pad && Math.abs(l.z) < hb + pad && l.y < top + pad && l.y > -8;
}

/* ---------- missile flight ---------- */
const _md = new V3(), _ml = new V3();
function trail(m, n, size, col = 0.87) {
  if (!near(m.pos, 9000)) n = Math.random() < 0.3 ? 1 : 0;
  for (let k = 0; k < n; k++) {
    _a.lerpVectors(m.prev, m.pos, k / Math.max(n, 1)).addScaledVector(m.dir, -2);
    smoke.emit(_a.x, _a.y, _a.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(2.4, 3.6), 1.6, size, col, col + 0.01, col + 0.02, 0.55, 0.4, -0.5);
  }
  _a.copy(m.pos).addScaledVector(m.dir, -2.5);
  fire.emit(_a.x, _a.y, _a.z, m.vel.x * 0.8, m.vel.y * 0.8, m.vel.z * 0.8, 0.06, 4, 1.4, 1.5, 1.2, 0.8, 1);
}
function steer(m, want, rate, dt) {
  const ang = m.dir.angleTo(want);
  _a.crossVectors(m.dir, want);
  if (ang > 1e-4 && _a.lengthSq() > 1e-12) m.dir.applyAxisAngle(_a.normalize(), Math.min(ang, rate * dt)).normalize();
}
function endMissile(m, i, boom = true) {
  if (boom) { if (m.pos.y < 3) splash(m.pos, m.cls === 'ashm' ? 1.2 : 0.6); else explode(m.pos, m.cls === 'ashm' ? 0.9 : 0.5, null); }
  scene.remove(m.mesh); m.alive = false; missiles.splice(i, 1);
  if (m.cls === 'sam' && m.owner) m.owner.busy = Math.max(0, m.owner.busy - 1);
  if (m.cls === 'sam' && m.target) m.target.engaged = Math.max(0, (m.target.engaged || 1) - 1);
}
function updateAAM(m, i, dt) {
  const S = m.spec;
  if (m.age < m.drop) { m.vel.y -= 9.81 * dt; m.pos.addScaledVector(m.vel, dt); }
  else {
    m.speed = m.age < S.burn ? Math.min(m.speed + S.accel * dt, S.vmax) : Math.max(m.speed - 55 * dt, 200);
    const t = m.target;
    if (t && t.alive && !t.dying) {
      _ml.subVectors(t.pos, m.pos);
      const dist = _ml.length();
      if (m.dir.angleTo(_ml) > 1.35 && m.age > 1) m.target = null;
      else {
        if (S.seeker === 'radar' && t.kind === 'plane') {
          const vl = t.vel.length();
          if (vl > 1) { const beam = 1 - Math.abs(t.vel.dot(_ml) / (vl * dist)); if (beam > 0.88 && t.pos.y < 3500) m.lostT += dt * 0.7; }  // doppler notch in sea clutter
          if (m.lostT > S.hold) { m.target = null; if (t === player) radio('你', '雷达弹丢失目标！', '#9fd4ff'); }
        }
        if (m.target) {
          const tgo = dist / Math.max(m.speed, 300);
          _md.copy(t.pos).addScaledVector(t.vel || ZERO, tgo).sub(m.pos).normalize();
          steer(m, _md, S.turn * clamp(m.speed / 600, 0.4, 1.2), dt);
        }
      }
    }
    m.vel.copy(m.dir).multiplyScalar(m.speed);
    m.pos.addScaledVector(m.vel, dt);
    trail(m, 2, S.seeker === 'ir' ? rand(5, 8) : rand(7, 11));
  }
  m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.dir);
  const t = m.target;
  if (m.age > 0.5 && t && t.alive && !t.dying && t.kind === 'plane' && segDist(m.prev, m.pos, t.pos) < S.fuse + t.radius * 0.5) {
    damagePlane(t, S.dmg, { owner: m.owner, kind: 'missile', name: S.name }); endMissile(m, i); return;
  }
  if (m.age > S.life || m.pos.y < 0) endMissile(m, i);
}
function updateASHM(m, i, dt) {
  const S = m.spec;
  // the aim point follows the side's track of the target while it is held
  if (m.target && m.target.alive && !m.target.dying && !m.locked && fresh(m.side, m.target, 6)) trackPos(m.side, m.target, m.aim);
  if (m.locked && m.target && m.target.alive) { const dd = m.target.pos.distanceTo(m.pos); m.aim.copy(m.target.pos).addScaledVector(m.target.vel || ZERO, dd > 400 ? dd / Math.max(m.speed, 100) : 0); }
  const hd = Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z);
  let alt, v = S.v;
  if (S.profile === 'hyper') { alt = hd > S.cruise * 1.25 ? S.cruise : 0; v = S.v * (m.phase === 'boost' ? clamp(m.age / 6, 0.2, 1) : 1); }
  else if (S.profile === 'high') alt = hd > S.skimAt ? S.cruise : 8;
  else alt = m.age < 3 ? 40 : S.skim + Math.sin(game.t * 2 + m.weave) * 1.5;
  if (S.profile === 'super' && hd < S.sprintAt) v = S.sprint;
  if (m.age > 4) m.phase = 'cruise';
  m.speed += (v - m.speed) * (1 - Math.exp(-dt * (m.age < 2 ? 1.5 : 0.8)));
  // seeker
  if (!m.seekerOn && hd < 17000) {
    m.seekerOn = true;
    const tgt = acquire(m);
    if (tgt) { m.target = tgt; m.locked = true; }
  }
  // decoys draw away a homing missile once each
  if (m.locked && m.target && m.target.kind !== 'decoy') {
    for (const d of decoys) {
      if (!d.alive || d.owner !== m.target || m.decoyRoll.size || hd > 9000) continue;
      m.decoyRoll.add(d);
      if (Math.random() < (S.smart ? 0.12 : 0.25)) { dbg.decoyed++; dbg.fate[m.side].decoy = (dbg.fate[m.side].decoy || 0) + 1; m.target = d; m.aim.copy(d.pos); if (d.side === game.side) radio('舰队', `诱饵骗走一枚${S.name}！`, '#9fd4ff'); break; }
    }
  }
  // guidance: horizontal toward the aim point, vertical toward the profile altitude; terminal dive at the end
  _md.subVectors(m.aim, m.pos);
  const dive = (S.profile === 'hyper' || S.profile === 'high') && hd < Math.max(m.pos.y * 1.3, 1500);
  if (!dive) _md.y = 0;
  _md.normalize();
  if (!dive) { const climb = clamp((alt - m.pos.y) / Math.max(m.speed * 3, 60), -0.5, m.age < 3 ? 0.9 : 0.6); _md.y = climb; _md.normalize(); }
  if (S.profile === 'super' && hd < S.sprintAt && hd > 2500) { _a.set(-_md.z, 0, _md.x); _md.addScaledVector(_a, Math.sin(game.t * 3 + m.weave) * 0.12).normalize(); }  // terminal weave
  const rate = hd < 2500 && m.locked ? 2.2 : S.profile === 'hyper' ? (dive ? 0.6 : 0.25) : S.profile === 'high' ? 0.35 : 0.45;   // terminal correction
  steer(m, _md, m.age < 1.5 ? 1.6 : rate, dt);
  m.prev.copy(m.pos);
  m.vel.copy(m.dir).multiplyScalar(m.speed);
  m.pos.addScaledVector(m.vel, dt);
  trail(m, S.profile === 'sub' ? 1 : 2, S.profile === 'sub' ? 5 : 9, 0.8);
  m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.dir);
  // impact
  const t = m.target;
  if (t && t.kind === 'decoy') { if (m.pos.distanceTo(t.pos) < 40 || m.pos.y < 1 || !t.alive) { endMissile(m, i); } return; }
  for (const s of ships) {
    if (!s.alive || s.side === m.side || s.sinkT > 40) continue;
    if (Math.abs(m.pos.x - s.pos.x) > s.radius + 40 || Math.abs(m.pos.z - s.pos.z) > s.radius + 40) continue;
    const steps = Math.max(1, Math.ceil(m.prev.distanceTo(m.pos) / 15));
    let inside = false;
    for (let k = 1; k <= steps && !inside; k++) { _d.lerpVectors(m.prev, m.pos, k / steps); inside = insideShip(s, _d, 2); }
    if (inside) { m.pos.copy(_d); dbg.hit++; dbg.hitBy[m.side]++; damageShip(s, S.dmg * rand(0.8, 1.2), { owner: m.owner, kind: 'missile', name: S.name }, m.pos.clone()); endMissile(m, i, false); return; }
  }
  for (const b of bases) if (b.alive && b.side !== m.side && m.pos.distanceTo(b.pos) < 900 && m.pos.y < 40) { damageBase(b, S.dmg, { owner: m.owner }, m.pos.clone()); endMissile(m, i, false); return; }
  m.dist = (m.dist || 0) + m.speed * dt;
  // a missile that has flown past its aim point without hitting anything is spent
  if (hd < 300 && m.pos.y < 30) m.closest = Math.min(m.closest ?? 1e9, hd);
  if (m.pos.y < 0.5 || m.dist > m.range || (m.closest < 300 && hd > m.closest + 150)) { if (m.locked && (dbg.misses = dbg.misses || []).length < 12) dbg.misses.push({ side: m.side, n: S.name, tgt: m.target && m.target.name, tk: m.target && m.target.kind, alive: m.target && m.target.alive, d: m.target && Math.round(m.target.pos.distanceTo(m.pos)), y: Math.round(m.pos.y), dist: Math.round(m.dist), range: m.range, hd: Math.round(hd) }); dbg.miss++; dbg.fate[m.side][m.locked ? 'missLocked' : 'missNoLock'] = (dbg.fate[m.side][m.locked ? 'missLocked' : 'missNoLock'] || 0) + 1; if (!m.locked) dbg.noSeeker++; endMissile(m, i); }
}
// active seeker: the briefed target if it is in the basket, otherwise the most valuable (LRASM) or nearest ship ahead
function acquire(m) {
  let best = null, bs = 1e9;
  for (const s of ships) {
    if (!s.alive || s.dying || s.side === m.side) continue;
    _a.subVectors(s.pos, m.pos).setY(0);
    const d = _a.length();
    if (d > 22000) continue;
    _b.copy(m.dir).setY(0).normalize();
    if (_a.normalize().dot(_b) < 0.72) continue;
    const sc = s === m.target ? -1e6 : m.spec.smart ? -s.value * 100 + d : d;
    if (sc < bs) { bs = sc; best = s; }
  }
  if (!best) for (const b of bases) if (b.alive && b.side !== m.side && b.pos.distanceTo(m.pos) < 22000) best = b;
  return best;
}
function updateSAM(m, i, dt) {
  const S = m.spec, t = m.target;
  m.speed = Math.min(m.speed + 400 * dt, S.v);
  if (!t || !t.alive || t.dying) { m.dir.y -= 0.02; m.dir.normalize(); m.target = null; }
  else {
    _ml.subVectors(t.pos, m.pos);
    const dist = _ml.length(), tgo = dist / Math.max(m.speed, 300);
    _md.copy(t.pos).addScaledVector(t.vel || ZERO, tgo).sub(m.pos).normalize();
    if (m.age < 1.2) _md.lerp(Y_AXIS, 0.6).normalize();
    steer(m, _md, m.age < 1.2 ? 1.2 : 3.2, dt);
    m.best = Math.min(m.best, dist);
    if (dist < 45 || (dist > m.best + 20 && m.best < 260)) {
      const cls = t.kind === 'plane' ? 'plane' : t.spec.profile;
      let pk = S.pk * PK_MUL[cls] * (t.spec && t.spec.evade || 1);
      if (t.kind === 'plane' && game.t - t.chaffT < 2.5) pk *= 0.6;
      if (t.kind === 'plane' && t.pos.y < 60) pk *= 0.7;
      if (Math.random() < pk) {
        if (t.kind === 'plane') damagePlane(t, 260, { owner: m.owner, kind: 'missile', name: S.name });
        else { const j = missiles.indexOf(t); if (j >= 0) { dbg.samKill++; dbg.fate[t.side].sam = (dbg.fate[t.side].sam || 0) + 1; explode(t.pos, 0.8, null); scene.remove(t.mesh); t.alive = false; missiles.splice(j, 1); if (t.side === game.side && Math.random() < 0.3) radio('敌舰', '拦截命中。', '#ff8a78'); else if (Math.random() < 0.25) radio(m.owner.name, `${S.name}拦截成功！`, '#9fd4ff'); } }
      }
      endMissile(m, missiles.indexOf(m)); return;
    }
  }
  m.prev.copy(m.pos);
  m.vel.copy(m.dir).multiplyScalar(m.speed);
  m.pos.addScaledVector(m.vel, dt);
  trail(m, 2, S.short ? 4 : 8, 0.9);
  m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.dir);
  if (m.age > S.range / S.v * 1.6 + 4 || m.pos.y < 0) endMissile(m, i);
}
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (!m || !m.alive) continue;
    m.age += dt;
    if (m.cls === 'aam') { m.prev.copy(m.pos); updateAAM(m, i, dt); }
    else if (m.cls === 'ashm') updateASHM(m, i, dt);
    else updateSAM(m, i, dt);
  }
}
function segDist(p0, p1, c) {
  _a.subVectors(p1, p0); const l2 = _a.lengthSq();
  const t = l2 > 0 ? clamp(_b.subVectors(c, p0).dot(_a) / l2, 0, 1) : 0;
  return _c.copy(p0).addScaledVector(_a, t).distanceTo(c);
}

/* ---------- guns, CIWS, shells ---------- */
function fireBullet(from, dir, owner, speed = 1100, life = 1.7, dmg = 0) {
  if (bullets.length >= MAX_BULLETS) return;
  bullets.push({ pos: from.clone(), prev: from.clone(), vel: dir.clone().multiplyScalar(speed).add(owner.vel || ZERO), life, owner, side: owner.side, dmg });
}
function shootGun(pl, aimDir, err) {
  if (pl.gunCd > 0 || pl.ammo <= 0) return;
  pl.gunCd = pl === player ? 1 / 25 : 0.085;
  pl.ammo -= pl === player ? 2 : 1;
  const dir = aimDir.clone();
  dir.x += rand(-err, err); dir.y += rand(-err, err); dir.z += rand(-err, err);
  _a.set(2.6, 0.55, 1.25).applyQuaternion(pl.q).add(pl.pos);
  fireBullet(_a, dir.normalize(), pl, 1100, 1.7, pl.side === game.side ? 12 : 4);
  if (pl === player) { if (Math.random() < 0.5) Sound.gun(); game.shake = Math.max(game.shake, 0.12); }
}
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
    if (b.dmg > 0) for (const e of planes) {
      if (e.side === b.side || !e.alive || e.dying || !e.airborne) continue;
      if (Math.abs(e.pos.x - b.pos.x) > 200 || Math.abs(e.pos.z - b.pos.z) > 200) continue;
      if (segDist(b.prev, b.pos, e.pos) < e.radius + 2) {
        damagePlane(e, b.dmg, { owner: b.owner, kind: 'gun', name: '机炮' }); hit = true;
        for (let k = 0; k < 5; k++) { _d.randomDirection().multiplyScalar(40); fire.emit(b.pos.x, b.pos.y, b.pos.z, e.vel.x + _d.x, e.vel.y + _d.y, e.vel.z + _d.z, 0.25, 2.5, 1, 1.5, 1.2, 0.7, 1); }
        break;
      }
    }
    if (!hit && b.pos.y < 0) { if (near(b.pos, 3000)) smoke.emit(b.pos.x, 0, b.pos.z, 0, 10, 0, 1, 2, 7, 0.9, 0.93, 0.95, 0.5, 1, 9); hit = true; }
    if (hit || b.life <= 0) { bullets.splice(i, 1); continue; }
    if (n < MAX_BULLETS && near(b.pos, 8000)) {
      _a.copy(b.vel).normalize();
      dummy.position.copy(b.pos).addScaledVector(_a, -8);
      dummy.quaternion.setFromUnitVectors(X_AXIS, _a);
      dummy.scale.set(16, 0.4, 0.4);
      dummy.updateMatrix();
      tracerMesh.setMatrixAt(n, dummy.matrix);
      tracerMesh.setColorAt(n, TRACER[b.side]);
      n++;
    }
  }
  tracerMesh.count = n;
  tracerMesh.instanceMatrix.needsUpdate = true;
  if (tracerMesh.instanceColor) tracerMesh.instanceColor.needsUpdate = true;
}
// close-in weapon systems: a stream of tracers at the nearest leaker, kill chance per second of fire
function ciws(s, dt) {
  const n = s.S.ciws || 0;
  if (!n) return;
  const threats = [];
  for (const m of missiles) if (m.alive && m.cls === 'ashm' && m.side !== s.side && m.pos.distanceToSquared(s.pos) < 2300 * 2300 && m.pos.y < 400) threats.push(m);
  threats.sort((a, b) => a.pos.distanceToSquared(s.pos) - b.pos.distanceToSquared(s.pos));
  for (let k = 0; k < Math.min(n, threats.length); k++) {
    const m = threats[k];
    const from = toWorld(s, (k % 2 ? -1 : 1) * s.radius * 0.5, s.carrier ? 18 : 10, (k % 3 - 1) * 8, _b);
    _a.copy(m.pos).addScaledVector(m.vel, from.distanceTo(m.pos) / 1100).sub(from).normalize();
    if (Math.random() < dt * 30) { const d = _a.clone(); d.x += rand(-0.012, 0.012); d.y += rand(-0.012, 0.012); d.z += rand(-0.012, 0.012); fireBullet(from, d.normalize(), s, 1100, 2.2, 0); }
    if (near(from, 5000) && Math.random() < dt * 8) Sound.burst(0.12, 1800, 900, 0.08 * clamp(1 - from.distanceTo(camera.position) / 5000, 0, 1), 'bandpass');
    const window = 2300 / Math.max(m.speed, 100), rate = -Math.log(1 - CIWS_PK[m.spec.profile]) / window;
    if (Math.random() < rate * dt) {
      explode(m.pos, 0.7, null); dbg.ciwsKill++; dbg.fate[m.side].ciws = (dbg.fate[m.side].ciws || 0) + 1;
      const j = missiles.indexOf(m); scene.remove(m.mesh); m.alive = false; missiles.splice(j, 1);
      if (s.side === game.side && Math.random() < 0.5) radio(s.name, '近防炮击毁来袭导弹！', '#9fd4ff');
    }
  }
}
// ---- naval guns: real ballistics with drag, fire-control solutions, impact and proximity fuzes ----
const _gt = {};
function gunTable(spec) {
  if (_gt[spec.name]) return _gt[spec.name];
  const rows = [];
  for (let e = 0; e <= 45.01; e += 0.25) {
    const el = e * D2R; let vx = spec.v0 * Math.cos(el), vy = spec.v0 * Math.sin(el), x = 0, y = 0, t = 0;
    const h = 0.04;
    while (y >= 0 && t < 120) { const v = Math.hypot(vx, vy); vx += -spec.k * v * vx * h; vy += (-9.81 - spec.k * v * vy) * h; x += vx * h; y += vy * h; t += h; }
    rows.push([el, x, t]);
  }
  return (_gt[spec.name] = rows);
}
// elevation and time of flight for a horizontal range (low-angle solution)
function solveElev(spec, R) {
  const T = gunTable(spec);
  for (let i = 1; i < T.length; i++) {
    if (T[i][1] >= R) { const a = T[i - 1], b = T[i], k = (R - a[1]) / (b[1] - a[1]); return { elv: lerp(a[0], b[0], k), tof: lerp(a[2], b[2], k) }; }
    if (T[i][1] < T[i - 1][1]) break;
  }
  return null;
}
function rangeAt(spec, elv) {
  const T = gunTable(spec), i = clamp(Math.floor(elv / D2R / 0.25), 0, T.length - 2), a = T[i], b = T[i + 1], k = clamp((elv - a[0]) / (b[0] - a[0]), 0, 1);
  return { R: lerp(a[1], b[1], k), tof: lerp(a[2], b[2], k) };
}
const gunMount = (s, out = new V3()) => toWorld(s, s.S.L * s.gun.spec.x, s.h * 0.35 + 3, 0, out);
const gunDir = (s, brg, elv, out = new V3()) => { const h = s.heading + brg; return out.set(Math.cos(h) * Math.cos(elv), Math.sin(elv), -Math.sin(h) * Math.cos(elv)); };
// where a shell fired at (brg, elv) comes down on the sea: what the director's crosshair shows
function impactPoint(s, brg, elv, out = new V3()) {
  const m = gunMount(s, _ga), R = rangeAt(s.gun.spec, Math.max(elv, 0)).R, h = s.heading + brg;
  return out.set(m.x + Math.cos(h) * R, 0, m.z - Math.sin(h) * R);
}
// the sight looks at the fall of shot for ship targets, straight down the barrel for anti-air fire
function sightPoint(s, brg, elv, out) {
  if (s.gun.fuse === 'AA') return out.copy(gunMount(s, _ga)).addScaledVector(gunDir(s, brg, elv, _gc), 3000);
  return impactPoint(s, brg, elv, out);
}
// fire-control solution: iterate time of flight against the target's motion
function fcs(s, T) {
  const g = s.gun, m = gunMount(s, _ga);
  // shells carry the firing ship's own motion, so lead on the target's motion relative to ours
  const tv = _gd.copy(T.vel || ZERO).sub(s.vel);
  _gb.copy(T.pos);
  let sol = null;
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(_gb.x - m.x, _gb.z - m.z);
    sol = solveElev(g.spec, d);
    if (!sol) return null;
    const hgt = (T.kind === 'ship' ? T.h * 0.3 : T.pos.y) - m.y;
    sol.elv += Math.atan2(hgt, d);
    _gb.copy(T.pos).addScaledVector(tv, sol.tof);
  }
  const brg = wrapA(headingOf(_gc.subVectors(_gb, m)) - s.heading);
  return { brg, elv: sol.elv, tof: sol.tof, range: Math.hypot(_gb.x - m.x, _gb.z - m.z), aim: _gb.clone() };
}
const _ga = new V3(), _gb = new V3(), _gc = new V3(), _gd = new V3();
function fireGun(s, err) {
  const g = s.gun;
  if (g.cd > 0 || g.ammo <= 0) return false;
  if (Math.abs(g.brg) > 2.6) return false;                       // the superstructure masks the arcs astern
  g.cd = g.spec.rate; g.ammo--;
  const m = gunMount(s, new V3()), dir = gunDir(s, g.brg, g.elv);
  dir.x += rand(-err, err); dir.y += rand(-err, err) + s.list * 0.02; dir.z += rand(-err, err); dir.normalize();
  m.addScaledVector(dir, 6);
  shells.push({ pos: m.clone(), prev: m.clone(), vel: dir.multiplyScalar(g.spec.v0).add(s.vel), owner: s, side: s.side, spec: g.spec, fuse: g.fuse, t: 0, target: s === flagship ? game.gunTgt : g.tgt });
  if (near(m, 9000)) {
    const v = clamp(1 - m.distanceTo(camera.position) / 9000, 0, 1);
    Sound.burst(0.55, 900, 60, (s === flagship ? 0.7 : 0.35) * v); Sound.burst(0.12, 3000, 600, 0.25 * v, 'bandpass');
    for (let i = 0; i < 6; i++) fire.emit(m.x, m.y, m.z, dir.x * 60 + rand(-8, 8), dir.y * 60 + rand(-8, 8), dir.z * 60 + rand(-8, 8), 0.12, 8, 18, 1.5, 1.1, 0.6, 1);
    for (let i = 0; i < 12; i++) smoke.emit(m.x, m.y, m.z, dir.x * 25 + rand(-5, 5), dir.y * 25 + rand(0, 6), dir.z * 25 + rand(-5, 5), rand(2, 4), 6, 30, 0.75, 0.74, 0.72, 0.7, 0.9);
  }
  if (s === flagship) game.shake = Math.max(game.shake, 0.6);
  return true;
}
// mounts slew toward their ordered bearing and elevation at the real rates
function slewGun(s, dt) {
  const g = s.gun;
  g.cd -= dt;
  g.brg += clamp(wrapA(g.wantB - g.brg), -g.spec.train * D2R * dt, g.spec.train * D2R * dt);
  g.elv += clamp(g.wantE - g.elv, -g.spec.elev * D2R * dt, g.spec.elev * D2R * dt);
  g.wantE = clamp(g.wantE, -0.12, 1.2);
}
// gun crews (AI ships, and the player's ship outside the gunsight) engage the nearest enemy ship in range
function shipGun(s, dt) {
  if (!s.gun) return;
  slewGun(s, dt);
  if (s === flagship && game.gunsight) return;
  s.gun.aimT -= dt;
  if (s.gun.aimT <= 0) {
    s.gun.aimT = 2;
    let tgt = null, bd = s.gun.spec.maxR * 0.85;
    for (const [e, tr] of picture[s.side]) if (e.kind === 'ship' && e.alive && !e.dying && game.t - tr.t < 5) { const d = e.pos.distanceTo(s.pos); if (d < bd) { bd = d; tgt = e; } }
    s.gun.tgt = tgt;
  }
  const t = s.gun.tgt;
  if (!t || !t.alive || t.dying) return;
  const sol = fcs(s, t);
  if (!sol) return;
  s.gun.wantB = sol.brg; s.gun.wantE = sol.elv; s.gun.fuse = 'HE';
  if (Math.abs(wrapA(sol.brg - s.gun.brg)) < 0.01 && Math.abs(sol.elv - s.gun.elv) < 0.004) fireGun(s, 0.0032);
}
const shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }), 240);
shellMesh.frustumCulled = false; scene.add(shellMesh);
function updateShells(dt) {
  let n = 0;
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i];
    sh.prev.copy(sh.pos);
    const v = sh.vel.length();
    sh.vel.addScaledVector(sh.vel, -sh.spec.k * v * dt); sh.vel.y -= 9.81 * dt;
    sh.pos.addScaledVector(sh.vel, dt); sh.t += dt;
    let done = false;
    // impact fuze against hulls
    for (const s of ships) {
      if (s.side === sh.side || !s.alive || s.sinkT > 40 || sh.pos.distanceToSquared(s.pos) > (s.radius + 120) ** 2) continue;
      const steps = Math.max(1, Math.ceil(sh.prev.distanceTo(sh.pos) / 8));
      for (let k = 1; k <= steps; k++) { _gc.lerpVectors(sh.prev, sh.pos, k / steps); if (insideShip(s, _gc, 1.5)) { damageShip(s, sh.spec.dmg * rand(0.8, 1.3), { owner: sh.owner, kind: 'gun' }, _gc.clone()); done = true; if (sh.owner === flagship) { game.gunHits = (game.gunHits || 0) + 1; game.lastFall = { t: game.t, text: '命中！' }; } break; } }
      if (done) break;
    }
    // proximity fuze against missiles and aircraft
    if (!done && sh.fuse === 'AA' && sh.t > 1) {
      for (const m of missiles) if (m.alive && m.side !== sh.side && m.cls === 'ashm' && m.pos.distanceToSquared(sh.pos) < 22 * 22) {
        explode(sh.pos, 0.5, null); done = true;
        if (Math.random() < 0.6) { explode(m.pos, 0.8, null); const j = missiles.indexOf(m); scene.remove(m.mesh); m.alive = false; missiles.splice(j, 1); if (sh.owner === flagship) { message('舰炮击毁来袭导弹', '', '#8dffb4', 2); } }
        break;
      }
      if (!done) for (const p of planes) if (p.alive && !p.dying && p.side !== sh.side && p.airborne && p.pos.distanceToSquared(sh.pos) < 28 * 28) { explode(sh.pos, 0.6, null); damagePlane(p, 70, { owner: sh.owner, kind: 'gun' }); done = true; break; }
    }
    if (!done && sh.pos.y < 0) {
      splash(sh.pos, sh.spec.dmg > 10 ? 1.3 : 0.8);
      // fall-of-shot report for the player: over / short against the designated target
      if (sh.owner === flagship && sh.target && sh.target.alive) {
        const to = _gc.subVectors(sh.target.pos, sh.owner.pos).setY(0), d = to.length();
        const along = _ga.subVectors(sh.pos, sh.owner.pos).setY(0).dot(to) / d - d;
        const cross = _ga.cross(to.normalize()).y;
        if (Math.abs(along) < 2500) game.lastFall = { t: game.t, text: `${along > 0 ? '远弹' : '近弹'} ${Math.abs(along).toFixed(0)} 米 · 偏${cross > 0 ? '左' : '右'} ${Math.abs(cross).toFixed(0)} 米` };
      }
      done = true;
    }
    if (done || sh.t > 90) { shells.splice(i, 1); continue; }
    if (n < 240 && near(sh.pos, 25000)) {
      dummy.position.copy(sh.pos); dummy.quaternion.identity(); dummy.scale.setScalar(clamp(sh.pos.distanceTo(camera.position) / 900, 0.5, 5)); dummy.updateMatrix();
      shellMesh.setMatrixAt(n++, dummy.matrix);
    }
  }
  shellMesh.count = n; shellMesh.instanceMatrix.needsUpdate = true;
}
function updateFlares(dt) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i];
    f.vel.multiplyScalar(Math.exp(-dt * 1.2)); f.vel.y -= 18 * dt;
    f.pos.addScaledVector(f.vel, dt);
    f.life -= dt;
    if (near(f.pos, 4000)) fire.emit(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 0.1, 7, 3, 1.6, 1.4, 1.1, 1);
    if (f.life <= 0) { f.alive = false; flares.splice(i, 1); }
  }
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i];
    d.pos.addScaledVector(d.vel, dt); d.life -= dt;
    if (near(d.pos, 9000) && Math.random() < 0.5) fire.emit(d.pos.x + rand(-20, 20), d.pos.y + rand(-10, 10), d.pos.z + rand(-20, 20), 0, -2, 0, 0.8, 3, 1, 1, 1, 1.1, 0.7);
    if (d.life <= 0) { d.alive = false; decoys.splice(i, 1); }
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
    if (d.life <= 0 || p.y < 0) { scene.remove(d.mesh); debris.splice(i, 1); }
  }
}

/* ---------- flight model (from 猛禽制空, plus landing configuration) ----------
   Gear and flaps lower the stall speed and add drag; with gear down the approach power compensator
   holds on-speed (about 1.18 x stall) unless the pilot overrides with afterburner or speedbrake. */
function flight(pl, c, dt) {
  const T = pl.T;
  pl.axes();
  const land = pl.gear > 0.5;
  const vs = T.vs * (land ? 0.8 : 1);
  let pitch = c.pitch;
  pl.stall = pl.speed < vs;
  if (pl.stall) pitch -= (vs - pl.speed) / 40;
  const spdF = clamp((pl.speed - vs * 0.55) / 140, 0.3, 1);
  const R = pl.rate;
  R.y += (pitch * T.pitch * spdF * pl.authority - R.y) * (1 - Math.exp(-dt / 0.15));
  R.x += (c.roll * T.roll * pl.authority * (land ? 0.7 : 1) - R.x) * (1 - Math.exp(-dt / 0.12));
  R.z += ((c.yaw || 0) * 0.35 - R.z) * (1 - Math.exp(-dt / 0.25));
  pl.q.multiply(_q.setFromAxisAngle(Z_AXIS, R.y * dt));
  pl.q.multiply(_q.setFromAxisAngle(X_AXIS, R.x * dt));
  pl.q.multiply(_q.setFromAxisAngle(Y_AXIS, -R.z * dt));
  pl.q.normalize(); pl.axes();
  pl.boost = c.boost && !c.brake;
  const dmgF = pl.hp < pl.maxHp * 0.3 ? 0.78 : 1;
  const v = pl.speed;
  const drag = T.drag * v * v * (land ? 2.4 : 1) + Math.abs(pitch) * v * 0.045 * spdF + (c.brake ? v * 0.13 : 0);
  let thrust = (pl.boost ? T.ab : c.brake ? 10 : T.mil * (c.thr ?? 1)) * dmgF;
  if (land && !c.boost && !c.brake) thrust = clamp(drag + 9.81 * pl.fwd.y + (T.vs * 1.18 - v) * 0.9, 0, T.ab);
  pl.speed = clamp(v + (thrust - drag - 9.81 * pl.fwd.y) * dt, 30, 620);
  pl.g = 1 + Math.abs(R.y) * pl.speed / 9.81 * 0.36;
  const qd = (220 / Math.max(pl.speed, 60)) ** 2;
  const aT = clamp((0.04 + (pl.g - 1) * 0.028 * (R.y < 0 ? -1 : 1)) * qd, -0.2, 0.42);
  pl.alpha += (aT - pl.alpha) * (1 - Math.exp(-dt / 0.25));
  pl.gStress = Math.max(0, pl.gStress + (pl.g > 7.5 ? (pl.g - 7.5) * 0.45 : -1.3) * dt);
  pl.authority = pl.gStress > 3.5 ? 0.6 : 1;
  pl.integrate(dt);
  pl.pos.y -= (1 - smooth(vs * 0.85, vs * 1.25, pl.speed)) * 18 * dt;
  pl.sync();
  pl.fuel -= dt * (pl.boost ? 2.6 : 1);
}

/* ---------- AI pilot ---------- */
const MODE_TEXT = { pullup: '拉起避海', notch: '切向置尾 · 规避雷达弹', break: '急转规避', bvr: '超视距接敌', pursuit: '追踪', guns: '机炮咬尾',
  lag: '滞后追踪', cap: '战斗空中巡逻', aew: '预警巡逻', sweep: '前出搜索', escort: '护航', strike: '反舰突击', ingress: '低空突防', release: '发射反舰导弹',
  bomber: '远程突击', rtb: '返航', final: '着舰进近', energy: '俯冲增速', extend: '拉开距离', holding: '等待着舰' };
class Pilot {
  constructor(pl, skill) {
    Object.assign(this, { pl, skill, target: null, threat: null, think: rand(0, 0.5), lockT: 0, mslCd: rand(2, 5), mode: 'cap', desired: new V3(1, 0, 0), react: lerp(0.7, 0.08, skill), ashmT: 0 });
  }
}
const _ai1 = new V3(), _ai2 = new V3(), _ai3 = new V3(), _ai4 = new V3();
function aiAssess(pl) {
  const P = pl.pilot, R = pl.role;
  P.threat = null;
  let td = 14000;
  for (const m of missiles) if (m.alive && m.target === pl && (m.cls === 'aam' || m.cls === 'sam') && m.age > 0.3) { const d = m.pos.distanceTo(pl.pos); if (d < td) { td = d; P.threat = m; } }
  let bestT = null, bs = 1e9;
  const reach = R === 'cap' || R === 'sweep' ? 60000 : R === 'escort' ? 30000 : R === 'strike' || R === 'bomber' ? 9000 : 0;
  if (pl.T.mrm + pl.T.srm > 0 || pl.T.ammo > 0) for (const [e, tr] of picture[pl.side]) {
    if (e.kind !== 'plane' || !e.alive || e.dying || game.t - tr.t > 4) continue;
    const d = e.pos.distanceTo(pl.pos);
    if (d > reach) continue;
    _ai1.subVectors(e.pos, pl.pos);
    const off = pl.fwd.angleTo(_ai1);
    const s = d / 1000 + off * 1.4 + (e === P.target ? -2 : 0) - (e.T.role === 'bomber' ? 8 : e.T.aew ? 6 : e.ashmN > 0 ? 3 : 0);
    if (s < bs) { bs = s; bestT = e; }
  }
  if (bestT !== P.target) { P.lockT = 0; P.gunsT = 0; }
  P.target = bestT;
}
function stickToward(pl, d, c, sk) {
  const f = d.dot(pl.fwd), u = d.dot(pl.up), r = d.dot(pl.right);
  const ang = Math.acos(clamp(f, -1, 1));
  if (ang < 0.07) { c.pitch = clamp(u * 18, -1, 1); c.yaw = clamp(r * 16, -1, 1); c.roll = clamp(r * 5 + pl.right.y * 1.4, -1, 1); return; }
  if (u < 0 && ang < 0.6 && Math.abs(r) < -u * 1.2) { c.pitch = clamp(u * 4, -0.8, 0); c.roll = clamp(r * 4 + pl.right.y * 1.2, -1, 1); return; }
  const phi = Math.atan2(r, u);
  c.roll = clamp(phi * (1.6 + sk), -1, 1);
  c.pitch = clamp(Math.min(1, ang * 2.6) * (0.2 + 0.8 * clamp(1 - Math.abs(phi) / 1.25, 0, 1)), 0, 1);
}
function fly(d, pl, x, y, z) { d.set(x - pl.pos.x, 0, z - pl.pos.z); const h = d.length(); d.normalize(); d.y = clamp((y - pl.pos.y) / Math.max(h * 0.4, 1500), -0.45, 0.45); return d.normalize(); }
function aiControl(pl, dt) {
  const P = pl.pilot, sk = P.skill, c = pl.c, d = P.desired;
  pl.axes();
  c.pitch = c.roll = c.yaw = 0; c.boost = c.brake = false;
  P.think -= dt;
  if (P.think <= 0) { P.think = P.react; aiAssess(pl); }
  const out = { gun: false, srm: false, mrm: false, cm: false, ashm: false };
  const low = (pl.role === 'strike' && (P.mode === 'ingress' || P.mode === 'release')) || (pl.role === 'bomber' && pl.type === 'b1b');
  const floor = groundAt(pl.pos.x + pl.vel.x * 4, pl.pos.z + pl.vel.z * 4) + (low ? 14 : 150);
  const t = P.target, m = P.threat;
  pl.painting = false;
  if (pl.pos.y + Math.min(pl.vel.y, 0) * 6 < floor) {
    P.mode = 'pullup';
    d.set(pl.fwd.x, 0, pl.fwd.z).normalize().addScaledVector(Y_AXIS, 1.3).normalize(); c.boost = true;
  } else if (m && m.alive) {
    const los = _ai3.subVectors(m.pos, pl.pos), md = los.length(); los.multiplyScalar(1 / md);
    if ((m.cls === 'sam' || m.spec.seeker === 'radar') && md > 2400) {
      P.mode = 'notch';
      d.set(-los.z, 0, los.x).normalize(); if (d.dot(pl.fwd) < 0) d.negate();
      d.y = clamp((Math.max(floor + 300, 600) - pl.pos.y) / 1600, -0.45, 0.2); d.normalize();
      c.boost = true; out.cm = md < 6000;
    } else {
      P.mode = 'break';
      const pu = _ai4.copy(pl.up).addScaledVector(los, -pl.up.dot(los)).normalize();
      d.copy(pl.fwd).addScaledVector(los, -pl.fwd.dot(los)).normalize().multiplyScalar(0.5).add(pu).normalize();
      if (pl.pos.y < floor + 500) d.y = Math.max(d.y, 0.15);
      c.boost = md > 900 || pl.speed < 220; out.cm = md < 2200;
    }
  } else if (t && !(pl.role === 'strike' && pl.ashmN > 0)) {
    aiAttack(pl, t, d, c, out, dt);
  } else roleFly(pl, d, c, out, dt);
  // keep apart from friendly aircraft
  for (const o of planes) {
    if (o === pl || o.side !== pl.side || !o.airborne) continue;
    _ai1.subVectors(pl.pos, o.pos);
    const dd = _ai1.lengthSq();
    if (dd < 230 * 230 && dd > 0.01) { const l = Math.sqrt(dd); d.addScaledVector(_ai1.multiplyScalar(1 / l), (230 - l) / 230 * 1.2); }
  }
  const hd = Math.hypot(pl.pos.x, pl.pos.z);
  if (hd > 70000 && pl.role !== 'bomber') d.add(_ai1.set(-pl.pos.x, 0, -pl.pos.z).normalize().multiplyScalar((hd - 70000) / 3000));
  if (pl.pos.y > 11000) d.y -= 0.6;
  d.normalize();
  stickToward(pl, d, c, sk);
  if (pl.gStress > 1.6) c.pitch *= 0.7;
  if (out.cm && pl.cm > 0 && pl.cmCd <= 0 && Math.random() < 0.4 + sk * 0.6) { dispense(pl); pl.cmCd = lerp(1.8, 0.75, sk); }
  return out;
}
function aiAttack(pl, t, d, c, out, dt) {
  const P = pl.pilot, sk = P.skill;
  const to = _ai3.subVectors(t.pos, pl.pos), dist = to.length();
  const tv = t.vel || ZERO, off = pl.fwd.angleTo(to);
  if (P.extendT > 0 && dist < 2600) {
    P.extendT -= dt; P.mode = 'extend';
    d.set(-to.x, 0, -to.z).normalize(); d.y = 0.08; c.boost = true;
    if (dist > 2400) P.extendT = 0;
  } else if (dist > 1500) {
    P.gunsT = 0;
    P.mode = dist > 6000 ? 'bvr' : 'pursuit';
    d.copy(t.pos).addScaledVector(tv, clamp(dist / 1000, 0, 2.5) * (0.3 + 0.7 * sk)).sub(pl.pos).normalize();
    if (dist > 6000 && pl.pos.y < t.pos.y + 1200) d.y += 0.06;
    c.boost = pl.speed < 300 || dist > 5000;
  } else {
    P.mode = 'guns';
    P.gunsT = (P.gunsT || 0) + dt;
    if (P.gunsT > 16 && pl.mrm > 0) { P.gunsT = 0; P.extendT = 14; }
    d.copy(t.pos).addScaledVector(tv, dist / 1100).sub(pl.pos).normalize();
    const closure = _ai4.subVectors(pl.vel, tv).dot(to) / dist;
    if (dist < 260 && closure > 80 && off < 0.5) { c.brake = true; P.mode = 'lag'; } else c.boost = pl.speed < 280;
    if (pl.fwd.angleTo(d) < 0.05 + (1 - sk) * 0.02 && dist < 1100 && pl.ammo > 0) out.gun = true;
  }
  if (pl.speed < 165 && P.mode !== 'lag') { d.y = Math.min(d.y, -0.08); c.boost = true; P.mode = 'energy'; }
  const sees = off < 0.65 && dist < 20000;
  P.lockT = sees ? P.lockT + dt / (t.rcs < 0.5 ? 2.2 : 1) : Math.max(0, P.lockT - dt * 2);
  pl.painting = sees && t === player;
  P.mslCd -= dt;
  if (P.mslCd > 0 || missiles.some(x => x.alive && x.owner === pl && x.target === t)) return;
  const srm = MSL[pl.T.srmType], mrm = MSL[pl.T.mrmType];
  // stealthy targets must be closer before a radar missile can be guided
  const stealthK = t.rcs < 0.5 ? 0.55 : 1;
  if (pl.srm > 0 && srm && P.lockT > srm.lockT && dist > 350 && dist < srm.range * (0.6 + 0.3 * sk) && off < 0.8) out.srm = true;
  else if (pl.mrm > 0 && mrm && P.lockT > mrm.lockT && dist > 900 && dist < mrm.range * (0.5 + 0.35 * sk) * stealthK && off < 0.5) out.mrm = true;
}
// what an aircraft does when it is not fighting: its assigned role
function roleFly(pl, d, c, out, dt) {
  const P = pl.pilot, home = pl.home, task = pl.task || {};
  const dirToFoe = _ai2.set(SIDES[pl.side].foe === 'us' ? 1 : -1, 0, 0);
  const anchor = home && home.alive && !home.dying ? home.pos : (fleetCentre(pl.side) || pl.pos);
  if ((pl.fuel < 240 || (pl.role !== 'aew' && pl.mrm + pl.srm + pl.ashmN === 0 && pl.T.role !== 'bomber')) && pl.role !== 'rtb') { pl.role = 'rtb'; if (mine(pl) && Math.random() < 0.3) radio(pl.name, pl.fuel < 240 ? 'Bingo 油量，返航。' : '弹药耗尽，返航。', '#9fd4ff'); }
  switch (pl.role) {
    case 'cap': case 'aew': {
      P.mode = pl.role;
      const off = pl.role === 'aew' ? 26000 : task.off || 14000, alt = pl.role === 'aew' ? 8000 : 6500, r = pl.role === 'aew' ? 9000 : 6000;
      const cx = anchor.x + dirToFoe.x * off + (task.lat || 0), cz = anchor.z + (task.latZ || 0);
      const a = Math.atan2(pl.pos.z - cz, pl.pos.x - cx) + 0.5;
      fly(d, pl, cx + Math.cos(a) * r, alt, cz + Math.sin(a) * r);
      c.boost = pl.speed < 200;
      // the AEW keeps clear of enemy fighters
      if (pl.T.aew) for (const [e] of picture[pl.side]) if (e.kind === 'plane' && e.T.mrm > 0 && e.pos.distanceTo(pl.pos) < 35000) { fly(d, pl, anchor.x, alt, anchor.z); break; }
      break;
    }
    case 'sweep': {
      P.mode = 'sweep';
      const tp = task.point || anchor;
      fly(d, pl, tp.x, 7000, tp.z);
      if (Math.hypot(tp.x - pl.pos.x, tp.z - pl.pos.z) < 4000) pl.role = 'rtb';
      break;
    }
    case 'escort': {
      P.mode = 'escort';
      const L = task.lead;
      if (!L || !L.alive || L.dying || L.role === 'rtb') { pl.role = 'rtb'; break; }
      const slot = _ai3.copy(L.pos).addScaledVector(L.right, task.slot || 120).addScaledVector(L.fwd, -200).addScaledVector(Y_AXIS, 600);
      d.subVectors(slot, pl.pos); const dist = d.length(); d.normalize();
      if (dist < 300) d.lerp(L.fwd, 0.7).normalize();
      c.boost = _ai4.subVectors(slot, pl.pos).dot(pl.fwd) > 300;
      break;
    }
    case 'strike': case 'bomber': {
      const tgt = task.target;
      if (!tgt || !tgt.alive || tgt.dying || pl.ashmN <= 0) { pl.role = 'rtb'; break; }
      const tp = trackPos(pl.side, tgt, _ai3) || task.last || tgt.pos;
      task.last = (task.last || new V3()).copy(tp);
      const dist = Math.hypot(tp.x - pl.pos.x, tp.z - pl.pos.z), spec = MSL[pl.T.ashmType];
      const bomberHigh = pl.type === 'h6k';
      if (dist < spec.range * 0.82) {
        P.mode = 'release';
        fly(d, pl, tp.x, bomberHigh ? 8000 : pl.role === 'bomber' ? 3000 : 60, tp.z);
        P.ashmT -= dt;
        if (P.ashmT <= 0 && pl.fwd.angleTo(_ai4.set(tp.x - pl.pos.x, 0, tp.z - pl.pos.z)) < 0.5) { out.ashm = true; P.ashmT = 1.2; }
      } else {
        const lowLeg = !bomberHigh && pl.role === 'strike' && dist < spec.range + 30000;
        P.mode = lowLeg ? 'ingress' : pl.role === 'bomber' ? 'bomber' : 'strike';
        fly(d, pl, tp.x, lowLeg ? 22 : bomberHigh ? 8500 : 6000, tp.z);
        c.boost = false;
      }
      break;
    }
    default: {   // rtb
      P.mode = 'rtb';
      const h = pl.home;
      if (!h || !h.alive || h.dying) {
        const alt = altHome(pl);
        if (alt) { pl.home = alt; radio(pl.name, `母舰失去作战能力，转降${alt.name}。`, '#ffd28a'); }
        else { fly(d, pl, anchor.x, 3000, anchor.z); if (pl.fuel <= 0) ditch(pl); }
        break;
      }
      const ap = approachFrame(h);
      const gate = _ai3.copy(ap.td).addScaledVector(ap.u, -6500).setY(ap.y + 600);
      const busy = h.finalUntil > game.t;
      if (busy) { P.mode = 'holding'; const a = Math.atan2(pl.pos.z - gate.z, pl.pos.x - gate.x) + 0.6; fly(d, pl, gate.x + Math.cos(a) * 3500, 1800, gate.z + Math.sin(a) * 3500); break; }
      fly(d, pl, gate.x, gate.y, gate.z);
      const gd = pl.pos.distanceTo(gate);
      if (gd < 1800 && pl.fwd.angleTo(ap.u) < 0.8) beginFinal(pl);
      if (pl.fuel <= -200) ditch(pl);
    }
  }
}
function fleetCentre(side) {
  const s = ships.find(x => x.side === side && x.alive && !x.dying);
  return s ? s.pos : bases.find(b => b.side === side && b.alive)?.pos;
}
function altHome(pl) {
  const c = ships.find(s => s.side === pl.side && s.carrier && s.alive && !s.dying);
  if (c) return c;
  return bases.find(b => b.side === pl.side && b.alive) || null;
}
function ditch(pl) {
  if (mine(pl)) radio(pl.name, '燃油耗尽，跳伞！', '#ff8a78');
  splash(pl.pos, 1);
  if (pl === player) killPlayer('燃油耗尽'); else removePlane(pl);
}

/* ---------- flight operations ----------
   Carriers: aircraft are spotted on a catapult, run up, and are flung to ~72 m/s relative to the deck.
   Recovery is on the angled deck along the landing axis: a 3.5° glide slope to the target (second) wire;
   a hook-down touchdown in the wire window traps, otherwise it is a bolter and the pilot must go around.
   The island base launches and recovers on its runway. */
const GLIDE = 3.5 * D2R;
const _ap = { td: new V3(), u: new V3(), perp: new V3(), y: 0, carrier: false, ramp: 0, len: 0 };
function approachFrame(h) {
  if (h.kind === 'ship') {
    const D = h.deck, L = D.land, ca = Math.cos(L.a), sa = Math.sin(L.a), w = L.wires[1];
    toWorld(h, L.x + ca * w, D.deckY, L.z + sa * w, _ap.td);
    const c = Math.cos(h.heading), s = Math.sin(h.heading);
    _ap.u.set(ca * c + sa * s, 0, -ca * s + sa * c);
    _ap.y = D.deckY; _ap.carrier = true; _ap.ramp = -w; _ap.len = 230 - w;
  } else {
    _ap.td.copy(h.runway.a).addScaledVector(h.runway.dir, 400); _ap.u.copy(h.runway.dir);
    _ap.y = 4; _ap.carrier = false; _ap.ramp = -400; _ap.len = 2500;
  }
  _ap.perp.set(-_ap.u.z, 0, _ap.u.x);
  return _ap;
}
function beginFinal(pl) {
  const h = pl.home, ap = approachFrame(h);
  _a.subVectors(pl.pos, ap.td);
  pl.fin = { s: -_a.dot(ap.u), lat: _a.dot(ap.perp), hOff: 0 };
  pl.fin.hOff = pl.pos.y - (ap.y + pl.T.gearH + pl.fin.s * Math.tan(GLIDE));
  pl.state = 'final'; pl.gear = 1; pl.hook = true; pl.pilot && (pl.pilot.mode = 'final');
  h.finalUntil = game.t + pl.fin.s / 55 + 14;
}
function updateFinal(pl, dt) {
  const h = pl.home;
  if (!h || !h.alive || h.dying) { pl.state = 'air'; pl.role = 'rtb'; return; }
  const ap = approachFrame(h), vApp = pl.T.vs * 1.18, f = pl.fin;
  const closure = vApp - (h.kind === 'ship' ? h.speed * 0.95 + WIND.speed * 0.5 : WIND.speed * 0.3);
  f.s -= Math.max(closure, 25) * dt;
  f.lat *= Math.exp(-dt / 3); f.hOff *= Math.exp(-dt / 2.5);
  pl.pos.copy(ap.td).addScaledVector(ap.u, -f.s).addScaledVector(ap.perp, f.lat);
  pl.pos.y = ap.y + pl.T.gearH + Math.max(f.s, 0) * Math.tan(GLIDE) + f.hOff;
  _a.copy(ap.u).multiplyScalar(Math.cos(GLIDE)).setY(-Math.sin(GLIDE));
  setBasis(pl.q, _a, Y_AXIS);
  pl.alpha = 0.14; pl.speed = vApp; pl.axes(); pl.vel.copy(pl.fwd).multiplyScalar(vApp); pl.sync();
  if (f.s <= 0) {
    const bolter = Math.random() < (pl === player ? 0.03 : 0.07) && ap.carrier;
    if (bolter) { bolterGo(pl); return; }
    startTrap(pl, ap.carrier ? 1 + Math.floor(Math.random() * 3) : 0);
  }
}
function bolterGo(pl) {
  pl.state = 'air'; pl.speed = pl.T.vs * 1.3; pl.c.boost = true; pl.gear = 1; pl.hook = true;
  if (pl.home) pl.home.finalUntil = game.t + 25;
  if (pl === player) { message('逃逸复飞！', '挂索失败 · 加力爬升，重新进近', '#ffc861', 2.6); radio('着舰指挥官', 'Bolter, bolter, bolter！', '#ffd28a'); }
}
function startTrap(pl, wire) {
  pl.state = 'trap'; pl.trapS = 0; pl.trapV = pl.T.vs * 1.0; pl.wire = wire;
  pl.trapDec = wire ? pl.trapV * pl.trapV / (2 * 95) : 6;
  if (pl === player) {
    game.stats.traps++;
    const g = wire === 2 ? 'OK' : 'Fair';
    message(wire ? `着舰成功 · 第 ${wire} 道拦阻索` : '着陆成功', wire ? `评分 ${g} · 补给中` : '滑跑减速 · 补给中', '#8dffb4', 3);
    radio('着舰指挥官', wire ? `${wire} 号索，干得漂亮。` : '欢迎回家。', '#ffd28a');
    Sound.burst(0.6, 600, 80, 0.5);
  }
}
function updateTrap(pl, dt) {
  const h = pl.home;
  if (!h || !h.alive || h.dying) { removeOrKill(pl); return; }
  const ap = approachFrame(h);
  pl.trapV = Math.max(0, pl.trapV - pl.trapDec * dt);
  pl.trapS += pl.trapV * dt;
  pl.pos.copy(ap.td).addScaledVector(ap.u, pl.trapS);
  pl.pos.y = ap.y + pl.T.gearH;
  setBasis(pl.q, ap.u, Y_AXIS); pl.alpha = 0; pl.speed = pl.trapV; pl.axes(); pl.vel.copy(pl.fwd).multiplyScalar(pl.trapV); pl.sync();
  if (pl.trapV <= 0) { pl.state = 'deck'; pl.deckT = pl === player ? 7 : 3; }
}
function removeOrKill(pl) { if (pl === player) killPlayer('母舰沉没'); else removePlane(pl); }
function updateDeck(pl, dt) {
  const h = pl.home;
  if (!h || !h.alive || h.dying) { removeOrKill(pl); return; }
  const ap = approachFrame(h);
  pl.pos.copy(ap.td).addScaledVector(ap.u, pl.trapS || 0); pl.pos.y = ap.y + pl.T.gearH; pl.sync();
  pl.deckT -= dt;
  if (pl.deckT > 0) return;
  if (pl === player) {
    pl.rearm(); pl.hp = pl.maxHp;
    if (!spotOnCatapult(pl)) { pl.deckT = 2; return; }
    message('补给完成', h.kind === 'ship' ? '已就位弹射器 · 推满油门后弹射' : '已滑入跑道 · 推满油门起飞', '#e3b257', 3);
  } else { h.ready.push({ type: pl.type, t: game.t + 50 }); removePlane(pl); }
}
// spot an aircraft on a free catapult (carrier) or the runway threshold (island)
function spotOnCatapult(pl) {
  const h = pl.home;
  pl.state = 'cat'; pl.gear = 1; pl.hook = false; pl.catS = 0; pl.catV = 0; pl.alpha = 0; pl.speed = 0;
  if (h.kind === 'ship') {
    // the wide-span AEW takes the outboard waist catapult; nothing is spotted on the cat right next to it
    const last = h.cats[h.cats.length - 1], free = h.cats.filter(k => !k.plane && k.busy <= game.t);
    const wideOnLast = last.plane && last.plane.T.radius > 10;
    const c = pl.T.radius > 10 ? free.find(k => k === last && !(h.cats.length > 3 && h.cats[2].plane))
      : free.find(k => k !== last && !(wideOnLast && k === h.cats[h.cats.length - 2] && h.cats.length > 3)) || (free.includes(last) && h.cats.length < 4 ? last : null);
    if (!c) { pl.state = 'deck'; return false; }
    c.plane = pl; pl.cat = c;
  } else pl.cat = null;
  pl.catT = pl === player ? 1e9 : rand(4, 7);
  placeOnCat(pl);
  return true;
}
function catGeom(pl) {
  const h = pl.home;
  if (h.kind === 'ship') {
    const c = pl.cat.c, len = Math.hypot(c.x1 - c.x0, (c.x1 - c.x0) * Math.tan(c.a));
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    const lx = c.x0 + 6 + ca * pl.catS, lz = c.z + sa * pl.catS;
    toWorld(h, lx, h.deck.deckY + pl.T.gearH, lz, _ap.td);
    const cc = Math.cos(h.heading), ss = Math.sin(h.heading);
    _ap.u.set(ca * cc + sa * ss, 0, -ca * ss + sa * cc);
    return { pos: _ap.td, dir: _ap.u, len: len - 8, vEnd: 72 };
  }
  _ap.td.copy(h.runway.a).addScaledVector(h.runway.dir, 80 + pl.catS); _ap.td.y = 4 + pl.T.gearH;
  return { pos: _ap.td, dir: h.runway.dir, len: 1600, vEnd: pl.T.vs * 1.3 };
}
function placeOnCat(pl) {
  const g = catGeom(pl);
  pl.pos.copy(g.pos); setBasis(pl.q, g.dir, Y_AXIS); pl.axes(); pl.sync();
}
function updateCat(pl, dt) {
  const h = pl.home;
  if (!h || !h.alive || h.dying) { removeOrKill(pl); return; }
  const g = catGeom(pl);
  pl.catT -= dt;
  if (pl.catT > 0) {
    placeOnCat(pl);
    pl.vel.copy(h.vel || ZERO);
    if (pl.catT < 2.5) { pl.boost = true; exhaust(pl, 1); }
    return;
  }
  // stroke: constant acceleration to end speed over the catapult length (runway: a normal take-off roll)
  const acc = h.kind === 'ship' ? g.vEnd * g.vEnd / (2 * g.len) : 4.2;
  pl.catV += acc * dt; pl.catS += pl.catV * dt;
  placeOnCat(pl);
  exhaust(pl, 1);
  if (h.kind === 'ship' && near(pl.pos, 3000) && Math.random() < 0.6) smoke.emit(pl.pos.x, pl.pos.y - 2, pl.pos.z, rand(-3, 3), 2, rand(-3, 3), 1.5, 3, 12, 0.92, 0.93, 0.95, 0.4, 1);
  if (pl.catS >= g.len || pl.catV >= g.vEnd) {
    pl.state = 'air'; pl.speed = pl.catV + (h.kind === 'ship' ? h.speed : 0);
    pl.q.multiply(_q.setFromAxisAngle(Z_AXIS, 0.1)); pl.axes(); pl.gearT = 6;
    if (pl.cat) { pl.cat.plane = null; pl.cat.busy = game.t + 10; }
    h.lastLaunch = game.t;
    if (pl === player) { game.stats.sorties++; message(h.kind === 'ship' ? '弹射起飞！' : '起飞！', '收起落架，爬升', '#e3b257', 2.2); Sound.burst(0.8, 1600, 200, 0.5, 'bandpass'); game.shake = 1.2; }
  }
}
// manual landing: touchdown on the deck / runway, the wires, bolters and ramp strikes
function checkTouchdown(pl) {
  const h = pl.home;
  if (!h || !h.alive || h.dying) return;
  const ap = approachFrame(h);
  _a.subVectors(pl.pos, ap.td);
  const along = _a.dot(ap.u), lat = _a.dot(ap.perp), hh = pl.pos.y - (ap.y + pl.T.gearH);
  const inWin = along > ap.ramp && along < ap.len && Math.abs(lat) < (ap.carrier ? 13 : 26);
  if (inWin && hh < 0.6) {
    const sink = -pl.vel.y + (h.vel ? 0 : 0);
    if (pl.gear < 0.5) { crashOn(pl, '机腹着舰坠毁'); return; }
    if (sink > 7.5) { crashOn(pl, '下沉率过大，撞毁在甲板上'); return; }
    if (ap.carrier) {
      const W = h.deck.land.wires, w1 = W[1];
      let wire = 0, best = 1e9;
      W.forEach((w, i) => { const dd = along - (w - w1); if (dd > -6 && dd < 14 && Math.abs(dd) < best) { best = Math.abs(dd); wire = i + 1; } });
      if (pl.hook && wire) { pl.trapS = along; startTrap(pl, wire); return; }
      // bolter: roll along the deck; enough power and the jet flies off the end of the angled deck
      pl.pos.y = ap.y + pl.T.gearH; if (pl.vel.y < 0) { pl.q.multiply(_q.setFromAxisAngle(Z_AXIS, -pl.fwd.y * 0.5)); }
      if (!pl.bolterMsg) { pl.bolterMsg = true; bolterGo(pl); }
      return;
    }
    if (pl.speed < pl.T.vs * 1.45) { pl.trapS = along; startTrap(pl, 0); return; }
    pl.pos.y = ap.y + pl.T.gearH;
  } else pl.bolterMsg = false;
  if (h.kind === 'ship' && insideShip(h, pl.pos, 1)) crashOn(pl, along < ap.ramp + 5 ? '撞上舰尾' : '撞上舰体');
}
function crashOn(pl, why) {
  explode(pl.pos, 1.2, pl.vel);
  if (pl.home && pl.home.kind === 'ship') damageShip(pl.home, 20, null, null);
  if (pl === player) killPlayer(why); else removePlane(pl);
}
function exhaust(pl, k) {
  if (!near(pl.pos, 5000)) return;
  for (const ex of pl.exhausts) {
    _a.copy(ex).applyQuaternion(pl.q).add(pl.pos);
    fire.emit(_a.x, _a.y, _a.z, pl.vel.x * 0.9, pl.vel.y * 0.9, pl.vel.z * 0.9, 0.08, (pl.boost ? 5 : 3) * k, 1.5, 1.4, 0.7, 0.3, 0.9);
  }
}
// launch an aircraft from a home (spots it on a free catapult, or queues it)
function launchFrom(home, type, role, task = {}) {
  if (!home || !home.alive || home.dying || !(home.hangar[type] > 0)) return null;
  home.hangar[type]--;
  const pl = new Plane(home.side, type, home);
  pl.pilot = new Pilot(pl, home.side === 'us' ? 0.82 : 0.78);
  pl.role = role; pl.task = task;
  pl.name = `${AC[type].name} ${callsign(home.side)}`;
  planes.push(pl);
  if (!spotOnCatapult(pl)) { pl.state = 'queued'; pl.obj.visible = false; home.queue = home.queue || []; home.queue.push(pl); }
  return pl;
}
const CALL = { cn: ['海鹰', '飞鲨', '雷霆', '利剑', '神盾', '蛟龙', '猎鹰', '长缨'], us: ['Viper', 'Jolly', 'Rhino', 'Ghost', 'Hawk', 'Ace', 'Reaper', 'Saber'] };
let callN = 0;
function callsign(side) { callN++; return `${CALL[side][callN % 8]}-${(callN % 9) + 1}`; }
function processQueues() {
  for (const h of ships.concat(bases)) {
    if (!h.queue || !h.queue.length || !h.alive || h.dying) continue;
    const pl = h.queue[0];
    if (spotOnCatapult(pl)) { h.queue.shift(); pl.obj.visible = true; }
    else pl.state = 'queued';
  }
}

/* ---------- ships: helm, damage control, wakes ---------- */
function updateShip(s, dt) {
  if (s.dying) {
    s.sinkT += dt;
    s.sinking = smooth(0, 80, s.sinkT);
    s.list += (0.32 * Math.sign(s.list || 1) - s.list) * dt * 0.03; s.trim += ((s.carrier ? 0.04 : -0.08) - s.trim) * dt * 0.02;
    s.speed *= Math.exp(-dt * 0.2);
    fwdOf(s.heading, _a); s.pos.addScaledVector(_a, s.speed * dt); s.vel.copy(_a).multiplyScalar(s.speed);
    shipSmoke(s, 3);
    s.sync();
    if (s.sinkT > 85) { s.alive = false; scene.remove(s.obj); if (s.lo) scene.remove(s.lo); }
    return;
  }
  // helm: AI keeps station on the guide; the player's ship follows the player's orders
  if (s !== flagship || (game.ai && !(s.helmT > game.t))) shipAI(s);
  const vmax = s.vmax();
  s.order = clamp(s.order, s === flagship ? -5 : 0, vmax);
  s.speed += clamp(s.order - s.speed, -0.22 * dt, 0.12 * dt);
  s.helm += (s.rudder - s.helm) * (1 - Math.exp(-dt / 2.5));        // rudder takes time to bite
  s.heading = wrapA(s.heading - s.helm * s.S.turn * D2R * clamp(s.speed / 7, 0.15, 1) * dt);
  fwdOf(s.heading, _a);
  s.vel.copy(_a).multiplyScalar(s.speed);
  s.pos.addScaledVector(s.vel, dt);
  if (groundAt(s.pos.x + _a.x * s.radius, s.pos.z + _a.z * s.radius) > 0) { s.speed = 0; s.order = 0; damageShip(s, 30 * dt, null, null); if (mine(s) && Math.random() < dt) radio(s.name, '搁浅！', '#ff8a78'); }
  // fires burn until damage control puts them out
  // damage control: crews fight fires and flooding; a focused effort (player order, or the AI when burning) works much faster
  s.dcCd -= dt;
  if (s !== flagship && s.fires > 1.2 && s.dcCd <= 0) { s.dcT = 25; s.dcCd = 90; }
  if (s.dcT > 0) { s.dcT -= dt; s.fires = Math.max(0, s.fires - dt * 0.08); s.hp = Math.min(s.maxHp * 0.85, s.hp + s.maxHp * 0.0025 * dt); s.list *= Math.exp(-dt * 0.05); }
  if (s.fires > 0) { s.hp -= s.fires * 0.5 * dt; s.fires = Math.max(0, s.fires - dt * 0.012); shipSmoke(s, s.fires); if (s.hp <= 0) sinkShip(s, null); }
  s.wakeT -= dt;
  if (s.wakeT <= 0 && near(s.pos, 9000) && s.speed > 2) {
    s.wakeT = 0.12;
    const st = toWorld(s, -s.S.L * 0.48, 0.4, rand(-4, 4), _b);
    smoke.emit(st.x, 0.6, st.z, -s.vel.x * 0.15 + rand(-2, 2), 0.3, -s.vel.z * 0.15 + rand(-2, 2), 14, s.carrier ? 22 : 12, s.carrier ? 70 : 42, 0.95, 0.97, 0.98, 0.7, 0.02);
    for (const side of [1, -1]) { const b = toWorld(s, s.S.L * 0.45, 0.5, side * 3, _b); smoke.emit(b.x, 0.8, b.z, side * _a.z * 4, 1.5, -side * _a.x * 4, 6, 6, 24, 0.95, 0.97, 0.98, 0.55, 0.05); }
  }
  s.sync();
}
function shipSmoke(s, k) {
  if (!near(s.pos, 18000) || Math.random() > 0.3 * k) return;
  const p = toWorld(s, rand(-0.4, 0.4) * s.S.L, s.h * 0.5, rand(-0.3, 0.3) * (s.carrier ? 40 : s.S.B), _b);
  smoke.emit(p.x, p.y, p.z, WIND.dir.x * 6 + rand(-2, 2), rand(10, 18), WIND.dir.z * 6 + rand(-2, 2), rand(9, 14), 18, 120, 0.1, 0.1, 0.11, 0.85, 0.1, -1.2);
  if (Math.random() < 0.5) fire.emit(p.x, p.y, p.z, 0, rand(4, 10), 0, rand(0.6, 1.2), 10, 22, 1.3, 0.6, 0.25, 0.9);
}
// AI helm: the carrier sets the course, escorts keep station on it
function shipAI(s) {
  const guide = ships.find(x => x.side === s.side && x.alive && !x.dying && x.carrier) || ships.find(x => x.side === s.side && x.alive && !x.dying);
  let want, spd;
  if (s === guide) {
    const C = command[s.side];
    want = C.course; spd = C.speed;
  } else {
    const st = s.station || [1500, 0];
    const p = toWorld(guide, st[0] + 1200, 0, st[1], _b);
    _c.subVectors(p, s.pos);
    want = headingOf(_c);
    const along = _c.dot(fwdOf(guide.heading, _d));
    spd = guide.speed + clamp((along - 1200) * 0.004, -5, 6);
  }
  // keep off the reefs
  fwdOf(want, _a);
  for (const r of [1500, 3000]) if (groundAt(s.pos.x + _a.x * r, s.pos.z + _a.z * r) > -5) { want += 0.9; break; }
  s.rudder = clamp(wrapA(s.heading - want) * 2.5, -1, 1);
  s.order = spd;
}

/* ---------- fleet and air commanders ---------- */
const command = {
  cn: { course: 0, speed: 11, salvoCd: 40, airT: 0, strikeCd: { }, sweepCd: 30, h6Cd: 120 },
  us: { course: Math.PI, speed: 11, salvoCd: 50, airT: 0, strikeCd: { }, sweepCd: 30, b1b: 8, raidT: 330 }
};
function enemyFleet(side) {
  let best = null, bd = 1e12;
  const c = fleetCentre(side) || ZERO;
  for (const [e, tr] of picture[side]) if ((e.kind === 'ship' || e.kind === 'base') && e.alive && !e.dying) { const d = tr.pos.distanceToSquared(c); if (d < bd) { bd = d; best = e; } }
  return best;
}
function bestTarget(side, from, range) {
  let best = null, bs = -1;
  for (const [e, tr] of picture[side]) {
    if ((e.kind !== 'ship' && e.kind !== 'base') || !e.alive || e.dying || game.t - tr.t > 120) continue;
    const d = tr.pos.distanceTo(from);
    if (d > range) continue;
    const sc = e.value * (e.carrier ? 1.6 : 1) * (0.4 + 0.6 * e.hp / e.maxHp) - d / 4000;
    if (sc > bs) { bs = sc; best = e; }
  }
  return best;
}
function updateCommand(side, dt) {
  const C = command[side];
  const carrier = ships.find(s => s.side === side && s.carrier && s.alive && !s.dying);
  const guide = carrier || ships.find(s => s.side === side && s.alive && !s.dying);
  // --- fleet course ---
  if (guide) {
    const foeShip = enemyFleet(side);
    const flightOps = carrier && (carrier.cats.some(c => c.plane) || carrier.finalUntil > game.t || (carrier.queue && carrier.queue.length));
    const into = headingOf(_a.copy(WIND.dir).negate());
    let course, spd = 11;
    if (flightOps) { course = into; spd = 15; }
    else if (foeShip) {
      const tp = trackPos(side, foeShip, _b) || foeShip.pos;
      const d = tp.distanceTo(guide.pos), toFoe = headingOf(_c.subVectors(tp, guide.pos));
      // the PLA closes to its missile envelope; the US carrier keeps its air wing's stand-off distance
      const keep = side === 'cn' ? 60000 : 85000;
      course = d > keep + 8000 ? toFoe : d < keep - 8000 ? wrapA(toFoe + Math.PI) : wrapA(toFoe + Math.PI / 2);
      spd = 13;
    } else { course = side === 'cn' ? 0.15 : Math.PI - 0.1; spd = side === 'cn' ? 11 : 8; }
    // stay in the theatre
    if (Math.hypot(guide.pos.x, guide.pos.z) > 60000) course = headingOf(_c.set(-guide.pos.x, 0, -guide.pos.z));
    C.course = course; C.speed = spd;
  }
  // --- ship-launched anti-ship salvos (player's own ship fires only on the player's order) ---
  C.salvoCd -= dt;
  if (C.salvoCd <= 0) {
    C.salvoCd = 8;
    const shooters = ships.filter(s => s.side === side && s.alive && !s.dying && s !== flagship && Object.values(s.ashm).some(n => n > 0));
    let tgt = null;
    for (const s of shooters) { const maxR = Math.max(...Object.keys(s.ashm).filter(k => s.ashm[k] > 0).map(k => MSL[k].range)); const t = bestTarget(side, s.pos, maxR * 0.95); if (t && (!tgt || t.value > tgt.value)) tgt = t; }
    if (tgt) {
      const plan = [];
      // the PLA coordinates one big salvo so every missile arrives together; US ships each fire what reaches
      const budget = side === 'cn' ? (tgt.carrier ? 16 : 10) : 8;
      for (const s of shooters) {
        const tp = trackPos(side, tgt, _b); if (!tp) continue;
        const d = tp.distanceTo(s.pos);
        let n = 0;
        const order = tgt.carrier ? ['yj21', 'yj18', 'yj83', 'sm6s', 'harpoon'] : ['yj18', 'yj83', 'yj21', 'harpoon', 'sm6s'];
        for (const k of order) while (s.ashm[k] > 0 && MSL[k].range * 0.95 > d && n < 4 && plan.length < budget) { s.ashm[k]--; n++; plan.push({ s, k, d }); }
      }
      if (plan.length) {
        // time on target: slower missiles leave first
        const tof = plan.map(p => p.d / (MSL[p.k].sprint ? (MSL[p.k].v + MSL[p.k].sprint) / 2 : MSL[p.k].v));
        const maxT = Math.max(...tof);
        plan.forEach((p, i) => pending.push({ t: game.t + (side === 'cn' ? maxT - tof[i] : 0) + i * 0.7, fn: () => { if (p.s.alive && !p.s.dying) launchASHM(p.s, tgt, p.k); } }));
        C.salvoCd = side === 'cn' ? 80 : 60;
        const mineSide = side === game.side;
        radio(mineSide ? '舰队司令部' : '侦听', mineSide ? `向${tgt.name}发起齐射：${plan.length} 枚反舰导弹${side === 'cn' ? '，统一时间到达' : ''}。` : `截获敌方齐射信号！`, mineSide ? '#9fd4ff' : '#ff8a78');
      }
    }
  }
  // --- air wing ---
  C.airT -= dt;
  if (C.airT > 0) return;
  C.airT = 2.5;
  for (const h of ships.concat(bases)) {
    if (h.side !== side || !h.alive || h.dying || !h.hangar) continue;
    for (let i = h.ready.length - 1; i >= 0; i--) if (h.ready[i].t <= game.t) { h.hangar[h.ready[i].type] = (h.hangar[h.ready[i].type] || 0) + 1; h.ready.splice(i, 1); }
  }
  const air = planes.filter(p => p.side === side && p.alive && !p.dying && p !== player);
  const count = role => air.filter(p => p.role === role).length;
  const homes = ships.filter(s => s.side === side && s.carrier && s.alive && !s.dying).concat(bases.filter(b => b.side === side && b.alive));
  const pick = (h, types) => types.find(t => h.hangar[t] > 0);
  // airborne early warning
  if (count('aew') < 1) for (const h of homes) { const t = pick(h, ['kj600', 'e2d']); if (t) { launchFrom(h, t, 'aew'); break; } }
  // combat air patrol
  const capWant = side === 'us' ? 4 : 2 + (bases.some(b => b.side === side && b.alive) ? 2 : 0);
  if (count('cap') < capWant) for (const h of homes) {
    const t = pick(h, ['j35', 'f35c', 'j16', 'fa18', 'j15']);
    if (t) { launchFrom(h, t, 'cap', { off: rand(9000, 18000), latZ: rand(-12000, 12000) }); break; }
  }
  // strike packages against the best target in reach
  for (const h of homes) {
    C.strikeCd[h.name] = (C.strikeCd[h.name] ?? 60) - 2.5;
    if (C.strikeCd[h.name] > 0) continue;
    const tgt = bestTarget(side, h.pos, 150000);
    if (!tgt) continue;
    const strikers = ['j15', 'j16', 'fa18'].filter(t => h.hangar[t] > 0);
    const avail = strikers.reduce((n, t) => n + h.hangar[t], 0);
    if (avail < 2) continue;
    const n = Math.min(4, avail);
    let lead = null;
    for (let i = 0; i < n; i++) { const t = strikers.find(x => h.hangar[x] > 0); const p = launchFrom(h, t, 'strike', { target: tgt }); if (!lead) lead = p; }
    for (let i = 0; i < 2; i++) { const t = pick(h, ['j35', 'f35c']); if (t) launchFrom(h, t, 'escort', { lead, slot: i ? -160 : 160 }); }
    C.strikeCd[h.name] = 260;
    if (side === game.side) radio('空中指挥', `${h.name}起飞 ${n} 架突击机，目标${tgt.name}。`, '#9fd4ff');
  }
  // the island's H-6K regiment, topped up from the mainland while the island can still take them
  if (side === 'cn') {
    C.h6Cd -= 2.5;
    const b = bases.find(x => x.alive);
    C.reinf = (C.reinf ?? 600) - 2.5;
    if (b && C.reinf <= 0) { C.reinf = 600; const add = Math.min(3, 6 - (b.hangar.h6k || 0)); if (add > 0) { b.hangar.h6k = (b.hangar.h6k || 0) + add; if (game.side === 'cn') radio('南部战区', `大陆机场增援 ${add} 架轰-6K 进驻岛礁。`, '#9fd4ff'); } }
    if (b && C.h6Cd <= 0 && b.hangar.h6k > 0) {
      const tgt = bestTarget('cn', b.pos, 160000);
      if (tgt) { for (let i = 0; i < Math.min(3, b.hangar.h6k); i++) launchFrom(b, 'h6k', 'bomber', { target: tgt }); C.h6Cd = 420; if (game.side === 'cn') radio('空中指挥', `轰-6K 编队出击，携鹰击-12 攻击${tgt.name}。`, '#9fd4ff'); else radio('E-2D', '侦测到轰-6K 编队起飞！', '#ff8a78'); }
    }
  }
  // scouting when the enemy fleet is lost
  C.sweepCd -= 2.5;
  if (!enemyFleet(side) && C.sweepCd <= 0 && game.t > 20) {
    for (const h of homes) { const t = pick(h, ['j35', 'f35c', 'j15', 'fa18', 'j16']); if (t) { launchFrom(h, t, 'sweep', { point: new V3(side === 'cn' ? 30000 : -30000, 0, rand(-15000, 15000)) }); break; } }
    C.sweepCd = 150;
  }
  // US: B-1B raids from outside the theatre
  if (side === 'us' && C.b1b > 0 && game.t > C.raidT) {
    C.raidT = game.t + 420;
    const tgt = bestTarget('us', new V3(0, 0, 0), 200000);
    for (let i = 0; i < 2 && C.b1b > 0; i++) {
      C.b1b--;
      const pl = new Plane('us', 'b1b', null);
      pl.pilot = new Pilot(pl, 0.7); pl.role = 'bomber'; pl.task = { target: tgt || ships.find(s => s.side === 'cn' && s.alive) };
      pl.name = `B-1B ${callsign('us')}`;
      pl.pos.set(64000, 6000, rand(-20000, 20000) + i * 400); setBasis(pl.q, new V3(-1, 0, 0), Y_AXIS); pl.speed = 260; pl.axes(); pl.sync();
      planes.push(pl);
    }
    radio(game.side === 'us' ? '空中指挥' : '预警', game.side === 'us' ? 'B-1B 编队进入战区，携带 LRASM。' : '东面发现 B-1B 编队来袭！', game.side === 'us' ? '#9fd4ff' : '#ff8a78');
  }
}
const pending = [];

/* ---------- ship and island air defence ---------- */
function defend(s, dt) {
  if (s.decoyCd > 0) s.decoyCd -= dt;
  if (s.decoys > 0 && s.decoyCd <= 0 && missiles.some(m => m.alive && m.cls === 'ashm' && m.side !== s.side && m.target === s && m.pos.distanceTo(s.pos) < 9000)) fireDecoy(s);
  s.samCd -= dt;
  if (s.samCd > 0 || s.busy >= s.channels) return;
  s.samCd = s.carrier ? 1.2 : 0.6;
  const stock = Object.keys(s.sam).filter(k => s.sam[k] > 0);
  if (!stock.length) return;
  let best = null, bs = 1e9, bw = null;
  for (const [e, tr] of picture[s.side]) {
    if (!e.alive || e.dying || game.t - tr.t > 1.5) continue;
    const isM = e.kind === 'msl';
    if (!isM && e.kind !== 'plane') continue;
    const d = e.pos.distanceTo(s.pos);
    if (d > 46000) continue;
    // the PLA engages what its own radar holds; US ships fire on any track in the CEC net
    if (s.side === 'cn' && !ownSees(s, e)) continue;
    const want = 1;   // shoot-look-shoot: one interceptor at a time per threat
    if ((e.engaged || 0) >= want || (e.shots || 0) >= (isM ? 3 : 2)) continue;
    let w = null;
    for (const k of stock.sort((a, b) => MSL[a].range - MSL[b].range)) {
      const S = MSL[k];
      if (S.range * (isM ? 0.95 : 0.7) < d) continue;
      if (!S.short && d < 3000 && stock.some(x => MSL[x].short)) continue;
      w = k; break;
    }
    if (!w) continue;
    // missiles heading for us or our friends come first, by time to go
    const sc = isM ? d / Math.max(e.speed, 100) : 1000 + d / 100;
    if (sc < bs) { bs = sc; best = e; bw = w; }
  }
  if (best) launchSAM(s, best, bw);
}

/* ---------- war potential ---------- */
function potential(side) {
  let p = 0;
  for (const s of ships) if (s.side === side && s.alive && !s.dying) p += s.value * (0.5 + 0.5 * s.hp / s.maxHp);
  for (const b of bases) if (b.side === side && b.alive) p += b.value * (0.5 + 0.5 * b.hp / b.maxHp);
  for (const h of ships.concat(bases)) if (h.side === side && h.alive && !h.dying) {
    for (const [t, n] of Object.entries(h.hangar)) p += AC[t].value * n;
    for (const r of h.ready) p += AC[r.type].value;
  }
  for (const pl of planes) if (pl.side === side && pl.alive && !pl.dying) p += pl.value;
  if (side === 'us') p += command.us.b1b * AC.b1b.value;
  if (side === 'cn' && bases.some(b => b.alive)) p += 3 * AC.h6k.value;
  return p;
}
const potential0 = { cn: 1, us: 1 };

/* ---------- story ---------- */
const STORY = {
  brief: {
    cn: ['架空 if 线。南海某争议海域，双方舰队已对峙七十二小时。一架侦察机在雷达锁定中坠海，谁先开火已无人能说清——冲突在数分钟内升级为全面交战。',
      '舰队司令部命令：以福建舰编队与前哨岛礁机场为核心，发现并摧毁美国福特号航母打击群，在对方远程打击力量集结之前夺取制海权。',
      '敌方舰空导弹可借 E-2D 数据链拦截地平线外的目标，舰载机联队规模更大。我方优势在于更远、更快的反舰导弹与岛礁陆基航空兵——先找到他们，再用一次齐射压垮他们的防空。'],
    us: ['架空 if 线。南海某争议海域，双方舰队已对峙七十二小时。一架侦察机在雷达锁定中坠海，谁先开火已无人能说清——冲突在数分钟内升级为全面交战。',
      '第七舰队命令：福特号航母打击群保持远距离，以舰载机联队与 B-1B 远程打击摧毁福建舰编队及其前哨岛礁机场。',
      '对方的鹰击系列反舰导弹射程更远、末段更快，我们的水面舰在导弹对射中处于劣势。保持距离，用 E-2D 看清战场，让舰载机与 LRASM 替你出拳；标准-6 与 CEC 会守住防空圈。']
  },
  chapters: [
    { title: '第一章 · 对峙', cn: '岛礁雷达站开机，双方舰队都在等对方先犯错。', us: '打击群进入战区，E-2D 准备起飞。' },
    { title: '第二章 · 接触', cn: '雷达屏上出现了敌舰的回波。', us: '我们找到他们了。' },
    { title: '第三章 · 齐射', cn: '第一轮反舰导弹已离开发射筒。', us: '吸血鬼！吸血鬼！反舰导弹来袭！' },
    { title: '第四章 · 血色海面', cn: '第一艘军舰沉入海底，这场战争已无法回头。', us: '第一艘军舰沉没，海面上满是燃烧的油污。' },
    { title: '第五章 · 决战', cn: '双方都已伤筋动骨。打出最后一击。', us: '剩下的战力只够打一场决战。' }
  ],
  end: {
    win: { cn: '福特号航母打击群失去作战能力，残存舰艇向东撤出南海。这一天的海面上，双方都有太多人没能回家。', us: '福建舰编队与前哨岛礁失去作战能力。南海暂时安静下来——代价沉重得让任何一方都不愿再来一次。' },
    lose: { cn: '我方编队战争潜力耗尽，残存舰艇被迫撤离战区。这场失败将被反复复盘。', us: '打击群战争潜力耗尽，被迫撤出南海。这场失败将被反复复盘。' }
  }
};
function chapter(n) {
  if (game.chapter >= n) return;
  game.chapter = n;
  const C = STORY.chapters[n - 1];
  game.card = { title: C.title, sub: C[game.side], t: 4.5 };
}
function onFirstContact(side, e) { if (side === game.side) { chapter(2); radio(side === 'cn' ? '空警-600' : 'E-2D', `发现敌舰：${e.name}！坐标已上传数据链。`, '#ffd28a'); } }
function chapterEvent(kind, side, unit) {
  if (kind === 'salvo') chapter(3);
  if (kind === 'sunk') { chapter(4); if (unit.carrier) radio(mine(unit) ? '舰队司令部' : SIDES[game.side].short, mine(unit) ? '我们失去了航母……所有飞机转降岛礁或就近迫降！' : `敌航母${unit.name}正在下沉！`, mine(unit) ? '#ff8a78' : '#8dffb4'); }
}

/* ---------- input ---------- */
const input = { stickX: 0, stickY: 0, rawX: 0, rawY: 0, keys: new Set(), gun: false, boost: false, brake: false, msl: false, flare: false, ashm: false, gear: false, acls: false, launch: false, decoy: false, target: false, fire: false, dc: false };
addEventListener('keydown', e => {
  if (game.mode !== 'play' && game.mode !== 'paused') return;
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(k);
  if (k === 'KeyF') input.msl = true;
  if (k === 'KeyR') input.ashm = true;
  if (k === 'KeyX') { input.flare = true; input.decoy = true; }
  if (k === 'KeyG') input.gear = true;
  if (k === 'KeyH') input.acls = true;
  if (k === 'Enter') input.launch = true;
  if (k === 'Tab') input.target = true;
  if (k === 'KeyM') toggleMap();
  if (k === 'KeyB') toggleGunsight();
  if (k === 'KeyK') input.dc = true;
  if (game.gunsight) { if (k === 'KeyF') toggleFCS(); if (k === 'KeyU') toggleFuse(); if (k === 'KeyZ') toggleBino(); }
  if (k === 'KeyT') cycleScale();
  if (k === 'KeyY') toggleAI();
  if (k === 'KeyC' || k === 'KeyV') cycleView();
  if (k === 'KeyP' || k === 'Escape') togglePause();
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.gun = input.boost = input.brake = false; });
{
  const zone = $('stick-zone'), base_ = $('stick-base'), knob = $('stick-knob');
  let id = null, ox = 0, oy = 0;
  const R = 62;
  const home = () => { base_.style.left = ''; base_.style.top = ''; knob.style.transform = ''; };
  // one finger owns the stick until it lifts. A lost capture or cancel also releases it, and a new touch
  // takes over from a finger that has gone quiet (the browser never reported it lifting), so the stick cannot wedge.
  let lastT = 0;
  const release = () => { id = null; input.stickX = input.stickY = input.rawX = input.rawY = 0; home(); };
  zone.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (id !== null && id !== e.pointerId && performance.now() - lastT < 600) return;
    id = e.pointerId; lastT = performance.now();
    try { zone.setPointerCapture(id); } catch (_) {}
    const r = zone.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    base_.style.left = (e.clientX - r.left) + 'px'; base_.style.top = (e.clientY - r.top) + 'px';
    knob.style.transform = '';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    if (e.pointerType === 'mouse' && !e.buttons) { release(); return; }
    e.preventDefault(); lastT = performance.now();
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const cx = dx / R, cy = -dy / R;
    input.rawX = cx; input.rawY = cy;
    input.stickX = cx * (0.35 + 0.65 * Math.abs(cx));
    input.stickY = cy * (0.35 + 0.65 * Math.abs(cy));
  });
  const end = e => { if (e.pointerId === id) release(); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, end);
  const hold = (el, key) => {
    const on = e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); input[key] = true; el.classList.add('on'); };
    const off = () => { input[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  };
  const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 140); });
  hold($('b-gun'), 'gun'); hold($('b-ab'), 'boost'); hold($('b-brake'), 'brake'); hold($('g-fire'), 'fire');
  tap($('c-gun'), toggleGunsight); tap($('g-exit'), toggleGunsight); tap($('g-fcs'), toggleFCS); tap($('g-fuse'), toggleFuse); tap($('g-zoom'), toggleBino); tap($('c-dc'), () => { input.dc = true; });
  tap($('b-msl'), () => { input.msl = true; }); tap($('b-flare'), () => { input.flare = true; });
  tap($('b-ashm'), () => { input.ashm = true; }); tap($('b-gear'), () => { input.gear = true; });
  tap($('b-launch'), () => { input.launch = true; input.acls = true; });
  tap($('b-cam'), cycleView);
  tap($('c-salvo'), () => { input.ashm = true; }); tap($('c-decoy'), () => { input.decoy = true; });
  tap($('c-target'), () => { input.target = true; }); tap($('c-view'), cycleView);
  for (const b of document.querySelectorAll('[data-act]')) b.addEventListener('click', () => ({ map: toggleMap, scale: cycleScale, ai: toggleAI, pause: togglePause })[b.dataset.act]());
  $('touch').addEventListener('contextmenu', e => e.preventDefault());
}
function readStick() {
  const k = input.keys;
  let pitch = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + input.stickY;
  const roll = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stickX;
  const yaw = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
  return {
    pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), yaw,
    gun: input.gun || k.has('Space') || k.has('KeyJ'),
    boost: input.boost || k.has('ShiftLeft') || k.has('ShiftRight'),
    brake: input.brake || k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyZ')
  };
}
function toggleGunsight() {
  if (game.role !== 'captain' || !flagship || !flagship.gun) { if (game.role === 'captain') message('本舰没有主炮', '', '#9fb0ba', 1.4); return; }
  game.gunsight = !game.gunsight; game.zoom = 1; game.fcsAuto = true;
  $('cap-ctl').hidden = game.gunsight; $('gun-ctl').hidden = !game.gunsight;
  if (game.gunsight) { const g = flagship.gun; g.wantB = g.brg; g.wantE = g.elv; message('炮瞄模式', `${g.spec.name} · 拖动瞄准，火控可自动解算`, '#e3b257', 2); }
}
function toggleFCS() { game.fcsAuto = !game.fcsAuto; message(game.fcsAuto ? '火控自动跟踪' : '手动瞄准', game.fcsAuto ? '主炮随动目标提前量' : '对准菱形标记再开火', '#e3b257', 1.4); $('g-fcs').classList.toggle('on', game.fcsAuto); }
function toggleFuse() { const g = flagship && flagship.gun; if (!g) return; g.fuse = g.fuse === 'HE' ? 'AA' : 'HE'; message(g.fuse === 'HE' ? '触发引信 · 对舰' : '近炸引信 · 对空', g.fuse === 'AA' ? '可拦截来袭导弹与飞机' : '', '#e3b257', 1.4); $('g-fuse').innerHTML = g.fuse === 'HE' ? '引信<br>触发' : '引信<br>近炸'; }
function toggleBino() { game.zoom = (game.zoom || 1) > 0.5 ? 0.2 : 1; }
// the gunsight laid by dragging: bearing and elevation orders, scaled to the zoom
function gunLay(dx, dy) {
  const g = flagship && flagship.gun; if (!g) return;
  const f = (game.zoom || 1) * 0.0022;
  g.wantB = wrapA(g.wantB - dx * f); g.wantE = clamp(g.wantE - dy * f * 0.6, -0.12, 1.2);
  if (game.fcsAuto) { game.fcsAuto = false; $('g-fcs').classList.remove('on'); }
}
// tap a contact on screen to designate it
function selectAt(x, y) {
  if (game.mode !== 'play') return;
  let best = null, bd = 46;
  for (const [e, tr] of picture[game.side]) {
    if (!e.alive || e.dying) continue;
    const pp = proj(e.kind === 'ship' || e.kind === 'base' ? tr.pos : e.pos);
    if (pp.behind) continue;
    const d = Math.hypot(pp.x - x, pp.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return;
  if (best.kind === 'ship' || best.kind === 'base') game.ashmSel = best;
  game.gunTgt = best;
  if (game.role === 'captain' && flagship && flagship.gun && best.kind !== 'ship' && best.kind !== 'base') flagship.gun.fuse = 'AA';
  message('目标指定', best.name || (best.spec && best.spec.name) || '', '#e3b257', 1.2);
  Sound.beep(1500, 0.05, 0.05);
}
function toggleMap() { game.map = !game.map; $('b-map')?.classList.toggle('on', game.map); }
const SCALES = [1, 2, 4, 8];
function cycleScale() {
  const maxS = game.role === 'pilot' ? 2 : isTouch ? 4 : 8;
  const i = SCALES.indexOf(game.scale);
  game.scale = SCALES[(i + 1) % SCALES.length] > maxS ? 1 : SCALES[(i + 1) % SCALES.length];
  $('b-scale').textContent = `时间 ×${game.scale}`;
}
function toggleAI() {
  if (game.mode !== 'play' || game.role === 'watch') return;
  game.ai = !game.ai;
  if (player) player.pilot.think = 0;
  message(game.ai ? (game.role === 'pilot' ? 'AI 自动驾驶 开启' : 'AI 舰长 开启') : '手动控制', game.ai ? '执行当前任务 · 拖动摇杆可临时接管' : '', '#e3b257', 1.8);
  $('b-ai').classList.toggle('on', game.ai);
}
function cycleView() { game.view = (game.view + 1) % (game.role === 'pilot' ? 2 : 4); game.viewT = 0; look.yaw = look.pitch = 0; game.zoom = 1; }

/* ---------- the player as a pilot ---------- */
const ctlS = { pitch: 0, roll: 0 };
function updatePilot(dt) {
  const p = player, inp = readStick();
  if (input.target) { input.target = false; }
  if (p.state === 'cat') {
    p.boost = inp.boost;
    input.acls = false;
    if (input.launch) { input.launch = false; if (p.catT > 1e8) { p.catT = 2.4; radio('弹射官', '敬礼确认，弹射！', '#ffd28a'); } }
    updateCat(p, dt); return;
  }
  if (p.state === 'trap') { updateTrap(p, dt); return; }
  if (p.state === 'deck') { updateDeck(p, dt); return; }
  if (p.state === 'final') {
    if (Math.abs(inp.pitch) + Math.abs(inp.roll) > 0.6) { p.state = 'air'; message('退出自动着舰', '手动飞行', '#ffc861', 1.5); }
    else { updateFinal(p, dt); return; }
  }
  // gear / hook / landing configuration, and the automatic carrier landing system
  if (input.gear) { input.gear = false; p.landing = !p.landing; p.hook = p.landing; message(p.landing ? '着舰构型' : '收起起落架', p.landing ? '放下起落架、襟翼与尾钩 · 进近动力补偿接通' : '', '#e3b257', 1.5); }
  if (p.gearT > 0) { p.gearT -= dt; if (p.gearT <= 0) p.landing = false; }
  p.gear += ((p.landing || p.gearT > 0 ? 1 : 0) - p.gear) * (1 - Math.exp(-dt * 1.5));
  if (input.acls || input.launch) {
    input.acls = input.launch = false;
    const h = p.home;
    if (h && h.alive && !h.dying && p.landing) {
      const ap = approachFrame(h);
      _a.subVectors(p.pos, ap.td);
      const along = _a.dot(ap.u);
      if (along < -800 && along > -12000 && p.fwd.angleTo(ap.u) < 0.7 && Math.abs(_a.dot(ap.perp)) < 2500) { beginFinal(p); message(h.kind === 'ship' ? '自动着舰系统接通' : '自动进近接通', 'ACLS 一号模式 · 推杆即可退出', '#8dffb4', 2.4); radio(h.kind === 'ship' ? '着舰指挥官' : '塔台', 'Roger ball，保持。', '#ffd28a'); return; }
      message('无法接通自动着舰', '先放下起落架，从舰尾方向 1–12 公里对准着舰轴线', '#ffc861', 2.4);
    } else message('无法接通自动着舰', p.landing ? '母舰不可用' : '先按"着舰"放下起落架与尾钩', '#ffc861', 2);
  }
  p.axes();
  const manual = Math.abs(inp.pitch) + Math.abs(inp.roll) + Math.abs(inp.yaw) > 0.15;
  let out = { gun: inp.gun, srm: false, mrm: false, cm: false, ashm: false };
  if (game.ai && !manual) { out = aiControl(p, dt); if (inp.gun) out.gun = true; }
  else {
    let roll = inp.roll;
    if (Math.abs(roll) < 0.05) roll += clamp(p.right.y * 1.3, -0.5, 0.5) * smooth(-0.2, 0.3, p.up.y);
    Object.assign(p.c, { pitch: settings.invert ? -inp.pitch : inp.pitch, roll, yaw: inp.yaw, boost: inp.boost, brake: inp.brake });
  }
  if (inp.boost) p.c.boost = true;
  flight(p, p.c, dt);
  if (p.fuel <= 0 && Math.random() < dt * 0.2) { message('燃油耗尽', '', '#ff5a4f', 2); }
  if (p.fuel <= -120) { ditch(p); return; }
  game.agl = p.pos.y - groundAt(p.pos.x, p.pos.z);
  if (p.landing && p.gear > 0.5) checkTouchdown(p);
  if (!p.alive || p.state !== 'air') return;
  for (const s of ships) if (s.alive && s !== p.home && Math.abs(s.pos.x - p.pos.x) < s.radius && Math.abs(s.pos.z - p.pos.z) < s.radius && insideShip(s, p.pos)) { crashOn(p, `撞上${s.name}`); return; }
  if (game.agl < 1.5) { killPlayer(groundAt(p.pos.x, p.pos.z) > 0 ? '撞上岛礁' : '坠海'); return; }
  exhaust(p, 1);
  if (p.hp < 40 && near(p.pos)) { _a.set(-8, 0.2, 0).applyQuaternion(p.q).add(p.pos); smoke.emit(_a.x, _a.y, _a.z, p.vel.x * 0.85, p.vel.y * 0.85, p.vel.z * 0.85, 2.2, 3, 12, 0.18, 0.18, 0.19, 0.6, 2); }
  updateLock(dt);
  p.gunCd -= dt;
  if (out.gun) shootGun(p, gunAim(p), 0.004);
  game.mslCd -= dt;
  if (game.ai && !manual && game.mslCd <= 0) {
    const t = p.pilot.target;
    if (out.srm && t) { launchAAM(p, t, 'srm'); game.mslCd = 2; }
    else if (out.mrm && t) { launchAAM(p, t, 'mrm'); game.mslCd = 3; }
    if (out.ashm && p.task && p.task.target && p.ashmN > 0) { p.ashmN--; launchASHM(p, p.task.target, p.T.ashmType); game.mslCd = 1.2; }
  }
  if (input.msl) { input.msl = false; firePlayerAAM(); }
  if (input.ashm) { input.ashm = false; firePlayerASHM(); }
  if (input.flare) { input.flare = false; if (p.cm > 0 && p.cmCd <= 0) { dispense(p); p.cmCd = 0.7; } }
  p.cmCd -= dt;
  const k = 1 - Math.exp(-dt * 10);
  ctlS.pitch += (p.c.pitch - ctlS.pitch) * k; ctlS.roll += (p.c.roll - ctlS.roll) * k;
}
const _gun = new V3();
function gunAim(p) {
  const nose = p.nose(_gun);
  let bestE = null, bestA = 0.11;
  for (const e of planes) {
    if (e.side === p.side || !e.alive || e.dying || !e.airborne) continue;
    const d = e.pos.distanceTo(p.pos); if (d > 1600) continue;
    const ang = nose.angleTo(_b.copy(e.pos).addScaledVector(e.vel, d / 1100).sub(p.pos));
    if (ang < bestA) { bestA = ang; bestE = e; }
  }
  game.gunTarget = bestE;
  if (bestE) { game.leadPoint = (game.leadPoint || new V3()).copy(bestE.pos).addScaledVector(bestE.vel, bestE.pos.distanceTo(p.pos) / 1100); return _gun.lerp(_b.copy(game.leadPoint).sub(p.pos).normalize(), 0.85).normalize().clone(); }
  return nose.clone();
}
function updateLock(dt) {
  const p = player, L = game.lock;
  let bestT = null, bs = 1e9;
  for (const e of planes) {
    if (e.side === p.side || !e.alive || e.dying || !e.airborne) continue;
    _a.subVectors(e.pos, p.pos);
    const d = _a.length(), ang = p.fwd.angleTo(_a);
    const ir = p.srm > 0 && d < MSL[p.T.srmType].range && ang < 1.05;
    const rad = p.mrm > 0 && d < MSL[p.T.mrmType].range * (e.rcs < 0.5 ? 0.55 : 1) && ang < 0.6 && known(p.side, e);
    if (!ir && !rad) continue;
    const s = ang + d / 20000 - (e === L.target ? 0.35 : 0);
    if (s < bs) { bs = s; bestT = e; }
  }
  if (bestT !== L.target) { L.target = bestT; L.t = 0; }
  if (L.target) {
    _a.subVectors(L.target.pos, p.pos);
    const d = _a.length(), ang = p.fwd.angleTo(_a);
    L.kind = p.srm > 0 && d < MSL[p.T.srmType].range * 0.9 && ang < 1.05 ? 'srm' : p.mrm > 0 ? 'mrm' : 'srm';
    L.need = (L.kind === 'srm' ? 0.45 : 1.0) * (L.target.rcs < 0.5 ? 2.2 : 1);
    L.t = Math.min(L.t + dt, L.need + 1);
    const was = L.locked; L.locked = L.t >= L.need;
    if (L.locked && !was) Sound.beep(2000, 0.08, 0.06);
  } else L.locked = false;
  Sound.lockTone(L.locked && p.srm + p.mrm > 0);
  // anti-ship selection: the best known enemy ship within reach and roughly ahead
  game.ashmSel = null;
  if (p.ashmN > 0) {
    const R = MSL[p.T.ashmType].range;
    let bsc = -1e9;
    for (const [e, tr] of picture[p.side]) {
      if ((e.kind !== 'ship' && e.kind !== 'base') || !e.alive || e.dying) continue;
      _a.subVectors(tr.pos, p.pos).setY(0);
      const d = _a.length(); if (d > R * 1.4) continue;
      const ang = _b.copy(p.fwd).setY(0).normalize().angleTo(_a.normalize());
      if (ang > 1.1) continue;
      const sc = e.value - ang * 60 - d / 1000;
      if (sc > bsc) { bsc = sc; game.ashmSel = e; }
    }
  }
}
function firePlayerAAM() {
  const p = player, L = game.lock;
  if (game.mslCd > 0) return;
  if (!L.target || !L.locked) { message('未锁定', '把目标放进雷达框并保持', '#9fb0ba', 1.2); return; }
  if (!launchAAM(p, L.target, L.kind)) message('空空导弹已用完', '', '#9fb0ba', 1.2);
  game.mslCd = 0.6;
}
function firePlayerASHM() {
  const p = player;
  if (p.ashmN <= 0) { message('没有反舰导弹', p.T.ashm ? '着舰后重新挂弹' : `${p.T.name}本次不挂反舰导弹`, '#9fb0ba', 1.6); return; }
  const t = game.ashmSel;
  if (!t) { message('无可用反舰目标', '需要预警机或雷达掌握敌舰位置 · 机头对准目标方向', '#9fb0ba', 2); return; }
  const tp = trackPos(p.side, t, _b), d = tp.distanceTo(p.pos);
  if (d > MSL[p.T.ashmType].range) { message('超出射程', `${(d / 1000).toFixed(0)} km · ${MSL[p.T.ashmType].name}射程 ${(MSL[p.T.ashmType].range / 1000).toFixed(0)} km`, '#ffc861', 1.6); return; }
  p.ashmN--;
  launchASHM(p, t, p.T.ashmType);
  message(`${MSL[p.T.ashmType].name} 发射`, `目标 ${t.name} · ${(d / 1000).toFixed(0)} km`, '#e3b257', 2);
  radio('你', `${MSL[p.T.ashmType].name}发射，目标${t.name}！`, '#9fd4ff');
}

/* ---------- the player as a captain ---------- */
function captainTargets() {
  const out = [];
  for (const [e, tr] of picture[flagship.side]) if ((e.kind === 'ship' || e.kind === 'base') && e.alive && !e.dying && game.t - tr.t < 150) out.push(e);
  return out.sort((a, b) => a.pos.distanceTo(flagship.pos) - b.pos.distanceTo(flagship.pos));
}
function updateCaptain(dt) {
  const s = flagship, k = input.keys;
  if (!s || !s.alive || s.dying) return;
  // helm: the stick points where the ship should go, as seen on screen (its throw sets the speed);
  // A/D swing the ordered course, W/S ring the telegraph. The quartermaster then steers that course.
  if (s.course == null) s.course = s.heading;
  if (!game.gunsight) {
    const kc = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ks = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const mag = Math.hypot(input.rawX, input.rawY);
    if (mag > 0.22) {
      camera.getWorldDirection(_a).setY(0);
      if (_a.lengthSq() < 0.04) _a.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);   // looking straight down
      _a.normalize(); _b.set(-_a.z, 0, _a.x);                                                   // screen up / screen right on the sea
      _c.copy(_a).multiplyScalar(input.rawY).addScaledVector(_b, input.rawX);
      s.course = headingOf(_c);
      s.order = s.vmax() * clamp(0.25 + (mag - 0.22) / 0.7 * 0.75, 0.25, 1);
      s.helmT = game.t + 20;
    }
    if (kc) { s.course = wrapA(s.course - kc * 0.25 * dt); s.helmT = game.t + 20; }
    if (ks) { s.order = clamp(s.order + ks * 3 * dt, -5, s.vmax()); s.helmT = game.t + 20; }
  }
  if (!game.ai || s.helmT > game.t) {
    // heading hold with a little lead so the ship meets her course without overshooting
    s.rudder = clamp(wrapA(s.heading - s.course) * 2.2 - s.helm * 0.6, -1, 1);
  } else s.course = s.heading;
  const list = captainTargets();
  if (input.target) { input.target = false; if (list.length) { const i = list.indexOf(game.ashmSel); game.ashmSel = list[(i + 1) % list.length]; } }
  if (!list.includes(game.ashmSel)) game.ashmSel = list[0] || null;
  if (input.decoy) { input.decoy = false; if (s.decoys > 0 && s.decoyCd <= 0) fireDecoy(s); else message(s.decoys > 0 ? '诱饵装填中' : '诱饵耗尽', '', '#9fb0ba', 1.2); }
  if (input.dc) { input.dc = false; if (s.dcCd <= 0) { s.dcT = 25; s.dcCd = 90; message('损管队全力抢修', '灭火、堵漏、恢复系统 · 25 秒', '#e3b257', 2); radio(s.name, '全舰损管！', '#9fd4ff'); } else message('损管队整备中', `${Math.ceil(s.dcCd)} 秒`, '#9fb0ba', 1.2); }
  // gunsight: the player lays and fires the main gun
  if (game.gunsight && s.gun) {
    const g = s.gun;
    if (g.fuse === 'AA' && (!game.gunTgt || !game.gunTgt.alive || (game.gunTgt.kind !== 'msl' && game.gunTgt.kind !== 'plane'))) {
      let best = null, bd = 12000;
      for (const [e] of picture[s.side]) if ((e.kind === 'msl' || e.kind === 'plane') && e.alive && !e.dying) { const d = e.pos.distanceTo(s.pos); if (d < bd) { bd = d; best = e; } }
      game.gunTgt = best;
    } else if (g.fuse === 'HE' && (!game.gunTgt || !game.gunTgt.alive || game.gunTgt.kind !== 'ship')) game.gunTgt = game.ashmSel && game.ashmSel.kind === 'ship' ? game.ashmSel : null;
    game.gunSol = game.gunTgt && game.gunTgt.alive ? fcs(s, game.gunTgt) : null;
    if (game.fcsAuto && game.gunSol) { g.wantB = game.gunSol.brg; g.wantE = game.gunSol.elv; }
    const kb = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), ke = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (kb || ke) gunLay(kb * 6, -ke * 6);
    if (Math.abs(input.stickX) + Math.abs(input.stickY) > 0.05) gunLay(input.stickX * 7, -input.stickY * 7);   // the left stick lays the gun too
    if (input.fire || k.has('Space')) fireGun(s, 0.0024);
    return;
  }
  if (input.ashm) {
    input.ashm = false;
    const t = game.ashmSel;
    if (!t) { message('无目标', '需要舰载机或预警机发现敌舰', '#9fb0ba', 1.8); return; }
    const d = (trackPos(s.side, t, _b) || t.pos).distanceTo(s.pos);
    const types = Object.keys(s.ashm).filter(x => s.ashm[x] > 0 && MSL[x].range * 0.95 > d).sort((a, b) => MSL[b].dmg - MSL[a].dmg);
    if (!types.length) { const anyN = Object.values(s.ashm).reduce((a, b) => a + b, 0); message(anyN ? '超出射程' : '反舰导弹耗尽', anyN ? `目标 ${(d / 1000).toFixed(0)} km` : '', '#ffc861', 1.6); return; }
    const n = Math.min(4, types.reduce((a, x) => a + s.ashm[x], 0));
    let fired = 0;
    for (const x of types) while (s.ashm[x] > 0 && fired < n) { s.ashm[x]--; const kk = x; pending.push({ t: game.t + fired * 0.8, fn: () => { if (s.alive && !s.dying) launchASHM(s, t, kk); } }); fired++; }
    message(`齐射 ${fired} 枚`, `目标 ${t.name} · ${(d / 1000).toFixed(0)} km`, '#e3b257', 2.2);
    radio(s.name, `${fired} 枚反舰导弹发射，目标${t.name}！`, '#9fd4ff');
    game.view === 3 || (game.view = 3, game.viewT = 0);
  }
}

/* ---------- AI aircraft ---------- */
function updatePlane(pl, dt) {
  if (pl.dying) { updateDying(pl, dt); return; }
  if (pl === player) return;
  switch (pl.state) {
    case 'cat': updateCat(pl, dt); return;
    case 'final': updateFinal(pl, dt); return;
    case 'trap': updateTrap(pl, dt); return;
    case 'deck': updateDeck(pl, dt); return;
    case 'queued': return;
  }
  const out = aiControl(pl, dt);
  flight(pl, pl.c, dt);
  if (pl.gearT > 0) pl.gearT -= dt;
  pl.gear += ((pl.gearT > 0 ? 1 : 0) - pl.gear) * (1 - Math.exp(-dt * 1.5));
  pl.gunCd -= dt; pl.cmCd -= dt;
  const P = pl.pilot, t = P.target;
  if (out.gun && t) shootGun(pl, P.desired, lerp(0.03, 0.006, P.skill));
  if (out.srm && t) { if (launchAAM(pl, t, 'srm')) P.mslCd = 3; }
  else if (out.mrm && t) { if (launchAAM(pl, t, 'mrm')) P.mslCd = 4; }
  if (out.ashm && pl.ashmN > 0 && pl.task && pl.task.target) {
    pl.ashmN--;
    launchASHM(pl, pl.task.target, pl.T.ashmType, pl.task.last);
    if (mine(pl) && Math.random() < 0.5) radio(pl.name, `${MSL[pl.T.ashmType].name}发射！`, '#9fd4ff');
  }
  exhaust(pl, 1);
  if (pl.hp < pl.maxHp * 0.55 && near(pl.pos)) { _a.copy(pl.exhausts[0]).applyQuaternion(pl.q).add(pl.pos); smoke.emit(_a.x, _a.y, _a.z, pl.vel.x * 0.8, pl.vel.y * 0.8, pl.vel.z * 0.8, 2.2, 3, 14, 0.16, 0.16, 0.17, 0.7, 1.5); }
  if (pl.pos.y < groundAt(pl.pos.x, pl.pos.z) + 2) { splash(pl.pos, 1); removePlane(pl); }
}
function updateDying(pl, dt) {
  pl.dieT -= dt;
  pl.vel.y -= 22 * dt;
  pl.pos.addScaledVector(pl.vel, dt);
  pl.obj.position.copy(pl.pos);
  pl.obj.rotateX(pl.spin.x * dt); pl.obj.rotateZ(pl.spin.z * dt);
  if (near(pl.pos, 8000)) {
    fire.emit(pl.pos.x, pl.pos.y, pl.pos.z, pl.vel.x * 0.2, pl.vel.y * 0.2, pl.vel.z * 0.2, rand(0.4, 0.8), 8, 18, 1.3, 0.7, 0.3, 0.9);
    smoke.emit(pl.pos.x, pl.pos.y, pl.pos.z, pl.vel.x * 0.1, 2, pl.vel.z * 0.1, rand(3, 5), 10, 46, 0.12, 0.12, 0.13, 0.8, 0.3, -2);
  }
  if (pl.dieT <= 0 || pl.pos.y < 0) { if (pl.pos.y < 2) splash(pl.pos, 1.2); else explode(pl.pos, 1.2, null); removePlane(pl); }
}
function updateBase(b, dt) {
  if (!b.alive) { if (near(b.pos, 30000) && Math.random() < 0.4) { const p = b.pos; smoke.emit(p.x + rand(-1200, 1200), 8, p.z + rand(-300, 300), WIND.dir.x * 6, rand(10, 16), WIND.dir.z * 6, rand(10, 15), 30, 160, 0.1, 0.1, 0.11, 0.8, 0.1, -1); } return; }
  defend(b, dt);
  ciws(b, dt);
  if (b.fires > 0) { b.hp -= b.fires * 0.3 * dt; b.fires = Math.max(0, b.fires - dt * 0.01); if (near(b.pos, 30000) && Math.random() < 0.3 * b.fires) smoke.emit(b.pos.x + rand(-1000, 1000), 8, b.pos.z + rand(-300, 300), WIND.dir.x * 6, rand(10, 16), WIND.dir.z * 6, rand(10, 15), 30, 140, 0.12, 0.12, 0.13, 0.8, 0.1, -1); if (b.hp <= 0) damageBase(b, 1, null, null); }
}

/* ---------- camera ---------- */
const camQ = new Q(), _qL = new Q();
let camDist = 26, fov = 60;
const camTarget = new V3(), camPos = new V3();
let orbitA = 0.6, orbitE = 0.32;
{
  // free look: drag anywhere that is not a control to swing the camera, pinch or wheel to zoom.
  // Pilots get a look-around that springs back behind the jet; captains and spectators orbit freely.
  // The stage captures each finger, so its lift always comes back here (lostpointercapture is the backstop);
  // the first finger of a fresh gesture also clears any finger the browser never reported lifting.
  const pts = new Map();
  let pinch0 = 0, zoom0 = 1;
  const pinchStart = () => { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = game.zoom || 1; };
  stage.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (e.isPrimary || e.pointerType === 'mouse') pts.clear();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (pts.size === 2) pinchStart();
    look.active = true;
  });
  stage.addEventListener('pointermove', e => {
    const q = pts.get(e.pointerId);
    if (!q) return;
    if (e.pointerType === 'mouse' && !e.buttons) { drop(e); return; }
    const dx = e.clientX - q.x, dy = e.clientY - q.y;
    q.x = e.clientX; q.y = e.clientY;
    if (pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 10 && d > 10) game.zoom = clamp(zoom0 * pinch0 / d, 0.3, 6); return; }
    if (game.gunsight) { gunLay(dx, dy); return; }
    if (game.role === 'pilot') { look.yaw = clamp(look.yaw - dx * 0.008, -Math.PI, Math.PI); look.pitch = clamp(look.pitch + dy * 0.006, -1.2, 1.2); look.idle = 0; }
    else if (game.role === 'captain' && game.view === 1) { look.yaw -= dx * 0.005; look.pitch = clamp(look.pitch - dy * 0.004, -0.6, 0.5); }
    else { orbitA -= dx * 0.007; orbitE = clamp(orbitE + dy * 0.005, 0.04, 1.45); }
  });
  const drop = e => {
    const q = pts.get(e.pointerId);
    if (!q) return;
    pts.delete(e.pointerId);
    if (pts.size === 2) pinchStart();
    if (!pts.size) look.active = false;
  };
  stage.addEventListener('pointerup', e => {
    const q = pts.get(e.pointerId);
    if (q && pts.size === 1 && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < 12 && performance.now() - q.t0 < 350) selectAt(e.clientX, e.clientY);
    drop(e);
  });
  for (const ev of ['pointercancel', 'lostpointercapture']) stage.addEventListener(ev, drop);
  stage.addEventListener('wheel', e => { e.preventDefault(); game.zoom = clamp((game.zoom || 1) * (e.deltaY > 0 ? 1.12 : 0.89), 0.3, 6); }, { passive: false });
}
const look = { yaw: 0, pitch: 0, active: false, idle: 0 };
// the dragged angles are followed quickly (the finger should feel attached); the point looked at follows the
// subject more softly. The camera sits exactly on the sphere around that point, so a swing never cuts a chord.
let oA = orbitA, oE = orbitE, oD = 0;
function orbit(target, dist, dt, smoothK = 3) {
  const kA = 1 - Math.exp(-dt * 16);
  oA += wrapA(orbitA - oA) * kA; oE += (orbitE - oE) * kA;
  oD = oD ? oD + (dist - oD) * (1 - Math.exp(-dt * 4)) : dist;
  camTarget.lerp(target, 1 - Math.exp(-dt * smoothK * 1.5));
  const ce = Math.cos(oE), se = Math.sin(oE);
  camPos.set(camTarget.x + Math.cos(oA) * ce * oD, camTarget.y + se * oD, camTarget.z + Math.sin(oA) * ce * oD);
  camPos.y = Math.max(camPos.y, 2.5);
  camera.position.copy(camPos);
  camera.up.copy(Y_AXIS);
  camera.lookAt(camTarget);
}
// chase a missile from behind, looking along its path (and at its target once it is close)
function chaseMissile(m, dt) {
  camPos.copy(m.pos).addScaledVector(m.dir, -45 * (game.zoom || 1)).addScaledVector(Y_AXIS, 9 * (game.zoom || 1));
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 10));
  camera.up.copy(Y_AXIS);
  const t = m.target && m.target.pos && m.target.pos.distanceTo(m.pos) < 12000 ? m.target.pos : null;
  _d.copy(m.pos).addScaledVector(m.dir, 400);
  if (t) _d.lerp(_c.copy(t).setY(15), 0.5);
  camTarget.lerp(_d, 1 - Math.exp(-dt * 8));
  camera.lookAt(camTarget);
}
function ownMissile() {
  let best = null;
  for (const m of missiles) if (m.alive && m.cls === 'ashm' && (m.owner === flagship || m.owner === player || (game.role === 'watch' && m.side === game.side)) && (!best || m.age < best.age)) best = m;
  return best;
}
function director(dt) {
  game.viewT -= dt;
  const f = game.focus;
  const valid = f && (f.alive !== false) && !(f.kind === 'ship' && f.sinkT > 60);
  if (game.viewT <= 0 || !valid) {
    game.viewT = 12;
    const cands = [];
    for (const m of missiles) if (m.alive && m.cls === 'ashm' && m.target && m.target.pos && m.pos.distanceTo(m.target.pos) < 15000) cands.push([m, 5]);
    for (const p of planes) if (p.alive && !p.dying && p.pilot && (p.pilot.mode === 'guns' || p.pilot.mode === 'pursuit')) cands.push([p, 3]);
    for (const p of planes) if (p.state === 'cat' && p.catT < 3) cands.push([p, 3]);
    for (const s of ships) if (s.alive && !s.dying && s.fires > 0.5) cands.push([s, 2]);
    for (const s of ships) if (s.dying && s.sinkT < 50) cands.push([s, 4]);
    cands.push([ships.find(s => s.side === game.side && s.alive) || ships[0], 1]);
    cands.sort((a, b) => b[1] - a[1] + rand(-1, 1));
    if (cands[0] && cands[0][0] !== game.focus) game.snap = 2;   // a cut, not a pan, between shots
    game.focus = cands[0] && cands[0][0];
  }
  const t = game.focus;
  if (!t) return;
  const d = t.kind === 'ship' ? t.S.L * 1.6 : t.kind === 'msl' ? 70 : t.kind === 'base' ? 3000 : 60;
  if (t.kind === 'msl') { chaseMissile(t, dt); return; }
  if (t.kind !== 'ship' && t.kind !== 'base') orbitA += dt * 0.05;
  orbit(_d.copy(t.pos).setY(Math.max(t.pos.y, 5)), d * (game.zoom || 1), dt, t.kind === 'msl' ? 8 : 3);
}
function updateCamera(dt) {
  // right after taking a role the camera jumps straight to it instead of gliding in from the menu
  if (game.snap > 0) { game.snap--; dt = 10; }
  if (game.mode === 'menu') {
    game.menuA += dt * 0.05;
    const c = ships.find(s => s.side === game.side && s.carrier) || ships[0];
    if (!c) return;
    orbitA = game.menuA; orbitE = 0.18;
    orbit(_d.copy(c.pos).setY(20), 520, dt, 2);
    fov = 50;
  } else if (game.mode === 'dead' || game.mode === 'end' || game.mode === 'over') {
    orbitA += dt * 0.15;
    orbit(_d.copy(game.deathPos || camera.position), 260, dt, 1.5);
  } else if (game.role === 'pilot' && player) {
    const p = player;
    if (p.state === 'cat' || p.state === 'deck' || p.state === 'trap' || p.state === 'queued') {
      // on deck: a deck-crew view from behind and above
      _a.copy(p.fwd).setY(0).normalize().applyAxisAngle(Y_AXIS, look.yaw);
      camPos.copy(p.pos).addScaledVector(_a, -34 * (game.zoom || 1)).add(_b.set(0, 9 + look.pitch * 20, 0)).addScaledVector(p.right, 8);
      camera.position.lerp(camPos, 1 - Math.exp(-dt * 4)); camera.up.copy(Y_AXIS);
      camera.lookAt(_c.copy(p.pos).addScaledVector(_a, 30));
      camQ.copy(p.q); fov = 58;
    } else if (game.view === 1) {
      // view toward the nearest threat or target, aircraft in the foreground
      const tgt = game.lock.target || game.ashmSel || nearestHostile();
      if (tgt) { _a.subVectors(p.pos, tgt.pos).normalize(); camPos.copy(p.pos).addScaledVector(_a, 36).addScaledVector(Y_AXIS, 9); camera.position.lerp(camPos, 1 - Math.exp(-dt * 5)); camera.up.copy(Y_AXIS); camera.lookAt(_b.copy(p.pos).addScaledVector(_a, -80)); }
      else game.view = 0;
    } else {
      camQ.slerp(p.q, 1 - Math.exp(-dt * 4.5));
      // look-around: springs back behind the jet a moment after the finger lifts
      if (!look.active) { look.idle += dt; if (look.idle > 1.2) { const k = 1 - Math.exp(-dt * 3); look.yaw -= look.yaw * k; look.pitch -= look.pitch * k; } }
      _q.setFromAxisAngle(Y_AXIS, look.yaw).multiply(_qA.setFromAxisAngle(Z_AXIS, -look.pitch));
      const lq = _qL.copy(camQ).multiply(_q);
      const back = _a.set(-1, 0, 0).applyQuaternion(lq), up = _b.set(0, 1, 0).applyQuaternion(camQ), fw = _c.set(1, 0, 0).applyQuaternion(lq);
      camDist += ((p.boost ? 31 : 25) * (p.T.radius / 8) * (game.zoom || 1) - camDist) * (1 - Math.exp(-dt * 2));
      camera.position.copy(p.pos).addScaledVector(back, camDist).addScaledVector(up, 6.2 * p.T.radius / 8);
      camera.up.copy(up);
      const free = Math.abs(look.yaw) + Math.abs(look.pitch) > 0.05;
      camera.lookAt(camTarget.copy(p.pos).addScaledVector(fw, free ? 0 : 30).addScaledVector(up, free ? 0 : 2.4));
      fov += ((p.boost ? 70 : 60) - fov) * (1 - Math.exp(-dt * 2));
    }
  } else if (game.role === 'captain' && flagship && game.gunsight && flagship.gun) {
    // over the gun mount, looking down the barrel
    const s = flagship, g = s.gun, m = gunMount(s, camPos), dir = gunDir(s, g.brg, 0, _d);
    camera.position.copy(m).addScaledVector(dir, -14).addScaledVector(Y_AXIS, 6);
    camera.up.copy(Y_AXIS);
    camera.lookAt(sightPoint(s, g.brg, g.elv, _c));
    fov = 45 * (game.zoom || 1);
  } else if (game.role === 'captain' && flagship) {
    const s = flagship;
    if (game.view === 3) { const m = ownMissile(); if (m) chaseMissile(m, dt); else orbit(_d.copy(s.pos).setY(20), s.S.L * 1.5 * (game.zoom || 1), dt); }
    else if (game.view === 1) {
      // bridge wing: look anywhere by dragging; zoom works as binoculars
      toWorld(s, s.S.L * 0.27, s.h * 0.62, 0, camPos); camera.position.copy(camPos); camera.up.copy(Y_AXIS);
      const h = s.heading + look.yaw;
      camera.lookAt(_d.set(camPos.x + Math.cos(h) * 1000, camPos.y + Math.tan(look.pitch) * 1000 - 20, camPos.z - Math.sin(h) * 1000));
      fov = 55 * clamp(game.zoom || 1, 0.12, 1.4);
    }
    else if (game.view === 2) { orbitE = 1.25; orbit(_d.copy(s.pos), s.S.L * 6 * (game.zoom || 1), dt); }
    else { if (orbitE > 1.2) orbitE = 0.3; orbit(_d.copy(s.pos).setY(20), s.S.L * 1.5 * (game.zoom || 1), dt); }
    if (game.view !== 1) fov = 55;
  } else director(dt);
  if (camera.position.y < 2) camera.position.y = 2;
  if (game.shake > 0.01 && !reduced) {
    const sh = game.shake;
    camera.position.x += rand(-sh, sh); camera.position.y += rand(-sh, sh); camera.position.z += rand(-sh, sh);
    game.shake *= Math.exp(-dt * 6);
  }
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  sunLight.target.position.copy(camTarget.lengthSq() ? camTarget : camera.position);
  if (player && game.role === 'pilot') sunLight.target.position.copy(player.pos);
  if (game.role === 'captain' && flagship) sunLight.target.position.copy(flagship.pos);
  sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 300);
}
function nearestHostile() {
  let best = null, bd = 1e12;
  if (!player) return null;
  for (const e of planes) if (e.side !== player.side && e.alive && !e.dying && e.airborne) { const d = e.pos.distanceToSquared(player.pos); if (d < bd) { bd = d; best = e; } }
  return best;
}

/* ---------- HUD ---------- */
const hud = $('hud'), hc = hud.getContext('2d');
let HW = 0, HH = 0, HDPR = 1;
const HUDC = '#8dffb4', WARN = '#ff5a4f', GOLD = '#e3b257', BLUE = '#8fc8ff', AMBER = '#ffc861', RED = '#ff8a78';
const MONO = '"IBM Plex Mono", ui-monospace, monospace', SANS = '"Noto Sans SC", "PingFang SC", sans-serif';
const _p = new V3();
function proj(v) { _p.copy(v).project(camera); return { x: (_p.x + 1) / 2 * HW, y: (1 - _p.y) / 2 * HH, behind: _p.z > 1, ndc: [_p.x, _p.y] }; }
const onScreen = pp => !pp.behind && pp.x > 0 && pp.x < HW && pp.y > 0 && pp.y < HH;
function edgeArrow(v, color, label) {
  const pp = proj(v);
  let nx = pp.ndc[0], ny = pp.ndc[1];
  if (pp.behind) { nx = -nx; ny = -ny; }
  const ang = Math.atan2(-ny, nx), cx = HW / 2, cy = HH / 2, rx = HW / 2 - 70, ry = HH / 2 - 70;
  const k = 1 / Math.max(Math.abs(Math.cos(ang)) / rx, Math.abs(Math.sin(ang)) / ry);
  const x = cx + Math.cos(ang) * k, y = cy + Math.sin(ang) * k;
  hc.save(); hc.fillStyle = color;
  if (label) { hc.font = `600 11px ${MONO}`; hc.textAlign = 'center'; hc.fillText(label, x - Math.cos(ang) * 26, y - Math.sin(ang) * 26 + 4); }
  hc.translate(x, y); hc.rotate(ang);
  hc.beginPath(); hc.moveTo(16, 0); hc.lineTo(-6, -10); hc.lineTo(-2, 0); hc.lineTo(-6, 10); hc.closePath(); hc.fill();
  hc.restore();
}
function bar(x, y, w, v, col) { hc.strokeRect(x, y, w, 7); hc.save(); hc.fillStyle = col; hc.fillRect(x + 1.5, y + 1.5, (w - 3) * clamp(v, 0, 1), 4); hc.restore(); }
const km = d => (d / 1000).toFixed(d < 10000 ? 1 : 0);
function text(t, x, y, col, font, align = 'left') { hc.save(); hc.fillStyle = col; hc.font = font; hc.textAlign = align; hc.fillText(t, x, y); hc.restore(); }

// war potential of both sides, clock and chapter, across the top
function drawTop() {
  const compact = HH < 480, w = Math.min(HW * (compact ? 0.36 : 0.42), 420), x0 = HW / 2 - w / 2 + (compact && isTouch ? 40 : 0), y = compact ? 10 : 14;
  const me = game.side, them = foe(me);
  const pm = potential(me) / potential0[me], pt = potential(them) / potential0[them];
  hc.save();
  hc.fillStyle = 'rgba(6,12,18,0.55)'; hc.fillRect(x0 - 8, y - 4, w + 16, 30);
  hc.fillStyle = SIDES[me].color; hc.fillRect(x0, y + 12, (w / 2 - 6) * clamp(pm, 0, 1), 6);
  hc.fillStyle = SIDES[them].color; hc.fillRect(x0 + w - (w / 2 - 6) * clamp(pt, 0, 1), y + 12, (w / 2 - 6) * clamp(pt, 0, 1), 6);
  hc.strokeStyle = 'rgba(238,243,245,0.3)'; hc.lineWidth = 1; hc.strokeRect(x0, y + 12, w / 2 - 6, 6); hc.strokeRect(x0 + w / 2 + 6, y + 12, w / 2 - 6, 6);
  hc.font = `600 10px ${SANS}`; hc.fillStyle = SIDES[me].color; hc.textAlign = 'left'; hc.fillText(`${SIDES[me].short} ${Math.round(pm * 100)}%`, x0, y + 7);
  hc.fillStyle = SIDES[them].color; hc.textAlign = 'right'; hc.fillText(`${Math.round(pt * 100)}% ${SIDES[them].short}`, x0 + w, y + 7);
  const mm = Math.floor(game.t / 60), ss = Math.floor(game.t % 60);
  hc.fillStyle = '#eef3f5'; hc.textAlign = 'center'; hc.font = `600 11px ${MONO}`; hc.fillText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${game.scale > 1 ? ' ×' + game.scale : ''}`, HW / 2, y + 8);
  hc.font = `500 10px ${SANS}`; hc.fillStyle = '#9fb0ba'; hc.fillText('战争潜力', HW / 2, y + 22);
  hc.restore();
}
function drawPilot(dt) {
  const p = player, L = game.lock, compact = HH < 480, cx = HW / 2, cy = HH / 2;
  hc.lineWidth = 1.5; hc.strokeStyle = HUDC; hc.fillStyle = HUDC;
  if (p.state === 'cat' || p.state === 'deck' || p.state === 'trap' || p.state === 'queued') { drawDeckChecklist(p); return; }
  // pitch ladder and flight path marker
  {
    const fh = new V3(p.fwd.x, 0, p.fwd.z); if (fh.lengthSq() < 1e-6) fh.set(1, 0, 0); fh.normalize();
    const rh = new V3(-fh.z, 0, fh.x), centre = new V3(), tmp = new V3();
    const pitchDeg = Math.asin(clamp(p.fwd.y, -1, 1)) * 180 / Math.PI;
    hc.save(); hc.globalAlpha = 0.7; hc.font = `500 10px ${MONO}`;
    for (let a = Math.ceil((pitchDeg - 22) / 10) * 10; a <= pitchDeg + 22; a += 10) {
      if (a < -90 || a > 90) continue;
      const r = a * D2R;
      centre.copy(fh).multiplyScalar(Math.cos(r)).addScaledVector(Y_AXIS, Math.sin(r)).multiplyScalar(1000).add(p.pos);
      const c0 = proj(centre); if (c0.behind) continue;
      const e1 = proj(tmp.copy(centre).addScaledVector(rh, 90)), e2 = proj(tmp.copy(centre).addScaledVector(rh, -90));
      const g1 = proj(tmp.copy(centre).addScaledVector(rh, 26)), g2 = proj(tmp.copy(centre).addScaledVector(rh, -26));
      hc.setLineDash(a < 0 ? [6, 5] : []); hc.beginPath();
      if (a === 0) { hc.moveTo(e1.x * 1.6 - c0.x * 0.6, e1.y * 1.6 - c0.y * 0.6); hc.lineTo(e2.x * 1.6 - c0.x * 0.6, e2.y * 1.6 - c0.y * 0.6); }
      else { hc.moveTo(e1.x, e1.y); hc.lineTo(g1.x, g1.y); hc.moveTo(g2.x, g2.y); hc.lineTo(e2.x, e2.y); }
      hc.stroke();
      if (a !== 0) { hc.textAlign = 'left'; hc.fillText(String(Math.abs(a)), e1.x + 4, e1.y + 3); }
    }
    hc.setLineDash([]); hc.restore();
    const fp = proj(tmp.copy(p.pos).addScaledVector(p.fwd, 1000));
    if (!fp.behind) { hc.beginPath(); hc.arc(fp.x, fp.y, 6, 0, Math.PI * 2); hc.moveTo(fp.x - 6, fp.y); hc.lineTo(fp.x - 16, fp.y); hc.moveTo(fp.x + 6, fp.y); hc.lineTo(fp.x + 16, fp.y); hc.moveTo(fp.x, fp.y - 6); hc.lineTo(fp.x, fp.y - 12); hc.stroke(); }
  }
  const bs = proj(_a.copy(p.pos).addScaledVector(p.nose(new V3()), 700));
  if (!bs.behind) { hc.beginPath(); hc.arc(bs.x, bs.y, 15, 0, Math.PI * 2); hc.stroke(); hc.fillRect(bs.x - 1.5, bs.y - 1.5, 3, 3); }
  if (game.gunTarget && game.leadPoint) { const lp = proj(game.leadPoint); if (!lp.behind) { hc.save(); hc.strokeStyle = GOLD; hc.beginPath(); hc.moveTo(lp.x, lp.y - 9); hc.lineTo(lp.x + 9, lp.y); hc.lineTo(lp.x, lp.y + 9); hc.lineTo(lp.x - 9, lp.y); hc.closePath(); hc.stroke(); hc.restore(); } }
  drawContacts(p.pos, 30000, 90000);
  // lock box
  if (L.target) {
    const pp = proj(L.target.pos);
    if (onScreen(pp)) {
      hc.save(); hc.strokeStyle = L.locked ? WARN : HUDC; hc.lineWidth = 2;
      const r = L.locked ? 18 : lerp(60, 20, clamp(L.t / L.need, 0, 1));
      hc.strokeRect(pp.x - r, pp.y - r, r * 2, r * 2);
      if (L.locked) text(`锁定 ${MSL[L.kind === 'srm' ? p.T.srmType : p.T.mrmType].name}`, pp.x, pp.y - r - 6, WARN, `700 12px ${SANS}`, 'center');
      hc.restore();
    } else edgeArrow(L.target.pos, RED, km(L.target.pos.distanceTo(p.pos)));
  }
  if (game.ashmSel) { const tp = trackPos(p.side, game.ashmSel, _b); if (tp) { const pp = proj(tp); if (onScreen(pp)) { hc.save(); hc.strokeStyle = AMBER; hc.lineWidth = 2; hc.beginPath(); hc.arc(pp.x, pp.y, 22, 0, Math.PI * 2); hc.stroke(); hc.restore(); text(`反舰目标 ${game.ashmSel.name}`, pp.x, pp.y + 38, AMBER, `600 11px ${SANS}`, 'center'); } else edgeArrow(tp, AMBER, km(tp.distanceTo(p.pos))); } }
  // missile warning
  const threats = missiles.filter(m => m.alive && m.target === p && m.cls !== 'ashm');
  let tm = null, td = 1e9;
  for (const m of threats) { const d = m.pos.distanceTo(p.pos); if (d < td) { td = d; tm = m; } edgeArrow(m.pos, WARN, km(d)); }
  if (tm) {
    if (Math.floor(game.t * 6) % 2 === 0) text(`导弹来袭 · ${tm.cls === 'sam' ? '舰空导弹' : tm.spec.seeker === 'ir' ? '红外' : '雷达'}`, cx, HH * 0.3, WARN, `800 ${compact ? 20 : 26}px ${SANS}`, 'center');
    game.warnBeep -= dt; if (game.warnBeep <= 0) { Sound.beep(td < 1200 ? 1300 : 950, 0.06, 0.06); game.warnBeep = td < 1200 ? 0.1 : 0.22; }
  }
  const painted = planes.some(e => e.painting && e.side !== p.side);
  Sound.rwrTone(painted && !tm);
  if (painted && !tm) text('雷达照射', cx, HH * 0.3, AMBER, `700 ${compact ? 15 : 18}px ${SANS}`, 'center');
  // speed and altitude
  const boxY = isTouch ? cy - 70 : cy - 14, gap = isTouch ? Math.min(HW * 0.2, 190) : Math.min(HW * 0.3, 260);
  hc.font = `600 ${compact ? 16 : 18}px ${MONO}`;
  hc.textAlign = 'right'; hc.strokeRect(cx - gap - 84, boxY, 84, 28); hc.fillText(String(Math.round(p.speed * 3.6)), cx - gap - 8, boxY + 20);
  hc.textAlign = 'left'; hc.strokeRect(cx + gap, boxY, 84, 28); hc.fillText(String(Math.round(p.pos.y)), cx + gap + 8, boxY + 20);
  hc.font = `500 10px ${MONO}`;
  hc.textAlign = 'right'; hc.fillText('KM/H', cx - gap, boxY - 6); hc.fillText(`M ${(p.speed / 340).toFixed(2)}  G ${p.g.toFixed(1)}`, cx - gap, boxY + 44); hc.fillText(`α ${(p.alpha / D2R).toFixed(0)}°`, cx - gap, boxY + 58);
  hc.textAlign = 'left'; hc.fillText('ALT M', cx + gap, boxY - 6); hc.fillText(`燃油 ${Math.max(0, Math.round(p.fuel / p.T.fuel * 100))}%`, cx + gap, boxY + 44);
  const tags = [p.boost && '加力', p.c.brake && '减速板', p.gear > 0.5 && '起落架 · 尾钩', p.gear > 0.5 && 'APC'].filter(Boolean);
  tags.forEach((t, i) => text(t, cx - gap - 90, boxY + 19 + i * 15, GOLD, `700 11px ${SANS}`, 'right'));
  if (p.gear > 0.5) drawLandingAids(p);
  // heading tape
  const hdg = ((Math.atan2(p.fwd.x, -p.fwd.z) / D2R) + 360) % 360, tapeY = compact ? 52 : 62, ppd = 4;
  hc.save(); hc.beginPath(); hc.rect(cx - 150, tapeY - 18, 300, 40); hc.clip();
  hc.font = `500 11px ${MONO}`; hc.textAlign = 'center';
  for (let d = Math.floor((hdg - 40) / 5) * 5; d <= hdg + 40; d += 5) {
    const x = cx + (d - hdg) * ppd, dd = ((d % 360) + 360) % 360;
    hc.beginPath(); hc.moveTo(x, tapeY); hc.lineTo(x, tapeY + (dd % 10 === 0 ? 8 : 4)); hc.stroke();
    if (dd % 30 === 0) hc.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] || String(dd / 10).padStart(2, '0'), x, tapeY - 4);
  }
  hc.restore();
  // home bearing
  if (p.home && p.home.alive && !p.home.dying) { const hp = proj(p.home.pos); if (!onScreen(hp)) edgeArrow(p.home.pos, BLUE, `${p.home.kind === 'ship' ? '母舰' : '机场'} ${km(p.home.pos.distanceTo(p.pos))}`); }
  if (game.ai) text(`AI 自动驾驶 · ${MODE_TEXT[p.pilot.mode] || ''}`, cx, tapeY + 34, GOLD, `700 12px ${SANS}`, 'center');
  // status
  const sx = 16, sy = compact ? 46 : 54;
  hc.textAlign = 'left';
  text(p.name, sx, sy, HUDC, `700 13px ${SANS}`);
  bar(sx, sy + 8, 120, p.hp / p.maxHp, p.hp > p.maxHp * 0.4 ? HUDC : WARN);
  text(`机体 ${Math.max(0, Math.round(p.hp / p.maxHp * 100))}%`, sx + 128, sy + 15, HUDC, `500 10px ${MONO}`);
  const sel = L.target ? L.kind : null;
  text(`机炮 ${p.ammo}  ${sel === 'srm' ? '▸' : ''}${MSL[p.T.srmType]?.name || '近距弹'} ${p.srm}  ${sel === 'mrm' ? '▸' : ''}${MSL[p.T.mrmType]?.name || '中距弹'} ${p.mrm}`, sx, sy + 32, HUDC, `500 10px ${MONO}`);
  text(`${p.T.ashmType ? MSL[p.T.ashmType].name : '反舰弹'} ${p.ashmN}  干扰 ${p.cm}`, sx, sy + 46, p.ashmN ? AMBER : HUDC, `500 10px ${MONO}`);
  // warnings
  const warns = [];
  if ((game.agl ?? 1e9) < 250 && p.fwd.y < -0.08 && p.gear < 0.5) warns.push('拉起');
  if (p.stall) warns.push('失速');
  if (p.fuel < 240) warns.push(p.fuel <= 0 ? '燃油耗尽' : 'BINGO 油量 · 返航');
  if (Math.hypot(p.pos.x, p.pos.z) > 70000) warns.push('离开战区');
  if (warns.length && Math.floor(game.t * 4) % 2 === 0) warns.forEach((w, i) => text(w, cx, HH * 0.66 + i * 26, WARN, `800 ${compact ? 17 : 21}px ${SANS}`, 'center'));
  drawScope(p.pos, p.fwd, 40000, '雷达 40 km');
}
// improved Fresnel lens: ball above / below datum = high / low on the glide slope; lineup and on-speed AoA
function drawLandingAids(p) {
  const h = p.home;
  if (!h || !h.alive || h.dying) return;
  const ap = approachFrame(h);
  _a.subVectors(p.pos, ap.td);
  const along = -_a.dot(ap.u), lat = _a.dot(ap.perp);
  if (along < 0 || along > 14000) return;
  const want = ap.y + p.T.gearH + along * Math.tan(GLIDE), dev = p.pos.y - want, degDev = Math.atan2(dev, along) / D2R;
  const x = HW - 120, y = HH / 2 - 10;
  hc.save();
  hc.fillStyle = 'rgba(6,12,18,0.5)'; hc.fillRect(x - 70, y - 90, 140, 200);
  text(ap.carrier ? '菲涅尔透镜' : '进近', x, y - 72, '#eef3f5', `600 11px ${SANS}`, 'center');
  hc.fillStyle = '#5cff8a'; for (const s of [-1, 1]) for (let i = 1; i <= 4; i++) hc.fillRect(x + s * (14 + i * 10) - 4, y - 2, 8, 4);
  const by = clamp(-degDev / 1.5 * 40, -60, 60), ball = Math.abs(degDev) < 0.35 ? '#ffc861' : degDev < -0.7 ? '#ff4040' : '#ffc861';
  hc.fillStyle = ball; hc.beginPath(); hc.arc(x, y + by, 7, 0, Math.PI * 2); hc.fill();
  text(degDev > 0.35 ? '偏高' : degDev < -0.35 ? '偏低 · 加油门' : '下滑道上', x, y + 78, ball, `600 11px ${SANS}`, 'center');
  const lu = clamp(lat / 30 * 40, -60, 60);
  hc.strokeStyle = '#eef3f5'; hc.lineWidth = 2; hc.beginPath(); hc.moveTo(x + lu, y + 40); hc.lineTo(x + lu, y + 60); hc.stroke();
  hc.strokeStyle = 'rgba(238,243,245,0.4)'; hc.beginPath(); hc.moveTo(x, y + 38); hc.lineTo(x, y + 62); hc.stroke();
  text(Math.abs(lat) < 6 ? '对正' : lat > 0 ? '偏右 · 向左修' : '偏左 · 向右修', x, y + 95, '#eef3f5', `500 10px ${SANS}`, 'center');
  // AoA indexer: on-speed is ~8°
  const aoa = p.alpha / D2R;
  text(aoa > 9.5 ? '▼ 慢' : aoa < 6.5 ? '▲ 快' : '● 在速', x - 68, y - 58, aoa > 9.5 || aoa < 6.5 ? AMBER : HUDC, `700 11px ${SANS}`);
  text(`${km(along)} km`, x + 66, y - 58, '#eef3f5', `600 10px ${MONO}`, 'right');
  if (along < 12000 && along > 800 && p.state === 'air') text(isTouch ? '点"自动"接通 ACLS' : '按 H 接通自动着舰', x, y + 112, '#9fb0ba', `500 10px ${SANS}`, 'center');
  hc.restore();
}
function drawDeckChecklist(p) {
  const h = p.home, cx = HW / 2;
  const lines = p.state === 'cat'
    ? (p.catT > 1e8 ? [h.kind === 'ship' ? `${h.name} · 弹射器就位` : `${h.name} · 跑道就位`, '1. 挂弹完成 · 襟翼放下', '2. 推满油门（按住"加力"）', `3. ${isTouch ? '点"弹射"' : '按 Enter'} 敬礼确认`] : p.catT > 0 ? ['弹射官确认……', '保持油门'] : ['弹射！'])
    : p.state === 'trap' ? [`拦阻索 ${p.wire || ''} 挂上`, '减速中'] : p.state === 'queued' ? ['等待弹射器空出'] : [`${h ? h.name : ''} · 补给中`, '加油 · 挂弹 · 检修'];
  hc.save();
  hc.fillStyle = 'rgba(6,12,18,0.55)'; hc.fillRect(cx - 170, HH * 0.18, 340, 26 + lines.length * 22);
  lines.forEach((l, i) => text(l, cx, HH * 0.18 + 22 + i * 22, i ? '#eef3f5' : GOLD, `${i ? 500 : 700} ${i ? 13 : 15}px ${SANS}`, 'center'));
  hc.restore();
  if (h && h.kind === 'ship') text(`甲板风 ${Math.round((h.speed + WIND.speed * Math.max(0, -fwdOf(h.heading, _a).dot(WIND.dir))) * 1.94)} 节`, cx, HH * 0.18 + 40 + lines.length * 22, '#9fb0ba', `500 11px ${MONO}`, 'center');
}
// markers for every contact in the picture
function drawContacts(from, rPlane, rShip) {
  for (const [e, tr] of picture[game.side]) {
    if (!e.alive || e.dying) continue;
    const d = tr.pos.distanceTo(from);
    if (e.kind === 'plane' && d > rPlane) continue;
    if ((e.kind === 'ship' || e.kind === 'base') && d > rShip) continue;
    if (e.kind === 'msl' && d > 30000) continue;
    const pp = proj(e.kind === 'plane' || e.kind === 'msl' ? e.pos : tr.pos);
    if (!onScreen(pp)) continue;
    const stale = game.t - tr.t > 3;
    hc.save(); hc.globalAlpha = stale ? 0.5 : 1;
    hc.strokeStyle = hc.fillStyle = e.kind === 'msl' ? WARN : RED;
    if (e.kind === 'ship' || e.kind === 'base') {
      const s = 12; hc.lineWidth = 1.6; hc.beginPath(); hc.moveTo(pp.x, pp.y - s); hc.lineTo(pp.x + s, pp.y); hc.lineTo(pp.x, pp.y + s); hc.lineTo(pp.x - s, pp.y); hc.closePath(); hc.stroke();
      hc.font = `600 11px ${SANS}`; hc.textAlign = 'left'; hc.fillText(`${e.name} ${km(d)}`, pp.x + s + 4, pp.y + 4);
    } else if (e.kind === 'plane') {
      const s = clamp(4000 / d, 7, 22); hc.lineWidth = 1.5; hc.strokeRect(pp.x - s, pp.y - s, s * 2, s * 2);
      hc.font = `500 10px ${MONO}`; hc.textAlign = 'left'; hc.fillText(km(d), pp.x + s + 3, pp.y + s);
      if (d < 8000 || e.T.role === 'bomber') { hc.font = `500 10px ${SANS}`; hc.fillText(e.T.name, pp.x + s + 3, pp.y - s + 8); }
    } else { hc.beginPath(); hc.arc(pp.x, pp.y, 4, 0, Math.PI * 2); hc.fill(); }
    hc.restore();
  }
  // friendly ships
  for (const s of ships) if (s.side === game.side && s.alive && !s.dying) {
    const d = s.pos.distanceTo(from); if (d > 60000 || d < 600) continue;
    const pp = proj(_a.copy(s.pos).setY(s.h)); if (!onScreen(pp)) continue;
    hc.save(); hc.strokeStyle = hc.fillStyle = BLUE; hc.beginPath(); hc.arc(pp.x, pp.y, 6, 0, Math.PI * 2); hc.stroke();
    hc.font = `500 10px ${SANS}`; hc.textAlign = 'left'; hc.fillText(s.name, pp.x + 9, pp.y + 4); hc.restore();
  }
}
// heading-up radar scope with the side's picture
function drawScope(c, fwd, range, label) {
  const compact = HH < 480, R = compact ? 50 : 64, rx = HW - R - 16, ry = R + (compact ? 52 : 60);
  hc.save();
  hc.strokeStyle = HUDC; hc.lineWidth = 1.2;
  hc.fillStyle = 'rgba(6,14,12,0.5)'; hc.beginPath(); hc.arc(rx, ry, R, 0, Math.PI * 2); hc.fill(); hc.stroke();
  hc.globalAlpha = 0.3; hc.beginPath(); hc.arc(rx, ry, R / 2, 0, Math.PI * 2); hc.stroke(); hc.globalAlpha = 1;
  const fl = Math.hypot(fwd.x, fwd.z) || 1, hx = fwd.x / fl, hz = fwd.z / fl;
  const dot = (wx, wz, col, r, sq) => {
    const dx = wx - c.x, dz = wz - c.z;
    let s = (dx * -hz + dz * hx) / range, f = (dx * hx + dz * hz) / range;
    const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
    hc.fillStyle = col; if (sq) hc.fillRect(rx + s * R - r, ry - f * R - r, r * 2, r * 2); else { hc.beginPath(); hc.arc(rx + s * R, ry - f * R, r, 0, Math.PI * 2); hc.fill(); }
  };
  for (const s of ships) if (s.side === game.side && s.alive && !s.dying) dot(s.pos.x, s.pos.z, BLUE, 3, true);
  for (const p of planes) if (p.side === game.side && p.alive && p.airborne && p !== player) dot(p.pos.x, p.pos.z, BLUE, 1.8);
  for (const [e, tr] of picture[game.side]) { if (!e.alive || e.dying) continue; dot(tr.pos.x, tr.pos.z, e.kind === 'msl' ? WARN : RED, e.kind === 'ship' || e.kind === 'base' ? 3.5 : e.kind === 'msl' ? 1.6 : 2.2, e.kind === 'ship' || e.kind === 'base'); }
  hc.fillStyle = HUDC; hc.beginPath(); hc.moveTo(rx, ry - 6); hc.lineTo(rx - 4, ry + 4); hc.lineTo(rx + 4, ry + 4); hc.closePath(); hc.fill();
  hc.font = `500 9px ${SANS}`; hc.textAlign = 'center'; hc.fillText(label, rx, ry + R + 12);
  hc.restore();
}
function drawCaptain() {
  const s = flagship, compact = HH < 480;
  if (!s || !s.alive) return;
  drawContacts(s.pos, 40000, 150000);
  const sx = 16, sy = compact ? 46 : 54;
  hc.save();
  hc.fillStyle = 'rgba(6,12,18,0.5)'; hc.fillRect(sx - 8, sy - 16, 330, compact ? 160 : 168);
  hc.restore();
  hc.strokeStyle = HUDC; hc.lineWidth = 1.2;
  text(`${s.name} · ${s.spec.name || ''}`, sx, sy, GOLD, `700 13px ${SANS}`);
  bar(sx, sy + 8, 140, s.hp / s.maxHp, s.hp > s.maxHp * 0.4 ? HUDC : WARN);
  text(`舰体 ${Math.max(0, Math.round(s.hp / s.maxHp * 100))}%${s.fires > 0.3 ? ' · 起火' : ''}${s.radarDmg ? ' · 雷达受损' : ''}`, sx + 148, sy + 15, s.fires > 0.3 ? WARN : HUDC, `500 10px ${SANS}`);
  const deg = h => String(Math.round(((90 - h / D2R) % 360 + 360) % 360) % 360).padStart(3, '0');
  const ordered = s.course != null && !(game.ai && !(s.helmT > game.t));
  text(`航速 ${(s.speed * 1.94).toFixed(0)} 节 → 令 ${(s.order * 1.94).toFixed(0)} 节   航向 ${deg(s.heading)}°${ordered ? ` → 令 ${deg(s.course)}°` : ''}   舵 ${s.rudder > 0.05 ? '右' : s.rudder < -0.05 ? '左' : '正'}${Math.round(Math.abs(s.rudder) * 35)}°`, sx, sy + 34, HUDC, `500 10px ${MONO}`);
  // ordered course on the sea: a dotted track from the bow to a marker, so the stick visibly "points" the ship
  if (ordered && !game.gunsight && game.view !== 3) {
    const L = s.S.L, steer = Math.abs(input.rawX) + Math.abs(input.rawY) > 0.2;
    hc.save(); hc.setLineDash([4, 6]); hc.lineWidth = steer ? 2 : 1.2;
    hc.strokeStyle = steer ? 'rgba(255,214,120,0.95)' : 'rgba(150,230,190,0.6)';
    fwdOf(s.course, _e); hc.beginPath(); let started = false, last = null;
    for (let i = 0; i <= 12; i++) {
      const d = L * 0.5 + i * L * 0.5;
      const q = proj(_f.copy(s.pos).addScaledVector(_e, d).setY(1));
      if (q.behind) { started = false; continue; }
      if (!started) { hc.moveTo(q.x, q.y); started = true; } else hc.lineTo(q.x, q.y);
      last = q;
    }
    hc.stroke(); hc.setLineDash([]);
    if (last) { hc.fillStyle = hc.strokeStyle; hc.beginPath(); hc.arc(last.x, last.y, steer ? 6 : 4, 0, Math.PI * 2); hc.fill();
      text(`${deg(s.course)}°`, last.x, last.y - 10, hc.strokeStyle, `600 11px ${MONO}`, 'center'); }
    hc.restore();
  }
  text(`舰空：${Object.entries(s.sam).map(([k, n]) => `${MSL[k].name} ${n}`).join('  ')}`, sx, sy + 50, HUDC, `500 10px ${SANS}`);
  const ash = Object.entries(s.ashm);
  text(`反舰：${ash.length ? ash.map(([k, n]) => `${MSL[k].name} ${n}`).join('  ') : '无'}`, sx, sy + 66, AMBER, `500 10px ${SANS}`);
  const tele = s.order < -0.5 ? '后退' : s.order < 0.5 ? '停车' : s.order < s.S.vmax * 0.4 ? '前进一' : s.order < s.S.vmax * 0.75 ? '前进二' : '前进三';
  text(`车钟 ${tele}${s.gun ? `  主炮 ${s.gun.ammo}` : ''}  损管 ${s.dcT > 0 ? '抢修中' : s.dcCd > 0 ? Math.ceil(s.dcCd) + ' s' : '就绪'}`, sx, sy + (compact ? 136 : 140), HUDC, `500 10px ${SANS}`);
  text(`诱饵 ${s.decoys}  火控通道 ${s.busy}/${s.channels}${s.carrier ? `  舰载机 ${Object.values(s.hangar).reduce((a, b) => a + b, 0) + s.ready.length}` : ''}`, sx, sy + 82, HUDC, `500 10px ${SANS}`);
  const inbound = missiles.filter(m => m.alive && m.cls === 'ashm' && m.side !== s.side && known(s.side, m));
  if (inbound.length) {
    const nearest = inbound.reduce((a, m) => Math.min(a, m.pos.distanceTo(s.pos)), 1e9);
    text(`来袭反舰导弹 ${inbound.length} 枚 · 最近 ${km(nearest)} km`, sx, sy + 100, WARN, `700 12px ${SANS}`);
    if (Math.floor(game.t * 3) % 2 === 0 && nearest < 12000) text('吸血鬼！反舰导弹来袭！', HW / 2, HH * 0.28, WARN, `800 ${compact ? 18 : 24}px ${SANS}`, 'center');
  }
  const t = game.ashmSel;
  if (t) {
    const tp = trackPos(s.side, t, _b), d = tp ? tp.distanceTo(s.pos) : 0;
    const inR = Object.keys(s.ashm).filter(k => s.ashm[k] > 0 && MSL[k].range * 0.95 > d).map(k => MSL[k].name);
    text(`目标 ${t.name} · ${km(d)} km · ${inR.length ? '射程内：' + inR.join('/') : '超出射程'}`, sx, sy + (compact ? 118 : 120), inR.length ? GOLD : '#9fb0ba', `600 11px ${SANS}`);
    if (tp) { const pp = proj(tp); if (onScreen(pp)) { hc.save(); hc.strokeStyle = GOLD; hc.lineWidth = 2; hc.beginPath(); hc.arc(pp.x, pp.y, 20, 0, Math.PI * 2); hc.stroke(); hc.restore(); } else edgeArrow(tp, GOLD, km(d)); }
  } else text('没有掌握敌舰位置 · 等待舰载机或预警机侦察', sx, sy + (compact ? 118 : 120), '#9fb0ba', `500 11px ${SANS}`);
  if (game.ai && !(s.helmT > game.t)) text('AI 舰长指挥中 · 摇杆指向即可接管航向', HW / 2, compact ? 60 : 70, GOLD, `700 12px ${SANS}`, 'center');
  drawScope(s.pos, fwdOf(s.heading, _c), 90000, '雷达 90 km');
}
// gunsight: reticle with mil ticks, fire-control diamond, rangefinder and fall of shot
function drawGunsight() {
  const s = flagship, g = s.gun, cx = HW / 2, cy = HH / 2, compact = HH < 480;
  const pxPerRad = HH / 2 / Math.tan(camera.fov * D2R / 2);
  hc.save();
  hc.strokeStyle = HUDC; hc.fillStyle = HUDC; hc.lineWidth = 1.4;
  hc.beginPath(); hc.moveTo(cx - 60, cy); hc.lineTo(cx - 12, cy); hc.moveTo(cx + 12, cy); hc.lineTo(cx + 60, cy); hc.moveTo(cx, cy - 60); hc.lineTo(cx, cy - 12); hc.moveTo(cx, cy + 12); hc.lineTo(cx, cy + 60); hc.stroke();
  hc.beginPath(); hc.arc(cx, cy, 3, 0, Math.PI * 2); hc.fill();
  text(g.fuse === 'AA' ? '炮管指向' : '弹着点', cx + 14, cy - 8, HUDC, `600 10px ${SANS}`);
  hc.font = `500 9px ${MONO}`; hc.textAlign = 'left';
  for (let m = -20; m <= 20; m += 5) { if (!m) continue; const off = m / 1000 * pxPerRad; if (Math.abs(off) > HH * 0.45) continue; hc.beginPath(); hc.moveTo(cx - 6, cy + off); hc.lineTo(cx + 6, cy + off); hc.stroke(); hc.fillText(String(-m), cx + 9, cy + off + 3); }
  // the ordered lay (where the mount is slewing to)
  const want = proj(sightPoint(s, g.wantB, g.wantE, _a));
  if (!want.behind) { hc.save(); hc.globalAlpha = 0.55; hc.strokeRect(want.x - 7, want.y - 7, 14, 14); hc.restore(); }
  const sol = game.gunSol, T = game.gunTgt;
  if (T && T.alive) {
    const tp = proj(T.kind === 'ship' ? _a.copy(T.pos).setY(T.h * 0.3) : T.pos);
    if (!tp.behind) { hc.save(); hc.strokeStyle = RED; hc.lineWidth = 2; hc.strokeRect(tp.x - 16, tp.y - 16, 32, 32); hc.restore(); text(T.name || (T.spec && T.spec.name) || '', tp.x + 20, tp.y - 8, RED, `600 11px ${SANS}`); }
  }
  // fire-control solution: put the reticle on the diamond and fire
  if (sol) {
    const sp = proj(g.fuse === 'AA' ? sightPoint(s, sol.brg, sol.elv, _a) : _a.copy(sol.aim).setY(0));
    if (!sp.behind) {
      hc.save(); hc.strokeStyle = GOLD; hc.lineWidth = 2;
      hc.beginPath(); hc.moveTo(sp.x, sp.y - 11); hc.lineTo(sp.x + 11, sp.y); hc.lineTo(sp.x, sp.y + 11); hc.lineTo(sp.x - 11, sp.y); hc.closePath(); hc.stroke(); hc.restore();
      const err = Math.hypot(wrapA(sol.brg - g.brg), sol.elv - g.elv) * 1000;
      text(err < 1.5 ? '诸元吻合 · 开火' : `偏差 ${err.toFixed(1)} 密位`, sp.x, sp.y + 26, err < 1.5 ? HUDC : GOLD, `700 11px ${SANS}`, 'center');
    }
  }
  hc.restore();
  const x0 = 16, y0 = compact ? 46 : 54;
  hc.save(); hc.fillStyle = 'rgba(6,12,18,0.55)'; hc.fillRect(x0 - 8, y0 - 16, 262, compact ? 148 : 160); hc.restore();
  const shot = rangeAt(g.spec, Math.max(g.elv, 0));
  const relDeg = ((-g.brg / D2R) + 360) % 360;
  text(`${s.name} · ${g.spec.name}`, x0, y0, GOLD, `700 12px ${SANS}`);
  text(`方位 ${relDeg.toFixed(1)}°（${g.brg < 0 ? '右舷' : '左舷'}）  仰角 ${(g.elv / D2R).toFixed(2)}°`, x0, y0 + 18, HUDC, `500 11px ${MONO}`);
  text(`落点距离 ${km(shot.R)} km  飞行 ${shot.tof.toFixed(1)} s`, x0, y0 + 34, HUDC, `500 11px ${MONO}`);
  text(`弹药 ${g.ammo}  装填 ${g.cd > 0 ? g.cd.toFixed(1) + ' s' : '就绪'}  引信 ${g.fuse === 'HE' ? '触发' : '近炸'}`, x0, y0 + 50, g.cd > 0 ? GOLD : HUDC, `500 11px ${MONO}`);
  text(game.fcsAuto ? '火控：自动跟踪' : '火控：手动', x0, y0 + 66, game.fcsAuto ? HUDC : AMBER, `700 11px ${SANS}`);
  if (T && T.alive) text(`目标 ${T.name || (T.spec && T.spec.name) || ''} · ${km(T.pos.distanceTo(s.pos))} km${sol ? '' : ' · 超出射程'}`, x0, y0 + 84, sol ? GOLD : '#9fb0ba', `600 11px ${SANS}`);
  else text(g.fuse === 'HE' ? '点击屏幕上的敌舰指定目标' : '没有来袭目标', x0, y0 + 84, '#9fb0ba', `500 11px ${SANS}`);
  if (Math.abs(g.brg) > 2.6) text('射界受限：舰体遮挡', cx, cy + 90, WARN, `700 13px ${SANS}`, 'center');
  if (game.lastFall && game.t - game.lastFall.t < 4) text(game.lastFall.text, cx, cy - 80, game.lastFall.text === '命中！' ? '#8dffb4' : AMBER, `800 ${compact ? 16 : 20}px ${SANS}`, 'center');
  text(`望远 ×${(1 / (game.zoom || 1)).toFixed(0)}`, HW - 20, HH - (isTouch ? 230 : 30), '#eef3f5', `600 11px ${MONO}`, 'right');
  drawScope(s.pos, fwdOf(s.heading, _c), 30000, '雷达 30 km');
}
// full tactical picture
function drawMap() {
  const S = Math.min(HW, HH) * 0.84, x0 = HW / 2 - S / 2, y0 = HH / 2 - S / 2, span = 140000;
  const P = (x, z) => [x0 + (x / span + 0.5) * S, y0 + (z / span + 0.5) * S];
  hc.save();
  hc.fillStyle = 'rgba(4,14,24,0.86)'; hc.fillRect(x0, y0, S, S);
  hc.strokeStyle = 'rgba(141,255,180,0.12)'; hc.lineWidth = 1;
  for (let g = -70000; g <= 70000; g += 10000) { const [a] = P(g, 0), [, b] = P(0, g); hc.beginPath(); hc.moveTo(a, y0); hc.lineTo(a, y0 + S); hc.moveTo(x0, b); hc.lineTo(x0 + S, b); hc.stroke(); }
  hc.strokeStyle = 'rgba(238,243,245,0.4)'; hc.strokeRect(x0, y0, S, S);
  for (const I of ISLANDS) { const [x, y] = P(I.x, I.z); hc.fillStyle = '#c9bb8e'; hc.beginPath(); hc.ellipse(x, y, Math.max(2, I.rx / span * S), Math.max(1.5, I.rz / span * S), I.rot || 0, 0, Math.PI * 2); hc.fill(); }
  const me = game.side;
  // own sensor coverage
  hc.strokeStyle = 'rgba(143,200,255,0.18)';
  for (const sn of sensorsOf(me)) { const [x, y] = P(sn.u.pos.x, sn.u.pos.z); hc.beginPath(); hc.arc(x, y, Math.min(sn.r, sn.u.kind === 'plane' ? sn.r : horizon(sn.h, 5)) / span * S, 0, Math.PI * 2); hc.stroke(); }
  for (const s of ships) if (s.side === me && s.alive && !s.dying) { const [x, y] = P(s.pos.x, s.pos.z); hc.fillStyle = BLUE; hc.fillRect(x - 4, y - 4, 8, 8); hc.font = `500 10px ${SANS}`; hc.fillText(s.name, x + 7, y + 4); }
  for (const b of bases) if (b.side === me && b.alive) { const [x, y] = P(b.pos.x, b.pos.z); hc.strokeStyle = BLUE; hc.strokeRect(x - 6, y - 6, 12, 12); hc.fillStyle = BLUE; hc.fillText(b.name, x + 9, y + 4); }
  for (const p of planes) if (p.side === me && p.alive && p.airborne) { const [x, y] = P(p.pos.x, p.pos.z); hc.fillStyle = p === player ? GOLD : BLUE; hc.beginPath(); hc.arc(x, y, p === player ? 4 : 2.2, 0, Math.PI * 2); hc.fill(); }
  for (const [e, tr] of picture[me]) {
    if (!e.alive || e.dying) continue;
    const [x, y] = P(tr.pos.x, tr.pos.z);
    hc.globalAlpha = clamp(1 - (game.t - tr.t) / 150, 0.3, 1);
    hc.fillStyle = e.kind === 'msl' ? WARN : RED;
    if (e.kind === 'ship' || e.kind === 'base') { hc.beginPath(); hc.moveTo(x, y - 6); hc.lineTo(x + 6, y); hc.lineTo(x, y + 6); hc.lineTo(x - 6, y); hc.closePath(); hc.fill(); hc.font = `500 10px ${SANS}`; hc.fillText(e.name, x + 8, y + 4); }
    else { hc.beginPath(); hc.arc(x, y, e.kind === 'msl' ? 1.8 : 2.6, 0, Math.PI * 2); hc.fill(); }
    hc.globalAlpha = 1;
  }
  for (const m of missiles) if (m.alive && m.side === me && m.cls === 'ashm') { const [x, y] = P(m.pos.x, m.pos.z); hc.fillStyle = '#ffffff'; hc.fillRect(x - 1, y - 1, 2, 2); }
  text('战术态势 · 140 km · 数据链共享', x0 + 10, y0 + 18, '#eef3f5', `600 12px ${SANS}`);
  text(`风向 ${Math.round(((Math.atan2(-WIND.dir.x, WIND.dir.z) / D2R) + 540) % 360)}° · ${Math.round(WIND.speed * 1.94)} 节`, x0 + S - 10, y0 + 18, '#9fb0ba', `500 11px ${SANS}`, 'right');
  hc.restore();
}
function drawHUD(dt) {
  hc.setTransform(HDPR, 0, 0, HDPR, 0, 0);
  hc.clearRect(0, 0, HW, HH);
  if (game.mode !== 'play' && game.mode !== 'paused') { Sound.rwrTone(false); return; }
  if (HQ()) { hc.shadowColor = 'rgba(0,0,0,0.5)'; hc.shadowBlur = 3; }
  if (game.role === 'pilot' && player && player.alive) drawPilot(dt);
  else if (game.role === 'captain' && game.gunsight && flagship && flagship.gun) drawGunsight();
  else if (game.role === 'captain') drawCaptain();
  else { drawContacts(camera.position, 30000, 150000); const f = game.focus; if (f) text(f.kind === 'msl' ? `${f.spec.name} → ${f.target?.name || ''}` : f.name || '', HW / 2, HH - 40, '#eef3f5', `600 13px ${SANS}`, 'center'); }
  drawTop();
  if (game.map) drawMap();
  // chapter card, messages, radio
  if (game.card && game.card.t > 0) {
    hc.save(); hc.globalAlpha = clamp(game.card.t / 0.6, 0, 1) * clamp((4.5 - game.card.t) / 0.4, 0, 1);
    hc.fillStyle = 'rgba(6,10,14,0.6)'; hc.fillRect(0, HH * 0.36, HW, 74);
    text(game.card.title, HW / 2, HH * 0.36 + 34, GOLD, `800 ${HH < 480 ? 22 : 28}px ${SANS}`, 'center');
    text(game.card.sub, HW / 2, HH * 0.36 + 58, '#eef3f5', `500 13px ${SANS}`, 'center');
    hc.restore();
  }
  let my = HH * 0.22;
  for (const m of game.msgs) {
    hc.globalAlpha = clamp(m.t / 0.4, 0, 1);
    text(m.text, HW / 2, my, m.color, `800 ${HH < 480 ? 18 : 22}px ${SANS}`, 'center');
    if (m.sub) text(m.sub, HW / 2, my + 18, m.color, `500 12px ${SANS}`, 'center');
    my += m.sub ? 44 : 30;
  }
  hc.globalAlpha = 1;
  let ry2 = HH - (isTouch ? (HH < 480 ? 128 : 150) : 60) - (game.radio.length - 1) * 17;
  const rxl = isTouch ? HW * 0.3 : 16;
  for (const r of game.radio) {
    hc.globalAlpha = clamp(r.t / 0.5, 0, 1);
    hc.font = `600 11px ${MONO}`; hc.fillStyle = r.color; hc.textAlign = 'left'; hc.fillText(`${r.from}：`, rxl, ry2);
    const w = hc.measureText(`${r.from}：`).width;
    hc.font = `500 12px ${SANS}`; hc.fillStyle = '#e9f2f7'; hc.fillText(r.text, rxl + w, ry2);
    ry2 += 17;
  }
  hc.globalAlpha = 1; hc.shadowBlur = 0;
}

/* ---------- battle setup ---------- */
let baseGroup = null;
function clearBattle() {
  for (const s of ships) scene.remove(s.obj);
  for (const p of planes) scene.remove(p.obj);
  for (const m of missiles) scene.remove(m.mesh);
  for (const d of debris) scene.remove(d.mesh);
  if (baseGroup) scene.remove(baseGroup);
  ships.length = planes.length = missiles.length = bullets.length = flares.length = debris.length = decoys.length = shells.length = bases.length = pending.length = 0;
  picture.cn.clear(); picture.us.clear(); firstSeen.cn = firstSeen.us = false;
  fire.clear(); smoke.clear(); tracerMesh.count = 0;
  player = null; flagship = null;
}
function setupBattle() {
  clearBattle();
  for (const side of ['cn', 'us']) {
    const O = ORBAT[side];
    let guide = null;
    for (const [key, sx, sz] of O.ships) {
      const s = new Ship(key);
      s.station = [sx, sz];
      if (!guide) { guide = s; s.pos.set(O.origin[0], 0, O.origin[1]); s.heading = O.heading; }
      else { toWorld(guide, sx, 0, sz, s.pos); s.pos.y = 0; s.heading = O.heading; }
      s.speed = s.order = 11; s.sync();
      ships.push(s);
    }
  }
  const b = buildBase(); baseGroup = b.obj; bases.push(b);
  Object.assign(command.cn, { course: 0, speed: 11, salvoCd: 40, airT: 0, strikeCd: {}, sweepCd: 30, h6Cd: 150 });
  Object.assign(command.us, { course: Math.PI, speed: 11, salvoCd: 50, airT: 0, strikeCd: {}, sweepCd: 30, b1b: 10, raidT: 240 });
  command.cn.reinf = 600;
  potential0.cn = potential('cn'); potential0.us = potential('us');
}
const ROLES = {
  cn: [
    { role: 'pilot', pick: 'j15', title: '歼-15T 舰载战斗机', sub: '福建舰电磁弹射 · 霹雳-15 ×4、霹雳-10 ×2、鹰击-83K ×2 · 多用途' },
    { role: 'pilot', pick: 'j35', title: '歼-35 隐身舰载机', sub: '福建舰 · 雷达截面小 · 霹雳-15 ×4 内埋 · 制空与护航' },
    { role: 'pilot', pick: 'j16', title: '歼-16 陆基战斗机', sub: '前哨岛礁机场跑道起飞 · 鹰击-83K ×2 · 航程更远' },
    { role: 'captain', pick: 't055', title: '055 型驱逐舰 南昌舰', sub: '112 单元垂发 · 海红旗-9B ×48 · 鹰击-21 ×4、鹰击-18 ×14' },
    { role: 'captain', pick: 't052d', title: '052D 型驱逐舰 昆明舰', sub: '海红旗-9 ×32 · 鹰击-18 ×10 · 舰队防空主力' },
    { role: 'captain', pick: 'fujian', title: '福建舰 航空母舰', sub: '指挥航母机动 · 甲板风决定起降节奏 · 自身防御薄弱' },
    { role: 'watch', pick: null, title: '战区指挥 · 观战', sub: '双方 AI 交战 · 自动镜头 · 最高 8 倍速' }
  ],
  us: [
    { role: 'pilot', pick: 'fa18', title: 'F/A-18E 超级大黄蜂', sub: '福特号电磁弹射 · AIM-120D ×4、AIM-9X ×2、LRASM ×2' },
    { role: 'pilot', pick: 'f35c', title: 'F-35C 隐身舰载机', sub: '福特号 · 雷达截面极小 · AIM-120D ×4 内埋 · 制空与护航' },
    { role: 'captain', pick: 'burke1', title: '阿利·伯克级驱逐舰', sub: '宙斯盾 · 标准-6 ×14、标准-2 ×22、ESSM ×24 · 鱼叉 ×8' },
    { role: 'captain', pick: 'tico', title: '提康德罗加级巡洋舰', sub: '防空指挥舰 · 标准-6 ×22、标准-2 ×40 · 两门舰炮' },
    { role: 'captain', pick: 'ford', title: '福特号 航空母舰', sub: '指挥航母机动 · 舰载机联队规模最大 · 自身防御薄弱' },
    { role: 'watch', pick: null, title: '战区指挥 · 观战', sub: '双方 AI 交战 · 自动镜头 · 最高 8 倍速' }
  ]
};
// compile every material in the battle up front (both detail levels), so nothing stalls a frame mid-fight
function precompile() {
  for (const sh of ships) if (sh.lo) sh.lo.visible = sh.obj.visible = true;
  try { renderer.compile(scene, camera); } catch (_) {}
  lod();
}
function startGame() {
  Sound.init();
  setupBattle();
  Object.assign(game, { mode: 'play', t: 0, scale: 1, msgs: [], radio: [], shake: 0, flash: 0, map: false, chapter: 0, flags: {}, cause: '', over: null,
    ai: false, view: 0, viewT: 0, focus: null, ashmSel: null, mslCd: 0, card: null, endT: 0, zoom: 1,
    stats: { kills: 0, shipKills: 0, launches: 0, traps: 0, sorties: 0 } });
  game.lock = { target: null, t: 0, locked: false, kind: 'mrm', need: 1 };
  $('b-scale').textContent = '时间 ×1'; $('b-ai').classList.remove('on'); $('b-map').classList.remove('on');
  takeRole(game.role, game.pick);
  chapter(1);
  radio(game.side === 'cn' ? '舰队司令部' : 'Strike Group', game.side === 'cn' ? '各舰进入一级战备。空警-600 准备起飞。' : 'All stations, general quarters. Launch the Hawkeye.', '#ffd28a');
  show(null);
  precompile();
  if (isTouch) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    screen.orientation?.lock?.('landscape').catch(() => {});
    if (innerHeight > innerWidth) toast('横屏游玩体验更佳', 3500);
  }
  navigator.wakeLock?.request?.('screen').catch(() => {});
}
function takeRole(role, pick) {
  game.role = role; game.pick = pick; game.view = 0; game.ai = false; game.snap = 3;
  player = null; flagship = null;
  const side = game.side;
  if (role === 'pilot') {
    const home = pick === 'j16' ? bases.find(b => b.alive) : ships.find(s => s.side === side && s.carrier && s.alive && !s.dying);
    if (!home) { takeRole('watch'); return; }
    if (home.hangar[pick] > 0) home.hangar[pick]--;
    const p = player = new Plane(side, pick, home);
    p.pilot = new Pilot(p, 0.9); p.role = 'cap'; p.name = `${AC[pick].name}（你）`;
    planes.push(p);
    if (!spotOnCatapult(p)) { p.state = 'deck'; p.deckT = 3; }
    $('b-scale').textContent = '时间 ×1'; game.scale = 1;
    sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -70; sunLight.shadow.camera.right = sunLight.shadow.camera.top = 70;
  } else if (role === 'captain') {
    flagship = ships.find(s => s.key === pick && s.alive && !s.dying) || ships.find(s => s.side === side && s.alive && !s.dying);
    if (!flagship) { takeRole('watch'); return; }
    game.ashmSel = null;
    sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -260; sunLight.shadow.camera.right = sunLight.shadow.camera.top = 260;
  }
  sunLight.shadow.camera.far = 1200; sunLight.shadow.camera.updateProjectionMatrix();
  $('pilot-ctl').hidden = role !== 'pilot';
  $('cap-ctl').hidden = role !== 'captain'; $('gun-ctl').hidden = true; game.gunsight = false;
  $('stick-zone').hidden = role === 'watch';
  $('b-ai').hidden = role === 'watch';
  $('b-ai').textContent = role === 'captain' ? 'AI 舰长' : 'AI 驾驶';
}

/* ---------- screens ---------- */
const screens = ['menu', 'side', 'role', 'brief', 'pause', 'dead', 'end'];
function show(name) {
  for (const k of screens) $(k).hidden = k !== name;
  const playing = name === null;
  $('touch').hidden = !playing;
  $('topbar').hidden = !playing;
  if (playing) $('touch').classList.toggle('desk', !isTouch);
}
function toMenu() {
  setupBattle();
  game.mode = 'menu'; game.role = 'watch'; game.t = 0; game.snap = 3;
  Sound.engine(0, 0, false); Sound.lockTone(false); Sound.rwrTone(false);
  show('menu');
}
function chooseSide(side) {
  game.side = side;
  const list = $('role-list'); list.innerHTML = '';
  $('role-title').textContent = SIDES[side].name;
  for (const r of ROLES[side]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick';
    b.innerHTML = `<b>${r.title}</b><span>${r.sub}</span><i>${r.role === 'pilot' ? '飞行员' : r.role === 'captain' ? '舰长' : '指挥'}</i>`;
    b.onclick = () => { game.role = r.role; game.pick = r.pick; brief(); };
    list.appendChild(b);
  }
  show('role');
}
function brief() {
  const s = game.side, el = $('brief-text');
  el.innerHTML = '';
  for (const p of STORY.brief[s]) { const q = document.createElement('p'); q.textContent = p; el.appendChild(q); }
  const perks = document.createElement('dl'); perks.className = 'help';
  for (const [a, b] of SIDES[s].perks) { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; perks.append(dt, dd); }
  el.appendChild(perks);
  $('brief-title').textContent = SIDES[s].name;
  show('brief');
}
function togglePause() {
  if (game.mode === 'play') { game.mode = 'paused'; show('pause'); Sound.engine(0, 0, false); Sound.lockTone(false); Sound.rwrTone(false); Sound.ctx?.suspend?.(); }
  else if (game.mode === 'paused') { game.mode = 'play'; show(null); Sound.ctx?.resume?.(); }
}
// after the player is shot down or loses their ship: fly again, take a ship, or watch
function deathChoices() {
  const list = $('dead-list'); list.innerHTML = '';
  const side = game.side;
  const add = (label, sub, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pick'; b.innerHTML = `<b>${label}</b><span>${sub}</span>`; b.onclick = () => { fn(); game.mode = 'play'; show(null); }; list.appendChild(b); };
  for (const h of ships.filter(s => s.side === side && s.carrier && s.alive && !s.dying).concat(bases.filter(b => b.side === side && b.alive))) {
    for (const [t, n] of Object.entries(h.hangar)) if (n > 0 && AC[t].role !== 'aew' && AC[t].role !== 'bomber') add(`再次出击 · ${AC[t].name}`, `${h.name} · 机库剩余 ${n} 架`, () => takeRole('pilot', t));
  }
  for (const s of ships.filter(s => s.side === side && s.alive && !s.dying)) add(`指挥 ${s.name}`, s.spec.name || '', () => takeRole('captain', s.key));
  add('战区指挥 · 观战', '双方 AI 继续交战', () => takeRole('watch'));
  $('dead-title').textContent = game.cause || '任务中断';
  show('dead');
}
function checkEnd(dt) {
  game.endCheck = (game.endCheck || 0) - dt;
  if (game.endCheck > 0 || game.over) return;
  game.endCheck = 1;
  for (const side of ['cn', 'us']) {
    const alive = ships.some(s => s.side === side && s.alive && !s.dying) || bases.some(b => b.side === side && b.alive);
    const p = potential(side) / potential0[side];
    if (!alive || p < 0.33) { game.over = foe(side); game.endT = 5; message(game.over === game.side ? '胜利' : '战败', `${SIDES[side].name}战争潜力${alive ? '崩溃' : '归零'}`, game.over === game.side ? '#8dffb4' : '#ff8a78', 5); return; }
  }
  // campaign deadline: after 80 minutes the side with less of its war potential left breaks off
  if (game.t > 4800) {
    const lose = potential('cn') / potential0.cn < potential('us') / potential0.us ? 'cn' : 'us';
    game.over = foe(lose); game.endT = 5; message(game.over === game.side ? '胜利' : '战败', `${SIDES[lose].name}无力再战，撤出战区`, game.over === game.side ? '#8dffb4' : '#ff8a78', 5); return;
  }
  const pm = potential('cn') / potential0.cn, pu = potential('us') / potential0.us;
  if (game.chapter >= 3 && (pm < 0.55 || pu < 0.55 || ships.some(s => s.carrier && s.hp < s.maxHp * 0.6))) chapter(5);
}
function endGame() {
  game.mode = 'over';
  const win = game.over === game.side;
  $('end-tag').textContent = win ? '胜利' : '战败';
  $('end-title').textContent = win ? '夺取制海权' : '撤出战区';
  $('end-text').textContent = STORY.end[win ? 'win' : 'lose'][game.side];
  const S = game.stats, mm = Math.floor(game.t / 60);
  $('e-time').textContent = `${mm} 分`; $('e-kills').textContent = S.kills; $('e-ships').textContent = S.shipKills; $('e-traps').textContent = S.traps;
  Sound.engine(0, 0, false); Sound.lockTone(false); Sound.rwrTone(false);
  show('end');
}
let toastTimer = 0;
function toast(t, ms) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms); }

$('b-start').onclick = () => { Sound.init(); show('side'); };
for (const b of document.querySelectorAll('[data-side]')) b.onclick = () => chooseSide(b.dataset.side);
$('b-side-back').onclick = () => show('menu');
$('b-role-back').onclick = () => show('side');
$('b-brief-back').onclick = () => chooseSide(game.side);
$('b-go').onclick = startGame;
$('b-resume').onclick = togglePause;
$('b-quit').onclick = () => { Sound.ctx?.resume?.(); toMenu(); };
$('b-again').onclick = () => show('side');
$('b-home').onclick = toMenu;
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'play') togglePause(); });
function renderSettings() {
  $('s-quality').querySelector('b').textContent = HQ() ? '高' : '流畅';
  $('s-sound').querySelector('b').textContent = settings.sound ? '开' : '关';
  $('s-time').querySelector('b').textContent = world.TIMES[settings.time].label;
  $('s-invert').querySelector('b').textContent = settings.invert ? '上推俯冲' : '上推爬升';
}
const TIME_ORDER = ['noon', 'dusk', 'dawn'];
$('s-quality').onclick = () => { settings.quality = HQ() ? 'low' : 'high'; store.set('quality', settings.quality); applyQuality(); renderSettings(); };
$('s-sound').onclick = () => { settings.sound = !settings.sound; store.set('sound', settings.sound); Sound.setVolume(settings.sound); renderSettings(); };
$('s-time').onclick = () => { settings.time = TIME_ORDER[(TIME_ORDER.indexOf(settings.time) + 1) % 3]; store.set('time', settings.time); world.setTime(settings.time); renderSettings(); };
$('s-invert').onclick = () => { settings.invert = !settings.invert; store.set('invert', settings.invert); renderSettings(); };
function applyQuality() { renderer.setPixelRatio(Math.min(devicePixelRatio, HQ() ? 2 : 1.25) * perf.scale); sunLight.castShadow = HQ(); resize(); }
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  HDPR = Math.min(devicePixelRatio, isTouch ? 1.5 : 2); HW = w; HH = h;
  hud.width = Math.round(w * HDPR); hud.height = Math.round(h * HDPR);
  const scale = renderer.domElement.height * camera.projectionMatrix.elements[5] * 0.5;
  fire.mat.uniforms.uScale.value = scale; smoke.mat.uniforms.uScale.value = scale;
}
addEventListener('resize', resize);

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
let queueT = 0;
// adaptive resolution: if frames run long the render scale steps down (and back up when there is headroom),
// so a busy moment on a tablet costs sharpness rather than responsiveness
const perf = { avg: 1 / 60, t: 0, scale: 1 };
function adapt(raw) {
  perf.avg += (Math.min(raw, 0.2) - perf.avg) * 0.05;
  perf.t += raw;
  if (perf.t < 2) return;
  perf.t = 0;
  const was = perf.scale;
  if (perf.avg > 1 / 36 && perf.scale > 0.5) perf.scale = Math.max(0.5, perf.scale - 0.15);
  else if (perf.avg < 1 / 54 && perf.scale < 1) perf.scale = Math.min(1, perf.scale + 0.1);
  if (perf.scale !== was) applyQuality();
}
function lod() {
  const far = HQ() ? 9000 : 5000;
  for (const s of ships) if (s.lo && s.alive) { const lo = s.obj.position.distanceTo(camera.position) > far; s.obj.visible = !lo; s.lo.visible = lo; }
}
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(), rdt = Math.min(raw, 0.05);
  adapt(raw);
  if (game.mode === 'paused') { renderer.render(scene, camera); return; }
  const sim = rdt * (game.mode === 'play' ? game.scale : 1);
  const n = Math.max(1, Math.ceil(sim / (1 / 30)));
  for (let i = 0; i < n; i++) update(sim / n);
  fire.update(sim); smoke.update(sim);
  updateCamera(rdt);
  world.follow(camera.position);
  lod();
  $('keys').hidden = game.t > 30 && game.mode === 'play';
  renderer.render(scene, camera);
  drawHUD(rdt);
  $('flash').style.opacity = game.flash.toFixed(3);
}
function update(dt) {
  game.t += dt;
  world.update(game.t);
  if (game.mode === 'menu') { for (const s of ships) updateShip(s, dt); return; }
  if (!['play', 'dead', 'over'].includes(game.mode)) return;
  updateSensors(dt);
  updateCommand('cn', dt); updateCommand('us', dt);
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i].t <= game.t) { const p = pending[i]; pending.splice(i, 1); p.fn(); }
  queueT -= dt; if (queueT <= 0) { queueT = 1; processQueues(); }
  if (game.mode === 'play' && game.role === 'pilot' && player && player.alive) {
    updatePilot(dt);
    Sound.engine(player.c.brake ? 0.2 : 0.65, player.boost ? 1 : 0, player.alive && player.state !== 'deck');
  }
  if (game.mode === 'play' && game.role === 'captain') updateCaptain(dt);
  for (const s of ships) if (s.alive) { updateShip(s, dt); if (!s.dying) { defend(s, dt); ciws(s, dt); shipGun(s, dt); } }
  for (let i = ships.length - 1; i >= 0; i--) if (!ships[i].alive) ships.splice(i, 1);
  for (const b of bases) updateBase(b, dt);
  for (const pl of planes.slice()) updatePlane(pl, dt);
  updateMissiles(dt); updateBullets(dt); updateShells(dt); updateFlares(dt); updateDebris(dt);
  for (const m of game.msgs) m.t -= dt;
  game.msgs = game.msgs.filter(m => m.t > 0);
  for (const r of game.radio) r.t -= dt;
  game.radio = game.radio.filter(r => r.t > 0);
  if (game.card) game.card.t -= dt;
  game.flash = Math.max(0, game.flash - dt * 1.4);
  // the player's ship going down
  if (game.mode === 'play' && game.role === 'captain' && flagship && flagship.dying) { game.cause = `${flagship.name}沉没`; game.deathPos = flagship.pos.clone(); game.mode = 'dead'; game.deadT = 5; }
  if (game.mode === 'play' && game.role === 'pilot' && (!player || !player.alive)) { game.mode = 'dead'; game.deadT = 2.5; }
  if (game.mode === 'dead' && player && !player.alive) game.deathPos = game.deathPos || player.pos.clone();
  if (game.mode === 'dead' && !game.over) { game.deadT -= dt; if (game.deadT <= 0 && $('dead').hidden) { game.deathPos = null; deathChoices(); } }
  checkEnd(dt);
  if (game.over) { game.endT -= dt; if (game.endT <= 0 && game.mode !== 'over') endGame(); }
}

/* ---------- boot ---------- */
renderSettings();
applyQuality();
clock.getDelta();
frame();
$('loading').textContent = '正在下载舰船与舰载机模型 0 / 8';
NavyHD.loadAll((n, total) => { $('loading').textContent = `正在下载舰船与舰载机模型 ${n} / ${total}`; }).then(() => {
  toMenu();
  $('loading').hidden = true;
  window.__navwarReady = true;
  const cr = $('credits');
  if (cr) cr.innerHTML = '模型：' + NavyHD.CREDITS.map(([t, a, l, u]) => `<a href="${u}" target="_blank" rel="noopener">${t}</a> · ${a} · ${l}`).join('；') + '；其余为程序化建模。';
});
window.__navwar = { dbg, game, ships, planes, missiles, bases, picture, command, get player() { return player; }, get flagship() { return flagship; }, startGame, takeRole, update, potential, chooseSide, input, camera, perf };
