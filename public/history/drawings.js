// 九个时刻的线描。每一笔是一条 pathLength=1 的路径，脚本按滚动进度依次“落笔”。
// 画布统一为 400×400。

const ink = (d, cls = '') => `<path class="ink${cls ? ' ' + cls : ''}" pathLength="1" d="${d}"/>`;
const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;
const ellipse = (cx, cy, rx, ry) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
const f = n => +n.toFixed(1);

// 确定性的伪随机，保证每次画出来的泥板都一样
function seeded(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export const DRAWINGS = {
  wheat() {
    let s = ink('M200 392 C197 320 201 236 206 124');
    s += ink('M199 336 C226 306 258 290 292 246 C262 300 236 320 200 344', 'faint');
    for (let i = 0; i < 7; i++) {
      const y = 140 + i * 30;
      for (const k of [-1, 1]) {
        const tipX = 206 + k * (30 - i), tipY = y - 16;
        s += ink(`M206 ${y + 12} C${206 + k * 4} ${y - 6} ${206 + k * 20} ${y - 18} ${tipX} ${tipY} C${tipX - k * 2} ${y - 2} ${206 + k * 16} ${y + 10} 206 ${y + 12}`);
        s += ink(`M${tipX} ${tipY} L${tipX + k * (24 - i * 2)} ${tipY - 46 + i * 2}`, 'faint');
      }
    }
    s += ink('M206 126 C200 110 202 96 206 84 C210 96 212 110 206 126');
    s += ink('M206 84 L206 26', 'faint');
    return s;
  },

  tablet() {
    let s = ink('M112 66 Q98 66 98 82 L94 330 Q94 346 110 346 L298 342 Q312 342 312 328 L308 80 Q308 64 294 64 Z');
    const rows = [120, 172, 224, 276, 326];
    for (const y of rows.slice(0, 4)) s += ink(`M104 ${y} L304 ${y - 2}`, 'faint');
    const rnd = seeded(3200);
    // 每一行几组楔形：横楔、竖楔交替
    for (let r = 0; r < 5; r++) {
      const top = 76 + r * 52;
      let x = 118 + rnd() * 10;
      while (x < 280) {
        const vertical = rnd() < .45;
        if (vertical) {
          const cy = top + 8 + rnd() * 6;
          s += ink(`M${f(x - 6)} ${f(cy)} L${f(x + 6)} ${f(cy)} L${f(x)} ${f(cy + 9)} Z M${f(x)} ${f(cy + 9)} L${f(x)} ${f(cy + 26)}`);
          x += 16 + rnd() * 10;
        } else {
          const cy = top + 14 + rnd() * 12;
          s += ink(`M${f(x)} ${f(cy - 6)} L${f(x)} ${f(cy + 6)} L${f(x + 9)} ${f(cy)} Z M${f(x + 9)} ${f(cy)} L${f(x + 24 + rnd() * 8)} ${f(cy)}`);
          x += 36 + rnd() * 10;
        }
      }
    }
    return s;
  },

  pyramid() {
    let s = ink('M24 320 L376 320', 'faint');
    s += ink(circle(306, 96, 22), 'faint');
    s += ink('M80 320 L210 120 L340 320');
    s += ink('M210 120 L252 320');
    // 石层：左侧受光面的几道水平线
    for (const y of [170, 220, 270]) {
      const l = 210 - (y - 120) * 130 / 200, r = 210 + (y - 120) * 42 / 200;
      s += ink(`M${f(l)} ${y} L${f(r)} ${y}`, 'faint');
    }
    s += ink('M318 320 L346 276 L376 320');
    s += ink('M30 320 L54 284 L80 314', 'faint');
    return s;
  },

  empires() {
    // 左：长城的城垛；右：罗马的拱；中间一条丝路
    let s = ink('M24 308 L24 220 L44 220 L44 202 L64 202 L64 220 L84 220 L84 202 L104 202 L104 220 L124 220 L124 202 L144 202 L144 220 L164 220 L164 308');
    s += ink('M24 252 L164 252 M24 280 L164 280', 'faint');
    s += ink('M228 330 L228 196 A64 64 0 0 1 356 196 L356 330');
    s += ink('M254 330 L254 200 A38 38 0 0 1 330 200 L330 330');
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - i * Math.PI / 8;
      s += ink(`M${f(292 + Math.cos(a) * 38)} ${f(200 - Math.sin(a) * 38)} L${f(292 + Math.cos(a) * 64)} ${f(196 - Math.sin(a) * 64)}`, 'faint');
    }
    s += ink('M216 330 L368 330 M220 112 L364 112 L364 132 L220 132 Z');
    s += ink('M164 290 C184 266 196 314 216 286', 'faint');
    return s;
  },

  compass() {
    let s = `<g data-spin="140">`;
    s += ink(circle(200, 200, 156));
    s += ink(circle(200, 200, 132), 'faint');
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16, r1 = i % 8 === 0 ? 132 : i % 2 === 0 ? 140 : 146;
      s += ink(`M${f(200 + Math.cos(a) * r1)} ${f(200 + Math.sin(a) * r1)} L${f(200 + Math.cos(a) * 156)} ${f(200 + Math.sin(a) * 156)}`, 'faint');
    }
    s += ink('M200 76 L214 186 L324 200 L214 214 L200 324 L186 214 L76 200 L186 186 Z');
    s += ink('M200 76 L200 324 M76 200 L324 200', 'faint');
    s += ink('M272 128 L216 194 M128 128 L194 194 M128 272 L194 206 M272 272 L206 206', 'faint');
    s += ink(circle(200, 200, 10));
    return s + '</g>';
  },

  books() {
    // 三本完全一样的书：复制本身就是这件事的意义
    let s = '';
    const book = (dx, dy, cls) => {
      let b = ink(`M${200 + dx} ${132 + dy} Q${150 + dx} ${110 + dy} ${84 + dx} ${120 + dy} L${84 + dx} ${300 + dy} Q${150 + dx} ${290 + dy} ${200 + dx} ${312 + dy} Q${250 + dx} ${290 + dy} ${316 + dx} ${300 + dy} L${316 + dx} ${120 + dy} Q${250 + dx} ${110 + dy} ${200 + dx} ${132 + dy} L${200 + dx} ${312 + dy}`, cls);
      return b;
    };
    s += book(44, -56, 'faint');
    s += book(22, -28, 'faint');
    s += book(0, 0);
    for (let i = 0; i < 7; i++) {
      const y = 156 + i * 20;
      s += ink(`M104 ${y} Q140 ${y - 6} ${i === 6 ? 150 : 184} ${y - 2}`, 'faint');
      s += ink(`M216 ${y - 2} Q250 ${y - 6} ${i === 3 ? 260 : 296} ${y}`, 'faint');
    }
    return s;
  },

  gear() {
    const n = 24, r1 = 142, r2 = 160, cx = 200, cy = 200;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, w = Math.PI * 2 / n;
      const pt = (ang, r) => `${f(cx + Math.cos(ang) * r)} ${f(cy + Math.sin(ang) * r)}`;
      d += `${i ? 'L' : 'M'}${pt(a, r1)} L${pt(a + w * .18, r2)} L${pt(a + w * .48, r2)} L${pt(a + w * .66, r1)} `;
    }
    let s = `<g data-spin="300">`;
    s += ink(d + 'Z');
    s += ink(circle(cx, cy, 120), 'faint');
    s += ink(circle(cx, cy, 26));
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      s += ink(`M${f(cx + Math.cos(a) * 26)} ${f(cy + Math.sin(a) * 26)} L${f(cx + Math.cos(a) * 120)} ${f(cy + Math.sin(a) * 120)}`);
    }
    s += ink(circle(cx, cy, 8), 'faint');
    return s + '</g>';
  },

  moon() {
    let s = ink('M-10 346 Q200 270 410 346');
    s += ink(ellipse(92, 334, 24, 5), 'faint') + ink(ellipse(300, 330, 30, 6), 'faint') + ink(ellipse(222, 318, 12, 3), 'faint');
    s += ink(circle(312, 92, 32));
    s += ink('M312 60 A15 32 0 0 0 312 124', 'faint');
    s += ink('M286 116 C220 150 110 170 170 292', 'faint');
    s += ink('M156 302 L162 284 L180 284 L186 302 Z');
    s += ink('M164 284 L167 274 L177 274 L180 284');
    s += ink('M160 296 L146 310 M184 296 L198 310');
    for (const [x, y] of [[60, 70], [120, 40], [196, 96], [370, 190], [40, 190]]) s += ink(`M${x - 4} ${y} L${x + 4} ${y} M${x} ${y - 4} L${x} ${y + 4}`, 'faint');
    return s;
  },

  web() {
    const nodes = [[200, 200], [92, 118], [312, 96], [330, 252], [118, 306], [226, 52], [40, 220], [262, 352], [372, 150], [150, 196], [268, 170]];
    const edges = [[0, 9], [0, 10], [9, 1], [10, 2], [0, 3], [0, 4], [1, 5], [5, 2], [1, 6], [6, 4], [4, 7], [7, 3], [3, 8], [8, 2], [9, 4], [10, 3]];
    let s = '';
    for (const [a, b] of edges) s += ink(`M${nodes[a][0]} ${nodes[a][1]} L${nodes[b][0]} ${nodes[b][1]}`, 'faint');
    nodes.forEach(([x, y], i) => { s += ink(circle(x, y, i === 0 ? 12 : 6)); });
    return s;
  },
};
