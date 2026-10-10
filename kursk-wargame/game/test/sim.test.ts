import { describe, expect, it } from 'vitest';
import { Bot } from '../src/sim/bot';
import { loadSimContext } from '../src/sim/context';
import { initialStateFor, playGame } from '../src/sim/play';
import { makeReport } from '../src/sim/report';
import { histogram, placement, quantile } from '../src/sim/stats';
import { apply } from '../src/engine';

const { ctx, rules, itemClass } = loadSimContext();
const play = (seed: number) => playGame(ctx, (s) => initialStateFor(ctx, s), seed, rules, itemClass);

describe('统计工具', () => {
  it('分位数（线性插值）', () => {
    expect([quantile([1, 2, 3, 4, 5], 0), quantile([1, 2, 3, 4, 5], 0.5), quantile([1, 2, 3, 4, 5], 1), quantile([10, 20], 0.25)]).toEqual([1, 3, 5, 12.5]);
  });
  it('历史值落在哪一段：中间 25–75%、10–90%、之外；区间只要重叠就算', () => {
    const xs = Array.from({ length: 101 }, (_, i) => i); // 分位数 = 下标
    expect([placement(xs, 50, 50), placement(xs, 15, 15), placement(xs, 5, 5), placement(xs, 95, 99)]).toEqual(['central', 'wide', 'outside', 'outside']);
    expect(placement(xs, 0, 30)).toBe('central');
  });
  it('直方图各行局数加起来等于样本数；全相同的样本不画图', () => {
    const h = histogram([1, 2, 2, 3, 9], 4);
    expect(h.split('\n').map((l) => Number(l.trim().split(' ').at(-1))).reduce((a, b) => a + b, 0)).toBe(5);
    expect(histogram([4, 4, 4])).toMatch(/全部 = 4/);
  });
});

describe('无界面模拟', () => {
  it('自动对手能把 S1 打完：9 回合结束、没有非法指令、德军占的目标点数与损失都是有限数', () => {
    const r = play(1);
    expect(r.turns).toBe(9);
    expect(r.attacks).toBeGreaterThan(0);
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.commands).toBeLessThan(4000);
  });

  it('同一种子结果完全相同；不同种子（骰子不同）结果不全相同', () => {
    expect(play(7)).toEqual(play(7));
    const sig = (seed: number) => { const r = play(seed); return JSON.stringify([r.lostSteps, r.deHeld]); };
    expect(new Set([1, 2, 3, 4].map(sig)).size).toBeGreaterThan(1);
  });

  it('自动对手不会给出非法指令（逐条检查 apply 不抛错）', () => {
    const bot = new Bot(ctx, rules);
    let s = initialStateFor(ctx, 3);
    for (let i = 0; i < 4000 && !s.over; i++) s = apply(ctx, s, bot.step(s)).state;
    expect(s.over).toBe(true);
  });

  it('苏军只守不攻（goal=hold、minRatio 很高）时，第一回合德军占不到任何苏军目标之外的格子也不会崩', () => {
    const calm = { ...rules, SU: { ...rules.SU, goalWhenFirst: 'hold' as const, minRatio: 99, minRatioWhenFirst: 99 } };
    const r = playGame(ctx, (s) => initialStateFor(ctx, s), 2, calm, itemClass);
    expect(r.turns).toBe(9);
  });

  it('报告：三批结果生成的 Markdown 包含各节、判定文字', () => {
    const rs = [1, 2, 3].map(play);
    const { md, verdicts } = makeReport(ctx.scenario!, rs, { first: 1, botNote: '' });
    for (const h of ['## 1. 对局概况', '## 2. 装甲完全损失', '## 3. 与历史对照', '## 4. 装甲受损池分流', '## 5. 战斗结果分布', '## 6. 分布图']) expect(md).toContain(h);
    expect(Object.keys(verdicts)).toContain('suDay2');
    expect(Object.keys(verdicts).filter((k) => k.startsWith('obj')).length).toBe(6);
  });
});
