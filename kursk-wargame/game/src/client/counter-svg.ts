/**
 * 算子模板：由单位数据生成一张 SVG（地图上的算子、信息面板、以后的打印版共用）。
 * 布局（100×100）：上方师属色条（编制简称 + 番号），中间北约兵种符号（milsymbol，含规模标记），
 * 右侧步数格（实心 = 剩余，空心 = 已损失），下方 攻击-防御-移动。
 * 不使用任何纳粹/党卫军标志，只用番号与兵种符号。
 */
import ms from 'milsymbol';
import type { Formation, Unit, UnitSize, UnitType } from '../engine';
import { COUNTER_STYLE } from './style';

/** 兵种 → MIL-STD-2525C 字母代码（第 5–10 位，地面单位） */
const FUNCTION_ID: Record<UnitType, string> = {
  armor: 'UCA---', panzergrenadier: 'UCIZ--', 'motorized-infantry': 'UCIM--', infantry: 'UCI---', airborne: 'UCIA--',
  recon: 'UCR---', artillery: 'UCF---', 'sp-artillery': 'UCFHE-', antitank: 'UCAA--', 'tank-destroyer': 'UCAAA-',
};
/** 规模 → 规模标记代码（第 12 位） */
const ECHELON: Record<UnitSize, string> = { battalion: 'F', regiment: 'G', brigade: 'H', division: 'I' };

/** 15 位符号代码：友军(F) 地面(G) 现役(P) + 兵种 + 规模 */
export function sidc(type: UnitType, size: UnitSize): string {
  return `SFGP${FUNCTION_ID[type]}-${ECHELON[size]}----`;
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 色条文字用黑或白，取对比度高的一个 */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? '#1f1d1a' : '#f6f4ec';
}

export interface CounterOptions {
  /** 当前步数（不写 = 满编） */
  steps?: number;
}

export function counterSvg(unit: Unit, formation: Formation, opts: CounterOptions = {}): string {
  const S = COUNTER_STYLE;
  const c = S.branch[formation.branch];
  const steps = opts.steps ?? unit.steps;
  const parts: string[] = [];
  // 底板
  parts.push(`<rect x="0.75" y="0.75" width="98.5" height="98.5" rx="6" fill="${c.base}" stroke="${S.edge}" stroke-width="1.5"/>`);
  // 师属色条
  const barInk = inkOn(formation.color);
  const idStyle = formation.confidence === 'placeholder' ? ' font-style="italic"' : '';
  parts.push(`<path d="M1.5 21 V7 Q1.5 1.5 7 1.5 H93 Q98.5 1.5 98.5 7 V21 Z" fill="${formation.color}"/>`);
  const abbr = `${formation.guards ? 'Gds ' : ''}${formation.abbr}`;
  parts.push(`<text x="6" y="15.5" font-size="12" font-weight="700" fill="${barInk}"${idStyle}>${esc(abbr)}</text>`);
  parts.push(`<text x="94" y="16" font-size="14" font-weight="700" fill="${barInk}" text-anchor="end"${idStyle}>${esc(unit.designation)}</text>`);
  // 兵种符号（含规模标记），放进 x 8–84、y 23–71 的区域
  const sym = new ms.Symbol(sidc(unit.type, unit.size), {
    size: 30, fill: true, fillColor: c.symbol, frame: true, infoFields: false, outlineWidth: 0, strokeWidth: 4,
  });
  const { width: w, height: h } = sym.getSize();
  const k = Math.min(76 / w, 48 / h);
  const sw = w * k, sh = h * k;
  // 保留 milsymbol 自己的 viewBox，只改位置与大小
  const svg = sym.asSVG().replace(/^<svg[^>]*?(viewBox="[^"]*")[^>]*>/,
    `<svg x="${(46 - sw / 2).toFixed(2)}" y="${(71 - sh).toFixed(2)}" width="${sw.toFixed(2)}" height="${sh.toFixed(2)}" $1>`);
  parts.push(svg);
  // 步数格
  for (let i = 0; i < unit.steps; i++) {
    const y = 26 + i * 9;
    const on = i < steps;
    parts.push(`<rect x="88" y="${y}" width="7" height="7" rx="1" fill="${on ? c.ink : 'none'}" stroke="${c.ink}" stroke-width="1.2"/>`);
  }
  // 攻击-防御-移动
  const r = unit.ratings;
  const ph = unit.confidence === 'placeholder';
  parts.push(`<text x="50" y="93" font-size="21" font-weight="700" text-anchor="middle" fill="${ph ? c.placeholder : c.ink}"${ph ? ' font-style="italic"' : ''} letter-spacing="0.5">${r.attack}-${r.defense}-${r.movement}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" font-family='${S.font}'>${parts.join('')}</svg>`;
}
