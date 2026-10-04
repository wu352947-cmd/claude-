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
    const seg = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let i = 0; i < nR; i++) {
      let arc = 0, total = 0;
      for (let j = 1; j < nP; j++) total += seg(rings[i][j], rings[i][j - 1]);
      for (let j = 0; j < nP; j++) {
        const p = rings[i][j];
        if (j > 0) arc += seg(p, rings[i][j - 1]);
        const k = i * nP + j;
        pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
        // uvFn(point, arc length, fraction of the ring, index in ring, ring index, ring size, ring count)
        const t = uvFn ? uvFn(p, arc, total > 0 ? arc / total : 0, j, i, nP, nR) : [p[0] * S, arc * S];
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
  const W = curve([[9.45, 0], [9.2, 0.12], [8.6, 0.27], [8.0, 0.38], [7.0, 0.55], [6.0, 0.71], [5.0, 0.86], [4.2, 1.0],
    [3.4, 1.2], [2.6, 1.42], [1.8, 1.58], [1.0, 1.67], [0, 1.7], [-2, 1.7], [-4, 1.66], [-5.5, 1.6], [-7, 1.52],
    [-8, 1.45], [-8.6, 1.38], [-9.0, 1.3]]);
  const WL = curve([[9.45, 0], [9.2, 0.1], [8.6, 0.22], [8.0, 0.31], [7.0, 0.45], [6.0, 0.56], [5.0, 0.6], [4.2, 0.56],
    [3.4, 0.52], [1.0, 0.54], [0, 0.75], [-1, 1.1], [-2.5, 1.45], [-4, 1.5], [-6, 1.42], [-7.5, 1.3], [-8.6, 1.2], [-9, 1.12]]);
  const TOP = curve([[9.45, -0.08], [9.0, 0.08], [8.0, 0.3], [7.0, 0.48], [6.0, 0.62], [5.0, 0.72], [4.0, 0.8], [3.0, 0.88],
    [2.0, 0.95], [1.0, 0.95], [0, 0.88], [-2, 0.74], [-4, 0.64], [-6, 0.53], [-7.5, 0.46], [-8.6, 0.38], [-9.0, 0.3]]);
  const BOT = curve([[9.45, -0.1], [9.0, -0.22], [8.0, -0.42], [7.0, -0.58], [6.0, -0.72], [5.0, -0.85], [4.0, -0.98],
    [3.0, -1.1], [2.0, -1.17], [0, -1.22], [-2, -1.2], [-4, -1.12], [-6, -0.98], [-7.5, -0.82], [-8.6, -0.7], [-9.0, -0.62]]);
  const CY = curve([[9.45, -0.1], [8, -0.08], [6, -0.06], [3, -0.05], [-9, -0.05]]);
  // Upper section: rounded crown falling to a sharp chine edge, y = cy + h (1 - t^CROWN), t = |z| / w.
  const CROWN = 2.3, E2 = 2 / 3.2;
  const YS = x => CY(x) - 0.3 * (CY(x) - BOT(x));

  function section(x, na = 12, nb = 10) {
    const w = Math.max(W(x), 0.0005), wl = Math.min(Math.max(WL(x), 0.0004), w), top = TOP(x), bot = BOT(x), cy = CY(x), ys = YS(x);
    const upper = [], lower = [[x, cy, w]];
    for (let k = 0; k <= na; k++) {
      const t = Math.sin(k / na * Math.PI / 2);
      upper.push([x, cy + (top - cy) * (1 - Math.pow(t, CROWN)), w * t]);
    }
    for (let k = 0; k <= nb; k++) {
      const th = (1 - k / nb) * Math.PI / 2;
      lower.push([x, ys + (bot - ys) * Math.pow(Math.max(Math.cos(th), 0), E2), wl * Math.pow(Math.sin(th), E2)]);
    }
    return { upper, lower };
  }
  function upperY(x, z) {
    const w = Math.max(W(x), 1e-4), r = clamp(Math.abs(z) / w, 0, 1);
    return CY(x) + (TOP(x) - CY(x)) * (1 - Math.pow(r, CROWN));
  }

  const CANOPY_W = curve([[6.25, 0], [6.0, 0.2], [5.5, 0.41], [4.8, 0.51], [4.0, 0.53], [3.3, 0.48], [2.7, 0.34], [2.0, 0]]);
  const CANOPY_H = curve([[6.25, 0], [6.0, 0.17], [5.5, 0.44], [4.7, 0.65], [3.9, 0.7], [3.2, 0.6], [2.6, 0.4], [2.0, 0]]);
  const CANOPY_X = [6.25, 2.0];

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
  const PAINTS = {
    usaf: { base: '#e4e8eb', seed: 20250917, blobs: 10, camo: ['rgba(48, 56, 64, 0.2)', 'rgba(48, 56, 64, 0.14)'] },
    aggressor: { base: '#e4e8eb', seed: 77031, blobs: 16, camo: ['rgba(126, 82, 46, 0.42)', 'rgba(52, 66, 96, 0.42)', 'rgba(170, 160, 140, 0.35)'] },
    flanker: { base: '#e6edf3', seed: 4411, blobs: 20, camo: ['rgba(58, 98, 146, 0.55)', 'rgba(126, 156, 192, 0.5)', 'rgba(36, 58, 92, 0.4)'] },
    fulcrum: { base: '#e3e6e2', seed: 9137, blobs: 16, camo: ['rgba(84, 98, 86, 0.5)', 'rgba(146, 152, 146, 0.45)'] },
    ucav: { base: '#c4c8cd', seed: 313, blobs: 6, camo: ['rgba(30, 34, 40, 0.22)'] },
    bomber: { base: '#f4f5f6', seed: 808, blobs: 5, camo: ['rgba(120, 128, 136, 0.1)'] },
    plan: { base: '#dfe5ea', seed: 5501, blobs: 8, camo: ['rgba(70, 92, 118, 0.22)', 'rgba(40, 56, 76, 0.16)'] },
    usn: { base: '#e2e5e8', seed: 1949, blobs: 8, camo: ['rgba(60, 66, 74, 0.2)', 'rgba(90, 96, 104, 0.14)'] },
    h6: { base: '#e9ecee', seed: 1959, blobs: 6, camo: ['rgba(110, 120, 130, 0.14)'] },
    bone: { base: '#c9ccd0', seed: 1974, blobs: 6, camo: ['rgba(40, 44, 50, 0.22)'] }
  };
  function skinTextures(paint, aniso) {
    if (texCache[paint]) return texCache[paint];
    const N = 1024;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; };
    const [c, g] = mk(), [cb, gb] = mk();
    const P = PAINTS[paint] || PAINTS.usaf;
    let seed = P.seed;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = P.base; g.fillRect(0, 0, N, N);
    gb.fillStyle = '#ffffff'; gb.fillRect(0, 0, N, N);
    // large two-tone camouflage blobs, drawn wrapped so the tile is seamless
    const camo = P.camo;
    for (let b = 0; b < P.blobs; b++) {
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

  /* ---------- F-22 livery: one texture per part, laid out on that part's own shape ----------
     Fuselage: u runs nose to tail, v runs from the top centreline to the chine (upper half) and on to the keel (lower half).
     Wing, stabilator: planform x/z; the left half of the sheet is the upper surface, the right half the lower.
     Fin: chord x and span s; the two halves are the two faces, mirrored so lettering reads correctly from both sides. */
  const LIV = { base: '#888e93', dark: '#646a70', trim: '#b9bdc0', radome: '#9da2a6', mark: '#565c62', seam: 'rgba(26, 32, 38, 0.36)' };
  const BODY_U = x => (9.45 - x) / 18.45;
  const WING_X = [-6.7, 2.1], WING_Z = 6.95, STAB_X = [-10.15, -6.1], STAB_Z = 4.6, FIN_X = [-8.05, -4.45], FIN_S = 2.5;
  const livCache = {};
  function livery(aniso, scale = 1) {
    if (livCache[scale]) return livCache[scale];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sheet = (w, h) => {
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale); const g = c.getContext('2d'); g.scale(scale, scale); return [c, g]; };
      const [c, g] = mk(), [cb, gb] = mk();
      g.fillStyle = LIV.base; g.fillRect(0, 0, w, h);
      gb.fillStyle = '#fff'; gb.fillRect(0, 0, w, h);
      return { c, g, cb, gb, w, h };
    };
    // soft-edged camouflage blob; ay stretches it so it reads round on the surface
    // ex stretches the patch along the airframe; the real pattern runs in long irregular bands
    function blob(S, cx, cy, r, ay, ex = 1.7) {
      const n = 12, pts = [], tilt = (rnd() - 0.5) * 0.8;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + rnd() * 0.35, k = 0.42 + rnd() * 0.75;
        const px = Math.cos(a) * r * k * ex, py = Math.sin(a) * r * k;
        pts.push([px * Math.cos(tilt) - py * Math.sin(tilt), (px * Math.sin(tilt) + py * Math.cos(tilt)) * ay]);
      }
      const g = S.g;
      g.fillStyle = LIV.dark;
      for (const [f, alpha] of [[1.14, 0.22], [1.06, 0.45], [1, 1]]) {
        g.globalAlpha = alpha; g.beginPath();
        const mid = i => { const p = pts[i % n], q = pts[(i + 1) % n]; return [(p[0] + q[0]) / 2 * f + cx, (p[1] + q[1]) / 2 * f + cy]; };
        const m0 = mid(0); g.moveTo(m0[0], m0[1]);
        for (let i = 1; i <= n; i++) { const p = pts[i % n], m = mid(i); g.quadraticCurveTo(p[0] * f + cx, p[1] * f + cy, m[0], m[1]); }
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    }
    function line(S, pts) {
      for (const [g, style, lw] of [[S.g, LIV.seam, 1.4], [S.gb, '#000', 2.4]]) {
        g.strokeStyle = style; g.lineWidth = lw; g.beginPath();
        pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      }
    }
    function saw(x0, y0, x1, y1, tooth = 14, amp = 6) {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / tooth)), nx = -(y1 - y0) / len, ny = (x1 - x0) / len, pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n, o = i % 2 ? amp : 0; pts.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); }
      return pts;
    }
    // access panel with sawtooth fore and aft edges, the F-22's signature
    function panel(S, x0, y0, x1, y1, fill = false) {
      const pts = [[x0, y0], [x1, y0], ...saw(x1, y0, x1, y1), [x0, y1], ...saw(x0, y1, x0, y0)];
      if (fill) { S.g.fillStyle = 'rgba(70, 76, 82, 0.18)'; S.g.beginPath(); pts.forEach(([x, y], i) => i ? S.g.lineTo(x, y) : S.g.moveTo(x, y)); S.g.fill(); }
      line(S, [...pts, pts[0]]);
    }
    function dots(S, pts, step = 9) {
      for (const [g, col] of [[S.g, 'rgba(26,32,38,0.22)'], [S.gb, 'rgba(0,0,0,0.5)']]) {
        g.fillStyle = col;
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / step);
          for (let k = 0; k < n; k++) g.fillRect(x0 + (x1 - x0) * k / n - 1, y0 + (y1 - y0) * k / n - 1, 2, 2);
        }
      }
    }
    function poly(S, pts, color) { S.g.fillStyle = color; S.g.beginPath(); pts.forEach(([x, y], i) => i ? S.g.lineTo(x, y) : S.g.moveTo(x, y)); S.g.closePath(); S.g.fill(); }
    function label(S, text, x, y, px, sy, weight = 700) {
      const g = S.g; g.save(); g.translate(x, y); g.scale(1, sy);
      g.fillStyle = LIV.mark; g.font = `${weight} ${px}px "Arial Narrow", Arial, Helvetica, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 0); g.restore();
    }
    // low-visibility star-and-bar: dark grey outline only
    function insignia(S, x, y, r, sy) {
      const g = S.g; g.save(); g.translate(x, y); g.scale(1, sy);
      g.strokeStyle = LIV.mark; g.lineWidth = r * 0.08; g.lineJoin = 'miter';
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.38 : r * 0.96; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.stroke();
      for (const sx of [1, -1]) { g.beginPath(); g.moveTo(sx * r * 0.95, -r * 0.3); g.lineTo(sx * r * 1.95, -r * 0.3); g.lineTo(sx * r * 1.95, r * 0.3); g.lineTo(sx * r * 0.95, r * 0.3); g.stroke(); }
      g.restore();
    }

    /* fuselage */
    const B = sheet(2048, 1024);
    {
      const X = x => BODY_U(x) * 2048, YU = f => f * 512, YL = f => 512 + f * 512;
      for (let x = 7.4; x > -9; x -= rand(2.0, 3.0)) { blob(B, X(x), YU(rand(0.1, 0.9)), rand(110, 160), 2.1); blob(B, X(x - 1.1), YL(rand(0.15, 0.85)), rand(100, 150), 2.4); }
      function rand(a, b) { return a + rnd() * (b - a); }
      B.g.fillStyle = LIV.radome; B.g.fillRect(0, 0, X(7.75), 1024);
      // canopy surround: a light grey frame where the canopy meets the fuselage
      const fAt = (x, z) => {
        const up = section(x, 48, 2).upper;
        let total = 0, arcs = [0];
        for (let k = 1; k < up.length; k++) { total += Math.hypot(up[k][1] - up[k - 1][1], up[k][2] - up[k - 1][2]); arcs.push(total); }
        for (let k = 1; k < up.length; k++) if (up[k][2] >= z) { const t = (z - up[k - 1][2]) / Math.max(up[k][2] - up[k - 1][2], 1e-6); return (arcs[k - 1] + t * (arcs[k] - arcs[k - 1])) / total; }
        return 1;
      };
      const outline = [];
      for (let i = 0; i <= 40; i++) { const x = lerp(CANOPY_X[0], CANOPY_X[1], i / 40); outline.push([X(x), YU(fAt(x, Math.max(CANOPY_W(x), 0)))]); }
      for (const [g, col, lw] of [[B.g, LIV.trim, 18], [B.gb, '#fff', 18]]) { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath(); outline.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
      line(B, outline.map(([x, y]) => [x, y + 10]));
      // frames and longitudinal seams following the structure
      const frame = (x, f0, f1, lower) => { const Y = lower ? YL : YU; line(B, [[X(x), Y(f0)], [X(x), Y(f1)]]); };
      for (const lower of [false, true]) frame(7.75, 0, 1, lower);
      frame(6.95, 0.55, 1, false); frame(6.95, 0, 1, true);
      frame(1.85, 0, 1, false);
      for (const x of [-0.7, -2.9, -5.0, -7.0, -8.3]) { frame(x, 0, 1, false); frame(x, 0, 1, true); }
      line(B, [[X(1.85), YU(0.42)], [X(-8.6), YU(0.42)]]);
      line(B, [[X(6.95), YU(0.8)], [X(-8.6), YU(0.8)]]);
      line(B, [[X(7.75), YL(0.32)], [X(2.6), YL(0.32)]]);
      dots(B, [[X(7.75), 0], [X(7.75), 1024]], 8);
      dots(B, [[X(1.85), YU(0.42)], [X(-8.6), YU(0.42)]], 11);
      // sawtooth access doors
      for (const [x0, x1, f0, f1, lower] of [[1.5, 0.3, 0.14, 0.36], [-1.2, -2.5, 0.5, 0.72], [-3.3, -4.6, 0.13, 0.34], [-5.4, -6.6, 0.52, 0.74],
        [6.6, 5.3, 0.06, 0.4, true], [5.0, 3.9, 0.08, 0.42, true], [-1.5, -3.6, 0.55, 0.85, true]]) {
        const Y = lower ? YL : YU;
        panel(B, X(x0), Y(f0), X(x1), Y(f1));
      }
      panel(B, X(-0.95), YU(0), X(-1.8), YU(0.07), true);          // air refuelling receptacle door
      label(B, 'NO STEP', X(-1.5), YU(0.6), 12, 1.9, 600);
    }

    /* wing */
    const Wg = sheet(2048, 1024);
    {
      const X = (x, face) => face * 1024 + (x - WING_X[0]) / (WING_X[1] - WING_X[0]) * 1024, Y = z => (z / WING_Z + 1) / 2 * 1024;
      const ay = (1024 / (2 * WING_Z)) / (1024 / (WING_X[1] - WING_X[0]));
      for (const face of [0, 1]) for (const side of [1, -1]) {
        const P = (x, z) => [X(x, face), Y(z * side)];
        for (let k = 0; k < 6; k++) { const z = 1.6 + rnd() * 5, xc = rnd(); const [px, py] = P(lerp(WING.le(z), WING.te(z), xc), z); blob(Wg, px, py, 60 + rnd() * 70, ay); }
        const span = []; for (let z = 1.2; z <= 6.781; z += 0.1) span.push(z);
        // light grey trim on the leading edge, tip and trailing edge
        poly(Wg, [...span.map(z => P(WING.le(z), z)), ...span.slice().reverse().map(z => P(WING.le(z) - 0.17, z))], LIV.trim);
        poly(Wg, [...span.map(z => P(WING.te(z), z)), ...span.slice().reverse().map(z => P(WING.te(z) + 0.06, z))], LIV.trim);
        poly(Wg, [P(WING.le(6.78), 6.78), P(WING.te(6.78), 6.78), P(WING.te(6.62), 6.62), P(WING.le(6.62), 6.62)], LIV.trim);
        const chord = c => span.filter(z => z >= 1.7 && z <= 6.6).map(z => P(lerp(WING.le(z), WING.te(z), c), z));
        line(Wg, chord(0.17)); line(Wg, chord(0.6)); dots(Wg, chord(0.17), 10); dots(Wg, chord(0.6), 10);
        for (const z of [2.6, 3.5, 4.4, 5.3, 6.1]) line(Wg, [P(lerp(WING.le(z), WING.te(z), 0.17), z), P(lerp(WING.le(z), WING.te(z), 0.6), z)]);
        if (face === 0) {
          const [ax0, ay0] = P(lerp(WING.le(2.4), WING.te(2.4), 0.3), 2.4), [ax1, ay1] = P(lerp(WING.le(3.2), WING.te(3.2), 0.5), 3.2);
          panel(Wg, ax0, ay0, ax1, ay1);
        }
      }
      // star-and-bar on the upper left wing and lower right wing, as on USAF aircraft
      for (const [face, side] of [[0, -1], [1, 1]]) { const z = 5.0, [px, py] = [X(lerp(WING.le(z), WING.te(z), 0.55), face), Y(z * side)]; insignia(Wg, px, py, 52, ay); }
    }

    /* stabilators */
    const St = sheet(1024, 512);
    {
      const X = (x, face) => face * 512 + (x - STAB_X[0]) / (STAB_X[1] - STAB_X[0]) * 512, Y = z => (z / STAB_Z + 1) / 2 * 512;
      const ay = (512 / (2 * STAB_Z)) / (512 / (STAB_X[1] - STAB_X[0]));
      for (const face of [0, 1]) for (const side of [1, -1]) {
        const P = (x, z) => [X(x, face), Y(z * side)];
        for (let k = 0; k < 3; k++) { const z = 1.4 + rnd() * 2.8; const [px, py] = P(lerp(STAB.le(z), STAB.te(z), rnd()), z); blob(St, px, py, 40 + rnd() * 40, ay); }
        const span = []; for (let z = 1.2; z <= 4.421; z += 0.08) span.push(z);
        poly(St, [...span.map(z => P(STAB.le(z), z)), ...span.slice().reverse().map(z => P(STAB.le(z) - 0.15, z))], LIV.trim);
        poly(St, [...span.map(z => P(STAB.te(z), z)), ...span.slice().reverse().map(z => P(STAB.te(z) + 0.07, z))], LIV.trim);
        poly(St, [P(STAB.le(4.42), 4.42), P(STAB.te(4.42), 4.42), P(STAB.te(4.3), 4.3), P(STAB.le(4.3), 4.3)], LIV.trim);
        line(St, span.filter(z => z < 4.2).map(z => P(lerp(STAB.le(z), STAB.te(z), 0.35), z)));
      }
    }

    /* fins */
    const Fn = sheet(1024, 1024);
    {
      const X = (x, face) => face * 512 + (x - FIN_X[0]) / (FIN_X[1] - FIN_X[0]) * 512, Y = s => (1 - s / FIN_S) * 1024;
      const ay = (1024 / FIN_S) / (512 / (FIN_X[1] - FIN_X[0]));
      for (const face of [0, 1]) {
        const P = (x, s) => [X(x, face), Y(s)];
        for (let k = 0; k < 3; k++) { const s = 0.3 + rnd() * 1.9; const [px, py] = P(lerp(FIN.le(s), FIN.te(s), rnd()), s); blob(Fn, px, py, 45 + rnd() * 45, ay); }
        const span = []; for (let s = 0; s <= 2.451; s += 0.05) span.push(s);
        poly(Fn, [...span.map(s => P(FIN.le(s), s)), ...span.slice().reverse().map(s => P(FIN.le(s) - 0.15, s))], LIV.trim);
        poly(Fn, [...span.map(s => P(FIN.te(s), s)), ...span.slice().reverse().map(s => P(FIN.te(s) + 0.06, s))], LIV.trim);
        poly(Fn, [P(FIN.le(2.45), 2.45), P(FIN.te(2.45), 2.45), P(FIN.te(2.36), 2.36), P(FIN.le(2.36), 2.36)], LIV.trim);
        line(Fn, span.filter(s => s > 0.3).map(s => P(lerp(FIN.le(s), FIN.te(s), 0.2), s)));
        // tail code and squadron, as worn by Langley's 27th Fighter Squadron
        const cx = X(-6.25, face);
        label(Fn, 'FF', cx, Y(1.22), 86, ay, 800);
        label(Fn, '27th FS', cx, Y(0.72), 24, ay, 700);
        label(Fn, 'AF 09-4191', cx, Y(0.48), 15, ay, 600);
      }
    }

    /* intakes: light grey lip trim */
    const In = sheet(512, 64);
    poly(In, [[0, 0], [16, 0], [16, 64], [0, 64]], LIV.trim);
    line(In, [[17, 0], [17, 64]]);

    const tex = (S, wrap) => {
      const make = (cv, srgb) => {
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        return t;
      };
      return { map: make(S.c, true), bump: make(S.cb, false) };
    };
    return (livCache[scale] = { body: tex(B), wing: tex(Wg), stab: tex(St), fin: tex(Fn), intake: tex(In) });
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

  // AIM-9X Sidewinder, nose along +x, length 3.0 m
  let aim9Geo = null;
  function aim9Geometry() {
    if (aim9Geo) return aim9Geo;
    const parts = [];
    const body = new THREE.CylinderGeometry(0.064, 0.064, 2.7, 12); body.rotateZ(-Math.PI / 2); body.translate(-0.15, 0, 0); parts.push(body);
    const nose = new THREE.SphereGeometry(0.064, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateZ(-Math.PI / 2); nose.translate(1.2, 0, 0); parts.push(nose);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const strake = new THREE.BoxGeometry(0.7, 0.01, 0.05); strake.translate(0.55, 0, 0.09); strake.rotateX(a); parts.push(strake);
      const tail = new THREE.BoxGeometry(0.26, 0.01, 0.16); tail.translate(-1.35, 0, 0.13); tail.rotateX(a); parts.push(tail);
    }
    aim9Geo = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
    aim9Geo.computeVertexNormals();
    return aim9Geo;
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
    const liv = livery(o.anisotropy, o.texScale || 1);
    const Mat = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    // Have Glass paint: low-sheen metallic grey
    const paint = t => new Mat(Object.assign({ color: 0xffffff, map: t.map, bumpMap: t.bump, bumpScale: 0.7,
      metalness: 0.3, roughness: 0.56, envMapIntensity: 0.85, side: THREE.DoubleSide }, o.physical ? { clearcoat: 0.12, clearcoatRoughness: 0.6 } : {}));
    const bodyMat = paint(liv.body), wingMat = paint(liv.wing), stabMat = paint(liv.stab), finMat = paint(liv.fin), intakeMat = paint(liv.intake);
    const skin = new Mat(Object.assign({ color: 0xa3a9ae, map: tex.map, bumpMap: tex.bump, bumpScale: 0.6, metalness: 0.3, roughness: 0.56,
      envMapIntensity: 0.85, side: THREE.DoubleSide }, o.physical ? { clearcoat: 0.12, clearcoatRoughness: 0.6 } : {}));
    const trim = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, metalness: 0.25, roughness: 0.6 });
    const uvBodyUp = (p, a, f) => [BODY_U(p[0]), 1 - f * 0.5], uvBodyLo = (p, a, f) => [BODY_U(p[0]), 0.5 - f * 0.5];
    const planUV = (X, Z) => (p, a, f, j, i, nP) => [(j <= (nP - 1) / 2 ? 0 : 0.5) + (p[0] - X[0]) / (X[1] - X[0]) * 0.5, 1 - (p[2] / Z + 1) / 2];
    const uvWing = planUV(WING_X, WING_Z), uvStab = planUV(STAB_X, STAB_Z);
    const uvFin = (p, a, f, j, i, nP) => { const u = (p[0] - FIN_X[0]) / (FIN_X[1] - FIN_X[0]); return [j <= (nP - 1) / 2 ? (1 - u) * 0.5 : 0.5 + u * 0.5, p[2] / FIN_S]; };
    const uvIntake = (p, a, f, j, i, nP, nR) => [i / (nR - 1), f];
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
      for (const r of [up, mirror(up)]) add(gridGeometry(r, uvBodyUp), bodyMat);
      for (const r of [lo, mirror(lo)]) add(gridGeometry(r, uvBodyLo), bodyMat);
      const last = section(-9.0);
      const half = last.upper.concat(last.lower.slice(1));
      const loop = half.concat(half.slice(1, -1).reverse().map(p => [p[0], p[1], -p[2]]));
      add(capGeometry(loop, p => [p[2], p[1]]), metal);
    }

    // canopy, sill and cockpit
    let canopyPivot = null;
    {
      const rings = [], NC = Math.round(60 * det), M = 28;
      for (let i = 0; i <= NC; i++) {
        const x = lerp(CANOPY_X[0], CANOPY_X[1], i / NC), bw = Math.max(CANOPY_W(x), 0), h = Math.max(CANOPY_H(x), 0), ring = [];
        for (let k = 0; k <= M; k++) {
          const ph = -Math.PI / 2 + Math.PI * k / M, z = bw * Math.sin(ph);
          ring.push([x, upperY(x, z) - 0.03 + h * Math.pow(Math.max(Math.cos(ph), 0), 0.7), z]);
        }
        rings.push(ring);
      }
      // the canopy hinges at its aft end and lifts at the front
      const hx = 2.05, hy = TOP(2.05) - 0.03;
      canopyPivot = new THREE.Group();
      canopyPivot.position.set(hx, hy, 0);
      group.add(canopyPivot);
      const cg = gridGeometry(rings); cg.translate(-hx, -hy, 0);
      const c = new THREE.Mesh(cg, canopyMat);
      c.renderOrder = 2;
      canopyPivot.add(c);
      for (const k of [0, M]) {
        const pts = rings.map(r => new THREE.Vector3(r[k][0] - hx, r[k][1] - hy, r[k][2]));
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.032, 6), trim, canopyPivot);
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
          case 'it': return [x, YS(x) - 0.03, 0.56];
          case 'ot': return [x, lerp(CY(x) - 0.05, YS(x), e), lerp(W(x) - 0.04, 1.0, e)];
          case 'ob': return [x, yb, lerp(W(x) - 0.22, 0.95, e)];
          case 'ib': return [x, yb, 0.56];
        }
      };
      for (const [a, b] of [['it', 'ot'], ['ot', 'ob'], ['ob', 'ib'], ['ib', 'it']]) {
        const rings = [];
        for (let i = 0; i <= N; i++) rings.push([corner(a, i / N), corner(b, i / N)]);
        for (const r of [rings, mirror(rings)]) add(gridGeometry(r, uvIntake), intakeMat);
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
    function piece(rings, mat, parent, mirrorZ, uv) {
      const r = mirrorZ ? mirror(rings) : rings;
      const meshes = [add(gridGeometry(r, uv), mat, parent)];
      for (const ring of [r[0], r[r.length - 1]]) {
        let loop = ring;
        const a = loop[0], b = loop[loop.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4) loop = loop.slice(0, -1);
        meshes.push(add(capGeometry(loop, p => [p[0], p[1]]), mat, parent));
      }
      return meshes;
    }
    const hinged = [];
    // lead = true builds a leading-edge flap ahead of the hinge line, otherwise a trailing-edge surface behind it
    function hingedSurface(pl, z0, z1, c, side, parent, kind, n, { lead = false, mirrorZ = side < 0, mat = wingMat, uv = uvWing } = {}) {
      const hc = lead ? c - 0.005 : c + 0.005;
      const p0 = hingePoint(pl, z0, hc), p1 = hingePoint(pl, z1, hc);
      if (mirrorZ) { p0[2] = -p0[2]; p1[2] = -p1[2]; }
      const pivot = new THREE.Group();
      pivot.position.set(...p0);
      parent.add(pivot);
      const rings = lead ? liftingRings(pl, z0, z1, 0, hc, n, 10) : liftingRings(pl, z0, z1, hc, 1, n, 12);
      for (const m of piece(rings, mat, pivot, mirrorZ, uv)) m.geometry.translate(-p0[0], -p0[1], -p0[2]);
      const axis = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
      hinged.push({ pivot, axis, side, kind });
    }

    // wings: fixed structure + flaperon + aileron per side
    const HC = 0.775;
    for (const side of [1, -1]) {
      const mz = side < 0;
      piece(liftingRings(WING, 1.2, 1.95, 0, 1, 3), wingMat, group, mz, uvWing);
      piece(liftingRings(WING, 1.95, 6.3, 0.125, HC, Math.round(16 * det)), wingMat, group, mz, uvWing);
      piece(liftingRings(WING, 6.3, 6.78, 0, 1, 3), wingMat, group, mz, uvWing);
      hingedSurface(WING, 1.97, 6.28, 0.125, side, group, 'lef', 8, { lead: true });
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
      for (const m of piece(liftingRings(STAB, 1.2, 4.42, 0, 1, 10), stabMat, pivot, side < 0, uvStab)) m.geometry.translate(-piv[0], -piv[1], -piv[2]);
      stabs.push({ pivot, side });
    }

    // canted vertical tails with rudders
    for (const side of [1, -1]) {
      const cant = new THREE.Group();
      cant.position.set(0, 0.1, 1.22 * side);
      cant.rotation.x = 28 * D2R * side;
      group.add(cant);
      const frame = new THREE.Group();
      frame.rotation.x = -Math.PI / 2;
      cant.add(frame);
      piece(liftingRings(FIN, 0, 0.36, 0, 1, 2), finMat, frame, false, uvFin);
      piece(liftingRings(FIN, 0.36, 2.2, 0, 0.69, 10), finMat, frame, false, uvFin);
      piece(liftingRings(FIN, 2.2, 2.45, 0, 1, 2), finMat, frame, false, uvFin);
      hingedSurface(FIN, 0.38, 2.17, 0.69, side, frame, 'rudder', 6, { mirrorZ: false, mat: finMat, uv: uvFin });
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
        const wall = add(new THREE.BoxGeometry(0.6, 0.74, 0.03), skin);
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
        const flap = add(new THREE.BoxGeometry(0.6, 0.035, 0.97), skin, hinge);
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

    // side weapons bays on the outer intake walls, each with an AIM-9X on a swing-out launcher
    const sideBays = [];
    if (o.bay) {
      const g9 = aim9Geometry(), xf = 2.15, xa = 0.45;
      for (const side of [1, -1]) {
        const wall = (x, t) => new THREE.Vector3(x, lerp(CY(x) - 0.05, -1.08, t), lerp(W(x) - 0.04, W(x) - 0.22, t) * side);
        const xm = (xf + xa) / 2;
        const top = wall(xm, 0), bot = wall(xm, 1);
        const d = bot.clone().sub(top);
        const n = new THREE.Vector3(0, d.z, -d.y).multiplyScalar(side).normalize(); // outward wall normal
        const quad = (off, t0, t1) => {
          const pts = [wall(xf, t0), wall(xa, t0), wall(xa, t1), wall(xf, t1)].map(p => p.addScaledVector(n, off));
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(p => [p.x, p.y, p.z]), 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(pts.flatMap(p => [p.x * S, p.y * S]), 2));
          g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
          return { g, pts };
        };
        const recess = quad(0.006, 0.3, 0.86);
        add(recess.g, dark);
        const door = quad(0.016, 0.3, 0.86);
        const A = door.pts[0], B = door.pts[1];
        const pivot = new THREE.Group();
        pivot.position.copy(A);
        door.g.translate(-A.x, -A.y, -A.z);
        add(door.g, skin, pivot);
        group.add(pivot);
        const axis = B.clone().sub(A).normalize();
        const msl = add(g9, missileMat);
        const centre = wall(xm - 0.1, 0.6).addScaledVector(n, 0.02);
        msl.visible = false;
        sideBays.push({ pivot, axis, side, msl, centre, n });
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
      group, skin, materials: { skin, bodyMat, wingMat, finMat, stabMat, metal, dark, gearMat, canopyMat, missileMat },
      wireMats: [skin, bodyMat, wingMat, finMat, stabMat, intakeMat, metal, burnt, gearMat],
      plumeMats, legs, doors, bayMissiles,
      gear: 0, bay: 0, sideBay: 0,
      setCanopy(v) { if (canopyPivot) canopyPivot.rotation.z = v * 0.45; },
      // v: 0 closed, 1 open with launcher swung out; armed: AIM-9X left in bays (2 = both, 1 = right only)
      setSideBay(v, armed = 2) {
        api.sideBay = v;
        const open = smooth(0, 0.5, v), ext = smooth(0.35, 1, v);
        for (const b of sideBays) {
          b.pivot.quaternion.setFromAxisAngle(b.axis, open * 1.7 * b.side);
          const has = b.side > 0 ? armed >= 1 : armed >= 2;
          b.msl.visible = v > 0.06 && has;
          b.msl.position.copy(b.centre).addScaledVector(b.n, 0.08 + ext * 0.55);
          b.msl.position.y -= ext * 0.18;
        }
      },
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
      // pitch +1 nose up, roll +1 right wing down, yaw +1 nose right; flap, lef (leading-edge droop) and brake 0..1.
      // The F-22 has no speedbrake panel: it raises both ailerons, drops the flaperons and splays the rudders.
      pose({ pitch = 0, roll = 0, yaw = 0, flap = 0, lef = 0, brake = 0, vector = pitch } = {}) {
        for (const s of stabs) s.pivot.rotation.z = -(pitch * 0.32 + roll * 0.12 * s.side);
        for (const h of hinged) {
          let ang = 0;
          if (h.kind === 'flaperon') ang = -(roll * 0.28 * h.side - flap * 0.35 - brake * 0.45) * h.side;
          else if (h.kind === 'aileron') ang = -(roll * 0.4 * h.side + brake * 0.55) * h.side;
          else if (h.kind === 'rudder') ang = yaw * 0.35 + brake * 0.42 * h.side;
          else if (h.kind === 'lef') ang = -lef * 0.42 * h.side;
          h.pivot.quaternion.setFromAxisAngle(h.axis, ang);
        }
        for (const v of vectors) v.rotation.z = -clamp(vector, -1, 1) * 0.35;
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

  const kit = { curve, gridGeometry, capGeometry, mirror, liftingRings, naca, plumeMaterial, skinTextures, sawDoorGeometry, lerp, clamp, smooth, S };
  return { build, bake, missileGeometry, aim9Geometry, kit, GROUND, TOP, BOT, W, upperY };
})();
