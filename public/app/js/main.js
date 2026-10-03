// 入口：启动、路由、主题与季节
import { api } from './api.js';
import { toast } from './ui.js';
import { termOf, SEASONS } from './calendar.js';
import { startFx } from './fx.js';
import { authView } from './views/auth.js';
import { todayView } from './views/today.js';
import { bookView } from './views/book.js';
import { lettersView } from './views/letters.js';
import { settingsView } from './views/settings.js';
import { scrollView } from './views/scroll.js';

export const state = { user: null, config: { ai: false, aiDaily: 3, hotlines: [] }, counts: {}, navDir: 0 };
const root = document.getElementById('view');
const docEl = document.documentElement;
const term = termOf(new Date());
docEl.dataset.season = SEASONS[term.season];
let fx = null, cleanup = null;

export function applyPrefs() {
  const s = state.user?.settings || {};
  if (s.theme === 'light' || s.theme === 'dark') docEl.dataset.theme = s.theme; else delete docEl.dataset.theme;
  docEl.classList.toggle('quiet', !!s.quiet);
  try { localStorage.setItem('sg.prefs', JSON.stringify({ theme: s.theme, quiet: !!s.quiet })); } catch {}
  fx?.refresh();
}
try { const p = JSON.parse(localStorage.getItem('sg.prefs') || '{}'); if (p.theme === 'light' || p.theme === 'dark') docEl.dataset.theme = p.theme; if (p.quiet) docEl.classList.add('quiet'); } catch {}

export async function refreshCounts() {
  try {
    const r = await api.me(); state.counts = r.counts;
    const b = document.getElementById('mailBadge');
    b.hidden = !r.counts.unread; b.textContent = r.counts.unread;
  } catch {}
}

async function route() {
  if (!state.user) return;
  const [, view = 'today', arg] = (location.hash || '#/today').replace(/^#/, '').split('/');
  cleanup?.(); cleanup = null;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === (view === 'day' ? 'today' : view)));
  window.scrollTo({ top: 0 });
  const views = {
    today: () => todayView(root),
    day: () => todayView(root, /^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : undefined),
    book: () => bookView(root, arg),
    scroll: () => scrollView(root, arg),
    letters: () => lettersView(root),
    settings: () => settingsView(root)
  };
  try { cleanup = (await (views[view] || views.today)()) || null; }
  catch (e) { console.error(e); toast('这一页没能打开，请刷新试试'); }
  root.focus({ preventScroll: true });
}

function enter(user, fresh) {
  state.user = user; applyPrefs();
  document.getElementById('topbar').hidden = false;
  document.getElementById('termChip').innerHTML = `<b>${'春夏秋冬'[term.season]}</b>${term.name} · ${term.hou}${state.config.demo ? '<em class="demo-chip">试玩版</em>' : ''}`;
  if (fresh) toast(`欢迎，${user.nickname}。这是你手帐的第一页。`, { seal: '拾' });
  if (!location.hash || location.hash === '#/register' || location.hash === '#/login') location.hash = '#/today'; else route();
  refreshCounts();
}

addEventListener('hashchange', route);
(async function boot() {
  fx = startFx(document.getElementById('fx'), SEASONS[term.season]);
  try { state.config = { ...state.config, ...(await api.config()) }; } catch {}
  try { const r = await api.me(); state.counts = r.counts; enter(r.user); }
  catch (e) {
    if (e.status && e.status !== 401) toast(e.message);
    document.getElementById('topbar').hidden = true;
    authView(root, (u, fresh) => enter(u, fresh));
  }
})();
