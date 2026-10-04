/* Procedural islands: value-noise fbm continents with ridged mountains. Heights in metres, sea level 0. */
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
function ridged(x, y, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { let n = 1 - Math.abs(vnoise(x * f, y * f)); s += a * n * n; f *= 2.1; a *= 0.5; }
  return s;
}
// Airbase pad: runway along x. The terrain is levelled to 14 m inside it and blends out over 500 m.
const AIRBASE = { x: -1000, z: -500, y: 14, len: 3400, wid: 900 };
function terrainH(x, z) {
  const h = rawTerrainH(x, z);
  const d = Math.max(Math.abs(x - AIRBASE.x) - AIRBASE.len / 2, Math.abs(z - AIRBASE.z) - AIRBASE.wid / 2);
  if (d >= 500) return h;
  const t = d <= 0 ? 1 : 1 - d / 500, k = t * t * (3 - 2 * t);
  return h + (AIRBASE.y - h) * k;
}
function rawTerrainH(x, z) {
  const X = x / 4200, Z = z / 4200;
  const c = fbm(X + 3.1, Z - 1.7, 4);
  const land = c < -0.06 ? 0 : Math.min(1, (c + 0.06) / 0.3);
  const sea = -140 + 120 * Math.max(0, Math.min(1, (c + 0.35) / 0.29));
  if (land <= 0) return sea;
  const l = land * land * (3 - 2 * land);
  const m = ridged(X * 2.2 + 7, Z * 2.2 - 3, 5);
  const inner = Math.min(1, Math.max(0, (c - 0.04) / 0.36));
  const h = 12 + fbm(X * 7, Z * 7, 3) * 45 + Math.pow(m, 2.3) * 2300 * inner * inner * (3 - 2 * inner);
  return sea + (h - sea) * l;
}
