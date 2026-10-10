import { loadSimContext } from './context';
import { initialStateFor, playGame } from './play';
const { ctx, rules, itemClass } = loadSimContext();
const n = Number(process.argv[2] ?? 5);
const t0 = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const r = playGame(ctx, (sd) => initialStateFor(ctx, sd), seed, rules, itemClass);
  const tl = (d: number, side: string, ss?: boolean) => Math.round(r.tankLoss.filter((x) => x.day === d && x.side === side && (ss === undefined || x.ss === ss)).reduce((a, x) => a + x.tanks, 0));
  console.log(seed, 'cmds', r.commands, 'attacks', r.attacks, 'DE held', r.deHeld.join(','), 'total', r.total, 'lost', JSON.stringify(r.lostSteps),
    'SU tanks d0/d1/d2', tl(0, 'SU'), tl(1, 'SU'), tl(2, 'SU'), '| DE', tl(0, 'DE'), tl(1, 'DE'), tl(2, 'DE'), 'SS', tl(0, 'DE', true) + tl(1, 'DE', true) + tl(2, 'DE', true), 'pool', JSON.stringify(r.pool));
}
console.log('ms/game', Math.round((performance.now() - t0) / n));
