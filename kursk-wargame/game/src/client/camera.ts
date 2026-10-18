/** 地图拖动、滚轮缩放、双指缩放；轻点（未拖动）时回调 onTap。 */
import type { Container } from 'pixi.js';

export interface Camera {
  zoom(): number;
  fit(x0: number, y0: number, x1: number, y1: number): void;
  onChange(cb: () => void): void;
}

export function attachCamera(
  view: HTMLCanvasElement,
  world: Container,
  onTap: (screenX: number, screenY: number) => void,
  limits = { min: 0.15, max: 3 },
): Camera {
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number; t: number } | null = null;
  let moved = false;
  const listeners: (() => void)[] = [];
  const changed = (): void => listeners.forEach((l) => l());

  const zoomAt = (sx: number, sy: number, factor: number): void => {
    const s = Math.min(limits.max, Math.max(limits.min, world.scale.x * factor));
    const k = s / world.scale.x;
    world.position.set(sx - (sx - world.position.x) * k, sy - (sy - world.position.y) * k);
    world.scale.set(s);
    changed();
  };
  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) { downAt = { ...p, t: performance.now() }; moved = false; }
    if (pointers.size === 2) moved = true;
  });
  view.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    if (pointers.size === 1) {
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6) moved = true;
      if (moved) {
        world.position.set(world.position.x + p.x - prev.x, world.position.y + p.y - prev.y);
        changed();
      }
    } else if (pointers.size === 2) {
      const [oa, ob] = [...pointers.values()];
      pointers.set(e.pointerId, p);
      const [na, nb] = [...pointers.values()];
      const om = { x: (oa!.x + ob!.x) / 2, y: (oa!.y + ob!.y) / 2 };
      const nm = { x: (na!.x + nb!.x) / 2, y: (na!.y + nb!.y) / 2 };
      const od = Math.hypot(oa!.x - ob!.x, oa!.y - ob!.y);
      const nd = Math.hypot(na!.x - nb!.x, na!.y - nb!.y);
      world.position.set(world.position.x + nm.x - om.x, world.position.y + nm.y - om.y);
      if (od > 0) zoomAt(nm.x, nm.y, nd / od);
      changed();
      return;
    }
    pointers.set(e.pointerId, p);
  });
  const up = (e: PointerEvent): void => {
    const had = pointers.delete(e.pointerId);
    if (had && pointers.size === 0 && downAt && !moved && performance.now() - downAt.t < 600) {
      onTap(downAt.x, downAt.y);
    }
    if (pointers.size === 0) downAt = null;
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  return {
    zoom: () => world.scale.x,
    fit(x0, y0, x1, y1) {
      const w = view.clientWidth, h = view.clientHeight;
      const s = Math.min(limits.max, Math.max(limits.min, Math.min(w / (x1 - x0), h / (y1 - y0))));
      world.scale.set(s);
      world.position.set((w - (x1 - x0) * s) / 2 - x0 * s, (h - (y1 - y0) * s) / 2 - y0 * s);
      changed();
    },
    onChange(cb) { listeners.push(cb); },
  };
}
