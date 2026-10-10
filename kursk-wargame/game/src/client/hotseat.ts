/**
 * 一台设备上的对战方式（docs/11 §6、docs/13）：
 * - 热座：两人轮流用同一台设备，行动方换人时整屏遮住，等下一位玩家点"继续"；
 * - 异地对战：每人用自己的设备，只能操作自己那一方；轮到对手时遮屏，只留"导出回合文件""读入对手的文件"；
 * - 上帝视角：一个人测试用，什么都看得见。
 * 迷雾：敌军单位只有贴近本方单位时才显示番号与实力（engine/turn-end.ts revealedEnemies），其余只显示"未侦察"。
 * 双方都行动的阶段由主动方操作。热座与异地对战时撤销不能退回对方的阶段。
 */
import { aiStyleNames, defaultAiStyle } from './ai';
import { type GameContext, type GameState, SIDE_NAMES, type Side, actingSide, revealedEnemies, sideOfUnit, turnInfo, turnLabel } from '../engine';

const KEY = 'kursk-1943-hotseat';
const SIDE_KEY = 'kursk-1943-myside';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export type Mode = 'hotseat' | 'pbem' | 'ai' | 'off';
export interface Fog {
  viewer: Side;
  /** 看不清的敌军单位 */
  hidden: Set<string>;
}

export interface Hotseat {
  /** 当前视角的迷雾；上帝视角时为 null */
  fog(s: GameState): Fog | null;
  /** 状态变化后调用：换人时遮屏 */
  update(s: GameState): void;
  onToggle(f: () => void): void;
  /** 撤销不能退回对方的阶段（否则能看到对方的部署） */
  blocksUndo(from: GameState, to: GameState): boolean;
  /** 现在这台设备能不能下指令；不能返回原因 */
  whyCannotAct(s: GameState): string | null;
  /** 异地对战的遮屏按钮 */
  setActions(a: { exportFile(): void; importFile(): void }): void;
  mode(): Mode;
  /** 人机对战时电脑执哪一方（其他模式 null） */
  aiSide(): Side | null;
  /** 电脑的打法名 */
  aiStyle(): string;
}

export function createHotseat(ctx: GameContext): Hotseat {
  let mode: Mode = 'hotseat';
  let mine: Side = 'DE';
  try {
    const m = localStorage.getItem(KEY);
    mode = m === 'pbem' ? 'pbem' : m === 'ai' ? 'ai' : m === 'off' ? 'off' : 'hotseat';
    mine = localStorage.getItem(SIDE_KEY) === 'SU' ? 'SU' : 'DE';
  } catch { /* 隐私模式 */ }
  /** 热座遮屏后已确认的玩家（刚打开页面时谁都没确认，先遮屏） */
  let confirmed: Side | null = null;
  let toggled = (): void => {};
  let actions = { exportFile: (): void => {}, importFile: (): void => {} };
  const acting = (s: GameState): Side => actingSide(ctx, s) ?? s.first;
  const bot = (): Side => (mine === 'DE' ? 'SU' : 'DE');
  const viewer = (s: GameState): Side => (mode === 'pbem' || mode === 'ai' ? mine : acting(s));
  let style = '';
  const styleSel = $<HTMLSelectElement>('g-style');
  const styleOf = (): string => {
    if (style) return style;
    try { style = localStorage.getItem(`kursk-1943-aistyle-${bot()}`) ?? ''; } catch { /* 隐私模式 */ }
    return style = aiStyleNames(bot()).includes(style) ? style : defaultAiStyle(bot());
  };
  const box = $('handoff');
  const modeSel = $<HTMLSelectElement>('g-mode');
  const sideSel = $<HTMLSelectElement>('g-side');
  const save = (): void => { try { localStorage.setItem(KEY, mode); localStorage.setItem(SIDE_KEY, mine); } catch { /* 隐私模式 */ } };
  const sync = (): void => {
    modeSel.value = mode; sideSel.value = mine; sideSel.hidden = mode !== 'pbem' && mode !== 'ai';
    styleSel.hidden = mode !== 'ai';
    style = '';
    styleSel.innerHTML = aiStyleNames(bot()).map((n) => `<option${n === styleOf() ? ' selected' : ''}>${n}</option>`).join('');
  };
  styleSel.onchange = () => { style = styleSel.value; try { localStorage.setItem(`kursk-1943-aistyle-${bot()}`, style); } catch { /* 隐私模式 */ } toggled(); };
  sync();
  modeSel.onchange = () => { mode = modeSel.value as Mode; confirmed = null; sync(); save(); toggled(); };
  sideSel.onchange = () => { mine = sideSel.value as Side; confirmed = null; save(); toggled(); };
  $('handoff-export').onclick = () => actions.exportFile();
  $('handoff-import').onclick = () => actions.importFile();

  return {
    fog(s) {
      if (mode === 'off') return null;
      const v = viewer(s);
      const seen = revealedEnemies(ctx, s, v);
      return { viewer: v, hidden: new Set(s.units.filter((u) => sideOfUnit(ctx, u.id) !== v && !seen.has(u.id)).map((u) => u.id)) };
    },
    update(s) {
      const ph = ctx.sequence.phases[s.phase]!;
      const where = `第 ${s.turn} 回合 · ${turnLabel(turnInfo(ctx, s))} · ${ph.name}`;
      const go = $<HTMLButtonElement>('handoff-go');
      const pbemBtns = $('handoff-pbem');
      if (mode === 'pbem') {
        pbemBtns.hidden = false;
        const turnMine = s.over || acting(s) === mine;
        if (turnMine) { box.hidden = true; return; }
        $('handoff-text').innerHTML = `现在是<b>${SIDE_NAMES[acting(s)]}</b>行动<small>${where}</small><small>把"导出回合文件"发给对手；对手走完发回来后，点"读入对手的文件"</small>`;
        go.hidden = true;
        box.hidden = false;
        return;
      }
      pbemBtns.hidden = true;
      go.hidden = false;
      if (mode === 'ai') { box.hidden = true; return; }
      const v = acting(s);
      if (mode === 'off' || confirmed === v) { box.hidden = true; return; }
      $('handoff-text').innerHTML = `请把设备交给<b>${SIDE_NAMES[v]}</b>玩家<small>${where}</small>`;
      go.textContent = `我是${SIDE_NAMES[v]}玩家，继续`;
      go.onclick = () => { confirmed = v; box.hidden = true; };
      box.hidden = false;
    },
    onToggle(f) { toggled = f; },
    blocksUndo: (from, to) => mode !== 'off' && acting(from) !== acting(to),
    whyCannotAct: (s) => (mode === 'pbem' && !s.over && acting(s) !== mine ? `现在是${SIDE_NAMES[acting(s)]}行动，你是${SIDE_NAMES[mine]}`
      : mode === 'ai' && !s.over && acting(s) !== mine ? '电脑正在行动，请稍等' : null),
    aiSide: () => (mode === 'ai' ? bot() : null),
    aiStyle: styleOf,
    setActions(a) { actions = a; },
    mode: () => mode,
  };
}
