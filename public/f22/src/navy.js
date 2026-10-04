/* Procedural warships and naval aircraft for 南海决战.
   Ship frame: +x bow, +y up (waterline at 0), +z starboard, metres. Aircraft frame as elsewhere: +x nose.
   Navy.ship(cls) returns { group, spec } (group already baked to one mesh per material).
   Navy.plane(type) returns { obj, exhausts, radius }.
   Expects THREE, mergeGeometries, F22 and Craft in scope. */
const Navy = (() => {
  const { curve, gridGeometry, capGeometry, lerp, clamp, smooth } = F22.kit;
  const D2R = Math.PI / 180;

  /* ---------- shared materials ---------- */
  const tex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const noisy = (g, w, h, base, n = 0.05) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 24; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * n})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  };
  const vlsTex = tex(128, 128, (g, w, h) => {
    noisy(g, w, h, '#4b5054', 0.06);
    g.strokeStyle = 'rgba(20,22,24,0.85)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
    g.fillStyle = 'rgba(90,96,100,0.8)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.fillRect(i * 16 + 4, j * 16 + 4, 8, 8);
  });
  vlsTex.wrapS = vlsTex.wrapT = THREE.RepeatWrapping;
  const padTex = tex(256, 256, (g, w, h) => {
    noisy(g, w, h, '#4a4e52', 0.05);
    g.strokeStyle = '#e8e8e2'; g.lineWidth = 6;
    g.beginPath(); g.arc(128, 128, 90, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#e3c23a'; g.lineWidth = 4; g.beginPath(); g.moveTo(128, 10); g.lineTo(128, 246); g.stroke();
    g.fillStyle = '#e8e8e2'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 128, 132);
  });
  function mats(side) {
    const grey = side === 'cn' ? 0x9aa3a8 : 0x878e94;
    const M = {
      hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.15 }),
      grey: new THREE.MeshStandardMaterial({ color: grey, roughness: 0.68, metalness: 0.15 }),
      light: new THREE.MeshStandardMaterial({ color: side === 'cn' ? 0xb4bcc1 : 0x9ca3a8, roughness: 0.66, metalness: 0.12 }),
      deck: new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.9, metalness: 0.05 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.8, metalness: 0.2 }),
      panel: new THREE.MeshStandardMaterial({ color: side === 'cn' ? 0x5d666e : 0x676e74, roughness: 0.5, metalness: 0.3 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe9ebec, roughness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1b2833, roughness: 0.1, metalness: 0.7 }),
      vls: new THREE.MeshStandardMaterial({ map: vlsTex, roughness: 0.8 }),
      pad: new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }),
      red: new THREE.MeshStandardMaterial({ color: 0x7a2d24, roughness: 0.8 })
    };
    for (const m of Object.values(M)) m.side = THREE.DoubleSide;
    return M;
  }

  /* ---------- geometry helpers ---------- */
  // frustum block: bottom l0 x w0 at y0, top l1 x w1 at y0 + h, centred on (x, z); top may be shifted aft by sx
  function block(x, z, l0, w0, l1, w1, y0, h, sx = 0) {
    const b = [[l0 / 2, -w0 / 2], [l0 / 2, w0 / 2], [-l0 / 2, w0 / 2], [-l0 / 2, -w0 / 2]];
    const t = [[l1 / 2 + sx, -w1 / 2], [l1 / 2 + sx, w1 / 2], [-l1 / 2 + sx, w1 / 2], [-l1 / 2 + sx, -w1 / 2]];
    const v = [...b.map(([a, c]) => [x + a, y0, z + c]), ...t.map(([a, c]) => [x + a, y0 + h, z + c])];
    const f = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [3, 2, 1, 0]];
    const pos = [];
    for (const [a, b2, c, d] of f) pos.push(...v[a], ...v[c], ...v[b2], ...v[a], ...v[d], ...v[c]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  const cyl = (r0, r1, h, x, y, z, seg = 12, axis = 'y') => {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z); return g;
  };
  const box = (l, h, w, x, y, z) => { const g = new THREE.BoxGeometry(l, h, w); g.translate(x, y, z); return g; };
  const plate = (l, w, x, y, z) => { const g = new THREE.PlaneGeometry(l, w); g.rotateX(-Math.PI / 2); g.translate(x, y, z); return g; };
  // octagonal radar array on a face; normal given by yaw (around y) and tilt back from vertical
  function array(r, x, y, z, yaw, tilt = 12 * D2R, sides = 8) {
    const g = new THREE.CircleGeometry(r, sides, Math.PI / sides);
    g.rotateY(Math.PI / 2); g.rotateZ(tilt); g.rotateY(yaw);
    g.translate(x, y, z); return g;
  }

  /* ---------- hull ---------- */
  // L length, B waterline beam, T draft, fb(u) freeboard, hw(u) half-beam fraction, flare(u) extra deck half-beam
  function hull(o) {
    const { L, B, T } = o, N = 64, K = 9;
    const rings = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = -L / 2 + u * L;
      const hw = Math.max(o.hw(u) * B / 2, 0.05), hd = hw + o.flare(u) * B / 2, deck = o.fb(u), keel = -T * (u > 0.93 ? lerp(1, 0.25, (u - 0.93) / 0.07) : u < 0.06 ? lerp(0.45, 1, u / 0.06) : 1);
      const half = [];
      for (let k = 0; k <= K; k++) {
        const t = k / K;
        let y, z;
        if (t < 0.45) { const s = t / 0.45; y = lerp(deck, 0, s); z = lerp(hd, hw, s); }
        else { const s = (t - 0.45) / 0.55; y = lerp(0, keel, s); z = hw * Math.pow(Math.max(0, 1 - Math.pow(s, 2.6)), 1 / 2.6); }
        // raked stem
        const rake = u > 0.86 ? Math.pow((u - 0.86) / 0.14, 2) * (y - keel) * o.rake : 0;
        half.push([x + rake, y, z]);
      }
      const r = half.map(p => [p[0], p[1], -p[2]]).concat(half.slice(0, -1).reverse());
      rings.push(r);
    }
    const g = gridGeometry(rings);
    // boot topping: red antifouling below the line, black band at the waterline, grey topsides
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const grey = new THREE.Color(o.grey), red = new THREE.Color(0x6e2a22), black = new THREE.Color(0x1d1f21), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.copy(y < -0.4 ? red : y < 0.9 ? black : grey);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // deck: triangulate the deck-edge outline
    const edge = [];
    for (const r of rings) edge.push(r[r.length - 1]);
    for (let i = rings.length - 1; i >= 0; i--) edge.push(rings[i][0]);
    const deck = capGeometry(edge.slice(0, -1), p => [p[0], p[2]]);
    const stern = capGeometry(rings[0].slice(0, -1), p => [p[2], p[1]]);
    return { hull: g, deck, stern, rings };
  }
  // hull number painted on both bows
  function hullNumber(text, x, y, z0, flare, h = 3.2) {
    const t = tex(256, 96, (g, w, hh) => {
      g.clearRect(0, 0, w, hh); g.font = 'bold 76px "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(text, w / 2 + 3, hh / 2 + 3); g.fillStyle = '#f2f2ee'; g.fillText(text, w / 2, hh / 2);
    });
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    const out = [];
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(h * 2.6, h);
      if (s < 0) g.rotateY(Math.PI);
      g.rotateX(-s * flare);
      g.translate(x, y, (z0 + 0.12) * s);
      out.push([g, mat]);
    }
    return out;
  }

  /* ---------- assembling ---------- */
  function assemble(parts) {
    const buckets = new Map();
    for (const [geo, mat] of parts) {
      let g = geo.index ? geo.toNonIndexed() : geo;
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const needC = !!mat.vertexColors;
      if (needC && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.6), 3));
      if (!needC && g.attributes.color) g.deleteAttribute('color');
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(g);
    }
    const group = new THREE.Group();
    for (const [mat, list] of buckets) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = m.receiveShadow = true;
      if (mat.transparent) m.renderOrder = 1;
      group.add(m);
    }
    return group;
  }

  // common fittings
  function gun130(P, M, x, deck, big = 1) {
    P.push([block(x, 0, 5.6 * big, 4.4 * big, 3.4 * big, 3.2 * big, deck, 2.4 * big, -0.6), M.grey]);
    P.push([cyl(0.18 * big, 0.24 * big, 7 * big, x + 4.6 * big, deck + 1.3 * big, 0, 8, 'x'), M.grey]);
  }
  function ciws(P, M, x, y, z, style) {
    if (style === 'phalanx') {
      P.push([cyl(0.9, 1.1, 1.4, x, y + 0.7, z, 12), M.light]);
      const d = new THREE.SphereGeometry(0.85, 14, 10); d.scale(1, 1.35, 1); d.translate(x, y + 2.4, z); P.push([d, M.white]);
      P.push([cyl(0.12, 0.12, 2.2, x + 1.4, y + 1.5, z, 6, 'x'), M.dark]);
    } else {
      P.push([block(x, z, 2.6, 2.4, 1.8, 1.8, y, 2.2), M.light]);
      P.push([cyl(0.22, 0.22, 3, x + 2, y + 1.3, z, 8, 'x'), M.dark]);
    }
  }
  const vls = (P, M, x, y, l, w) => P.push([(() => { const g = plate(l, w, x, y + 0.06, 0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * l / 4.2, uv.getY(i) * w / 4.2); return g; })(), M.vls]);
  function mast(P, M, x, y, h, w) {
    P.push([block(x, 0, w, w, w * 0.5, w * 0.5, y, h), M.light]);
    P.push([cyl(0.12, 0.12, 6, x, y + h + 3, 0, 6), M.dark]);
    P.push([box(0.3, 0.3, w * 1.8, x, y + h * 0.75, 0), M.dark]);
  }

  /* ---------- surface combatants ---------- */
  const STD_HULL = {
    hw: curve([[0, 0.72], [0.12, 0.92], [0.4, 1], [0.62, 0.97], [0.8, 0.78], [0.92, 0.42], [1, 0.03]]),
    flare: curve([[0, 0.02], [0.5, 0.03], [0.8, 0.1], [0.95, 0.22], [1, 0.06]])
  };
  function combatant(cls) {
    const S = SPECS[cls], M = mats(S.side), P = [];
    const L = S.L, B = S.B;
    const fbK = S.fbK || [[0, 6.5], [0.5, 7], [0.85, 8.6], [1, 9.6]];
    const fbC = curve(fbK), fb = u => fbC(u) * S.fbScale;
    const H = hull({ L, B, T: S.T, fb, hw: STD_HULL.hw, flare: STD_HULL.flare, rake: 0.55, grey: M.grey.color.getHex() });
    P.push([H.hull, M.hull], [H.deck, M.deck], [H.stern, M.grey]);
    const dk = x => fb((x + L / 2) / L);
    const half = x => (STD_HULL.hw((x + L / 2) / L) + STD_HULL.flare((x + L / 2) / L)) * B / 2;
    for (const [g, m] of hullNumber(S.number, L * 0.34, dk(L * 0.34) - 3.1, half(L * 0.34), 0.12, S.side === 'us' ? 3.6 : 3.2)) P.push([g, m]);
    S.build(P, M, dk, L, B);
    const group = assemble(P);
    return { group, spec: S };
  }

  const SPECS = {
    t055: {
      side: 'cn', name: '055 型驱逐舰', short: '055', number: '101', L: 180, B: 20, T: 6.6, fbScale: 1.05,
      build(P, M, dk, L, B) {
        const d0 = dk(60);
        gun130(P, M, 70, dk(70));
        vls(P, M, 50, dk(50), 22, 10);                                  // forward VLS, 64 cells
        P.push([block(41, 0, 5, 8, 4, 7, dk(41), 1.6), M.grey]);        // breakwater
        // integrated superstructure: sloped bridge block and the tall faceted mast carrying the big arrays
        P.push([block(18, 0, 40, 17, 32, 14, dk(18), 9, -1.5), M.grey]);
        P.push([block(23, 0, 18, 13, 13, 9, dk(18) + 9, 9, -1), M.grey]);
        P.push([box(1.2, 1.4, 12.6, 31.5, dk(18) + 7.4, 0), M.glass]);
        P.push([block(20, 0, 11, 9, 5, 4.2, dk(18) + 18, 14, -1), M.grey]);
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const r = yaw === 0 || yaw === Math.PI ? 1 : 0;
          P.push([array(3.6, 23 + Math.cos(yaw) * (r ? 8.2 : 0.2), dk(18) + 13.5, Math.sin(yaw) * 6.1, yaw, 14 * D2R, 4), M.panel]);
          P.push([array(1.7, 21 + Math.cos(yaw) * 3.2, dk(18) + 25, Math.sin(yaw) * 2.5, yaw, 10 * D2R, 4), M.panel]);
        }
        P.push([cyl(0.15, 0.15, 7, 19.5, dk(18) + 35.5, 0, 6), M.dark]);
        // funnel and the aft block with hangar, aft VLS and HHQ-10
        P.push([block(-6, 0, 16, 11, 10, 8, dk(-6), 15, -1.5), M.grey]);
        P.push([box(6, 1.2, 5, -7.5, dk(-6) + 15.4, 0), M.dark]);
        vls(P, M, -23, dk(-23), 14, 9.5);                               // aft VLS, 48 cells
        P.push([block(-45, 0, 26, 16, 24, 14, dk(-45), 8), M.grey]);    // hangar
        P.push([block(-38, 0, 4, 3, 3, 2.6, dk(-45) + 8, 2.6), M.light]); // HHQ-10 launcher
        ciws(P, M, 37, dk(37) + 9, 0, 'type1130');
        P.push([plate(26, 17, -72, dk(-72) + 0.08, 0), M.pad]);
        for (const s of [1, -1]) P.push([cyl(1.1, 1.1, 6, 2, dk(2) + 2, 8.6 * s, 10, 'x'), M.light]); // boats
      }
    },
    t052d: {
      side: 'cn', name: '052D 型驱逐舰', short: '052D', number: '117', L: 157, B: 18, T: 6, fbScale: 0.95,
      build(P, M, dk) {
        gun130(P, M, 60, dk(60), 0.9);
        vls(P, M, 44, dk(44), 12, 8);
        P.push([block(22, 0, 26, 14, 20, 11, dk(22), 10, -1.5), M.grey]);
        P.push([box(1, 1.2, 10, 31.5, dk(22) + 8.4, 0), M.glass]);
        for (const yaw of [Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) P.push([array(2.9, 22 + Math.cos(yaw) * 9.4, dk(22) + 6, Math.sin(yaw) * 6.2, yaw, 15 * D2R, 8), M.panel]);
        mast(P, M, 18, dk(22) + 10, 9, 4);
        P.push([block(-4, 0, 12, 9, 8, 7, dk(-4), 12, -1.5), M.grey]);
        P.push([box(5, 1, 4, -5, dk(-4) + 12.4, 0), M.dark]);
        vls(P, M, -18, dk(-18), 10, 8);
        P.push([block(-36, 0, 18, 13, 16, 12, dk(-36), 7.5), M.grey]);
        ciws(P, M, -28, dk(-36) + 7.5, 0, 'type1130');
        P.push([plate(22, 15, -62, dk(-62) + 0.08, 0), M.pad]);
      }
    },
    t054a: {
      side: 'cn', name: '054A 型护卫舰', short: '054A', number: '569', L: 134, B: 16, T: 5, fbScale: 0.85,
      build(P, M, dk) {
        P.push([block(50, 0, 4, 3, 2.6, 2.4, dk(50), 2, -0.3), M.grey]);
        P.push([cyl(0.13, 0.15, 4, 52.5, dk(50) + 1.1, 0, 8, 'x'), M.grey]);
        vls(P, M, 38, dk(38), 9, 6.5);
        P.push([block(18, 0, 22, 12, 16, 9, dk(18), 9, -1.5), M.grey]);
        P.push([box(1, 1.1, 8.6, 26.5, dk(18) + 7.6, 0), M.glass]);
        mast(P, M, 14, dk(18) + 9, 9, 3.6);
        P.push([block(-4, 0, 11, 8, 7, 6, dk(-4), 11, -1.5), M.grey]);
        for (const s of [1, -1]) P.push([block(4, 2.6 * s, 7, 2.2, 7, 2, dk(4) + 1, 1.6), M.light]); // YJ-83 launchers
        P.push([block(-30, 0, 16, 12, 15, 11, dk(-30), 7), M.grey]);
        ciws(P, M, -22, dk(-30) + 7, 0, 'type1130');
        P.push([plate(20, 13, -52, dk(-52) + 0.08, 0), M.pad]);
      }
    },
    burke: {
      side: 'us', name: '阿利·伯克级驱逐舰', short: 'DDG', number: '125', L: 155, B: 20, T: 6.3, fbScale: 1.0,
      fbK: [[0, 6.2], [0.45, 6.6], [0.8, 8.4], [1, 9.6]],
      build(P, M, dk) {
        gun130(P, M, 58, dk(58), 0.9);
        vls(P, M, 44, dk(44), 9, 7);
        P.push([block(18, 0, 30, 18, 24, 14, dk(18), 11, -1), M.grey]);   // deckhouse carrying the SPY arrays
        P.push([box(1.1, 1.3, 11, 31.4, dk(18) + 9.4, 0), M.glass]);
        for (const yaw of [Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) P.push([array(2.9, 18 + Math.cos(yaw) * 10.8, dk(18) + 6.4, Math.sin(yaw) * 7.4, yaw, 18 * D2R, 8), M.panel]);
        P.push([cyl(0.3, 0.6, 14, 14, dk(18) + 17, 0, 8), M.light]);       // tripod mast
        P.push([box(0.4, 0.4, 7, 14, dk(18) + 19, 0), M.dark]);
        for (const x of [0, -14]) P.push([block(x, 0, 6, 6.5, 5, 5.2, dk(x), 12, -0.5), M.grey], [box(3.2, 1, 4.4, x - 0.3, dk(x) + 12.5, 0), M.dark]);
        P.push([block(-8, 0, 20, 14, 18, 12, dk(-8), 6), M.grey]);
        vls(P, M, -34, dk(-34), 12, 8);
        P.push([block(-48, 0, 14, 16, 13, 15, dk(-48), 6.5), M.grey]);  // twin hangars
        ciws(P, M, 30, dk(18) + 11, 0, 'phalanx');
        ciws(P, M, -46, dk(-48) + 6.5, 0, 'phalanx');
        for (const s of [1, -1]) P.push([block(-24, 2.6 * s, 6, 2, 6, 1.8, dk(-24) + 0.5, 1.4), M.light]); // Harpoon racks
        P.push([plate(18, 15, -66, dk(-66) + 0.08, 0), M.pad]);
      }
    },
    tico: {
      side: 'us', name: '提康德罗加级巡洋舰', short: 'CG', number: '52', L: 173, B: 17, T: 6.8, fbScale: 1.0,
      fbK: [[0, 6.2], [0.45, 6.4], [0.8, 8.2], [1, 9.4]],
      build(P, M, dk) {
        gun130(P, M, 68, dk(68), 0.9); gun130(P, M, -70, dk(-70), 0.9);
        vls(P, M, 54, dk(54), 10, 7); vls(P, M, -56, dk(-56), 10, 7);
        P.push([block(26, 0, 30, 14, 24, 12, dk(26), 12, -1), M.grey]);
        P.push([box(1, 1.3, 9, 38.4, dk(26) + 10.4, 0), M.glass]);
        for (const s of [1, -1]) P.push([array(2.8, 30, dk(26) + 7, 6.8 * s, s * Math.PI / 4, 12 * D2R, 8), M.panel]);
        P.push([cyl(0.3, 0.6, 16, 20, dk(26) + 19, 0, 8), M.light]);
        for (const x of [6, -10]) P.push([block(x, 0, 7, 6, 6, 5, dk(x), 11, -0.5), M.grey], [box(3.2, 1, 4, x - 0.3, dk(x) + 11.5, 0), M.dark]);
        P.push([block(-26, 0, 22, 13, 18, 11, dk(-26), 11), M.grey]);
        for (const s of [1, -1]) P.push([array(2.8, -30, dk(-26) + 7, 6.2 * s, s * 3 * Math.PI / 4, 12 * D2R, 8), M.panel]);
        ciws(P, M, 14, dk(14) + 12, 5, 'phalanx'); ciws(P, M, -40, dk(-26) + 11, -4, 'phalanx');
      }
    }
  };

  /* ---------- carriers ---------- */
  // flight deck outline (x, z) for a CATOBAR deck with the angled landing area to port
  const CARRIERS = {
    fujian: {
      side: 'cn', name: '福建舰', short: 'CV-18', number: '18', L: 316, B: 40, T: 11, deckY: 20, deckW: 76,
      deck: [[160, 0], [150, 14], [118, 20], [40, 22], [-40, 24], [-110, 24], [-150, 20], [-156, 10], [-156, -14], [-140, -26], [-80, -36], [-10, -40], [40, -34], [80, -26], [120, -16], [150, -8]],
      island: { x: -8, z: 22, l: 30, w: 10, h: 16 },
      cats: [{ x0: 95, x1: 155, z: 9, a: 0 }, { x0: 95, x1: 152, z: -5, a: -0.04 }, { x0: -40, x1: 45, z: -20, a: -0.16 }],
      land: { x: -150, z: 8, a: -0.157, wires: [36, 48, 60] },
      elevators: [[10, 26], [-60, 26]]
    },
    ford: {
      side: 'us', name: '福特号', short: 'CVN-78', number: '78', L: 333, B: 41, T: 12, deckY: 20, deckW: 78,
      deck: [[168, 0], [160, 16], [120, 22], [40, 22], [-60, 26], [-130, 26], [-160, 20], [-166, 10], [-166, -12], [-150, -24], [-90, -34], [-20, -40], [40, -36], [90, -28], [130, -18], [160, -8]],
      island: { x: -62, z: 23, l: 26, w: 9, h: 18 },
      cats: [{ x0: 100, x1: 162, z: 9, a: 0 }, { x0: 100, x1: 160, z: -4, a: -0.03 }, { x0: -50, x1: 40, z: -18, a: -0.16 }, { x0: -60, x1: 30, z: -30, a: -0.16 }],
      land: { x: -158, z: 7, a: -0.157, wires: [38, 50, 62] },
      elevators: [[20, 27], [-110, 27], [-120, -30]]
    }
  };
  function carrier(cls) {
    const S = CARRIERS[cls], M = mats(S.side), P = [];
    const L = S.L, B = S.B, Y = S.deckY;
    const H = hull({ L, B, T: S.T, fb: u => lerp(15, 17, u), hw: curve([[0, 0.8], [0.15, 0.97], [0.5, 1], [0.75, 0.95], [0.9, 0.6], [1, 0.05]]),
      flare: curve([[0, 0.05], [0.5, 0.06], [0.85, 0.2], [1, 0.1]]), rake: 0.4, grey: M.grey.color.getHex() });
    P.push([H.hull, M.hull], [H.stern, M.grey]);
    // gallery deck: the flight deck outline extruded down to the hull
    const shape = new THREE.Shape(S.deck.map(([x, z]) => new THREE.Vector2(x, z)));
    const slab = new THREE.ExtrudeGeometry(shape, { depth: Y - 14.5, bevelEnabled: false });
    slab.rotateX(Math.PI / 2); slab.translate(0, Y, 0);
    P.push([slab, M.grey]);
    // flight deck surface with markings
    const minX = Math.min(...S.deck.map(p => p[0])), maxX = Math.max(...S.deck.map(p => p[0]));
    const minZ = Math.min(...S.deck.map(p => p[1])), maxZ = Math.max(...S.deck.map(p => p[1]));
    const W = maxX - minX, D = maxZ - minZ;
    const px = x => (x - minX) / W * 2048, pz = z => (z - minZ) / D * 512;
    const deckTex = tex(2048, 512, (g) => {
      noisy(g, 2048, 512, '#4c5054', 0.07);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(20,20,20,${rnd() * 0.08})`; g.fillRect(rnd() * 2048, rnd() * 512, rr(30, 200), rr(4, 30)); }
      const line = (x0, z0, x1, z1, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.moveTo(px(x0), pz(z0)); g.lineTo(px(x1), pz(z1)); g.stroke(); g.setLineDash([]); };
      // angled deck landing area edges and centreline
      const la = S.land, ca = Math.cos(la.a), sa = Math.sin(la.a);
      const along = (s, off) => [la.x + ca * s - sa * off, la.z + sa * s + ca * off];
      for (const off of [-12, 12]) { const a = along(0, off), b = along(230, off); line(a[0], a[1], b[0], b[1], '#eeeeea', 4); }
      { const a = along(0, 0), b = along(230, 0); line(a[0], a[1], b[0], b[1], '#eeeeea', 3, [26, 18]); }
      for (const w of la.wires) { const a = along(w, -13), b = along(w, 13); line(a[0], a[1], b[0], b[1], '#c8c4b8', 3); }
      // foul line and catapult tracks
      for (const c of S.cats) {
        const dx = Math.cos(c.a), dz = Math.sin(c.a);
        line(c.x0, c.z, c.x1, c.z + dz * (c.x1 - c.x0), '#2b2d30', 5);
        line(c.x0, c.z + 3, c.x1, c.z + 3 + dz * (c.x1 - c.x0), '#e3c23a', 1.5, [10, 10]);
        g.fillStyle = 'rgba(30,32,34,0.9)'; g.fillRect(px(c.x0 - 6), pz(c.z - 4), px(6) - px(0), pz(8) - pz(0)); // jet blast deflector
      }
      line(maxX - 6, 0, minX + 30, 0, 'rgba(238,238,234,0.6)', 2, [16, 22]);
      for (const [ex, ez] of S.elevators) { g.strokeStyle = 'rgba(230,230,225,0.6)'; g.lineWidth = 2; g.strokeRect(px(ex - 10), pz(ez - 9), px(20) - px(0), pz(18) - pz(0)); }
      // deck number at the bow, read from astern
      g.save(); g.translate(px(maxX - 50), pz(0)); g.rotate(Math.PI / 2);
      g.fillStyle = '#eeeeea'; g.font = 'bold 150px "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(S.number, 0, 0); g.restore();
    });
    const top = new THREE.ShapeGeometry(shape);
    top.rotateX(Math.PI / 2); top.translate(0, Y + 0.05, 0);
    const uv = top.attributes.uv, pos = top.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - minX) / W, 1 - (pos.getZ(i) - minZ) / D);
    const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.92, side: THREE.DoubleSide });
    P.push([top, deckMat]);
    // island with its phased-array faces
    const I = S.island;
    P.push([block(I.x, I.z, I.l, I.w, I.l * 0.8, I.w * 0.8, Y, I.h, -1), M.grey]);
    P.push([block(I.x - 1, I.z, I.l * 0.55, I.w * 0.7, I.l * 0.35, I.w * 0.5, Y + I.h, I.h * 0.55, -1), M.grey]);
    P.push([box(0.9, 1.6, I.w * 0.82, I.x + I.l * 0.42, Y + I.h - 2, I.z), M.glass]);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) P.push([array(2.8, I.x - 1 + Math.cos(yaw) * I.l * 0.33, Y + I.h * 1.05, I.z + Math.sin(yaw) * I.w * 0.33, yaw, 12 * D2R, S.side === 'cn' ? 4 : 8), M.panel]);
    P.push([cyl(0.2, 0.3, 12, I.x - 2, Y + I.h * 1.55 + 6, I.z, 6), M.dark]);
    for (const [g, m] of hullNumber(S.number, L * 0.36, 11, B / 2 * 1.02, 0.08, 5)) P.push([g, m]);
    // sponson CIWS / point defence
    ciws(P, M, 120, Y - 2, 18, S.side === 'us' ? 'phalanx' : 'type1130');
    ciws(P, M, -140, Y - 2, -18, S.side === 'us' ? 'phalanx' : 'type1130');
    ciws(P, M, -120, Y - 2, 24, S.side === 'us' ? 'phalanx' : 'type1130');
    const group = assemble(P);
    return { group, spec: S };
  }
  function rr(a, b) { return a + rnd() * (b - a); }

  /* ---------- naval aircraft ---------- */
  const tint = (obj, color) => obj.traverse(m => { if (m.isMesh && m.material && m.material.color && !m.material.transparent) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(color)); } });
  function stealth(scale, color) {
    const api = F22.build({ physical: false, detail: 0.55, gear: false, cockpit: true, bay: false, lights: true, plumes: false, shadows: false, anisotropy: 4 });
    const g = F22.bake(api);
    tint(g, color);
    g.scale.setScalar(scale);
    return { obj: g, exhausts: [[-9.9 * scale, -0.15 * scale, 0.62 * scale], [-9.9 * scale, -0.15 * scale, -0.62 * scale]], radius: 7 * scale };
  }
  const HORNET = {
    k: 0.86, paint: 'usn', color: 0xb9c0c6, nose: 11, tail: -9.6, booms: false, ventral: false, pylons: [3.4, 5.0], hook: true,
    W: [[11, 0], [10.4, 0.24], [9.5, 0.44], [8.5, 0.55], [7.5, 0.62], [6, 0.7], [4.5, 0.82], [3, 0.95], [1.5, 1.05], [0, 1.1], [-2, 1.05], [-4, 0.9], [-6, 0.7], [-8, 0.46], [-9.6, 0.14]],
    TOP: [[11, 0], [10.4, 0.2], [9.5, 0.38], [8.5, 0.54], [7.5, 0.7], [6, 0.82], [4.5, 0.95], [3, 1.12], [1.5, 1.15], [0, 1.05], [-2, 0.92], [-4, 0.8], [-6, 0.62], [-8, 0.42], [-9.6, 0.14]],
    BOT: [[11, 0], [10.4, -0.2], [9.5, -0.38], [8.5, -0.5], [7.5, -0.58], [6, -0.62], [4.5, -0.58], [3, -0.48], [1.5, -0.36], [0, -0.28], [-4, -0.22], [-8, -0.16], [-9.6, -0.05]],
    canopy: [8.6, 5.2, 0.44, 0.62], lerx: [9.0, 1.2, 2.2, -0.6],
    wing: { root: 2.0, tip: 7.6, le: 0.9, te: -3.4, teSlope: 0.12, sweep: 28 },
    nacelle: { z: 0.9, y: -0.48, x0: 3.6, x1: -7.9 },
    fin: { z: 1.45, y: 0.1, le: -2.6, te: -6.2, h: 3.3, sLE: 40, sTE: -10, cant: 20 },
    stab: { z0: 1.7 }
  };
  const SHARK = Object.assign({}, Craft.FLANKER, { paint: 'plan', color: 0xb7c1ca, hook: true, pylons: [4.1, 5.6],
    canard: { z0: 1.0, z1: 3.1, le: 7.4, y: 0.35 } });
  // turboprop AEW: high straight wing, rotodome, twin or quad fins
  function aew(side) {
    const M = Craft.materials(side === 'us' ? 'usn' : 'plan', side === 'us' ? 0xc7ccd1 : 0xc2cad2, 4), group = new THREE.Group(), add = Craft.adder(group);
    const body = new THREE.CylinderGeometry(1.0, 0.75, 17, 16); body.rotateZ(-Math.PI / 2); body.translate(0, 0, 0); add(body, M.skin);
    const nose = new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateZ(-Math.PI / 2); nose.scale(1.6, 1, 1); nose.translate(8.5, 0, 0); add(nose, M.skin);
    const tail = new THREE.ConeGeometry(0.75, 3, 14); tail.rotateZ(Math.PI / 2); tail.translate(-10, 0.3, 0); add(tail, M.skin);
    const wing = new THREE.BoxGeometry(2.4, 0.3, 24.6); wing.translate(1.5, 0.9, 0); add(wing, M.skin);
    for (const s of [1, -1]) {
      const nac = new THREE.CylinderGeometry(0.55, 0.45, 5, 12); nac.rotateZ(-Math.PI / 2); nac.translate(2.2, 0.5, 4 * s); add(nac, M.skin);
      const disc = new THREE.CircleGeometry(2.1, 24); disc.rotateY(Math.PI / 2); disc.translate(4.85, 0.5, 4 * s);
      add(disc, new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    }
    const stab = new THREE.BoxGeometry(1.8, 0.2, 7.8); stab.translate(-10.4, 1.1, 0); add(stab, M.skin);
    for (const z of side === 'us' ? [-3.9, -1.3, 1.3, 3.9] : [-3.9, 3.9]) { const f = new THREE.BoxGeometry(2, 3.2, 0.2); f.translate(-10.6, 2.6, z); add(f, M.skin); }
    for (const s of [1, -1]) { const st = new THREE.CylinderGeometry(0.12, 0.12, 2, 6); st.translate(-1.5, 1.9, 0.6 * s); add(st, M.dark); }
    const dome = new THREE.CylinderGeometry(3.6, 3.6, 0.7, 32); dome.translate(-1.5, 3.1, 0); add(dome, M.white);
    const stripe = new THREE.CylinderGeometry(3.62, 3.62, 0.18, 32); stripe.translate(-1.5, 3.1, 0); add(stripe, side === 'us' ? M.dark : M.dark);
    const cp = new THREE.BoxGeometry(1.4, 0.5, 1.4); cp.translate(7.6, 0.85, 0); add(cp, M.glass);
    return { obj: F22.bake({ group }), exhausts: [[-0.6, 0.5, 4], [-0.6, 0.5, -4]], radius: 12 };
  }
  // Tu-16 layout medium bomber
  function h6k() {
    const M = Craft.materials('h6', 0xe6e9ec, 4), group = new THREE.Group(), add = Craft.adder(group);
    const W = curve([[17, 0], [16, 0.8], [13, 1.4], [8, 1.65], [0, 1.7], [-8, 1.5], [-14, 1.0], [-17, 0.4]]);
    Craft.body(add, M.skin, W, curve([[17, 0], [16, 0.8], [13, 1.4], [8, 1.7], [0, 1.7], [-8, 1.5], [-14, 1.1], [-17, 0.5]]), curve([[17, 0], [16, -0.8], [12, -1.5], [0, -1.6], [-10, -1.3], [-17, -0.4]]), 17, -17, 2.2, 60, 20);
    Craft.surface(add, M.skin, { le: z => 3.5 - (z - 1.5) * Math.tan(37 * D2R), te: z => -3.8 - (z - 1.5) * Math.tan(22 * D2R), th: Craft.lin(1.5, 16.5, 0.9, 0.18), y: z => -0.3 - (z - 1.5) * 0.04 }, 1.5, 16.5, 10);
    const exhausts = [];
    for (const s of [1, -1]) {
      const n = new THREE.CylinderGeometry(1.0, 0.85, 10, 16); n.rotateZ(-Math.PI / 2); n.translate(0.2, -0.3, 2.4 * s); add(n, M.skin);
      Craft.nozzle(add, M, -4.8, -5.6, -0.3, 2.4 * s, 0.8, 0.7);
      exhausts.push([-5.7, -0.3, 2.4 * s]);
      // YJ-12 under the wing
      const m = new THREE.CylinderGeometry(0.33, 0.33, 7, 10); m.rotateZ(-Math.PI / 2); m.translate(-1, -1.3, 7 * s); add(m, M.white);
    }
    Craft.fins(add, M.skin, group, { z: 0, y: 1.2, le: -9.5, te: -15, h: 6, sLE: 42, sTE: 10, th0: 0.45, th1: 0.12 });
    Craft.surface(add, M.skin, { le: Craft.lin(0.5, 6, -12.8, -16), te: Craft.lin(0.5, 6, -16.8, -17.8), th: Craft.lin(0.5, 6, 0.3, 0.1), y: () => 0.6 }, 0.5, 6, 6);
    const glass = new THREE.SphereGeometry(1.0, 12, 8); glass.scale(1.6, 0.9, 1.0); glass.translate(15.4, 0, 0); add(glass, M.glass);
    return { obj: F22.bake({ group }), exhausts, radius: 15 };
  }
  const cache = {};
  function plane(type) {
    if (cache[type]) { const c = cache[type]; return { obj: c.obj.clone(), exhausts: c.exhausts, radius: c.radius }; }
    let r;
    if (type === 'j15') { const c = Craft.build(SHARK); r = { obj: F22.bake(c), exhausts: c.exhausts, radius: c.radius }; }
    else if (type === 'j16') { const c = Craft.build(Object.assign({}, Craft.FLANKER, { paint: 'plan', color: 0xa9b6c2 })); r = { obj: F22.bake(c), exhausts: c.exhausts, radius: c.radius }; }
    else if (type === 'fa18') { const c = Craft.build(HORNET); r = { obj: F22.bake(c), exhausts: c.exhausts, radius: c.radius * 0.95 }; }
    else if (type === 'j35') r = stealth(0.92, 0xb8c6d4);
    else if (type === 'f35c') r = stealth(0.84, 0x9aa1a8);
    else if (type === 'kj600') r = aew('cn');
    else if (type === 'e2d') r = aew('us');
    else if (type === 'h6k') r = h6k();
    else { const c = Craft.bomber(4); tint(c.group, 0x6c7178); r = { obj: F22.bake(c), exhausts: c.exhausts, radius: c.radius }; } // b1b
    cache[type] = r;
    return { obj: r.obj.clone(), exhausts: r.exhausts, radius: r.radius };
  }
  // anti-ship missile bodies
  function ashmGeometry(kind) {
    const g = [];
    const len = kind === 'hyper' ? 9 : kind === 'super' ? 7 : 4.6, r = kind === 'hyper' ? 0.45 : kind === 'super' ? 0.36 : 0.2;
    const b = new THREE.CylinderGeometry(r, r, len, 10); b.rotateZ(-Math.PI / 2); g.push(b);
    const n = new THREE.ConeGeometry(r, len * (kind === 'hyper' ? 0.35 : 0.18), 10); n.rotateZ(-Math.PI / 2); n.translate(len / 2 + len * 0.08, 0, 0); g.push(n);
    for (const a of [0, Math.PI / 2]) { const f = new THREE.BoxGeometry(len * 0.16, 0.04, r * 4.5); f.rotateX(a); f.translate(-len / 2 + 0.3, 0, 0); g.push(f); }
    return mergeGeometries(g.map(x => x.toNonIndexed()));
  }

  function ship(cls) { return CARRIERS[cls] ? carrier(cls) : combatant(cls); }
  return { ship, plane, ashmGeometry, SPECS, CARRIERS };
})();
