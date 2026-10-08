/**
 * 可设种子的确定性随机数（mulberry32）。
 * 引擎内所有随机性都必须来自这里：同一种子 → 同一串骰子，存档才能精确回放。
 * 状态是一个整数，可以直接存进存档。
 */
export interface RngState {
  seed: number;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** 返回 [0, 1) 的随机数和推进后的新状态（不修改传入的状态）。 */
export function nextFloat(state: RngState): [number, RngState] {
  let t = (state.seed + 0x6d2b79f5) >>> 0;
  const next = { seed: t };
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** 掷一个 sides 面骰，返回 1..sides。 */
export function rollDie(state: RngState, sides: number): [number, RngState] {
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`骰子面数无效：${sides}`);
  const [f, next] = nextFloat(state);
  return [1 + Math.floor(f * sides), next];
}
