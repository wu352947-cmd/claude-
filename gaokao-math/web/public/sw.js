// 数·途 Service Worker：离线时也能打开应用、做已缓存的题。
// 页面与静态资源：缓存优先；读接口：联网优先、断网用缓存；写接口和 AI 接口不缓存。
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const API = `api-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC, API].includes(k)).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

async function networkFirst(request, cacheName, fallbackKey) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(cacheName)).put(fallbackKey ?? request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(fallbackKey ?? request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/ai/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/"));
  } else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/api/figures/")) {
    event.respondWith(cacheFirst(request)); // 文件名带哈希，内容不会变
  } else if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API));
  }
});
