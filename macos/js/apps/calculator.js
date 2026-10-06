/* Calculator — basic & scientific, with history */
(function () {
  const { h, glyph } = OS;

  OS.registerApp({
    id: 'calculator', name: '计算器', icon: 'calculator', keywords: ['calculator', 'calc', '计算'], width: 252, height: 402, resizable: false, singleton: true, quitOnClose: true, windowClass: 'calc-win',
    description: '基本、科学型计算器，并保留计算历史。',
    menus: (win) => [
      { title: '显示', items: [
        { label: '基本', key: '⌘1', checked: win && !win.state_.sci, action: () => win && win.state_.setSci(false) },
        { label: '科学型', key: '⌘2', checked: win && win.state_.sci, action: () => win && win.state_.setSci(true) },
        { sep: true },
        { label: '显示历史记录', checked: win && win.state_.showHist, action: () => win && win.state_.toggleHist() },
        { label: '清除历史记录', action: () => (OS.store.set('calc.history', []), win && win.state_.renderHist()) },
      ] },
    ],
    onKey(win, e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      const st = win.state_;
      const cmd = OS.cmd(e);
      if (cmd && e.code === 'Digit1') return e.preventDefault(), st.setSci(false);
      if (cmd && e.code === 'Digit2') return e.preventDefault(), st.setSci(true);
      if (cmd && e.code === 'KeyC') return e.preventDefault(), navigator.clipboard && navigator.clipboard.writeText(st.value()).catch(() => {});
      if (cmd) return;
      const map = { Enter: '=', '=': '=', Escape: 'AC', Backspace: '⌫', '*': '×', '/': '÷', '-': '−', '+': '+', '%': '%', '.': '.', '(': '(', ')': ')', '^': '^' };
      const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
      if (k) {
        e.preventDefault();
        st.press(k);
      }
    },
    create(win) {
      const st = (win.state_ = { expr: '', result: null, sci: false, showHist: false, mem: 0, rad: false });
      const exprEl = h('div.calc-expr');
      const valEl = h('div.calc-val', '0');
      const pad = h('div.calc-pad');
      const sciPad = h('div.calc-sci');
      const hist = h('div.calc-hist');
      const root = h('div.app.calculator', h('div.calc-main', h('div.calc-display', { 'data-drag': '' }, exprEl, valEl), h('div.calc-keys', sciPad, pad)), hist);
      win.body.appendChild(root);

      const BASIC = [
        ['AC', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'],
        ['7'], ['8'], ['9'], ['×', 'op'],
        ['4'], ['5'], ['6'], ['−', 'op'],
        ['1'], ['2'], ['3'], ['+', 'op'],
        ['mode', 'fn'], ['0'], ['.'], ['=', 'op eq'],
      ];
      const SCI = [
        ['('], [')'], ['mc'], ['m+'], ['m-'], ['mr'],
        ['2ⁿᵈ'], ['x²'], ['x³'], ['xʸ'], ['eˣ'], ['10ˣ'],
        ['¹/x'], ['√x'], ['∛x'], ['ʸ√x'], ['ln'], ['log₁₀'],
        ['x!'], ['sin'], ['cos'], ['tan'], ['e'], ['EE'],
        ['Rad'], ['sinh'], ['cosh'], ['tanh'], ['π'], ['Rand'],
      ];
      BASIC.forEach(([k, cls]) => {
        const b = h('button.ck' + (cls ? '.' + cls.split(' ').join('.') : ''), { dataset: { k } }, k === 'mode' ? h('span', { html: glyph('gear') }) : k);
        b.onclick = () => (k === 'mode' ? modeMenu(b) : st.press(k));
        pad.appendChild(b);
      });
      SCI.forEach(([k]) => {
        const b = h('button.ck.sk', { dataset: { k } }, k);
        b.onclick = () => st.press(k);
        sciPad.appendChild(b);
      });
      function modeMenu(b) {
        const r = b.getBoundingClientRect();
        OS.showMenu(OS.buildMenu([
          { label: '基本', checked: !st.sci, action: () => st.setSci(false) },
          { label: '科学型', checked: st.sci, action: () => st.setSci(true) },
          { sep: true },
          { label: '显示历史记录', checked: st.showHist, action: () => st.toggleHist() },
        ]), { x: r.left / OS.scale, y: r.bottom / OS.scale + 4 });
      }

      const fmtExpr = (s) => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/(?<![e\d])-/g, '−');
      const evaluate = (s) => {
        let src = s;
        if (!st.rad) src = src.replace(/(a?(?:sin|cos|tan))\(/g, (m, f) => (f.startsWith('a') ? m : `${f}((pi/180)*`));
        return OS.calc(src);
      };
      function render() {
        exprEl.textContent = st.result != null && !st.expr ? '' : fmtExpr(st.expr);
        const live = st.expr ? evaluate(st.expr) : null;
        const shown = st.result != null && !st.expr ? OS.formatNumber(st.result) : live != null && /[-+*/^()!%a-z]/.test(st.expr.replace(/^-/, '')) ? OS.formatNumber(live) : st.expr ? fmtExpr(st.expr.match(/[\d.e]+$/)?.[0] || fmtExpr(st.expr)) : '0';
        valEl.textContent = shown;
        valEl.style.fontSize = shown.length > 12 ? '28px' : shown.length > 9 ? '36px' : '';
        pad.querySelector('[data-k="AC"]').textContent = st.expr ? 'C' : 'AC';
        root.classList.toggle('sci', st.sci);
        sciPad.querySelector('[data-k="Rad"]').textContent = st.rad ? 'Deg' : 'Rad';
      }
      st.value = () => valEl.textContent;
      st.setSci = (v) => {
        st.sci = v;
        const W = v ? 560 : 252;
        win.bounds.w = W + (st.showHist ? 220 : 0);
        win.bounds.h = v ? 350 : 402;
        OS.wm.applyBounds(win);
        render();
      };
      st.toggleHist = () => {
        st.showHist = !st.showHist;
        root.classList.toggle('show-hist', st.showHist);
        st.setSci(st.sci);
        st.renderHist();
      };
      st.renderHist = () => {
        const list = OS.store.get('calc.history', []);
        hist.innerHTML = '';
        hist.append(h('div.calc-hist-head', '历史记录'), ...(list.length ? list.map((x) => h('button.calc-hist-item', { onclick: () => ((st.expr = String(x.r)), (st.result = null), render()) }, h('small', fmtExpr(x.e)), h('b', OS.formatNumber(x.r)))) : [h('div.calc-hist-empty', '没有历史记录')]));
      };
      const lastNum = () => st.expr.match(/(\d*\.?\d+(e[+-]?\d+)?|pi|e|\))$/);
      const wrap = (pre, post = ')') => {
        const m = st.expr.match(/(\d*\.?\d+|\([^()]*\))$/);
        if (m) st.expr = st.expr.slice(0, -m[0].length) + pre + m[0] + post;
        else if (st.result != null) st.expr = pre + st.result + post;
      };
      st.press = (k) => {
        OS.sound.play('tick');
        const btn = root.querySelector(`[data-k="${CSS.escape(k)}"]`);
        if (btn) {
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 120);
        }
        if (st.result != null && !st.expr) {
          if (/[+−×÷^%]/.test(k) || ['x²', 'x³', 'xʸ', 'x!', '¹/x', '√x', '±'].includes(k)) st.expr = String(st.result);
          st.result = null;
        }
        const ops = { '+': '+', '−': '-', '×': '*', '÷': '/' };
        if (/^[0-9]$/.test(k)) st.expr += k;
        else if (k === '.') {
          const m = st.expr.match(/[\d.]*$/)[0];
          if (!m.includes('.')) st.expr += m ? '.' : '0.';
        } else if (ops[k]) {
          if (/[-+*/^]$/.test(st.expr)) st.expr = st.expr.slice(0, -1);
          if (st.expr || k === '−') st.expr += ops[k];
        } else if (k === '^' || k === 'xʸ') st.expr += '^';
        else if (k === '(' || k === ')') st.expr += k;
        else if (k === 'AC') {
          if (st.expr) st.expr = '';
          else st.result = null;
        } else if (k === '⌫') st.expr = st.expr.slice(0, -1);
        else if (k === '±') {
          const m = st.expr.match(/(-?)(\d*\.?\d+)$/);
          if (m) st.expr = st.expr.slice(0, -m[0].length) + (m[1] ? '' : '(-') + m[2] + (m[1] ? '' : ')');
        } else if (k === '%') st.expr += '%';
        else if (k === 'x²') wrap('(', ')^2');
        else if (k === 'x³') wrap('(', ')^3');
        else if (k === '¹/x') wrap('1/(');
        else if (k === '√x') st.expr += 'sqrt(';
        else if (k === '∛x') wrap('(', ')^(1/3)');
        else if (k === 'ʸ√x') st.expr += '^(1/';
        else if (k === 'x!') st.expr += '!';
        else if (k === 'eˣ') st.expr += 'e^';
        else if (k === '10ˣ') st.expr += '10^';
        else if (['sin', 'cos', 'tan', 'ln'].includes(k)) st.expr += k + '(';
        else if (k === 'log₁₀') st.expr += 'log(';
        else if (['sinh', 'cosh', 'tanh'].includes(k)) {
          const v = evaluate(st.expr || '0');
          const f = { sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh }[k];
          st.expr = String(+f(v || 0).toPrecision(12));
        } else if (k === 'π') st.expr += (lastNum() ? '*' : '') + 'pi';
        else if (k === 'e') st.expr += (lastNum() ? '*' : '') + 'e';
        else if (k === 'EE') st.expr += 'e';
        else if (k === 'Rand') st.expr += Math.random().toFixed(8);
        else if (k === 'Rad') st.rad = !st.rad;
        else if (k === 'mc') st.mem = 0;
        else if (k === 'm+') st.mem += evaluate(st.expr) || 0;
        else if (k === 'm-') st.mem -= evaluate(st.expr) || 0;
        else if (k === 'mr') st.expr += String(st.mem);
        else if (k === '2ⁿᵈ') OS.toast('反三角函数：输入 asin( / acos( / atan(');
        else if (k === '=') {
          let e2 = st.expr;
          const open = (e2.match(/\(/g) || []).length - (e2.match(/\)/g) || []).length;
          e2 += ')'.repeat(Math.max(0, open));
          const v = evaluate(e2);
          if (v == null) {
            valEl.textContent = '错误';
            OS.sound.play('error');
            return;
          }
          const list = OS.store.get('calc.history', []);
          list.unshift({ e: e2, r: v });
          OS.store.set('calc.history', list.slice(0, 50));
          st.result = v;
          st.expr = '';
          if (st.showHist) st.renderHist();
        }
        render();
      };
      render();
    },
  });
})();
