/* ÆON — scroll choreography, instruments and small interactions */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var narrow = function () { return innerWidth < 761; };

  if (!window.gsap || !window.ScrollTrigger) { root.classList.add('is-ready'); return; }
  gsap.registerPlugin(ScrollTrigger);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  /* ————————————————————————— the collection ————————————————————————— */
  var WORKS = {
    nefertiti: { no: 'I.1', cn: '奈费尔提蒂胸像', en: 'Bust of Nefertiti', who: '图特摩斯工坊 · Thutmose', when: 'c. 1345 BC', what: '石灰岩、石膏、彩绘', size: 'h. 48 cm', where: 'Neues Museum, Berlin', inv: 'ÄM 21300' },
    pyramids: { no: 'I.2', cn: '吉萨金字塔群', en: 'Pyramids of Giza', who: '古王国第四王朝', when: 'c. 2560 BC', what: '石灰岩、花岗岩', size: 'Khufu, h. 146.6 m (原高)', where: 'Giza · N 29°58′ E 31°08′', inv: '' },
    tut: { no: 'I.3', cn: '图坦卡蒙黄金面具', en: 'Mask of Tutankhamun', who: '新王国第十八王朝', when: 'c. 1323 BC', what: '黄金、青金石、玻璃', size: '54 × 39 cm · 10.23 kg', where: 'Cairo', inv: 'JE 60672' },
    milo: { no: 'II.1', cn: '米洛的维纳斯', en: 'Venus de Milo', who: '安条克的亚历山德罗斯', when: 'c. 150–125 BC', what: '帕罗斯大理石', size: 'h. 204 cm', where: 'Musée du Louvre, Paris', inv: 'Ma 399' },
    parthenon: { no: 'II.2', cn: '帕特农神庙', en: 'Parthenon', who: 'Iktinos & Kallikrates', when: '447–432 BC', what: '彭特利克大理石', size: '69.5 × 30.9 m', where: 'Acropolis, Athens', inv: '' },
    nike: { no: 'II.3', cn: '萨莫色雷斯的胜利女神', en: 'Nike of Samothrace', who: '罗得岛工坊', when: 'c. 190 BC', what: '帕罗斯大理石', size: 'h. 244 cm', where: 'Musée du Louvre, Paris', inv: 'Ma 2369' },
    pantheon: { no: 'II.4', cn: '万神殿内景', en: 'Interior of the Pantheon, Rome', who: 'Giovanni Paolo Panini', when: 'c. 1734 · 穹顶 125 AD', what: '布面油画', size: '128 × 99 cm · 穹顶直径 43.3 m', where: 'National Gallery of Art, Washington', inv: '1939.1.24' },
    qianli: { no: 'III.1', cn: '千里江山图', en: 'A Thousand Li of Rivers and Mountains', who: '王希孟 · Wang Ximeng', when: '1113', what: '绢本设色', size: '51.5 × 1191.5 cm', where: '故宫博物院 · Palace Museum, Beijing', inv: '' },
    qingming: { no: 'III.2', cn: '清明上河图（局部）', en: 'Along the River During the Qingming Festival', who: '张择端 · Zhang Zeduan', when: '12th c.', what: '绢本淡设色', size: '24.8 × 528.7 cm', where: '故宫博物院 · Palace Museum, Beijing', inv: '' },
    venus: { no: 'IV.1', cn: '维纳斯的诞生', en: 'La Nascita di Venere', who: 'Sandro Botticelli', when: 'c. 1485', what: '布面蛋彩', size: '172.5 × 278.9 cm', where: 'Galleria degli Uffizi, Firenze', inv: 'Inv. 1890 n. 878' },
    monalisa: { no: 'IV.2', cn: '蒙娜丽莎', en: 'La Gioconda', who: 'Leonardo da Vinci', when: 'c. 1503–1519', what: '白杨木板油画', size: '77 × 53 cm', where: 'Musée du Louvre, Paris', inv: 'INV 779' },
    adam: { no: 'IV.3', cn: '创造亚当', en: 'Creazione di Adamo', who: 'Michelangelo Buonarroti', when: 'c. 1512', what: '湿壁画', size: '280 × 570 cm', where: 'Cappella Sistina, Città del Vaticano', inv: '' },
    athens: { no: 'IV.4', cn: '雅典学院', en: 'Scuola di Atene', who: 'Raffaello Sanzio', when: '1509–1511', what: '湿壁画', size: '500 × 770 cm', where: 'Stanza della Segnatura, Città del Vaticano', inv: '' },
    pearl: { no: 'IV.5', cn: '戴珍珠耳环的少女', en: 'Meisje met de parel', who: 'Johannes Vermeer', when: 'c. 1665', what: '布面油画', size: '44.5 × 39 cm', where: 'Mauritshuis, Den Haag', inv: 'inv. 670' },
    wave: { no: 'V.1', cn: '神奈川冲浪里', en: 'The Great Wave off Kanagawa', who: '葛饰北斋 · Katsushika Hokusai', when: 'c. 1831', what: '木版画', size: '25.7 × 37.9 cm', where: '《富岳三十六景》之一', inv: '' },
    wanderer: { no: 'V.2', cn: '雾海上的旅人', en: 'Der Wanderer über dem Nebelmeer', who: 'Caspar David Friedrich', when: 'c. 1818', what: '布面油画', size: '94.8 × 74.8 cm', where: 'Hamburger Kunsthalle', inv: 'HK-5161' },
    temeraire: { no: 'V.3', cn: '被拖去解体的战舰无畏号', en: 'The Fighting Temeraire', who: 'J. M. W. Turner', when: '1839', what: '布面油画', size: '90.7 × 121.6 cm', where: 'National Gallery, London', inv: 'NG524' },
    ninthwave: { no: 'V.4', cn: '九级浪', en: 'The Ninth Wave', who: 'Ivan Aivazovsky', when: '1850', what: '布面油画', size: '221 × 332 cm', where: 'State Russian Museum, St Petersburg', inv: '' },
    impression: { no: 'V.5', cn: '日出·印象', en: 'Impression, soleil levant', who: 'Claude Monet', when: '1872', what: '布面油画', size: '48 × 63 cm', where: 'Musée Marmottan Monet, Paris', inv: 'inv. 4014' },
    starry: { no: 'V.6', cn: '星月夜', en: 'De sterrennacht', who: 'Vincent van Gogh', when: '1889', what: '布面油画', size: '73.7 × 92.1 cm', where: 'MoMA, New York', inv: '472.1941' },
    kiss: { no: 'V.7', cn: '吻', en: 'Der Kuss', who: 'Gustav Klimt', when: '1907–1908', what: '布面油画、金箔', size: '180 × 180 cm', where: 'Belvedere, Wien', inv: 'Inv. 912' },
    earthrise: { no: 'VI.1', cn: '地出', en: 'Earthrise', who: 'William Anders · Apollo 8', when: '24 Dec 1968', what: 'Hasselblad 500 EL · 70 mm 胶片', size: '月球轨道 · 距地约 38 万 km', where: 'NASA', inv: 'AS08-14-2383' },
    pillars: { no: 'VI.2', cn: '创生之柱', en: 'Pillars of Creation', who: 'Hubble · WFC3/UVIS', when: '2014', what: '鹰状星云 M16', size: '距地约 6,500 光年', where: 'NASA / ESA', inv: 'heic1501a' },
    marble: { no: 'VI.3', cn: '蓝色弹珠', en: 'The Blue Marble', who: 'Apollo 17 crew', when: '7 Dec 1972', what: 'Hasselblad · 80 mm 镜头', size: '距地约 29,000 km', where: 'NASA', inv: 'AS17-148-22727' }
  };
  var ORDER = Object.keys(WORKS);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $$('[data-tag]').forEach(function (el) {
    var w = WORKS[el.dataset.tag];
    if (!w) return;
    el.innerHTML =
      '<span class="tag__no">' + w.no + '</span>' +
      '<span class="tag__t">' + esc(w.cn) + '<em>' + esc(w.en) + '</em></span>' +
      '<span class="tag__m">' + esc(w.when) + ' · ' + esc(w.what) + ' · ' + esc(w.size) + '</span>' +
      '<span class="tag__m">' + esc(w.where) + (w.inv ? ' · ' + esc(w.inv) : '') + '</span>';
  });

  var finIndex = $('#finIndex');
  ORDER.forEach(function (id) {
    var w = WORKS[id];
    var li = document.createElement('li');
    li.innerHTML = '<span>' + w.no + '</span><button type="button" data-open="' + id + '">' + esc(w.cn) + '</button><span>' + esc(w.when.split(' · ')[0]) + '</span>';
    finIndex.appendChild(li);
  });

  /* ————————————————————————— film grain ————————————————————————— */
  (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 160;
    var x = c.getContext('2d'), d = x.createImageData(160, 160);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    root.style.setProperty('--noise', 'url(' + c.toDataURL('image/png') + ')');
  })();

  /* vertical CJK set as columns of blocks (web subsets of Noto lack vertical metrics) */
  $$('.vt').forEach(function (el) {
    var lines = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = '';
    lines.forEach(function (line) {
      var col = document.createElement('span');
      col.className = 'vc';
      col.setAttribute('aria-hidden', 'true');
      Array.from(line.replace(/<[^>]+>/g, '').trim()).forEach(function (ch) {
        var c = document.createElement('span');
        c.textContent = ch === '\u3000' ? '\u00a0' : ch;
        col.appendChild(c);
      });
      el.appendChild(col);
    });
    var sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = el.getAttribute('aria-label') || lines.join('，').replace(/<[^>]+>/g, '');
    el.removeAttribute('aria-label');
    el.appendChild(sr);
  });

  /* ————————————————————————— text splitting ————————————————————————— */
  var TOKEN = /[㐀-鿿豈-﫿][　-〿＀-￯]*|[　-〿＀-￯]+|[^\s　-〿㐀-鿿豈-﫿＀-￯]+|\s+/g;
  function split(el) {
    if (el._words) return el._words;
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          (n.textContent.match(TOKEN) || []).forEach(function (tk) {
            if (/^\s+$/.test(tk)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'sw';
            var i = document.createElement('span'); i.className = 'si'; i.textContent = tk;
            w.appendChild(i); frag.appendChild(w); words.push(i);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(el);
    el._words = words;
    return words;
  }

  /* ————————————————————————— smooth scroll ————————————————————————— */
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.3, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, wheelMultiplier: .9, touchMultiplier: 1.5 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  function lock(on) {
    if (lenis) on ? lenis.stop() : lenis.start();
    else document.body.style.overflow = on ? 'hidden' : '';
  }
  function go(target, instant) {
    if (lenis) lenis.scrollTo(target, { duration: instant ? 0 : 2.4, immediate: !!instant, force: true, easing: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; } });
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduce || instant ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce || instant ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var t = id === 'top' ? 0 : document.getElementById(id);
    if (t === null) return;
    e.preventDefault();
    if (menuOpen) closeMenu(function () { go(t); }); else go(t);
  });

  /* ————————————————————————— hero: silk + astrolabe ————————————————————————— */
  var silk = window.AeonGL && AeonGL.silk($('#heroGL'), { scale: narrow() ? .5 : .62, still: reduce });

  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  (function buildAstrolabe() {
    var svg = $('#astrolabe');
    var defs = svgEl('defs', {}, svg);
    svgEl('path', { id: 'ringPath', d: 'M -338 0 A 338 338 0 1 1 338 0 A 338 338 0 1 1 -338 0' }, defs);

    var outer = svgEl('g', { class: 'a-outer' }, svg);
    [492, 470, 432].forEach(function (r) { svgEl('circle', { r: r, class: 'draw', pathLength: 1 }, outer); });
    var d = '';
    for (var i = 0; i < 360; i += 2) {
      var a = i * Math.PI / 180, len = i % 30 === 0 ? 24 : i % 10 === 0 ? 14 : 7;
      d += 'M' + (Math.cos(a) * 470).toFixed(1) + ' ' + (Math.sin(a) * 470).toFixed(1) + 'L' + (Math.cos(a) * (470 - len)).toFixed(1) + ' ' + (Math.sin(a) * (470 - len)).toFixed(1);
    }
    svgEl('path', { d: d, class: 'ticks' }, outer);
    ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'].forEach(function (t, i) {
      var a = (i * 30 - 90) * Math.PI / 180, x = (Math.cos(a) * 408).toFixed(1), y = (Math.sin(a) * 408).toFixed(1);
      svgEl('text', { x: x, y: y, class: 'num', 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: 'rotate(' + i * 30 + ' ' + x + ' ' + y + ')' }, outer).textContent = t;
    });

    var mid = svgEl('g', { class: 'a-mid' }, svg);
    [366, 312].forEach(function (r) { svgEl('circle', { r: r, class: 'draw', pathLength: 1 }, mid); });
    var tx = svgEl('text', { class: 'ring-text' }, mid);
    var tp = svgEl('textPath', { href: '#ringPath', textLength: (2 * Math.PI * 338 - 30).toFixed(0), lengthAdjust: 'spacing' }, tx);
    tp.textContent = 'AB AEGYPTO AD ASTRA · XXIV OPERA · VI CAPITA · MMMMMXXV ANNI ·';

    var inner = svgEl('g', { class: 'a-inner' }, svg);
    svgEl('circle', { r: 236, cy: -64, class: 'draw', pathLength: 1 }, inner);
    svgEl('circle', { r: 176, class: 'dash' }, inner);
    svgEl('path', { d: 'M-312 0H312M0 -312V312', class: 'draw thin', pathLength: 1 }, inner);
    svgEl('path', { d: 'M-220 -220L220 220M-220 220L220 -220', class: 'draw thin', pathLength: 1 }, inner);
    for (var k = 0; k < 9; k++) {
      var ang = k * 40 + 12, rr = 200 + (k % 3) * 34, ca = Math.cos(ang * Math.PI / 180), sa = Math.sin(ang * Math.PI / 180);
      var px = ca * rr, py = sa * rr - 30;
      svgEl('path', { class: 'star', d: 'M' + px.toFixed(1) + ' ' + (py - 9).toFixed(1) + 'L' + (px + 2.4).toFixed(1) + ' ' + py.toFixed(1) + 'L' + px.toFixed(1) + ' ' + (py + 9).toFixed(1) + 'L' + (px - 2.4).toFixed(1) + ' ' + py.toFixed(1) + 'Z' }, inner);
    }
    svgEl('circle', { r: 4, class: 'star' }, inner);

    if (!reduce) {
      gsap.to('.a-outer', { rotation: 360, svgOrigin: '0 0', duration: 320, repeat: -1, ease: 'none' });
      gsap.to('.a-mid', { rotation: -360, svgOrigin: '0 0', duration: 220, repeat: -1, ease: 'none' });
      gsap.to('.a-inner', { rotation: 360, svgOrigin: '0 0', duration: 150, repeat: -1, ease: 'none' });
    }
  })();

  var tiltX = gsap.quickTo('#astrolabe', 'rotationX', { duration: 1.6, ease: 'power3.out' });
  var tiltY = gsap.quickTo('#astrolabe', 'rotationY', { duration: 1.6, ease: 'power3.out' });
  gsap.set('#astrolabe', { transformPerspective: 1400 });

  if (!fine) $('#heroHint').textContent = '轻触屏幕，丝绸会追着光';

  // the letters nearest the light grow heavier
  var letters = $$('.hero__title .l > span').map(function (el) {
    var L = { el: el, w: 400, t: 400 };
    L.to = function (v) { L.t = v; };
    return L;
  });
  gsap.ticker.add(function () {
    if (!heroActive) return;
    letters.forEach(function (L) {
      if (Math.abs(L.t - L.w) < .5) return;
      L.w += (L.t - L.w) * .08;
      L.el.style.setProperty('--w', L.w.toFixed(1));
    });
  });
  function weigh(x, y) {
    letters.forEach(function (L) {
      var r = L.el.getBoundingClientRect();
      var d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      L.to(400 + 420 * Math.exp(-Math.pow(d / (innerWidth * .16), 2)));
    });
  }

  /* ————————————————————————— cursor & pointer ————————————————————————— */
  var cursor = $('#cursor'), label = $('#cursorLabel');
  var pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  if (fine && !reduce) {
    root.classList.add('has-cursor');
    var dot = $('.cursor__dot'), ring = $('.cursor__ring');
    var dx = gsap.quickTo(dot, 'x', { duration: .12, ease: 'power3' }), dy = gsap.quickTo(dot, 'y', { duration: .12, ease: 'power3' });
    var rx = gsap.quickTo(ring, 'x', { duration: .55, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .55, ease: 'power3' });
    window.addEventListener('pointermove', function (e) { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
    window.addEventListener('pointerdown', function () { cursor.classList.add('is-down'); });
    window.addEventListener('pointerup', function () { cursor.classList.remove('is-down'); });
    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest('a, button, [data-work]');
      cursor.classList.toggle('is-view', !!(t && t.matches('[data-work]') && !lbOpen));
      cursor.classList.toggle('is-hover', !!(t && !t.matches('[data-work]')));
    });
    document.addEventListener('pointerleave', function () { gsap.to(cursor, { opacity: 0, duration: .3 }); });
    document.addEventListener('pointerenter', function () { gsap.to(cursor, { opacity: 1, duration: .3 }); });
  }

  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (silk) silk.pointer(e.clientX, e.clientY);
    if (heroActive && !reduce) {
      weigh(e.clientX, e.clientY);
      tiltX((e.clientY / innerHeight - .5) * -14);
      tiltY((e.clientX / innerWidth - .5) * 14);
    }
  }, { passive: true });

  /* magnetic buttons */
  if (fine && !reduce) {
    $$('[data-magnetic]').forEach(function (el) {
      var mx = gsap.quickTo(el, 'x', { duration: .8, ease: 'elastic.out(1, .4)' });
      var my = gsap.quickTo(el, 'y', { duration: .8, ease: 'elastic.out(1, .4)' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * .35);
        my((e.clientY - r.top - r.height / 2) * .35);
      });
      el.addEventListener('pointerleave', function () { mx(0); my(0); });
    });
  }

  /* ————————————————————————— loader → intro ————————————————————————— */
  var heroActive = true;

  function intro() {
    var tl = gsap.timeline();
    tl.from('.hero__title .l > span', { yPercent: 115, duration: 1.8, ease: 'expo.out', stagger: .1 }, 0)
      .fromTo('#astrolabe .draw', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 3, ease: 'expo.inOut', stagger: .07 }, 0)
      .from('#astrolabe .ticks, #astrolabe text, #astrolabe .dash, #astrolabe .star', { opacity: 0, duration: 2.2, ease: 'power2.out', stagger: .02 }, .6)
      .from('#astrolabe > g', { scale: .82, svgOrigin: '0 0', duration: 3.2, ease: 'expo.out' }, 0)
      .from(['.hero__eyebrow', '.hero__cn', '.hero__en', '.hero__foot'], { y: 26, opacity: 0, duration: 1.6, ease: 'expo.out', stagger: .1 }, .45)
      .from('.hud, .rail', { opacity: 0, duration: 1.4, ease: 'power2.out' }, .9);
    return tl;
  }

  function runLoader() {
    var loader = $('#loader');
    var imgs = $$('#loaderFrame img');
    var yearEl = $('#loaderYear'), eraEl = $('#loaderEra');
    var finish = function () {
      root.classList.add('is-ready');
      lock(false);
      ScrollTrigger.refresh();
    };
    if (reduce) { gsap.to(loader, { opacity: 0, duration: .4, onComplete: finish }); intro().progress(1); return; }

    var waits = imgs.map(function (i) { return i.decode ? i.decode().catch(function () {}) : Promise.resolve(); });
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    var gate = Promise.race([Promise.all(waits), new Promise(function (r) { setTimeout(r, 4000); })]);

    var st = { y: -3000 }, shown = 0;
    var count = gsap.timeline({ paused: true });
    count.to(st, {
      y: 2026, duration: 2.8, ease: 'power3.inOut',
      onUpdate: function () {
        var y = Math.round(st.y);
        yearEl.textContent = Math.max(1, Math.abs(y));
        eraEl.textContent = y <= 0 ? 'BC' : 'AD';
        var k = Math.min(imgs.length - 1, Math.floor(count.progress() * imgs.length));
        if (k !== shown) { imgs[shown].classList.remove('on'); imgs[k].classList.add('on'); shown = k; }
      }
    }, 0).to('#loaderBar', { scaleX: 1, duration: 2.8, ease: 'power3.inOut' }, 0);

    gsap.from('.loader__core, .loader__meta', { opacity: 0, y: 14, duration: 1, ease: 'expo.out', stagger: .1 });
    gate.then(function () {
      count.play();
      count.eventCallback('onComplete', function () {
        var out = gsap.timeline({ onComplete: function () { loader.remove(); } });
        out.to('.loader__meta', { opacity: 0, duration: .5, ease: 'power2.in' }, 0)
          .to('.loader__year', { opacity: 0, y: -16, duration: .5, ease: 'power2.in' }, 0)
          .to('#loaderFrame', { clipPath: 'inset(50% 0% 50% 0%)', duration: .8, ease: 'expo.inOut' }, .1)
          .to('#loaderLine', { scaleX: 1, duration: 1, ease: 'expo.inOut' }, .55)
          .to('.loader__lid--top', { yPercent: -100, duration: 1.4, ease: 'expo.inOut' }, 1.35)
          .to('.loader__lid--bot', { yPercent: 100, duration: 1.4, ease: 'expo.inOut' }, 1.35)
          .to('#loaderLine', { opacity: 0, scaleX: 1.2, duration: .9, ease: 'power2.out' }, 1.55)
          .add(intro(), 1.6)
          .call(finish, null, 2.5);
      });
    });
  }

  /* ————————————————————————— scroll scenes ————————————————————————— */
  // hero exit
  var heroFade = { v: 1 };
  gsap.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true, onToggle: function (s) { heroActive = s.isActive; } } })
    .to('.hero__title .l', { yPercent: function (i) { return -40 - i * 35; }, opacity: 0, ease: 'none' }, 0)
    .to('.hero__inner', { y: -70, ease: 'none' }, 0)
    .to('.hero__foot', { opacity: 0, ease: 'none', duration: .4 }, 0)
    .to('#astrolabe', { scale: 1.45, rotation: 50, opacity: 0, ease: 'none' }, 0)
    .to(heroFade, { v: .1, ease: 'none', onUpdate: function () { if (silk) silk.fade(heroFade.v); } }, 0);

  // scrubbed manifesto
  $$('[data-scrub]').forEach(function (el) {
    var w = split(el);
    el.classList.add('is-scrub');
    gsap.fromTo(w, { opacity: .1, filter: 'blur(7px)' }, { opacity: 1, filter: 'blur(0px)', ease: 'none', stagger: .1, scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 50%', scrub: true } });
  });

  // rising words
  $$('[data-split]').forEach(function (el) {
    var w = split(el);
    gsap.from(w, { yPercent: 115, filter: 'blur(10px)', duration: 1.6, ease: 'expo.out', stagger: Math.min(.06, 1 / w.length), clearProps: 'filter', scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
  });

  // rules
  $$('.plate__rule').forEach(function (el) {
    gsap.from(el, { scaleX: 0, duration: 2, ease: 'expo.inOut', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });
  $$('.plate .mono').forEach(function (el) {
    gsap.from(el, { opacity: 0, y: 12, duration: 1.2, ease: 'expo.out', delay: .3, scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });

  // image reveals
  $$('[data-reveal]').forEach(function (el) {
    var box = $('.frame__img', el) || el, img = $('img', el);
    var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 84%', once: true } });
    tl.fromTo(box, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.7, ease: 'expo.inOut' })
      .from(img, { scale: 1.4, duration: 2.4, ease: 'expo.out' }, .15);
    var sw = $('.sweep', el);
    if (sw) tl.to(sw, { xPercent: 220, duration: 2.6, ease: 'power2.inOut' }, .8);
    var cap = $('.tag', el);
    if (cap) tl.from(cap.children, { opacity: 0, y: 10, duration: 1, stagger: .08, ease: 'expo.out' }, .9);
  });

  // I · Nile
  (function () {
    var vmin = function () { return Math.min(innerWidth, innerHeight); };
    var tl = gsap.timeline({ scrollTrigger: { trigger: '.nile__stage', start: 'top top', end: '+=230%', pin: true, scrub: 1, invalidateOnRefresh: true, refreshPriority: 1 } });
    tl.fromTo('.nile__portrait', { clipPath: function () { return 'circle(' + vmin() * .15 + 'px at 47% 46%)'; } },
                                 { clipPath: function () { return 'circle(' + Math.hypot(innerWidth, innerHeight) + 'px at 47% 46%)'; }, ease: 'power2.inOut', duration: 1 })
      .fromTo('.nile__portrait img', { scale: 1.7 }, { scale: 1, ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo('.nile__word', { scale: .82, opacity: 1 }, { scale: 1.3, opacity: .22, ease: 'power1.inOut', duration: 1.1 }, 0)
      .fromTo('.nile__plate > *', { y: 50, opacity: 0 }, { y: 0, opacity: 1, stagger: .08, duration: .35, ease: 'power3.out' }, .72)
      .fromTo('.nile__line', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: 'power3.out' }, .8)
      .fromTo('.nile__tag', { opacity: 0 }, { opacity: 1, duration: .3 }, .9)
      .to({}, { duration: .35 });
  })();

  // II · Marble — the golden rectangle
  (function () {
    var PHI = (1 + Math.sqrt(5)) / 2, W = 1000 * PHI, H = 1000;
    var x = 0, y = 0, w = W, h = H, squares = [], path = '';
    for (var i = 0; i < 9; i++) {
      var s = Math.min(w, h), side = i % 4, sq, a, b;
      if (side === 0) { sq = [x, y, s]; a = [x, y + s]; b = [x + s, y]; x += s; w -= s; }
      else if (side === 1) { sq = [x, y, s]; a = [x, y]; b = [x + s, y + s]; y += s; h -= s; }
      else if (side === 2) { sq = [x + w - s, y, s]; a = [x + w, y]; b = [x + w - s, y + s]; w -= s; }
      else { sq = [x, y + h - s, s]; a = [x + s, y + h]; b = [x, y + h - s]; h -= s; }
      squares.push(sq);
      path += (i ? '' : 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2)) + 'A' + s.toFixed(2) + ' ' + s.toFixed(2) + ' 0 0 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
    }
    var svg = $('#phiSvg');
    svgEl('rect', { x: 0, y: 0, width: W, height: H, pathLength: 1, class: 'phi__rect' }, svg);
    squares.forEach(function (q) { svgEl('rect', { x: q[0], y: q[1], width: q[2], height: q[2], pathLength: 1, class: 'phi__rect' }, svg); });
    var spiral = svgEl('path', { d: path, pathLength: 1, class: 'phi__spiral' }, svg);
    var cells = $$('.phi__cell');
    cells.forEach(function (c, i) {
      var q = squares[i];
      c.style.left = (q[0] / W * 100) + '%';
      c.style.top = (q[1] / H * 100) + '%';
      c.style.width = (q[2] / W * 100) + '%';
      c.style.height = (q[2] / H * 100) + '%';
    });

    gsap.set('.phi__rect, .phi__spiral', { strokeDasharray: 1 });
    var num = $('#phiNum'), val = { v: 1 };
    var arcStart = [0, 1, 1 + 1 / PHI, 1 + 1 / PHI + 1 / (PHI * PHI)], total = PHI * PHI; // arc lengths shrink by φ
    var tl = gsap.timeline({ scrollTrigger: { trigger: '.phi__stage', start: 'top top', end: '+=260%', pin: true, scrub: 1, refreshPriority: 1 } });
    gsap.from('.phi__head > *', { opacity: 0, y: 24, duration: 1.4, stagger: .12, ease: 'expo.out', scrollTrigger: { trigger: '.phi__stage', start: 'top 70%', once: true } });
    gsap.fromTo('.phi__rect', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.4, stagger: .12, ease: 'expo.inOut', scrollTrigger: { trigger: '.phi__stage', start: 'top 60%', once: true } });
    tl.fromTo(spiral, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.6, ease: 'none' }, .25)
      .to(val, { v: PHI, duration: 2.8, ease: 'power2.out', onUpdate: function () { num.textContent = val.v.toFixed(10); } }, .05);
    cells.forEach(function (c, i) {
      var at = .25 + 2.6 * (arcStart[i] / total) * 1.05;
      tl.fromTo($('.phi__img', c), { clipPath: 'inset(50% 50% 50% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: .55, ease: 'power3.inOut' }, at)
        .fromTo($('img', c), { scale: 1.45 }, { scale: 1, duration: .9, ease: 'power2.out' }, at);
    });
    tl.to({}, { duration: .4 });

    $$('.phi__tags .tag').forEach(function (t, i) {
      gsap.from(t, { opacity: 0, y: 24, duration: 1.2, delay: i * .1, ease: 'expo.out', scrollTrigger: { trigger: '.phi__tags', start: 'top 88%', once: true } });
    });
  })();

  // III · Handscroll — unroll, then read right to left, then the seal
  (function () {
    var view = $('#hsView'), track = $('#hsTrack');
    var pan = function () { return Math.max(0, track.scrollWidth - view.clientWidth); };
    var tl = gsap.timeline({ scrollTrigger: { trigger: '.hs__stage', start: 'top top', end: function () { return '+=' + (pan() * 1.1 + innerHeight * 1.6); }, pin: true, scrub: 1, invalidateOnRefresh: true, refreshPriority: 1 } });
    gsap.from('.hs__top > *', { opacity: 0, y: 24, duration: 1.4, stagger: .12, ease: 'expo.out', scrollTrigger: { trigger: '.hs__stage', start: 'top 65%', once: true } });
    var stamp = gsap.timeline({ paused: true })
      .fromTo('#seal', { scale: 2.8, opacity: 0, rotate: -18 }, { scale: 1, opacity: 1, rotate: -4, duration: .42, ease: 'power4.in' })
      .call(function () { if (window.AeonSound) AeonSound.thump(); })
      .to('.hs__roll', { keyframes: { y: [0, 4, -2, 1, 0] }, duration: .32, ease: 'none' });
    gsap.set('#seal', { opacity: 0 });
    tl.fromTo(view, { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'power2.inOut' }, 0)
      .fromTo('.hs__rod--l', { x: function () { return view.clientWidth / 2; } }, { x: 0, duration: 1, ease: 'power2.inOut' }, 0)
      .fromTo('.hs__rod--r', { x: function () { return -view.clientWidth / 2; } }, { x: 0, duration: 1, ease: 'power2.inOut' }, 0)
      .fromTo(track, { x: function () { return -pan(); } }, { x: 0, duration: 3.2, ease: 'none' }, .6)
      .call(function () { if (tl.scrollTrigger && tl.scrollTrigger.direction < 0) stamp.reverse(); else stamp.play(); }, null, 3.85)
      .to({}, { duration: .7 });

    var slit = $('#qmSlit'), qimg = $('img', slit);
    gsap.fromTo(qimg, { y: 0 }, { y: function () { return -(qimg.offsetHeight - slit.clientHeight); }, ease: 'none', scrollTrigger: { trigger: slit, start: 'top bottom', end: 'bottom top', scrub: 1, invalidateOnRefresh: true } });
  })();

  // IV · Rebirth — horizontal gallery
  var galActive = false, galSkew = 0, galTween = null;
  (function () {
    var track = $('#galTrack');
    var dist = function () { return Math.max(0, track.scrollWidth - innerWidth); };
    var tween = galTween = gsap.to(track, {
      x: function () { return -dist(); }, ease: 'none',
      scrollTrigger: {
        trigger: '.gal__stage', start: 'top top', end: function () { return '+=' + dist(); },
        pin: true, scrub: 1, invalidateOnRefresh: true, refreshPriority: 1,
        onToggle: function (s) { galActive = s.isActive; },
        onUpdate: function (s) { gsap.set('#galBar', { scaleX: s.progress }); }
      }
    });
    $$('.work').forEach(function (w) {
      gsap.fromTo($('img', w), { xPercent: -5 }, { xPercent: 5, ease: 'none', scrollTrigger: { trigger: w, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      gsap.from($('.tag', w).children, { opacity: 0, y: 14, stagger: .06, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: w, containerAnimation: tween, start: 'left 75%', once: true } });
    });
    var figs = $$('.work figure');
    gsap.ticker.add(function () {
      var v = galActive && lenis ? lenis.velocity : 0;
      var target = Math.max(-7, Math.min(7, -v * .35));
      galSkew += (target - galSkew) * .1;
      if (Math.abs(galSkew) < .01 && !galActive) return;
      for (var i = 0; i < figs.length; i++) figs[i].style.transform = 'skewX(' + galSkew.toFixed(3) + 'deg)';
    });
  })();

  // V · Sublime — the water print, then the stacking cards
  (function () {
    var stage = $('#waveStage');
    var water = window.AeonGL && AeonGL.water($('#waveGL'), 'img/wave.webp', { still: reduce, onReady: function () { root.classList.add('has-gl'); } });
    var st = { zoom: 1.2, reveal: 0 };
    if (water) {
      water.zoom(st.zoom);
      stage.addEventListener('pointermove', function (e) { water.pointer(e.clientX, e.clientY); });
      stage.addEventListener('pointerdown', function (e) { water.splash(e.clientX, e.clientY); });
      ScrollTrigger.create({
        trigger: stage, start: 'top 70%', once: true,
        onEnter: function () { gsap.to(st, { reveal: 1, duration: reduce ? .01 : 2.6, ease: 'power2.inOut', onUpdate: function () { water.reveal(st.reveal); } }); }
      });
    }
    gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top top', end: '+=110%', pin: true, scrub: 1, refreshPriority: 1 } })
      .to(st, { zoom: 1, ease: 'none', duration: 1, onUpdate: function () { if (water) water.zoom(st.zoom); } }, 0)
      .from('.wave__cartouche', { opacity: 0, y: -30, duration: .45, ease: 'power2.out' }, .1)
      .to({}, { duration: .2 });

    var cards = $$('.card');
    cards.forEach(function (card, i) {
      gsap.fromTo($('img', card), { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
      if (i === cards.length - 1) return;
      gsap.to(card, {
        scale: .9, '--dim': .6, ease: 'none',
        scrollTrigger: { trigger: cards[i + 1], start: 'top bottom', end: function () { return 'top ' + (innerHeight * .11 + 1) + 'px'; }, scrub: true, invalidateOnRefresh: true }
      });
    });
  })();

  // VI · Cosmos — Earth rising over the lunar horizon, then the stars
  (function () {
    var date = $('#riseDate');
    var tl = gsap.timeline({ scrollTrigger: { trigger: '.rise__stage', start: 'top top', end: '+=200%', pin: true, scrub: 1, refreshPriority: 1 } });
    gsap.from('.rise__plate > *', { opacity: 0, y: 30, stagger: .1, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.rise__stage', start: 'top 55%', once: true } });
    tl.fromTo('.rise__sky', { yPercent: 40 }, { yPercent: 0, ease: 'power1.out', duration: 1 }, 0)
      .fromTo('.rise__frame', { scale: 1.12 }, { scale: 1, ease: 'none', duration: 1.2 }, 0)
      .from(date, { opacity: 0, duration: .3 }, .35)
      .from('.rise__line', { opacity: 0, y: 30, duration: .3 }, .7)
      .to({}, { duration: .3 });
    var parts = { y: 1600, m: 1, d: 1 };
    tl.to(parts, { y: 1968, m: 12, d: 24, duration: .9, ease: 'power2.out', onUpdate: function () {
      date.textContent = Math.round(parts.y) + '·' + String(Math.round(parts.m)).padStart(2, '0') + '·' + String(Math.round(parts.d)).padStart(2, '0');
    } }, .35);

    gsap.fromTo('.pillars__img img', { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.pillars', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from('.pillars__img', { opacity: 0, duration: 2.4, ease: 'power2.out', scrollTrigger: { trigger: '.pillars', start: 'top 75%', once: true } });
    gsap.from('.home__earth', { scale: .7, opacity: 0, duration: 2.6, ease: 'expo.out', scrollTrigger: { trigger: '.home', start: 'top 70%', once: true } });
    gsap.from('.home__en, .home__tag', { opacity: 0, y: 16, duration: 1.4, stagger: .15, ease: 'expo.out', delay: .6, scrollTrigger: { trigger: '.home__line', start: 'top 85%', once: true } });
  })();

  /* starfield behind the cosmos chapter */
  var stars = (function () {
    var c = $('#stars'), x = c.getContext('2d'), N = narrow() ? 380 : 900, pts = [], on = false, raf = 0, w, h, dpr;
    function size() { dpr = Math.min(devicePixelRatio || 1, 2); w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr; }
    function seed(p) { p.x = (Math.random() - .5) * 2; p.y = (Math.random() - .5) * 2; p.z = Math.random() * .9 + .1; p.pz = p.z; p.t = Math.random(); return p; }
    for (var i = 0; i < N; i++) pts.push(seed({}));
    function frame() {
      raf = 0;
      var v = lenis ? Math.abs(lenis.velocity) : 0;
      var speed = .0009 + Math.min(.03, v * .0011);
      x.fillStyle = 'rgba(0,0,0,' + (v > 6 ? .35 : .9) + ')';
      x.fillRect(0, 0, w, h);
      var f = Math.min(w, h) * .55, cx = w / 2, cy = h / 2;
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        p.pz = p.z; p.z -= speed;
        if (p.z <= .02) { seed(p); p.z = p.pz = 1; continue; }
        var sx = cx + p.x / p.z * f, sy = cy + p.y / p.z * f;
        var px = cx + p.x / p.pz * f, py = cy + p.y / p.pz * f;
        if (sx < 0 || sx > w || sy < 0 || sy > h) { seed(p); p.z = p.pz = 1; continue; }
        var a = Math.min(1, (1 - p.z) * 1.4);
        var warm = p.t > .82;
        x.strokeStyle = warm ? 'rgba(255,214,170,' + a + ')' : 'rgba(205,220,255,' + a + ')';
        x.lineWidth = Math.max(.6, (1 - p.z) * 2.2) * dpr;
        x.beginPath(); x.moveTo(px, py); x.lineTo(sx + .1, sy + .1); x.stroke();
      }
      if (on) raf = requestAnimationFrame(frame);
    }
    size();
    window.addEventListener('resize', size);
    return {
      toggle: function (v) {
        if (reduce) v = false;
        if (v === on) return;
        on = v;
        gsap.to(c, { opacity: v ? 1 : 0, duration: 1.2, ease: 'power2.out' });
        if (v && !raf) raf = requestAnimationFrame(frame);
      }
    };
  })();
  ScrollTrigger.create({ trigger: '#cosmos', start: 'top 40%', end: 'bottom top', onToggle: function (s) { stars.toggle(s.isActive); } });

  /* ————————————————————————— instruments: chapter, year, colour ————————————————————————— */
  ScrollTrigger.create({
    trigger: '#fin', start: 'top 70%',
    onEnter: function () { gsap.to('.hud--year, .rail', { autoAlpha: 0, duration: .6 }); },
    onLeaveBack: function () { gsap.to('.hud--year, .rail', { autoAlpha: 1, duration: .6 }); }
  });
  var hudNum = $('#hudNum'), hudName = $('#hudName'), railLinks = $$('#rail a');
  var current = null;
  var inkBg = window.AeonGL && AeonGL.ink($('#ink'), '#0b0a09');
  var lastY = 0;
  function setChapter(sec) {
    if (current === sec) return;
    var down = scrollY >= lastY;
    if (inkBg && current && current.dataset.bg !== sec.dataset.bg) inkBg.to(sec.dataset.bg, down, reduce ? .01 : 1.9);
    current = sec;
    gsap.to(document.body, { '--bg': sec.dataset.bg, '--fg': sec.dataset.fg, duration: 1.9, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to([hudNum, hudName], { opacity: 0, y: -8, duration: .25, onComplete: function () {
      hudNum.textContent = sec.dataset.num; hudName.textContent = sec.dataset.name;
      gsap.fromTo([hudNum, hudName], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .5, ease: 'expo.out' });
    } });
    railLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + sec.id); });
    if (window.AeonSound) AeonSound.chapter(sec.dataset.num);
  }
  $$('[data-bg]').forEach(function (sec) {
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onEnter: function () { lastY = scrollY - 1; setChapter(sec); },
      onEnterBack: function () { lastY = scrollY + 1; setChapter(sec); }
    });
  });

  // year odometer: every chapter is pinned to the years it covers
  var digitsEl = $('#yearDigits'), eraEl = $('#yearEra'), cols = [];
  for (var d = 0; d < 4; d++) {
    var col = document.createElement('span'); col.className = 'year__col';
    for (var n = 0; n <= 9; n++) { var s = document.createElement('span'); s.textContent = n; col.appendChild(s); }
    digitsEl.appendChild(col); cols.push(col);
  }
  var SPANS = [['#hero', -3000, -3000], ['#nile', -2560, -1323], ['#marble', -447, 125], ['#handscroll', 1113, 1127], ['#rebirth', 1485, 1665], ['#sublime', 1818, 1908], ['#cosmos', 1968, 2026]];
  var anchors = [];
  function measure() {
    anchors = [];
    SPANS.forEach(function (s) {
      var el = $(s[0]), r = el.getBoundingClientRect(), top = r.top + scrollY;
      anchors.push([top, s[1]], [top + r.height, s[2]]);
    });
  }
  ScrollTrigger.addEventListener('refresh', measure);
  var shownYear = null;
  function yearAt(pos) {
    if (!anchors.length) return -3000;
    if (pos <= anchors[0][0]) return anchors[0][1];
    for (var i = 1; i < anchors.length; i++) {
      if (pos <= anchors[i][0]) {
        var a = anchors[i - 1], b = anchors[i], k = (pos - a[0]) / Math.max(1, b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return anchors[anchors.length - 1][1];
  }
  function paintYear() {
    var y = Math.round(yearAt(scrollY + innerHeight * .55));
    if (y === 0) y = 1;
    if (y === shownYear) return;
    shownYear = y;
    var str = String(Math.abs(y)).padStart(4, '0');
    var lead = true;
    for (var i = 0; i < 4; i++) {
      var ch = +str[i];
      if (ch !== 0 || i === 3) lead = false;
      cols[i].style.transform = 'translateY(' + (-ch) + 'em)';
      cols[i].style.opacity = lead ? 0 : 1;
    }
    eraEl.textContent = y < 0 ? 'BC' : 'AD';
  }
  gsap.ticker.add(paintYear);

  (function () {
    var mark = $('.brand__mark');
    var svg = svgEl('svg', { class: 'brand__ring', viewBox: '0 0 44 44', 'aria-hidden': 'true' }, mark);
    var c = svgEl('circle', { cx: 22, cy: 22, r: 21, pathLength: 1 }, svg);
    gsap.ticker.add(function () {
      var max = document.documentElement.scrollHeight - innerHeight;
      c.style.strokeDashoffset = (1 - Math.min(1, scrollY / Math.max(1, max))).toFixed(4);
    });
  })();

  /* ————————————————————————— menu ————————————————————————— */
  var menu = $('#menu'), menuBtn = $('#menuBtn'), menuOpen = false, menuTl = null;
  var preview = $('#menuPreview'), previewImg = $('img', preview);
  var pvx = gsap.quickTo(preview, 'x', { duration: .7, ease: 'power3' }), pvy = gsap.quickTo(preview, 'y', { duration: .7, ease: 'power3' });
  var pvr = gsap.quickTo(preview, 'rotation', { duration: .9, ease: 'power3' });
  var lastPX = 0;

  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    menu.inert = false;
    menu.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    lock(true);
    if (menuTl) menuTl.kill();
    menuTl = gsap.timeline();
    menuTl.fromTo('.menu__bg', { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: reduce ? .01 : .9, ease: 'expo.inOut' })
      .fromTo('.menu__list a', { yPercent: 105 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .06 }, .35)
      .fromTo('.menu__foot', { opacity: 0 }, { opacity: .55, duration: .8 }, .6);
    setTimeout(function () { $('.menu__list a').focus({ preventScroll: true }); }, 400);
  }
  function closeMenu(after) {
    if (!menuOpen) { if (after) after(); return; }
    menuOpen = false;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (menuTl) menuTl.kill();
    gsap.to(preview, { opacity: 0, scale: .6, duration: .3 });
    menuTl = gsap.timeline({ onComplete: function () { menu.classList.remove('is-open'); menu.inert = true; lock(false); if (after) after(); } });
    menuTl.to('.menu__list a', { yPercent: -105, duration: .5, ease: 'expo.in', stagger: .03 })
      .to('.menu__foot', { opacity: 0, duration: .3 }, 0)
      .to('.menu__bg', { clipPath: 'inset(0% 0% 0% 100%)', duration: reduce ? .01 : .8, ease: 'expo.inOut' }, .25);
    menuBtn.focus({ preventScroll: true });
  }
  menuBtn.addEventListener('click', function () { menuOpen ? closeMenu() : openMenu(); });
  $$('.menu__list a').forEach(function (a) {
    a.addEventListener('pointerenter', function () {
      previewImg.src = a.dataset.img;
      gsap.to(preview, { opacity: 1, scale: 1, duration: .6, ease: 'expo.out' });
    });
    a.addEventListener('pointerleave', function () { gsap.to(preview, { opacity: 0, scale: .7, duration: .4 }); });
  });
  menu.addEventListener('pointermove', function (e) {
    pvx(e.clientX + 30); pvy(e.clientY - preview.offsetHeight / 2);
    pvr(Math.max(-12, Math.min(12, (e.clientX - lastPX) * .6)));
    lastPX = e.clientX;
  });

  /* ————————————————————————— lightbox: the museum label ————————————————————————— */
  var lb = $('#lb'), lbStage = $('#lbStage'), lbOpen = false, fly = null, source = null;
  var LABELS = [['作者', 'who'], ['年代', 'when'], ['材质', 'what'], ['尺寸', 'size'], ['收藏', 'where'], ['编号', 'inv']];

  function fitRect(nw, nh) {
    var r = lbStage.getBoundingClientRect(), k = Math.min(r.width / nw, r.height / nh);
    var w = nw * k, h = nh * k;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }
  function openWork(id, srcEl) {
    var w = WORKS[id];
    if (!w || lbOpen) return;
    if (lens) lens.reset();
    lbOpen = true;
    cursor && cursor.classList.remove('is-view');
    $('#lbNo').textContent = w.no;
    $('#lbTitle').textContent = w.en;
    $('#lbCn').textContent = w.cn;
    $('#lbDl').innerHTML = LABELS.filter(function (p) { return w[p[1]]; }).map(function (p) { return '<dt>' + p[0] + '</dt><dd>' + esc(w[p[1]]) + '</dd>'; }).join('');
    lb.inert = false;
    lb.classList.add('is-open');
    lock(true);

    var img = srcEl && $('img', srcEl);
    source = img;
    var file = 'img/' + id + '.webp';
    fly = new Image();
    fly.className = 'lb__fly';
    fly.style.cursor = 'zoom-in';
    fly.alt = w.cn;
    fly.src = file;
    lb.appendChild(fly);
    var start = img ? img.getBoundingClientRect() : null;
    var go2 = function () {
      var end = fitRect(fly.naturalWidth || 4, fly.naturalHeight || 3);
      if (start && start.width) {
        gsap.set(fly, { left: start.left, top: start.top, width: start.width, height: start.height });
        if (img) gsap.set(img, { opacity: 0 });
      } else gsap.set(fly, { left: end.left, top: end.top + 40, width: end.width, height: end.height, opacity: 0 });
      gsap.to(fly, { left: end.left, top: end.top, width: end.width, height: end.height, opacity: 1, duration: reduce ? .01 : 1.1, ease: 'expo.inOut' });
    };
    if (fly.complete && fly.naturalWidth) go2(); else { fly.onload = go2; }
    gsap.to('.lb__bg', { opacity: 1, duration: .8, ease: 'power2.out' });
    gsap.fromTo('#lbInfo > *', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: .07, delay: .45 });
    gsap.fromTo('#lbClose', { opacity: 0 }, { opacity: 1, duration: .6, delay: .6 });
    setTimeout(function () { $('#lbClose').focus({ preventScroll: true }); }, 300);
  }
  function closeWork() {
    if (!lbOpen) return;
    var img = source, f = fly;
    if (zoomed) { zoomed = false; lb.classList.remove('is-zoom'); gsap.set(f, { scale: 1 }); }
    var done = function () {
      if (img) gsap.set(img, { opacity: 1 });
      if (f) f.remove();
      lb.classList.remove('is-open'); lb.inert = true; lbOpen = false; lock(false);
    };
    gsap.to('#lbInfo > *, #lbClose', { opacity: 0, duration: .3 });
    gsap.to('.lb__bg', { opacity: 0, duration: .8, delay: .25, ease: 'power2.inOut' });
    var r = img && img.getBoundingClientRect();
    if (f && r && r.width && r.bottom > 0 && r.top < innerHeight) {
      gsap.to(f, { left: r.left, top: r.top, width: r.width, height: r.height, duration: reduce ? .01 : 1, ease: 'expo.inOut', onComplete: done });
    } else if (f) {
      gsap.to(f, { opacity: 0, y: 30, duration: .5, onComplete: done });
    } else done();
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (o) {
      var host = document.querySelector('[data-work="' + o.dataset.open + '"]');
      openWork(o.dataset.open, host);
      return;
    }
    if (lbOpen || menuOpen) return;
    var t = e.target.closest('[data-work]');
    if (t) {
      if (Date.now() - lastDrop < 700) setTimeout(function () { openWork(t.dataset.work, t); }, 650);
      else openWork(t.dataset.work, t);
    }
  });
  var zoomed = false;
  function zoomAt(x, y) {
    if (!fly) return;
    var r = fly.getBoundingClientRect();
    fly.style.transformOrigin = ((x - r.left) / r.width * 100) + '% ' + ((y - r.top) / r.height * 100) + '%';
  }
  lb.addEventListener('click', function (e) {
    if (!fly || e.target !== fly) return;
    zoomed = !zoomed;
    lb.classList.toggle('is-zoom', zoomed);
    zoomAt(e.clientX, e.clientY);
    gsap.to(fly, { scale: zoomed ? 2.4 : 1, duration: 1, ease: 'expo.inOut' });
  });
  lb.addEventListener('pointermove', function (e) { if (zoomed) zoomAt(e.clientX, e.clientY); });
  $('#lbClose').addEventListener('click', closeWork);
  $('.lb__bg').addEventListener('click', closeWork);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (lbOpen) closeWork(); else if (menuOpen) closeMenu(); }
  });

  $('#backTop').addEventListener('click', function () { go(0); });

  /* ————————————————————————— ambient glow behind works in the dark rooms ————————————————————————— */
  (function () {
    var glows = [];
    ['.nile__pyr .frame__img', '.nile__tut .frame__img', '.work figure', '.pillars__img'].forEach(function (sel) {
      $$(sel).forEach(function (box) {
        var img = $('img', box), host = box.parentNode;
        var g = document.createElement('i');
        g.className = 'glow'; g.setAttribute('aria-hidden', 'true');
        g.style.backgroundImage = 'url("' + img.getAttribute('src') + '")';
        host.classList.add('has-glow');
        host.insertBefore(g, box);
        glows.push({ g: g, box: box, host: host });
        ScrollTrigger.create({ trigger: box, containerAnimation: box.closest('.gal__track') ? galTween : undefined, start: box.closest('.gal__track') ? 'left 85%' : 'top 80%', onEnter: function () { g.classList.add('is-in'); } });
      });
    });
    function place() {
      glows.forEach(function (o) {
        o.g.style.left = o.box.offsetLeft + 'px'; o.g.style.top = o.box.offsetTop + 'px';
        o.g.style.width = o.box.offsetWidth + 'px'; o.g.style.height = o.box.offsetHeight + 'px';
      });
    }
    place();
    ScrollTrigger.addEventListener('refreshInit', place);
  })();

  /* ————————————————————————— liquid lens over every work ————————————————————————— */
  var lens = !reduce && window.AeonGL && AeonGL.lens($('#lens'));
  var lastDrop = 0;
  ['.frame__img', '.phi__img', '.work figure', '.card__img', '.qm__slit'].forEach(function (sel) {
    $$(sel).forEach(function (box) {
      var img = $('img', box);
      if (!img) return;
      box.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        if (lens && !lbOpen && !menuOpen) lens.enter(box, img);
        if (window.AeonSound) AeonSound.hover();
      });
      box.addEventListener('pointerleave', function (e) { if (lens && e.pointerType !== 'touch') lens.leave(img); });
      box.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' || !lens || lbOpen || menuOpen) return;
        lens.drop(box, img, e.clientX, e.clientY);
        lastDrop = Date.now();
      });
      box.addEventListener('pointermove', function (e) { if (lens && e.pointerType !== 'mouse') lens.move(e.clientX, e.clientY); });
    });
  });
  if (lens) window.addEventListener('pointermove', function (e) { lens.move(e.clientX, e.clientY); }, { passive: true });

  /* ————————————————————————— sound ————————————————————————— */
  var soundBtn = $('#soundBtn');
  soundBtn.addEventListener('click', function () {
    if (!window.AeonSound) return;
    var on = AeonSound.toggle(current ? current.dataset.num : '序');
    soundBtn.setAttribute('aria-pressed', on);
    $('#soundLabel').textContent = on ? '声音 Sound on' : '声音 Sound off';
  });

  /* ————————————————————————— gold dust over the silk ————————————————————————— */
  (function () {
    var c = $('#heroDust'), x = c.getContext('2d'), pts = [], w, h, dpr, raf = 0, on = true;
    var N = narrow() ? 70 : 170, m = { x: -9999, y: -9999 };
    function size() { dpr = Math.min(devicePixelRatio || 1, 2); w = c.width = c.clientWidth * dpr; h = c.height = c.clientHeight * dpr; }
    function seed(p, any) {
      p.x = Math.random() * w; p.y = any ? Math.random() * h : h + 10;
      p.r = (Math.random() * 1.4 + .4) * dpr; p.vy = -(Math.random() * .25 + .08) * dpr; p.vx = 0;
      p.ph = Math.random() * 6.28; p.tw = Math.random() * .03 + .01;
      return p;
    }
    size();
    for (var i = 0; i < N; i++) pts.push(seed({}, true));
    window.addEventListener('resize', size);
    window.addEventListener('pointermove', function (e) { var r = c.getBoundingClientRect(); m.x = (e.clientX - r.left) * dpr; m.y = (e.clientY - r.top) * dpr; }, { passive: true });
    function frame() {
      raf = 0;
      x.clearRect(0, 0, w, h);
      for (var i = 0; i < N; i++) {
        var p = pts[i], dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy, R = 140 * dpr;
        if (d2 < R * R) { var f = (1 - Math.sqrt(d2) / R) * .9; p.vx += dx / Math.sqrt(d2 + 1) * f; p.vy += dy / Math.sqrt(d2 + 1) * f * .5; }
        p.vx *= .94; p.vy += (-(.12 * dpr) - p.vy) * .02;
        p.x += p.vx + Math.sin(p.ph * .7) * .15 * dpr; p.y += p.vy; p.ph += p.tw;
        if (p.y < -10 || p.x < -20 || p.x > w + 20) seed(p, false);
        var a = (.35 + .65 * Math.abs(Math.sin(p.ph))) * .8;
        var g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, 'rgba(255,226,170,' + a + ')'); g.addColorStop(1, 'rgba(255,200,120,0)');
        x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r * 4, 0, 6.283); x.fill();
      }
      if (on) raf = requestAnimationFrame(frame);
    }
    if (reduce) { frame(); return; }
    ScrollTrigger.create({ trigger: '#hero', start: 'top bottom', end: 'bottom top', onToggle: function (s) { on = s.isActive; if (on && !raf) raf = requestAnimationFrame(frame); } });
    raf = requestAnimationFrame(frame);
  })();

  /* ————————————————————————— start ————————————————————————— */
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  measure();
  window.__aeon = { lenis: lenis, ink: inkBg, refresh: function () { ScrollTrigger.refresh(); } };
  runLoader();
})();
