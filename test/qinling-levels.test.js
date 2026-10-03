// 盗墓游戏关卡校验：每章从起点都能走到出口和所有物品
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, NOTES } from '../public/qinling/js/levels.js';

for (const L of LEVELS) {
  test(`第${L.id}章 ${L.name}：地图连通`, () => {
    const rows = L.map, h = rows.length, w = Math.max(...rows.map(r => r.length));
    const at = (x, z) => (rows[z] ?? '')[x] ?? '#';
    const wallSpots = L.wallSpots || '';
    const blockedByLegend = ch => L.legend[ch]?.type === 'block';
    const passable = ch => ch !== '#' && ch !== '~' && !wallSpots.includes(ch) && !blockedByLegend(ch);
    let start;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (at(x, z) === 'P') start = [x, z];
    assert.ok(start, '缺少起点');
    const seen = new Set([start.join()]); const q = [start];
    while (q.length) {
      const [x, z] = q.shift();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (seen.has(k) || !passable(at(nx, nz))) continue;
        seen.add(k); q.push([nx, nz]);
      }
    }
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = at(x, z);
      if (ch === '#' || ch === '.' || ch === '~' || wallSpots.includes(ch) || blockedByLegend(ch)) continue;
      if (ch >= '1' && ch <= '9') continue;
      assert.ok(L.legend[ch], `未定义的图例 ${ch} @${x},${z}`);
      if (['W', 'm', 'C', 'G', 'p', 'o', 'O', 'L', 'l', 'S', 's', 'B'].includes(ch) && L.legend[ch].type !== 'pickup') continue;
      assert.ok(seen.has(x + ',' + z), `${ch}(${L.legend[ch].type}) @${x},${z} 走不到`);
    }
    for (const v of Object.values(L.legend)) if (v.note) assert.ok(NOTES[v.note], `缺少笔记 ${v.note}`);
    assert.ok(Object.keys(L.legend).includes('E'));
  });
}
