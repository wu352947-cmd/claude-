/**
 * 地图编辑：所有者在网页编辑器里做的修改，存成一份"修改单"（叠加在地图数据文件之上）。
 * 修改单可以导出为 JSON，由 tools 脚本合并回 data/maps/*.json。
 *
 * 约定：修改单里某个键的值 = 该格/格边的完整新记录；null = 删除记录（格子恢复为默认开阔地）。
 */
import { z } from 'zod';
import { type Direction, type Offset, hexId, sideKey } from './hex';
import {
  type GameMap, type HexRecord, type SideFeature, type SideRecord, type Status, type Terrain,
  HexRecord as HexRecordSchema, SideRecord as SideRecordSchema, hexRecord,
} from './map';

export const EDITS_FORMAT = 'kursk-map-edits';

export const MapEdits = z.object({
  format: z.literal(EDITS_FORMAT),
  version: z.literal(1),
  map: z.string(),
  hexes: z.record(z.string().regex(/^\d{4}$/), HexRecordSchema.nullable()).default({}),
  hexsides: z.record(z.string().regex(/^\d{4}:[012]$/), SideRecordSchema.nullable()).default({}),
});
export type MapEdits = z.infer<typeof MapEdits>;

export function emptyEdits(mapId: string): MapEdits {
  return { format: EDITS_FORMAT, version: 1, map: mapId, hexes: {}, hexsides: {} };
}

/** 修改的处数。 */
export function editCount(e: MapEdits): number {
  return Object.keys(e.hexes).length + Object.keys(e.hexsides).length;
}

/** 把修改单叠加到地图上，返回新地图（原地图不变）。 */
export function withEdits(base: GameMap, e: MapEdits): GameMap {
  const hexes = new Map(base.hexes);
  for (const [id, rec] of Object.entries(e.hexes)) {
    if (rec) hexes.set(id, rec); else hexes.delete(id);
  }
  const sides = new Map(base.sides);
  for (const [key, rec] of Object.entries(e.hexsides)) {
    if (rec) sides.set(key, rec); else sides.delete(key);
  }
  return { ...base, hexes, sides };
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 去掉与底图相同的条目（例如修改已经合并进数据文件之后）。 */
export function pruneEdits(base: GameMap, e: MapEdits): MapEdits {
  const hexes: MapEdits['hexes'] = {};
  for (const [id, rec] of Object.entries(e.hexes)) {
    if (!sameJson(rec ?? null, base.hexes.get(id) ?? null)) hexes[id] = rec;
  }
  const hexsides: MapEdits['hexsides'] = {};
  for (const [key, rec] of Object.entries(e.hexsides)) {
    if (!sameJson(rec ?? null, base.sides.get(key) ?? null)) hexsides[key] = rec;
  }
  return { ...e, hexes, hexsides };
}

/** 无需存储的记录：开阔地、未核对、没有备注——与"数据里没有这个格子"等价。 */
function isDefaultHex(r: HexRecord): boolean {
  return r.terrain === 'clear' && (r.status === 'auto' || r.status === 'unverified') && !r.note;
}

function putHex(base: GameMap, e: MapEdits, id: string, rec: HexRecord | null): MapEdits {
  const value = rec && isDefaultHex(rec) ? null : rec;
  const next = { ...e, hexes: { ...e.hexes, [id]: value } };
  // 与底图一致就不必记在修改单里
  if (sameJson(value, base.hexes.get(id) ?? null)) delete next.hexes[id];
  return next;
}

function putSide(base: GameMap, e: MapEdits, key: string, rec: SideRecord | null): MapEdits {
  const next = { ...e, hexsides: { ...e.hexsides, [key]: rec } };
  if (sameJson(rec, base.sides.get(key) ?? null)) delete next.hexsides[key];
  return next;
}

export interface EditOptions {
  /** 这次修改所依据的史料 ID（sources.csv） */
  source: string;
  /** 同时标为"已核对" */
  verify: boolean;
}

/**
 * 设定某格地形。地形改变时，自动提取留下的备注作废；
 * 出处改为本次依据的史料。
 */
export function setTerrain(base: GameMap, e: MapEdits, h: Offset, terrain: Terrain, o: EditOptions): MapEdits {
  const id = hexId(h);
  const cur = hexRecord(withEdits(base, e), h);
  const changed = cur.terrain !== terrain;
  const status: Status = o.verify ? 'verified' : 'unverified';
  if (!changed && cur.status === status) return e;
  const note = changed && cur.status === 'auto' ? undefined : cur.note;
  const rec: HexRecord = { terrain, status, ...(note ? { note } : {}), sources: [o.source] };
  return putHex(base, e, id, rec);
}

/** 核对：未核对 → 已核对（地形不变，出处记为本次依据）；已核对 → 未核对。 */
export function toggleVerified(base: GameMap, e: MapEdits, h: Offset, source: string): MapEdits {
  const cur = hexRecord(withEdits(base, e), h);
  const rec: HexRecord = cur.status === 'verified'
    ? { ...cur, status: 'unverified' }
    : { ...cur, status: 'verified', sources: [...new Set([...cur.sources, source])] };
  return putHex(base, e, hexId(h), rec);
}

/** 修改某格备注（空字符串 = 删除备注）。 */
export function setNote(base: GameMap, e: MapEdits, h: Offset, note: string): MapEdits {
  const cur = hexRecord(withEdits(base, e), h);
  const { note: _old, ...rest } = cur;
  const text = note.trim();
  return putHex(base, e, hexId(h), text ? { ...rest, note: text } : rest);
}

/** 格边特征开关：有则去掉，无则加上。只影响人工录入的格边（河流由线状要素推算）。 */
export function toggleSideFeature(
  base: GameMap, e: MapEdits, h: Offset, dir: Direction, feature: SideFeature, o: EditOptions,
): MapEdits {
  const key = sideKey(h, dir);
  const cur = withEdits(base, e).sides.get(key);
  const features = cur?.features.includes(feature)
    ? cur.features.filter((f) => f !== feature)
    : [...(cur?.features ?? []), feature];
  if (features.length === 0) return putSide(base, e, key, null);
  return putSide(base, e, key, {
    features, status: o.verify ? 'verified' : 'unverified',
    ...(cur?.note ? { note: cur.note } : {}), sources: [o.source],
  });
}

/** 核对进度：全图格子中某状态（默认"已核对"）的数量。 */
export function verifiedCount(m: GameMap, status: Status = 'verified'): number {
  let n = 0;
  for (const r of m.hexes.values()) if (r.status === status) n++;
  return n;
}
