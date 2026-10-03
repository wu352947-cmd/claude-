// Shared by sky.js (Act VII) and word.js (Act VIII): a procedural Earth (baked once on the GPU),
// its atmosphere, night-side city lights, a star field, and the hand-off camera between the two acts.
// Earth frame: Earth centre at the group origin, never rotated; world axes = Earth axes.
import * as THREE from 'three';
import { GLSL, rng, track, smoothstep, clamp, lerp, noise3 } from '../engine/util.js';

export const R = 10;                 // Earth radius (scene units)
export const RA = R + 0.3;           // top of the visible atmosphere shell
// Sun: to the right of the Earthrise view (+X), a little up, a little behind the Earth.
export const SUN = new THREE.Vector3(1, 0.16, -0.32).normalize();

// The convergence point of Act VIII ("here, now") — on the night side, chosen in bake() near this direction
// (snapped to the brightest nearby city cluster).
const P_HINT = new THREE.Vector3(-0.36, 0.45, 0.82).normalize();

// ---------------------------------------------------------------- GLSL
export const ATMO_GLSL = /* glsl */`
uniform float uR, uRA;
// single-scatter-ish atmosphere along ro + rd*t, t in [0,tmax] clipped to the shell.
vec3 atmo(vec3 ro, vec3 rd, float tmax, vec3 L){
  float b=dot(ro,rd), c=dot(ro,ro)-uRA*uRA, d=b*b-c;
  if(d<=0.) return vec3(0.);
  float sd=sqrt(d);
  float t0=max(-b-sd,0.), t1=min(-b+sd,tmax);
  if(t1<=t0) return vec3(0.);
  float dt=(t1-t0)/12.;
  vec3 sum=vec3(0.);
  for(int i=0;i<12;i++){
    float t=t0+(float(i)+.5)*dt;
    vec3 p=ro+rd*t; float r=length(p);
    float h=clamp((r-uR)/(uRA-uR),0.,1.);
    float dens=exp(-h*5.5);
    float mu=dot(p/r,L);
    float lit=smoothstep(-.18,.2,mu);
    vec3 day=mix(vec3(1.0,.42,.16), vec3(.22,.48,1.0), smoothstep(-.12,.22,mu));
    sum+=dens*lit*day*dt;
    // thin night airglow layer
    sum+=vec3(.10,.30,.22)*exp(-pow((h-.28)/.045,2.))*dt*.035*(1.-lit);
  }
  return sum;
}`;

const BAKE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL.snoise}
float fbmN(vec3 p,int oct){float a=.5,s=0.;for(int i=0;i<9;i++){if(i>=oct)break;s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
float ridge(vec3 p){float a=.5,s=0.;for(int i=0;i<6;i++){float n=1.-abs(snoise(p));s+=a*n*n;p*=2.1;a*=.5;}return s;}
void main(){
  float lon=(vUv.x-.5)*6.2831853, lat=(vUv.y-.5)*3.14159265;
  vec3 n=vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));
  // continents: domain-warped fbm
  vec3 w=vec3(fbmN(n*1.6+vec3(3.1,0,0),5), fbmN(n*1.6+vec3(0,7.7,0),5), fbmN(n*1.6+vec3(0,0,11.3),5));
  float e=fbmN(n*1.15+w*.62,9)+.10*snoise(n*.7+4.);
  e-=0.10;
  float mount=ridge(n*3.2+w);
  float elev=e+(e>0.?mount*.10*smoothstep(0.,.12,e):0.);
  float absl=abs(lat);
  // moisture / aridity
  float wet=fbmN(n*2.2+w*.4+20.,5)*.9 + .55*cos(lat*6.0)*.5 - .15*smoothstep(.15,.55,absl)*smoothstep(.75,.45,absl);
  // clouds: coverage field x swirled detail, zonal bands, a few cyclones
  vec3 cn=n;
  for(int k=0;k<5;k++){
    vec3 c=normalize(vec3(sin(float(k)*2.4+1.),.55*cos(float(k)*1.7)+(k<2?.25:-.3),cos(float(k)*2.4+1.)));
    float d=acos(clamp(dot(cn,c),-1.,1.));
    float a=(k<3?3.8:-3.8)*pow(max(1.-d/.26,0.),2.);
    // rotate around c (Rodrigues)
    cn=cn*cos(a)+cross(c,cn)*sin(a)+c*dot(c,cn)*(1.-cos(a));
  }
  vec3 cw=vec3(fbmN(cn*2.4+30.,4), fbmN(cn*2.4+40.,4), fbmN(cn*2.4+50.,4));
  float band=.55*exp(-pow((lat-.08)/.09,2.))+.45*exp(-pow((absl-.95)/.20,2.))-.35*exp(-pow((absl-.42)/.14,2.));
  float cov=fbmN(n*1.4+60.,4)*.9+band*.6-.05;
  float det=fbmN(cn*vec3(4.,8.,4.)+cw*1.5,7);
  float cl=cov*.7+det*1.15;
  // city density: land, near coasts, temperate, clustered
  float land=step(0.,e);
  float coast=exp(-max(e,0.)*22.);
  float temperate=smoothstep(1.2,.9,absl)*smoothstep(-.45,.1,wet);
  float clus=smoothstep(-.08,.42,fbmN(n*10.+7.,4));
  float fine=smoothstep(-.05,.55,fbmN(n*45.+3.,3));
  float city=1.5*land*temperate*(.3+.7*coast)*(clus*.6+fine*clus*.7+fine*.12);
  gl_FragColor=vec4(clamp(.5+elev*1.6,0.,1.), clamp(cl*.9+.5,0.,1.), clamp(city,0.,1.), clamp(wet*.8+.5,0.,1.));
}`;

const EARTH_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW;
void main(){ vN=normalize(position); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

const EARTH_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uMap, uDetail;
uniform vec3 uSun, uCam, uCenter;
uniform float uCloudShift, uCityTex, uNightBoost, uExpo;
uniform vec3 uGlowPos; uniform vec3 uGlowCol; uniform float uGlowRad;
varying vec3 vN; varying vec3 vW;
${ATMO_GLSL}
vec2 sphUV(vec3 n){ return vec2(atan(n.z,n.x)/6.2831853+.5, asin(clamp(n.y,-1.,1.))/3.14159265+.5); }
void main(){
  vec3 n=normalize(vN);
  vec2 uv=sphUV(n);
  vec4 m=texture2D(uMap,uv);
  float cloudRaw=texture2D(uMap,uv+vec2(uCloudShift,0.)).g;
  // detail (tiled noise) for close views
  float det=texture2D(uDetail,uv*vec2(96.,48.)).r-.5;
  float elev=(m.r-.5)/1.6;
  float land=smoothstep(-.002,.003,elev+det*.004);
  float lat=asin(n.y);
  float wet=(m.a-.5)/.8;
  float ice=smoothstep(1.12,1.25,abs(lat)+det*.08)+smoothstep(.16,.22,elev)*.6;
  vec3 green=vec3(.035,.07,.025), desert=vec3(.30,.20,.10), rock=vec3(.12,.10,.08);
  vec3 alb=mix(desert,green,smoothstep(-.15,.2,wet+det*.15));
  alb=mix(alb,rock,smoothstep(.05,.14,elev));
  alb=mix(alb,vec3(.75,.78,.82),clamp(ice,0.,1.));
  vec3 ocean=mix(vec3(.004,.016,.05),vec3(.006,.03,.07),smoothstep(-.04,0.,elev));
  vec3 col0=mix(ocean,alb,land);
  float cloud=smoothstep(.50,.86,cloudRaw+det*.06);
  vec3 V=normalize(uCam-vW);
  float ndl=dot(n,uSun);
  float day=smoothstep(-.03,.10,ndl);
  float dif=max(ndl,0.);
  vec3 sunCol=mix(vec3(1.,.55,.3),vec3(1.,.96,.9),smoothstep(0.,.25,ndl))*2.0;
  vec3 col=col0*dif*sunCol;
  vec3 H=normalize(uSun+V);
  col+=(1.-land)*(1.-cloud)*pow(max(dot(n,H),0.),60.)*sunCol*.45*day;
  col=mix(col,vec3(.92,.94,.97)*sunCol*dif,cloud*.92);
  // night: city light from the bake (dimmed where points take over), moonlit clouds
  float night=1.-smoothstep(-.12,.04,ndl);
  float city=pow(m.b,1.6)*(1.-cloud*.75)*night;
  col+=vec3(1.,.55,.22)*city*uCityTex;
  col+=vec3(.012,.016,.028)*(cloud*.6+.08)*night*uNightBoost;
  // tower glow on the ground / clouds around it
  vec3 dg=vW-uGlowPos; float g=uGlowRad>0.?exp(-dot(dg,dg)/(uGlowRad*uGlowRad)):0.;
  col+=uGlowCol*g*(.35+cloud*1.4);
  // atmosphere in front of the surface
  vec3 ro=uCam-uCenter, rd=normalize(vW-uCam);
  col+=atmo(ro,rd,length(vW-uCam),uSun)*uExpo;
  gl_FragColor=vec4(col,1.);
}`;

const SHELL_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSun, uCam, uCenter; uniform float uExpo;
varying vec3 vW;
${ATMO_GLSL}
void main(){
  vec3 ro=uCam-uCenter, rd=normalize(vW-uCam);
  // stop at the planet
  float b=dot(ro,rd), c=dot(ro,ro)-uR*uR, d=b*b-c;
  float tmax=1e6; if(d>0.){ float tp=-b-sqrt(d); if(tp>0.) tmax=tp; }
  gl_FragColor=vec4(atmo(ro,rd,tmax,uSun)*uExpo,1.);
}`;

const CITY_VERT = /* glsl */`
attribute float aB;
uniform float uPx, uSize, uVis; uniform vec3 uSun;
uniform sampler2D uMap; uniform float uCloudShift;
varying float vI; varying float vHot;
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.);
  float depth=max(-mv.z,1e-4);
  float px=uSize*(.6+aB*.9)*uPx/depth;
  float a=1.;
  if(px<1.6){ a=px*px/2.56; px=1.6; }
  vec3 n=normalize(position);
  float night=1.-smoothstep(-.10,.03,dot(n,uSun));
  vec2 uv=vec2(atan(n.z,n.x)/6.2831853+.5, asin(clamp(n.y,-1.,1.))/3.14159265+.5);
  float cl=smoothstep(.52,.80,texture2D(uMap,uv+vec2(uCloudShift,0.)).g);
  vI=aB*a*night*uVis*(1.-cl*.7);
  vHot=aB;
  gl_PointSize=min(px,64.);
  gl_Position=projectionMatrix*mv;
}`;
const CITY_FRAG = /* glsl */`
precision highp float;
varying float vI; varying float vHot;
void main(){
  vec2 d=gl_PointCoord-.5; float r2=dot(d,d)*4.;
  float f=exp(-r2*4.5)+.25*exp(-r2*1.2);
  vec3 c=mix(vec3(1.,.48,.16),vec3(1.,.85,.6),vHot);
  gl_FragColor=vec4(c*f*vI*2.6,1.);
}`;

const STAR_VERT = /* glsl */`
attribute float aMag; attribute vec3 aCol;
uniform float uPxScale, uVis;
varying vec3 vC;
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.);
  float s=mix(1.,3.4,aMag)*uPxScale;
  float a=1.; if(s<1.5){ a=s*s/2.25; s=1.5; }
  vC=aCol*(.12+pow(aMag,2.2)*2.6)*a*uVis;
  gl_PointSize=s;
  gl_Position=projectionMatrix*mv;
}`;
const STAR_FRAG = /* glsl */`
precision highp float;
varying vec3 vC;
void main(){ vec2 d=gl_PointCoord-.5; float r2=dot(d,d)*4.; gl_FragColor=vec4(vC*exp(-r2*3.5),1.); }`;

// ---------------------------------------------------------------- bake (cached per renderer)
let bakeCache = null;
export function bake(renderer) {
  if (bakeCache) return bakeCache;
  const BW = 2048, BH = 1024;
  const rt = new THREE.WebGLRenderTarget(BW, BH, {
    type: THREE.UnsignedByteType, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
  });
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  const px = new Uint8Array(BW * BH * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, BW, BH, px);
  renderer.setRenderTarget(prev);
  mat.dispose(); quad.geometry.dispose();

  // tiled detail noise (CPU, 256², periodic value noise)
  const DN = 256, dd = new Uint8Array(DN * DN * 4);
  {
    const r = rng(77);
    const oct = [[8, .5], [16, .28], [32, .14], [64, .08]];
    const grids = oct.map(([f]) => { const g = new Float32Array(f * f); for (let i = 0; i < g.length; i++) g[i] = r(); return g; });
    for (let y = 0; y < DN; y++) for (let x = 0; x < DN; x++) {
      let s = 0;
      oct.forEach(([f, a], k) => {
        const g = grids[k], fx = x / DN * f, fy = y / DN * f;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const v = (i, j) => g[((j % f + f) % f) * f + ((i % f + f) % f)];
        s += a * lerp(lerp(v(x0, y0), v(x0 + 1, y0), sx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), sx), sy);
      });
      const v = Math.round(clamp(s / 1.0) * 255);
      const o = (y * DN + x) * 4; dd[o] = dd[o + 1] = dd[o + 2] = v; dd[o + 3] = 255;
    }
  }
  const detail = new THREE.DataTexture(dd, DN, DN, THREE.RGBAFormat);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.magFilter = THREE.LinearFilter; detail.minFilter = THREE.LinearMipmapLinearFilter;
  detail.generateMipmaps = true; detail.needsUpdate = true;

  // city points from the city channel
  const r = rng(4242);
  const pos = [], bri = [];
  const dir = (u, v) => {
    const lon = (u - 0.5) * Math.PI * 2, lat = (v - 0.5) * Math.PI;
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
  };
  let landCount = 0, best = -1, bestDir = null;
  for (let y = 0; y < BH; y++) {
    const lat = (y / BH - 0.5) * Math.PI, cl = Math.cos(lat);
    for (let x = 0; x < BW; x++) {
      const o = (y * BW + x) * 4;
      if (px[o] >= 128) landCount += cl;
      const c = px[o + 2] / 255;
      if (c < 0.02) continue;
      const p = Math.pow(c, 1.2) * cl * 1.6;
      let k = 0;
      while (k < 3 && r() < p) {
        const d = dir((x + r()) / BW, (y + r()) / BH);
        const rr = R * 1.0006;
        pos.push(d[0] * rr, d[1] * rr, d[2] * rr);
        bri.push(Math.min(1, c * (0.45 + 0.7 * r())));
        k++;
      }
      // convergence point: the densest city region near the hint direction (night side)
      if (c > 0.25 && (x & 1) === 0 && (y & 1) === 0) {
        const d = dir((x + 0.5) / BW, (y + 0.5) / BH);
        const ang = d[0] * P_HINT.x + d[1] * P_HINT.y + d[2] * P_HINT.z;
        const ds = d[0] * SUN.x + d[1] * SUN.y + d[2] * SUN.z;
        if (ang > 0.86 && ds < -0.35 && ds > -0.65) {
          let sum = 0;
          for (let j = -12; j <= 12; j += 2) for (let i = -12; i <= 12; i += 2) sum += px[(clamp(y + j, 0, BH - 1) * BW + ((x + i + BW) % BW)) * 4 + 2];
          const sc = sum * (0.6 + ang);
          if (sc > best) { best = sc; bestDir = d; }
        }
      }
    }
  }
  let total = 0; for (let y = 0; y < BH; y++) total += Math.cos((y / BH - 0.5) * Math.PI) * BW;
  const P = bestDir ? new THREE.Vector3(...bestDir).normalize() : P_HINT.clone();
  // dense local city field around P (for the close night views of Acts VII→VIII)
  const loc = localCities(px, BW, BH, P);
  bakeCache = {
    map: rt.texture, rt, detail, P, locPos: loc.pos, locB: loc.bri,
    cityPos: new Float32Array(pos), cityB: new Float32Array(bri),
    landFrac: landCount / total,
  };
  return bakeCache;
}

function localCities(px, BW, BH, P) {
  const r = rng(99);
  const up = P.clone(), e1 = new THREE.Vector3(0, 1, 0).cross(up).normalize(), e2 = new THREE.Vector3().crossVectors(up, e1);
  const RAD = 5.0, SP = 0.0075;
  const pos = [], bri = [];
  const sample = (d) => {
    const lon = Math.atan2(d.z, d.x), lat = Math.asin(clamp(d.y, -1, 1));
    const fx = (lon / (2 * Math.PI) + 0.5) * BW - 0.5, fy = (lat / Math.PI + 0.5) * BH - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x, y, c) => px[(clamp(y, 0, BH - 1) * BW + ((x % BW) + BW) % BW) * 4 + c] / 255;
    const bl = c => lerp(lerp(g(x0, y0, c), g(x0 + 1, y0, c), tx), lerp(g(x0, y0 + 1, c), g(x0 + 1, y0 + 1, c), tx), ty);
    return [bl(0), bl(2)];
  };
  const d = new THREE.Vector3();
  for (let a = -RAD; a < RAD; a += SP) for (let b = -RAD; b < RAD; b += SP) {
    const rr = Math.hypot(a, b); if (rr > RAD) continue;
    const ja = a + (r() - 0.5) * SP * 1.6, jb = b + (r() - 0.5) * SP * 1.6;
    d.copy(up).multiplyScalar(R).addScaledVector(e1, ja).addScaledVector(e2, jb).normalize();
    const [el, c] = sample(d);
    if (el < 0.5 || c < 0.01) continue;
    // fine clustering (towns, suburbs, highways)
    const q = d.clone().multiplyScalar(R * 3.0);
    const n1 = noise3(q.x, q.y, q.z), n2 = noise3(q.x * 3.1 + 5, q.y * 3.1, q.z * 3.1), n3 = noise3(q.x * 9.3, q.y * 9.3 + 2, q.z * 9.3);
    const road = Math.exp(-Math.pow(Math.abs(noise3(q.x * 0.9 + 11, q.y * 0.9, q.z * 0.9)) / 0.035, 2));
    let dens = Math.pow(c, 1.1) * (smoothstep(-0.25, 0.55, n1 + 0.5 * n2) * 1.4 + road * 0.5) * (0.55 + 0.45 * n3) * 3.2;
    const edgeFade = smoothstep(RAD, RAD * 0.8, rr);
    if (r() > dens * edgeFade) continue;
    const rad = R * 1.0004;
    pos.push(d.x * rad, d.y * rad, d.z * rad);
    bri.push(clamp(0.25 + 0.9 * dens * r() + (n2 > 0.35 ? 0.3 : 0)));
  }
  return { pos: new Float32Array(pos), bri: new Float32Array(bri) };
}

// ---------------------------------------------------------------- Earth group
export function createEarth(renderer, { segments = 256 } = {}) {
  const B = bake(renderer);
  const group = new THREE.Group();
  const common = {
    uSun: { value: SUN.clone() }, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() },
    uR: { value: R }, uRA: { value: RA }, uExpo: { value: 1.0 },
  };
  const earthMat = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
    uniforms: {
      ...common, uMap: { value: B.map }, uDetail: { value: B.detail },
      uCloudShift: { value: 0 }, uCityTex: { value: 0.5 }, uNightBoost: { value: 1.0 },
      uGlowPos: { value: new THREE.Vector3() }, uGlowCol: { value: new THREE.Vector3() }, uGlowRad: { value: 0 },
    },
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, segments, segments / 2), earthMat);
  group.add(earth);

  const shellMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: SHELL_FRAG, uniforms: common,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(RA, 160, 80), shellMat);
  shell.renderOrder = 2;
  group.add(shell);

  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(B.cityPos, 3));
  cg.setAttribute('aB', new THREE.BufferAttribute(B.cityB, 1));
  const cityMat = new THREE.ShaderMaterial({
    vertexShader: CITY_VERT, fragmentShader: CITY_FRAG,
    uniforms: { uPx: { value: 1000 }, uSize: { value: 0.010 }, uVis: { value: 1 }, uSun: common.uSun, uMap: { value: B.map }, uCloudShift: earthMat.uniforms.uCloudShift },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const cities = new THREE.Points(cg, cityMat);
  cities.renderOrder = 1;
  cities.frustumCulled = false;
  group.add(cities);

  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(B.locPos, 3));
  lg.setAttribute('aB', new THREE.BufferAttribute(B.locB, 1));
  const locMat = cityMat.clone();
  locMat.uniforms = { ...cityMat.uniforms, uSize: { value: 0.0042 }, uVis: { value: 1 } };
  const local = new THREE.Points(lg, locMat);
  local.renderOrder = 1; local.frustumCulled = false;
  group.add(local);

  return {
    group, earth, shell, cities, local, locMat, earthMat, shellMat, cityMat, P: B.P, bake: B,
    // per frame: camera (world), global time
    update(camera, g, H) {
      group.updateMatrixWorld();
      const c = group.getWorldPosition(new THREE.Vector3());
      common.uCam.value.copy(camera.getWorldPosition(new THREE.Vector3()));
      common.uCenter.value.copy(c);
      earthMat.uniforms.uCloudShift.value = g * 0.00012;
      cityMat.uniforms.uPx.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      locMat.uniforms.uPx.value = cityMat.uniforms.uPx.value;
      // close to the surface the dense local field takes over from the bake
      const alt = common.uCam.value.distanceTo(c) - R;
      const near = smoothstep(9, 3.5, alt);
      locMat.uniforms.uVis.value = near;
      earthMat.uniforms.uCityTex.value = lerp(0.5, 0.12, near);
      common.uExpo.value = lerp(0.28, 1.0, smoothstep(0.25, 2.5, alt));
    },
  };
}

// ---------------------------------------------------------------- stars
export function createStars({ count = 7000, seed = 9, W = 1920 } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), mag = new Float32Array(count), col = new Float32Array(count * 3);
  // galactic band plane
  const gp = new THREE.Vector3(0.35, 0.8, -0.48).normalize();
  for (let i = 0; i < count; i++) {
    let v;
    if (i < count * 0.45) {
      // concentrate toward the band
      v = new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize();
      const d = v.dot(gp); v.addScaledVector(gp, -d * 0.86).normalize();
    } else v = new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize();
    pos.set([v.x * 900, v.y * 900, v.z * 900], i * 3);
    mag[i] = Math.pow(r(), 6.0);
    const tmp = r();
    const c = tmp < 0.2 ? [1.0, 0.78, 0.6] : tmp < 0.55 ? [1, 0.95, 0.88] : [0.78, 0.86, 1.0];
    col.set(c, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    uniforms: { uPxScale: { value: W / 1920 }, uVis: { value: 1 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -1;
  return { points: pts, mat, follow(camera) { pts.position.copy(camera.position); } };
}

// ---------------------------------------------------------------- hand-off camera (Act VII end → Act VIII start)
// A pose relative to the Earth centre, as a function of global time; both scenes use it across 175.0–176.5.
export function frameAt(P) {
  // tangent frame at P: up = P, fwd = direction along the surface toward the terminator/limb
  const up = P.clone().normalize();
  const towardSun = SUN.clone().addScaledVector(up, -SUN.dot(up)).normalize();
  const side = new THREE.Vector3().crossVectors(towardSun, up).normalize();
  return { up, fwd: towardSun, side };
}

// Tower-local frame at P: origin on the surface, Y = up (radial), Z = away from the sun (fwd = -Z), X = side.
export function tlFrame(P) {
  const { up, fwd, side } = frameAt(P);
  return { o: P.clone().multiplyScalar(R), X: side, Y: up, Z: fwd.clone().negate(), P: P.clone() };
}
export function tlToWorld(F, x, y, z, out = new THREE.Vector3()) {
  return out.copy(F.o).addScaledVector(F.X, x).addScaledVector(F.Y, y).addScaledVector(F.Z, z);
}
// point `alt` above the true sphere surface beneath tangent-plane coords (x, z)
export function surfaceTL(F, x, z, alt, out = new THREE.Vector3()) {
  out.copy(F.o).addScaledVector(F.X, x).addScaledVector(F.Z, z);
  return out.normalize().multiplyScalar(R + alt);
}

// N1 camera path (global time g): high over the night side, descending toward P until 188.
export const N1_END = { back: 1.6, alt: 0.2 };
export function n1Pose(P, g) {
  const F = tlFrame(P);
  const u = clamp((g - 176) / 12);
  const alt = 3.4 * Math.pow(N1_END.alt / 3.4, Math.pow(u, 1.25));
  const back = 4.8 * Math.pow(N1_END.back / 4.8, Math.pow(u, 1.1));
  const lat = -0.9 * (1 - (u * u * (3 - 2 * u)));
  const pos = surfaceTL(F, lat, back, alt);
  const target = surfaceTL(F, 0, -0.6 * (1 - u), 0);
  return { pos, target, up: pos.clone().normalize(), fov: 34, sx: 0.5, sy: lerp(0.56, 0.66, u) };
}

// Orient `cam` at `pos` so that world point `target` lands at screen fraction (sx, sy) (top-left origin).
const _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _mz = new THREE.Vector3(0, 0, -1);
export function aimCamera(cam, pos, target, up, sx = 0.5, sy = 0.5) {
  cam.position.copy(pos); cam.up.copy(up); cam.lookAt(target);
  if (Math.abs(sx - 0.5) < 1e-6 && Math.abs(sy - 0.5) < 1e-6) return cam;
  const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  _d.set((2 * sx - 1) * th * cam.aspect, (1 - 2 * sy) * th, -1).normalize();
  _q.setFromUnitVectors(_mz, _d).invert();
  cam.quaternion.multiply(_q);
  return cam;
}
