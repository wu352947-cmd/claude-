import * as THREE from 'three';

export const RARITY = {
  common: { name: '消费级', color: '#b0c3d9', w: 0 },
  industrial: { name: '工业级', color: '#5e98d9', w: 0 },
  milspec: { name: '军规级', color: '#4b69ff', w: 0.7992 },
  restricted: { name: '受限', color: '#8847ff', w: 0.1598 },
  classified: { name: '保密', color: '#d32ce6', w: 0.032 },
  covert: { name: '隐秘', color: '#eb4b4b', w: 0.0064 },
  gold: { name: '★ 非凡', color: '#e4ae39', w: 0.0026 },
};

// skin templates: mode tex (triplanar pattern) | fade (gradient) | paint (solid)
const T = (name, rarity, o) => ({ name, rarity, ...o });
const TEMPLATES = [
  T('沙暴迷彩', 'milspec', { mode: 'tex', tex: 'aerial_rocks_02', tint: '#d8c49a', scale: 3, metal: 0.1 }),
  T('海岸碎岩', 'milspec', { mode: 'tex', tex: 'coast_land_rocks_01', tint: '#a8b0a0', scale: 2.5, metal: 0.1 }),
  T('牛仔丹宁', 'milspec', { mode: 'tex', tex: 'denim_fabric', tint: '#9fb4d8', scale: 6, metal: 0.0 }),
  T('花岗岩', 'milspec', { mode: 'tex', tex: 'granite_tile', tint: '#c8c8c8', scale: 3, metal: 0.2 }),
  T('锈蚀铁皮', 'restricted', { mode: 'tex', tex: 'green_metal_rust', tint: '#ffffff', scale: 2, metal: 0.5 }),
  T('深海钢板', 'restricted', { mode: 'tex', tex: 'blue_metal_plate', tint: '#9ac0ff', scale: 2, metal: 0.8 }),
  T('手工皮革', 'restricted', { mode: 'tex', tex: 'brown_leather', tint: '#ffcf9a', scale: 3, metal: 0.0 }),
  T('樱木', 'restricted', { mode: 'tex', tex: 'japanese_sycamore', tint: '#ffd0c0', scale: 2, metal: 0.1 }),
  T('水磨石', 'classified', { mode: 'tex', tex: 'terrazzo_tiles', tint: '#ffffff', scale: 3, metal: 0.2 }),
  T('翡翠岩', 'classified', { mode: 'tex', tex: 'marble_cliff_02', tint: '#7fe0b0', scale: 2, metal: 0.5 }),
  T('赤焰锈漆', 'classified', { mode: 'tex', tex: 'rusty_painted_metal', tint: '#ff7050', scale: 2, metal: 0.6 }),
  T('皇家提花', 'covert', { mode: 'tex', tex: 'quatrefoil_jacquard_fabric', tint: '#ffd27a', scale: 4, metal: 0.85 }),
  T('大理石之心', 'covert', { mode: 'tex', tex: 'marble_01', tint: '#ffffff', scale: 2, metal: 0.35 }),
  T('霓虹渐变', 'covert', { mode: 'fade', c1: '#ff2bd6', c2: '#2bd9ff', metal: 0.9 }),
  T('黑金', 'classified', { mode: 'paint', c1: '#141414', c2: '#d4a537', metal: 0.9 }),
  T('落日渐变', 'classified', { mode: 'fade', c1: '#ffb347', c2: '#8a2be2', metal: 0.85 }),
  T('多普勒', 'gold', { mode: 'fade', c1: '#ff4fd8', c2: '#3b2bff', metal: 1.0, tex: 'marble_01', scale: 2 }),
  T('传说金', 'gold', { mode: 'paint', c1: '#d4a537', c2: '#fff1b8', metal: 1.0 }),
];

const GUNS = ['ak47', 'm4a4', 'awp', 'deagle', 'glock', 'usp', 'ump45', 'nova', 'xm1014', 'r8'];
export const SKINS = [];
// deterministic assignment: each gun gets several templates
GUNS.forEach((g, gi) => {
  TEMPLATES.forEach((t, ti) => {
    if (t.rarity === 'gold') return;
    if ((ti + gi) % 3 === 0 || (g === 'ak47' || g === 'awp' || g === 'm4a4')) SKINS.push({ id: `${g}_${ti}`, weapon: g, ...t });
  });
});
TEMPLATES.filter(t => t.rarity === 'gold' || t.rarity === 'covert').forEach((t, ti) => SKINS.push({ id: `knife_${ti}`, weapon: 'knife', ...t, rarity: 'gold' }));
export const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));

export const CASES = [
  { id: 'desert', name: '沙城武器箱', price: 250, color: '#d8a24a', skins: SKINS.filter((s, i) => i % 2 === 0 || s.weapon === 'knife').map(s => s.id) },
  { id: 'neon', name: '霓虹武器箱', price: 250, color: '#8a5cff', skins: SKINS.filter((s, i) => i % 2 === 1 || s.weapon === 'knife').map(s => s.id) },
];

export function rollCase(c) {
  const pool = c.skins.map(id => SKIN_BY_ID[id]);
  const r = Math.random(); let acc = 0; let rar = 'milspec';
  for (const k of ['gold', 'covert', 'classified', 'restricted', 'milspec']) { acc += RARITY[k].w; if (r < acc) { rar = k; break; } }
  let cand = pool.filter(s => s.rarity === rar);
  if (!cand.length) cand = pool.filter(s => s.rarity === 'milspec');
  const s = cand[Math.floor(Math.random() * cand.length)];
  const wear = Math.random();
  return { id: s.id, wear, uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
}
export function wearName(w) { return w < 0.07 ? '崭新出厂' : w < 0.15 ? '略有磨损' : w < 0.38 ? '久经沙场' : w < 0.45 ? '破损不堪' : '战痕累累'; }

// ---------- material ----------
export function applySkin(root, skin, assets, team) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const isArms = o.name.startsWith('arms') || o.parent?.name?.startsWith('arms');
    if (o.userData.baseMat === undefined) o.userData.baseMat = o.material;
    const base = o.userData.baseMat;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: isArms ? 0.85 : 0.42, metalness: isArms ? 0 : 0.45, envMapIntensity: 1.0 });
    m.flatShading = false;
    const uni = {
      uMap: { value: (skin && skin.tex && assets.skins[skin.tex]) || null }, uMode: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTint2: { value: new THREE.Color(1, 1, 1) },
      uScale: { value: 2 }, uWear: { value: 0 }, uTeam: { value: new THREE.Color(team === 'CT' ? 0x2b3a55 : 0x5a4a30) }, uArms: { value: isArms ? 1 : 0 },
      uDetail: { value: assets.skins[isArms ? 'denim_fabric' : 'rusty_painted_metal'] || null }, uDetailScale: { value: isArms ? 7 : 3.2 },
    };
    if (skin && !isArms) {
      uni.uMode.value = skin.mode === 'tex' ? (skin.c1 ? 4 : 1) : skin.mode === 'fade' ? (skin.tex ? 5 : 2) : 3;
      uni.uTint.value.set(skin.tint || skin.c1 || '#ffffff'); uni.uTint2.value.set(skin.c2 || skin.tint || '#ffffff');
      uni.uScale.value = skin.scale || 2; m.metalness = skin.metal ?? 0.4; m.roughness = 0.38 - (skin.metal || 0) * 0.15;
      uni.uWear.value = skin.wear || 0;
    }
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vOP; varying vec3 vON; uniform sampler2D uMap; uniform sampler2D uDetail; uniform float uDetailScale; uniform int uMode; uniform vec3 uTint; uniform vec3 uTint2; uniform float uScale; uniform float uWear; uniform vec3 uTeam; uniform float uArms;
vec3 tri(vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x+w.y+w.z+1e-4);
  return texture2D(uMap, p.yz*uScale).rgb*w.x + texture2D(uMap, p.xz*uScale).rgb*w.y + texture2D(uMap, p.xy*uScale).rgb*w.z; }
float triD(vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x+w.y+w.z+1e-4); float s = uDetailScale;
  vec3 c = texture2D(uDetail, p.yz*s).rgb*w.x + texture2D(uDetail, p.xz*s).rgb*w.y + texture2D(uDetail, p.xy*s).rgb*w.z; return dot(c, vec3(0.333)); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 base = diffuseColor.rgb;
  float lum = dot(base, vec3(0.299,0.587,0.114));
  float det = triD(vOP, vON);
  if (uArms > 0.5) {
    // recolor jacket sleeves by team, keep skin tones; add fabric weave
    float isJacket = step(base.r, base.g * 1.2) * step(lum, 0.25);
    diffuseColor.rgb = mix(base, uTeam * (0.6 + lum * 3.0) * (0.55 + det * 0.9), isJacket);
  } else if (uMode == 0) {
    // stock finish: subtle grime / wear from a real painted-metal scan
    diffuseColor.rgb = base * (0.78 + det * 0.5);
  } else {
    float cover = mix(0.55, 1.0, smoothstep(0.02, 0.12, lum));
    vec3 c = base;
    vec3 p = vOP;
    if (uMode == 1 || uMode == 4) c = tri(p, vON) * uTint * 1.1;
    else if (uMode == 2 || uMode == 5) { float k = clamp(p.z * 0.45 + 0.5 + p.y * 0.3, 0.0, 1.0); c = mix(uTint, uTint2, k); if (uMode == 5) c *= 0.6 + 0.6 * tri(p, vON).r; }
    else if (uMode == 3) { c = mix(uTint, uTint2, step(0.2, lum) * 0.85); }
    // wear: scratches reveal base metal on edges
    float scratch = step(1.0 - uWear * 0.6, fract(sin(dot(floor(p.xz * 60.0), vec2(12.9898,78.233))) * 43758.5453));
    diffuseColor.rgb = mix(base, mix(c, vec3(0.45), scratch * 0.6), cover);
  }
}`);
    };
    m.customProgramCacheKey = () => 'skin2' + uni.uMode.value + (isArms ? 'a' : 'g');
    o.material = m;
  });
}
