/* Sismógrafo·26 — service worker
   Estrategia: cache-first para assets inmutable (hasheados por Vite),
   network-first para navegación (con volcado a caché y fallo offline al shell).
   Todas las rutas son relativas al scope del SW para funcionar en subpath
   (GitHub Pages: /repo/). */
const CACHE = "sismografo-26-v2";
const SCOPE = new URL("./", self.registration.scope).href;
const ASSETS = new URL("./assets/", self.registration.scope).href;
const SHELL = ["./", "./manifest.webmanifest", "./icon-512.png", "./icon-192.png", "./icon-180.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE)) return;

  if (url.href.startsWith(ASSETS)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(SCOPE)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const online = fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => cached);
      return cached || online;
    })
  );
});
