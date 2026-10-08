/** 地图样式表：所有颜色、线宽、字号从这里取，桌面打印版以后也用同一套。 */
export const PX_PER_KM = 20;

export const PALETTE = {
  paper: [233, 226, 196],
  woods: [128, 152, 98],
  woodsDark: [104, 130, 80],
  woodsEdge: [84, 108, 66],
  marsh: [176, 200, 182],
  marshHatch: [92, 140, 170],
  water: [150, 185, 215],
  waterEdge: [88, 132, 182],
  village: [176, 160, 138],
  villageEdge: [95, 85, 72],
  hexLine: 0x5a4f3a,
  hexNumber: '#6b604a',
  river: 0x5884b6,
  balka: 0x8a5a2b,
  rail: 0x2b2a24,
  label: '#2b2a24',
  labelHalo: '#ece5c9',
  select: 0xb3261e,
  auto: 0xd9822b,
} as const;

export type RGB = readonly [number, number, number];
