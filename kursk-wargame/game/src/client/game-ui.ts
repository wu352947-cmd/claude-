/**
 * 对局面板：回合与阶段、结束阶段、撤销/重做、测试骰、存档/读档、事件记录。
 * 所有改变都通过引擎的指令完成；界面只保存指令历史，状态随时由回放得到。
 * 当前对局自动存在本机浏览器里（只是方便，丢了也能从存档文件恢复）。
 * 热座时，记录里看不清的敌军单位不写番号，敌军的受损池与修理也不显示。
 */
import {
  AXIS_NAMES, CONTROL_NAMES, extendsHistory, type Command, CommandError, type GameContext, type GameEvent, type GameState, type History, SIDE_NAMES, type Side, actingSide,
  canRedo, canUndo, emptyHistory, historyReport, loadSave, makeSave, push, redo, replay, score, sideOfUnit, stateHash, turnInfo, turnLabel, undo,
} from '../engine';
import type { Fog, Hotseat } from './hotseat';
import { setShowSources, showSources } from './prefs';

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
  engineVersion: string, onChange: (s: GameState) => void, toast: (msg: string) => void, hotseat: Hotseat,
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

  let fog: Fog | null = null;
  const enemy = (id: string): boolean => !!fog && sideOfUnit(ctx, id) !== fog.viewer;
  const unitName = (id: string): string => (fog?.hidden.has(id) ? '敌军单位（未侦察）' : ctx.oob.units.get(id)?.names.zh ?? id);
  /** 返回 null = 热座时不给这一方看 */
  const describe = (e: GameEvent): string | null => {
    switch (e.type) {
      case 'UnitMoved': return fog?.hidden.has(e.unit) ? `敌军单位移动到 ${e.path.at(-1)}` : `${unitName(e.unit)}：${e.from} → ${e.path.at(-1)}（${e.path.length} 格，移动力 ${e.cost}）`;
      case 'DieRolled': return `${e.purpose}骰 d${e.sides} = ${e.value}`;
      case 'PhaseChanged': return `进入${ctx.sequence.phases[e.phase]!.name}`;
      case 'TurnStarted': return `—— 第 ${e.turn} 回合 ——`;
      case 'CombatResolved': return `进攻 ${e.hex}：${e.odds}${e.shift ? `（列偏移 ${e.shift > 0 ? '+' : ''}${e.shift}）` : ''}，掷 ${e.dice[0]}+${e.dice[1]}${e.drm ? `${e.drm > 0 ? '+' : ''}${e.drm}` : ''} → ${e.result}`;
      case 'StepsLost': return `${unitName(e.unit)} 损失 ${e.steps} 步${e.damagedPool ? '（进入受损池）' : ''}`;
      case 'UnitEliminated': return `${unitName(e.unit)} 被消灭`;
      case 'Retreated': return `${e.units.map(unitName).join('、')} 撤退到 ${e.path.at(-1)}`;
      case 'RetreatLoss': return `${e.reason}：每个单位再损失 ${e.steps} 步`;
      case 'Advanced': return `${e.units.map(unitName).join('、')} 推进到 ${e.to}`;
      case 'TurnEnded': return `回合末：受损池分流、修理`;
      case 'DamagedSorted': return enemy(e.unit) ? null
        : `${unitName(e.unit)} 受损 ${e.rolls.length} 步（${e.hex} ${CONTROL_NAMES[e.control]}，掷 ${e.rolls.join('、')}，≤${e.need} 送修）：送修 ${e.repaired}，完全损失 ${e.destroyed}`;
      case 'Repaired': return enemy(e.unit) ? null : `${unitName(e.unit)} 修复 ${e.steps} 步归队`;
      case 'Reinforced': return `增援：${unitName(e.unit)} 到达 ${e.hex}`;
      case 'Planned': return fog && fog.viewer !== e.side ? null : `作战计划：${AXIS_NAMES[e.kind]}轴线 ${e.id}`;
      case 'Unplanned': return fog && fog.viewer !== e.side ? null : `撤销作战计划 ${e.id}`;
      case 'Assigned': {
        const nm = (f: string | null): string => (f ? ctx.oob.formations.get(f)?.names.zh ?? f : '直属');
        return `调整隶属：${nm(e.formation)} → ${nm(e.to)}`;
      }
      case 'GameOver': return `—— 想定结束（第 ${e.turn} 回合）——`;
    }
  };

  function render(): void {
    cur = replay(ctx, initial, history);
    const s = cur.state;
    fog = hotseat.fog(s);
    const ph = ctx.sequence.phases[s.phase]!;
    const side = actingSide(ctx, s);
    const t = turnInfo(ctx, s);
    const total = ctx.scenario?.turns;
    $('g-phase').innerHTML = `${s.over ? '<span class="night">已结束</span> ' : ''}第 ${s.turn}${total ? ` / ${total}` : ''} 回合 · ${esc(turnLabel(t))} · ${esc(ph.name)}<small>${side ? `${SIDE_NAMES[side]}行动` : '双方'}</small>`;
    $<HTMLButtonElement>('g-end').disabled = s.over || !!hotseat.whyCannotAct(s);
    const rep = s.over ? historyReport(ctx, s) : null;
    $('g-report').hidden = !rep;
    if (rep) {
      const who = (x: Side | 'contested'): string => (x === 'contested' ? '史料矛盾/易手' : SIDE_NAMES[x]);
      $('g-report').innerHTML = `<b>战后报告：与历史对比</b><small>历史结局：${esc(rep.date)} ${esc(rep.time)}</small>
        <table>${rep.rows.map((r) => `<tr class="${r.history === 'contested' ? 'ct' : r.same ? 'ok' : 'no'}"><td>${esc(r.name)}</td><td>历史：${who(r.history)}</td><td>本局：${SIDE_NAMES[r.game]}</td></tr>`).join('')}</table>
        <div>可比较的 ${rep.comparable} 处目标中，${rep.agree} 处与历史一致。</div>
        <div class="muted">装甲完全损失（步）：德 ${rep.lost.DE} · 苏 ${rep.lost.SU}；其他兵种损失（步）：德 ${rep.lostOther.DE} · 苏 ${rep.lostOther.SU}（游戏的"步"与历史坦克数不能直接相比）</div>
        ${showSources() ? `<details><summary>历史上的损失，各说法（口径不同）</summary><ul>${rep.losses.map((l) => `<li><b>${esc(l.label)}</b>：${esc(l.text)}${l.provenance[0] ? `<small>${esc(l.provenance[0].source)}</small>` : ''}</li>`).join('')}</ul></details>` : ''}`;
    }
    const sc = score(ctx, s);
    $('g-score').hidden = !sc;
    if (sc) {
      $('g-score').innerHTML = `德军得分 <b>${sc.total}</b>（目标 ${sc.objectiveVp}，损失交换 ${sc.lossVp > 0 ? '+' : ''}${sc.lossVp}）`
        + (sc.delta === null ? '<small>历史基准待校准</small>' : `<small>现在：${esc(sc.band!)}${showSources() ? `（历史基准 ${sc.total - sc.delta}）` : ''}</small>`);
    }
    $<HTMLButtonElement>('g-undo').disabled = !canUndo(history);
    $<HTMLButtonElement>('g-redo').disabled = !canRedo(history);
    const lines = cur.events.flatMap((evs, i) => evs.map(describe).filter((d) => d !== null)
      .map((d) => `<li${i === cur.events.length - 1 ? ' class="new"' : ''}>${esc(d)}</li>`));
    $('g-log').innerHTML = lines.length ? lines.slice(-60).reverse().join('') : '<li class="muted">还没有行动</li>';
    const sum = (xs: { unit: string; steps: number }[], side: Side): number => xs.filter((d) => sideOfUnit(ctx, d.unit) === side).reduce((n, d) => n + d.steps, 0);
    const armor = (side: Side): string => (fog && fog.viewer !== side ? `${SIDE_NAMES[side]}：完全损失 ${sum(s.destroyed, side)}`
      : `${SIDE_NAMES[side]}：受损池 ${sum(s.damaged, side)} · 修理中 ${sum(s.repair, side)} · 完全损失 ${sum(s.destroyed, side)}`);
    $('g-meta').textContent = `装甲步数——${armor('DE')}；${armor('SU')} · 已消灭 ${s.eliminated.length} 个单位 · 种子 ${seed} · 指令 ${history.cursor} 条 · 指纹 ${stateHash(s)}`;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(makeSave(ctx, initial, history, seed, engineVersion))); } catch { /* 隐私模式等 */ }
    onChange(s);
    hotseat.update(s);
  }

  function dispatch(cmd: Command): boolean {
    const no = hotseat.whyCannotAct(cur.state);
    if (no) { toast(no); return false; }
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
  const tryUndo = (): void => {
    const no = hotseat.whyCannotAct(cur.state);
    if (no) { toast(no); return; }
    const h = undo(history);
    if (hotseat.blocksUndo(cur.state, replay(ctx, initial, h).state)) { toast('热座：不能撤销到对方的阶段'); return; }
    history = h; render();
  };
  $('g-undo').onclick = tryUndo;
  const tryRedo = (): void => {
    const no = hotseat.whyCannotAct(cur.state);
    if (no) { toast(no); return; }
    history = redo(history); render();
  };
  $('g-redo').onclick = tryRedo;
  $('g-roll').onclick = () => dispatch({ type: 'RollDie', sides: 6, purpose: '测试' });
  const src = $<HTMLInputElement>('g-src');
  src.checked = showSources();
  src.onchange = () => { setShowSources(src.checked); render(); };
  $('g-more').onclick = () => $('game').classList.toggle('open');
  $('g-new').onclick = () => {
    if (!confirm('开始新对局？当前对局的指令会清空（可先存档）。')) return;
    seed = newSeed(); initial = initialFor(scenario, seed); history = emptyHistory(); render();
  };
  /** 下载存档；异地对战时文件名写明回合与"轮到谁"，就是发给对手的回合文件 */
  const exportFile = (): void => {
    const save = makeSave(ctx, initial, history, seed, engineVersion);
    const to = save.note?.to;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' }));
    // 文件名只用英文数字：有的浏览器会丢掉中文文件名
    a.download = hotseat.mode() === 'pbem' && to ? `kursk-turn${cur.state.turn}-to-${to}.json` : `kursk-save-turn${cur.state.turn}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('g-save').onclick = exportFile;
  const file = $<HTMLInputElement>('g-file');
  $('g-load').onclick = () => file.click();
  hotseat.setActions({ exportFile, importFile: () => file.click() });
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const loaded = loadSave(ctx, JSON.parse(await f.text()), initialFor);
      // 异地对战：只接受接在我现有进度之后的文件（防止读入旧文件让进度倒退，或另一局的文件）
      if (hotseat.mode() === 'pbem' && history.cursor > 0 && !(loaded.seed === seed && extendsHistory(history.commands.slice(0, history.cursor), loaded.history.commands))) {
        toast('这份文件不是接在你现有进度之后的（可能是旧文件，或另一局的文件），没有读入');
        return;
      }
      ({ initial, history, seed } = loaded);
      render();
      const to = cur.state.over ? null : actingSide(ctx, cur.state);
      toast(`已读入：回放 ${history.cursor} 条指令，结果与文件一致（指纹 ${stateHash(cur.state)}）${to ? `；现在轮到${SIDE_NAMES[to]}` : ''}`);
    } catch (e) {
      toast(`读档失败：${(e as Error).message}`);
    }
  };
  // 键盘：Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做（编辑地图时由编辑器处理）
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || $('game').hidden || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { tryUndo(); e.preventDefault(); }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { tryRedo(); e.preventDefault(); }
  });

  hotseat.onToggle(render);
  render();
  return { state: () => cur.state, dispatch };
}
