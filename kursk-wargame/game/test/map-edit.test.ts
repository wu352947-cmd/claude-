import { describe, expect, it } from 'vitest';
import {
  MapEdits, editCount, emptyEdits, hexCenter, hexRecord, loadMap, nearestSide, parseHexId, pruneEdits, setNote,
  setTerrain, sideCorners, sideKey, toggleSideFeature, toggleVerified, verifiedCount, withEdits, type Direction,
} from '../src/engine';
import def from '../data/maps/south.json';

const base = loadMap({
  def,
  hexes: { hexes: { '1010': { terrain: 'woods', status: 'auto', note: '自动提取：林地占比 60%', sources: ['SRC-0101'] } } },
  hexsides: { hexsides: {} },
  labels: { labels: [] },
});
const O = { source: 'SRC-0102', verify: true };
const h = parseHexId('1010');

describe('地图编辑：格子', () => {
  it('改地形：记录新地形、核对状态与依据，丢弃自动提取的备注，底图不变', () => {
    const e = setTerrain(base, emptyEdits('south'), h, 'marsh', O);
    expect(e.hexes['1010']).toEqual({ terrain: 'marsh', status: 'verified', sources: ['SRC-0102'] });
    expect(hexRecord(withEdits(base, e), h).terrain).toBe('marsh');
    expect(hexRecord(base, h).terrain).toBe('woods');
  });

  it('把格子改回未核对的开阔地 = 删除记录', () => {
    const e = setTerrain(base, emptyEdits('south'), h, 'clear', { ...O, verify: false });
    expect(e.hexes['1010']).toBeNull();
    expect(withEdits(base, e).hexes.has('1010')).toBe(false);
  });

  it('改回与底图相同的内容时，修改单里不留记录', () => {
    let e = setTerrain(base, emptyEdits('south'), parseHexId('2020'), 'village', O);
    expect(editCount(e)).toBe(1);
    e = setTerrain(base, e, parseHexId('2020'), 'clear', { ...O, verify: false });
    expect(editCount(e)).toBe(0);
  });

  it('核对开关：保留地形与备注，出处追加本次依据；再点一次取消', () => {
    const e1 = toggleVerified(base, emptyEdits('south'), h, 'SRC-0102');
    expect(e1.hexes['1010']).toMatchObject({ terrain: 'woods', status: 'verified', note: '自动提取：林地占比 60%', sources: ['SRC-0101', 'SRC-0102'] });
    const e2 = toggleVerified(base, e1, h, 'SRC-0102');
    expect(hexRecord(withEdits(base, e2), h).status).toBe('unverified');
  });

  it('已核对的开阔地也要存下来', () => {
    const e = toggleVerified(base, emptyEdits('south'), parseHexId('0505'), 'SRC-0101');
    expect(e.hexes['0505']).toEqual({ terrain: 'clear', status: 'verified', sources: ['SRC-0101'] });
    expect(verifiedCount(withEdits(base, e))).toBe(1);
  });

  it('备注：写入与清空', () => {
    let e = setNote(base, emptyEdits('south'), h, '  林缘有冲沟  ');
    expect(e.hexes['1010']?.note).toBe('林缘有冲沟');
    e = setNote(base, e, h, '');
    expect(e.hexes['1010']?.note).toBeUndefined();
  });
});

describe('地图编辑：格边', () => {
  it('冲沟开关：两侧格子指向同一条格边', () => {
    const e1 = toggleSideFeature(base, emptyEdits('south'), h, 3, 'balka', O);
    expect(Object.keys(e1.hexsides)).toEqual([sideKey(h, 3)]);
    expect(withEdits(base, e1).sides.get(sideKey(h, 3))?.features).toEqual(['balka']);
    const e2 = toggleSideFeature(base, e1, h, 3, 'balka', O);
    expect(editCount(e2)).toBe(0);
  });
});

describe('修改单', () => {
  it('能通过格式校验（导出再导入不变）', () => {
    let e = setTerrain(base, emptyEdits('south'), h, 'town', O);
    e = toggleSideFeature(base, e, h, 1, 'railEmbankment', O);
    expect(MapEdits.parse(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('合并进数据后，修改单里与底图相同的条目自动去掉', () => {
    const e = setTerrain(base, emptyEdits('south'), h, 'town', O);
    const merged = withEdits(base, e);
    expect(editCount(pruneEdits(merged, e))).toBe(0);
    expect(editCount(pruneEdits(base, e))).toBe(1);
  });
});

describe('点选格边', () => {
  it('点在格边中点附近 → 选中这条边', () => {
    for (const dir of [0, 1, 2, 3, 4, 5] as Direction[]) {
      const [a, b] = sideCorners(base.grid, h, dir);
      const c = hexCenter(base.grid, h);
      const p = { x: c.x + ((a.x + b.x) / 2 - c.x) * 0.9, y: c.y + ((a.y + b.y) / 2 - c.y) * 0.9 };
      expect(nearestSide(base.grid, p)).toEqual({ hex: h, dir });
    }
  });

  it('点在格子中央 → 不选边', () => {
    expect(nearestSide(base.grid, hexCenter(base.grid, h))).toBeNull();
  });
});
