// 在线试玩版入口：先装好浏览器里的模拟接口，再启动手帐应用
import { SITE } from '../site.js';
import './mock.js';

Object.assign(SITE, { root: '', home: 'https://claude.ai/artifact/6xMhAx1TGmP9XBiPUo7yuk', demo: true });
await import('../main.js');
