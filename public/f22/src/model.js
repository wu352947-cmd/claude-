/* F-22A procedural model, shared by the viewer and the game.
   Units: metres. Frame: +x nose, +y up, +z right wing. Origin near mid-fuselage.
   Expects THREE and mergeGeometries in scope. */
const F22 = (() => {
  const S = 0.125;                        // skin texture tile = 8 m
  const D2R = Math.PI / 180;
  const GROUND = -2.46;                   // fin tip stands 5.08 m above this with gear down
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // 1-D cubic Hermite through [x, value] keys
  function curve(keys) {
    const k = [...keys].sort((a, b) => a[0] - b[0]), n = k.length;
    return x => {
      if (x <= k[0][0]) return k[0][1];
      if (x >= k[n - 1][0]) return k[n - 1][1];
      let i = 0;
      while (x > k[i + 1][0]) i++;
      const p0 = k[Math.max(i - 1, 0)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(i + 2, n - 1)];
      const h = p2[0] - p1[0], t = (x - p1[0]) / h;
      const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h;
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };
  }

  function gridGeometry(rings, uvFn) {
    const nR = rings.length, nP = rings[0].length;
    const pos = new Float32Array(nR * nP * 3), uv = new Float32Array(nR * nP * 2);
    for (let i = 0; i < nR; i++) {
      let arc = 0;
      for (let j = 0; j < nP; j++) {
        const p = rings[i][j];
        if (j > 0) { const q = rings[i][j - 1]; arc += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
        const k = i * nP + j;
        pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
        const t = uvFn ? uvFn(p, arc) : [p[0] * S, arc * S];
        uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1];
      }
    }
    const idx = [];
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < nP - 1; j++) {
      const a = i * nP + j, b = a + nP;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function capGeometry(loop, proj) {
    const c2 = loop.map(p => new THREE.Vector2(...proj(p)));
    const tris = THREE.ShapeUtils.triangulateShape(c2, []);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(loop.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(c2.flatMap(v => [v.x * S, v.y * S]), 2));
    g.setIndex(tris.flat());
    g.computeVertexNormals();
    return g;
  }
  const mirror = rings => rings.map(r => r.map(p => [p[0], p[1], -p[2]]));

  /* ---------- fuselage tables ---------- */
  const W = curve([[9.45, 0], [9.2, 0.12], [8.6, 0.26], [8.0, 0.37], [7.0, 0.53], [6.0, 0.68], [5.0, 0.83], [4.2, 0.97],
    [3.4, 1.15], [2.6, 1.36], [1.8, 1.55], [1.0, 1.66], [0, 1.7], [-2, 1.7], [-4, 1.66], [-5.5, 1.6], [-7, 1.52],
    [-8, 1.45], [-8.6, 1.38], [-9.0, 1.3]]);
  const WL = curve([[9.45, 0], [9.2, 0.1], [8.6, 0.22], [8.0, 0.31], [7.0, 0.45], [6.0, 0.57], [5.0, 0.66], [4.0, 0.7],
    [3.0, 0.7], [1.0, 0.72], [0, 0.85], [-1, 1.15], [-2.5, 1.45], [-4, 1.5], [-6, 1.42], [-7.5, 1.3], [-8.6, 1.2], [-9, 1.12]]);
  const TOP = curve([[9.45, -0.08], [9.0, 0.08], [8.0, 0.3], [7.0, 0.48], [6.0, 0.62], [5.0, 0.72], [4.0, 0.8], [3.0, 0.88],
    [2.0, 0.95], [1.0, 0.95], [0, 0.88], [-2, 0.74], [-4, 0.64], [-6, 0.53], [-7.5, 0.46], [-8.6, 0.38], [-9.0, 0.3]]);
  const BOT = curve([[9.45, -0.1], [9.0, -0.22], [8.0, -0.42], [7.0, -0.58], [6.0, -0.72], [5.0, -0.85], [4.0, -0.98],
    [3.0, -1.1], [2.0, -1.17], [0, -1.22], [-2, -1.2], [-4, -1.12], [-6, -0.98], [-7.5, -0.82], [-8.6, -0.7], [-9.0, -0.62]]);
  const CY = curve([[9.45, -0.1], [8, -0.08], [6, -0.06], [3, -0.05], [-9, -0.05]]);
  const E1 = 2 / 2.6, E2 = 2 / 3.2;
  const YS = x => CY(x) - 0.3 * (CY(x) - BOT(x));

  function section(x, na = 12, nb = 10) {
    const w = Math.max(W(x), 0.0005), wl = Math.min(Math.max(WL(x), 0.0004), w), top = TOP(x), bot = BOT(x), cy = CY(x), ys = YS(x);
    const upper = [], lower = [[x, cy, w]];
    for (let k = 0; k <= na; k++) {
      const th = k / na * Math.PI / 2;
      upper.push([x, cy + (top - cy) * Math.pow(Math.cos(th), E1), w * Math.pow(Math.sin(th), E1)]);
    }
    for (let k = 0; k <= nb; k++) {
      const th = (1 - k / nb) * Math.PI / 2;
      lower.push([x, ys + (bot - ys) * Math.pow(Math.max(Math.cos(th), 0), E2), wl * Math.pow(Math.sin(th), E2)]);
    }
    return { upper, lower };
  }
  function upperY(x, z) {
    const w = Math.max(W(x), 1e-4), r = clamp(Math.abs(z) / w, 0, 1);
    const s = Math.pow(r, 1 / E1), c = Math.sqrt(Math.max(0, 1 - s * s));
    return CY(x) + (TOP(x) - CY(x)) * Math.pow(c, E1);
  }

  /* ---------- lifting surfaces ---------- */
  const naca = x => 0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4;
  // section between chord fractions xa..xb; planform fns of span coordinate z
  function liftingRings(pl, z0, z1, xa = 0, xb = 1, n = 12, m = 22) {
    const rings = [];
    for (let k = 0; k <= n; k++) {
      const z = lerp(z0, z1, k / n), le = pl.le(z), te = pl.te(z), th = pl.th(z), yc = pl.y(z), ch = le - te, ring = [];
      const xc = j => xa + (xb - xa) * (1 - Math.cos(Math.PI * j / m)) / 2;
      for (let j = m; j >= 0; j--) { const c = xc(j); ring.push([le - ch * c, yc + 5 * th * naca(c), z]); }
      for (let j = 1; j <= m; j++) { const c = xc(j); ring.push([le - ch * c, yc - 5 * th * naca(c), z]); }
      rings.push(ring);
    }
    return rings;
  }
  const hingePoint = (pl, z, c) => [pl.le(z) - (pl.le(z) - pl.te(z)) * c, pl.y(z), z];

  const WING = {
    le: z => 1.3 - (z - 1.6) * Math.tan(42 * D2R),
    te: z => -6.2 + (z - 1.6) * Math.tan(17 * D2R),
    y: z => -0.06 - (z - 1.2) * Math.tan(3.25 * D2R),
    th: z => lerp(0.4, 0.06, (z - 1.2) / 5.58)
  };
  const STAB = {
    le: z => -6.3 - (z - 1.2) * Math.tan(42 * D2R),
    te: z => lerp(-8.9, -10.05, (z - 1.2) / 3.22),
    y: z => lerp(-0.12, -0.2, (z - 1.2) / 3.22),
    th: z => lerp(0.2, 0.04, (z - 1.2) / 3.22)
  };
  const FIN = {
    le: s => -4.55 - s * Math.tan(22.9 * D2R),
    te: s => -7.95 + s * Math.tan(22.9 * D2R),
    y: () => 0,
    th: s => lerp(0.18, 0.05, s / 2.45)
  };

  /* ---------- textures ---------- */
  const texCache = {};
  function skinTextures(paint, aniso) {
    if (texCache[paint]) return texCache[paint];
    const N = 1024;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; };
    const [c, g] = mk(), [cb, gb] = mk();
    let seed = paint === 'usaf' ? 20250917 : 77031;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#e4e8eb'; g.fillRect(0, 0, N, N);
    gb.fillStyle = '#ffffff'; gb.fillRect(0, 0, N, N);
    // large two-tone camouflage blobs, drawn wrapped so the tile is seamless
    const camo = paint === 'usaf'
      ? ['rgba(48, 56, 64, 0.2)', 'rgba(48, 56, 64, 0.14)']
      : ['rgba(126, 82, 46, 0.42)', 'rgba(52, 66, 96, 0.42)', 'rgba(170, 160, 140, 0.35)'];
    for (let b = 0; b < (paint === 'usaf' ? 10 : 16); b++) {
      const cx = rnd() * N, cy = rnd() * N, r = 110 + rnd() * 170, pts = [];
      const nv = 6 + Math.floor(rnd() * 4);
      for (let i = 0; i < nv; i++) { const a = i / nv * Math.PI * 2 + rnd() * 0.4, rr = r * (0.6 + rnd() * 0.5); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      g.fillStyle = camo[b % camo.length];
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, cx + ox + x, cy + oy + y)); g.closePath(); g.fill();
      }
    }
    const panels = [];
    (function split(x, y, w, h, d) {
      if (d > 6 || (w < 150 && h < 150) || (d > 2 && rnd() < 0.2)) { panels.push([x, y, w, h]); return; }
      if (w > h) { const s = Math.round(w * (0.3 + rnd() * 0.4)); split(x, y, s, h, d + 1); split(x + s, y, w - s, h, d + 1); }
      else { const s = Math.round(h * (0.3 + rnd() * 0.4)); split(x, y, w, s, d + 1); split(x, y + s, w, h - s, d + 1); }
    })(0, 0, N, N, 0);
    for (const [x, y, w, h] of panels) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'}, ${0.02 + rnd() * 0.035})`;
      g.fillRect(x, y, w, h);
    }
    const seams = (ctx, a, lw) => { ctx.strokeStyle = `rgba(24, 30, 36, ${a})`; ctx.lineWidth = lw; for (const [x, y, w, h] of panels) ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5); };
    seams(g, 0.2, 1.4); seams(gb, 0.9, 2);
    for (const ctx of [g, gb]) ctx.fillStyle = ctx === g ? 'rgba(20,24,28,0.12)' : 'rgba(0,0,0,0.6)';
    for (const [x, y, w, h] of panels) {
      if (rnd() < 0.45) continue;
      for (let t = 9; t < w - 5; t += 16) for (const ctx of [g, gb]) { ctx.fillRect(x + t, y + 5, 2, 2); ctx.fillRect(x + t, y + h - 7, 2, 2); }
    }
    // sawtooth-edged access panels, a stealth signature
    for (let n = 0; n < 9; n++) {
      const x = rnd() * (N - 200) + 30, y = rnd() * (N - 160) + 30, w = 80 + rnd() * 110, h = 45 + rnd() * 60, tooth = 12;
      for (const [ctx, a, lw] of [[g, 0.3, 1.6], [gb, 0.9, 2]]) {
        ctx.strokeStyle = `rgba(24, 30, 36, ${a})`; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let t = 0; t <= w; t += tooth) ctx.lineTo(x + t, y + ((t / tooth) % 2 ? -7 : 0));
        ctx.lineTo(x + w, y + h);
        for (let t = w; t >= 0; t -= tooth) ctx.lineTo(x + t, y + h + ((t / tooth) % 2 ? 7 : 0));
        ctx.closePath(); ctx.stroke();
      }
    }
    const wrap = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    };
    return (texCache[paint] = { map: wrap(c, true), bump: wrap(cb, false) });
  }

  /* ---------- shared small parts ---------- */
  function sawDoorGeometry(len, wd) {
    const s = new THREE.Shape(), t = 0.11;
    s.moveTo(0, 0); s.lineTo(len, 0);
    s.lineTo(len - t, -wd * 0.25); s.lineTo(len, -wd * 0.5); s.lineTo(len - t, -wd * 0.75); s.lineTo(len, -wd);
    s.lineTo(0, -wd);
    s.lineTo(t, -wd * 0.75); s.lineTo(0, -wd * 0.5); s.lineTo(t, -wd * 0.25); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false });
    g.translate(0, 0, -0.0125);
    return g;
  }
  // AIM-120 AMRAAM, nose along +x, length 3.66 m
  let missileGeo = null;
  function missileGeometry() {
    if (missileGeo) return missileGeo;
    const parts = [];
    const body = new THREE.CylinderGeometry(0.089, 0.089, 3.2, 14); body.rotateZ(-Math.PI / 2); body.translate(-0.2, 0, 0); parts.push(body);
    const nose = new THREE.ConeGeometry(0.089, 0.46, 14); nose.rotateZ(-Math.PI / 2); nose.translate(1.63, 0, 0); parts.push(nose);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const mid = new THREE.BoxGeometry(0.42, 0.012, 0.36); mid.translate(0.1, 0, 0.2); mid.rotateX(a); parts.push(mid);
      const tail = new THREE.BoxGeometry(0.32, 0.012, 0.3); tail.translate(-1.62, 0, 0.18); tail.rotateX(a); parts.push(tail);
    }
    missileGeo = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
    missileGeo.computeVertexNormals();
    return missileGeo;
  }

  function plumeMaterial(c1, c2, diamonds) {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) }, uD: { value: diamonds } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uI, uD; uniform vec3 uC1, uC2; varying vec2 vUv;
        void main(){
          float d = 1.0 - vUv.y;
          float fade = pow(1.0 - d, 1.7);
          float e = abs(fract(vUv.x * 4.0) - 0.5) * 2.0;
          float edge = 1.0 - e * e * 0.7;
          float dia = mix(1.0, 0.45 + 0.55 * pow(abs(cos(d * 26.0)), 6.0) * smoothstep(0.75, 0.0, d), uD);
          float flick = 0.86 + 0.14 * sin(uTime * 47.0 + d * 31.0) * sin(uTime * 13.0);
          vec3 col = mix(uC1, uC2, smoothstep(0.0, 0.8, d));
          gl_FragColor = vec4(col * fade * edge * dia * flick * uI, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
  }

  /* ---------- build ---------- */
  function build(opt = {}) {
    const o = Object.assign({ paint: 'usaf', gear: true, cockpit: true, bay: true, lights: true, plumes: true,
      physical: true, detail: 1, anisotropy: 4, shadows: true }, opt);
    const tex = skinTextures(o.paint, o.anisotropy);
    const Mat = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const skinOpts = { color: o.paint === 'usaf' ? 0x7d858d : 0x8a8580, map: tex.map, bumpMap: tex.bump, bumpScale: 0.6,
      metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide };
    if (o.physical) Object.assign(skinOpts, { clearcoat: 0.18, clearcoatRoughness: 0.5 });
    const skin = new Mat(skinOpts);
    const metal = new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.85, roughness: 0.42, side: THREE.DoubleSide });
    const burnt = new THREE.MeshStandardMaterial({ color: 0x5a5148, metalness: 0.9, roughness: 0.38, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181b, metalness: 0.2, roughness: 0.85, side: THREE.DoubleSide });
    const canopyMat = new (o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)(Object.assign({
      color: 0xd9a548, metalness: 0.55, roughness: 0.04, transparent: true, opacity: 0.62, envMapIntensity: 1.8,
      side: THREE.DoubleSide, depthWrite: false }, o.physical ? { clearcoat: 1, clearcoatRoughness: 0.02 } : {}));
    const gearMat = new THREE.MeshStandardMaterial({ color: 0xd7dbde, metalness: 0.35, roughness: 0.4 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xeef1f3, metalness: 1, roughness: 0.12 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
    const missileMat = new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.2, roughness: 0.45 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x1a0c06, side: THREE.DoubleSide });

    const group = new THREE.Group();
    const add = (geo, mat, parent = group) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = o.shadows; m.receiveShadow = o.shadows;
      parent.add(m);
      return m;
    };
    const det = o.detail;

    // fuselage
    {
      const up = [], lo = [], N = Math.round(120 * det);
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = 9.45 - 18.45 * (0.55 * t + 0.45 * t * t);
        const s = section(x, Math.round(12 * Math.max(det, 0.7)), Math.round(10 * Math.max(det, 0.7)));
        up.push(s.upper); lo.push(s.lower);
      }
      for (const r of [up, mirror(up), lo, mirror(lo)]) add(gridGeometry(r), skin);
      const last = section(-9.0);
      const half = last.upper.concat(last.lower.slice(1));
      const loop = half.concat(half.slice(1, -1).reverse().map(p => [p[0], p[1], -p[2]]));
      add(capGeometry(loop, p => [p[2], p[1]]), metal);
    }

    // canopy, sill and cockpit
    {
      const CBW = curve([[6.85, 0], [6.55, 0.26], [6.0, 0.44], [5.2, 0.52], [4.2, 0.53], [3.4, 0.48], [2.8, 0.34], [2.15, 0]]);
      const CH = curve([[6.85, 0], [6.55, 0.2], [6.0, 0.44], [5.2, 0.62], [4.4, 0.68], [3.6, 0.62], [3.0, 0.44], [2.15, 0]]);
      const rings = [], NC = Math.round(60 * det), M = 28;
      for (let i = 0; i <= NC; i++) {
        const x = lerp(6.85, 2.15, i / NC), bw = Math.max(CBW(x), 0), h = Math.max(CH(x), 0), ring = [];
        for (let k = 0; k <= M; k++) {
          const ph = -Math.PI / 2 + Math.PI * k / M, z = bw * Math.sin(ph);
          ring.push([x, upperY(x, z) - 0.03 + h * Math.pow(Math.max(Math.cos(ph), 0), 0.7), z]);
        }
        rings.push(ring);
      }
      const c = new THREE.Mesh(gridGeometry(rings), canopyMat);
      c.renderOrder = 2;
      group.add(c);
      for (const k of [0, M]) {
        const pts = rings.map(r => new THREE.Vector3(...r[k]));
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.024, 6), dark);
      }
      if (o.cockpit) {
        const box = (w, h, d, x, y, z, m = dark) => { const b = add(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
        box(2.6, 0.12, 0.92, 4.4, TOP(4.4) - 0.02, 0);
        box(0.5, 0.6, 0.5, 4.15, TOP(4.15) + 0.18, 0);
        box(0.22, 0.2, 0.32, 4.05, TOP(4.05) + 0.5, 0, metal);
        box(0.6, 0.22, 0.78, 5.35, TOP(5.35) + 0.06, 0);
        box(0.34, 0.26, 0.5, 4.02, TOP(4.02) + 0.28, 0, new THREE.MeshStandardMaterial({ color: 0x3f4434, roughness: 0.9 }));
        const helmet = add(new THREE.SphereGeometry(0.13, 18, 14), new THREE.MeshStandardMaterial({ color: 0x2d3237, roughness: 0.5 }));
        helmet.position.set(3.98, TOP(3.98) + 0.47, 0);
        const visor = add(new THREE.SphereGeometry(0.133, 18, 10, -Math.PI / 2.4, Math.PI / 1.2, Math.PI * 0.3, Math.PI * 0.32),
          new THREE.MeshStandardMaterial({ color: 0xc89a3c, metalness: 0.9, roughness: 0.1 }));
        visor.position.copy(helmet.position); visor.rotation.y = Math.PI / 2;
        const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.26),
          new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
        hud.position.set(5.2, TOP(5.2) + 0.36, 0); hud.rotation.set(0, Math.PI / 2, 0.35);
        group.add(hud);
      }
    }

    // caret intakes
    {
      const xEnd = -2.6, N = Math.round(40 * det), c0 = { it: 3.45, ot: 3.1, ob: 2.55, ib: 2.85 };
      const corner = (key, u) => {
        const x = lerp(c0[key], xEnd, u), e = smooth(0.55, 1, u), yb = lerp(-1.08, -0.62, smooth(0.35, 1, u));
        switch (key) {
          case 'it': return [x, YS(x) - 0.03, 0.75];
          case 'ot': return [x, lerp(CY(x) - 0.05, YS(x), e), lerp(W(x) - 0.04, 1.0, e)];
          case 'ob': return [x, yb, lerp(W(x) - 0.2, 0.95, e)];
          case 'ib': return [x, yb, 0.75];
        }
      };
      for (const [a, b] of [['it', 'ot'], ['ot', 'ob'], ['ob', 'ib'], ['ib', 'it']]) {
        const rings = [];
        for (let i = 0; i <= N; i++) rings.push([corner(a, i / N), corner(b, i / N)]);
        for (const r of [rings, mirror(rings)]) add(gridGeometry(r), skin);
      }
      const mouth = ['it', 'ot', 'ob', 'ib'].map(k => corner(k, 0.09));
      for (const m of [mouth, mouth.map(p => [p[0], p[1], -p[2]])]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(m.flat(), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
        add(g, dark);
      }
    }

    // surface helpers
    const uvSpan = p => [p[0] * S, p[2] * S];
    function piece(rings, mat, parent, mirrorZ) {
      const r = mirrorZ ? mirror(rings) : rings;
      const meshes = [add(gridGeometry(r, uvSpan), mat, parent)];
      for (const ring of [r[0], r[r.length - 1]]) {
        let loop = ring;
        const a = loop[0], b = loop[loop.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4) loop = loop.slice(0, -1);
        meshes.push(add(capGeometry(loop, p => [p[0], p[1]]), mat, parent));
      }
      return meshes;
    }
    const hinged = [];
    function hingedSurface(pl, z0, z1, c, side, parent, kind, n) {
      const sgn = side < 0;
      const p0 = hingePoint(pl, z0, c + 0.005), p1 = hingePoint(pl, z1, c + 0.005);
      if (sgn) { p0[2] = -p0[2]; p1[2] = -p1[2]; }
      const pivot = new THREE.Group();
      pivot.position.set(...p0);
      parent.add(pivot);
      for (const m of piece(liftingRings(pl, z0, z1, c + 0.005, 1, n, 12), skin, pivot, sgn)) m.geometry.translate(-p0[0], -p0[1], -p0[2]);
      const axis = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
      hinged.push({ pivot, axis, side, kind });
    }

    // wings: fixed structure + flaperon + aileron per side
    const HC = 0.775;
    for (const side of [1, -1]) {
      const mz = side < 0;
      piece(liftingRings(WING, 1.2, 1.95, 0, 1, 3), skin, group, mz);
      piece(liftingRings(WING, 1.95, 6.3, 0, HC, Math.round(16 * det)), skin, group, mz);
      piece(liftingRings(WING, 6.3, 6.78, 0, 1, 3), skin, group, mz);
      hingedSurface(WING, 1.98, 4.12, HC, side, group, 'flaperon', 6);
      hingedSurface(WING, 4.17, 6.27, HC, side, group, 'aileron', 6);
    }

    // all-moving stabilators
    const stabs = [];
    for (const side of [1, -1]) {
      const piv = [-7.55, -0.12, 1.3 * side];
      const pivot = new THREE.Group();
      pivot.position.set(...piv);
      group.add(pivot);
      for (const m of piece(liftingRings(STAB, 1.2, 4.42, 0, 1, 10), skin, pivot, side < 0)) m.geometry.translate(-piv[0], -piv[1], -piv[2]);
      stabs.push({ pivot, side });
    }

    // canted vertical tails with rudders
    for (const side of [1, -1]) {
      const cant = new THREE.Group();
      cant.position.set(0, 0.26, 1.22 * side);
      cant.rotation.x = 28 * D2R * side;
      group.add(cant);
      const frame = new THREE.Group();
      frame.rotation.x = -Math.PI / 2;
      cant.add(frame);
      piece(liftingRings(FIN, 0, 0.36, 0, 1, 2), skin, frame, false);
      piece(liftingRings(FIN, 0.36, 2.2, 0, 0.69, 10), skin, frame, false);
      piece(liftingRings(FIN, 2.2, 2.45, 0, 1, 2), skin, frame, false);
      hingedSurface(FIN, 0.38, 2.17, 0.69, 1, frame, 'rudder', 6);
      if (o.lights) {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xb8ff9a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false }));
        strip.position.set(FIN.le(2.0) - 0.9, 0.04, 2.0);
        frame.add(strip);
      }
    }

    // 2-D thrust-vectoring nozzles
    const vectors = [], plumeMats = [], plumes = [];
    for (const zc of [0.62, -0.62]) {
      const rings = [], N = 6;
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = lerp(-8.55, -9.3, t), hw = lerp(0.52, 0.5, t), hh = lerp(0.4, 0.37, t), c = 0.08, y = -0.15;
        const pts = [[hw - c, hh], [hw, hh - c], [hw, -hh + c], [hw - c, -hh], [-hw + c, -hh], [-hw, -hh + c], [-hw, hh - c], [-hw + c, hh]];
        pts.push(pts[0]);
        rings.push(pts.map(([dz, dy]) => [x, y + dy, zc + dz]));
      }
      add(gridGeometry(rings), metal);
      for (const s of [1, -1]) {
        const wall = add(new THREE.BoxGeometry(0.6, 0.74, 0.03), burnt);
        wall.position.set(-9.58, -0.15, zc + 0.5 * s);
      }
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), glow);
      inner.position.set(-9.2, -0.15, zc); inner.rotation.y = Math.PI / 2;
      group.add(inner);
      const vec = new THREE.Group();
      vec.position.set(-9.3, -0.15, zc);
      group.add(vec);
      for (const s of [1, -1]) {
        const hinge = new THREE.Group();
        hinge.position.set(0, 0.36 * s, 0);
        hinge.rotation.z = 0.13 * s;
        const flap = add(new THREE.BoxGeometry(0.6, 0.035, 0.97), burnt, hinge);
        flap.position.x = -0.3;
        vec.add(hinge);
      }
      vectors.push(vec);
      if (o.plumes) {
        for (const [rt, rb, len, c1, c2, dia] of [[0.62, 0.26, 7.5, 0xff9a52, 0x4f6bff, 0], [0.48, 0.12, 4.0, 0xfff4d6, 0xff8a2a, 1]]) {
          const pm = plumeMaterial(c1, c2, dia);
          const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, 4, 24, true, Math.PI / 4), pm);
          m.rotation.z = -Math.PI / 2;
          m.scale.set(0.26 / 0.354, 1, 0.47 / 0.354);
          m.position.set(-0.55 - len / 2, 0, 0);
          m.renderOrder = 3; m.visible = false; m.frustumCulled = false;
          vec.add(m);
          plumeMats.push(pm); plumes.push(m);
        }
      }
    }

    // landing gear
    const legs = [], doors = [];
    function door(parent, x, y, z, len, wd, closedAngle) {
      const hinge = new THREE.Group();
      hinge.position.set(x, y, z);
      const d = add(sawDoorGeometry(len, wd), skin, hinge);
      d.receiveShadow = false;
      parent.add(hinge);
      return { hinge, closedAngle };
    }
    if (o.gear) {
      const leg = ({ x, y, z, wheelZ, r, w, len }) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, z);
        group.add(pivot);
        const strut = add(new THREE.CylinderGeometry(0.075, 0.075, len * 0.62, 12), gearMat, pivot); strut.position.y = -len * 0.31;
        const oleo = add(new THREE.CylinderGeometry(0.052, 0.052, len * 0.45, 12), chrome, pivot); oleo.position.y = -len * 0.75;
        const brace = add(new THREE.BoxGeometry(0.05, len * 0.7, 0.05), gearMat, pivot);
        brace.position.set(-0.28, -len * 0.35, 0); brace.rotation.z = -0.38;
        const axle = add(new THREE.CylinderGeometry(0.04, 0.04, Math.abs(wheelZ) + w / 2, 8), gearMat, pivot);
        axle.rotation.x = Math.PI / 2; axle.position.set(0, -len, wheelZ / 2);
        const wheel = add(new THREE.CylinderGeometry(r, r, w, 32), tire, pivot);
        wheel.rotation.x = Math.PI / 2; wheel.position.set(0, -len, wheelZ);
        const hub = add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 20), gearMat, pivot);
        hub.rotation.x = Math.PI / 2; hub.position.copy(wheel.position);
        legs.push(pivot);
      };
      const ny = BOT(6.0) + 0.06, nr = 0.34;
      leg({ x: 6.0, y: ny, z: 0, wheelZ: 0, r: nr, w: 0.2, len: ny - (GROUND + nr) });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false }));
      lamp.position.set(0.12, -0.55, 0); legs[0].add(lamp);
      doors.push(door(group, 5.35, BOT(5.6) + 0.02, 0.22, 1.25, 0.24, Math.PI / 2));
      doors.push(door(group, 5.35, BOT(5.6) + 0.02, -0.22, 1.25, 0.24, -Math.PI / 2));
      const my = -0.93, mr = 0.5;
      for (const side of [1, -1]) {
        leg({ x: -1.35, y: my, z: 1.42 * side, wheelZ: 0.24 * side, r: mr, w: 0.3, len: my - (GROUND + mr) });
        doors.push(door(group, -2.35, my - 0.02, 1.12 * side, 1.75, 0.6, -Math.PI / 2 * side));
      }
    }

    // main weapons bay with trapeze-launched AMRAAMs
    const bayDoors = [], bayMissiles = [];
    let bayGroup = null;
    if (o.bay) {
      const x0 = -0.4, x1 = -4.3, len = x0 - x1;
      bayGroup = new THREE.Group();
      bayGroup.position.set(x0, BOT(x0) - 0.012, 0);
      bayGroup.rotation.z = -Math.atan((BOT(x1) - BOT(x0)) / len);
      group.add(bayGroup);
      const recess = new THREE.Mesh(new THREE.BoxGeometry(len - 0.08, 0.4, 1.42), dark);
      recess.position.set(-len / 2, 0.202, 0);
      bayGroup.add(recess);
      for (const side of [1, -1]) {
        const d = door(bayGroup, -len, -0.016, 0.74 * side, len, 0.74, Math.PI / 2 * side);
        bayDoors.push(d);
      }
      const mg = missileGeometry();
      for (let i = 0; i < 6; i++) {
        const m = add(mg, missileMat, bayGroup);
        m.position.set(-len / 2 - 0.05, 0, (i - 2.5) * 0.22);
        m.userData.row = i % 2;
        m.visible = false;
        bayMissiles.push(m);
      }
    }

    // navigation and formation lights
    if (o.lights) {
      const tipX = (WING.le(6.78) + WING.te(6.78)) / 2;
      for (const [side, col] of [[1, 0x4dff7a], [-1, 0xff3b30]]) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        l.position.set(tipX + 0.1, WING.y(6.78), 6.79 * side);
        group.add(l);
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xb8ff9a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false }));
        strip.position.set(6.3, CY(6.3) - 0.02, (W(6.3) - 0.01) * side);
        strip.rotation.y = side > 0 ? 0 : Math.PI;
        group.add(strip);
      }
    }

    // blade antennas
    {
      const blade = (x, y, h, flip) => {
        const b = add(new THREE.BoxGeometry(0.34, h, 0.02), skin);
        b.position.set(x, y + (flip ? -h / 2 : h / 2), 0);
        b.rotation.z = flip ? -0.35 : 0.35;
      };
      blade(0.6, TOP(0.6) - 0.02, 0.18, false);
      blade(3.2, BOT(3.2) + 0.02, 0.16, true);
    }

    // ---------- runtime controls ----------
    const api = {
      group, skin, materials: { skin, metal, dark, gearMat, canopyMat, missileMat }, wireMats: [skin, metal, burnt, gearMat],
      plumeMats, legs, doors, bayMissiles,
      gear: 0, bay: 0,
      setGear(g) {             // 0 = down, 1 = stowed
        api.gear = g;
        for (const l of legs) { l.rotation.z = g * Math.PI / 2 * 0.96; l.visible = g < 0.96; }
        const dc = smooth(0.55, 0.98, g);
        for (const d of doors) d.hinge.rotation.x = d.closedAngle * dc;
      },
      setBay(b, armed = 6) {   // 0 = closed, 1 = open with launchers extended
        api.bay = b;
        const open = smooth(0, 0.45, b), ext = smooth(0.4, 1, b);
        for (const d of bayDoors) d.hinge.rotation.x = d.closedAngle * (1 - open);
        bayMissiles.forEach((m, i) => { m.visible = b > 0.05 && i < armed; m.position.y = lerp(0.12, -0.36 - m.userData.row * 0.06, ext); });
      },
      setAB(level, t) {        // 0 = idle, ~0.2 = military, 1 = full afterburner
        for (const pm of plumeMats) { pm.uniforms.uTime.value = t; pm.uniforms.uI.value = level * (pm.uniforms.uD.value ? 1.25 : 0.55); }
        for (const p of plumes) p.visible = level > 0.01;
        glow.color.setRGB(lerp(0.1, 1.0, level), lerp(0.047, 0.69, level), lerp(0.024, 0.35, level));
      },
      // pitch +1 nose up, roll +1 right wing down, yaw +1 nose right, flap 0..1
      pose({ pitch = 0, roll = 0, yaw = 0, flap = 0 } = {}) {
        for (const s of stabs) s.pivot.rotation.z = -(pitch * 0.32 + roll * 0.12 * s.side);
        for (const h of hinged) {
          let ang = 0;
          if (h.kind === 'flaperon') ang = -(roll * 0.28 * h.side - flap * 0.35) * h.side;
          else if (h.kind === 'aileron') ang = -(roll * 0.4 * h.side) * h.side;
          else if (h.kind === 'rudder') ang = yaw * 0.35;
          h.pivot.quaternion.setFromAxisAngle(h.axis, ang);
        }
        for (const v of vectors) v.rotation.z = -pitch * 0.3;
      }
    };
    api.setGear(o.gear ? 0 : 1);
    api.setBay(0);
    return api;
  }

  // Bake static meshes into one mesh per material (for distant aircraft); skips shader/hidden parts.
  function bake(api) {
    const g = api.group;
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map();
    g.traverse(m => {
      if (!m.isMesh || m.material.isShaderMaterial) return;
      let vis = true;
      for (let p = m; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      let geo = m.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (geo.index) geo = geo.toNonIndexed();
      const key = m.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: m.material, list: [], order: m.renderOrder });
      buckets.get(key).list.push(geo);
    });
    const out = new THREE.Group();
    for (const { mat, list, order } of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.renderOrder = order;
      out.add(mesh);
    }
    return out;
  }

  return { build, bake, missileGeometry, GROUND, TOP, BOT, W, upperY };
})();
