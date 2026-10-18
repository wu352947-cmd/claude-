#!/usr/bin/env node
/**
 * 把地图编辑器导出的修改单合并进 game/data/maps/<地图>.hexes.json / .hexsides.json。
 *
 * 用法（在 game/ 目录）：npm run apply-edits -- 修改单.json
 * 合并后请运行 npm test 校验数据。修改单里值为 null 的条目表示删除该记录。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) { console.error('用法：npm run apply-edits -- 修改单.json'); process.exit(1); }
const edits = JSON.parse(readFileSync(file, 'utf8'));
if (edits.format !== 'kursk-map-edits' || edits.version !== 1) { console.error('不是地图编辑器的修改单'); process.exit(1); }
if (!/^[a-z0-9-]+$/.test(edits.map)) { console.error('地图 ID 不合法'); process.exit(1); }

const dataDir = new URL('../../game/data/maps/', import.meta.url);
const merge = (suffix, key, changes) => {
  const path = fileURLToPath(new URL(`${edits.map}.${suffix}.json`, dataDir));
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const table = doc[key];
  let set = 0, del = 0;
  for (const [id, rec] of Object.entries(changes ?? {})) {
    if (rec === null) { if (id in table) { delete table[id]; del++; } } else { table[id] = rec; set++; }
  }
  doc[key] = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`${edits.map}.${suffix}.json：写入 ${set} 条，删除 ${del} 条`);
};
merge('hexes', 'hexes', edits.hexes);
merge('hexsides', 'hexsides', edits.hexsides);
