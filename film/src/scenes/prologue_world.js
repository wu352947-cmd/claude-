// Shared world pieces for the prologue: sky dome, plain, river, point-sprite helpers.
import { GLSL } from '../engine/util.js';

// Linear colour of the cursor ink (#ece4d3).
export const INK_LIN = [0.8388, 0.7758, 0.6514];

// Sky gradient: black zenith → indigo #141a33 → warm low band → ember horizon line.
// uDawn scales everything (0 = pure black), uLine the thin ember line, uSun = horizontal glow dir.
export const SKY_GLSL = /* glsl */`
uniform float uDawn, uLine;
uniform vec3 uSun;
vec3 skyCol(vec3 d, float withLine){
  float e = d.y;
  vec2 hz = normalize(d.xz + 1e-5);
  float az = dot(hz, normalize(uSun.xz)) * .5 + .5;
  float g1 = pow(az, 3.), g2 = pow(az, 16.);
  vec3 zen = vec3(.0008, .0010, .0030);
  vec3 indigo = vec3(.0070, .0103, .0331) * 1.5;
  vec3 col = mix(indigo, zen, smoothstep(.0, .55, max(e, 0.)));
  float low = exp(-max(e, 0.) * 26.);
  col += vec3(.040, .015, .006) * low * (.15 + g1 * .8 + g2 * 1.4);
  col += vec3(.006, .007, .012) * exp(-max(e, 0.) * 4.) * (.5 + g1);
  float ln = exp(-abs(e - .003) * 700.);
  col += vec3(1.3, .34, .07) * ln * uLine * (.12 + g1 * .55 + g2 * 1.0) * withLine;
  float ln2 = exp(-abs(e - .004) * 140.);
  col += vec3(.16, .045, .012) * ln2 * uLine * (.08 + g1 * .4 + g2 * 1.) * withLine;
  return col * uDawn;
}
vec3 hazeCol(vec3 d){ return skyCol(normalize(vec3(d.x, .0, d.z)), 0.) * .42; }
`;

export function makeSky(THREE, uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false, depthTest: false, side: THREE.BackSide,
    vertexShader: /* glsl */`varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
precision highp float;
${SKY_GLSL}
${GLSL.hash}
uniform float uStars;
varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  vec3 col = skyCol(d, 1.);
  // sparse soft stars, fading toward the horizon glow
  vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1., 1.))) * 260.;
  vec2 cell = floor(sp), f = fract(sp) - .5;
  float h = hash12(cell);
  if (h > .9955 && d.y > .02) {
    vec2 o = vec2(hash12(cell + 17.), hash12(cell + 31.)) - .5;
    float r = length(f - o * .6);
    float b = pow(hash12(cell + 5.), 3.);
    col += vec3(.85, .88, 1.) * exp(-r * r * 30.) * (.08 + b * .9) * uStars * smoothstep(.02, .2, d.y);
  }
  gl_FragColor = vec4(col, 1.);
}`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

export function makeGround(THREE, uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
precision highp float;
${SKY_GLSL}
${GLSL.snoise}
uniform vec3 uCam;
uniform float uT;
uniform vec4 uPool;
varying vec3 vW;
void main(){
  vec3 V = vW - uCam; float dist = length(V); vec3 dir = V / dist;
  vec2 p = vW.xz;
  // broad swells (analytic gradient of crossed sines) + wind ripples (analytic)
  float sa = p.x * .021 + sin(p.y * .017) * 2.1, sb = p.y * .013 + 1.3 + sin(p.x * .009) * 1.4;
  vec2 g = vec2(cos(sa) * .021 * sin(sb) + sin(sa) * cos(sb) * .009 * 1.4 * cos(p.x * .009),
                cos(sa) * cos(p.y * .017) * .017 * 2.1 * sin(sb) + sin(sa) * cos(sb) * .013) * 2.4;
  float warp = snoise(vec3(p * .045, 3.));
  vec2 wdir = normalize(vec2(.85, -.53) + vec2(warp * .35, 0.));
  float ph = dot(p, wdir) * 1.7 + warp * 7.;
  float patchy = sin(p.x * .05 + warp * 2.) * sin(p.y * .061 - warp);
  float amp = .16 * (1. - smoothstep(12., 80., dist)) * smoothstep(-.4, .6, patchy);
  g += wdir * cos(ph) * 2.1 * amp * (sin(ph) > 0. ? .6 : 1.4);
  vec3 N = normalize(vec3(-g.x, 1., -g.y));
  vec3 L = normalize(vec3(uSun.x, .1, uSun.z));
  float dif = max(dot(N, L), 0.);
  vec3 alb = vec3(.36, .27, .19);
  vec3 amb = vec3(.018, .022, .046) * (.5 + .5 * N.y);
  vec3 warm = vec3(.06, .024, .010) * (.3 + uLine * .7);
  vec3 col = alb * (amb + warm * dif * 1.1) * uDawn;
  // grazing sheen toward the glow
  vec3 R = reflect(dir, N);
  col += vec3(.10, .035, .012) * pow(max(dot(R, L), 0.), 10.) * .12 * smoothstep(5., 60., dist) * uDawn * uLine;
  // warm pool of light under the falling grains
  vec2 pd = (p - uPool.xy) / uPool.z;
  float pool = exp(-dot(pd, pd) * 1.6) * uPool.w;
  col += alb * vec3(.20, .085, .035) * pool * (.6 + .8 * dif + .3 * warp);
  float fog = 1. - exp(-dist * .0021);
  col = mix(col, hazeCol(dir), fog);
  gl_FragColor = vec4(col, 1.);
}`,
  });
  const geo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -5; m.frustumCulled = false;
  return m;
}

// River ribbon along a Catmull-Rom path of (z, x) control points.
export function makeRiver(THREE, uniforms, ctrl, widthAt) {
  const pts = ctrl.map(([z, x]) => new THREE.Vector3(x, 0.03, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 1400;
  const pos = new Float32Array(N * 2 * 3), across = new Float32Array(N * 2), along = new Float32Array(N * 2);
  const idx = [];
  let acc = 0, prev = null;
  for (let i = 0; i < N; i++) {
    const u = Math.pow(i / (N - 1), 2.2);
    const c = curve.getPoint(u), tg = curve.getTangent(u);
    if (prev) acc += c.distanceTo(prev); prev = c;
    const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
    const w = widthAt(c) / 2;
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1, k = (i * 2 + s);
      pos[k * 3] = c.x + sg * nx / l * w; pos[k * 3 + 1] = 0.03; pos[k * 3 + 2] = c.z + sg * nz / l * w;
      across[k] = sg; along[k] = acc;
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute float aAcross, aAlong; varying float vX, vL; varying vec3 vW;
      void main(){ vX = aAcross; vL = aAlong; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
precision highp float;
${SKY_GLSL}
${GLSL.snoise}
uniform vec3 uCam; uniform float uT;
varying float vX, vL; varying vec3 vW;
void main(){
  vec3 V = vW - uCam; float dist = length(V); vec3 dir = V / dist;
  vec2 p = vW.xz;
  float near = 1. - smoothstep(20., 160., dist);
  float n1 = snoise(vec3(p * vec2(.45, .2), uT * .35));
  float n2 = snoise(vec3(p * vec2(1.6, .7) + 7., uT * .8));
  vec3 N = normalize(vec3((n1 * .025 + n2 * .012) * near + .002 * n1, 1., (n2 * .02 + n1 * .01) * near));
  vec3 R = reflect(dir, N); R.y = abs(R.y) + .0005;
  vec3 refl = skyCol(R, 1.);
  float cosv = max(-dir.y, 0.);
  float fres = .03 + .97 * pow(1. - cosv, 5.);
  vec3 col = refl * (.35 + .65 * fres) * 1.15;
  // glints: wind-stirred sparkle that catches the glow
  float sp = snoise(vec3(p * vec2(2.4, .9), uT * 1.7));
  col += vec3(.55, .22, .07) * pow(max(sp, 0.), 18.) * .9 * near * uDawn * (.3 + uLine);
  // darker wet banks
  float a = smoothstep(1., .55, abs(vX));
  float fog = 1. - exp(-dist * .0011);
  col = mix(col, hazeCol(dir) * 1.2 + col * .6, fog * .7);
  gl_FragColor = vec4(col, a);
}`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -4; m.frustumCulled = false;
  return m;
}

// Soft round sprite fragment shader (alpha-weighted additive).
export const SPRITE_FRAG = /* glsl */`
precision highp float;
varying vec3 vC; varying float vA;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float r2 = dot(c, c);
  if (r2 > 1.) discard;
  float a = exp(-r2 * 3.) - .0498;
  gl_FragColor = vec4(vC, a * vA * 1.052);
}`;
// Sprite that both emits (rgb) and occludes (alpha): premultiplied blending (One, OneMinusSrcAlpha).
export const OCC_FRAG = /* glsl */`
precision highp float;
varying vec3 vC; varying float vA; varying float vO;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float r2 = dot(c, c);
  if (r2 > 1.) discard;
  float a = (exp(-r2 * 3.) - .0498) * 1.052 * vA;
  gl_FragColor = vec4(vC * a, clamp(a * vO, 0., 1.));
}`;
// Elongated streak sprite (horizontal on screen), thickness ratio vK.
export const STREAK_FRAG = /* glsl */`
precision highp float;
varying vec3 vC; varying float vA; varying float vK;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float r2 = c.x * c.x + c.y * c.y * vK * vK;
  if (r2 > 1.) discard;
  gl_FragColor = vec4(vC, (1. - r2) * (1. - r2) * vA);
}`;

// Cubic Hermite through keys [[t, number|array], ...] (Catmull-Rom tangents, zero at the ends).
export function spline(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
  const h = t1 - t0, u = (t - t0) / h;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const tan = (k, j) => {
    if (k === 0 || k === n - 1) return 0;
    const a = keys[k - 1], b = keys[k + 1];
    const va = Array.isArray(a[1]) ? a[1][j] : a[1], vb = Array.isArray(b[1]) ? b[1][j] : b[1];
    return (vb - va) / (b[0] - a[0]);
  };
  const f = (a, b, j) => h00 * a + h10 * h * tan(i, j) + h01 * b + h11 * h * tan(i + 1, j);
  return Array.isArray(p0) ? p0.map((a, j) => f(a, p1[j], j)) : f(p0, p1, 0);
}
