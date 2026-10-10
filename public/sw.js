const CACHE_NAME = 'scroll-wheel-radio-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const scope = self.registration.scope;
      await cache.addAll(['./', './index.html', './manifest.webmanifest', './app-icon.svg', './favicon.svg']);

      for (const page of ['index.html']) {
        const pageUrl = new URL(page, scope);
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`Could not cache ${page}`);
        await cache.put(pageUrl, response.clone());
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
          .map((match) => new URL(match[1], pageUrl))
          .filter((url) => url.origin === self.location.origin);
        await Promise.all(
          assets.map(async (url) => {
            const asset = await fetch(url);
            if (asset.ok) await cache.put(url, asset);
          })
        );
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('scroll-wheel-radio-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
