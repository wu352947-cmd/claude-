import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { loadAll } from './assets.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { IconMaker } from './icons.js';
import { UI, loadSettings, saveSettings } from './ui.js';
import { CharacterModel, weaponWorldModel } from './character.js';
import { applySkin, SKIN_BY_ID } from './skins.js';

const $ = id => document.getElementById(id);
const TIPS = ['急停射击：松开方向键的瞬间开枪，精度最高', 'AK-47 一枪爆头可以秒杀戴头盔的敌人', '静步移动不会发出脚步声，适合偷袭', '木箱和门板可以被子弹穿透', '闪光弹背对爆炸点可以减轻致盲', '残局时注意听脚步声判断敌人位置', '经济差时选择保枪或强起，与队友统一'];

class App {
  constructor() {
    this.settings = loadSettings();
    this.canvas = $('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false;
    this.audio = new AudioEngine();
    this.state = 'loading'; this.paused = false;
    this.resize(); window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'match') this.pause(true); });
    $('ld-tip').textContent = '提示：' + TIPS[Math.floor(Math.random() * TIPS.length)];
    const unlock = () => this.audio.unlock(); window.addEventListener('touchstart', unlock, { once: true }); window.addEventListener('mousedown', unlock, { once: true });
    this.boot();
  }

  async boot() {
    this.assets = await loadAll(this.audio, k => { $('ld-fill').style.width = (k * 85).toFixed(0) + '%'; $('ld-text').textContent = `正在加载资源… ${(k * 100).toFixed(0)}%`; });
    $('ld-text').textContent = '正在构建地图…';
    await new Promise(r => setTimeout(r, 30));
    this.hud = new HUD({}, this.audio);
    this.game = new Game(this.renderer, this.assets, this.audio, this.hud, this.settings);
    $('ld-fill').style.width = '92%'; $('ld-text').textContent = '正在生成图标…';
    await new Promise(r => setTimeout(r, 30));
    this.icons = new IconMaker(this.renderer, this.assets); this.icons.env = this.game.env;
    this.hud.icons = this.icons.weaponIcons();
    this.input = new Input(this.settings, this.hud, this.audio);
    this.preview = new Preview(this.assets, this.game.env);
    this.ui = new UI(this);
    this.hud.onExit = r => { this.ui.reward(r); this.toLobby(); };
    this.setupLobbyScene();
    this.applySettings();
    // warm up shaders
    this.renderer.compile(this.game.scene, this.game.camera);
    this.renderer.shadowMap.needsUpdate = true;
    $('ld-fill').style.width = '100%';
    $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 650);
    this.toLobby();
    $('pa-resume').onclick = () => this.pause(false);
    $('pa-quit').onclick = () => { this.pause(false); this.toLobby(); };
    $('pa-settings').onclick = () => { this.ui.openPanel('settings'); };
    this.last = performance.now();
    this.renderer.setAnimationLoop(t => this.frame(t));
    window.__app = this;
  }

  resize() {
    const q = this.settings.quality;
    const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'med' ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const asp = window.innerWidth / window.innerHeight;
    if (this.game) { this.game.camera.aspect = asp; this.game.camera.updateProjectionMatrix(); }
    if (this.lobbyCam) { this.lobbyCam.aspect = asp; this.lobbyCam.updateProjectionMatrix(); }
  }

  applySettings(changed) {
    const s = this.settings; saveSettings(s);
    this.audio.master.gain.value = s.volume;
    $('fps').style.display = s.showFps ? 'block' : 'none';
    $('btn-fire-left').style.display = s.leftFire ? 'grid' : 'none';
    if (changed === 'quality') { this.resize(); this.renderer.shadowMap.enabled = s.quality !== 'low'; this.renderer.shadowMap.needsUpdate = true; this.game.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    if (changed === 'gyro') this.input.enableGyro(s.gyro);
    if (this.game) this.game.settings = s;
  }

  // ---------------- lobby ----------------
  setupLobbyScene() {
    this.lobbyCam = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 900);
    const sc = this.game.scene;
    this.showcase = new CharacterModel(this.assets, 'CT', sc);
    this.showcase.root.visible = false;
    this.lobbyT = 0;
  }

  refreshShowcase() {
    const team = this.ui.team === 'T' ? 'T' : 'CT';
    if (this.showcase.team !== team) { this.showcase.dispose(this.game.scene); this.showcase = new CharacterModel(this.assets, team, this.game.scene); }
    const eq = this.ui.equippedSkins();
    const wid = team === 'T' ? 'ak47' : 'm4a4';
    const pick = eq.awp ? 'awp' : eq[wid] ? wid : Object.keys(eq).find(w => w !== 'knife') || wid;
    this.showcase.gunId = null; this.showcase.setWeapon(this.assets, pick);
    if (eq[pick]) { const [id, wear] = eq[pick].split('#'); applySkin(this.showcase.gun, { ...SKIN_BY_ID[id], wear: +wear }, this.assets, team); }
    this.showcase.root.visible = true;
  }

  toLobby() {
    this.state = 'lobby';
    if (this.game.agents.length) this.game.clearMatch();
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('lobby').classList.remove('hidden'); $('matchover').classList.remove('show');
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.refreshLobby();
    this.refreshShowcase();
    this.game.effects.clear();
  }

  startMatch(opts) {
    this.showcase.root.visible = false;
    this.state = 'match';
    $('lobby').classList.add('hidden'); $('panel').classList.add('hidden'); $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden');
    this.settings.desktop = !matchMedia('(pointer: coarse)').matches;
    if (this.settings.desktop) $('touch').classList.add('desktop');
    try { if (!this.settings.desktop) { document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => { })).catch(() => { }); } } catch (e) { }
    this.input.enabled = true; this.input.reset();
    this.game.start(opts);
    this.hud.bind(this.game);
    // compile shaders for characters / viewmodels up-front to avoid hitches
    try { this.renderer.compile(this.game.scene, this.game.camera); this.renderer.compile(this.game.vm.scene, this.game.vm.camera); } catch (e) { }
    this.resize();
  }

  pause(v) {
    if (this.state !== 'match') return;
    this.paused = v; $('pause').classList.toggle('hidden', !v); this.input.reset();
    if (v && document.pointerLockElement) document.exitPointerLock();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.state === 'lobby') {
      this.lobbyT += dt;
      const t = this.lobbyT * 0.05;
      // slow cinematic orbit at long A doors with the agent in front
      const cx = 50, cz = 12;
      const sc = this.showcase.root;
      sc.position.set(cx, 0, cz);
      this.showcase.update(dt, sc.position, Math.PI * 0.95, 0, 0, 0, false, false);
      const ang = 0.35 + Math.sin(t) * 0.18;
      this.lobbyCam.position.set(cx - Math.sin(ang) * 3.4 - 0.9, 1.55, cz + Math.cos(ang) * 3.4);
      this.lobbyCam.lookAt(cx + 0.35, 1.2, cz);
      this.renderer.render(this.game.scene, this.lobbyCam);
      if (this.preview.active) this.preview.render(dt);
      return;
    }
    if (this.state === 'match') {
      if (this.input.menuReq) { this.input.menuReq = false; this.pause(!this.paused); }
      if (!this.paused) { this.game.update(dt, this.input); this.hud.update(dt); }
      this.game.render();
    }
  }
}

// 3D skin preview in the inventory
class Preview {
  constructor(assets, env) {
    this.assets = assets; this.env = env; this.active = false;
    this.scene = new THREE.Scene(); this.scene.environment = env;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(2, 3, 2); this.scene.add(d);
    const r2 = new THREE.DirectionalLight(0x88aaff, 1.2); r2.position.set(-3, 1, -2); this.scene.add(r2);
    this.cam = new THREE.PerspectiveCamera(30, 1.6, 0.01, 20);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.t = 0;
  }
  start(canvas) {
    if (!this.renderer || this.canvas !== canvas) {
      if (this.renderer) this.renderer.dispose();
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 200;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.active = true;
  }
  stop() { this.active = false; }
  show(weapon, skinId, wear) {
    this.holder.clear();
    const m = weaponWorldModel(this.assets, weapon);
    applySkin(m, skinId ? { ...SKIN_BY_ID[skinId], wear } : null, this.assets, 'T');
    m.traverse(o => { if (o.isMesh) o.material.envMap = this.env; });
    const bb = new THREE.Box3().setFromObject(m); const c = bb.getCenter(new THREE.Vector3()); const s = bb.getSize(new THREE.Vector3());
    m.position.sub(c);
    const g = new THREE.Group(); g.add(m); this.holder.add(g);
    const L = Math.max(s.x, s.y, s.z);
    this.cam.position.set(0, L * 0.15, L * 2.0); this.cam.lookAt(0, 0, 0);
  }
  render(dt) {
    if (!this.renderer) return;
    this.t += dt; this.holder.rotation.y = Math.PI / 2 + Math.sin(this.t * 0.6) * 0.7; this.holder.rotation.x = Math.sin(this.t * 0.4) * 0.12;
    this.renderer.render(this.scene, this.cam);
  }
}

new App();
