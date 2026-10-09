/** 信息面板里的"部队"部分：本格堆叠（从上到下）与选中单位的详细资料。 */
import {
  CONFIDENCE_NAMES, type Confidence, type PlacedUnit, type Provenance, SIDE_NAMES, UNIT_SIZE_NAMES, UNIT_TYPE_NAMES,
} from '../engine';
import { counterSvg } from './counter-svg';

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const mini = (p: PlacedUnit, px: number): string =>
  counterSvg(p.unit, p.formation, { steps: p.steps }).replace('width="100" height="100"', `width="${px}" height="${px}"`);

/** 占位数据以灰色斜体显示 */
const val = (text: string | number, c: Confidence): string =>
  c === 'placeholder' ? `<span class="ph" title="占位：尚未考据">${esc(String(text))}</span>`
    : c === 'estimated' ? `<span class="est" title="推定：来源较弱或经推算">${esc(String(text))}</span>` : esc(String(text));

function sources(list: Provenance[]): string {
  if (!list.length) return '<span class="muted">无</span>';
  return list.map((p) => esc(`${p.field}：${p.source}${p.page ? (/^\d[\d–-]*$/.test(p.page) ? ` 第 ${p.page} 页` : ` · ${p.page}`) : ''}${p.grade ? `（${p.grade} 级）` : ''}${p.note ? ` ${p.note}` : ''}`)).join('<br>');
}

const ARMOR_NAMES = { none: '无', light: '轻', medium: '中', heavy: '重' } as const;
const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

/** 公式明细：每条输入（史料数字）→ 攻/防/支援分，并列出出处与原文 */
function derivation(p: PlacedUnit): string {
  const u = p.unit;
  const d = u.derived;
  if (!d) return '<div class="muted">数值为手填占位，没有公式明细</div>';
  const art = u.type === 'artillery';
  const rows = d.lines.map((l, i) => {
    const s = u.strength[i];
    const src = s ? `<div class="src">${esc(s.date)} · ${esc(s.basis)} · ${esc(s.source)}（${s.grade} 级）${s.note ? ` · ${esc(s.note)}` : ''}
      ${s.where ? `<br>${/^https?:/.test(s.where) ? `<a href="${esc(s.where)}" target="_blank" rel="noopener">原文链接</a>` : esc(s.where)}` : ''}
      ${s.quote ? `<br><q>${esc(s.quote)}</q>` : ''}</div>` : '';
    const cls = l.placeholder ? ' class="ph"' : s && s.grade !== 'A' && s.grade !== 'B' ? ' class="est"' : '';
    return `<tr${cls}><td>${esc(l.label)}${l.count !== undefined ? ` × ${l.count}` : ''}${src}</td>
      <td>${art ? fmt(l.support) : fmt(l.attack)}</td><td>${art ? '' : fmt(l.defense)}</td></tr>`;
  }).join('');
  return `<details class="deriv"><summary>数值怎么算出来的（公式草案）</summary>
    <table><thead><tr><th>输入（史料数字）</th><th>${art ? '支援' : '攻'}</th><th>${art ? '' : '防'}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="muted">合计后取整（素质不进数值，战斗时作修正） → ${u.ratings.attack}-${u.ratings.defense}；步数 ${u.steps}；装甲等级 ${ARMOR_NAMES[d.armorClass]}。
    公式与参数见 docs/08-单位数值换算公式.md</div></details>`;
}

/** 堆叠列表 + 选中单位详情。stack 从下到上；列表从上到下显示。 */
export function unitSectionHtml(stack: readonly PlacedUnit[], selectedId: string | null, moving = false): string {
  if (!stack.length) return '';
  const rows = [...stack].reverse().map((p) => `
    <button class="unit-row${p.unit.id === selectedId ? ' on' : ''}" data-unit="${esc(p.unit.id)}">
      ${mini(p, 34)}<span>${esc(p.unit.names.zh)}<br><small>${esc(p.formation.names.zh)}</small></span>
    </button>`).join('');
  const p = stack.find((x) => x.unit.id === selectedId);
  let detail = '';
  if (p) {
    const { unit: u, formation: f } = p;
    const ph = u.confidence;
    const fph = f.confidence;
    const other = [u.names.de, u.names.ru].filter(Boolean).map((n) => esc(n!)).join('<br>');
    detail = `
      <div class="unit-detail">
        <div class="unit-big">${mini(p, 72)}</div>
        <dl>
          <dt>番号</dt><dd>${val(u.names.zh, fph)}<br><small>${esc(u.names.en)}${other ? `<br>${other}` : ''}</small></dd>
          <dt>隶属</dt><dd>${val(f.names.zh, fph)}${f.guards ? '（近卫）' : ''} · ${SIDE_NAMES[f.side]}</dd>
          <dt>兵种</dt><dd>${UNIT_TYPE_NAMES[u.type]} · ${UNIT_SIZE_NAMES[u.size]}</dd>
          <dt>步数</dt><dd>${val(`${p.steps} / ${u.steps}`, ph)}</dd>
          <dt>攻击</dt><dd>${val(u.ratings.attack, ph)}</dd>
          <dt>防御</dt><dd>${val(u.ratings.defense, ph)}</dd>
          <dt>移动</dt><dd>${val(u.ratings.movement, ph)}</dd>
          <dt>数值</dt><dd>${val(CONFIDENCE_NAMES[u.confidence], ph)}</dd>
          <dt>番号考据</dt><dd>${val(CONFIDENCE_NAMES[f.confidence], fph)}</dd>
          <dt>编制出处</dt><dd>${sources([...f.provenance, ...u.provenance])}</dd>
          ${u.note ? `<dt>备注</dt><dd><small>${esc(u.note)}</small></dd>` : ''}
        </dl>
      </div>
      <button class="move-btn${moving ? ' on' : ''}" id="move-btn">${moving ? '点地图上的目标格…（再点此取消）' : '移到另一格（临时；冲刺 4 换成正式移动）'}</button>
      ${derivation(p)}`;
  }
  return `<div class="units"><div class="units-head">部队（${stack.length}）</div>${rows}${detail}</div>`;
}
