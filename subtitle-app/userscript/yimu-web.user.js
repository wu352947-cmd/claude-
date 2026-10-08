// ==UserScript==
// @name         译幕 · 网页翻译
// @namespace    com.yimu.subtitle
// @version      0.1.2
// @description  用 DeepSeek 把英文网页整页翻译成自然的中文。点右下角「译」切换 中文 / 双语 / 原文。
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// @downloadURL  https://raw.githubusercontent.com/wu352947-cmd/claude-/claude/tender-lamport-vb8i8b/subtitle-app/userscript/yimu-web.user.js
// @updateURL    https://raw.githubusercontent.com/wu352947-cmd/claude-/claude/tender-lamport-vb8i8b/subtitle-app/userscript/yimu-web.user.js
// ==/UserScript==
(function () {
'use strict';
/* ---------- 设置与翻译（DeepSeek） ---------- */
var apiKey = GM_getValue('deepseek_key', '');
var savedMode = GM_getValue('mode', 'zh');
var auto = GM_getValue('auto', true);
var pending = 0;
var doneCount = 0;
var lastError = '';
var cache = new Map();
var ui = { render: function () {}, open: function () {} };

var PROMPT = [
  '你是资深的网页翻译编辑。用户给你一个 JSON：title 是网页标题，items 是网页上按顺序排列的英文文本片段。',
  '请把每一条翻译成自然、流畅、地道的简体中文，读起来像中文母语编辑写的，不要翻译腔。要求：',
  '1. 结合标题和前后条目理解语境，术语前后一致；',
  '2. 人名、品牌、产品名、代码、网址、数字、单位保持原样；',
  '3. 菜单、按钮等短文本用常见的中文界面用语（如 Sign in → 登录）；',
  '4. 已经是中文或不需要翻译的条目原样返回。',
  '只输出 JSON：{"t": ["译文1", "译文2", ...]}，条数和顺序必须与 items 完全一致。',
].join('\n');

function looksEnglish() {
  var lang = (document.documentElement.lang || '').toLowerCase();
  if (/^(zh|ja|ko)/.test(lang)) return false;
  var t = ((document.body && document.body.innerText) || '').slice(0, 4000);
  var latin = (t.match(/[A-Za-z]/g) || []).length;
  var cjk = (t.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
  return latin > 150 && cjk < latin * 0.1;
}

function request(title, items) {
  return new Promise(function (resolve, reject) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://api.deepseek.com/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      data: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.3,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: JSON.stringify({ title: title, items: items }) },
        ],
      }),
      timeout: 60000,
      onload: function (r) {
        if (r.status !== 200) {
          reject(new Error(
            r.status === 401 ? 'API Key 无效，请检查' :
            r.status === 402 ? 'DeepSeek 账户余额不足' : '翻译服务出错（' + r.status + '）'
          ));
          return;
        }
        try {
          var c = JSON.parse(r.responseText).choices[0].message.content.trim();
          c = c.replace(/^```(json)?/, '').replace(/```$/, '').trim();
          var t = JSON.parse(c).t;
          resolve(Array.isArray(t) ? t : null);
        } catch (e) {
          resolve(null);
        }
      },
      onerror: function () { reject(new Error('网络不稳定，稍后自动重试')); },
      ontimeout: function () { reject(new Error('网络超时，稍后自动重试')); },
    });
  });
}

// 模型偶尔漏条：对半拆开重试，保证每段一一对应
function translateBatch(title, items) {
  if (!items.length) return Promise.resolve([]);
  return request(title, items).then(function (t) {
    if (t && t.length === items.length) return t;
    if (items.length === 1) return [(t && t[0]) || items[0]];
    var mid = items.length >> 1;
    return translateBatch(title, items.slice(0, mid)).then(function (a) {
      return translateBatch(title, items.slice(mid)).then(function (b) { return a.concat(b); });
    });
  });
}

// 与 App 内置浏览器相同的接口，整页翻译核心代码直接复用
var YiMuNative = {
  translate: function (id, payload) {
    var p = JSON.parse(payload);
    if (!apiKey) {
      lastError = '请先填写 DeepSeek API Key';
      ui.open();
      setTimeout(function () { window.__yimu.onError(id); }, 0);
      return;
    }
    var miss = p.items.filter(function (s) { return !cache.has(s); });
    translateBatch(p.title, miss).then(function (res) {
      miss.forEach(function (s, i) { cache.set(s, res[i]); });
      lastError = '';
      window.__yimu.onResult(id, p.items.map(function (s) { return cache.get(s); }));
      ui.render();
    }).catch(function (e) {
      lastError = e.message;
      window.__yimu.onError(id);
      ui.render();
    });
  },
  status: function (p, d) {
    pending = p;
    doneCount = d;
    ui.render();
  },
};

window.__yimuMode = auto && looksEnglish() ? savedMode : 'off';
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

  var KEEP_SEPARATE = /^(A|BUTTON|LABEL|LI|TD|TH|DT|DD|SUMMARY|OPTION)$/;
  var SENTENCE = 'h1,h2,h3,h4,h5,h6,p,blockquote,figcaption';
  var rootCache = new WeakMap();

  function wordCount(t) {
    t = (t || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  /*
   * 很多网站为了做动画，把标题的每个单词放进单独的小块里。
   * 如果逐块翻译就会变成"一个词一个词"的硬翻，所以要找到整句话所在的元素：
   * 1. 在标题、段落里面的，整个标题 / 段落算一句；
   * 2. 一排都是只有一两个词的小块、连起来像一句话的，合并成它们的父元素。
   */
  function sentenceRoot(b) {
    var cached = rootCache.get(b);
    if (cached) return cached;
    var r = b;
    if (!KEEP_SEPARATE.test(b.tagName)) {
      var sem = b.closest(SENTENCE);
      if (sem && sem !== b && !sem.closest('[contenteditable]')) {
        r = sem;
      } else {
        for (var level = 0; level < 2; level++) {
          if (!/^(SPAN|DIV|EM|STRONG|B|I|SMALL)$/.test(r.tagName) || wordCount(r.textContent) > 3) break;
          var parent = r.parentElement;
          if (!parent || parent === document.body) break;
          var kids = parent.children;
          if (kids.length < 3) break;
          var ok = true;
          for (var i = 0; i < kids.length && ok; i++) {
            var k = kids[i];
            if (k.tagName === 'BR') continue;
            if (KEEP_SEPARATE.test(k.tagName) || wordCount(k.textContent) > 3) ok = false;
          }
          // flex 排版里单词之间可能没有空格，按子元素拼接
          var merged = Array.prototype.map.call(kids, function (k) { return (k.textContent || '').trim(); })
            .join(' ').replace(/\s+/g, ' ').trim();
          // 像一句话：至少 4 个词，并且有小写开头的词（菜单一般每项都大写开头）
          if (!ok || wordCount(merged) < 4 || !/\s[a-z]/.test(merged)) break;
          r = parent;
        }
      }
    }
    rootCache.set(b, r);
    return r;
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
      b = sentenceRoot(b);
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
/* ---------- 右下角「译」按钮和设置面板 ---------- */
(function () {
  var current = window.__yimuMode;
  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:28px;z-index:2147483647;';
  var root = host.attachShadow({ mode: 'closed' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif}' +
    '.btn{width:48px;height:48px;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;' +
    'font-size:20px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(23,21,59,.28);position:relative;' +
    'transition:transform .15s,background .2s,color .2s;-webkit-tap-highlight-color:transparent}' +
    '.btn:active{transform:scale(.92)}' +
    '.on{background:#17153B;color:#fff}.off{background:#fff;color:#17153B}' +
    '.ring{position:absolute;inset:-4px;border-radius:50%;border:3px solid transparent;border-top-color:#8E8CFF;' +
    'animation:spin .8s linear infinite;display:none}.busy .ring{display:block}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.panel{position:absolute;right:0;bottom:62px;width:300px;background:#fff;color:#1A1A1F;border-radius:20px;' +
    'padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);display:none;font-size:14px}' +
    '.panel.show{display:block}' +
    '.title{font-weight:700;font-size:16px;margin-bottom:12px}' +
    '.seg{display:flex;background:#F0EFEA;border-radius:12px;padding:3px;gap:2px}' +
    '.seg button{flex:1;border:0;background:transparent;padding:9px 0;border-radius:9px;font-size:14px;color:#1A1A1F}' +
    '.seg button.sel{background:#4B47D6;color:#fff;font-weight:600}' +
    '.row{display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:10px}' +
    '.muted{color:#6E6E78;font-size:13px;line-height:1.5;margin-top:12px}' +
    '.err{color:#C0392B}' +
    'input[type=password]{flex:1;min-width:0;border:1px solid #E7E5DF;border-radius:10px;padding:9px 10px;font-size:14px}' +
    '.save{border:0;background:#4B47D6;color:#fff;border-radius:10px;padding:9px 14px;font-size:14px}' +
    '.sw{width:44px;height:26px;border-radius:13px;background:#D6D4CE;position:relative;border:0;flex:none}' +
    '.sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}' +
    '.sw.on2{background:#4B47D6}.sw.on2::after{left:21px}' +
    '</style>' +
    '<div class="panel" id="panel">' +
    '  <div class="title">译幕 · 网页翻译</div>' +
    '  <div class="seg" id="seg"><button data-m="zh">中文</button><button data-m="dual">双语</button><button data-m="off">原文</button></div>' +
    '  <div class="row"><span>英文网页自动翻译</span><button class="sw" id="auto"></button></div>' +
    '  <div class="row" id="keyrow"><input type="password" id="key" placeholder="DeepSeek API Key（sk-…）"><button class="save" id="savekey">保存</button></div>' +
    '  <div class="muted" id="status"></div>' +
    '</div>' +
    '<button class="btn" id="btn"><span class="ring"></span>译</button>';

  var $ = function (id) { return root.getElementById(id); };
  var panel = $('panel');
  var btn = $('btn');

  // 用户在这个页面手动点了「原文」，就不要再自动翻译这个页面
  var userOff = false;

  function setMode(m) {
    if (m === 'off' && current !== 'off') userOff = true;
    current = m;
    if (m !== 'off') GM_setValue('mode', m);
    window.__yimu.setMode(m);
    render();
  }

  function render() {
    btn.className = 'btn ' + (current === 'off' ? 'off' : 'on') + (pending > 0 ? ' busy' : '');
    root.querySelectorAll('#seg button').forEach(function (b) {
      b.className = b.getAttribute('data-m') === current ? 'sel' : '';
    });
    $('auto').className = 'sw' + (auto ? ' on2' : '');
    $('keyrow').style.display = apiKey ? 'none' : 'flex';
    var s = $('status');
    if (lastError) {
      s.className = 'muted err';
      s.textContent = lastError;
    } else {
      s.className = 'muted';
      s.textContent = pending > 0 ? '正在翻译…' :
        doneCount > 0 ? '已翻译 ' + doneCount + ' 段。点「原文」可随时对照。' :
        apiKey ? '点「中文」开始翻译这个网页。' : '在 platform.deepseek.com 创建 API Key 后粘贴到这里。';
    }
  }

  btn.addEventListener('click', function () {
    // 原文状态下点按钮：直接开始翻译；已翻译时点按钮：打开设置面板
    if (current === 'off' && apiKey && !panel.classList.contains('show')) {
      setMode(GM_getValue('mode', 'zh'));
      return;
    }
    panel.classList.toggle('show');
  });
  root.querySelectorAll('#seg button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-m')); });
  });
  $('auto').addEventListener('click', function () {
    auto = !auto;
    GM_setValue('auto', auto);
    render();
  });
  $('savekey').addEventListener('click', function () {
    var v = $('key').value.trim();
    if (!v) return;
    apiKey = v;
    GM_setValue('deepseek_key', v);
    lastError = '';
    setMode(current === 'off' ? 'zh' : current);
  });
  document.addEventListener('click', function (e) {
    if (e.target !== host) panel.classList.remove('show');
  });

  ui.render = render;
  ui.open = function () { panel.classList.add('show'); render(); };
  document.documentElement.appendChild(host);
  render();

  /*
   * 常驻：
   * 1. 有些网站重绘页面时会把「译」按钮删掉，发现不在了就重新挂上；
   * 2. 很多网站先出一个空架子，内容过一会儿才加载，所以英文检测要多试几次；
   * 3. YouTube / Reddit / X 这类单页网站换页时不会重新加载，监听地址变化后重新判断；
   * 4. 从后台切回、返回上一页时（页面从缓存恢复），也重新判断一次。
   */
  function maybeAuto() {
    if (!auto || userOff || current !== 'off' || !apiKey) return;
    if (looksEnglish()) setMode(GM_getValue('mode', 'zh'));
  }

  var lastUrl = location.href;
  setInterval(function () {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      userOff = false;
      maybeAuto();
    }
  }, 1000);
  [1500, 4000, 8000].forEach(function (t) { setTimeout(maybeAuto, t); });
  window.addEventListener('pageshow', maybeAuto);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') maybeAuto();
  });
})();
})();
