// Generated from the complete production build. Do not edit by hand.
const CACHE = 'quatre-couronnes-cbd00963f18eaa0b';
const FILES = ["assets/index-B9orfckw.js","assets/index-D5N2ld3c.css","biomes.png","crown.svg","icons/crown-192.png","icons/crown-512.png","index.html","kings-atlas.png","manifest.webmanifest","sprites-atlas.png"];
const INDEX = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(p => new Request(new URL(p, self.registration.scope).href, {cache: "reload"})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for(const name of await caches.keys()) if(name.startsWith('quatre-couronnes-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type === 'APPLY_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request.mode === 'navigate' ? INDEX : event.request);
    return cached || fetch(event.request);
  })());
});
