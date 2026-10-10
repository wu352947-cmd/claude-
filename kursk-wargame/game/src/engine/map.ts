/**
 * 地图数据：定义、地形、格边、地名。数据文件在 data/maps/，加载时用 Zod 校验。
 */
import { z } from 'zod';
import {
  type Direction, type HexGrid, type Offset, type Point, distance, hexAt, hexCenter, hexId, inBounds, neighbor,
  neighbors, parseHexId, sideKey,
} from './hex';
import { type Projection, toWorld } from './projection';

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

/**
 * 数据核对状态：
 * - auto = 程序自动提取，未核对
 * - unverified = 已录入（人工或 AI 转录），未核对
 * - crosschecked = AI 已对照两份（或一份）史料地图逐格复查，所有者尚未确认
 * - verified = 所有者已对照史料核对
 */
export const Status = z.enum(['auto', 'unverified', 'crosschecked', 'verified']);
export type Status = z.infer<typeof Status>;

export const STATUS_NAMES: Record<Status, string> = {
  auto: '自动提取（未核对）', unverified: '未核对', crosschecked: 'AI 交叉核对', verified: '已核对',
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
  /** 第二参考底图（用于交叉核对，可缺） */
  reference2: z.object({
    image: z.string(),
    boundsKm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    pxPerKm: z.number().positive(),
    sources: z.array(z.string()),
    note: z.string().optional(),
  }).optional(),
  relief: z.object({
    image: z.string(),
    boundsKm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    pxPerKm: z.number().positive(),
    sources: z.array(z.string()),
    note: z.string().optional(),
  }).optional(),
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
  note: z.string().optional(),
  sources: z.array(z.string()).default([]),
});
export type Label = z.infer<typeof Label>;
export const LabelsFile = z.object({ labels: z.array(Label) });

/** 线状要素：河流、溪流、道路、铁路。点为 [纬度, 经度]，按实际走向记录。 */
export const LineKind = z.enum(['river', 'stream', 'road', 'track', 'railway']);
export type LineKind = z.infer<typeof LineKind>;
export const LineFeature = z.object({
  id: z.string(),
  kind: LineKind,
  class: z.enum(['major', 'minor', 'primary', 'secondary']).optional(),
  name: LocalNames.partial().optional(),
  points: z.array(z.tuple([z.number(), z.number()])).min(2),
  status: Status,
  note: z.string().optional(),
  sources: z.array(z.string()).default([]),
});
export type LineFeature = z.infer<typeof LineFeature>;
export const LinesFile = z.object({ lines: z.array(LineFeature) });

/** 校验后的完整地图。 */
export interface GameMap {
  def: MapDef;
  grid: HexGrid;
  projection: Projection;
  hexes: Map<string, HexRecord>;
  sides: Map<string, SideRecord>;
  labels: Label[];
  lines: LineFeature[];
  /** 由河流走向推算出的格边特征（与人工录入的格边合并） */
  derivedSides: Map<string, SideFeature[]>;
  /** 由道路/铁路走向推算出的相邻格连通："CCRR-CCRR"（小号在前）→ 线路类型 */
  links: Map<string, LineKind[]>;
}

export function loadMap(raw: { def: unknown; hexes: unknown; hexsides: unknown; labels: unknown; lines?: unknown }): GameMap {
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
  const projection = { lat0: def.projection.lat0, lon0: def.projection.lon0 };
  const lines = LinesFile.parse(raw.lines ?? { lines: [] }).lines;
  const { derivedSides, links } = deriveFromLines(grid, projection, lines);
  return {
    def, grid, projection, hexes, sides,
    labels: LabelsFile.parse(raw.labels).labels,
    lines, derivedSides, links,
  };
}

/** 线状要素在世界坐标（公里）下的折线。 */
export function linePoints(p: Projection, l: LineFeature): Point[] {
  return l.points.map(([lat, lon]) => toWorld(p, lat, lon));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function linkKey(a: Offset, b: Offset): string {
  const [x, y] = [hexId(a), hexId(b)].sort();
  return `${x}-${y}`;
}

const RIVER_SIDE: Record<string, SideFeature> = { major: 'majorRiver', minor: 'minorRiver' };

/**
 * 规则数据从地理推算：
 * - 河流/溪流：相邻两格中心连线与水道相交 → 这条格边有河（单位从 A 到 B 必须过河）
 * - 道路/铁路：沿线依次经过的相邻两格 → 两格之间有路相连
 */
export function deriveFromLines(grid: HexGrid, p: Projection, lines: LineFeature[]): {
  derivedSides: Map<string, SideFeature[]>; links: Map<string, LineKind[]>;
} {
  const derivedSides = new Map<string, SideFeature[]>();
  const links = new Map<string, LineKind[]>();
  const add = <T>(m: Map<string, T[]>, k: string, v: T): void => {
    const cur = m.get(k);
    if (!cur) m.set(k, [v]);
    else if (!cur.includes(v)) cur.push(v);
  };
  for (const l of lines) {
    const pts = linePoints(p, l);
    if (l.kind === 'river' || l.kind === 'stream') {
      const feature: SideFeature = l.kind === 'stream' ? 'stream' : RIVER_SIDE[l.class ?? 'minor']!;
      // 只检查折线附近的格子
      const seen = new Set<string>();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.ceil(len / 0.5));
        for (let k = 0; k <= steps; k++) {
          const h = hexAt(grid, { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
          for (const n of [h, ...neighbors(h)]) {
            if (!inBounds(grid, n) || seen.has(hexId(n))) continue;
            seen.add(hexId(n));
            const c = hexCenter(grid, n);
            for (const dir of [0, 1, 2] as Direction[]) {
              const m = neighbor(n, dir);
              if (!inBounds(grid, m)) continue;
              const cm = hexCenter(grid, m);
              for (let j = 0; j < pts.length - 1; j++) {
                if (segmentsIntersect(c, cm, pts[j]!, pts[j + 1]!)) { add(derivedSides, sideKey(n, dir), feature); break; }
              }
            }
          }
        }
      }
    } else {
      let prev: Offset | null = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
        for (let k = 0; k <= steps; k++) {
          const h = hexAt(grid, { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
          if (!inBounds(grid, h)) { prev = null; continue; }
          if (prev && hexId(prev) !== hexId(h) && distance(prev, h) === 1) add(links, linkKey(prev, h), l.kind);
          if (!prev || hexId(prev) !== hexId(h)) prev = h;
        }
      }
    }
  }
  return { derivedSides, links };
}

/** 某格的地形记录；数据中没有的格子 = 开阔地（status 视为 unverified）。 */
export function hexRecord(m: GameMap, h: Offset): HexRecord {
  return m.hexes.get(hexId(h)) ?? { terrain: 'clear', status: 'unverified', sources: [] };
}

export function sideRecord(m: GameMap, h: Offset, dir: Direction): SideRecord | undefined {
  return m.sides.get(sideKey(h, dir));
}

/** 某格边的全部特征：人工录入 + 由河流推算。 */
export function sideFeatures(m: GameMap, h: Offset, dir: Direction): SideFeature[] {
  const key = sideKey(h, dir);
  return [...new Set([...(m.sides.get(key)?.features ?? []), ...(m.derivedSides.get(key) ?? [])])];
}

/** 两相邻格之间的道路/铁路连通。 */
export function linksBetween(m: GameMap, a: Offset, b: Offset): LineKind[] {
  return m.links.get(linkKey(a, b)) ?? [];
}
