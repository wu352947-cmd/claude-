// Tiny static file server for the film directory.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

export function serve(port = 0, hook = null) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      if (hook && hook(req, res)) return;
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { url } = await serve(parseInt(process.argv[2] || '8024', 10));
  console.log('serving', url);
}
