// Bilingual title cards and the year odometer. Times in seconds.
export const CARDS = [
  { kind: 'epigraph', t0: 24.4, t1: 30.9,
    zh: '那时，天下人的口音、言语，都是一样。',
    en: 'And the whole earth was of one language, and of one speech.',
    ref: '创世记  11 : 1     GENESIS  11 : 1' },
  { kind: 'title', t0: 33.0, t1: 38.2, fadeIn: 0.35, fadeOut: 1.6 },

  { kind: 'era', t0: 40.0,  t1: 44.2,  num: 'I',    zh: '泥', en: 'MUD' },
  { kind: 'era', t0: 70.0,  t1: 73.8,  num: 'II',   zh: '石', en: 'STONE' },
  { kind: 'era', t0: 83.6,  t1: 87.0,  num: 'III',  zh: '火', en: 'FIRE' },
  { kind: 'era', t0: 96.4,  t1: 100.2, num: 'IV',   zh: '木', en: 'WOOD' },
  { kind: 'era', t0: 110.0, t1: 113.6, num: 'V',    zh: '信', en: 'FAITH' },
  { kind: 'era', t0: 129.4, t1: 132.6, num: 'VI',   zh: '铁', en: 'IRON' },
  { kind: 'era', t0: 166.0, t1: 169.8, num: 'VII',  zh: '天', en: 'SKY' },
  { kind: 'era', t0: 177.4, t1: 181.2, num: 'VIII', zh: '言', en: 'WORD' },

  { kind: 'quote', t0: 208.6, t1: 215.6, fadeIn: 1.2, fadeOut: 1.0,
    lines: ['看哪，他们成为一样的人民，都是一样的言语。', '以后他们所要做的事，就没有不成就的了。'],
    en: ['Behold, the people is one, and they have all one language;', 'and now nothing will be restrained from them, which they have imagined to do.'],
    ref: '创世记  11 : 6     GENESIS  11 : 6' },

  { kind: 'credit', t0: 239.0, t1: 245.0, rows: [
    ['zh', '编剧 · 导演 · 分镜 · 作曲 · 音效 · 渲染 · 剪辑'],
    ['en', 'WRITTEN  ·  DIRECTED  ·  STORYBOARDED  ·  SCORED  ·  SOUND  ·  RENDERED  ·  EDITED'],
    ['gap'], ['name', 'OPUS 5.5'] ] },
  { kind: 'credit', t0: 245.6, t1: 251.6, rows: [
    ['zh', '六千年  ·  零台摄影机  ·  零个音频采样'],
    ['en', '6,000 YEARS  ·  0 CAMERAS  ·  0 AUDIO SAMPLES'],
    ['gap'],
    ['zh', '每一帧画面，每一个音符，皆由代码生成。'],
    ['en', 'EVERY FRAME AND EVERY NOTE WAS GENERATED FROM CODE'] ] },
  { kind: 'credit', t0: 252.2, t1: 258.4, rows: [
    ['big', '献给每一位建造者。'], ['it', 'For every builder.'] ] },
];

export const YEARS = {
  opacity: [[0, 0], [39.6, 0], [41.2, 1], [205.2, 1], [206.6, 0, 'inExpo']],
  keys: [
    [39, -4000], [47, -4000], [58, -3000, 'inOutCubic'], [69, -3000],
    [71, -2560], [83, -2560], [84.6, -280], [95, -280], [96.6, 1056], [108, 1056],
    [109.6, 1248], [128, 1248], [129.6, 1889], [136.5, 1889], [143.5, 1931], [145.2, 1945], [154, 1945],
    [155.6, 1969], [180.5, 1969], [189.5, 2026], [260, 2026],
  ],
  places: [
    { t0: 41.0,  t1: 57.0,  zh: '乌鲁克 · 美索不达米亚', en: 'URUK, MESOPOTAMIA' },
    { t0: 71.6,  t1: 82.0,  zh: '吉萨 · 尼罗河西岸',     en: 'GIZA, EGYPT' },
    { t0: 85.0,  t1: 93.5,  zh: '亚历山大港 · 法罗斯岛', en: 'PHAROS, ALEXANDRIA' },
    { t0: 97.0,  t1: 107.6, zh: '应县 · 大辽',           en: 'YINGXIAN, LIAO EMPIRE' },
    { t0: 110.2, t1: 127.0, zh: '科隆 · 莱茵河畔',       en: 'COLOGNE, RHINELAND' },
    { t0: 130.2, t1: 136.4, zh: '巴黎 · 战神广场',       en: 'PARIS, CHAMP DE MARS' },
    { t0: 143.6, t1: 145.9, zh: '纽约 · 曼哈顿',         en: 'NEW YORK, MANHATTAN' },
    { t0: 156.2, t1: 165.0, zh: '卡纳维拉尔角 · 39A 发射台', en: 'CAPE CANAVERAL, PAD 39A' },
    { t0: 166.5, t1: 175.5, zh: '月球 · 静海',           en: 'THE MOON, SEA OF TRANQUILITY' },
    { t0: 190.0, t1: 205.0, zh: '此时 · 此地',           en: 'HERE, NOW' },
  ],
};
