/* Sea environment for 南海决战: sky, haze, ocean, clouds, ship wakes, sun flare.
   - Sky: the Preetham daylight model (as three's Sky) evaluated in a shared GLSL function, so the haze on every
     object fades into exactly the sky colour behind it and the horizon has no seam.
   - Haze: exponential height fog (marine haze ~1.3 km scale height) replaces three's fog chunks for every
     material: thick along the sea surface, thin from altitude.
   - Ocean: a camera-centred polar grid displaced by Gerstner swell, with three layers of a Tessendorf (Phillips
     spectrum) slope map for detail, sky reflection by Fresnel, a GGX sun glint, subsurface light in the crests,
     whitecaps, reef shallows and cloud shadows.
   - Clouds: fair-weather cumulus with flat bases at one condensation level, lit billboards sorted back to front,
     a high altocumulus deck in the sky dome, and distant cumulonimbus towers.
   - Wakes: each ship leaves a turbulent centre wake and Kelvin arms (19.5°) of foam that age and spread.
   Expects THREE in scope. Textures are loaded from assets/sea/ (relative URLs). */
function createSeaEnv({ scene, renderer, hq, time, wind, islands = [], Lensflare, LensflareElement }) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let seed = 98765;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rr = (a, b) => a + rnd() * (b - a);
  const lin = hex => new THREE.Color(hex);           // THREE.Color from hex is already linear (colour management on)
  const v3 = c => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

  const TIMES = {
    dawn: { label: '清晨', elev: 8, az: 95, exposure: 0.55, turbidity: 6, rayleigh: 2.2, mieG: 0.85, sun: 0xffbf8a, sunI: 2.6,
      hemiSky: 0xa9bbd6, hemiGround: 0x30383c, hemiI: 0.75, deep: 0x02101c, sss: 0x0a4a4a, deck: 0.62, cloudSun: 0xffc9a0 },
    noon: { label: '正午', elev: 62, az: 160, exposure: 0.4, turbidity: 2.4, rayleigh: 1.0, mieG: 0.8, sun: 0xfff4e6, sunI: 3.4,
      hemiSky: 0xc4d8f0, hemiGround: 0x34424a, hemiI: 1.05, deep: 0x01142a, sss: 0x0b5a58, deck: 0.66, cloudSun: 0xffffff },
    dusk: { label: '黄昏', elev: 11, az: 210, exposure: 0.56, turbidity: 4.5, rayleigh: 1.6, mieG: 0.86, sun: 0xffd7aa, sunI: 3.0,
      hemiSky: 0xb7cbe6, hemiGround: 0x323c40, hemiI: 0.9, deep: 0x02111f, sss: 0x0a4f50, deck: 0.6, cloudSun: 0xffe0bc }
  };
  const SUN = new THREE.Vector3();
  const FOG_D = 4.2e-5;
  const fogColor = new THREE.Color(1, 1, 1);         // tint on the sky-coloured haze
  scene.fog = new THREE.FogExp2(fogColor, FOG_D);    // fogDensity = haze at sea level (per metre)
  const WIND = wind ? new THREE.Vector2(wind.x, wind.z).normalize() : new THREE.Vector2(-0.85, 0.53).normalize();

  /* ---------- swell: Gerstner waves shared by the ocean shader, wakes and ship motion ---------- */
  const G = 9.81, NW = 6;
  const waveDef = [[96, 0.42, 0, 0.55], [61, 0.3, 24, 0.6], [38, 0.18, -31, 0.6], [23, 0.1, 47, 0.6], [14, 0.06, -17, 0.6], [8.5, 0.035, 62, 0.6]];
  const waves = waveDef.map(([lam, amp, ang, q]) => {
    const a = Math.atan2(WIND.y, WIND.x) + ang * Math.PI / 180, k = 2 * Math.PI / lam;
    return { dx: Math.cos(a), dz: Math.sin(a), k, amp, w: Math.sqrt(G * k), q: Math.min(q, 0.9 / (k * amp * NW)), lam };
  });
  const uWave = { value: waves.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.amp)) };
  const uWave2 = { value: waves.map(w => new THREE.Vector4(w.w, w.q, w.lam, 0)) };
  const uTime = { value: 0 };
  let tNow = 0;
  // sea surface height at (x, z) for ship motion (horizontal Gerstner displacement neglected)
  function waveHeight(x, z) {
    let y = 0;
    for (const w of waves) y += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * tNow);
    return y;
  }

  /* ---------- shared GLSL: sky radiance, haze, swell ---------- */
  function skyConsts(T) {
    const cosZ = SUN.y, cutoff = 1.6110731556870734, steep = 1.5;
    const sunE = 1000 * Math.max(0, 1 - Math.exp(-((cutoff - Math.acos(clamp(cosZ, -1, 1))) / steep)));
    const tR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5].map(x => x * T.rayleigh);
    const mie = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14].map(x => 0.434 * (0.2 * T.turbidity * 10e-18) * x * 0.006);
    const f = x => x.toExponential(6);
    const sunC = lin(T.sun), cloudSun = lin(T.cloudSun);
    return `
const vec3 SKY_SUN = vec3(${SUN.x.toFixed(6)}, ${SUN.y.toFixed(6)}, ${SUN.z.toFixed(6)});
const vec3 SKY_BR = vec3(${tR.map(f).join(', ')});
const vec3 SKY_BM = vec3(${mie.map(f).join(', ')});
const float SKY_SUNE = ${sunE.toFixed(4)};
const float SKY_G = ${T.mieG.toFixed(3)};
const vec3 SKY_SUNC = ${v3(sunC)} * ${(T.sunI / 3.0).toFixed(3)};
const vec3 CLOUD_SUNC = ${v3(cloudSun)};
const float DECK_COVER = ${T.deck.toFixed(3)};
// Preetham sky radiance (three's Sky, sun fade 1), with or without the solar disc
vec3 skyL(vec3 dir, float disc) {
  float zen = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - zen * 57.29578, -1.253));
  vec3 Fex = exp(-(SKY_BR * 8.4e3 * inv + SKY_BM * 1.25e3 * inv));
  float c = dot(dir, SKY_SUN);
  float rP = 0.05968310365946075 * (1.0 + pow(c * 0.5 + 0.5, 2.0));
  float g2 = SKY_G * SKY_G;
  float mP = 0.07957747154594767 * (1.0 - g2) / pow(1.0 - 2.0 * SKY_G * c + g2, 1.5);
  vec3 bt = (SKY_BR * rP + SKY_BM * mP) / (SKY_BR + SKY_BM);
  vec3 Lin = pow(SKY_SUNE * bt * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(SKY_SUNE * bt * Fex, vec3(0.5)), clamp(pow(1.0 - SKY_SUN.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  L0 += SKY_SUNE * 19000.0 * Fex * smoothstep(0.99995, 0.99997, c) * disc;
  vec3 tex = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  return pow(tex, vec3(1.0 / 2.4));
}
vec3 skyL(vec3 dir) { return skyL(dir, 0.0); }
// haze: optical depth of an exponential layer (scale height 1300 m) from the camera along w, plus a thin uniform term
float seaFogAmount(vec3 w, float density) {
  float L = length(w);
  vec3 d = w / max(L, 1e-3);
  float k = 1.0 / 1300.0;
  float dy = d.y * L * k;
  float od = abs(dy) > 1e-3 ? (1.0 - exp(-dy)) / dy : 1.0 - 0.5 * dy;
  float tau = density * (exp(-max(cameraPosition.y, 0.0) * k) * L * od + 0.08 * L);
  return 1.0 - exp(-tau * tau * 0.6 - tau * 0.4);
}
// the haze takes the colour of the sky just above the horizon in that direction
vec3 seaFogColor(vec3 w) {
  vec3 d = normalize(w);
  d.y = max(d.y, 0.0) * 0.6 + 0.01;
  return skyL(normalize(d));
}`;
  }
  const WAVE_GLSL = `
uniform vec4 uWave[${NW}];
uniform vec4 uWave2[${NW}];
uniform float uTime;
// Gerstner swell at world xz; dist (to the camera) fades waves the grid cannot resolve. Returns displacement, adds slopes to n
vec3 swell(vec2 p, float dist, inout vec2 slope) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uWave[i]; vec4 w2 = uWave2[i];
    float fade = 1.0 - smoothstep(w2.z * 3.5, w2.z * 9.0, dist);
    if (fade <= 0.0) continue;
    float a = w.w * fade;
    float ph = w.z * dot(w.xy, p) - w2.x * uTime;
    float s = sin(ph), c = cos(ph);
    o.xz += w2.y * a * w.xy * c;
    o.y += a * s;
    slope += w.xy * (w.z * a * c);
  }
  return o;
}`;
  // three's fog chunks, replaced: world-space view vector in the vertex stage, sky-coloured height haze in the fragment
  const CHUNK = {
    fog_pars_vertex: `#ifdef USE_FOG\n varying vec3 vFogW;\n#endif`,
    fog_vertex: `#ifdef USE_FOG\n vFogW = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif`,
    fog_pars_fragment: `#ifdef USE_FOG\n uniform vec3 fogColor;\n uniform float fogDensity;\n varying vec3 vFogW;\n #include <sea_sky>\n#endif`,
    fog_fragment: `#ifdef USE_FOG
  float fogF = seaFogAmount(vFogW, fogDensity);
  vec3 fogC = seaFogColor(vFogW) * fogColor;
  #ifdef TONE_MAPPING
  fogC = toneMapping(fogC);
  #endif
  fogC = linearToOutputTexel(vec4(fogC, 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogF);
#endif`
  };
  let skyVersion = 0;
  const baseKey = THREE.Material.prototype.customProgramCacheKey;
  THREE.Material.prototype.customProgramCacheKey = function () { return baseKey.call(this) + '|sea' + skyVersion; };
  Object.assign(THREE.ShaderChunk, CHUNK, { sea_waves: WAVE_GLSL });

  /* ---------- textures ---------- */
  const texLoader = new THREE.TextureLoader();
  const loadTex = (url, opt) => new Promise(res => texLoader.load(url, t => { Object.assign(t, opt); t.needsUpdate = true; res(t); }, undefined, () => res(null)));
  const oceanTex = { value: null }, noiseTex = { value: null };
  let noiseData = null;
  const ready = Promise.all([
    loadTex('assets/sea/ocean_n.webp', { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.NoColorSpace, anisotropy: 8 }).then(t => { oceanTex.value = t; }),
    loadTex('assets/sea/noise.webp', { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.NoColorSpace }).then(t => {
      noiseTex.value = t;
      if (t) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(t.image, 0, 0); noiseData = g.getImageData(0, 0, 256, 256).data; }
    })
  ]).then(() => { buildClouds(); });
  // bilinear, tiled lookup of one noise channel (matches the GPU sampler for cloud placement and shadows)
  function noise(u, v, ch) {
    if (!noiseData) return 0.5;
    u = (u % 1 + 1) % 1 * 256 - 0.5; v = (v % 1 + 1) % 1 * 256 - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const at = (x, y) => noiseData[(((y + 256) % 256) * 256 + ((x + 256) % 256)) * 4 + ch] / 255;
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
  }
  // cumulus cover over the sea: one field drives both where clouds stand and where their shadows fall
  const CU_SCALE = 34000, CU_BASE = 950;
  const cuCover = (x, z) => noise(x / CU_SCALE, z / CU_SCALE, 0) * 0.75 + noise(x / CU_SCALE * 3.1, z / CU_SCALE * 3.1, 2) * 0.25;

  /* ---------- lights and environment map ---------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.shadow.mapSize.set(hq ? 2048 : 1024, hq ? 2048 : 1024);
  Object.assign(sunLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 200 });
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.05;
  scene.add(hemi, sunLight, sunLight.target);

  /* ---------- sky dome with the high cloud deck ---------- */
  const DECK_GLSL = `
uniform sampler2D uNoise;
// altocumulus deck at 6.5 km: patchy cover with cellular lumps, lit from the sun side, hazed toward the horizon
vec4 cloudDeck(vec3 d, vec3 o) {
  if (d.y <= 0.0) return vec4(0.0);
  float t = (6500.0 - o.y) / max(d.y, 0.004);
  if (t < 0.0) return vec4(0.0);
  vec2 p = o.xz + d.xz * t;
  vec2 drift = uTime * vec2(${(WIND.x * 6).toFixed(3)}, ${(WIND.y * 6).toFixed(3)});
  vec2 q = (p - drift) / 60000.0;
  float n = texture2D(uNoise, q).r * 0.7 + texture2D(uNoise, q * 3.3 + 0.3).b * 0.3;
  float lump = texture2D(uNoise, (p - drift) / 5200.0).g;
  float lump2 = texture2D(uNoise, (p - drift) / 1900.0).a;
  float dens = n - (1.0 - DECK_COVER) + (lump - 0.5) * 0.35 + (lump2 - 0.5) * 0.12;
  float a = smoothstep(0.0, 0.22, dens);
  float toward = texture2D(uNoise, q + SKY_SUN.xz * 0.006).r * 0.7 + texture2D(uNoise, (q + SKY_SUN.xz * 0.006) * 3.3 + 0.3).b * 0.3;
  float lit = clamp(0.75 + (n - toward) * 4.0, 0.35, 1.15);
  vec3 amb = skyL(vec3(0.0, 1.0, 0.0)) * 0.9;
  float fwd = pow(max(dot(d, SKY_SUN), 0.0), 6.0);
  vec3 col = CLOUD_SUNC * SKY_SUNE * 0.00085 * lit * (0.6 + 0.4 * SKY_SUN.y) + amb * 0.55 + CLOUD_SUNC * fwd * (1.0 - a) * 0.8;
  a *= 0.9 * smoothstep(0.0, 0.05, d.y);
  float f = seaFogAmount(d * min(t, 200000.0), fogDensity);
  return vec4(mix(col, seaFogColor(d), f), a * (1.0 - f * 0.85));
}`;
  function skyMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uNoise: noiseTex, uTime }),
      vertexShader: `varying vec3 vDir;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }`,
      fragmentShader: `uniform float fogDensity; uniform float uTime; varying vec3 vDir;
        #include <sea_sky>
        ${DECK_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = skyL(d, 1.0);
          vec4 c = cloudDeck(d, cameraPosition);
          col = mix(col, c.rgb, c.a);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
  }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100000, 48, 24), skyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  sky.material.uniforms.fogDensity.value = FOG_D;
  // environment for PBR: the same sky over a dark sea
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial());
  envSky.material.uniforms.fogDensity.value = FOG_D;
  envScene.add(envSky);
  const envSea = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: 0x0b2232 }));
  envSea.rotation.x = -Math.PI / 2; envSea.position.y = -2; envScene.add(envSea);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  /* ---------- ocean ---------- */
  const isl = islands.slice(0, 4);
  while (isl.length < 4) isl.push({ x: 1e7, z: 1e7, rx: 1, rz: 1, rot: 0 });
  const uIsl = { value: isl.map(I => new THREE.Vector4(I.x, I.z, I.rx, I.rz)) }, uIslRot = { value: isl.map(I => I.rot || 0) };
  const waterUniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uWave, uWave2, uTime, uOcean: oceanTex, uNoise: noiseTex, uDeep: { value: new THREE.Color() }, uSSS: { value: new THREE.Color() },
    uIsl, uIslRot, uCenter: { value: new THREE.Vector2() }, uDetail: { value: hq ? 1 : 0.85 }
  });
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms, fog: true, side: THREE.DoubleSide,
    vertexShader: `#include <sea_waves>
      uniform vec2 uCenter;
      varying vec3 vWorld; varying vec2 vSlope; varying float vH;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = vec3(position.x + uCenter.x, 0.0, position.y + uCenter.y);
        float dist = length(p.xz - cameraPosition.xz) + abs(cameraPosition.y) * 0.5;
        vec2 slope = vec2(0.0);
        vec3 d = swell(p.xz, dist, slope);
        p += d;
        vWorld = p; vSlope = slope; vH = d.y;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uOcean; uniform vec3 uDeep, uSSS; uniform vec4 uIsl[4]; uniform float uIslRot[4]; uniform float uDetail;
      #include <sea_waves>
      varying vec3 vWorld; varying vec2 vSlope; varying float vH;
      #include <fog_pars_fragment>
      ${DECK_GLSL}
      vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
      vec4 layer(vec2 p, float tile, float ang, float spd){
        vec2 q = rot(p, ang) / tile + vec2(uTime * spd / tile, 0.0);
        return texture2D(uOcean, q);
      }
      float cuCover(vec2 p){ return texture2D(uNoise, p / ${CU_SCALE.toFixed(1)}).r * 0.75 + texture2D(uNoise, p / ${CU_SCALE.toFixed(1)} * 3.1).b * 0.25; }
      void main(){
        vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 v = toCam / dist;
        float wa = atan(${WIND.y.toFixed(4)}, ${WIND.x.toFixed(4)});
        // detail slopes from three scales of the spectrum map, each drifting downwind at its own pace
        vec4 l1 = layer(vWorld.xz, 210.0, -wa, 2.4);
        vec4 l2 = layer(vWorld.xz, 63.0, -wa + 0.6, 1.4);
        vec4 l3 = layer(vWorld.xz, 17.0, -wa - 0.7, 0.75);
        vec2 s1 = rot((l1.rg * 2.0 - 1.0) * 3.5, wa), s2 = rot((l2.rg * 2.0 - 1.0) * 3.5, wa - 0.6), s3 = rot((l3.rg * 2.0 - 1.0) * 3.5, wa + 0.7);
        float far = smoothstep(150.0, 9000.0, dist);
        vec2 slope = vSlope + (s1 * 0.1 + s2 * 0.06 * (1.0 - far * 0.6) + s3 * 0.04 * (1.0 - far)) * uDetail;
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        float rough = mix(0.035, 0.2, far);
        float nv = max(dot(n, v), 0.001);
        float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
        fres = mix(fres, 0.02 + 0.98 * pow(1.0 - max(v.y, 0.0), 5.0), far * 0.7);
        vec3 r = reflect(-v, n); r.y = abs(r.y) + 0.002;
        vec3 refl = skyL(normalize(r));
        vec4 deck = cloudDeck(normalize(r), vWorld);
        refl = mix(refl, deck.rgb, deck.a * 0.45);
        // cumulus shadows: cover along the sun ray at cloud level
        vec2 sp = vWorld.xz + SKY_SUN.xz / max(SKY_SUN.y, 0.15) * ${(CU_BASE + 350).toFixed(1)};
        float cov = cuCover(sp);
        float shade = 1.0 - 0.55 * smoothstep(0.56, 0.68, cov);
        // sun glint: GGX
        vec3 h = normalize(v + SKY_SUN);
        float nh = max(dot(n, h), 0.0), nl = max(dot(n, SKY_SUN), 0.0);
        float a2 = rough * rough;
        float dd = nh * nh * (a2 - 1.0) + 1.0;
        float D = a2 / (3.14159 * dd * dd);
        float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(h, v), 0.0), 5.0);
        vec3 spec = SKY_SUNC * SKY_SUNE * 0.0011 * D * Fh * nl / (4.0 * nv + 0.1) * shade;
        // water body: deep blue, light scattered up through thin crests toward a viewer looking into the sun
        vec3 amb = skyL(vec3(0.0, 1.0, 0.0));
        float sunUp = max(SKY_SUN.y, 0.05);
        vec3 body = uDeep * (amb * 1.4 + SKY_SUNC * sunUp * 0.6 * shade);
        float back = pow(max(dot(-v, SKY_SUN) * 0.5 + 0.5, 0.0), 3.0);
        float crest = clamp(vH * 0.8 + 0.35 + (l1.a - 0.5) * 0.6, 0.0, 1.5);
        body += uSSS * (0.10 + 0.5 * back) * crest * SKY_SUNC * (0.3 + sunUp) * shade * (1.0 - far);
        // reef shallows: turquoise over sand, brightening toward the beach
        float sh = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 dp = rot(vWorld.xz - uIsl[i].xy, -uIslRot[i]);
          float e = length(dp / uIsl[i].zw);
          sh = max(sh, 1.0 - smoothstep(1.0, 1.9, e));
        }
        if (sh > 0.0) {
          vec3 shallow = mix(vec3(0.02, 0.22, 0.24), vec3(0.18, 0.5, 0.46), sh * sh) * (amb * 1.2 + SKY_SUNC * sunUp * 0.8 * shade);
          body = mix(body, shallow, sh);
        }
        vec3 col = mix(body, refl, fres) + spec;
        // whitecaps on the steepest, highest crests
        float foam = smoothstep(0.3, 0.9, l2.b * 0.8 + l1.b * 0.5) * smoothstep(0.25, 0.7, vH + l1.a * 0.4) * (1.0 - far) * 0.6;
        foam *= 0.55 + 0.45 * texture2D(uNoise, vWorld.xz / 21.0).a;
        col = mix(col, (SKY_SUNC * sunUp * 0.9 * shade + amb * 0.9), foam * 0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  {
    // polar grid around the camera: dense near, coarser with distance, out past the horizon
    const segs = hq ? 256 : 160, growth = hq ? 0.03 : 0.045;
    const radii = [0];
    let r = 0;
    while (r < 120000) { r += Math.max(hq ? 0.9 : 1.3, r * growth); radii.push(r); }
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let i = 1; i < radii.length; i++) for (let j = 0; j < segs; j++) {
      const a = j / segs * Math.PI * 2;
      pos.push(Math.cos(a) * radii[i], Math.sin(a) * radii[i], 0);
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + (j + 1) % segs);
    for (let i = 1; i < radii.length - 1; i++) for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    var water = new THREE.Mesh(geo, waterMat);
    water.frustumCulled = false;
    water.renderOrder = -5;
    scene.add(water);
  }

  /* ---------- cumulus ---------- */
  // four puff shapes in a 2x2 atlas: RGB = view-space surface normal of a heap of spheres with a flat base, A = density
  function puffAtlas() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2;
    const g = c.getContext('2d'), img = g.createImageData(S * 2, S * 2);
    for (let v = 0; v < 4; v++) {
      const balls = [];
      const nb = 14 + Math.floor(rnd() * 8);
      for (let i = 0; i < nb; i++) {
        const x = rr(-0.55, 0.55), up = 1 - Math.abs(x) / 0.7;
        balls.push([x, rr(-0.3, -0.05 + up * 0.55), rr(-0.2, 0.2), rr(0.18, 0.26 + up * 0.18)]);
      }
      const ox = (v & 1) * S, oy = (v >> 1) * S;
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const x = (px + 0.5) / S * 2 - 1, y = 1 - (py + 0.5) / S * 2;
        let best = -9, nx = 0, ny = 0, nz = 1, cover = 0;
        for (const [bx, by, bz, br] of balls) {
          const dx = x - bx, dy = y - by, d2 = dx * dx + dy * dy;
          if (d2 >= br * br) continue;
          const zz = Math.sqrt(br * br - d2), z = bz + zz;
          cover = Math.max(cover, 1 - Math.sqrt(d2) / br);
          if (z > best) { best = z; nx = dx / br; ny = dy / br; nz = zz / br; }
        }
        const base = smooth(-0.38, -0.3, y);                       // flat base
        const wisp = 0.75 + 0.5 * noise(px / 40 + v * 0.31, py / 40, 1);
        const a = clamp(smooth(0, 0.3, cover) * base * wisp, 0, 1);
        const k = ((oy + py) * S * 2 + ox + px) * 4;
        img.data[k] = (nx * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * 0.5 + 0.5) * 255; img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[k + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uAtlas: { value: null } }),
    fog: true, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aPuff; attribute vec4 aInfo;
      varying vec2 vUv; varying float vShade, vNear; varying vec3 vSunV, vWdir; varying float vVar;
      #include <fog_pars_vertex>
      void main(){
        vec4 mvPosition = viewMatrix * vec4(aPuff.xyz, 1.0);
        // camera-facing quad; mirrored and stretched sideways for variety, never rotated (the base stays flat)
        mvPosition.xy += vec2(position.x * (aInfo.z > 1.0 ? -1.0 : 1.0) * aInfo.w, position.y) * aPuff.w;
        vUv = uv * 0.5 + vec2(mod(aInfo.y, 2.0) * 0.5, 0.5 - floor(aInfo.y / 2.0) * 0.5);
        vShade = aInfo.x; vVar = aInfo.y;
        float dcam = -mvPosition.z;
        vNear = smoothstep(aPuff.w * 0.3, aPuff.w * 1.2, dcam);
        vSunV = normalize((viewMatrix * vec4(${`SUN_PLACEHOLDER`}, 0.0)).xyz);
        vWdir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uAtlas;
      varying vec2 vUv; varying float vShade, vNear; varying vec3 vSunV, vWdir; varying float vVar;
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(uAtlas, vUv);
        float a = t.a * vNear;
        if (a < 0.01) discard;
        vec3 n = t.rgb * 2.0 - 1.0; n = dot(n, n) > 1e-4 ? normalize(n) : vec3(0.0, 0.0, 1.0);
        float ndl = dot(n, vSunV);
        float diff = pow(clamp(ndl * 0.55 + 0.45, 0.0, 1.0), 1.5);
        float base = mix(0.5, 1.0, smoothstep(0.0, 0.7, vShade));
        vec3 skyTop = skyL(vec3(0.0, 1.0, 0.0));
        vec3 amb = mix(vec3(0.16, 0.2, 0.25) * skyTop * 2.4, skyTop * 1.25, n.y * 0.5 + 0.5);
        vec3 wd = normalize(vWdir);
        float fwd = pow(max(dot(wd, SKY_SUN), 0.0), 8.0);
        vec3 col = CLOUD_SUNC * SKY_SUNE * 0.0011 * (0.25 + 0.75 * SKY_SUN.y + 0.2) * diff * base + amb * base
                 + CLOUD_SUNC * SKY_SUNE * 0.0016 * fwd * (1.0 - t.a) ;
        gl_FragColor = vec4(min(col, vec3(60.0)), a * 0.96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  // the vertex shader needs the sun direction; the sky constants are in the fragment chunk only
  cloudMat.vertexShader = '#include <sea_sky_v>\n' + cloudMat.vertexShader.replace('SUN_PLACEHOLDER', 'SKY_SUN_V');
  const puffs = [];
  let cloudMesh = null, cloudGeo = null, aPuff = null, aInfo = null;
  function addCluster(cx, cz, W, Hc, baseY, sizeK = 1) {
    const n = Math.round(clamp(W / 150, 5, 22) * (hq ? 1 : 0.75));
    for (let i = 0; i < n; i++) {
      const level = Math.pow(rnd(), 1.4);                     // most puffs low, a few build the towers
      const spread = W * 0.5 * (1 - level * 0.55);
      const s = W * rr(0.32, 0.5) * (1 - level * 0.45) * sizeK;
      const y = baseY + 0.32 * s + level * Hc * 0.75;
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread;
      puffs.push({ x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d * 0.8, s, shade: clamp((y - baseY) / Math.max(Hc, 1), 0, 1), v: Math.floor(rnd() * 4), flip: rnd() < 0.5 ? 0 : 3.5, stretch: rr(1.0, 1.35) });
    }
    // a few wide flat puffs make the base
    for (let i = 0; i < 3; i++) {
      const s = W * rr(0.45, 0.6) * sizeK;
      puffs.push({ x: cx + rr(-0.3, 0.3) * W, y: baseY + 0.3 * s, z: cz + rr(-0.25, 0.25) * W, s, shade: 0, v: Math.floor(rnd() * 4), flip: rnd() < 0.5 ? 0 : 3.5, stretch: 1.6 });
    }
  }
  function buildClouds() {
    const span = 70000, step = hq ? 3000 : 3800;
    for (let x = -span; x <= span; x += step) for (let z = -span; z <= span; z += step) {
      const px = x + rr(-0.4, 0.4) * step, pz = z + rr(-0.4, 0.4) * step;
      const c = cuCover(px, pz);
      if (c < 0.58) continue;
      const W = lerp(700, 2400, smooth(0.58, 0.8, c)) * rr(0.8, 1.2);
      addCluster(px, pz, W, W * rr(0.5, 1.1), CU_BASE + rr(-60, 60));
    }
    // cumulonimbus on the horizon: towers into the upper troposphere with spreading anvils
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, d = rr(85000, 105000);
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d, W = rr(7000, 10000);
      addCluster(cx, cz, W, rr(9000, 12000), CU_BASE, 1.2);
      for (let k = 0; k < 6; k++) puffs.push({ x: cx + rr(-1, 1) * W * 0.9, y: CU_BASE + rr(10500, 12000), z: cz + rr(-0.6, 0.6) * W, s: W * rr(0.5, 0.8), shade: 1, v: Math.floor(rnd() * 4), flip: 0, stretch: 2.2 });
    }
    cloudMat.uniforms.uAtlas.value = puffAtlas();
    const N = puffs.length;
    cloudGeo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    cloudGeo.index = quad.index; cloudGeo.attributes.position = quad.attributes.position; cloudGeo.attributes.uv = quad.attributes.uv;
    aPuff = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    aInfo = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    cloudGeo.setAttribute('aPuff', aPuff); cloudGeo.setAttribute('aInfo', aInfo);
    cloudGeo.instanceCount = N;
    cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.frustumCulled = false; cloudMesh.renderOrder = 2;
    scene.add(cloudMesh);
    sortClouds(new THREE.Vector3(0, 30, 0));
  }
  const order = [];
  function sortClouds(cam) {
    if (!cloudMesh) return;
    const N = puffs.length;
    if (order.length !== N) { order.length = 0; for (let i = 0; i < N; i++) order.push(i); }
    for (const p of puffs) p.d = (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2;
    order.sort((a, b) => puffs[b].d - puffs[a].d);
    const P = aPuff.array, I = aInfo.array;
    for (let k = 0; k < N; k++) {
      const p = puffs[order[k]];
      P[k * 4] = p.x; P[k * 4 + 1] = p.y; P[k * 4 + 2] = p.z; P[k * 4 + 3] = p.s;
      I[k * 4] = p.shade; I[k * 4 + 1] = p.v; I[k * 4 + 2] = p.flip; I[k * 4 + 3] = p.stretch;
    }
    aPuff.needsUpdate = true; aInfo.needsUpdate = true;
  }

  /* ---------- wakes ---------- */
  const MAXV = 24000;
  const wakeGeo = new THREE.BufferGeometry();
  const wPos = new Float32Array(MAXV * 2), wAtt = new Float32Array(MAXV * 4), wIdx = new Uint32Array(MAXV * 3);
  const wPosA = new THREE.BufferAttribute(wPos, 2).setUsage(THREE.DynamicDrawUsage), wAttA = new THREE.BufferAttribute(wAtt, 4).setUsage(THREE.DynamicDrawUsage);
  const wIdxA = new THREE.BufferAttribute(wIdx, 1).setUsage(THREE.DynamicDrawUsage);
  wakeGeo.setAttribute('position', wPosA); wakeGeo.setAttribute('aW', wAttA); wakeGeo.setIndex(wIdxA);
  const wakeMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uWave, uWave2, uTime, uNoise: noiseTex }),
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: `#include <sea_waves>
      attribute vec4 aW; varying vec4 vW; varying vec2 vP;
      #include <fog_pars_vertex>
      void main(){
        vec2 sl = vec2(0.0);
        float dist = length(position.xy - cameraPosition.xz) + abs(cameraPosition.y) * 0.5;
        vec3 d = swell(position.xy, dist, sl);
        vec3 p = vec3(position.x, 0.25, position.y) + d;
        vW = aW; vP = position.xy;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uNoise; uniform float uTime;
      varying vec4 vW; varying vec2 vP;
      #include <fog_pars_fragment>
      void main(){
        // vW: x = across (-1..1), y = along-track metres, z = strength, w = kind (0 centre wake, 1 Kelvin arm)
        float across = 1.0 - vW.x * vW.x;
        float cells = texture2D(uNoise, vP / 19.0 + vec2(vW.y * 0.0, 0.0)).g;
        float streak = texture2D(uNoise, vec2(vW.x * 0.35, vW.y / 160.0)).b;
        float fine = texture2D(uNoise, vP / 6.0).a;
        float f;
        if (vW.w < 0.5) f = across * (0.45 + 0.75 * cells * streak + 0.3 * fine) * vW.z;
        else f = pow(across, 2.0) * (0.5 + 0.8 * fine * cells) * vW.z;
        f = clamp(f, 0.0, 1.0);
        vec3 amb = skyL(vec3(0.0, 1.0, 0.0));
        vec3 foam = SKY_SUNC * max(SKY_SUN.y, 0.08) * 0.95 + amb;
        vec3 aerated = vec3(0.05, 0.22, 0.24) * (amb * 1.3 + SKY_SUNC * 0.4);
        float white = smoothstep(0.25, 0.75, f);
        vec3 col = mix(aerated, foam, white);
        gl_FragColor = vec4(col, clamp(f * 1.25, 0.0, 0.95));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat);
  wakeMesh.frustumCulled = false; wakeMesh.renderOrder = -4;
  scene.add(wakeMesh);
  const trails = new Map();
  // called each frame per ship: position, unit heading vector, speed (m/s), length and beam
  function wakeTrack(key, x, z, fx, fz, speed, L, B) {
    let tr = trails.get(key);
    if (!tr) { tr = { pts: [], live: null }; trails.set(key, tr); }
    const sx = x - fx * L * 0.46, sz = z - fz * L * 0.46;               // stern
    tr.live = { x: sx, z: sz, fx, fz, t: tNow, v: speed, L, B, seen: tNow };
    const last = tr.pts[tr.pts.length - 1];
    if (!last || Math.hypot(sx - last.x, sz - last.z) > 7 || tNow - last.t > 2) tr.pts.push({ x: sx, z: sz, fx, fz, t: tNow, v: speed, L, B });
    while (tr.pts.length && (tNow - tr.pts[0].t > 160 || tr.pts.length > 260)) tr.pts.shift();
  }
  function wakeBuild(cam) {
    let nv = 0, ni = 0;
    const quadStrip = (pts, kind) => {
      // pts: [{x,z,px,pz,s}] with perpendicular p; emits a strip of quads
      const start = nv;
      for (const q of pts) {
        if (nv + 2 >= MAXV) break;
        const ox = q.px * q.off, oz = q.pz * q.off;
        for (const sd of [-1, 1]) {
          wPos[nv * 2] = q.x + ox + sd * q.px * q.half; wPos[nv * 2 + 1] = q.z + oz + sd * q.pz * q.half;
          const k = nv * 4; wAtt[k] = sd; wAtt[k + 1] = q.s; wAtt[k + 2] = q.str; wAtt[k + 3] = kind; nv++;
        }
      }
      for (let i = start; i + 3 < nv; i += 2) {
        if (ni + 6 > wIdx.length) break;
        wIdx[ni++] = i; wIdx[ni++] = i + 2; wIdx[ni++] = i + 1; wIdx[ni++] = i + 1; wIdx[ni++] = i + 2; wIdx[ni++] = i + 3;
      }
    };
    for (const [key, tr] of trails) {
      if (!tr.live || tNow - tr.live.seen > 0.5) { if (!tr.pts.length || tNow - tr.pts[tr.pts.length - 1].t > 160) trails.delete(key); }
      const all = tr.pts.slice();
      if (tr.live && tNow - tr.live.seen < 0.5) all.push(tr.live);
      if (all.length < 2) continue;
      const lx = all[all.length - 1].x, lz = all[all.length - 1].z;
      if ((lx - cam.x) ** 2 + (lz - cam.z) ** 2 > 30000 * 30000) continue;
      // walk from the stern backward along the track
      const centre = [], armL = [], armR = [];
      let s = 0;
      for (let i = all.length - 1; i >= 0; i--) {
        const p = all[i];
        if (i < all.length - 1) s += Math.hypot(all[i + 1].x - p.x, all[i + 1].z - p.z);
        const age = tNow - p.t, sp = clamp(p.v / 12, 0, 1.3);
        if (sp < 0.05) continue;
        const px = -p.fz, pz = p.fx;
        centre.push({ x: p.x, z: p.z, px, pz, off: 0, half: p.B * 0.42 + s * 0.045 + age * 0.05, s, str: sp * Math.exp(-age / 75) * (1.1 - smooth(0, 40, s) * 0.25) });
        const sb = s + p.L * 0.92;                                       // distance behind the bow
        if (sb < 900) {
          const fade = sp * (1 - smooth(120, 900, sb)) * 0.85;
          const half = 2 + sb * 0.022, off = p.B * 0.5 + sb * 0.354 - p.L * 0.92 * 0.354 * 0.6;
          armL.push({ x: p.x, z: p.z, px, pz, off: -off, half, s: sb, str: fade });
          armR.push({ x: p.x, z: p.z, px, pz, off, half, s: sb, str: fade });
        }
      }
      // the bow wave: arms start at the bow and run past the hull
      const live = all[all.length - 1];
      if (live.v > 1.5) {
        const px = -live.fz, pz = live.fx, sp = clamp(live.v / 12, 0, 1.3) * 0.9;
        for (const [arr, sg] of [[armL, -1], [armR, 1]]) {
          const lead = [];
          for (let k = 0; k <= 4; k++) {
            const back = k / 4 * live.L * 0.92;
            lead.push({ x: live.x + live.fx * (live.L * 0.92 - back), z: live.z + live.fz * (live.L * 0.92 - back), px, pz,
              off: sg * (live.B * 0.12 + back * 0.354 * 0.4 + live.B * 0.38 * Math.min(1, k / 2)), half: 1.5 + back * 0.02, s: back, str: sp });
          }
          arr.unshift(...lead);
        }
      }
      quadStrip(centre, 0);
      quadStrip(armL, 1);
      quadStrip(armR, 1);
    }
    wakeGeo.setDrawRange(0, ni);
    wPosA.needsUpdate = true; wAttA.needsUpdate = true; wIdxA.needsUpdate = true;
    wPosA.clearUpdateRanges(); wPosA.addUpdateRange(0, nv * 2);
    wAttA.clearUpdateRanges(); wAttA.addUpdateRange(0, nv * 4);
    wIdxA.clearUpdateRanges(); wIdxA.addUpdateRange(0, ni);
  }

  /* ---------- particle textures (smoke puffs, glows) ---------- */
  function puffTexture(size, blobs, soft) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    for (let i = 0; i < blobs; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * size * 0.22;
      const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d * 0.8, r = size * rr(0.14, 0.3);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${soft})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, size, size);
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const smokeTex = puffTexture(64, 12, 0.5), glowTex = glowTexture();

  /* ---------- sun flare ---------- */
  let flare = null;
  if (Lensflare) {
    const tex = (size, stops) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr; g.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    };
    const t0 = tex(256, [[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,250,235,0.9)'], [0.3, 'rgba(255,230,190,0.18)'], [1, 'rgba(255,220,180,0)']]);
    const t1 = tex(64, [[0, 'rgba(255,255,255,0.08)'], [0.7, 'rgba(200,220,255,0.05)'], [0.85, 'rgba(160,200,255,0.09)'], [1, 'rgba(160,200,255,0)']]);
    flare = new Lensflare();
    flare.addElement(new LensflareElement(t0, 420, 0, new THREE.Color(1, 0.97, 0.9)));
    flare.addElement(new LensflareElement(t1, 40, 0.45));
    flare.addElement(new LensflareElement(t1, 60, 0.7));
    flare.addElement(new LensflareElement(t1, 90, 0.95));
    scene.add(flare);
  }

  /* ---------- time of day ---------- */
  let curT = null;
  function setTime(name) {
    const T = curT = TIMES[name] || TIMES.noon;
    SUN.setFromSphericalCoords(1, (90 - T.elev) * Math.PI / 180, T.az * Math.PI / 180);
    skyVersion++;
    THREE.ShaderChunk.sea_sky = skyConsts(T);
    THREE.ShaderChunk.sea_sky_v = `const vec3 SKY_SUN_V = vec3(${SUN.x.toFixed(6)}, ${SUN.y.toFixed(6)}, ${SUN.z.toFixed(6)});`;
    renderer.toneMappingExposure = T.exposure;
    hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiI;
    sunLight.color.set(T.sun); sunLight.intensity = T.sunI;
    waterMat.uniforms.uDeep.value.set(T.deep); waterMat.uniforms.uSSS.value.set(T.sss);
    scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    for (const m of [envSky.material, envSea.material]) m.needsUpdate = true;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.015);
    scene.environment = envRT.texture;
  }
  setTime(time);
  // the environment map waits for the noise texture (the cloud deck shows in reflections)
  ready.then(() => { if (envRT) envRT.dispose(); envSky.material.needsUpdate = true; envRT = pmrem.fromScene(envScene, 0.015); scene.environment = envRT.texture; });

  let sortT = 0;
  const tmp = new THREE.Vector3();
  return {
    TIMES, SUN, FOG_D, fogColor, sunLight, water, waterMat, ready, smokeTex, glowTex, setTime, waveHeight, wakeTrack,
    // camera follow: sky, ocean grid (snapped so near vertices do not swim), flare, cloud order
    follow(p, dt = 0.016) {
      sky.position.copy(p);
      const sn = hq ? 2 : 3;
      waterUniforms.uCenter.value.set(Math.round(p.x / sn) * sn, Math.round(p.z / sn) * sn);
      if (flare) flare.position.copy(tmp.copy(SUN).multiplyScalar(90000).add(p));
      sortT -= dt;
      if (sortT <= 0) { sortT = 0.25; sortClouds(p); }
      wakeBuild(p);
    },
    update(t) { tNow = t; uTime.value = t; }
  };
}
