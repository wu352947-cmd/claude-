/** 新手指引：一页纸说明怎么玩。第一次打开自动弹出，之后点“怎么玩”再看。 */
const KEY = 'kursk-1943-howto-seen';

const BODY = `
<h2>怎么玩（1 分钟）</h2>
<ol>
  <li><b>一回合 = 双方各走 3 步</b>：移动 → 战斗 → 发展。顶部写着现在是谁、哪个阶段。做完点“结束阶段”。</li>
  <li><b>移动</b>：点自己的算子，蓝色格子是能到的地方，再点一格就走。进入敌人旁边的格子（控制区）必须停下。夜间回合移动力减半。</li>
  <li><b>进攻</b>：点敌人所在的格子，在侧栏勾选相邻的己方单位，看“赔率”和“修正明细”，点“进攻”。一次最多 6 个单位参战。</li>
  <li><b>赢了能推进</b>：把守军赶走后，可以让进攻的单位前进占格（最多 3 个）。</li>
  <li><b>发展阶段</b>：只有摩托化和坦克单位能行动，而且本回合没进攻，或进攻得手。用来扩大战果。</li>
  <li><b>一格最多放 10 点兵力</b>：营 1、团 2、旅 2、师 4。可以穿过己方的满格，但不能停在那里。</li>
  <li><b>别一直猛攻</b>：连续进攻会疲劳，进攻时赔率往左移。轮换部队、让一部分休息。</li>
  <li><b>守住不动会掘壕</b>：同一格不动过完一个回合，防守赔率往右移（最多 2 级）；一移动就清零。苏军防线靠这个越守越稳。</li>
  <li><b>坦克被打坏不一定报废</b>：回合末掷骰，控制着战场的一方多半能拖回去修，丢了战场的一方多半报废。</li>
  <li><b>目标</b>：占领带星的城镇（普罗霍罗夫卡站等）得分，装甲完全损失也算分。第 9 回合结束后会和历史结局对照。</li>
</ol>
<p class="muted">按 Ctrl+Z 撤销。“记录 / 存档”里可以存档、换想定、选对战方式（热座、异地对战、上帝视角）。灰色斜体的数据是占位或推定，不是史料数字。</p>
`;

export function setupHowto(): void {
  const box = document.getElementById('howto');
  const btn = document.getElementById('g-howto');
  if (!box || !btn) return;
  box.innerHTML = `<div class="box">${BODY}<button class="primary" id="howto-close">明白了</button></div>`;
  const close = (): void => {
    box.hidden = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* 隐私模式等：不记也能用 */ }
  };
  box.querySelector('#howto-close')!.addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  btn.addEventListener('click', () => { box.hidden = false; });
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { /* 当作没看过 */ }
  box.hidden = seen;
}
