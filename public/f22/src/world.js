/* World: sky and time of day, island terrain, ocean, clouds, forests, towns, the airbase and SAM sites.
   createWorld() returns handles the game updates each frame. Expects THREE, Sky, terrainH, vnoise, AIRBASE, F22 in scope. */
function createWorld({ scene, renderer, hq, time }) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let seed = 1234567;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rr = (a, b) => a + rnd() * (b - a);

  const TIMES = {
    dawn: { label: '清晨', elev: 7, az: 95, fog: 0xc8bcb6, exposure: 0.6, turbidity: 6.5, rayleigh: 2.3, sun: 0xffc596, sunI: 2.7,
      hemiSky: 0xb4c4de, hemiGround: 0x3d3f3a, hemiI: 0.85, deep: 0x123548, skyRefl: 0x7f9fc4, cloudTop: 0xffd8bf, cloudBottom: 0x8a8a9c, lights: 1 },
    noon: { label: '正午', elev: 58, az: 160, fog: 0xb6c8d8, exposure: 0.42, turbidity: 2.6, rayleigh: 0.9, sun: 0xfff6ea, sunI: 3.3,
      hemiSky: 0xc8daf0, hemiGround: 0x4a5444, hemiI: 1.15, deep: 0x0a3a54, skyRefl: 0x5f93cf, cloudTop: 0xffffff, cloudBottom: 0xa2abba, lights: 0.25 },
    dusk: { label: '黄昏', elev: 12, az: 205, fog: 0xb3bfc9, exposure: 0.62, turbidity: 5.5, rayleigh: 1.5, sun: 0xffe2c0, sunI: 3.2,
      hemiSky: 0xc4d6ee, hemiGround: 0x3c4a44, hemiI: 1.0, deep: 0x0b3446, skyRefl: 0x6e9ccc, cloudTop: 0xfff2e2, cloudBottom: 0x8d98a8, lights: 0.8 }
  };
  const SUN = new THREE.Vector3();
  const FOG_D = 0.000048;
  const fogColor = new THREE.Color();
  scene.fog = new THREE.FogExp2(fogColor, FOG_D);

  /* ---------- sky, lights, environment ---------- */
  function makeSky(scale) { const s = new Sky(); s.scale.setScalar(scale); return s; }
  const sky = makeSky(30000);
  scene.add(sky);
  const envScene = new THREE.Scene(), envSky = makeSky(100);
  envScene.add(envSky);
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x24404f, side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 200 });
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  scene.add(hemi, sunLight, sunLight.target);

  /* ---------- terrain ---------- */
  const TSIZE = 22000;
  {
    const seg = hq ? 260 : 180;
    const geo = new THREE.PlaneGeometry(TSIZE, TSIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3);
    const lin = c => Math.pow(c, 2.2);
    const C = {
      sand: [0.8, 0.74, 0.58], grass: [0.3, 0.38, 0.2], forest: [0.15, 0.24, 0.12], dry: [0.5, 0.46, 0.3], field: [0.46, 0.48, 0.26],
      rock: [0.48, 0.45, 0.41], dark: [0.31, 0.3, 0.29], snow: [0.95, 0.96, 0.98], seabed: [0.42, 0.47, 0.42], base: [0.36, 0.42, 0.26]
    };
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nrm.getY(i);
      const n = vnoise(x / 260, z / 260) * 0.5 + 0.5, n2 = vnoise(x / 70, z / 70) * 0.5 + 0.5, n3 = vnoise(x / 1400, z / 1400) * 0.5 + 0.5;
      let c = mix(C.grass, C.forest, smooth(0.35, 0.7, n));
      c = mix(c, C.dry, smooth(0.6, 0.9, n2) * 0.5);
      c = mix(c, C.field, smooth(0.55, 0.8, n3) * smooth(80, 20, h) * 0.8);          // farmland on the coastal flats
      c = mix(C.sand, c, smooth(4, 22, h));
      c = mix(c, mix(C.rock, C.dark, n2), Math.max(smooth(0.86, 0.7, ny), smooth(700, 1100, h + n * 200)));
      c = mix(c, C.snow, smooth(1150, 1350, h + n * 160) * smooth(0.55, 0.75, ny));
      const inBase = Math.max(Math.abs(x - AIRBASE.x) - AIRBASE.len / 2, Math.abs(z - AIRBASE.z) - AIRBASE.wid / 2);
      c = mix(c, C.base, smooth(150, 0, inBase));
      if (h < 0) c = mix(C.sand, C.seabed, smooth(0, -40, h));
      col[i * 3] = lin(c[0]); col[i * 3 + 1] = lin(c[1]); col[i * 3 + 2] = lin(c[2]);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dc = document.createElement('canvas'); dc.width = dc.height = 256;
    const g = dc.getContext('2d'), img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = 200 + 55 * (0.6 * (vnoise(x / 8, y / 8) * 0.5 + 0.5) + 0.4 * (vnoise(x / 2.3 + 50, y / 2.3) * 0.5 + 0.5));
      const k = (y * 256 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const detail = new THREE.CanvasTexture(dc);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(TSIZE / 90, TSIZE / 90);
    detail.colorSpace = THREE.SRGBColorSpace;
    detail.anisotropy = 4;
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 })));
  }

  /* ---------- ocean ---------- */
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSun: { value: SUN }, uFogColor: { value: fogColor }, uFogDensity: { value: FOG_D },
      uDeep: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uHorizon: { value: fogColor }
    },
    vertexShader: `varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uFogDensity; uniform vec3 uSun, uFogColor, uDeep, uSky, uHorizon; varying vec3 vWorld;
      vec2 wave(vec2 p, vec2 d, float k, float a, float s){ return d * (a * k * cos(dot(p, d) * k + uTime * s)); }
      void main(){
        vec2 p = vWorld.xz;
        vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.021, 1.3, 1.1)
               + wave(p, normalize(vec2(-0.4, 1.0)), 0.037, 0.6, 1.5)
               + wave(p, normalize(vec2(0.7, -0.8)), 0.093, 0.2, 2.3)
               + wave(p, normalize(vec2(-0.9, -0.2)), 0.21, 0.07, 3.1)
               + wave(p, normalize(vec2(0.2, 0.9)), 0.53, 0.022, 4.0);
        vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 v = toCam / dist;
        vec3 n = normalize(mix(normalize(vec3(-g.x, 1.0, -g.y)), vec3(0.0, 1.0, 0.0), smoothstep(1500.0, 14000.0, dist)));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 skyc = mix(uHorizon, uSky, smoothstep(0.0, 0.45, r.y));
        float sd = max(dot(r, uSun), 0.0);
        vec3 col = mix(uDeep, skyc, fres) + vec3(1.0, 0.86, 0.62) * (pow(sd, 900.0) * 40.0 + pow(sd, 90.0) * 0.6);
        float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
        gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), waterMat);
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  /* ---------- sprite textures ---------- */
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
  const cloudTex = puffTexture(256, 34, 0.32), smokeTex = puffTexture(64, 12, 0.5), glowTex = glowTexture();

  /* ---------- clouds: one instanced billboard draw ---------- */
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: cloudTex }, uFogColor: { value: fogColor }, uFogDensity: { value: FOG_D },
      uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() } },
    vertexShader: `varying vec2 vUv; varying float vDist, vShade;
      void main(){
        vUv = uv;
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        c.xy += position.xy * s * vec2(1.0, 0.62);
        vDist = -c.z; vShade = position.y + 0.5;
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uFogColor, uTop, uBottom; uniform float uFogDensity;
      varying vec2 vUv; varying float vDist, vShade;
      void main(){
        vec4 t = texture2D(map, vUv);
        vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.85, vShade));
        float f = 1.0 - exp(-pow(uFogDensity * vDist, 2.0));
        float a = t.a * 0.9 * smoothstep(60.0, 420.0, vDist) * (1.0 - f * 0.5);
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(col, uFogColor, f), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false
  });
  {
    const clusters = hq ? 80 : 46, per = 7;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), cloudMat, clusters * per);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let k = 0;
    for (let c = 0; c < clusters; c++) {
      const cx = rr(-12000, 12000), cz = rr(-12000, 12000), cy = rr(1900, 3000), r = rr(250, 600);
      for (let i = 0; i < per; i++) {
        p.set(cx + rr(-r, r), cy + rr(-r, r) * 0.22, cz + rr(-r, r));
        const sc = rr(380, 820); s.set(sc, sc, sc);
        mesh.setMatrixAt(k++, m.compose(p, q, s));
      }
    }
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
  }

  /* ---------- scatter helpers ---------- */
  const baseDist = (x, z, pad = 0) => Math.max(Math.abs(x - AIRBASE.x) - AIRBASE.len / 2 - pad, Math.abs(z - AIRBASE.z) - AIRBASE.wid / 2 - pad);
  const slopeAt = (x, z, h) => Math.abs(terrainH(x + 25, z) - h) + Math.abs(terrainH(x, z + 25) - h);

  /* ---------- towns on the coastal flats ---------- */
  const towns = [];
  {
    const cands = [];
    for (let x = -9500; x <= 9500; x += 450) for (let z = -9500; z <= 9500; z += 450) {
      const h = terrainH(x, z);
      if (h < 6 || h > 45 || baseDist(x, z, 600) < 0) continue;
      if (terrainH(x + 700, z) > 0 && terrainH(x - 700, z) > 0 && terrainH(x, z + 700) > 0 && terrainH(x, z - 700) > 0) continue; // keep them coastal
      if (slopeAt(x, z, h) > 6) continue;
      cands.push([x, z]);
    }
    cands.sort(() => rnd() - 0.5);
    for (const c of cands) {
      if (towns.length >= 5) break;
      if (towns.every(t => Math.hypot(t[0] - c[0], t[1] - c[1]) > 2600)) towns.push(c);
    }
    const per = hq ? 260 : 150, total = towns.length * per;
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }), Math.max(total, 1));
    const roofGeo = new THREE.ConeGeometry(0.75, 0.5, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.25, 0);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(total, 1));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    const walls = [0xe9e4d8, 0xd9d2c3, 0xc9c2b4, 0xf2efe8, 0xb9b4aa, 0xd8c9b0], roofCols = [0xa2523a, 0x8e4a36, 0x5d5f63, 0xb46a46, 0x6b4d3c];
    let n = 0, nr = 0;
    for (const [cx, cz] of towns) {
      const ang = rnd() * Math.PI;
      for (let i = 0; i < per; i++) {
        const r = Math.pow(rnd(), 0.7) * 520, a = rnd() * Math.PI * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, h = terrainH(x, z);
        if (h < 2.5 || h > 90 || slopeAt(x, z, h) > 9) continue;
        const core = 1 - r / 520, tall = rnd() < core * core * 0.35;
        const w = rr(8, 18), d = rr(8, 16), ht = tall ? rr(22, 55) : rr(5, 11);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang + (rnd() < 0.5 ? 0 : Math.PI / 2));
        mesh.setMatrixAt(n, m.compose(p.set(x, h - 1, z), q, s.set(w, ht + 1, d)));
        mesh.setColorAt(n++, col.set(walls[Math.floor(rnd() * walls.length)]));
        if (!tall) {
          roofs.setMatrixAt(nr, m.compose(p.set(x, h + ht, z), q, s.set(w * 1.05, rr(3, 5), d * 1.05)));
          roofs.setColorAt(nr++, col.set(roofCols[Math.floor(rnd() * roofCols.length)]));
        }
      }
    }
    mesh.count = n; roofs.count = nr;
    scene.add(mesh, roofs);
  }

  /* ---------- forests ---------- */
  {
    const count = hq ? 9000 : 3800;
    const geo = new THREE.ConeGeometry(1, 1, 6); geo.translate(0, 0.5, 0);
    const trees = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    let n = 0, tries = 0;
    while (n < count && tries < count * 6) {
      tries++;
      const x = rr(-10500, 10500), z = rr(-10500, 10500);
      if (vnoise(x / 900, z / 900) < -0.05) continue;
      const h = terrainH(x, z);
      if (h < 14 || h > 950 || baseDist(x, z, 150) < 0) continue;
      if (towns.some(t => Math.hypot(t[0] - x, t[1] - z) < 600)) continue;
      if (slopeAt(x, z, h) > 22) continue;
      // trees grow in small stands around each accepted point
      for (let j = 0; j < 4 && n < count; j++) {
        const tx = x + rr(-40, 40), tz = z + rr(-40, 40), th = terrainH(tx, tz), sz = rr(7, 16);
        trees.setMatrixAt(n, m.compose(p.set(tx, th - 1, tz), q, s.set(sz * 0.38, sz, sz * 0.38)));
        trees.setColorAt(n++, col.setRGB(rr(0.12, 0.2), rr(0.22, 0.32), rr(0.1, 0.15)));
      }
    }
    trees.count = n;
    scene.add(trees);
  }

  /* ---------- airbase ---------- */
  const base = { x: AIRBASE.x, z: AIRBASE.z, y: AIRBASE.y, hp: 100, pos: new THREE.Vector3(AIRBASE.x, AIRBASE.y, AIRBASE.z) };
  const lightPts = [], lightCols = [];
  {
    const Y = AIRBASE.y, X = AIRBASE.x, Z = AIRBASE.z;
    const flat = (w, d, x, z, mat, y = Y + 0.06) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
      scene.add(m); return m;
    };
    const paint = (w, h, draw) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return t;
    };
    const asphalt = (g, w, h, base) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < w * h / 30; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    };
    const offset = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.92 };
    // runway 3000 x 60 m, runway 09/27
    const rwTex = paint(2048, 64, (g, w, h) => {
      asphalt(g, w, h, '#3a3c3f');
      g.fillStyle = 'rgba(20,20,20,0.35)';
      for (const x0 of [120, w - 260]) for (let i = 0; i < 40; i++) g.fillRect(x0 + rnd() * 140, 20 + rnd() * 24, rr(20, 60), 2);
      g.fillStyle = '#e9e9e4';
      g.fillRect(0, 2, w, 2); g.fillRect(0, h - 4, w, 2);
      for (let x = 70; x < w - 70; x += 41) g.fillRect(x, h / 2 - 1, 20, 2);
      for (const end of [0, 1]) {
        for (let i = 0; i < 8; i++) { const y = 6 + i * 7 + (i >= 4 ? 4 : 0); g.fillRect(end ? w - 26 : 6, y, 20, 4); }
        for (const dx of [70, 140, 200]) for (const y of [16, h - 20]) g.fillRect(end ? w - dx - 14 : dx, y, 14, 4);
        g.save(); g.translate(end ? w - 46 : 46, h / 2); g.rotate(end ? -Math.PI / 2 : Math.PI / 2);
        g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(end ? '27' : '09', 0, 0);
        g.restore();
      }
    });
    flat(3000, 60, X, Z, new THREE.MeshStandardMaterial(Object.assign({ map: rwTex }, offset)));
    const twTex = paint(1024, 16, (g, w, h) => { asphalt(g, w, h, '#45474a'); g.fillStyle = '#d8b437'; g.fillRect(0, h / 2 - 1, w, 2); });
    flat(2700, 23, X, Z + 170, new THREE.MeshStandardMaterial(Object.assign({ map: twTex }, offset)));
    const conMat = new THREE.MeshStandardMaterial(Object.assign({ color: 0x4a4c4f }, offset));
    for (const dx of [-1300, -400, 500, 1300]) flat(23, 160, X + dx, Z + 90, conMat, Y + 0.05);
    const apTex = paint(512, 160, (g, w, h) => {
      asphalt(g, w, h, '#8d8e8a');
      g.strokeStyle = 'rgba(40,40,40,0.25)'; g.lineWidth = 1;
      for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = '#d8b437'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(90 + i * 70, h); g.lineTo(90 + i * 70, 40); g.stroke(); }
    });
    flat(720, 220, X + 250, Z + 300, new THREE.MeshStandardMaterial(Object.assign({ map: apTex }, offset)), Y + 0.07);

    const concrete = new THREE.MeshStandardMaterial({ color: 0x8f9188, roughness: 0.9 });
    const darkGlass = new THREE.MeshStandardMaterial({ color: 0x1d2a33, metalness: 0.6, roughness: 0.15 });
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
    // hardened aircraft shelters
    const has = new THREE.CylinderGeometry(15, 15, 40, 18, 1, false, 0, Math.PI); has.rotateZ(Math.PI / 2); has.rotateY(Math.PI / 2);
    for (let i = 0; i < 6; i++) add(has, concrete, X - 260 + i * 46, Y, Z + 440 - 20);
    // control tower, operations block, fuel farm, radar dome
    add(new THREE.BoxGeometry(9, 26, 9), concrete, X - 560, Y + 13, Z + 330);
    add(new THREE.CylinderGeometry(8, 7, 5, 8), darkGlass, X - 560, Y + 28.5, Z + 330);
    add(new THREE.CylinderGeometry(8.6, 8.6, 1, 8), concrete, X - 560, Y + 31.5, Z + 330);
    add(new THREE.BoxGeometry(80, 9, 24), new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.9 }), X - 640, Y + 4.5, Z + 400);
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(9, 9, 11, 20), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 }), X + 900 + (i % 2) * 26, Y + 5.5, Z + 380 + Math.floor(i / 2) * 26);
    add(new THREE.SphereGeometry(10, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }), X - 760, Y + 7, Z + 330);
    // parked Raptors on the apron, noses toward the runway
    const parked = F22.bake(F22.build({ physical: false, detail: 0.5, cockpit: false, bay: false, lights: false, plumes: false, shadows: false, anisotropy: 4 }));
    for (let i = 0; i < 4; i++) { const p = parked.clone(); p.position.set(X + 100 + i * 48, Y - F22.GROUND, Z + 320); p.rotation.y = Math.PI / 2; scene.add(p); }
    // runway edge, threshold and approach lights
    for (let x = -1500; x <= 1500; x += 60) for (const dz of [-31, 31]) { lightPts.push(X + x, Y + 0.6, Z + dz); lightCols.push(1, 0.92, 0.75); }
    for (let dz = -30; dz <= 30; dz += 5) { lightPts.push(X - 1500, Y + 0.6, Z + dz, X + 1500, Y + 0.6, Z + dz); lightCols.push(0.3, 1, 0.45, 1, 0.25, 0.2); }
    for (let i = 1; i <= 10; i++) for (const dz of [-6, 0, 6]) { lightPts.push(X - 1500 - i * 30, Y + 0.8, Z + dz); lightCols.push(1, 1, 0.9); }
    for (let x = -1300; x <= 1300; x += 50) { lightPts.push(X + x, Y + 0.5, Z + 182); lightCols.push(0.3, 0.55, 1); }
  }
  const lightsMat = new THREE.PointsMaterial({ size: 5, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(lightCols, 3));
    scene.add(new THREE.Points(g, lightsMat));
  }

  /* ---------- SAM sites on island high ground ---------- */
  const sams = [];
  {
    const cands = [];
    for (let x = -9000; x <= 9000; x += 500) for (let z = -9000; z <= 9000; z += 500) {
      const h = terrainH(x, z);
      if (h < 60 || h > 520 || baseDist(x, z) < 3500 || slopeAt(x, z, h) > 12) continue;
      cands.push([x, z, h]);
    }
    cands.sort(() => rnd() - 0.5);
    const olive = new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.85 });
    const tube = new THREE.MeshStandardMaterial({ color: 0x5d6648, roughness: 0.7, metalness: 0.2 });
    const sand = new THREE.MeshStandardMaterial({ color: 0x8b7d5c, roughness: 1 });
    for (const [x, z, h] of cands) {
      if (sams.length >= 4) break;
      if (!sams.every(s => Math.hypot(s.pos.x - x, s.pos.z - z) > 4500)) continue;
      const g = new THREE.Group();
      g.position.set(x, h, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 1.6, 6, 28), sand); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; g.add(ring);
      for (const [lx, lz, ry] of [[-7, -5, 0.4], [7, -4, -0.6]]) {
        const l = new THREE.Group(); l.position.set(lx, 0, lz); l.rotation.y = ry;
        const truck = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 2.8), olive); truck.position.y = 1.5; l.add(truck);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.8), olive); cab.position.set(5.4, 1.6, 0); l.add(cab);
        const rack = new THREE.Group(); rack.position.set(-1, 3, 0); rack.rotation.z = 0.8;
        for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7, 10), tube); t.rotation.z = Math.PI / 2; t.position.set(0, (i >> 1) * 0.9 - 0.45, (i & 1) * 0.9 - 0.45); rack.add(t); }
        l.add(rack); g.add(l);
      }
      const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.6), olive); radar.position.set(0, 1.3, 9); g.add(radar);
      const dish = new THREE.Group(); dish.position.set(0, 4.4, 9);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 4.2), tube); plate.rotation.z = 0.3; dish.add(plate);
      g.add(dish);
      scene.add(g);
      sams.push({ kind: 'sam', name: 'SAM 阵地', pos: new THREE.Vector3(x, h + 4, z), vel: new THREE.Vector3(), group: g, dish,
        hp: 160, maxHp: 160, alive: true, dying: false, radius: 16, cd: rr(4, 10), lockT: 0, active: false });
    }
  }

  /* ---------- time of day ---------- */
  function setTime(name) {
    const T = TIMES[name] || TIMES.dusk;
    SUN.setFromSphericalCoords(1, (90 - T.elev) * Math.PI / 180, T.az * Math.PI / 180);
    for (const s of [sky, envSky]) {
      const u = s.material.uniforms;
      u.turbidity.value = T.turbidity; u.rayleigh.value = T.rayleigh; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
      u.sunPosition.value.copy(SUN);
    }
    fogColor.set(T.fog);
    renderer.toneMappingExposure = T.exposure;
    hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiI;
    sunLight.color.set(T.sun); sunLight.intensity = T.sunI;
    waterMat.uniforms.uDeep.value.set(T.deep); waterMat.uniforms.uSky.value.set(T.skyRefl);
    cloudMat.uniforms.uTop.value.set(T.cloudTop); cloudMat.uniforms.uBottom.value.set(T.cloudBottom);
    lightsMat.opacity = T.lights;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
  }
  setTime(time);

  return {
    TIMES, SUN, FOG_D, fogColor, sunLight, water, waterMat, smokeTex, glowTex, base, sams, towns, setTime,
    update(t) { waterMat.uniforms.uTime.value = t; for (const s of sams) if (s.alive) s.dish.rotation.y = t * (s.active ? 2.4 : 0.6); }
  };
}
