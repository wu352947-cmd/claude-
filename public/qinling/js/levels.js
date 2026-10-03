// 关卡数据：五章，从盗洞一路下到地宫
import { mulberry } from './rng.js';

// 网格小工具
function grid(w, h, fill = '#') {
  const g = Array.from({ length: h }, () => Array(w).fill(fill));
  return {
    w, h, g,
    set(x, z, c) { if (x >= 0 && z >= 0 && x < w && z < h) g[z][x] = c; },
    get(x, z) { return x >= 0 && z >= 0 && x < w && z < h ? g[z][x] : '#'; },
    rect(x0, z0, x1, z1, c) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, z, c); },
    rows() { return g.map(r => r.join('')); }
  };
}

// ---------------- 第一章 盗洞 ----------------
const L1 = {
  id: 1, name: '盗洞', title: '第一章 · 盗洞', place: '骊山北麓 · 封土之下',
  quote: '树草木以象山。', source: '《史记·秦始皇本纪》',
  objective: '顺着师父当年打的盗洞往下走',
  theme: { wall: 'earth', floor: 'earth', ceil: 'earth', height: 2.4, tile: 2.5, surface: 'dirt', ambience: 'tunnel',
    fog: [0x050403, 0.11], hemi: [0x4a4c56, 0x1a120c, 0.16], props: true },
  map: [
    '#########################',
    '#P.a#########...b########',
    '##..########..#.#########',
    '###.#########.#.....d.###',
    '###.....c.....###.###.###',
    '#######.#########.###.###',
    '#######.####e.....###h###',
    '###g....####.########.###',
    '#######.....i####f....###',
    '####################.E###',
    '#########################'
  ],
  legend: {
    P: { type: 'start', face: [1, 0], shaft: true, rope: true },
    a: { type: 'note', note: 'master1', decor: 'bag' },
    b: { type: 'pickup', item: 'herb', decor: 'bones' },
    c: { type: 'pickup', item: 'battery' },
    d: { type: 'note', note: 'shiji1' },
    e: { type: 'whisper', radius: 3 },
    f: { type: 'corpse', item: 'battery', seed: 9 },
    g: { type: 'apparition' },
    h: { type: 'collapse', block: [21, 4], radius: 1.6 },
    i: { type: 'hint', text: '洞壁上有新鲜的抓痕，像是指甲留下的。', radius: 2 },
    E: { type: 'exit', prompt: '顺着塌口滑下去', needs: [] }
  }
};

// ---------------- 第二章 俑坑 ----------------
function buildPit() {
  const g = grid(31, 19);
  const corr = [2, 5, 8, 11, 14];
  for (const r of corr) g.rect(2, r, 28, r + 1, '.');
  g.rect(2, 2, 2, 15, '.'); g.rect(27, 2, 28, 15, '.');
  g.set(2, 1, 'P'); g.set(3, 1, '.');
  // 隔墙上的豁口
  for (const [x, z] of [[12, 4], [20, 7], [8, 10], [17, 13], [23, 4]]) g.set(x, z, '.');
  for (const r of corr) for (let x = 4; x <= 25; x++) {
    if (r === 8 && x >= 12 && x <= 18) continue;
    if ((x % 2 === 0)) g.set(x, r, 'W'); else g.set(x, r + 1, 'W');
  }
  // 战车与将军
  g.set(15, 8, 'C'); g.set(13, 9, 'u'); g.set(18, 9, 'G');
  // 活俑（混在俑阵里，看起来一模一样）
  for (const [x, z] of [[10, 2], [21, 6], [6, 9], [22, 12], [15, 15], [25, 3], [19, 14]]) g.set(x, z, 'm');
  g.set(3, 15, 't'); g.set(27, 2, 'n'); g.set(3, 6, 'h');
  g.set(26, 9, 'c'); g.set(3, 12, 'c'); g.set(28, 15, 'r'); g.set(11, 2, 'k');
  g.set(28, 8, 'L'); g.set(3, 11, 'L');
  g.set(28, 16, 'D'); g.set(28, 17, 'E');
  g.set(14, 12, 'x');
  return g.rows();
}
const L2 = {
  id: 2, name: '俑坑', title: '第二章 · 俑坑', place: '陪葬坑 · 过洞',
  quote: '始皇初即位，穿治郦山，及并天下，天下徒送诣七十余万人。', source: '《史记·秦始皇本纪》',
  objective: '找到两半虎符，打开坑东南的铜门',
  theme: { wall: 'rammed', floor: 'brick', ceil: 'wood', height: 3.4, tile: 2.6, surface: 'brick', ambience: 'pit',
    fog: [0x040405, 0.075], hemi: [0x55607a, 0x1c140e, 0.2], beams: true },
  map: buildPit(),
  legend: {
    P: { type: 'start', face: [0, 1], shaft: true },
    W: { type: 'warrior' },
    m: { type: 'statue' },
    C: { type: 'chariot' },
    G: { type: 'warrior', kind: 'general' },
    u: { type: 'pickup', item: 'tally', id: 'tallyL', name: '虎符（左半）' },
    t: { type: 'corpse', item: 'tally', id: 'tallyR', name: '虎符（右半）', seed: 4 },
    n: { type: 'note', note: 'master2' },
    h: { type: 'note', note: 'hist2' },
    k: { type: 'hint', text: '这尊陶俑的脚下没有灰尘。它刚刚挪过地方。', radius: 2.2 },
    x: { type: 'decor', decor: 'fallen' },
    c: { type: 'pickup', item: 'battery' },
    r: { type: 'pickup', item: 'herb' },
    L: { type: 'lamp', kind: 'lantern' },
    D: { type: 'door', needs: ['tallyL', 'tallyR'], locked: '铜门上有个虎形凹槽，需要合拢的虎符', style: 'bronze', axis: 'x' },
    E: { type: 'exit', auto: true }
  }
};

// ---------------- 第三章 机弩 ----------------
function buildTraps() {
  const g = grid(40, 9);
  g.rect(1, 3, 36, 5, '.');
  for (const x of [4, 10, 16, 28, 33]) { g.set(x, 2, 's'); g.set(x, 6, 's'); }
  g.set(2, 4, 'P');
  // A 段：脚下的机关砖
  g.set(8, 3, 'T'); g.set(8, 4, 'T'); g.set(8, 2, 'v'); g.set(8, 6, '^');
  g.set(9, 5, 'x');
  // B 段：按节律射击的弩
  g.set(13, 2, 'V'); g.set(15, 6, 'N'); g.set(17, 2, 'V'); g.set(19, 6, 'N');
  // C 段：棋盘一样的机关砖
  for (const [x, z] of [[21, 3], [21, 4], [23, 4], [23, 5], [25, 3], [25, 4]]) g.set(x, z, 'T');
  for (const x of [21, 23, 25]) { g.set(x, 2, 'v'); g.set(x, 6, '^'); }
  g.set(5, 4, 'n'); g.set(10, 4, 'c'); g.set(19, 3, 'c'); g.set(30, 5, 'r'); g.set(27, 4, 'q');
  g.set(1, 4, 'L'); g.set(12, 3, 'L'); g.set(26, 5, 'L'); g.set(34, 3, 'L');
  g.set(34, 5, 'k');
  g.set(37, 4, 'D'); g.set(38, 4, 'E');
  return g.rows();
}
const L3 = {
  id: 3, name: '机弩', title: '第三章 · 机弩', place: '墓道 · 石铠甲',
  quote: '令匠作机弩矢，有所穿近者辄射之。', source: '《史记·秦始皇本纪》',
  objective: '穿过布满机弩的墓道，扳动尽头的机括',
  theme: { wall: 'stone', floor: 'stone', ceil: 'stone', height: 4.2, tile: 2.4, surface: 'stone', ambience: 'traps',
    fog: [0x050404, 0.06], hemi: [0x50586a, 0x1a1410, 0.2] },
  map: buildTraps(), wallSpots: 'v^VN',
  legend: {
    P: { type: 'start', face: [1, 0] },
    s: { type: 'armor' },
    T: { type: 'plate' },
    v: { type: 'emitter', dir: [0, 1] }, '^': { type: 'emitter', dir: [0, -1] },
    V: { type: 'emitter', dir: [0, 1], period: 2.4 }, N: { type: 'emitter', dir: [0, -1], period: 2.4 },
    x: { type: 'corpse', note: 'master3', seed: 12, arrows: true },
    n: { type: 'note', note: 'shiji2' },
    q: { type: 'note', note: 'hist3' },
    c: { type: 'pickup', item: 'battery' },
    r: { type: 'pickup', item: 'herb' },
    L: { type: 'lamp', kind: 'stand' },
    k: { type: 'lever', target: 'door' },
    D: { type: 'door', needs: ['lever'], locked: '石门纹丝不动，机括应该在附近', style: 'stone', axis: 'x' },
    E: { type: 'exit', auto: true }
  }
};

// ---------------- 第四章 羡道（工匠被封死的地方） ----------------
function buildSealed() {
  const r = mulberry(1337);
  const MW = 29, MH = 23, g = grid(MW + 3, MH);
  // 递归回溯迷宫
  const vis = new Set(), st = [[1, 1]]; vis.add('1,1'); g.set(1, 1, '.');
  while (st.length) {
    const [x, z] = st[st.length - 1];
    const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dz]) => [x + dx, z + dz, dx, dz])
      .filter(([nx, nz]) => nx > 0 && nz > 0 && nx < MW - 1 && nz < MH - 1 && !vis.has(nx + ',' + nz));
    if (!nb.length) { st.pop(); continue; }
    const [nx, nz, dx, dz] = nb[(r() * nb.length) | 0];
    g.set(x + dx / 2, z + dz / 2, '.'); g.set(nx, nz, '.'); vis.add(nx + ',' + nz); st.push([nx, nz]);
  }
  // 打通一些墙，形成回路，好躲鬼
  for (let k = 0; k < 40; k++) {
    const x = 1 + ((r() * (MW - 2)) | 0), z = 1 + ((r() * (MH - 2)) | 0);
    if (g.get(x, z) === '#' && ((g.get(x - 1, z) === '.' && g.get(x + 1, z) === '.' && g.get(x, z - 1) === '#' && g.get(x, z + 1) === '#') ||
      (g.get(x, z - 1) === '.' && g.get(x, z + 1) === '.' && g.get(x - 1, z) === '#' && g.get(x + 1, z) === '#'))) g.set(x, z, '.');
  }
  // 两间墓室
  g.rect(11, 9, 15, 13, '.'); g.rect(21, 3, 25, 5, '.'); g.rect(3, 15, 6, 19, '.');
  // 距离
  const dist = new Map(), q = [[1, 1]]; dist.set('1,1', 0);
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
      if (g.get(nx, nz) !== '#' && !dist.has(k)) { dist.set(k, dist.get(x + ',' + z) + 1); q.push([nx, nz]); }
    }
  }
  // 出口：最东一列里离起点最远的格子
  let ez = 1, best = -1;
  for (let z = 1; z < MH - 1; z++) { const d = dist.get((MW - 2) + ',' + z); if (d !== undefined && d > best) { best = d; ez = z; } }
  g.set(MW - 1, ez, 'D'); g.set(MW, ez, 'E');
  g.set(MW - 2, ez - 1 >= 1 && g.get(MW - 2, ez - 1) === '.' ? ez - 1 : ez, g.get(MW - 2, ez - 1) === '.' ? 'l' : '.');
  // 死胡同
  const ends = [];
  for (const [k, d] of dist) {
    const [x, z] = k.split(',').map(Number);
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => g.get(x + dx, z + dz) !== '#').length;
    if (open === 1 && !(x === 1 && z === 1)) ends.push({ x, z, d });
  }
  ends.sort((a, b) => b.d - a.d);
  const used = [];
  const take = (minSep) => {
    for (const e of ends) {
      if (used.includes(e)) continue;
      if (used.every(u => Math.abs(u.x - e.x) + Math.abs(u.z - e.z) >= minSep)) { used.push(e); return e; }
    }
    const e = ends.find(e => !used.includes(e)); if (e) used.push(e); return e;
  };
  for (const ch of ['1', '2', '3']) { const e = take(12); if (e) g.set(e.x, e.z, 'g' + ch); }
  for (const ch of ['n', 'a', 'w', 'c', 'c', 'c', 'h', 'h', 'b', 'b', 'b', 'b']) { const e = take(4); if (e) g.set(e.x, e.z, ch); }
  // 鬼魂出生点：离起点远的走廊
  let gh = 0;
  for (const [k, d] of [...dist].sort(() => r() - 0.5)) {
    const [x, z] = k.split(',').map(Number);
    if (gh < 3 && d > 14 && g.get(x, z) === '.') { g.set(x, z, 'G'); gh++; }
  }
  g.set(1, 1, 'P'); g.set(13, 11, 'B'); g.set(2, 1, 'l');
  // 抓痕与刻字
  let sc = 0;
  for (const [k] of [...dist].sort(() => r() - 0.5)) {
    const [x, z] = k.split(',').map(Number);
    if (sc < 9 && g.get(x, z) === '.') { g.set(x, z, 'S'); sc++; }
  }
  // 两位数图例改为单字符
  return g.g.map(row => row.map(c => (c.length > 1 ? ({ g1: 'X', g2: 'Y', g3: 'Z' })[c] : c)).join(''));
}
const L4 = {
  id: 4, name: '羡道', title: '第四章 · 羡道', place: '中羡门内 · 工匠封闭之所',
  quote: '大事毕，已臧，闭中羡，下外羡门，尽闭工匠臧者，无复出者。', source: '《史记·秦始皇本纪》',
  objective: '在黑暗里找回三枚机关铜件，修好中羡门',
  theme: { wall: 'rammed', floor: 'earth', ceil: 'rammed', height: 2.8, tile: 2.6, surface: 'dirt', ambience: 'sealed',
    fog: [0x030304, 0.12], hemi: [0x4a5266, 0x140e0a, 0.12] },
  map: buildSealed(),
  legend: {
    P: { type: 'start', face: [1, 0] },
    X: { type: 'pickup', item: 'gear', id: 'gear1', name: '机关铜件（一）' },
    Y: { type: 'pickup', item: 'gear', id: 'gear2', name: '机关铜件（二）' },
    Z: { type: 'pickup', item: 'gear', id: 'gear3', name: '机关铜件（三）' },
    n: { type: 'note', note: 'shiji3' },
    a: { type: 'note', note: 'artisan', decor: 'bones' },
    w: { type: 'corpse', note: 'master4', seed: 21 },
    c: { type: 'pickup', item: 'battery', decor: 'bones' },
    h: { type: 'pickup', item: 'herb', decor: 'bones' },
    b: { type: 'decor', decor: 'bones' },
    B: { type: 'decor', decor: 'bonesBig' },
    S: { type: 'scratch' },
    G: { type: 'ghost' },
    l: { type: 'lamp', kind: 'bowl', dim: true },
    D: { type: 'door', needs: ['gear1', 'gear2', 'gear3'], locked: '门后的机括缺了三枚铜件，转不动', style: 'bronze', axis: 'z' },
    E: { type: 'exit', auto: true }
  }
};

// ---------------- 第五章 地宫 ----------------
function buildPalace() {
  const g = grid(37, 31);
  g.rect(1, 1, 33, 29, '.');
  // 中央的海与岛
  g.rect(10, 8, 24, 22, '~'); g.rect(13, 11, 21, 19, '.');
  // 江河
  g.rect(17, 1, 17, 7, '~'); g.rect(1, 15, 9, 15, '~'); g.rect(25, 15, 33, 15, '~');
  g.rect(6, 4, 9, 4, '~'); g.rect(6, 1, 6, 3, '~');           // 一条支流
  g.rect(25, 24, 28, 24, '~'); g.rect(28, 25, 28, 29, '~');   // 另一条
  // 石桥（固定）
  g.set(17, 4, ':'); g.set(5, 15, ':'); g.set(29, 15, ':'); g.set(6, 2, ':'); g.set(28, 27, ':');
  // 机关桥三段
  g.set(17, 20, '1'); g.set(17, 21, '2'); g.set(17, 22, '3');
  // 铜椁所在的台基
  g.rect(16, 14, 18, 16, 'K'); g.set(17, 17, 'O');
  g.set(17, 28, 'P');
  // 机括
  g.set(2, 6, 'a'); g.set(32, 22, 'b'); g.set(21, 2, 'c');
  // 宫观
  for (const [x, z] of [[4, 10], [8, 20], [27, 9], [31, 19], [12, 3], [24, 27], [3, 25], [30, 5]]) g.set(x, z, 'p');
  // 百官俑
  for (const x of [12, 13, 14, 20, 21, 22]) for (const z of [24, 26]) g.set(x, z, 'o');
  // 灯（真实光源有限，其余只有火焰）
  for (const [x, z] of [[9, 7], [25, 7], [9, 23], [25, 23], [15, 27], [19, 27], [13, 12], [21, 18]]) g.set(x, z, 'L');
  for (const [x, z] of [[2, 2], [32, 2], [2, 28], [32, 28], [13, 18], [21, 12], [1, 14], [33, 16], [16, 1], [18, 1]]) g.set(x, z, 'l');
  // 拾取
  g.set(16, 27, 'n'); g.set(4, 22, 'm'); g.set(31, 26, 'h'); g.set(3, 4, 'h'); g.set(27, 3, 'h'); g.set(10, 27, 'e'); g.set(30, 11, 'e');
  g.set(14, 19, 'j');
  // 逃生的门（东北墙后，工匠留下的路）
  g.set(34, 4, 'D'); g.set(35, 4, 'E');
  return g.rows();
}
const L5 = {
  id: 5, name: '地宫', title: '第五章 · 地宫', place: '穿三泉 · 下铜而致椁',
  quote: '以水银为百川江河大海，机相灌输，上具天文，下具地理。', source: '《史记·秦始皇本纪》',
  objective: '扳动三处机括升起铜桥，登上中央的椁台',
  theme: { wall: 'stone', floor: 'palace', ceil: null, height: 7, tile: 2.4, floorTile: 2, surface: 'palace', ambience: 'palace',
    fog: [0x06070c, 0.03], hemi: [0x6a7090, 0x1a1410, 0.28], dome: true, vapor: true, channel: 'stone' },
  map: buildPalace(),
  legend: {
    P: { type: 'start', face: [0, -1] },
    K: { type: 'block' },
    O: { type: 'coffin' },
    a: { type: 'lever', target: 1 }, b: { type: 'lever', target: 2 }, c: { type: 'lever', target: 3 },
    p: { type: 'palaceModel' },
    o: { type: 'warrior', kind: 'official', yaw: Math.PI },
    L: { type: 'lamp', kind: 'stand' },
    l: { type: 'lamp', kind: 'stand', fake: true },
    ':': { type: 'stoneBridge' },
    n: { type: 'note', note: 'shiji4' },
    m: { type: 'note', note: 'hist5' },
    h: { type: 'pickup', item: 'herb' },
    e: { type: 'pickup', item: 'battery' },
    j: { type: 'pickup', item: 'pearl', id: 'pearl', name: '夜明珠' },
    D: { type: 'door', needs: ['escape'], locked: '墙后有风声，但这面墙推不动', style: 'stone', axis: 'x', hidden: true },
    E: { type: 'exit', auto: true, final: true }
  }
};

export const LEVELS = [L1, L2, L3, L4, L5];

// ---------------- 文字 ----------------
export const PROLOGUE = [
  '始皇初即位，穿治郦山，及并天下，天下徒送诣七十余万人。',
  '——《史记·秦始皇本纪》',
  '',
  '一九九四年冬，师父带着两个人，从骊山北麓打了一条盗洞下去。',
  '三十年过去了，没有人再见过他们。',
  '',
  '今夜，你在那个塌陷的洞口前，找到了他系在柏树上的绳子。'
];

export const NOTES = {
  master1: { title: '师父的信 · 其一', kind: 'letter', text:
`小七：

你要是读到这封信，就说明你还是来了。我拦不住你，就像当年你师爷拦不住我。

这条盗洞是我打的，顺着夯土层往下走，别往两边的岔口钻。

骊山底下不光有宝贝。记住三件事——
一、手电别灭。
二、听见有人喊你的名字，别答应。
三、看见陶俑，别背对它。

——师父　一九九四年冬` },
  shiji1: { title: '竹简 · 穿三泉', kind: 'slip', text:
`始皇初即位，穿治郦山，及并天下，天下徒送诣七十余万人，穿三泉，下铜而致椁，宫观百官奇器珍怪徙臧满之。

——《史记·秦始皇本纪》

【注】穿三泉：一路掘过三层地下水。下铜而致椁：以铜液浇灌封堵，再安放外椁。` },
  master2: { title: '师父的信 · 其二', kind: 'letter', text:
`陶俑会动。不是吓唬你。

老秦就是在这坑里没的。它们只在你看不见的时候走——你一眨眼，它就近了一步。

别让它们离开你的光。被盯着的时候，它们就只是泥。

出坑的铜门要合拢的虎符。左半在将军的车上，右半……老秦攥着它，死在西南角。` },
  hist2: { title: '考 · 兵马俑', kind: 'hist', text:
`一九七四年春，临潼西杨村的村民打井时挖出陶片，秦兵马俑由此重见天日。

一号坑是步兵与战车组成的长方形军阵。坑内以夯土隔墙分出一条条过洞，青砖铺地，顶上架棚木，再覆席、覆土。

陶俑原本通体彩绘，朱红、石绿、粉白、“汉紫”，出土后颜料遇空气，往往在几分钟里卷曲、剥落。

俑的发髻多偏在头的右侧；面目各不相同，人称“千人千面”。` },
  shiji2: { title: '竹简 · 机弩', kind: 'slip', text:
`令匠作机弩矢，有所穿近者辄射之。

——《史记·秦始皇本纪》

【注】命工匠制作机关弩箭，凡有人掘墓靠近，弩便自动发射。` },
  hist3: { title: '考 · 石铠甲', kind: 'hist', text:
`一九九八年，考古队在陵园内城东南发现一座陪葬坑，出土大量青石片编缀的铠甲与石胄。

甲片打磨得极薄，以扁铜丝一片片连缀，一领甲衣要用到数百片。这样的铠甲重得无法披挂上阵，只为地下的军队而造。` },
  master3: { title: '师父的信 · 其三', kind: 'letter', text:
`哑巴张踩中了地砖。三支弩，一支都没射偏。两千多年了，弦还是紧的。

砖上刻着眼睛的，别踩。手电照过去，它们比别的砖高出一线。

有节奏的那几架弩，听它上弦的咔哒声——数着它的心跳过去。

尽头有个机括，扳下去，石门就开了。我先进去探路。` },
  shiji3: { title: '竹简 · 闭中羡', kind: 'slip', text:
`葬既已下，或言工匠为机，臧皆知之，臧重即泄。大事毕，已臧，闭中羡，下外羡门，尽闭工匠臧者，无复出者。

——《史记·秦始皇本纪》

【注】下葬之后，有人说工匠们造了机关，知道藏宝之处，恐怕泄露。于是封闭墓道中门，放下外门，把藏宝的工匠全数关在里面，再也没有一个人出来。` },
  artisan: { title: '刻在夯土上的字', kind: 'carve', text:
`吾隐宫徒也，役于郦山七年。

门既下，火既灭。同役者三百人，今存十一。

饥甚。夜有声自门外来，似人语，非人声。

后之来者，若得出，为吾告吾母：儿未尝负约，归期已误。` },
  master4: { title: '师父的信 · 其四', kind: 'letter', text:
`我听见他们在喊我的名字，用的是我娘的声音。

灯光会把他们引过来。灭了灯，他们就找不着你——可灭了灯，你自己会疯。跑起来的脚步声，他们也听得见。

中羡门的机括缺三枚铜件，散在这些死人堆里。我只找到两个，又被他们夺了回去。

小七，别学我。` },
  shiji4: { title: '竹简 · 上具天文', kind: 'slip', text:
`以水银为百川江河大海，机相灌输，上具天文，下具地理。以人鱼膏为烛，度不灭者久之。

——《史记·秦始皇本纪》

【注】用水银做成江河大海，以机械使之流动灌注；穹顶绘日月星辰，地面布山川地理。用人鱼的油脂做灯烛，估计能长久不灭。“人鱼”，一说是鲸，一说是大鲵（娃娃鱼）。` },
  hist5: { title: '考 · 汞', kind: 'hist', text:
`现代考古勘探曾在秦始皇陵封土中测得汞含量的显著异常，许多学者认为这与《史记》中“以水银为百川江河大海”的记载相互印证。

秦始皇陵地宫至今没有发掘。在找到能妥善保护遗址与文物的办法之前，考古界选择让它继续沉睡。

吸入汞蒸气会损伤神经与肾脏。——在这里，别待太久。` },
  masterFinal: { title: '师父的信 · 终', kind: 'letter', text:
`小七：

椁是空的。一直是空的。

他要的从来不是陪葬的金玉，是不死。这底下的东西守着的不是棺，是门。

我出不去了。我身上，已经有一半是陶。

工匠们在东北的墙后面留了一条路——他们也想出去。

快跑。别回头。除非你想看清它的脸。` }
};

export const ENDING = [
  '你从骊山北麓的一处塌陷里爬出来时，天正下着雪。',
  '身后的土层闷响着合拢，像一扇门轻轻关上。',
  '',
  '你没有带出任何东西。除了掌心一道灰白的裂纹——',
  '像陶。'
];
