import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hexId, loadDeployment, loadMap, loadOob, stacks } from '../src/engine';
import { counterSvg, sidc } from '../src/client/counter-svg';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import oobData from '../data/units/south.oob.json';
import demo from '../data/scenarios/demo.deployment.json';

const map = loadMap({ def, hexes, hexsides, labels });
const oob = loadOob(oobData);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('战斗序列数据', () => {
  it('通过数据模式校验，单位都属于存在的编制', () => {
    expect(oob.units.size).toBeGreaterThan(0);
    for (const u of oob.units.values()) expect(oob.formations.has(u.formation), u.id).toBe(true);
  });

  it('未考据的数据都标为占位；标为有出处的都写了出处，且出处在史料登记表中', () => {
    const csv = readFileSync(fileURLToPath(new URL('../data/sources.csv', import.meta.url)), 'utf8');
    const ids = new Set(csv.split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean));
    for (const r of [...oob.formations.values(), ...oob.units.values()]) {
      if (r.confidence === 'sourced') expect(r.provenance.length, r.id).toBeGreaterThan(0);
      for (const p of r.provenance) expect(ids.has(p.source), `${r.id} ${p.source}`).toBe(true);
    }
  });

  it('错误数据会被拒绝：所属编制不存在', () => {
    const bad = clone(oobData);
    bad.units[0]!.formation = 'NO.SUCH';
    expect(() => loadOob(bad)).toThrow(/不存在/);
  });

  it('错误数据会被拒绝：未知兵种、重复 ID、军种与阵营不符', () => {
    const t = clone(oobData);
    (t.units[0] as { type: string }).type = 'cavalry-robot';
    expect(() => loadOob(t)).toThrow();
    const d = clone(oobData);
    d.units.push(d.units[0]!);
    expect(() => loadOob(d)).toThrow(/重复/);
    const b = clone(oobData);
    b.formations[0]!.branch = 'rkka';
    expect(() => loadOob(b)).toThrow(/军种/);
  });

  it('错误数据会被拒绝：标为有出处却没写出处', () => {
    const s = clone(oobData);
    s.units[0]!.confidence = 'sourced';
    expect(() => loadOob(s)).toThrow(/出处/);
  });
});

describe('部署与堆叠', () => {
  const { placed } = loadDeployment(oob, map.grid, demo);

  it('演示部署：每个单位都在地图内、只出现一次', () => {
    expect(placed.length).toBe(demo.placements.length);
    expect(new Set(placed.map((p) => p.unit.id)).size).toBe(placed.length);
  });

  it('同格单位组成堆叠，按列表顺序从下到上', () => {
    const s = stacks(placed);
    const order = demo.placements.filter((p) => p.hex === '2218').map((p) => p.unit);
    expect(s.get('2218')!.map((p) => p.unit.id)).toEqual(order);
    expect([...s.values()].reduce((n, x) => n + x.length, 0)).toBe(placed.length);
    for (const [k, units] of s) for (const u of units) expect(hexId(u.hex)).toBe(k);
  });

  it('不写步数 = 满编；写了就用当前步数', () => {
    for (const p of placed) {
      const raw = demo.placements.find((x) => x.unit === p.unit.id)!;
      expect(p.steps).toBe('steps' in raw ? raw.steps : p.unit.steps);
    }
  });

  it('错误部署会被拒绝：不存在的单位、重复部署、越界格子、步数超过满编', () => {
    const base = clone(demo);
    const first = base.placements[0]!;
    expect(() => loadDeployment(oob, map.grid, { ...base, placements: [{ unit: 'X', hex: '0101' }] })).toThrow(/不存在/);
    expect(() => loadDeployment(oob, map.grid, { ...base, placements: [first, first] })).toThrow(/两次/);
    expect(() => loadDeployment(oob, map.grid, { ...base, placements: [{ unit: first.unit, hex: '9999' }] })).toThrow(/不在地图内/);
    expect(() => loadDeployment(oob, map.grid, { ...base, placements: [{ unit: first.unit, hex: '0101', steps: 99 }] })).toThrow(/超过满编/);
  });
});

describe('算子', () => {
  it('兵种与规模生成正确的北约符号代码', () => {
    expect(sidc('armor', 'regiment')).toBe('SFGPUCA----G----');
    expect(sidc('infantry', 'division')).toBe('SFGPUCI----I----');
  });

  it('算子上的数字与数据一致（番号、编制简称、攻-防-移动、步数格）', () => {
    const { placed } = loadDeployment(oob, map.grid, demo);
    for (const p of placed) {
      const svg = counterSvg(p.unit, p.formation, { steps: p.steps });
      const r = p.unit.ratings;
      expect(svg, p.unit.id).toContain(`>${r.attack}-${r.defense}-${r.movement}</text>`);
      expect(svg, p.unit.id).toContain(`>${p.unit.designation}</text>`);
      expect(svg, p.unit.id).toContain(p.formation.abbr);
      // 步数格：剩余的实心、损失的空心
      expect(svg.match(/<rect x="88"/g)!.length, p.unit.id).toBe(p.unit.steps);
      expect(svg.match(/<rect x="88"[^>]*fill="none"/g)?.length ?? 0, p.unit.id).toBe(p.unit.steps - p.steps);
    }
  });

  it('占位数值用斜体（界面上灰色斜体），近卫编制带 Gds 标记', () => {
    const u = [...oob.units.values()].find((x) => oob.formations.get(x.formation)!.guards)!;
    const svg = counterSvg(u, oob.formations.get(u.formation)!);
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('Gds ');
  });
});
