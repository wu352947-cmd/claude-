import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*@MODEL@*/
/*@RAPTORHD@*/

const D2R = Math.PI / 180;
const GROUND = F22.GROUND;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const studioEnv = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environment = studioEnv;

/* "云端": open sky above a sea of cloud, lit and reflected by the sky itself */
const SUN = new THREE.Vector3().setFromSphericalCoords(1, (90 - 40) * Math.PI / 180, 35 * Math.PI / 180);
const sky = new Sky();
sky.scale.setScalar(5000);
Object.assign(sky.material.uniforms.turbidity, { value: 3 });
sky.material.uniforms.rayleigh.value = 1.2;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy(SUN);
const skyEnv = (() => { const s2 = new THREE.Scene(), k = new Sky(); k.scale.setScalar(100); for (const n in sky.material.uniforms) k.material.uniforms[n].value = sky.material.uniforms[n].value; s2.add(k);
  s2.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdfe6ee, side: THREE.BackSide })));
  return pmrem.fromScene(s2, 0.02).texture; })();
const cloudSea = new THREE.Group();
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 28, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.7, r = 18 + Math.random() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, depthWrite: false, fog: true });
  for (let i = 0; i < 420; i++) {
    const r = Math.sqrt(Math.random()) * 900, a = Math.random() * Math.PI * 2, sp = new THREE.Sprite(mat);
    const sc = 50 + Math.random() * 110;
    sp.scale.set(sc, sc * 0.55, 1);
    sp.position.set(Math.cos(a) * r, -70 - Math.random() * 30 + (r > 500 ? 10 : 0), Math.sin(a) * r);
    cloudSea.add(sp);
  }
  cloudSea.visible = false;
}
scene.add(cloudSea);

const camera = new THREE.PerspectiveCamera(34, stage.clientWidth / stage.clientHeight, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 5;
controls.maxDistance = 80;
controls.maxPolarAngle = 100 * D2R;
controls.autoRotateSpeed = 0.55;

scene.add(new THREE.HemisphereLight(0xdde7f2, 0x2b2722, 0.45));
const sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
sun.position.set(9, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9db4ff, 1.1);
rim.position.set(-14, 6, -10);
scene.add(rim);

const jet = F22.build({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
// both models live in one holder; the high-detail mesh is shown by default once it has loaded
const holder = new THREE.Group();
holder.position.x = 0.3;
holder.add(jet.group);
scene.add(holder);
let hd = null;
const models = () => hd ? [jet, hd] : [jet];

const abLight = new THREE.PointLight(0xff8a3c, 0, 14, 2);
abLight.position.set(-10.6, -0.15, 0);
holder.add(abLight);

/* ground, taxi line, scale figure */
const shadowMat = new THREE.ShadowMaterial({ opacity: 0.38 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), shadowMat);
ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; ground.receiveShadow = true;
scene.add(ground);
const lineTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,1)');
  gr.addColorStop(0.7, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
  return new THREE.CanvasTexture(c);
})();
const taxiMat = new THREE.MeshBasicMaterial({ color: 0xc9a23a, alphaMap: lineTex, transparent: true, opacity: 0.55, depthWrite: false });
const taxi = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.16), taxiMat);
taxi.rotation.x = -Math.PI / 2; taxi.position.set(0, GROUND + 0.005, 0);
scene.add(taxi);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x8f9ba2, transparent: true, opacity: 0.12, depthWrite: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(11.9, 12, 128), ringMat);
ring.rotation.x = -Math.PI / 2; ring.position.y = GROUND + 0.004;
scene.add(ring);

const man = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: 0xd8a84e, roughness: 0.7 });
  const part = (geo, x, y, z) => { const p = new THREE.Mesh(geo, m); p.position.set(x, y, z); p.castShadow = true; man.add(p); };
  part(new THREE.CapsuleGeometry(0.075, 0.72, 4, 10), 0, 0.43, 0.11);
  part(new THREE.CapsuleGeometry(0.075, 0.72, 4, 10), 0, 0.43, -0.11);
  part(new THREE.CapsuleGeometry(0.17, 0.42, 4, 12), 0, 1.15, 0);
  part(new THREE.CapsuleGeometry(0.055, 0.56, 4, 8), 0, 1.12, 0.26);
  part(new THREE.CapsuleGeometry(0.055, 0.56, 4, 8), 0, 1.12, -0.26);
  part(new THREE.SphereGeometry(0.115, 20, 14), 0, 1.685, 0);
}
man.position.set(8.4, GROUND, 3.2);
man.rotation.y = -0.6;
man.visible = false;
scene.add(man);

/* state & controls */
const state = { sky: false, gear: true, bay: false, canopy: false, brake: false, ab: false, fly: false, spin: !reduced, wire: false, man: false };
const anim = { gear: 0, bay: 0, canopy: 0, brake: 0, ab: 0, fly: 0 };
const $ = id => document.getElementById(id);
const press = (id, on) => $(id).setAttribute('aria-pressed', String(on));
press('t-spin', state.spin);
controls.autoRotate = state.spin;

$('t-gear').onclick = () => { state.gear = !state.gear; press('t-gear', state.gear); };
$('t-bay').onclick = () => { state.bay = !state.bay; press('t-bay', state.bay); };
$('t-canopy').onclick = () => { state.canopy = !state.canopy; press('t-canopy', state.canopy); };
$('t-brake').onclick = () => { state.brake = !state.brake; press('t-brake', state.brake); };
$('t-ab').onclick = () => { state.ab = !state.ab; press('t-ab', state.ab); };
$('t-fly').onclick = () => {
  state.fly = !state.fly; press('t-fly', state.fly);
  state.gear = !state.fly; press('t-gear', state.gear);
  if (state.fly && state.man) { state.man = false; press('t-man', false); man.visible = false; }
};
$('t-sky').onclick = () => {
  state.sky = !state.sky; press('t-sky', state.sky);
  if (state.sky && !state.fly) $('t-fly').onclick();
  applySky();
};
function applySky() {
  const on = state.sky;
  if (on) { scene.add(sky); scene.fog = new THREE.Fog(0xdfe6ee, 400, 1100); } else { scene.remove(sky); scene.fog = null; }
  cloudSea.visible = on;
  scene.environment = on ? skyEnv : studioEnv;
  renderer.toneMappingExposure = on ? 0.62 : 0.92;
  sun.position.copy(on ? SUN.clone().multiplyScalar(30) : new THREE.Vector3(9, 22, 12));
  sun.intensity = on ? 3.2 : 1.9;
  rim.intensity = on ? 0.4 : 1.1;
  ground.visible = taxi.visible = ring.visible = !on;
  controls.maxPolarAngle = on ? Math.PI : 100 * D2R;
  camera.far = on ? 2500 : 400;
  camera.updateProjectionMatrix();
}
state.hd = true;
function applyHD() {
  const on = state.hd && !!hd;
  jet.group.visible = !on;
  if (hd) hd.group.visible = on;
  press('t-hd', on);
  // the high-detail mesh has a working canopy and gear, but its bays and control surfaces are fixed
  for (const id of ['t-bay', 't-brake']) { $(id).disabled = on; $(id).title = on ? '切换到可动结构模型后可用' : ''; }
}
$('t-hd').onclick = () => { state.hd = !state.hd; applyHD(); };
RaptorHD.build('assets/hi/raptor.gltf', { anisotropy: renderer.capabilities.getMaxAnisotropy() }).then(m => {
  hd = m; holder.add(m.group); applyHD();
  if (state.wire) m.wireMats.forEach(x => { x.wireframe = true; });
}).catch(() => { $('t-hd').disabled = true; $('t-hd').textContent = '高精度模型加载失败'; state.hd = false; applyHD(); });
applyHD();
$('t-spin').onclick = () => { state.spin = !state.spin; press('t-spin', state.spin); controls.autoRotate = state.spin; };
$('t-wire').onclick = () => { state.wire = !state.wire; press('t-wire', state.wire); models().forEach(mo => mo.wireMats.forEach(m => { m.wireframe = state.wire; })); };
$('t-man').onclick = () => { state.man = !state.man; press('t-man', state.man); man.visible = state.man; };

const VIEWS = { three: [15, 5.5, 17], front: [30, 1.4, 0.02], side: [0.02, 1.2, 30], top: [0.02, 32, 0.4], rear: [-21, 6.5, -14] };
let tween = null;
const distScale = () => clamp(1.25 / (camera.aspect || 1), 1, 2.3);
function goView(name) {
  const tgt = controls.target;
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(tgt));
  const to = new THREE.Spherical().setFromVector3(new THREE.Vector3(...VIEWS[name]).multiplyScalar(distScale()));
  let dt = to.theta - from.theta;
  dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  to.theta = from.theta + dt;
  tween = { from, to, t0: performance.now(), dur: reduced ? 1 : 1100 };
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  if (state.spin) { state.spin = false; press('t-spin', false); controls.autoRotate = false; }
  goView(b.dataset.view);
}));

const specs = $('specs');
function layout() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const shift = w > 760 && specs.open ? Math.round(specs.offsetWidth / 2) : 0;
  if (shift) camera.setViewOffset(w, h, shift, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', layout);
specs.addEventListener('toggle', layout);
layout();
camera.position.set(...VIEWS.three).multiplyScalar(distScale());

/* loop */
const clock = new THREE.Clock();
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const sph = new THREE.Spherical();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const k = rate => 1 - Math.exp(-dt * rate);
  anim.gear += ((state.gear ? 0 : 1) - anim.gear) * k(reduced ? 60 : 2.6);
  anim.bay += ((state.bay ? 1 : 0) - anim.bay) * k(reduced ? 60 : 2.4);
  anim.ab += ((state.ab ? 1 : 0) - anim.ab) * k(5);
  anim.canopy += ((state.canopy ? 1 : 0) - anim.canopy) * k(reduced ? 60 : 1.8);
  anim.brake += ((state.brake ? 1 : 0) - anim.brake) * k(reduced ? 60 : 4);
  anim.fly += ((state.fly ? 1 : 0) - anim.fly) * k(reduced ? 60 : 1.6);

  for (const m of models()) { m.setGear(anim.gear); m.setBay(anim.bay); m.setSideBay(anim.bay); m.setCanopy(anim.canopy); m.setAB(anim.ab, t); }
  abLight.intensity = anim.ab * 60 * (0.9 + 0.1 * Math.sin(t * 40));

  const f = anim.fly, mo = reduced ? 0 : 1;
  const roll = Math.sin(t * 0.45) * 0.32 * f * mo, pitch = Math.sin(t * 0.7) * 0.05 * f * mo;
  holder.rotation.set(roll, 0, pitch);
  holder.position.y = f * (1.6 + Math.sin(t * 0.9) * 0.18 * mo);
  // control surfaces lead the motion they produce
  for (const m of models()) m.pose({ pitch: Math.cos(t * 0.7) * 0.6 * f * mo, roll: Math.cos(t * 0.45) * 0.7 * f * mo,
    yaw: Math.sin(t * 0.33) * 0.3 * f * mo, flap: (1 - f) * 0.4, lef: (1 - anim.gear) * 0.6, brake: anim.brake });
  shadowMat.opacity = 0.38 * (1 - f * 0.75);
  taxiMat.opacity = 0.55 * (1 - f);
  ringMat.opacity = 0.12 * (1 - f);

  if (tween) {
    const p = clamp((performance.now() - tween.t0) / tween.dur, 0, 1), e = ease(p);
    sph.set(lerp(tween.from.radius, tween.to.radius, e), lerp(tween.from.phi, tween.to.phi, e), lerp(tween.from.theta, tween.to.theta, e));
    camera.position.setFromSpherical(sph).add(controls.target);
    if (p >= 1) tween = null;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__f22ready = true;
$('loading').hidden = true;
