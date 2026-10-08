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

  function setMode(m) {
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
})();
