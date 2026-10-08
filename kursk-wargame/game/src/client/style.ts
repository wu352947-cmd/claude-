/** 地图样式表：所有颜色、线宽、字号从这里取，桌面打印版以后也用同一套。 */
export const PX_PER_KM = 20;

export type RGB = readonly [number, number, number];
const rgb = (r: number, g: number, b: number): RGB => [r, g, b];

const WARM = {
  // 纸面与田块（库尔斯克夏季：麦田、草地、休耕地）
  fields: [rgb(237, 231, 204), rgb(233, 231, 203), rgb(236, 229, 205), rgb(239, 234, 210)],
  fieldEdge: rgb(243, 239, 220),
  // 林地：树冠
  woods: rgb(120, 146, 92),
  woodsLight: rgb(146, 170, 112),
  woodsDark: rgb(72, 96, 58),
  marsh: rgb(176, 200, 182),
  marshHatch: rgb(92, 140, 170),
  water: rgb(150, 185, 215),
  waterEdge: rgb(88, 132, 182),
  // 居民点
  settlement: rgb(214, 206, 186),
  settlementEdge: rgb(170, 160, 140),
  house: '#4d4842',
  // 线状要素
  river: 0x3a78c2,
  riverEdge: 0x22487a,
  riverBank: 0xcfe0ee,
  road: 0x4a4540,
  roadPrimary: 0x8c3a26,
  roadCasing: 0xf3eedb,
  rail: 0x1f1d1a,
  balka: 0x8a5a2b,
  // 格网与文字
  hexLine: 0x8d8366,
  hexBevel: 0xfffbea,
  hexNumber: '#8d8366',
  label: '#2b2a24',
  labelHalo: '#f1ead0',
  frame: 0x4a2620,
  frameInner: 0xe9dfc0,
  select: 0xb3261e,
  auto: 0xd9822b,
};

/** 冷调：参考《Smolensk》等东线地图——浅灰绿底、林地按格填色加树冠纹理，算子更醒目 */
const COOL: typeof WARM = {
  ...WARM,
  fields: [rgb(216, 222, 203), rgb(214, 221, 204), rgb(218, 223, 206), rgb(215, 222, 206)],
  fieldEdge: rgb(222, 227, 211),
  woods: rgb(138, 168, 120),
  woodsLight: rgb(168, 192, 146),
  woodsDark: rgb(92, 124, 82),
  marsh: rgb(196, 212, 216),
  marshHatch: rgb(104, 146, 178),
  settlement: rgb(208, 208, 200),
  settlementEdge: rgb(160, 160, 152),
  house: '#45464a',
  river: 0x3f80c4,
  riverEdge: 0x2a5a8c,
  riverBank: 0xd4e3ee,
  road: 0x3c3c40,
  roadPrimary: 0x7c3a2c,
  roadCasing: 0xeef1ec,
  hexLine: 0x7f8a80,
  hexBevel: 0xf6faf6,
  hexNumber: '#7d8789',
  labelHalo: '#e8ede0',
};

export type Theme = 'warm' | 'cool';
function pickTheme(): Theme {
  try {
    const q = new URLSearchParams(location.search).get('style');
    if (q === 'warm' || q === 'cool') return q;
  } catch { /* 非浏览器环境 */ }
  return 'cool';
}
/** 当前风格（由网址参数 ?style=warm / cool 决定，切换时重新加载页面） */
export const THEME: Theme = pickTheme();
export const PALETTE = THEME === 'cool' ? COOL : WARM;

