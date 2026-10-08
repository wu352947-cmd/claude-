/**
 * 地图"装饰"：外框、下方图边带（标题、比例尺、指北针、图例）。印刷兵棋地图的精致感有一半来自这里。
 */
import { Container, Graphics, Text } from 'pixi.js';
import { FONT_LATIN, FONT_SERIF, FONT_TITLE, PALETTE, PX_PER_KM } from './style';
import type { WorldBounds } from './terrain-render';

const K = PX_PER_KM;
export const MARGIN_KM = 9;

function text(s: string, size: number, opts: { serif?: boolean; latin?: boolean; title?: boolean; bold?: boolean; color?: number } = {}): Text {
  return new Text({
    text: s,
    style: {
      fontFamily: opts.title ? FONT_TITLE : opts.latin ? FONT_LATIN : opts.serif ? FONT_SERIF : 'system-ui, sans-serif',
      fontSize: size, fontWeight: opts.bold ? '700' : '400', fill: opts.color ?? PALETTE.marginInk,
      letterSpacing: opts.bold ? size * 0.08 : 0,
    },
    resolution: 3,
  });
}

export function drawFurniture(b: WorldBounds, title: string, subtitle: string): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const x0 = b.x0 * K, x1 = b.x1 * K, y0 = b.y0 * K, y1 = b.y1 * K;
  const band = MARGIN_KM * K;
  // 图边带底色与外框
  g.rect(x0, y1, x1 - x0, band).fill(PALETTE.margin);
  g.rect(x0 - 0.6 * K, y0 - 0.6 * K, x1 - x0 + 1.2 * K, y1 - y0 + band + 1.2 * K).stroke({ width: 1.2 * K, color: PALETTE.frame });
  g.rect(x0, y0, x1 - x0, y1 - y0).stroke({ width: 0.06 * K, color: PALETTE.frame });
  g.moveTo(x0, y1).lineTo(x1, y1).stroke({ width: 0.12 * K, color: PALETTE.frame });

  const cy = y1 + band / 2;
  // 标题
  const t = text(title, 3 * K, { title: true });
  t.anchor.set(0, 1); t.position.set(x0 + 2 * K, cy + 0.2 * K);
  const st = text(subtitle, 0.95 * K, { serif: true, color: 0x4f5752 });
  st.anchor.set(0, 0); st.position.set(x0 + 2.1 * K, cy + 0.7 * K);
  root.addChild(t, st);

  // 比例尺：0–3–6–9–12 km，黑白相间
  const sx = x0 + (x1 - x0) * 0.4, sy = cy - 0.2 * K;
  for (let i = 0; i < 4; i++) g.rect(sx + i * 3 * K, sy, 3 * K, 0.35 * K).fill(i % 2 ? 0xffffff : PALETTE.marginInk);
  g.rect(sx, sy, 12 * K, 0.35 * K).stroke({ width: 0.04 * K, color: PALETTE.marginInk });
  for (let i = 0; i <= 4; i++) {
    const l = text(String(i * 3), 0.6 * K, { latin: true });
    l.anchor.set(0.5, 1); l.position.set(sx + i * 3 * K, sy - 0.15 * K); root.addChild(l);
  }
  const km = text('公里 · 每格 3 公里', 0.6 * K, { serif: true });
  km.anchor.set(0, 0); km.position.set(sx, sy + 0.6 * K); root.addChild(km);

  // 指北针
  const nx = sx + 16.5 * K, ny = cy;
  const r = 1.5 * K;
  g.circle(nx, ny, r * 0.9).stroke({ width: 0.04 * K, color: PALETTE.marginInk });
  g.poly([nx, ny - r, nx + r * 0.28, ny, nx, ny + r, nx - r * 0.28, ny]).stroke({ width: 0.04 * K, color: PALETTE.marginInk });
  g.poly([nx, ny - r, nx + r * 0.28, ny, nx, ny]).fill(PALETTE.marginInk);
  g.poly([nx, ny + r, nx - r * 0.28, ny, nx, ny]).fill(PALETTE.marginInk);
  const n = text('N', 0.85 * K, { latin: true });
  n.anchor.set(0.5, 1); n.position.set(nx, ny - r - 0.05 * K); root.addChild(n);

  // 图例
  const lx = sx + 21 * K;
  const items: [string, (x: number, y: number) => void][] = [
    ['林地', (x, y) => g.rect(x, y - 0.3 * K, 1.2 * K, 0.6 * K).fill(PALETTE.woods).stroke({ width: 0.05 * K, color: PALETTE.woodsEdge })],
    ['村庄', (x, y) => g.circle(x + 0.6 * K, y, 0.18 * K).fill(0xffffff).stroke({ width: 0.05 * K, color: PALETTE.townDotEdge })],
    ['河流', (x, y) => g.moveTo(x, y).lineTo(x + 1.2 * K, y).stroke({ width: 0.22 * K, color: PALETTE.river })],
    ['溪流', (x, y) => g.moveTo(x, y).lineTo(x + 1.2 * K, y).stroke({ width: 0.08 * K, color: PALETTE.river })],
    ['主干公路', (x, y) => g.moveTo(x, y).lineTo(x + 1.2 * K, y).stroke({ width: 0.14 * K, color: PALETTE.roadPrimary })],
    ['公路', (x, y) => g.moveTo(x, y).lineTo(x + 1.2 * K, y).stroke({ width: 0.07 * K, color: PALETTE.road })],
    ['土路', (x, y) => {
      for (let i = 0; i < 3; i++) g.moveTo(x + i * 0.45 * K, y).lineTo(x + (i * 0.45 + 0.25) * K, y);
      g.stroke({ width: 0.05 * K, color: PALETTE.track });
    }],
    ['铁路', (x, y) => {
      g.moveTo(x, y).lineTo(x + 1.2 * K, y).stroke({ width: 0.06 * K, color: PALETTE.rail });
      for (let i = 0; i < 4; i++) g.moveTo(x + (0.15 + i * 0.3) * K, y - 0.1 * K).lineTo(x + (0.15 + i * 0.3) * K, y + 0.1 * K);
      g.stroke({ width: 0.04 * K, color: PALETTE.rail });
    }],
  ];
  items.forEach(([label, sym], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = lx + col * 7 * K, y = cy - 1.1 * K + row * 2.2 * K;
    sym(x, y);
    const l = text(label, 0.7 * K, { serif: true });
    l.anchor.set(0, 0.5); l.position.set(x + 1.6 * K, y); root.addChild(l);
  });
  return root;
}
