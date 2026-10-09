/** 信息面板里的"部队"部分：本格堆叠（从上到下）与选中单位的详细资料。 */
import {
  CONFIDENCE_NAMES, type PlacedUnit, type Provenance, SIDE_NAMES, UNIT_SIZE_NAMES, UNIT_TYPE_NAMES,
} from '../engine';
import { counterSvg } from './counter-svg';

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const mini = (p: PlacedUnit, px: number): string =>
  counterSvg(p.unit, p.formation, { steps: p.steps }).replace('width="100" height="100"', `width="${px}" height="${px}"`);

/** 占位数据以灰色斜体显示 */
const val = (text: string | number, placeholder: boolean): string =>
  placeholder ? `<span class="ph" title="占位：尚未考据">${esc(String(text))}</span>` : esc(String(text));

function sources(list: Provenance[]): string {
  if (!list.length) return '<span class="muted">无</span>';
  return list.map((p) => esc(`${p.field}：${p.source}${p.page ? ` 第 ${p.page} 页` : ''}${p.grade ? `（${p.grade} 级）` : ''}${p.note ? ` ${p.note}` : ''}`)).join('<br>');
}

/** 堆叠列表 + 选中单位详情。stack 从下到上；列表从上到下显示。 */
export function unitSectionHtml(stack: readonly PlacedUnit[], selectedId: string | null): string {
  if (!stack.length) return '';
  const rows = [...stack].reverse().map((p) => `
    <button class="unit-row${p.unit.id === selectedId ? ' on' : ''}" data-unit="${esc(p.unit.id)}">
      ${mini(p, 34)}<span>${esc(p.unit.names.zh)}<br><small>${esc(p.formation.names.zh)}</small></span>
    </button>`).join('');
  const p = stack.find((x) => x.unit.id === selectedId);
  let detail = '';
  if (p) {
    const { unit: u, formation: f } = p;
    const ph = u.confidence === 'placeholder';
    const fph = f.confidence === 'placeholder';
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
          <dt>数值</dt><dd class="${ph ? 'ph' : ''}">${CONFIDENCE_NAMES[u.confidence]}</dd>
          <dt>番号考据</dt><dd class="${fph ? 'ph' : ''}">${CONFIDENCE_NAMES[f.confidence]}</dd>
          <dt>出处</dt><dd>${sources([...f.provenance, ...u.provenance])}</dd>
          ${u.note ? `<dt>备注</dt><dd><small>${esc(u.note)}</small></dd>` : ''}
        </dl>
      </div>`;
  }
  return `<div class="units"><div class="units-head">部队（${stack.length}）</div>${rows}${detail}</div>`;
}
