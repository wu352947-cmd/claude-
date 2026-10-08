import { describe, expect, it } from 'vitest';
import { hexAt, hexCenter, hexId, inBounds, loadMap, toLatLon, toWorld } from '../src/engine';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import linesData from '../data/maps/south.lines.json';
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
    const withLines = loadMap({ def, hexes, hexsides, labels, lines: linesData });
    const csv = readFileSync(fileURLToPath(new URL('../data/sources.csv', import.meta.url)), 'utf8');
    const ids = new Set(csv.split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean));
    const used = [...map.def.reference.sources, ...(map.def.relief?.sources ?? []), ...[...map.hexes.values()].flatMap((h) => h.sources), ...map.labels.flatMap((l) => l.sources), ...withLines.lines.flatMap((l) => l.sources)];
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

import { type Direction, deriveFromLines, hexCenter as hc, linkKey, neighbor as nb, sideFeatures, sideKey, toLatLon as tll } from '../src/engine';

describe('由线状要素推算规则数据', () => {
  const full = loadMap({ def, hexes, hexsides, labels, lines: linesData });

  it('河流穿过的格边：从两侧都能查到', () => {
    expect(full.derivedSides.size).toBeGreaterThan(10);
    const [key] = [...full.derivedSides.keys()];
    const h = { col: Number(key!.slice(0, 2)) - 1, row: Number(key!.slice(2, 4)) - 1 };
    const dir = Number(key!.slice(5)) as Direction;
    expect(sideFeatures(full, h, dir).length).toBeGreaterThan(0);
    expect(sideFeatures(full, nb(h, dir), ((dir + 3) % 6) as Direction)).toEqual(sideFeatures(full, h, dir));
  });

  it('一条从西到东横穿格网的河：每列都有且只有被它隔开的格边', () => {
    const g = full.grid;
    // 沿第 10 行与第 11 行之间（偏下半格）画一条水平的河
    const y = hc(g, { col: 0, row: 10 }).y + 1.4;
    const west = tll(full.projection, { x: hc(g, { col: 2, row: 0 }).x, y });
    const east = tll(full.projection, { x: hc(g, { col: 8, row: 0 }).x, y });
    const { derivedSides } = deriveFromLines(g, full.projection, [{
      id: 't', kind: 'river', class: 'minor', points: [[west.lat, west.lon], [east.lat, east.lon]], status: 'unverified', sources: [],
    }]);
    // 第 4 列（偶数列）的格 (4,10) 与南邻 (4,11) 之间必须有河
    expect(derivedSides.get(sideKey({ col: 4, row: 10 }, 3 as Direction))).toEqual(['minorRiver']);
    // 河北边 3 格以外不应有河
    expect(derivedSides.get(sideKey({ col: 4, row: 7 }, 3 as Direction))).toBeUndefined();
  });

  it('道路沿线的相邻格连通', () => {
    const g = full.grid;
    const a = tll(full.projection, hc(g, { col: 5, row: 5 }));
    const b = tll(full.projection, hc(g, { col: 5, row: 8 }));
    const { links } = deriveFromLines(g, full.projection, [{
      id: 'r', kind: 'road', class: 'secondary', points: [[a.lat, a.lon], [b.lat, b.lon]], status: 'unverified', sources: [],
    }]);
    expect(links.get(linkKey({ col: 5, row: 5 }, { col: 5, row: 6 }))).toEqual(['road']);
    expect(links.get(linkKey({ col: 5, row: 7 }, { col: 5, row: 8 }))).toEqual(['road']);
    expect(links.size).toBe(3);
  });

  it('样板区的普肖尔河产生了河流格边', () => {
    expect([...full.derivedSides.values()].some((f) => f.includes('minorRiver'))).toBe(true);
    expect([...full.links.values()].some((k) => k.includes('railway'))).toBe(true);
  });
});

describe('地图字体', () => {
  it('打包的拉丁字体子集覆盖所有地名转写（有改动时需重新运行 tools/fonts/fetch-map-fonts.mjs）', () => {
    const fonts = JSON.parse(readFileSync(fileURLToPath(new URL('../public/fonts/fonts.json', import.meta.url)), 'utf8'));
    const all = loadMap({ def, hexes, hexsides, labels, lines: linesData });
    const missing = [...new Set(all.labels.flatMap((l) => [...(l.names.en ?? '')]).filter((c) => !fonts.latin.includes(c)))];
    expect(missing).toEqual([]);
  });
});
