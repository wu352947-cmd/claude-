/* Photos & Preview */
(function () {
  const { h, $$, glyph } = OS;
  const vfs = OS.vfs;

  const PLACES = { 'tahoe-light': '太浩湖', 'tahoe-dark': '太浩湖 · 夜', 'tahoe-beach-day': '太浩湖湖滩', 'tahoe-beach-dusk': '翡翠湾', 'tahoe-beach-night': '湖畔之夜', 'sequoia-light': '红杉国家公园', 'sequoia-dark': '红杉 · 暮色', 'sonoma-light': '索诺玛', 'sonoma-dark': '索诺玛 · 夜', 'catalina-day': '卡特琳娜岛' };

  function library() {
    const meta = OS.store.get('photos.meta', {});
    const files = [...new Set(OS.wallpapers.flatMap((w) => [w.light, w.dark]))];
    const base = Date.now();
    const list = files.map((f, i) => ({ id: f, src: OS.wallpaperSrc(f), thumb: OS.wallpaperThumb(f), title: PLACES[f] || f, date: base - (i * 9 + 3) * 86400000, album: 'wallpapers' }));
    // user images from Desktop, Pictures and Downloads (screenshots included)
    ['~/Desktop', '~/Pictures', '~/Downloads'].forEach((dir) => {
      (vfs.list(dir) || []).forEach((n) => {
        if (n.kind !== 'image' || list.some((x) => x.src === n.src)) return;
        list.push({ id: dir + '/' + n.name, src: n.src, thumb: OS.thumbOf(n.src), title: n.name.replace(/\.\w+$/, ''), date: n.mtime, album: n.name.startsWith('截屏') ? 'screenshots' : 'user', path: dir + '/' + n.name });
      });
    });
    list.forEach((p) => Object.assign(p, meta[p.id] || {}));
    return list.sort((a, b) => b.date - a.date);
  }
  const filterCss = (p) => ((p.br ?? 100) === 100 && (p.ct ?? 100) === 100 && (p.sat ?? 100) === 100 && !p.filter ? '' : `brightness(${p.br ?? 100}%) contrast(${p.ct ?? 100}%) saturate(${p.sat ?? 100}%) ${p.filter || ''}`);
  const FILTERS = [['', '原片'], ['saturate(140%) contrast(110%)', '鲜明'], ['sepia(35%) saturate(120%)', '暖色'], ['hue-rotate(-12deg) saturate(110%) brightness(103%)', '冷色'], ['grayscale(100%) contrast(115%)', '单色'], ['grayscale(100%) contrast(140%) brightness(95%)', '黑白'], ['sepia(60%) contrast(90%)', '怀旧']];

  OS.registerApp({
    id: 'photos', name: '照片', icon: 'photos', keywords: ['photos', 'pictures', 'images', '相册', '图片'], width: 1000, height: 640, minWidth: 560, minHeight: 360, singleton: true,
    description: '浏览、编辑和整理你的照片。',
    menus: (win) => [
      { title: '文件', items: [{ label: '导入…', key: '⇧⌘I', action: () => win && win.state_.importFile() }] },
      { title: '图像', items: [
        { label: '向左旋转', key: '⌘R', disabled: !win || !win.state_.viewing, action: () => win.state_.rotate() },
        { label: '个人收藏', key: '.', disabled: !win || !win.state_.viewing, action: () => win.state_.fav() },
        { label: '显示简介', key: '⌘I', disabled: !win || !win.state_.viewing, action: () => win.state_.info() },
      ] },
    ],
    onKey(win, e) {
      const st = win.state_;
      if (e.target.tagName === 'INPUT') return;
      if (st.viewing) {
        if (e.key === 'ArrowRight') st.step(1);
        else if (e.key === 'ArrowLeft') st.step(-1);
        else if (e.key === 'Escape' || e.key === ' ') st.close();
        else if (e.key === '.') st.fav();
      }
    },
    create(win) {
      const st = (win.state_ = { view: 'library', viewing: null, size: 150 });
      const sidebar = h('nav.side', { 'data-drag': '' });
      const grid = h('div.ph-grid');
      const title = h('div.tb-title');
      const sizeRange = h('input.ph-zoom', { id: 'photos-zoom', type: 'range', min: 90, max: 280, value: st.size, 'aria-label': '缩略图大小' });
      const seg = h('div.tb-group.seg.text', ...[['years', '年'], ['months', '月'], ['all', '所有照片']].map(([k, l]) => h('button.tb-btn' + (k === 'all' ? '.on' : ''), { dataset: { k }, onclick: (e) => ($$('button', seg).forEach((b) => b.classList.toggle('on', b === e.currentTarget)), (st.mode = k), render()) }, l)));
      const toolbar = h('div.tbar', { 'data-drag': '' }, title, h('div.tb-spacer', { 'data-drag': '' }), sizeRange, seg, h('div.tb-group', h('button.tb-btn', { title: '导入', 'aria-label': '导入', html: glyph('plus'), onclick: () => st.importFile() })));
      const stage = h('div.ph-stage');
      const root = h('div.app.photos', h('div.split', sidebar, h('div.pane', toolbar, h('div.ph-scroll', grid), stage)));
      win.body.appendChild(root);
      st.mode = 'all';

      const SIDE = [
        { head: '照片' },
        { id: 'library', label: '图库', g: 'photo' },
        { id: 'foryou', label: '精选集', g: 'sparkles' },
        { id: 'favorites', label: '个人收藏', g: 'heart' },
        { id: 'recent', label: '最近存储', g: 'clock' },
        { head: '相簿' },
        { id: 'wallpapers', label: '墙纸', g: 'desktop' },
        { id: 'screenshots', label: '截屏', g: 'camera' },
        { id: 'user', label: '我的图片', g: 'folder' },
      ];
      function renderSide() {
        sidebar.innerHTML = '';
        sidebar.appendChild(h('div.side-top', { 'data-drag': '' }));
        SIDE.forEach((s) => {
          if (s.head) return sidebar.appendChild(h('div.sb-head', s.head));
          const row = h('div.sb-item' + (st.view === s.id ? '.active' : ''), h('span.sb-ico', { html: glyph(s.g) }), h('span.sb-label', s.label));
          row.onclick = () => ((st.view = s.id), render());
          sidebar.appendChild(row);
        });
      }
      function items() {
        const all = library();
        if (st.view === 'favorites') return all.filter((p) => p.fav);
        if (st.view === 'recent') return all.slice(0, 8);
        if (['wallpapers', 'screenshots', 'user'].includes(st.view)) return all.filter((p) => p.album === st.view);
        return all;
      }
      function render() {
        renderSide();
        grid.innerHTML = '';
        grid.style.setProperty('--ph', st.size + 'px');
        const list = items();
        st.list = list;
        title.textContent = SIDE.find((s) => s.id === st.view).label;
        seg.hidden = st.view !== 'library';
        if (st.view === 'foryou') {
          grid.className = 'ph-foryou';
          const pick = list.slice(0, 6);
          grid.append(
            h('h2', '回忆'),
            h('div.ph-memories', pick.slice(0, 3).map((p, i) => {
              const card = h('div.ph-memory', { style: { backgroundImage: `url("${OS.thumbOf(p.src)}")` } }, h('div.ph-mem-txt', h('b', ['太浩湖之夏', '加州公路旅行', '黄昏时分'][i]), h('small', new Date(p.date).getFullYear() + ' 年')));
              card.onclick = () => st.open(list.indexOf(p));
              return card;
            })),
            h('h2', '精选照片'),
            h('div.ph-featured', pick.slice(3).map((p) => {
              const c = h('div.ph-feat', { style: { backgroundImage: `url("${p.thumb}")` } });
              c.onclick = () => st.open(list.indexOf(p));
              return c;
            }))
          );
          return;
        }
        grid.className = 'ph-grid';
        if (!list.length) return grid.appendChild(h('div.ph-empty', st.view === 'favorites' ? '点按照片上的心形图标，即可添加到个人收藏。' : '没有照片'));
        if (st.view === 'library' && st.mode !== 'all') {
          const groups = {};
          list.forEach((p) => {
            const d = new Date(p.date);
            const k = st.mode === 'years' ? d.getFullYear() + ' 年' : `${d.getFullYear()}年${d.getMonth() + 1}月`;
            (groups[k] = groups[k] || []).push(p);
          });
          Object.entries(groups).forEach(([k, ps]) => {
            const card = h('div.ph-group-card', { style: { backgroundImage: `url("${OS.thumbOf(ps[0].src)}")` } }, h('div.ph-group-txt', h('b', k), h('small', ps.length + ' 张照片')));
            card.onclick = () => ($$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.k === 'all')), (st.mode = 'all'), render());
            grid.appendChild(card);
          });
          grid.className = 'ph-groups';
          return;
        }
        list.forEach((p, i) => {
          const cell = h('div.ph-cell', { tabindex: 0 }, h('img', { src: p.thumb, alt: p.title, loading: 'lazy', draggable: 'false', style: { filter: filterCss(p), transform: p.rot ? `rotate(${p.rot}deg)` : '' } }), p.fav ? h('span.ph-heart', { html: glyph('heart-fill') }) : null);
          cell.ondblclick = () => st.open(i);
          cell.onclick = () => {
            $$('.ph-cell.sel', grid).forEach((c) => c.classList.remove('sel'));
            cell.classList.add('sel');
          };
          cell.oncontextmenu = (e) => OS.contextMenu(e, [
            { label: '打开', action: () => st.open(i) },
            { label: p.fav ? '取消个人收藏' : '个人收藏', action: () => setMeta(p, { fav: !p.fav }) },
            { label: '用作墙纸', action: () => setWallpaper(p) },
            { sep: true },
            { label: '拷贝照片', action: () => OS.toast('已拷贝照片', 'square-on-square') },
          ]);
          grid.appendChild(cell);
        });
      }
      function setMeta(p, patch) {
        const meta = OS.store.get('photos.meta', {});
        meta[p.id] = Object.assign(meta[p.id] || {}, patch);
        OS.store.set('photos.meta', meta);
        Object.assign(p, patch);
        render();
      }
      function setWallpaper(p) {
        const w = OS.wallpapers.find((x) => x.light === p.id || x.dark === p.id);
        if (w) return OS.setSetting('wallpaper', w.id);
        OS.store.set('customWallpaper', p.src);
        OS.setSetting('wallpaper', 'custom');
      }

      /* ---------- viewer & editor ---------- */
      st.open = (i) => {
        st.idx = i;
        st.viewing = st.list[i];
        stage.innerHTML = '';
        stage.classList.add('on');
        const p = st.viewing;
        const img = h('img.ph-big', { src: p.src, alt: p.title, style: { filter: filterCss(p), transform: p.rot ? `rotate(${p.rot}deg)` : '' } });
        const favBtn = h('button.tb-btn', { title: '个人收藏', 'aria-label': '个人收藏', html: glyph(p.fav ? 'heart-fill' : 'heart'), onclick: () => st.fav() });
        const bar = h('div.ph-vbar', { 'data-drag': '' },
          h('button.tb-btn', { 'aria-label': '返回', html: glyph('chevron-left'), onclick: () => st.close() }),
          h('div.ph-vtitle', h('b', p.title), h('small', OS.fmt.dateTime(new Date(p.date)))),
          h('div.tb-spacer', { 'data-drag': '' }),
          h('div.tb-group', favBtn, h('button.tb-btn', { title: '简介', 'aria-label': '简介', html: glyph('info'), onclick: () => st.info() }), h('button.tb-btn', { title: '旋转', 'aria-label': '旋转', html: glyph('rotate'), onclick: () => st.rotate() }), h('button.tb-btn', { title: '共享', 'aria-label': '共享', html: glyph('share'), onclick: () => setWallpaper(p) || OS.toast('已设为墙纸', 'desktop') })),
          h('button.btn.ph-edit-btn', { onclick: () => st.edit() }, '编辑')
        );
        const nav = (d, g) => h('button.ph-nav.' + (d < 0 ? 'l' : 'r'), { 'aria-label': d < 0 ? '上一张' : '下一张', html: glyph(g), onclick: () => st.step(d) });
        stage.append(bar, h('div.ph-canvas', img, nav(-1, 'chevron-left'), nav(1, 'chevron-right')));
        if (!OS.reducedMotion()) img.animate([{ transform: `scale(.6) ${p.rot ? `rotate(${p.rot}deg)` : ''}`, opacity: 0 }, { transform: `scale(1) ${p.rot ? `rotate(${p.rot}deg)` : ''}`, opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1)' });
      };
      st.close = () => {
        st.viewing = null;
        stage.classList.remove('on');
        stage.innerHTML = '';
        render();
      };
      st.step = (d) => st.list.length && st.open((st.idx + d + st.list.length) % st.list.length);
      st.fav = () => {
        const p = st.viewing;
        if (!p) return;
        setMeta(p, { fav: !p.fav });
        st.open(st.idx);
      };
      st.rotate = () => {
        const p = st.viewing;
        if (!p) return;
        setMeta(p, { rot: ((p.rot || 0) - 90) % 360 });
        st.open(st.idx);
      };
      st.info = () => {
        const p = st.viewing;
        if (!p) return;
        OS.alert({ title: p.title, icon: p.thumb, message: `${OS.fmt.dateTime(new Date(p.date))}\n${p.album === 'wallpapers' ? 'Apple 提供 · 6016 × 3384 · JPEG' : '来自“' + (p.path ? vfs.parentOf(p.path).replace(vfs.HOME, '~') : '图库') + '”'}` });
      };
      st.edit = () => {
        const p = st.viewing;
        const img = stage.querySelector('.ph-big');
        const draft = { br: p.br ?? 100, ct: p.ct ?? 100, sat: p.sat ?? 100, filter: p.filter || '' };
        const apply = () => (img.style.filter = filterCss(draft));
        const slider = (key, label, min, max) => {
          const r = h('input', { id: 'ph-' + key, type: 'range', min, max, value: draft[key] });
          r.oninput = () => ((draft[key] = +r.value), apply());
          return h('label.ph-adj', h('span', label), r);
        };
        const panel = h('div.ph-editpanel',
          h('div.ph-ep-head', '调整'),
          slider('br', '亮度', 40, 160), slider('ct', '对比度', 40, 180), slider('sat', '饱和度', 0, 200),
          h('div.ph-ep-head', '滤镜'),
          h('div.ph-filters', FILTERS.map(([f, l]) => {
            const b = h('button.ph-filter' + (draft.filter === f ? '.on' : ''), h('img', { src: p.thumb, alt: '', style: { filter: f } }), h('span', l));
            b.onclick = () => {
              draft.filter = f;
              $$('.ph-filter', panel).forEach((x) => x.classList.toggle('on', x === b));
              apply();
            };
            return b;
          })),
          h('div.ph-ep-btns',
            h('button.btn', { onclick: () => (panel.remove(), st.open(st.idx)) }, '还原'),
            h('button.btn.primary', { onclick: () => (setMeta(p, draft), panel.remove(), st.open(st.idx)) }, '完成')
          )
        );
        stage.querySelector('.ph-canvas').appendChild(panel);
      };
      st.importFile = () => {
        const inp = h('input', { type: 'file', accept: 'image/*', multiple: true });
        inp.onchange = () => [...inp.files].forEach((f) => {
          const r = new FileReader();
          r.onload = () => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              const s = Math.min(1, 1600 / img.width);
              c.width = img.width * s;
              c.height = img.height * s;
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              const url = c.toDataURL('image/jpeg', 0.82);
              vfs.write('~/Pictures/' + vfs.uniqueName('~/Pictures', f.name.replace(/\.\w+$/, '') + '.jpg'), null, { kind: 'image', src: url, size: f.size });
              render();
            };
            img.src = r.result;
          };
          r.readAsDataURL(f);
        });
        inp.click();
      };
      sizeRange.oninput = () => {
        st.size = +sizeRange.value;
        grid.style.setProperty('--ph', st.size + 'px');
      };
      const off = OS.on('vfs:change', () => !st.viewing && render());
      win.on('close', off);
      render();
    },
  });

  /* ---------------- Preview ---------------- */
  OS.registerApp({
    id: 'preview', name: '预览', icon: 'preview', keywords: ['preview', 'image', 'viewer', '图像'], width: 820, height: 580, minWidth: 360, minHeight: 260, alwaysNew: true,
    description: '查看并标注图像和 PDF。',
    menus: (win) => [
      { title: '显示', items: [
        { label: '实际大小', key: '⌘0', disabled: !win, action: () => win.state_.zoom(0) },
        { label: '放大', key: '⌘+', disabled: !win, action: () => win.state_.zoom(0.25) },
        { label: '缩小', key: '⌘-', disabled: !win, action: () => win.state_.zoom(-0.25) },
        { label: '缩放至适合大小', key: '⌘9', disabled: !win, action: () => win.state_.zoom('fit') },
        { sep: true },
        { label: '缩略图', disabled: !win, action: () => win.state_.toggleThumbs() },
      ] },
      { title: '工具', items: [
        { label: '向左旋转', key: '⌘L', disabled: !win, action: () => win.state_.rotate(-90) },
        { label: '向右旋转', key: '⌘R', disabled: !win, action: () => win.state_.rotate(90) },
        { label: '水平翻转', disabled: !win, action: () => win.state_.flip() },
        { sep: true },
        { label: '显示检查器', key: '⌘I', disabled: !win, action: () => win.state_.inspect() },
        { label: '设定为墙纸', disabled: !win, action: () => win.state_.setWallpaper() },
      ] },
    ],
    onKey(win, e) {
      const st = win.state_;
      if (OS.cmd(e) && (e.key === '=' || e.key === '+')) return e.preventDefault(), st.zoom(0.25);
      if (OS.cmd(e) && e.key === '-') return e.preventDefault(), st.zoom(-0.25);
      if (OS.cmd(e) && e.key === '0') return e.preventDefault(), st.zoom(0);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') st.step(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') st.step(-1);
    },
    create(win, args) {
      const path = args.path ? vfs.norm(args.path) : null;
      const st = (win.state_ = { path, scale: 'fit', rot: 0, flipX: false });
      const img = h('img.pv-img', { alt: '', draggable: 'false' });
      const canvas = h('div.pv-canvas', img);
      const thumbs = h('div.pv-thumbs');
      const name = h('div.pv-name');
      const toolbar = h('div.tbar', { 'data-drag': '' },
        h('div.tb-group', h('button.tb-btn', { 'aria-label': '缩略图', title: '显示缩略图', html: glyph('sidebar'), onclick: () => st.toggleThumbs() })),
        name,
        h('div.tb-spacer', { 'data-drag': '' }),
        h('div.tb-group', h('button.tb-btn', { 'aria-label': '缩小', html: glyph('zoom-out'), onclick: () => st.zoom(-0.25) }), h('button.tb-btn', { 'aria-label': '放大', html: glyph('zoom-in'), onclick: () => st.zoom(0.25) })),
        h('div.tb-group', h('button.tb-btn', { 'aria-label': '旋转', title: '向左旋转', html: glyph('rotate'), onclick: () => st.rotate(-90) }), h('button.tb-btn', { 'aria-label': '标记', title: '标记', html: glyph('pencil'), onclick: () => st.markup() }), h('button.tb-btn', { 'aria-label': '简介', html: glyph('info'), onclick: () => st.inspect() })),
        h('div.tb-group', h('button.tb-btn', { 'aria-label': '共享', html: glyph('share'), onclick: () => st.setWallpaper() }))
      );
      const root = h('div.app.preview', toolbar, h('div.pv-body', thumbs, canvas));
      win.body.appendChild(root);

      const siblings = () => (path ? (vfs.list(vfs.parentOf(st.path)) || []).filter((n) => n.kind === 'image').map((n) => vfs.norm(vfs.parentOf(st.path) + '/' + n.name)) : []);
      function load() {
        const n = st.path && vfs.resolve(st.path);
        if (!n) {
          canvas.innerHTML = '';
          canvas.appendChild(h('div.pv-empty', '没有打开的图像'));
          return;
        }
        img.src = n.src;
        name.textContent = n.name;
        win.setTitle(n.name);
        st.rot = 0;
        st.flipX = false;
        st.scale = 'fit';
        apply();
        thumbs.innerHTML = '';
        siblings().forEach((p) => {
          const t = h('button.pv-thumb' + (p === st.path ? '.on' : ''), h('img', { src: OS.thumbOf(vfs.resolve(p).src), alt: '', loading: 'lazy' }), h('span', vfs.baseName(p)));
          t.onclick = () => ((st.path = p), load());
          thumbs.appendChild(t);
        });
      }
      function apply() {
        const fit = st.scale === 'fit';
        img.classList.toggle('fit', fit);
        img.style.transform = `rotate(${st.rot}deg) scaleX(${st.flipX ? -1 : 1})`;
        img.style.width = fit ? '' : img.naturalWidth * st.scale + 'px';
      }
      st.zoom = (d) => {
        if (d === 'fit') st.scale = 'fit';
        else if (d === 0) st.scale = 1;
        else {
          const cur = st.scale === 'fit' ? img.clientWidth / (img.naturalWidth || 1) : st.scale;
          st.scale = Math.min(4, Math.max(0.1, cur + d * cur));
        }
        apply();
      };
      st.rotate = (d) => ((st.rot += d), apply());
      st.flip = () => ((st.flipX = !st.flipX), apply());
      st.step = (d) => {
        const s = siblings();
        if (s.length < 2) return;
        st.path = s[(s.indexOf(st.path) + d + s.length) % s.length];
        load();
      };
      st.toggleThumbs = () => root.classList.toggle('show-thumbs');
      st.inspect = () => {
        const n = vfs.resolve(st.path);
        OS.alert({ title: n.name, icon: n.src, message: `${img.naturalWidth} × ${img.naturalHeight} 像素\n${OS.fmt.size(n.size || 0)}\n${OS.fmt.dateTime(new Date(n.mtime))}` });
      };
      st.setWallpaper = () => {
        const n = vfs.resolve(st.path);
        if (!n) return;
        const w = OS.wallpapers.find((x) => n.src.includes(x.light) || n.src.includes(x.dark));
        if (w) OS.setSetting('wallpaper', w.id);
        else (OS.store.set('customWallpaper', n.src), OS.setSetting('wallpaper', 'custom'));
        OS.toast('已设为墙纸', 'desktop');
      };
      /* simple markup: draw strokes over the image and save a copy */
      st.markup = () => {
        if (canvas.querySelector('.pv-mark')) return;
        const c = h('canvas.pv-mark');
        const r = img.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        c.width = r.width / OS.scale;
        c.height = r.height / OS.scale;
        Object.assign(c.style, { left: (r.left - cr.left) / OS.scale + canvas.scrollLeft + 'px', top: (r.top - cr.top) / OS.scale + canvas.scrollTop + 'px' });
        const ctx = c.getContext('2d');
        ctx.lineCap = ctx.lineJoin = 'round';
        let color = '#ff3b30';
        const bar = h('div.pv-markbar', ...['#ff3b30', '#ffcc00', '#28cd41', '#007aff', '#ffffff', '#000000'].map((col) => h('button.pv-col', { style: { background: col }, 'aria-label': '颜色', onclick: () => (color = col) })),
          h('button.btn', { onclick: () => (c.remove(), bar.remove()) }, '取消'),
          h('button.btn.primary', { onclick: save }, '完成'));
        c.addEventListener('pointerdown', (e) => {
          const b = c.getBoundingClientRect();
          ctx.strokeStyle = color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo((e.clientX - b.left) / OS.scale, (e.clientY - b.top) / OS.scale);
          const mv = (ev) => (ctx.lineTo((ev.clientX - b.left) / OS.scale, (ev.clientY - b.top) / OS.scale), ctx.stroke());
          const upf = () => (window.removeEventListener('pointermove', mv), window.removeEventListener('pointerup', upf));
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', upf);
        });
        function save() {
          const out = document.createElement('canvas');
          out.width = img.naturalWidth;
          out.height = img.naturalHeight;
          const o = out.getContext('2d');
          o.drawImage(img, 0, 0);
          o.drawImage(c, 0, 0, out.width, out.height);
          let url;
          try {
            url = out.toDataURL('image/jpeg', 0.85);
          } catch (e) {
            return OS.toast('无法存储标记');
          }
          const n = vfs.resolve(st.path);
          const np = vfs.parentOf(st.path) + '/' + vfs.uniqueName(vfs.parentOf(st.path), n.name.replace(/(\.\w+)$/, ' 标记$1'));
          vfs.write(np, null, { kind: 'image', src: url, size: Math.round(url.length * 0.75) });
          c.remove();
          bar.remove();
          st.path = vfs.norm(np);
          load();
        }
        canvas.append(c, bar);
      };
      img.addEventListener('load', apply);
      img.addEventListener('dblclick', () => st.zoom(st.scale === 'fit' ? 0 : 'fit'));
      load();
    },
  });
})();
