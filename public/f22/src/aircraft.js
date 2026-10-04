/* Red-force aircraft: procedural archetypes built with the F-22 lofting kit.
   Frame: +x nose, +y up, +z right. Craft.build(type) returns { group, exhausts, radius } ready for F22.bake().
   Flanker-type: heavy twin-tail fighter on tail booms. Fulcrum-type: lighter, canted fins on the nacelles.
   UCAV: tailless lambda flying wing. Bomber: blended swing-wing heavy bomber, wings at full sweep. */
const Craft = (() => {
  const { curve, gridGeometry, capGeometry, mirror, liftingRings, skinTextures, lerp, smooth, S } = F22.kit;
  const D2R = Math.PI / 180;
  const uvSpan = p => [p[0] * S, p[2] * S];

  function materials(paint, color, aniso) {
    const t = skinTextures(paint, aniso);
    return {
      skin: new THREE.MeshStandardMaterial({ color, map: t.map, bumpMap: t.bump, bumpScale: 0.5, metalness: 0.32, roughness: 0.55, side: THREE.DoubleSide }),
      metal: new THREE.MeshStandardMaterial({ color: 0x5a5d61, metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.9, side: THREE.DoubleSide }),
      glass: new THREE.MeshStandardMaterial({ color: 0x4d6a80, metalness: 0.7, roughness: 0.06, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ color: 0xff8a3a, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.5, metalness: 0.15 })
    };
  }
  const adder = group => (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };

  // superellipse ring around (yc, zc); top / bot are distances above / below yc
  function ring(x, yc, zc, hw, top, bot, n, M = 20) {
    const p = 2 / n, r = [];
    for (let k = 0; k <= M; k++) {
      const th = 2 * Math.PI * k / M, s = Math.sin(th), c = Math.cos(th);
      r.push([x, c >= 0 ? yc + top * Math.pow(c, p) : yc - bot * Math.pow(-c, p), zc + hw * Math.sign(s) * Math.pow(Math.abs(s), p)]);
    }
    return r;
  }
  function body(add, mat, W, TOP, BOT, x0, x1, n = 2.3, N = 70, M = 22) {
    const rings = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = lerp(x0, x1, 0.6 * t + 0.4 * t * t);
      const top = TOP(x), bot = BOT(x), yc = (top + bot) / 2;
      rings.push(ring(x, yc, 0, Math.max(W(x), 1e-4), Math.max(top - yc, 1e-4), Math.max(yc - bot, 1e-4), n, M));
    }
    add(gridGeometry(rings), mat);
    return rings;
  }
  function surface(add, mat, pl, z0, z1, n = 8, both = true, parent) {
    const r = liftingRings(pl, z0, z1, 0, 1, n, 14);
    for (const rr of both ? [r, mirror(r)] : [r]) {
      add(gridGeometry(rr, uvSpan), mat, parent);
      add(capGeometry(rr[rr.length - 1].slice(0, -1), p => [p[0], p[1]]), mat, parent);
    }
  }
  const lin = (z0, z1, a, b) => z => lerp(a, b, Math.min(1, Math.max(0, (z - z0) / (z1 - z0))));
  // vertical or ventral fin pair; span coordinate s runs from the root
  function fins(add, mat, group, { z, y, le, te, h, sLE, sTE, th0, th1, cant = 0, down = false }) {
    const pl = { le: s => le - s * Math.tan(sLE * D2R), te: s => te - s * Math.tan(sTE * D2R), th: s => lerp(th0, th1, s / h), y: () => 0 };
    for (const side of z === 0 ? [1] : [1, -1]) {
      const g = new THREE.Group();
      g.position.set(0, y, z * side);
      g.rotation.x = (down ? -1 : 1) * cant * D2R * side;
      const f = new THREE.Group();
      f.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
      g.add(f); group.add(g);
      surface(add, mat, pl, 0, h, 6, false, f);
    }
  }
  function nozzle(add, M, x0, x1, yc, zc, r0, r1) {
    const c = new THREE.CylinderGeometry(r0, r1, x0 - x1, 18, 1, true);
    c.rotateZ(-Math.PI / 2); c.translate((x0 + x1) / 2, yc, zc);
    add(c, M.metal);
    const disc = new THREE.CircleGeometry(r1 * 0.88, 18);
    disc.rotateY(-Math.PI / 2); disc.translate(x0 - 0.3, yc, zc);
    add(disc, M.glow);
  }
  function canopy(add, M, TOP, x0, x1, w, h, frameAt) {
    const rings = [], N = 24, K = 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = lerp(x0, x1, t);
      const cw = w * Math.pow(Math.sin(Math.PI * t), 0.55), ch = h * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7);
      const r = [];
      for (let k = 0; k <= K; k++) { const ph = -Math.PI / 2 + Math.PI * k / K; r.push([x, TOP(x) - 0.05 + ch * Math.cos(ph), cw * Math.sin(ph)]); }
      rings.push(r);
    }
    const m = add(gridGeometry(rings), M.glass);
    m.renderOrder = 2;
    const fr = rings[Math.round(N * frameAt)].map(p => new THREE.Vector3(...p));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fr), 16, 0.035, 5), M.dark);
  }
  function store(add, mat, geo, x, y, z, scale = 1) {
    const m = add(geo, mat);
    m.position.set(x, y, z); m.scale.setScalar(scale);
    return m;
  }

  /* ---------- twin-engine fighters (Flanker reference geometry, scaled by k) ---------- */
  function twinJet(o) {
    const k = o.k, M = materials(o.paint, o.color, o.aniso);
    const group = new THREE.Group(), add = adder(group);
    const K = keys => curve(keys.map(([x, v]) => [x * k, v * k]));
    const W = K(o.W), TOP = K(o.TOP), BOT = K(o.BOT);
    body(add, M.skin, W, TOP, BOT, o.nose * k, o.tail * k);
    canopy(add, M, TOP, o.canopy[0] * k, o.canopy[1] * k, o.canopy[2] * k, o.canopy[3] * k, 0.3);
    // IRST ball ahead of the windscreen and a nose probe
    const irst = add(new THREE.SphereGeometry(0.15 * k, 12, 8), M.glass);
    irst.position.set((o.canopy[0] + 0.25) * k, TOP((o.canopy[0] + 0.25) * k) + 0.02, 0.18 * k);
    const probe = new THREE.CylinderGeometry(0.02, 0.03, 1.2 * k, 6); probe.rotateZ(-Math.PI / 2); probe.translate((o.nose + 0.6) * k, 0, 0);
    add(probe, M.metal);
    // leading-edge root extension
    const lx = o.lerx;
    surface(add, M.skin, {
      le: z => (lx[0] - (lx[0] - lx[1]) * Math.pow(Math.max(0, (z / k - 0.6) / (lx[2] - 0.6)), 0.55)) * k,
      te: () => lx[3] * k, th: lin(0.6 * k, lx[2] * k, 0.18 * k, 0.12 * k), y: () => 0.2 * k
    }, 0.6 * k, lx[2] * k, 6);
    // wing
    const wg = o.wing, tl = Math.tan(wg.sweep * D2R), an = Math.tan(-2.5 * D2R);
    const wy = z => (0.18 + (z / k - wg.root) * an) * k;
    surface(add, M.skin, {
      le: z => (wg.le - (z / k - wg.root) * tl) * k, te: z => (wg.te + (z / k - wg.root) * wg.teSlope) * k,
      th: lin(wg.root * k, wg.tip * k, 0.32 * k, 0.07 * k), y: wy
    }, 1.2 * k, wg.tip * k, 10);
    // engine nacelles with wedge intakes and round nozzles
    const nc = o.nacelle, exhausts = [];
    for (const side of [1, -1]) {
      const rings = [], N = 30, zc = nc.z * k * side, yc = nc.y * k;
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = lerp(nc.x0, nc.x1, t) * k;
        const n = lerp(5, 2.2, smooth(0.25, 0.85, t));
        const hw = lerp(0.6, 0.52, smooth(0.6, 1, t)) * k, top = lerp(0.5, 0.52, t) * k, bot = lerp(0.64, 0.52, smooth(0.5, 1, t)) * k;
        const r = ring(x, yc, zc, hw, top, bot, n, 20);
        const rake = Math.max(0, 1 - t * 10) * 0.7;          // intake lip raked back from the top
        rings.push(r.map(p => [p[0] - (yc + top - p[1]) * rake, p[1], p[2]]));
      }
      add(gridGeometry(rings), M.skin);
      const cap = rings[2].slice(0, -1);
      add(capGeometry(cap, p => [p[2], p[1]]), M.dark);
      const nx = nc.x1 * k;
      nozzle(add, M, nx, nx - 0.9 * k, yc, zc, 0.52 * k, 0.46 * k);
      exhausts.push([nx - 0.95 * k, yc, zc]);
    }
    // tail booms (Flanker) carry the fins and stabilators outboard of the nozzles
    if (o.booms) {
      for (const side of [1, -1]) {
        const b = new THREE.CylinderGeometry(0.2 * k, 0.24 * k, 6.6 * k, 10); b.rotateZ(-Math.PI / 2);
        b.translate(-5.8 * k, -0.25 * k, 2.0 * k * side); add(b, M.skin);
        const tip = new THREE.ConeGeometry(0.2 * k, 0.8 * k, 10); tip.rotateZ(Math.PI / 2); tip.translate(-9.5 * k, -0.25 * k, 2.0 * k * side); add(tip, M.skin);
      }
    }
    const f = o.fin;
    fins(add, M.skin, group, { z: f.z * k, y: f.y * k, le: f.le * k, te: f.te * k, h: f.h * k, sLE: f.sLE, sTE: f.sTE, th0: 0.2 * k, th1: 0.06 * k, cant: f.cant });
    if (o.ventral) fins(add, M.skin, group, { z: 2.0 * k, y: -0.42 * k, le: -5.6 * k, te: -7.3 * k, h: 0.95 * k, sLE: 45, sTE: 20, th0: 0.1 * k, th1: 0.04 * k, cant: 15, down: true });
    const st = o.stab;
    surface(add, M.skin, {
      le: lin(st.z0 * k, 4.4 * k, -6.2 * k, -8.0 * k), te: lin(st.z0 * k, 4.4 * k, -8.9 * k, -9.4 * k),
      th: lin(st.z0 * k, 4.4 * k, 0.14 * k, 0.04 * k), y: () => -0.25 * k
    }, st.z0 * k, 4.4 * k, 6);
    // stores: wingtip short-range missiles, underwing medium-range missiles on pylons
    const aim9 = F22.aim9Geometry(), mrm = F22.missileGeometry();
    for (const side of [1, -1]) {
      const zt = (wg.tip + 0.12) * k * side;
      store(add, M.white, aim9, (wg.le - (wg.tip - wg.root) * tl - 0.9) * k, wy(wg.tip * k), zt, 1.05);
      for (const zz of o.pylons) {
        const z = zz * k * side, x = (wg.le - (zz - wg.root) * tl - 1.4) * k;
        const pylon = add(new THREE.BoxGeometry(1.2 * k, 0.28, 0.08), M.skin);
        pylon.position.set(x - 0.4, wy(Math.abs(z)) - 0.18, z);
        store(add, M.white, mrm, x - 0.5, wy(Math.abs(z)) - 0.42, z, 1.1);
      }
    }
    return { group, exhausts, radius: 7.35 * k };
  }

  const FLANKER = {
    k: 1, paint: 'flanker', color: 0xa9b8c8, nose: 11, tail: -10.9, booms: true, ventral: true, pylons: [4.1, 5.6],
    W: [[11, 0], [10.4, 0.22], [9.5, 0.42], [8.5, 0.55], [7.5, 0.64], [6, 0.72], [4.5, 0.78], [3, 0.85], [1.5, 0.95], [0, 1.0], [-2, 0.95], [-4, 0.8], [-6, 0.6], [-8, 0.4], [-9.5, 0.26], [-10.9, 0.08]],
    TOP: [[11, 0], [10.4, 0.18], [9.5, 0.36], [8.5, 0.5], [7.5, 0.62], [6, 0.7], [4.5, 0.78], [3, 0.95], [1.5, 1.0], [0, 0.95], [-2, 0.85], [-4, 0.75], [-6, 0.6], [-8, 0.42], [-9.5, 0.28], [-10.9, 0.08]],
    BOT: [[11, 0], [10.4, -0.2], [9.5, -0.38], [8.5, -0.5], [7.5, -0.58], [6, -0.62], [4.5, -0.6], [3, -0.5], [1.5, -0.35], [0, -0.25], [-4, -0.2], [-8, -0.15], [-10.9, -0.03]],
    canopy: [8.3, 4.6, 0.4, 0.58], lerx: [7.6, 1.6, 2.4, -1.5],
    wing: { root: 2.3, tip: 7.35, le: 1.8, te: -4.1, teSlope: 0, sweep: 42 },
    nacelle: { z: 1.3, y: -0.5, x0: 4.3, x1: -7.3 },
    fin: { z: 2.0, y: -0.05, le: -4.0, te: -7.4, h: 3.1, sLE: 40, sTE: -6, cant: 0 },
    stab: { z0: 2.15 }
  };
  const FULCRUM = {
    k: 0.79, paint: 'fulcrum', color: 0xb4bab4, nose: 11, tail: -9.6, booms: false, ventral: false, pylons: [4.0, 5.5],
    W: [[11, 0], [10.4, 0.24], [9.5, 0.45], [8.5, 0.58], [7.5, 0.66], [6, 0.74], [4.5, 0.8], [3, 0.9], [1.5, 1.0], [0, 1.05], [-2, 1.0], [-4, 0.86], [-6, 0.66], [-8, 0.42], [-9.6, 0.12]],
    TOP: [[11, 0], [10.4, 0.2], [9.5, 0.38], [8.5, 0.54], [7.5, 0.68], [6, 0.78], [4.5, 0.92], [3, 1.15], [1.5, 1.2], [0, 1.1], [-2, 0.95], [-4, 0.8], [-6, 0.62], [-8, 0.42], [-9.6, 0.12]],
    BOT: [[11, 0], [10.4, -0.2], [9.5, -0.38], [8.5, -0.5], [7.5, -0.58], [6, -0.6], [4.5, -0.56], [3, -0.45], [1.5, -0.32], [0, -0.25], [-4, -0.2], [-8, -0.15], [-9.6, -0.05]],
    canopy: [8.4, 5.0, 0.42, 0.62], lerx: [8.4, 1.5, 2.3, -1.2],
    wing: { root: 2.3, tip: 7.2, le: 1.6, te: -3.7, teSlope: 0.05, sweep: 42 },
    nacelle: { z: 1.25, y: -0.5, x0: 4.4, x1: -7.6 },
    fin: { z: 1.7, y: 0.02, le: -3.4, te: -6.9, h: 3.0, sLE: 42, sTE: -4, cant: 7 },
    stab: { z0: 1.95 }
  };

  /* ---------- tailless lambda-wing UCAV ---------- */
  function ucav(aniso) {
    const M = materials('ucav', 0x6d7278, aniso);
    const group = new THREE.Group(), add = adder(group);
    surface(add, M.skin, {
      le: z => z < 2.4 ? 3.2 - z * 1.43 : -0.23 - (z - 2.4) * 0.7,
      te: z => z < 1.2 ? -3.2 + z * 0.7 : z < 2.4 ? -2.36 - (z - 1.2) * 0.7 : -3.2 - (z - 2.4) * 0.15,
      th: z => lerp(0.8, 0.09, Math.pow(Math.min(z / 6, 1), 0.6)), y: z => z * 0.03
    }, 0, 6, 16);
    const hump = new THREE.SphereGeometry(1, 22, 12); hump.scale(2.6, 0.42, 0.72); hump.translate(0.5, 0.26, 0);
    add(hump, M.skin);
    const intake = new THREE.BoxGeometry(0.3, 0.14, 0.9); intake.translate(2.45, 0.42, 0); add(intake, M.dark);
    const slot = new THREE.BoxGeometry(0.12, 0.1, 1.0); slot.translate(-2.6, 0.22, 0); add(slot, M.glow);
    return { group, exhausts: [[-2.8, 0.22, 0]], radius: 6 };
  }

  /* ---------- heavy swing-wing bomber (wings at full sweep) ---------- */
  function bomber(aniso) {
    const M = materials('bomber', 0xf0f1f2, aniso);
    const group = new THREE.Group(), add = adder(group);
    const W = curve([[22, 0], [21, 0.55], [19, 1.05], [16, 1.45], [12, 1.65], [6, 1.85], [2, 2.3], [-2, 2.4], [-6, 2.0], [-12, 1.5], [-18, 1.1], [-22, 0.7], [-24, 0.25]]);
    const TOP = curve([[22, 0], [21, 0.5], [19, 1.0], [17.5, 1.5], [15.5, 1.75], [12, 1.7], [4, 1.75], [-6, 1.65], [-14, 1.5], [-20, 1.3], [-24, 0.9]]);
    const BOT = curve([[22, 0], [21, -0.5], [19, -0.95], [16, -1.3], [8, -1.45], [-6, -1.4], [-16, -1.1], [-22, -0.75], [-24, -0.5]]);
    body(add, M.skin, W, TOP, BOT, 22, -24, 2.4, 80, 24);
    const ws = add(new THREE.BoxGeometry(1.5, 0.34, 1.7), M.dark);
    ws.position.set(18.3, 1.14, 0); ws.rotation.z = -0.45;
    // fixed glove and swept outer wing
    surface(add, M.skin, { le: z => 9 - (z - 1.5) * 2.15, te: () => -7, th: lin(1.5, 5.4, 1.2, 0.5), y: () => 0.2 }, 1.5, 5.4, 6);
    surface(add, M.skin, {
      le: z => 0.6 - (z - 5.2) * Math.tan(65 * D2R), te: z => -4.6 - (z - 5.2) * Math.tan(58 * D2R),
      th: lin(5.2, 12, 0.5, 0.12), y: z => 0.25 - (z - 5.2) * 0.02
    }, 5.2, 12, 8);
    // two nacelles under the glove, two engines each
    const exhausts = [];
    for (const side of [1, -1]) {
      const rings = [], zc = 2.9 * side, yc = -1.9;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, x = lerp(1.0, -12.4, t);
        rings.push(ring(x, yc, zc, 1.15, lerp(0.55, 0.6, t), 0.62, 5, 20));
      }
      add(gridGeometry(rings), M.skin);
      add(capGeometry(rings[1].slice(0, -1), p => [p[2], p[1]]), M.dark);
      for (const dz of [-0.56, 0.56]) { nozzle(add, M, -12.4, -13.3, yc, zc + dz, 0.5, 0.46); exhausts.push([-13.4, yc, zc + dz]); }
    }
    fins(add, M.skin, group, { z: 0, y: 1.3, le: -13, te: -22.5, h: 7.5, sLE: 45, sTE: -10, th0: 0.5, th1: 0.15 });
    surface(add, M.skin, { le: lin(0.3, 6.8, -17.5, -22.9), te: lin(0.3, 6.8, -22.0, -25.0), th: lin(0.3, 6.8, 0.3, 0.1), y: () => 4.3 }, 0.3, 6.8, 6);
    return { group, exhausts, radius: 16 };
  }

  function build(type, aniso = 4) {
    if (type === 'flanker') return twinJet(Object.assign({ aniso }, FLANKER));
    if (type === 'fulcrum') return twinJet(Object.assign({ aniso }, FULCRUM));
    if (type === 'ucav') return ucav(aniso);
    return bomber(aniso);
  }
  return { build };
})();
