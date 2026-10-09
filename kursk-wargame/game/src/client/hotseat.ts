/**
 * 热座（docs/11 §4）：两人轮流用同一台设备。
 * - 行动方换人时整屏遮住，等下一位玩家点"继续"；
 * - 迷雾：敌军单位只有贴近本方单位时才显示番号与实力（engine/turn-end.ts revealedEnemies），其余只显示"未侦察"。
 * 双方都行动的阶段由主动方操作。热座时撤销不能退回对方的阶段。关掉热座 = 上帝视角（一个人测试用）。
 */
import { type GameContext, type GameState, SIDE_NAMES, type Side, actingSide, revealedEnemies, sideOfUnit, turnInfo, turnLabel } from '../engine';

const KEY = 'kursk-1943-hotseat';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface Fog {
  viewer: Side;
  /** 看不清的敌军单位 */
  hidden: Set<string>;
}

export interface Hotseat {
  /** 当前视角的迷雾；热座关闭时为 null */
  fog(s: GameState): Fog | null;
  /** 状态变化后调用：换人时遮屏 */
  update(s: GameState): void;
  onToggle(f: () => void): void;
  /** 热座时撤销不能退回对方的阶段（否则能看到对方的部署） */
  blocksUndo(from: GameState, to: GameState): boolean;
}

export function createHotseat(ctx: GameContext): Hotseat {
  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* 隐私模式 */ }
  /** 遮屏后已确认的玩家（刚打开页面时谁都没确认，先遮屏） */
  let confirmed: Side | null = null;
  let toggled = (): void => {};
  const viewer = (s: GameState): Side => actingSide(ctx, s) ?? s.first;
  const box = $('handoff');
  const check = $<HTMLInputElement>('g-hotseat');
  check.checked = on;
  check.onchange = () => {
    on = check.checked;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 隐私模式 */ }
    confirmed = null;
    toggled();
  };

  return {
    fog(s) {
      if (!on) return null;
      const v = viewer(s);
      const seen = revealedEnemies(ctx, s, v);
      return { viewer: v, hidden: new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) !== v && !seen.has(u.id)).map((u) => u.id)) };
    },
    update(s) {
      const v = viewer(s);
      if (!on || confirmed === v) { box.hidden = true; return; }
      const ph = ctx.sequence.phases[s.phase]!;
      $('handoff-text').innerHTML = `请把设备交给<b>${SIDE_NAMES[v]}</b>玩家<small>第 ${s.turn} 回合 · ${turnLabel(turnInfo(ctx, s))} · ${ph.name}</small>`;
      const go = $<HTMLButtonElement>('handoff-go');
      go.textContent = `我是${SIDE_NAMES[v]}玩家，继续`;
      go.onclick = () => { confirmed = v; box.hidden = true; };
      box.hidden = false;
    },
    onToggle(f) { toggled = f; },
    blocksUndo: (from, to) => on && viewer(from) !== viewer(to),
  };
}
