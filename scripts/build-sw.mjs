import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const root = new URL("../docs/", import.meta.url);
async function walk(path = "") {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  const paths = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const p = path + e.name;
    if (e.isDirectory()) paths.push(...(await walk(p + "/")));
    else if (!e.name.startsWith(".") && e.name !== "sw.js") paths.push(p);
  }
  return paths;
}
const paths = await walk();
const hash = createHash("sha256");
for (const p of paths) {
  hash.update(p);
  hash.update(await readFile(new URL(p, root)));
}
const version = hash.digest("hex").slice(0, 16);
await writeFile(
  new URL("sw.js", root),
  `// Generated from the complete production build. Do not edit by hand.
const CACHE = 'quatre-couronnes-${version}';
const FILES = ${JSON.stringify(paths)};
const INDEX = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(p => new URL(p, self.registration.scope).href))));
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
`,
);
console.log(
  `Service worker ${version}: ${paths.length} fichiers hors connexion.`,
);
