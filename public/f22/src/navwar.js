import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*@MODEL@*/
/*@AIRCRAFT@*/
/*@WORLD@*/
/*@NAVY@*/

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
  yj83:   { name: '鹰击-83', cls: 'ashm', profile: 'sub', v: 290, range: 34000, dmg: 120, rcs: 1, skim: 7 },
  yj18:   { name: '鹰击-18', cls: 'ashm', profile: 'super', v: 260, sprint: 950, sprintAt: 13000, range: 48000, dmg: 160, rcs: 1, skim: 8 },
  yj21:   { name: '鹰击-21', cls: 'ashm', profile: 'hyper', v: 1900, range: 72000, dmg: 260, rcs: 1.4, cruise: 18000 },
  yj12:   { name: '鹰击-12', cls: 'ashm', profile: 'high', v: 900, range: 62000, dmg: 200, rcs: 1.2, cruise: 9000, skimAt: 22000 },
  harpoon:{ name: '鱼叉', cls: 'ashm', profile: 'sub', v: 240, range: 30000, dmg: 110, rcs: 1, skim: 6 },
  lrasm:  { name: 'LRASM', cls: 'ashm', profile: 'sub', v: 255, range: 62000, dmg: 210, rcs: 0.45, skim: 6, smart: true },
  sm6s:   { name: '标准-6 反舰', cls: 'ashm', profile: 'high', v: 1100, range: 42000, dmg: 80, rcs: 1, cruise: 12000, skimAt: 6000 },
  hhq9:   { name: '海红旗-9B', cls: 'sam', v: 1350, range: 34000, pk: 0.72 },
  hhq16:  { name: '海红旗-16', cls: 'sam', v: 1050, range: 17000, pk: 0.7 },
  hhq10:  { name: '海红旗-10', cls: 'sam', v: 820, range: 4800, pk: 0.68, short: true },
  sm6:    { name: '标准-6', cls: 'sam', v: 1350, range: 44000, pk: 0.76 },
  sm2:    { name: '标准-2', cls: 'sam', v: 1150, range: 28000, pk: 0.7 },
  essm:   { name: 'ESSM', cls: 'sam', v: 1150, range: 15000, pk: 0.72 },
  ram:    { name: 'RAM', cls: 'sam', v: 820, range: 4800, pk: 0.68, short: true }
};
const PK_MUL = { plane: 0.75, sub: 1, super: 0.62, high: 0.7, hyper: 0.3 };
const CIWS_PK = { sub: 0.62, super: 0.36, high: 0.4, hyper: 0.12, plane: 0.5 };

/* ---------- ships ---------- */
// vmax m/s (31 kn = 16 m/s), turn deg/s at speed, mast = radar height m, channels = simultaneous SAM engagements
const SH = {
  fujian: { model: 'fujian', side: 'cn', name: '福建舰', hp: 1700, vmax: 16, turn: 0.9, mast: 48, radar: 100000, carrier: true, sam: { hhq10: 24 }, ashm: {}, channels: 4, ciws: 3, decoys: 10, value: 300, wing: { j15: 10, j35: 6, kj600: 2 }, top: 22, L: 316, B: 76 },
  t055:   { model: 't055', side: 'cn', name: '南昌舰', hp: 640, vmax: 15.5, turn: 1.6, mast: 40, radar: 115000, sam: { hhq9: 48, hhq10: 24 }, ashm: { yj21: 6, yj18: 14 }, channels: 8, ciws: 1, decoys: 8, gun: true, value: 130, top: 30, L: 180, B: 20 },
  t052d:  { model: 't052d', side: 'cn', name: '昆明舰', hp: 470, vmax: 15.5, turn: 1.8, mast: 34, radar: 100000, sam: { hhq9: 32 }, ashm: { yj18: 10 }, channels: 6, ciws: 1, decoys: 8, gun: true, value: 80, top: 26, L: 157, B: 18 },
  t052d2: { model: 't052d', side: 'cn', name: '长沙舰', hp: 470, vmax: 15.5, turn: 1.8, mast: 34, radar: 100000, sam: { hhq9: 32 }, ashm: { yj18: 10 }, channels: 6, ciws: 1, decoys: 8, gun: true, value: 80, top: 26, L: 157, B: 18, number: '173' },
  t054a:  { model: 't054a', side: 'cn', name: '黄山舰', hp: 330, vmax: 14.5, turn: 2, mast: 28, radar: 80000, sam: { hhq16: 24 }, ashm: { yj83: 8 }, channels: 4, ciws: 1, decoys: 6, gun: true, value: 50, top: 22, L: 134, B: 16 },
  ford:   { model: 'ford', side: 'us', name: '福特号', hp: 1900, vmax: 16.5, turn: 0.9, mast: 50, radar: 100000, carrier: true, sam: { essm: 16, ram: 21 }, ashm: {}, channels: 4, ciws: 3, decoys: 12, value: 340, wing: { fa18: 12, f35c: 8, e2d: 2 }, top: 24, L: 333, B: 78 },
  tico:   { model: 'tico', side: 'us', name: '普林斯顿号', hp: 560, vmax: 16, turn: 1.6, mast: 36, radar: 110000, sam: { sm6: 22, sm2: 40 }, ashm: { harpoon: 8, sm6s: 6 }, channels: 8, ciws: 2, decoys: 10, gun: true, value: 100, top: 28, L: 173, B: 17 },
  burke1: { model: 'burke', side: 'us', name: '杰克·H·卢卡斯号', hp: 480, vmax: 16, turn: 1.8, mast: 34, radar: 110000, sam: { sm6: 14, sm2: 22, essm: 24 }, ashm: { harpoon: 8, sm6s: 4 }, channels: 6, ciws: 2, decoys: 10, gun: true, value: 80, top: 26, L: 155, B: 20 },
  burke2: { model: 'burke', side: 'us', name: '平克尼号', hp: 480, vmax: 16, turn: 1.8, mast: 34, radar: 110000, sam: { sm6: 14, sm2: 22, essm: 24 }, ashm: { harpoon: 8, sm6s: 4 }, channels: 6, ciws: 2, decoys: 10, gun: true, value: 80, top: 26, L: 155, B: 20, number: '91' },
  burke3: { model: 'burke', side: 'us', name: '米利厄斯号', hp: 480, vmax: 16, turn: 1.8, mast: 34, radar: 110000, sam: { sm6: 14, sm2: 22, essm: 24 }, ashm: { harpoon: 8, sm6s: 4 }, channels: 6, ciws: 2, decoys: 10, gun: true, value: 80, top: 26, L: 155, B: 20, number: '69' }
};
// fleet stations (m) relative to the carrier, in the carrier's frame: +x ahead, +z starboard
const ORBAT = {
  cn: { origin: [-30000, 7000], heading: 0, ships: [['fujian', 0, 0], ['t055', 3200, 0], ['t052d', 900, 2800], ['t052d2', 900, -2800], ['t054a', -2600, 0]] },
  us: { origin: [30000, -6000], heading: Math.PI, ships: [['ford', 0, 0], ['tico', 3000, 0], ['burke1', 1000, 3000], ['burke2', 1000, -3000], ['burke3', -2800, 0]] }
};
const BASE = { side: 'cn', name: '前哨岛礁机场', hp: 1100, value: 200, mast: 60, radar: 120000, sam: { hhq9: 36 }, channels: 6, wing: { j16: 8, h6k: 6 }, isl: ISLANDS[0] };
const WIND = { dir: new V3(-0.85, 0, 0.53).normalize(), speed: 8 };   // wind blows toward this direction (from the north-east)
