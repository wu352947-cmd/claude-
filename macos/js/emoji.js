/* Emoji & Symbols (Edit ▸ Emoji & Symbols, ⌃⌘Space / 🌐E): the compact character picker that pops up at the caret
   and types into whatever text field you were in. */
(function () {
  const { h, $$ } = OS;
  const CATS = [
    ['smileys', '笑脸与情感', '😀', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 💬 💭 💤'],
    ['people', '人物与身体', '👋', '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🧠 👀 👁️ 👅 👄 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 👷 🤴 👸 👳 🤵 👰 🤰 🎅 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🚶 🏃 💃 🕺 👯 🧘'],
    ['nature', '动物与自然', '🐶', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🦚 🦜 🦢 🕊️ 🐇 🦝 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍃 🍂 🍁 🍄 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌙 🌎 🪐 ⭐ 🌟 ✨ ⚡ ☄️ 🔥 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💧 🌊'],
    ['food', '食物与饮料', '🍎', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥢 🍽️ 🍴 🥄'],
    ['activity', '活动', '⚽', '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏑 🥍 🏏 ⛳ 🏹 🎣 🥊 🥋 🎽 🛹 🛼 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧗 🚴 🏊 🏄 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩 🎉 🎊 🎈 🎁 🎀'],
    ['travel', '旅行与地点', '🚗', '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏗️ 🏭 🏢 🏬 🏣 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁'],
    ['objects', '物品', '💡', '⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 💽 💾 💿 📀 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🔪 🗡️ ⚔️ 🛡️ 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🩹 🩺 💊 💉 🧬 🦠 🧫 🧪 🌡️ 🧹 🧺 🧻 🚽 🚿 🛁 🧼 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓'],
    ['symbols', '符号', '♥️', '♥️ ♦️ ♣️ ♠️ ❣️ ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ ☢️ ☣️ 📴 📳 ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🈳 🛂 🛃 🛄 🛅 🚹 🚺 🚼 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 ⌘ ⌥ ⇧ ⌃ ⎋ ⏎ ⌫ ⌦ ⇥ ⇪  ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ π ∑ ∆ µ € £ ¥ ¢ § ¶ † • … ※ 〒 ☆ ★ ○ ● ◎ ◇ ◆ □ ■ △ ▲ ▽ ▼ → ← ↑ ↓ 「 」 『 』 【 】 〔 〕 《 》 〈 〉'],
    ['flags', '旗帜', '🏳️', '🏳️ 🏴 🏁 🚩 🏳️‍🌈 🇨🇳 🇭🇰 🇲🇴 🇹🇼 🇯🇵 🇰🇷 🇸🇬 🇺🇸 🇨🇦 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇵🇹 🇳🇱 🇨🇭 🇸🇪 🇳🇴 🇫🇮 🇩🇰 🇷🇺 🇺🇦 🇮🇳 🇹🇭 🇻🇳 🇲🇾 🇮🇩 🇵🇭 🇦🇺 🇳🇿 🇧🇷 🇦🇷 🇲🇽 🇿🇦 🇪🇬 🇹🇷 🇸🇦 🇦🇪 🇮🇱'],
  ].map(([id, name, icon, list]) => ({ id, name, icon, items: list.split(/\s+/).filter(Boolean) }));

  // a few search words per emoji (Chinese + English)
  const WORDS = {
    '😀': '笑 开心 smile happy grin', '😂': '笑哭 哭笑 lol joy', '🤣': '笑 打滚 rofl', '😊': '微笑 害羞 blush', '😍': '爱 喜欢 花痴 love heart eyes', '🥰': '爱 喜欢 love',
    '😘': '亲 飞吻 kiss', '😎': '酷 墨镜 cool', '🤔': '思考 想 think', '😭': '哭 大哭 cry sob', '😢': '哭 难过 sad', '😡': '生气 愤怒 angry', '😱': '惊恐 害怕 scream', '😴': '睡 困 sleep',
    '🙄': '白眼 无语 eye roll', '😅': '尴尬 汗 sweat', '🥳': '庆祝 派对 party', '🤯': '震惊 爆炸 mind blown', '😇': '天使 innocent', '🙃': '倒脸 upside', '😉': '眨眼 wink', '😋': '好吃 yum',
    '👍': '赞 好 棒 ok thumbs up like', '👎': '踩 差 dislike', '👏': '鼓掌 clap', '🙏': '谢谢 拜托 祈祷 pray thanks', '👋': '你好 再见 招手 hi bye wave', '💪': '加油 强壮 strong', '🤝': '握手 合作 handshake',
    '👌': '好的 ok', '✌️': '耶 胜利 victory peace', '👀': '看 眼睛 eyes look', '❤️': '爱心 红心 love heart', '💔': '心碎 broken heart', '💯': '一百 满分 hundred', '🔥': '火 热 fire hot lit', '✨': '闪 亮 sparkle',
    '⭐': '星 star', '🌟': '星 star', '🎉': '庆祝 礼花 恭喜 party tada', '🎂': '生日 蛋糕 birthday cake', '🎁': '礼物 gift', '🎈': '气球 balloon', '☀️': '太阳 晴 sun', '🌙': '月亮 晚上 moon',
    '🌧️': '雨 rain', '❄️': '雪 snow', '🌈': '彩虹 rainbow', '☕': '咖啡 coffee', '🍵': '茶 tea', '🍺': '啤酒 beer', '🍕': '披萨 pizza', '🍔': '汉堡 burger', '🍜': '面 拉面 noodle', '🍚': '米饭 rice',
    '🍎': '苹果 apple', '🍏': '苹果 apple', '🍉': '西瓜 watermelon', '🍓': '草莓 strawberry', '🐶': '狗 dog', '🐱': '猫 cat', '🐼': '熊猫 panda', '🐰': '兔 rabbit', '🦊': '狐狸 fox', '🐷': '猪 pig',
    '🚀': '火箭 rocket launch', '✈️': '飞机 plane', '🚗': '车 汽车 car', '🏠': '家 房子 home house', '💻': '电脑 笔记本 mac laptop computer', '📱': '手机 iphone phone', '⌚': '手表 watch', '💡': '灯泡 想法 idea',
    '📅': '日历 calendar', '📝': '笔记 备忘 note memo', '📎': '回形针 clip', '🔒': '锁 lock', '🔑': '钥匙 key', '✅': '完成 对 勾 done check', '❌': '错 叉 no cross', '⚠️': '警告 warning', '❓': '问号 question',
    '❗': '感叹号 exclamation', '➡️': '右 箭头 arrow right', '⬅️': '左 箭头 arrow left', '⌘': 'command 命令 cmd', '⌥': 'option alt 选项', '⇧': 'shift 上档', '⌃': 'control ctrl', '': 'apple 苹果 logo',
    '°': '度 degree', '€': '欧元 euro', '¥': '人民币 日元 yuan yen', '→': '箭头 arrow', '★': '星 star', '🇨🇳': '中国 china', '🇺🇸': '美国 usa', '🇯🇵': '日本 japan',
  };

  const panel = (OS.emoji = { el: null });
  let target = null; // { el, start, end, range }
  const editable = (el) => el instanceof Element && el.closest('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, [contenteditable="true"], [contenteditable=""]');
  const snapshot = () => {
    const a = document.activeElement;
    const el = editable(a);
    if (!el || el.closest('.emoji-panel')) return;
    if ('selectionStart' in el && el.selectionStart != null) target = { el, start: el.selectionStart, end: el.selectionEnd };
    else {
      const sel = getSelection();
      target = { el, range: sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null };
    }
  };
  document.addEventListener('selectionchange', () => !panel.el || editable(document.activeElement) ? snapshot() : null);
  document.addEventListener('focusin', snapshot);

  function insert(ch) {
    const t = target;
    const recent = [ch, ...OS.store.get('emoji.recent', []).filter((x) => x !== ch)].slice(0, 24);
    OS.store.set('emoji.recent', recent);
    if (!t || !t.el.isConnected) return OS.toast(ch + ' 已拷贝'), navigator.clipboard && navigator.clipboard.writeText(ch).catch(() => {});
    const el = t.el;
    el.focus({ preventScroll: true });
    if ('setRangeText' in el && t.start != null) {
      el.setRangeText(ch, t.start, t.end, 'end');
      t.start = t.end = el.selectionStart;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const sel = getSelection();
      if (t.range) {
        sel.removeAllRanges();
        sel.addRange(t.range);
      }
      document.execCommand('insertText', false, ch);
      t.range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    }
  }

  function caretRect() {
    if (!target || !target.el.isConnected) return null;
    if (target.range) {
      const r = target.range.getBoundingClientRect();
      if (r && (r.width || r.height)) return r;
    }
    return target.el.getBoundingClientRect();
  }

  panel.close = () => {
    if (!panel.el) return;
    const el = panel.el;
    panel.el = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 160);
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (e) => panel.el && !panel.el.contains(e.target) && panel.close();

  panel.open = () => {
    if (panel.el) return panel.close();
    snapshot();
    OS.closeMenus && OS.closeMenus(true);
    const search = h('input.ep-search', { type: 'search', placeholder: '搜索', 'aria-label': '搜索表情符号' });
    const grid = h('div.ep-grid');
    const tabs = h('div.ep-tabs');
    const el = h('div.emoji-panel', { role: 'dialog', 'aria-label': '表情与符号' }, h('div.ep-top', search), grid, tabs);
    const cell = (ch) => h('button.ep-cell', { title: (WORDS[ch] || '').split(' ')[0] || ch, onclick: () => insert(ch) }, ch);
    const sections = {};
    const renderAll = () => {
      grid.replaceChildren();
      const recent = OS.store.get('emoji.recent', []);
      const cats = [...(recent.length ? [{ id: 'recent', name: '常用', icon: '🕘', items: recent }] : []), ...CATS];
      cats.forEach((c) => {
        const head = h('div.ep-head', c.name);
        sections[c.id] = head;
        grid.append(head, h('div.ep-cells', c.items.map(cell)));
      });
      tabs.replaceChildren(...cats.map((c) => h('button.ep-tab', { title: c.name, dataset: { id: c.id }, onclick: () => grid.scrollTo({ top: sections[c.id].offsetTop - grid.offsetTop, behavior: 'smooth' }) }, c.icon)));
    };
    renderAll();
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (!q) return renderAll();
      const all = [...new Set(CATS.flatMap((c) => c.items))];
      const hits = all.filter((ch) => (WORDS[ch] || '').toLowerCase().includes(q) || ch === q);
      grid.replaceChildren(h('div.ep-head', hits.length ? '搜索结果' : '无结果'), h('div.ep-cells', hits.map(cell)));
    });
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') panel.close();
      if (e.key === 'Enter') grid.querySelector('.ep-cell') && grid.querySelector('.ep-cell').click();
    });
    // highlight the category under the scroll position
    grid.addEventListener('scroll', () =>
      wm.nextFrame('emojiTab', () => {
        const top = grid.scrollTop + 8;
        let cur = null;
        Object.entries(sections).forEach(([id, s]) => s.offsetTop - grid.offsetTop <= top && (cur = id));
        $$('.ep-tab', tabs).forEach((b) => b.classList.toggle('on', b.dataset.id === cur));
      }), { passive: true });
    document.getElementById('overlays').appendChild(el);
    const scr = wm.screen();
    const r = caretRect();
    const s = OS.scale || 1;
    let x = r ? r.left / s : scr.w / 2 - 170, y = r ? r.bottom / s + 8 : scr.h / 2 - 190;
    if (y + 390 > scr.h) y = Math.max(wm.menubarH() + 6, (r ? r.top / s : y) - 398);
    x = Math.max(8, Math.min(scr.w - 348, x));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    panel.el = el;
    requestAnimationFrame(() => el.classList.add('in'));
    search.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  };
  const wm = OS.wm;
  window.addEventListener('keydown', (e) => {
    const space = e.code === 'Space';
    if ((e.ctrlKey && e.metaKey && space) || (e.ctrlKey && e.altKey && e.code === 'KeyE')) {
      e.preventDefault();
      panel.open();
    } else if (e.key === 'Escape' && panel.el) panel.close();
  }, true);
})();
