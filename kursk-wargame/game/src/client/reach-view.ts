/** 可到达范围：选中单位能走到的格子着色；橙色 = 敌控制区（到此必须停止）。 */
import { Container, Graphics } from 'pixi.js';
import { type GameMap, type Reach, hexCorners, parseHexId } from '../engine';
import { PALETTE, PX_PER_KM } from './style';

export interface ReachView {
  root: Container;
  show(reach: Map<string, Reach> | null): void;
}

export function createReachView(map: GameMap): ReachView {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  return {
    root,
    show(reach) {
      g.clear();
      if (!reach) return;
      for (const [id, r] of reach) {
        const pts = hexCorners(map.grid, parseHexId(id)).flatMap((p) => [p.x * PX_PER_KM, p.y * PX_PER_KM]);
        g.poly(pts).fill({ color: r.zoc ? PALETTE.reachZoc : PALETTE.reach, alpha: 0.32 })
          .stroke({ width: 1.2, color: r.zoc ? PALETTE.reachZoc : PALETTE.reach, alpha: 0.8 });
      }
    },
  };
}
