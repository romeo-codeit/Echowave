const CACHE_NAME = "music-cache-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/js/index.js",
  "/icons/echoicon.png",
  "/icons/echoicon.png",
];

// Install & Cache
self.addEventListener("install", (e) => {
  self.skipWaiting(); // ensure activation immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate & Clean Old Caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

// Cache-first strategy for GET requests
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request).catch(() => {
          // If offline and the request fails, serve fallback
          if (e.request.destination === "document") {
            return caches.match("/index.html");
          }
        })
      );
    })
  );
});
