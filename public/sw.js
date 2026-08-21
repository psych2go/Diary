const CACHE = "my-diary-v9";
const APP_SHELL = [
  "/",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest?v=2",
  "/icon.svg?v=2",
  "/icon-32.png?v=2",
  "/icon-192.png?v=2",
  "/icon-512.png?v=2",
  "/icon-maskable-512.png?v=2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) {
    return;
  }

  // 缓存优先：应用外壳立即从缓存渲染，同时在后台更新缓存。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request, { cache: "no-cache" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
