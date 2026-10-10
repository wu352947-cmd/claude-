import { describe, expect, it } from 'vitest';
import { Bot } from '../src/sim/bot';
import { loadSimContext } from '../src/sim/context';
import { initialStateFor, playGame } from '../src/sim/play';
import { makeReport } from '../src/sim/report';
import { histogram, placement, quantile } from '../src/sim/stats';
import { apply, type GameState } from '../src/engine';
import { aiStyleNames, defaultAiStyle, makeBot } from '../src/client/ai';

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
    expect(Number.isFinite(r.vp)).toBe(true);
    expect(r.commands).toBeLessThan(4000);
  });

  it('同一种子结果完全相同；不同种子（骰子不同）结果不全相同', () => {
    expect(play(7)).toEqual(play(7));
    const sig = (seed: number) => { const r = play(seed); return JSON.stringify([r.lostSteps, r.deHeld]); };
    expect(new Set([1, 2, 3, 4].map(sig)).size).toBeGreaterThan(1);
  }, 30000);

  it('自动对手不会给出非法指令（逐条检查 apply 不抛错）', () => {
    const bot = new Bot(ctx, rules);
    let s = initialStateFor(ctx, 3);
    for (let i = 0; i < 4000 && !s.over; i++) s = apply(ctx, s, bot.step(s)).state;
    expect(s.over).toBe(true);
  });

  it('苏军只守不攻（goal=hold、minRatio 很高）时，第一回合德军占不到任何苏军目标之外的格子也不会崩', () => {
    const calm = { ...rules, SU: { ...rules.SU, goalWhenFirst: 'hold' as const, minRatio: 99, minRatioWhenFirst: 99 } };
    const r = playGame(ctx, (s) => initialStateFor(ctx, s), 2, calm, itemClass);
    expect(r.turns).toBeLessThanOrEqual(9);
  });

  it('报告：三批结果生成的 Markdown 包含各节、判定文字', () => {
    const rs = [1, 2, 3].map(play);
    const { md, verdicts } = makeReport(ctx.scenario!, rs, { first: 1, botNote: '' });
    for (const h of ['## 1. 对局概况', '## 2. 装甲完全损失', '## 3. 与历史对照', '## 4. 装甲受损池分流', '## 5. 战斗结果分布', '## 6. 分布图']) expect(md).toContain(h);
    expect(Object.keys(verdicts)).toContain('suDay2');
    expect(Object.keys(verdicts).filter((k) => k.startsWith('obj')).length).toBe(6);
  }, 30000);
});

describe('自动对手与作战计划', () => {
  it('想进攻的一方第一个移动阶段就画主攻线（指派一个军/集团军，指向没占到的目标）；之后不重复画', () => {
    const bot = new Bot(ctx, rules);
    let s = initialStateFor(ctx, 1);
    const cmds: string[] = [];
    for (let i = 0; i < 400 && s.turn === 1 && s.phase <= 3; i++) {
      const c = bot.step(s);
      if (c.type === 'Plan') cmds.push(JSON.stringify(c));
      s = apply(ctx, s, c).state;
    }
    expect(cmds).toHaveLength(1);
    const ax = s.plans.find((p) => p.side === 'DE')!;
    expect(ax.kind).toBe('main');
    expect(ctx.oob.formations.get(ax.formation!)?.side).toBe('DE');
    expect(ctx.scenario!.objectives.some((o) => o.hex === ax.path.at(-1))).toBe(true);
    // 死守的一方（goal = hold）不画
    expect(s.plans.filter((p) => p.side === 'SU')).toHaveLength(0);
  });
});

describe('人机对战的电脑（网页用）', () => {
  it('每方都有可选的打法，默认打法在其中；任何打法都能给出合法的第一条指令', () => {
    for (const side of ['DE', 'SU'] as const) {
      expect(aiStyleNames(side).length).toBeGreaterThanOrEqual(2);
      expect(aiStyleNames(side)).toContain(defaultAiStyle(side));
      for (const style of [...aiStyleNames(side), '不存在的打法']) {
        const s0 = initialStateFor(ctx, 1);
        // 让 side 行动：德军是主动方；苏军先让德军结束阶段直到轮到苏军
        let s = s0;
        while (side === 'SU' && s.phase < 5) s = apply(ctx, s, { type: 'EndPhase' }).state;
        const c = makeBot(ctx, side, style).step(s);
        expect(() => apply(ctx, s, c)).not.toThrow();
      }
    }
  });
});

describe('电脑受迷雾限制', () => {
  it('只看得到贴近本方单位的敌军；不受限时看得到全部', () => {
    const s = initialStateFor(ctx, 1);
    const all = new Bot(ctx, rules) as unknown as { enemyHexes(s: GameState, side: 'SU'): string[] };
    const fogged = new Bot(ctx, rules, true) as unknown as typeof all;
    const full = all.enemyHexes(s, 'SU'), seen = fogged.enemyHexes(s, 'SU');
    expect(seen.every((h) => full.includes(h))).toBe(true);
    // 把苏军挪到远处：什么都看不到
    const far = { ...s, units: s.units.map((u) => (ctx.oob.units.get(u.id)!.formation.startsWith('SU') ? { ...u, hex: '0101' } : u)) };
    expect(fogged.enemyHexes(far, 'SU')).toEqual([]);
    expect(all.enemyHexes(far, 'SU').length).toBeGreaterThan(0);
  });
  it('受迷雾限制的电脑也能把整局打完，没有非法指令', () => {
    const bot = new Bot(ctx, rules, true);
    let st = initialStateFor(ctx, 3);
    for (let i = 0; i < 4000 && !st.over; i++) st = apply(ctx, st, bot.step(st)).state;
    expect(st.over).toBe(true);
  });
});
