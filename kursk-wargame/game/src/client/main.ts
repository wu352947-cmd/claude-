import { Application } from 'pixi.js';
import {
  CONFIDENCE_NAMES, ENGINE_VERSION, GameMeta, SIDE_NAMES, SIDE_FEATURE_NAMES, STATUS_NAMES, TERRAIN_NAMES, type Direction, type Offset,
  CombatRules, TurnRules, isSupplied, loadScenario, type GameContext, MovementRules, type Reach, RatingsParams, Sequence, actingSide, movementAllowance, reachable, planGroupMove, whyCannotMove, formatDM, hexAt, hexCenter, hexId, hexRecord, inBounds, initialState, linksBetween,
  loadDeployment, loadMap, loadOob, neighbor, placedUnits, sideFeatures, stacks, toLatLon, withFullSteps,
} from '../engine';
import rawMeta from '../../data/game.json';
import def from '../../data/maps/south.json';
import hexes from '../../data/maps/south.hexes.json';
import hexsides from '../../data/maps/south.hexsides.json';
import labels from '../../data/maps/south.labels.json';
import lines from '../../data/maps/south.lines.json';
import oobData from '../../data/units/south.oob.json';
import ratingsParams from '../../data/rules/ratings.json';
import demoDeployment from '../../data/scenarios/demo.deployment.json';
import s1Scenario from '../../data/scenarios/s1.scenario.json';
import sequence from '../../data/rules/sequence.json';
import movementRules from '../../data/rules/movement.json';
import combatRules from '../../data/rules/combat.json';
import turnRules from '../../data/rules/turns.json';
import { attachCamera } from './camera';
import { createEditor } from './editor';
import { type GameUi, createGameUi } from './game-ui';
import { createMapView } from './map-view';
import { MAP_FONTS, PX_PER_KM } from './style';
import { unitSectionHtml } from './unit-panel';
import { showSources } from './prefs';
import { type OrgPanel, setupOrg } from './org-panel';
import { type PlanPanel, setupPlan } from './plan-panel';
import { createPlanView } from './plan-view';
import { createUnitsView } from './units-view';
import { createReachView } from './reach-view';
import { advanceSectionHtml, combatSectionHtml } from './combat-panel';
import { type Fog, createHotseat } from './hotseat';
import { createObjectivesView } from './objectives-view';
import { setupHowto } from './howto';

const meta = GameMeta.parse(rawMeta);
const baseMap = loadMap({ def, hexes, hexsides, labels, lines });
/** 当前显示的地图 = 数据文件 + 编辑器里的修改 */
let map = baseMap;
const oob = loadOob(oobData, RatingsParams.parse(ratingsParams));
/** 可选的想定（新对局时选；记在本机浏览器里） */
const SCENARIOS = [demoDeployment, s1Scenario].map((raw) => { loadDeployment(oob, baseMap.grid, raw); return loadScenario(oob, baseMap.grid, raw); });
const SCN_KEY = 'kursk-1943-scenario';
const deployment = (() => {
  let want: string | null = null;
  try { want = localStorage.getItem(SCN_KEY); } catch { /* 隐私模式 */ }
  return SCENARIOS.find((x) => x.id === want) ?? SCENARIOS.at(-1)!;
})();
// 规则用数据文件里的地图（编辑器里未合并的修改不影响对局，保证存档可回放）
const ctx: GameContext = { map: baseMap, oob, sequence: Sequence.parse(sequence), movement: MovementRules.parse(movementRules), combat: CombatRules.parse(combatRules), turns: TurnRules.parse(turnRules), scenario: deployment };
/** 想定 + 种子 → 初始状态（目前只有演示摆放） */
const initialFor = (scenario: string, seed: number) => {
  if (scenario !== deployment.id) throw new Error(`没有想定 ${scenario}`);
  return withFullSteps(ctx, initialState(scenario, deployment.first, seed, deployment));
};
/** 当前对局各格的堆叠（由对局状态算出） */
let stackMap = new Map<string, ReturnType<typeof placedUnits>>();
/** 信息面板里选中的单位 */
let selectedUnit: string | null = null;
/** 进攻时勾选的单位（换格子就重置为全选） */
let attackPick: { hex: string; units: Set<string> } | null = null;
/** 选中单位现在能到达的格子（不能移动时为 null） */
let reach: Map<string, Reach> | null = null;
/** 热座迷雾（关掉热座时为 null） */
let fog: Fog | null = null;
/** 这一格全是看不清的敌军 */
const veiled = (hex: string): boolean => (stackMap.get(hex) ?? []).some((p) => fog?.hidden.has(p.unit.id));
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const DIR_NAMES = ['北', '东北', '东南', '南', '西南', '西北'];
let toastTimer = 0;
const toast = (msg: string): void => {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
};
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function showInfo(h: Offset | null): void {
  const box = $('info');
  if (!h) { box.hidden = true; return; }
  const rec = hexRecord(map, h);
  const ll = toLatLon(map.projection, hexCenter(map.grid, h));
  const dirs = [0, 1, 2, 3, 4, 5] as Direction[];
  const sides = dirs
    .map((d) => ({ d, f: sideFeatures(map, h, d) }))
    .filter((x) => x.f.length)
    .map((x) => `${DIR_NAMES[x.d]}：${x.f.map((f) => SIDE_FEATURE_NAMES[f]).join('、')}`);
  const LINK_NAMES = { road: '公路', track: '小路', railway: '铁路', river: '', stream: '' } as const;
  const links = dirs
    .map((d) => ({ d, k: linksBetween(map, h, neighbor(h, d)) }))
    .filter((x) => x.k.length)
    .map((x) => `${DIR_NAMES[x.d]}：${x.k.map((k) => LINK_NAMES[k]).join('、')}`);
  const isDefault = !map.hexes.has(hexId(h));
  box.innerHTML = `
    <div class="info-head"><span class="hexno">${hexId(h)}</span><button id="info-close" aria-label="关闭">×</button></div>
    <dl>
      <dt>地形</dt><dd>${TERRAIN_NAMES[rec.terrain]}${isDefault ? '<span class="muted">（未录入，默认）</span>' : ''}</dd>
      ${isDefault || !(editor.active || showSources()) ? '' : `<dt>状态</dt><dd class="st-${rec.status}">${STATUS_NAMES[rec.status]}</dd>`}
      ${!editor.active && showSources() && rec.note ? `<dt>备注</dt><dd>${esc(rec.note)}</dd>` : ''}
      <dt>格边</dt><dd>${sides.length ? sides.join('<br>') : '<span class="muted">无</span>'}</dd>
      <dt>道路</dt><dd>${links.length ? links.join('<br>') : '<span class="muted">无</span>'}</dd>
      ${editor.active || showSources() ? `<dt>中心</dt><dd>${formatDM(ll.lat, 'N', 'S')} ${formatDM(ll.lon, 'E', 'W')}</dd>` : ''}
      ${(editor.active || showSources()) && rec.sources.length ? `<dt>出处</dt><dd>${rec.sources.join('、')}</dd>` : ''}
    </dl>
    ${editor.active || !game ? '' : objectiveHtml(hexId(h))}
    ${editor.active || !game ? '' : advanceSectionHtml(ctx, game.state(), hexId(h)) + combatSectionHtml(ctx, game.state(), hexId(h), attackPick?.hex === hexId(h) ? attackPick.units : null, game.draftOf(hexId(h)), game.draftHexes())}
    ${editor.active ? '' : veiled(hexId(h)) ? '<div class="units-head">部队</div><div class="muted">敌军部队（未侦察：本方单位贴近后才能看到番号与实力）</div>'
      : unitSectionHtml(stackMap.get(hexId(h)) ?? [], selectedUnit, moveNote()) + (showSources() ? startNote(selectedUnit) : '') + fatigueNote(selectedUnit)}
    ${editor.active ? `<textarea id="info-note" placeholder="备注（例如：对照图上此处有冲沟）">${esc(rec.note ?? '')}</textarea>
      <button class="note-save" id="info-note-save">保存备注</button>` : ''}`;
  box.hidden = false;
  const save = document.getElementById('info-note-save');
  if (save) save.onclick = () => { editor.note(h, $<HTMLTextAreaElement>('info-note').value); showInfo(h); };
  for (const b of box.querySelectorAll<HTMLButtonElement>('.unit-row')) {
    b.onclick = () => { selectUnit(b.dataset.unit ?? null); showInfo(h); };
  }
  $('info-close').onclick = () => { selectUnit(null); view.select(null); showInfo(null); };
  const id = hexId(h);
  const picks = [...box.querySelectorAll<HTMLInputElement>('.atk-pick')];
  for (const c of picks) {
    c.onchange = () => { attackPick = { hex: id, units: new Set(picks.filter((x) => x.checked).map((x) => x.dataset.unit!)) }; showInfo(h); };
  }
  const go = document.getElementById('atk-go');
  if (go) go.onclick = () => {
    if (game.dispatch({ type: 'Attack', attackers: picks.filter((x) => x.checked).map((x) => x.dataset.unit!), hex: id })) { attackPick = null; showInfo(h); }
  };
  const add = document.getElementById('atk-add');
  if (add) add.onclick = () => { game.addToAssault(id, picks.filter((x) => x.checked).map((x) => x.dataset.unit!)); showInfo(h); };
  const adv = document.getElementById('adv-go');
  if (adv) adv.onclick = () => {
    const units = [...box.querySelectorAll<HTMLInputElement>('.adv-pick')].filter((x) => x.checked).map((x) => x.dataset.unit!);
    if (game.dispatch({ type: 'Advance', units })) { selectUnit(units.at(-1) ?? null); showInfo(h); }
  };
}

/** 选中单位的疲劳（连续进攻会累积；进攻时使列左移） */
function fatigueNote(unitId: string | null): string {
  const dis = unitId && game ? game.state().disorganized[unitId] : undefined;
  const disHtml = dis !== undefined ? `<div class="combat"><div class="units-head">混乱</div><div class="muted small">不能移动、不能进攻，没有控制区，炮兵不能支援，掘壕取消；被进攻时对方赔率列右移。在更早的回合就混乱、本回合没再被打垮的，回合末恢复。</div></div>` : '';
  const cut = unitId && game && !isSupplied(ctx, game.state(), unitId)
    ? `<div class="combat"><div class="units-head">断补</div><div class="muted small">补给线被切断（不能连回后方边缘：路上有敌军，或要穿过敌控制区）。进攻时赔率列左移，被进攻时对方赔率列右移；混乱后不能恢复。把敌人赶走或让己方单位占住路上的格子可以接通。</div></div>` : '';
  return cut + disHtml + fatigueNoteRest(unitId);
}
function fatigueNoteRest(unitId: string | null): string {
  const dug = unitId && game ? game.state().entrench[unitId] : undefined;
  const dugHtml = dug && dug.level > 0 && game?.state().units.find((u) => u.id === unitId)?.hex === dug.hex
    ? `<div class="combat"><div class="units-head">掘壕 ${dug.level} 级</div><div class="muted small">在原地守了 ${dug.level} 个回合；被进攻时赔率列右移（对守方有利）。一移动就清零。</div></div>` : '';
  const lvl = unitId && game ? game.state().fatigue[unitId] ?? 0 : 0;
  return dugHtml + (lvl ? `<div class="combat"><div class="units-head">疲劳 ${lvl} 级</div><div class="muted small">连续进攻会累积；回合末不进攻则休整，夜间恢复更多。疲劳的部队进攻时赔率列左移。</div></div>` : '');
}

/** 选中单位的开局位置依据（想定里写的考据说明；占位和推定用斜体） */
function startNote(unitId: string | null): string {
  if (!unitId) return '';
  const p = deployment.placements.find((x) => x.unit === unitId);
  const r = deployment.reinforcements.find((x) => x.unit === unitId);
  const basis = p?.basis ?? r?.note;
  if (!basis) return '';
  const conf = p?.confidence ?? 'sourced';
  const quote = (p?.provenance ?? r?.provenance ?? [])[0];
  return `<div class="combat start-note"><div class="units-head">开局位置${r ? `（第 ${r.turn} 回合增援到 ${r.hex}）` : ''}</div>
    <div${conf === 'sourced' ? '' : ' class="est"'}>${CONFIDENCE_NAMES[conf]}：${esc(basis)}</div>
    ${quote ? `<div class="muted small">${esc(quote.source)}${quote.page ? `（${esc(quote.page)}）` : ''}：“${esc(quote.quote ?? '')}”</div>` : ''}</div>`;
}

/** 胜利目标说明 */
function objectiveHtml(hex: string): string {
  const o = deployment.objectives.find((x) => x.hex === hex);
  if (!o) return '';
  const owner = game.state().owners[hex] ?? o.owner;
  return `<div class="combat"><div class="units-head">胜利目标</div>${esc(o.name)}：${o.vp} 点，现归${SIDE_NAMES[owner]}${o.note ? `<div class="muted small">${esc(o.note)}</div>` : ''}</div>`;
}

/** 选中单位：高亮，并算出可到达范围 */
function selectUnit(id: string | null): void {
  selectedUnit = id;
  units.highlight(id);
  const s = game?.state();
  reach = id && s && !whyCannotMove(ctx, s, id, actingSide(ctx, s)) ? reachable(ctx, s, id) : null;
  reachView.show(reach);
}
function moveNote(): string {
  const s = game?.state();
  if (!selectedUnit || !s) return '';
  const why = whyCannotMove(ctx, s, selectedUnit, actingSide(ctx, s));
  if (why) return `<span class="muted">不能移动：${esc(why)}</span>`;
  const u = oob.units.get(selectedUnit)!;
  const mp = movementAllowance(ctx, s, selectedUnit);
  return `可以移动（移动力 ${mp}${mp !== u.ratings.movement ? '，夜间减半' : ''}）：点地图上<b class="c-reach">蓝色</b>格子移动；<b class="c-zoc">橙色</b>是敌控制区，到此停止。`;
}

let view: Awaited<ReturnType<typeof createMapView>>;
let reachView: ReturnType<typeof createReachView>;
let editor: ReturnType<typeof createEditor>;
let units: ReturnType<typeof createUnitsView>;
let game: GameUi;
let org: OrgPanel;
let planPanel: PlanPanel | undefined;
let planView: ReturnType<typeof createPlanView>;
/** 整体移动：正在等玩家点目的地的单位 */
let groupMove: string[] | null = null;

async function start(): Promise<void> {
  $('title').textContent = meta.title.zh;
  $('subtitle').textContent = showSources() ? `${map.def.name.zh} · 引擎 v${ENGINE_VERSION}` : map.def.name.zh;
  const host = $('app');
  const app = new Application();
  await app.init({ resizeTo: host, background: '#2b2e30', antialias: true, autoDensity: true, resolution: Math.min(2, devicePixelRatio) });
  host.appendChild(app.canvas);

  // 先加载地图字体，否则 PixiJS 会用后备字体把文字画进纹理
  await Promise.all(MAP_FONTS.map(async (f) => {
    try {
      const face = new FontFace(f.family, `url(${import.meta.env.BASE_URL}${f.file})`, { style: f.style });
      document.fonts.add(await face.load());
    } catch (e) { console.warn('字体加载失败，使用后备字体', f.family, e); }
  }));
  view = await createMapView(map, `${import.meta.env.BASE_URL}${map.def.reference.image}`,
    map.def.relief ? `${import.meta.env.BASE_URL}${map.def.relief.image}` : undefined);
  app.stage.addChild(view.root);
  // 算子在地名之上、选中框之下
  units = createUnitsView(map);
  view.root.addChildAt(units.root, view.root.children.length - 1);
  // 可到达范围画在算子下面
  reachView = createReachView(map);
  view.root.addChildAt(reachView.root, view.root.getChildIndex(units.root));
  planView = createPlanView(map);
  view.root.addChildAt(planView.root, view.root.getChildIndex(units.root) + 1);
  const objView = createObjectivesView(map);
  view.root.addChildAt(objView.root, view.root.getChildIndex(units.root) + 1);

  let selected: ReturnType<typeof hexAt> | null = null;
  editor = createEditor(baseMap, {
    onMapChange(m) {
      map = m;
      view.update(m);
      if (selected && !$('info').hidden) showInfo(selected);
    },
    onActiveChange(on) {
      // 编辑时显示核对标记（含已核对的绿点）；参考底图由所有者在"图层"里按需打开
      view.setShowVerified(on);
      const st = $<HTMLInputElement>('ly-status');
      if (on && !st.checked) { st.checked = true; st.dispatchEvent(new Event('change')); }
      // 编辑地图时隐藏算子，免得挡住地形
      units.root.visible = !on && $<HTMLInputElement>('ly-units').checked;
      selectUnit(null);
      $('game').hidden = on;
      view.select(null); showInfo(null);
    },
    highlightSide: (h, dir) => view.selectSide(h, dir),
  });
  map = editor.map();
  if (map !== baseMap) view.update(map);

  const hotseat = createHotseat(ctx);
  const pick = $<HTMLSelectElement>('g-scn');
  pick.innerHTML = SCENARIOS.map((x) => `<option value="${esc(x.id)}"${x.id === deployment.id ? ' selected' : ''}>${esc(x.names.zh)}</option>`).join('');
  pick.onchange = () => {
    if (!confirm('换想定会开始新对局（当前对局可先存档）。继续？')) { pick.value = deployment.id; return; }
    try { localStorage.setItem(SCN_KEY, pick.value); localStorage.removeItem('kursk-1943-autosave'); } catch { /* 隐私模式 */ }
    location.reload();
  };
  setupHowto();
  game = createGameUi(ctx, initialFor, deployment.id, ENGINE_VERSION, (s) => {
    stackMap = stacks(placedUnits(ctx, s));
    fog = hotseat.fog(s);
    void units.render(stackMap, fog?.hidden);
    objView.show(deployment.objectives.map((o) => ({ hex: o.hex, vp: o.vp, owner: s.owners[o.hex] ?? o.owner })));
    selectUnit(selectedUnit && s.units.some((u) => u.id === selectedUnit) ? selectedUnit : null);
    if (selected && !$('info').hidden) showInfo(selected);
    org?.refresh(s);
    planPanel?.refresh(s);
  }, toast, hotseat);
  org = setupOrg(ctx, () => hotseat.fog(game.state())?.viewer ?? null, (f, p) => game.dispatch({ type: 'Assign', formation: f, parent: p }), (ids) => units.highlightGroup(ids),
    (ids, name) => { groupMove = ids; if (ids) toast(`整体移动：${name}。点地图上的目的地（Esc 取消）`); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (groupMove) { groupMove = null; org.cancelMove(); } planPanel?.cancel(); } });
  org.refresh(game.state());
  planPanel = setupPlan(ctx, () => hotseat.fog(game.state())?.viewer ?? null,
    (kind, formation, path) => game.dispatch({ type: 'Plan', kind, formation, path }),
    (id) => game.dispatch({ type: 'Unplan', id }),
    () => planView.show(planPanel ? planPanel.axes(game.state()) : [], planPanel?.draft() ?? null));
  planPanel.refresh(game.state());

  const cam = attachCamera(app.canvas, view.root, (sx, sy) => {
    const local = view.root.toLocal({ x: sx, y: sy });
    const world = { x: local.x / PX_PER_KM, y: local.y / PX_PER_KM };
    const h = hexAt(map.grid, world);
    if (!inBounds(map.grid, h)) { selected = null; view.select(null); showInfo(null); return; }
    if (planPanel?.drawing()) { planPanel.addPoint(hexId(h)); return; }
    if (groupMove) {
      const ids = groupMove, to = hexId(h);
      groupMove = null; org.cancelMove();
      const plan = planGroupMove(ctx, game.state(), ids, to);
      if (game.dispatch({ type: 'MoveGroup', units: ids, hex: to })) toast(`${plan.moves.length} 个单位向 ${to} 移动，${plan.skipped.length} 个没动`);
      return;
    }
    if (editor.tap(world, h)) {
      if (editor.tool !== 'side') view.select(h);
      showInfo(null);
      return;
    }
    const target = reach?.get(hexId(h));
    if (target && selectedUnit && !editor.active) {
      const u = selectedUnit;
      selected = h;
      if (game.dispatch({ type: 'Move', unit: u, path: target.path })) { selectUnit(u); view.select(h); showInfo(h); }
      return;
    }
    selected = h;
    // 点到有部队的格子，默认选中最上面的单位
    const stack = stackMap.get(hexId(h)) ?? [];
    selectUnit(editor.active || veiled(hexId(h)) ? null : stack.at(-1)?.unit.id ?? null);
    view.select(h); showInfo(h);
  });
  cam.onChange(() => view.onZoom(cam.zoom()));
  const b = view.fullBounds;
  cam.fit(b.x0 * PX_PER_KM, b.y0 * PX_PER_KM, b.x1 * PX_PER_KM, b.y1 * PX_PER_KM);

  // 图层开关
  const L = view.layers;
  const bind = (id: string, apply: (on: boolean) => void): void => {
    const el = $<HTMLInputElement>(id);
    const f = (): void => { apply(el.checked); view.onZoom(cam.zoom()); };
    el.addEventListener('change', f); f();
  };
  bind('ly-ref', (on) => { L.reference.visible = on; });
  bind('ly-ref2', (on) => { if (L.reference2) L.reference2.visible = on; });
  bind('ly-relief', (on) => { if (L.relief) L.relief.visible = on; });
  bind('ly-terrain', (on) => { L.terrain.visible = on; });
  bind('ly-grid', (on) => { L.grid.visible = on; });
  bind('ly-num', (on) => { L.numbers.visible = on; });
  bind('ly-labels', (on) => { L.labels.visible = on; });
  bind('ly-status', (on) => { L.status.visible = on; });
  bind('ly-units', (on) => { units.root.visible = on && !editor.active; });
  const op = $<HTMLInputElement>('ref-opacity');
  const setOp = (): void => { L.reference.alpha = Number(op.value) / 100; if (L.reference2) L.reference2.alpha = Number(op.value) / 100; $('ref-op-val').textContent = `${op.value}%`; };
  op.addEventListener('input', setOp); setOp();
  // 编辑面板里的"参考底图"开关与图层面板同步
  const edRef = $<HTMLInputElement>('ed-ref'), lyRef = $<HTMLInputElement>('ly-ref');
  edRef.checked = lyRef.checked;
  edRef.addEventListener('change', () => { lyRef.checked = edRef.checked; lyRef.dispatchEvent(new Event('change')); });
  lyRef.addEventListener('change', () => { edRef.checked = lyRef.checked; });
  $('layers-toggle').addEventListener('click', () => $('layers').classList.toggle('open'));
  $('fit').addEventListener('click', () => cam.fit(b.x0 * PX_PER_KM, b.y0 * PX_PER_KM, b.x1 * PX_PER_KM, b.y1 * PX_PER_KM));
  $('loading').remove();
}

void start();
