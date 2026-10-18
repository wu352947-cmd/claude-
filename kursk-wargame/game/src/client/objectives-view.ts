/** 胜利目标：格子右上角一颗星，颜色表示现在归哪一方（德军灰绿、苏军红），旁边写胜利点。 */
import { Container, Graphics, Text } from 'pixi.js';
import { type GameMap, type Side, hexCenter, parseHexId } from '../engine';
import { PALETTE, PX_PER_KM } from './style';

const K = PX_PER_KM;

export interface ObjectivesView {
  root: Container;
  show(objs: { hex: string; vp: number; owner: Side }[]): void;
}

function star(g: Graphics, x: number, y: number, r: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  return g.poly(pts);
}

export function createObjectivesView(map: GameMap): ObjectivesView {
  const root = new Container();
  return {
    root,
    show(objs) {
      for (const ch of root.removeChildren()) ch.destroy();
      const g = new Graphics();
      root.addChild(g);
      for (const o of objs) {
        const c = hexCenter(map.grid, parseHexId(o.hex));
        const x = (c.x + 0.95) * K, y = (c.y - 0.95) * K;
        star(g, x, y, 0.42 * K).fill(o.owner === 'DE' ? PALETTE.objectiveDE : PALETTE.objectiveSU).stroke({ width: 1.5, color: PALETTE.objectiveRing });
        const t = new Text({ text: String(o.vp), style: { fontSize: 0.36 * K, fontWeight: '700', fill: PALETTE.objectiveRing } });
        t.anchor.set(0.5);
        t.position.set(x, y + 0.04 * K);
        root.addChild(t);
      }
    },
  };
}
