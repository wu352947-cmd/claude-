/* macOS Tahoe Web — core runtime: namespace, storage, settings, events, helpers */
(function () {
  'use strict';

  const OS = (window.OS = {
    version: '26.1',
    build: '25B78',
    user: { name: '访客', short: 'guest', host: 'MacBook-Pro' },
    apps: {},
    scale: 1,
  });

  /* ---------- tiny DOM helpers ---------- */
  OS.$ = (sel, root = document) => root.querySelector(sel);
  OS.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** h('div.cls#id', {attrs}, children...) */
  OS.h = function h(tag, attrs, ...kids) {
    const m = String(tag).match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, (_, t, v) => {
        if (t === '.') el.classList.add(v);
        else el.id = v;
      });
    }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const p in v) p.startsWith('--') ? el.style.setProperty(p, v[p]) : (el.style[p] = v[p]);
        }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) return k.forEach(add);
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  };

  /* Components pass optional children (cond ? node : null); skip empty values instead of printing "null" */
  ['append', 'prepend'].forEach((fn) => {
    const native = Element.prototype[fn];
    Element.prototype[fn] = function (...nodes) {
      return native.apply(this, nodes.filter((n) => n != null && n !== false));
    };
  });

  OS.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  OS.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  OS.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  OS.debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  OS.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  OS.icon = (name) => `assets/icons/${name}.png`;
  OS.reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || OS.store.get('reduceMotion', false);

  /* ---------- storage (always guarded) ---------- */
  OS.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('macos.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('macos.' + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem('macos.' + key);
      } catch (e) {}
    },
  };
  OS.session = {
    get(k) {
      try {
        return sessionStorage.getItem('macos.' + k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        sessionStorage.setItem('macos.' + k, v);
      } catch (e) {}
    },
  };

  /* ---------- event bus ---------- */
  const listeners = {};
  OS.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), () => OS.off(ev, fn));
  OS.off = (ev, fn) => (listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn));
  OS.emit = (ev, data) => (listeners[ev] || []).slice().forEach((f) => {
    try {
      f(data);
    } catch (e) {
      console.error(e);
    }
  });

  /* ---------- settings ---------- */
  const DEFAULTS = {
    appearance: 'auto', // light | dark | auto
    accent: 'multicolor',
    highlight: 'accent',
    wallpaper: 'tahoe',
    dynamicWallpaper: true,
    dockSize: 52,
    dockMagnify: true,
    dockMagSize: 88,
    dockPosition: 'bottom',
    dockAutohide: false,
    dockShowRecents: true,
    minimizeEffect: 'genie',
    menubarBg: false,
    showBattery: true,
    clock24: true,
    clockSeconds: false,
    brightness: 100,
    volume: 60,
    nightShift: false,
    wifi: true,
    bluetooth: true,
    airdrop: 'contacts',
    focus: false,
    trueTone: true,
    sounds: true,
    uiSounds: true,
    reduceTransparency: false,
    tinting: true,
    iconStyle: 'default',
    desktopIcons: true,
    stageManager: false,
    hotCorners: { tl: 'none', tr: 'notifications', bl: 'launchpad', br: 'desktop' },
    userName: '访客',
    language: 'zh-CN',
    doubleClickTitle: 'zoom',
  };
  OS.settings = Object.assign({}, DEFAULTS, OS.store.get('settings', {}));
  OS.user.name = OS.settings.userName || OS.user.name;
  OS.setSetting = (key, value) => {
    OS.settings[key] = value;
    OS.store.set('settings', OS.settings);
    OS.emit('setting', { key, value });
    OS.emit('setting:' + key, value);
  };
  OS.resetSettings = () => {
    OS.store.remove('settings');
    OS.settings = Object.assign({}, DEFAULTS);
  };

  OS.accents = {
    multicolor: { light: '#007aff', dark: '#0a84ff', label: '多色' },
    blue: { light: '#007aff', dark: '#0a84ff', label: '蓝色' },
    purple: { light: '#a550a7', dark: '#bf5af2', label: '紫色' },
    pink: { light: '#f74f9e', dark: '#ff6eb4', label: '粉色' },
    red: { light: '#ff3b30', dark: '#ff453a', label: '红色' },
    orange: { light: '#ff9500', dark: '#ff9f0a', label: '橙色' },
    yellow: { light: '#ffcc00', dark: '#ffd60a', label: '黄色' },
    green: { light: '#28cd41', dark: '#32d74b', label: '绿色' },
    graphite: { light: '#8c8c8c', dark: '#98989d', label: '石墨色' },
  };

  /* Wallpapers ship with the page (copied from the macOS system images). Dark variants are used in dark appearance when "dynamic" is on. */
  OS.wallpapers = [
    { id: 'tahoe', name: 'macOS Tahoe', light: 'tahoe-light', dark: 'tahoe-dark', dynamic: true },
    { id: 'tahoe-beach', name: 'Tahoe 湖滩', light: 'tahoe-beach-day', dark: 'tahoe-beach-night', dynamic: true },
    { id: 'tahoe-dusk', name: 'Tahoe 黄昏', light: 'tahoe-beach-dusk', dark: 'tahoe-beach-dusk' },
    { id: 'sequoia', name: 'macOS Sequoia', light: 'sequoia-light', dark: 'sequoia-dark', dynamic: true },
    { id: 'sonoma', name: 'macOS Sonoma', light: 'sonoma-light', dark: 'sonoma-dark', dynamic: true },
    { id: 'catalina', name: 'Catalina 白昼', light: 'catalina-day', dark: 'catalina-day' },
  ];
  OS.wallpaperSrc = (file) => `assets/wallpapers/${file}.jpg`;
  OS.wallpaperThumb = (file) => `assets/thumbs/${file}.jpg`;

  /* ---------- dark mode resolution ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  OS.isDark = () => {
    const a = OS.settings.appearance;
    if (a === 'dark') return true;
    if (a === 'light') return false;
    const host = document.documentElement.getAttribute('data-theme');
    if (host === 'dark') return true;
    if (host === 'light') return false;
    return mq.matches;
  };
  mq.addEventListener && mq.addEventListener('change', () => OS.emit('appearance'));
  new MutationObserver(() => OS.emit('appearance')).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  /* ---------- app registry ---------- */
  OS.registerApp = (def) => {
    def.menus = def.menus || [];
    OS.apps[def.id] = def;
  };

  /* ---------- formatting ---------- */
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  OS.fmt = {
    week: (d) => WEEK[d.getDay()],
    time(d, secs) {
      const h = d.getHours(),
        m = String(d.getMinutes()).padStart(2, '0'),
        s = String(d.getSeconds()).padStart(2, '0');
      if (OS.settings.clock24) return `${h}:${m}${secs ? ':' + s : ''}`;
      const ap = h < 12 ? '上午' : '下午';
      return `${ap}${h % 12 || 12}:${m}${secs ? ':' + s : ''}`;
    },
    menubar(d) {
      return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]} ${OS.fmt.time(d, OS.settings.clockSeconds)}`;
    },
    date(d) {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    },
    dateTime(d) {
      return `${OS.fmt.date(d)} ${OS.fmt.time(d)}`;
    },
    relative(ts) {
      const diff = (Date.now() - ts) / 1000;
      if (diff < 60) return '现在';
      if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
      const d = new Date(ts),
        now = new Date();
      if (d.toDateString() === now.toDateString()) return OS.fmt.time(d);
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      if (d.toDateString() === y.toDateString()) return '昨天';
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    },
    size(b) {
      if (b < 1000) return b + ' 字节';
      if (b < 1e6) return (b / 1e3).toFixed(1).replace(/\.0$/, '') + ' KB';
      if (b < 1e9) return (b / 1e6).toFixed(1).replace(/\.0$/, '') + ' MB';
      return (b / 1e9).toFixed(2) + ' GB';
    },
  };

  /* ---------- safe arithmetic (Spotlight / Calculator / Terminal) ---------- */
  OS.calc = function (input) {
    const src = String(input)
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, 'pi')
      .replace(/\s+/g, '');
    if (!src || !/[\d)]/.test(src) || /[^0-9a-z.+\-*/^%(),!]/i.test(src)) return null;
    let i = 0;
    const fns = {
      sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, ln: Math.log, log: Math.log10,
      abs: Math.abs, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
      asin: Math.asin, acos: Math.acos, atan: Math.atan,
    };
    const consts = { pi: Math.PI, e: Math.E };
    const peek = () => src[i];
    function num() {
      const m = src.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i);
      if (!m) throw 0;
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function atom() {
      if (peek() === '(') {
        i++;
        const v = expr();
        if (peek() !== ')') throw 0;
        i++;
        return v;
      }
      if (peek() === '-') {
        i++;
        return -factor();
      }
      if (peek() === '+') {
        i++;
        return factor();
      }
      const w = src.slice(i).match(/^[a-z]+/i);
      if (w) {
        const name = w[0].toLowerCase();
        i += w[0].length;
        if (name in consts) return consts[name];
        if (name in fns) {
          if (peek() !== '(') throw 0;
          return fns[name](atom());
        }
        throw 0;
      }
      return num();
    }
    function postfix() {
      let v = atom();
      while (peek() === '!' || peek() === '%') {
        if (peek() === '!') {
          i++;
          if (v < 0 || v > 170 || v % 1) throw 0;
          let r = 1;
          for (let k = 2; k <= v; k++) r *= k;
          v = r;
        } else {
          // percent only as postfix when followed by operator/end
          const nx = src[i + 1];
          if (nx && /[\d(a-z]/i.test(nx)) break;
          i++;
          v = v / 100;
        }
      }
      return v;
    }
    function factor() {
      const b = postfix();
      if (peek() === '^') {
        i++;
        return Math.pow(b, factor());
      }
      return b;
    }
    function term() {
      let v = factor();
      for (;;) {
        const c = peek();
        if (c === '*') { i++; v *= factor(); }
        else if (c === '/') { i++; v /= factor(); }
        else if (c === '%') { i++; v %= factor(); }
        else if (c === '(' || (c && /[a-z]/i.test(c))) v *= factor();
        else return v;
      }
    }
    function expr() {
      let v = term();
      for (;;) {
        const c = peek();
        if (c === '+') { i++; v += term(); }
        else if (c === '-') { i++; v -= term(); }
        else return v;
      }
    }
    try {
      const v = expr();
      if (i !== src.length || !isFinite(v)) return null;
      return v;
    } catch (e) {
      return null;
    }
  };
  OS.formatNumber = (v) => {
    if (v == null || !isFinite(v)) return '错误';
    if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0)) return v.toExponential(6).replace(/\.?0+e/, 'e');
    const r = Math.round(v * 1e10) / 1e10;
    return r.toLocaleString('en-US', { maximumFractionDigits: 10 });
  };

  /* ---------- keyboard: ⌘ is Meta on Mac, Ctrl elsewhere ---------- */
  OS.isMacHost = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  OS.cmd = (e) => (OS.isMacHost ? e.metaKey : e.ctrlKey || e.metaKey);

  /* ---------- lazy script loader (cdnjs only) ---------- */
  const loaded = {};
  OS.loadScript = (src) =>
    (loaded[src] =
      loaded[src] ||
      new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => {
          delete loaded[src];
          rej(new Error('load failed: ' + src));
        };
        document.head.appendChild(s);
      }));
  OS.loadStyle = (href) => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  };
})();
