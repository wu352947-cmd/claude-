import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const WEAPON_IDS = ['knife', 'glock', 'usp', 'deagle', 'r8', 'ump45', 'nova', 'xm1014', 'ak47', 'm4a4', 'awp'];
const TEX = ['sand_blocks', 'plaster', 'plaster2', 'stone', 'old_sand', 'ground', 'ground2', 'cobble', 'concrete', 'door', 'pine', 'tin', 'container', 'planks', 'tiles', 'bconcrete'];
const PROPS = ['wooden_crate_01', 'Barrel_01', 'covered_car', 'concrete_road_barrier', 'metal_jerrycan', 'old_tyre', 'propane_tank', 'cement_bag', 'street_lamp_01', 'exterior_aircon_unit', 'metal_trash_can'];
const FX = ['muzzle_01', 'muzzle_02', 'muzzle_04', 'muzzle_05', 'smoke_01', 'smoke_04', 'smoke_07', 'spark_01', 'spark_04', 'scorch_01', 'scorch_03', 'flare_01', 'light_01', 'trace_01', 'dirt_01', 'dirt_03', 'fire_01', 'flame_02', 'circle_05', 'star_04'];
export const SKIN_TEX = ['marble_01', 'rusty_painted_metal', 'aerial_rocks_02', 'quatrefoil_jacquard_fabric', 'denim_fabric', 'granite_tile', 'terrazzo_tiles', 'brown_leather', 'green_metal_rust', 'blue_metal_plate', 'marble_cliff_02', 'coast_land_rocks_01', 'japanese_sycamore'];
const SOUNDS = [
  ...WEAPON_IDS.filter(w => w !== 'knife').flatMap(w => [w, w + '_far']),
  'reload_rifle', 'reload_pistol', 'reload_smg', 'bolt', 'shell_insert', 'pump', 'cock', 'deploy', 'dryfire',
  'step_sand_L1', 'step_sand_L2', 'step_sand_L3', 'step_sand_R1', 'step_sand_R2', 'step_sand_R3',
  'step_stone_L1', 'step_stone_L2', 'step_stone_L3', 'step_stone_R1', 'step_stone_R2', 'step_stone_R3', 'land',
  'explosion', 'explosion_far', 'hit_body1', 'hit_body2', 'imp_metal', 'imp_stone', 'imp_wood', 'headshot', 'clink2',
  'knife_hit', 'swish1', 'swish2', 'ui_click', 'ui_hover', 'ui_buy', 'beep', 'metal_hit', 'wood_hit', 'casing',
  'amb_wind', 'sting_win', 'sting_lose', 'grunt0', 'grunt1', 'grunt2', 'grunt3', 'grunt4', 'grunt5', 'grunt6', 'grunt7', 'grunt8', 'grunt9',
];

export const Assets = { tex: {}, models: {}, fx: {}, skins: {}, sounds: {}, soldier: null };

export async function loadAll(audio, onProgress) {
  const texLoader = new THREE.TextureLoader();
  const gltf = new GLTFLoader();
  const jobs = [];
  let done = 0; const total = () => jobs.length;
  const tick = () => { done++; onProgress && onProgress(done / total()); };
  const tex = (url, srgb, repeat = true) => new Promise((res) => texLoader.load(url, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
    res(t);
  }, undefined, () => res(null)));

  for (const n of TEX) for (const k of ['diff', 'nor', 'arm']) jobs.push(tex(`assets/textures/${n}_${k}.jpg`, k === 'diff').then(t => { Assets.tex[`${n}_${k}`] = t; tick(); }));
  for (const n of FX) jobs.push(tex(`assets/fx/${n}.png`, true, false).then(t => { Assets.fx[n] = t; tick(); }));
  for (const n of SKIN_TEX) jobs.push(tex(`assets/skins/${n}.jpg`, true).then(t => { Assets.skins[n] = t; tick(); }));
  jobs.push(tex('assets/sky/sky.jpg', true, false).then(t => { Assets.sky = t; tick(); }));
  const model = (name, url) => jobs.push(gltf.loadAsync(url).then(g => { Assets.models[name] = g; tick(); }).catch(e => { console.warn('model fail', url, e); tick(); }));
  for (const w of WEAPON_IDS) { model('vm_' + w, `assets/models/vm_${w}.glb`); model('w_' + w, `assets/models/w_${w}.glb`); }
  for (const p of PROPS) model('p_' + p, `assets/models/p_${p}.glb`);
  model('soldier', 'assets/models/soldier.glb');
  for (const s of SOUNDS) jobs.push(audio.load(s, `assets/sounds/${s}.mp3`).then(tick, tick));
  await Promise.all(jobs);
  return Assets;
}
