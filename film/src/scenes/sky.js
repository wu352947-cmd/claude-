// Act VII 天 SKY (153.5 – 176.5)
// K1 grey ash reverses and rises → launch exhaust billows → umbilical tower + three-stage rocket →
//    liftoff at HITS.liftoff (slow motion) → camera tilts up through deepening blue to black.
// K2 (in-shot morph through the black) tilt down to a grey lunar horizon; Earth rises; drift toward
//    its night side, ending exactly on the opening pose of Act VIII (shared n1Pose).
import * as THREE from 'three';
import { HITS } from '../cues.js';
import { createEarth, createStars, n1Pose, aimCamera, bake, R, SUN } from './sky_earth.js';
import { createPuffs } from './sky_puffs.js';
import { rng, smoothstep, clamp, lerp, track, ease, noise3, fbm3 } from '../engine/util.js';

const T0 = 153.5;
const L_LIFT = HITS.liftoff - T0;      // 3.5
const L_SWITCH = 164.0 - T0;           // 10.5  K1 → K2 (through black)

// ------------------------------------------------------------------ shared lit shader (steel, rocket, pad)
const LIT_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main(){
  vec4 p=vec4(position,1.); vec3 n=normal;
  #ifdef USE_INSTANCING
  p=instanceMatrix*p; n=mat3(instanceMatrix)*n;
  #endif
  vL=position;
  vec4 w=modelMatrix*p; vW=w.xyz; vN=normalize(mat3(modelMatrix)*n);
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const LIT_FRAG = /* glsl */`
precision highp float;
uniform vec3 uAlb, uSrcPos, uSrcCol, uSky, uGnd, uKeyDir, uKeyCol, uFogCol, uCam;
uniform float uSrcRange, uFogDens, uPattern, uSpec;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
vec3 rocket(vec3 p){
  float y=p.y, th=atan(p.z,p.x);
  float q=mod(floor((th+3.14159265)/1.5707963+.5),2.);
  vec3 W=vec3(.86,.86,.84), K=vec3(.035,.035,.04);
  vec3 c=W;
  if(y<8.) c= q<.5?K:W;
  else if(y>19.&&y<24.5) c= q>.5?K:W;
  else if(y>38.&&y<42.) c= q<.5?K:W;
  else if(y>42.&&y<47.) c= q>.5?K*1.5:W*.92;
  else if(y>80.&&y<85.) c= q<.5?K:W;
  else if(y>98.&&y<99.5) c=vec3(.55);
  else if(y>99.5&&y<108.) c=vec3(.78,.78,.76);
  else if(y>108.&&y<115.6) c=vec3(.62,.63,.65);
  else if(y>115.6) c=vec3(.75,.2,.1);
  c*=1.-.25*smoothstep(.06,0.,abs(fract(y/3.)-.5)-.47);
  return c;
}
void main(){
  vec3 alb=uPattern>.5?rocket(vL):uAlb;
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 Ld=uSrcPos-vW; float d=length(Ld); Ld/=d;
  float att=1./(1.+pow(d/uSrcRange,2.));
  vec3 V=normalize(uCam-vW);
  vec3 col=alb*(uSrcCol*att*max(dot(N,Ld)*.85+.15,0.) + mix(uGnd,uSky,N.y*.5+.5) + uKeyCol*max(dot(N,uKeyDir),0.));
  vec3 H=normalize(uKeyDir+V); col+=uSpec*uKeyCol*pow(max(dot(N,H),0.),36.);
  vec3 H2=normalize(Ld+V); col+=uSpec*uSrcCol*att*pow(max(dot(N,H2),0.),24.)*.5;
  float f=1.-exp(-length(uCam-vW)*uFogDens);
  gl_FragColor=vec4(mix(col,uFogCol,f),1.);
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
uniform vec3 uHor, uZen, uGlowCol, uGlowDir, uCam;
uniform float uGlowW;
varying vec3 vW;
void main(){
  vec3 d=normalize(vW-uCam);
  float e=clamp(d.y,-1.,1.);
  vec3 c=mix(uHor,uZen,pow(smoothstep(-.02,1.,e),.55));
  c=mix(c,uHor*.7,smoothstep(0.,-.1,e));
  float g=max(dot(d,uGlowDir),0.);
  c+=uGlowCol*(pow(g,uGlowW)*.8+pow(g,uGlowW*8.)*1.5)*smoothstep(-.15,.05,e);
  gl_FragColor=vec4(c,1.);
}`;

const FLAME_VERT = /* glsl */`
varying vec2 vUv; varying float vFac;
uniform vec3 uCam;
void main(){
  vUv=uv;
  vec4 w=modelMatrix*vec4(position,1.);
  vec3 n=normalize(mat3(modelMatrix)*normal);
  vFac=abs(dot(n,normalize(uCam-w.xyz)));
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const FLAME_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uNoise; uniform float uTime, uInt;
varying vec2 vUv; varying float vFac;
void main(){
  float y=vUv.y;                // 1 at the nozzle, 0 at the tail
  float n=texture2D(uNoise,vec2(vUv.x*2.,y*1.4+uTime*1.7)).r;
  float core=pow(vFac,1.6);
  float a=core*smoothstep(0.,.55,y)*(.65+.7*n);
  vec3 c=mix(vec3(1.,.38,.08),vec3(1.,.86,.62),smoothstep(.35,.95,y*core));
  c=mix(c,vec3(1.,.97,.92),smoothstep(.75,1.,core)*smoothstep(.55,1.,y));
  gl_FragColor=vec4(c*a*uInt,1.);
}`;

const MOON_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uTex, uNoise; uniform vec3 uSun, uCam; uniform float uSunI, uPatch;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 N; float sh=1., alb=.3;
  if(uPatch>.5){
    vec4 m=texture2D(uTex,vUv);
    vec2 nxz=m.rg*2.-1.;
    N=normalize(vec3(nxz.x,sqrt(max(1.-dot(nxz,nxz),0.)),nxz.y));
    sh=m.b; alb=m.a;
  } else { N=normalize(vN); }
  vec2 q=vW.xz*1.7;
  float n0=texture2D(uNoise,q*.11).r, nx=texture2D(uNoise,q*.11+vec2(.004,0.)).r, nz=texture2D(uNoise,q*.11+vec2(0.,.004)).r;
  N=normalize(N+vec3(n0-nx,0.,n0-nz)*5.);
  float dif=max(dot(N,uSun),0.);
  float lit=pow(dif,.8)*sh;
  vec3 col=vec3(.95,.93,.90)*alb*lit*uSunI;
  col+=vec3(.010,.014,.024)*alb*(N.y*.5+.5);
  gl_FragColor=vec4(col,1.);
}`;

// ------------------------------------------------------------------ helpers
function boxBetween(m4, a, b, w, d = w) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m4.compose(mid, q, new THREE.Vector3(w, len, d));
  return m4;
}

function litMaterial(U, alb, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: LIT_VERT, fragmentShader: LIT_FRAG,
    uniforms: { ...U, uAlb: { value: new THREE.Vector3(...alb) }, uPattern: { value: extra.pattern ? 1 : 0 }, uSpec: { value: extra.spec ?? 0.15 } },
    side: extra.side ?? THREE.FrontSide,
  });
}

// ------------------------------------------------------------------ K1 world (metres)
function buildLaunch(detail) {
  const scene = new THREE.Scene();
  const v3 = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const U = {
    uSrcPos: v3(0, 3, 0), uSrcCol: v3(0, 0, 0), uSrcRange: { value: 60 },
    uSky: v3(.2, .2, .2), uGnd: v3(.05, .05, .05), uKeyDir: v3(-.4, .7, .5), uKeyCol: v3(0, 0, 0),
    uFogCol: v3(.3, .3, .3), uFogDens: { value: 0.004 }, uCam: v3(0, 0, 0),
  };
  U.uKeyDir.value.normalize();

  const skyU = { uHor: v3(.3, .3, .3), uZen: v3(.25, .25, .25), uGlowCol: v3(0, 0, 0), uGlowDir: v3(0, 0, -1), uGlowW: { value: 6 }, uCam: U.uCam };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), litMaterial(U, [.07, .068, .062], { spec: 0 }));
  scene.add(ground);

  const plat = new THREE.Group();
  const pm = litMaterial(U, [.16, .155, .15], { spec: 0.05 });
  const pbox = (w, h, d, x, y, z, m = pm) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); plat.add(b); return b; };
  pbox(48, 7.6, 40, -4, 0, 0);
  pbox(70, 3, 60, -4, 0, 0, litMaterial(U, [.22, .21, .2], { spec: 0 }));
  scene.add(plat);

  const rocket = new THREE.Group();
  const prof = [[0.01, 0], [5.05, 0], [5.05, 42], [5.05, 47], [5.05, 72], [3.3, 80], [3.3, 99.5], [1.95, 108], [1.95, 112], [0.36, 115.6], [0.3, 116]].map(([x, y]) => new THREE.Vector2(x, y));
  const rmat = litMaterial(U, [1, 1, 1], { pattern: true, spec: 0.35 });
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 72), rmat));
  const les = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 9, 12), rmat); les.position.y = 120.5; rocket.add(les);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.4, 12), rmat); tip.position.y = 126.2; rocket.add(tip);
  const engMat = litMaterial(U, [.09, .085, .08], { spec: 0.4, side: THREE.DoubleSide });
  for (const [x, z] of [[0, 0], [3.1, 3.1], [-3.1, 3.1], [3.1, -3.1], [-3.1, -3.1]]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 5.8, 20, 1, true), engMat);
    e.position.set(x, -2.9, z); rocket.add(e);
  }
  const finMat = litMaterial(U, [.8, .8, .78], { spec: 0.2 });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 7.5, 0.45), finMat);
    fin.position.set(Math.cos(a) * 6.6, 1.2, Math.sin(a) * 6.6); fin.rotation.y = -a; rocket.add(fin);
    const fair = new THREE.Mesh(new THREE.ConeGeometry(1.15, 9, 14), finMat);
    fair.position.set(Math.cos(a) * 5.0, 3.8, Math.sin(a) * 5.0); rocket.add(fair);
  }
  const ROCKET_BASE = 14;
  rocket.position.y = ROCKET_BASE;
  scene.add(rocket);

  const flameU = { uNoise: { value: detail }, uTime: { value: 0 }, uInt: { value: 0 }, uCam: U.uCam };
  const fmat = new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: flameU,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 2.6, 1, 32, 1, true).translate(0, -0.5, 0), fmat);
  flame.position.y = -5.5; rocket.add(flame);
  const flame2 = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 1.6, 1, 24, 1, true).translate(0, -0.5, 0), fmat);
  flame2.position.y = -5.5; rocket.add(flame2);

  // umbilical tower: instanced steel members
  const TX = -19, TZ = 0, TW = 12, TB = 7.6, TTOP = 128;
  const segs = [];
  const P = (x, y, z) => new THREE.Vector3(TX + x, y, TZ + z);
  const h2 = TW / 2;
  const corners = [[-h2, -h2], [h2, -h2], [h2, h2], [-h2, h2]];
  for (const [x, z] of corners) segs.push([P(x, TB, z), P(x, TTOP, z), 0.9]);
  const BAY = 6.2;
  for (let y = TB; y < TTOP - 0.1; y += BAY) {
    const y1 = Math.min(y + BAY, TTOP);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      segs.push([P(ax, y1, az), P(bx, y1, bz), 0.55]);
      segs.push([P(ax, y, az), P(bx, y1, bz), 0.32]);
      segs.push([P(bx, y, bz), P(ax, y1, az), 0.32]);
    }
  }
  segs.push([P(-h2, TTOP + 3, 0), P(h2 + 12, TTOP + 3, 0), 1.2]);
  segs.push([P(-h2, TTOP, 0), P(-h2, TTOP + 6, 0), 0.8]);
  segs.push([P(-h2, TTOP + 6, 0), P(h2 + 12, TTOP + 3.5, 0), 0.4]);
  segs.push([P(0, TTOP, 0), P(0, TTOP + 7, 0), 0.6]);
  const steel = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), litMaterial(U, [.20, .07, .05], { spec: 0.2 }), segs.length);
  const m4 = new THREE.Matrix4();
  segs.forEach(([a, b, w], i) => steel.setMatrixAt(i, boxBetween(m4, a, b, w)));
  steel.frustumCulled = false;
  scene.add(steel);

  const arms = [];
  const armMat = litMaterial(U, [.22, .08, .06], { spec: 0.2 });
  const radiusAt = y => (y < 72 ? 5.05 : y < 80 ? lerp(5.05, 3.3, (y - 72) / 8) : y < 99.5 ? 3.3 : y < 108 ? lerp(3.3, 1.95, (y - 99.5) / 8.5) : 1.95);
  for (const yh of [18, 34, 50, 62, 74, 84, 94, 102, 110]) {
    const g = new THREE.Group();
    const L = -(TX + h2) - radiusAt(yh) - 0.4;
    const s2 = [];
    const ah = 2.2, aw = 1.8;
    for (const [dy, dz] of [[0, -aw / 2], [0, aw / 2], [ah, -aw / 2], [ah, aw / 2]]) s2.push([new THREE.Vector3(0, dy, dz), new THREE.Vector3(L, dy, dz), 0.3]);
    for (let x = 0; x < L - 0.1; x += 2.2) {
      s2.push([new THREE.Vector3(x, 0, -aw / 2), new THREE.Vector3(x + 2.2, ah, -aw / 2), 0.16]);
      s2.push([new THREE.Vector3(x, 0, aw / 2), new THREE.Vector3(x + 2.2, ah, aw / 2), 0.16]);
      s2.push([new THREE.Vector3(x, ah, -aw / 2), new THREE.Vector3(x, ah, aw / 2), 0.16]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), armMat, s2.length);
    s2.forEach(([a, b, w], i) => im.setMatrixAt(i, boxBetween(m4, a, b, w)));
    im.frustumCulled = false;
    g.add(im);
    g.position.set(TX + h2, ROCKET_BASE + yh, 0);
    scene.add(g);
    arms.push({ g, yh });
  }

  const puffs = createPuffs(1500, detail);
  puffs.mesh.renderOrder = 5;
  scene.add(puffs.mesh);
  const r = rng(1969);
  const PUFF = [];
  for (let i = 0; i < 1250; i++) {
    const kind = i < 560 ? 'side' : i < 900 ? 'base' : 'curtain';
    const p = { kind, seed: r(), b: 0, o: new THREE.Vector3(), dir: new THREE.Vector3(), v: 0, s0: 0, g: 0, life: 0, rise: 0 };
    if (kind === 'side') {
      const s = r() < 0.5 ? -1 : 1;
      p.b = r.range(-7, 9);
      p.o.set(s * 30, 3, r.range(-14, 14));
      const sp = r.range(-0.75, 0.75);
      p.dir.set(s * Math.cos(sp), 0.05 + r() * 0.12, Math.sin(sp) * 0.8).normalize();
      p.v = r.range(22, 50); p.s0 = r.range(4.5, 8); p.g = r.range(3, 5.5); p.rise = r.range(0.4, 2.2); p.life = r.range(12, 20);
    } else if (kind === 'base') {
      p.b = r.range(-6, 9);
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 30;
      p.o.set(Math.cos(a) * rr - 4, 4, Math.sin(a) * rr);
      p.dir.set(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
      p.v = r.range(4, 12); p.s0 = r.range(5, 9); p.g = r.range(2, 4.5); p.rise = r.range(1.2, 3.5); p.life = r.range(10, 18);
    } else {
      p.b = -10;
      p.o.set(r.range(-130, 120), r.range(-6, 34), r.range(40, 150));
      p.dir.set(Math.sign(p.o.x + 5) || 1, r.range(-0.1, 0.25), r.range(-0.2, 0.2)).normalize();
      p.v = r.range(5, 14); p.s0 = r.range(14, 26); p.g = r.range(1, 3); p.rise = r.range(-0.5, 2); p.life = 99;
    }
    PUFF.push(p);
  }

  const NA = 9000;
  const apos = new Float32Array(NA * 3), aseed = new Float32Array(NA * 2);
  for (let i = 0; i < NA; i++) {
    apos.set([r.range(-60, 140), r.range(-10, 90), r.range(80, 236)], i * 3);
    aseed.set([r(), r()], i * 2);
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(apos, 3));
  ag.setAttribute('aSeed', new THREE.BufferAttribute(aseed, 2));
  const ashU = { uTau: { value: 0 }, uPx: { value: 500 }, uAlpha: { value: 1 }, uCol: v3(.5, .5, .5) };
  const ash = new THREE.Points(ag, new THREE.ShaderMaterial({
    uniforms: ashU, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */`
attribute vec2 aSeed; uniform float uTau, uPx, uAlpha; varying float vA; varying float vS;
void main(){
  vec3 p=position;
  float s=aSeed.x;
  p.y+= uTau*uTau*(3.+6.*s) + uTau*(1.+s);
  p.x+= sin(p.y*.07+s*6.28)*uTau*1.5;
  p.z+= cos(p.y*.05+s*9.)*uTau*1.2;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float d=-mv.z;
  float sz=(.10+.22*aSeed.y)*uPx/max(d,.1);
  vA=uAlpha*smoothstep(.5,4.,d)*(1.-smoothstep(100.,180.,d)); vS=aSeed.y;
  if(sz<1.4){ vA*=sz*sz/1.96; sz=1.4; }
  gl_PointSize=min(sz,40.);
  gl_Position=projectionMatrix*mv;
}`,
    fragmentShader: /* glsl */`
precision highp float; uniform vec3 uCol; varying float vA; varying float vS;
void main(){ vec2 d=gl_PointCoord-.5; float r=length(d)*2.; float a=smoothstep(1.,.3,r)*vA*.85;
  vec3 c=uCol*(.55+.9*vS); gl_FragColor=vec4(c*a,a); }`,
  }));
  ash.frustumCulled = false;
  ash.renderOrder = 8;
  scene.add(ash);

  return { scene, U, skyU, sky, rocket, flame, flame2, flameU, arms, puffs, PUFF, ash, ashU, ROCKET_BASE };
}

// rocket altitude above its pad position (m), τ = seconds since liftoff (slow motion, then away)
function rocketH(tau) {
  if (tau <= 0) return 0;
  return 2.0 * tau * tau + 0.35 * (Math.exp(1.3 * tau) - 1 - 1.3 * tau - 0.845 * tau * tau);
}

// warped puff time: frozen at the start (still ash), then billowing in slow motion
function puffTau(t) {
  const a = 0.9, b = 2.6;
  if (t <= a) return 0;
  const u = clamp((t - a) / (b - a));
  const ramp = (b - a) * (u * u * u - 0.5 * u * u * u * u);
  return ramp + Math.max(0, t - b);
}

// ------------------------------------------------------------------ K2 world (Earth frame; Earth at origin)
function buildMoon(detail) {
  const RM = 40, ALT = 2.0;
  const X0 = -20, X1 = 20, Z0 = -26, Z1 = 6;
  const NX = 1024, NZ = 832;
  const dx = (X1 - X0) / (NX - 1), dz = (Z1 - Z0) / (NZ - 1);
  const Hm = new Float32Array(NX * NZ), Alb = new Float32Array(NX * NZ);
  const r = rng(11);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + i * dx, z = Z0 + j * dz;
    Hm[j * NX + i] = 0.16 * fbm3(x * 0.08, z * 0.08, 1.3, 4) + 0.05 * noise3(x * 0.9, z * 0.9, 7.7);
    Alb[j * NX + i] = 0.30 + 0.06 * noise3(x * 0.05, z * 0.05, 3.3) + 0.03 * noise3(x * 0.4, z * 0.4, 9.1);
  }
  const crs = [];
  for (let k = 0; k < 2600; k++) {
    const rc = 0.06 / Math.pow(1 - r() * 0.985, 0.62);
    crs.push([r.range(X0 - 2, X1 + 2), r.range(Z0 - 2, Z1 + 2), Math.min(rc, 4.5), r()]);
  }
  for (const c of [[-6, -9, 3.6, .2], [7.5, -4.5, 2.4, .7], [-1.5, -14, 2.9, .4], [4, -16, 4.2, .9], [-11, -3, 1.8, .5], [2, -1.2, 1.1, .3], [12, -12, 3.0, .1]]) crs.push(c);
  for (const [cx, cz, rc, sd] of crs) {
    const depth = rc * (0.22 + 0.06 * sd), rim = rc * 0.07, ext = rc * 2.2;
    const i0 = Math.max(0, Math.floor((cx - ext - X0) / dx)), i1 = Math.min(NX - 1, Math.ceil((cx + ext - X0) / dx));
    const j0 = Math.max(0, Math.floor((cz - ext - Z0) / dz)), j1 = Math.min(NZ - 1, Math.ceil((cz + ext - Z0) / dz));
    const fresh = sd > 0.82 && rc < 1.2;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = X0 + i * dx, z = Z0 + j * dz;
      const q = Math.hypot(x - cx, z - cz) / rc;
      if (q > 2.2) continue;
      let h;
      if (q < 1) h = rim - depth * (1 - q * q) + (sd > 0.5 ? depth * 0.6 * Math.max(0, 0.25 - q) : 0);
      else h = rim * Math.exp(-Math.pow((q - 1) / 0.45, 2));
      Hm[j * NX + i] += h;
      if (fresh) Alb[j * NX + i] += 0.12 * Math.exp(-q * 1.2) * (0.6 + 0.4 * Math.sin(Math.atan2(z - cz, x - cx) * 9 + sd * 20));
    }
  }
  const curv = (x, z) => Math.sqrt(Math.max(RM * RM - x * x - z * z, 0)) - RM;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + i * dx, z = Z0 + j * dz;
    const ef = Math.min(smoothstep(0, 3, x - X0), smoothstep(0, 3, X1 - x), smoothstep(0, 3, z - Z0), smoothstep(0, 3, Z1 - z));
    Hm[j * NX + i] = Hm[j * NX + i] * ef + curv(x, z);
  }
  const tex = new Uint8Array(NX * NZ * 4);
  const sx = SUN.x, sz = SUN.z, sh = Math.hypot(sx, sz), sy = SUN.y;
  const stepX = sx / sh, stepZ = sz / sh, slope = sy / sh;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i;
    const hl = Hm[j * NX + Math.max(i - 1, 0)], hr = Hm[j * NX + Math.min(i + 1, NX - 1)];
    const hd = Hm[Math.max(j - 1, 0) * NX + i], hu = Hm[Math.min(j + 1, NZ - 1) * NX + i];
    let nx = -(hr - hl) / (2 * dx), nz = -(hu - hd) / (2 * dz);
    const l = Math.hypot(nx, 1, nz); nx /= l; nz /= l;
    const x = X0 + i * dx, z = Z0 + j * dz, h0 = Hm[k] + 0.01;
    let minc = 1e9, dist = 0;
    const st = Math.min(dx, dz) * 1.5;
    for (let s = 0; s < 420; s++) {
      dist += st * (1 + s * 0.012);
      const ii = (x + stepX * dist - X0) / dx, jj = (z + stepZ * dist - Z0) / dz;
      if (ii < 0 || jj < 0 || ii >= NX - 1 || jj >= NZ - 1) break;
      const ht = Hm[(jj | 0) * NX + (ii | 0)];
      minc = Math.min(minc, (h0 + dist * slope - ht) / (dist * 0.05 + 0.02));
      if (minc < -1) break;
    }
    tex[k * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    tex[k * 4 + 1] = Math.round((nz * 0.5 + 0.5) * 255);
    tex[k * 4 + 2] = Math.round(clamp(0.5 + minc * 0.5) * 255);
    tex[k * 4 + 3] = Math.round(clamp(Alb[k]) * 255);
  }
  const dt = new THREE.DataTexture(tex, NX, NZ, THREE.RGBAFormat);
  dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearMipmapLinearFilter; dt.generateMipmaps = true;
  dt.anisotropy = 4; dt.needsUpdate = true;

  const GX = 400, GZ = 320;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, GX, GZ).rotateX(-Math.PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pa = geo.getAttribute('position'), ua = geo.getAttribute('uv');
  for (let v = 0; v < pa.count; v++) {
    const x = pa.getX(v), z = pa.getZ(v);
    const fi = (x - X0) / dx, fj = (z - Z0) / dz;
    const i = Math.min(NX - 2, Math.max(0, fi | 0)), j = Math.min(NZ - 2, Math.max(0, fj | 0));
    const tx = fi - i, tz = fj - j;
    pa.setY(v, lerp(lerp(Hm[j * NX + i], Hm[j * NX + i + 1], tx), lerp(Hm[(j + 1) * NX + i], Hm[(j + 1) * NX + i + 1], tx), tz));
    ua.setXY(v, (x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0));
  }
  geo.computeVertexNormals();
  const mU = { uTex: { value: dt }, uNoise: { value: detail }, uSun: { value: SUN.clone() }, uCam: { value: new THREE.Vector3() }, uSunI: { value: 1.9 }, uPatch: { value: 1 } };
  const vert = /* glsl */`varying vec3 vW; varying vec3 vN; varying vec2 vUv;
    void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;
  const patch = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: MOON_FRAG, uniforms: mU }));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(RM - 0.06, 160, 120), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: MOON_FRAG, uniforms: { ...mU, uPatch: { value: 0 } } }));
  sphere.position.y = -RM;
  const group = new THREE.Group();
  group.add(patch, sphere);
  return { group, mU, RM, ALT };
}

// ------------------------------------------------------------------ K1 per-frame
const _v = new THREE.Vector3();
function k1Camera(t, rocketY) {
  const pos = new THREE.Vector3(
    track([[0, 70], [L_LIFT, 64], [L_SWITCH, 60]], t),
    track([[0, 9], [L_LIFT, 7], [L_LIFT + 3, 12], [L_SWITCH, 70]], t, 'inOutCubic'),
    track([[0, 225], [L_LIFT, 200], [L_SWITCH, 185]], t));
  const follow = smoothstep(L_LIFT - 0.3, L_LIFT + 2.2, t);
  const release = smoothstep(L_LIFT + 5.4, L_LIFT + 6.6, t);
  const ryCap = 14 + rocketH(5.9);
  const ry = lerp(Math.min(rocketY, ryCap), ryCap, release);
  const target = new THREE.Vector3(0, lerp(76, ry + 62, follow), 0);
  return { pos, target, sx: lerp(0.6, 0.5, follow), sy: lerp(0.5, 0.42, follow) };
}

function updateK1(st, t, g) {
  const K = st.K1, U = K.U, cam = st.camera;
  const tau = t - L_LIFT;
  const h = rocketH(tau);
  const rocketY = K.ROCKET_BASE + h;
  K.rocket.position.y = rocketY;
  cam.fov = 32; cam.updateProjectionMatrix();
  const c = k1Camera(t, rocketY);
  aimCamera(cam, c.pos, c.target, new THREE.Vector3(0, 1, 0), c.sx, c.sy);
  cam.updateMatrixWorld();
  U.uCam.value.copy(cam.position);
  st.S1.follow(cam);

  const ign = smoothstep(1.9, 3.2, t);
  const flick = 1 + 0.06 * Math.sin(g * 37.1) + 0.04 * Math.sin(g * 59.3);
  const srcY = tau > 0 ? rocketY - 18 - Math.min(h * 0.4, 60) : 2;
  U.uSrcPos.value.set(0, srcY, 0);
  const srcI = ign * flick * (tau > 0 ? lerp(1, 0.35, smoothstep(30, 400, h)) : 1);
  U.uSrcCol.value.set(1.0, 0.62, 0.32).multiplyScalar(7 * srcI);
  U.uSrcRange.value = 46;

  const clear = smoothstep(1.4, 4.0, t);
  const deep = smoothstep(L_LIFT + 1.5, L_LIFT + 5.5, t);
  const black = smoothstep(L_LIFT + 4.5, L_LIFT + 6.6, t);
  const hor = new THREE.Vector3(.29, .29, .29).lerp(new THREE.Vector3(.50, .55, .62), clear).lerp(new THREE.Vector3(.16, .26, .50), deep).lerp(new THREE.Vector3(.0, .0, .004), black);
  const zen = new THREE.Vector3(.27, .27, .27).lerp(new THREE.Vector3(.16, .27, .52), clear).lerp(new THREE.Vector3(.02, .06, .22), deep).lerp(new THREE.Vector3(0, 0, 0), black);
  K.skyU.uHor.value.copy(hor); K.skyU.uZen.value.copy(zen);
  _v.set(0, 2, 0).sub(cam.position).normalize();
  K.skyU.uGlowDir.value.copy(_v);
  K.skyU.uGlowCol.value.set(1.0, 0.55, 0.25).multiplyScalar(0.55 * ign * (1 - deep));
  U.uSky.value.copy(zen).multiplyScalar(0.9).addScalar(0.03 * (1 - clear));
  U.uGnd.value.copy(hor).multiplyScalar(0.25);
  U.uKeyCol.value.set(1.0, 0.93, 0.82).multiplyScalar(0.9 * clear * (1 - black * 0.3));
  U.uFogCol.value.copy(hor).multiplyScalar(lerp(1, 0.85, deep));
  U.uFogDens.value = lerp(0.010, 0.0007, smoothstep(0.8, 4.4, t));
  st.S1.mat.uniforms.uVis.value = smoothstep(L_LIFT + 4.8, L_LIFT + 6.8, t);

  K.flameU.uTime.value = g;
  const fl = smoothstep(-0.4, 0.4, tau) * ign;
  K.flameU.uInt.value = 10 * fl * lerp(1, 0.06, smoothstep(150, 1500, h));
  const flen = lerp(14, 80, smoothstep(0, 4, tau)) + h * 0.06;
  const fw = 1 + smoothstep(2, 6, tau) * 0.8;
  K.flame.scale.set(fw, flen, fw);
  K.flame2.scale.set(1, flen * 0.55, 1);
  K.flame.visible = K.flame2.visible = fl > 0.001;

  for (const a of K.arms) {
    const delay = (a.yh / 110) * 0.5;
    const u = ease.inOutCubic(clamp((tau + 0.35 - delay) / 1.4));
    a.g.rotation.y = u * (a.yh > 90 ? -1.15 : 1.15);
  }

  const T = puffTau(t);
  const list = [];
  for (const p of K.PUFF) {
    const age = T - p.b;
    if (p.kind === 'curtain') {
      const u = Math.max(0, T - 0.4);
      const x = p.o.x + p.dir.x * (u * u * 3 + u * p.v);
      const y = p.o.y + p.rise * u;
      const z = p.o.z + p.dir.z * u * 6;
      const a = (1 - smoothstep(0.6, 2.2, u + p.seed * 0.9)) * 0.75;
      if (a < 0.01) continue;
      list.push({ x, y, z, s: p.s0 + p.g * u, a, heat: 0, seed: p.seed, shade: 0.4 });
      continue;
    }
    if (age < 0) continue;
    const dist = p.v * 2.6 * (1 - Math.exp(-age / 2.6));
    const x = p.o.x + p.dir.x * dist + Math.sin(age * 0.4 + p.seed * 9) * 1.5;
    const y = p.o.y + p.dir.y * dist + p.rise * age + 0.03 * age * age;
    const z = p.o.z + p.dir.z * dist;
    const s = p.s0 + p.g * Math.sqrt(age);
    let a = smoothstep(0, 0.7, age) * (1 - smoothstep(p.life * 0.75, p.life, age));
    a *= p.kind === 'side' ? 0.9 : 0.8;
    const heat = ign * Math.exp(-age * 1.1) * (p.kind === 'side' ? 0.7 : 0.4) * (tau > 0 ? 1 : 0.6);
    list.push({ x, y, z, s, a, heat, seed: p.seed, shade: 0.5 * Math.exp(-age * 0.1) });
  }
  if (tau > 0) {
    for (let k = 0; k < 140; k++) {
      const bt = (k / 140) * Math.min(tau, 7);
      const age = tau - bt;
      const hy = K.ROCKET_BASE + rocketH(bt) - 16;
      if (hy < 20) continue;
      const sd = (k * 0.6180339) % 1;
      const s = 4 + 3.5 * Math.sqrt(age) + hy * 0.012;
      list.push({ x: Math.sin(sd * 40) * 2 * age, y: hy + age * 1.5, z: Math.cos(sd * 30) * 2 * age, s, a: 0.7 * smoothstep(0, 0.4, age), heat: Math.exp(-age * 1.6) * 1.5, seed: sd, shade: 0.2 });
    }
  }
  K.puffs.set(list, cam);
  const pu = K.puffs.uniforms;
  pu.uSrcPos.value.copy(U.uSrcPos.value);
  pu.uSrcCol.value.copy(U.uSrcCol.value).multiplyScalar(0.8);
  pu.uSrcRange.value = 60;
  pu.uSkyCol.value.copy(zen).multiplyScalar(0.75).addScalar(0.05 * (1 - clear));
  pu.uGroundCol.value.copy(hor).multiplyScalar(0.18);
  pu.uFogCol.value.copy(U.uFogCol.value);
  pu.uFogDens.value = U.uFogDens.value * 0.8;
  pu.uKeyCol.value.copy(U.uKeyCol.value).multiplyScalar(1.25);
  pu.uKeyDir.value.copy(U.uKeyDir.value);
  pu.uTime.value = T;
  pu.uAlbedo.value.set(0.75, 0.73, 0.71);

  const ashTau = Math.max(0, t - 0.95);
  K.ashU.uTau.value = ashTau * ashTau * 0.5;
  K.ashU.uAlpha.value = 1 - smoothstep(2.6, 4.2, t);
  K.ashU.uPx.value = st.H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  K.ashU.uCol.value.set(0.42, 0.42, 0.42).lerp(new THREE.Vector3(0.9, 0.6, 0.4), ign * 0.6);
}

// the K1 camera orientation at the switch instant
function k1EndQuat(st) {
  if (st.k1QuatEnd) return st.k1QuatEnd;
  const tmp = new THREE.PerspectiveCamera(32, st.camera.aspect);
  const c = k1Camera(L_SWITCH, 14 + rocketH(L_SWITCH - L_LIFT));
  aimCamera(tmp, c.pos, c.target, new THREE.Vector3(0, 1, 0), c.sx, c.sy);
  st.k1QuatEnd = tmp.quaternion.clone();
  return st.k1QuatEnd;
}

// ------------------------------------------------------------------ K2 per-frame
const L_TILT_END = 166.4 - T0;
const L_RISE0 = 164.6 - T0, L_RISE1 = 169.8 - T0;
const L_FLY0 = 170.2 - T0, L_FLY1 = 176.0 - T0;
const EARTH_SCREEN = [0.335, 0.33];
function k2Rig(t) {
  const rise = ease.inOutSine(clamp((t - L_RISE0) / (L_RISE1 - L_RISE0)));
  return new THREE.Vector3(lerp(-2, 2, clamp((t - L_SWITCH) / 12)), lerp(42, 17, rise), 112 - (t - L_SWITCH) * 0.2);
}
function updateK2(st, t, g) {
  const cam = st.cam2, E = st.E, M = st.M;
  const rig = k2Rig(Math.min(t, L_FLY0));
  M.group.position.set(rig.x, rig.y - M.ALT, rig.z);
  M.group.rotation.set(-(t - L_SWITCH) * 0.006, 0, 0);

  // orientation that keeps Earth's final (risen) direction at EARTH_SCREEN
  const tmp = new THREE.PerspectiveCamera(30, cam.aspect);
  const rigEnd = k2Rig(L_RISE1);
  aimCamera(tmp, rig, rig.clone().sub(rigEnd), new THREE.Vector3(0, 1, 0), EARTH_SCREEN[0], EARTH_SCREEN[1]);
  const qRise = tmp.quaternion.clone();

  let pos = rig.clone(), q = qRise.clone(), fov = 30;
  if (t < L_TILT_END) {
    const u = ease.inOutCubic(clamp((t - L_SWITCH) / (L_TILT_END - L_SWITCH)));
    q = k1EndQuat(st).clone().slerp(qRise, u);
  }
  if (t > L_FLY0 && t < L_FLY1) {
    const u = clamp((t - L_FLY0) / (L_FLY1 - L_FLY0));
    const e = ease.inOutCubic(u);
    const n1 = n1Pose(E.P, 176.0);
    const n1Cam = new THREE.PerspectiveCamera(n1.fov, cam.aspect);
    n1Cam.position.copy(n1.pos); n1Cam.up.copy(n1.up); n1Cam.lookAt(n1.target);
    const p0 = rig, p3 = n1.pos;
    const fwd0 = new THREE.Vector3(0, 0, -1).applyQuaternion(qRise);
    const fwd3 = new THREE.Vector3(0, 0, -1).applyQuaternion(n1Cam.quaternion);
    const p1 = p0.clone().addScaledVector(fwd0, 40).add(new THREE.Vector3(0, 10, 0));
    const p2 = p3.clone().addScaledVector(fwd3, -26).addScaledVector(n1.up, 8);
    const b = (a0, a1, a2, a3, s) => { const m = 1 - s; return a0 * m * m * m + 3 * a1 * m * m * s + 3 * a2 * m * s * s + a3 * s * s * s; };
    pos = new THREE.Vector3(b(p0.x, p1.x, p2.x, p3.x, e), b(p0.y, p1.y, p2.y, p3.y, e), b(p0.z, p1.z, p2.z, p3.z, e));
    // keep the Earth framed while travelling, then settle into the N1 orientation
    const tE = new THREE.PerspectiveCamera(30, cam.aspect);
    const upE = new THREE.Vector3(0, 1, 0).lerp(n1.up, smoothstep(0.3, 0.9, u)).normalize();
    aimCamera(tE, pos, new THREE.Vector3(0, 0, 0), upE, lerp(EARTH_SCREEN[0], 0.5, smoothstep(0, 0.6, u)), lerp(EARTH_SCREEN[1], 0.5, smoothstep(0, 0.6, u)));
    q = tE.quaternion.clone().slerp(n1Cam.quaternion, ease.inOutSine(smoothstep(0.5, 1, u)));
    fov = lerp(30, n1.fov, e);
  }
  cam.fov = fov;
  cam.position.copy(pos); cam.quaternion.copy(q);
  if (t >= L_FLY1) {
    const n1 = n1Pose(E.P, g);
    cam.fov = n1.fov; cam.position.copy(n1.pos); cam.up.copy(n1.up); cam.lookAt(n1.target);
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  st.S2.follow(cam);
  E.update(cam, g, st.H);
  M.mU.uCam.value.copy(cam.position);
}

// ------------------------------------------------------------------ scene module
export default {
  async init({ renderer, aspect, W, H }) {
    const B = bake(renderer);
    const camera = new THREE.PerspectiveCamera(32, aspect, 0.5, 60000);
    const K1 = buildLaunch(B.detail);
    const S1 = createStars({ W, seed: 9 });
    K1.scene.add(S1.points);

    const scene2 = new THREE.Scene();
    const cam2 = new THREE.PerspectiveCamera(30, aspect, 0.02, 4000);
    const E = createEarth(renderer);
    scene2.add(E.group);
    const S2 = createStars({ W, seed: 9 });
    scene2.add(S2.points);
    const M = buildMoon(B.detail);
    scene2.add(M.group);
    return { camera, cam2, K1, S1, scene2, E, S2, M, W, H, scene: K1.scene, mode: 1 };
  },

  update(st, t, info) {
    st.mode = t < L_SWITCH ? 1 : 2;
    if (st.mode === 1) updateK1(st, t, info.global);
    else updateK2(st, t, info.global);
  },

  draw(st, r, target) {
    r.setRenderTarget(target);
    r.setClearColor(0, 1); r.clear();
    if (st.mode === 1) r.render(st.K1.scene, st.camera);
    else r.render(st.scene2, st.cam2);
  },

  grade(st, t) {
    if (t < L_SWITCH) {
      const c = smoothstep(1.2, 3.4, t);
      return {
        exposure: lerp(1.0, 1.05, c), saturation: lerp(0.12, 1.0, c), contrast: lerp(1.0, 1.06, c),
        tint: [lerp(1, 1.02, c), 1, lerp(1, 0.97, c)], lift: [0.003, 0.004, 0.008],
        vignette: 0.4, grain: 0.05,
        bloom: { strength: lerp(0.35, 0.9, c), radius: 0.6, threshold: lerp(0.9, 0.82, c) },
      };
    }
    return {
      exposure: 1.0, saturation: 1.0, contrast: 1.05, tint: [0.98, 1.0, 1.03], lift: [0.0, 0.0, 0.004],
      vignette: 0.42, grain: 0.04, bloom: { strength: 0.7, radius: 0.6, threshold: 0.8 },
    };
  },
};
