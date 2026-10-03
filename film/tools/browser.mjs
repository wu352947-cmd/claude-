// Headless Chromium with software WebGL2 (SwiftShader), shared by the tools.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { serve } from './serve.mjs';

export async function openFilm(query = '', { scale = 1, hook = null } = {}) {
  const { srv, url } = await serve(0, hook);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-gpu-driver-bug-workarounds', '--js-flags=--max-old-space-size=8192', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(804 * scale) } });
  const logs = [];
  page.on('console', m => { const s = `[${m.type()}] ${m.text()}`; logs.push(s); if (m.type() === 'error' || m.type() === 'warning') console.error(s); });
  page.on('pageerror', e => { logs.push('[pageerror] ' + e.message); console.error('[pageerror]', e.message); });
  await page.goto(url + 'index.html' + query);
  await page.waitForFunction(() => window.FILM_READY === true, null, { timeout: 0 });
  const close = async () => { await browser.close(); srv.close(); };
  return { page, browser, close, logs };
}
