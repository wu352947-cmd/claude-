// MUD — shared GLSL: sky palette, aerial perspective, lighting, heightfield shadows, star trails.
import { GLSL } from '../engine/util.js';

export const COMMON = /* glsl */`
${GLSL.hash}
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uSunDir, uSunCol, uMoonDir, uMoonCol, uZen, uHor, uGlow, uAmb, uBounce;
uniform float uFogDen, uNight;
// growth / erosion
uniform sampler2D uHF;
uniform vec4 uHFRect;
uniform float uLevel, uWaveA, uWavePh, uErode, uBuild;
uniform vec3 uFirePos;
uniform float uFireI;

vec3 skyBase(vec3 d){
  float h = clamp(d.y, 0., 1.);
  float g = pow(1. - h, 5.);
  vec3 c = mix(uZen, uHor, g);
  float sd = max(dot(d, uSunDir), 0.);
  c += uGlow * (pow(sd, 5.) * 0.45 + pow(sd, 40.) * 0.8) * (0.35 + 0.65 * g);
  // earth-shadow / belt of Venus opposite the sun near the horizon at twilight
  float as = max(dot(normalize(vec3(-uSunDir.x, 0., -uSunDir.z)), normalize(vec3(d.x, 0., d.z))), 0.);
  float tw = clamp(1. - abs(uSunDir.y + 0.02) * 9., 0., 1.);
  c += vec3(0.16, 0.07, 0.12) * tw * as * smoothstep(0.02, 0.10, h) * (1. - smoothstep(0.10, 0.32, h));
  float md = max(dot(d, uMoonDir), 0.);
  c += uMoonCol * (pow(md, 12.) * 0.05 + pow(md, 120.) * 0.12) * uNight;
  return c;
}
vec3 fogColor(vec3 d){
  return skyBase(normalize(vec3(d.x, 0.015 + max(d.y, 0.) * 0.25, d.z)));
}
vec3 applyFog(vec3 col, vec3 P){
  vec3 v = P - uCam; float dist = length(v); vec3 d = v / max(dist, 1e-3);
  // exponential height fog integrated along the ray (haze thins with altitude)
  float k = 0.0035;
  float y0 = uCam.y, y1 = P.y;
  float dens = abs(y1 - y0) > 0.5 ? (exp(-k * max(min(y0, y1), 0.)) - exp(-k * max(max(y0, y1), 0.))) / (k * abs(y1 - y0)) : exp(-k * max(y0, 0.));
  float f = 1. - exp(-dist * uFogDen * dens);
  return mix(col, fogColor(d), f);
}

// ---- heightfield (ziggurat) as currently shown
uniform vec2 uWaveCS;   // cos, sin of the sweep phase
float revealAt(vec2 xz){
  if (uWaveA <= 0.) return uLevel;
  float r2 = dot(xz, xz) + 1.;
  float s2 = 2. * xz.x * xz.y / r2, c2 = (xz.x * xz.x - xz.y * xz.y) / r2;   // sin 2θ, cos 2θ
  return uLevel + uWaveA * (0.5 + 0.5 * (s2 * uWaveCS.x - c2 * uWaveCS.y));
}
vec2 erodeW(float thr){
  float e = clamp((uErode - thr) / 0.38, 0., 1.);
  return vec2(smoothstep(0., 0.55, e), smoothstep(0.3, 1., e));
}
float hfHeight(vec2 xz){
  vec2 uv = (xz - uHFRect.xy) / uHFRect.zw;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.;
  vec4 h = texture2D(uHF, uv);
  float hz = min(h.r, revealAt(xz));
  vec2 e = erodeW(h.a);
  return mix(mix(hz, h.g, e.x), h.b, e.y);
}
float hfShadow(vec3 P, vec3 L){
  if (L.y < 0.004) return 0.;
  // ray vs bounding box of the structure
  vec3 bmin = vec3(uHFRect.x, 0., uHFRect.y), bmax = vec3(uHFRect.x + uHFRect.z, 54., uHFRect.y + uHFRect.w);
  vec3 inv = 1. / L;
  vec3 t0 = (bmin - P) * inv, t1 = (bmax - P) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float tN = max(max(tn.x, tn.y), max(tn.z, 0.)), tF = min(min(tf.x, tf.y), tf.z);
  if (tF <= tN) return 1.;
  float t = tN + 0.3, res = 1.;
  for (int i = 0; i < 28; i++) {
    vec3 Q = P + L * t;
    float d = Q.y - hfHeight(Q.xz);
    res = min(res, clamp(6. * d / t + 0.15, 0., 1.));
    if (res < 0.01 || t > tF) break;
    t += clamp(d * 0.6, 0.5, 30.);
  }
  return smoothstep(0., 1., res);
}

uniform sampler2D uCity;
uniform float uCityExt;
float cityH(vec2 xz){
  vec2 uv = (xz + uCityExt) / (2. * uCityExt);
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.;
  vec4 c = texture2D(uCity, uv);
  if (c.r < 0.004) return 0.;
  float birth = c.g * 24. - 2., death = c.b * 12. + 20.;
  return c.r * 16. * smoothstep(birth, birth + 0.45, uTime) * (1. - 0.92 * smoothstep(death, death + 1.8, uTime));
}
float cityShadow(vec3 P, vec3 L){
  if (L.y < 0.01) return 0.;
  if (dot(P.xz, P.xz) > 780. * 780.) return 1.;
  float tanE = L.y / length(L.xz);
  vec2 dir = normalize(L.xz);
  float maxD = min(10. / tanE, 70.);
  float res = 1.;
  for (int i = 1; i <= 7; i++) {
    float s = maxD * pow(float(i) / 7., 1.4);
    float rh = P.y + s * tanE;
    float h = cityH(P.xz + dir * s);
    res = min(res, clamp((rh - h) * 0.7 + 0.5, 0., 1.));
  }
  return res;
}

// Lighting. N world normal, alb albedo, ao ambient occlusion, sh = sun shadow, shm = moon shadow.
vec3 shade(vec3 P, vec3 N, vec3 alb, float ao, float sh, float shm, float rough){
  vec3 V = normalize(uCam - P);
  float ndl = max(dot(N, uSunDir), 0.);
  // wrap a little so the terminator is soft (mud scatters)
  float wrap = max((dot(N, uSunDir) + 0.15) / 1.15, 0.);
  vec3 c = alb * uSunCol * mix(ndl, wrap, 0.35) * sh;
  float ndm = max(dot(N, uMoonDir), 0.);
  c += alb * uMoonCol * ndm * shm;
  c += alb * uAmb * (0.55 + 0.45 * N.y) * ao;
  c += alb * uBounce * (0.5 - 0.5 * N.y) * ao;
  // sheen at grazing sun (dust)
  float fr = pow(1. - max(dot(N, V), 0.), 4.);
  c += uSunCol * 0.04 * fr * sh * (1. - rough) ;
  // shrine fire
  if (uFireI > 0.001) {
    vec3 Lf = uFirePos - P; float d2 = dot(Lf, Lf); Lf *= inversesqrt(d2);
    c += alb * vec3(1., 0.45, 0.16) * uFireI * max(dot(N, Lf) * 0.8 + 0.2, 0.) / (1. + d2 * 0.004);
  }
  return c;
}
`;

// Star trails around the celestial pole (latitude ~31°N, pole due north = +z).
// uRot: sky rotation angle (rad), uTrail: trail length (rad of rotation), uPix: pixel angular size.
export const STARS = /* glsl */`
uniform float uRot, uTrail, uPix, uStarI;
const float PI = 3.14159265;
vec3 starLayer(vec3 d, float bandW, float nmax, float seed, float magBias){
  vec3 P = normalize(vec3(0., sin(0.541), cos(0.541)));
  vec3 E1 = normalize(cross(P, vec3(1., 0., 0.)));
  vec3 E2 = cross(P, E1);
  float dec = asin(clamp(dot(d, P), -1., 1.));
  float ra = atan(dot(d, E2), dot(d, E1));
  float bN = (dec + PI * 0.5) / bandW;
  float b0 = floor(bN);
  float fb = bN - b0;
  vec3 sum = vec3(0.);
  float sig = uPix * 0.75;
  for (int k = 0; k < 2; k++) {
    float b = b0 + (k == 0 ? 0. : (fb > 0.5 ? 1. : -1.));
    float cd = cos((b + 0.5) * bandW - PI * 0.5);
    float n = floor(nmax * cd + hash11(b * 3.7 + seed));
    for (int i = 0; i < 24; i++) {
      if (float(i) >= n) break;
      vec3 h = hash31(b * 61.37 + float(i) * 7.913 + seed);
      float sdec = (b + h.x) * bandW - PI * 0.5;
      float dd = dec - sdec;
      if (abs(dd) > sig * 4.) continue;
      float sra = h.y * 2. * PI + uRot;
      float dra = mod(ra - sra + PI, 2. * PI) - PI;
      float cs = cos(sdec);
      float along = dra * cs;
      float Lc = uTrail * cs;
      float da = along > 0. ? along : (along < -Lc ? -Lc - along : 0.);
      float w = exp(-(dd * dd + da * da) / (sig * sig * 2.));
      // magnitude distribution: few bright, many faint
      float m = pow(h.z, 7.0) * 1.0 + pow(h.z, 1.5) * 0.08 + magBias;
      float tail = (Lc > 1e-5 && along < 0.) ? mix(1., 0.35, clamp(-along / Lc, 0., 1.)) : 1.;
      // trails smear the flux, but long-exposure film keeps them visible
      float smear = Lc > 1e-5 ? mix(1., 0.55, clamp(Lc / (sig * 12.), 0., 1.)) : 1.;
      vec3 tint = mix(vec3(0.74, 0.84, 1.15), vec3(1.15, 0.94, 0.74), fract(h.x * 7.31 + h.y * 3.17));
      sum += tint * (m * w * tail * smear);
    }
  }
  return sum;
}
vec3 starField(vec3 d){
  vec3 s = starLayer(d, 0.0085, 22., 1.7, 0.0) + starLayer(d, 0.0055, 20., 9.3, 0.0) * 0.5;
  return s * uStarI;
}
`;
