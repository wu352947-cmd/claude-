import { describe, expect, it } from 'vitest';
import {
  type Command, CommandError, type GameContext, type GameState, CombatRules, MovementRules, RatingsParams, Sequence, actingSide, apply, canRedo, canUndo,
  emptyHistory, initialState, loadDeployment, loadMap, loadOob, loadSave, makeSave, placedUnits, push, redo, replay, stateHash,
  undo, withFullSteps,
} from '../src/engine';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import oobData from '../data/units/south.oob.json';
import demo from '../data/scenarios/demo.deployment.json';
import rawParams from '../data/rules/ratings.json';
import rawSeq from '../data/rules/sequence.json';
import rawMove from '../data/rules/movement.json';
import rawCombat from '../data/rules/combat.json';

const map = loadMap({ def, hexes, hexsides, labels });
const oob = loadOob(oobData, RatingsParams.parse(rawParams));
const { deployment } = loadDeployment(oob, map.grid, demo);
const ctx: GameContext = { map, oob, sequence: Sequence.parse(rawSeq), movement: MovementRules.parse(rawMove), combat: CombatRules.parse(rawCombat) };
const start = (seed = 42): GameState => withFullSteps(ctx, initialState('demo', deployment.first, seed, deployment));
const s0 = start();
const U = s0.units[0]!.id;
const N = ctx.sequence.phases.length;

describe('指令与状态', () => {
  it('初始状态：第 1 回合第 1 阶段，所有单位满编、位置与部署一致', () => {
    expect(s0.turn).toBe(1);
    expect(s0.phase).toBe(0);
    expect(s0.units.length).toBe(deployment.placements.length);
    for (const u of s0.units) expect(u.steps).toBe(oob.units.get(u.id)!.steps);
    expect(placedUnits(ctx, s0).map((p) => p.unit.id)).toEqual(s0.units.map((u) => u.id));
  });

  it('非法指令被拒绝且不改变状态：单位不存在、非移动阶段移动', () => {
    const before = JSON.stringify(s0);
    expect(() => apply(ctx, s0, { type: 'Move', unit: 'nope', path: ['1010'] })).toThrow(CommandError);
    expect(() => apply(ctx, s0, { type: 'Move', unit: U, path: ['1010'] })).toThrow(/不能移动/);
    expect(JSON.stringify(s0)).toBe(before);
  });

  it('骰子只来自状态里的种子：同种子同结果，不同种子不同序列', () => {
    const roll = (s: GameState, n: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const r = apply(ctx, s, { type: 'RollDie', sides: 6, purpose: '测试' });
        s = r.state;
        out.push((r.events[0] as { value: number }).value);
      }
      return out;
    };
    expect(roll(start(7), 20)).toEqual(roll(start(7), 20));
    expect(roll(start(7), 20)).not.toEqual(roll(start(8), 20));
    expect(roll(start(7), 200).every((v) => v >= 1 && v <= 6)).toBe(true);
  });

  it('回合顺序：13 个阶段（docs/02 §1），最后一个阶段结束进入下一回合', () => {
    expect(N).toBe(13);
    expect(ctx.sequence.phases[0]!.id).toBe('strategic');
    expect(ctx.sequence.phases.at(-1)!.id).toBe('end');
    let s = s0;
    for (let i = 0; i < N - 1; i++) s = apply(ctx, s, { type: 'EndPhase' }).state;
    expect([s.turn, s.phase]).toEqual([1, N - 1]);
    const r = apply(ctx, s, { type: 'EndPhase' });
    expect([r.state.turn, r.state.phase]).toEqual([2, 0]);
    expect(r.events[0]).toEqual({ type: 'TurnStarted', turn: 2 });
  });

  it('行动方：主动方阶段归主动方，反应阶段归另一方，战略阶段双方', () => {
    const at = (id: string): GameState => ({ ...s0, phase: ctx.sequence.phases.findIndex((p) => p.id === id) });
    expect(s0.first).toBe('DE');
    expect(actingSide(ctx, at('strategic'))).toBeNull();
    expect(actingSide(ctx, at('first.movement'))).toBe('DE');
    expect(actingSide(ctx, at('first.reaction'))).toBe('SU');
    expect(actingSide(ctx, at('second.combat'))).toBe('SU');
    expect(actingSide(ctx, { ...at('first.movement'), first: 'SU' })).toBe('SU');
  });
});

describe('撤销、重做与存档', () => {
  const cmds: Command[] = [
    { type: 'EndPhase' },
    { type: 'RollDie', sides: 6, purpose: '测试' },
    { type: 'EndPhase' },
  ];
  const build = (cs: Command[]) => cs.reduce((h, c) => push(ctx, s0, h, c), emptyHistory());

  it('撤销回到上一步，重做恢复；撤销后下新指令会丢弃可重做的部分', () => {
    let h = build(cmds);
    const full = replay(ctx, s0, h).state;
    h = undo(h);
    expect(replay(ctx, s0, h).state.phase).toBe(1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(replay(ctx, s0, h).state).toEqual(full);
    h = push(ctx, s0, undo(undo(h)), { type: 'RollDie', sides: 10, purpose: '测试' });
    expect(h.commands.length).toBe(2);
    expect(canRedo(h)).toBe(false);
    expect(canUndo(emptyHistory())).toBe(false);
    expect(undo(emptyHistory())).toEqual(emptyHistory());
  });

  it('非法指令不会进入历史', () => {
    const h = build(cmds);
    expect(() => push(ctx, s0, h, { type: 'Move', unit: 'nope', path: ['1010'] })).toThrow(CommandError);
    expect(h.commands.length).toBe(3);
  });

  it('存档只含生效的指令；读档回放后结果与存档时完全一致（200 条随机指令）', () => {
    // 用固定种子的简单算法生成一串指令，模拟一局
    let x = 12345;
    const next = (n: number): number => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
    const all: Command[] = [];
    for (let i = 0; i < 200; i++) {
      const k = next(3);
      if (k === 0) { const u = s0.units[next(s0.units.length)]!; const h = Number(u.hex); all.push({ type: 'Move', unit: u.id, path: [String(h + 1).padStart(4, '0')] }); }
      else if (k === 1) all.push({ type: 'RollDie', sides: 6, purpose: '测试' });
      else all.push({ type: 'EndPhase' });
    }
    let h = emptyHistory();
    for (const c of all) { try { h = push(ctx, s0, h, c); } catch { /* 原地移动等非法指令跳过 */ } }
    h = undo(h);
    const final = replay(ctx, s0, h).state;
    const save = JSON.parse(JSON.stringify(makeSave(ctx, s0, h, 42, 'test'))) as unknown;
    const loaded = loadSave(ctx, save, (_s, seed) => start(seed));
    expect((save as { commands: unknown[] }).commands.length).toBe(h.cursor);
    expect(replay(ctx, loaded.initial, loaded.history).state).toEqual(final);
    expect(stateHash(replay(ctx, loaded.initial, loaded.history).state)).toBe(stateHash(final));
  });

  it('读档时发现回放结果不一致、文件格式不对，都会报错', () => {
    const save = makeSave(ctx, s0, build(cmds), 42, 'test');
    expect(() => loadSave(ctx, { ...save, seed: 43 }, (_s, seed) => start(seed))).toThrow(/不一致/);
    expect(() => loadSave(ctx, { hello: 1 }, (_s, seed) => start(seed))).toThrow(/不是有效的存档/);
    expect(() => loadSave(ctx, { ...save, commands: [{ type: 'Move', unit: 'nope', path: ['1010'] }] }, (_s, seed) => start(seed))).toThrow(/第 1 条/);
  });

  it('状态指纹与键的顺序无关，状态不同则指纹不同', () => {
    const a = { ...s0 };
    const b = Object.fromEntries(Object.entries(s0).reverse()) as unknown as GameState;
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(apply(ctx, s0, { type: 'EndPhase' }).state)).not.toBe(stateHash(s0));
  });
});
