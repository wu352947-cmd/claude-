// 日历工具：二十四节气、七十二候、月相、农历。前端页面与服务端回信共用。
export const JQ = [
  ['立春','lì chūn',2,4,['东风解冻','蛰虫始振','鱼陟负冰']],
  ['雨水','yǔ shuǐ',2,19,['獭祭鱼','候雁北','草木萌动']],
  ['惊蛰','jīng zhé',3,5,['桃始华','仓庚鸣','鹰化为鸠']],
  ['春分','chūn fēn',3,20,['玄鸟至','雷乃发声','始电']],
  ['清明','qīng míng',4,5,['桐始华','田鼠化为鴽','虹始见']],
  ['谷雨','gǔ yǔ',4,20,['萍始生','鸣鸠拂其羽','戴胜降于桑']],
  ['立夏','lì xià',5,5,['蝼蝈鸣','蚯蚓出','王瓜生']],
  ['小满','xiǎo mǎn',5,21,['苦菜秀','靡草死','麦秋至']],
  ['芒种','máng zhòng',6,5,['螳螂生','鵙始鸣','反舌无声']],
  ['夏至','xià zhì',6,21,['鹿角解','蜩始鸣','半夏生']],
  ['小暑','xiǎo shǔ',7,7,['温风至','蟋蟀居宇','鹰始挚']],
  ['大暑','dà shǔ',7,22,['腐草为萤','土润溽暑','大雨时行']],
  ['立秋','lì qiū',8,7,['凉风至','白露降','寒蝉鸣']],
  ['处暑','chǔ shǔ',8,23,['鹰乃祭鸟','天地始肃','禾乃登']],
  ['白露','bái lù',9,7,['鸿雁来','玄鸟归','群鸟养羞']],
  ['秋分','qiū fēn',9,23,['雷始收声','蛰虫坯户','水始涸']],
  ['寒露','hán lù',10,8,['鸿雁来宾','雀入大水为蛤','菊有黄华']],
  ['霜降','shuāng jiàng',10,23,['豺乃祭兽','草木黄落','蛰虫咸俯']],
  ['立冬','lì dōng',11,7,['水始冰','地始冻','雉入大水为蜃']],
  ['小雪','xiǎo xuě',11,22,['虹藏不见','天气上升地气下降','闭塞而成冬']],
  ['大雪','dà xuě',12,7,['鹖鴠不鸣','虎始交','荔挺出']],
  ['冬至','dōng zhì',12,21,['蚯蚓结','麋角解','水泉动']],
  ['小寒','xiǎo hán',1,5,['雁北乡','鹊始巢','雉始雊']],
  ['大寒','dà hán',1,20,['鸡始乳','征鸟厉疾','水泽腹坚']]
];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_CN = ['春', '夏', '秋', '冬'];

export const pad = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const isDayKey = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime()) && dayKey(parseDay(s)) === s;

const termDate = (i, y) => new Date(y, JQ[i][2] - 1, JQ[i][3]);

// 当日所在节气（按常用日期近似，误差 ±1 天）
export function termOf(date) {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let best = null;
  for (const yr of [d0.getFullYear() - 1, d0.getFullYear()]) {
    JQ.forEach((_, i) => { const dt = termDate(i, i >= 22 ? yr + 1 : yr); if (dt <= d0 && (!best || dt > best.d)) best = { i, d: dt }; });
  }
  const next = (best.i + 1) % 24;
  let ny = best.d.getFullYear(); if (next === 22) ny += 1;
  const nd = termDate(next, ny);
  const sinceDays = Math.round((d0 - best.d) / 864e5);
  return {
    index: best.i, name: JQ[best.i][0], pinyin: JQ[best.i][1],
    hou: JQ[best.i][4][Math.min(2, Math.floor(sinceDays / 5))],
    season: Math.floor(best.i / 6), next: JQ[next][0], daysToNext: Math.round((nd - d0) / 864e5)
  };
}

export function moonOf(date) {
  const SYN = 29.530588853;
  const age = (((date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYN + SYN) % SYN;
  const phase = age / SYN, illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const name = age < 1.85 ? '新月' : age < 7.38 ? '蛾眉月' : age < 9.23 ? '上弦月' : age < 14.77 ? '盈凸月'
    : age < 16.61 ? '满月' : age < 22.15 ? '亏凸月' : age < 23.99 ? '下弦月' : '残月';
  return { phase, illum, name };
}

// 月相小图的 SVG path（cx, cy, r 处的受光部分）
export function moonPath(phase, cx, cy, r) {
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  if (illum < 0.02) return '';
  const rx = Math.abs(Math.cos(2 * Math.PI * phase)) * r, wax = phase < 0.5, cres = illum < 0.5;
  return wax
    ? `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${cres ? 0 : 1} ${cx} ${cy - r}Z`
    : `M${cx} ${cy - r}A${r} ${r} 0 0 0 ${cx} ${cy + r}A${rx} ${r} 0 0 ${cres ? 1 : 0} ${cx} ${cy - r}Z`;
}

const CN = '〇一二三四五六七八九';
export function lunarOf(date) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(date);
    const g = t => (parts.find(p => p.type === t) || {}).value || '';
    let d = g('day');
    if (/^\d+$/.test(d)) { const n = +d; d = n === 10 ? '初十' : n <= 10 ? '初' + CN[n] : n < 20 ? '十' + CN[n - 10] : n === 20 ? '二十' : n < 30 ? '廿' + CN[n - 20] : '三十'; }
    const y = g('yearName') || g('relatedYear');
    return { year: y ? (/年$/.test(y) ? y : y + '年') : '', month: g('month'), day: d };
  } catch { return { year: '', month: '', day: '' }; }
}

export const WEEK = '日一二三四五六';
export function cnDate(date) {
  const cn = n => n <= 10 ? (n === 10 ? '十' : CN[n]) : n < 20 ? '十' + CN[n - 10] : (n % 10 ? CN[Math.floor(n / 10)] + '十' + CN[n % 10] : CN[n / 10] + '十');
  return `${cn(date.getMonth() + 1)}月${cn(date.getDate())}日`;
}
