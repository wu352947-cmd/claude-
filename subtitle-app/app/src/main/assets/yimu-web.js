/*
 * 译幕 · 整页翻译脚本（注入到内置浏览器的每个网页里）
 *
 * 1. 把网页里的英文文字按"段落"分组（一个段落 = 最近的块级元素里的所有文字）；
 * 2. 只翻译屏幕上和即将滚动到的段落，先翻第一屏，省钱又快；
 * 3. 交给 App（YiMuNative.translate）批量翻译，结果写回网页；
 * 4. 三种模式：off 原文 / dual 双语对照 / zh 仅中文（像浏览器翻译一样替换原文，尽量保留链接和样式）。
 */
(function () {
  if (window.__yimu) {
    window.__yimu.setMode(window.__yimuMode || 'zh');
    return;
  }
  var Y = (window.__yimu = {});
  var mode = window.__yimuMode || 'zh';

  var SKIP = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1,
    SVG: 1, MATH: 1, KBD: 1, SAMP: 1, VAR: 1, CANVAS: 1, IFRAME: 1, TEMPLATE: 1, HEAD: 1, TITLE: 1,
  };
  var units = [];
  var unitOf = new WeakMap();
  var seen = new WeakSet();
  var displayCache = new WeakMap();
  var skipCache = new WeakMap();
  var queue = [];
  var batches = {};
  var nextBatch = 1;
  var inflight = 0;
  var doneCount = 0;
  var sentBatches = 0;
  var timer = null;

  function addStyle() {
    var s = document.createElement('style');
    s.textContent =
      '.yimu-zh{display:block;margin:.3em 0 .1em;opacity:.92;line-height:1.6;font-weight:inherit;}' +
      '.yimu-zh.yimu-solo{margin:0;opacity:1;}' +
      '.yimu-pending{background-image:linear-gradient(90deg,transparent,rgba(110,100,255,.10),transparent);' +
      'background-size:200% 100%;animation:yimu-shimmer 1.1s linear infinite;}' +
      '@keyframes yimu-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function isBlock(el) {
    var d = displayCache.get(el);
    if (d === undefined) {
      d = getComputedStyle(el).display;
      displayCache.set(el, d);
    }
    // inline-block（按钮、标签）也当作独立的一段
    return d !== 'inline' && d !== 'contents';
  }

  function skipped(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var r = skipCache.get(el);
    if (r !== undefined) return r;
    r =
      !!SKIP[el.tagName.toUpperCase()] ||
      el.isContentEditable ||
      el.getAttribute('translate') === 'no' ||
      (el.classList && (el.classList.contains('yimu-zh') || el.classList.contains('notranslate'))) ||
      skipped(el.parentElement);
    skipCache.set(el, r);
    return r;
  }

  function isEnglish(t) {
    var latin = (t.match(/[A-Za-z]/g) || []).length;
    var cjk = (t.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
    return latin >= 3 && cjk < latin * 0.1;
  }

  function scan(root) {
    if (!root || !document.body) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var touched = new Set();
    var n;
    while ((n = w.nextNode())) {
      if (seen.has(n)) continue;
      var v = n.nodeValue;
      if (!v || !/[A-Za-z]{2}/.test(v)) continue;
      var p = n.parentElement;
      if (!p || skipped(p)) continue;
      seen.add(n);
      var b = p;
      while (b && b !== document.body && !isBlock(b)) b = b.parentElement;
      if (!b) continue;
      var u = unitOf.get(b);
      if (!u) {
        u = { el: b, nodes: [], state: 0, tries: 0 };
        unitOf.set(b, u);
        units.push(u);
      } else if (u.state >= 2) {
        continue; // 已在翻译 / 已翻译
      }
      u.nodes.push(n);
      touched.add(u);
    }
    touched.forEach(function (u) {
      u.text = u.nodes.map(function (t) { return t.nodeValue; }).join(' ').replace(/\s+/g, ' ').trim();
      if (u.text.length < 2 || !isEnglish(u.text)) {
        u.state = 9; // 不需要翻译
        return;
      }
      io.unobserve(u.el);
      io.observe(u.el);
    });
  }

  // 只翻译出现在屏幕上（或上下 800 像素以内）的段落
  var io = new IntersectionObserver(
    function (entries) {
      if (mode === 'off') return;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var u = unitOf.get(e.target);
        if (u && u.state === 0) {
          u.state = 1;
          queue.push(u);
          io.unobserve(e.target);
        }
      });
      schedule();
    },
    { rootMargin: '800px 0px' }
  );

  function schedule() {
    if (!timer) timer = setTimeout(flush, 60);
  }

  function flush() {
    timer = null;
    while (queue.length && inflight < 4) {
      // 前两批小一点，让第一屏尽快出现中文
      var maxItems = sentBatches < 2 ? 5 : 12;
      var maxChars = sentBatches < 2 ? 1200 : 2600;
      var batch = [];
      var chars = 0;
      while (queue.length && batch.length < maxItems && chars < maxChars) {
        var u = queue.shift();
        if (!u.el.isConnected) continue;
        batch.push(u);
        chars += u.text.length;
      }
      if (!batch.length) break;
      var id = nextBatch++;
      batches[id] = batch;
      inflight++;
      sentBatches++;
      batch.forEach(function (u) {
        u.state = 2;
        u.el.classList.add('yimu-pending');
      });
      try {
        YiMuNative.translate(id, JSON.stringify({
          title: document.title,
          items: batch.map(function (u) { return u.text; }),
        }));
      } catch (err) {
        Y.onError(id);
      }
    }
    report();
  }

  function report() {
    try {
      YiMuNative.status(inflight + queue.length, doneCount);
    } catch (err) {}
  }

  Y.onResult = function (id, arr) {
    var batch = batches[id];
    if (!batch) return;
    delete batches[id];
    inflight--;
    batch.forEach(function (u, i) {
      u.el.classList.remove('yimu-pending');
      var zh = arr[i];
      if (typeof zh === 'string' && zh.trim() && zh.trim() !== u.text) {
        u.zh = zh.trim();
        u.state = 3;
        doneCount++;
        apply(u);
      } else {
        u.state = 9;
      }
    });
    schedule();
    report();
  };

  Y.onError = function (id) {
    var batch = batches[id];
    if (!batch) return;
    delete batches[id];
    inflight--;
    batch.forEach(function (u) {
      u.el.classList.remove('yimu-pending');
      u.tries++;
      u.state = u.tries < 3 ? 0 : 4;
    });
    // 稍后重新排队（滚动到它们时会自动重试）
    setTimeout(function () {
      batch.forEach(function (u) {
        if (u.state === 0 && u.el.isConnected) {
          io.unobserve(u.el);
          io.observe(u.el);
        }
      });
    }, 2500);
    report();
  };

  function topChild(u, node) {
    var c = node;
    while (c.parentNode && c.parentNode !== u.el) c = c.parentNode;
    return c.parentNode === u.el ? c : null;
  }

  function insertAfterUnit(u, span) {
    var c = topChild(u, u.nodes[u.nodes.length - 1]);
    if (c) u.el.insertBefore(span, c.nextSibling);
    else u.el.appendChild(span);
  }

  function restore(u) {
    if (u.span) {
      u.span.remove();
      u.span = null;
    }
    if (u.orig) {
      u.nodes.forEach(function (t, i) { t.nodeValue = u.orig[i]; });
      u.orig = null;
    }
  }

  function apply(u) {
    if (u.state !== 3) return;
    restore(u);
    if (mode === 'off') return;
    if (mode === 'dual') {
      var s = document.createElement('font');
      s.className = 'yimu-zh';
      s.textContent = u.zh;
      insertAfterUnit(u, s);
      u.span = s;
      return;
    }
    // 仅中文：把译文放进原来的文字位置，链接、加粗等样式尽量保留
    u.orig = u.nodes.map(function (t) { return t.nodeValue; });
    var target = null;
    for (var i = 0; i < u.nodes.length; i++) {
      if (u.nodes[i].parentNode === u.el) { target = u.nodes[i]; break; }
    }
    if (!target) {
      var p0 = u.nodes[0].parentNode;
      var same = u.nodes.every(function (t) { return t.parentNode === p0; });
      if (same) target = u.nodes[0];
    }
    if (target) {
      u.nodes.forEach(function (t) { t.nodeValue = t === target ? u.zh : ''; });
    } else {
      u.nodes.forEach(function (t) { t.nodeValue = ''; });
      var s2 = document.createElement('font');
      s2.className = 'yimu-zh yimu-solo';
      s2.textContent = u.zh;
      insertAfterUnit(u, s2);
      u.span = s2;
    }
  }

  Y.setMode = function (m) {
    mode = m;
    units.forEach(apply);
    if (m !== 'off') {
      units.forEach(function (u) {
        if (u.state === 0 && u.el.isConnected) {
          io.unobserve(u.el);
          io.observe(u.el);
        }
      });
    }
  };

  // 网页后来加载出来的内容（无限滚动、展开评论）也会被翻译
  var roots = [];
  var mo = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1 && !(n.classList && n.classList.contains('yimu-zh'))) roots.push(n);
        else if (n.nodeType === 3 && n.parentElement) roots.push(n.parentElement);
      });
    });
    if (roots.length && !mo.pending) {
      mo.pending = setTimeout(function () {
        mo.pending = null;
        var rs = roots;
        roots = [];
        rs.forEach(function (r) { if (r.isConnected) scan(r); });
      }, 300);
    }
  });

  function start() {
    addStyle();
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
