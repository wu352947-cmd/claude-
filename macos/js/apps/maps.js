/* Maps — Leaflet with OpenStreetMap / Esri imagery tiles */
(function () {
  const { h, glyph } = OS;
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const PLACES = [
    { name: 'Apple Park', sub: '库比蒂诺 · 加利福尼亚', ll: [37.3349, -122.009], z: 16, g: 'star' },
    { name: '太浩湖', sub: '加利福尼亚 / 内华达', ll: [39.0968, -120.0324], z: 11, g: 'drop' },
    { name: '外滩', sub: '上海市黄浦区', ll: [31.2397, 121.4905], z: 15, g: 'location' },
    { name: '故宫博物院', sub: '北京市东城区', ll: [39.9163, 116.3972], z: 15, g: 'location' },
    { name: '西湖', sub: '浙江省杭州市', ll: [30.2431, 120.1503], z: 13, g: 'drop' },
    { name: 'Apple 三里屯', sub: '北京市朝阳区', ll: [39.9334, 116.4544], z: 17, g: 'cart' },
  ];

  OS.registerApp({
    id: 'maps', name: '地图', icon: 'maps', keywords: ['maps', 'map', 'location', '导航', '位置'], width: 1040, height: 660, minWidth: 560, minHeight: 360, singleton: true,
    description: '探索世界，查找地点与路线。',
    menus: (win) => [
      { title: '显示', items: [
        { label: '标准', checked: win && win.state_.layer === 'std', action: () => win && win.state_.setLayer('std') },
        { label: '卫星', checked: win && win.state_.layer === 'sat', action: () => win && win.state_.setLayer('sat') },
        { sep: true },
        { label: '放大', key: '⌘+', action: () => win && win.state_.map && win.state_.map.zoomIn() },
        { label: '缩小', key: '⌘-', action: () => win && win.state_.map && win.state_.map.zoomOut() },
        { label: '显示当前位置', key: '⌘L', action: () => win && win.state_.locate() },
      ] },
    ],
    create(win) {
      const st = (win.state_ = { layer: 'std', map: null });
      const list = h('div.mp-list');
      const search = h('input.mp-search', { id: 'maps-search', type: 'search', placeholder: '搜索地图' });
      const side = h('nav.side.mp-side', { 'data-drag': '' }, h('div.side-top', { 'data-drag': '' }), h('label.side-search', h('span', { html: glyph('search') }), search), list);
      const mapEl = h('div.mp-map');
      const ctrls = h('div.mp-ctrls',
        h('div.mp-ctl-group', h('button', { 'aria-label': '放大', html: glyph('plus'), onclick: () => st.map && st.map.zoomIn() }), h('button', { 'aria-label': '缩小', html: glyph('minus'), onclick: () => st.map && st.map.zoomOut() })),
        h('button.mp-ctl', { 'aria-label': '当前位置', title: '显示当前位置', html: glyph('location-outline'), onclick: () => st.locate() }),
        h('button.mp-ctl.mp-compass', { 'aria-label': '指南针', title: '朝北', html: '<span>N</span>' })
      );
      const layerSeg = h('div.mp-layers', ...[['std', '标准'], ['sat', '卫星']].map(([k, l]) => h('button' + (k === 'std' ? '.on' : ''), { dataset: { k }, onclick: () => st.setLayer(k) }, l)));
      const fallback = h('div.mp-fallback', { hidden: true }, h('div.mp-fb-grid'), h('div.mp-fb-card.glass', h('span', { html: glyph('map') }), h('b', '地图需要联网'), h('p', '地图图块来自 OpenStreetMap。连接互联网后重新打开“地图”。')));
      const root = h('div.app.maps', h('div.split', side, h('div.pane.mp-pane', h('div.mp-top', { 'data-drag': '' }), mapEl, ctrls, layerSeg, fallback)));
      win.body.appendChild(root);

      function renderList(items = PLACES, head = '个人收藏') {
        list.innerHTML = '';
        list.appendChild(h('div.sb-head', head));
        items.forEach((p) => {
          const row = h('div.mp-row', h('span.mp-pin', { html: glyph(p.g || 'location') }), h('div', h('b', p.name), h('small', p.sub || '')));
          row.onclick = () => st.fly(p);
          list.appendChild(row);
        });
        if (!items.length) list.appendChild(h('div.mp-empty', '没有找到结果'));
      }
      st.fly = (p) => {
        if (!st.map) return;
        st.map.flyTo(p.ll, p.z || 14, { duration: 1.4 });
        if (st.marker) st.marker.remove();
        st.marker = window.L.marker(p.ll, { icon: window.L.divIcon({ className: 'mp-marker', html: `<div class="mp-mk">${glyph(p.g || 'location')}</div>`, iconSize: [34, 42], iconAnchor: [17, 42] }) }).addTo(st.map).bindPopup(`<b>${OS.esc(p.name)}</b><br>${OS.esc(p.sub || '')}`);
        setTimeout(() => st.marker && st.marker.openPopup(), 1500);
      };
      st.setLayer = (k) => {
        st.layer = k;
        layerSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        if (!st.map) return;
        st.tiles && st.tiles.remove();
        st.tiles = k === 'sat'
          ? window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar' })
          : window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
        st.tiles.addTo(st.map);
        root.classList.toggle('sat', k === 'sat');
        let errors = 0;
        st.tiles.on('tileerror', () => ++errors > 6 && (fallback.hidden = false));
        st.tiles.on('tileload', () => (fallback.hidden = true));
      };
      st.locate = () => {
        if (!navigator.geolocation) return OS.toast('无法获取位置');
        navigator.geolocation.getCurrentPosition(
          (pos) => st.fly({ name: '当前位置', sub: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, ll: [pos.coords.latitude, pos.coords.longitude], z: 15, g: 'location' }),
          () => OS.toast('位置服务不可用或已被拒绝', 'location')
        );
      };
      search.addEventListener('keydown', async (e) => {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        const q = search.value.trim();
        if (!q) return renderList();
        const local = PLACES.filter((p) => (p.name + p.sub).includes(q));
        if (local.length) return renderList(local, '搜索结果'), st.fly(local[0]);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=zh-CN&q=${encodeURIComponent(q)}`);
          const data = await r.json();
          const items = data.map((d) => ({ name: d.display_name.split(',')[0], sub: d.display_name.split(',').slice(1, 3).join(','), ll: [+d.lat, +d.lon], z: 13 }));
          renderList(items, '搜索结果');
          items[0] && st.fly(items[0]);
        } catch (err) {
          renderList([], '搜索结果');
          OS.toast('搜索需要联网');
        }
      });
      renderList();

      OS.loadStyle(LEAFLET + 'leaflet.min.css');
      OS.loadScript(LEAFLET + 'leaflet.min.js')
        .then(() => {
          st.map = window.L.map(mapEl, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([39.0968, -120.0324], 10);
          st.setLayer('std');
          const compass = root.querySelector('.mp-compass');
          compass.onclick = () => st.map.setView(st.map.getCenter(), st.map.getZoom());
          win.on('resize', () => st.map.invalidateSize());
          setTimeout(() => st.map.invalidateSize(), 350);
        })
        .catch(() => (fallback.hidden = false));
    },
  });
})();
