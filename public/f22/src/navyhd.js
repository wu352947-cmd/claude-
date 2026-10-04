/* High-detail warships and naval aircraft for 南海决战, from CC-licensed Sketchfab models (credits in NavyHD.CREDITS).
   Each model ships as assets/navy/<key>/model.txt (base64 of a gzipped GLB with quantized geometry) next to its
   WebP textures. The textures stay separate files loaded by relative URL: textures embedded in a GLB are read
   through blob: URLs, which the artifact host's content policy blocks, and the models then render untextured.
   The GLB is decompressed with the browser's DecompressionStream and fitted to the game frame:
   ships: +x bow, +y up, waterline at y = 0, real length; aircraft: +x nose, gear contact at y = -gearH.
   Stand-ins for the other side's types (Nimitz for Fujian, E-2D for KJ-600, F-35 for J-35) are desaturated
   and tinted in PLA grey so the source markings do not read.
   Expects THREE and GLTFLoader in scope. */
const NavyHD = (() => {
  // rotation about y, uniform scale and offset measured offline from each model's vertex cloud
  const META = {
    ford:   { rotY: Math.PI / 2, scale: 27.874915, off: [1.8302, -14.8039, -1.7304], deckY: 19.0 },
    nimitz: { rotY: Math.PI / 2, scale: 1.050467, off: [-54.0847, -4.8941, 234.1264], deckY: 17.4 },
    burke:  { rotY: Math.PI / 2, scale: 1020.821343, off: [-27.1105, -10.0341, 0.0174] },
    t055:   { rotY: Math.PI, scale: 1.64886, off: [0.8646, -15.273, -2.6044] },
    t051:   { rotY: Math.PI / 2, scale: 1.096986, off: [0.5287, 0.5772, -0.0011] },
    fa18:   { rotY: Math.PI, scale: 0.225021, off: [-1.3407, 1.8028, 0.0024], gearCut: 0.95, exhausts: [[-8.7, 0.45, 0.55], [-8.7, 0.45, -0.55]] },
    f35:    { rotY: 0, scale: 0.115636, off: [-2.3949, 2.9293, -0.0272], gearNodes: true, exhausts: [[-7.4, 1.0, 0]] },
    e2d:    { rotY: Math.PI / 2, scale: 0.182504, off: [1.2961, 2.0314, -0.002], gearCut: 0.9, exhausts: [[-0.5, 2.6, 2.9], [-0.5, 2.6, -2.9]] }
  };
  const CREDITS = [
    ['Gerald R Ford aircraft Carrier', 'waelXcm', 'CC BY 4.0', 'https://sketchfab.com/3d-models/gerald-r-ford-aircraft-carrier-562bf516e1494df38d8f222504dc798b'],
    ['USS Nimitz class aircraft carrier', 'k26_k29', 'CC BY 4.0', 'https://sketchfab.com/3d-models/uss-nimitz-class-aircraft-carrier-e9f23bab3bd14f34ba9e54ccd082f46d'],
    ['Alreigh Burke Destroyer', 'waelXcm', 'CC BY 4.0', 'https://sketchfab.com/3d-models/alreigh-burke-destroyer-52a04129e8f64134ae26d365c4e82ce7'],
    ['Type 055 Renhai class destroyer [Free]', 'andertan', 'CC BY-ND 4.0', 'https://sketchfab.com/3d-models/type-055-renhai-class-destroyer-free-c0a3c5cb49fd4b688b65e4f3a18b5917'],
    ['Chinese PLAN 051 Class Destroyer', '全斗焕', 'CC BY 4.0', 'https://sketchfab.com/lxyun_2'],
    ['Boeing F/A-18E "Super Hornet"', 'KOG_THORNS', 'CC BY 4.0', 'https://sketchfab.com/3d-models/boeing-fa-18e-super-hornet-9e852037bf2141dcb3fda17013958131'],
    ['F-35 Lightning II - Fighter Jet - Free', 'bohmerang', 'CC BY-NC-SA 4.0', 'https://sketchfab.com/3d-models/f-35-lightning-ii-fighter-jet-free-b1ab1c0090e34b0fbfe667e706023e6d'],
    ['Grumman E-2D Advanced Hawkeye', 'Muhamad Mirza Arrafi', 'CC BY 4.0', 'https://sketchfab.com/3d-models/grumman-e-2d-advanced-hawkeye-0082cf8f15044cfd80ebd4e11b96789d']
  ];
  const templates = {};

  async function fetchGLB(key) {
    const dir = `assets/navy/${key}/`;
    const r = await fetch(dir + 'model.txt');
    if (!r.ok) throw new Error(key + ' ' + r.status);
    const b64 = (await r.text()).trim();
    const raw = atob(b64), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    const buf = await ds.arrayBuffer();
    return new Promise((res, rej) => new GLTFLoader().parse(buf, dir, res, rej));
  }
  // wraps a model so it sits in the game frame
  function fitGroup(key, scene) {
    const M = META[key];
    const inner = new THREE.Group(); inner.rotation.y = M.rotY; inner.add(scene);
    const mid = new THREE.Group(); mid.scale.setScalar(M.scale); mid.position.set(...M.off); mid.add(inner);
    const g = new THREE.Group(); g.add(mid);
    g.updateMatrixWorld(true);
    return g;
  }
  // split a fused aircraft mesh into airframe and landing gear by height above the wheels
  function splitGear(root, cut) {
    const gear = new THREE.Group(); gear.name = 'gear';
    const meshes = [];
    root.traverse(m => { if (m.isMesh) meshes.push(m); });
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), v = new THREE.Vector3(), mtx = new THREE.Matrix4();
    for (const m of meshes) {
      const geo = m.geometry, pos = geo.attributes.position;
      if (!geo.index) continue;
      mtx.multiplyMatrices(inv, m.matrixWorld);
      const idx = geo.index.array, keep = [], drop = [];
      const ys = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) ys[i] = v.fromBufferAttribute(pos, i).applyMatrix4(mtx).y;
      for (let t = 0; t < idx.length; t += 3) {
        const y = (ys[idx[t]] + ys[idx[t + 1]] + ys[idx[t + 2]]) / 3;
        (y < cut ? drop : keep).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (!drop.length) continue;
      const g1 = geo.clone(); g1.setIndex(keep);
      const g2 = geo.clone(); g2.setIndex(drop);
      m.geometry = g1;
      const gm = new THREE.Mesh(g2, m.material);
      gm.matrixAutoUpdate = false; gm.matrix.copy(mtx);
      gear.add(gm);
    }
    root.add(gear);
    return gear;
  }
  // PLA grey for stand-ins: desaturate the texture and tint it
  function tintPLA(root) {
    const done = new Map();
    root.traverse(m => {
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      const out = list.map(mat => {
        if (done.has(mat)) return done.get(mat);
        const c = mat.clone();
        if (!c.transparent) c.onBeforeCompile = sh => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
            '#include <map_fragment>\n  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = vec3(l) * vec3(0.9, 0.96, 1.04); }');
        };
        done.set(mat, c);
        return c;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
  }
  // loads every model; onProgress(done, total, key). Resolves even if some fail (those keep the procedural model).
  async function loadAll(onProgress) {
    const keys = Object.keys(META);
    if (typeof DecompressionStream === 'undefined') return {};
    let n = 0;
    await Promise.all(keys.map(k => fetchGLB(k).then(g => {
      g.scene.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        for (const mat of [].concat(m.material)) {
          if (mat.map) mat.map.anisotropy = 4;
          // mirror-smooth paint (roughness 0) turns the whole hull into a white sky reflection
          if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.42);
        }
      });
      templates[k] = g.scene;
    }).catch(e => console.warn('model', k, e)).finally(() => onProgress && onProgress(++n, keys.length, k))));
    return templates;
  }
  const has = k => !!templates[k];
  // prepare each variant once (fit, gear split, tint); copies are cheap clones that share geometry
  const prepared = {};
  function prep(key, opt) {
    const id = `${key}|${opt.gearH ?? ''}|${opt.pla ? 1 : 0}|${opt.scale || 1}`;
    if (prepared[id]) return prepared[id];
    const M = META[key];
    const g = fitGroup(key, templates[key].clone(true));
    if (opt.gearH != null) {
      g.children[0].position.y -= opt.gearH;          // gear contact at -gearH
      g.updateMatrixWorld(true);
      if (M.gearCut) splitGear(g, M.gearCut - opt.gearH).name = 'gearDown';
      if (M.gearNodes) g.traverse(m => { if (m.name === 'Object_16' || m.name === 'Object_18') m.userData.gearDown = true; if (m.name === 'Object_14') m.userData.gearUp = true; });
    }
    if (opt.scale) g.scale.setScalar(opt.scale);
    if (opt.pla) tintPLA(g);
    return (prepared[id] = g);
  }
  // a fitted copy; aircraft get setGear(down) to show or stow the landing gear
  function make(key, opt = {}) {
    if (!templates[key]) return null;
    const g = prep(key, opt).clone(true), M = META[key];
    const down = [], up = [];
    g.traverse(m => { if (m.name === 'gearDown' || m.userData.gearDown) down.push(m); if (m.userData.gearUp) up.push(m); });
    const setGear = d => { for (const m of down) m.visible = d; for (const m of up) m.visible = !d; };
    setGear(false);
    return { group: g, setGear, exhausts: (M.exhausts || []).map(e => e.map(x => x * (opt.scale || 1))), deckY: M.deckY };
  }
  return { loadAll, make, has, META, CREDITS };
})();
