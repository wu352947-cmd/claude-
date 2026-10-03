// Weapon definitions (stats follow CS:GO values; distances converted from units: 1u = 0.0254 m)
// inaccuracy values are in degrees (cone half-angle).
const U = 0.0254;

// spray pattern builder: list of [dx, dy] increments (degrees) -> cumulative offsets
function pattern(steps) { let x = 0, y = 0; return steps.map(([dx, dy]) => [x += dx, y += dy]); }

const AK = pattern([
  [0, 0], [0.05, 0.55], [-0.08, 0.85], [0.1, 1.15], [0.2, 1.3], [-0.15, 1.25], [-0.3, 1.1], [0.35, 0.9], [0.5, 0.6],
  [-1.0, 0.35], [-1.2, 0.2], [-0.9, 0.1], [-0.6, 0.15], [0.9, -0.05], [1.3, 0.05], [1.1, 0.1], [0.9, 0], [0.6, -0.1],
  [1.0, 0.1], [-0.3, 0.2], [-0.8, 0.05], [-1.1, 0], [-0.9, 0.1], [-0.6, 0], [0.2, -0.05], [0.4, 0.05], [0.6, 0], [0.3, 0.05], [-0.2, 0], [-0.4, 0],
]);
const M4 = pattern([
  [0, 0], [0.02, 0.45], [-0.05, 0.7], [0.05, 0.95], [0.12, 1.05], [-0.1, 1.0], [-0.2, 0.9], [0.25, 0.7], [0.35, 0.45],
  [-0.8, 0.25], [-0.9, 0.15], [-0.7, 0.1], [-0.4, 0.1], [0.7, 0], [1.0, 0.05], [0.8, 0.05], [0.7, 0], [0.4, -0.05],
  [0.7, 0.05], [-0.25, 0.1], [-0.6, 0.05], [-0.8, 0], [-0.7, 0.05], [-0.4, 0], [0.15, 0], [0.3, 0.05], [0.4, 0], [0.2, 0], [-0.1, 0], [-0.3, 0],
]);
const UMP = pattern([[0, 0], [0.05, 0.5], [-0.05, 0.75], [0.1, 0.85], [0.15, 0.8], [-0.2, 0.6], [-0.4, 0.4], [0.5, 0.3], [0.6, 0.25], [-0.5, 0.2], [-0.7, 0.1], [0.4, 0.1], [0.6, 0.05], [-0.3, 0.05], [-0.5, 0], [0.4, 0], [0.3, 0], [-0.3, 0], [-0.2, 0], [0.3, 0], [0.2, 0], [-0.2, 0], [-0.3, 0], [0.2, 0], [0.1, 0]]);
const PISTOL = pattern([[0, 0], [0.1, 1.4], [-0.2, 1.3], [0.3, 1.1], [-0.3, 1.0], [0.3, 0.9], [-0.3, 0.8], [0.2, 0.7], [-0.2, 0.6], [0.1, 0.5], [0, 0.4], [0.2, 0.3], [-0.2, 0.3], [0.1, 0.2], [0, 0.2], [0, 0.2], [0, 0.2], [0, 0.2], [0, 0.2], [0, 0.2]]);
const HEAVY_PISTOL = pattern([[0, 0], [0.2, 3.6], [-0.4, 3.2], [0.4, 2.6], [-0.3, 2.2], [0.3, 2], [0, 2], [0, 2]]);
const SHOTGUN = pattern([[0, 0], [0.2, 3.4], [-0.3, 3.0], [0.3, 2.6], [-0.2, 2.4], [0.2, 2.2], [0, 2], [0, 2], [0, 2]]);
const SNIPER = pattern([[0, 0], [0, 4.8], [0, 4.5], [0, 4.0], [0, 4.0], [0, 4.0]]);

export const WEAPONS = {
  knife: {
    id: 'knife', name: '匕首', slot: 'knife', type: 'knife', price: 0, damage: 40, damage2: 65, rpm: 120, mag: 0, reserve: 0,
    speed: 250, reward: 1500, range: 2.0, deploy: 0.6, icon: 'knife', auto: true,
  },
  glock: {
    id: 'glock', name: '格洛克 18', slot: 'secondary', type: 'pistol', team: 'T', price: 200, damage: 30, ap: 0.47, rpm: 400, mag: 20, reserve: 120,
    reload: 2.2, speed: 240, rangeMod: 0.85, pen: 1, reward: 300, pellets: 1, auto: false,
    inacc: { stand: 0.32, crouch: 0.25, move: 2.4, jump: 4.0, fire: 0.85, recovery: 0.3 }, punch: 0.55, pattern: PISTOL, recoilRecover: 7, deploy: 0.85,
  },
  usp: {
    id: 'usp', name: 'P2000', slot: 'secondary', type: 'pistol', team: 'CT', price: 200, damage: 35, ap: 0.505, rpm: 352, mag: 13, reserve: 52,
    reload: 2.2, speed: 240, rangeMod: 0.91, pen: 1, reward: 300, pellets: 1, auto: false,
    inacc: { stand: 0.26, crouch: 0.2, move: 2.2, jump: 3.8, fire: 0.85, recovery: 0.32 }, punch: 0.6, pattern: PISTOL, recoilRecover: 7, deploy: 0.85,
  },
  deagle: {
    id: 'deagle', name: '沙漠之鹰', slot: 'secondary', type: 'pistol', price: 700, damage: 63, ap: 0.932, rpm: 267, mag: 7, reserve: 35,
    reload: 2.2, speed: 230, rangeMod: 0.81, pen: 2, reward: 300, pellets: 1, auto: false,
    inacc: { stand: 0.32, crouch: 0.25, move: 3.6, jump: 6, fire: 3.4, recovery: 0.52 }, punch: 1.5, pattern: HEAVY_PISTOL, recoilRecover: 4, deploy: 1.0,
  },
  r8: {
    id: 'r8', name: 'R8 左轮', slot: 'secondary', type: 'pistol', price: 600, damage: 86, ap: 0.932, rpm: 115, mag: 8, reserve: 8,
    reload: 2.3, speed: 220, rangeMod: 0.94, pen: 2, reward: 300, pellets: 1, auto: false,
    inacc: { stand: 0.2, crouch: 0.15, move: 3.0, jump: 5, fire: 2.6, recovery: 0.6 }, punch: 1.8, pattern: HEAVY_PISTOL, recoilRecover: 4, deploy: 1.0,
  },
  ump45: {
    id: 'ump45', name: 'UMP-45', slot: 'primary', type: 'smg', price: 1200, damage: 35, ap: 0.65, rpm: 666, mag: 25, reserve: 100,
    reload: 3.1, speed: 230, rangeMod: 0.75, pen: 1, reward: 600, pellets: 1, auto: true,
    inacc: { stand: 0.62, crouch: 0.45, move: 1.6, jump: 4.0, fire: 0.4, recovery: 0.34 }, punch: 0.5, pattern: UMP, recoilRecover: 6, deploy: 1.0,
  },
  nova: {
    id: 'nova', name: '新星', slot: 'primary', type: 'shotgun', price: 1050, damage: 26, ap: 0.5, rpm: 68, mag: 8, reserve: 32,
    reload: 0.5, shellReload: true, speed: 220, rangeMod: 0.7, pen: 0.5, reward: 900, pellets: 9, spread: 3.2, auto: false,
    inacc: { stand: 0.6, crouch: 0.5, move: 1.0, jump: 3.0, fire: 1.5, recovery: 0.45 }, punch: 2.6, pattern: SHOTGUN, recoilRecover: 4, deploy: 1.0,
  },
  xm1014: {
    id: 'xm1014', name: 'XM1014', slot: 'primary', type: 'shotgun', price: 2000, damage: 20, ap: 0.8, rpm: 171, mag: 7, reserve: 32,
    reload: 0.45, shellReload: true, speed: 215, rangeMod: 0.7, pen: 0.5, reward: 900, pellets: 6, spread: 3.6, auto: true,
    inacc: { stand: 0.7, crouch: 0.55, move: 1.2, jump: 3.0, fire: 1.4, recovery: 0.4 }, punch: 2.0, pattern: SHOTGUN, recoilRecover: 4.5, deploy: 1.0,
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 'primary', type: 'rifle', team: 'T', price: 2700, damage: 36, ap: 0.775, rpm: 600, mag: 30, reserve: 90,
    reload: 2.45, speed: 215, rangeMod: 0.98, pen: 2, reward: 300, pellets: 1, auto: true,
    inacc: { stand: 0.11, crouch: 0.07, move: 4.2, jump: 7.0, fire: 0.42, recovery: 0.36 }, punch: 1.0, pattern: AK, recoilRecover: 5.5, deploy: 1.1,
  },
  m4a4: {
    id: 'm4a4', name: 'M4A4', slot: 'primary', type: 'rifle', team: 'CT', price: 3100, damage: 33, ap: 0.7, rpm: 666, mag: 30, reserve: 90,
    reload: 3.0, speed: 225, rangeMod: 0.97, pen: 2, reward: 300, pellets: 1, auto: true,
    inacc: { stand: 0.09, crouch: 0.06, move: 3.6, jump: 6.4, fire: 0.36, recovery: 0.34 }, punch: 0.85, pattern: M4, recoilRecover: 5.5, deploy: 1.1,
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 'primary', type: 'sniper', price: 4750, damage: 115, ap: 0.975, rpm: 41, mag: 5, reserve: 30,
    reload: 3.6, speed: 200, scopedSpeed: 100, rangeMod: 0.99, pen: 2.5, reward: 100, pellets: 1, auto: false, scope: [40, 15],
    inacc: { stand: 4.5, scoped: 0.02, crouch: 3.8, move: 9, jump: 14, fire: 2, recovery: 0.6 }, punch: 2.6, pattern: SNIPER, recoilRecover: 3, deploy: 1.2,
  },
  he: { id: 'he', name: '高爆手雷', slot: 'grenade', type: 'grenade', price: 300, damage: 98, speed: 245, reward: 300 },
  flash: { id: 'flash', name: '闪光弹', slot: 'grenade', type: 'grenade', price: 200, speed: 245, reward: 300 },
  smoke: { id: 'smoke', name: '烟雾弹', slot: 'grenade', type: 'grenade', price: 300, speed: 245, reward: 300 },
  molotov: { id: 'molotov', name: '燃烧瓶', slot: 'grenade', type: 'grenade', team: 'T', price: 400, damage: 40, speed: 245, reward: 300 },
  incgrenade: { id: 'incgrenade', name: '燃烧弹', slot: 'grenade', type: 'grenade', team: 'CT', price: 600, damage: 40, speed: 245, reward: 300 },
};

export const EQUIP = {
  vest: { id: 'vest', name: '防弹衣', price: 650 },
  vesthelm: { id: 'vesthelm', name: '防弹衣+头盔', price: 1000 },
  kit: { id: 'kit', name: '拆弹器', price: 400, team: 'CT' },
};

export const BUY_MENU = [
  { cat: '手枪', items: ['glock', 'usp', 'deagle', 'r8'] },
  { cat: '冲锋枪/霰弹', items: ['ump45', 'nova', 'xm1014'] },
  { cat: '步枪', items: ['ak47', 'm4a4', 'awp'] },
  { cat: '装备', items: ['vest', 'vesthelm', 'kit', 'he', 'flash', 'smoke', 'molotov', 'incgrenade'] },
];

export function unitsToM(u) { return u * U; }
export function speedOf(w, scoped) { return unitsToM(scoped && w.scopedSpeed ? w.scopedSpeed : w.speed); }

// damage after distance falloff + hitgroup + armor
export const HITGROUP = { head: 4.0, chest: 1.0, stomach: 1.25, legs: 0.75 };
export function computeDamage(w, dist, group, victim, mult = 1) {
  let dmg = w.damage * mult * Math.pow(w.rangeMod ?? 1, dist / (500 * U)) * HITGROUP[group];
  let armorLoss = 0;
  const armored = group === 'head' ? victim.helmet && victim.armor > 0 : (group !== 'legs' && victim.armor > 0);
  if (armored && w.ap) {
    const reduced = dmg * w.ap;
    armorLoss = Math.floor((dmg - reduced) * 0.5);
    dmg = reduced;
  }
  return { dmg: Math.max(1, Math.round(dmg)), armorLoss };
}
