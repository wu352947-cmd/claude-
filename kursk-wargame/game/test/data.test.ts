import { describe, expect, it } from 'vitest';
import { GameMeta } from '../src/engine';
import rawMeta from '../data/game.json';

describe('数据校验', () => {
  it('data/game.json 符合数据模式', () => {
    expect(() => GameMeta.parse(rawMeta)).not.toThrow();
  });

  it('缺字段的数据会被拒绝', () => {
    expect(GameMeta.safeParse({ title: { zh: '库尔斯克' } }).success).toBe(false);
  });
});
