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
