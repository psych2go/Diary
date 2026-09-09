const CACHE = "my-diary-v11";
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
const CACHEABLE_PATHS = new Set(
  APP_SHELL.map((asset) => new URL(asset, self.location.origin).pathname)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const deleteOldCaches = caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
  );
  event.waitUntil(Promise.all([deleteOldCaches, self.clients.claim()]));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !CACHEABLE_PATHS.has(url.pathname)
  ) {
    return;
  }

  const network = fetch(event.request, { cache: "no-cache" }).then(async (response) => {
    if (response.ok && response.type === "basic") {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      } catch {
        // Cache Storage failure must not hide a usable network response.
      }
    }
    return response;
  });

  event.waitUntil(network.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(event.request))
      .then((cached) => cached || network)
      .catch(() => network)
  );
});
