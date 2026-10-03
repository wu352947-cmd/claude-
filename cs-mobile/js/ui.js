import { SKINS, SKIN_BY_ID, RARITY, CASES, rollCase, wearName } from './skins.js';
import { WEAPONS } from './weapons.js';

const $ = id => document.getElementById(id);
const RANKS = ['白银 I', '白银 II', '白银 III', '白银精英', '黄金新星 I', '黄金新星 II', '黄金新星 III', '黄金大师', '守护者 I', '守护者 II', '守护精英', '传奇之鹰', '传奇之鹰大师', '无上之星', '全球精英'];
const KEY = 'csdust_profile_v1';
const SET_KEY = 'csdust_settings_v1';

export const DEFAULT_SETTINGS = { sens: 1, scopeSens: 0.8, gyro: false, gyroSens: 1, autoFire: false, crouchHold: false, fov: 74, quality: 'med', volume: 0.9, musicVolume: 0.7, showFps: true, leftFire: true, friendlyFire: false, invertY: false };

export function loadSettings() { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }; } catch (e) { return { ...DEFAULT_SETTINGS }; } }
export function saveSettings(s) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) { } }

export function loadProfile() {
  let p = null; try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  if (!p) {
    // starter inventory
    const starter = ['ak47', 'm4a4', 'awp', 'usp', 'glock'].map(w => { const pool = SKINS.filter(s => s.weapon === w && s.rarity === 'milspec'); const s = pool[Math.floor(Math.random() * pool.length)]; return { uid: Math.random().toString(36).slice(2, 9), id: s.id, wear: Math.random() * 0.3 }; });
    p = { name: '玩家' + Math.floor(1000 + Math.random() * 9000), coins: 1200, xp: 0, level: 1, rankPts: 300, inventory: starter, equipped: {}, stats: { matches: 0, wins: 0, kills: 0, deaths: 0, mvps: 0 } };
  }
  return p;
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { } }

export class UI {
  constructor(app) {
    this.app = app; this.p = loadProfile(); this.s = app.settings;
    this.mode = 'defuse'; this.team = 'CT'; this.diff = 'hard';
    this.bindLobby();
  }

  equippedSkins() {
    const out = {};
    for (const w in this.p.equipped) { const it = this.p.inventory.find(i => i.uid === this.p.equipped[w]); if (it) out[w] = it.id + '#' + it.wear.toFixed(2); }
    return out;
  }

  bindLobby() {
    document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.mode').forEach(x => x.classList.remove('active')); b.classList.add('active'); this.mode = b.dataset.mode; this.variant = b.dataset.variant || null; this.click(); }));
    const seg = (id, key) => document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => { document.querySelectorAll(`#${id} button`).forEach(x => x.classList.remove('on')); b.classList.add('on'); this[key] = b.dataset.v; this.click(); }));
    seg('seg-team', 'team'); seg('seg-diff', 'diff');
    $('btn-start').addEventListener('click', () => { this.click(); const team = this.team === 'R' ? (Math.random() < 0.5 ? 'T' : 'CT') : this.team; this.app.startMatch({ mode: this.mode, variant: this.variant, team, difficulty: this.diff, playerName: this.p.name, skins: this.equippedSkins(), teamSize: 5 }); });
    document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => { this.click(); this.openPanel(b.dataset.panel); }));
    document.querySelector('.pn-close').addEventListener('click', () => this.closePanel());
    $('panel').addEventListener('click', e => { if (e.target.id === 'panel') this.closePanel(); });
  }

  click() { this.app.audio.unlock(); this.app.audio.play('ui_click', { volume: 0.4 }); }

  refreshLobby() {
    const p = this.p;
    $('lb-name').textContent = p.name;
    const ri = Math.max(0, Math.min(RANKS.length - 1, Math.floor(p.rankPts / 220)));
    $('lb-rank').textContent = RANKS[ri];
    $('lb-level').textContent = 'Lv.' + p.level;
    $('lb-xp').style.width = Math.min(100, (p.xp % 1000) / 10) + '%';
    $('lb-coins').textContent = p.coins;
  }

  reward(r) {
    const p = this.p; p.coins += r.coins; p.xp += r.coins * 3; p.level = 1 + Math.floor(p.xp / 1000);
    p.rankPts = Math.max(0, p.rankPts + (r.won ? 60 : -35) + r.kills * 2);
    p.stats.matches++; if (r.won) p.stats.wins++; p.stats.kills += r.kills; p.stats.deaths += r.deaths; p.stats.mvps += r.mvps;
    saveProfile(p); this.refreshLobby();
  }

  openPanel(name) {
    $('panel').classList.remove('hidden');
    const T = { inventory: '仓库', cases: '武器箱', settings: '设置', stats: '生涯战绩', help: '操作说明' };
    $('pn-title').textContent = T[name] || '';
    this['panel_' + name]();
  }
  closePanel() { $('panel').classList.add('hidden'); this.app.preview && this.app.preview.stop(); }

  // ---------- inventory ----------
  panel_inventory() {
    const body = $('pn-body');
    const weapons = ['all', 'ak47', 'm4a4', 'awp', 'deagle', 'usp', 'glock', 'ump45', 'nova', 'xm1014', 'r8', 'knife'];
    body.innerHTML = `<div class="inv-wrap"><div style="flex:1;display:flex;flex-direction:column;min-width:0"><div class="inv-filter">${weapons.map(w => `<button data-w="${w}" class="${w === 'all' ? 'on' : ''}">${w === 'all' ? '全部' : WEAPONS[w].name}</button>`).join('')}</div><div class="inv-grid" id="inv-grid"></div></div>
      <div class="inv-side"><canvas id="preview"></canvas><div class="inv-info" id="inv-info"><p>选择一件物品查看</p></div></div></div>`;
    let filter = 'all';
    const grid = $('inv-grid');
    const render = () => {
      const items = this.p.inventory.filter(i => filter === 'all' || SKIN_BY_ID[i.id]?.weapon === filter);
      const order = ['gold', 'covert', 'classified', 'restricted', 'milspec'];
      items.sort((a, b) => order.indexOf(SKIN_BY_ID[a.id].rarity) - order.indexOf(SKIN_BY_ID[b.id].rarity));
      grid.innerHTML = items.length ? '' : '<p style="color:#888">暂无物品 — 去开启武器箱吧！</p>';
      for (const it of items) {
        const s = SKIN_BY_ID[it.id]; if (!s) continue;
        const c = document.createElement('button'); c.className = 'card' + (this.p.equipped[s.weapon] === it.uid ? ' eq' : '');
        c.style.setProperty('--rc', RARITY[s.rarity].color);
        c.innerHTML = `<img src="${this.app.icons.skinIcon(s.id, s.weapon, it.wear)}"><div class="cn">${WEAPONS[s.weapon].name}</div><div class="cs">${s.name}</div>`;
        c.addEventListener('click', () => { grid.querySelectorAll('.card').forEach(x => x.classList.remove('sel')); c.classList.add('sel'); this.select(it); this.click(); });
        grid.appendChild(c);
      }
    };
    body.querySelectorAll('.inv-filter button').forEach(b => b.addEventListener('click', () => { body.querySelectorAll('.inv-filter button').forEach(x => x.classList.remove('on')); b.classList.add('on'); filter = b.dataset.w; render(); }));
    render();
    this.app.preview.start($('preview'));
    const first = this.p.inventory[0]; if (first) this.select(first);
  }

  select(it) {
    const s = SKIN_BY_ID[it.id];
    const eq = this.p.equipped[s.weapon] === it.uid;
    $('inv-info').innerHTML = `<h3 style="color:${RARITY[s.rarity].color}">${WEAPONS[s.weapon].name} | ${s.name}</h3><p>${RARITY[s.rarity].name} · ${wearName(it.wear)} · 磨损 ${it.wear.toFixed(3)}</p>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" id="eq-btn">${eq ? '卸下' : '装备'}</button><button class="btn" id="sell-btn">出售 (+${this.sellPrice(s)} 金币)</button></div>`;
    this.app.preview.show(s.weapon, s.id, it.wear);
    $('eq-btn').onclick = () => { if (eq) delete this.p.equipped[s.weapon]; else this.p.equipped[s.weapon] = it.uid; saveProfile(this.p); this.click(); this.panel_inventory(); this.select(it); };
    $('sell-btn').onclick = () => { this.p.inventory = this.p.inventory.filter(x => x.uid !== it.uid); if (this.p.equipped[s.weapon] === it.uid) delete this.p.equipped[s.weapon]; this.p.coins += this.sellPrice(s); saveProfile(this.p); this.refreshLobby(); this.app.audio.play('ui_buy', { volume: 0.5 }); this.panel_inventory(); };
  }
  sellPrice(s) { return { milspec: 40, restricted: 120, classified: 400, covert: 1200, gold: 5000 }[s.rarity] || 20; }

  // ---------- cases ----------
  panel_cases() {
    const body = $('pn-body');
    body.innerHTML = `<div class="cases">${CASES.map(c => `<div class="casecard" style="--cc:${c.color}"><div class="box"></div><h3>${c.name}</h3><p>包含 ${c.skins.length} 种皮肤 · 稀有特殊物品 ★</p>
      <div class="case-items">${c.skins.slice(0, 40).map(id => `<i style="--rc:${RARITY[SKIN_BY_ID[id].rarity].color}"></i>`).join('')}</div>
      <button class="btn primary" data-case="${c.id}" style="width:100%">开启 · ${c.price} 金币</button></div>`).join('')}
      <div style="flex:1;min-width:200px;color:#9aa3ad;font-size:13px;line-height:1.7"><b style="color:#eee">掉落概率</b><br>${['milspec', 'restricted', 'classified', 'covert', 'gold'].map(k => `<span style="color:${RARITY[k].color}">■ ${RARITY[k].name}</span> ${(RARITY[k].w * 100).toFixed(2)}%`).join('<br>')}<br><br>对局可获得金币，胜利与 MVP 奖励更多。</div></div>`;
    body.querySelectorAll('[data-case]').forEach(b => b.addEventListener('click', () => this.openCase(CASES.find(c => c.id === b.dataset.case))));
  }

  openCase(c) {
    if (this.p.coins < c.price) { this.app.audio.play('dryfire', { volume: 0.5 }); $('pn-title').textContent = '金币不足！'; return; }
    this.p.coins -= c.price; saveProfile(this.p); this.refreshLobby();
    const res = rollCase(c);
    const pool = c.skins.map(id => SKIN_BY_ID[id]);
    const pickFiller = () => { const r = Math.random(); const rar = r < 0.75 ? 'milspec' : r < 0.93 ? 'restricted' : r < 0.985 ? 'classified' : 'covert'; const cand = pool.filter(s => s.rarity === rar); return cand[Math.floor(Math.random() * cand.length)] || pool[0]; };
    const N = 52, WIN = 45;
    const items = Array.from({ length: N }, (_, i) => i === WIN ? SKIN_BY_ID[res.id] : pickFiller());
    const strip = $('co-strip');
    strip.innerHTML = items.map(s => `<div class="card" style="--rc:${RARITY[s.rarity].color}">${s.rarity === 'gold' && s !== SKIN_BY_ID[res.id] ? '' : ''}<img src="${s.rarity === 'gold' ? this.app.icons.skinIcon(s.id, s.weapon) : this.app.icons.skinIcon(s.id, s.weapon)}"><div class="cn">${WEAPONS[s.weapon].name}</div><div class="cs">${s.name}</div></div>`).join('');
    $('co-result').innerHTML = '';
    $('caseopen').classList.remove('hidden');
    const cardW = 156; const wrapW = strip.parentElement.clientWidth;
    const target = WIN * cardW - wrapW / 2 + cardW / 2 + (Math.random() - 0.5) * 110;
    const dur = 5200; const t0 = performance.now(); let lastIdx = -1;
    strip.style.transform = 'translateX(0)';
    const step = now => {
      const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 4);
      const x = target * e; strip.style.transform = `translateX(${-x}px)`;
      const idx = Math.floor((x + wrapW / 2) / cardW); if (idx !== lastIdx) { lastIdx = idx; this.app.audio.play('ui_hover', { volume: 0.35, rate: 1.2 + Math.random() * 0.2 }); }
      if (k < 1) requestAnimationFrame(step); else this.caseDone(res);
    };
    requestAnimationFrame(step);
  }

  caseDone(res) {
    const s = SKIN_BY_ID[res.id];
    this.p.inventory.push({ uid: res.uid, id: res.id, wear: res.wear }); saveProfile(this.p);
    this.app.audio.play(s.rarity === 'gold' || s.rarity === 'covert' ? 'ui_buy' : 'clink2', { volume: 0.8, rate: s.rarity === 'gold' ? 0.8 : 1 });
    $('co-result').innerHTML = `<img class="big" style="--rc:${RARITY[s.rarity].color}" src="${this.app.icons.skinIcon(s.id, s.weapon, res.wear)}">
      <h2 style="color:${RARITY[s.rarity].color}">${WEAPONS[s.weapon].name} | ${s.name}</h2><p style="color:#9aa3ad">${RARITY[s.rarity].name} · ${wearName(res.wear)}</p>
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn primary" id="co-equip">立即装备</button><button class="btn" id="co-close">收下</button></div>`;
    $('co-equip').onclick = () => { this.p.equipped[s.weapon] = res.uid; saveProfile(this.p); $('caseopen').classList.add('hidden'); this.click(); };
    $('co-close').onclick = () => { $('caseopen').classList.add('hidden'); this.click(); };
  }

  // ---------- settings ----------
  panel_settings() {
    const s = this.s; const body = $('pn-body');
    const rng = (k, label, min, max, step) => `<div class="set"><span>${label} <b id="v-${k}">${s[k]}</b></span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></div>`;
    const tg = (k, label) => `<div class="set"><span>${label}</span><button class="toggle ${s[k] ? 'on' : ''}" data-t="${k}"></button></div>`;
    body.innerHTML = `<div class="settings">${rng('sens', '视角灵敏度', 0.2, 3, 0.05)}${rng('scopeSens', '开镜灵敏度', 0.2, 2, 0.05)}${rng('fov', '视野 FOV', 60, 95, 1)}${rng('volume', '音效音量', 0, 1, 0.05)}${rng('musicVolume', '音乐音量', 0, 1, 0.05)}
      ${tg('autoFire', '自动开火（准星对准敌人时）')}${tg('gyro', '陀螺仪瞄准')}${rng('gyroSens', '陀螺仪灵敏度', 0.2, 3, 0.1)}${tg('crouchHold', '按住下蹲（关闭为切换）')}
      ${tg('leftFire', '显示左侧开火键')}${tg('showFps', '显示帧率')}${tg('invertY', '反转 Y 轴')}
      <div class="set"><span>画质</span><div class="seg" style="width:60%">${['low', 'med', 'high'].map(q => `<button data-q="${q}" class="${s.quality === q ? 'on' : ''}">${{ low: '流畅', med: '均衡', high: '高清' }[q]}</button>`).join('')}</div></div>
      <div class="set"><span>玩家名称</span><input id="set-name" value="${this.p.name}" maxlength="12" style="background:#222;border:1px solid #444;color:#fff;padding:6px;border-radius:6px;width:55%;user-select:text;-webkit-user-select:text"></div></div>`;
    body.querySelectorAll('input[type=range]').forEach(i => i.addEventListener('input', () => { s[i.dataset.k] = +i.value; $('v-' + i.dataset.k).textContent = i.value; this.app.applySettings(); }));
    body.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { s[b.dataset.t] = !s[b.dataset.t]; b.classList.toggle('on', s[b.dataset.t]); this.click(); this.app.applySettings(b.dataset.t); }));
    body.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { s.quality = b.dataset.q; body.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b)); this.app.applySettings('quality'); }));
    $('set-name').addEventListener('change', e => { this.p.name = e.target.value.trim() || this.p.name; saveProfile(this.p); this.refreshLobby(); });
  }

  panel_stats() {
    const st = this.p.stats;
    $('pn-body').innerHTML = `<div class="statgrid"><div><b>${st.matches}</b>场次</div><div><b>${st.matches ? Math.round(st.wins / st.matches * 100) : 0}%</b>胜率</div><div><b>${st.kills}</b>总击杀</div><div><b>${(st.kills / Math.max(1, st.deaths)).toFixed(2)}</b>K/D</div><div><b>${st.mvps}</b>MVP</div><div><b>${this.p.level}</b>等级</div><div><b>${this.p.inventory.length}</b>收藏皮肤</div><div><b>${this.p.coins}</b>金币</div></div>`;
  }

  panel_help() {
    $('pn-body').innerHTML = `<div class="help">
      <p><b>移动：</b>左半屏任意位置按下出现摇杆，轻推为静步（无脚步声），推到底为奔跑。</p>
      <p><b>瞄准：</b>右半屏滑动转动视角；按住开火键同时滑动可边打边压枪。</p>
      <p><b>射击机制：</b>与端游一致——移动/跳跃时射击精度大幅下降，急停（松开方向）后再开枪最准；步枪连射有固定弹道，向下拖动压枪。</p>
      <p><b>爆破模式：</b>T 方携带 C4 到 A/B 包点安放（按住"安放"3 秒），CT 方阻止或拆除（10 秒，拆弹器 5 秒）。每回合开始可在出生点购买武器装备。</p>
      <p><b>经济：</b>胜利 $3250/3500，失败 $1400 起（连败递增）；击杀奖励：步枪 $300、冲锋枪 $600、霰弹 $900、AWP $100、刀 $1500。</p>
      <p><b>穿透：</b>子弹可以穿透木箱、门板等薄掩体，伤害会衰减。爆头伤害 ×4，头盔可减免。</p>
      <p><b>按键（电脑）：</b>WASD 移动、鼠标瞄准射击、右键开镜、R 换弹、空格跳、Ctrl 蹲、Shift 静步、E 安放/拆除、B 购买、Tab 计分板、F 检视、G 拾取、1-5 切枪。</p></div>`;
  }
}
