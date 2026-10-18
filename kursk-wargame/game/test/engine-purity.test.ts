import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 护栏：规则引擎必须是纯逻辑、确定性的（见 kursk-wargame/CLAUDE.md「架构铁律」）
const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/engine');
const FORBIDDEN: [RegExp, string][] = [
  [/from\s+['"]pixi\.js['"]/, '引用了 PixiJS'],
  [/\bMath\.random\s*\(/, '使用了 Math.random()'],
  [/\bDate\.now\s*\(/, '使用了 Date.now()'],
  [/\b(document|window|localStorage)\./, '使用了浏览器 API'],
  [/from\s+['"]\.\.\/client/, '引用了界面代码'],
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

describe('引擎纯净性', () => {
  for (const file of files(ENGINE_DIR)) {
    it(file.slice(ENGINE_DIR.length + 1), () => {
      // 去掉注释再检查：注释里写“禁止 Math.random()”不算违规
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const violations = FORBIDDEN.filter(([re]) => re.test(src)).map(([, msg]) => msg);
      expect(violations).toEqual([]);
    });
  }
});
