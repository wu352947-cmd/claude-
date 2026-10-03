// Ⅰ 泥 MUD — Uruk, 4000 → 3000 BCE.  Segment 38–69 (local t = global − 38).
// M1 0–8   dusk aerial: torch-people converge along canals on a fresh mud-brick platform
// M2 8–20  time-lapse: day/night ~1.5 s, ziggurat rises tier by tier, city crystallises
// M3 20–31 night holds: shrine fire vs star trails; erosion into a dune; people scatter; sand wall
import { COMMON, STARS } from './mud_glsl.js';
import { GLSL } from '../engine/util.js';
import { buildHeightGrids, buildHeightMesh, heightTextureData, buildNetwork, resample, drawGround, buildHouses, cityHeightData, CITY_EXT, HF, TEMPLE, TIERS, TERRACE, TOP_Y } from './mud_world.js';

const GROUND = /* glsl */`
uniform sampler2D uGround;
uniform float uGExt, uSandCover, uWind;
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
vec4 groundMask(vec2 xz){
  vec2 uv = (xz + uGExt) / (2. * uGExt);
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  return texture2D(uGround, uv);
}
float sandAt(vec2 xz){
  // dunes creep over the fields during erosion
  float n = vnoise(xz * 0.004) * 0.6 + vnoise(xz * 0.017) * 0.4;
  return smoothstep(0., 0.35, uSandCover - n * 0.65);
}
vec3 groundAlb(vec2 xz, vec4 m, float sand){
  float n1 = vnoise(xz * 0.0035), n2 = vnoise(xz * 0.045), n3 = vnoise(xz * 0.4);
  vec3 a = mix(vec3(0.42, 0.33, 0.23), vec3(0.30, 0.24, 0.17), n1) * (0.88 + 0.2 * n2) * (0.94 + 0.1 * n3);
  float r = length(xz);
  a *= mix(0.86, 1., smoothstep(180., 820., r));             // trodden urban ground
  float tone = m.g;
  if (tone > 0.05 && tone < 0.22) {
    // date-palm groves: dark clumps
    float cl = vnoise(xz * 0.35);
    a = mix(a, vec3(0.035, 0.05, 0.025) * (0.7 + 0.6 * cl), 0.9);
  } else if (tone > 0.02) {
    tone = (tone - 0.235) / 0.765;
    vec3 f = mix(vec3(0.085, 0.11, 0.05), vec3(0.20, 0.19, 0.09), smoothstep(0.25, 0.6, tone));
    f = mix(f, vec3(0.30, 0.23, 0.14), smoothstep(0.62, 0.8, tone));
    f = mix(f, vec3(0.40, 0.32, 0.17), smoothstep(0.9, 0.98, tone));
    f *= 0.8 + 0.35 * n3;
    a = mix(a, f, smoothstep(0.02, 0.2, tone) * 0.85);
  }
  a = mix(a, vec3(0.52, 0.43, 0.31), clamp(m.b * 1.4, 0., 0.7));   // paths
  // wet dark banks along water
  a *= 1. - 0.35 * smoothstep(0.0, 0.5, m.r);
  vec3 s = vec3(0.76, 0.57, 0.37) * (0.92 + 0.12 * n2);
  return mix(a, s, sand);
}
vec3 waterShade(vec3 P, float sand){
  vec3 V = normalize(uCam - P);
  vec3 Rr = reflect(-V, vec3(0., 1., 0.));
  vec3 sunH = normalize(vec3(uSunDir.x, 0.12, uSunDir.z));
  Rr = normalize(mix(normalize(vec3(Rr.x, Rr.y * 0.45, Rr.z)), sunH, 0.6 * (1. - uNight)));
  float fr = 0.04 + 0.96 * pow(1. - max(V.y, 0.), 5.);
  vec3 c = vec3(0.012, 0.018, 0.02) + skyBase(Rr) * (0.35 + 0.65 * fr);
  float sp = pow(max(dot(Rr, uSunDir), 0.), 600.) * 10. + pow(max(dot(Rr, uSunDir), 0.), 60.) * 0.25;
  c += uSunCol * sp;
  c += uMoonCol * pow(max(dot(Rr, uMoonDir), 0.), 300.) * 20. * uNight;
  return c;
}
`;

const SKY_VS = /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
${COMMON}
${STARS}
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = d.y > 0. ? skyBase(d) : fogColor(d);
  float sd = dot(d, uSunDir);
  c += uSunCol * 5. * smoothstep(0.99975, 0.99988, sd);
  float md = dot(d, uMoonDir);
  c += vec3(0.85, 0.92, 1.05) * 1.6 * uNight * smoothstep(0.99986, 0.99991, md);
  if (uStarI > 0.002 && d.y > -0.02) c += starField(d) * smoothstep(-0.01, 0.18, d.y);
  gl_FragColor = vec4(c, 1.);
}`;

const GROUND_VS = /* glsl */`varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FS = /* glsl */`
${COMMON}
${GROUND}
varying vec3 vP;
void main(){
  vec3 P = vP;
  vec2 uv = (P.xz - uHFRect.xy) / uHFRect.zw;
  if (uv.x > 0.002 && uv.y > 0.002 && uv.x < 0.998 && uv.y < 0.998) discard;
  vec4 m = groundMask(P.xz);
  float sand = uSandCover > 0. ? sandAt(P.xz) : 0.;
  vec3 alb = groundAlb(P.xz, m, sand);
  // wind streaks on the sand
  float st = vnoise(vec2(P.x * 0.02 - uTime * 3.0, P.z * 0.25));
  alb *= 1. + (st - 0.5) * 0.25 * sand * uWind;
  vec3 L = uSunDir.y > 0. ? uSunDir : uMoonDir;
  float sh = min(hfShadow(P + vec3(0., 0.05, 0.), L), cityShadow(P + vec3(0., 0.05, 0.), L));
  vec3 c = shade(P, vec3(0., 1., 0.), alb, 1., uSunDir.y > 0. ? sh : 1., uSunDir.y > 0. ? 1. : sh, 0.9);
  c *= mix(vec3(1.), vec3(1.4, 1.05, 0.72), sand * uNight * 0.85);
  float w = m.r * (1. - sand);
  if (w > 0.01) c = mix(c, waterShade(P, sand) * mix(1., 0.4, 1. - sh), smoothstep(0.05, 0.6, w));
  gl_FragColor = vec4(applyFog(c, P), 1.);
}`;

const HF_VS = /* glsl */`
${COMMON}
attribute vec4 aH;   // built, softened, dune, erosion threshold
attribute vec4 aG;   // gradients of softened (xy) and dune (zw)
varying vec3 vP; varying vec3 vNs; varying vec3 vE; varying float vHz; varying float vR; varying float vSh;
void main(){
  vec2 xz = position.xz;
  float R = revealAt(xz);
  float hz = min(aH.x, R);
  vec2 e = erodeW(aH.w);
  float h = mix(mix(hz, aH.y, e.x), aH.z, e.y);
  vec2 gr = mix(aG.xy * e.x, aG.zw, e.y);
  vNs = normalize(vec3(-gr.x, 1., -gr.y));
  vE = vec3(e, aH.w);
  vHz = aH.x; vR = R;
  vP = vec3(xz.x, h, xz.y);
  // shadows are evaluated per vertex (1 m grid on the structure) and interpolated
  vec3 L = uSunDir.y > 0. ? uSunDir : uMoonDir;
  vSh = hfShadow(vP + vNs * 0.9 + vec3(0., 0.3, 0.), L);
  gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.);
}`;
const HF_FS = /* glsl */`
${COMMON}
${GROUND}
varying vec3 vP; varying vec3 vNs; varying vec3 vE; varying float vHz; varying float vR; varying float vSh;
float aaLine(float x, float w, float fw){ // 1 inside a periodic line of width w (period 1), filtered
  float f = fract(x);
  float d = min(f, 1. - f);
  return 1. - smoothstep(w * 0.5 - fw, w * 0.5 + fw, d);
}
void main(){
  vec3 P = vP;
  vec3 Nf = normalize(cross(dFdx(P), dFdy(P)));
  if (Nf.y < 0.) Nf = -Nf;
  float soft = clamp(vE.x * 1.6, 0., 1.);
  vec3 N = normalize(mix(Nf, vNs, soft));
  float y = P.y;
  float isWall = 1. - smoothstep(0.55, 0.8, N.y);
  bool zFacing = abs(N.z) > abs(N.x);
  float u = zFacing ? P.x : P.z;
  vec3 T = zFacing ? vec3(1., 0., 0.) : vec3(0., 0., 1.);
  float built = step(0.4, vHz);                // on the structure (not the plain)
  // --- brickwork
  vec2 bc = isWall > 0.5 ? vec2(u, y) : P.xz;
  float cH = 0.34, bL = 0.70;
  float row = floor(bc.y / cH);
  float off = mod(row, 2.) * 0.5;
  float col = floor(bc.x / bL + off);
  float fwv = fwidth(bc.y) / cH, fwu = fwidth(bc.x) / bL;
  float jointH = aaLine(bc.y / cH, 0.14, fwv);
  float jointV = aaLine(bc.x / bL + off, 0.08, fwu);
  float far = smoothstep(0.25, 0.7, max(fwv, fwu));
  float joint = mix(max(jointH, jointV), 0.2, far);
  float bh = hash12(vec2(row, col));
  vec3 brick = vec3(0.56, 0.43, 0.30) * (0.86 + 0.24 * mix(bh, 0.5, far));
  // tier tones: lower courses darker (bitumen-stained), upper paler
  brick *= mix(0.86, 1.06, smoothstep(3., 40., y));
  vec3 alb = mix(brick, brick * 0.62, joint);
  // reed-mat layers every 2.4 m
  float fwr = fwidth(y) / 2.4;
  float reed = aaLine((y - 0.6) / 2.4, 0.045, fwr) * isWall;
  alb *= 1. - 0.42 * reed;
  // buttress ribs on tier walls
  float tierWall = isWall * step(3.4, y);
  float rp = u / 4.8;
  float fwp = fwidth(rp);
  float ribFade = 1. - smoothstep(0.08, 0.3, fwp);
  float fr = fract(rp);
  float e1 = exp(-pow((fr - 0.12) / 0.035, 2.)), e2 = exp(-pow((fr - 0.62) / 0.035, 2.));
  float ribOn = smoothstep(0.1, 0.14, fr) - smoothstep(0.6, 0.64, fr);
  N = normalize(N + T * (e2 - e1) * 0.9 * tierWall * ribFade * (1. - soft));
  alb *= mix(1., mix(0.8, 1.04, ribOn), tierWall * (1. - soft) * mix(0.5, 1., ribFade));
  // grime: rain streaks below each tier top, salt bloom at the feet
  if (isWall > 0.01) {
    float streak = vnoise(vec2(u * 0.9, y * 0.06));
    float salt = vnoise(vec2(u * 0.35, y * 1.5)) * (1. - smoothstep(0., 1.6, fract((y - 3.) / 9.) * 9.));
    alb *= mix(1., 0.78 + 0.22 * streak, isWall);
    alb = mix(alb, vec3(0.74, 0.70, 0.62), salt * 0.35 * isWall * built);
  }
  // dust on terraces
  alb = mix(alb, vec3(0.58, 0.48, 0.35), (1. - isWall) * 0.35 * built);
  // the freshly laid platform: slabs of mud drying at different rates
  if (abs(y - 3.) < 0.06 && N.y > 0.9 && uTime < 12.) {
    vec2 cell = floor(P.xz / vec2(11., 8.5));
    float hs = hash12(cell);
    vec2 fc = fract(P.xz / vec2(11., 8.5));
    float fwc = fwidth(P.x) / 11.;
    float seam = 1. - smoothstep(0.0, 0.02 + fwc, min(min(fc.x, 1. - fc.x), min(fc.y, 1. - fc.y)));
    float wetS = smoothstep(0.35, 0.9, hs) * (1. - smoothstep(4., 16., uTime));
    alb = mix(alb, vec3(0.27, 0.19, 0.13), wetS * 0.8);
    alb *= 0.93 + 0.12 * hs;
    alb *= 1. - 0.25 * seam * (1. - smoothstep(0.3, 0.7, fwc * 4.)) * (1. - smoothstep(6., 12., uTime));
  }
  // --- stairs: treads / risers
  float sC = step(abs(P.x), 4.5) * step(-64., P.z) * step(P.z, -42.);
  float sS = step(abs(P.x), 34.) * step(4.5, abs(P.x)) * step(-52., P.z) * step(P.z, -42.) * step(y, 15.2);
  if ((sC + sS) > 0.5 && y > 3.05 && N.y > 0.2) {
    float s = sC > 0.5 ? P.z : -abs(P.x);
    vec3 rN = sC > 0.5 ? vec3(0., 0., -1.) : vec3(sign(P.x), 0., 0.);
    float stepL = 0.42;
    float fs = fract(s / stepL);
    float fws = fwidth(s / stepL);
    float riser = smoothstep(0.55 - fws, 0.55 + fws, fs);
    float sf = 1. - smoothstep(0.2, 0.6, fws);
    N = normalize(mix(N, mix(vec3(0., 1., 0.), rN, riser), sf * (1. - soft)));
    alb = vec3(0.60, 0.48, 0.34) * (0.9 + 0.1 * hash12(vec2(floor(s / stepL), floor(P.x))));
    alb *= mix(1., mix(1.0, 0.75, riser), sf);
  }
  // plain at the edge of the region: same as the ground
  float plain = 1. - smoothstep(0.05, 0.4, vHz);
  vec4 m = vec4(0.);
  float sand = 0.;
  if (plain > 0.001) {
    m = groundMask(P.xz);
    sand = uSandCover > 0. ? sandAt(P.xz) : 0.;
    alb = mix(alb, groundAlb(P.xz, m, sand), plain);
  }
  // --- erosion: everything becomes sand with wind ripples
  float er = clamp(vE.x * 0.7 + vE.y * 0.6, 0., 1.);
  float rip = sin((P.x * 0.9 + P.z * 0.35) * 3.2 + vnoise(P.xz * 0.15) * 4.);
  N = normalize(N + vec3(0.9, 0., 0.35) * rip * 0.06 * vE.y);
  alb = mix(alb, vec3(0.80, 0.60, 0.38) * (0.95 + 0.08 * rip), er);
  // --- construction: fresh wet mud and a glowing edge band
  vec3 emit = vec3(0.);
  float building = step(vR + 0.03, vHz) * uBuild * (1. - vE.x);
  if (building > 0.) {
    float top = smoothstep(vR - 0.5, vR - 0.05, y);
    float edge = exp(-max(vHz - vR, 0.) / 0.6);
    float sweep = 0.5 + 0.5 * sin(atan(P.z, P.x) * 2. - uWavePh);
    float rows = 0.85 + 0.15 * sin(dot(P.xz, vec2(1.)) * 3.);
    alb = mix(alb, vec3(0.22, 0.15, 0.10) * rows, 0.85 * top);
    emit = vec3(1.0, 0.40, 0.12) * (1.1 * edge * (0.3 + 0.7 * sweep) + 0.03) * top * building * (0.35 + 0.65 * uNight);
  }
  // a band of glowing fresh courses on the walls just below the working level
  float wallBand = isWall * exp(-max(vR - y, 0.) / 0.9) * step(y, vR + 0.05) * uBuild * step(vHz, vR + 0.03) * built * step(3.5, y);
  emit += vec3(1.0, 0.42, 0.13) * 0.45 * (0.35 + 0.65 * uNight) * wallBand * (0.5 + 0.5 * sin(atan(P.z, P.x) * 2. - uWavePh));
  // freshly built courses are darker until they dry
  float wet = exp(-max(uLevel - y, 0.) / 5.) * uBuild * built * (1. - building);
  alb *= 1. - 0.25 * wet;
  // ambient occlusion at the foot of every wall
  float ao = 1.;
  // shadows
  vec3 L = uSunDir.y > 0. ? uSunDir : uMoonDir;
  // self-shadowing of faces turned away from the light is handled by N·L; the march adds cast shadows
  float sh = clamp(vSh, 0., 1.);
  vec3 c = shade(P, N, alb, ao, uSunDir.y > 0. ? sh : 1., uSunDir.y > 0. ? 1. : sh, 0.85);
  c += emit;
  c *= mix(vec3(1.), vec3(1.4, 1.05, 0.72), er * uNight * 0.85);
  float w = m.r * (1. - sand) * plain;
  if (w > 0.01) c = mix(c, waterShade(P, sand), smoothstep(0.05, 0.6, w));
  gl_FragColor = vec4(applyFog(c, P), 1.);
}`;

const HOUSE_VS = /* glsl */`
${COMMON}
attribute vec4 aA;   // x, z, rot, birth
attribute vec4 aB;   // sx, sy, sz, death
attribute float aL;  // lamp
varying vec3 vP; varying vec3 vN; varying vec3 vL; varying vec4 vI;
void main(){
  float g = smoothstep(aA.w, aA.w + 0.45, uTime);
  float sink = smoothstep(aB.w, aB.w + 1.8, uTime);
  float hgt = aB.y * g * (1. - sink * 0.92);
  vec3 p = position;
  vL = p + 0.5;
  p.x *= aB.x * (0.75 + 0.25 * g); p.z *= aB.z * (0.75 + 0.25 * g); p.y = (p.y + 0.5) * hgt;
  float c = cos(aA.z), s = sin(aA.z);
  vec3 w = vec3(c * p.x - s * p.z + aA.x, p.y, s * p.x + c * p.z + aA.y);
  vN = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
  vP = w;
  float flash = exp(-max(uTime - aA.w - 0.15, 0.) * 5.) * g;
  vI = vec4(flash, sink, aL * (1. - smoothstep(aB.w - 0.6, aB.w + 0.2, uTime)) * g, hash12(aA.xy));
  gl_Position = g < 0.001 ? vec4(0., 0., -2., 1.) : projectionMatrix * viewMatrix * vec4(w, 1.);
}`;
const HOUSE_FS = /* glsl */`
${COMMON}
${GROUND}
varying vec3 vP; varying vec3 vN; varying vec3 vL; varying vec4 vI;
void main(){
  vec3 N = normalize(vN);
  float seed = vI.w;
  vec3 alb = mix(vec3(0.50, 0.40, 0.29), vec3(0.40, 0.31, 0.22), seed) * (0.9 + 0.14 * vnoise(vP.xz * 0.7 + vP.y));
  vec3 emit = vec3(0.);
  if (N.y > 0.5) {
    alb *= 1.12;
    // courtyard: dark well in the middle of the flat roof, warm at night
    vec2 q = abs(vL.xz - 0.5);
    float cy = step(max(q.x, q.y), 0.17) * step(0.35, seed);
    alb = mix(alb, vec3(0.08, 0.06, 0.05), cy);
    emit += vec3(1.0, 0.5, 0.2) * 2.2 * cy * vI.z * uNight;
  } else {
    alb *= mix(0.62, 1., smoothstep(0., 0.5, vL.y));      // foot of the wall
    // door
    vec2 dq = vec2(abs(vL.x - 0.5 + (seed - 0.5) * 0.4), vL.y);
    float door = step(dq.x, 0.07) * step(dq.y, 0.42) * step(0.5, abs(N.z));
    alb = mix(alb, vec3(0.05), door);
    emit += vec3(1.0, 0.45, 0.15) * 1.2 * door * vI.z * uNight;
  }
  // buried by sand as the city is abandoned
  alb = mix(alb, vec3(0.60, 0.48, 0.34), smoothstep(0.2, 0.9, vI.y));
  vec3 L = uSunDir.y > 0. ? uSunDir : uMoonDir;
  float sh = min(hfShadow(vP + N * 0.2, L), cityShadow(vP + N * 0.7 + vec3(0., 0.1, 0.), L));
  vec3 c = shade(vP, N, alb, 1., uSunDir.y > 0. ? sh : 1., uSunDir.y > 0. ? 1. : sh, 0.9);
  c *= mix(vec3(1.), vec3(1.4, 1.05, 0.72), smoothstep(0.2, 0.9, vI.y) * uNight * 0.85);
  c += emit + vec3(1.0, 0.55, 0.25) * vI.x * 1.6;     // crystal flash at birth
  gl_FragColor = vec4(applyFog(c, vP), 1.);
}`;

const TEMPLE_VS = /* glsl */`
${COMMON}
uniform float uTempLevel, uTempErode;
varying vec3 vP; varying vec3 vN; varying vec3 vO;
void main(){
  vec3 p = position;
  vO = p;
  p.y -= uTempErode * uTempErode * 9. * (0.6 + 0.4 * sin(p.x * 0.4 + p.z));
  vN = normal;
  vP = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;
const TEMPLE_FS = /* glsl */`
${COMMON}
${GROUND}
uniform float uTempLevel, uTempErode;
varying vec3 vP; varying vec3 vN; varying vec3 vO;
void main(){
  if (vO.y > uTempLevel) discard;
  float n = vnoise(vO.xz * 0.9 + vO.y * 0.7);
  if (uTempErode > 0. && n < uTempErode * 1.25 - 0.15) discard;
  vec3 N = normalize(vN);
  vec3 alb = vec3(0.84, 0.80, 0.72);
  float isWall = 1. - step(0.5, N.y);
  float u = abs(N.z) > abs(N.x) ? vO.x : vO.z;
  // stepped niches (Uruk "white temple" buttresses)
  float fr = fract(u / 1.6);
  float niche = smoothstep(0.42, 0.46, fr) - smoothstep(0.86, 0.9, fr);
  float yIn = smoothstep(${TEMPLE.y0.toFixed(1)} + 0.6, ${TEMPLE.y0.toFixed(1)} + 1.0, vO.y);
  alb *= 1. - 0.28 * niche * isWall * yIn;
  vec3 T = abs(N.z) > abs(N.x) ? vec3(1., 0., 0.) : vec3(0., 0., 1.);
  float e1 = exp(-pow((fr - 0.44) / 0.03, 2.)), e2 = exp(-pow((fr - 0.88) / 0.03, 2.));
  N = normalize(N + T * (e1 - e2) * 0.8 * isWall * yIn);
  alb *= 0.9 + 0.1 * vnoise(vO.xy * 3.) ;
  alb = mix(alb, vec3(0.60, 0.48, 0.34), smoothstep(0.0, 0.6, uTempErode));
  // doorway glowing from the fire within (south face)
  vec3 emit = vec3(0.);
  float door = step(abs(vO.x), 1.3) * step(vO.y, ${(TEMPLE.y0 + 4.2).toFixed(1)}) * step(N.z, -0.5);
  alb = mix(alb, vec3(0.03), door);
  emit += vec3(1.0, 0.42, 0.12) * 2.2 * uFireI * door * (0.8 + 0.2 * sin(uTime * 13.));
  vec3 L = uSunDir.y > 0. ? uSunDir : uMoonDir;
  vec3 c = shade(vP, N, alb, 1., 1., 1., 0.6) + emit;
  gl_FragColor = vec4(applyFog(c, vP), 1.);
}`;

const TORCH_VS = /* glsl */`
${COMMON}
uniform sampler2D uPaths;
uniform float uTau, uDensity, uDispT0, uTauD0, uTauRate, uPx, uTorchI, uLag;
attribute vec4 aA;   // row, phase, speed, lateral
attribute vec4 aB;   // threshold, seed, departure delay, kind (0 walker, 1 resident, 2 worker)
uniform vec3 uRing; uniform float uWorkers, uProc;
attribute vec3 aC;   // path length | resident x, z, birth
varying float vI; varying float vS;
vec2 pathAt(float row, float s){
  float x = clamp(s, 0., 1.) * 255.;
  float i = floor(x), f = x - i;
  vec2 a = texelFetch(uPaths, ivec2(int(i), int(row)), 0).xy;
  vec2 b = texelFetch(uPaths, ivec2(int(min(i + 1., 255.)), int(row)), 0).xy;
  return mix(a, b, f);
}
vec2 walker(float tau, out float fade){
  float s = fract(aA.y + tau * aA.z / aC.x);
  fade = smoothstep(0., 0.05, s) * (1. - smoothstep(0.93, 1., s));
  vec2 p = pathAt(aA.x, s);
  vec2 q = pathAt(aA.x, s + 0.004);
  vec2 dir = normalize(q - p + 1e-5);
  return p + vec2(-dir.y, dir.x) * aA.w;
}
void main(){
  float fade = 1.;
  vec2 xz;
  float tdep = uDispT0 + aB.z;
  float T = uTime - uLag;
  if (uLag > 0. && (T < tdep + 0.05 || aB.w > 1.5)) { gl_Position = vec4(0., 0., -2., 1.); gl_PointSize = 0.; return; }
  float vis = 1.;
  float worker = step(1.5, aB.w);
  if (worker > 0.5) {
    // M1: scattered over the fresh platform; M2: a ring on the working edge of the rising tier
    vec2 home = (aA.yz - 0.5) * 2. * vec2(${(TERRACE.ax - 14).toFixed(1)}, ${(TERRACE.az - 14).toFixed(1)});
    home += vec2(sin(uTime * 0.3 + aB.y * 20.), cos(uTime * 0.27 + aB.y * 17.)) * 4.;
    float ax = uRing.x, az = uRing.y;
    float s = fract(aA.y + uTime * 0.004) * 4. * (ax + az);
    vec2 ring;
    if (s < 2. * ax) ring = vec2(-ax + s, -az);
    else if (s < 2. * ax + 2. * az) ring = vec2(ax, -az + (s - 2. * ax));
    else if (s < 4. * ax + 2. * az) ring = vec2(ax - (s - 2. * ax - 2. * az), az);
    else ring = vec2(-ax, az - (s - 4. * ax - 2. * az));
    float onRing = smoothstep(8.4, 9.2, uTime);
    xz = mix(home, ring * (1. - 0.04 * aA.z), onRing);
    vis = step(aB.x, uWorkers);
    float y = mix(hfHeight(xz), uRing.z, onRing) + 1.7;
    vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.);
    float sz = uPx * clamp(700. / -mv.z, 0.8, 3.0);
    vI = vis * uTorchI * 0.9 * (0.75 + 0.25 * sin(uTime * 11. + aB.y * 50.)) * min(1., sz / 1.6);
    gl_PointSize = max(sz, 1.6 * uPx / 2.6);
    vS = aB.y;
    gl_Position = vis < 0.5 ? vec4(0., 0., -2., 1.) : projectionMatrix * mv;
    return;
  }
  if (aB.w < 0.5 || aB.w > 2.5) {
    vis = aB.w > 2.5 ? step(aB.x, uProc) : step(aB.x, uDensity);
    if (T < tdep) xz = walker(uTau, fade);
    else { float f2; xz = walker(uTauD0 + (tdep - uDispT0) * uTauRate, f2); fade = f2 > 0.05 ? 1. : 0.; }
  } else {
    xz = aC.xy;
    vis = step(tdep, T);                              // residents appear as they leave
  }
  if (T > tdep) {
    float dt = T - tdep;
    float a0 = atan(xz.y, xz.x) + (aB.y - 0.5) * 0.6;
    vec2 dir = vec2(cos(a0), sin(a0));
    float v = 18. + 45. * fract(aB.y * 7.31), acc = 40. + 120. * fract(aB.y * 3.17);
    float dist = v * dt + 0.5 * acc * dt * dt;
    xz += dir * dist + vec2(-dir.y, dir.x) * sin(dt * 1.1 + aB.y * 30.) * 6. * dt;
    fade *= smoothstep(0., 0.3, dt) * 0.6 + 0.4;
    fade *= 1. - smoothstep(6., 9., dt);
  }
  float y = hfHeight(xz) + 1.7;
  vec3 P = vec3(xz.x, y, xz.y);
  vec4 mv = viewMatrix * vec4(P, 1.);
  float dist = -mv.z;
  float flick = 0.75 + 0.25 * sin(uTime * (9. + 7. * aB.y) + aB.y * 40.);
  float sz = uPx * clamp(700. / dist, 0.8, 4.0);
  vI = vis * fade * flick * uTorchI * (aB.w > 0.5 ? 0.8 : 1.) * min(1., sz / 1.6) * min(1., pow(uPx * 1.1 / sz, 1.5)) * (1. - uLag * 2.6);
  gl_PointSize = max(sz, 1.6 * uPx / 2.6);
  vS = aB.y;
  gl_Position = vis * fade < 0.001 ? vec4(0., 0., -2., 1.) : projectionMatrix * mv;
}`;
const TORCH_FS = /* glsl */`
varying float vI; varying float vS;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float d2 = dot(q, q) * 4.;
  float a = exp(-d2 * 3.5);
  vec3 col = mix(vec3(1.0, 0.36, 0.09), vec3(1.0, 0.55, 0.2), vS);
  gl_FragColor = vec4(col * vI * a * 2.3, 1.);
}`;

const FLAME_VS = /* glsl */`
uniform vec3 uC; uniform vec2 uSize;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(0., 1., 0.);
  vec3 p = uC + camR * (uv.x - 0.5) * uSize.x + up * uv.y * uSize.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;
const FLAME_FS = /* glsl */`
uniform float uTime, uI;
varying vec2 vUv;
${''}
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = vUv; p.x -= 0.5;
  float n = vn(vec2(p.x * 5., p.y * 3. - uTime * 4.)) * 0.6 + vn(vec2(p.x * 11., p.y * 7. - uTime * 7.)) * 0.4;
  float w = 0.32 * pow(1. - p.y, 0.7) * (0.7 + 0.6 * n) + 0.02;
  float x = abs(p.x + (n - 0.5) * 0.18 * p.y);
  float body = smoothstep(w, w * 0.25, x) * smoothstep(0., 0.08, p.y) * (1. - smoothstep(0.55, 1., p.y + (n - 0.5) * 0.3));
  float core = smoothstep(w * 0.55, 0., x) * (1. - smoothstep(0.1, 0.5, p.y));
  vec3 c = vec3(1.0, 0.34, 0.07) * body * 2.2 + vec3(1.0, 0.72, 0.38) * core * 3.4;
  // halo
  float hd = length(vec2(p.x, (p.y - 0.3) * 0.9));
  c += vec3(1.0, 0.45, 0.15) * max(exp(-hd * hd * 22.) - 0.02, 0.) * 0.5;
  gl_FragColor = vec4(c * uI, 1.);
}`;

const POINTS_SIMPLE_FS = /* glsl */`
varying float vI; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q, q) * 14.); gl_FragColor = vec4(vC * vI * a, 1.); }`;
const EMBER_VS = /* glsl */`
uniform float uTime, uI, uPx; uniform vec3 uC;
attribute vec4 aS;
varying float vI; varying vec3 vC;
void main(){
  float ph = fract(aS.x + uTime * (0.25 + 0.2 * aS.y));
  float a = aS.z * 6.283 + uTime * (0.5 + aS.w);
  vec3 p = uC + vec3(cos(a) * (1. + ph * 4. * aS.y), ph * 26., sin(a) * (1. + ph * 4. * aS.y));
  p.x += ph * ph * 8.;
  vec4 mv = viewMatrix * vec4(p, 1.);
  vI = uI * (1. - ph) * smoothstep(0., 0.06, ph) * 2.5;
  vC = mix(vec3(1., 0.55, 0.2), vec3(1., 0.3, 0.08), ph);
  gl_PointSize = uPx * clamp(200. / -mv.z, 1., 3.);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_VS = /* glsl */`
${COMMON}
uniform float uPx, uDustI;
attribute vec4 aS;
varying float vI; varying vec3 vC;
void main(){
  float speed = 35. + 50. * aS.w;
  float x = mod(aS.x + uTime * speed + 450., 900.) - 450.;
  float y = aS.y * (2. + 30. * aS.w * aS.w) + sin(uTime * 2. + aS.z) * 1.5;
  float z = aS.z + sin(uTime * 0.7 + aS.x * 0.01) * 6.;
  vec3 p = vec3(x, y + hfHeight(vec2(x, z)), z);
  vec4 mv = viewMatrix * vec4(p, 1.);
  float edge = smoothstep(450., 380., abs(x));
  vI = uDustI * edge * (0.4 + 0.6 * aS.w);
  vC = (uMoonCol * 2.2 + uAmb * 1.5) * vec3(1.05, 0.95, 0.8);
  gl_PointSize = uPx * clamp(260. / -mv.z, 0.7, 3.5);
  gl_Position = projectionMatrix * mv;
}`;

// screen-space sand veil (opening veil at the start, sand wall at the end)
const VEIL_FS = /* glsl */`
${GLSL.snoise}
uniform float uTime, uFront, uBack, uOp, uAspect;
uniform vec3 uCol, uCol2;
varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float n = snoise(vec3(p.x * 1.6 - uTime * 1.3, p.y * 2.2, uTime * 0.35)) * 0.5
          + snoise(vec3(p.x * 4.0 - uTime * 3.1, p.y * 5.5, uTime * 0.6)) * 0.3
          + snoise(vec3(p.x * 1.5 - uTime * 9., p.y * 40., 1.)) * 0.2;
  float edgeF = uFront + n * 0.10 + (vUv.y - 0.5) * 0.12;
  float coverF = smoothstep(edgeF + 0.04, edgeF - 0.22, vUv.x);
  float edgeB = uBack + n * 0.10 - (vUv.y - 0.5) * 0.12;
  float coverB = smoothstep(edgeB - 0.04, edgeB + 0.22, vUv.x);
  float cover = max(coverF, coverB);
  float dens = cover * (0.82 + 0.18 * n);
  float rim = exp(-pow((vUv.x - edgeF) / 0.06, 2.)) * coverF + exp(-pow((vUv.x - edgeB) / 0.06, 2.)) * coverB;
  float streak = snoise(vec3(p.x * 0.8 - uTime * 14., p.y * 90., 3.)) * 0.5 + 0.5;
  vec2 gp = floor(vec2(p.x * 700. - uTime * 2600., p.y * 420.));
  float gr = step(0.985, fract(sin(dot(gp, vec2(12.9898, 78.233))) * 43758.5453));
  vec3 c = mix(uCol2, uCol, 0.35 + 0.45 * n + 0.35 * streak) * (0.8 + 0.35 * vUv.y) + uCol * rim * 0.8 + uCol * gr * 1.6;
  gl_FragColor = vec4(c, clamp(dens * uOp * (0.8 + 0.2 * streak), 0., 1.));
}`;

export default {
  async init({ THREE, aspect, util, H }) {
    const { track } = util;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, aspect, 1, 40000);
    const pxScale = H / 804;

    // ---------- world data
    const G = buildHeightGrids();
    const net = buildNetwork(11);
    const ground = drawGround(net, 4096);
    const houses = buildHouses(net, 23);

    // ---------- shared uniforms
    const v3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) });
    const hfTex = new THREE.DataTexture(heightTextureData(G, THREE.DataUtils.toHalfFloat), G.nx, G.nz, THREE.RGBAFormat, THREE.HalfFloatType);
    hfTex.minFilter = hfTex.magFilter = THREE.LinearFilter; hfTex.needsUpdate = true;
    const cityTex = new THREE.DataTexture(cityHeightData(houses, 2048), 2048, 2048, THREE.RGBAFormat, THREE.UnsignedByteType);
    cityTex.minFilter = cityTex.magFilter = THREE.NearestFilter; cityTex.needsUpdate = true;
    const gTex = new THREE.CanvasTexture(ground.canvas);
    gTex.colorSpace = THREE.NoColorSpace; gTex.anisotropy = 4; gTex.minFilter = THREE.LinearMipmapLinearFilter;
    const U = {
      uTime: { value: 0 }, uCam: v3(),
      uSunDir: v3(0, 1, 0), uSunCol: v3(), uMoonDir: v3(0.62, 0.42, -0.66), uMoonCol: v3(),
      uZen: v3(), uHor: v3(), uGlow: v3(), uAmb: v3(), uBounce: v3(),
      uFogDen: { value: 0.0007 }, uNight: { value: 0 },
      uHF: { value: hfTex }, uHFRect: { value: new THREE.Vector4(HF.x0 - G.res / 2, HF.z0 - G.res / 2, G.nx * G.res, G.nz * G.res) },
      uLevel: { value: 3 }, uWaveA: { value: 0 }, uWavePh: { value: 0 }, uWaveCS: { value: new THREE.Vector2(1, 0) },
      uCity: { value: cityTex }, uCityExt: { value: CITY_EXT }, uErode: { value: 0 }, uBuild: { value: 0 },
      uFirePos: v3(0, TEMPLE.y0 + TEMPLE.h + 3, TEMPLE.zc), uFireI: { value: 0 },
      uGround: { value: gTex }, uGExt: { value: ground.ext }, uSandCover: { value: 0 }, uWind: { value: 0 },
      uRot: { value: 0 }, uTrail: { value: 0 }, uPix: { value: 0.0007 }, uStarI: { value: 0 },
    };
    const mat = (vs, fs, extra = {}, opts = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: vs, fragmentShader: fs, ...opts });

    // ---------- sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 64, 32), mat(SKY_VS, SKY_FS, {}, { side: THREE.BackSide, depthWrite: false }));
    sky.renderOrder = 10; sky.frustumCulled = false;
    scene.add(sky);

    // ---------- ground plane (hole where the heightfield sits)
    const gGeo = new THREE.PlaneGeometry(36000, 36000, 8, 8); gGeo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(gGeo, mat(GROUND_VS, GROUND_FS));
    groundMesh.position.y = -0.02; groundMesh.renderOrder = 2;
    scene.add(groundMesh);

    // ---------- ziggurat heightfield
    const M = buildHeightMesh(G);
    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute('position', new THREE.BufferAttribute(M.pos, 3));
    hGeo.setAttribute('aH', new THREE.BufferAttribute(M.aH, 4));
    hGeo.setAttribute('aG', new THREE.BufferAttribute(M.aG, 4));
    hGeo.setIndex(new THREE.BufferAttribute(M.idx, 1));
    const hfMesh = new THREE.Mesh(hGeo, mat(HF_VS, HF_FS));
    hfMesh.frustumCulled = false; hfMesh.renderOrder = 1;
    scene.add(hfMesh);

    // ---------- temple
    const tGeo = new THREE.BoxGeometry(TEMPLE.ax * 2, TEMPLE.h, TEMPLE.az * 2, 24, 8, 16);
    tGeo.translate(0, TEMPLE.y0 + TEMPLE.h / 2, TEMPLE.zc);
    const pGeo = new THREE.BoxGeometry(6, 2.2, 5, 8, 2, 6); pGeo.translate(0, TEMPLE.y0 + TEMPLE.h + 1.1, TEMPLE.zc + 1);
    const tU = { uTempLevel: { value: 0 }, uTempErode: { value: 0 } };
    const temple = new THREE.Group();
    temple.add(new THREE.Mesh(tGeo, mat(TEMPLE_VS, TEMPLE_FS, tU)), new THREE.Mesh(pGeo, mat(TEMPLE_VS, TEMPLE_FS, tU)));
    scene.add(temple);

    // ---------- houses
    const box = new THREE.BoxGeometry(1, 1, 1);
    const hb = new THREE.InstancedBufferGeometry();
    hb.index = box.index; hb.setAttribute('position', box.getAttribute('position')); hb.setAttribute('normal', box.getAttribute('normal'));
    const NH = houses.length, aA = new Float32Array(NH * 4), aB = new Float32Array(NH * 4), aL = new Float32Array(NH);
    houses.forEach((h, i) => { aA.set([h.x, h.z, h.rot, h.birth], i * 4); aB.set([h.sx, h.sy, h.sz, h.death], i * 4); aL[i] = h.lamp ? 1 : 0; });
    hb.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4)); hb.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4)); hb.setAttribute('aL', new THREE.InstancedBufferAttribute(aL, 1));
    hb.instanceCount = NH;
    const houseMesh = new THREE.Mesh(hb, mat(HOUSE_VS, HOUSE_FS));
    houseMesh.frustumCulled = false;
    scene.add(houseMesh);

    // ---------- torch-people
    const R = util.rng(31);
    // procession: straight up the central stair to the gate
    net.paths.push([[0, -520], [0, -300], [0, -140], [0, -100], [0, -64], [0, -42], [0, -37]]);
    const rows = net.paths.length;
    const pData = new Float32Array(256 * rows * 4), lens = [];
    net.paths.forEach((poly, r) => {
      const { pts, len } = resample(poly, 256);
      lens.push(len);
      for (let k = 0; k < 256; k++) { pData[(r * 256 + k) * 4] = pts[k * 2]; pData[(r * 256 + k) * 4 + 1] = pts[k * 2 + 1]; }
    });
    const pTex = new THREE.DataTexture(pData, 256, rows, THREE.RGBAFormat, THREE.FloatType);
    pTex.minFilter = pTex.magFilter = THREE.NearestFilter; pTex.needsUpdate = true;
    const totalLen = lens.reduce((a, b) => a + b, 0);
    const NW = 26000, lampHouses = houses.filter(h => h.lamp);
    const NR = lampHouses.length, NK = 1800, NT = NW + NR + NK;
    const tA = new Float32Array(NT * 4), tB = new Float32Array(NT * 4), tC = new Float32Array(NT * 3);
    for (let i = 0; i < NW; i++) {
      let x = R() * totalLen, r = 0;
      while (r < rows - 1 && x > lens[r]) { x -= lens[r]; r++; }
      const proc = i < 1400;
      if (proc) { r = rows - 1; }
      tA.set([r, R(), proc ? 9 + R() * 4 : 13 + R() * 12, (R() - 0.5) * 2 * (proc ? 1 + R() * 2.6 : 2 + R() * 5)], i * 4);
      tB.set([R(), R(), R() * 2.6, proc ? 3 : 0], i * 4);
      tC.set([lens[r], 0, 0], i * 3);
    }
    lampHouses.forEach((h, j) => {
      const i = NW + j;
      tA.set([0, 0, 0, 0], i * 4);
      tB.set([0, R(), 0.3 + R() * 2.4, 1], i * 4);
      tC.set([h.x + (R() - 0.5) * 3, h.z + (R() - 0.5) * 3, h.birth], i * 3);
    });
    for (let j = 0; j < NK; j++) {
      const i = NW + NR + j;
      tA.set([0, R(), R(), R() < 0.5 ? 1 : -1], i * 4);
      tB.set([R() * R(), R(), 0, 2], i * 4);
    }
    const tGeo2 = new THREE.BufferGeometry();
    tGeo2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NT * 3), 3));
    tGeo2.setAttribute('aA', new THREE.BufferAttribute(tA, 4)); tGeo2.setAttribute('aB', new THREE.BufferAttribute(tB, 4)); tGeo2.setAttribute('aC', new THREE.BufferAttribute(tC, 3));
    const torchU = { uPaths: { value: pTex }, uTau: { value: 0 }, uDensity: { value: 0.3 }, uDispT0: { value: 23.8 }, uTauD0: { value: 0 }, uTauRate: { value: 1 }, uPx: { value: 3.0 * pxScale }, uTorchI: { value: 1 }, uRing: { value: new THREE.Vector3(100, 80, 3) }, uWorkers: { value: 1 }, uLag: { value: 0 }, uProc: { value: 0 } };
    const torches = new THREE.Points(tGeo2, mat(TORCH_VS, TORCH_FS, torchU, { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    torches.frustumCulled = false; torches.renderOrder = 20;
    scene.add(torches);
    // motion-streak copies of the scattering people (drawn only after they leave)
    const lagCopies = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((L, i) => {
      const p = new THREE.Points(tGeo2, mat(TORCH_VS, TORCH_FS, { ...torchU, uLag: { value: L } }, { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      p.frustumCulled = false; p.renderOrder = 20; p.visible = false; scene.add(p); return p;
    });

    // ---------- fire + embers
    const fireC = new THREE.Vector3(0, TEMPLE.y0 + TEMPLE.h + 2.2, TEMPLE.zc + 1);
    const flameU = { uC: { value: fireC }, uSize: { value: new THREE.Vector2(7, 12) }, uTime: U.uTime, uI: { value: 0 } };
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), new THREE.ShaderMaterial({ uniforms: flameU, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.frustumCulled = false; flame.renderOrder = 21;
    scene.add(flame);
    const NE = 260, eS = new Float32Array(NE * 4);
    for (let i = 0; i < NE * 4; i++) eS[i] = R();
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NE * 3), 3)); eGeo.setAttribute('aS', new THREE.BufferAttribute(eS, 4));
    const emberU = { uTime: U.uTime, uI: { value: 0 }, uPx: { value: 2.2 * pxScale }, uC: { value: fireC.clone().add(new THREE.Vector3(0, 1.5, 0)) } };
    const embers = new THREE.Points(eGeo, new THREE.ShaderMaterial({ uniforms: emberU, vertexShader: EMBER_VS, fragmentShader: POINTS_SIMPLE_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    embers.frustumCulled = false; embers.renderOrder = 22;
    scene.add(embers);

    // ---------- blowing sand
    const ND = 16000, dS = new Float32Array(ND * 4);
    for (let i = 0; i < ND; i++) dS.set([R() * 900 - 450, R(), R() * 700 - 350, R()], i * 4);
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3)); dGeo.setAttribute('aS', new THREE.BufferAttribute(dS, 4));
    const dustU = { uPx: { value: 2.0 * pxScale }, uDustI: { value: 0 } };
    const dust = new THREE.Points(dGeo, mat(DUST_VS, POINTS_SIMPLE_FS, dustU, { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    dust.frustumCulled = false; dust.renderOrder = 23;
    scene.add(dust);

    // ---------- screen-space sand veil
    const veilScene = new THREE.Scene(), veilCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    const veilU = { uTime: { value: 0 }, uFront: { value: -1 }, uBack: { value: 2 }, uOp: { value: 0 }, uAspect: { value: aspect }, uCol: v3(0.5, 0.42, 0.32), uCol2: v3(0.25, 0.2, 0.15) };
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), new THREE.ShaderMaterial({
      uniforms: veilU, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: VEIL_FS, transparent: true, depthTest: false, depthWrite: false }));
    veilScene.add(veil);

    // ---------- path-time integral (people walk faster during the time-lapse)
    const tauRate = t => 1 + 1.6 * util.smoothstep(8.5, 11, t) * (1 - util.smoothstep(18.5, 20.5, t));
    const tauTab = new Float32Array(32 * 240 + 2);
    for (let i = 1; i < tauTab.length; i++) tauTab[i] = tauTab[i - 1] + tauRate((i - 0.5) / 240) / 240;
    const tau = t => { const x = util.clamp(t, 0, 32) * 240, i = Math.floor(x), f = x - i; return tauTab[i] + (tauTab[Math.min(i + 1, tauTab.length - 1)] - tauTab[i]) * f; };

    return {
      scene, camera, clearColor: 0x000000, THREE, util, track, U, flame, embers, dust, lagCopies, tU, torchU, flameU, emberU, dustU, veilU, veilScene, veilCam, sky, tau, pxScale,
      v: { a: new THREE.Vector3(), b: new THREE.Vector3() },
    };
  },

  update(S, t) {
    const { U, util, camera } = S;
    const { track, smoothstep, clamp, lerp } = util;
    U.uTime.value = t;

    // ---------------- day phase (cycles; 0 sunrise, .25 noon, .5 sunset, .75 midnight)
    const ramp = (x, a, d) => { const u = clamp((x - a) / d); return d * (u * u * u - u * u * u * u / 2) + Math.max(0, x - a - d); };
    const t0 = 8.3, t1 = 20.4, du = 1.2, dd = 1.8;
    const vmax = (7.242 + 0.4820 - 0.4935) / ((t1 - t0) - (du + dd) / 2);
    const integ = x => ramp(x, t0, du) - ramp(x, t1 - dd, dd);   // ∫ speed profile (unit height)
    const phi = 0.4935 + vmax * integ(clamp(t, 0, 40)) + (t < t0 ? (t - 4) * 0.0005 : 0);
    const a = phi * Math.PI * 2;
    const lat = 0.54;
    const sun = new S.THREE.Vector3(Math.cos(a), Math.sin(a) * Math.cos(lat), -Math.sin(a) * Math.sin(lat)).normalize();
    U.uSunDir.value.copy(sun);
    const e = sun.y;
    // palette keyed on sun elevation
    const K = [
      [-0.40, [0.006, 0.008, 0.024], [0.020, 0.024, 0.050], [0, 0, 0]],
      [-0.14, [0.012, 0.014, 0.045], [0.050, 0.040, 0.085], [0, 0, 0]],
      [-0.05, [0.035, 0.030, 0.090], [0.220, 0.110, 0.115], [0, 0, 0]],
      [0.015, [0.070, 0.060, 0.170], [0.520, 0.230, 0.110], [2.2, 0.85, 0.28]],
      [0.09, [0.120, 0.120, 0.260], [0.700, 0.420, 0.220], [2.5, 1.35, 0.55]],
      [0.17, [0.140, 0.150, 0.300], [0.600, 0.430, 0.240], [2.1, 1.40, 0.70]],
      [0.32, [0.120, 0.150, 0.300], [0.420, 0.320, 0.190], [1.7, 1.25, 0.72]],
      [1.00, [0.110, 0.150, 0.310], [0.380, 0.300, 0.190], [1.75, 1.32, 0.80]],
    ];
    const pal = i => { let k = 0; while (k < K.length - 2 && e > K[k + 1][0]) k++; const u = clamp((e - K[k][0]) / (K[k + 1][0] - K[k][0])); const s = u * u * (3 - 2 * u); return K[k][i].map((v, j) => lerp(v, K[k + 1][i][j], s)); };
    const zen = pal(1), hor = pal(2), sunc = pal(3);
    const night = smoothstep(-0.02, -0.16, e);
    U.uZen.value.fromArray(zen); U.uHor.value.fromArray(hor);
    U.uSunCol.value.fromArray(sunc).multiplyScalar(smoothstep(-0.03, 0.02, e));
    U.uGlow.value.set(hor[0] * 0.9, hor[1] * 0.55, hor[2] * 0.35).multiplyScalar((1 - night) * lerp(1, 0.35, smoothstep(0.1, 0.5, e)));
    { const g = (zen[0] + zen[1] + zen[2]) / 3; const ds = 0.55;
      U.uAmb.value.set(lerp(zen[0], g, ds) * 0.5 + hor[0] * 0.06, lerp(zen[1], g, ds) * 0.5 + hor[1] * 0.06, lerp(zen[2], g, ds) * 0.5 + hor[2] * 0.06); }
    U.uBounce.value.fromArray(sunc).multiplyScalar(0.11 * smoothstep(-0.03, 0.1, e)).add(new S.THREE.Vector3(0.004, 0.003, 0.003));
    U.uNight.value = night;
    U.uFogDen.value = lerp(0.0007, 0.00045, smoothstep(0.15, 0.4, e));
    U.uMoonCol.value.set(0.11, 0.145, 0.24).multiplyScalar(night * (1.5 + 1.1 * smoothstep(23.5, 27, t)));
    U.uStarI.value = night * 1.1;

    // ---------------- construction
    const level = track([[0, 3], [9.0, 3], [11.3, 15], [11.6, 15], [13.2, 24], [13.5, 24], [14.9, 31], [15.1, 31], [16.3, 37], [16.5, 37], [17.6, TOP_Y]], t, 'inOutSine');
    U.uLevel.value = level;
    U.uBuild.value = smoothstep(8.6, 9.2, t) * (1 - smoothstep(18.0, 19.4, t));
    U.uWaveA.value = 1.6 * U.uBuild.value;
    U.uWavePh.value = t * 8.5;
    U.uWaveCS.value.set(Math.cos(t * 8.5), Math.sin(t * 8.5));
    // ring of workers on the working edge
    { let ax = TERRACE.ax - 12, az = TERRACE.az - 12, y = 3;
      for (const T of TIERS) if (level > T.y0 + 0.01) { const hh = Math.min(level - T.y0, T.h); ax = T.ax - T.b * hh - 1.5; az = T.az - T.b * hh - 1.5; y = T.y0 + hh; }
      S.torchU.uRing.value.set(ax, az, y); }
    S.tU.uTempLevel.value = track([[0, TEMPLE.y0 - 0.1], [17.7, TEMPLE.y0 - 0.1], [18.8, TEMPLE.y0 + 12]], t);
    const fire = smoothstep(18.9, 19.6, t) * (1 - smoothstep(24.2, 25.4, t));
    U.uFireI.value = fire * (1.5 + 0.25 * Math.sin(t * 17) + 0.18 * Math.sin(t * 29.3)) * (0.35 + 0.65 * night);
    S.flameU.uI.value = fire * (1.0 + 0.12 * Math.sin(t * 23));
    S.flame.visible = fire > 0.002; S.embers.visible = fire > 0.002;
    S.dust.visible = S.dustU.uDustI.value > 0.001 || t > 23;
    S.emberU.uI.value = fire;

    // ---------------- erosion and dispersal
    const er = track([[0, 0], [23.3, 0], [28.6, 1]], t, 'inOutSine');
    U.uErode.value = er;
    S.tU.uTempErode.value = smoothstep(23.6, 25.6, t);
    U.uSandCover.value = track([[0, 0], [23.6, 0], [30, 1.15]], t, 'inOutSine');
    U.uWind.value = smoothstep(23.0, 25.0, t);
    S.dustU.uDustI.value = smoothstep(23.2, 25.5, t) * 0.55;

    // people
    S.torchU.uTau.value = S.tau(t);
    S.lagCopies.forEach(p => p.visible = t > S.torchU.uDispT0.value + 0.1);
    S.torchU.uTauD0.value = S.tau(S.torchU.uDispT0.value);
    S.torchU.uDensity.value = track([[0, 0.55], [8.5, 0.6], [19.5, 1.0]], t);
    S.torchU.uProc.value = track([[0, 0], [16.5, 0], [19, 1]], t);
    S.torchU.uTorchI.value = lerp(0.6, 1.0, Math.max(night, smoothstep(0.12, -0.02, e))) * (1 + 0.6 * smoothstep(23.8, 25, t));
    { const ring = S.torchU.uRing.value; const per = 4 * (ring.x + ring.y);
      S.torchU.uWorkers.value = track([[0, 0.07], [8, 0.1], [9, 1], [17.5, 1], [19.5, 0]], t) * (t > 8.6 ? Math.min(1, per / 2.4 / 1800) : 1); }

    // ---------------- camera (orbit parameters around the platform centre)
    const deg = Math.PI / 180;
    const az = track([[0, 6], [8, -4], [13, -55], [17, -92], [20, -97], [23.6, -93], [25.6, -82], [28, -64], [31, -58]], t) * deg;
    const dist = track([[0, 1500], [8, 1330], [14, 400], [17, 230], [20, 118], [23.6, 104], [25.6, 300], [28, 560], [31, 600]], t);
    const hgt = track([[0, 330], [8, 300], [14, 200], [17, 75], [20, 47], [23.6, 45], [25.6, 190], [28, 800], [31, 850]], t);
    const tgt = track([[0, [-1300, 0, -110]], [8, [-1150, 0, 80]], [14, [0, 14, 0]], [17, [0, 36, 10]], [20, [0, 62, 60]], [23.6, [0, 66, 66]], [25.6, [0, 12, 10]], [28, [0, 0, -10]], [31, [0, 0, -10]]], t);
    const fov = track([[0, 30], [8, 30], [17, 34], [20, 38], [23.6, 39], [25.6, 34], [28, 31]], t);
    camera.position.set(Math.cos(az) * dist, hgt, Math.sin(az) * dist);
    camera.lookAt(tgt[0], tgt[1], tgt[2]);
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    U.uCam.value.copy(camera.position);
    S.sky.position.copy(camera.position);
    U.uPix.value = (fov * deg) / (804 * S.pxScale);

    // stars: rotate with the day; in M3 the long exposure accumulates trails
    const rotRate = 0.05 + 0.10 * smoothstep(23, 26, t);
    const tt = Math.max(0, t - 20.0);
    const rotM3 = 0.05 * tt + 0.10 * Math.max(0, tt - 4.5);
    U.uRot.value = -(a - Math.PI * 1.5) - rotM3;
    U.uTrail.value = t > 20 ? Math.min(0.6, rotM3 * smoothstep(20, 20.5, t)) : 0;
    void rotRate;

    // ---------------- veils
    const V = S.veilU;
    V.uTime.value = t;
    V.uBack.value = track([[0, -0.25], [1.7, 1.35]], t, 'inOutSine');
    V.uFront.value = track([[0, -1], [28.7, -0.35], [30.0, 1.4]], t, 'inQuad');
    V.uOp.value = t < 2 ? 1 : t > 28.6 ? 1 : 0;
    const veilCol = t < 5 ? [0.40, 0.29, 0.19] : [0.62, 0.42, 0.22];
    V.uCol.value.fromArray(veilCol);
    V.uCol2.value.fromArray(veilCol.map(x => x * 0.35));
  },

  draw(S, r, target, t) {
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(S.scene, S.camera);
    if (S.veilU.uOp.value > 0.001) {
      const ac = r.autoClear; r.autoClear = false;
      r.render(S.veilScene, S.veilCam);
      r.autoClear = ac;
    }
  },

  grade(S, t) {
    return {
      exposure: 1.05 - 0.2 * (1 - S.util.smoothstep(7, 9, t)),
      saturation: 1.1,
      contrast: 1.04,
      tint: [1.02, 1.0, 0.97],
      lift: [0.008, 0.004, 0.016],
      vignette: 0.42,
      bloom: { strength: 0.62, radius: 0.6, threshold: 0.82 },
    };
  },
};
