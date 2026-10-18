/** 模拟统计：分位数与文字直方图（报告用）。 */
export const sorted = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);
/** 线性插值分位数，q 在 0–1 */
export function quantile(xs: readonly number[], q: number): number {
  const a = sorted(xs);
  if (!a.length) return NaN;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo]! + (a[hi]! - a[lo]!) * (i - lo);
}
export const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
export const fmt = (x: number): string => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : '—');

/** 文字直方图：bins 个等宽区间，每行 "区间 | ████ 局数" */
export function histogram(xs: readonly number[], bins = 10, width = 28): string {
  if (!xs.length) return '（无数据）';
  const lo = Math.min(...xs), hi = Math.max(...xs);
  if (lo === hi) return `全部 = ${fmt(lo)}（${xs.length} 局）`;
  const step = (hi - lo) / bins;
  const counts = Array<number>(bins).fill(0);
  for (const x of xs) counts[Math.min(bins - 1, Math.floor((x - lo) / step))]!++;
  const max = Math.max(...counts);
  return counts.map((c, i) => `${fmt(lo + i * step).padStart(6)} – ${fmt(lo + (i + 1) * step).padEnd(6)} | ${'█'.repeat(Math.round((c / max) * width)).padEnd(width)} ${c}`).join('\n');
}

/** 区间 [a, b] 与分布的哪一段重叠：central = 25%–75%，wide = 10%–90%，否则 outside。历史值是单点时 a = b。 */
export function placement(xs: readonly number[], a: number, b: number): 'central' | 'wide' | 'outside' {
  const ov = (q1: number, q2: number): boolean => a <= quantile(xs, q2) && b >= quantile(xs, q1);
  return ov(0.25, 0.75) ? 'central' : ov(0.1, 0.9) ? 'wide' : 'outside';
}
