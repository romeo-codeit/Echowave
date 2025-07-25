self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open("music-cache").then((cache) => {
      return cache.addAll([
        "/",
        "/index.html",
        "/css/styles.css",
        "/js/index.js",
        "/icons/echoicon.png",
        "/icons/echoicon.png"
      ]);
    })
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
