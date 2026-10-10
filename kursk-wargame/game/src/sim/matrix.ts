/**
 * 打法矩阵：npm run matrix -- [每格局数] [输出文件]
 * 德军 × 苏军各几种打法两两对打，比较结果的差别（docs/14 §11）。
 */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { BotRules } from './bot';
import { loadSimContext } from './context';
import { type GameResult, initialStateFor, playGame } from './play';
import { fmt, mean, quantile, sorted } from './stats';
import rawStyles from '../../data/sim/styles.json';

const Style = z.record(z.string(), z.union([z.string(), z.record(z.string(), z.unknown())]));
export const Styles = z.object({ $comment: z.string().optional(), DE: Style, SU: Style });

const n = Number(process.argv[2] ?? 100);
const out = process.argv[3];
const { ctx, rules, itemClass } = loadSimContext();
const styles = Styles.parse(rawStyles);
const V = ctx.scenario!.victory!;
const names = (side: 'DE' | 'SU'): string[] => Object.keys(styles[side]).filter((k) => k !== '$comment');
const rows: string[] = [];
for (const de of names('DE')) for (const su of names('SU')) {
  const r = BotRules.parse({ ...rules, DE: { ...rules.DE, ...(styles.DE[de] as object) }, SU: { ...rules.SU, ...(styles.SU[su] as object) } });
  const res: GameResult[] = [];
  for (let seed = 1; seed <= n; seed++) res.push(playGame(ctx, (sd) => initialStateFor(ctx, sd), seed, r, itemClass));
  const delta = sorted(res.map((x) => x.total - (V.baseline ?? 0)));
  const held = (hex: string): number => res.filter((x) => x.deHeld.includes(hex)).length / n;
  const sum = (f: (x: GameResult) => number): number => mean(res.map(f));
  const tl = (side: 'DE' | 'SU') => sum((x) => x.tankLoss.filter((t) => t.side === side).reduce((a, t) => a + t.tanks, 0));
  const bands = V.bands.map((b) => `${Math.round((100 * res.filter((x) => V.bands.find((bb) => bb.min === null || x.total - (V.baseline ?? 0) >= bb.min) === b).length) / n)}%`);
  rows.push(`| ${de} | ${su} | ${fmt(sum((x) => x.deHeld.length))} | ${Math.round(100 * held('2515'))}% | ${fmt(tl('SU'))} | ${fmt(tl('DE'))} | ${fmt(quantile(delta, 0.1))} ~ ${fmt(quantile(delta, 0.9))} | ${bands.join(' / ')} |`);
  console.error(`… ${de} × ${su}`);
}
const md = `# 打法矩阵（S1，每格 ${n} 局，种子 1–${n}）

> 由 \`npm run matrix\` 自动生成。德军、苏军各几种打法两两对打。打法参数见 data/sim/styles.json（AI 拟定的模拟设定，不是史料）。
> **读法**：不是找"最像历史"的组合，而是看——不同打法的结果差别有多大（有差别才有玩头），历史结局是否在合理打法的范围内。

| 德军打法 | 苏军打法 | 德军占目标数（共 9 个） | 德军占普罗霍罗夫卡 | 苏军装甲完全损失（辆） | 德军装甲完全损失（辆） | 得分与历史基准之差（10%~90%） | 档位分布：${V.bands.map((b) => b.label).join(' / ')} |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
if (out) { writeFileSync(out, md); console.error(`已写入 ${out}`); } else console.log(md);
