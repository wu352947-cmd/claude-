import { describe, expect, it } from 'vitest';
import {
  type Direction, type HexGrid, distance, hexAt, hexCenter, hexId, neighbor, neighbors,
  offsetToAxial, axialToOffset, parseHexId, sideCorners, sideKey,
} from '../src/engine';

const grid: HexGrid = { acrossKm: 3, origin: { x: 0, y: 0 }, cols: 45, rows: 38 };
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('格号', () => {
  it('0 起算的列行 ↔ "CCRR"', () => {
    expect(hexId({ col: 0, row: 0 })).toBe('0101');
    expect(hexId({ col: 11, row: 6 })).toBe('1207');
    expect(parseHexId('1207')).toEqual({ col: 11, row: 6 });
  });
  it('拒绝错误格式', () => {
    expect(() => parseHexId('12a7')).toThrow();
  });
});

describe('坐标换算与相邻', () => {
  it('偏移坐标 ↔ 轴向坐标互逆', () => {
    for (let col = 0; col < 8; col++) for (let row = 0; row < 8; row++) {
      expect(axialToOffset(offsetToAxial({ col, row }))).toEqual({ col, row });
    }
  });
  it('偶数列与奇数列的邻格（odd-q：奇数列下移半格）', () => {
    expect(neighbors({ col: 2, row: 2 })).toEqual([
      { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 3, row: 2 },
      { col: 2, row: 3 }, { col: 1, row: 2 }, { col: 1, row: 1 },
    ]);
    expect(neighbors({ col: 3, row: 2 })).toEqual([
      { col: 3, row: 1 }, { col: 4, row: 2 }, { col: 4, row: 3 },
      { col: 3, row: 3 }, { col: 2, row: 3 }, { col: 2, row: 2 },
    ]);
  });
  it('距离：相邻为 1，自身为 0，对称', () => {
    const h = { col: 10, row: 10 };
    expect(distance(h, h)).toBe(0);
    for (const n of neighbors(h)) expect(distance(h, n)).toBe(1);
    expect(distance({ col: 0, row: 0 }, { col: 4, row: 0 })).toBe(4);
    expect(distance({ col: 0, row: 0 }, { col: 0, row: 5 })).toBe(5);
    expect(distance({ col: 3, row: 7 }, { col: 9, row: 2 })).toBe(distance({ col: 9, row: 2 }, { col: 3, row: 7 }));
  });
});

describe('几何', () => {
  it('相邻格中心相距正好一个对边距离（3 km）', () => {
    const h = { col: 7, row: 4 };
    const c = hexCenter(grid, h);
    for (const n of neighbors(h)) {
      const d = hexCenter(grid, n);
      close(Math.hypot(d.x - c.x, d.y - c.y), 3);
    }
  });
  it('北方向的邻格在正上方', () => {
    const c = hexCenter(grid, { col: 5, row: 5 });
    const n = hexCenter(grid, neighbor({ col: 5, row: 5 }, 0));
    close(n.x, c.x);
    close(n.y, c.y - 3);
  });
  it('格中心与格内点都落回本格', () => {
    for (let col = 0; col < 10; col++) for (let row = 0; row < 10; row++) {
      const c = hexCenter(grid, { col, row });
      expect(hexAt(grid, c)).toEqual({ col, row });
      expect(hexAt(grid, { x: c.x + 0.9, y: c.y - 0.9 })).toEqual({ col, row });
    }
  });
  it('两格共用的格边：两侧算出的端点相同', () => {
    const h = { col: 6, row: 6 };
    for (const d of [0, 1, 2, 3, 4, 5] as Direction[]) {
      const [a, b] = sideCorners(grid, h, d);
      const [c, e] = sideCorners(grid, neighbor(h, d), ((d + 3) % 6) as Direction);
      close(a.x, e.x); close(a.y, e.y); close(b.x, c.x); close(b.y, c.y);
    }
  });
  it('格边规范键：从两侧看是同一个键', () => {
    const h = { col: 6, row: 6 };
    for (const d of [0, 1, 2, 3, 4, 5] as Direction[]) {
      expect(sideKey(h, d)).toBe(sideKey(neighbor(h, d), ((d + 3) % 6) as Direction));
      expect(sideKey(h, d)).toMatch(/^\d{4}:[012]$/);
    }
  });
});
