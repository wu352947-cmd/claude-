/**
 * 对局会话：一局 = 想定 + 种子 + 指令列表（docs/03 §2.1）。
 * - 回放：从初始状态依次 apply 每条指令；
 * - 撤销/重做：只移动"当前位置"游标，状态由回放得到；撤销后再下新指令会丢弃被撤销的那几条；
 * - 存档：只存指令列表和最终状态的指纹，读档时回放并核对指纹，证明结果完全一致。
 */
import { z } from 'zod';
import { Command, type GameContext, type GameEvent, type GameState, apply } from './game';

export interface History {
  /** 已下达的全部指令（含被撤销、可重做的） */
  commands: Command[];
  /** 当前生效的指令条数：commands[0..cursor) */
  cursor: number;
}

export const emptyHistory = (): History => ({ commands: [], cursor: 0 });

/** 下达新指令：先检查合法（非法会抛 CommandError），再丢弃可重做的部分 */
export function push(ctx: GameContext, initial: GameState, h: History, cmd: Command): History {
  apply(ctx, replay(ctx, initial, h).state, cmd);
  return { commands: [...h.commands.slice(0, h.cursor), cmd], cursor: h.cursor + 1 };
}
export const canUndo = (h: History): boolean => h.cursor > 0;
export const canRedo = (h: History): boolean => h.cursor < h.commands.length;
export const undo = (h: History): History => (canUndo(h) ? { ...h, cursor: h.cursor - 1 } : h);
export const redo = (h: History): History => (canRedo(h) ? { ...h, cursor: h.cursor + 1 } : h);

/** 回放到游标处；events[i] 是第 i 条指令产生的事件 */
export function replay(ctx: GameContext, initial: GameState, h: History): { state: GameState; events: GameEvent[][] } {
  let state = initial;
  const events: GameEvent[][] = [];
  for (const [i, c] of h.commands.slice(0, h.cursor).entries()) {
    try {
      const r = apply(ctx, state, c);
      state = r.state;
      events.push(r.events);
    } catch (e) {
      throw new Error(`回放第 ${i + 1} 条指令失败：${(e as Error).message}`);
    }
  }
  return { state, events };
}

/** 状态指纹（FNV-1a，32 位）：键排序后序列化，同样的状态总得到同样的指纹 */
export function stateHash(s: GameState): string {
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(v);
  };
  let h = 0x811c9dc5;
  for (const ch of canon(s)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const SAVE_FORMAT = 'kursk-1943-save';
export const SaveFile = z.object({
  format: z.literal(SAVE_FORMAT),
  version: z.literal(1),
  engine: z.string(),
  scenario: z.string().min(1),
  seed: z.number().int().nonnegative(),
  /** 只存生效的指令（被撤销的不存） */
  commands: z.array(Command),
  /** 回放后最终状态的指纹 */
  hash: z.string().regex(/^[0-9a-f]{8}$/),
});
export type SaveFile = z.infer<typeof SaveFile>;

export function makeSave(ctx: GameContext, initial: GameState, h: History, seed: number, engine: string): SaveFile {
  const commands = h.commands.slice(0, h.cursor);
  const { state } = replay(ctx, initial, { commands, cursor: commands.length });
  return { format: SAVE_FORMAT, version: 1, engine, scenario: initial.scenario, seed, commands, hash: stateHash(state) };
}

/**
 * 读档：校验格式、想定，回放并核对指纹。
 * @param initialFor 由想定 ID 与种子生成初始状态（想定数据在调用方）
 */
export function loadSave(
  ctx: GameContext, raw: unknown, initialFor: (scenario: string, seed: number) => GameState,
): { initial: GameState; history: History; seed: number } {
  const r = SaveFile.safeParse(raw);
  if (!r.success) throw new Error(`不是有效的存档文件：${r.error.issues[0]?.message ?? ''}`);
  const save = r.data;
  const initial = initialFor(save.scenario, save.seed);
  const history = { commands: save.commands, cursor: save.commands.length };
  const { state } = replay(ctx, initial, history);
  const got = stateHash(state);
  if (got !== save.hash) throw new Error(`回放结果与存档不一致（存档指纹 ${save.hash}，回放得到 ${got}）：规则或数据可能已改变`);
  return { initial, history, seed: save.seed };
}
