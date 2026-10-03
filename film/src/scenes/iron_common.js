// Act VI 铁 — shared uniforms and shader chunks.
import { GLSL } from '../engine/util.js';

// One uniform object graph shared by every material in the scene (updated once per frame).
export function makeUniforms(THREE) {
  return {
    uTime: { value: 0 },        // local scene time (s)
    uHaze: { value: 1 },
    uTau: { value: 0 },         // warped time of the after-world (I3), freezes at the end
    uMode: { value: 0 },        // 0 = I1 dusk, 1 = I2 night, 2 = I3 ash
    uNight: { value: 0 },       // 0 dusk → 1 night
    uAsh: { value: 0 },         // 0 → 1 the grey after-world
    uCam: { value: new THREE.Vector3() },
    uFogCol: { value: new THREE.Color() },
    uFogDen: { value: 0.002 },
    uFogLow: { value: new THREE.Color() },   // colour of the ground haze (city glow)
    uSkyZen: { value: new THREE.Color() },
    uSkyHor: { value: new THREE.Color() },
    uSkyBand: { value: new THREE.Color() },  // low warm band at the horizon
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyCol: { value: new THREE.Color() },
    uAmbTop: { value: new THREE.Color() },
    uAmbBot: { value: new THREE.Color() },
    uRimCol: { value: new THREE.Color() },
    uFurnace: { value: new THREE.Vector3(0, 8, -1.6) },
    uFurnaceCol: { value: new THREE.Color() },
    uFront: { value: 0 },       // height of the tower's growth front
    uPx: { value: 1 },          // pixel scale for point sizes (render height / 804)
  };
}

export const UNI_DECL = /* glsl */`
uniform float uHaze, uTime, uTau, uMode, uNight, uAsh, uFogDen, uFront, uPx;
uniform vec3 uCam, uFogCol, uFogLow, uSkyZen, uSkyHor, uSkyBand, uKeyDir, uKeyCol, uAmbTop, uAmbBot, uRimCol, uFurnace, uFurnaceCol;
`;

// Height-aware exponential fog: thicker near the ground, glow-tinted low down.
export const FOG = /* glsl */`
vec3 applyFog(vec3 col, vec3 wp){
  vec3 d = wp - uCam;
  float dist = length(d);
  float hAvg = max(0.0, (wp.y + uCam.y) * 0.5);
  float den = uFogDen * (0.35 + 0.65 * exp(-hAvg * 0.012));
  float f = 1.0 - exp(-dist * den);
  vec3 fc = mix(uFogLow, uFogCol, smoothstep(0.0, 140.0, wp.y));
  return mix(col, fc, clamp(f, 0.0, 1.0));
}
`;

export const COMMON = UNI_DECL + GLSL.hash + FOG;
export { GLSL };

// Tower growth front (local time → height), mirrored in GLSL below.
export const TOWER_H = 126;
export function frontAt(t) {
  const u = Math.min(Math.max((t + 0.3) / 7.9, 0), 1);
  return 18 + 112 * Math.pow(u, 1.25);
}
export const FRONT_GLSL = /* glsl */`
float frontAt(float t){ float u = clamp((t + 0.3) / 7.9, 0.0, 1.0); return 18.0 + 112.0 * pow(u, 1.25); }
`;
// Inverse of frontAt (height → time when the front passes it).
export function frontTime(y) {
  if (y <= 18) return -0.3;
  const u = Math.pow(Math.min((y - 18) / 112, 1), 1 / 1.25);
  return u * 7.9 - 0.3;
}
