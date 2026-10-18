import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, rollDie } from '../src/engine';

function rolls(seed: number, n: number): number[] {
  let s = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [v, next] = rollDie(s, 6);
    out.push(v);
    s = next;
  }
  return out;
}

describe('确定性随机数', () => {
  it('同一种子得到完全相同的骰子序列（存档回放的基础）', () => {
    expect(rolls(1943, 100)).toEqual(rolls(1943, 100));
  });

  it('不同种子得到不同序列', () => {
    expect(rolls(1943, 50)).not.toEqual(rolls(1944, 50));
  });

  it('不修改传入的状态', () => {
    const s = createRng(7);
    nextFloat(s);
    expect(s).toEqual({ seed: 7 });
  });

  it('d6 只出 1–6，且 6 万次中每个面都接近 1/6', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const v of rolls(42, 60000)) counts[v - 1]!++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });

  it('拒绝无效的骰子面数', () => {
    expect(() => rollDie(createRng(1), 0)).toThrow();
  });
});
