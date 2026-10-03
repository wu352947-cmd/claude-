// 程序化模型：兵马俑、文官俑、陶马与战车、机弩、人鱼膏灯、铜椁、宫观、鬼魂、骸骨、各种拾取物
import * as THREE from 'three';
import { mergeGeos, M, mulberry } from './util.js';

const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, s = 12, ...rest) => new THREE.CylinderGeometry(rt, rb, h, s, ...rest);
const Sph = (r, ws = 14, hs = 10, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);
const Cap = (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 4, s);
const Tor = (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
const Lathe = (pts, s = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s);

export function createMaterials(T) {
  const std = (t, o = {}) => new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.ormMap, metalnessMap: o.metal ? t.ormMap : null,
    roughness: 1, metalness: o.metal ? 1 : 0, ...o.extra, vertexColors: !!o.vc
  });
  const m = {
    earth: std(T.earth), rammed: std(T.rammed), brick: std(T.brick), stone: std(T.stone), palace: std(T.palace),
    wood: std(T.wood), bronze: std(T.bronze, { metal: true }), bronzeOrnate: std(T.bronzeOrnate, { metal: true }),
    terracotta: std(T.terracotta, { vc: true }), stoneArmor: std(T.stoneArmor), bone: std(T.bone, { vc: true }),
    cloth: std(T.cloth, { vc: true }), lacquer: std(T.lacquer, { vc: true }), jade: std(T.jade),
    woodVC: std(T.wood, { vc: true }), bronzeVC: std(T.bronze, { metal: true, vc: true }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    eyes: new THREE.MeshBasicMaterial({ color: 0x050302 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000 })
  };
  m.palace.envMapIntensity = 0.6;
  return m;
}

// ---------------- 陶俑 ----------------
// kind: 'soldier' 铠甲武士 | 'archer' 轻装 | 'general' 将军 | 'official' 文官
export function warriorGeometry(kind = 'soldier', seed = 1) {
  const r = mulberry(seed);
  const P = [];
  const add = (geo, m, c = [1, 1, 1], uv = 1) => P.push({ geo, m, color: c, uv });
  const skin = [1.08, 1.02, 0.95], armor = [0.78, 0.76, 0.74], robe = [0.95, 0.9, 0.86], dark = [0.55, 0.52, 0.5], hair = [0.42, 0.4, 0.38];
  const tall = kind === 'general' ? 1.08 : 1 + (r() - 0.5) * 0.05;
  // 踏板
  add(Box(0.66, 0.1, 0.52), M(0, 0.05, 0), [0.7, 0.68, 0.66], 2);
  if (kind === 'official') {
    add(Lathe([[0.27, 0.1], [0.27, 0.16], [0.24, 0.6], [0.2, 1.0], [0.19, 1.3], [0.12, 1.42], [0, 1.44]], 18), M(0, 0, 0, 0, 0, 0, 1, tall, 0.82), robe, 2);
    add(Cyl(0.075, 0.09, 0.32, 10), M(0, 1.08, 0.17, Math.PI / 2, 0, 0), robe);       // 拱手的袖筒
    add(Box(0.04, 0.32, 0.14), M(-0.11, 1.1, 0.1, 0, 0, 0.1), dark);                  // 腰间削刀与砺石
  } else {
    // 腿与履
    for (const s of [-1, 1]) {
      add(Box(0.13, 0.08, 0.27), M(s * 0.11, 0.14, 0.04), dark);
      add(Cyl(0.085, 0.075, 0.5, 10), M(s * 0.11, 0.42, 0), kind === 'archer' ? robe : [0.85, 0.82, 0.8]);
    }
    // 战袍下摆
    add(Lathe([[0.25, 0.62], [0.235, 0.82], [0.215, 1.02], [0, 1.02]], 18), M(0, 0, 0, 0, 0, 0, 1, 1, 0.82), robe, 2);
    // 躯干
    add(Cyl(0.21, 0.225, 0.44, 16), M(0, 1.2, 0, 0, 0, 0, 1, 1, 0.78), kind === 'archer' ? robe : armor, 2);
    if (kind !== 'archer') {
      // 甲片：一圈圈错位的甲衣
      for (let i = 0; i < 5; i++) add(Cyl(0.232 - i * 0.004, 0.24 - i * 0.004, 0.05, 16), M(0, 1.02 + i * 0.075, 0, 0, i * 0.2, 0, 1, 1, 0.8), [0.72, 0.7, 0.68], 3);
      for (const s of [-1, 1]) add(Sph(0.11, 10, 6), M(s * 0.23, 1.38, 0, 0, 0, s * 0.3, 1, 0.7, 1), armor); // 披膊
    }
    if (kind === 'general') {
      add(Lathe([[0.27, 0.62], [0.25, 0.9], [0, 0.9]], 18), M(0, 0.05, 0, 0, 0, 0, 1, 1, 0.85), robe, 2);
      for (const [x, y] of [[-0.12, 1.3], [0.12, 1.3], [0, 1.12]]) add(Tor(0.03, 0.012, 6, 12), M(x, y, 0.19), [0.6, 0.3, 0.28]); // 彩带花结
    }
    add(Tor(0.22, 0.02, 6, 20), M(0, 1.0, 0, Math.PI / 2, 0, 0, 1, 1, 0.8), dark); // 腰带
  }
  // 手臂与手
  const arm = (s, pose) => {
    const sx = s * 0.26;
    if (pose === 'down') {
      add(Cap(0.058, 0.26), M(sx, 1.2, 0.0, 0.05, 0, s * 0.12), robe);
      add(Cap(0.05, 0.24), M(sx + s * 0.04, 0.93, 0.05, -0.25, 0, s * 0.05), robe);
      add(Sph(0.048, 8, 6), M(sx + s * 0.05, 0.78, 0.09), skin);
    } else if (pose === 'hold') { // 屈肘握兵器
      add(Cap(0.058, 0.26), M(sx, 1.2, 0.03, -0.25, 0, s * 0.1), robe);
      add(Cap(0.05, 0.22), M(sx + s * 0.02, 1.0, 0.18, -1.35, 0, 0), robe);
      add(Sph(0.05, 8, 6), M(sx + s * 0.02, 0.98, 0.33), skin);
    } else if (pose === 'sword') { // 双手拄剑
      add(Cap(0.058, 0.26), M(sx, 1.2, 0.03, -0.2, 0, s * 0.2), robe);
      add(Cap(0.05, 0.22), M(s * 0.11, 0.98, 0.17, -0.9, 0, -s * 0.9), robe);
      add(Sph(0.05, 8, 6), M(s * 0.03, 0.92, 0.27), skin);
    }
  };
  if (kind === 'general') { arm(-1, 'sword'); arm(1, 'sword'); add(Box(0.05, 0.75, 0.025), M(0, 0.55, 0.28), [0.6, 0.58, 0.55]); }
  else if (kind !== 'official') { arm(-1, 'down'); arm(1, 'hold'); }
  else { add(Cap(0.06, 0.24), M(-0.24, 1.18, 0.05, -0.4, 0, -0.15), robe); add(Cap(0.06, 0.24), M(0.24, 1.18, 0.05, -0.4, 0, 0.15), robe); }

  // 脖颈、围巾
  const ny = kind === 'official' ? 1.45 : 1.46;
  add(Cyl(0.055, 0.06, 0.12, 10), M(0, ny, 0), skin);
  add(Tor(0.07, 0.03, 6, 14), M(0, ny - 0.02, 0, Math.PI / 2), robe);
  // 头部：每个人的脸都略有不同（千人千面）
  const hy = ny + 0.16, fw = 0.95 + (r() - 0.5) * 0.12, fl = 1.12 + (r() - 0.5) * 0.12;
  add(Sph(0.105, 16, 12), M(0, hy, 0, 0, 0, 0, fw, fl, 1), skin);
  add(Box(0.03, 0.07, 0.04), M(0, hy - 0.01, 0.1, -0.15), skin);                    // 鼻
  add(Box(0.15, 0.02, 0.03), M(0, hy + 0.04, 0.09), [0.8, 0.76, 0.72]);              // 眉骨
  for (const s of [-1, 1]) {
    add(Box(0.065, 0.012, 0.012), M(s * 0.035, hy - 0.05, 0.1, 0, 0, s * (0.35 + r() * 0.2)), hair); // 上翘的八字胡
    add(Sph(0.025, 6, 6), M(s * 0.1, hy, 0, 0, 0, 0, 0.6, 1.3, 1), skin);            // 耳
  }
  add(Box(0.03, 0.03, 0.02), M(0, hy - 0.09, 0.09), hair);                         // 颏须
  // 发型 / 冠
  add(Sph(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0, hy + 0.01, -0.01, -0.2, 0, 0, fw, 1.05, 1), hair);
  if (kind === 'general') {
    add(Box(0.2, 0.09, 0.14), M(0, hy + 0.13, -0.01), [0.5, 0.4, 0.38]);          // 鹖冠
    for (const s of [-1, 1]) add(Box(0.03, 0.12, 0.08), M(s * 0.07, hy + 0.2, -0.04, -0.3, 0, s * 0.25), [0.5, 0.4, 0.38]);
  } else if (kind === 'official') {
    add(Box(0.06, 0.03, 0.22), M(0, hy + 0.13, 0.0, 0.3), [0.4, 0.36, 0.34]);     // 长冠
  } else {
    add(Sph(0.045, 8, 6), M(0.07, hy + 0.09, -0.03), hair);                        // 偏右的发髻
  }
  return mergeGeos(P);
}

export function warriorEyes() {
  const g = mergeGeos([{ geo: Sph(0.014, 6, 4), m: M(-0.038, 1.64, 0.095) }, { geo: Sph(0.014, 6, 4), m: M(0.038, 1.64, 0.095) }], false);
  return g;
}

// ---------------- 陶马与战车 ----------------
export function horseGeometry(seed = 3) {
  const P = []; const c = [1, 1, 1];
  const add = (geo, m, col = c) => P.push({ geo, m, color: col, uv: 2 });
  add(Cap(0.3, 0.9, 12), M(0, 1.15, 0, 0, 0, Math.PI / 2));                 // 躯干（沿 x）
  add(Cap(0.17, 0.4, 10), M(0.62, 1.48, 0, 0, 0, -0.75));                    // 颈
  add(Cyl(0.08, 0.13, 0.45, 8), M(0.85, 1.62, 0, 0, 0, Math.PI / 2 + 0.6));  // 头
  for (const s of [-1, 1]) add(Box(0.04, 0.1, 0.03), M(0.72, 1.86, s * 0.05, 0, 0, -0.3)); // 耳
  add(Box(0.32, 0.06, 0.05), M(0.58, 1.6, 0, 0, 0, -0.75), [0.6, 0.58, 0.56]); // 鬃
  for (const [x, z] of [[0.42, 0.14], [0.42, -0.14], [-0.42, 0.14], [-0.42, -0.14]]) {
    add(Cyl(0.065, 0.05, 0.85, 8), M(x, 0.48, z));
    add(Cyl(0.06, 0.06, 0.06, 8), M(x, 0.04, z), [0.6, 0.58, 0.56]);
  }
  add(Cap(0.06, 0.25, 6), M(-0.68, 0.98, 0, 0, 0, -0.4), [0.7, 0.68, 0.66]); // 打结的马尾
  add(Box(1.6, 0.08, 0.55), M(0, 0.04, 0), [0.7, 0.68, 0.66]);
  return mergeGeos(P);
}

export function chariotGeometry() {
  const P = [];
  const add = (geo, m, col = [1, 1, 1]) => P.push({ geo, m, color: col, uv: 1 });
  add(Box(1.3, 0.06, 1.2), M(0, 1.05, 0));
  for (const [x, z, w, d] of [[0.62, 0, 0.05, 1.2], [-0.62, 0, 0.05, 1.2], [0, 0.58, 1.3, 0.05], [0, -0.58, 0.5, 0.05]]) add(Box(w, 0.35, d), M(x, 1.25, z));
  for (const s of [-1, 1]) {
    add(Tor(0.68, 0.04, 6, 28), M(0, 0.68, s * 0.8));
    for (let k = 0; k < 10; k++) add(Box(0.03, 1.3, 0.03), M(0, 0.68, s * 0.8, 0, 0, k * Math.PI / 10));
    add(Cyl(0.08, 0.08, 0.2, 8), M(0, 0.68, s * 0.8, Math.PI / 2));
  }
  add(Cyl(0.04, 0.04, 1.9, 6), M(0, 0.68, 0, Math.PI / 2));             // 车轴
  add(Cyl(0.05, 0.05, 2.6, 6), M(1.6, 0.95, 0, 0, 0, Math.PI / 2 + 0.08)); // 辕
  add(Cyl(0.03, 0.03, 1.6, 6), M(2.8, 1.05, 0, Math.PI / 2));            // 衡
  add(Cyl(0.025, 0.025, 1.6, 6), M(0, 1.9, 0));                          // 伞柄
  add(Cyl(0.03, 1.0, 0.25, 16, 1, true), M(0, 2.75, 0), [0.8, 0.7, 0.6]);  // 伞盖
  return mergeGeos(P);
}

// ---------------- 机关 ----------------
export function crossbowGeometry() {
  const P = [];
  const add = (geo, m, col = [1, 1, 1]) => P.push({ geo, m, color: col });
  add(Box(0.08, 0.08, 0.7), M(0, 0, 0.1), [0.55, 0.42, 0.3]);            // 弩臂（木）
  add(Box(0.1, 0.12, 0.16), M(0, -0.04, -0.12), [1, 0.9, 0.7]);          // 青铜弩机
  add(Tor(0.36, 0.022, 6, 20, Math.PI * 0.75), M(0, 0, 0.38, Math.PI / 2, 0, Math.PI * 0.125 + Math.PI / 2), [0.5, 0.38, 0.26]);
  add(Cyl(0.004, 0.004, 0.66, 4), M(0, 0, 0.25, 0, 0, Math.PI / 2), [0.8, 0.8, 0.7]);
  add(Box(0.3, 0.3, 0.1), M(0, 0, -0.25), [0.4, 0.38, 0.36]);            // 嵌在墙里的底座
  return mergeGeos(P);
}

export function arrowGeometry() {
  const P = [];
  P.push({ geo: Cyl(0.007, 0.007, 0.62, 5), m: M(0, 0, 0, Math.PI / 2), color: [0.45, 0.32, 0.2] });
  P.push({ geo: new THREE.ConeGeometry(0.018, 0.07, 3), m: M(0, 0, 0.34, Math.PI / 2), color: [1.1, 0.95, 0.7] });
  for (let i = 0; i < 3; i++) P.push({ geo: Box(0.002, 0.04, 0.1), m: M(0, 0, -0.27, 0, 0, i * Math.PI / 1.5), color: [0.6, 0.55, 0.5] });
  return mergeGeos(P);
}

export function leverGeometry() {
  return {
    base: mergeGeos([
      { geo: Box(0.5, 0.9, 0.35), m: M(0, 0.45, 0), color: [0.8, 0.78, 0.74] },
      { geo: Box(0.6, 0.08, 0.45), m: M(0, 0.92, 0), color: [0.7, 0.68, 0.64] }
    ]),
    handle: mergeGeos([
      { geo: Cyl(0.03, 0.035, 0.75, 8), m: M(0, 0.37, 0), color: [1, 1, 1] },
      { geo: Sph(0.06, 10, 8), m: M(0, 0.76, 0), color: [1, 1, 1] },
      { geo: Cyl(0.07, 0.07, 0.12, 10), m: M(0, 0, 0, 0, 0, Math.PI / 2), color: [0.8, 0.8, 0.8] }
    ])
  };
}

// 门：石门/铜门，门钉与铺首衔环
export function doorGeometry(w, h) {
  const P = [];
  const add = (geo, m, col = [1, 1, 1]) => P.push({ geo, m, color: col, uv: 1 });
  add(Box(w, h, 0.3), M(0, h / 2, 0));
  add(Box(0.04, h, 0.32), M(0, h / 2, 0), [0.6, 0.6, 0.6]);
  for (let ix = 0; ix < 6; ix++) for (let iy = 0; iy < 7; iy++) {
    const x = -w / 2 + w / 12 + ix * w / 6 + (ix >= 3 ? 0.05 : -0.05), y = 0.4 + iy * (h - 0.8) / 6;
    for (const s of [-1, 1]) add(Sph(0.045, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M(x, y, s * 0.15, s * Math.PI / 2), [1.1, 1.05, 1]);
  }
  for (const [x, s] of [[-0.3, 1], [0.3, 1], [-0.3, -1], [0.3, -1]]) {
    add(Cyl(0.16, 0.16, 0.05, 6), M(x, h * 0.48, s * 0.17, Math.PI / 2), [1.1, 1, 0.9]);
    add(Tor(0.12, 0.02, 6, 16), M(x, h * 0.48 - 0.16, s * 0.2), [1.2, 1.1, 0.9]);
  }
  return mergeGeos(P);
}

// ---------------- 灯 ----------------
export function lampGeometry(kind = 'stand') {
  if (kind === 'stand') {
    return mergeGeos([
      { geo: Lathe([[0, 0], [0.32, 0], [0.3, 0.06], [0.14, 0.14], [0.06, 0.3], [0.045, 1.1], [0.08, 1.18], [0.22, 1.24], [0.24, 1.3], [0.2, 1.3], [0.06, 1.26], [0, 1.26]], 18), m: M(), color: [1, 1, 1] }
    ]);
  }
  return mergeGeos([ // 豆形灯
    { geo: Lathe([[0, 0], [0.18, 0], [0.1, 0.05], [0.04, 0.12], [0.035, 0.45], [0.16, 0.5], [0.18, 0.56], [0.15, 0.56], [0, 0.52]], 16), m: M(), color: [1, 1, 1] }
  ]);
}

// ---------------- 铜椁 ----------------
export function coffinGeometry() {
  const body = [], lid = [];
  const L = 3.2, Wd = 1.6, H = 1.3;
  body.push({ geo: Box(L, H, Wd), m: M(0, H / 2 + 1.2, 0), color: [1, 1, 1] });
  for (const [x, z] of [[L / 2, Wd / 2], [-L / 2, Wd / 2], [L / 2, -Wd / 2], [-L / 2, -Wd / 2]]) body.push({ geo: Box(0.16, H + 0.1, 0.16), m: M(x, H / 2 + 1.2, z), color: [1.15, 1.1, 1] });
  for (const y of [1.3, 1.2 + H - 0.1]) body.push({ geo: Box(L + 0.1, 0.08, Wd + 0.1), m: M(0, y, 0), color: [1.2, 1.1, 1] });
  for (const s of [-1, 1]) for (const x of [-0.9, 0.9]) {
    body.push({ geo: Cyl(0.13, 0.13, 0.05, 6), m: M(x, 1.9, s * (Wd / 2 + 0.03), Math.PI / 2), color: [1.2, 1.1, 0.9] });
    body.push({ geo: Tor(0.1, 0.02, 6, 16), m: M(x, 1.75, s * (Wd / 2 + 0.06)), color: [1.3, 1.2, 0.9] });
  }
  // 三级台阶
  const steps = [];
  for (let i = 0; i < 3; i++) steps.push({ geo: Box(L + 2.4 - i * 0.8, 0.4, Wd + 2.4 - i * 0.8), m: M(0, 0.2 + i * 0.4, 0), color: [1, 1, 1], uv: 2 });
  lid.push({ geo: Box(L + 0.2, 0.18, Wd + 0.2), m: M(0, 0.09, 0), color: [1, 1, 1] });
  lid.push({ geo: Box(L - 0.2, 0.14, Wd - 0.4), m: M(0, 0.25, 0), color: [1.1, 1, 0.95] });
  lid.push({ geo: Box(L - 0.6, 0.1, 0.12), m: M(0, 0.36, 0), color: [1.2, 1.1, 1] });
  return { body: mergeGeos(body), lid: mergeGeos(lid), steps: mergeGeos(steps) };
}

// ---------------- 宫观（微缩宫殿模型） ----------------
export function palaceModelGeometry(seed = 1) {
  const r = mulberry(seed);
  const P = [];
  const add = (geo, m, col) => P.push({ geo, m, color: col, uv: 1 });
  const w = 1.2 + r() * 0.5, d = 0.9 + r() * 0.3;
  add(Box(w + 0.4, 0.3, d + 0.4), M(0, 0.15, 0), [0.75, 0.72, 0.68]);
  add(Box(w + 0.2, 0.12, d + 0.2), M(0, 0.36, 0), [0.8, 0.77, 0.72]);
  add(Box(w * 0.8, 0.6, d * 0.7), M(0, 0.72, 0), [1.3, 0.55, 0.45]);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) add(Cyl(0.035, 0.035, 0.6, 6), M(-w / 2 + 0.1 + i * (w - 0.2) / 5, 0.72, s * d * 0.45), [1.4, 0.5, 0.4]);
  // 庑殿顶
  add(Cyl(0.08, 1, 0.45, 4), M(0, 1.25, 0, 0, Math.PI / 4, 0, 1, 1, 1).multiply(M(0, 0, 0, 0, 0, 0, w * 0.82, 1, d * 0.85)), [0.45, 0.45, 0.48]);
  add(Box(w * 0.5, 0.06, 0.06), M(0, 1.48, 0), [0.4, 0.4, 0.42]);
  if (r() > 0.4) { // 双层阙楼
    add(Box(w * 0.45, 0.4, d * 0.4), M(0, 1.65, 0), [1.3, 0.55, 0.45]);
    add(Cyl(0.05, 0.6, 0.3, 4), M(0, 2.0, 0, 0, Math.PI / 4, 0, w * 0.6, 1, d * 0.6), [0.45, 0.45, 0.48]);
  }
  return mergeGeos(P);
}

// ---------------- 骸骨 ----------------
export function skullGeometry() {
  return mergeGeos([
    { geo: Sph(0.1, 12, 10), m: M(0, 0.1, 0, 0, 0, 0, 0.85, 0.95, 1.05), color: [1, 1, 1] },
    { geo: Box(0.12, 0.06, 0.08), m: M(0, 0.02, 0.06), color: [0.95, 0.95, 0.95] },
    { geo: Sph(0.026, 6, 5), m: M(-0.035, 0.1, 0.085), color: [0.05, 0.05, 0.05] },
    { geo: Sph(0.026, 6, 5), m: M(0.035, 0.1, 0.085), color: [0.05, 0.05, 0.05] },
    { geo: Box(0.02, 0.03, 0.02), m: M(0, 0.06, 0.1), color: [0.1, 0.1, 0.1] }
  ]);
}
export function bonePileGeometry(seed = 1, n = 9) {
  const r = mulberry(seed); const P = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.5;
    P.push({ geo: Cap(0.022, 0.35 + r() * 0.15, 5), m: M(Math.cos(a) * d, 0.03 + r() * 0.06, Math.sin(a) * d, Math.PI / 2 + (r() - 0.5) * 0.4, r() * 6, 0), color: [0.9 + r() * 0.1, 0.88, 0.8] });
  }
  for (let i = 0; i < 1 + (r() * 2 | 0); i++) {
    const s = skullGeometry(); P.push({ geo: s, m: M((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6, (r() - 0.5) * 0.8, r() * 6, (r() - 0.5) * 0.8), color: [1, 1, 1] });
  }
  for (let i = 0; i < 5; i++) P.push({ geo: Tor(0.12, 0.012, 4, 10, Math.PI), m: M((r() - 0.5) * 0.4, 0.02, (r() - 0.5) * 0.4, -Math.PI / 2, r() * 6, 0), color: [0.88, 0.85, 0.78] });
  return mergeGeos(P);
}
// 坐靠墙的遗骸（带破衣与头灯）
export function corpseGeometry(seed = 5) {
  const r = mulberry(seed);
  const bones = [], cloth = [];
  bones.push({ geo: skullGeometry(), m: M(0, 0.78, 0.05, 0.5, 0.3, 0.15) });
  for (let i = 0; i < 6; i++) bones.push({ geo: Tor(0.11 - Math.abs(i - 2.5) * 0.01, 0.01, 4, 12, Math.PI * 1.3), m: M(0, 0.5 + i * 0.04, 0.02, Math.PI / 2, 0, -Math.PI * 0.15 + 0.2), color: [0.9, 0.86, 0.78] });
  bones.push({ geo: Cyl(0.015, 0.015, 0.5, 5), m: M(0, 0.48, -0.06, 0.1) });
  for (const s of [-1, 1]) {
    bones.push({ geo: Cap(0.025, 0.38, 5), m: M(s * 0.12, 0.12, 0.25, Math.PI / 2 - 0.15, 0, 0) });
    bones.push({ geo: Cap(0.02, 0.36, 5), m: M(s * 0.14, 0.15, 0.62, 0.5, 0, 0) });
    bones.push({ geo: Cap(0.018, 0.25, 5), m: M(s * 0.18, 0.4, 0.06, 0.2, 0, s * 0.3) });
    bones.push({ geo: Cap(0.016, 0.22, 5), m: M(s * 0.2, 0.2, 0.18, 1.3, 0, 0) });
  }
  cloth.push({ geo: Cyl(0.15, 0.2, 0.42, 10, 1, true), m: M(0, 0.5, 0, 0.1), color: [1, 1, 1] });
  cloth.push({ geo: Box(0.42, 0.12, 0.5), m: M(0, 0.1, 0.3), color: [0.8, 0.85, 0.9] });
  cloth.push({ geo: Box(0.3, 0.32, 0.18), m: M(0.32, 0.16, -0.05, 0, 0.4, 0), color: [0.6, 0.7, 0.5] }); // 帆布包
  const lamp = mergeGeos([{ geo: Cyl(0.035, 0.035, 0.05, 10), m: M(0, 0.9, 0.12, Math.PI / 2 + 0.5), color: [0.2, 0.2, 0.2] }, { geo: Tor(0.1, 0.01, 4, 16), m: M(0, 0.84, 0.05, Math.PI / 2 + 0.5), color: [0.15, 0.15, 0.15] }]);
  return { bones: mergeGeos(bones.map(b => ({ color: [0.92, 0.88, 0.8], ...b }))), cloth: mergeGeos(cloth), lamp };
}

// ---------------- 鬼魂 ----------------
export function ghostMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(0.6, 0.85, 0.8) } },
    vertexShader: `
      uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 p = position;
        float sway = sin(uTime*1.7 + p.y*3.0) * 0.04 * (1.6 - p.y);
        p.x += sway; p.z += cos(uTime*1.3 + p.y*2.0) * 0.03 * (1.6 - p.y);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = p;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float fr = pow(1.0 - abs(dot(vN, vV)), 1.6);
        float wisp = n(vec2(vP.x*6.0 + vP.z*4.0, vP.y*5.0 - uTime*1.2)) * n(vec2(vP.y*9.0 + uTime*0.7, vP.x*7.0));
        float fade = smoothstep(0.0, 0.6, vP.y);
        float a = (fr*0.8 + wisp*0.5 + 0.08) * fade * uAlpha;
        a *= 0.85 + 0.15*sin(uTime*23.0);
        gl_FragColor = vec4(uColor * (0.6 + fr*1.2 + wisp*0.5), clamp(a, 0.0, 1.0));
      }`
  });
}
export function ghostGeometry() {
  return mergeGeos([
    { geo: Lathe([[0.0, 0.0], [0.42, 0.0], [0.3, 0.4], [0.24, 0.9], [0.22, 1.3], [0.16, 1.45], [0.07, 1.52], [0, 1.52]], 16), m: M() },
    { geo: Sph(0.12, 14, 10), m: M(0, 1.66, 0.02, 0, 0, 0, 0.9, 1.25, 1) },
    { geo: Cap(0.045, 0.75, 6), m: M(-0.27, 1.1, 0.08, 0.25, 0, 0.12) },
    { geo: Cap(0.045, 0.75, 6), m: M(0.27, 1.1, 0.08, 0.25, 0, -0.12) },
    { geo: Lathe([[0.0, 0.0], [0.17, 0.0], [0.15, 0.1], [0.12, 0.35], [0, 0.4]], 12), m: M(0, 1.5, -0.04, -0.15) } // 披发
  ], false);
}
export function ghostFace() {
  return mergeGeos([
    { geo: Sph(0.03, 8, 6), m: M(-0.045, 1.69, 0.1, 0, 0, 0, 1, 1.4, 0.6) },
    { geo: Sph(0.03, 8, 6), m: M(0.045, 1.69, 0.1, 0, 0, 0, 1, 1.4, 0.6) },
    { geo: Sph(0.035, 8, 6), m: M(0, 1.58, 0.11, 0, 0, 0, 0.8, 1.6, 0.5) }
  ], false);
}

// ---------------- 拾取物 ----------------
export function itemGeometry(kind) {
  switch (kind) {
    case 'battery': return mergeGeos([
      { geo: Cyl(0.035, 0.035, 0.11, 12), m: M(0, 0.055, 0, 0, 0, Math.PI / 2), color: [0.75, 0.12, 0.08] },
      { geo: Cyl(0.036, 0.036, 0.03, 12), m: M(0.04, 0.055, 0, 0, 0, Math.PI / 2), color: [0.1, 0.1, 0.1] },
      { geo: Cyl(0.012, 0.012, 0.015, 8), m: M(-0.062, 0.055, 0, 0, 0, Math.PI / 2), color: [0.8, 0.8, 0.8] }]);
    case 'herb': return mergeGeos([
      { geo: Lathe([[0, 0], [0.06, 0], [0.075, 0.05], [0.07, 0.11], [0.03, 0.15], [0.025, 0.19], [0.035, 0.2], [0, 0.2]], 14), m: M(), color: [0.75, 0.82, 0.78] },
      { geo: Cyl(0.03, 0.03, 0.03, 8), m: M(0, 0.21, 0), color: [0.6, 0.15, 0.1] }]);
    case 'note': {
      const P = [];
      for (let i = 0; i < 9; i++) P.push({ geo: Box(0.024, 0.006, 0.36), m: M(-0.11 + i * 0.027, 0.01, 0, 0, (i % 2) * 0.02, 0), color: [0.85, 0.72, 0.45] });
      for (const z of [-0.1, 0.1]) P.push({ geo: Box(0.27, 0.01, 0.008), m: M(0, 0.016, z), color: [0.35, 0.22, 0.12] });
      return mergeGeos(P);
    }
    case 'tally': return mergeGeos([ // 半边虎符
      { geo: Cap(0.035, 0.15, 6), m: M(0, 0.05, 0, 0, 0, Math.PI / 2, 1, 1, 0.5), color: [1, 1, 1] },
      { geo: Sph(0.04, 8, 6), m: M(0.12, 0.08, 0, 0, 0, 0, 1, 1, 0.5), color: [1, 1, 1] },
      { geo: Box(0.025, 0.05, 0.02), m: M(0.06, 0.01, 0), color: [1, 1, 1] }, { geo: Box(0.025, 0.05, 0.02), m: M(-0.06, 0.01, 0), color: [1, 1, 1] },
      { geo: Cap(0.01, 0.08, 4), m: M(-0.14, 0.09, 0, 0, 0, 0.8), color: [1, 1, 1] },
      { geo: Box(0.16, 0.012, 0.004), m: M(0, 0.07, 0.02), color: [3, 2.4, 1.2] }]);
    case 'gear': {
      const P = [{ geo: Cyl(0.13, 0.13, 0.04, 20), m: M(0, 0.02, 0), color: [1, 1, 1] }, { geo: Cyl(0.04, 0.04, 0.06, 10), m: M(0, 0.03, 0), color: [0.7, 0.7, 0.7] }];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.push({ geo: Box(0.05, 0.04, 0.05), m: M(Math.cos(a) * 0.15, 0.02, Math.sin(a) * 0.15, 0, -a, 0), color: [1, 1, 1] }); }
      return mergeGeos(P);
    }
    case 'pearl': return mergeGeos([{ geo: Sph(0.06, 14, 10), m: M(0, 0.06, 0), color: [1.2, 1.2, 1.15] }]);
  }
}

// ---------------- 杂项 ----------------
export function rockGeometry(seed = 1, r = 0.4) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const rr = mulberry(seed), p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 0.7 + rr() * 0.5);
    const s = map.get(key); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

// 石铠甲与木架
export function armorRackGeometry() {
  return {
    rack: mergeGeos([
      { geo: Box(0.08, 1.8, 0.08), m: M(0, 0.9, -0.12), color: [1, 1, 1] },
      { geo: Box(0.9, 0.07, 0.07), m: M(0, 1.55, -0.12), color: [1, 1, 1] },
      { geo: Box(0.6, 0.08, 0.5), m: M(0, 0.04, -0.05), color: [1, 1, 1] }]),
    armor: mergeGeos([
      { geo: Lathe([[0.27, 0], [0.26, 0.25], [0.24, 0.55], [0.2, 0.72], [0.1, 0.78], [0.08, 0.8]], 18), m: M(0, 0.85, 0, 0, 0, 0, 1, 1, 0.75), uv: 3 },
      { geo: Sph(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m: M(-0.3, 1.52, 0, 0, 0, 0.5, 1, 0.8, 0.9), uv: 1 },
      { geo: Sph(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m: M(0.3, 1.52, 0, 0, 0, -0.5, 1, 0.8, 0.9), uv: 1 },
      { geo: Lathe([[0.0, 0.32], [0.12, 0.3], [0.15, 0.15], [0.16, 0.0], [0.1, -0.08]], 16), m: M(0, 1.72, 0), uv: 2 } // 石胄
    ], false)
  };
}

// 木支护（盗洞里的撑木）
export function propGeometry(h) {
  return mergeGeos([
    { geo: Cyl(0.07, 0.08, h, 7), m: M(-0.8, h / 2, 0, 0, 0, 0.03), color: [1, 1, 1] },
    { geo: Cyl(0.07, 0.08, h, 7), m: M(0.8, h / 2, 0, 0, 0, -0.03), color: [1, 1, 1] },
    { geo: Cyl(0.08, 0.08, 1.9, 7), m: M(0, h - 0.05, 0, 0, 0, Math.PI / 2), color: [1, 1, 1] }
  ]);
}
