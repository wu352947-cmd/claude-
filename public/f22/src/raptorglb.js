/* High-detail F-22A: "F-22 Raptor - Fighter Jet - Free" by bohmerang (sketchfab.com/bohmerang),
   CC BY-NC-SA 4.0, converted offline to WebP textures and quantized geometry.
   Wrapped with the same control API as F22.build(). It is fitted at load time to the procedural model's frame:
   +x nose, +y up, +z right, metres, 18.92 m long, nose at x = 9.45, gear contact at y = -2.46.
   The source ships gear-up and gear-down sets (doors closed / open), a cockpit and a separate canopy.
   Expects THREE, GLTFLoader and F22 in scope. */
const RaptorHD = (() => {
  const EXHAUSTS = [[-7.95, -0.42, 0.68], [-7.95, -0.42, -0.68]];
  const CANOPY_HINGE = [3.95, 0.42];
  const cache = {};

  // raptor.json = { gltf: glTF JSON without a buffer uri, bin: base64 geometry }; assembled into a GLB in memory,
  // so the asset set is only JSON and WebP files. Textures come from texDir (assets/hi = 4K, assets/lo = 2K).
  async function fetchGLB(url, texDir) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    const { gltf, bin } = await r.json();
    const raw = atob(bin), body = new Uint8Array((raw.length + 3) & ~3);
    for (let i = 0; i < raw.length; i++) body[i] = raw.charCodeAt(i);
    let js = new TextEncoder().encode(JSON.stringify(gltf));
    const pad = (4 - js.length % 4) % 4;
    if (pad) { const t = new Uint8Array(js.length + pad).fill(0x20); t.set(js); js = t; }
    const out = new Uint8Array(12 + 8 + js.length + 8 + body.length), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
    dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
    dv.setUint32(20 + js.length, body.length, true); dv.setUint32(24 + js.length, 0x004E4942, true); out.set(body, 28 + js.length);
    return new Promise((res, rej) => new GLTFLoader().parse(out.buffer, texDir, res, rej));
  }
  function load(url, texDir) {
    const key = url + '|' + texDir;
    if (!cache[key]) cache[key] = fetchGLB(url, texDir);
    return cache[key];
  }

  // url: path of raptor.json, texDir: folder of its textures (ending in /). Resolves to an API compatible with F22.build().
  async function build(url, texDir, opt = {}) {
    const o = Object.assign({ shadows: true, anisotropy: 4, plumes: true }, opt);
    const gltf = await load(url, texDir);
    const group = new THREE.Group();
    const model = gltf.scene.clone(true);
    const parts = {};
    model.traverse(m => {
      if (!m.isMesh) return;
      parts[m.name] = m;
      m.castShadow = o.shadows && m.name !== 'canopy'; m.receiveShadow = o.shadows;
    });
    // fit into the shared frame
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), s = 18.92 / (box.max.x - box.min.x);
    const fit = new THREE.Group();
    fit.scale.setScalar(s);
    fit.position.set(9.45 - box.max.x * s, -2.46 - box.min.y * s, -(box.max.z + box.min.z) / 2 * s);
    fit.add(model);
    group.add(fit);

    const paint = parts.body.material;
    paint.envMapIntensity = 1.15;
    for (const t of [paint.map, paint.normalMap, paint.metalnessMap]) if (t) t.anisotropy = o.anisotropy;
    const glass = parts.canopy && parts.canopy.material;
    if (glass) { glass.envMapIntensity = 1.6; glass.depthWrite = false; parts.canopy.renderOrder = 2; }
    const missileMat = new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.2, roughness: 0.45 });

    // moves a part under a pivot at (px, py), keeping its place through a copy of the fit transform
    function pivot(mesh, px, py) {
      const p = new THREE.Group(); p.position.set(px, py, 0); group.add(p);
      const f = new THREE.Group(); f.scale.copy(fit.scale); f.position.copy(fit.position).sub(p.position); p.add(f);
      f.add(mesh);
      return p;
    }
    // canopy hinges at its aft end
    const canopyPivot = parts.canopy ? pivot(parts.canopy, CANOPY_HINGE[0], CANOPY_HINGE[1]) : null;
    // gear: the extended set folds up toward the belly, then swaps for the closed doors
    const gearPivot = parts.gearDown ? pivot(parts.gearDown, 0, -0.45) : null;
    if (parts.gearLight && gearPivot) gearPivot.children[0].add(parts.gearLight);

    // afterburner plumes from the 2-D nozzles (flattened cross-section), vectored in pitch
    const plumeMats = [], plumes = [], vectors = [];
    if (o.plumes) {
      const { plumeMaterial } = F22.kit;
      for (const [x, y, z] of EXHAUSTS) {
        const vec = new THREE.Group(); vec.position.set(x, y, z); group.add(vec); vectors.push(vec);
        for (const [rt, rb, len, c1, c2, dia] of [[0.62, 0.26, 7.5, 0xff9a52, 0x4f6bff, 0], [0.48, 0.12, 4.0, 0xfff4d6, 0xff8a2a, 1]]) {
          const pm = plumeMaterial(c1, c2, dia);
          const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, 4, 24, true, Math.PI / 4), pm);
          m.rotation.z = -Math.PI / 2;
          m.scale.set(0.2 / 0.354, 1, 0.5 / 0.354);
          m.position.set(-len / 2, 0, 0);
          m.renderOrder = 3; m.visible = false; m.frustumCulled = false;
          vec.add(m); plumeMats.push(pm); plumes.push(m);
        }
      }
    }

    const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const api = {
      hd: true, group, exhausts: EXHAUSTS, skin: paint,
      materials: { skin: paint, metal: paint, dark: paint, canopyMat: glass, missileMat },
      wireMats: [paint], plumeMats, legs: [], doors: [], bayMissiles: [], gear: 0, bay: 0, sideBay: 0, canopy: 0,
      // g: 0 = down and locked, 1 = stowed
      setGear(g) {
        api.gear = g;
        const k = smooth(0, 0.85, g);
        if (gearPivot) { gearPivot.scale.set(1, 1 - k * 0.9, 1); gearPivot.visible = g < 0.9; }
        if (parts.gearUp) parts.gearUp.visible = g >= 0.9;
      },
      setBay() {}, setSideBay() {},
      setCanopy(v) { api.canopy = v; if (canopyPivot) canopyPivot.rotation.z = v * 0.42; },
      setAB(level, t) {
        for (const pm of plumeMats) { pm.uniforms.uTime.value = t; pm.uniforms.uI.value = level * (pm.uniforms.uD.value ? 1.25 : 0.55); }
        for (const p of plumes) p.visible = level > 0.01;
      },
      pose({ pitch = 0, vector = pitch } = {}) { for (const v of vectors) v.rotation.z = -Math.max(-1, Math.min(1, vector)) * 0.35; }
    };
    api.setGear(0);
    return api;
  }
  return { build, EXHAUSTS };
})();
