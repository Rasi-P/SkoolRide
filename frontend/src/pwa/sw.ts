/// <reference lib="webworker" />
/**
 * SchoolBus Pro service worker (Workbox, injectManifest).
 *
 * Caching policy:
 *  - App shell + hashed static assets: precached.
 *  - Navigations: network only with a public offline fallback page. Invitation/reset URLs are never stored.
 *  - Map tiles / fonts: cache-first with expiry (public, non-sensitive).
 *  - /api/*, /ws/*, /media/*: NEVER cached. Student records, payments, tokens and locations always come
 *    from the network so nothing private is left on a shared device.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();
self.addEventListener("activate", (event) => event.waitUntil(caches.delete("sbp-pages")));

// API, websockets and media: network only (explicitly never cached).
registerRoute(({ url }) => url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/") || url.pathname.startsWith("/media/"), new NetworkOnly());

// Never persist navigation URLs, which can contain invitation or reset tokens.
registerRoute(
  new NavigationRoute(new NetworkOnly(), {
    denylist: [/^\/api\//, /^\/admin\//, /^\/media\//],
  }),
);

// Public map tiles & fonts: cache first with limits.
registerRoute(
  ({ url }) => /tile\.openstreetmap\.org$/.test(url.hostname) || /basemaps\.cartocdn\.com$/.test(url.hostname),
  new CacheFirst({ cacheName: "sbp-tiles", plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600, purgeOnQuotaError: true })] }),
);
registerRoute(
  ({ url }) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
  new CacheFirst({ cacheName: "sbp-fonts", plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 3600 })] }),
);

setCatchHandler(async ({ request }) => {
  if (request.destination === "document" || request.mode === "navigate") {
    const cached = await matchPrecache("/offline.html");
    if (cached) return cached;
  }
  return Response.error();
});

// ---- Web push ----
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; category?: string; data?: Record<string, string> } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "SchoolBus Pro", body: event.data?.text() };
  }
  const title = data.title || "SchoolBus Pro";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.data?.notification_id || data.category || "sbp",
      data: data.data || {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
