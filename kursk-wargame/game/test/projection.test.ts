import { describe, expect, it } from 'vitest';
import { formatDM, toLatLon, toWorld } from '../src/engine';

const P = { lat0: 50.9, lon0: 36.7 };

describe('横轴墨卡托投影', () => {
  it('原点在 (lat0, lon0)', () => {
    const w = toWorld(P, 50.9, 36.7);
    expect(Math.abs(w.x)).toBeLessThan(1e-9);
    expect(Math.abs(w.y)).toBeLessThan(1e-9);
  });
  it('正反算互逆（误差 < 1 米）', () => {
    for (const [lat, lon] of [[50.4, 35.85], [51.4, 37.45], [50.6, 36.58], [51.21, 36.28]] as const) {
      const back = toLatLon(P, toWorld(P, lat, lon));
      expect(Math.abs(back.lat - lat) * 111_000).toBeLessThan(1);
      expect(Math.abs(back.lon - lon) * 70_000).toBeLessThan(1);
    }
  });
  it('方向：北边 y 更小（屏幕向上），东边 x 更大', () => {
    expect(toWorld(P, 51.2, 36.7).y).toBeLessThan(0);
    expect(toWorld(P, 50.9, 37.0).x).toBeGreaterThan(0);
  });
  it('纬度 1° 约 111 km', () => {
    const d = toWorld(P, 50.4, 36.7).y - toWorld(P, 51.4, 36.7).y;
    expect(d).toBeGreaterThan(110.5);
    expect(d).toBeLessThan(111.7);
  });
  it('度分格式', () => {
    expect(formatDM(50.8624, 'N', 'S')).toBe('50°52′N');
    expect(formatDM(36.9999, 'E', 'W')).toBe('37°00′E');
  });
});
