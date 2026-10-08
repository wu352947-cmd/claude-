import { describe, expect, it } from 'vitest';
import { hexAt, hexCenter, hexId, inBounds, loadMap, toLatLon, toWorld } from '../src/engine';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const map = loadMap({ def, hexes, hexsides, labels });

describe('南线地图数据', () => {
  it('通过数据模式校验', () => {
    expect(map.grid.cols).toBe(45);
    expect(map.grid.rows).toBe(38);
  });

  it('格网覆盖地图声明的经纬度范围（四角都在格网内）', () => {
    const { lat, lon } = map.def.extent;
    for (const la of lat) for (const lo of lon) {
      expect(inBounds(map.grid, hexAt(map.grid, toWorld(map.projection, la, lo)))).toBe(true);
    }
  });

  it('所有地名都在地图范围内', () => {
    for (const l of map.labels) {
      expect(inBounds(map.grid, hexAt(map.grid, toWorld(map.projection, l.lat, l.lon))), l.id).toBe(true);
    }
  });

  it('自动提取的格子都标明了状态和来源', () => {
    for (const [id, h] of map.hexes) {
      expect(h.sources.length, id).toBeGreaterThan(0);
    }
  });

  it('地图引用的史料都在史料登记表中', () => {
    const csv = readFileSync(fileURLToPath(new URL('../data/sources.csv', import.meta.url)), 'utf8');
    const ids = new Set(csv.split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean));
    const used = [...map.def.reference.sources, ...[...map.hexes.values()].flatMap((h) => h.sources), ...map.labels.flatMap((l) => l.sources)];
    for (const s of used) expect(ids.has(s), s).toBe(true);
  });

  it('格中心经纬度换算可往返（用于信息面板显示）', () => {
    const c = hexCenter(map.grid, { col: 20, row: 20 });
    const ll = toLatLon(map.projection, c);
    expect(hexId(hexAt(map.grid, toWorld(map.projection, ll.lat, ll.lon)))).toBe('2121');
  });

  it('错误数据会被拒绝：越界格子', () => {
    expect(() => loadMap({ def, hexes: { hexes: { '9999': { terrain: 'woods', status: 'auto', sources: [] } } }, hexsides, labels })).toThrow();
  });

  it('错误数据会被拒绝：未知地形', () => {
    expect(() => loadMap({ def, hexes: { hexes: { '0101': { terrain: 'jungle', status: 'auto' } } }, hexsides, labels })).toThrow();
  });
});
