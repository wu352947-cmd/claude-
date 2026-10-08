/* Terminal: a small zsh-like shell over the virtual file system */
(function () {
  const { h, glyph } = OS;
  const vfs = OS.vfs;

  const APPLE_ART = [
    '                    c.\'',
    '                 ,xNMM.',
    '               .OMMMMo',
    '               lMMM"',
    '     .;loddo:.  .olloddol;.',
    '   cKMMMMMMMMMMNWMMMMMMMMMM0:',
    ' .KMMMMMMMMMMMMMMMMMMMMMMMWd.',
    ' XMMMMMMMMMMMMMMMMMMMMMMMX.',
    ';MMMMMMMMMMMMMMMMMMMMMMMM:',
    ':MMMMMMMMMMMMMMMMMMMMMMMM:',
    '.MMMMMMMMMMMMMMMMMMMMMMMMX.',
    ' kMMMMMMMMMMMMMMMMMMMMMMMMWd.',
    ' \'XMMMMMMMMMMMMMMMMMMMMMMMMMMk',
    '  \'XMMMMMMMMMMMMMMMMMMMMMMMMK.',
    '    kMMMMMMMMMMMMMMMMMMMMMMd',
    '     ;KMMMMMMMWXXWMMMMMMMk.',
    '       "cooc*"    "*coo\'"',
  ];

  OS.registerApp({
    id: 'terminal', name: '终端', icon: 'terminal', keywords: ['terminal', 'shell', 'zsh', 'console', 'cmd'], width: 720, height: 460, minWidth: 360, minHeight: 200, alwaysNew: false,
    description: '使用命令行访问这台 Mac。',
    windowClass: 'term-win',
    menus: (win) => [
      { title: 'Shell', items: [
        { label: '新建窗口', key: '⌘N', action: () => OS.newWindow('terminal') },
        { label: '新建标签页', key: '⌘T', disabled: true },
        { sep: true },
        { label: '关闭窗口', key: '⌘W', disabled: !win, action: () => win.close() },
      ] },
      { title: '编辑', items: [
        { label: '拷贝', key: '⌘C', action: () => document.execCommand('copy') },
        { label: '全选', key: '⌘A', disabled: !win, action: () => win && window.getSelection().selectAllChildren(win.body.querySelector('.term-out')) },
        { sep: true },
        { label: '清除到开头', key: '⌘K', disabled: !win, action: () => win.state_.clear() },
      ] },
      { title: '显示', items: [
        { label: '放大', key: '⌘+', disabled: !win, action: () => win.state_.font(1) },
        { label: '缩小', key: '⌘-', disabled: !win, action: () => win.state_.font(-1) },
        { label: '默认字体大小', key: '⌘0', disabled: !win, action: () => win.state_.font(0) },
      ] },
    ],
    create(win, args) {
      const st = (win.state_ = { cwd: vfs.norm(args.cwd || vfs.HOME), hist: OS.store.get('term.history', []), hi: -1, size: 13 });
      const out = h('div.term-out');
      const input = h('input.term-input', { id: 'term-input-' + win.id, type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': '命令' });
      const promptEl = h('span.term-prompt');
      const line = h('div.term-line', promptEl, input);
      const scroller = h('div.term-scroll', out, line);
      const root = h('div.app.terminal', h('div.term-bar', { 'data-drag': '' }, h('span.term-title')), scroller);
      win.body.appendChild(root);
      const titleEl = root.querySelector('.term-title');

      const short = (p) => (p === vfs.HOME ? '~' : p.startsWith(vfs.HOME + '/') ? '~' + p.slice(vfs.HOME.length) : p);
      const prompt = () => `${OS.user.short}@${OS.user.host} ${vfs.baseName(st.cwd) === OS.user.short ? '~' : st.cwd === '/' ? '/' : vfs.baseName(st.cwd)} % `;
      const updatePrompt = () => {
        promptEl.textContent = prompt();
        titleEl.textContent = `${OS.user.short} — -zsh — ${Math.round(win.bounds.w / 7.8)}×${Math.round(win.bounds.h / 17)}`;
        win.setTitle(`${short(st.cwd)} — -zsh`);
      };
      const print = (text, cls) => {
        const el = h('div.term-row' + (cls ? '.' + cls : ''));
        el.textContent = text;
        out.appendChild(el);
        return el;
      };
      const printHTML = (html) => out.appendChild(h('div.term-row', { html }));
      const scroll = () => (scroller.scrollTop = scroller.scrollHeight);
      st.clear = () => (out.innerHTML = '');
      st.font = (d) => {
        st.size = d === 0 ? 13 : Math.max(9, Math.min(24, st.size + d));
        root.style.fontSize = st.size + 'px';
      };
      const abs = (p) => vfs.norm(!p ? st.cwd : p.startsWith('/') || p.startsWith('~') ? p : st.cwd + '/' + p);

      const last = OS.store.get('term.lastLogin', null);
      const now = new Date();
      print(`Last login: ${last || now.toString().slice(0, 24)} on ttys000`);
      OS.store.set('term.lastLogin', now.toString().slice(0, 24));
      updatePrompt();

      const cmds = {
        help() {
          print('可用命令：');
          print('  ls cd pwd cat echo mkdir touch rm mv cp tree head tail wc grep find');
          print('  open say clear history date cal whoami hostname uname sw_vers uptime');
          print('  neofetch top ps df du which man calc bc curl ping brew sudo exit');
          print('示例：open -a Safari   say 你好   echo hi > a.txt   calc 2^10');
        },
        pwd: () => print(st.cwd),
        whoami: () => print(OS.user.short),
        hostname: () => print(OS.user.host + '.local'),
        date: () => print(new Date().toString()),
        uptime: () => {
          const m = Math.floor(performance.now() / 60000);
          print(`${OS.fmt.time(new Date())}  up ${m} mins, 1 user, load averages: 1.${(Math.random() * 90 + 10) | 0} 1.42 1.38`);
        },
        uname: (a) => print(a.includes('-a') ? `Darwin ${OS.user.host}.local 25.1.0 Darwin Kernel Version 25.1.0: root:xnu-12377.1.9~3/RELEASE_ARM64_T6050 arm64` : 'Darwin'),
        sw_vers: () => (print('ProductName:\t\tmacOS'), print('ProductVersion:\t\t' + OS.version), print('BuildVersion:\t\t' + OS.build)),
        clear: () => st.clear(),
        history: () => st.hist.slice().reverse().forEach((c, i) => print(String(i + 1).padStart(5) + '  ' + c)),
        echo(a, raw) {
          const m = raw.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)$/);
          if (m) {
            const text = m[1].replace(/^["']|["']$/g, '');
            const p = abs(m[3]);
            const prev = m[2] === '>>' ? vfs.read(p) || '' : '';
            if (!vfs.write(p, prev + text + '\n')) print(`zsh: no such file or directory: ${m[3]}`, 'err');
            return;
          }
          print(a.join(' ').replace(/^["']|["']$/g, '').replace(/\$USER/g, OS.user.short).replace(/\$HOME/g, vfs.HOME));
        },
        ls(a) {
          const flags = a.filter((x) => x.startsWith('-')).join('');
          const target = a.find((x) => !x.startsWith('-'));
          const p = abs(target);
          const n = vfs.resolve(p);
          if (!n) return print(`ls: ${target}: No such file or directory`, 'err');
          if (n.type === 'file') return print(n.name);
          const list = vfs.list(p, { hidden: flags.includes('a') }) || [];
          if (flags.includes('l')) {
            print(`total ${list.length * 8}`);
            list.forEach((c) => {
              const d = new Date(c.mtime);
              const mon = d.toLocaleString('en-US', { month: 'short' });
              printHTML(`${c.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'}  1 ${OS.user.short}  staff  ${String(c.type === 'dir' ? 96 : vfs.sizeOf(c)).padStart(8)} ${mon} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${c.type === 'dir' ? `<span class="t-dir">${OS.esc(c.name)}</span>` : OS.esc(c.name)}`);
            });
          } else {
            printHTML(list.map((c) => (c.type === 'dir' ? `<span class="t-dir">${OS.esc(c.name)}</span>` : c.kind === 'app' ? `<span class="t-app">${OS.esc(c.name)}</span>` : OS.esc(c.name))).join('&nbsp;&nbsp;&nbsp;') || '');
          }
        },
        cd(a) {
          const p = abs(a[0] || '~');
          const n = vfs.resolve(p);
          if (!n) return print(`cd: no such file or directory: ${a[0]}`, 'err');
          if (n.type !== 'dir') return print(`cd: not a directory: ${a[0]}`, 'err');
          st.cwd = p;
        },
        cat(a) {
          if (!a.length) return print('usage: cat file ...', 'err');
          a.forEach((f) => {
            const n = vfs.resolve(abs(f));
            if (!n) print(`cat: ${f}: No such file or directory`, 'err');
            else if (n.type === 'dir') print(`cat: ${f}: Is a directory`, 'err');
            else if (n.kind === 'image') print(`cat: ${f}: binary file (image)`, 'err');
            else (n.content || '').split('\n').forEach((l) => print(l));
          });
        },
        head: (a) => cmds._slice(a, 0),
        tail: (a) => cmds._slice(a, 1),
        _slice(a, tail) {
          const ni = a.indexOf('-n');
          const n = ni >= 0 ? +a[ni + 1] : 10;
          const f = a.filter((x, i) => !x.startsWith('-') && i !== ni + 1)[0];
          const t = vfs.read(abs(f));
          if (t == null) return print(`${tail ? 'tail' : 'head'}: ${f}: No such file or directory`, 'err');
          const lines = t.split('\n');
          (tail ? lines.slice(-n) : lines.slice(0, n)).forEach((l) => print(l));
        },
        wc(a) {
          const f = a.filter((x) => !x.startsWith('-'))[0];
          const t = vfs.read(abs(f));
          if (t == null) return print(`wc: ${f}: open: No such file or directory`, 'err');
          print(`${String(t.split('\n').length).padStart(8)}${String(t.split(/\s+/).filter(Boolean).length).padStart(8)}${String(t.length).padStart(8)} ${f}`);
        },
        grep(a) {
          const [pat, f] = a.filter((x) => !x.startsWith('-'));
          const t = vfs.read(abs(f || ''));
          if (!pat) return print('usage: grep pattern file', 'err');
          if (t == null) return print(`grep: ${f}: No such file or directory`, 'err');
          const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), a.includes('-i') ? 'gi' : 'g');
          t.split('\n').filter((l) => re.test((re.lastIndex = 0, l))).forEach((l) => printHTML(OS.esc(l).replace(new RegExp(OS.esc(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), a.includes('-i') ? 'gi' : 'g'), (m) => `<span class="t-hit">${m}</span>`)));
        },
        find(a) {
          const ni = a.indexOf('-name');
          const pat = ni >= 0 ? a[ni + 1] : null;
          const base = abs(a[0] && !a[0].startsWith('-') ? a[0] : '.');
          const re = pat ? new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
          (function walk(p, depth) {
            const n = vfs.resolve(p);
            if (!n || depth > 6) return;
            if (!re || re.test(n.name)) print(short(p).replace(short(base), a[0] && !a[0].startsWith('-') ? a[0] : '.') || '.');
            if (n.type === 'dir') (n.children || []).forEach((c) => walk(vfs.norm(p + '/' + c.name), depth + 1));
          })(base, 0);
        },
        tree(a) {
          const base = abs(a[0]);
          print(a[0] || '.');
          let dirs = 0, files = 0;
          (function walk(p, pre, depth) {
            const list = vfs.list(p) || [];
            list.forEach((c, i) => {
              const lastOne = i === list.length - 1;
              const name = c.type === 'dir' ? `<span class="t-dir">${OS.esc(c.name)}</span>` : OS.esc(c.name);
              printHTML(OS.esc(pre + (lastOne ? '└── ' : '├── ')) + name);
              if (c.type === 'dir') {
                dirs++;
                if (depth < 3) walk(p + '/' + c.name, pre + (lastOne ? '    ' : '│   '), depth + 1);
              } else files++;
            });
          })(base, '', 0);
          print(`\n${dirs} directories, ${files} files`);
        },
        mkdir(a) {
          const p = a.includes('-p');
          a.filter((x) => !x.startsWith('-')).forEach((d) => {
            if (p) {
              let cur = '';
              abs(d).slice(1).split('/').forEach((part) => {
                cur += '/' + part;
                if (!vfs.resolve(cur)) vfs.mkdir(cur);
              });
            } else if (!vfs.mkdir(abs(d))) print(`mkdir: ${d}: File exists or parent missing`, 'err');
          });
        },
        touch: (a) => a.forEach((f) => (vfs.resolve(abs(f)) ? vfs.write(abs(f), null) : vfs.write(abs(f), ''))),
        rm(a) {
          const r = a.some((x) => /^-\w*r/.test(x));
          a.filter((x) => !x.startsWith('-')).forEach((f) => {
            const n = vfs.resolve(abs(f));
            if (!n) return print(`rm: ${f}: No such file or directory`, 'err');
            if (n.type === 'dir' && !r) return print(`rm: ${f}: is a directory`, 'err');
            vfs.remove(abs(f));
          });
        },
        rmdir: (a) => a.forEach((f) => {
          const n = vfs.resolve(abs(f));
          if (!n || n.type !== 'dir') return print(`rmdir: ${f}: Not a directory`, 'err');
          if (n.children.length) return print(`rmdir: ${f}: Directory not empty`, 'err');
          vfs.remove(abs(f));
        }),
        mv(a) {
          const [s, d] = a;
          if (!s || !d) return print('usage: mv source target', 'err');
          const dn = vfs.resolve(abs(d));
          if (dn && dn.type === 'dir') vfs.move(abs(s), abs(d)) || print(`mv: ${s}: No such file or directory`, 'err');
          else if (vfs.parentOf(abs(s)) === vfs.parentOf(abs(d))) vfs.rename(abs(s), vfs.baseName(abs(d))) || print(`mv: rename ${s} failed`, 'err');
          else vfs.move(abs(s), vfs.parentOf(abs(d)), vfs.baseName(abs(d))) || print(`mv: ${s}: No such file or directory`, 'err');
        },
        cp(a) {
          const [s, d] = a.filter((x) => !x.startsWith('-'));
          const n = vfs.resolve(abs(s || ''));
          if (!n) return print(`cp: ${s}: No such file or directory`, 'err');
          const dn = vfs.resolve(abs(d || ''));
          if (dn && dn.type === 'dir') vfs.copy(abs(s), abs(d));
          else if (n.type === 'file') vfs.write(abs(d), n.content, { kind: n.kind, src: n.src });
        },
        open(a) {
          const ai = a.indexOf('-a');
          if (ai >= 0) {
            const name = a.slice(ai + 1).join(' ').replace(/\.app$/, '').toLowerCase();
            const app = Object.values(OS.apps).find((x) => !x.hidden && [x.name, x.id, ...(x.keywords || [])].some((k) => k.toLowerCase() === name));
            if (!app) return print(`Unable to find application named '${a.slice(ai + 1).join(' ')}'`, 'err');
            return OS.launch(app.id);
          }
          if (!a[0]) return print('Usage: open [-a application] file', 'err');
          if (/^https?:/.test(a[0])) return OS.launch('safari', { url: a[0] });
          const p = abs(a[0]);
          if (!vfs.resolve(p)) return print(`The file ${p} does not exist.`, 'err');
          vfs.open(p);
        },
        say(a) {
          const text = a.join(' ');
          if (!text) return;
          try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = /[一-龥]/.test(text) ? 'zh-CN' : 'en-US';
            u.volume = OS.settings.volume / 100;
            speechSynthesis.speak(u);
          } catch (e) {
            print('say: speech is not available', 'err');
          }
        },
        neofetch() {
          const up = Math.floor(performance.now() / 60000);
          const info = [
            `<b class="t-g">${OS.user.short}</b>@<b class="t-g">${OS.user.host}</b>`,
            '-----------------------',
            `<b class="t-y">OS</b>: macOS Tahoe ${OS.version} ${OS.build} arm64`,
            `<b class="t-y">Host</b>: MacBook Pro (14-inch, 2025)`,
            `<b class="t-y">Kernel</b>: Darwin 25.1.0`,
            `<b class="t-y">Uptime</b>: ${up} mins`,
            `<b class="t-y">Packages</b>: 128 (brew)`,
            `<b class="t-y">Shell</b>: zsh 5.9`,
            `<b class="t-y">Resolution</b>: ${window.screen.width}x${window.screen.height}`,
            `<b class="t-y">DE</b>: Aqua`,
            `<b class="t-y">WM</b>: Quartz Compositor`,
            `<b class="t-y">Terminal</b>: Apple_Terminal`,
            `<b class="t-y">CPU</b>: Apple M5 (10)`,
            `<b class="t-y">GPU</b>: Apple M5 (10 核)`,
            `<b class="t-y">Memory</b>: ${(8 + Math.random() * 4).toFixed(0)}142MiB / 24576MiB`,
            '',
            ['#ff3b30', '#ff9500', '#ffcc00', '#28cd41', '#007aff', '#5856d6', '#af52de', '#8e8e93'].map((c) => `<span style="background:${c}">&nbsp;&nbsp;&nbsp;</span>`).join(''),
          ];
          const colors = ['#5fd700', '#5fd700', '#5fd700', '#5fd700', '#ffd700', '#ffd700', '#ff8700', '#ff8700', '#ff0000', '#ff0000', '#d70087', '#d70087', '#5f87ff', '#5f87ff', '#5f87ff', '#5f87ff', '#5f87ff'];
          const rows = Math.max(APPLE_ART.length, info.length);
          for (let i = 0; i < rows; i++) {
            const art = (APPLE_ART[i] || '').padEnd(34);
            printHTML(`<span style="color:${colors[i] || '#5f87ff'}">${OS.esc(art)}</span>${info[i] || ''}`);
          }
        },
        top() {
          print('Processes: 412 total, 3 running, 409 sleeping, 2048 threads');
          print(`Load Avg: 1.52, 1.43, 1.38  CPU usage: ${(Math.random() * 10 + 4).toFixed(2)}% user, ${(Math.random() * 6 + 2).toFixed(2)}% sys`);
          print('PhysMem: 18G used (2.1G wired), 6.0G unused.');
          print('');
          print('PID    COMMAND          %CPU  MEM');
          const procs = [['WindowServer', 12.4, '412M'], ['kernel_task', 6.1, '1.2G'], ...[...OS.running.keys()].map((id) => [OS.apps[id].name, Math.random() * 8, (Math.random() * 400 + 80 | 0) + 'M']), ['Spotlight', 0.4, '88M'], ['Dock', 0.3, '64M']];
          procs.forEach(([n, c, m], i) => print(`${String(300 + i * 37).padEnd(7)}${String(n).padEnd(17)}${(+c).toFixed(1).padStart(4)}  ${m}`));
        },
        ps() {
          print('  PID TTY           TIME CMD');
          print('  512 ttys000    0:00.04 -zsh');
          [...OS.running.keys()].forEach((id, i) => print(`${String(600 + i * 11).padStart(5)} ??         0:0${i}.${(Math.random() * 90 + 10) | 0} /Applications/${OS.apps[id].name}.app`));
        },
        df: () => {
          print('Filesystem       Size   Used  Avail Capacity  Mounted on');
          print('/dev/disk3s1s1  494Gi   10Gi  213Gi     5%    /');
          print('/dev/disk3s5    494Gi  268Gi  213Gi    56%    /System/Volumes/Data');
        },
        du(a) {
          const p = abs(a.filter((x) => !x.startsWith('-'))[0]);
          const n = vfs.resolve(p);
          if (!n) return print('du: No such file or directory', 'err');
          print(`${OS.fmt.size(vfs.sizeOf(n)).replace(' ', '')}\t${a.filter((x) => !x.startsWith('-'))[0] || '.'}`);
        },
        which: (a) => a.forEach((c) => print(cmds[c] ? `/bin/${c}` : `${c} not found`, cmds[c] ? '' : 'err')),
        man: (a) => print(a[0] && cmds[a[0]] ? `${a[0]}：请输入 help 查看用法示例。` : 'What manual page do you want?'),
        calc: (a) => {
          const v = OS.calc(a.join(' '));
          print(v == null ? 'calc: 无法计算' : OS.formatNumber(v), v == null ? 'err' : '');
        },
        bc: (a) => cmds.calc(a),
        cal() {
          const d = new Date();
          const y = d.getFullYear(), m = d.getMonth();
          print(`      ${m + 1}月 ${y}`);
          print('日 一 二 三 四 五 六');
          const first = new Date(y, m, 1).getDay();
          const days = new Date(y, m + 1, 0).getDate();
          let row = '   '.repeat(first);
          for (let i = 1; i <= days; i++) {
            const s = String(i).padStart(2);
            row += (i === d.getDate() ? `<span class="t-inv">${s}</span>` : s) + ' ';
            if ((first + i) % 7 === 0 || i === days) {
              printHTML(row);
              row = '';
            }
          }
        },
        curl: (a) => (OS.settings.wifi ? print(`curl: (6) Could not resolve host: ${(a.find((x) => !x.startsWith('-')) || '').replace(/^https?:\/\//, '').split('/')[0] || '?'}（虚拟网络）`, 'err') : print('curl: (6) Network is unreachable', 'err')),
        async ping(a) {
          const host = a.find((x) => !x.startsWith('-')) || 'apple.com';
          if (!OS.settings.wifi) return print(`ping: cannot resolve ${host}: Unknown host`, 'err');
          print(`PING ${host} (17.253.144.10): 56 data bytes`);
          for (let i = 0; i < 4; i++) {
            await OS.wait(600);
            print(`64 bytes from 17.253.144.10: icmp_seq=${i} ttl=57 time=${(Math.random() * 20 + 12).toFixed(3)} ms`);
            scroll();
          }
          print(`--- ${host} ping statistics ---`);
          print('4 packets transmitted, 4 packets received, 0.0% packet loss');
        },
        async brew(a) {
          if (a[0] === 'install' && a[1]) {
            print(`==> Downloading https://ghcr.io/v2/homebrew/core/${a[1]}/manifests/latest`);
            for (const p of [12, 38, 71, 100]) {
              await OS.wait(350);
              print(`${'#'.repeat(p / 4)} ${p}.0%`);
              scroll();
            }
            print(`==> Pouring ${a[1]}--1.0.arm64_tahoe.bottle.tar.gz`);
            print(`🍺  /opt/homebrew/Cellar/${a[1]}/1.0: 12 files, 1.4MB`.replace('🍺  ', ''));
          } else if (a[0] === 'list') print('git  node  python@3.13  ripgrep  wget');
          else print('Example usage:\n  brew install FORMULA\n  brew list');
        },
        async sudo(a) {
          print(`Password:`);
          await OS.wait(900);
          print(`${OS.user.short} is not in the sudoers file. This incident will be reported.`, 'err');
        },
        exit: () => win.close(),
        logout: () => win.close(),
      };
      const aliases = { ll: 'ls -l', la: 'ls -a', cls: 'clear', '..': 'cd ..' };

      async function run(raw) {
        const echoLine = h('div.term-row', h('span.term-prompt', prompt()), document.createTextNode(raw));
        out.appendChild(echoLine);
        raw = raw.trim();
        if (!raw) return;
        if (st.hist[0] !== raw) st.hist.unshift(raw);
        st.hist = st.hist.slice(0, 200);
        OS.store.set('term.history', st.hist);
        st.hi = -1;
        for (const part of raw.split(/\s*(?:&&|;)\s*/)) {
          let line2 = part;
          const first = line2.split(/\s+/)[0];
          if (aliases[first]) line2 = aliases[first] + line2.slice(first.length);
          const tokens = (line2.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["'](.*)["']$/, '$1'));
          const [cmd, ...argv] = tokens;
          if (!cmd) continue;
          if (cmd.startsWith('_') || !cmds[cmd]) {
            const v = /^[\d(]/.test(cmd) ? OS.calc(line2) : null;
            if (v != null) print(OS.formatNumber(v));
            else print(`zsh: command not found: ${cmd}`, 'err');
            continue;
          }
          try {
            line.hidden = true;
            await cmds[cmd](argv, line2);
          } catch (e) {
            print(String(e.message || e), 'err');
          } finally {
            line.hidden = false;
          }
        }
      }

      function complete() {
        const v = input.value;
        const parts = v.split(/\s+/);
        const word = parts[parts.length - 1];
        if (parts.length === 1) {
          const m = Object.keys(cmds).filter((c) => !c.startsWith('_') && c.startsWith(word));
          if (m.length === 1) input.value = m[0] + ' ';
          else if (m.length > 1) print(m.join('  '));
          return;
        }
        const dirPart = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
        const base = word.slice(dirPart.length);
        const list = vfs.list(abs(dirPart || '.')) || [];
        const m = list.filter((c) => c.name.startsWith(base));
        if (m.length === 1) {
          parts[parts.length - 1] = dirPart + m[0].name.replace(/ /g, '\\ ') + (m[0].type === 'dir' ? '/' : '');
          input.value = parts.join(' ').replace(/\\ /g, ' ');
        } else if (m.length > 1) {
          print(m.map((c) => c.name).join('  '));
          // common prefix
          let pre = m[0].name;
          m.forEach((c) => {
            while (!c.name.startsWith(pre)) pre = pre.slice(0, -1);
          });
          parts[parts.length - 1] = dirPart + pre;
          input.value = parts.join(' ');
        }
      }

      input.addEventListener('keydown', async (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const v = input.value;
          input.value = '';
          await run(v);
          updatePrompt();
          scroll();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          complete();
          scroll();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (st.hi < st.hist.length - 1) input.value = st.hist[++st.hi];
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          st.hi > 0 ? (input.value = st.hist[--st.hi]) : ((st.hi = -1), (input.value = ''));
        } else if (e.ctrlKey && e.key === 'c') {
          out.appendChild(h('div.term-row', h('span.term-prompt', prompt()), document.createTextNode(input.value + '^C')));
          input.value = '';
          scroll();
        } else if ((e.ctrlKey && e.key === 'l') || (OS.cmd(e) && e.key === 'k')) {
          e.preventDefault();
          st.clear();
        } else if (OS.cmd(e) && (e.key === 'w' || e.key === 'q' || e.key === 'm')) {
          // let the system shortcut handler see it
          document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey }));
        }
      });
      root.addEventListener('mouseup', () => {
        if (!window.getSelection().toString()) input.focus();
      });
      win.on('focus', () => setTimeout(() => input.focus(), 0));
      win.on('resize', updatePrompt);
      setTimeout(() => input.focus(), 80);
    },
  });
})();
