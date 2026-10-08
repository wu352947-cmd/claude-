/**
 * 球面横轴墨卡托投影（k0 = 1）。与 tools/gis/georef.py 公式完全一致。
 * 世界坐标：公里，x 向东，y 向南（= 北坐标取负），原点在 (lat0, lon0)。
 */
import type { Point } from './hex';

const R_KM = 6371.0;
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

export interface Projection { lat0: number; lon0: number }

export function toWorld(p: Projection, lat: number, lon: number): Point {
  const phi = rad(lat), dl = rad(lon - p.lon0);
  const x = R_KM * Math.atanh(Math.sin(dl) * Math.cos(phi));
  const north = R_KM * (Math.atan2(Math.tan(phi), Math.cos(dl)) - rad(p.lat0));
  return { x, y: -north };
}

export function toLatLon(p: Projection, { x, y }: Point): { lat: number; lon: number } {
  const d = -y / R_KM + rad(p.lat0);
  const lat = deg(Math.asin(Math.sin(d) / Math.cosh(x / R_KM)));
  const lon = p.lon0 + deg(Math.atan2(Math.sinh(x / R_KM), Math.cos(d)));
  return { lat, lon };
}

/** 把十进制度格式化为 50°52′N 这样的度分。 */
export function formatDM(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  let d = Math.floor(a);
  let m = Math.round((a - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
}
