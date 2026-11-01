// SYM service worker. Built by the plugin in vite.config.ts, which fills in the version and the file list.
//
// - The app shell (index.html, the hashed JS/CSS, the icons) is cached at install, so the app opens with
//   no connection and then shows the copy of the data cached on the device.
// - /api is never touched: data always comes from the server or the app's own offline cache.
// - A new version installs in the background and takes over once every SYM tab is closed, so a tab
//   never mixes files from two builds.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `sym-shell-${VERSION}`;
const FONTS = 'sym-fonts';
const NAV_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache so the shell matches this build exactly
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('sym-shell-') && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (req.mode === 'navigate') return event.respondWith(page(req));
    return event.respondWith(shellFirst(req));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(fonts(req));
});

/** Pages: the network first (so a deploy shows up at once), the cached shell when offline or very slow. */
async function page(req) {
  const fallback = () => caches.open(SHELL).then((c) => c.match('/'));
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), NAV_TIMEOUT))]);
    // a server error is worse than the cached app, which can still show the data on this device
    if (res.status >= 500) return (await fallback()) ?? res;
    return res;
  } catch {
    return (await fallback()) ?? Response.error();
  }
}

/** Build files never change under the same name: cached copy first, network for anything new. */
async function shellFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && new URL(req.url).pathname.startsWith('/assets/')) cache.put(req, res.clone());
  return res;
}

/** Fonts: whatever is cached right away, refreshed in the background. */
async function fonts(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit ?? fresh;
}
