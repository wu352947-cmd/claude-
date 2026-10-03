// 骊山·地宫 —— 主程序：渲染、玩家、关卡流程、界面
import * as THREE from 'three';
import { buildTextures, scareFace } from './textures.js';
import * as MD from './models.js';
import { World, S } from './world.js';
import { LEVELS, NOTES, PROLOGUE, ENDING } from './levels.js';
import * as E from './entities.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Post } from './post.js';
import { clamp, lerp, rand, wait, mergeGeos, M } from './util.js';
import { mulberry } from './rng.js';

const $ = s => document.querySelector(s);
const isMobile = matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|HarmonyOS/i.test(navigator.userAgent);
const QUALITY = {
  low: { pr: 1, shadows: 0, bloom: false, msaa: false, lights: 2, dust: 140 },
  mid: { pr: 1.5, shadows: 512, bloom: true, msaa: false, lights: 4, dust: 260 },
  high: { pr: 2, shadows: 1024, bloom: true, msaa: true, lights: 6, dust: 420 }
};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};
const settings = Object.assign({ quality: isMobile ? 'mid' : 'high', sens: 1, volume: 0.9, bright: 1.3 }, store.get('qinling.settings') || {});
const LAMP_K = 3.2;

class Game {
  constructor() {
    this.q = QUALITY[settings.quality] || QUALITY.mid;
    const canvas = $('#gl');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = this.q.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 140);
    this.camera.rotation.order = 'YXZ';
    this.post = new Post(r, this.q);
    this.post.u.uExposure.value = settings.bright;
    this.audio = new Audio();
    this.audio.setVolume(settings.volume);
    this.input = new Input(document.body, { sens: settings.sens });
    this.state = { hp: 100, sanity: 100, battery: 100, spares: 0, stamina: 100, inv: new Set() };
    this.save = Object.assign({ level: 0, notes: [], deaths: 0, started: 0, best: null }, store.get('qinling.save') || {});
    this.notes = NOTES;
    this.mode = 'boot';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.camFwd = new THREE.Vector3(0, 0, -1);
    this.resize(); addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.pause(); });
  }

  resize() {
    const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, this.q.pr);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.renderer.setSize(Math.floor(w * pr), Math.floor(h * pr), false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 82 : 72;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
  }

  async boot() {
    const bar = $('#loadBar'), lbl = $('#loadText');
    const names = { earth: '盗洞的土', rammed: '夯土', brick: '秦砖', stone: '条石', palace: '回纹地砖', wood: '棚木', bronze: '青铜', bronzeOrnate: '云雷纹', terracotta: '陶俑', stars: '二十八宿' };
    this.T = await buildTextures((p, n) => { bar.style.width = (p * 100).toFixed(0) + '%'; if (names[n]) lbl.textContent = '正在烧制 ' + names[n] + '……'; });
    this.mats = MD.createMaterials(this.T);
    this.mats._T = this.T;
    this.pearlMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0x9fd0ff, emissiveIntensity: 2.2, roughness: 0.15, vertexColors: true });
    this.paperMat = new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 0.95 });
    this.plateMat = this.makePlateMat();
    $('#scareImg').src = scareFace();
    this.buildMenuScene();
    this.mode = 'menu';
    $('#loading').classList.add('gone');
    this.showMenu();
    this.loop();
  }

  makePlateMat() {
    // 刻着眼睛的机关砖：比普通石砖略亮、带一圈缝
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#7d776d'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 230},200,${Math.random() * 0.06})`; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
    x.strokeStyle = '#2a2622'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 248);
    x.strokeStyle = 'rgba(40,30,24,0.85)'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(60, 128); x.quadraticCurveTo(128, 70, 196, 128); x.quadraticCurveTo(128, 186, 60, 128); x.stroke();
    x.beginPath(); x.arc(128, 128, 20, 0, 7); x.fillStyle = 'rgba(40,30,24,0.85)'; x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, normalMap: this.T.stone.normalMap });
  }

  // ---------------- 菜单背景：雾中的陶俑 ----------------
  buildMenuScene() {
    const sc = this.menuScene = new THREE.Scene();
    sc.background = new THREE.Color(0x030304); sc.fog = new THREE.FogExp2(0x030304, 0.16);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), this.mats.brick.clone());
    floor.rotation.x = -Math.PI / 2; floor.material.map = this.T.brick.map.clone(); floor.material.map.repeat.set(10, 10); floor.material.map.needsUpdate = true;
    floor.material.normalMap = this.T.brick.normalMap.clone(); floor.material.normalMap.repeat.set(10, 10); floor.material.normalMap.needsUpdate = true;
    floor.receiveShadow = true; sc.add(floor);
    const warriors = [];
    for (let i = 0; i < 9; i++) {
      const kind = i === 0 ? 'general' : 'soldier';
      const m = new THREE.Mesh(E.cached('war_' + kind + (i % 3), () => MD.warriorGeometry(kind, 11 + (i % 3) * 7)), this.mats.terracotta);
      const row = Math.floor((i + 1) / 3), col = (i + 1) % 3 - 1;
      m.position.set(i === 0 ? 0 : col * 1.4 + (row % 2) * 0.7, 0, i === 0 ? 0 : -row * 1.8);
      m.castShadow = m.receiveShadow = true; sc.add(m); warriors.push(m);
    }
    const eyes = new THREE.Mesh(E.cached('eyes', MD.warriorEyes), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.3, 0.1) }));
    warriors[3].add(eyes);
    const key = new THREE.SpotLight(0xffb070, 70, 20, 0.5, 0.6, 1.6);
    key.position.set(2.5, 3.5, 3); key.target.position.set(0, 1.2, -1); key.castShadow = this.q.shadows > 0;
    key.shadow.mapSize.set(1024, 1024); sc.add(key, key.target);
    const rim = new THREE.PointLight(0x5070c0, 12, 12, 2); rim.position.set(-3, 2.5, -4); sc.add(rim);
    sc.add(new THREE.HemisphereLight(0x50607a, 0x100a06, 0.25));
    this.menuKey = key;
    this.menuDust = this.makeDust(); sc.add(this.menuDust);
  }

  makeDust() {
    const n = this.q.dust, pos = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-8, 8); pos[i * 3 + 1] = rand(0, 6); pos[i * 3 + 2] = rand(-8, 8); sz[i] = rand(0.6, 1.6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFlash: { value: 1 }, uScale: { value: innerHeight * 0.5 }, uBase: { value: 0.05 } },
      vertexShader: `
        attribute float size; uniform vec3 uCam; uniform float uTime, uScale, uFlash, uBase; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime*0.13 + position.y*1.7) * 0.6; p.y += sin(uTime*0.09 + position.x) * 0.3 - mod(uTime*0.05, 6.0);
          vec3 box = vec3(16.0, 6.0, 16.0);
          vec3 w = uCam + mod(p - uCam + box*0.5, box) - box*0.5;
          w.y = mod(p.y, 6.0);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          float d = length(mv.xyz);
          float c = dot(normalize(mv.xyz), vec3(0.0, 0.0, -1.0));
          float spot = smoothstep(0.86, 0.97, c) * uFlash * smoothstep(14.0, 1.0, d);
          vA = (spot + uBase) * smoothstep(0.2, 0.8, d);
          gl_PointSize = size * uScale * 0.035 / max(d, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * a * vA, 1.0); }`
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    return pts;
  }

  // ---------------- 关卡 ----------------
  clearLevel() {
    for (const e of this.entities || []) if (!e.dead) e.remove?.();
    this.audio.stopLoops();
    if (this.world) this.world.dispose();
    for (const o of this.statics || []) { if (o.geometry && !o.geometry._cached) { } }
    this.scene = null;
  }

  async loadLevel(index, opts = {}) {
    this.clearLevel();
    const def = LEVELS[index]; this.levelIndex = index; this.def = def;
    const th = def.theme;
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(th.fog[0]);
    sc.fog = new THREE.FogExp2(th.fog[0], th.fog[1]);
    this.entities = []; this.interactables = []; this.lamps = []; this.emitters = []; this.stuckArrows = []; this.statics = [];
    this.doors = []; this.bridges = {}; this.flags = {}; this.dead = false; this.cutscene = 0;
    this.state.inv = new Set(); this.state.hp = 100; this.state.sanity = 100; this.state.battery = 100; this.state.stamina = 100;
    this.state.spares = Math.max(this.state.spares, index >= 3 ? 1 : 0);
    const W = this.world = new World(def, this.mats);
    sc.add(W.group);
    this.hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]); sc.add(this.hemi);
    // 手电
    const fl = this.flashLight = new THREE.SpotLight(0xfff0d8, 30, 30, 0.46, 0.5, 1.1);
    fl.castShadow = this.q.shadows > 0;
    if (fl.castShadow) { fl.shadow.mapSize.set(this.q.shadows, this.q.shadows); fl.shadow.bias = -0.0006; fl.shadow.normalBias = 0.02; fl.shadow.camera.near = 0.2; fl.map = this.T.cookie; }
    sc.add(fl, fl.target);
    // 手电的外圈散射光：照亮身边的墙壁
    const spill = this.spill = new THREE.SpotLight(0xffe6c8, 4, 12, 1.15, 1, 1.6);
    sc.add(spill, spill.target);
    this.flash = { on: true, flick: 0, dir: new THREE.Vector3(0, 0, -1), eff: 1 };
    // 灯光池：固定数量的点光源分配给最近的灯
    this.pool = [];
    for (let i = 0; i < this.q.lights; i++) { const p = new THREE.PointLight(0xffa040, 0, 7, 2); sc.add(p); this.pool.push(p); }
    this.dust = this.makeDust(); sc.add(this.dust);
    // 玩家
    this.player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, bob: 0, running: false, speed: 0, lastStep: 0, invuln: 0 };
    this.shakeAmt = 0; this.hurtFx = 0; this.flashFx = 0; this.scareCd = 0; this.beatT = 0; this.breathT = 0; this.whisperT = 10;

    this.spawnEntities(def);
    this.decorate(def);
    this.audio.startAmbience(th.ambience);
    this.setObjective(def.objective);
    if (opts.escape) this.startEscape(true);
    this.input.reset();
    // 预编译着色器，避免进门后第一帧卡顿
    this.updateCamera(0);
    this.renderer.compile(sc, this.camera);
  }

  addStatic(o) { this.scene.add(o); this.statics.push(o); return o; }
  spawn(e) { this.entities.push(e); return e; }

  spawnEntities(def) {
    const W = this.world, warriors = [];
    let scratchI = 0;
    for (const [ch, list] of Object.entries(W.spots)) {
      const d = def.legend[ch];
      if (ch >= '1' && ch <= '9' && !d) { for (const s of list) this.bridges[ch] = this.spawn(new E.BridgeSeg(this, s)); continue; }
      if (!d) continue;
      for (const s of list) {
        switch (d.type) {
          case 'start': {
            this.player.pos.set(s.x, 0, s.z);
            const f = d.face || [0, -1]; this.player.yaw = Math.atan2(-f[0], -f[1]);
            if (d.shaft) this.lightShaft(s, d.rope);
            break;
          }
          case 'warrior': warriors.push({ x: s.x, z: s.z, yaw: d.yaw ?? Math.PI / 2, kind: d.kind || 'soldier', v: (s.cx * 7 + s.cz * 3) % 3 }); break;
          case 'statue': this.spawn(new E.Statue(this, s, { yaw: Math.PI / 2 })); break;
          case 'chariot': this.chariot(s); break;
          case 'pickup': this.spawn(new E.Pickup(this, s, d)); if (d.decor) E.decor(this, s, d.decor); break;
          case 'note': this.spawn(new E.Note(this, s, d)); break;
          case 'corpse': this.spawn(new E.Corpse(this, s, d)); break;
          case 'decor': E.decor(this, s, d.decor); break;
          case 'lamp': this.spawn(new E.Lamp(this, s, d)); break;
          case 'door': this.doors.push(this.spawn(new E.Door(this, s, d))); break;
          case 'plate': this.spawn(new E.Plate(this, s)); break;
          case 'emitter': this.emitters.push(this.spawn(new E.Emitter(this, s, d))); break;
          case 'lever': this.spawn(new E.Lever(this, s, d)); break;
          case 'armor': this.armorRack(s); break;
          case 'block': W.setBlock(s.cx, s.cz, 1, 0); break;
          case 'coffin': {
            const ks = W.spots.K, cx = ks.reduce((a, k) => a + k.x, 0) / ks.length, cz = ks.reduce((a, k) => a + k.z, 0) / ks.length;
            this.coffin = this.spawn(new E.Coffin(this, { x: cx, z: cz }, s)); break;
          }
          case 'palaceModel': this.palaceModel(s); break;
          case 'stoneBridge': this.stoneBridge(s); break;
          case 'scratch': E.scratch(this, s, scratchI++); break;
          case 'ghost': this.spawn(new E.Ghost(this, s)); break;
          case 'apparition': this.spawn(new E.Apparition(this, s)); break;
          case 'whisper': this.spawn(new E.Trigger(this, s, d, () => {
            const P = this.player.pos, b = { x: P.x - this.camFwd.x * 2, y: 1.6, z: P.z - this.camFwd.z * 2 };
            this.audio.whisper(b, 0.9, 2.2); this.addSanity(-8); setTimeout(() => this.subtitle('（……小七……）'), 600);
          })); break;
          case 'hint': this.spawn(new E.Trigger(this, s, d, () => this.subtitle(d.text))); break;
          case 'collapse': this.spawn(new E.Trigger(this, s, d, () => this.collapse(d.block))); break;
          case 'exit':
            if (d.auto) this.spawn(new E.Trigger(this, s, { radius: 1.1 }, () => this.completeLevel()));
            else {
              const it = { pos: new THREE.Vector3(s.x, 0.5, s.z), range: 2.4, prompt: () => d.prompt, use: () => this.completeLevel() };
              this.interactables.push(it);
              const hole = this.addStatic(new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0x000000 })));
              hole.rotation.x = -Math.PI / 2; hole.position.set(s.x, 0.01, s.z);
            }
            break;
        }
      }
    }
    if (warriors.length) E.buildWarriorBatch(this, warriors);
  }

  // ---------------- 场景装饰 ----------------
  decorate(def) {
    const W = this.world, th = def.theme, H = th.height;
    const r = mulberry(def.id * 97);
    if (th.props) { // 盗洞里的木撑
      const parts = [], geo = MD.propGeometry(H);
      for (let cz = 0; cz < W.h; cz++) for (let cx = 0; cx < W.w; cx++) {
        if (W.isWall(cx, cz) || r() > 0.38) continue;
        const ew = W.isWall(cx - 1, cz) && W.isWall(cx + 1, cz), ns = W.isWall(cx, cz - 1) && W.isWall(cx, cz + 1);
        if (!ew && !ns) continue;
        const c = W.cell(cx, cz);
        parts.push({ geo, m: M(c.x, 0, c.z, 0, ew ? 0 : Math.PI / 2, (r() - 0.5) * 0.04) });
      }
      if (parts.length) { const m = this.addStatic(new THREE.Mesh(mergeGeos(parts), this.mats.woodVC)); m.castShadow = true; m.receiveShadow = true; }
    }
    if (th.beams) { // 俑坑顶上的棚木
      const parts = [], log = new THREE.CylinderGeometry(0.13, 0.13, S + 0.3, 7);
      for (let cz = 0; cz < W.h; cz++) for (let cx = 0; cx < W.w; cx++) {
        if (W.isWall(cx, cz)) continue;
        const c = W.cell(cx, cz);
        for (let k = 0; k < 4; k++) parts.push({ geo: log, m: M(c.x - 0.75 + k * 0.5, H - 0.14 - r() * 0.04, c.z, Math.PI / 2, 0, (r() - 0.5) * 0.04), color: [0.7 + r() * 0.4, 0.7, 0.7] });
      }
      const m = this.addStatic(new THREE.Mesh(mergeGeos(parts), this.mats.woodVC)); m.receiveShadow = true;
      // 几根塌下来的棚木
      for (let i = 0; i < 7; i++) {
        const c = W.randomFloor(r); if (!c) continue;
        const b = this.addStatic(new THREE.Mesh(E.cached('log', () => new THREE.CylinderGeometry(0.16, 0.18, 4.4, 9)), this.mats.wood));
        b.position.set(c.x, H * 0.55, c.z); b.rotation.set(r() * 0.3, r() * 6, 0.6 + r() * 0.3); b.castShadow = true;
      }
    }
    if (th.dome) this.dome();
  }

  lightShaft(s, rope) {
    const H = this.def.theme.height;
    const mat = new THREE.MeshBasicMaterial({ map: this.T.shaft, color: 0x6d7ea8, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 2; i++) {
      const p = this.addStatic(new THREE.Mesh(new THREE.PlaneGeometry(1.4, H + 0.5), mat));
      p.position.set(s.x - 0.3, (H + 0.5) / 2, s.z); p.rotation.y = i * Math.PI / 2 + 0.4;
    }
    this.lamps.push({ pos: new THREE.Vector3(s.x - 0.3, H - 0.1, s.z), color: 0x56648c, power: 0.5, base: 0.5, radius: 5 });
    if (rope) {
      const rp = this.addStatic(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, H + 1, 6), this.mats.cloth));
      rp.position.set(s.x - 0.5, (H + 1) / 2 - 0.2, s.z - 0.2); rp.rotation.z = 0.04; rp.castShadow = true;
      const coil = this.addStatic(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 18), this.mats.cloth));
      coil.rotation.x = -Math.PI / 2; coil.position.set(s.x - 0.5, 0.04, s.z - 0.1);
    }
    // 洞口落下的土堆
    for (let i = 0; i < 6; i++) {
      const rk = this.addStatic(new THREE.Mesh(E.cached('rock' + (i % 3), () => MD.rockGeometry(i + 1, 0.25)), this.mats.earth));
      rk.position.set(s.x + rand(-0.8, 0.4), 0.06, s.z + rand(-0.7, 0.7)); rk.scale.setScalar(rand(0.6, 1.4)); rk.rotation.y = rand(0, 6);
    }
  }

  chariot(s) {
    const x = s.x, z = s.z + S / 2;
    const ch = this.addStatic(new THREE.Mesh(E.cached('chariot', MD.chariotGeometry), this.mats.woodVC));
    ch.position.set(x, 0, z); ch.castShadow = ch.receiveShadow = true;
    const hg = E.cached('horse', MD.horseGeometry);
    for (const [i, off] of [-1.05, -0.35, 0.35, 1.05].entries()) {
      const h = this.addStatic(new THREE.Mesh(hg, this.mats.terracotta));
      h.position.set(x + 2.6, 0, z + off); h.rotation.y = (i - 1.5) * 0.02; h.castShadow = h.receiveShadow = true;
      this.world.obstacles.push({ x: x + 2.3, z: z + off, r: 0.36 }, { x: x + 3.2, z: z + off, r: 0.36 });
    }
    this.world.obstacles.push({ x, z, r: 1.05 }, { x: x + 1.4, z, r: 0.4 });
  }

  armorRack(s) {
    const W = this.world;
    let face = [0, 1];
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (!W.isWall(s.cx + dx, s.cz + dz)) { face = [dx, dz]; break; }
    const yaw = Math.atan2(face[0], face[1]);
    const g = E.cached('rack', MD.armorRackGeometry);
    const rack = this.addStatic(new THREE.Mesh(g.rack, this.mats.woodVC));
    const armor = this.addStatic(new THREE.Mesh(g.armor, this.mats.stoneArmor));
    for (const m of [rack, armor]) { m.position.set(s.x, 0, s.z); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; }
    W.obstacles.push({ x: s.x, z: s.z, r: 0.45 });
  }

  palaceModel(s) {
    const r = mulberry(s.cx * 13 + s.cz);
    const m = this.addStatic(new THREE.Mesh(E.cached('pal' + (s.cx % 3), () => MD.palaceModelGeometry(s.cx % 3 + 1)), this.mats.lacquer));
    m.position.set(s.x, 0, s.z); m.rotation.y = ((r() * 4) | 0) * Math.PI / 2; m.scale.setScalar(1.3); m.castShadow = m.receiveShadow = true;
    this.world.obstacles.push({ x: s.x, z: s.z, r: 1.15 });
  }

  stoneBridge(s) {
    const W = this.world;
    const alongZ = W.kind[W.idx(s.cx - 1, s.cz)] === 2; // 河沿 x 方向流，桥沿 z 方向跨
    const g = E.cached('rail', () => new THREE.BoxGeometry(0.16, 0.55, S));
    for (const side of [-1, 1]) {
      const m = this.addStatic(new THREE.Mesh(g, this.mats.stone));
      if (alongZ) m.position.set(s.x + side * 0.9, 0.27, s.z); else { m.position.set(s.x, 0.27, s.z + side * 0.9); m.rotation.y = Math.PI / 2; }
      m.castShadow = m.receiveShadow = true;
      if (alongZ) { W.obstacles.push({ x: s.x + side * 0.95, z: s.z - 0.6, r: 0.12 }, { x: s.x + side * 0.95, z: s.z + 0.6, r: 0.12 }); }
      else { W.obstacles.push({ x: s.x - 0.6, z: s.z + side * 0.95, r: 0.12 }, { x: s.x + 0.6, z: s.z + side * 0.95, r: 0.12 }); }
    }
  }

  // 穹顶：二十八宿与日月
  dome() {
    const W = this.world, H = this.def.theme.height;
    const cx = W.w * S / 2 - S, cz = W.h * S / 2, R = Math.hypot(W.w * S, W.h * S) / 2 + 2;
    const geo = new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: this.T.stars, side: THREE.BackSide, fog: false, color: 0x8a8a9c });
    const d = this.addStatic(new THREE.Mesh(geo, mat));
    d.position.set(cx, H - 0.5, cz); d.scale.set(1, 0.32, 1);
    // 嵌在穹顶上的明珠，会闪
    const n = 260, pos = new Float32Array(n * 3), rr = mulberry(77);
    for (let i = 0; i < n; i++) {
      const th = rr() * Math.PI * 2, ph = Math.acos(1 - rr() * 0.85);
      pos[i * 3] = cx + Math.sin(ph) * Math.cos(th) * R * 0.97; pos[i * 3 + 1] = H - 0.5 + Math.cos(ph) * R * 0.32 * 0.97; pos[i * 3 + 2] = cz + Math.sin(ph) * Math.sin(th) * R * 0.97;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pearls = new THREE.Points(g, new THREE.PointsMaterial({ map: this.T.glow, size: 0.9, color: 0xfff2d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.addStatic(this.pearls);
    // 水银的反射用一张从中央拍的环境图
    const cube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.5, 120, cube); cc.position.set(cx, 3, cz + 4);
    this.scene.add(cc);
    this.pendingCube = { cc, cube };
  }

  // ---------------- 事件 ----------------
  collapse(block) {
    const [cx, cz] = block, W = this.world, c = W.cell(cx, cz);
    W.setBlock(cx, cz, 1, 1);
    this.audio.rumble(3, 1); this.shake(0.9); this.addSanity(-8);
    for (let i = 0; i < 14; i++) {
      const rk = this.addStatic(new THREE.Mesh(E.cached('rock' + (i % 3), () => MD.rockGeometry(i + 1, 0.25)), this.mats.earth));
      rk.scale.setScalar(rand(1.5, 3.2)); rk.position.set(c.x + rand(-0.8, 0.8), rand(0, 1.6), c.z + rand(-0.8, 0.8)); rk.rotation.set(rand(0, 6), rand(0, 6), 0);
      rk.castShadow = true;
    }
    setTimeout(() => this.subtitle('身后塌了。没有回头路了。'), 900);
  }

  onLever(target) {
    if (target === 'door') {
      this.flags.lever = true;
      for (const d of this.doors) if (d.opt.needs.includes('lever')) d.doOpen();
      this.toast('墓道尽头的石门正在下沉');
      return;
    }
    const b = this.bridges[target]; if (b) b.raise();
    const n = Object.values(this.bridges).filter(b => b.up).length;
    this.toast(`水银海里升起一段铜桥（${n}/3）`);
    this.audio.rumble(2, 0.5);
    if (n >= 3) this.setObjective('过桥，登上椁台，推开铜椁');
  }

  onCoffinOpened() {
    this.readNote('masterFinal', () => this.startEscape(false));
  }

  startEscape(instant) {
    this.flags.escape = true; this.escapeT = 120;
    if (instant) {
      for (const b of Object.values(this.bridges)) b.raise(true);
      this.coffin?.openInstant();
      const c = this.coffin.center; this.player.pos.set(c.x, 0, c.z + 7.2); this.player.yaw = Math.atan2(0, -1);
    }
    for (const d of this.doors) if (d.opt.needs.includes('escape')) d.doOpen();
    const c = this.coffin.center;
    this.guardian = this.spawn(new E.Guardian(this, { x: c.x, z: c.z, cx: 0, cz: 0 }));
    this.audio.stinger(0.9); this.audio.rumble(4, 1); this.shake(1);
    this.hemi.color.setHex(0x803030);
    this.setObjective('逃！东北角的墙后有路');
    this.subtitle(instant ? '它又站起来了。' : '椁里的东西站了起来。');
    $('#timer').classList.add('on');
    this.debris = this.debris || this.makeDebris();
  }

  makeDebris() {
    const n = 36, g = E.cached('rock0', () => MD.rockGeometry(1, 0.25));
    const im = new THREE.InstancedMesh(g, this.mats.stone, n); im.castShadow = true;
    const parts = Array.from({ length: n }, () => ({ x: 0, y: -10, z: 0, vy: 0, s: 1, live: false }));
    this.addStatic(im);
    return { im, parts, t: 0 };
  }
  updateDebris(dt) {
    const D = this.debris; if (!D) return;
    const P = this.player.pos, dm = new THREE.Object3D();
    D.t -= dt;
    if (D.t < 0) {
      D.t = rand(0.08, 0.3);
      const p = D.parts.find(p => !p.live);
      if (p) { p.live = true; p.x = P.x + rand(-7, 7); p.z = P.z + rand(-7, 7); p.y = 12; p.vy = 0; p.s = rand(0.4, 1.4); }
    }
    D.parts.forEach((p, i) => {
      if (p.live) {
        p.vy -= 18 * dt; p.y += p.vy * dt;
        if (p.y < 0.15) { p.live = false; this.audio.thud({ x: p.x, y: 0, z: p.z }, 0.5); if (Math.hypot(p.x - P.x, p.z - P.z) < 0.6) this.hurt(10, '坠落的碎石'); }
      }
      dm.position.set(p.x, p.live ? p.y : -20, p.z); dm.scale.setScalar(p.s); dm.rotation.set(p.y, p.y * 0.7, 0); dm.updateMatrix();
      D.im.setMatrixAt(i, dm.matrix);
    });
    D.im.instanceMatrix.needsUpdate = true;
  }

  give(id, name) {
    this.state.inv.add(id);
    this.toast('获得 ' + name);
    if (id === 'tallyL' || id === 'tallyR') {
      const both = this.state.inv.has('tallyL') && this.state.inv.has('tallyR');
      this.setObjective(both ? '虎符已合，去东南角的铜门' : '还差另一半虎符');
      // 拿到虎符时，所有陶俑的眼睛一齐亮了一下
      this.addSanity(-10); this.audio.stinger(0.4); this.shake(0.2);
      for (const e of this.entities) if (e instanceof E.Statue) { e.speed *= 1.25; }
    }
    if (id.startsWith('gear')) {
      const n = ['gear1', 'gear2', 'gear3'].filter(g => this.state.inv.has(g)).length;
      this.setObjective(n >= 3 ? '铜件齐了，回到中羡门' : `机关铜件 ${n}/3`);
    }
    if (id === 'pearl') this.toast('夜明珠在掌心里发着冷光');
  }

  completeLevel() {
    if (this.mode !== 'play' || this.transitioning) return;
    this.transitioning = true;
    const next = this.levelIndex + 1;
    if (this.def.legend.E?.final) { this.ending(); return; }
    this.save.level = next; this.persist();
    this.fadeTo(1, 0.9).then(async () => {
      await this.chapterCard(LEVELS[next], () => this.loadLevel(next));
      this.transitioning = false;
    });
  }

  // ---------------- 玩家受伤 / 惊吓 ----------------
  hurt(n, cause, src) {
    if (this.dead || this.player.invuln > 0) return;
    this.state.hp -= n; this.player.invuln = 0.7; this.hurtFx = 1; this.lastCause = cause;
    this.audio.hurt(); this.shake(0.45);
    navigator.vibrate?.(60);
    if (this.state.hp <= 0) this.die(cause);
  }
  addSanity(d) { this.state.sanity = clamp(this.state.sanity + d, 0, 100); }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  flickerFlash(p) { if (Math.random() < p * 0.25) { this.flash.flick = rand(0.05, 0.2); if (Math.random() < 0.3) this.audio.flashFlicker(); } }
  scare() {
    if (this.scareCd > 0) return; this.scareCd = 3;
    const el = $('#scare'); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 380);
    this.audio.stinger(1); this.flashFx = 0.5; this.shake(0.8);
    navigator.vibrate?.([90, 40, 160]);
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true; this.state.hp = 0;
    this.save.deaths++; this.persist();
    this.audio.stinger(0.7);
    this.input.enabled = false; this.input.unlock();
    setTimeout(() => {
      this.mode = 'dead';
      const lines = {
        '陶俑': '你没有看住它们。', '殉葬的工匠': '他们终于有人陪了。', '机弩': '两千年的弦，依旧很紧。',
        '守陵的将军': '你看清了它的脸。', '地宫塌了': '骊山合上了它的嘴。', '汞毒': '水银的气味，甜得发腻。', '心智崩溃': '黑暗里的声音，替你答应了。'
      };
      $('#deathCause').textContent = lines[cause] || '你倒在了黑暗里。';
      $('#death').classList.add('on');
      $('#hud').classList.remove('on');
    }, 1300);
  }

  retry() {
    $('#death').classList.remove('on');
    const esc = this.flags.escape;
    this.loadLevel(this.levelIndex, { escape: esc }).then(() => this.resume(true));
  }

  // ---------------- 界面 ----------------
  setObjective(t) { const el = $('#objective'); el.textContent = t; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  toast(t) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = t;
    $('#toasts').appendChild(el); setTimeout(() => el.classList.add('out'), 2800); setTimeout(() => el.remove(), 3500);
  }
  subtitle(t) {
    const el = $('#subtitle'); el.textContent = t; el.classList.add('on');
    clearTimeout(this.subT); this.subT = setTimeout(() => el.classList.remove('on'), 3800);
  }

  readNote(id, after) {
    const n = NOTES[id]; if (!n) return;
    if (!this.save.notes.includes(id)) { this.save.notes.push(id); this.persist(); }
    this.openReader(n, after);
  }
  openReader(n, after) {
    const prev = this.mode;
    this.mode = 'reader'; this.input.enabled = false; this.input.unlock();
    const box = $('#reader');
    box.className = 'layer on ' + n.kind;
    $('#readerTitle').textContent = n.title;
    $('#readerText').textContent = n.text;
    $('#readerText').scrollTop = 0; $('#readerText').scrollLeft = 99999;
    this.readerClose = () => {
      box.className = 'layer';
      this.mode = prev === 'reader' ? 'play' : prev;
      if (this.mode === 'play') { this.input.enabled = true; this.clock.getDelta(); }
      after?.();
    };
  }

  showJournal() {
    this.mode = 'journal'; this.input.enabled = false; this.input.unlock();
    const list = $('#journalList'); list.innerHTML = '';
    const all = Object.keys(NOTES);
    for (const id of all) {
      const has = this.save.notes.includes(id);
      const b = document.createElement('button');
      b.className = 'jitem ' + (has ? NOTES[id].kind : 'locked');
      b.textContent = has ? NOTES[id].title : '？？？';
      if (has) b.onclick = () => { $('#journal').classList.remove('on'); this.openReader(NOTES[id], () => this.showJournal()); this.mode = 'reader'; };
      list.appendChild(b);
    }
    $('#journalCount').textContent = `${this.save.notes.length} / ${all.length}`;
    const inv = $('#invList'); inv.innerHTML = '';
    const names = { tallyL: '虎符·左', tallyR: '虎符·右', gear1: '铜件一', gear2: '铜件二', gear3: '铜件三', pearl: '夜明珠' };
    for (const k of this.state.inv) { const s = document.createElement('span'); s.textContent = names[k] || k; inv.appendChild(s); }
    if (this.state.spares) { const s = document.createElement('span'); s.textContent = '备用电池 ×' + this.state.spares; inv.appendChild(s); }
    if (!inv.children.length) inv.innerHTML = '<em>身上空空</em>';
    $('#journal').classList.add('on');
  }
  closeJournal() { $('#journal').classList.remove('on'); this.mode = 'play'; this.input.enabled = true; this.clock.getDelta(); }

  fadeTo(v, dur) {
    return new Promise(res => {
      const from = this.post.u.uFade.value, t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / (dur * 1000)); this.post.u.uFade.value = lerp(from, v, k); if (k < 1) requestAnimationFrame(step); else res(); };
      step();
    });
  }

  async chapterCard(L, load) {
    const card = $('#card');
    $('#cardTitle').textContent = L.title; $('#cardPlace').textContent = L.place;
    $('#cardQuote').textContent = L.quote; $('#cardSource').textContent = L.source;
    this.mode = 'card'; this.input.enabled = false;
    card.classList.add('on'); $('#hud').classList.remove('on');
    this.audio.motif();
    const t0 = performance.now();
    await wait(60);
    await load();
    const left = 4200 - (performance.now() - t0);
    await Promise.race([wait(Math.max(600, left)), new Promise(r => { card.onclick = r; })]);
    card.onclick = null;
    card.classList.remove('on');
    this.post.u.uFade.value = 1;
    this.resume(true);
    this.fadeTo(0, 1.6);
  }

  resume(fresh) {
    this.mode = 'play'; this.input.enabled = true; this.clock.getDelta();
    $('#hud').classList.add('on'); $('#pause').classList.remove('on');
    if (fresh) this.post.u.uFade.value = Math.min(this.post.u.uFade.value, 1);
  }
  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused'; this.input.enabled = false; this.input.unlock();
    $('#pause').classList.add('on');
  }

  persist() { store.set('qinling.save', this.save); }

  showMenu() {
    this.mode = 'menu';
    $('#hud').classList.remove('on'); $('#menu').classList.add('on');
    const cont = $('#btnContinue');
    cont.hidden = !(this.save.level > 0 && this.save.level < LEVELS.length);
    if (!cont.hidden) cont.textContent = '继续 · ' + LEVELS[this.save.level].title.split(' · ')[0];
    this.post.u.uFade.value = 0;
    this.audio.stopAmbience();
  }

  async newGame(level = 0) {
    this.audio.init();
    $('#menu').classList.remove('on');
    if (level === 0) {
      this.save = { level: 0, notes: [], deaths: 0, started: Date.now(), best: this.save.best };
      this.state.spares = 0;
      this.persist();
      await this.prologue();
    }
    this.post.u.uFade.value = 1;
    this.transitioning = false;
    await this.chapterCard(LEVELS[level], () => this.loadLevel(level));
    if (isMobile) document.documentElement.requestFullscreen?.().catch(() => { });
  }

  prologue() {
    return new Promise(res => {
      const el = $('#prologue'), box = $('#prologueText');
      box.innerHTML = ''; el.classList.add('on');
      this.mode = 'card';
      PROLOGUE.forEach((ln, i) => { const p = document.createElement('p'); p.textContent = ln || ' '; p.style.animationDelay = (i * 0.9) + 's'; box.appendChild(p); });
      this.audio.distantChant();
      const done = () => { el.classList.remove('on'); el.onclick = null; clearTimeout(t); res(); };
      const t = setTimeout(done, PROLOGUE.length * 900 + 3500);
      setTimeout(() => { el.onclick = done; }, 800);
    });
  }

  ending() {
    this.mode = 'ending'; this.input.enabled = false; this.input.unlock();
    this.audio.stopAmbience(); this.audio.stopLoops();
    const secs = this.save.started ? Math.round((Date.now() - this.save.started) / 1000) : 0;
    this.fadeTo(1, 2).then(() => {
      $('#hud').classList.remove('on'); $('#timer').classList.remove('on');
      const el = $('#ending'), box = $('#endingText'); box.innerHTML = '';
      ENDING.forEach((ln, i) => { const p = document.createElement('p'); p.textContent = ln || ' '; p.style.animationDelay = (i * 1.1) + 's'; box.appendChild(p); });
      const mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
      $('#endingStats').innerHTML = `<span>用时 ${mm}:${ss}</span><span>倒下 ${this.save.deaths} 次</span><span>史料与遗书 ${this.save.notes.length}/${Object.keys(NOTES).length}</span>`;
      el.classList.add('on');
      this.audio.motif();
      this.save.level = 0; this.persist();
    });
  }

  // ---------------- 主循环 ----------------
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.mode === 'menu' || this.mode === 'boot') { this.renderMenu(dt); return; }
    if (!this.scene) { this.renderMenu(dt); return; }
    if (this.mode === 'play') this.update(dt);
    else if (this.mode === 'dead') { this.updateCamera(dt); this.camera.position.y = lerp(this.camera.position.y, 0.35, dt * 2); this.camera.rotation.z = lerp(this.camera.rotation.z, 0.9, dt * 2); }
    if (this.pendingCube) {
      const { cc, cube } = this.pendingCube; this.pendingCube = null;
      this.flashLight.visible = false; cc.update(this.renderer, this.scene); this.flashLight.visible = true;
      if (this.world.mercuryMat) { this.world.mercuryMat.envMap = cube.texture; this.world.mercuryMat.envMapIntensity = 1.6; this.world.mercuryMat.needsUpdate = true; }
      this.mats.palace.envMap = cube.texture;
      for (const m of Object.values(this.world._mc || {})) if (m.map === this.T.palace.map) { m.envMap = cube.texture; m.envMapIntensity = 0.5; m.needsUpdate = true; }
    }
    this.post.u.uSanity.value = this.state.sanity / 100;
    this.post.render(this.scene, this.camera, this.time);
  }

  renderMenu(dt) {
    if (!this.menuScene) return;
    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.08) * 3.6, 1.55 + Math.sin(t * 0.3) * 0.05, 4.2 + Math.cos(t * 0.08) * 0.8);
    this.camera.lookAt(0, 1.35, -1.2);
    this.menuKey.intensity = 70 * (0.85 + 0.1 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23));
    this.menuDust.material.uniforms.uCam.value.copy(this.camera.position);
    this.menuDust.material.uniforms.uTime.value = t; this.menuDust.material.uniforms.uBase.value = 0.12;
    this.post.u.uSanity.value = 1; this.post.u.uHurt.value = 0;
    this.post.render(this.menuScene, this.camera, t);
  }

  update(dt) {
    const inp = this.input.poll(), st = this.state, P = this.player;
    for (const a of inp.actions) {
      if (a === 'light') { this.flash.on = !this.flash.on && (st.battery > 0 || st.spares > 0); this.audio.click(); }
      if (a === 'use' && this.focus) this.focus.use();
      if (a === 'journal') { this.showJournal(); return; }
    }
    if (this.cutscene > 0) { this.cutscene -= dt; inp.move.x = inp.move.y = 0; inp.look.x = inp.look.y = 0; }
    this.updatePlayer(dt, inp);
    this.updateFlash(dt);
    this.updateCamera(dt);
    this.updateLights();
    for (const e of this.entities) if (!e.dead) e.update(dt, this.time);
    if (this.entities.length > 200) this.entities = this.entities.filter(e => !e.dead);
    this.updateStats(dt);
    this.updateInteract();
    if (this.flags.escape) this.updateEscape(dt);
    this.updateHUD();
    // 后期参数
    this.hurtFx = Math.max(0, this.hurtFx - dt * 1.2);
    this.flashFx = Math.max(0, this.flashFx - dt * 2.5);
    this.post.u.uHurt.value = Math.max(this.hurtFx, st.hp < 30 ? (0.25 + 0.15 * Math.sin(this.time * 6)) * (1 - st.hp / 30) : 0);
    this.post.u.uFlash.value = this.flashFx;
    this.dust.material.uniforms.uCam.value.copy(this.camera.position);
    this.dust.material.uniforms.uTime.value = this.time;
    this.dust.material.uniforms.uFlash.value = this.flash.on ? this.flash.eff : 0;
    if (this.pearls) this.pearls.material.size = 0.8 + 0.25 * Math.sin(this.time * 2.1);
    if (this.world.mercuryMat?.normalMap) { this.world.mercuryMat.normalMap.offset.set(this.time * 0.02, this.time * 0.013); }
    this.audio.lp = { x: P.pos.x, z: P.pos.z };
    this.audio.setListener(this.camera.position, this.camFwd);
  }

  updatePlayer(dt, inp) {
    const P = this.player, st = this.state;
    P.yaw -= inp.look.x; P.pitch = clamp(P.pitch - inp.look.y, -1.35, 1.35);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    let mx = rx * inp.move.x + fx * inp.move.y, mz = rz * inp.move.x + fz * inp.move.y;
    const mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > 0.01) { const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    const wantRun = inp.run && mag > 0.3;
    if (wantRun && st.stamina > 0 && !P.exhausted) { P.running = true; st.stamina -= dt * 15; if (st.stamina <= 0) P.exhausted = true; }
    else { P.running = false; st.stamina = Math.min(100, st.stamina + dt * (mag > 0.1 ? 9 : 14)); if (st.stamina > 30) P.exhausted = false; }
    const sp = (P.running ? 4.2 : 2.3) * mag * (st.hp < 25 ? 0.8 : 1);
    const tvx = mx * sp, tvz = mz * sp;
    const k = Math.min(1, dt * 10);
    P.vel.x += (tvx - P.vel.x) * k; P.vel.z += (tvz - P.vel.z) * k;
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    this.world.collide(P.pos, 0.32);
    P.speed = Math.hypot(P.vel.x, P.vel.z);
    // 头部晃动与脚步声
    if (P.speed > 0.3) {
      const prev = Math.sin(P.bob);
      P.bob += dt * P.speed * 2.6;
      const now = Math.sin(P.bob);
      if (Math.sign(prev) !== Math.sign(now)) this.audio.step(this.def.theme.surface, P.running);
    }
    P.invuln = Math.max(0, P.invuln - dt);
    this.breathT -= dt;
    if (this.breathT < 0 && (st.stamina < 35 || st.sanity < 30)) { this.audio.breath(true); this.breathT = st.stamina < 15 ? 0.8 : 1.4; }
  }

  updateCamera(dt) {
    const P = this.player, cam = this.camera;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6);
    const sh = this.shakeAmt * this.shakeAmt;
    const bobA = Math.min(1, P.speed / 2.3) * (P.running ? 1.4 : 1);
    cam.position.set(P.pos.x, 1.62 + Math.abs(Math.sin(P.bob)) * 0.05 * bobA - 0.02 * bobA, P.pos.z);
    cam.position.x += Math.cos(P.yaw) * Math.sin(P.bob) * 0.025 * bobA;
    cam.rotation.set(P.pitch + (Math.random() - 0.5) * sh * 0.06, P.yaw + (Math.random() - 0.5) * sh * 0.06, Math.sin(P.bob) * 0.006 * bobA + (Math.random() - 0.5) * sh * 0.04);
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.camFwd);
  }

  updateFlash(dt) {
    const st = this.state, f = this.flash, fl = this.flashLight, cam = this.camera;
    if (f.on) {
      st.battery -= dt * (this.levelIndex >= 3 ? 0.62 : 0.5);
      if (st.battery <= 0) {
        if (st.spares > 0) { st.spares--; st.battery = 100; this.toast('换上了备用电池'); this.audio.click(); }
        else { st.battery = 0; f.on = false; this.toast('手电没电了'); this.audio.click(); }
      }
    }
    f.flick = Math.max(0, f.flick - dt);
    let eff = f.on ? 1 : 0;
    if (f.on && st.battery < 15) eff *= Math.random() < 0.06 ? 0.15 : 0.7 + 0.3 * (st.battery / 15);
    if (f.flick > 0) eff *= Math.random() < 0.5 ? 0.05 : 0.4;
    f.eff = lerp(f.eff, eff, Math.min(1, dt * 30));
    fl.intensity = 30 * f.eff;
    fl.visible = f.eff > 0.01;
    // 手电跟随视线，略带滞后
    const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    fl.position.copy(cam.position).addScaledVector(right, 0.2); fl.position.y -= 0.22;
    f.dir.lerp(this.camFwd, Math.min(1, dt * 14)).normalize();
    fl.target.position.copy(fl.position).addScaledVector(f.dir, 6);
    fl.target.updateMatrixWorld();
    this.spill.position.copy(fl.position); this.spill.target.position.copy(fl.target.position); this.spill.target.updateMatrixWorld();
    this.spill.intensity = 4 * f.eff; this.spill.visible = fl.visible;
  }

  updateLights() {
    const P = this.player.pos;
    const ls = this.lamps.slice().sort((a, b) => (a.pos.x - P.x) ** 2 + (a.pos.z - P.z) ** 2 - ((b.pos.x - P.x) ** 2 + (b.pos.z - P.z) ** 2));
    this.pool.forEach((pl, i) => {
      const l = ls[i];
      if (!l) { pl.intensity = 0; return; }
      pl.position.copy(l.pos); pl.color.setHex(l.color); pl.distance = l.radius * 1.6; pl.intensity = l.power * LAMP_K;
    });
  }

  updateStats(dt) {
    const st = this.state, P = this.player.pos;
    let nearLamp = false;
    for (const l of this.lamps) if (l.power > 1 && Math.hypot(l.pos.x - P.x, l.pos.z - P.z) < l.radius * 0.7) { nearLamp = true; break; }
    let ds;
    if (nearLamp) ds = 4;
    else if (this.flash.on && this.flash.eff > 0.3) ds = 0.5;
    else ds = -2.4;
    st.sanity = clamp(st.sanity + ds * dt, 0, 100);
    if (this.def.theme.vapor) { st.hp -= dt * 0.28; if (st.hp <= 0) this.die('汞毒'); }
    if (st.sanity <= 0) { st.hp -= dt * 3; if (st.hp <= 0) this.die('心智崩溃'); }
    this.scareCd = Math.max(0, this.scareCd - dt);
    // 心跳
    this.beatT -= dt;
    const danger = Math.max(1 - st.sanity / 40, 1 - st.hp / 35, this.flags.escape ? 0.6 : 0);
    if (danger > 0 && this.beatT < 0) { this.audio.heartbeat(0.3 + danger * 0.6); this.beatT = lerp(1.2, 0.45, clamp(danger, 0, 1)); }
    // 理智过低时的幻听
    this.whisperT -= dt;
    if (st.sanity < 45 && this.whisperT < 0) {
      this.whisperT = rand(4, 9) * (0.4 + st.sanity / 60);
      const a = rand(0, 6.28);
      this.audio.whisper({ x: P.x + Math.cos(a) * 1.5, y: 1.6, z: P.z + Math.sin(a) * 1.5 }, 0.7, rand(1, 2.5));
      if (Math.random() < 0.3) this.subtitle(['（……小七……）', '（别回头）', '（灯……灭了吧……）', '（你也留下来……）'][(Math.random() * 4) | 0]);
    }
  }

  updateInteract() {
    const cam = this.camera.position;
    let best = null, bs = -1;
    for (const it of this.interactables) {
      const dx = it.pos.x - cam.x, dz = it.pos.z - cam.z, d = Math.hypot(dx, dz);
      if (d > (it.range || 2.1)) continue;
      const dy = it.pos.y - cam.y, l = Math.hypot(dx, dy, dz) || 1;
      const c = (dx * this.camFwd.x + dy * this.camFwd.y + dz * this.camFwd.z) / l;
      if (c < 0.62 && d > 0.9) continue;
      const s = c - d * 0.1;
      if (s > bs) { bs = s; best = it; }
    }
    this.focus = best;
    const el = $('#prompt');
    if (best) { el.textContent = (isMobile ? '' : '[E] ') + best.prompt(); el.classList.add('on'); $('#btnUse').classList.add('ready'); }
    else { el.classList.remove('on'); $('#btnUse').classList.remove('ready'); }
  }

  updateEscape(dt) {
    this.escapeT -= dt;
    const t = Math.max(0, this.escapeT);
    $('#timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    this.rumbleT = (this.rumbleT || 0) - dt;
    if (this.rumbleT < 0) { this.rumbleT = rand(2.5, 5); this.audio.rumble(2.5, 0.7); this.shake(0.25); }
    this.updateDebris(dt);
    if (this.escapeT <= 0) this.die('地宫塌了');
  }

  updateHUD() {
    const st = this.state;
    $('#barHp').style.width = st.hp + '%';
    $('#barSan').style.width = st.sanity + '%';
    $('#barBat').style.width = st.battery + '%';
    $('#barSta').style.width = st.stamina + '%';
    $('#spares').textContent = st.spares ? '×' + st.spares : '';
    $('#btnLight').classList.toggle('off', !this.flash.on);
    $('#hud').classList.toggle('lowhp', st.hp < 30);
    $('#vapor').classList.toggle('on', !!this.def.theme.vapor);
  }

  // 是否被看见：在视野里、视线不被挡、并且有光（或离得很近）
  isObserved(pos, h = 1.5) {
    const cam = this.camera, cp = cam.position;
    const d = Math.hypot(pos.x - cp.x, pos.z - cp.z);
    let inView = false;
    const v = this._v ||= new THREE.Vector3();
    for (const y of [h * 0.95, h * 0.55, 0.25]) {
      v.set(pos.x, y, pos.z).project(cam);
      if (v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02) { inView = true; break; }
    }
    if (!inView) return false;
    if (!this.world.los(cp.x, cp.z, pos.x, pos.z)) return false;
    if (d < 2.6) return true;
    if (this.flash.on && this.flash.eff > 0.3 && d < 22) {
      const fl = this.flashLight.position, dx = pos.x - fl.x, dy = h * 0.6 - fl.y, dz = pos.z - fl.z, l = Math.hypot(dx, dy, dz);
      const c = (dx * this.flash.dir.x + dy * this.flash.dir.y + dz * this.flash.dir.z) / l;
      if (c > Math.cos(0.5)) return true;
    }
    for (const lp of this.lamps) if (lp.power > 1.5 && Math.hypot(lp.pos.x - pos.x, lp.pos.z - pos.z) < lp.radius * 0.75) return true;
    return false;
  }
}

// ---------------- 启动与界面绑定 ----------------
const game = new Game();
window.__game = game;

function bindUI() {
  const on = (sel, fn) => $(sel).addEventListener('click', e => { e.preventDefault(); game.audio.init(); fn(e); });
  on('#btnStart', () => {
    if (game.save.level > 0 && !confirm('重新开始会清除当前进度，确定吗？')) return;
    game.newGame(0);
  });
  on('#btnContinue', () => game.newGame(game.save.level));
  on('#btnSettings', () => openSettings());
  on('#btnAbout', () => $('#about').classList.add('on'));
  on('#aboutClose', () => $('#about').classList.remove('on'));
  on('#readerClose', () => game.readerClose?.());
  on('#btnPause', () => game.pause());
  on('#btnJournal', () => { if (game.mode === 'play') game.showJournal(); });
  on('#journalClose', () => game.closeJournal());
  on('#pResume', () => game.resume());
  on('#pSettings', () => openSettings());
  on('#pMenu', () => { $('#pause').classList.remove('on'); game.clearLevel(); game.scene = null; game.showMenu(); });
  on('#dRetry', () => game.retry());
  on('#dMenu', () => { $('#death').classList.remove('on'); game.clearLevel(); game.scene = null; game.showMenu(); });
  on('#eMenu', () => { $('#ending').classList.remove('on'); game.clearLevel(); game.scene = null; game.showMenu(); });
  on('#sClose', () => { $('#settings').classList.remove('on'); });
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (game.mode === 'play') game.pause();
      else if (game.mode === 'paused') game.resume();
      else if (game.mode === 'reader') game.readerClose?.();
      else if (game.mode === 'journal') game.closeJournal();
    } else if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && game.mode === 'reader') game.readerClose?.();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.mode === 'play' && !game.input.touch) game.pause();
  });
}

function openSettings() {
  const s = $('#settings'); s.classList.add('on');
  const q = $('#sQuality'), sens = $('#sSens'), vol = $('#sVol'), br = $('#sBright');
  q.value = settings.quality; sens.value = settings.sens; vol.value = settings.volume; br.value = settings.bright;
  br.oninput = () => { settings.bright = +br.value; game.post.u.uExposure.value = settings.bright; store.set('qinling.settings', settings); };
  q.onchange = () => { settings.quality = q.value; store.set('qinling.settings', settings); $('#sNote').textContent = '画质会在重新载入页面后完全生效'; };
  sens.oninput = () => { settings.sens = +sens.value; game.input.sens = settings.sens; store.set('qinling.settings', settings); };
  vol.oninput = () => { settings.volume = +vol.value; game.audio.setVolume(settings.volume); store.set('qinling.settings', settings); };
}

bindUI();
game.boot().catch(err => {
  console.error(err);
  $('#loadText').textContent = '启动失败：' + err.message + '（需要支持 WebGL2 的浏览器）';
});
