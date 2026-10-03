// Ⅴ 信 FAITH — Cologne cathedral, 1248.  Segment 108–128.5 (local t = global − 108).
// C1 0–1.6 : a great bronze bell swings through a dark belfry; 108.4 it strikes (dust, light pulse).
//    1.6–8 : the nave from below — clustered piers, ribbed quadripartite vaults, jewel-coloured shafts, candles.
// C2 8–20.5: the camera rises up the nave, accelerating, into the west rose window; the tracery turns
//            and (126–128.5) its spokes and lancets become gear teeth (match to IRON).
import * as THREE from 'three';
import { HITS } from '../cues.js';
import { track, smoothstep, clamp, lerp, rng, noise3, GLSL } from '../engine/util.js';

const SEG0 = 108;
const STRIKE = HITS.bigBell - SEG0;   // 0.4
const CUT = 1.62;
const GEAR0 = 126 - SEG0, GEAR1 = 128.5 - SEG0;   // 18 → 20.5

// nave measurements (metres)
const BAY = 7.5, NB = 16, Z0 = -60;          // bays from z=-60 to z=+60
const W = 7.0;                               // pier-centre half width
const XW = 7.9;                              // nave wall plane
const YS = 28, APEX = 15;                    // vault springing & rise
const XA = XW + 9;                           // aisle outer wall
const ZWEST = -61.8;
const ROSE = { y: 31.5, r: 7.2 };
const SUN = new THREE.Vector3(-0.45, -0.85, 0.27).normalize();

function archR(span) { return (APEX * APEX + span * span / 4) / span; }
const RL = archR(2 * W), CL = RL - W;
const RT = archR(BAY), CT = RT - BAY / 2;
const hL = x => Math.sqrt(Math.max(0, RL * RL - (CL + Math.min(W, Math.abs(x))) ** 2));
const hT = z => Math.sqrt(Math.max(0, RT * RT - (CT + Math.min(BAY / 2, Math.abs(z))) ** 2));
const vaultY = (x, zl) => YS + Math.max(hL(x), hT(zl));

// ------------------------------------------------------------------ GLSL
const GLASS = /* glsl */`
${GLSL.hash}
// stained glass colour for a pane coordinate (in metres) inside a window; seed varies per window
vec3 glassCol(vec2 q, float seed){
  vec2 c=floor(q*vec2(3.4,2.6)); float h=hash12(c+seed*13.7); float h2=hash12(c*1.7+seed*3.1+7.);
  vec3 ruby=vec3(1.0,0.04,0.06), cobalt=vec3(0.07,0.16,1.0), gold=vec3(1.0,0.62,0.08), green=vec3(0.1,0.6,0.25), pale=vec3(0.85,0.8,0.65);
  vec3 col = h<0.5? cobalt : h<0.79? ruby : h<0.91? gold : h<0.96? green : pale;
  vec2 f=fract(q*vec2(3.4,2.6));
  float lead=smoothstep(0.06,0.0,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
  return col*(0.65+0.7*h2)*(1.-0.85*lead);
}
// clerestory window: zl in [-2.9,2.9] centred in bay, y absolute. returns mask (glass=1) and stone tracery
float clerestory(float zl, float y){
  float hw=2.9, ys=35.6;
  if(y<26.8) return 0.;
  float az=abs(zl);
  float inside = y<ys ? step(az,hw) : step((az+hw)*(az+hw)+(y-ys)*(y-ys), (2.*hw)*(2.*hw));
  // mullions (4 lancets) up to the springing, then a circle
  float mul=0.;
  if(y<ys+0.9){ float m=min(abs(zl), abs(az-1.45)); mul=step(m,0.11);
    // lancet heads
    float lz=az<1.45? az: az-1.45; float lc=0.725; float ly=y-(ys-0.6);
    if(ly>0.){ float d=abs(length(vec2(abs(lz-lc*(az<1.45?0.5:0.5))+0.36, ly))-0.75); }
  } else { float d=abs(length(vec2(zl, y-(ys+2.6)))-1.35); mul=step(d,0.12); mul=max(mul, step(abs(zl),0.1)*step(y,ys+1.25)); }
  float frame=inside*(1.-step(az,hw-0.18)*(y<ys? 1.: step((az+hw)*(az+hw)+(y-ys)*(y-ys), (2.*hw-0.18)*(2.*hw-0.18))));
  frame=max(frame, inside*step(y,27.0));
  return inside*(1.-max(mul,frame));
}
float clerestoryIn(float zl, float y){ float hw=2.9, ys=35.6; float az=abs(zl); if(y<26.8) return 0.; return y<ys ? step(az,hw) : step((az+hw)*(az+hw)+(y-ys)*(y-ys), (2.*hw)*(2.*hw)); }
`;

const VS = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){
  vec4 p=vec4(position,1.); vec3 n=normal;
#ifdef USE_INSTANCING
  p=instanceMatrix*p; n=mat3(instanceMatrix)*n;
#endif
  vec4 w=modelMatrix*p; vW=w.xyz; vN=normalize(mat3(modelMatrix)*n);
  gl_Position=projectionMatrix*viewMatrix*w;
}`;

// stone everywhere in the nave; uMode: 0 generic stone (piers, vault, ribs), 1 nave wall, 2 aisle wall, 3 west wall, 4 floor
const STONE_FS = /* glsl */`
uniform float uMode, uSide, uTime, uGlass, uCand;
uniform vec3 uSun;
varying vec3 vW; varying vec3 vN;
${GLASS}
${GLSL.snoise}
float bayLocal(float z){ return mod(z - ${Z0.toFixed(1)}, ${BAY.toFixed(2)}) - ${(BAY / 2).toFixed(2)}; }
float bayIdx(float z){ return floor((z - ${Z0.toFixed(1)}) / ${BAY.toFixed(2)}); }
vec3 stained(vec3 p, vec3 N){
  // trace back along the sun direction to the +x clerestory plane
  float t=(${XW.toFixed(2)}-p.x)/(-uSun.x);
  if(t<0.3) return vec3(0.);
  vec3 q=p-uSun*t;
  float zl=bayLocal(q.z);
  float m=clerestory(zl,q.y);
  if(m<0.01) return vec3(0.);
  float ndl=max(dot(N,-uSun),0.);
  return glassCol(vec2(zl,q.y), bayIdx(q.z))*m*ndl*0.7;
}
void main(){
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 p=vW;
  vec3 em=vec3(0.);
  vec3 alb=vec3(0.30,0.31,0.34);
  float zl=bayLocal(p.z), bi=bayIdx(p.z);
  if(uMode>0.5 && uMode<1.5){                 // nave wall: arcade (open), triforium, clerestory
    float az=abs(zl);
    float hw=2.55, ys=15.0;
    float arc = p.y<ys ? step(az,hw) : step((az+hw)*(az+hw)+(p.y-ys)*(p.y-ys),(2.*hw)*(2.*hw));
    if(arc>0.5) discard;
    // triforium: 4 small glazed arches per bay
    if(p.y>20.6 && p.y<25.6){
      float u=fract((zl+3.4)/1.7); float uz=(u-0.5)*1.7; float a=abs(uz);
      float ins = p.y<24.2 ? step(a,0.62) : step((a+0.62)*(a+0.62)+(p.y-24.2)*(p.y-24.2),1.24*1.24);
      ins*=step(az,3.3)*step(21.0,p.y);
      em+=glassCol(vec2(zl*2.,p.y*2.),bi+40.)*ins*0.22*uGlass*mix(0.5,1.,uSide);
      alb*=1.-0.75*ins;
    }
    float g=clerestory(zl,p.y), gi=clerestoryIn(zl,p.y);
    em+=glassCol(vec2(zl,p.y),bi+uSide*17.)*g*uGlass*mix(1.1,2.0,uSide);
    alb*=1.-0.8*gi;
    // horizontal string courses
    alb*=1.+0.25*smoothstep(0.12,0.,abs(p.y-20.4))+0.2*smoothstep(0.1,0.,abs(p.y-26.6));
  } else if(uMode>1.5 && uMode<2.5){          // aisle wall: tall lancets
    float az=abs(zl); float hw=2.2, ys=11.;
    float ins = p.y<ys ? step(az,hw)*step(2.6,p.y) : step((az+hw)*(az+hw)+(p.y-ys)*(p.y-ys),(2.*hw)*(2.*hw));
    float mul=step(abs(az-1.1),0.08)*step(p.y,ys+0.5)+step(az,0.08);
    em+=glassCol(vec2(zl,p.y)*1.2,bi+uSide*5.+60.)*ins*(1.-min(mul,1.))*uGlass*mix(0.7,1.3,uSide);
    alb*=1.-0.8*ins;
  } else if(uMode>2.5 && uMode<3.5){          // west wall: gallery of lancets under the rose, dark portal
    float u=fract((p.x+8.)/2.); float a=abs(u-0.5)*2.;
    float ins=step(18.4,p.y)*step(p.y,22.6)*step(a,0.55)*step(abs(p.x),7.2);
    em+=glassCol(vec2(p.x*2.,p.y),70.)*ins*0.9*uGlass;
    float portal=step(abs(p.x),2.6)*step(p.y,9.+sqrt(max(0.,9.-p.x*p.x)));
    alb*=(1.-0.8*ins)*(1.-0.9*portal);
  } else if(uMode>3.5){                       // floor: worn slabs
    vec2 f=fract(p.xz/1.25); float j=smoothstep(0.03,0.0,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
    float h=hash12(floor(p.xz/1.25));
    alb=vec3(0.24,0.24,0.26)*(0.8+0.3*h)*(1.-0.4*j);
  }
  // ashlar texture on stone
  float n=snoise(p*vec3(0.9,0.5,0.9))*0.5+0.5;
  alb*=0.85+0.25*n;
  // light: cool window fill (stronger high in the nave), candles near the floor, stained sun patches
  vec3 amb=mix(vec3(0.018,0.020,0.028), vec3(0.085,0.090,0.115), smoothstep(2.,40.,p.y))*(0.65+0.35*max(N.y*-1.,0.)+0.3*abs(N.x));
  amb+=vec3(0.030,0.034,0.060)*max(-N.x,0.)*smoothstep(6.,35.,p.y);      // facing the sunlit side
  float cz=smoothstep(46.,38.,abs(p.z))*smoothstep(9.,4.,abs(p.x));
  vec3 cand=vec3(1.0,0.5,0.2)*uCand*(0.05*exp(-p.y/2.2)*cz + 0.008*exp(-p.y/9.)*smoothstep(50.,30.,abs(p.z)));
  vec3 c=alb*(amb+cand+stained(p,N)*uGlass);
  c+=em;
  float d=length(cameraPosition-p);
  c=mix(c, vec3(0.010,0.011,0.016), 1.-exp(-d*0.006));
  gl_FragColor=vec4(c,1.);
}`;

function flat(geo) { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; }
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export default {
  async init({ aspect, H }) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 2000);
    const R = rng(1248);
    const U = {
      uTime: { value: 0 }, uSun: { value: SUN.clone() }, uGlass: { value: 1 }, uCand: { value: 1 },
      uPx: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(17))) },
    };
    const stone = (mode, side = 1, cull = THREE.DoubleSide) => new THREE.ShaderMaterial({
      uniforms: { ...U, uMode: { value: mode }, uSide: { value: side } }, vertexShader: VS, fragmentShader: STONE_FS, side: cull,
    });
    const nave = new THREE.Group(); scene.add(nave);
    const sGen = stone(0);

    // ---------------------------------------------------------------- walls, floor, aisles
    const plane = (w, h, mat, pos, rotY) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat); m.position.copy(pos); m.rotation.y = rotY; nave.add(m); return m; };
    const L = NB * BAY;
    plane(L, 46, stone(1, 1), new THREE.Vector3(XW, 23, 0), -Math.PI / 2);
    plane(L, 46, stone(1, 0), new THREE.Vector3(-XW, 23, 0), Math.PI / 2);
    plane(L, 18, stone(2, 1), new THREE.Vector3(XA, 9, 0), -Math.PI / 2);
    plane(L, 18, stone(2, 0), new THREE.Vector3(-XA, 9, 0), Math.PI / 2);
    plane(2 * XA + 2, 48, stone(3), new THREE.Vector3(0, 24, ZWEST - 0.2), 0);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * XA, L + 10).rotateX(-Math.PI / 2), stone(4)); fl.position.set(0, 0, 0); nave.add(fl);
    // aisle ceilings (simple barrel) and the wall above the arcade seen from the aisles
    for (const s of [-1, 1]) {
      // flat soffit band
      const b = new THREE.Mesh(new THREE.PlaneGeometry(XA - XW, L).rotateX(Math.PI / 2), sGen); b.position.set(s * (XW + XA) / 2, 19.8, 0); nave.add(b);
    }

    // ---------------------------------------------------------------- vault
    {
      const NX = 40, NZ = NB * 20;
      const pos = [], idx = [];
      for (let i = 0; i <= NZ; i++) for (let j = 0; j <= NX; j++) {
        const z = Z0 + i / NZ * L, x = -XW + j / NX * 2 * XW;
        const zl = ((z - Z0) % BAY + BAY) % BAY - BAY / 2;
        pos.push(x, vaultY(Math.abs(x) > W ? W : x, zl) + (Math.abs(x) > W ? -(Math.abs(x) - W) * 0.0 : 0), z);
      }
      for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) { const a = i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      nave.add(new THREE.Mesh(g, sGen));
      // ribs: diagonals, transverse, wall ribs + bosses
      const geos = [];
      const tube = (fn, r, n = 40) => { const pts = []; for (let k = 0; k <= n; k++) pts.push(fn(k / n)); geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, r, 6, false)); };
      for (let b = 0; b < NB; b++) {
        const zc = Z0 + (b + 0.5) * BAY;
        for (const s of [-1, 1]) tube(u => { const x = -W + 2 * W * u, zl = s * (-BAY / 2 + BAY * u); return new THREE.Vector3(x, vaultY(x, zl) - 0.18, zc + zl); }, 0.24);
        tube(u => { const x = -W + 2 * W * u; return new THREE.Vector3(x, YS + hL(x) - 0.2, zc - BAY / 2); }, 0.32);
        for (const s of [-1, 1]) tube(u => { const zl = -BAY / 2 + BAY * u; return new THREE.Vector3(s * (W - 0.1), YS + hT(zl) - 0.1, zc + zl); }, 0.18, 24);
        const boss = new THREE.SphereGeometry(0.5, 10, 8); boss.translate(0, YS + APEX - 0.35, zc); geos.push(boss);
        // ridge rib
      }
      tube(u => { const x = -W + 2 * W * u; return new THREE.Vector3(x, YS + hL(x) - 0.2, Z0 + NB * BAY); }, 0.32);
      tube(u => new THREE.Vector3(0, YS + APEX - 0.25, Z0 + u * L), 0.16, 120);
      nave.add(new THREE.Mesh(mergeGeos(geos), stone(0)));
    }

    // ---------------------------------------------------------------- clustered piers
    {
      const parts = [];
      const core = new THREE.CylinderGeometry(1.0, 1.0, YS, 16); core.translate(0, YS / 2, 0); parts.push(core);
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, rr = k % 3 === 0 ? 0.36 : 0.22;
        const sh = new THREE.CylinderGeometry(rr, rr, YS + 0.5, 8); sh.translate(Math.cos(a) * 1.02, (YS + 0.5) / 2, Math.sin(a) * 1.02); parts.push(sh);
      }
      const base = new THREE.CylinderGeometry(1.7, 1.85, 1.3, 8); base.translate(0, 0.65, 0); parts.push(base);
      const base2 = new THREE.CylinderGeometry(1.45, 1.6, 0.5, 16); base2.translate(0, 1.55, 0); parts.push(base2);
      for (const y of [15.0, YS]) { const cap = new THREE.CylinderGeometry(1.55, 1.25, 0.9, 16); cap.translate(0, y, 0); parts.push(cap); }
      const geo = mergeGeos(parts);
      const im = new THREE.InstancedMesh(geo, stone(0), (NB + 1) * 4);
      const m4 = new THREE.Matrix4(); let n = 0;
      for (let b = 0; b <= NB; b++) for (const x of [-W - 0.2, W + 0.2, -(XW + XA) / 2 - 0.6, (XW + XA) / 2 + 0.6]) {
        const sc = Math.abs(x) > XW ? 0.62 : 1;
        m4.makeScale(sc, Math.abs(x) > XW ? 15.8 / YS : 1, sc).setPosition(x, 0, Z0 + b * BAY); im.setMatrixAt(n++, m4);
      }
      nave.add(im);
    }

    // ---------------------------------------------------------------- light shafts through the clerestory (+x side)
    const beams = new THREE.Group(); nave.add(beams);
    {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 28, 10, true); geo.translate(0, 0.5, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U, uB: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `attribute float aSeed; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying float vSeed; void main(){ vSeed=aSeed; vL=position; vec4 w=modelMatrix*instanceMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix*instanceMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform float uTime, uB, uGlass; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying float vSeed; ${GLASS} ${GLSL.snoise}
          void main(){ vec3 V=normalize(cameraPosition-vW); float f=pow(abs(dot(normalize(vN),V)),3.2);
            float a=vL.y;
            vec3 col=glassCol(vec2(vL.x*2.6, 31.+vL.z*4.5), floor(vW.z*0.13)+3.);
            float fall=smoothstep(0.,0.06,a)*mix(1.,0.25,a);
            float n=snoise(vW*0.18+vec3(0.,-uTime*0.12,uTime*0.05))*0.5+0.5;
            float dc=length(cameraPosition-vW);
            vec3 dom = vSeed<0.5? vec3(1.0,0.05,0.07) : vSeed<1.5? vec3(0.08,0.18,1.0) : vSeed<2.5? vec3(1.0,0.6,0.12) : vec3(0.6,0.1,0.5);
            col=mix(dom,col,0.3)*1.1;
            vec3 c=col*f*fall*mix(0.35,1.35,n)*0.06*uB*uGlass*smoothstep(3.,14.,dc);
            gl_FragColor=vec4(c,1.); }`,
      });
      const zs = [];
      for (let b = 1; b < NB - 1; b++) zs.push(Z0 + (b + 0.5) * BAY);
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(zs.map((z, i) => [0, 1, 2, 1, 0, 3, 2, 1][i % 8])), 1));
      const im = new THREE.InstancedMesh(geo, mat, zs.length);
      const len = 31 / -SUN.y + 4;
      const ax = SUN.clone(), a1 = new THREE.Vector3(0, 0, 1).sub(SUN.clone().multiplyScalar(SUN.z)).normalize(), a2 = new THREE.Vector3().crossVectors(a1, ax).normalize();
      zs.forEach((z, i) => {
        const m4 = new THREE.Matrix4().makeBasis(a1.clone().multiplyScalar(1.9), ax.clone().multiplyScalar(len), a2.clone().multiplyScalar(3.6));
        m4.setPosition(XW + 0.2, 31.5, z);
        im.setMatrixAt(i, m4);
      });
      beams.add(im);
      // dust motes inside the shafts
      const N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sd = new Float32Array(N * 4);
      const tmpC = (q, seed) => { // CPU copy of glassCol palette (approximate)
        const h = Math.abs(Math.sin(q[0] * 12.9 + q[1] * 78.2 + seed * 3.7) * 43758.5) % 1;
        return h < 0.42 ? [0.07, 0.16, 1.0] : h < 0.72 ? [1.0, 0.04, 0.06] : h < 0.88 ? [1.0, 0.62, 0.08] : [0.9, 0.85, 0.7];
      };
      for (let i = 0; i < N; i++) {
        const z = zs[Math.floor(R() * zs.length)];
        const u = Math.pow(R(), 0.8) * len, rx = (R() * 2 - 1), rz = (R() * 2 - 1);
        const p = new THREE.Vector3(XW + 0.2, 31.5, z).addScaledVector(ax, u).addScaledVector(a1, rx * 2.3).addScaledVector(a2, rz * 4.1);
        pos.set([p.x, p.y, p.z], i * 3);
        col.set(tmpC([Math.floor(rx * 3), Math.floor(rz * 4)], z), i * 3);
        sd.set([R(), R(), R(), u / len], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aC', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
      const motes = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 aC; attribute vec4 aS; uniform float uTime, uPx, uGlass; varying vec3 vC;
          void main(){ vec3 p=position+vec3(sin(uTime*0.3+aS.x*30.)*0.4, sin(uTime*0.21+aS.y*20.)*0.5-uTime*0.05*aS.z, sin(uTime*0.25+aS.z*40.)*0.4);
            float tw=0.5+0.5*sin(uTime*(1.+aS.y*3.)+aS.x*60.);
            vC=aC*(0.5+tw)*mix(1.,0.3,aS.w)*0.9*uGlass;
            vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=clamp(0.05*uPx/-mv.z,1.,6.); vC*=smoothstep(1.,4.,-mv.z);
            gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vC; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vC*exp(-r*3.),1.); }`,
      }));
      motes.frustumCulled = false;
      nave.add(motes);
    }

    // ---------------------------------------------------------------- candles (the faithful)
    {
      const list = [];
      for (let z = -44; z < 44; z += 1.15) for (let x = -5.6; x <= 5.6; x += 0.8) {
        if (Math.abs(x) < 1.2) continue;               // central aisle
        if (R() < 0.55) list.push([x + (R() - 0.5) * 0.3, 0.95 + (R() - 0.5) * 0.15, z + (R() - 0.5) * 0.3]);
      }
      for (let b = 0; b <= NB; b++) for (const s of [-1, 1]) for (let k = 0; k < 9; k++) list.push([s * (W - 1.6) + (R() - 0.5) * 1.4, 0.8 + R() * 0.9, Z0 + b * BAY + (R() - 0.5) * 1.2]);
      const N = list.length, pos = new Float32Array(N * 3), sd = new Float32Array(N);
      list.forEach((p, i) => { pos.set(p, i * 3); sd[i] = R(); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
      const c = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aS; uniform float uTime, uPx, uCand; varying float vI;
          void main(){ vI=uCand*(0.75+0.25*sin(uTime*(7.+aS*6.)+aS*50.)); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=clamp(0.22*uPx/-mv.z,1.6,26.); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vI; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vec3(1.,0.55,0.2)*vI*(exp(-r*14.)*3.5+exp(-r*3.)*0.25),1.); }`,
      }));
      c.frustumCulled = false;
      nave.add(c);
    }

    // ---------------------------------------------------------------- the west rose window
    const roseMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uRot: { value: 0 }, uMorph: { value: 0 } }, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uRot, uMorph, uTime, uGlass; varying vec2 vP; ${GLASS}
        #define PI 3.14159265
        float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
        void main(){
          float R=${ROSE.r.toFixed(2)};
          vec2 p=vP/R;
          float r=length(p);
          float a=atan(p.y,p.x)+uRot;
          float M=uMorph;
          // ---- outer boundary: circle → toothed gear rim
          float NT=32.;
          float tooth=smoothstep(0.32,0.18,abs(fract(a*NT/(2.*PI))-0.5));
          float rOut=1.0+M*0.13*tooth;
          if(r>rOut) discard;
          float NS=16.;
          float sec=a*NS/(2.*PI); float si=floor(sec); float sf=fract(sec)-0.5;
          // ---- stone tracery
          float lw=0.018+0.022*M;
          float stone=0.;
          stone=max(stone, step(abs(r-0.955),0.045+M*0.03));                 // outer ring
          stone=max(stone, step(r,0.95)*step(0.93-0.12*M,r)*M);            // gear rim body
          stone=max(stone, step(abs(r-0.17),0.025+M*0.05));                 // hub ring
          stone=max(stone, step(r,0.06+0.08*M));                            // boss
          // spokes (16) — thicken; every 4th becomes a gear spoke
          float spokeW=mix(0.013, mod(si,2.)<0.5? 0.05:0.0, M);
          float arcd=abs(sf)*2.*PI/NS*r;
          float onSp=step(arcd, 0.012+spokeW*0.6)*step(0.17,r)*step(r,0.95);
          float spokeFade=mix(1., mod(si,2.)<0.5?1.:0., smoothstep(0.2,0.7,M));
          stone=max(stone, onSp*spokeFade);
          // lancets (petals): pointed arch heads in each sector at r≈0.78, circles at 0.86
          vec2 q=vec2(sf*2.*PI/NS*r, r);
          float lan=0.;
          { float hw=0.075*r/0.6; float d=abs(q.x);
            float body=step(d, hw)*step(0.24,r)*step(r,0.74);
            float head=step(0.74,r)*step((d+hw)*(d+hw)+(r-0.74)*(r-0.74), 4.*hw*hw);
            float inn=body+head;
            float hw2=hw-0.016;
            float body2=step(d, hw2)*step(0.255,r)*step(r,0.74);
            float head2=step(0.74,r)*step((d+hw2)*(d+hw2)+(r-0.74)*(r-0.74), 4.*hw2*hw2);
            lan=clamp(inn-(body2+head2),0.,1.);
          }
          float oc=abs(length(vec2((fract(sec)-0.0)*2.*PI/NS*0.88, r-0.88)) - 0.04);
          float oc2=abs(length(vec2((fract(sec)-1.0)*2.*PI/NS*0.88, r-0.88)) - 0.04);
          lan=max(lan, step(min(oc,oc2),0.009));
          stone=max(stone, lan*(1.-smoothstep(0.0,0.45,M)));
          // ---- gear teeth region and lightening holes
          float teethZone=step(0.95,r)*M;
          stone=max(stone, teethZone);
          float holes=0.;
          if(M>0.01){ float hs=mod(si,4.); float hc=step(0.5,hs); holes=0.; }
          // ---- glass
          vec3 g=glassCol(vec2(a*3.2, r*9.), 5.);
          float rad=1.-smoothstep(0.8,1.,r)*0.3;
          vec3 glow=g*1.25*rad*uGlass;
          // steel when morphing: glass dims to dark smoked steel with sodium-warm sheen
          vec3 steel=(vec3(0.05,0.06,0.07)+vec3(1.0,0.5,0.15)*0.05)*(0.4+0.6*fract(sin(si*12.9)*437.));
          vec3 stoneC=mix(vec3(0.010,0.011,0.013), vec3(0.016,0.019,0.024), M);
          stoneC+=vec3(0.30,0.20,0.12)*M*0.12*pow(max(0.,dot(normalize(p+vec2(0.001)),normalize(vec2(-0.5,0.85)))),4.)*(0.5+0.5*r);
          stoneC+= mix(vec3(0.), vec3(1.0,0.55,0.2)*0.6, M)*pow(max(0.,sin(a*2.+uTime*0.)),8.)*0.0;
          // edge highlight on steel teeth
          float rimL=smoothstep(0.02,0.0,abs(r-rOut+0.012))*M;
          vec3 glassC=mix(glow, steel*0.4, smoothstep(0.0,0.6,M));
          vec3 c=mix(glassC, stoneC, stone);
          c+=vec3(1.0,0.6,0.25)*rimL*1.4;
          c+=vec3(0.9,0.55,0.25)*stone*M*0.25*pow(max(0.,dot(normalize(p),normalize(vec2(-0.6,0.8)))),3.);
          gl_FragColor=vec4(c,1.);
        }`,
    });
    const rose = new THREE.Mesh(new THREE.CircleGeometry(ROSE.r * 1.15, 96), roseMat);
    rose.position.set(0, ROSE.y, ZWEST + 0.05);
    nave.add(rose);
    // a dark stone frame ring around the rose
    const roseFrame = new THREE.Mesh(new THREE.RingGeometry(ROSE.r * 0.99, ROSE.r * 1.3, 96), stone(0));
    roseFrame.position.set(0, ROSE.y, ZWEST + 0.02); nave.add(roseFrame);

    // ---------------------------------------------------------------- the belfry
    const belfry = new THREE.Group(); scene.add(belfry);
    belfry.position.set(0, 400, 0);
    const pivot = new THREE.Group(); belfry.add(pivot); pivot.position.set(0, 3.2, 0);
    const bellMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uPulse: { value: 0 } }, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vW; varying vec3 vN; varying vec3 vO; void main(){ vO=position; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uPulse, uTime; varying vec3 vW; varying vec3 vN; varying vec3 vO; ${GLSL.snoise}
        void main(){ vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N; vec3 V=normalize(cameraPosition-vW);
          vec3 alb=vec3(0.32,0.20,0.09)*(0.75+0.25*(snoise(vO*3.)*0.5+0.5));
          // verdigris in the hollows
          alb=mix(alb, vec3(0.06,0.16,0.13), smoothstep(0.35,0.75,snoise(vO*vec3(4.,2.,4.)+2.))*0.5);
          // inscription bands
          float band=smoothstep(0.03,0.,abs(vO.y+0.55))+smoothstep(0.03,0.,abs(vO.y+0.75))+smoothstep(0.02,0.,abs(vO.y+2.15));
          vec3 Ls=normalize(vec3(-0.8,0.25,0.35));   // cold light from the louvres
          vec3 Rf=reflect(-V,N);
          float spec=pow(max(dot(Rf,Ls),0.),24.);
          vec3 c=alb*(vec3(0.006,0.007,0.010)+vec3(0.25,0.3,0.42)*max(dot(N,Ls),0.)*0.12);
          c+=vec3(0.55,0.62,0.8)*spec*0.5*(0.6+0.4*band);
          c+=vec3(0.9,0.6,0.3)*pow(1.-max(dot(N,V),0.),4.)*0.05;
          // strike: a pulse of light running through the bronze
          float pr=uPulse;
          c+=vec3(1.0,0.62,0.28)*pr*(0.05+1.5*pow(1.-max(dot(N,V),0.),3.))*(0.6+0.4*band);
          gl_FragColor=vec4(c,1.); }`,
    });
    {
      const prof = [[0.0, -0.05], [0.35, 0.0], [0.72, -0.1], [0.98, -0.45], [1.18, -1.2], [1.42, -2.05], [1.66, -2.42], [1.72, -2.55], [1.62, -2.6], [1.45, -2.45]];
      const bell = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64), bellMat);
      pivot.add(bell);
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 16), bellMat); crown.position.y = 0.15; pivot.add(crown);
      const clap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bellMat); clap.position.y = -2.1; pivot.add(clap);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), bellMat); rod.position.y = -1.05; pivot.add(rod);
      // yoke & timber frame
      const wood = new THREE.ShaderMaterial({
        uniforms: U, vertexShader: VS,
        fragmentShader: `varying vec3 vW; varying vec3 vN; void main(){ vec3 N=normalize(vN); vec3 Ls=normalize(vec3(-0.8,0.25,0.35)); vec3 c=vec3(0.09,0.06,0.04)*(0.02+0.25*max(dot(N,Ls),0.)); gl_FragColor=vec4(c,1.); }`,
      });
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.7), wood); yoke.position.y = 0.45; pivot.add(yoke);
      for (const [x, y, z, sx, sy, sz] of [[-2.4, 0, 0, 0.5, 9, 0.5], [2.4, 0, 0, 0.5, 9, 0.5], [0, 3.6, 0, 6, 0.55, 0.6], [-2.4, 0, -3, 0.5, 9, 0.5], [2.4, 0, -3, 0.5, 9, 0.5], [0, -1.2, -3, 6, 0.5, 0.5]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wood); b.position.set(x, y, z); belfry.add(b);
      }
      const diag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), wood); diag.position.set(-3.6, 0.5, -1.5); diag.rotation.z = 0.5; belfry.add(diag);
      // louvre slits (cold light) behind
      const slitMat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `varying vec2 vU; void main(){ float s=smoothstep(0.2,0.08,abs(fract(vU.y*9.)-0.5))*smoothstep(0.,0.1,vU.x)*smoothstep(1.,0.9,vU.x); gl_FragColor=vec4(vec3(0.35,0.45,0.7)*s*0.14,1.); }`,
      });
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6), slitMat); slit.position.set(-5.5, 1.0, -7); belfry.add(slit);
      const slit2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6), slitMat); slit2.position.set(6.5, 1.0, -9); belfry.add(slit2);
      // dust shaken off at the strike
      const N = 1800, p0 = new Float32Array(N * 3), sd = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2, yy = -R() * 1.6;
        const rr = 0.4 + (-yy) * 0.5 + 0.05;
        p0.set([Math.cos(a) * rr, yy, Math.sin(a) * rr], i * 3);
        sd.set([R(), R(), R(), R()], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p0, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
      const dust = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: { ...U, uStrikeM: { value: new THREE.Matrix4() }, uAge: { value: -1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec4 aS; uniform mat4 uStrikeM; uniform float uAge, uPx; varying float vI;
          void main(){ vec4 w=uStrikeM*vec4(position,1.); vec3 p=w.xyz; float t=max(uAge,0.);
            vec3 v=vec3((aS.x-0.5)*1.4, aS.y*0.8, (aS.z-0.5)*1.4)*(0.5+aS.w);
            p+=v*t+vec3(sin(t*2.+aS.x*20.)*0.1, -0.5*1.6*t*t*(0.3+aS.y), 0.);
            vI=step(0.,uAge)*exp(-t*0.6)*(0.4+0.6*aS.w)*smoothstep(0.,0.05,t);
            vec4 mv=viewMatrix*vec4(p,1.); gl_PointSize=clamp(0.02*uPx/-mv.z,1.,5.); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vI; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vec3(0.75,0.72,0.68)*vI*exp(-r*2.5)*0.9,1.); }`,
      }));
      dust.frustumCulled = false;
      scene.add(dust);
      this._dust = dust;
    }

    return { scene, camera, clearColor: 0x000000, U, nave, belfry, pivot, bellMat, rose, roseMat, dust: this._dust };
  },

  update(S, t) {
    const { U, camera } = S;
    U.uTime.value = t;
    const inBelfry = t < CUT;
    S.nave.visible = !inBelfry;
    S.belfry.visible = inBelfry;
    S.dust.visible = inBelfry;

    // ------------------------------------------------ C1: the bell
    const w = Math.PI * 2 / 1.6;
    const swing = a => 0.62 * Math.sin(w * (a - STRIKE) + Math.PI / 2) * 1;   // extreme at the strike
    if (inBelfry) {
      const ang = 0.62 * Math.cos(w * (t - STRIKE));
      S.pivot.rotation.z = ang;
      S.belfry.updateMatrixWorld(true);
      const age = t - STRIKE;
      S.bellMat.uniforms.uPulse.value = age > 0 ? Math.exp(-age * 5) * 0.7 : 0;
      // strike pose for the dust
      const pv = new THREE.Object3D(); pv.position.set(0, 403.2, 0); pv.rotation.z = 0.62; pv.updateMatrixWorld();
      S.dust.material.uniforms.uStrikeM.value.copy(pv.matrixWorld);
      S.dust.material.uniforms.uAge.value = age;
      // camera: low, beside the bell; it swings across the lens
      const cpos = new THREE.Vector3(0.2, 400.7 + t * 0.05, 5.6 - t * 0.2);
      camera.fov = 38; camera.updateProjectionMatrix();
      camera.position.copy(cpos); camera.up.set(0, 1, 0);
      camera.lookAt(new THREE.Vector3(0, 401.9, 0));
      // match: at t=0 the bell sits at frame centre
      camera.updateMatrixWorld();
      return;
    }

    // ------------------------------------------------ nave
    U.uGlass.value = 1;
    // camera path: from the floor looking up the nave, then the rising, accelerating flight into the rose
    const up = clamp((t - 8.0) / 7.8);
    const ue = up < 0.5 ? 4 * up * up * up : 1 - Math.pow(-2 * up + 2, 3) / 2;
    const ua = Math.pow(up, 2.2);
    const pA = new THREE.Vector3(0, lerp(1.7, 3.0, smoothstep(CUT, 8, t)), lerp(44, 37, smoothstep(CUT, 8.6, t)));
    const pB = new THREE.Vector3(0, ROSE.y, ZWEST + 24);
    const pos = new THREE.Vector3(0, lerp(pA.y, pB.y, ua * 0.6 + ue * 0.4), lerp(pA.z, pB.z, ue));
    pos.z = lerp(pos.z, ZWEST + 19.5, smoothstep(15.6, 20.5, t));
    const tA = new THREE.Vector3(0, lerp(17, 38, smoothstep(CUT + 0.4, 4.2, t)), lerp(-20, 6, smoothstep(CUT + 0.4, 4.2, t))), tB = new THREE.Vector3(0, ROSE.y, ZWEST);
    const tgt = tA.clone().lerp(tB, smoothstep(8.6, 15.2, t));
    camera.fov = lerp(36, 30, smoothstep(9, 17, t)); camera.updateProjectionMatrix();
    camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(tgt);
    camera.rotateZ(Math.sin(t * 0.25) * 0.004);
    camera.updateMatrixWorld();

    // the rose turns, then becomes a gear
    const rotV = smoothstep(14.5, 17.5, t);
    const rot = 0.18 * Math.max(0, t - 14.5) * rotV + 0.35 * Math.pow(Math.max(0, t - 17.5), 2) * 0.5;
    S.roseMat.uniforms.uRot.value = rot;
    S.roseMat.uniforms.uMorph.value = smoothstep(GEAR0, GEAR1 - 0.3, t);
    U.uCand.value = 1 - smoothstep(GEAR0, GEAR1, t) * 0.7;
  },

  grade(S, t) {
    const age = t - STRIKE;
    const pulse = age > 0 && t < CUT ? Math.exp(-age * 3.5) : 0;
    return {
      exposure: (t < CUT ? 1.15 : 1.35) + pulse * 0.35,
      contrast: 1.06,
      saturation: 1.1,
      tint: [0.97, 0.99, 1.05],
      lift: [0.002, 0.003, 0.008],
      gamma: [1.0, 1.0, 1.02],
      gain: [1.02, 1.0, 1.0],
      vignette: 0.48,
      grain: 0.05,
      aberration: 0.0016 + pulse * 0.003,
      bloom: { strength: 0.6 + pulse * 0.4, radius: 0.55, threshold: 0.85 },
    };
  },
};
