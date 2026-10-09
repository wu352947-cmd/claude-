/** 地图上的算子图层：每格一个堆叠，后放的在上面，层层向左上错开，底下垫阴影；选中的单位加红框并提到最上面。 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { type GameMap, type PlacedUnit, hexCenter, parseHexId } from '../engine';
import { counterSvg, hiddenCounterSvg } from './counter-svg';
import { COUNTER_STYLE, PALETTE, PX_PER_KM } from './style';

const K = PX_PER_KM;

/** SVG → 位图纹理（同一单位同一步数只生成一次） */
const cache = new Map<string, Promise<Texture>>();
/** hidden = 未侦察的敌军（热座迷雾） */
function counterTexture(p: PlacedUnit, hidden: boolean): Promise<Texture> {
  const key = hidden ? `?|${p.formation.side}` : `${p.unit.id}|${p.steps}`;
  let t = cache.get(key);
  if (!t) {
    t = (async () => {
      const img = new Image();
      const svg = hidden ? hiddenCounterSvg(p.formation.side) : counterSvg(p.unit, p.formation, { steps: p.steps });
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const n = COUNTER_STYLE.texturePx;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = n;
      canvas.getContext('2d')!.drawImage(img, 0, 0, n, n);
      return Texture.from(canvas);
    })();
    cache.set(key, t);
  }
  return t;
}

export interface UnitsView {
  root: Container;
  /** 按新的堆叠重画（对局状态变化后调用）；hidden 里的单位画成"未侦察"，整格只画一个，不暴露层数 */
  render(stackMap: Map<string, PlacedUnit[]>, hidden?: Set<string>): Promise<void>;
  /** 高亮信息面板里选中的单位 */
  highlight(unitId: string | null): void;
}

export function createUnitsView(map: GameMap): UnitsView {
  const root = new Container();
  const layer = new Container();
  const size = COUNTER_STYLE.sizeKm * K;
  const off = COUNTER_STYLE.stackOffsetKm * K;
  const sprites = new Map<string, Sprite>();
  const ring = new Graphics();
  // 选中的单位即使压在堆叠下面，也临时在上面显示一份
  const lifted = new Sprite();
  lifted.visible = false;
  root.addChild(layer, lifted, ring);
  let current: string | null = null;
  let version = 0;
  const view: UnitsView = {
    root,
    async render(stackMap, hidden = new Set()) {
      const v = ++version;
      const items: [Graphics, Sprite, string][] = [];
      for (const [id, all] of stackMap) {
        const veiled = all.every((p) => hidden.has(p.unit.id));
        const stack = veiled ? all.slice(-1) : all;
        const c = hexCenter(map.grid, parseHexId(id));
        // 整个堆叠居中：最底层在右下，最顶层在左上
        const shift = ((stack.length - 1) * off) / 2;
        for (const [i, p] of stack.entries()) {
          const x = c.x * K - size / 2 + shift - i * off;
          const y = c.y * K - size / 2 + shift - i * off;
          const shadow = new Graphics().roundRect(x + 1.2, y + 1.6, size, size, size * 0.06).fill({ color: 0x000000, alpha: 0.35 });
          const s = new Sprite(await counterTexture(p, veiled));
          s.position.set(x, y);
          s.setSize(size, size);
          items.push([shadow, s, veiled ? `?${id}` : p.unit.id]);
        }
      }
      if (v !== version) return; // 期间又有新的状态，丢弃这次结果
      for (const ch of layer.removeChildren()) ch.destroy();
      sprites.clear();
      for (const [shadow, s, id] of items) { layer.addChild(shadow, s); sprites.set(id, s); }
      view.highlight(current);
    },
    highlight(unitId) {
      current = unitId;
      ring.clear();
      lifted.visible = false;
      const s = unitId ? sprites.get(unitId) : undefined;
      if (!s) return;
      lifted.texture = s.texture;
      lifted.position.copyFrom(s.position);
      lifted.setSize(size, size);
      lifted.visible = true;
      ring.roundRect(s.x - 1.5, s.y - 1.5, size + 3, size + 3, size * 0.08).stroke({ width: 2.5, color: PALETTE.select });
    },
  };
  return view;
}
