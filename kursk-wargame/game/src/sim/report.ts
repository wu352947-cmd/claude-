/** 校准报告：把一批模拟结果整理成 Markdown（分布表、文字直方图、与历史对照的判定）。 */
import { type Scenario } from '../engine';
import { type GameResult } from './play';
import { fmt, histogram, mean, placement, quantile } from './stats';

/** 历史参照值（来源见 docs/reviews/2026-10-10-S1…考据，disputes.csv DSP-0028/0029）。区间 [a, b] */
export const HISTORY = {
  suArmorDay2: { a: 192, b: 235, text: '192–235 辆（Wheatley：12 日完全损失 192 辆，到 17 日累计 235 辆；坦克博物馆：不可修复 207 辆）' },
  deSsArmor: { a: 0, b: 16, text: '最多 16 辆（Wheatley：党卫军军 7 月 11–20 日装甲车辆完全损失，12 日"几乎肯定在 5 到 10 辆之间"）' },
};

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const tanks = (r: GameResult, f: (x: GameResult['tankLoss'][number]) => boolean): number => sum(r.tankLoss.filter(f).map((x) => x.tanks));
const row = (name: string, xs: number[]): string =>
  `| ${name} | ${fmt(mean(xs))} | ${[0.1, 0.25, 0.5, 0.75, 0.9].map((q) => fmt(quantile(xs, q))).join(' | ')} |`;
const VERDICT = { central: '**通过**（历史值落在 25%–75% 分位内）', wide: '可接受（落在 10%–90% 之间，需书面解释）', outside: '**不通过**（落在 10%–90% 之外）' };

export function makeReport(sc: Scenario, results: GameResult[], opts: { first: number; botNote: string }): { md: string; verdicts: Record<string, string> } {
  const n = results.length;
  const verdicts: Record<string, string> = {};
  const L: string[] = [];
  const objs = sc.objectives;
  const ctl = sc.history!.control;

  const suD2 = results.map((r) => tanks(r, (x) => x.side === 'SU' && x.day === 1));
  const deSS = results.map((r) => tanks(r, (x) => x.side === 'DE' && x.ss));
  const deAll = results.map((r) => tanks(r, (x) => x.side === 'DE'));
  const suAll = results.map((r) => tanks(r, (x) => x.side === 'SU'));
  const ratio = results.map((r, i) => suD2[i]! / Math.max(1, tanks(r, (x) => x.side === 'DE' && x.day === 1)));
  const dayRow = (side: 'DE' | 'SU', d: number): number[] => results.map((r) => tanks(r, (x) => x.side === side && x.day === d));
  const objVp = results.map((r) => objs.filter((o) => r.deHeld.includes(o.hex)).reduce((a, o) => a + o.vp, 0));
  const poolRatio = (side: 'DE' | 'SU'): number => sum(results.map((r) => r.pool[side].destroyed)) / Math.max(1, sum(results.map((r) => r.pool[side].damaged)));

  L.push('# S1 无界面模拟校准报告', '',
    `> 由 \`npm run sim\` 自动生成。${n} 局，种子 ${opts.first}–${opts.first + n - 1}，想定 ${sc.id}。${opts.botNote}`,
    '> **读法**：自动对手很朴素，不是历史命令脚本，所以这里的结果首先检验"规则与数据组合起来会不会产生离谱的结果"，不能直接当作对历史的复现。判定标准见 [05 §6.3](../05-史料复原方案.md)。', '');

  L.push('## 1. 对局概况', '', '| 指标 | 平均 | 10% | 25% | 50% | 75% | 90% |', '|---|---|---|---|---|---|---|',
    row('每局指令数', results.map((r) => r.commands)), row('每局战斗次数', results.map((r) => r.attacks)),
    row('德军占着的目标点数', objVp), row('德军得分（目标 + 装甲损失交换）', results.map((r) => r.total)), '');

  L.push('## 2. 装甲完全损失（折算成车辆数）', '',
    '游戏里装甲单位每损失 1 步，按该单位战斗序列里的车辆总数 ÷ 满编步数折算成车辆数。这是粗略折算，只用来跟历史数字比数量级。', '',
    '| 指标 | 平均 | 10% | 25% | 50% | 75% | 90% |', '|---|---|---|---|---|---|---|',
    row('苏军 7 月 11 日', dayRow('SU', 0)), row('苏军 7 月 12 日', dayRow('SU', 1)), row('苏军 7 月 13 日', dayRow('SU', 2)), row('苏军合计', suAll),
    row('德军 7 月 11 日', dayRow('DE', 0)), row('德军 7 月 12 日', dayRow('DE', 1)), row('德军 7 月 13 日', dayRow('DE', 2)),
    row('德军合计', deAll), row('其中党卫军军合计', deSS), row('苏德比（12 日）', ratio), '');

  L.push('## 3. 与历史对照', '', '| 指标 | 历史值 | 模拟 25%–75% | 模拟 10%–90% | 判定 |', '|---|---|---|---|---|');
  const cmp = (key: string, name: string, h: { a: number; b: number; text: string }, xs: number[]): void => {
    const v = VERDICT[placement(xs, h.a, h.b)];
    verdicts[key] = v;
    L.push(`| ${name} | ${h.text} | ${fmt(quantile(xs, 0.25))} – ${fmt(quantile(xs, 0.75))} | ${fmt(quantile(xs, 0.1))} – ${fmt(quantile(xs, 0.9))} | ${v} |`);
  };
  cmp('suDay2', '苏军 7 月 12 日装甲完全损失（辆）', HISTORY.suArmorDay2, suD2);
  cmp('deSS', '党卫军军装甲完全损失 11–13 日（辆）', HISTORY.deSsArmor, deSS);
  for (const c of ctl.filter((x) => x.heldBy !== 'contested')) {
    const o = objs.find((x) => x.hex === c.hex)!;
    const pDE = results.filter((r) => r.deHeld.includes(c.hex)).length / n;
    const pHist = c.heldBy === 'DE' ? pDE : 1 - pDE;
    const v = pHist >= 0.25 ? VERDICT.central : pHist >= 0.1 ? VERDICT.wide : VERDICT.outside;
    verdicts[`obj${c.hex}`] = v;
    L.push(`| ${o.name}（${c.hex}）13 日终归${c.heldBy === 'DE' ? '德' : '苏'}军 | 史料：${c.heldBy === 'DE' ? '德' : '苏'}军 | 模拟中德军占着 ${(pDE * 100).toFixed(0)}% | 历史结果出现 ${(pHist * 100).toFixed(0)}% | ${v} |`);
  }
  L.push('', '（目标格的判定：历史结果在模拟里出现的比例 ≥ 25% 算通过，≥ 10% 算可接受。历史上说法矛盾的格子不参加判定。）', '');

  L.push('## 4. 装甲受损池分流（回合末）', '',
    '| 阵营 | 受损步数合计 | 送修 | 完全损失 | 完全损失占比 |', '|---|---|---|---|---|',
    ...(['DE', 'SU'] as const).map((s) => {
      const d = sum(results.map((r) => r.pool[s].damaged)), a = sum(results.map((r) => r.pool[s].repaired)), z = sum(results.map((r) => r.pool[s].destroyed));
      return `| ${s === 'DE' ? '德军' : '苏军'} | ${d} | ${a} | ${z} | ${(poolRatio(s) * 100).toFixed(0)}% |`;
    }),
    '', '历史参照：苏军 7 月 12 日被击中的 340 辆里约 192 辆完全损失（约 56%）；德军"失去战斗力"154 辆里完全损失只有 5–10 辆（约 3%–6%）。这个比例由战场控制决定（德军守住战场，所以回收得多），不是一个固定参数。', '');

  const attacks = sum(results.map((r) => r.attacks));
  const odds: Record<string, number> = {}, codes: Record<string, number> = {};
  for (const r of results) { for (const [k, v] of Object.entries(r.odds)) odds[k] = (odds[k] ?? 0) + v; for (const [k, v] of Object.entries(r.codes)) codes[k] = (codes[k] ?? 0) + v; }
  const cols = ['1:2', '1:1', '1.5:1', '2:1', '3:1', '4:1', '5:1', '6:1'];
  L.push('## 5. 战斗结果分布', '', `${n} 局共 ${attacks} 次战斗。`, '', '**用到的赔率列**', '', '| 列 | 次数 | 占比 |', '|---|---|---|',
    ...cols.filter((c) => odds[c]).map((c) => `| ${c} | ${odds[c]} | ${((odds[c]! / attacks) * 100).toFixed(0)}% |`), '',
    '**结果代码**（A = 攻方损失步数，D = 守方损失步数，R = 守方撤退格数）', '', '| 结果 | 次数 | 占比 |', '|---|---|---|',
    ...Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([c, v]) => `| ${c} | ${v} | ${((v / attacks) * 100).toFixed(0)}% |`), '');

  L.push('## 6. 分布图', '', '**苏军 7 月 12 日装甲完全损失（辆）**', '', '```', histogram(suD2), '```', '',
    '**党卫军军装甲完全损失 11–13 日（辆）**', '', '```', histogram(deSS), '```', '',
    '**德军占着的目标点数**', '', '```', histogram(objVp, 8), '```', '');
  return { md: L.join('\n'), verdicts };
}
