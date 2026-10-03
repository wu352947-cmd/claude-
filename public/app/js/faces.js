// 心情小脸
export const MOODS = [
  { k: 'happy', n: '开心', c: '#E3B65E', eyes: 'M21 29q4-6 8 0M35 29q4-6 8 0', mouth: 'M24 38q8 10 16 0', ck: 1 },
  { k: 'calm', n: '平静', c: '#93BAA6', eyes: 'M21 30h8M35 30h8', mouth: 'M27 40q5 3 10 0', ck: 0 },
  { k: 'sweet', n: '小确幸', c: '#E7B3B6', eyes: 'M21 31q4-6 8 0M35 31q4-6 8 0', mouth: 'M27 39q2.5 3 5 0q2.5 3 5 0', ck: 2 },
  { k: 'tired', n: '有点累', c: '#A79AC8', eyes: 'M21 30q4 4 8 0M35 30q4 4 8 0', mouth: 'M28 42h8', ck: 0, drop: 1 },
  { k: 'blue', n: '想哭', c: '#9DBBD3', eyes: 'M24 30v1M40 30v1', mouth: 'M26 43q6-6 12 0', ck: 0, tear: 1 }
];
export const MOOD_MAP = Object.fromEntries(MOODS.map(m => [m.k, m]));
export const faceSvg = m => `<svg class="face" viewBox="0 0 64 64" aria-hidden="true"><path fill="${m.c}" d="M32 5c16 0 27 10 27 27S48 59 32 59 5 49 5 32 16 5 32 5z"/>
${m.ck ? `<ellipse cx="18" cy="38" rx="${m.ck > 1 ? 5 : 4}" ry="3" fill="#F2A5AE" opacity=".8"/><ellipse cx="46" cy="38" rx="${m.ck > 1 ? 5 : 4}" ry="3" fill="#F2A5AE" opacity=".8"/>` : ''}
<path class="st" d="${m.eyes}"/><path class="st" d="${m.mouth}"/>${m.drop ? '<path d="M50 14q4 6 0 8q-4-2 0-8z" fill="#9DBBD3"/>' : ''}${m.tear ? '<path d="M40 35q3 5 0 7q-3-2 0-7z" fill="#fff" opacity=".9"/>' : ''}</svg>`;
