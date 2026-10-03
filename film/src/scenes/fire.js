// Ⅲ 火 FIRE — the Pharos of Alexandria, 280 BCE.  Segment 81.5–94.5 (local t = global − 81.5).
// F1 0–8.5  : the star becomes the beacon (0.5W, 0.32H); pull back & down to sea level, beam sweeps the mist.
// F2 8.5–13 : 90.5 earthquake — cracks glow, the fire collapses, a waterfall of sparks; 93.0 embers on black water.
import * as THREE from 'three';
import { HITS } from '../cues.js';
import { track, smoothstep, clamp, lerp, rng, noise3, GLSL } from '../engine/util.js';

const SEG0 = 81.5;
const QUAKE = HITS.quake - SEG0;     // 9.0
const EMBER = HITS.emberOut - SEG0;  // 11.5
const FIRE = new THREE.Vector3(0, 92.2, 0);
const BEAM_HALF = THREE.MathUtils.degToRad(5.2);
const BEAM_W = THREE.MathUtils.degToRad(36);   // rad/s
const BEAM_FLASH = 7.05;                       // beam crosses the lens

// ---------------------------------------------------------------- shared GLSL
const SKY_GLSL = /* glsl */`
uniform vec3 uFire; uniform float uFireI;
vec3 skyCol(vec3 d, vec3 eye){
  float h = d.y;
  vec3 zen = vec3(0.0016, 0.0026, 0.0060);
  vec3 hor = vec3(0.011, 0.020, 0.027);
  vec3 c = mix(hor, zen, smoothstep(-0.01, 0.42, h));
  c = mix(c, hor*0.85, smoothstep(0.0, -0.08, h));
  vec3 fd = normalize(uFire - eye);
  float g = max(dot(d, fd), 0.);
  c += vec3(1.0, 0.42, 0.13) * uFireI * (pow(g, 14.) * 0.03 + pow(g, 90.) * 0.2 + pow(g, 4.) * 0.004);
  return c;
}`;

const STONE_VS = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vO;
void main(){
  vec4 p = vec4(position, 1.);
  vec3 n = normal;
#ifdef USE_INSTANCING
  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
#endif
  vO = p.xyz;
  vec4 w = modelMatrix * p;
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const STONE_FS = /* glsl */`
uniform vec3 uFire; uniform float uFireI;
uniform vec3 uSpark; uniform float uSparkI;
uniform float uCrackY, uCrackI, uTime, uWin, uDark;
uniform vec3 uAlb, uFogC;
uniform float uPattern;
varying vec3 vW; varying vec3 vN; varying vec3 vO;
${GLSL.snoise}
${GLSL.hash}
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW);
  // ashlar: courses + staggered joints
  float tang = abs(N.x) > abs(N.z) ? vO.z : vO.x;
  if (abs(N.y) > 0.7) tang = vO.x;
  float row = floor(vO.y / 1.3);
  vec2 bc = vec2(tang / 2.6 + hash11(row) * 7., vO.y / 1.3);
  vec2 f = fract(bc);
  vec2 aa = fwidth(bc) * 1.2 + 0.001;
  float joint = (1. - smoothstep(0., 0.05 + aa.x, f.x) * smoothstep(1., 0.95 - aa.x, f.x) * smoothstep(0., 0.06 + aa.y, f.y) * smoothstep(1., 0.94 - aa.y, f.y));
  float fadeP = smoothstep(0.35, 0.05, max(aa.x, aa.y));
  float blockTone = 0.82 + 0.3 * hash12(floor(bc) + row);
  float grain = 0.85 + 0.15 * snoise(vO * 0.35);
  vec3 alb = uAlb * mix(1., blockTone * grain * (1. - joint * 0.55), fadeP * uPattern);
  // beacon fire: warm point light from above
  vec3 Lv = uFire - vW; float d2 = dot(Lv, Lv); vec3 L = Lv * inversesqrt(d2);
  float ndl = max(dot(N, L), 0.);
  float wrap = max(dot(N, L) + 0.35, 0.) / 1.35;
  vec3 col = alb * vec3(1.0, 0.50, 0.19) * uFireI * 1500. / (d2 + 40.) * mix(wrap, ndl, 0.6);
  // falling sparks
  vec3 Sv = uSpark - vW; float s2 = dot(Sv, Sv);
  col += alb * vec3(1.0, 0.45, 0.12) * uSparkI * 600. / (s2 + 80.) * max(dot(N, normalize(Sv)) * 0.7 + 0.3, 0.);
  // cool mist ambient (hemisphere)
  col += alb * mix(vec3(0.004, 0.007, 0.010), vec3(0.010, 0.017, 0.024), N.y * 0.5 + 0.5) * uDark;
  // rim from the misty horizon behind
  col += alb * vec3(0.010, 0.018, 0.024) * pow(1. - max(dot(N, V), 0.), 3.) * uDark;
  // windows of the keepers: warm slits on the base
  if (uWin > 0.0 && abs(N.y) < 0.5) {
    vec2 wc = vec2(tang / 4.2, vO.y / 5.2);
    vec2 wi = floor(wc); vec2 wf = fract(wc);
    float on = step(0.62, hash12(wi + 3.1)) * step(14., vO.y) * step(vO.y, 58.);
    float slit = smoothstep(0.08, 0.0, abs(wf.x - 0.5) - 0.05) * smoothstep(0.08, 0.0, abs(wf.y - 0.5) - 0.18);
    float fl = 0.75 + 0.25 * sin(uTime * (5. + 4. * hash12(wi)) + hash12(wi) * 30.);
    col += vec3(1.0, 0.46, 0.14) * 3.2 * on * slit * fl * uWin;
  }
  // earthquake cracks: ridged noise, spreading upward from the ground
  if (uCrackI > 0.001) {
    float n1 = snoise(vO * vec3(0.045, 0.022, 0.045) + 3.7);
    float n2 = snoise(vO * vec3(0.13, 0.07, 0.13) + 1.3);
    float n = n1 + 0.45 * n2;
    float w = 0.010 + 0.016 * smoothstep(0., 30., uCrackY - vO.y) ;
    float line = smoothstep(w, 0., abs(n));
    float front = smoothstep(uCrackY + 3., uCrackY - 6., vO.y);
    float heat = line * front;
    col = mix(col, col * 0.3, heat);
    col += vec3(1.0, 0.33, 0.07) * heat * uCrackI * (6. + 10. * smoothstep(0.012, 0., abs(n)));
  }
  col = mix(col, uFogC, 1. - exp(-dist * 0.0011));
  gl_FragColor = vec4(col, 1.);
}`;

function stoneMat(u, alb, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, ...(opts.noCrack ? { uCrackI: { value: 0 } } : {}), uAlb: { value: new THREE.Color(...alb) }, uWin: { value: opts.win ?? 0 }, uPattern: { value: opts.pattern ?? 1 } },
    vertexShader: STONE_VS, fragmentShader: STONE_FS, side: opts.side ?? THREE.FrontSide,
  });
}

function flat(geo) { const g = geo.toNonIndexed(); g.computeVertexNormals(); return g; }

// place the camera at pos so that world point P lands at screen (sx, sy) (fractions, top-left origin)
function aim(cam, pos, P, sx, sy, roll = 0) {
  cam.position.copy(pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(P);
  const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  cam.rotateY(Math.atan((sx - 0.5) * 2 * tv * cam.aspect));
  cam.rotateX(-Math.atan((0.5 - sy) * 2 * tv));
  if (roll) cam.rotateZ(roll);
}

export default {
  async init({ THREE: T, aspect, H }) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, aspect, 0.5, 9000);
    const R = rng(3303);
    const pxScale = H / (2 * Math.tan(THREE.MathUtils.degToRad(13)));

    const U = {
      uFire: { value: FIRE.clone() }, uFireI: { value: 1 },
      uSpark: { value: new THREE.Vector3() }, uSparkI: { value: 0 },
      uCrackY: { value: -10 }, uCrackI: { value: 0 }, uTime: { value: 0 }, uDark: { value: 1 },
      uFogC: { value: new THREE.Color(0.009, 0.016, 0.022) },
      uBeamDir: { value: new THREE.Vector3(0, 0, 1) }, uBeamI: { value: 0 },
      uApex: { value: FIRE.clone() }, uPx: { value: pxScale },
    };

    // ---------------------------------------------------------------- sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW; ${SKY_GLSL} void main(){ vec3 d=normalize(vW-cameraPosition); gl_FragColor=vec4(skyCol(d,cameraPosition),1.); }`,
    }));
    sky.renderOrder = -10;
    scene.add(sky);

    // stars (faint, veiled by the sea mist near the horizon)
    {
      const N = 900, pos = new Float32Array(N * 3), a = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const u = R(), v = R() * 0.9 + 0.06;
        const th = u * Math.PI * 2, el = Math.asin(v);
        pos.set([Math.cos(el) * Math.sin(th) * 5000, Math.sin(el) * 5000, Math.cos(el) * Math.cos(th) * 5000], i * 3);
        a[i] = Math.pow(R(), 3) * 1.4 + 0.08;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aB', new THREE.BufferAttribute(a, 1));
      const stars = new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: U,
        vertexShader: `attribute float aB; varying float vB; uniform float uDark;
          void main(){ vec4 w=modelMatrix*vec4(position,1.); vec3 d=normalize(position);
            vB=aB*smoothstep(0.05,0.35,d.y)*uDark; gl_PointSize=2.2; gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `varying float vB; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); gl_FragColor=vec4(vec3(0.75,0.82,1.0)*vB*exp(-r*3.)*0.5,1.); }`,
      }));
      stars.frustumCulled = false;
      scene.add(stars);
      this._stars = stars;
    }

    // ---------------------------------------------------------------- sea
    const seaGeo = (() => {
      const rings = 190, segs = 300, cx = 0, cz = 230;
      const pos = [], idx = [];
      for (let i = 0; i <= rings; i++) {
        const r = i === 0 ? 0 : 1.5 * Math.pow(1.047, i) - 1.4;
        for (let j = 0; j < segs; j++) {
          const a = j / segs * Math.PI * 2;
          pos.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
        }
      }
      for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
        const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs;
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g;
    })();
    const WAVES = /* glsl */`
uniform float uQuakeSea;
float waveH(vec2 p, float t){
  float h = 0.;
  h += 0.55 * sin(dot(p, vec2(0.021, 0.034)) + t * 0.62);
  h += 0.38 * sin(dot(p, vec2(-0.043, 0.019)) + t * 0.88 + 1.3);
  h += 0.22 * sin(dot(p, vec2(0.066, -0.051)) + t * 1.21 + 2.1);
  h += 0.13 * sin(dot(p, vec2(-0.11, -0.083)) + t * 1.63 + 0.4);
  h += 0.08 * sin(dot(p, vec2(0.19, 0.14)) + t * 2.1 + 4.0);
  h *= 1. + uQuakeSea;
  return h;
}`;
    const sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({
      uniforms: { ...U, uQuakeSea: { value: 0 } }, side: THREE.DoubleSide,
      vertexShader: `${WAVES} uniform float uTime; varying vec3 vW;
        void main(){ vec4 w=modelMatrix*vec4(position,1.); float dc=length(w.xz-cameraPosition.xz);
          w.y += waveH(w.xz,uTime)*smoothstep(1800.,300.,dc); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `${WAVES} ${SKY_GLSL}
        uniform float uTime, uBeamI, uDark, uSparkI; uniform vec3 uBeamDir, uApex, uSpark, uFogC;
        varying vec3 vW;
        ${GLSL.snoise}
        void main(){
          vec2 p=vW.xz; float t=uTime; float e=0.6;
          float dc=length(vW-cameraPosition);
          float k=smoothstep(1800.,300.,dc);
          vec3 N=normalize(vec3(-(waveH(p+vec2(e,0.),t)-waveH(p-vec2(e,0.),t))/(2.*e)*k, 1., -(waveH(p+vec2(0.,e),t)-waveH(p-vec2(0.,e),t))/(2.*e)*k));
          // fine chop
          float ns=snoise(vec3(p*0.32, t*0.5)); float ns2=sin(p.x*0.93+t*1.3+sin(p.y*0.71))*sin(p.y*1.07-t*1.1+sin(p.x*0.6));
          N=normalize(N+vec3(ns*0.26+ns2*0.14, 0., snoise(vec3(p.yx*0.32+7., t*0.5))*0.26+ns2*0.08)*mix(1.,0.35,smoothstep(100.,900.,dc)));
          vec3 V=normalize(cameraPosition-vW);
          vec3 Rf=reflect(-V,N); Rf.y=abs(Rf.y);
          float fr=0.02+0.98*pow(1.-max(dot(N,V),0.),5.);
          vec3 col=vec3(0.0006,0.0010,0.0016)*uDark + skyCol(Rf, vW)*fr*uDark;
          // fire glitter streak
          vec3 L=normalize(uFire-vW);
          float rl=max(dot(Rf,L),0.);
          col+=vec3(1.0,0.46,0.14)*uFireI*(pow(rl,500.)*9.+pow(rl,60.)*0.35+pow(rl,10.)*0.02);
          // falling sparks light the water
          vec3 S=normalize(uSpark-vW); float rs=max(dot(Rf,S),0.);
          col+=vec3(1.0,0.4,0.1)*uSparkI*(pow(rs,300.)*4.+pow(rs,30.)*0.05);
          // beam light on the swell
          vec3 dA=vW-uApex; float along=dot(dA,uBeamDir); float rad=length(dA-uBeamDir*along);
          float inb=along>0.? exp(-pow(rad/(along*${Math.tan(BEAM_HALF).toFixed(4)}+1.),2.)*2.2):0.;
          vec3 LB=normalize(uApex-vW);
          col+=vec3(1.0,0.66,0.32)*uBeamI*inb*(pow(max(dot(Rf,LB),0.),160.)*3.+0.006*max(N.y,0.))*exp(-along/2500.);
          // foam at the island
          float ri=length(vW.xz*vec2(1.,1.15));
          float foam=smoothstep(10.,0.,abs(ri-46.+snoise(vec3(vW.xz*0.05,t*0.2))*7.))*smoothstep(0.1,0.6,snoise(vec3(vW.xz*0.12,t*0.4))+0.3);
          vec3 Lf=uFire-vW; col+=foam*vec3(1.,0.55,0.25)*uFireI*1500./(dot(Lf,Lf)+40.)*0.35;
          col=min(col,vec3(5.));
          vec3 vd=normalize(vW-cameraPosition); vd.y=max(vd.y,-0.02);
          col=mix(col,skyCol(vd,cameraPosition)*mix(1.,uDark,0.5),1.-exp(-dc*0.00085));
          gl_FragColor=vec4(col,1.);
        }`,
    }));
    sea.frustumCulled = false;
    scene.add(sea);
    this._sea = sea;

    // ---------------------------------------------------------------- island & rocks
    const rockMat = stoneMat(U, [0.16, 0.14, 0.12], { pattern: 0, noCrack: true });
    {
      const g = new THREE.IcosahedronGeometry(1, 5);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 0.5 + 0.5 * noise3(x * 2.1, y * 2.1, z * 2.1) + 0.25 * noise3(x * 6, y * 6, z * 6);
        const sx = 46 * (1 + 0.35 * n), sz = 40 * (1 + 0.35 * n);
        let yy = y > 0 ? Math.pow(y, 0.6) * 17 * (0.35 + 0.9 * n) : y * 8;
        p.setXYZ(i, x * sx, yy - 2.5, z * sz);
      }
      g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, rockMat));
      // scattered boulders at the waterline
      const bg = new THREE.IcosahedronGeometry(1, 1);
      const bm = new THREE.InstancedMesh(flat(bg), rockMat, 70);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < 70; i++) {
        const a = R() * Math.PI * 2, r = 40 + R() * 14, s = 1.5 + R() * 4;
        e.set(R() * 3, R() * 3, R() * 3); q.setFromEuler(e);
        m.compose(new THREE.Vector3(Math.cos(a) * r * 1.05, R() * 1.2 - 0.5, Math.sin(a) * r * 0.9), q, new THREE.Vector3(s, s * 0.7, s));
        bm.setMatrixAt(i, m);
      }
      scene.add(bm);
    }

    // ---------------------------------------------------------------- the Pharos
    const tower = new THREE.Group(); scene.add(tower);
    const lime = [0.62, 0.56, 0.46];
    const towerMat = stoneMat(U, lime, { win: 1 });
    const plainMat = stoneMat(U, lime);
    const add = (geo, mat, y = 0, rotY = 0, parent = tower) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.rotation.y = rotY; parent.add(m); return m; };
    const sq = (hwTop, hwBot, h) => flat(new THREE.CylinderGeometry(hwTop * Math.SQRT2, hwBot * Math.SQRT2, h, 4, 1));
    // podium
    add(sq(22, 23, 5), plainMat, 6.5, Math.PI / 4);
    add(sq(20.5, 20.5, 1.2), plainMat, 9.6, Math.PI / 4);
    // stage 1 — square, battered
    add(sq(10.2, 12, 52), towerMat, 10 + 26, Math.PI / 4);
    add(sq(11.4, 11.4, 1.4), plainMat, 62.4, Math.PI / 4);     // cornice
    add(sq(10.8, 10.8, 1.6), plainMat, 63.8, Math.PI / 4);     // parapet
    // corner tritons (abstract figures)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const f = add(new THREE.CylinderGeometry(0.55, 0.9, 4.4, 6), plainMat, 66.8);
      f.position.x = Math.cos(a) * 14.6; f.position.z = Math.sin(a) * 14.6;
      const h = add(new THREE.SphereGeometry(0.6, 8, 6), plainMat, 69.4); h.position.copy(f.position).setY(69.4);
    }
    // stage 2 — octagonal
    add(flat(new THREE.CylinderGeometry(5.9, 6.7, 20, 8, 1)), towerMat, 64.6 + 10, Math.PI / 8);
    add(flat(new THREE.CylinderGeometry(6.6, 6.6, 1.0, 8, 1)), plainMat, 85.1, Math.PI / 8);
    // stage 3 — lantern (falls in the quake)
    const top = new THREE.Group(); tower.add(top);
    top.position.set(0, 85.6, 0);
    add(new THREE.CylinderGeometry(4.6, 4.6, 0.9, 32), plainMat, 0.0, 0, top);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const c = add(new THREE.CylinderGeometry(0.34, 0.42, 7.6, 10), plainMat, 4.2, 0, top);
      c.position.x = Math.cos(a) * 3.9; c.position.z = Math.sin(a) * 3.9;
    }
    add(new THREE.CylinderGeometry(4.8, 4.8, 0.9, 32), plainMat, 8.4, 0, top);
    add(new THREE.CylinderGeometry(0.8, 4.6, 4.4, 32), plainMat, 11.0, 0, top);
    add(new THREE.CylinderGeometry(0.45, 0.7, 3.6, 8), plainMat, 15.0, 0, top);   // statue of Zeus Soter (abstracted)
    add(new THREE.SphereGeometry(0.75, 10, 8), plainMat, 17.3, 0, top);
    // the bronze mirror
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.ShaderMaterial({
      uniforms: U, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vP; varying vec3 vN; varying vec3 vW; void main(){ vP=position.xy; vec3 p=position; p.z=-dot(p.xy,p.xy)*0.07; vec4 w=modelMatrix*vec4(p,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*vec3(0.,0.,1.)); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uFireI; varying vec2 vP; varying vec3 vN; varying vec3 vW;
        void main(){ float r=length(vP)/2.6; vec3 V=normalize(cameraPosition-vW); float face=dot(vN,V);
          vec3 bronze=vec3(1.0,0.58,0.22);
          vec3 c = face>0. ? bronze*uFireI*(2.2*exp(-r*r*2.5)+0.5+0.6*smoothstep(0.85,0.97,r)*smoothstep(1.,0.97,r)) * (0.4+0.6*pow(face,0.5)) : bronze*0.03*uFireI;
          gl_FragColor=vec4(c,1.); }`,
    }));
    top.add(mirror);

    // ---------------------------------------------------------------- the fire
    const flameMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uFlame: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime, uFlame; varying vec2 vUv; ${GLSL.snoise}
        void main(){
          vec2 p=vUv*2.-1.; float y=vUv.y;
          float n=fbm(vec3(p.x*1.8, p.y*1.6-uTime*2.6, uTime*0.35));
          float n2=snoise(vec3(p.x*4., p.y*3.-uTime*4.2, 1.7+uTime*0.5));
          float w=mix(0.78,0.05,pow(y,0.8));
          float sh=1.-smoothstep(w*0.25, w, abs(p.x+n*0.28*y));
          sh*=smoothstep(1.0,0.15,y+n*0.45+n2*0.12)*smoothstep(0.,0.12,y)*smoothstep(1.,0.75,abs(p.x));
          float core=sh*sh;
          vec3 c=mix(vec3(1.0,0.16,0.02), vec3(1.0,0.62,0.22), sh)+vec3(0.5,0.45,0.35)*core*core;
          gl_FragColor=vec4(c*sh*uFlame*7.,1.);
        }`,
    });
    const flames = [];
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 10), flameMat);
      f.position.y = 6.6; top.add(f); flames.push(f);
    }
    // halo + star glint (screen-facing)
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 1 }, uGlint: { value: 1 }, uCol: { value: new THREE.Color(1, 0.5, 0.17) } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uI, uGlint; uniform vec3 uCol; varying vec2 vP;
        void main(){ vec2 p=vP; float r=length(p);
          float h=exp(-r*r*0.0016)*0.12+exp(-r*0.12)*0.9+0.02/(r*r*0.01+0.02)*0.4;
          float gl=(exp(-abs(p.y)*1.6)*exp(-abs(p.x)*0.045)+exp(-abs(p.x)*1.6)*exp(-abs(p.y)*0.045))*uGlint*2.2;
          vec3 c=uCol*h*uI+mix(uCol,vec3(1.,0.86,0.7),0.6)*gl;
          gl_FragColor=vec4(c,1.); }`,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), glowMat);
    halo.renderOrder = 5;
    scene.add(halo);

    // ---------------------------------------------------------------- the beam
    const beamGeo = (L, half) => { const g = new THREE.ConeGeometry(L * Math.tan(half), L, 64, 24, true); g.translate(0, -L / 2, 0); g.rotateX(-Math.PI / 2); return g; };
    const beamMat = (k, I) => new THREE.ShaderMaterial({
      uniforms: { ...U, uK: { value: k }, uBI: { value: I } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vW; varying vec3 vN; varying float vA; void main(){ vA=position.z; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime, uBeamI, uK, uBI; uniform vec3 uBeamDir, uApex; varying vec3 vW; varying vec3 vN; varying float vA; ${GLSL.snoise}
        void main(){ vec3 V=normalize(cameraPosition-vW); float f=pow(abs(dot(normalize(vN),V)),uK);
          float a=vA;
          float fall=exp(-a/900.)*smoothstep(0.,25.,a);
          float n=snoise(vW*vec3(0.010,0.03,0.010)+vec3(-uTime*0.25,0.,uTime*0.12))*0.5+0.5;
          float n2=0.5+0.5*sin(vW.x*0.05+uTime*0.4)*sin(vW.z*0.043-uTime*0.3+vW.y*0.03);
          float mist=mix(0.25,1.4,n)*mix(0.7,1.2,n2);
          // fade near the lens so the cone never shows its hull
          float dcam=length(cameraPosition-vW); float nearF=smoothstep(15.,120.,dcam);
          float h=smoothstep(-2.,12.,vW.y);
          vec3 c=vec3(1.0,0.68,0.34)*f*fall*mist*uBeamI*uBI*nearF*h;
          gl_FragColor=vec4(c,1.); }`,
    });
    const beam = new THREE.Group(); scene.add(beam);
    beam.add(new THREE.Mesh(beamGeo(2600, BEAM_HALF), beamMat(2.2, 0.16)));
    beam.add(new THREE.Mesh(beamGeo(2600, BEAM_HALF * 0.45), beamMat(1.6, 0.14)));
    beam.children.forEach(m => { m.frustumCulled = false; });

    // ---------------------------------------------------------------- sea mist lit by beam & fire
    {
      const N = 2600, pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2, r = 20 + Math.pow(R(), 0.7) * 1100;
        pos.set([Math.cos(a) * r, Math.pow(R(), 2.2) * 140 + 2, Math.sin(a) * r * 0.9 + 60], i * 3);
        sd.set([R(), R(), R(), R()], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
      const mist = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec4 aS; uniform float uTime, uBeamI, uFireI, uPx, uDark; uniform vec3 uBeamDir, uApex, uFire; varying vec3 vC; varying float vA;
          void main(){
            vec3 p=position; p.x+=uTime*(2.+aS.x*3.)+sin(uTime*0.3+aS.y*20.)*3.; p.z+=sin(uTime*0.2+aS.z*30.)*4.;
            vec3 d=p-uApex; float al=dot(d,uBeamDir); float rad=length(d-uBeamDir*al);
            float b=al>0.? exp(-pow(rad/(al*${Math.tan(BEAM_HALF * 1.15).toFixed(4)}+2.),2.)*2.)*exp(-al/1100.):0.;
            vec3 df=p-uFire; float fg=uFireI*900./(dot(df,df)+300.);
            vC=vec3(1.0,0.66,0.32)*b*uBeamI*0.06 + vec3(1.0,0.45,0.15)*fg*0.014 + vec3(0.10,0.16,0.19)*0.0022*uDark;
            vec4 mv=modelViewMatrix*vec4(p,1.);
            float size=(14.+aS.w*40.);
            gl_PointSize=min(size*uPx/-mv.z, 260.);
            float dc=-mv.z; vA=smoothstep(25.,180.,dc)*(0.6+0.4*aS.y);
            gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vC*vA*exp(-r*3.2)*(1.-r),1.); }`,
      }));
      mist.frustumCulled = false;
      scene.add(mist);
    }

    // ---------------------------------------------------------------- small lights: keepers, harbour
    {
      const N = 70, pos = new Float32Array(N * 3), sd = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2, r = 24 + R() * 30;
        pos.set([Math.cos(a) * r, 5 + R() * 4, Math.sin(a) * r * 0.85], i * 3); sd[i] = R();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
      const lights = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: { ...U, uOn: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aS; uniform float uTime, uOn; varying float vB; void main(){ vB=uOn*(0.6+0.4*sin(uTime*(4.+aS*5.)+aS*40.)); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=max(2.5, 900./-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vB; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); gl_FragColor=vec4(vec3(1.,0.5,0.16)*vB*exp(-r*4.)*2.2,1.); }`,
      }));
      lights.frustumCulled = false;
      scene.add(lights);
      this._isleLights = lights;
    }

    // ---------------------------------------------------------------- ships
    const ships = [];
    {
      const hull = new THREE.Shape();
      hull.moveTo(-13, 3.2); hull.quadraticCurveTo(-12.5, 0.6, -9, -1.2); hull.lineTo(8, -1.2);
      hull.quadraticCurveTo(12, -0.6, 13, 2.6); hull.quadraticCurveTo(13.6, 4.4, 12.4, 5.6); hull.quadraticCurveTo(13, 3.6, 11.5, 1.8);
      hull.lineTo(-11.8, 1.8); hull.quadraticCurveTo(-14.6, 4.0, -15.2, 7.4); hull.quadraticCurveTo(-14.4, 4.6, -13, 3.2);
      const hg = new THREE.ExtrudeGeometry(hull, { depth: 4.6, bevelEnabled: false }); hg.translate(0, 0, -2.3);
      const dark = new THREE.ShaderMaterial({
        uniforms: U, side: THREE.DoubleSide,
        vertexShader: STONE_VS,
        fragmentShader: `uniform vec3 uFire, uFogC; uniform float uFireI; varying vec3 vW; varying vec3 vN; void main(){
          vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N; vec3 L=uFire-vW; float d2=dot(L,L);
          vec3 c=vec3(0.06,0.045,0.035)*vec3(1.,0.5,0.2)*uFireI*1500./(d2+40.)*max(dot(N,normalize(L)),0.)+vec3(0.0008,0.001,0.0013);
          c=mix(c,uFogC,1.-exp(-length(cameraPosition-vW)*0.0011)); gl_FragColor=vec4(c,1.); }`,
      });
      const mk = (scale, sail) => {
        const s = new THREE.Group();
        s.add(new THREE.Mesh(hg, dark));
        const mast = new THREE.Mesh(new THREE.BoxGeometry(0.35, 15, 0.35), dark); mast.position.set(-1, 9, 0); s.add(mast);
        const yard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 13), dark); yard.position.set(-1, 15.5, 0); s.add(yard);
        if (sail) {
          const sg = new THREE.PlaneGeometry(12, 9, 8, 6); const p = sg.attributes.position;
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, (1 - (x / 6) ** 2) * 1.4 * (0.6 + 0.4 * (y / 4.5 + 0.5))); }
          sg.rotateY(Math.PI / 2);
          const sm = new THREE.Mesh(sg, dark); sm.position.set(-0.6, 11, 0); s.add(sm);
        }
        // oars
        for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
          const o = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 6), dark);
          o.position.set(-8 + i * 1.9, 0.6, side * 4.6); o.rotation.x = side * 0.5; s.add(o);
        }
        s.scale.setScalar(scale);
        scene.add(s);
        return s;
      };
      ships.push({ g: mk(1.0, true), x0: -128, x1: -82, z: 222, ry: 0.75, ph: 0.0 });
      ships.push({ g: mk(1.0, true), x0: 165, x1: 128, z: 90, ry: -0.8, ph: 1.7 });
      ships.push({ g: mk(1.0, false), x0: -330, x1: -300, z: -200, ry: 0.6, ph: 3.1 });
      ships.push({ g: mk(0.9, true), x0: 420, x1: 395, z: -420, ry: -0.2, ph: 4.4 });
      // ship lamps
      const N = ships.length * 2, pos = new Float32Array(N * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const lamps = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime; varying float vB; void main(){ vB=(0.8+0.2*sin(uTime*7.+position.x))*(1.-smoothstep(11.6,12.9,uTime)*0.85); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=max(3., 2400./-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vB; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); gl_FragColor=vec4(vec3(1.,0.55,0.2)*vB*(exp(-r*14.)*5.+exp(-r*3.)*0.5),1.); }`,
      }));
      lamps.frustumCulled = false;
      scene.add(lamps);
      this._lamps = lamps;
    }

    // ---------------------------------------------------------------- sparks & embers
    {
      const N = 9000, birth = new Float32Array(N), vel = new Float32Array(N * 3), sd = new Float32Array(N * 4), pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2;
        const r = 4 + R() * 3;
        pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
        birth[i] = QUAKE + 0.1 + Math.pow(R(), 1.6) * 1.1;
        const sp = 1 + Math.abs(R.gauss()) * 6;
        // waterfall pours mostly toward the lens side (+z) and right (downwind)
        const bias = 0.6;
        let vx = Math.cos(a) * sp + 2.5, vz = Math.sin(a) * sp + bias * 6;
        vel.set([vx, R.gauss() * 4 + 1, vz], i * 3);
        sd.set([R(), R(), R(), R()], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
      g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
      const sparks = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: { ...U, uOrigin: { value: new THREE.Vector3(0, 90, 0) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aBirth; attribute vec3 aVel; attribute vec4 aS; uniform float uTime, uPx; uniform vec3 uOrigin; varying vec3 vC; varying float vR;
          ${GLSL.snoise}
          void main(){
            float age=uTime-aBirth; vC=vec3(0.); gl_PointSize=0.; gl_Position=vec4(2.,2.,2.,1.);
            if(age<0.) return;
            float g=44.;
            vec3 p=uOrigin+position+aVel*age+vec3(0.,-0.5*g*age*age,0.);
            // tumble in the hot air
            p+=vec3(snoise(vec3(aS.xy*9., age*1.5)), 0., snoise(vec3(aS.zw*9., age*1.5)))*age*2.5;
            float land=(aVel.y+sqrt(aVel.y*aVel.y+2.*g*uOrigin.y))/g;
            float floating=step(aS.w,0.07);
            float heat;
            if(age>land){
              if(floating<0.5){ float k=age-land; if(k>0.18) return; heat=(1.-k/0.18)*1.6; p=uOrigin+position+aVel*land; p.y=0.4; vR=2.; }
              else { float k=age-land; p=uOrigin+position+aVel*land; p.x+=k*1.2; p.z+=sin(k*0.7+aS.x*20.)*0.6; p.y=0.35+sin(uTime*1.3+aS.y*30.)*0.25; heat=exp(-k*0.35)*(0.55+0.45*sin(uTime*(2.+aS.z*3.)+aS.x*50.)); vR=1.; }
            } else { heat=exp(-age*0.55)*(0.6+0.4*aS.y)+0.25; vR=0.; }
            vec3 hot=mix(vec3(1.,0.18,0.02), vec3(1.,0.7,0.35), clamp(heat-0.3,0.,1.));
            vC=hot*heat*(vR>1.5?3.:vR>0.5?3.0:0.8+aS.z*1.4);
            vec4 mv=modelViewMatrix*vec4(p,1.);
            gl_PointSize=clamp((0.3+aS.x*0.45)*uPx/-mv.z, 1.2, 9.);
            gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vC; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vC*exp(-r*3.),1.); }`,
      }));
      sparks.frustumCulled = false;
      scene.add(sparks);
      this._sparks = sparks;
    }
    // falling stones
    const chunks = new THREE.InstancedMesh(flat(new THREE.BoxGeometry(1, 1, 1)), plainMat, 46);
    const chunkData = [];
    for (let i = 0; i < 46; i++) chunkData.push({ a: R() * Math.PI * 2, r: 3 + R() * 6, y: 82 + R() * 12, t0: QUAKE + 0.4 + R() * 1.2, v: 2 + R() * 6, s: 0.6 + R() * 1.8, spin: [R() * 4, R() * 4, R() * 4] });
    scene.add(chunks);

    return { scene, camera, clearColor: 0x000000, U, towerMat, tower, top, mirror, flames, flameMat, halo, glowMat, beam, ships, chunks, chunkData, sea: this._sea, sparks: this._sparks, lamps: this._lamps, isle: this._isleLights, stars: this._stars };
  },

  update(S, t) {
    const { U, camera } = S;
    U.uTime.value = t;
    // --------------------------------------------------- fire & light timeline
    const quakeK = clamp((t - QUAKE) / 1.6);
    const fireI = (0.25 + 0.75 * smoothstep(0.6, 3.0, t)) * (1 - smoothstep(QUAKE + 0.5, QUAKE + 1.7, t)) * (1 + 0.3 * Math.exp(-Math.max(0, t - QUAKE) * 3) * (t > QUAKE ? 1 : 0))
      * (0.93 + 0.07 * noise3(t * 3.1, 0.3, 0));
    U.uFireI.value = fireI;
    const dark = smoothstep(0.0, 2.6, t) * (1 - 0.75 * smoothstep(QUAKE + 1.5, EMBER + 0.6, t));
    U.uDark.value = dark;
    U.uBeamI.value = smoothstep(1.4, 3.4, t) * (1 - smoothstep(QUAKE + 0.4, QUAKE + 1.4, t));
    S.isle.material.uniforms.uOn.value = dark * (1 - smoothstep(QUAKE + 0.4, QUAKE + 2.0, t) * 0.85);

    S.towerMat.uniforms.uWin.value = 1 - smoothstep(QUAKE + 0.2, QUAKE + 1.4, t);
    // lantern collapse: tilts toward the lens/right and drops into the tower
    const fall = smoothstep(QUAKE + 0.5, QUAKE + 2.4, t);
    const ff = fall * fall;
    S.top.position.set(ff * 6, 85.6 - ff * 30, ff * 4);
    S.top.rotation.set(ff * 0.45, 0, -ff * 0.7);
    // spark light follows the cascade downwards
    const sk = clamp((t - QUAKE - 0.2) / 2.4);
    U.uSpark.value.set(4, 88 - 85 * sk * sk, 9);
    U.uSparkI.value = smoothstep(QUAKE, QUAKE + 0.4, t) * (1 - smoothstep(QUAKE + 1.6, EMBER + 0.2, t)) * 0.6;
    U.uCrackY.value = 6 + 95 * smoothstep(QUAKE - 0.05, QUAKE + 1.4, t);
    U.uCrackI.value = smoothstep(QUAKE, QUAKE + 0.25, t) * (0.25 + 0.75 * Math.exp(-Math.max(0, t - QUAKE - 0.6) * 1.0)) * (1 - smoothstep(EMBER - 1.2, EMBER + 0.6, t) * 0.97);
    S.sea.material.uniforms.uQuakeSea.value = 0.8 * smoothstep(QUAKE, QUAKE + 0.8, t) * Math.exp(-Math.max(0, t - QUAKE - 0.8) * 0.6);

    // --------------------------------------------------- camera
    const pull = smoothstep(1.2, 8.2, t);
    const pe = pull * pull * (3 - 2 * pull) * 0.5 + pull * 0.5;
    const dist = lerp(150, 318, pe) + t * 1.6;
    const h = lerp(91, 4.6, Math.pow(pe, 0.85));
    const az = THREE.MathUtils.degToRad(lerp(4, -7, pe) - t * 0.25);
    camera.fov = lerp(24, 31, pe);
    camera.updateProjectionMatrix();
    const pos = new THREE.Vector3(Math.sin(az) * dist, h, Math.cos(az) * dist);
    const sx = lerp(0.5, 0.64, smoothstep(1.2, 4.2, t));
    const sy = lerp(0.32, 0.25, smoothstep(1.4, 7.5, t));
    // earthquake: heavy low-frequency shake
    const qa = t > QUAKE ? Math.min(1, (t - QUAKE) / 0.08) * Math.exp(-(t - QUAKE) * 0.85) : 0;
    const shx = qa * (noise3(t * 4.2, 1.1, 0) * 0.012 + noise3(t * 9, 2.2, 0) * 0.004);
    const shy = qa * (noise3(t * 3.6, 5.3, 0) * 0.016 + noise3(t * 8.5, 7.7, 0) * 0.005);
    aim(camera, pos, FIRE, sx + shx, sy + shy, qa * noise3(t * 3, 9, 0) * 0.012);
    camera.updateMatrixWorld();

    // --------------------------------------------------- beam & mirror
    const camAz = Math.atan2(camera.position.x, camera.position.z);
    const ba = camAz + BEAM_W * (t - BEAM_FLASH);
    const bd = new THREE.Vector3(Math.sin(ba), -0.035 - 0.09 * Math.exp(-(((t - BEAM_FLASH) / 1.1) ** 2)), Math.cos(ba)).normalize();
    U.uBeamDir.value.copy(bd);
    const apex = new THREE.Vector3(0, 6.6, 0).applyMatrix4(S.top.matrixWorld);
    S.top.updateMatrixWorld();
    apex.set(0, 6.6, 0).applyMatrix4(S.top.matrixWorld);
    U.uApex.value.copy(apex);
    U.uFire.value.copy(apex);
    S.beam.position.copy(apex);
    S.beam.lookAt(apex.clone().add(bd));
    // mirror sits behind the fire, facing along the beam (in the lantern's local frame)
    const inv = new THREE.Matrix4().copy(S.top.matrixWorld).invert();
    const bl = bd.clone().transformDirection(inv);
    S.mirror.position.set(-bl.x * 2.4, 5.4, -bl.z * 2.4);
    S.mirror.lookAt(S.mirror.getWorldPosition(new THREE.Vector3()).add(bd));

    // flames: two crossed billboards around the vertical axis
    const camL = camera.position.clone().applyMatrix4(inv);
    const fa = Math.atan2(camL.x, camL.z);
    S.flames[0].rotation.y = fa; S.flames[1].rotation.y = fa + 0.9;
    S.flames.forEach((f, i) => { f.scale.set(1, lerp(0.15, 1, smoothstep(0.6, 2.8, t)) * (1 + (i ? 0.1 : 0)), 1); f.position.y = 6.6 + (f.scale.y - 1) * -4; });
    S.flameMat.uniforms.uFlame.value = fireI;

    // halo & glint: at first the beacon is a star
    S.halo.position.copy(apex);
    S.halo.quaternion.copy(camera.quaternion);
    const toCam = camera.position.clone().sub(apex).normalize();
    const flash = Math.pow(Math.max(0, toCam.dot(bd)), 1) ;
    const flashK = smoothstep(Math.cos(BEAM_HALF * 2.4), 1, flash) * U.uBeamI.value;
    S.glowMat.uniforms.uI.value = (fireI + 1.2 * (1 - smoothstep(1.2, 3.0, t))) * (1 + 9 * flashK);
    S.glowMat.uniforms.uGlint.value = (1 - smoothstep(0.8, 2.6, t)) * 2.2 + flashK * 1.2;
    const sc = lerp(0.35, 1, smoothstep(0.4, 4, t)) * (1 + flashK * 3);
    S.halo.scale.setScalar(sc * camera.position.distanceTo(apex) / 300);

    // --------------------------------------------------- ships
    for (const sh of S.ships) {
      const u = t / 13;
      sh.g.position.set(lerp(sh.x0, sh.x1, u), Math.sin(t * 0.9 + sh.ph) * 0.35 - 0.6, sh.z);
      sh.g.rotation.set(Math.sin(t * 0.7 + sh.ph) * 0.03, sh.ry, Math.sin(t * 0.55 + sh.ph * 2) * 0.05);
      sh.g.updateMatrixWorld();
    }
    const lp = S.lamps.geometry.attributes.position;
    S.ships.forEach((sh, i) => {
      const a = new THREE.Vector3(-13.6, 4.5, 0).applyMatrix4(sh.g.matrixWorld);
      const b = new THREE.Vector3(-1, 15.2, 0).applyMatrix4(sh.g.matrixWorld);
      lp.setXYZ(i * 2, a.x, a.y, a.z); lp.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    });
    lp.needsUpdate = true;

    // --------------------------------------------------- sparks & stones
    const su = S.sparks.material.uniforms;
    su.uOrigin.value.set(0, 89, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc3 = new THREE.Vector3();
    S.chunkData.forEach((c, i) => {
      const age = t - c.t0;
      if (age < 0) { m.makeScale(0, 0, 0); S.chunks.setMatrixAt(i, m); return; }
      const y = c.y - 0.5 * 30 * age * age;
      if (y < -3) { m.makeScale(0, 0, 0); S.chunks.setMatrixAt(i, m); return; }
      v.set(Math.cos(c.a) * (c.r + c.v * age) + 2 * age, y, Math.sin(c.a) * (c.r + c.v * age) + 3 * age);
      e.set(c.spin[0] * age, c.spin[1] * age, c.spin[2] * age); q.setFromEuler(e);
      m.compose(v, q, sc3.setScalar(c.s)); S.chunks.setMatrixAt(i, m);
    });
    S.chunks.instanceMatrix.needsUpdate = true;
  },

  grade(S, t) {
    const q = t - QUAKE;
    return {
      exposure: 1.05 * (1 - 0.25 * smoothstep(EMBER, 13, t)),
      contrast: 1.06,
      saturation: 1.05,
      tint: [1.04, 0.98, 0.94],
      lift: [0.0, 0.004, 0.009],
      gamma: [1.0, 1.0, 1.02],
      gain: [1.03, 1.0, 0.96],
      vignette: 0.45,
      grain: 0.05,
      aberration: 0.0018 + (q > 0 ? 0.004 * Math.exp(-q * 1.2) : 0),
      bloom: { strength: 0.85, radius: 0.62, threshold: 0.7 },
    };
  },
};
