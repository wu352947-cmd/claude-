import * as THREE from 'three';
import { weaponWorldModel } from './character.js';
import { applySkin, SKIN_BY_ID } from './skins.js';
import { makeGrenade, makeC4 } from './viewmodel.js';

const svg = s => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
const EQUIP_ICONS = {
  vest: svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path d="M22 4h20l6 6v24a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V10z" fill="#fff"/><path d="M26 4l6 7 6-7" fill="none" stroke="#222" stroke-width="2"/></svg>`),
  vesthelm: svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path d="M10 8h16l4 4v22a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V12z" fill="#fff"/><path d="M36 26c0-10 6-17 14-17s14 7 14 17v3H36z" fill="#fff"/><rect x="34" y="28" width="30" height="4" rx="2" fill="#fff"/></svg>`),
  kit: svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><rect x="12" y="10" width="40" height="22" rx="4" fill="#fff"/><path d="M24 10V6h16v4" fill="none" stroke="#fff" stroke-width="3"/><path d="M30 15h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#222"/></svg>`),
};

export class IconMaker {
  constructor(renderer, assets) {
    this.r = renderer; this.assets = assets;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 3, 2); this.scene.add(d);
    this.cache = {};
  }

  render(obj, w, h, silhouette, angle = 0) {
    const r = this.r;
    const holder = new THREE.Group(); holder.add(obj); this.scene.add(holder);
    if (silhouette) obj.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0xffffff }); });
    holder.rotation.y = angle;
    holder.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(holder); const c = bb.getCenter(new THREE.Vector3()); const s = bb.getSize(new THREE.Vector3());
    const cam = this.cam; const aspect = w / h;
    // side view from +X: horizontal extent = z size, vertical = y size
    let hw = Math.max(s.z / 2, s.y / 2 * aspect) * 1.08, hh = hw / aspect;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
    cam.position.set(c.x + 10, c.y, c.z); cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const prevBg = this.scene.background; this.scene.background = null;
    const oldTarget = r.getRenderTarget(); const oldClear = r.getClearAlpha(); const oldColor = r.getClearColor(new THREE.Color());
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, cam);
    const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px);
    r.setRenderTarget(oldTarget); r.setClearColor(oldColor, oldClear);
    this.scene.remove(holder); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    this.scene.background = prevBg;
    return cv.toDataURL('image/png');
  }

  weaponIcons() {
    const out = { ...EQUIP_ICONS };
    for (const id of ['knife', 'glock', 'usp', 'deagle', 'r8', 'ump45', 'nova', 'xm1014', 'ak47', 'm4a4', 'awp']) {
      out[id] = this.render(weaponWorldModel(this.assets, id), 200, 64, true);
    }
    const g = makeGrenade(); g.scale.setScalar(4); out.he = out.flash = out.smoke = this.render(g, 64, 64, true);
    const mo = makeGrenade(); mo.children[0].scale.set(0.8, 1.6, 0.8); mo.scale.setScalar(4); out.molotov = out.incgrenade = this.render(mo, 64, 64, true);
    const c4 = makeC4(); out.c4 = this.render(c4, 96, 64, true);
    return out;
  }

  skinIcon(skinId, weapon, wear = 0) {
    const key = skinId + '|' + weapon;
    if (this.cache[key]) return this.cache[key];
    const m = weaponWorldModel(this.assets, weapon);
    if (skinId) applySkin(m, { ...SKIN_BY_ID[skinId], wear }, this.assets, 'T');
    m.traverse(o => { if (o.isMesh) o.material.envMap = this.env || null; });
    const url = this.render(m, 220, 100, false, 0);
    this.cache[key] = url; return url;
  }
}
