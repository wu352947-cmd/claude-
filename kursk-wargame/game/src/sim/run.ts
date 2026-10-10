/**
 * 无界面批量模拟：npm run sim -- [局数] [输出文件]
 * 用自动对手把 S1 想定打 N 局（种子 1…N），统计分布并生成校准报告。
 */
import { writeFileSync } from 'node:fs';
import { loadSimContext } from './context';
import { initialStateFor, playGame } from './play';
import { makeReport } from './report';

const n = Number(process.argv[2] ?? 200);
const out = process.argv[3];
const { ctx, rules, itemClass } = loadSimContext();
const results = [];
const t0 = performance.now();
for (let seed = 1; seed <= n; seed++) {
  results.push(playGame(ctx, (sd) => initialStateFor(ctx, sd), seed, rules, itemClass));
  if (seed % 50 === 0) console.error(`… ${seed}/${n}（${Math.round((performance.now() - t0) / 1000)} 秒）`);
}
const { md, verdicts } = makeReport(ctx.scenario!, results, { first: 1, botNote: `自动对手参数见 data/sim/bots.json（德军向目标推进；苏军原地防守，有主动权的回合机动单位反突击）。` });
if (out) { writeFileSync(out, md + '\n'); console.error(`已写入 ${out}`); } else console.log(md);
console.error(JSON.stringify(verdicts, null, 1));
