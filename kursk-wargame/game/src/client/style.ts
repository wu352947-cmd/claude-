/**
 * 地图样式表（冷调）：所有颜色、线宽、字号从这里取，桌面打印版以后也用同一套。
 * 风格参考：《Smolensk: Barbarossa Derailed》等东线兵棋地图——浅灰绿底、林地按格填色加纹理、细线条。
 */
export const PX_PER_KM = 20;

export type RGB = readonly [number, number, number];
const rgb = (r: number, g: number, b: number): RGB => [r, g, b];

export const PALETTE = {
  // 纸面
  paper: rgb(216, 222, 204),
  // 林地
  woods: 0x8aa878,
  woodsLight: 0xa9c296,
  woodsDark: 0x5c7c52,
  woodsEdge: 0x4f6b47,
  // 面状
  marsh: rgb(196, 212, 216),
  marshHatch: rgb(104, 146, 178),
  water: rgb(150, 185, 215),
  waterEdge: rgb(88, 132, 182),
  settlement: rgb(208, 208, 200),
  settlementEdge: rgb(160, 160, 152),
  // 居民点
  house: 0x3a3b3e,
  garden: 0x9fb48a,
  townDot: 0xffffff,
  townDotEdge: 0x1f1d1a,
  // 线状要素
  river: 0x3f80c4,
  riverEdge: 0x2a5a8c,
  riverBank: 0xd4e3ee,
  road: 0x35363a,
  roadPrimary: 0x7c3a2c,
  roadCasing: 0xeef1ec,
  track: 0x55575a,
  rail: 0x1f1d1a,
  balka: 0x8a5a2b,
  // 格网与文字
  hexLine: 0x7f8a80,
  hexNumber: '#6f7a72',
  label: '#1f2124',
  labelSub: '#4f5752',
  labelHalo: '#e4eadc',
  frame: 0x3b3f3c,
  margin: 0xe9ece2,
  marginInk: 0x2a2d2b,
  select: 0xb3261e,
  /** 可到达范围；敌控制区（到此停止） */
  reach: 0x2f7fd0,
  reachZoc: 0xe08a1e,
  auto: 0xd9822b,
  verified: 0x3f8f4a,
  crosschecked: 0x3a78c2,
};

/** 字体：地名用衬线体（印刷地图的质感），界面用无衬线体 */
export const FONT_SERIF = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", serif';
/** 拉丁转写：IM Fell English 斜体（仿 17 世纪铅字，自托管子集，见 tools/fonts/fetch-map-fonts.mjs） */
export const MAP_FONTS = [{ family: 'Map Latin', file: 'fonts/map-latin.woff2', style: 'italic' }] as const;
export const FONT_LATIN = '"Map Latin", Georgia, serif';

/**
 * 算子样式。底色按军种：德国陆军原野灰、武装党卫军深灰、红军赭色；符号框用同色系浅色。
 * 占位（未考据）的数值用灰色斜体。
 */
export const COUNTER_STYLE = {
  /** 算子边长（公里，格子对边距 3 公里） */
  sizeKm: 1.75,
  /** 堆叠时每层错开的距离（公里） */
  stackOffsetKm: 0.13,
  /** 生成纹理的像素边长（最大放大倍数 × 屏幕像素密度下仍清晰） */
  texturePx: 256,
  font: '"DejaVu Sans", "Helvetica Neue", Arial, sans-serif',
  edge: '#1f1d1a',
  branch: {
    heer: { base: '#a8ad96', symbol: '#e2e4d6', ink: '#1f1d1a', placeholder: '#5f625a' },
    'waffen-ss': { base: '#4d4f4b', symbol: '#c9cbc1', ink: '#f1f0e8', placeholder: '#a3a59c' },
    rkka: { base: '#c48a55', symbol: '#f1dcc1', ink: '#1f1d1a', placeholder: '#6e5643' },
  },
} as const;
