/** 地图样式表：所有颜色、线宽、字号从这里取，桌面打印版以后也用同一套。 */
export const PX_PER_KM = 20;

export const PALETTE = {
  // 纸面与田块（库尔斯克夏季：麦田、草地、休耕地）
  fields: [[237, 231, 204], [233, 231, 203], [236, 229, 205], [239, 234, 210]],
  fieldEdge: [243, 239, 220],
  // 林地：树冠
  woods: [120, 146, 92],
  woodsLight: [146, 170, 112],
  woodsDark: [72, 96, 58],
  marsh: [176, 200, 182],
  marshHatch: [92, 140, 170],
  water: [150, 185, 215],
  waterEdge: [88, 132, 182],
  // 居民点
  settlement: [214, 206, 186],
  settlementEdge: [170, 160, 140],
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
} as const;

export type RGB = readonly [number, number, number];
