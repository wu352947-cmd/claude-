/**
 * 六角格坐标与几何（平顶六角格，奇数列下移半格 = "odd-q" 布局）。
 * 算法参照 Red Blob Games「Hexagonal Grids」。
 *
 * 三种坐标：
 *  - Offset {col,row}：0 起算，用于存储与显示（格号 "CCRR" = col+1, row+1）
 *  - Axial {q,r}：用于距离、相邻等计算
 *  - 世界坐标 {x,y}：公里，x 向东、y 向南（屏幕方向）
 */
export interface Offset { col: number; row: number }
export interface Axial { q: number; r: number }
export interface Point { x: number; y: number }

/** 平顶六角格的 6 个方向（与格边编号一致）：0 北、1 东北、2 东南、3 南、4 西南、5 西北 */
export const DIRECTIONS = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;
export type Direction = 0 | 1 | 2 | 3 | 4 | 5;

const AXIAL_DIRS: Axial[] = [
  { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
  { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 },
];

export function offsetToAxial({ col, row }: Offset): Axial {
  return { q: col, r: row - (col - (col & 1)) / 2 };
}

export function axialToOffset({ q, r }: Axial): Offset {
  return { col: q, row: r + (q - (q & 1)) / 2 };
}

export function neighbor(h: Offset, dir: Direction): Offset {
  const a = offsetToAxial(h);
  const d = AXIAL_DIRS[dir]!;
  return axialToOffset({ q: a.q + d.q, r: a.r + d.r });
}

export function neighbors(h: Offset): Offset[] {
  return ([0, 1, 2, 3, 4, 5] as Direction[]).map((d) => neighbor(h, d));
}

export function distance(a: Offset, b: Offset): number {
  const p = offsetToAxial(a);
  const q = offsetToAxial(b);
  const dq = p.q - q.q;
  const dr = p.r - q.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** 格号："CCRR"，列、行各两位，从 01 起。 */
export function hexId({ col, row }: Offset): string {
  return `${String(col + 1).padStart(2, '0')}${String(row + 1).padStart(2, '0')}`;
}

export function parseHexId(id: string): Offset {
  if (!/^\d{4}$/.test(id)) throw new Error(`格号格式错误：${id}`);
  return { col: Number(id.slice(0, 2)) - 1, row: Number(id.slice(2)) - 1 };
}

/** 六角格网几何：across = 对边距离（公里），origin = 0101 格中心的世界坐标。 */
export interface HexGrid {
  acrossKm: number;
  origin: Point;
  cols: number;
  rows: number;
}

/** 外接圆半径（中心到顶点） */
export const radiusOf = (g: HexGrid): number => g.acrossKm / Math.sqrt(3);

export function inBounds(g: HexGrid, { col, row }: Offset): boolean {
  return col >= 0 && row >= 0 && col < g.cols && row < g.rows;
}

export function hexCenter(g: HexGrid, { col, row }: Offset): Point {
  const R = radiusOf(g);
  return {
    x: g.origin.x + col * 1.5 * R,
    y: g.origin.y + row * g.acrossKm + (col & 1 ? g.acrossKm / 2 : 0),
  };
}

/** 6 个顶点，从正东开始顺时针（屏幕坐标 y 向下）。各方向格边用哪两个顶点见 sideCorners。 */
export function hexCorners(g: HexGrid, h: Offset): Point[] {
  const c = hexCenter(g, h);
  const R = radiusOf(g);
  return [0, 1, 2, 3, 4, 5].map((i) => ({
    x: c.x + R * Math.cos((Math.PI / 3) * i),
    y: c.y + R * Math.sin((Math.PI / 3) * i),
  }));
}

/** 某方向格边的两个端点。 */
export function sideCorners(g: HexGrid, h: Offset, dir: Direction): [Point, Point] {
  const cs = hexCorners(g, h);
  // 顶点 0 东、1 东南下、2 西南下、3 西、4 西北上、5 东北上
  const map: Record<Direction, [number, number]> = { 0: [4, 5], 1: [5, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4] };
  const [a, b] = map[dir];
  return [cs[a]!, cs[b]!];
}

/** 世界坐标 → 所在格（可能越界，调用方用 inBounds 判断）。 */
export function hexAt(g: HexGrid, p: Point): Offset {
  const R = radiusOf(g);
  const x = (p.x - g.origin.x) / R;
  const y = (p.y - g.origin.y) / R;
  const q = (2 / 3) * x;
  const r = (-1 / 3) * x + (Math.sqrt(3) / 3) * y;
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return axialToOffset({ q: rq, r: rr });
}

/** 格边的规范键：同一条边从两侧看得到同一个键（只用方向 0/1/2）。 */
export function sideKey(h: Offset, dir: Direction): string {
  if (dir <= 2) return `${hexId(h)}:${dir}`;
  return `${hexId(neighbor(h, dir))}:${dir - 3}`;
}
