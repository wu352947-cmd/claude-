import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*@MODEL@*/
/*@TERRAIN@*/

/* =========================================================
   猛禽制空: arcade dogfight built on the procedural F-22A
   World: metres, y up. Aircraft local frame: +x nose, +y up, +z right.
   ========================================================= */
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const X_AXIS = new V3(1, 0, 0), Y_AXIS = new V3(0, 1, 0), Z_AXIS = new V3(0, 0, 1);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(k, d) { try { const v = localStorage.getItem('raptor.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('raptor.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const settings = {
  invert: store.get('invert', false),
  quality: store.get('quality', isTouch ? 'low' : 'high'),
  sound: store.get('sound', true)
};
let best = store.get('best', 0);
const HQ = () => settings.quality === 'high';

/* ---------- renderer & scene ---------- */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 1.5, 42000);
scene.add(camera);

const SUN = new V3().setFromSphericalCoords(1, (90 - 13) * Math.PI / 180, 205 * Math.PI / 180);
const FOG_D = 0.000052;
const fogColor = new THREE.Color(0xb3bfc9);
scene.fog = new THREE.FogExp2(fogColor, FOG_D);

function makeSky(scale) {
  const s = new Sky();
  s.scale.setScalar(scale);
  const u = s.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(SUN);
  return s;
}
scene.add(makeSky(30000));
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(100));
  const lowerHalf = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x24404f, side: THREE.BackSide }));
  envScene.add(lowerHalf);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
}

const hemi = new THREE.HemisphereLight(0xc4d6ee, 0x3c4a44, 1.0);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffe4c4, 3.2);
sunLight.shadow.mapSize.set(1024, 1024);
Object.assign(sunLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 200 });
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);

/* ---------- terrain ---------- */
function buildTerrain() {
  const size = 22000, seg = HQ() ? 240 : 170;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3);
  const lin = c => Math.pow(c, 2.2);
  const C = {
    sand: [0.79, 0.73, 0.57], grass: [0.29, 0.37, 0.19], forest: [0.16, 0.25, 0.13], dry: [0.47, 0.44, 0.3],
    rock: [0.47, 0.44, 0.4], dark: [0.3, 0.29, 0.28], snow: [0.95, 0.96, 0.98], seabed: [0.42, 0.47, 0.42]
  };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nrm.getY(i);
    const n = vnoise(x / 260, z / 260) * 0.5 + 0.5, n2 = vnoise(x / 70, z / 70) * 0.5 + 0.5;
    let c = mix(C.grass, C.forest, smooth(0.35, 0.7, n));
    c = mix(c, C.dry, smooth(0.6, 0.9, n2) * 0.5);
    c = mix(C.sand, c, smooth(4, 22, h));
    c = mix(c, mix(C.rock, C.dark, n2), Math.max(smooth(0.86, 0.7, ny), smooth(700, 1100, h + n * 200)));
    c = mix(c, C.snow, smooth(1150, 1350, h + n * 160) * smooth(0.55, 0.75, ny));
    if (h < 0) c = mix(C.sand, C.seabed, smooth(0, -40, h));
    col[i * 3] = lin(c[0]); col[i * 3 + 1] = lin(c[1]); col[i * 3 + 2] = lin(c[2]);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 256;
  const g = dc.getContext('2d'), img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 200 + 55 * (0.6 * (vnoise(x / 8, y / 8) * 0.5 + 0.5) + 0.4 * (vnoise(x / 2.3 + 50, y / 2.3) * 0.5 + 0.5));
    const k = (y * 256 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const detail = new THREE.CanvasTexture(dc);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.repeat.set(size / 90, size / 90);
  detail.colorSpace = THREE.SRGBColorSpace;
  detail.anisotropy = 4;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 }));
  scene.add(mesh);
}

/* ---------- ocean ---------- */
const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uSun: { value: SUN }, uFogColor: { value: fogColor }, uFogDensity: { value: FOG_D },
    uDeep: { value: new THREE.Color(0x0b3446) }, uSky: { value: new THREE.Color(0x6e9ccc) }, uHorizon: { value: fogColor }
  },
  vertexShader: `varying vec3 vWorld;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime, uFogDensity; uniform vec3 uSun, uFogColor, uDeep, uSky, uHorizon; varying vec3 vWorld;
    vec2 wave(vec2 p, vec2 d, float k, float a, float s){ return d * (a * k * cos(dot(p, d) * k + uTime * s)); }
    void main(){
      vec2 p = vWorld.xz;
      vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.021, 1.3, 1.1)
             + wave(p, normalize(vec2(-0.4, 1.0)), 0.037, 0.6, 1.5)
             + wave(p, normalize(vec2(0.7, -0.8)), 0.093, 0.2, 2.3)
             + wave(p, normalize(vec2(-0.9, -0.2)), 0.21, 0.07, 3.1)
             + wave(p, normalize(vec2(0.2, 0.9)), 0.53, 0.022, 4.0);
      vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 v = toCam / dist;
      vec3 n = normalize(mix(normalize(vec3(-g.x, 1.0, -g.y)), vec3(0.0, 1.0, 0.0), smoothstep(1500.0, 14000.0, dist)));
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 r = reflect(-v, n);
      vec3 skyc = mix(uHorizon, uSky, smoothstep(0.0, 0.45, r.y));
      float sd = max(dot(r, uSun), 0.0);
      vec3 col = mix(uDeep, skyc, fres) + vec3(1.0, 0.86, 0.62) * (pow(sd, 900.0) * 40.0 + pow(sd, 90.0) * 0.6);
      float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
      gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), waterMat);
water.rotation.x = -Math.PI / 2;
scene.add(water);

/* ---------- procedural sprite textures ---------- */
function puffTexture(size, blobs, soft) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * size * 0.22;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d * 0.8, r = size * rand(0.14, 0.3);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${soft})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const cloudTex = puffTexture(256, 34, 0.32), smokeTex = puffTexture(64, 12, 0.5), glowTex = glowTexture();

/* ---------- clouds: one instanced billboard draw ---------- */
function buildClouds() {
  const clusters = HQ() ? 80 : 46, per = 7;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: cloudTex }, uFogColor: { value: fogColor }, uFogDensity: { value: FOG_D },
      uTop: { value: new THREE.Color(0xfff2e2) }, uBottom: { value: new THREE.Color(0x8d98a8) } },
    vertexShader: `varying vec2 vUv; varying float vDist, vShade;
      void main(){
        vUv = uv;
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        c.xy += position.xy * s * vec2(1.0, 0.62);
        vDist = -c.z; vShade = position.y + 0.5;
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uFogColor, uTop, uBottom; uniform float uFogDensity;
      varying vec2 vUv; varying float vDist, vShade;
      void main(){
        vec4 t = texture2D(map, vUv);
        vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.85, vShade));
        float f = 1.0 - exp(-pow(uFogDensity * vDist, 2.0));
        float a = t.a * 0.9 * smoothstep(60.0, 420.0, vDist) * (1.0 - f * 0.5);
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(col, uFogColor, f), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, clusters * per);
  const m = new THREE.Matrix4(), p = new V3(), q = new Q(), s = new V3();
  let k = 0;
  for (let c = 0; c < clusters; c++) {
    const cx = rand(-12000, 12000), cz = rand(-12000, 12000), cy = rand(1900, 3000), r = rand(250, 600);
    for (let i = 0; i < per; i++) {
      p.set(cx + rand(-r, r), cy + rand(-r, r) * 0.22, cz + rand(-r, r));
      const sc = rand(380, 820);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(k++, m);
    }
  }
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

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
      if (this.additive) {
        this.c[c] = this.base[c]; this.c[c + 1] = this.base[c + 1] * (1 - 0.55 * t); this.c[c + 2] = this.base[c + 2] * (1 - 0.85 * t);
        this.c[c + 3] = this.base[c + 3] * Math.pow(1 - t, 1.4);
      } else {
        this.c[c] = this.base[c]; this.c[c + 1] = this.base[c + 1]; this.c[c + 2] = this.base[c + 2];
        this.c[c + 3] = this.base[c + 3] * Math.min(1, t * 10) * (1 - t);
      }
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.pa.needsUpdate = true; this.ca.needsUpdate = true; this.sa.needsUpdate = true;
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}
const fire = new Particles(3000, true, glowTex);
const smoke = new Particles(2600, false, smokeTex);

/* ---------- tracers ---------- */
const MAX_BULLETS = 420;
const tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  MAX_BULLETS);
tracerMesh.frustumCulled = false;
tracerMesh.renderOrder = 5;
for (let i = 0; i < MAX_BULLETS; i++) tracerMesh.setColorAt(i, new THREE.Color(1, 1, 1));
scene.add(tracerMesh);
const COL_PLAYER_TRACER = new THREE.Color(1.6, 1.1, 0.45), COL_ENEMY_TRACER = new THREE.Color(1.7, 0.45, 0.35);

/* ---------- aircraft ---------- */
const playerJet = F22.build({ physical: HQ(), detail: HQ() ? 1 : 0.75, gear: true, shadows: true, anisotropy: 8 });
playerJet.setGear(1);
scene.add(playerJet.group);
playerJet.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const missileMat = playerJet.materials.missileMat;
const missileGeo = F22.missileGeometry();

const enemyProto = F22.bake(F22.build({ paint: 'aggressor', gear: false, cockpit: false, bay: false, lights: false,
  plumes: false, physical: false, detail: 0.5, shadows: false, anisotropy: 4 }));

class Plane {
  constructor(team, obj) {
    this.team = team; this.obj = obj;
    this.pos = new V3(); this.q = new Q(); this.vel = new V3();
    this.fwd = new V3(1, 0, 0); this.up = new V3(0, 1, 0); this.right = new V3(0, 0, 1);
    this.speed = 250; this.hp = 100; this.alive = true; this.dying = false;
    this.ctl = { pitch: 0, roll: 0, yaw: 0 }; this.boost = false; this.g = 1;
    this.gunCd = 0; this.mslCd = rand(4, 9); this.flareCd = 0; this.burst = 0; this.skill = 0.3; this.turn = 0.6;
    this.spin = new V3(); this.dieT = 0; this.name = '';
  }
  axes() {
    this.fwd.set(1, 0, 0).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.right.set(0, 0, 1).applyQuaternion(this.q);
  }
  integrate(dt) {
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
    this.pos.addScaledVector(this.vel, dt);
    this.sync();
  }
  sync() { this.obj.position.copy(this.pos); this.obj.quaternion.copy(this.q); }
}
const _m4 = new THREE.Matrix4();
function setBasis(q, f, u) {
  const up = u.clone().addScaledVector(f, -f.dot(u)).normalize();
  const r = new V3().crossVectors(f, up);
  _m4.makeBasis(f, up, r);
  q.setFromRotationMatrix(_m4);
}

const player = new Plane('blue', playerJet.group);
let enemies = [];

/* ---------- audio (synthesised in WebAudio, no files) ---------- */
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
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; last = w; }
    this.noise = buf;
    // brown noise for the engine
    const bb = ctx.createBuffer(1, len, ctx.sampleRate), bd = bb.getChannelData(0);
    last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = bb; src.loop = true;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 500;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    src.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); src.start();
    const hiss = ctx.createBufferSource(); hiss.buffer = buf; hiss.loop = true;
    this.hissF = ctx.createBiquadFilter(); this.hissF.type = 'bandpass'; this.hissF.frequency.value = 2400; this.hissF.Q.value = 0.6;
    this.hissG = ctx.createGain(); this.hissG.gain.value = 0;
    hiss.connect(this.hissF); this.hissF.connect(this.hissG); this.hissG.connect(this.master); hiss.start();
    this.tone = ctx.createOscillator(); this.tone.type = 'square'; this.tone.frequency.value = 1700;
    this.toneG = ctx.createGain(); this.toneG.gain.value = 0;
    this.tone.connect(this.toneG); this.toneG.connect(this.master); this.tone.start();
  },
  setVolume(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05); },
  engine(throttle, boost, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engF.frequency.setTargetAtTime(260 + throttle * 520 + boost * 700, t, 0.15);
    this.engG.gain.setTargetAtTime(on ? 0.3 + boost * 0.18 : 0, t, 0.2);
    this.hissG.gain.setTargetAtTime(on ? 0.025 + boost * 0.05 : 0, t, 0.2);
  },
  lockTone(on) { if (this.ctx) this.toneG.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.02); },
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
  launch() { this.burst(1.3, 2400, 300, 0.45, 'bandpass', 0.5); this.burst(0.5, 400, 80, 0.4); },
  hit() { this.burst(0.18, 500, 90, 0.5); this.beep(140, 0.06, 0.15); },
  flare() { this.burst(0.35, 4000, 1500, 0.18, 'highpass'); }
};

/* ---------- input ---------- */
const input = { stickX: 0, stickY: 0, keys: new Set(), gun: false, boost: false, brake: false, msl: false, flare: false };
addEventListener('keydown', e => {
  if (game.mode !== 'play' && game.mode !== 'paused') return;
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(k);
  if (k === 'KeyF' || k === 'KeyK') input.msl = true;
  if (k === 'KeyX' || k === 'KeyL') input.flare = true;
  if (k === 'KeyP' || k === 'Escape') togglePause();
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.gun = input.boost = input.brake = false; });

{
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  let id = null, ox = 0, oy = 0;
  const R = 62;
  const home = () => { base.style.left = ''; base.style.top = ''; knob.style.transform = ''; };
  zone.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; zone.setPointerCapture(id);
    const r = zone.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px';
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
  const tap = (el, key) => el.addEventListener('pointerdown', e => {
    e.preventDefault(); input[key] = true; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 140);
  });
  hold($('b-gun'), 'gun'); hold($('b-ab'), 'boost'); hold($('b-brake'), 'brake');
  tap($('b-msl'), 'msl'); tap($('b-flare'), 'flare');
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
    brake: input.brake || k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyZ')
  };
}

/* ---------- game state ---------- */
const game = {
  mode: 'loading', t: 0, score: 0, kills: 0, wave: 0, ammo: 600, missiles: 6, flares: 30,
  lock: { target: null, t: 0, locked: false }, waveClear: 0, msgs: [], shake: 0, combo: 0, comboT: 0,
  bayT: 0, bay: 0, mslCd: 0, flareCd: 0, deadT: 0, warnBeep: 0, lockBeep: 0, outT: 0, menuA: 0, cause: ''
};
const bullets = [], missiles = [], flares = [], debris = [];
const camQ = new Q();
let camDist = 26, fov = 62;

function message(text, sub = '', color = '#8dffb4', dur = 2.2) {
  game.msgs.push({ text, sub, color, t: dur, dur });
  if (game.msgs.length > 4) game.msgs.shift();
}

/* ---------- weapons ---------- */
function fireBullet(from, dir, owner, speed = 1150) {
  if (bullets.length >= MAX_BULLETS) return;
  bullets.push({ pos: from.clone(), prev: from.clone(), vel: dir.clone().multiplyScalar(speed).add(owner.vel), life: 1.7, owner });
}
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();
function segDist(p0, p1, c) { // distance from point c to segment p0-p1
  _a.subVectors(p1, p0); const l2 = _a.lengthSq();
  const t = l2 > 0 ? clamp(_b.subVectors(c, p0).dot(_a) / l2, 0, 1) : 0;
  return _c.copy(p0).addScaledVector(_a, t).distanceTo(c);
}
function launchMissile(owner, target) {
  owner.axes();
  const mesh = new THREE.Mesh(missileGeo, missileMat);
  scene.add(mesh);
  const m = {
    mesh, owner, target, pos: owner.pos.clone().addScaledVector(owner.up, -1.7).addScaledVector(owner.fwd, -1.5),
    dir: owner.fwd.clone(), vel: owner.vel.clone().addScaledVector(owner.up, -12), speed: owner.speed, age: 0, alive: true,
    prev: new V3(), turn: owner.team === 'blue' ? 1.5 : 0.78, fuse: owner.team === 'blue' ? 26 : 16, decoyed: false
  };
  missiles.push(m);
  if (owner === player) Sound.launch(); else Sound.burst(1, 2000, 300, clamp(1 - owner.pos.distanceTo(player.pos) / 4000, 0, 0.3), 'bandpass');
  return m;
}
function dropFlares(pl) {
  pl.axes();
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const v = pl.vel.clone().multiplyScalar(0.55).addScaledVector(pl.up, -rand(20, 40)).addScaledVector(pl.right, side * rand(25, 55)).addScaledVector(pl.fwd, -rand(10, 30));
    flares.push({ pos: pl.pos.clone().addScaledVector(pl.fwd, -6), vel: v, life: rand(3.5, 4.5), alive: true });
  }
  const recent = flares.slice(-6);
  for (const m of missiles) {
    if (!m.alive || m.target !== pl || m.age < 0.3) continue;
    const chance = pl === player ? 0.85 : 0.3 + pl.skill * 0.45;
    if (Math.random() < chance) { m.target = recent[Math.floor(Math.random() * recent.length)]; m.decoyed = true; }
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

/* ---------- waves ---------- */
const CALLSIGNS = ['毒蛇', '红狼', '幽灵', '刀锋', '蝮蛇', '黑鹰', '雷霆', '赤焰', '寒鸦', '铁砧'];
function spawnEnemy(skill, i) {
  const e = new Plane('red', enemyProto.clone());
  scene.add(e.obj);
  player.axes();
  const h = new V3(player.fwd.x, 0, player.fwd.z).normalize();
  if (h.lengthSq() < 0.1) h.set(1, 0, 0);
  h.applyAxisAngle(Y_AXIS, rand(-1.0, 1.0));
  e.pos.copy(player.pos).addScaledVector(h, rand(4200, 5600));
  e.pos.y = clamp(player.pos.y + rand(-300, 700), 900, 3600);
  e.pos.y = Math.max(e.pos.y, terrainH(e.pos.x, e.pos.z) + 700);
  const f = new V3().subVectors(player.pos, e.pos).setY(0).normalize().applyAxisAngle(Y_AXIS, rand(-0.5, 0.5));
  setBasis(e.q, f, Y_AXIS);
  e.axes();
  e.speed = 250; e.skill = skill; e.turn = 0.52 + skill * 0.28; e.hp = 100;
  e.name = CALLSIGNS[(game.wave * 3 + i) % CALLSIGNS.length] + '-' + (i + 1);
  e.sync();
  enemies.push(e);
}
function startWave(n) {
  game.wave = n;
  const count = Math.min(1 + n, 7), skill = Math.min(0.2 + n * 0.13, 1);
  for (let i = 0; i < count; i++) spawnEnemy(skill, i);
  message(`第 ${n} 波`, `${count} 架红方假想敌接近`, '#e3b257', 3);
}

/* ---------- player ---------- */
const ctlS = { pitch: 0, roll: 0, yaw: 0 };
const _q = new Q();
function updatePlayer(dt, inp) {
  const p = player;
  p.axes();
  let { pitch, roll, yaw } = inp;
  if (Math.abs(roll) < 0.05) roll += clamp(p.right.y * 1.3, -0.5, 0.5) * smooth(-0.2, 0.3, p.up.y);
  game.stall = p.speed < 120;
  if (game.stall) pitch -= (120 - p.speed) / 70;
  const spdF = clamp((p.speed - 80) / 190, 0.3, 1);
  const pr = pitch * 0.88 * spdF, rr = roll * 2.7, yr = yaw * 0.35;
  p.q.multiply(_q.setFromAxisAngle(Z_AXIS, pr * dt));
  p.q.multiply(_q.setFromAxisAngle(X_AXIS, rr * dt));
  p.q.multiply(_q.setFromAxisAngle(Y_AXIS, -yr * dt));
  // keep the fight in the arena: gentle turn back when far out
  const hd = Math.hypot(p.pos.x, p.pos.z);
  game.out = hd > 9500;
  if (hd > 10500) {
    const toC = new V3(-p.pos.x, 0, -p.pos.z).normalize();
    const side = Math.sign(new V3().crossVectors(p.fwd, toC).y) || 1;
    p.q.premultiply(_q.setFromAxisAngle(Y_AXIS, side * 0.45 * dt));
  }
  if (p.pos.y > 7000) p.q.multiply(_q.setFromAxisAngle(Z_AXIS, -0.4 * dt));
  p.q.normalize();
  p.axes();
  p.boost = inp.boost && !inp.brake;
  const thrust = p.boost ? 112 : inp.brake ? 14 : 62;
  const drag = 6.9e-4 * p.speed * p.speed + Math.abs(pitch) * p.speed * 0.045 * spdF + (inp.brake ? p.speed * 0.12 : 0);
  p.speed = clamp(p.speed + (thrust - drag - 9.81 * p.fwd.y) * dt, 70, 560);
  p.g = 1 + Math.abs(pr) * p.speed / 9.81 * 0.36;
  p.integrate(dt);
  p.pos.y -= (1 - smooth(90, 150, p.speed)) * 22 * dt;
  p.sync();

  const k = 1 - Math.exp(-dt * 10);
  ctlS.pitch += (pitch - ctlS.pitch) * k; ctlS.roll += (roll - ctlS.roll) * k; ctlS.yaw += (yaw - ctlS.yaw) * k;
  playerJet.pose(ctlS);
  playerJet.setAB(p.boost ? 1 : inp.brake ? 0.05 : 0.2, game.t);

  // wingtip vortices under load
  if (p.g > 5.5 && Math.random() < 0.9) {
    for (const s of [1, -1]) {
      _a.set(-3.9, -0.38, 6.7 * s).applyQuaternion(p.q).add(p.pos);
      smoke.emit(_a.x, _a.y, _a.z, p.vel.x * 0.92, p.vel.y * 0.92, p.vel.z * 0.92, 0.7, 0.8, 3.2, 0.95, 0.96, 1, 0.35, 3);
    }
  }
  if (p.hp < 40) {
    _a.set(-8, 0.2, 0).applyQuaternion(p.q).add(p.pos);
    smoke.emit(_a.x, _a.y, _a.z, p.vel.x * 0.85, p.vel.y * 0.85, p.vel.z * 0.85, 2.2, 3, 12, 0.18, 0.18, 0.19, 0.6, 2);
  }

  // terrain / sea collision
  const gh = Math.max(terrainH(p.pos.x, p.pos.z), 0);
  game.agl = p.pos.y - gh;
  if (game.agl < 3) killPlayer(gh > 1 ? '撞山坠毁' : '坠海');
}

function updatePlayerWeapons(dt, inp) {
  const p = player;
  // lock-on: closest enemy to boresight within 26° and 4.2 km
  const L = game.lock;
  let bestE = null, bestA = 0.46;
  for (const e of enemies) {
    if (!e.alive || e.dying) continue;
    _a.subVectors(e.pos, p.pos);
    const d = _a.length();
    if (d > 4200) continue;
    const ang = p.fwd.angleTo(_a);
    if (e === L.target && ang < 0.5) { bestE = e; break; }
    if (ang < bestA) { bestA = ang; bestE = e; }
  }
  if (bestE !== L.target) { L.target = bestE; L.t = 0; }
  L.t = L.target ? L.t + dt : 0;
  const wasLocked = L.locked;
  L.locked = L.t > 0.9;
  if (L.locked && !wasLocked) Sound.beep(2000, 0.08, 0.06);
  Sound.lockTone(L.locked && game.missiles > 0);
  if (L.target && !L.locked) { game.lockBeep -= dt; if (game.lockBeep <= 0) { Sound.beep(1150, 0.04, 0.035); game.lockBeep = 0.2; } }

  // gun with mild aim assist toward the lead point of the target nearest the pipper
  game.gunTarget = null;
  let gunE = null, gunA = 0.11;
  for (const e of enemies) {
    if (!e.alive || e.dying) continue;
    const d = e.pos.distanceTo(p.pos);
    if (d > 1600) continue;
    const lead = _b.copy(e.pos).addScaledVector(e.vel, d / 1150).sub(p.pos);
    const ang = p.fwd.angleTo(lead);
    if (ang < gunA) { gunA = ang; gunE = e; }
  }
  if (gunE) {
    const d = gunE.pos.distanceTo(p.pos);
    game.gunTarget = gunE;
    game.leadPoint = (game.leadPoint || new V3()).copy(gunE.pos).addScaledVector(gunE.vel, d / 1150);
  }
  p.gunCd -= dt;
  if (inp.gun && game.ammo > 0 && p.gunCd <= 0) {
    p.gunCd = 1 / 26;
    game.ammo--;
    const dir = p.fwd.clone();
    if (gunE) dir.lerp(_b.copy(game.leadPoint).sub(p.pos).normalize(), 0.85).normalize();
    dir.x += rand(-0.004, 0.004); dir.y += rand(-0.004, 0.004); dir.z += rand(-0.004, 0.004);
    _a.set(2.6, 0.55, 1.25).applyQuaternion(p.q).add(p.pos);
    fireBullet(_a, dir.normalize(), p);
    fire.emit(_a.x, _a.y, _a.z, p.vel.x, p.vel.y, p.vel.z, 0.05, 2.2, 3.5, 1.5, 1.2, 0.7, 1);
    if (Math.random() < 0.5) Sound.gun();
    game.shake = Math.max(game.shake, 0.12);
  }
  // missiles from the main bay
  game.mslCd -= dt;
  if (input.msl) {
    input.msl = false;
    if (game.missiles > 0 && game.mslCd <= 0) {
      game.missiles--; game.mslCd = 0.55; game.bayT = 1.1;
      launchMissile(p, L.locked ? L.target : null);
      if (!L.locked) message('未锁定发射', '', '#9fb0ba', 1.2);
    }
  }
  game.bayT -= dt;
  game.bay += ((game.bayT > 0 ? 1 : 0) - game.bay) * (1 - Math.exp(-dt * 9));
  playerJet.setBay(game.bay, Math.min(6, game.missiles + 1));
  // flares
  game.flareCd -= dt;
  if (input.flare) {
    input.flare = false;
    if (game.flares > 0 && game.flareCd <= 0) { game.flares -= 3; game.flareCd = 0.8; dropFlares(p); }
  }
}

/* ---------- enemies ---------- */
const _desired = new V3(), _upF = new V3();
function steer(pl, desired, rate, dt) {
  const f = pl.fwd, ang = f.angleTo(desired);
  const side = desired.dot(pl.right), climb = desired.dot(pl.up);
  const nf = f.clone();
  if (ang > 1e-4) { _a.crossVectors(f, desired); if (_a.lengthSq() > 1e-10) nf.applyAxisAngle(_a.normalize(), Math.min(ang, rate * dt)); }
  const bank = clamp(side * 2.4, -1.3, 1.3);
  _upF.copy(Y_AXIS).addScaledVector(nf, -nf.y);
  if (_upF.lengthSq() < 1e-4) _upF.copy(pl.up);
  _upF.normalize().applyAxisAngle(nf, bank);
  const up = pl.up.clone().lerp(_upF, 1 - Math.exp(-dt * 3.2));
  setBasis(pl.q, nf.normalize(), up);
  pl.axes();
  pl.ctl.roll = lerp(pl.ctl.roll, clamp(bank, -1, 1), 0.1);
  pl.ctl.pitch = lerp(pl.ctl.pitch, clamp(climb * 3, -1, 1), 0.1);
  return ang;
}
function updateEnemy(e, dt) {
  if (e.dying) {
    e.dieT -= dt;
    e.vel.y -= 22 * dt;
    e.pos.addScaledVector(e.vel, dt);
    e.obj.position.copy(e.pos);
    e.obj.rotateX(e.spin.x * dt); e.obj.rotateZ(e.spin.z * dt);
    for (let i = 0; i < 2; i++) {
      fire.emit(e.pos.x + rand(-2, 2), e.pos.y + rand(-2, 2), e.pos.z + rand(-2, 2), e.vel.x * 0.2, e.vel.y * 0.2, e.vel.z * 0.2, rand(0.4, 0.8), 8, 18, 1.3, 0.7, 0.3, 0.9);
      smoke.emit(e.pos.x, e.pos.y, e.pos.z, e.vel.x * 0.1, 2, e.vel.z * 0.1, rand(3, 5), 10, 46, 0.12, 0.12, 0.13, 0.8, 0.3, -2);
    }
    if (e.dieT <= 0 || e.pos.y < Math.max(terrainH(e.pos.x, e.pos.z), 0)) {
      explode(e.pos, 1.4, null);
      e.alive = false; scene.remove(e.obj);
    }
    return;
  }
  e.axes();
  const toP = _b.subVectors(player.pos, e.pos), dist = toP.length();
  let threat = null;
  for (const m of missiles) if (m.alive && m.target === e && m.pos.distanceTo(e.pos) < 2000) { threat = m; break; }
  e.boost = false;
  if (threat) {
    _desired.copy(threat.dir).cross(Y_AXIS);
    if (_desired.dot(e.fwd) < 0) _desired.negate();
    _desired.normalize().addScaledVector(Y_AXIS, -0.15).addScaledVector(e.fwd, 0.3);
    e.boost = true;
    e.flareCd -= dt;
    if (e.flareCd <= 0 && threat.pos.distanceTo(e.pos) < 1300 && Math.random() < (0.3 + e.skill * 0.7) * dt * 4) { dropFlares(e); e.flareCd = rand(4, 7); }
  } else if (player.alive && game.mode === 'play') {
    const lead = clamp(dist / 1000, 0, 1.6);
    _desired.copy(player.pos).addScaledVector(player.vel, lead).sub(e.pos).normalize();
    if (dist < 160) _desired.copy(e.fwd).addScaledVector(e.up, 1.2).normalize();
    e.boost = dist > 2500;
  } else {
    _desired.copy(e.fwd).applyAxisAngle(Y_AXIS, 0.3);
  }
  // separation
  for (const o of enemies) {
    if (o === e || !o.alive || o.dying) continue;
    _a.subVectors(e.pos, o.pos);
    const d = _a.length();
    if (d < 250) _desired.addScaledVector(_a.normalize(), (250 - d) / 250);
  }
  // terrain, ceiling and arena bounds
  _a.copy(e.pos).addScaledVector(e.fwd, e.speed * 3);
  const gh = Math.max(terrainH(e.pos.x, e.pos.z), terrainH(_a.x, _a.z), 0);
  const clearance = e.pos.y - gh;
  if (clearance < 450) _desired.y += (450 - clearance) / 120;
  if (e.pos.y > 5500) _desired.y -= 0.6;
  const hd = Math.hypot(e.pos.x, e.pos.z);
  if (hd > 9500) _desired.add(_a.set(-e.pos.x, 0, -e.pos.z).normalize().multiplyScalar((hd - 9500) / 500));
  _desired.normalize();
  const ang = steer(e, _desired, e.turn * (clearance < 250 ? 1.6 : 1), dt);
  const target = (e.boost ? 340 : 255) + e.skill * 25;
  e.speed += (target - e.speed) * (1 - Math.exp(-dt * 0.6));
  e.integrate(dt);
  // engine glow and damage smoke
  _a.set(-9.9, -0.15, 0).applyQuaternion(e.q).add(e.pos);
  fire.emit(_a.x, _a.y, _a.z, e.vel.x * 0.9, e.vel.y * 0.9, e.vel.z * 0.9, 0.08, e.boost ? 5 : 3, 1.5, 1.4, 0.7, 0.3, 0.9);
  if (e.hp < 55) smoke.emit(_a.x, _a.y, _a.z, e.vel.x * 0.8, e.vel.y * 0.8, e.vel.z * 0.8, 2.2, 3, 14, 0.16, 0.16, 0.17, 0.7, 1.5);
  if (ang > 0.25 && Math.random() < 0.6) {
    for (const s of [1, -1]) { _c.set(-3.9, -0.38, 6.7 * s).applyQuaternion(e.q).add(e.pos); smoke.emit(_c.x, _c.y, _c.z, e.vel.x * 0.92, e.vel.y * 0.92, e.vel.z * 0.92, 0.6, 0.8, 3, 0.95, 0.96, 1, 0.3, 3); }
  }
  // weapons
  if (!threat && player.alive && game.mode === 'play') {
    const aim = _c.copy(player.pos).addScaledVector(player.vel, dist / 1000).sub(e.pos);
    const aimAng = e.fwd.angleTo(aim);
    e.gunCd -= dt;
    if (dist < 1100 && aimAng < 0.07 + (1 - e.skill) * 0.03) e.burst = Math.max(e.burst, 0.8);
    e.burst -= dt;
    if (e.burst > 0 && e.gunCd <= 0) {
      e.gunCd = 0.09;
      const err = 0.03 * (1.25 - e.skill);
      aim.normalize(); aim.x += rand(-err, err); aim.y += rand(-err, err); aim.z += rand(-err, err);
      _a.set(3, 0.5, 1.2).applyQuaternion(e.q).add(e.pos);
      fireBullet(_a, aim.normalize(), e, 1000);
      if (dist < 1500 && Math.random() < 0.3) Sound.burst(0.06, 1800, 700, 0.06 * (1 - dist / 1500), 'bandpass');
    }
    e.mslCd -= dt;
    if (game.wave >= 2 && e.mslCd <= 0 && dist > 700 && dist < 3800 && aimAng < 0.4) {
      launchMissile(e, player);
      e.mslCd = rand(11, 18) / (0.6 + e.skill * 0.6);
      message('敌方导弹发射', '投放干扰弹或急转规避', '#ff5a4f', 1.8);
    }
  }
}
function damageEnemy(e, dmg, byMissile) {
  if (!e.alive || e.dying) return;
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.dying = true; e.dieT = rand(2.2, 3.8);
    e.vel.copy(e.fwd).multiplyScalar(e.speed * 0.75);
    e.spin.set(rand(-3, 3), 0, rand(-1.2, 1.2));
    explode(e.pos, 0.8, e.vel);
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(debrisGeo, debrisMat);
      mesh.scale.setScalar(rand(0.6, 1.6));
      mesh.position.copy(e.pos);
      scene.add(mesh);
      debris.push({ mesh, vel: e.vel.clone().add(_d.randomDirection().multiplyScalar(rand(30, 80))), life: rand(2, 3.5), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)) });
    }
    game.kills++;
    game.comboT > 0 ? game.combo++ : (game.combo = 1);
    game.comboT = 7;
    const pts = (100 + game.wave * 25) * game.combo + (byMissile ? 0 : 60);
    game.score += pts;
    message(byMissile ? '导弹命中 · 击落' : '机炮击落', `${e.name}  +${pts}${game.combo > 1 ? `  连杀 ×${game.combo}` : ''}`, '#8dffb4', 2.4);
  }
}
const debrisGeo = new THREE.BoxGeometry(1.2, 0.3, 0.8);
const debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.8, metalness: 0.4 });

function damagePlayer(dmg, source) {
  if (!player.alive) return;
  player.hp -= dmg;
  game.flash = Math.min(1, (game.flash || 0) + dmg / 40);
  game.shake = Math.max(game.shake, dmg > 20 ? 1.6 : 0.5);
  Sound.hit();
  if (player.hp <= 0) killPlayer(source === 'missile' ? '被导弹击落' : '被机炮击落');
}
function killPlayer(cause) {
  if (!player.alive) return;
  player.alive = false; player.hp = 0;
  game.cause = cause; game.mode = 'dead'; game.deadT = 3.2;
  explode(player.pos, 1.6, player.vel);
  playerJet.group.visible = false;
  Sound.lockTone(false); Sound.engine(0, 0, false);
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMat);
    mesh.scale.setScalar(rand(0.8, 2));
    mesh.position.copy(player.pos);
    scene.add(mesh);
    debris.push({ mesh, vel: player.vel.clone().multiplyScalar(0.5).add(_d.randomDirection().multiplyScalar(rand(30, 90))), life: rand(2.5, 4), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)) });
  }
}

/* ---------- world update ---------- */
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
    if (b.owner.team === 'blue') {
      for (const e of enemies) {
        if (!e.alive || e.dying) continue;
        if (segDist(b.prev, b.pos, e.pos) < 10) {
          damageEnemy(e, 9, false); hit = true;
          for (let k = 0; k < 6; k++) { _d.randomDirection().multiplyScalar(40); fire.emit(b.pos.x, b.pos.y, b.pos.z, e.vel.x + _d.x, e.vel.y + _d.y, e.vel.z + _d.z, 0.25, 2.5, 1, 1.5, 1.2, 0.7, 1); }
          if (Math.random() < 0.4) Sound.beep(320, 0.03, 0.05);
          break;
        }
      }
    } else if (player.alive && segDist(b.prev, b.pos, player.pos) < 7.5) {
      damagePlayer(2.8, 'gun'); hit = true;
    }
    if (b.pos.y < 0) { smoke.emit(b.pos.x, 0, b.pos.z, 0, 14, 0, 1.2, 2, 9, 0.9, 0.93, 0.95, 0.6, 1, 9); hit = true; }
    if (hit || b.life <= 0) { bullets.splice(i, 1); continue; }
    const len = 16;
    _a.copy(b.vel).normalize();
    dummy.position.copy(b.pos).addScaledVector(_a, -len / 2);
    dummy.quaternion.setFromUnitVectors(X_AXIS, _a);
    dummy.scale.set(len, 0.32, 0.32);
    dummy.updateMatrix();
    tracerMesh.setMatrixAt(n, dummy.matrix);
    tracerMesh.setColorAt(n, b.owner.team === 'blue' ? COL_PLAYER_TRACER : COL_ENEMY_TRACER);
    n++;
  }
  tracerMesh.count = n;
  tracerMesh.instanceMatrix.needsUpdate = true;
  if (tracerMesh.instanceColor) tracerMesh.instanceColor.needsUpdate = true;
}
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.age += dt;
    const prev = m.prev.copy(m.pos);
    if (m.age < 0.32) {
      m.vel.y -= 9.81 * dt;
      m.pos.addScaledVector(m.vel, dt);
    } else {
      m.speed = m.age < 5.5 ? Math.min(m.speed + 430 * dt, m.owner.team === 'blue' ? 980 : 820) : Math.max(m.speed - 70 * dt, 250);
      const t = m.target;
      if (t && t.alive && !t.dying) {
        const d = t.pos.distanceTo(m.pos);
        const tgo = d / Math.max(m.speed, 300);
        _desired.copy(t.pos).addScaledVector(t.vel, tgo).sub(m.pos).normalize();
        if (m.dir.angleTo(_desired) > 1.3) m.target = null;
        else {
          const ang = m.dir.angleTo(_desired);
          _a.crossVectors(m.dir, _desired);
          if (ang > 1e-4 && _a.lengthSq() > 1e-10) m.dir.applyAxisAngle(_a.normalize(), Math.min(ang, m.turn * dt)).normalize();
        }
      }
      m.vel.copy(m.dir).multiplyScalar(m.speed);
      m.pos.addScaledVector(m.vel, dt);
      // exhaust and smoke trail
      for (let k = 0; k < 2; k++) {
        _a.lerpVectors(prev, m.pos, k / 2).addScaledVector(m.dir, -2);
        smoke.emit(_a.x, _a.y, _a.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(2.6, 3.6), 1.6, rand(7, 11), 0.86, 0.87, 0.88, 0.55, 0.4, -0.5);
      }
      _a.copy(m.pos).addScaledVector(m.dir, -2.1);
      fire.emit(_a.x, _a.y, _a.z, m.vel.x * 0.8, m.vel.y * 0.8, m.vel.z * 0.8, 0.06, 3.4, 1.2, 1.5, 1.2, 0.8, 1);
    }
    m.mesh.position.copy(m.pos);
    m.mesh.quaternion.setFromUnitVectors(X_AXIS, m.age < 0.32 ? m.vel.clone().normalize() : m.dir);
    // proximity fuse along the travelled segment
    let boom = false;
    const t = m.target;
    if (m.age > 0.6 && t && t.alive && !t.dying && segDist(prev, m.pos, t.pos) < m.fuse) {
      boom = true;
      if (t === player) damagePlayer(42, 'missile');
      else if (enemies.includes(t)) damageEnemy(t, 200, true);
    }
    if (!boom && m.age > 0.6) {
      for (const e of enemies) if (e.alive && !e.dying && e !== m.owner && m.owner.team === 'blue' && segDist(prev, m.pos, e.pos) < 14) { damageEnemy(e, 200, true); boom = true; break; }
    }
    if (m.age > 13 || m.pos.y < Math.max(terrainH(m.pos.x, m.pos.z), 0)) boom = true;
    if (boom) {
      explode(m.pos, 0.6, null);
      scene.remove(m.mesh); m.alive = false; missiles.splice(i, 1);
    }
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
    if (d.life <= 0 || p.y < 0) { scene.remove(d.mesh); debris.splice(i, 1); }
  }
}

/* ---------- camera ---------- */
const camTarget = new V3();
function updateCamera(dt, mode) {
  const p = player;
  if (mode === 'menu') {
    game.menuA += dt * 0.12;
    const r = 34;
    const off = new V3(Math.cos(game.menuA) * r, 6 + Math.sin(game.menuA * 0.7) * 3, Math.sin(game.menuA) * r).applyQuaternion(
      _q.setFromAxisAngle(Y_AXIS, Math.atan2(-p.fwd.z, p.fwd.x)));
    camera.position.copy(p.pos).add(off);
    camera.up.copy(Y_AXIS);
    camera.lookAt(camTarget.copy(p.pos).addScaledVector(p.fwd, 4));
    fov = 50;
  } else if (mode === 'dead') {
    game.menuA += dt * 0.25;
    camera.position.copy(p.pos).add(new V3(Math.cos(game.menuA) * 120, 50, Math.sin(game.menuA) * 120));
    camera.up.copy(Y_AXIS);
    camera.lookAt(p.pos);
  } else {
    camQ.slerp(p.q, 1 - Math.exp(-dt * 4.5));
    const back = _a.set(-1, 0, 0).applyQuaternion(camQ), up = _b.set(0, 1, 0).applyQuaternion(camQ), fw = _c.set(1, 0, 0).applyQuaternion(camQ);
    camDist += ((p.boost ? 31 : 25) - camDist) * (1 - Math.exp(-dt * 2));
    camera.position.copy(p.pos).addScaledVector(back, camDist).addScaledVector(up, 6.2);
    camera.up.copy(up);
    camera.lookAt(camTarget.copy(p.pos).addScaledVector(fw, 30).addScaledVector(up, 2.4));
    fov += ((p.boost ? 72 : 62) - fov) * (1 - Math.exp(-dt * 2));
  }
  const floor = Math.max(terrainH(camera.position.x, camera.position.z), 0) + 3;
  if (camera.position.y < floor) camera.position.y = floor;
  if (game.shake > 0.01 && !reduced) {
    const s = game.shake;
    camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
    game.shake *= Math.exp(-dt * 6);
  }
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // shadow frustum follows the player
  sunLight.target.position.copy(p.pos);
  sunLight.position.copy(p.pos).addScaledVector(SUN, 100);
}

/* ---------- HUD ---------- */
const hud = $('hud'), hc = hud.getContext('2d');
let HW = 0, HH = 0, HDPR = 1;
const HUDC = '#8dffb4', WARN = '#ff5a4f', GOLD = '#e3b257';
const _p = new V3();
function proj(v) {
  _p.copy(v).project(camera);
  return { x: (_p.x + 1) / 2 * HW, y: (1 - _p.y) / 2 * HH, behind: _p.z > 1, ndc: [_p.x, _p.y] };
}
function edgeArrow(v, color, label) {
  const pp = proj(v);
  let nx = pp.ndc[0], ny = pp.ndc[1];
  if (pp.behind) { nx = -nx; ny = -ny; }
  const ang = Math.atan2(-ny, nx);
  const cx = HW / 2, cy = HH / 2, rx = HW / 2 - 70, ry = HH / 2 - 70;
  const k = 1 / Math.max(Math.abs(Math.cos(ang)) / rx, Math.abs(Math.sin(ang)) / ry);
  const x = cx + Math.cos(ang) * k, y = cy + Math.sin(ang) * k;
  hc.save(); hc.translate(x, y); hc.rotate(ang);
  hc.fillStyle = color; hc.beginPath(); hc.moveTo(16, 0); hc.lineTo(-6, -10); hc.lineTo(-2, 0); hc.lineTo(-6, 10); hc.closePath(); hc.fill();
  hc.restore();
  if (label) { hc.fillStyle = color; hc.font = '600 11px "IBM Plex Mono", monospace'; hc.textAlign = 'center'; hc.fillText(label, x - Math.cos(ang) * 26, y - Math.sin(ang) * 26 + 4); }
}
function drawHUD(dt) {
  hc.setTransform(HDPR, 0, 0, HDPR, 0, 0);
  hc.clearRect(0, 0, HW, HH);
  if (game.mode !== 'play' && game.mode !== 'paused') return;
  const p = player, mono = '"IBM Plex Mono", ui-monospace, monospace', sans = '"Noto Sans SC", "PingFang SC", sans-serif';
  hc.lineWidth = 1.5;
  hc.strokeStyle = HUDC; hc.fillStyle = HUDC;
  if (HQ()) { hc.shadowColor = 'rgba(141,255,180,0.6)'; hc.shadowBlur = 4; }
  const compact = HH < 480;
  const cx = HW / 2, cy = HH / 2;

  // boresight cross
  const bs = proj(_a.copy(p.pos).addScaledVector(p.fwd, 700));
  if (!bs.behind) {
    hc.beginPath(); hc.arc(bs.x, bs.y, 15, 0, Math.PI * 2); hc.stroke();
    hc.beginPath();
    hc.moveTo(bs.x - 26, bs.y); hc.lineTo(bs.x - 17, bs.y); hc.moveTo(bs.x + 17, bs.y); hc.lineTo(bs.x + 26, bs.y);
    hc.moveTo(bs.x, bs.y - 26); hc.lineTo(bs.x, bs.y - 17);
    hc.stroke();
    hc.fillRect(bs.x - 1.5, bs.y - 1.5, 3, 3);
  }
  // gun lead pipper
  if (game.gunTarget && game.leadPoint) {
    const lp = proj(game.leadPoint);
    if (!lp.behind) {
      hc.save(); hc.strokeStyle = GOLD; hc.beginPath();
      hc.moveTo(lp.x, lp.y - 9); hc.lineTo(lp.x + 9, lp.y); hc.lineTo(lp.x, lp.y + 9); hc.lineTo(lp.x - 9, lp.y); hc.closePath(); hc.stroke();
      hc.restore();
    }
  }

  // targets
  const L = game.lock;
  let nearest = null, nd = 1e9;
  for (const e of enemies) {
    if (!e.alive || e.dying) continue;
    const d = e.pos.distanceTo(p.pos);
    if (d < nd) { nd = d; nearest = e; }
    const pp = proj(e.pos);
    const on = !pp.behind && pp.x > 0 && pp.x < HW && pp.y > 0 && pp.y < HH;
    if (!on) continue;
    const isT = e === L.target, locked = isT && L.locked;
    const s = clamp(5200 / d, 11, 34);
    hc.save();
    hc.strokeStyle = locked ? WARN : isT ? HUDC : 'rgba(255,120,100,0.9)';
    hc.fillStyle = hc.strokeStyle;
    if (locked) {
      hc.lineWidth = 2;
      hc.strokeRect(pp.x - s, pp.y - s, s * 2, s * 2);
      hc.font = `700 12px ${sans}`; hc.textAlign = 'center';
      hc.fillText(game.missiles > 0 ? '锁定' : '无导弹', pp.x, pp.y - s - 7);
    } else {
      const c = s * 0.7;
      hc.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        hc.moveTo(pp.x + sx * s, pp.y + sy * (s - c)); hc.lineTo(pp.x + sx * s, pp.y + sy * s); hc.lineTo(pp.x + sx * (s - c), pp.y + sy * s);
      }
      hc.stroke();
      if (isT) {
        const r = lerp(70, s * 1.3, clamp(L.t / 0.9, 0, 1));
        hc.save(); hc.translate(pp.x, pp.y); hc.rotate(game.t * 3);
        hc.strokeRect(-r / 1.414, -r / 1.414, r * 1.414, r * 1.414);
        hc.restore();
      }
    }
    hc.font = `600 11px ${mono}`; hc.textAlign = 'left';
    hc.fillText((d / 1000).toFixed(1), pp.x + s + 5, pp.y + s);
    if (e.hp < 100) { hc.fillRect(pp.x - s, pp.y + s + 5, (s * 2) * Math.max(e.hp, 0) / 100, 2.5); }
    hc.restore();
  }
  const offT = L.target || nearest;
  if (offT) {
    const pp = proj(offT.pos);
    if (pp.behind || pp.x < 0 || pp.x > HW || pp.y < 0 || pp.y > HH) edgeArrow(offT.pos, 'rgba(255,120,100,0.95)', (offT.pos.distanceTo(p.pos) / 1000).toFixed(1));
  }

  // incoming missiles
  const threat = game.threat, td = threat ? threat.pos.distanceTo(p.pos) : 0;
  if (threat) {
    const blink = Math.floor(game.t * 6) % 2 === 0;
    edgeArrow(threat.pos, WARN, (td / 1000).toFixed(1));
    if (blink) {
      hc.save(); hc.fillStyle = WARN; hc.font = `800 ${compact ? 20 : 26}px ${sans}`; hc.textAlign = 'center';
      hc.fillText('导弹来袭', cx, HH * 0.3); hc.restore();
    }
    game.warnBeep -= dt;
    if (game.warnBeep <= 0) { Sound.beep(td < 1200 ? 1300 : 950, 0.06, 0.06); game.warnBeep = td < 1200 ? 0.1 : 0.22; }
  }

  // speed and altitude boxes
  const boxY = cy - 14, gap = Math.min(HW * 0.3, 260);
  const kmh = Math.round(p.speed * 3.6), alt = Math.round(p.pos.y);
  hc.font = `600 ${compact ? 16 : 18}px ${mono}`;
  hc.textAlign = 'right'; hc.strokeRect(cx - gap - 84, boxY, 84, 28); hc.fillText(String(kmh), cx - gap - 8, boxY + 20);
  hc.textAlign = 'left'; hc.strokeRect(cx + gap, boxY, 84, 28); hc.fillText(String(alt), cx + gap + 8, boxY + 20);
  hc.font = `500 10px ${mono}`;
  hc.textAlign = 'right'; hc.fillText('KM/H', cx - gap, boxY - 6);
  hc.fillText(`M ${(p.speed / 340).toFixed(2)}`, cx - gap, boxY + 44);
  hc.fillText(`G ${p.g.toFixed(1)}`, cx - gap, boxY + 58);
  hc.textAlign = 'left'; hc.fillText('ALT M', cx + gap, boxY - 6);
  hc.fillText(`AGL ${Math.max(0, Math.round(game.agl || 0))}`, cx + gap, boxY + 44);
  if (p.boost) { hc.textAlign = 'right'; hc.fillStyle = GOLD; hc.font = `700 11px ${sans}`; hc.fillText('加力', cx - gap - 88, boxY + 19); hc.fillStyle = HUDC; }

  // heading tape
  const hdg = ((Math.atan2(p.fwd.x, -p.fwd.z) * 180 / Math.PI) + 360) % 360;
  const tapeY = compact ? 26 : 34, ppd = 4;
  hc.save();
  hc.beginPath(); hc.rect(cx - 150, tapeY - 18, 300, 40); hc.clip();
  hc.font = `500 11px ${mono}`; hc.textAlign = 'center';
  for (let d = Math.floor((hdg - 40) / 5) * 5; d <= hdg + 40; d += 5) {
    const x = cx + (d - hdg) * ppd, dd = ((d % 360) + 360) % 360;
    hc.beginPath(); hc.moveTo(x, tapeY); hc.lineTo(x, tapeY + (dd % 10 === 0 ? 8 : 4)); hc.stroke();
    if (dd % 30 === 0) hc.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] || String(dd / 10).padStart(2, '0'), x, tapeY - 4);
  }
  hc.restore();
  hc.beginPath(); hc.moveTo(cx, tapeY + 11); hc.lineTo(cx - 5, tapeY + 18); hc.lineTo(cx + 5, tapeY + 18); hc.closePath(); hc.fill();

  // status block, top left
  const sx = 16, sy = compact ? 18 : 22;
  hc.textAlign = 'left';
  hc.font = `700 ${compact ? 15 : 17}px ${mono}`;
  hc.fillText(String(game.score).padStart(6, '0'), sx, sy + 6);
  hc.font = `500 11px ${sans}`;
  const alive = enemies.filter(e => e.alive && !e.dying).length;
  hc.fillText(`第 ${game.wave} 波 · 剩余 ${alive} 架`, sx, sy + 24);
  const barY = sy + 34;
  hc.strokeRect(sx, barY, 120, 7);
  hc.save();
  hc.fillStyle = p.hp > 40 ? HUDC : WARN;
  hc.fillRect(sx + 1.5, barY + 1.5, 117 * Math.max(p.hp, 0) / 100, 4);
  hc.restore();
  hc.font = `500 10px ${mono}`;
  hc.fillText(`机体 ${Math.max(0, Math.round(p.hp))}%`, sx + 128, barY + 7);
  hc.fillText(`机炮 ${game.ammo}   导弹 ${game.missiles}   干扰 ${game.flares}`, sx, barY + 22);

  // radar, top right
  const R = compact ? 46 : 58, rx = HW - R - 16, ry = R + (compact ? 14 : 18), range = 6000;
  hc.save();
  hc.fillStyle = 'rgba(6,14,12,0.45)'; hc.beginPath(); hc.arc(rx, ry, R, 0, Math.PI * 2); hc.fill(); hc.stroke();
  hc.globalAlpha = 0.35; hc.beginPath(); hc.arc(rx, ry, R / 2, 0, Math.PI * 2); hc.stroke(); hc.globalAlpha = 1;
  const fx = p.fwd.x, fz = p.fwd.z, fl = Math.hypot(fx, fz) || 1, hx = fx / fl, hz = fz / fl;
  const dot = (wx, wz, col, r) => {
    const dx = wx - p.pos.x, dz = wz - p.pos.z;
    let f = (dx * hx + dz * hz) / range, s = (dx * -hz + dz * hx) / range;
    const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
    hc.fillStyle = col; hc.beginPath(); hc.arc(rx + s * R, ry - f * R, r, 0, Math.PI * 2); hc.fill();
  };
  for (const e of enemies) if (e.alive && !e.dying) dot(e.pos.x, e.pos.z, e === L.target ? WARN : '#ff8a78', 3);
  for (const m of missiles) if (m.alive) dot(m.pos.x, m.pos.z, m.target === p ? WARN : '#ffffff', 1.6);
  hc.fillStyle = HUDC; hc.beginPath(); hc.moveTo(rx, ry - 6); hc.lineTo(rx - 4, ry + 4); hc.lineTo(rx + 4, ry + 4); hc.closePath(); hc.fill();
  hc.restore();

  // warnings
  const warns = [];
  if ((game.agl || 1e9) < 350 && p.fwd.y < -0.05) warns.push('拉起');
  if (game.stall) warns.push('失速');
  if (game.out) warns.push('返回作战空域');
  if (game.ammo === 0 && game.missiles === 0) warns.push('弹药耗尽');
  if (warns.length && Math.floor(game.t * 4) % 2 === 0) {
    hc.save(); hc.fillStyle = WARN; hc.font = `800 ${compact ? 17 : 21}px ${sans}`; hc.textAlign = 'center';
    warns.forEach((w, i) => hc.fillText(w, cx, HH * 0.66 + i * 26));
    hc.restore();
  }

  // messages
  let my = HH * (compact ? 0.2 : 0.22);
  hc.textAlign = 'center';
  for (const m of game.msgs) {
    const a = clamp(m.t / 0.4, 0, 1) * clamp((m.dur - m.t) / 0.15 + 0.2, 0, 1);
    hc.globalAlpha = a; hc.fillStyle = m.color;
    hc.font = `800 ${compact ? 18 : 22}px ${sans}`; hc.fillText(m.text, cx, my);
    if (m.sub) { hc.font = `500 12px ${mono}`; hc.fillText(m.sub, cx, my + 18); }
    my += m.sub ? 44 : 30;
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
}
function resetPlayer() {
  player.pos.set(7600, 1500, -1800);
  setBasis(player.q, new V3(-1, 0, 0.18).normalize(), Y_AXIS);
  player.speed = 260; player.hp = 100; player.alive = true; player.dying = false;
  player.axes(); player.integrate(0);
  playerJet.group.visible = true;
  camQ.copy(player.q);
}
function clearWorld() {
  for (const e of enemies) scene.remove(e.obj);
  for (const m of missiles) scene.remove(m.mesh);
  for (const d of debris) scene.remove(d.mesh);
  enemies = []; missiles.length = 0; bullets.length = 0; flares.length = 0; debris.length = 0;
  fire.clear(); smoke.clear(); tracerMesh.count = 0;
}
function startGame() {
  Sound.init();
  clearWorld();
  resetPlayer();
  Object.assign(game, { mode: 'play', score: 0, kills: 0, wave: 0, ammo: 600, missiles: 6, flares: 30, waveClear: 1.6, msgs: [],
    combo: 0, comboT: 0, bayT: 0, bay: 0, mslCd: 0, flareCd: 0, flash: 0, shake: 0 });
  game.lock = { target: null, t: 0, locked: false };
  message('交战规则：自由开火', '向西进入群岛空域', '#e3b257', 2.6);
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
  player.pos.set(-1500, 1900, 2600);
  game.mode = 'menu';
  Sound.engine(0, 0, false); Sound.lockTone(false);
  $('best').textContent = best;
  show('menu');
}
function togglePause() {
  if (game.mode === 'play') { game.mode = 'paused'; show('pause'); Sound.engine(0, 0, false); Sound.lockTone(false); Sound.ctx?.suspend?.(); }
  else if (game.mode === 'paused') { game.mode = 'play'; show(null); Sound.ctx?.resume?.(); }
}
function gameOver() {
  game.mode = 'over';
  if (game.score > best) { best = game.score; store.set('best', best); }
  $('over-title').textContent = game.cause || '被击落';
  $('over-tag').textContent = game.score >= best && game.score > 0 ? '新纪录' : '任务结束';
  $('o-score').textContent = game.score; $('o-kills').textContent = game.kills; $('o-wave').textContent = game.wave; $('o-best').textContent = best;
  show('over');
}
let toastTimer = 0;
function toast(text, ms) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }

$('b-start').onclick = startGame;
$('b-again').onclick = startGame;
$('b-restart').onclick = () => { Sound.ctx?.resume?.(); startGame(); };
$('b-resume').onclick = togglePause;
$('b-quit').onclick = () => { Sound.ctx?.resume?.(); toMenu(); };
$('b-home').onclick = toMenu;
$('b-pause').onclick = togglePause;
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'play') togglePause(); });

function renderSettings() {
  $('s-invert').querySelector('b').textContent = settings.invert ? '上推俯冲' : '上推爬升';
  $('s-quality').querySelector('b').textContent = HQ() ? '高' : '流畅';
  $('s-sound').querySelector('b').textContent = settings.sound ? '开' : '关';
}
$('s-invert').onclick = () => { settings.invert = !settings.invert; store.set('invert', settings.invert); renderSettings(); };
$('s-sound').onclick = () => { settings.sound = !settings.sound; store.set('sound', settings.sound); Sound.setVolume(settings.sound); renderSettings(); };
$('s-quality').onclick = () => { settings.quality = HQ() ? 'low' : 'high'; store.set('quality', settings.quality); applyQuality(); renderSettings(); };
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
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game.mode === 'paused') { renderer.render(scene, camera); return; }
  update(dt);
  renderer.render(scene, camera);
  drawHUD(dt);
}
function update(dt) {
  game.t += dt;
  waterMat.uniforms.uTime.value = game.t;

  if (game.mode === 'menu') {
    // autopilot: lazy banking circle over the islands
    player.axes();
    const bank = 0.35 + Math.sin(game.t * 0.2) * 0.15;
    const desired = player.fwd.clone().applyAxisAngle(Y_AXIS, 0.08 * dt * 10).setY((1900 - player.pos.y) / 4000).normalize();
    steer(player, desired, 0.12, dt);
    setBasis(player.q, player.fwd, player.up.clone().lerp(new V3(0, 1, 0).applyAxisAngle(player.fwd, bank), 0.05));
    player.axes();
    player.speed = 230;
    player.integrate(dt);
    playerJet.pose({ pitch: 0.05, roll: Math.sin(game.t * 0.4) * 0.15, yaw: 0 });
    playerJet.setAB(0.2, game.t);
    playerJet.setBay(0);
  } else if (game.mode === 'play') {
    const inp = readInput();
    updatePlayer(dt, inp);
    if (player.alive) updatePlayerWeapons(dt, inp);
    Sound.engine(inp.brake ? 0.2 : 0.65, player.boost ? 1 : 0, player.alive);
    // waves
    if (game.waveClear > 0) {
      game.waveClear -= dt;
      if (game.waveClear <= 0) startWave(game.wave + 1);
    } else if (enemies.length && enemies.every(e => !e.alive || e.dying)) {
      const bonus = 300 * game.wave;
      game.score += bonus;
      player.hp = Math.min(100, player.hp + 30);
      game.ammo = 600; game.missiles = 6; game.flares = 30;
      message('空域清空', `奖励 +${bonus} · 补给完成 · 机体修复`, '#e3b257', 3);
      game.waveClear = 4.5;
    }
    game.comboT -= dt;
    game.threat = null;
    let td = 1e9;
    for (const m of missiles) if (m.alive && m.target === player) { const d = m.pos.distanceTo(player.pos); if (d < td) { td = d; game.threat = m; } }
  } else if (game.mode === 'dead') {
    game.deadT -= dt;
    if (game.deadT <= 0) gameOver();
  }
  if (game.mode === 'play' || game.mode === 'dead' || game.mode === 'over') {
    for (const e of enemies) if (e.alive) updateEnemy(e, dt);
    enemies = enemies.filter(e => e.alive);
    updateBullets(dt); updateMissiles(dt); updateFlares(dt); updateDebris(dt);
  }
  for (const m of game.msgs) m.t -= dt;
  game.msgs = game.msgs.filter(m => m.t > 0);
  game.flash = Math.max(0, (game.flash || 0) - dt * 1.4);
  $('flash').style.opacity = game.flash.toFixed(3);
  $('msl-n').textContent = game.missiles; $('flr-n').textContent = game.flares;

  fire.update(dt); smoke.update(dt);
  updateCamera(dt, game.mode === 'menu' ? 'menu' : (game.mode === 'dead' || game.mode === 'over') ? 'dead' : 'play');
}

/* ---------- boot ---------- */
buildTerrain();
buildClouds();
renderSettings();
applyQuality();
toMenu();
camera.position.set(player.pos.x + 30, player.pos.y + 6, player.pos.z);
clock.getDelta();
frame();
window.__raptorReady = true;
$('loading').hidden = true;
window.__raptor = { game, player, enemies: () => enemies, missiles, startGame, input, update, steer, setBasis };
