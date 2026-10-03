// Act VIII 言 WORD (176 – 227) — the climax.
// N1 night side; great-circle arcs grow between cities, data pulses race, every arc bends toward one point.
// N2 188.0: a tower made of every script erupts from that point and spirals up (Bruegel), through the
//    clouds and the atmosphere into sunlight and space; the camera spirals up with it.
// N3 208–216 under MASTER black (cheap).
// N4 the top: the tower has not fallen; its apex is the cursor. Push in until only the cursor remains,
//    at exactly (CURSOR.x·W, CURSOR.y·H), 3×34 px — the epilogue begins there.
import * as THREE from 'three';
import { HITS, CURSOR } from '../cues.js';
import { createEarth, createStars, n1Pose, aimCamera, bake, tlFrame, tlToWorld, surfaceTL, R, SUN, N1_END } from './sky_earth.js';
import { createPuffs } from './sky_puffs.js';
import { buildAtlas, buildTower, buildStream, HT, radiusAt } from './word_tower.js';
import { drawLoneCursor, cursorAlpha, REF_W, REF_H } from './prologue_typing.js';
import { rng, smoothstep, clamp, lerp, track, ease } from '../engine/util.js';

const T0 = 176;
const G_ERUPT = HITS.towerErupt;   // 188
const G_BLACK0 = 208.05, G_BLACK1 = 215.3;
const CURSOR_ANCHOR = HITS.cursorIn;
const CUR_H = 0.05;                 // world height of the apex cursor (tower units)
const CUR_W = CUR_H * CURSOR.w / CURSOR.h;

// build front of the tower (height above the ground, tower units)
function front(g) {
  if (g < G_ERUPT) return 0;
  return Math.min(HT, track([[G_ERUPT, 0], [G_ERUPT + 1.2, 0.45, 'outCubic'], [193, 0.9], [198, 1.6], [203, 2.55], [207.2, HT]], g, 'linear'));
}
// camera altitude along the tower in N2 (exponential climb)
function camY(g) { return N1_END.alt * Math.pow(17, clamp((g - G_ERUPT) / 19.6)); }

// ---------------------------------------------------------------- arcs
const ARC_VERT = /* glsl */`
attribute vec3 aA; attribute vec3 aB; attribute vec2 aS; attribute vec4 aP; attribute vec2 aK;
uniform vec3 uP; uniform float uTime, uR, uW, uFade; uniform vec2 uRes;
varying float vS; varying float vGrow; varying float vSeed; varying float vKind; varying float vSide; varying float vC;
vec3 arcPos(vec3 A, vec3 B, float h, float s){ vec3 d=normalize(mix(A,B,s)); return d*(uR*(1.+h*sin(3.14159265*s))); }
void main(){
  float c=smoothstep(aP.z,aP.z+1.8,uTime);
  vec3 B=normalize(mix(aB,uP,c));
  float ang=acos(clamp(dot(aA,B),-1.,1.));
  float h=aK.x*ang+.0003;
  float s=aS.x;
  float ds=s<.99?.01:-.01;
  vec4 c0=projectionMatrix*viewMatrix*vec4(arcPos(aA,B,h,s),1.);
  vec4 c1=projectionMatrix*viewMatrix*vec4(arcPos(aA,B,h,s+ds),1.);
  vec2 d=(c1.xy/max(c1.w,1e-4)-c0.xy/max(c0.w,1e-4))*uRes*sign(ds);
  vec2 n=normalize(vec2(-d.y,d.x)+1e-6);
  c0.xy+=n*aS.y*uW/uRes*2.*c0.w;
  gl_Position=c0;
  vS=s; vGrow=clamp((uTime-aP.x)/aP.y,0.,1.); vSeed=aP.w; vKind=aK.y; vSide=aS.y; vC=c;
}`;
const ARC_FRAG = /* glsl */`
precision highp float;
uniform float uTime, uFade;
varying float vS; varying float vGrow; varying float vSeed; varying float vKind; varying float vSide; varying float vC;
void main(){
  if(vS>vGrow) discard;
  float across=exp(-vSide*vSide*3.);
  float head=vGrow<1.?exp(-(vGrow-vS)*60.)*3.:0.;
  float p1=exp(-pow((fract(uTime*.42+vSeed)-vS)/.012,2.));
  float p2=exp(-pow((fract(uTime*.31+vSeed*7.3)-vS)/.009,2.));
  float ends=smoothstep(0.,.04,vS)*smoothstep(1.,.96,vS);
  vec3 col=vKind<.5?vec3(.25,.75,1.):vec3(1.,.72,.32);
  col=mix(col,vec3(1.,.8,.45),vC*.7);
  float I=(.16+head*.7+(p1+p2)*3.)*ends*across*uFade;
  gl_FragColor=vec4(col*I,1.);
}`;

function buildArcs(B, P) {
  const r = rng(176);
  // hubs: bright local cities + bright global cities on the visible face
  const hubs = [];
  const lp = B.locPos, lb = B.locB;
  for (let i = 0; i < lb.length; i++) if (lb[i] > 0.75 && r() < 0.06) hubs.push(new THREE.Vector3(lp[i * 3], lp[i * 3 + 1], lp[i * 3 + 2]).normalize());
  const gp = B.cityPos, gb = B.cityB;
  const far = [];
  for (let i = 0; i < gb.length; i++) {
    if (gb[i] < 0.5) continue;
    const v = new THREE.Vector3(gp[i * 3], gp[i * 3 + 1], gp[i * 3 + 2]).normalize();
    if (v.dot(P) > 0.2 && r() < 0.15) far.push(v);
  }
  const arcs = [];
  const NA = 620, NC = 340;
  for (let i = 0; i < NA + NC; i++) {
    const conv = i >= NA;
    const A = (r() < 0.75 || !far.length) ? hubs[Math.floor(r() * hubs.length)] : far[Math.floor(r() * far.length)];
    let Bv;
    if (conv) Bv = P.clone();
    else {
      let k = 0;
      do { Bv = (r() < 0.7 ? hubs[Math.floor(r() * hubs.length)] : far[Math.floor(r() * far.length)] || hubs[0]); k++; }
      while (k < 12 && (A.angleTo(Bv) < 0.03 || A.angleTo(Bv) > 0.5));
    }
    const tb = conv ? 183.6 + 3.9 * Math.pow(r(), 0.7) : 179.0 + 7.0 * Math.sqrt(r());
    arcs.push({ A, B: Bv, tb, dur: 0.7 + 1.6 * r(), cs: conv ? 0 : 184.0 + 3.0 * r(), seed: r(), h: 0.035 + 0.07 * r(), kind: r() < 0.55 ? 0 : 1 });
  }
  const SEG = 40, VPA = (SEG + 1) * 2;
  const n = arcs.length * VPA;
  const fA = new Float32Array(n * 3), fB = new Float32Array(n * 3), fS = new Float32Array(n * 2), fP = new Float32Array(n * 4), fK = new Float32Array(n * 2);
  const idx = [];
  arcs.forEach((a, ai) => {
    for (let k = 0; k <= SEG; k++) for (let sd = 0; sd < 2; sd++) {
      const v = ai * VPA + k * 2 + sd;
      fA.set([a.A.x, a.A.y, a.A.z], v * 3); fB.set([a.B.x, a.B.y, a.B.z], v * 3);
      fS.set([k / SEG, sd ? 1 : -1], v * 2); fP.set([a.tb, a.dur, a.cs, a.seed], v * 4); fK.set([a.h, a.kind], v * 2);
    }
    for (let k = 0; k < SEG; k++) { const v = ai * VPA + k * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(fA, 3)); g.setAttribute('aB', new THREE.BufferAttribute(fB, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(fS, 2)); g.setAttribute('aP', new THREE.BufferAttribute(fP, 4));
  g.setAttribute('aK', new THREE.BufferAttribute(fK, 2));
  g.setIndex(idx);
  const U = { uP: { value: P.clone() }, uTime: { value: 0 }, uR: { value: R * 1.0008 }, uW: { value: 1.6 }, uRes: { value: new THREE.Vector2(1920, 804) }, uFade: { value: 1 } };
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, uniforms: U,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, U };
}

// soft additive billboard sprites (glows, sun)
function glowSprite(color, renderOrder = 6) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Vector3(...color) }, uI: { value: 0 }, uCore: { value: 40 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.-1.; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `precision highp float; uniform vec3 uCol; uniform float uI, uCore; varying vec2 vUv;
      void main(){ float r2=dot(vUv,vUv); if(r2>1.) discard; float f=exp(-r2*uCore)*4.+exp(-r2*7.)*.6+(1.-r2)*.08; gl_FragColor=vec4(uCol*f*uI,1.); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.frustumCulled = false; m.renderOrder = renderOrder;
  return m;
}

// ---------------------------------------------------------------- N2/N4 camera in tower-local cylindrical coords
const _q = new THREE.Quaternion();
function towerCam(st, g, cam) {
  const F = st.F;
  if (g < G_ERUPT) {
    const p = n1Pose(st.P, g);
    cam.fov = p.fov; aimCamera(cam, p.pos, p.target, p.up, p.sx, p.sy);
    return;
  }
  let rho, phi, y, yt, sx, sy, fov = 34;
  if (g < 212) {
    const u = clamp((g - G_ERUPT) / 20);
    y = camY(g);
    const r = radiusAt(y);
    rho = lerp(N1_END.back, lerp(0.35 + 5.0 * r, 0.15 + 2.6 * r, smoothstep(0.55, 0.95, u)), smoothstep(0, 0.4, u));
    fov = lerp(34, 40, smoothstep(0, 0.3, u));
    phi = -(Math.PI * 2 * 1.45) * ease.inOutSine(u) * 0.98;
    // keep the horizon low in frame: pitch follows the horizon dip
    const dip = Math.acos(R / (R + y));
    const pitch = lerp(-0.2, -dip + lerp(0.22, 0.42, smoothstep(0.4, 0.9, u)), smoothstep(0, 0.25, u));
    yt = y + rho * Math.tan(pitch);
    sx = lerp(0.5, 0.44, smoothstep(0, 0.3, u)); sy = lerp(0.66, 0.5, smoothstep(0, 0.25, u));
    if (g < G_ERUPT + 1.5) {   // eruption: the column punches up out of frame; hold P low in frame
      const e = smoothstep(G_ERUPT, G_ERUPT + 1.5, g);
      yt = lerp(0, yt, e); sy = lerp(0.66, sy, e);
    }
  } else {
    // N4: top of the tower; crest the edge, then push in on the cursor
    const apexY = HT + 0.02 + CUR_H / 2;
    const crest = ease.inOutSine(clamp((g - 215.4) / 6.6));
    const push = ease.inOutCubic(clamp((g - 220.6) / 6.0));
    const dEnd = CUR_H * 804 / (CURSOR.h * 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    y = lerp(lerp(HT - 0.5, apexY + 0.07, crest), apexY, push);
    rho = lerp(lerp(0.95, 0.62, crest), dEnd, push);
    phi = -(Math.PI * 2 * 1.45) * 0.98 - 0.7 + 0.7 * crest + 0.12 * push;
    yt = lerp(lerp(HT - 1.15, apexY, Math.pow(crest, 0.8)), apexY, push);
    sx = lerp(0.5, CURSOR.x + (CURSOR.w / 2) / REF_W, push);
    sy = lerp(lerp(0.5, 0.45, crest), CURSOR.y, push);
  }
  const pos = tlToWorld(F, Math.sin(phi) * rho, y, Math.cos(phi) * rho);
  const tgt = tlToWorld(F, 0, yt, 0);
  cam.fov = fov;
  aimCamera(cam, pos, tgt, F.Y, sx, sy);
}

// ---------------------------------------------------------------- module
export default {
  async init({ renderer, aspect, W, H }) {
    const B = bake(renderer);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.002, 4000);
    const E = createEarth(renderer);
    scene.add(E.group);
    const S = createStars({ W, seed: 9 });
    scene.add(S.points);
    const P = E.P.clone();
    const F = tlFrame(P);

    const arcs = buildArcs(B, P);
    arcs.U.uRes.value.set(W, H);
    arcs.U.uW.value = 1.7 * W / 1920;
    scene.add(arcs.mesh);

    // tower
    const atlas = await buildAtlas();
    const T = buildTower(atlas, front, G_ERUPT, 208);
    const towerW = new THREE.Matrix4().makeBasis(F.X, F.Y, F.Z).setPosition(F.o);
    T.U.uTowerW.value.copy(towerW);
    T.U.uSunL.value.copy(SUN);
    T.U.uR.value = R;
    scene.add(T.core, T.rampMesh, T.glyphs);
    T.core.renderOrder = 1; T.rampMesh.renderOrder = 2; T.glyphs.renderOrder = 7;
    const ST = buildStream(atlas, T.U, 11000);
    ST.mesh.renderOrder = 8;
    scene.add(ST.mesh);

    // convergence glow at P, eruption column, sun, apex cursor glow
    const pGlow = glowSprite([1, 0.78, 0.45]);
    pGlow.position.copy(P).multiplyScalar(R * 1.001);
    scene.add(pGlow);
    const colMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uLen: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vF; void main(){ vUv=uv; vec3 n=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vF=abs(dot(n,normalize(-mv.xyz))); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `precision highp float; uniform float uI; varying vec2 vUv; varying float vF; void main(){ float a=pow(vF,2.)*smoothstep(0.,.15,vUv.y)*smoothstep(1.,.6,vUv.y); gl_FragColor=vec4(vec3(1.,.9,.7)*a*uI,1.); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1, 24, 1, true).translate(0, 0.5, 0), colMat);
    column.matrixAutoUpdate = false;
    column.frustumCulled = false; column.renderOrder = 9;
    scene.add(column);
    const sun = glowSprite([1, 0.92, 0.8], -1);
    sun.material.depthTest = true;
    scene.add(sun);
    const apexGlow = glowSprite([1, 0.92, 0.82], 10);
    apexGlow.position.copy(tlToWorld(F, 0, HT + 0.02 + CUR_H / 2, 0));
    scene.add(apexGlow);
    const curMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.93 * 3, 0.89 * 3, 0.83 * 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const cursor3d = new THREE.Mesh(new THREE.PlaneGeometry(CUR_W, CUR_H), curMat);
    cursor3d.renderOrder = 11;
    scene.add(cursor3d);

    // cloud deck around the tower base
    const puffs = createPuffs(700, B.detail);
    puffs.mesh.renderOrder = 4;
    scene.add(puffs.mesh);
    const r = rng(311);
    const PUFF = [];
    for (let i = 0; i < 620; i++) {
      const a = r() * Math.PI * 2, d = 0.25 + Math.pow(r(), 0.6) * 3.2;
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      // clumpy deck
      PUFF.push({ x: cx, z: cz, alt: 0.05 + 0.04 * r(), s: 0.05 + 0.12 * r(), seed: r(), a: 0.25 + 0.35 * r() });
    }

    return { scene, camera, E, S, P, F, arcs, T, ST, pGlow, column, sun, apexGlow, cursor3d, puffs, PUFF, W, H, towerW };
  },

  update(st, t, info) {
    const g = info.global;
    st.g = g;
    st.black = g > G_BLACK0 && g < G_BLACK1;
    if (st.black) return;
    const cam = st.camera, F = st.F;
    towerCam(st, g, cam);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    st.S.follow(cam);
    st.E.update(cam, g, st.H);

    const fr = front(g);
    const N4 = g > 212;
    // arcs
    st.arcs.U.uTime.value = g;
    st.arcs.U.uFade.value = 1 - smoothstep(188.3, 191.5, g);
    st.arcs.mesh.visible = g < 199.5;
    // convergence glow & eruption
    const conv = smoothstep(184, 188, g);
    const flash = g >= G_ERUPT ? Math.exp(-(g - G_ERUPT) * 2.2) : 0;
    st.pGlow.material.uniforms.uI.value = (conv * conv * 0.9 + flash * 4) * (1 - smoothstep(192, 196, g));
    const ps = (0.04 + conv * 0.14 + flash * 0.6);
    st.pGlow.scale.set(ps, ps, 1);
    st.pGlow.material.uniforms.uCore.value = 30;
    // column of light shooting up
    const colLen = g >= G_ERUPT ? Math.min(6, (g - G_ERUPT) * 9) : 0;
    st.column.material.uniforms.uI.value = g >= G_ERUPT ? 2.2 * Math.exp(-(g - G_ERUPT) * 0.7) : 0;
    st.column.visible = g >= G_ERUPT && g < 196;
    st.column.matrix.copy(st.towerW).multiply(new THREE.Matrix4().makeScale(1, Math.max(colLen, 1e-3), 1));
    // earth ground glow at the base
    const em = st.E.earthMat.uniforms;
    em.uGlowPos.value.copy(F.o);
    em.uGlowCol.value.set(1, 0.68, 0.32).multiplyScalar((conv * 0.15 + (g >= G_ERUPT ? 0.35 : 0) + flash * 0.8) * (N4 ? 0.4 : 1));
    em.uGlowRad.value = 0.9;

    // tower
    const T = st.T.U;
    T.uTime.value = g;
    T.uFront.value = fr;
    const endFade = 1 - smoothstep(223.6, 226.4, g);
    T.uFade.value = N4 ? endFade : 1;
    T.uBright.value = N4 ? 0.8 : 0.95;
    st.T.glyphs.visible = st.T.rampMesh.visible = st.T.core.visible = g >= G_ERUPT;
    // stream
    const SU = st.ST.U;
    SU.uVis.value = (g < G_ERUPT ? 0 : smoothstep(G_ERUPT + 0.5, G_ERUPT + 3, g)) * (N4 ? endFade : 1);
    SU.uApex.value = N4 ? 1 : 0;
    SU.uBright.value = N4 ? 0.9 : 0.6;
    // stars fade to black at the very end
    st.S.mat.uniforms.uVis.value = N4 ? 1 - smoothstep(222.5, 225.5, g) : 1;
    st.E.group.visible = !(N4 && g > 226.3);

    // sun (behind the limb; occluded by the Earth through the depth buffer)
    st.sun.position.copy(cam.position).addScaledVector(SUN, 900);
    st.sun.scale.set(70, 70, 1);
    st.sun.material.uniforms.uI.value = 3.0 * (N4 ? endFade : 1);
    st.sun.material.uniforms.uCore.value = 260;

    // apex cursor (3D presence; the exact pixel cursor is drawn in the overlay)
    const blink = cursorAlpha(g, CURSOR_ANCHOR);
    st.cursor3d.visible = N4;
    st.apexGlow.visible = N4;
    if (N4) {
      st.cursor3d.position.copy(tlToWorld(F, 0, HT + 0.02 + CUR_H / 2, 0));
      st.cursor3d.quaternion.copy(cam.quaternion);
      st.cursor3d.material.opacity = blink * (1 - smoothstep(225, 226.5, g));
      st.apexGlow.material.uniforms.uI.value = (0.06 + 0.16 * blink) * (1 - smoothstep(224.5, 226.5, g));
      st.apexGlow.scale.set(0.3, 0.3, 1);
      st.apexGlow.material.uniforms.uCore.value = 60;
    }

    // cloud deck
    const list = [];
    const deckVis = g < 197 ? 1 : 0;
    if (deckVis) {
      const wp = new THREE.Vector3();
      for (const p of st.PUFF) {
        surfaceTL(F, p.x, p.z, p.alt + 0.01 * Math.sin(g * 0.3 + p.seed * 9), wp);
        // the eruption shock pushes the deck outward a little
        const push = g > G_ERUPT ? 0.25 * (1 - Math.exp(-(g - G_ERUPT) * 0.8)) / (0.6 + Math.hypot(p.x, p.z)) : 0;
        if (push) { const k = 1 + push; surfaceTL(F, p.x * k, p.z * k, p.alt, wp); }
        list.push({ x: wp.x, y: wp.y, z: wp.z, s: p.s, a: p.a, heat: 0, seed: p.seed, shade: 0.3 });
      }
    }
    st.puffs.set(list, cam);
    const pu = st.puffs.uniforms;
    pu.uSrcPos.value.copy(tlToWorld(F, 0, 0.15, 0));
    const tl = g >= G_ERUPT ? 1 : conv * 0.3;
    pu.uSrcCol.value.set(1, 0.66, 0.3).multiplyScalar(0.5 * tl + flash * 1.2);
    pu.uSrcRange.value = 0.7;
    pu.uSkyCol.value.set(0.012, 0.016, 0.03);
    pu.uGroundCol.value.set(0.05, 0.03, 0.015);
    pu.uFogDens.value = 0; pu.uKeyCol.value.set(0, 0, 0);
    pu.uAlbedo.value.set(0.8, 0.8, 0.8);
    pu.uTime.value = g;
  },

  draw(st, r, target) {
    r.setRenderTarget(target);
    r.setClearColor(0, 1); r.clear();
    if (st.black) return;
    r.render(st.scene, st.camera);
  },

  grade(st, t, info) {
    const g = info.global;
    const peak = smoothstep(188, 192, g) * (1 - smoothstep(207, 208, g));
    return {
      exposure: 1.0 + 0.1 * peak, saturation: 1.0, contrast: 1.05,
      tint: [1.0, 0.99, 1.02], lift: [0, 0, 0.004], vignette: 0.45, grain: 0.04,
      bloom: { strength: 0.75 + 0.45 * peak, radius: 0.65, threshold: 0.72 },
    };
  },

  overlay(st, A, t, info) {
    const g = info.global;
    if (g < 216 || g > 227) return;
    // the cursor at the apex, drawn with the prologue's own cursor routine (identical look)
    const cam = st.camera;
    const top = tlToWorld(st.F, 0, HT + 0.02 + CUR_H, 0).project(cam);
    const bot = tlToWorld(st.F, 0, HT + 0.02, 0).project(cam);
    if (top.z > 1 || bot.z > 1) return;
    const yTop = (1 - top.y) / 2 * REF_H, yBot = (1 - bot.y) / 2 * REF_H;
    const hpx = Math.abs(yBot - yTop);
    const k = hpx / CURSOR.h;
    if (k < 0.05) return;
    const cx = (top.x + bot.x) / 4 * REF_W + REF_W / 2;     // centre x (ref px)
    const cy = (yTop + yBot) / 2;
    let x = cx - CURSOR.w * k / 2, y = cy;
    // land exactly on the epilogue's spot in the final second
    const lock = smoothstep(225.6, 226.4, g);
    x = lerp(x, CURSOR.x * REF_W, lock); y = lerp(y, CURSOR.y * REF_H, lock);
    const kk = lerp(k, 1, lock);
    const a = cursorAlpha(g, CURSOR_ANCHOR) * smoothstep(216.5, 218.5, g);
    const s = A.W / REF_W;
    drawLoneCursor(A.g, s * kk, x / kk, y / kk, a, A.W, A.H);
  },
};
