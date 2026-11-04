// Reptr service worker. Keeps the app shell available offline:
// - build assets (/_next/static, icons) are cached forever (their names change per build)
// - pages are network-first, falling back to the last copy seen, then to /offline
// Data never goes through here: the active workout lives in IndexedDB and syncs itself.
const VERSION = "v1";
const STATIC = `reptr-static-${VERSION}`;
const PAGES = `reptr-pages-${VERSION}`;
const PRECACHE = ["/offline", "/workout", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      // One by one, so a page that fails (e.g. signed out) doesn't block the rest.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("reptr-") && ![STATIC, PAGES].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match("/offline")) ||
            Response.error()
          );
        }),
    );
  }
});
