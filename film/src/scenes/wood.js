// Ⅳ 木 WOOD — the Sakyamuni timber pagoda of Yingxian, 1056.  Segment 94–108.5 (local t = global − 94).
// W1 0–7   : embers become snow; the octagonal pagoda emerges from the snowy night, lanterns light from the bottom up.
// W2 7–14.5: crane & tilt from base to finial; wind bells ring tier by tier (HITS.bellsWood);
//            the last bell swings into the lens (match cut to the cathedral bell).
import * as THREE from 'three';
import { HITS } from '../cues.js';
import { track, smoothstep, clamp, lerp, rng, noise3, GLSL } from '../engine/util.js';

const SEG0 = 94;
const BELLS = HITS.bellsWood.map(x => x - SEG0);   // 7.2 8.6 9.9 11.0 12.0 13.0
const P8 = Math.PI / 8, P4 = Math.PI / 4;

// ------------------------------------------------------------------ the pagoda's measurements (metres)
// eaves: rR/yR = where the roof meets the wall above, rE/yE = eave edge, up/out = corner sweep,
// uR/uY = where the soffit meets the bracket sets. lantern ring under each eave.
const EAVES = [
  { rR: 12.8, yR: 13.0, rE: 19.6, yE: 9.6,  up: 1.9, out: 1.5, uR: 15.6, uY: 9.9,  th: 0.55 },   // peristyle (副阶)
  { rR: 12.0, yR: 19.4, rE: 18.6, yE: 16.4, up: 1.8, out: 1.5, uR: 13.0, uY: 16.9, th: 0.55 },
  { rR: 11.1, yR: 31.0, rE: 17.4, yE: 28.2, up: 1.7, out: 1.4, uR: 12.1, uY: 28.6, th: 0.5 },
  { rR: 10.3, yR: 42.0, rE: 16.4, yE: 39.4, up: 1.6, out: 1.3, uR: 11.3, uY: 39.8, th: 0.5 },
  { rR: 9.5,  yR: 52.4, rE: 15.4, yE: 49.9, up: 1.55, out: 1.3, uR: 10.5, uY: 50.3, th: 0.48 },
  { rR: 0.9,  yR: 67.2, rE: 14.6, yE: 60.0, up: 1.5, out: 1.3, uR: 9.7,  uY: 60.4, th: 0.48, roof: true },
];
// storeys: wall radius, floor, wall top (bracket sets sit between top and the soffit)
const STOREYS = [
  { r: 12.4, y0: 4.2,  y1: 14.6, bal: null },
  { r: 11.6, y0: 20.8, y1: 26.6, bal: { r: 13.4, y: 20.8 } },
  { r: 10.8, y0: 32.2, y1: 37.8, bal: { r: 12.5, y: 32.2 } },
  { r: 10.0, y0: 43.2, y1: 48.4, bal: { r: 11.7, y: 43.2 } },
  { r: 9.2,  y0: 53.6, y1: 58.6, bal: { r: 10.9, y: 53.6 } },
];
const LANT = EAVES.map((e, k) => k === 0 ? { r: 15.2, y: 7.4 } : { r: (STOREYS[k - 1].r + e.rE * Math.cos(P8)) * 0.5 + 0.6, y: e.yE - 2.1 });

function polyK(th) {             // octagon radius factor & corner factor; corners at θ = kπ/4 (θ from +z)
  const ph = th - Math.round(th / P4) * P4;
  return { poly: Math.cos(P8) / Math.cos(P8 - Math.abs(ph)), c: 1 - Math.abs(ph) / P8 };
}
function eaveTop(e, th, s) {
  const { poly, c } = polyK(th);
  const r = lerp(e.rR, e.rE, s) * poly + e.out * s * s * Math.pow(c, 3);
  const prof = e.roof ? (1 - Math.pow(1 - s, 1.0) * 0) : 0;
  const k = e.roof ? (2.1 * s - 1.1 * s * s) : (1.7 * s - 0.7 * s * s);
  const y = e.yR - (e.yR - e.yE) * k + e.up * Math.pow(s, 2.2) * Math.pow(c, 2.4) + prof * 0;
  return [Math.sin(th) * r, y, Math.cos(th) * r];
}
function cornerTip(k, j) { return eaveTop(EAVES[k], j * P4, 1); }

// ------------------------------------------------------------------ GLSL shared lighting
const LIGHT_GLSL = /* glsl */`
uniform float uL[6]; uniform float uLY[6]; uniform float uLR[6];
uniform float uDark, uTime;
uniform vec3 uFogC;
vec3 lanternLight(vec3 p, vec3 N){
  vec3 acc=vec3(0.);
  vec2 dir=normalize(p.xz+vec2(1e-4));
  for(int i=0;i<6;i++){
    vec3 q=vec3(dir.x*uLR[i], uLY[i], dir.y*uLR[i]);
    vec3 L=q-p; float d2=dot(L,L); L*=inversesqrt(d2);
    float ndl=max(dot(N,L),0.)*0.8+0.2;
    acc+=uL[i]*5./(d2+4.)*ndl;
  }
  return acc*vec3(1.0,0.52,0.20);
}
vec3 ambient(vec3 N){
  return (mix(vec3(0.008,0.010,0.015), vec3(0.050,0.060,0.085), N.y*0.5+0.5))*uDark;
}
vec3 fogit(vec3 c, vec3 p){ float d=length(cameraPosition-p); return mix(c, uFogC*uDark, 1.-exp(-d*0.0042)); }
`;
const VS = /* glsl */`
attribute vec2 aUV; attribute float aPart;
varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying float vPart; varying vec3 vO;
void main(){
  vec4 p=vec4(position,1.); vec3 n=normal;
#ifdef USE_INSTANCING
  p=instanceMatrix*p; n=mat3(instanceMatrix)*n;
#endif
  vO=position;
  vec4 w=modelMatrix*p; vW=w.xyz; vN=normalize(mat3(modelMatrix)*n); vUV=aUV; vPart=aPart;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
// one material, many parts: 0 roof tiles, 1 fascia (painted wood), 2 soffit, 3 wall panels, 4 stone, 5 ground snow, 6 iron, 7 bracket wood
const FS = /* glsl */`
uniform float uPartU; uniform float uTier; uniform float uWin;
varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying float vPart; varying vec3 vO;
${LIGHT_GLSL}
float cn(vec3 p){ return 0.5+0.25*sin(p.x*1.7+sin(p.z*1.3+p.y*0.7))*sin(p.z*1.9+sin(p.y*1.1+p.x*0.7)) + 0.25*sin(p.y*2.3+sin(p.x*1.1))*sin(p.x*2.9-p.z*1.3); }
${GLSL.hash}
void main(){
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 V=normalize(cameraPosition-vW);
  float part=uPartU>=0.?uPartU:floor(vPart+0.5);
  vec3 alb; vec3 em=vec3(0.); float snow=0.;
  float nz=cn(vW*1.1);
  if(part<0.5){                     // tiles
    float g=abs(fract(vUV.x)-0.5)*2.;
    float aa=fwidth(vUV.x)*2.;
    float rib=smoothstep(0.55-aa,0.85+aa,g);
    alb=vec3(0.045,0.050,0.055)*(0.75+0.5*rib);
    snow=smoothstep(0.30,0.75,N.y)*(0.55+0.45*nz);
    snow=max(snow*mix(1.,0.55+0.45*(1.-rib),0.7), smoothstep(0.86,0.99,vUV.y)*0.95);
    snow*=smoothstep(0.0,0.25,N.y+0.1);
  } else if(part<1.5){              // fascia: weathered vermilion
    alb=vec3(0.16,0.045,0.03)*(0.8+0.4*nz);
    snow=smoothstep(0.6,0.9,N.y);
  } else if(part<2.5){              // soffit rafters
    float rf=smoothstep(0.35,0.5,abs(fract(vUV.x*2.)-0.5));
    alb=mix(vec3(0.13,0.07,0.04), vec3(0.05,0.03,0.02), rf);
  } else if(part<3.5){              // wall panels with lattice windows
    float u=fract(vUV.x*8.); float v=vUV.y;
    float face=floor(vUV.x*8.); float door=mod(face,2.);
    float win=door*step(0.3,u)*step(u,0.7)*step(0.0,v)*step(v,0.78) + (1.-door)*step(0.36,u)*step(u,0.64)*step(0.4,v)*step(v,0.7);
    vec2 lc=vec2(u*14.,v*16.);
    float lat=max(smoothstep(0.42,0.5,abs(fract(lc.x)-0.5)), smoothstep(0.42,0.5,abs(fract(lc.y)-0.5)));
    alb=vec3(0.15,0.05,0.03)*(0.8+0.3*nz);
    float lit=uL[int(uTier)];
    float fl=0.85+0.15*sin(uTime*6.+floor(vUV.x*8.)*3.);
    em=vec3(1.0,0.5,0.2)*win*(1.-lat)*lit*0.55*fl;
    alb=mix(alb, vec3(0.03,0.02,0.015), win);
  } else if(part<4.5){              // stone platform
    alb=vec3(0.16,0.16,0.17)*(0.7+0.5*nz);
    snow=smoothstep(0.6,0.9,N.y);
  } else if(part<5.5){              // ground snow
    float n2=cn(vW*vec3(0.04,0.,0.04));
    alb=vec3(0.55,0.6,0.7)*(0.75+0.25*n2);
    snow=0.;
  } else if(part<6.5){              // iron
    alb=vec3(0.035,0.033,0.032);
    snow=smoothstep(0.55,0.9,N.y)*0.9;
  } else {                          // bracket sets: dark timber, ends faded green/ochre paint
    float h=hash12(floor(vW.xz*1.3)+floor(vW.y*2.));
    alb=mix(vec3(0.12,0.065,0.035), vec3(0.06,0.08,0.06), step(0.7,h));
    snow=smoothstep(0.75,0.95,N.y)*0.6;
  }
  vec3 salb=vec3(0.82,0.86,0.95);
  alb=mix(alb,salb,clamp(snow,0.,1.));
  vec3 c=alb*(ambient(N)+lanternLight(vW,N));
  // sky rim on snow edges
  c+=alb*vec3(0.02,0.028,0.04)*pow(1.-max(dot(N,V),0.),4.)*uDark;
  c+=em;
  gl_FragColor=vec4(fogit(c,vW),1.);
}`;

// build an eave (top + fascia + soffit) as one parametric strip
function eaveGeometry(e) {
  const J = 8 * 28, rowsTop = 18, rowsUnder = 8;
  const rows = [];   // each: { s, part, kind }
  for (let i = 0; i <= rowsTop; i++) rows.push({ s: i / rowsTop, part: 0, kind: 'top' });
  rows.push({ s: 1, part: 0, kind: 'lip' });
  rows.push({ s: 1, part: 1, kind: 'lip' });
  rows.push({ s: 1, part: 1, kind: 'fascia' });
  rows.push({ s: 1, part: 2, kind: 'fascia' });
  for (let i = rowsUnder; i >= 0; i--) rows.push({ s: i / rowsUnder, part: 2, kind: 'under' });
  const pos = [], uv = [], part = [], idx = [];
  for (let r = 0; r < rows.length; r++) {
    const { s, kind } = rows[r];
    for (let j = 0; j <= J; j++) {
      const th = j / J * Math.PI * 2;
      let p;
      if (kind === 'top' || (kind === 'lip' && rows[r].part === 0)) p = eaveTop(e, th, s);
      else if (kind === 'lip') { p = eaveTop(e, th, 1); const { poly } = polyK(th); p[0] += Math.sin(th) * 0.12; p[2] += Math.cos(th) * 0.12; p[1] += 0.0; }
      else if (kind === 'fascia') { p = eaveTop(e, th, 1); p[0] += Math.sin(th) * 0.12; p[2] += Math.cos(th) * 0.12; p[1] -= e.th; }
      else {
        const { poly, c } = polyK(th);
        const rr = lerp(e.uR, e.rE, s) * poly + e.out * s * s * Math.pow(c, 3);
        const yy = lerp(e.uY, e.yE - e.th, s) + e.up * Math.pow(s, 2.2) * Math.pow(c, 2.4) * Math.min(1, s * 1.2);
        p = [Math.sin(th) * rr, yy, Math.cos(th) * rr];
      }
      pos.push(...p);
      uv.push(j / J * 8 * 26, kind === 'top' ? s : 1);
      part.push(rows[r].part);
    }
  }
  const W = J + 1;
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < J; j++) {
    const a = r * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function withAttrs(g, part, uvFn) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n).fill(part);
  g.setAttribute('aPart', new THREE.BufferAttribute(a, 1));
  const uv = new Float32Array(n * 2);
  const src = g.attributes.uv;
  for (let i = 0; i < n; i++) { uv[i * 2] = src ? src.getX(i) : 0; uv[i * 2 + 1] = src ? src.getY(i) : 0; }
  g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
  return g;
}
function flat(geo) { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; }

export default {
  async init({ aspect, H }) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, aspect, 0.3, 6000);
    const R = rng(1056);
    const U = {
      uL: { value: [0, 0, 0, 0, 0, 0] }, uLY: { value: LANT.map(l => l.y) }, uLR: { value: LANT.map(l => l.r) },
      uDark: { value: 1 }, uTime: { value: 0 }, uFogC: { value: new THREE.Color(0.040, 0.050, 0.068) },
      uPx: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(18))) }, uMorph: { value: 1 }, uCam: { value: new THREE.Vector3() },
    };
    const mat = (part, extra = {}) => new THREE.ShaderMaterial({
      uniforms: { ...U, uPartU: { value: part }, uTier: { value: extra.tier ?? 0 }, uWin: { value: 0 } },
      vertexShader: VS, fragmentShader: FS, side: extra.side ?? THREE.FrontSide,
    });
    const mAuto = mat(-1, { side: THREE.DoubleSide });
    const mWood = mat(1), mStone = mat(4), mIron = mat(6), mBr = mat(7), mTile = mat(0, { side: THREE.DoubleSide });

    // ---------------------------------------------------------------- sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uDark, uTime; uniform vec3 uFogC; varying vec3 vW; ${GLSL.snoise}
        void main(){ vec3 d=normalize(vW-cameraPosition);
          vec3 zen=vec3(0.006,0.009,0.017), hor=uFogC*1.05;
          vec3 c=mix(hor,zen,smoothstep(-0.02,0.55,d.y));
          // moon behind snow cloud, upper left
          vec3 md=normalize(vec3(-0.75,0.55,-0.4));
          float m=max(dot(d,md),0.);
          float cl=snoise(vec3(d.xz/(d.y+0.3)*1.6+uTime*0.01, 0.))*0.5+0.5;
          c+=vec3(0.05,0.06,0.08)*(pow(m,12.)*0.8+pow(m,3.)*0.25)*(0.6+0.6*cl);
          c*=0.85+0.25*cl*smoothstep(0.,0.4,d.y);
          gl_FragColor=vec4(c*uDark,1.); }`,
    }));
    sky.renderOrder = -10;
    scene.add(sky);

    // ---------------------------------------------------------------- ground, distant hills, temple halls
    const ground = new THREE.Mesh(withAttrs(new THREE.PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2), 5), mat(5));
    scene.add(ground);
    {
      // far ridge line
      const N = 400, pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N - 0.5) * Math.PI * 1.6 + Math.PI;
        const h = 40 + 120 * Math.max(0, 0.5 + 0.6 * noise3(i * 0.03, 0.5, 2) + 0.3 * noise3(i * 0.11, 1.5, 2));
        const r = 1500;
        pos.push(Math.sin(a) * r, -5, Math.cos(a) * r, Math.sin(a) * r, h, Math.cos(a) * r);
        if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      scene.add(new THREE.Mesh(withAttrs(g, 4), new THREE.ShaderMaterial({
        uniforms: U, side: THREE.DoubleSide, vertexShader: VS,
        fragmentShader: `uniform vec3 uFogC; uniform float uDark; varying vec3 vW; void main(){ gl_FragColor=vec4(uFogC*uDark*mix(0.62,0.8,smoothstep(0.,150.,vW.y)),1.); }`,
      })));
    }
    // temple halls: dark bodies, snowy hip roofs, warm doors
    const halls = [
      [-60, -95, 0.4, 34, 16, 9], [62, -88, -0.3, 28, 14, 8], [-115, -10, 1.35, 30, 15, 8], [118, 10, -1.3, 30, 15, 8],
      [0, -150, 0, 46, 20, 12], [-170, -140, 0.6, 26, 12, 7], [180, -150, -0.5, 26, 12, 7], [-40, -260, 0.1, 50, 18, 10], [90, -240, -0.2, 40, 16, 9],
    ];
    const hallBody = withAttrs(flat(new THREE.BoxGeometry(1, 1, 1)), 3);
    const hallRoof = withAttrs(flat(new THREE.CylinderGeometry(0.001, Math.SQRT1_2, 1, 4, 1).rotateY(P4)), 0);
    for (const [x, z, ry, w, d, h] of halls) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const b = new THREE.Mesh(hallBody, mWood); b.scale.set(w, h, d); b.position.y = h / 2; g.add(b);
      const rf = new THREE.Mesh(hallRoof, mTile); rf.scale.set(w * 1.35, h * 0.75, d * 1.6); rf.position.y = h + h * 0.36; g.add(rf);
      scene.add(g);
    }

    // ---------------------------------------------------------------- the pagoda
    const pag = new THREE.Group(); scene.add(pag);
    // stone platform, two tiers
    const oct = (r0, r1, h, open = false, seg = 1) => flat(new THREE.CylinderGeometry(r0, r1, h, 8, seg, open));
    const pm = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; pag.add(o); return o; };
    pm(withAttrs(oct(22.5, 23.5, 2.2), 4), mStone, 1.1);
    pm(withAttrs(oct(19.6, 20.2, 2.0), 4), mStone, 3.2);
    // steps on the front (toward +z, between two corners?) — a stair at the south face (face normal at θ = π/8)
    // walls
    STOREYS.forEach((s, k) => {
      const g = withAttrs(new THREE.CylinderGeometry(s.r, s.r * 1.01, s.y1 - s.y0, 8, 1, true), 3);
      g.computeVertexNormals();
      const w = new THREE.Mesh(flat(g), mat(3, { tier: k })); w.position.y = (s.y0 + s.y1) / 2; pag.add(w);
      // lintel ring and floor plate
      pm(withAttrs(oct(s.r + 0.35, s.r + 0.35, 0.8, true), 1), mWood, s.y1 + 0.2);
      if (s.bal) {
        pm(withAttrs(oct(s.bal.r, s.bal.r - 0.3, 0.55), 1), mWood, s.bal.y - 0.28);
      }
    });
    // eaves
    EAVES.forEach(e => { const m = new THREE.Mesh(eaveGeometry(e), mAuto); pag.add(m); });
    // corner ridges
    {
      const geos = [];
      EAVES.forEach((e, k) => {
        for (let j = 0; j < 8; j++) {
          const pts = [];
          for (let i = 0; i <= 16; i++) { const s = (e.roof ? 0.02 : 0.08) + i / 16 * (1.02 - (e.roof ? 0.02 : 0.08)); const p = eaveTop(e, j * P4, s); pts.push(new THREE.Vector3(p[0], p[1] + 0.32 + (i === 16 ? 0.25 : 0), p[2])); }
          geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, k === 5 ? 0.38 : 0.3, 6, false));
        }
      });
      const merged = mergeGeos(geos);
      pag.add(new THREE.Mesh(withAttrs(merged, 0), mat(0)));
    }
    // columns: peristyle + every storey (corners and two per side)
    {
      const list = [];
      const ring = (r, y0, y1, rad, per) => { for (let j = 0; j < 8; j++) for (let q = 0; q < per; q++) { const th = j * P4 + q / per * P4; const { poly } = polyK(th); list.push([Math.sin(th) * r * poly, y0, y1, Math.cos(th) * r * poly, rad]); } };
      ring(16.0, 4.2, 9.8, 0.55, 3);
      STOREYS.forEach((s, k) => ring(s.r + 0.25, s.y0, s.y1, k ? 0.42 : 0.55, 3));
      const cg = withAttrs(new THREE.CylinderGeometry(1, 1, 1, 10), 1);
      const im = new THREE.InstancedMesh(cg, mWood, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach(([x, y0, y1, z, rad], i) => { m4.makeScale(rad, y1 - y0, rad).setPosition(x, (y0 + y1) / 2, z); im.setMatrixAt(i, m4); });
      pag.add(im);
    }
    // bracket sets (dougong): stepped blocks under every eave and balcony
    {
      const list = [];
      const sets = (rw, yb, layers, per, scale = 1) => {
        for (let j = 0; j < 8; j++) for (let q = 0; q < per; q++) {
          const th = j * P4 + q / per * P4; const { poly } = polyK(th);
          const corner = q === 0;
          for (let L = 0; L < layers; L++) {
            const rr = rw * poly + 0.2 + L * 0.62 * scale;
            const y = yb + L * 0.44 * scale;
            const along = (1.1 + L * 0.55) * scale * (corner ? 1.15 : 1);
            list.push({ th, rr, y, sx: along, sy: 0.36 * scale, sz: 0.5 * scale });         // tangential arm
            list.push({ th, rr: rr + 0.25 * scale, y: y + 0.2 * scale, sx: 0.42 * scale, sy: 0.32 * scale, sz: (0.9 + L * 0.1) * scale });  // projecting arm
            list.push({ th, rr: rr + 0.1, y: y - 0.12 * scale, sx: 0.55 * scale, sy: 0.22 * scale, sz: 0.55 * scale });       // bearing block
          }
        }
      };
      sets(16.0, 9.8, 2, 4, 0.8);
      STOREYS.forEach((s, k) => sets(s.r, s.y1 + 0.6, 4, 4, k ? 0.92 : 1));
      STOREYS.forEach(s => { if (s.bal) sets(s.r, s.bal.y - 2.0, 3, 4, 0.75); });
      const im = new THREE.InstancedMesh(withAttrs(new THREE.BoxGeometry(1, 1, 1), 7), mBr, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0);
      list.forEach((b, i) => { q.setFromAxisAngle(ax, b.th); m4.compose(new THREE.Vector3(Math.sin(b.th) * b.rr, b.y, Math.cos(b.th) * b.rr), q, new THREE.Vector3(b.sx, b.sy, b.sz)); im.setMatrixAt(i, m4); });
      pag.add(im);
    }
    // balcony railings
    {
      const list = [];
      STOREYS.forEach(s => {
        if (!s.bal) return;
        const r = s.bal.r - 0.25;
        for (let j = 0; j < 8; j++) {
          const a0 = j * P4, a1 = (j + 1) * P4;
          const p0 = new THREE.Vector3(Math.sin(a0) * r, 0, Math.cos(a0) * r), p1 = new THREE.Vector3(Math.sin(a1) * r, 0, Math.cos(a1) * r);
          const n = 9;
          for (let i = 0; i <= n; i++) { const p = p0.clone().lerp(p1, i / n); list.push({ p: p.setY(s.bal.y + 0.55), s: [0.14, 1.1, 0.14], ry: 0 }); }
          const mid = p0.clone().add(p1).multiplyScalar(0.5); const len = p0.distanceTo(p1);
          const ry = Math.atan2(p1.x - p0.x, p1.z - p0.z);
          list.push({ p: mid.clone().setY(s.bal.y + 1.12), s: [0.16, 0.14, len], ry });
          list.push({ p: mid.clone().setY(s.bal.y + 0.35), s: [0.08, 0.1, len], ry });
        }
      });
      const im = new THREE.InstancedMesh(withAttrs(new THREE.BoxGeometry(1, 1, 1), 1), mWood, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0);
      list.forEach((b, i) => { q.setFromAxisAngle(ax, b.ry); m4.compose(b.p, q, new THREE.Vector3(...b.s)); im.setMatrixAt(i, m4); });
      pag.add(im);
    }
    // the iron finial (塔刹)
    {
      const prof = [[0, 66.4], [3.0, 66.4], [3.3, 67.2], [2.4, 67.6], [2.9, 68.4], [2.0, 69.0], [2.3, 70.6], [1.0, 71.4], [0.35, 71.6]];
      const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24);
      pag.add(new THREE.Mesh(withAttrs(g, 6), mIron));
      { const mast = new THREE.Mesh(withAttrs(new THREE.CylinderGeometry(0.22, 0.3, 14, 8), 6), mIron); mast.position.y = 78; pag.add(mast); }
      for (let i = 0; i < 7; i++) {
        const t = new THREE.Mesh(withAttrs(new THREE.CylinderGeometry(1.45 - i * 0.12, 1.5 - i * 0.12, 0.28, 20), 6), mIron);
        t.position.y = 72.4 + i * 0.95; pag.add(t);
      }
      const canopy = new THREE.Mesh(withAttrs(new THREE.CylinderGeometry(0.4, 1.9, 0.9, 16), 6), mIron); canopy.position.y = 79.6; pag.add(canopy);
      const pearl1 = new THREE.Mesh(withAttrs(new THREE.SphereGeometry(0.75, 14, 10), 6), mIron); pearl1.position.y = 81.0; pag.add(pearl1);
      const moon = new THREE.Mesh(withAttrs(new THREE.TorusGeometry(0.9, 0.12, 6, 20, Math.PI), 6), mIron); moon.position.y = 82.6; moon.rotation.z = Math.PI; pag.add(moon);
      const pearl2 = new THREE.Mesh(withAttrs(new THREE.SphereGeometry(0.45, 12, 8), 6), mIron); pearl2.position.y = 84.3; pag.add(pearl2);
      // iron chains from the spire to the roof corners
      const geos = [];
      for (let j = 0; j < 8; j++) {
        const tip = cornerTip(5, j);
        const a = new THREE.Vector3(0, 78.5, 0), b = new THREE.Vector3(tip[0] * 0.93, tip[1] + 0.6, tip[2] * 0.93);
        const pts = [];
        for (let i = 0; i <= 20; i++) { const u = i / 20; const p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 1.6; pts.push(p); }
        geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.07, 4, false));
      }
      pag.add(new THREE.Mesh(withAttrs(mergeGeos(geos), 6), mIron));
    }

    // ---------------------------------------------------------------- lanterns
    const lantList = [];
    LANT.forEach((l, k) => {
      for (let j = 0; j < 8; j++) {
        const th = j * P4 + P8; const { poly } = polyK(th);
        lantList.push({ k, p: new THREE.Vector3(Math.sin(th) * l.r * poly, l.y, Math.cos(th) * l.r * poly), on: 1.6 + k * 0.74 + (((j * 5) % 8) / 8) * 0.38 });
      }
    });
    {
      const N = lantList.length;
      const g = new THREE.SphereGeometry(1, 14, 10); g.scale(0.42, 0.55, 0.42);
      const on = new Float32Array(N), sd = new Float32Array(N);
      lantList.forEach((l, i) => { on[i] = l.on; sd[i] = R(); });
      g.setAttribute('aOn', new THREE.InstancedBufferAttribute(on, 1));
      g.setAttribute('aSd', new THREE.InstancedBufferAttribute(sd, 1));
      const im = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: `attribute float aOn; attribute float aSd; uniform float uTime; varying float vI; varying vec3 vN; varying vec3 vP;
          void main(){ float k=clamp((uTime-aOn)/0.35,0.,1.); vI=k*k*(0.88+0.12*sin(uTime*7.+aSd*40.)); vN=normal; vP=position;
            gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.); }`,
        fragmentShader: `varying float vI; varying vec3 vN; varying vec3 vP; void main(){
            float rib=smoothstep(0.8,1.,abs(sin(atan(vP.x,vP.z)*6.)));
            vec3 c=mix(vec3(1.0,0.16,0.04)*1.3, vec3(1.0,0.42,0.14)*2.2, pow(max(vN.y*0.,0.)+1.-abs(vN.y),2.))*(1.-0.5*rib);
            c=mix(vec3(0.012,0.004,0.003), c, vI);
            gl_FragColor=vec4(c,1.); }`,
      }), N);
      const m4 = new THREE.Matrix4();
      lantList.forEach((l, i) => { m4.makeTranslation(l.p.x, l.p.y, l.p.z); im.setMatrixAt(i, m4); });
      pag.add(im);
      // halos
      const pos = new Float32Array(N * 3);
      lantList.forEach((l, i) => pos.set([l.p.x, l.p.y, l.p.z], i * 3));
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      hg.setAttribute('aOn', new THREE.BufferAttribute(on, 1));
      hg.setAttribute('aSd', new THREE.BufferAttribute(sd, 1));
      const halo = new THREE.Points(hg, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aOn; attribute float aSd; uniform float uTime, uPx; varying float vI;
          void main(){ float k=clamp((uTime-aOn)/0.35,0.,1.); vI=k*k*(0.85+0.15*sin(uTime*7.+aSd*40.))+ (uTime>aOn? exp(-(uTime-aOn)*5.)*1.5:0.);
            vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=clamp(4.5*uPx/-mv.z,2.,160.); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vI; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vec3(1.0,0.36,0.10)*vI*(exp(-r*9.)*0.3+exp(-r*2.5)*0.07)*(1.-r),1.); }`,
      }));
      halo.frustumCulled = false;
      scene.add(halo);
    }

    // ---------------------------------------------------------------- wind bells
    const bells = [];
    {
      const prof = [[0.0, 0.0], [0.34, 0.02], [0.36, 0.08], [0.3, 0.2], [0.24, 0.5], [0.22, 0.72], [0.15, 0.82], [0.06, 0.86], [0.06, 1.0], [0.0, 1.02]];
      const bg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 1.02)), 40);
      // wind plate (风摆) and hanger
      const plate = new THREE.BoxGeometry(0.26, 0.4, 0.03); plate.translate(0, -1.45, 0);
      const rod = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4); rod.translate(0, -1.15, 0);
      const hook = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 4); hook.translate(0, 0.22, 0);
      const geo = mergeGeos([bg, hook]);
      const bm = new THREE.ShaderMaterial({
        uniforms: { ...U, uGl: { value: 0 } }, side: THREE.DoubleSide,
        vertexShader: `attribute float aRing; varying vec3 vW; varying vec3 vN; varying float vR;
          void main(){ vec4 w=modelMatrix*instanceMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix*instanceMatrix)*normal); vR=aRing; gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `${LIGHT_GLSL} varying vec3 vW; varying vec3 vN; varying float vR;
          void main(){ vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N; vec3 V=normalize(cameraPosition-vW);
            vec3 alb=vec3(0.16,0.10,0.05);
            vec3 c=alb*(ambient(N)*0.8+lanternLight(vW,N)*0.3);
            vec3 Rf=reflect(-V,N);
            c+=vec3(0.02,0.026,0.04)*pow(max(Rf.y,0.),3.)*uDark;
            c+=vec3(1.0,0.55,0.22)*pow(1.-max(dot(N,V),0.),5.)*0.3*uDark;
            c+=vec3(1.0,0.75,0.4)*vR*(0.08+1.2*pow(1.-max(dot(N,V),0.),3.));
            gl_FragColor=vec4(fogit(c,vW),1.); }`,
      });
      const ring = new Float32Array(48);
      geo.setAttribute('aRing', new THREE.InstancedBufferAttribute(ring, 1));
      const im = new THREE.InstancedMesh(geo, bm, 48);
      im.frustumCulled = false;
      for (let k = 0; k < 6; k++) for (let j = 0; j < 8; j++) {
        const tip = cornerTip(k, j);
        const th = j * P4;
        bells.push({ k, j, th, anchor: new THREE.Vector3(tip[0] + Math.sin(th) * 0.15, tip[1] - 0.05, tip[2] + Math.cos(th) * 0.15), ph: R() * 10, f: 1.4 + R() * 0.5 });
      }
      scene.add(im);
      this._bellIM = im;
      // glints
      const gp = new Float32Array(48 * 3), gi = new Float32Array(48);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      gg.setAttribute('aI', new THREE.BufferAttribute(gi, 1));
      const glints = new THREE.Points(gg, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aI; uniform float uPx; varying float vI; void main(){ vI=aI; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=clamp(1.7*uPx/-mv.z,2.,60.)*step(0.01,aI); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vI; void main(){ vec2 p=gl_PointCoord*2.-1.; float st=exp(-abs(p.x)*22.)*exp(-abs(p.y)*2.5)+exp(-abs(p.y)*22.)*exp(-abs(p.x)*2.5); float r=dot(p,p);
          gl_FragColor=vec4(vec3(1.,0.82,0.55)*vI*(st*0.9+exp(-r*10.)*1.6),1.); }`,
      }));
      glints.frustumCulled = false;
      scene.add(glints);
      this._glints = glints;
    }

    // ---------------------------------------------------------------- people with lanterns in the courtyard
    {
      const N = 46, pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) { sd.set([R(), R(), R(), R()], i * 4); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
      const ppl = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec4 aS; uniform float uTime, uPx, uDark; varying float vI;
          void main(){ float a=aS.x*6.2832+uTime*(0.008+0.01*aS.y)*(aS.z>0.5?1.:-1.); float r=26.+aS.y*70.;
            vec3 p=vec3(sin(a)*r, 1.1+0.05*sin(uTime*5.+aS.w*20.), cos(a)*r*0.8-20.);
            vI=(0.7+0.3*sin(uTime*6.+aS.w*30.))*uDark;
            vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=clamp(2.2*uPx/-mv.z,1.5,30.); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vI; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); gl_FragColor=vec4(vec3(1.,0.5,0.18)*vI*(exp(-r*10.)*2.5+exp(-r*3.)*0.25),1.); }`,
      }));
      ppl.frustumCulled = false;
      scene.add(ppl);
    }

    // ---------------------------------------------------------------- embers → snow
    {
      const N = 36000, pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) { pos.set([R(), R(), R()], i * 3); sd.set([R(), R(), R(), R()], i * 4); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
      const snow = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec4 aS; uniform float uPx, uMorph; uniform vec3 uCam; varying vec3 vC; varying float vSoft;
          ${LIGHT_GLSL}
          void main(){
            vec3 box=vec3(110.,80.,110.);
            float t=uTime;
            // snow: slow fall, wind drift, flutter
            vec3 ds=vec3(t*(1.2+aS.x*0.8)+sin(t*(0.6+aS.y)+aS.z*20.)*0.9, -t*(1.1+aS.y*0.9), sin(t*(0.5+aS.z*0.7)+aS.x*30.)*0.9-t*0.3);
            // embers: faster fall, small lateral jitter
            vec3 de=vec3(sin(t*2.+aS.z*9.)*0.3+t*0.4, -t*(3.0+aS.y*2.), 0.);
            vec3 d=mix(de,ds,uMorph);
            vec3 p=position*box+d;
            p=mod(p-uCam+box*0.5,box)+uCam-box*0.5;
            float vis=step(aS.w, mix(0.012,1.,smoothstep(0.,1.,uMorph)));
            vec3 snowC=vec3(0.30,0.34,0.42)*uDark*0.55+lanternLight(p,vec3(0.,0.,0.))*0.12*0.5+vec3(0.02);
            vec3 emberC=vec3(1.0,0.32,0.06)*(2.0+2.*sin(t*6.+aS.x*40.));
            vC=mix(emberC,snowC,uMorph)*vis;
            vec4 mv=modelViewMatrix*vec4(p,1.);
            float dz=-mv.z;
            float sz=mix(0.35,0.05+aS.x*0.07,uMorph);
            gl_PointSize=clamp(sz*uPx/dz,1.0,46.);
            vSoft=clamp(sz*uPx/dz/10.,0.,1.);
            vC*=smoothstep(0.6,3.,dz)*mix(1.,0.35,vSoft);
            gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vC; varying float vSoft; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; float a=mix(exp(-r*3.5),(1.-r*r),vSoft); gl_FragColor=vec4(vC*a,1.); }`,
      }));
      snow.frustumCulled = false;
      scene.add(snow);
    }

    return { scene, camera, clearColor: 0x000000, U, bells, bellIM: this._bellIM, glints: this._glints };
  },

  update(S, t) {
    const { U, camera } = S;
    U.uTime.value = t;
    U.uMorph.value = smoothstep(0.4, 3.0, t);
    U.uDark.value = smoothstep(0.7, 3.6, t);
    const L = U.uL.value;
    for (let k = 0; k < 6; k++) { const t0 = 1.6 + k * 0.74; L[k] = smoothstep(t0, t0 + 0.6, t) * (0.92 + 0.08 * noise3(t * 2, k, 0)); }

    // --------------------------------------------------- bells
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const ringA = S.bellIM.geometry.attributes.aRing;
    const gp = S.glints.geometry.attributes.position, gi = S.glints.geometry.attributes.aI;
    S.bells.forEach((b, i) => {
      const T = BELLS[b.k];
      const dt = t - T;
      let ang = 0.07 * Math.sin(t * b.f + b.ph) + 0.04 * Math.sin(t * 2.7 + b.ph * 2);
      let ring = 0;
      if (dt > 0) { ang += 0.42 * Math.exp(-dt * 1.3) * Math.sin(dt * 7.5 + 0.3 * b.j); ring = Math.exp(-dt * 6) * (b.j === 0 ? 1.0 : 0.6); }
      // the final bell: swings into the lens
      if (b.k === 5 && b.j === 0) { const e = smoothstep(13.1, 14.1, t); ang = lerp(ang, -0.95, e); }
      ax.set(Math.cos(b.th), 0, -Math.sin(b.th));   // tangent axis
      q.setFromAxisAngle(ax, ang);
      q2.setFromAxisAngle(up, b.th);
      q.multiply(q2);
      m4.compose(b.anchor, q, new THREE.Vector3(1.25, 1.25, 1.25));
      if (b.k === 5 && b.j === 0) S.finalBell = new THREE.Vector3(0, -0.75, 0).applyQuaternion(q).add(b.anchor);
      S.bellIM.setMatrixAt(i, m4);
      ringA.setX(i, ring);
      const gl = new THREE.Vector3(0, -0.95, 0.38).applyQuaternion(q).add(b.anchor);
      gp.setXYZ(i, gl.x, gl.y, gl.z); gi.setX(i, dt > 0 ? Math.exp(-dt * 4) * 1.6 * (dt < 0.05 ? dt / 0.05 : 1) : 0);
    });
    S.bellIM.instanceMatrix.needsUpdate = true; ringA.needsUpdate = true; gp.needsUpdate = true; gi.needsUpdate = true;

    // --------------------------------------------------- camera
    // W1: wide, pagoda on the right third, slow push. W2: corner-on crane up the bells, push into the last one.
    const bellPos = k => { const b = S.bells[k * 8]; return b.anchor.clone().add(new THREE.Vector3(0, -0.7, 0)); };
    let pos, tgt, sx, sy, fov;
    if (t < 5.4) {
      const u = t / 5.4;
      const az = THREE.MathUtils.degToRad(lerp(-30, -24, u));
      const d = lerp(142, 132, u);
      pos = new THREE.Vector3(Math.sin(az) * d, lerp(16.5, 15.5, u), Math.cos(az) * d);
      tgt = new THREE.Vector3(0, 41, 0); sx = 0.68; sy = 0.5; fov = 38;
    } else {
      const keys = [5.4, ...BELLS, 13.45, 13.95];
      // camera pose per key: [azDeg, dist, camY, target(Vector3), sx, sy, fov]
      const poses = [
        [-24, 132, 15.5, new THREE.Vector3(0, 41, 0), 0.68, 0.5, 38],
        [0, 52, 3.0, bellPos(0), 0.5, 0.40, 34],
        [0, 50, 11.5, bellPos(1), 0.5, 0.42, 34],
        [0, 48, 22.0, bellPos(2), 0.5, 0.44, 33],
        [0, 46, 33.0, bellPos(3), 0.5, 0.45, 33],
        [0, 44, 43.5, bellPos(4), 0.5, 0.46, 32],
        [0, 42, 54.0, new THREE.Vector3(0, 66, 0), 0.5, 0.40, 32],
        [0, 30, 59.0, bellPos(5), 0.5, 0.50, 30],
        [0, 18.4, bellPos(5).y + 0.3, bellPos(5).add(new THREE.Vector3(0, -0.15, 0)), 0.5, 0.5, 30],
      ];
      let i = 1; while (i < keys.length - 1 && t > keys[i]) i++;
      const k0 = keys[i - 1], k1 = keys[i];
      let u = clamp((t - k0) / (k1 - k0));
      u = i === keys.length - 1 ? u * u * (3 - 2 * u) : (i === 1 ? u * u * (3 - 2 * u) : -(Math.cos(Math.PI * u) - 1) / 2);
      const A = poses[i - 1], B = poses[i];
      const az = THREE.MathUtils.degToRad(lerp(A[0], B[0], u)), d = lerp(A[1], B[1], u);
      pos = new THREE.Vector3(Math.sin(az) * d, lerp(A[2], B[2], u), Math.cos(az) * d);
      tgt = A[3].clone().lerp(B[3], u);
      if (i === keys.length - 1) tgt.lerp(S.finalBell, u);
      sx = lerp(A[4], B[4], u); sy = lerp(A[5], B[5], u); fov = lerp(A[6], B[6], u);
    }
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(tgt);
    const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    camera.rotateY(Math.atan((sx - 0.5) * 2 * tv * camera.aspect));
    camera.rotateX(-Math.atan((0.5 - sy) * 2 * tv));
    camera.updateMatrixWorld();
    U.uCam.value.copy(camera.position);
  },

  grade(S, t) {
    return {
      exposure: 1.1,
      contrast: 1.05,
      saturation: 0.95,
      tint: [0.93, 0.98, 1.08],
      lift: [0.004, 0.007, 0.014],
      gamma: [1.0, 1.0, 1.03],
      gain: [1.02, 1.0, 1.0],
      vignette: 0.42,
      grain: 0.05,
      aberration: 0.0014,
      bloom: { strength: 0.75, radius: 0.6, threshold: 0.72 },
    };
  },
};

// merge non-indexed/indexed geometries keeping only position+normal(+uv dropped)
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
