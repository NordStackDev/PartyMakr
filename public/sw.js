/* PartyMakr service worker — offline support without a build plugin.
 * - precache the app shell + offline page
 * - stale-while-revalidate for map tiles, fonts and static assets
 * - network-first for navigations, falling back to the offline page
 * Supabase API/auth requests are never intercepted (they fall through).
 */
const VERSION = "pm-v2";
const STATIC_CACHE = `static-${VERSION}`;
const TILE_CACHE = `tiles-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/pm-mark.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isTile(href) {
  return /basemaps\.cartocdn\.com|server\.arcgisonline\.com|tile\.openstreetmap\.org/.test(
    href,
  );
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static") ||
    /\.(?:png|svg|jpg|jpeg|webp|gif|ico|woff2?)$/.test(pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (isTile(url.href)) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  if (url.origin === self.location.origin && isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || Response.error()),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title || "PartyMakr";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Du har en ny besked.",
      icon: "/pm-mark.png",
      badge: "/pm-mark.png",
      tag: payload.tag || "partymakr-notification",
      data: { url: payload.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let target = new URL("/dashboard", self.location.origin);
  try {
    const requested = new URL(
      event.notification.data?.url || "/dashboard",
      self.location.origin,
    );
    if (requested.origin === self.location.origin) target = requested;
  } catch {
    // Keep the safe dashboard fallback.
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (existing) {
          if ("navigate" in existing) await existing.navigate(target.href);
          return existing.focus();
        }
        return self.clients.openWindow(target.href);
      }),
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // Cache 200s and cross-origin opaque tile responses (status 0).
      if (response && (response.status === 200 || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
