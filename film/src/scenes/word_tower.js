// Act VIII — the tower of all scripts: glyph atlas, the helical text-wall (Bruegel ramp), its core,
// and the streams of free glyphs. Everything lives in the tower-local frame (Y up, base at y = 0).
import * as THREE from 'three';
import { rng, clamp, lerp, smoothstep, track } from '../engine/util.js';

const range = (a, b) => { const s = []; for (let c = a; c <= b; c++) s.push(String.fromCodePoint(c)); return s; };
const chars = s => [...s];

// [family, chars, tint(rgb), weight]
export const SCRIPTS = [
  ['Noto Sans Cuneiform', range(0x12000, 0x12100).filter((_, i) => i % 5 === 0), [1.0, 0.82, 0.55]],
  ['Noto Sans Egyptian Hieroglyphs', range(0x13000, 0x13400).filter((_, i) => i % 23 === 0), [1.0, 0.86, 0.6]],
  ['Noto Serif SC', chars('人天言塔火木石泥信铁日月山水土金王大中文字书语心手口目耳生命光道一二三上下東西南北龍鳳雨雲風星辰海河門田犬馬鳥魚'), [1.0, 0.8, 0.62]],
  ['Noto Sans Phoenician', range(0x10900, 0x10915), [1.0, 0.78, 0.5]],
  ['Noto Sans Linear B', range(0x10000, 0x1005d).filter((_, i) => i % 3 === 0), [1.0, 0.84, 0.58]],
  ['Noto Sans Old Persian', range(0x103a0, 0x103c3), [1.0, 0.8, 0.55]],
  ['Noto Serif', chars('ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθλμξπσφψω'), [0.95, 0.9, 0.8]],
  ['Noto Serif Hebrew', chars('אבגדהוזחטיכלמנסעפצקרשת'), [1.0, 0.88, 0.7]],
  ['Noto Naskh Arabic', chars('ابتثجحخدذرزسشصضطظعغفقكلمنهوي'), [0.95, 0.92, 0.75]],
  ['Noto Serif Devanagari', chars('अआइईउऊएऐओऔकखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह'), [1.0, 0.8, 0.5]],
  ['Noto Sans Brahmi', range(0x11005, 0x11037), [1.0, 0.82, 0.52]],
  ['Noto Serif Tibetan', chars('ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ'), [1.0, 0.78, 0.55]],
  ['Noto Serif Ethiopic', chars('ሀለሐመሠረሰሸቀበተቸኀነኘአከኸወዐዘዠየደጀገጠጨጰጸፀፈፐ'), [1.0, 0.85, 0.62]],
  ['Noto Sans Runic', range(0x16a0, 0x16ea), [0.9, 0.9, 0.95]],
  ['Noto Sans Cherokee', range(0x13a0, 0x13f4), [0.95, 0.88, 0.72]],
  ['Noto Serif KR', chars('한글세종대왕말씀나라사람하늘땅바다별빛길꿈'), [0.9, 0.92, 1.0]],
  ['Noto Serif JP', chars('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコ'), [1.0, 0.86, 0.78]],
  ['Noto Serif Thai', chars('กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'), [1.0, 0.84, 0.6]],
  ['Noto Serif Tamil', chars('அஆஇஈஉஊஎஏஐஒஓஔகஙசஞடணதநபமயரலவழளறன'), [1.0, 0.82, 0.58]],
  ['Noto Serif Armenian', chars('ԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖ'), [0.95, 0.88, 0.75]],
  ['Noto Serif Georgian', chars('აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ'), [0.95, 0.9, 0.78]],
  ['Noto Sans Mongolian', chars('ᠠᠡᠢᠣᠤᠥᠦᠧᠨᠩᠪᠫᠬᠭᠮᠯᠰᠱᠲᠳᠴᠵᠶᠷᠸ'), [1.0, 0.85, 0.6]],
  ['Noto Serif', chars('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЖЗИЛМПФЦЧШЩЭЮЯ'), [0.92, 0.94, 1.0]],
  ['JetBrains Mono', chars('{}()[];=<>/+*#&|$λ→:._'), [0.7, 0.92, 1.0]],
  ['JetBrains Mono', chars('0101100101'), [0.65, 0.95, 1.0]],
];

export async function buildAtlas() {
  const all = [], fonts = [], scriptOf = [], starts = [];
  const CELL = 64;
  await Promise.all(SCRIPTS.map(([fam, cs]) => document.fonts.load(`400 ${CELL * 0.7}px "${fam}"`, [...new Set(cs)].join('')).catch(() => null)));
  SCRIPTS.forEach(([fam, cs], si) => {
    const uniq = [...new Set(cs)];
    starts.push([all.length, uniq.length]);
    for (const c of uniq) { all.push(c); fonts.push(`400 ${CELL * 0.7}px "${fam}"`); scriptOf.push(si); }
  });
  // rasterise (own canvas so the glow-friendly white glyphs are centred & scaled to fit)
  const n = all.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const c = document.createElement('canvas');
  c.width = cols * CELL; c.height = rows * CELL;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    g.font = fonts[i];
    const x = (i % cols) * CELL + CELL / 2, y = Math.floor(i / cols) * CELL + CELL / 2;
    const m = g.measureText(all[i]);
    const w = m.width, h = (m.actualBoundingBoxAscent || CELL * 0.6) + (m.actualBoundingBoxDescent || 0);
    const k = Math.min(1, (CELL * 0.86) / Math.max(w, h, 1));
    const yo = ((m.actualBoundingBoxAscent || 0) - (m.actualBoundingBoxDescent || 0)) / 2;
    g.save(); g.translate(x, y); g.scale(k, k); g.textBaseline = 'alphabetic';
    g.fillText(all[i], 0, yo);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const uv = i => { const x = i % cols, y = Math.floor(i / cols); return [x / cols, 1 - (y + 1) / rows, 1 / cols, 1 / rows]; };
  return { tex, n, uv, starts, scriptOf };
}

// ---------------------------------------------------------------- tower geometry
export const HT = 3.3;              // tower height
export const RB = 0.42;             // base radius
export const NCOL = 120, ROWS = 8;
export function radiusAt(y) {
  const u = clamp(y / HT, 0, 1);
  // Bruegel: broad stepped base, then a long tapering spire
  const tier = 1 - 0.035 * smoothstep(0.55, 1, ((y / 0.11) % 1)) * (1 - u);
  return RB * Math.pow(1 - u * 0.93, 0.92) * tier + 0.012;
}

const GLYPH_VERT = /* glsl */`
attribute vec4 iP;     // x y z (local), size
attribute vec4 iA;     // theta, arrival time, seed, script
attribute vec4 iUV;    // atlas rect
attribute vec3 iC;     // tint
uniform float uTime, uBright, uFade, uFront;
uniform vec3 uSunL;    // sun dir (local frame)
uniform mat4 uTowerW;  // local → world
uniform float uR;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  float th=iA.x;
  float k=clamp((uTime-iA.y)/.55,0.,1.);
  float e=1.-pow(1.-k,3.);
  vec3 tgt=iP.xyz;
  vec3 src=vec3(0.,iP.y-.35,0.);
  vec3 p=mix(src,tgt,e);
  vec3 rad=vec3(cos(th),0.,sin(th));
  vec3 right=vec3(-sin(th),0.,cos(th));
  float s=iP.w*(.4+.6*e);
  vec3 lp=p+right*position.x*s+vec3(0.,1.,0.)*position.y*s+rad*.002;
  vec4 w=uTowerW*vec4(lp,1.);
  // sunlight on the tower (outside the Earth's shadow cylinder)
  vec3 wp=w.xyz; vec3 L=normalize(uSunL);
  float along=dot(wp,L);
  float perp=length(wp-along*L);
  float sun=along>0.?1.:smoothstep(uR*.995,uR*1.02,perp);
  float hot=exp(-max(uTime-iA.y,0.)*1.6);
  float pulse=pow(.5+.5*sin(iP.y*9.-uTime*3.2+iA.z*2.),6.);
  vCol=mix(iC*vec3(1.,.8,.5),vec3(1.,.97,.9),.35+.3*sun)*(uBright*(1.+.7*pulse+sun*.5)+hot*3.);
  vA=step(0.,uTime-iA.y)*uFade*(.75+.5*iA.z);
  vUv=iUV.xy+(position.xy+.5)*iUV.zw;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const GLYPH_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  float a=texture2D(uAtlas,vUv).a*vA;
  if(a<.01) discard;
  gl_FragColor=vec4(vCol*a,1.);
}`;

const STREAM_VERT = /* glsl */`
attribute vec4 iP;     // rho0, theta0, y1 (fraction), size
attribute vec4 iA;     // rate, seed, turns, kind
attribute vec4 iUV;
attribute vec3 iC;
uniform float uTime, uFront, uVis, uApex, uBright;
uniform vec3 uApexPos;
uniform mat4 uTowerW;
varying vec2 vUv; varying vec3 vCol; varying float vA;
float rAt(float y){ float u=clamp(y/${HT.toFixed(3)},0.,1.); return ${RB.toFixed(3)}*pow(1.-u*.93,.92)+.012; }
void main(){
  float ph=fract(uTime*iA.x+iA.y);
  vec3 p;
  // mode A: rising vortex around the tower, landing on the wall at y1*front
  float y1=iP.z*uFront;
  float y=mix(-.02,y1,smoothstep(0.,1.,ph));
  float rho=mix(iP.x,rAt(y)*1.04,pow(ph,.7));
  float th=iP.y+ph*iA.z*6.2831;
  vec3 pa=vec3(cos(th)*rho,y,sin(th)*rho);
  // mode B: converge into the apex (the cursor)
  float rb=iP.x*1.6*(1.-ph)+.003;
  float tb=iP.y+ph*iA.z*4.;
  vec3 pb=uApexPos+vec3(cos(tb)*rb,(iP.z-.6)*1.2*(1.-ph)*(1.-ph),sin(tb)*rb);
  p=mix(pa,pb,uApex);
  float fade=smoothstep(0.,.08,ph)*smoothstep(1.,.85,ph);
  vec4 mv=viewMatrix*uTowerW*vec4(p,1.);
  fade*=smoothstep(.04,.25,-mv.z);
  float s=iP.w*mix(1.,.6+.4*(1.-ph),uApex);
  mv.xy+=position.xy*s;
  vUv=iUV.xy+(position.xy+.5)*iUV.zw;
  vCol=mix(iC,vec3(1.,.95,.85),.5)*uBright*(1.+2.*smoothstep(.85,1.,ph));
  vA=fade*uVis;
  gl_Position=projectionMatrix*mv;
}`;

function quadGeo() {
  const b = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = b.index; g.setAttribute('position', b.getAttribute('position'));
  return g;
}

// arrival time of the build front at height y (front(t) increasing); tabulated inverse
export function buildTower(atlas, frontFn, t0, t1) {
  const r = rng(2026);
  // inverse of the front
  const tab = [];
  for (let k = 0; k <= 400; k++) { const t = t0 + (t1 - t0) * k / 400; tab.push([t, frontFn(t)]); }
  const timeAt = y => { for (let k = 1; k < tab.length; k++) if (tab[k][1] >= y) { const [ta, ya] = tab[k - 1], [tb, yb] = tab[k]; return lerp(ta, tb, clamp((y - ya) / Math.max(yb - ya, 1e-6))); } return t1 + 10; };

  const P = [], A = [], UV = [], C = [];
  const ramp = [];        // helix base points for the ramp strip
  let th = 0, yb = 0, script = 0, runLeft = 0;
  const dth = Math.PI * 2 / NCOL;
  while (yb < HT) {
    const rr = radiusAt(yb);
    const gs = 2 * Math.PI * rr / NCOL;
    const pitch = ROWS * gs * 1.32;
    if (runLeft <= 0) { script = Math.floor(r() * SCRIPTS.length); runLeft = 6 + Math.floor(r() * 34); }
    runLeft--;
    const [s0, sn] = atlas.starts[script];
    for (let k = 0; k < ROWS; k++) {
      const y = yb + gs * (0.95 + k * 1.12);
      const ci = s0 + Math.floor(r() * sn);
      const sz = gs * (0.92 + 0.12 * r());
      P.push(Math.cos(th) * rr, y, Math.sin(th) * rr, sz);
      A.push(th, timeAt(y) + (r() - 0.5) * 0.25, r(), script);
      UV.push(...atlas.uv(ci));
      C.push(...SCRIPTS[script][2]);
    }
    ramp.push([th, yb, rr, pitch]);
    th += dth;
    yb += pitch / NCOL;
  }
  const N = P.length / 4;
  const g = quadGeo();
  g.setAttribute('iP', new THREE.InstancedBufferAttribute(new Float32Array(P), 4));
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
  g.setAttribute('iUV', new THREE.InstancedBufferAttribute(new Float32Array(UV), 4));
  g.setAttribute('iC', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
  g.instanceCount = N;
  const U = {
    uAtlas: { value: atlas.tex }, uTime: { value: 0 }, uBright: { value: 1.6 }, uFade: { value: 1 }, uFront: { value: 0 },
    uSunL: { value: new THREE.Vector3(1, 0, 0) }, uTowerW: { value: new THREE.Matrix4() }, uR: { value: 10 },
  };
  const glyphs = new THREE.Mesh(g, new THREE.ShaderMaterial({
    vertexShader: GLYPH_VERT, fragmentShader: GLYPH_FRAG, uniforms: U,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  glyphs.frustumCulled = false;

  // ramp strip (ledge) + dark core
  const rv = [], rs = [];
  for (const [t, y, rr, pitch] of ramp) {
    const led = pitch * 0.12;
    rv.push(Math.cos(t) * rr * 0.985, y, Math.sin(t) * rr * 0.985, Math.cos(t) * (rr + led), y, Math.sin(t) * (rr + led));
    rs.push(0, timeAt(y), 1, timeAt(y));
  }
  const idx = [];
  for (let i = 0; i < ramp.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rv), 3));
  rg.setAttribute('aE', new THREE.BufferAttribute(new Float32Array(rs), 2));
  rg.setIndex(idx);
  const rampMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute vec2 aE; uniform mat4 uTowerW; varying float vE; varying float vT; varying vec3 vW;
      void main(){ vE=aE.x; vT=aE.y; vec4 w=uTowerW*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`precision highp float; uniform float uTime, uFade, uR; uniform vec3 uSunL; varying float vE; varying float vT; varying vec3 vW;
      void main(){ if(uTime<vT) discard;
        vec3 L=normalize(uSunL); float al=dot(vW,L); float sun=al>0.?1.:smoothstep(uR*.995,uR*1.02,length(vW-al*L));
        float edge=smoothstep(.75,1.,vE);
        float hot=exp(-(uTime-vT)*1.2);
        vec3 c=vec3(.03,.02,.012)+vec3(1.,.72,.38)*(edge*.45+hot*2.)+vec3(1.,.8,.55)*sun*.25;
        gl_FragColor=vec4(c*uFade,1.); }`,
  });
  const rampMesh = new THREE.Mesh(rg, rampMat);
  rampMesh.frustumCulled = false;

  const prof = [];
  for (let k = 0; k <= 160; k++) { const y = HT * k / 160; prof.push(new THREE.Vector2(radiusAt(y) * 0.975, y)); }
  prof.push(new THREE.Vector2(0.001, HT + 0.002));
  const core = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.ShaderMaterial({
    uniforms: { ...U, uCamL: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`uniform mat4 uTowerW; varying vec3 vL; varying vec3 vN; varying vec3 vW;
      void main(){ vL=position; vN=normal; vec4 w=uTowerW*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`precision highp float; uniform float uFront, uFade, uR, uTime; uniform vec3 uSunL; uniform mat4 uTowerW;
      varying vec3 vL; varying vec3 vN; varying vec3 vW;
      void main(){ if(vL.y>uFront+.02) discard;
        vec3 Nw=normalize(mat3(uTowerW)*vN);
        vec3 L=normalize(uSunL); float al=dot(vW,L); float sun=al>0.?1.:smoothstep(uR*.995,uR*1.02,length(vW-al*L));
        float dif=max(dot(Nw,L),0.)*sun;
        float band=.5+.5*sin(vL.y*140.);
        vec3 c=vec3(.012,.01,.014)+vec3(.35,.22,.1)*dif*.6+vec3(.08,.05,.02)*band;
        c+=vec3(1.,.7,.35)*smoothstep(.06,0.,uFront-vL.y)*1.2;
        gl_FragColor=vec4(c*uFade,1.); }`,
  }));
  core.frustumCulled = false;

  return { glyphs, rampMesh, core, U, count: N, timeAt };
}

export function buildStream(atlas, U, count = 16000) {
  const r = rng(77);
  const P = [], A = [], UV = [], C = [];
  for (let i = 0; i < count; i++) {
    const si = Math.floor(r() * SCRIPTS.length), [s0, sn] = atlas.starts[si];
    const rho = 0.45 + Math.pow(r(), 1.6) * 2.6;
    P.push(rho, r() * Math.PI * 2, Math.pow(r(), 0.8), 0.006 + 0.012 * r());
    A.push(0.05 + 0.12 * r(), r(), 0.8 + 2.2 * r(), 0);
    UV.push(...atlas.uv(s0 + Math.floor(r() * sn)));
    C.push(...SCRIPTS[si][2]);
  }
  const g = quadGeo();
  g.setAttribute('iP', new THREE.InstancedBufferAttribute(new Float32Array(P), 4));
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
  g.setAttribute('iUV', new THREE.InstancedBufferAttribute(new Float32Array(UV), 4));
  g.setAttribute('iC', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
  g.instanceCount = count;
  const SU = { ...U, uVis: { value: 0 }, uApex: { value: 0 }, uApexPos: { value: new THREE.Vector3(0, HT, 0) }, uBright: { value: 1.4 } };
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    vertexShader: STREAM_VERT, fragmentShader: GLYPH_FRAG, uniforms: SU,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  mesh.frustumCulled = false;
  return { mesh, U: SU };
}
