// 实时天气：按城市取，按城市缓存 20 分钟
//   WEATHER_PROVIDER=qweather     和风天气（国内服务，需 QWEATHER_KEY 与控制台里的 QWEATHER_HOST）
//   WEATHER_PROVIDER=open-meteo   Open-Meteo（免密钥，服务器在境外）
//   WEATHER_PROVIDER=mock         本地开发用的模拟天气
// 未配置时功能关闭。只向服务商发送城市坐标，不发送任何用户信息。
const TTL = 20 * 60_000;

export function weatherConfig(env = process.env) {
  const provider = (env.WEATHER_PROVIDER || '').trim();
  if (provider === 'qweather') return { enabled: !!(env.QWEATHER_KEY && env.QWEATHER_HOST), provider, key: env.QWEATHER_KEY, host: String(env.QWEATHER_HOST || '').replace(/^https?:\/\//, '').replace(/\/$/, '') };
  if (provider === 'open-meteo' || provider === 'mock') return { enabled: true, provider };
  return { enabled: false };
}

// WMO 天气代码（Open-Meteo）
const WMO = [[[0], 'sun', '晴'], [[1], 'sun', '晴间少云'], [[2], 'cloud', '多云'], [[3], 'cloud', '阴'], [[45, 48], 'fog', '雾'],
  [[51, 53, 55, 56, 57], 'rain', '毛毛雨'], [[61, 80], 'rain', '小雨'], [[63, 81], 'rain', '中雨'], [[65, 82], 'rain', '大雨'], [[66, 67], 'rain', '冻雨'],
  [[71, 85], 'snow', '小雪'], [[73], 'snow', '中雪'], [[75, 86], 'snow', '大雪'], [[77], 'snow', '雪粒'], [[95], 'thunder', '雷阵雨'], [[96, 99], 'thunder', '雷雨伴冰雹']];
const fromWmo = code => { const m = WMO.find(([cs]) => cs.includes(code)); return m ? { kind: m[1], text: m[2] } : { kind: 'cloud', text: '多云' }; };
// 和风天气图标代码
function fromQIcon(icon, text) {
  const n = Number(icon);
  const kind = n === 100 || n === 150 ? 'sun' : n < 200 ? 'cloud' : n >= 302 && n <= 304 ? 'thunder' : n >= 300 && n < 400 ? 'rain' : n >= 400 && n < 500 ? 'snow' : n >= 500 && n < 600 ? 'fog' : 'cloud';
  return { kind, text: String(text || '').slice(0, 8) };
}

async function viaOpenMeteo(city) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=auto`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const c = (await r.json()).current;
  const w = fromWmo(c.weather_code);
  if (c.wind_speed_10m >= 39 && (w.kind === 'sun' || w.kind === 'cloud')) Object.assign(w, { kind: 'wind', text: '大风' });
  return { ...w, temp: Math.round(c.temperature_2m), isDay: !!c.is_day };
}
async function viaQWeather(cfg, city) {
  const r = await fetch(`https://${cfg.host}/v7/weather/now?location=${city.lon.toFixed(2)},${city.lat.toFixed(2)}`, { headers: { 'X-QW-Api-Key': cfg.key }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`qweather ${r.status}`);
  const d = await r.json();
  if (d.code !== '200') throw new Error(`qweather code ${d.code}`);
  const w = fromQIcon(d.now.icon, d.now.text);
  if (Number(d.now.windScale) >= 6 && (w.kind === 'sun' || w.kind === 'cloud')) w.kind = 'wind';
  const h = Number(String(d.now.obsTime || '').slice(11, 13)) || 12; // obsTime 带当地时区，直接取小时
  const night = [150, 151, 152, 153, 350, 351, 456, 457].includes(Number(d.now.icon));
  return { ...w, temp: Math.round(Number(d.now.temp)), isDay: !night && h >= 6 && h < 19 };
}
// 模拟天气：按城市与时间稳定变化，四季有别
export function mockWeather(city, now = new Date()) {
  const seed = [...city.k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + Math.floor(now / (3 * 3600_000));
  const r = (Math.sin(seed) * 43758.5453) % 1, x = Math.abs(r), m = now.getMonth();
  const winter = m === 11 || m <= 1, summer = m >= 5 && m <= 7;
  const kind = x < .32 ? 'sun' : x < .58 ? 'cloud' : x < .78 ? (winter && city.lat > 30 ? 'snow' : 'rain') : x < .86 ? (summer ? 'thunder' : 'fog') : x < .93 ? 'wind' : 'fog';
  const text = { sun: '晴', cloud: '多云', rain: '小雨', snow: '小雪', thunder: '雷阵雨', fog: '薄雾', wind: '有风' }[kind];
  const base = [4, 6, 11, 17, 22, 26, 29, 28, 24, 18, 11, 6][m] - (city.lat - 30) * .6;
  const h = now.getHours();
  return { kind, text, temp: Math.round(base + Math.sin((h - 9) / 24 * Math.PI * 2) * 4), isDay: h >= 6 && h < 18 };
}

export function createWeather(cfg) {
  const cache = new Map();
  return async function get(city) {
    const hit = cache.get(city.k);
    if (hit && hit.exp > Date.now()) return hit.data;
    try {
      const w = cfg.provider === 'mock' ? mockWeather(city) : cfg.provider === 'qweather' ? await viaQWeather(cfg, city) : await viaOpenMeteo(city);
      const data = { city: city.name, ...w, at: Date.now() };
      cache.set(city.k, { data, exp: Date.now() + TTL });
      return data;
    } catch (e) {
      if (hit) return hit.data; // 服务商暂时不通时，先用上一次的
      throw e;
    }
  };
}
