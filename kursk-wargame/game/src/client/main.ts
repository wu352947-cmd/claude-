import { Application, Container, Graphics, Text } from 'pixi.js';
import { ENGINE_VERSION, GameMeta } from '../engine';
import rawMeta from '../../data/game.json';

const meta = GameMeta.parse(rawMeta);

const COLORS = {
  board: 0xe9e2c9,
  hexLine: 0xa89f80,
  ink: 0x2b2a24,
  accent: 0x8c2f1e,
};

/** 画一个尖顶朝上的六角形（只是开场装饰，正式地图在冲刺 1 实现）。 */
function hexPath(g: Graphics, cx: number, cy: number, r: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return g.poly(pts);
}

async function start(): Promise<void> {
  const host = document.getElementById('app')!;
  const app = new Application();
  await app.init({ resizeTo: host, background: '#1d1f1b', antialias: true, autoDensity: true, resolution: devicePixelRatio });
  host.appendChild(app.canvas);

  const scene = new Container();
  app.stage.addChild(scene);

  const grid = new Graphics();
  const title = new Text({
    text: `Hello Kursk\n${meta.title.zh}`,
    style: { fontFamily: 'serif', fontSize: 44, fill: COLORS.ink, align: 'center', fontWeight: '700', lineHeight: 56 },
  });
  title.anchor.set(0.5);
  const sub = new Text({
    text: `${meta.subtitle.zh}  ·  引擎 v${ENGINE_VERSION}`,
    style: { fontFamily: 'sans-serif', fontSize: 16, fill: COLORS.accent, align: 'center' },
  });
  sub.anchor.set(0.5);
  scene.addChild(grid, title, sub);

  const layout = (): void => {
    const w = app.screen.width;
    const h = app.screen.height;
    const r = Math.max(22, Math.min(w, h) / 16);
    const dx = Math.sqrt(3) * r;
    const dy = 1.5 * r;
    grid.clear();
    for (let row = -1; row * dy < h + r; row++) {
      for (let col = -1; col * dx < w + dx; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0);
        hexPath(grid, cx, row * dy, r).fill(COLORS.board).stroke({ width: 1, color: COLORS.hexLine });
      }
    }
    title.style.fontSize = Math.max(28, Math.min(64, w / 12));
    title.style.lineHeight = title.style.fontSize * 1.3;
    title.position.set(w / 2, h / 2 - 20);
    sub.position.set(w / 2, h / 2 + title.height / 2 + 10);
  };
  layout();
  app.renderer.on('resize', layout);
}

void start();
