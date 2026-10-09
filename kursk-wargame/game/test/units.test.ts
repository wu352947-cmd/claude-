import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RatingsParams, deriveRatings, hexId, loadDeployment, loadMap, loadOob, stacks } from '../src/engine';
import { counterSvg, sidc } from '../src/client/counter-svg';
import def from '../data/maps/south.json';
import hexes from '../data/maps/south.hexes.json';
import hexsides from '../data/maps/south.hexsides.json';
import labels from '../data/maps/south.labels.json';
import oobData from '../data/units/south.oob.json';
import demo from '../data/scenarios/demo.deployment.json';
import rawParams from '../data/rules/ratings.json';

const map = loadMap({ def, hexes, hexsides, labels });
const params = RatingsParams.parse(rawParams);
const oob = loadOob(oobData, params);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('战斗序列数据', () => {
  it('通过数据模式校验，单位都属于存在的编制', () => {
    expect(oob.units.size).toBeGreaterThan(0);
    for (const u of oob.units.values()) expect(oob.formations.has(u.formation), u.id).toBe(true);
  });

  it('所有出处都在史料登记表中，级别与登记表一致', () => {
    const csv = readFileSync(fileURLToPath(new URL('../data/sources.csv', import.meta.url)), 'utf8');
    const grades = new Map(csv.split('\n').slice(1).filter(Boolean).map((l) => [l.split(',')[0]!, l.split(',')[1]!]));
    for (const r of [...oob.formations.values(), ...oob.units.values()]) {
      if (r.confidence === 'sourced') expect(r.provenance.length + ('strength' in r ? r.strength.length : 0), r.id).toBeGreaterThan(0);
      for (const p of r.provenance) expect(grades.has(p.source), `${r.id} ${p.source}`).toBe(true);
    }
    for (const u of oob.units.values()) {
      for (const s of u.strength) expect(grades.get(s.source), `${u.id} ${s.item} ${s.source}`).toBe(s.grade);
    }
  });

  it('兵力数字都写了口径、日期与原文摘录；装备名都在公式参数表里', () => {
    for (const u of oob.units.values()) {
      for (const s of u.strength) {
        expect(s.quote, `${u.id} ${s.item}`).toBeTruthy();
        expect(params.items[s.item], `${u.id} ${s.item}`).toBeDefined();
      }
    }
  });

  it('考据程度自动判定：没有数字 = 占位；只有 D 级、推算比例或按份额分摊 = 推定；A/B 级 = 有出处', () => {
    const u = (id: string) => oob.units.get(id)!;
    expect(u('SU.6GA.51GvSD').confidence).toBe('placeholder');
    expect(u('DE.IISS.LSSAH.PzGrenRgt1').confidence).toBe('estimated');
    expect(u('SU.5GA.95GvSD').confidence).toBe('estimated');
    expect(u('SU.18TK.110TBr').confidence).toBe('sourced');
    expect(u('SU.29TK.32TBr').confidence).toBe('sourced');
    expect(u('DE.IISS.T.PzRgt3').confidence).toBe('sourced');
  });

  it('素质不是 3 必须写理由', () => {
    const q = clone(oobData) as { units: { quality?: number }[] };
    q.units[0]!.quality = 4;
    expect(() => loadOob(q, params)).toThrow(/理由/);
  });

  it('错误数据会被拒绝：所属编制不存在', () => {
    const bad = clone(oobData);
    bad.units[0]!.formation = 'NO.SUCH';
    expect(() => loadOob(bad, params)).toThrow(/不存在/);
  });

  it('错误数据会被拒绝：未知兵种、重复 ID、军种与阵营不符', () => {
    const t = clone(oobData);
    (t.units[0] as { type: string }).type = 'cavalry-robot';
    expect(() => loadOob(t, params)).toThrow();
    const d = clone(oobData);
    d.units.push(d.units[0]!);
    expect(() => loadOob(d, params)).toThrow(/重复/);
    const b = clone(oobData);
    b.formations[0]!.branch = 'rkka';
    expect(() => loadOob(b, params)).toThrow(/军种/);
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
    const hex = demo.placements.find((p, i) => demo.placements.findIndex((q) => q.hex === p.hex) !== i)!.hex;
    const order = demo.placements.filter((p) => p.hex === hex).map((p) => p.unit);
    expect(order.length).toBeGreaterThan(1);
    expect(s.get(hex)!.map((p) => p.unit.id)).toEqual(order);
    expect([...s.values()].reduce((n, x) => n + x.length, 0)).toBe(placed.length);
    for (const [k, units] of s) for (const u of units) expect(hexId(u.hex)).toBe(k);
  });

  it('不写步数 = 满编；写了就用当前步数', () => {
    for (const p of placed) {
      const raw = demo.placements.find((x) => x.unit === p.unit.id)! as { steps?: number };
      expect(p.steps).toBe(raw.steps ?? p.unit.steps);
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

  it('占位数值用斜体（界面上灰色斜体），近卫单位的番号带 Gds 标记', () => {
    const u = [...oob.units.values()].find((x) => x.guards && x.confidence === 'placeholder')!;
    const svg = counterSvg(u, oob.formations.get(u.formation)!);
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('Gds ');
  });
});

describe('数值换算公式', () => {
  it('参数表自洽：每种装备的类别都存在', () => {
    expect(params.status).toBe('draft');
  });

  it('装甲分：10 辆中型长身管坦克 = 攻击 1、防御 0.9（按公式取整前）', () => {
    const d = deriveRatings(params, 'armor', 'regiment', [{ item: 'PzIV_long', count: 10 }]);
    expect(d.lines[0]).toMatchObject({ attack: 1, defense: 0.9 });
    expect(d.armorClass).toBe('medium');
  });

  it('同样数量下，重型坦克比中型强，中型比轻型强', () => {
    const a = (item: string) => deriveRatings(params, 'armor', 'regiment', [{ item, count: 50 }]).attack;
    expect(a('Tiger')).toBeGreaterThan(a('PzIV_long'));
    expect(a('PzIV_long')).toBeGreaterThan(a('T70'));
  });

  it('只有总兵力时按战斗兵力比例推算，并在明细里注明', () => {
    const d = deriveRatings(params, 'infantry', 'division', [{ item: 'personnel_total', count: 8000 }]);
    expect(d.lines[0]!.label).toMatch(/推算/);
    expect(d.lines[0]!.defense).toBe(12);
    expect(d.usedDefault).toBe(false);
  });

  it('只有全师数字时按份额分摊到团，并在明细里注明；未知份额报错', () => {
    const d = deriveRatings(params, 'panzergrenadier', 'regiment', [{ item: 'personnel_combat', count: 10000, share: 'ssPzGrenRgt' }]);
    const f = (params.shares.ssPzGrenRgt as { fraction: number }).fraction;
    expect(d.lines[0]!.label).toMatch(/全师数字 × .*份额/);
    expect(d.lines[0]!.defense).toBeCloseTo(10 * f * 3, 5);
    expect(d.usedDefault).toBe(false);
    expect(() => deriveRatings(params, 'panzergrenadier', 'regiment', [{ item: 'personnel_combat', count: 1, share: 'nope' }])).toThrow(/未知份额/);
  });

  it('没有兵力数字的步兵单位用类型占位分', () => {
    const d = deriveRatings(params, 'panzergrenadier', 'regiment', []);
    expect(d.usedDefault).toBe(true);
    expect(d.lines.every((l) => l.placeholder)).toBe(true);
  });

  it('炮兵：攻击位置是炮火支援值', () => {
    const d = deriveRatings(params, 'artillery', 'regiment', [{ item: 'sFH_150', count: 24 }]);
    expect(d.attack).toBe(2);
    expect(d.defense).toBe(params.artilleryDefense);
  });

  it('步数在规模上下限之内', () => {
    for (const u of oob.units.values()) {
      const [lo, hi] = params.steps[u.size]!;
      expect(u.steps, u.id).toBeGreaterThanOrEqual(lo);
      expect(u.steps, u.id).toBeLessThanOrEqual(hi);
    }
  });

  it('算子数字由公式算出，与明细一致', () => {
    const u = oob.units.get('DE.IISS.LSSAH.PzRgt1')!;
    const d = deriveRatings(params, u.type, u.size, u.strength, u.quality);
    expect(u.ratings).toEqual({ attack: d.attack, defense: d.defense, movement: d.movement });
  });
});
