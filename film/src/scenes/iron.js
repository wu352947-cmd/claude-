// Ⅵ 铁 IRON — 2:07.5–2:34.5 (local t = global − 127.5)
//  I1  0.0– 8.5  gears inside the tower → pull back → the lattice tower assembles itself, rivet sparks
//  I2  8.5–18.5  night falls (time-lapse); a skyscraper city crystallises; rise alongside the tallest spire
//  I3 18.5–27.0  (white flash by MASTER at 146.0) the grey after-world: towers peel away into ash,
//                the ash falls like snow and decelerates to a standstill by 153.4 (hand-off to SKY)
import { makeUniforms, COMMON, GLSL, frontAt } from './iron_common.js';
import { buildTower } from './iron_tower.js';
import { buildGears } from './iron_gears.js';
import { buildCity, SPIRE } from './iron_city.js';
import { buildAsh } from './iron_ash.js';

const T_I2 = 8.5, T_I3 = 18.5;
const STOP_A = 24.3, STOP_B = 25.9;   // ash decelerates 151.8 → 153.4 (global)

// warped after-world time: 1:1 until STOP_A, smooth deceleration to zero at STOP_B
function tauAt(t) {
  if (t <= T_I3) return 0;
  const a = STOP_A, b = STOP_B;
  let s = t - T_I3;
  if (t > a) {
    const u = Math.min((t - a) / (b - a), 1);
    s -= (b - a) * (u * u * u - u * u * u * u / 2);
    if (t > b) s -= t - b;
  }
  return s;
}

const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mixC = (out, a, b, t) => out.setRGB(mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t));

const LOOK = {
  dusk: {
    zen: [0.02, 0.032, 0.05], hor: [0.13, 0.16, 0.19], band: [0.3, 0.13, 0.035],
    fog: [0.1, 0.12, 0.145], fogLow: [0.09, 0.09, 0.1], den: 0.0022,
    key: [0.5, 0.56, 0.66], ambTop: [0.14, 0.17, 0.22], ambBot: [0.035, 0.035, 0.04], rim: [0.35, 0.45, 0.6],
  },
  night: {
    zen: [0.003, 0.009, 0.016], hor: [0.025, 0.055, 0.07], band: [0.12, 0.06, 0.018],
    fog: [0.018, 0.04, 0.05], fogLow: [0.045, 0.03, 0.016], den: 0.0017,
    key: [0.04, 0.06, 0.08], ambTop: [0.05, 0.08, 0.1], ambBot: [0.06, 0.035, 0.015], rim: [0.06, 0.12, 0.16],
  },
  ash: {
    zen: [0.1, 0.1, 0.104], hor: [0.15, 0.15, 0.153], band: [0.0, 0.0, 0.0],
    fog: [0.14, 0.14, 0.143], fogLow: [0.13, 0.13, 0.133], den: 0.0026,
    key: [0.25, 0.25, 0.26], ambTop: [0.9, 0.9, 0.92], ambBot: [0.4, 0.4, 0.41], rim: [0.1, 0.1, 0.1],
  },
};

function skyDome(THREE, U) {
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vec4 w = modelMatrix*vec4(position,1.); vD = w.xyz - cameraPosition; gl_Position = projectionMatrix*viewMatrix*w; gl_Position.z = gl_Position.w*0.99999; }`,
    fragmentShader: /* glsl */`
${COMMON}
${GLSL.snoise}
varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  float y = d.y;
  vec3 col = mix(uSkyHor, uSkyZen, pow(clamp(y, 0.0, 1.0), 0.45));
  col += uSkyBand * exp(-max(y, 0.0) * 16.0);
  // high thin stratus streaks (dusk) / a soft overcast (ash)
  if (uNight < 0.99 && uAsh < 0.5 && y > 0.0) {
    vec2 sp = d.xz / max(y + 0.12, 0.05);
    float n = snoise(vec3(sp.x * 0.35, sp.y * 1.6, 3.0)) * 0.5 + 0.5;
    col *= 1.0 + (n - 0.5) * 0.28 * (1.0 - uNight) * smoothstep(0.0, 0.2, y);
  }
  // stars over the night city
  if (uNight > 0.01 && uAsh < 0.5) {
    vec3 c = floor(d * 380.0);
    float h = hash12(c.xy + c.z * 17.0);
    col += vec3(0.8, 0.9, 1.0) * step(0.9965, h) * (h - 0.9965) * 300.0 * uNight * smoothstep(0.08, 0.4, y) * 0.03;
  }
  if (y < 0.0) col = mix(col, uFogLow, smoothstep(0.0, -0.05, y));
  gl_FragColor = vec4(col, 1.0);
}`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// a single bright point (the tower lantern), additive
function lantern(THREE, U) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 116.2, 0]), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uOn: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`${COMMON} uniform float uOn; varying float vA;
void main(){ vec4 mv = viewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; vA = uOn; gl_PointSize = uOn > 0.0 ? clamp(1100.0*uPx/-mv.z, 4.0*uPx, 26.0*uPx) : 0.0; }`,
    fragmentShader: `varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float d=dot(c,c)*4.; float a=(exp(-d*14.)+exp(-d*3.)*.25)*vA; if(a<.003) discard; gl_FragColor=vec4(vec3(1.6,.9,.36)*a,1.); }`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return { p, mat };
}

// ---------------- camera ----------------
const P = (x, y, z) => [x, y, z];
function camI1(t) {
  // exponential pull-back from the gear face to the whole tower
  const s = sstep(0.15, 8.9, t);
  const s2 = Math.pow(s, 0.9);
  const d = 15.8 * Math.pow(268 / 15.8, s2);
  const lat = -24 * s * s;
  const y = 8 + 22 * Math.pow(s, 1.6);
  const pos = P(lat, y, d);
  const tgt = P(4 * s, 8 + 56 * Math.pow(s, 1.35), -12 * s);
  return { pos, tgt, fov: 30 };
}
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function bez3(a, b, c, d, t) { const u = 1 - t; return a.map((_, i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]); }
function camI2(t) {
  const e = camI1(T_I2);
  // the rise column beside the spire (direction from the spire, radius)
  const ang0 = 2.3, R0 = 72;
  const r = Math.min(Math.max((t - 11.6) / (18.45 - 11.6), 0), 1);   // rise progress
  const ang = ang0 + 0.5 * r * r;
  const R = R0 - 30 * Math.pow(r, 1.5);
  const colX = SPIRE.x + Math.cos(ang) * R, colZ = SPIRE.z + Math.sin(ang) * R;
  // glide: from the tower reveal past the tower's right flank to the foot of the column
  const u = sstep(8.6, 13.6, t);
  const c0 = [SPIRE.x + Math.cos(ang0) * R0, SPIRE.z + Math.sin(ang0) * R0];
  const g = bez3([e.pos[0], 0, e.pos[2]], [e.pos[0] + 30, 0, e.pos[2] - 110], [c0[0] + 18, 0, c0[1] + 95], [c0[0], 0, c0[1]], u);
  const k = sstep(11.6, 14.0, t);
  const x = mix(g[0], colX, k), z = mix(g[2], colZ, k);
  // height: drift up, then an accelerating vertical rise to just under the needle tip
  const y = mix(e.pos[1], 34, sstep(8.6, 11.6, t)) + 200 * Math.pow(r, 2.5);
  const pos = [x, y, z];
  // look: from the tower top towards the spire, then level with us, slightly up
  const lookH = [mix(e.tgt[0], SPIRE.x, sstep(8.8, 12.6, t)), mix(e.tgt[2], SPIRE.z, sstep(8.8, 12.6, t))];
  const ty = mix(mix(e.tgt[1], 80, sstep(8.8, 11.5, t)), y + 14 - 6 * r, sstep(10.5, 13.8, t));
  return { pos, tgt: [lookH[0], ty, lookH[1]], fov: mix(30, 34, sstep(12, 18.5, t)) };
}
function camI3(tau) {
  const s = Math.min(tau / 6.6, 1);
  const pos = lerp3([-34, 58, 40], [-28, 62, 12], s);
  const tgt = lerp3([40, 100, -480], [34, 165, -480], sstep(0.2, 1, s));
  return { pos, tgt, fov: 32 };
}

export default {
  async init(ctx) {
    const { THREE, aspect, util, H } = ctx;
    const rand = util.rng(1889);
    const U = makeUniforms(THREE);
    U.uPx.value = H / 804;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, aspect, 0.2, 9000);
    scene.add(skyDome(THREE, U));
    const tower = buildTower(THREE, U, rand);
    scene.add(tower.group);
    const gears = buildGears(THREE, U);
    scene.add(gears.group);
    const city = buildCity(THREE, U, util.rng(1931));
    scene.add(city.group);
    const lan = lantern(THREE, U);
    scene.add(lan.p);
    // the after-world: ash sampled on the towers in front of the I3 camera
    const c3 = camI3(0);
    const fwd = [c3.tgt[0] - c3.pos[0], c3.tgt[2] - c3.pos[2]];
    const fl = Math.hypot(fwd[0], fwd[1]); fwd[0] /= fl; fwd[1] /= fl;
    const view = (x, z) => {
      const dx = x - c3.pos[0], dz = z - c3.pos[2];
      const along = dx * fwd[0] + dz * fwd[1], side = -dx * fwd[1] + dz * fwd[0];
      return along > 8 && along < 1000 && Math.abs(side) < along * 0.75 + 30;
    };
    const ash = buildAsh(THREE, U, util.rng(1945), city, view);
    scene.add(ash.points, ash.ambient);
    // anchor the ambient ash volume to the final I3 camera pose
    const cEnd = camI3(6.6);
    const anchorCam = new THREE.PerspectiveCamera();
    anchorCam.position.fromArray(cEnd.pos);
    anchorCam.lookAt(new THREE.Vector3(cEnd.tgt[0], cEnd.pos[1], cEnd.tgt[2]));
    anchorCam.updateMatrixWorld();
    ash.ambMat.uniforms.uAnchor.value.copy(anchorCam.matrixWorld);
    return { scene, camera, U, tower, gears, city, ash, lan, util, THREE, clearColor: 0x000000, tmpV: new THREE.Vector3() };
  },

  update(st, t) {
    const { U, camera, util } = st;
    const tau = tauAt(t);
    const night = sstep(8.2, 10.4, t);
    const ash = t >= T_I3 ? 1 : 0;
    U.uTime.value = t; U.uTau.value = tau;
    U.uMode.value = t < T_I2 ? 0 : t < T_I3 ? 1 : 2;
    U.uNight.value = ash ? 0 : night;
    U.uAsh.value = ash;
    U.uFront.value = frontAt(t);
    // look
    const A = ash ? LOOK.ash : null;
    const L = (k) => (A ? A[k] : LOOK.dusk[k].map((v, i) => mix(v, LOOK.night[k][i], night)));
    mixC(U.uSkyZen.value, L('zen'), L('zen'), 0); mixC(U.uSkyHor.value, L('hor'), L('hor'), 0);
    mixC(U.uSkyBand.value, L('band'), L('band'), 0); mixC(U.uFogCol.value, L('fog'), L('fog'), 0);
    mixC(U.uFogLow.value, L('fogLow'), L('fogLow'), 0); mixC(U.uKeyCol.value, L('key'), L('key'), 0);
    mixC(U.uAmbTop.value, L('ambTop'), L('ambTop'), 0); mixC(U.uAmbBot.value, L('ambBot'), L('ambBot'), 0);
    mixC(U.uRimCol.value, L('rim'), L('rim'), 0);
    U.uFogDen.value = ash ? LOOK.ash.den : mix(LOOK.dusk.den, LOOK.night.den, night);
    U.uKeyDir.value.set(ash ? 0.2 : 0.35, ash ? 1.0 : 0.32, ash ? 0.3 : -1).normalize();
    const furn = (1 - sstep(5.5, 8.5, t)) * (1 - ash);
    U.uFurnaceCol.value.setRGB(1.0 * furn, 0.42 * furn, 0.11 * furn);

    // camera
    let c;
    if (t < T_I2) c = camI1(t);
    else if (t < T_I3) c = camI2(t);
    else c = camI3(tau);
    camera.position.fromArray(c.pos);
    camera.fov = c.fov; camera.updateProjectionMatrix();
    st.tmpV.fromArray(c.tgt);
    camera.lookAt(st.tmpV);
    // a very slight handheld feel during the rise (I2 only)
    if (t >= T_I2 && t < T_I3) {
      const amp = 0.0016 + 0.0035 * sstep(12, 18.5, t);
      camera.rotateX(util.noise3(t * 1.3, 1.7, 0) * amp);
      camera.rotateY(util.noise3(t * 1.1, 5.3, 0) * amp);
      camera.rotateZ(util.noise3(t * 0.9, 9.1, 0) * amp * 0.6);
    }
    camera.updateMatrixWorld();
    U.uCam.value.copy(camera.position);

    // visibility per shot
    st.gears.group.visible = t < T_I2 + 0.2;
    if (st.gears.group.visible) st.gears.update(t);
    st.tower.group.visible = !ash;
    st.city.searchlights.group.visible = t > 9 && !ash;
    st.city.searchlights.mat.uniforms.uOn.value = sstep(9.4, 11.5, t);
    if (st.city.searchlights.group.visible) st.city.searchlights.update(t);
    st.city.beacons.visible = t > 9 && !ash;
    st.city.traffic.visible = !ash;
    st.ash.points.visible = !!ash;
    st.ash.ambient.visible = !!ash;
    st.lan.p.visible = t > 7.4 && !ash;
    st.lan.mat.uniforms.uOn.value = sstep(7.5, 7.9, t) * (0.75 + 0.25 * Math.sin(t * 3.0)) * (1 - 0.55 * night);
  },

  grade(st, t) {
    if (t < T_I3) {
      const n = sstep(8.2, 10.4, t);
      return {
        exposure: mix(1.15, 1.1, n),
        saturation: mix(0.82, 1.0, n),
        contrast: 1.04,
        tint: [mix(0.94, 0.96, n), mix(0.99, 1.0, n), mix(1.07, 1.04, n)],
        lift: [0.004, 0.008, 0.014],
        gamma: [1, 1, 1],
        gain: [1, 1, 1],
        vignette: 0.42,
        grain: 0.05,
        bloom: { strength: mix(0.75, 0.95, n), radius: 0.55, threshold: mix(0.85, 0.8, n) },
      };
    }
    // the after-world: overexposed under the MASTER white, settling into near-monochrome grey
    const f = sstep(T_I3, 22.2, t);
    return {
      exposure: mix(7.0, 1.0, Math.pow(f, 0.6)),
      saturation: 0.1,
      contrast: 0.94,
      tint: [1.0, 1.0, 1.01],
      lift: [0.05, 0.05, 0.053],
      gamma: [1.02, 1.02, 1.02],
      gain: [1, 1, 1],
      vignette: 0.32,
      grain: 0.055,
      bloom: { strength: mix(1.6, 0.35, f), radius: 0.7, threshold: mix(0.3, 0.9, f) },
    };
  },
};
