/** 界面偏好：默认是"游戏模式"，史料依据、公式明细、考据等级等都收起；打开"史料详情"才显示。 */
const KEY = 'kursk-show-sources';
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch { /* 隐私模式等 */ }

export const showSources = (): boolean => on;
export function setShowSources(v: boolean): void {
  on = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 忽略 */ }
}
