/**
 * 地图数据：定义、地形、格边、地名。数据文件在 data/maps/，加载时用 Zod 校验。
 */
import { z } from 'zod';
import { type HexGrid, type Offset, hexId, inBounds, parseHexId, sideKey, type Direction } from './hex';
import type { Projection } from './projection';

/** 格内地形。规则效果在后续冲刺中由数据表定义。 */
export const TERRAIN = ['clear', 'woods', 'village', 'town', 'city', 'marsh', 'water'] as const;
export const Terrain = z.enum(TERRAIN);
export type Terrain = z.infer<typeof Terrain>;

export const TERRAIN_NAMES: Record<Terrain, string> = {
  clear: '开阔地', woods: '林地', village: '村庄', town: '镇', city: '城市', marsh: '沼泽', water: '水面',
};

/** 格边特征 */
export const SIDE_FEATURES = ['minorRiver', 'majorRiver', 'stream', 'balka', 'railEmbankment'] as const;
export const SideFeature = z.enum(SIDE_FEATURES);
export type SideFeature = z.infer<typeof SideFeature>;

export const SIDE_FEATURE_NAMES: Record<SideFeature, string> = {
  minorRiver: '小河', majorRiver: '大河', stream: '溪流', balka: '冲沟', railEmbankment: '铁路路堤',
};

/** 数据核对状态：auto = 程序自动提取；unverified = 已录入未核对；verified = 已对照史料核对 */
export const Status = z.enum(['auto', 'unverified', 'verified']);
export type Status = z.infer<typeof Status>;

export const STATUS_NAMES: Record<Status, string> = {
  auto: '自动提取（未核对）', unverified: '未核对', verified: '已核对',
};

const LocalNames = z.object({ zh: z.string().min(1), ru: z.string().optional(), de: z.string().optional(), en: z.string().optional() });
const HexIdKey = z.string().regex(/^\d{4}$/, '格号必须是 4 位数字');

export const MapDef = z.object({
  id: z.string(),
  name: z.object({ zh: z.string(), en: z.string() }),
  extent: z.object({ lat: z.tuple([z.number(), z.number()]), lon: z.tuple([z.number(), z.number()]) }),
  projection: z.object({ type: z.literal('tm-sphere'), lat0: z.number(), lon0: z.number() }),
  hex: z.object({
    orientation: z.literal('flat'),
    layout: z.literal('odd-q'),
    acrossFlatsKm: z.number().positive(),
    cols: z.number().int().positive().max(99),
    rows: z.number().int().positive().max(99),
    originKm: z.tuple([z.number(), z.number()]),
  }),
  reference: z.object({
    image: z.string(),
    boundsKm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    pxPerKm: z.number().positive(),
    sources: z.array(z.string()),
    note: z.string().optional(),
  }),
});
export type MapDef = z.infer<typeof MapDef>;

export const HexRecord = z.object({
  terrain: Terrain,
  status: Status,
  note: z.string().optional(),
  sources: z.array(z.string()).default([]),
});
export type HexRecord = z.infer<typeof HexRecord>;

export const HexesFile = z.object({ hexes: z.record(HexIdKey, HexRecord) });

export const SideRecord = z.object({
  features: z.array(SideFeature).min(1),
  status: Status,
  note: z.string().optional(),
  sources: z.array(z.string()).default([]),
});
export type SideRecord = z.infer<typeof SideRecord>;

export const HexsidesFile = z.object({
  hexsides: z.record(z.string().regex(/^\d{4}:[012]$/, '格边键必须是 "CCRR:0/1/2"'), SideRecord),
});

export const Label = z.object({
  id: z.string(),
  names: LocalNames,
  kind: z.enum(['city', 'town', 'village', 'river', 'height', 'other']),
  lat: z.number(),
  lon: z.number(),
  status: Status,
  sources: z.array(z.string()).default([]),
});
export type Label = z.infer<typeof Label>;
export const LabelsFile = z.object({ labels: z.array(Label) });

/** 校验后的完整地图。 */
export interface GameMap {
  def: MapDef;
  grid: HexGrid;
  projection: Projection;
  hexes: Map<string, HexRecord>;
  sides: Map<string, SideRecord>;
  labels: Label[];
}

export function loadMap(raw: { def: unknown; hexes: unknown; hexsides: unknown; labels: unknown }): GameMap {
  const def = MapDef.parse(raw.def);
  const grid: HexGrid = {
    acrossKm: def.hex.acrossFlatsKm,
    origin: { x: def.hex.originKm[0], y: def.hex.originKm[1] },
    cols: def.hex.cols,
    rows: def.hex.rows,
  };
  const hexes = new Map(Object.entries(HexesFile.parse(raw.hexes).hexes));
  for (const id of hexes.keys()) {
    if (!inBounds(grid, parseHexId(id))) throw new Error(`格子 ${id} 超出地图范围`);
  }
  const sides = new Map(Object.entries(HexsidesFile.parse(raw.hexsides).hexsides));
  for (const key of sides.keys()) {
    if (!inBounds(grid, parseHexId(key.slice(0, 4)))) throw new Error(`格边 ${key} 超出地图范围`);
  }
  return {
    def, grid,
    projection: { lat0: def.projection.lat0, lon0: def.projection.lon0 },
    hexes, sides,
    labels: LabelsFile.parse(raw.labels).labels,
  };
}

/** 某格的地形记录；数据中没有的格子 = 开阔地（status 视为 unverified）。 */
export function hexRecord(m: GameMap, h: Offset): HexRecord {
  return m.hexes.get(hexId(h)) ?? { terrain: 'clear', status: 'unverified', sources: [] };
}

export function sideRecord(m: GameMap, h: Offset, dir: Direction): SideRecord | undefined {
  return m.sides.get(sideKey(h, dir));
}
