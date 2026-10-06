/* Weather — live data from Open-Meteo (no key), with an animated sky */
(function () {
  const { h, $$, glyph } = OS;
  const CITIES = [
    { name: '上海', lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' },
    { name: '北京', lat: 39.9, lon: 116.4, tz: 'Asia/Shanghai' },
    { name: '杭州', lat: 30.27, lon: 120.15, tz: 'Asia/Shanghai' },
    { name: '库比蒂诺', lat: 37.32, lon: -122.03, tz: 'America/Los_Angeles' },
    { name: '南太浩湖', lat: 38.94, lon: -119.98, tz: 'America/Los_Angeles' },
    { name: '东京', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' },
    { name: '伦敦', lat: 51.51, lon: -0.13, tz: 'Europe/London' },
  ];
  // WMO weather codes
  const CODES = {
    0: ['晴朗', 'clear'], 1: ['大致晴朗', 'clear'], 2: ['局部多云', 'cloudy'], 3: ['阴天', 'overcast'],
    45: ['雾', 'fog'], 48: ['雾凇', 'fog'], 51: ['毛毛雨', 'rain'], 53: ['毛毛雨', 'rain'], 55: ['毛毛雨', 'rain'],
    61: ['小雨', 'rain'], 63: ['中雨', 'rain'], 65: ['大雨', 'rain'], 66: ['冻雨', 'rain'], 67: ['冻雨', 'rain'],
    71: ['小雪', 'snow'], 73: ['中雪', 'snow'], 75: ['大雪', 'snow'], 77: ['雪粒', 'snow'],
    80: ['阵雨', 'rain'], 81: ['阵雨', 'rain'], 82: ['强阵雨', 'rain'], 85: ['阵雪', 'snow'], 86: ['阵雪', 'snow'],
    95: ['雷暴', 'storm'], 96: ['雷暴伴冰雹', 'storm'], 99: ['雷暴伴冰雹', 'storm'],
  };
  const cond = (c) => CODES[c] || ['多云', 'cloudy'];
  const ICON = {
    clear: (day) => day ? '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="7" fill="#ffd60a"/><g stroke="#ffd60a" stroke-width="2.4" stroke-linecap="round"><path d="M16 2.5v3.5M16 26v3.5M2.5 16H6M26 16h3.5M6.5 6.5l2.4 2.4M23.1 23.1l2.4 2.4M6.5 25.5l2.4-2.4M23.1 8.9l2.4-2.4"/></g></svg>' : '<svg viewBox="0 0 32 32"><path d="M21 22.5A9.5 9.5 0 0 1 12.6 6.7 10 10 0 1 0 25.4 20a9.4 9.4 0 0 1-4.4 2.5z" fill="#e5e5ea"/></svg>',
    cloudy: (day) => `<svg viewBox="0 0 32 32">${day ? '<circle cx="11" cy="11" r="6" fill="#ffd60a"/>' : '<path d="M14 15a6 6 0 0 1-5.4-8.5A6.5 6.5 0 1 0 17 14.2 6 6 0 0 1 14 15z" fill="#e5e5ea"/>'}<path d="M10 26h14a5 5 0 0 0 .5-10 7 7 0 0 0-13.4 1.8A4.2 4.2 0 0 0 10 26z" fill="#fff"/></svg>`,
    overcast: () => '<svg viewBox="0 0 32 32"><path d="M8 25h16a5.5 5.5 0 0 0 .6-11 8 8 0 0 0-15.3 2A4.6 4.6 0 0 0 8 25z" fill="#f2f2f7"/></svg>',
    fog: () => '<svg viewBox="0 0 32 32"><path d="M9 18h14a5 5 0 0 0 .5-10 7 7 0 0 0-13.4 1.8A4.2 4.2 0 0 0 9 18z" fill="#f2f2f7"/><g stroke="#f2f2f7" stroke-width="2.2" stroke-linecap="round"><path d="M6 22h20M9 26h14"/></g></svg>',
    rain: () => '<svg viewBox="0 0 32 32"><path d="M9 19h14a5 5 0 0 0 .5-10 7 7 0 0 0-13.4 1.8A4.2 4.2 0 0 0 9 19z" fill="#f2f2f7"/><g stroke="#64d2ff" stroke-width="2.2" stroke-linecap="round"><path d="M11 22l-1.5 4M16 22l-1.5 4M21 22l-1.5 4"/></g></svg>',
    snow: () => '<svg viewBox="0 0 32 32"><path d="M9 18h14a5 5 0 0 0 .5-10 7 7 0 0 0-13.4 1.8A4.2 4.2 0 0 0 9 18z" fill="#f2f2f7"/><g fill="#fff"><circle cx="11" cy="23" r="1.6"/><circle cx="16" cy="26" r="1.6"/><circle cx="21" cy="23" r="1.6"/></g></svg>',
    storm: () => '<svg viewBox="0 0 32 32"><path d="M9 18h14a5 5 0 0 0 .5-10 7 7 0 0 0-13.4 1.8A4.2 4.2 0 0 0 9 18z" fill="#d1d1d6"/><path d="M16.5 18l-4 6h3.5l-2 5.5 6-7.5h-3.6l2.1-4z" fill="#ffd60a"/></svg>',
  };
  const icon = (code, day = true) => ICON[cond(code)[1]](day);

  function sample(city) {
    // deterministic sample when offline, clearly labeled in the UI
    const seedN = city.name.charCodeAt(0);
    const base = 14 + (seedN % 12);
    const now = new Date();
    const hours = Array.from({ length: 24 }, (_, i) => ({ t: new Date(now.getTime() + i * 3600000), temp: base + Math.round(5 * Math.sin((now.getHours() + i - 9) / 24 * Math.PI * 2)), code: [0, 1, 2, 3, 61, 2][(i + seedN) % 6] }));
    const days = Array.from({ length: 10 }, (_, i) => ({ t: new Date(now.getTime() + i * 86400000), hi: base + 5 + ((i * 7 + seedN) % 5), lo: base - 4 + ((i * 3 + seedN) % 4), code: [1, 2, 61, 0, 3, 80, 0, 2, 71, 1][(i + seedN) % 10] }));
    return { sample: true, temp: hours[0].temp, feels: hours[0].temp - 1, code: 2, isDay: now.getHours() > 6 && now.getHours() < 19, humidity: 62, wind: 11, pressure: 1014, visibility: 16, uv: 4, sunrise: '06:12', sunset: '17:48', hours, days };
  }
  async function fetchWeather(city) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,pressure_msl,visibility&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=10`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json();
    const nowIdx = d.hourly.time.findIndex((t) => new Date(t) >= new Date(Date.now() - 3600000));
    return {
      temp: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code, isDay: !!d.current.is_day, humidity: d.current.relative_humidity_2m,
      wind: d.current.wind_speed_10m, pressure: Math.round(d.current.pressure_msl), visibility: Math.round((d.current.visibility || 10000) / 1000), uv: Math.round(d.daily.uv_index_max[0] || 0),
      sunrise: d.daily.sunrise[0].slice(11, 16), sunset: d.daily.sunset[0].slice(11, 16),
      hours: d.hourly.time.slice(Math.max(0, nowIdx), Math.max(0, nowIdx) + 24).map((t, i) => ({ t: new Date(t), temp: d.hourly.temperature_2m[nowIdx + i], code: d.hourly.weather_code[nowIdx + i] })),
      days: d.daily.time.map((t, i) => ({ t: new Date(t), hi: d.daily.temperature_2m_max[i], lo: d.daily.temperature_2m_min[i], code: d.daily.weather_code[i] })),
    };
  }

  OS.registerApp({
    id: 'weather', name: '天气', icon: 'weather', keywords: ['weather', 'forecast', '天气', '气温'], width: 900, height: 620, minWidth: 560, minHeight: 420, singleton: true,
    description: '查看全球各地的实时天气与预报。',
    create(win) {
      const st = (win.state_ = { city: OS.store.get('weather.city', 0), data: {} });
      const list = h('div.wx-list');
      const side = h('nav.side.wx-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), list);
      const sky = h('canvas.wx-sky');
      const main = h('div.wx-main');
      const pane = h('div.pane.wx-pane', sky, h('div.wx-scroll', { 'data-drag': '' }, main));
      const root = h('div.app.weather', h('div.split', side, pane));
      win.body.appendChild(root);

      async function load(i) {
        const city = CITIES[i];
        if (st.data[i] && Date.now() - st.data[i].at < 600000) return st.data[i];
        let data;
        try {
          data = await fetchWeather(city);
        } catch (e) {
          data = sample(city);
        }
        data.at = Date.now();
        st.data[i] = data;
        if (i === st.city) OS.store.set('weather.cache', { city: city.name, temp: data.temp, cond: cond(data.code)[0], hi: data.days[0].hi, lo: data.days[0].lo, sample: !!data.sample });
        return data;
      }
      function renderList() {
        list.innerHTML = '';
        CITIES.forEach((c, i) => {
          const d = st.data[i];
          const row = h('div.wx-row' + (i === st.city ? '.on' : ''), { style: { background: d ? gradient(d) : 'linear-gradient(135deg,#4a90e2,#2a6fc9)' } },
            h('div', h('b', c.name), h('small', d ? new Date().toLocaleTimeString('zh-CN', { timeZone: c.tz, hour: '2-digit', minute: '2-digit' }) : '…'), h('small.wx-row-cond', d ? cond(d.code)[0] : '')),
            h('div.wx-row-r', h('span.wx-row-t', d ? Math.round(d.temp) + '°' : '--'), h('small', d ? `最高 ${Math.round(d.days[0].hi)}° 最低 ${Math.round(d.days[0].lo)}°` : ''))
          );
          row.onclick = () => {
            st.city = i;
            OS.store.set('weather.city', i);
            render();
          };
          list.appendChild(row);
        });
      }
      function gradient(d) {
        const k = cond(d.code)[1];
        if (!d.isDay) return 'linear-gradient(180deg,#0b1a3a,#1d2f5c 60%,#2b3f73)';
        return { clear: 'linear-gradient(180deg,#2f80ed,#56ccf2)', cloudy: 'linear-gradient(180deg,#5b86c5,#8fb3dd)', overcast: 'linear-gradient(180deg,#5d6d7e,#8899aa)', fog: 'linear-gradient(180deg,#8e9eab,#b6c2cc)', rain: 'linear-gradient(180deg,#3f5468,#62778a)', snow: 'linear-gradient(180deg,#8ea8c3,#c4d3e3)', storm: 'linear-gradient(180deg,#2c3e50,#4b5d70)' }[k];
      }
      async function render() {
        renderList();
        main.innerHTML = '';
        main.appendChild(h('div.wx-loading', '正在载入天气…'));
        const d = await load(st.city);
        const c = CITIES[st.city];
        renderList();
        pane.style.background = gradient(d);
        startSky(cond(d.code)[1], d.isDay);
        const allLo = Math.min(...d.days.map((x) => x.lo)), allHi = Math.max(...d.days.map((x) => x.hi));
        const tile = (g, title, value, sub) => h('div.wx-tile', h('div.wx-tile-h', h('span', { html: glyph(g) }), title), h('div.wx-tile-v', value), sub ? h('div.wx-tile-s', sub) : null);
        main.innerHTML = '';
        main.append(
          h('div.wx-hero',
            h('div.wx-city', c.name, h('span', { html: glyph('location') })),
            h('div.wx-temp', Math.round(d.temp) + '°'),
            h('div.wx-cond', cond(d.code)[0]),
            h('div.wx-hl', `最高 ${Math.round(d.days[0].hi)}°  最低 ${Math.round(d.days[0].lo)}°`),
            d.sample ? h('div.wx-sample', '无法连接天气服务，以下为示例数据') : null
          ),
          h('div.wx-card',
            h('div.wx-card-h', `${cond(d.code)[0]}，体感温度 ${Math.round(d.feels)}°，风速 ${Math.round(d.wind)} 公里/小时。`),
            h('div.wx-hours', ...d.hours.map((x, i) => h('div.wx-hour', h('small', i === 0 ? '现在' : x.t.getHours() + '时'), h('span.wx-ic', { html: icon(x.code, x.t.getHours() > 6 && x.t.getHours() < 19) }), h('b', Math.round(x.temp) + '°'))))
          ),
          h('div.wx-grid',
            h('div.wx-card.wx-days',
              h('div.wx-card-t', h('span', { html: glyph('calendar') }), '10 日天气预报'),
              ...d.days.map((x, i) => h('div.wx-day',
                h('b.wx-dname', i === 0 ? '今天' : '周' + '日一二三四五六'[x.t.getDay()]),
                h('span.wx-ic', { html: icon(x.code) }),
                h('small', Math.round(x.lo) + '°'),
                h('div.wx-range', h('i', { style: { left: ((x.lo - allLo) / (allHi - allLo || 1)) * 100 + '%', right: (1 - (x.hi - allLo) / (allHi - allLo || 1)) * 100 + '%' } }), i === 0 ? h('em', { style: { left: ((d.temp - allLo) / (allHi - allLo || 1)) * 100 + '%' } }) : null),
                h('b', Math.round(x.hi) + '°')
              ))
            ),
            h('div.wx-tiles',
              tile('sun', '紫外线指数', d.uv, d.uv < 3 ? '低' : d.uv < 6 ? '中等' : '高'),
              tile('sun', '日出', d.sunrise, '日落：' + d.sunset),
              tile('wind', '风', Math.round(d.wind) + ' 公里/时', ''),
              tile('drop', '湿度', d.humidity + '%', '露点约 ' + Math.round(d.temp - (100 - d.humidity) / 5) + '°'),
              tile('thermo', '体感温度', Math.round(d.feels) + '°', d.feels < d.temp ? '风使体感更凉' : '与实际温度相近'),
              tile('eye', '能见度', d.visibility + ' 公里', d.visibility > 10 ? '非常清晰' : '一般'),
              tile('gauge', '气压', d.pressure + ' hPa', ''),
              tile('clock', '当地时间', new Date().toLocaleTimeString('zh-CN', { timeZone: c.tz, hour: '2-digit', minute: '2-digit' }), c.tz)
            )
          ),
          h('div.wx-credit', d.sample ? '示例数据' : '数据来源：Open-Meteo.com')
        );
        win.setTitle('天气 — ' + c.name);
      }

      /* animated sky particles */
      let raf, parts = [];
      function startSky(kind, day) {
        cancelAnimationFrame(raf);
        const ctx = sky.getContext('2d');
        const resize = () => {
          sky.width = sky.clientWidth;
          sky.height = sky.clientHeight;
        };
        resize();
        const W = () => sky.width, H = () => sky.height;
        parts = [];
        const n = kind === 'rain' || kind === 'storm' ? 140 : kind === 'snow' ? 90 : kind === 'cloudy' || kind === 'overcast' || kind === 'fog' ? 7 : day ? 0 : 80;
        for (let i = 0; i < n; i++) parts.push({ x: Math.random() * W(), y: Math.random() * H(), v: Math.random() + 0.5, r: Math.random() });
        let flash = 0;
        const loop = () => {
          if (!sky.isConnected) return;
          if (sky.width !== sky.clientWidth) resize();
          ctx.clearRect(0, 0, W(), H());
          parts.forEach((p) => {
            if (kind === 'rain' || kind === 'storm') {
              ctx.strokeStyle = 'rgba(255,255,255,.35)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x - 2, p.y + 12 * p.v);
              ctx.stroke();
              p.y += 14 * p.v;
              p.x -= 1;
            } else if (kind === 'snow') {
              ctx.fillStyle = 'rgba(255,255,255,.85)';
              ctx.beginPath();
              ctx.arc(p.x, p.y, 1 + p.r * 2.2, 0, 7);
              ctx.fill();
              p.y += 0.8 * p.v;
              p.x += Math.sin(p.y / 30) * 0.5;
            } else if (n && n < 10) {
              const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 160);
              g.addColorStop(0, 'rgba(255,255,255,.22)');
              g.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = g;
              ctx.fillRect(p.x - 160, p.y - 160, 320, 320);
              p.x += 0.15 * p.v;
              if (p.x > W() + 160) p.x = -160;
            } else {
              ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(Date.now() / 900 + p.r * 10))})`;
              ctx.fillRect(p.x, p.y * 0.6, 1.4, 1.4);
            }
            if (p.y > H()) (p.y = -10), (p.x = Math.random() * W());
          });
          if (kind === 'storm' && Math.random() < 0.004) flash = 1;
          if (flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
            ctx.fillRect(0, 0, W(), H());
            flash -= 0.08;
          }
          raf = requestAnimationFrame(loop);
        };
        if (!OS.reducedMotion()) loop();
      }
      win.on('close', () => cancelAnimationFrame(raf));
      render();
      // load the rest of the list in the background
      CITIES.forEach((c, i) => i !== st.city && load(i).then(renderList));
    },
  });
})();
