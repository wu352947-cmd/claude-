/**
 * 对局面板：回合与阶段、结束阶段、撤销/重做、测试骰、存档/读档、事件记录。
 * 所有改变都通过引擎的指令完成；界面只保存指令历史，状态随时由回放得到。
 * 当前对局自动存在本机浏览器里（只是方便，丢了也能从存档文件恢复）。
 */
import {
  type Command, CommandError, type GameContext, type GameEvent, type GameState, type History, SIDE_NAMES, actingSide, canRedo, canUndo,
  emptyHistory, loadSave, makeSave, push, redo, replay, stateHash, undo,
} from '../engine';

const AUTOSAVE_KEY = 'kursk-1943-autosave';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface GameUi {
  state(): GameState;
  /** 下达指令；非法时提示并返回 false */
  dispatch(cmd: Command): boolean;
}

/** 新对局的种子：界面层可以用浏览器随机数（引擎里不行） */
const newSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

export function createGameUi(
  ctx: GameContext, initialFor: (scenario: string, seed: number) => GameState, scenario: string,
  engineVersion: string, onChange: (s: GameState) => void, toast: (msg: string) => void,
): GameUi {
  let seed = newSeed();
  let initial = initialFor(scenario, seed);
  let history: History = emptyHistory();
  let cur = replay(ctx, initial, history);

  // 恢复上次的对局（读不到或数据已变就开新局）
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) ({ initial, history, seed } = loadSave(ctx, JSON.parse(raw), initialFor));
  } catch (e) {
    console.warn('自动存档无法恢复，开始新对局', e);
  }

  const unitName = (id: string): string => ctx.oob.units.get(id)?.names.zh ?? id;
  const describe = (e: GameEvent): string => {
    switch (e.type) {
      case 'UnitMoved': return `${unitName(e.unit)}：${e.from} → ${e.path.at(-1)}（${e.path.length} 格，移动力 ${e.cost}）`;
      case 'DieRolled': return `${e.purpose}骰 d${e.sides} = ${e.value}`;
      case 'PhaseChanged': return `进入${ctx.sequence.phases[e.phase]!.name}`;
      case 'TurnStarted': return `—— 第 ${e.turn} 回合 ——`;
      case 'CombatResolved': return `进攻 ${e.hex}：${e.odds}${e.shift ? `（列偏移 ${e.shift > 0 ? '+' : ''}${e.shift}）` : ''}，掷 ${e.dice[0]}+${e.dice[1]}${e.drm ? `${e.drm > 0 ? '+' : ''}${e.drm}` : ''} → ${e.result}`;
      case 'StepsLost': return `${unitName(e.unit)} 损失 ${e.steps} 步${e.damagedPool ? '（进入受损池）' : ''}`;
      case 'UnitEliminated': return `${unitName(e.unit)} 被消灭`;
      case 'Retreated': return `${e.units.map(unitName).join('、')} 撤退到 ${e.path.at(-1)}`;
      case 'RetreatLoss': return `${e.reason}：每个单位再损失 ${e.steps} 步`;
      case 'Advanced': return `${e.units.map(unitName).join('、')} 推进到 ${e.to}`;
    }
  };

  function render(): void {
    cur = replay(ctx, initial, history);
    const s = cur.state;
    const ph = ctx.sequence.phases[s.phase]!;
    const side = actingSide(ctx, s);
    $('g-phase').innerHTML = `第 ${s.turn} 回合 · ${esc(ph.name)}<small>${side ? `${SIDE_NAMES[side]}行动` : '双方'}</small>`;
    $<HTMLButtonElement>('g-undo').disabled = !canUndo(history);
    $<HTMLButtonElement>('g-redo').disabled = !canRedo(history);
    const lines = cur.events.flatMap((evs, i) => evs.map((e) => `<li${i === cur.events.length - 1 ? ' class="new"' : ''}>${esc(describe(e))}</li>`));
    $('g-log').innerHTML = lines.length ? lines.slice(-60).reverse().join('') : '<li class="muted">还没有行动</li>';
    const pool = (side: 'DE' | 'SU'): number => s.damaged.filter((d) => ctx.oob.formations.get(d.formation)?.side === side).reduce((n, d) => n + d.steps, 0);
    $('g-meta').textContent = `受损池（装甲步数，回合末分流以后做）：德 ${pool('DE')} · 苏 ${pool('SU')} · 已消灭 ${s.eliminated.length} 个单位 · 种子 ${seed} · 指令 ${history.cursor} 条 · 指纹 ${stateHash(s)}`;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(makeSave(ctx, initial, history, seed, engineVersion))); } catch { /* 隐私模式等 */ }
    onChange(s);
  }

  function dispatch(cmd: Command): boolean {
    try {
      history = push(ctx, initial, history, cmd);
    } catch (e) {
      if (e instanceof CommandError) { toast(e.message); return false; }
      throw e;
    }
    render();
    return true;
  }

  $('g-end').onclick = () => dispatch({ type: 'EndPhase' });
  $('g-undo').onclick = () => { history = undo(history); render(); };
  $('g-redo').onclick = () => { history = redo(history); render(); };
  $('g-roll').onclick = () => dispatch({ type: 'RollDie', sides: 6, purpose: '测试' });
  $('g-more').onclick = () => $('game').classList.toggle('open');
  $('g-new').onclick = () => {
    if (!confirm('开始新对局？当前对局的指令会清空（可先存档）。')) return;
    seed = newSeed(); initial = initialFor(scenario, seed); history = emptyHistory(); render();
  };
  $('g-save').onclick = () => {
    const save = makeSave(ctx, initial, history, seed, engineVersion);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' }));
    a.download = `kursk-存档-第${cur.state.turn}回合.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const file = $<HTMLInputElement>('g-file');
  $('g-load').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      ({ initial, history, seed } = loadSave(ctx, JSON.parse(await f.text()), initialFor));
      render();
      toast(`已读档：回放 ${history.cursor} 条指令，结果与存档一致（指纹 ${stateHash(cur.state)}）`);
    } catch (e) {
      toast(`读档失败：${(e as Error).message}`);
    }
  };
  // 键盘：Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做（编辑地图时由编辑器处理）
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || $('game').hidden || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { history = undo(history); render(); e.preventDefault(); }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { history = redo(history); render(); e.preventDefault(); }
  });

  render();
  return { state: () => cur.state, dispatch };
}
