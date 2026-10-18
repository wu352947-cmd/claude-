import { describe, expect, it } from 'vitest';
import {
  type Command, type GameContext, type GameState, SaveFile, actingSide, emptyHistory, extendsHistory, initialState, loadScenario, loadSave, makeSave, push,
  withFullSteps, loadMap, loadOob, RatingsParams, Sequence, MovementRules, CombatRules, TurnRules, type History,
} from '../src/engine';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import oobData from '../data/units/south.oob.json';
import s1raw from '../data/scenarios/s1.scenario.json';
import rawParams from '../data/rules/ratings.json';
import rawSeq from '../data/rules/sequence.json';
import rawMove from '../data/rules/movement.json';
import rawCombat from '../data/rules/combat.json';
import rawTurns from '../data/rules/turns.json';

const map = loadMap({ def, hexes, hexsides, labels });
const oob = loadOob(oobData, RatingsParams.parse(rawParams));
const sc = loadScenario(oob, map.grid, s1raw);
const ctx: GameContext = { map, oob, sequence: Sequence.parse(rawSeq), movement: MovementRules.parse(rawMove), combat: CombatRules.parse(rawCombat), turns: TurnRules.parse(rawTurns), scenario: sc };
const initialFor = (_id: string, seed: number): GameState => withFullSteps(ctx, initialState(sc.id, sc.first, seed, sc));
const end: Command = { type: 'EndPhase' };
const play = (h: History, seed: number, n: number): History => {
  const init = initialFor(sc.id, seed);
  for (let i = 0; i < n; i++) h = push(ctx, init, h, end);
  return h;
};

describe('异地对战：回合文件', () => {
  it('存档带"现在轮到谁"：德军阶段 → 德军，结束后进入苏军阶段 → 苏军；想定结束 → 无', () => {
    const init = initialFor(sc.id, 7);
    const h0 = emptyHistory();
    expect(makeSave(ctx, init, h0, 7, 't').note).toMatchObject({ turn: 1, to: 'DE', over: false });
    const h3 = play(h0, 7, 3); // 德军移动 → 战斗 → 发展 → 苏军移动
    expect(actingSide(ctx, initialFor(sc.id, 7))).toBe('DE');
    expect(makeSave(ctx, init, h3, 7, 't').note).toMatchObject({ turn: 1, to: 'SU' });
    let h = h0;
    for (let i = 0; i < 200; i++) { try { h = push(ctx, init, h, end); } catch { break; } }
    expect(makeSave(ctx, init, h, 7, 't').note).toMatchObject({ turn: 6, to: null, over: true });
  });

  it('两个人轮流：A 走完交文件，B 读入、接着走、再交回，A 读入后与 B 的状态一致', () => {
    const seed = 99;
    const init = initialFor(sc.id, seed);
    const a = play(emptyHistory(), seed, 3);
    const fileA = JSON.parse(JSON.stringify(makeSave(ctx, init, a, seed, 't')));
    const b = loadSave(ctx, fileA, initialFor);
    expect(extendsHistory([], b.history.commands)).toBe(true);
    const bMore = play(b.history, seed, 3);
    const fileB = JSON.parse(JSON.stringify(makeSave(ctx, init, bMore, seed, 't')));
    expect(SaveFile.parse(fileB).note!.to).toBe('DE');
    const a2 = loadSave(ctx, fileB, initialFor);
    expect(a2.history.commands.length).toBe(6);
    expect(extendsHistory(a.commands.slice(0, a.cursor), a2.history.commands)).toBe(true);
  });

  it('读入旧文件（比我现有进度短）或另一局的文件，被判定为不接续', () => {
    const seed = 5;
    const init = initialFor(sc.id, seed);
    const mine = play(emptyHistory(), seed, 4).commands;
    expect(extendsHistory(mine, mine.slice(0, 2))).toBe(false);
    const other: Command[] = [{ type: 'RollDie', sides: 6, purpose: '别的' }, ...mine.slice(1)];
    expect(extendsHistory(mine, other)).toBe(false);
    expect(extendsHistory(mine, mine)).toBe(true);
    expect(init.turn).toBe(1);
  });

  it('没有 note 的旧存档照样能读（向后兼容）', () => {
    const seed = 3;
    const init = initialFor(sc.id, seed);
    const save = JSON.parse(JSON.stringify(makeSave(ctx, init, play(emptyHistory(), seed, 2), seed, 't')));
    delete save.note;
    expect(() => loadSave(ctx, save, initialFor)).not.toThrow();
  });
});
