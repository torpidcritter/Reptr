// Reptr service worker. Keeps the app shell available offline without keeping anyone's
// personal pages around.
//
// - Build files (/_next/static, icons) are cached as they're used. Their names change
//   with every build, so the cache can never serve stale code; it's trimmed on update.
// - Pages are always fetched from the network. Only two pages are kept for offline use:
//   /offline (public) and /workout (the logger, which reads the workout from IndexedDB).
//   That copy is per build and is deleted on sign-out and when another account signs in.
// - Workout and quick-log data never pass through here; they live in IndexedDB, which
//   updates to this worker never touch.
// - A new version waits until the page says it's safe (no workout in progress) before
//   taking over, so an update never swaps code out from under someone mid-workout.

const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC = "reptr-static";
const PAGES = `reptr-pages-${BUILD}`;
const SHELL = ["/offline", "/workout"];
const STATIC_LIMIT = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      // One by one, so a page that fails (e.g. signed out) doesn't block the rest.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function trimStatic() {
  const cache = await caches.open(STATIC);
  const keys = await cache.keys();
  // Oldest first in insertion order; drop the excess.
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT)).map((k) => cache.delete(k)),
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("reptr-") && k !== STATIC && k !== PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(trimStatic)
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
    const shell = SHELL.includes(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (shell && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (
            (shell && (await cache.match(url.pathname))) ||
            (await cache.match("/offline")) ||
            Response.error()
          );
        }),
    );
  }
});
