/* ============================================================================
 * Mean Reversion Radar — mobile service worker
 * ----------------------------------------------------------------------------
 * Strategy:
 *   - APP SHELL (mobile.html, manifest, icons): cache-first, refreshed in the
 *     background (stale-while-revalidate) so launches are instant offline.
 *   - EVERYTHING ELSE — Supabase PostgREST/Realtime, the supabase-js CDN —
 *     is NEVER cached. Cross-origin requests are not intercepted at all;
 *     stale market data is worse than no market data.
 *
 * Bump VERSION on every shell change — activate() drops old caches, and
 * skipWaiting + clients.claim make the new shell take over immediately.
 * ========================================================================== */
'use strict';

// v3 (Aug 4 2026) — mobile.html learned the post-doctrine vocabulary:
// run v2 D-counts + ⇗, FRD, the BB badge shorthand, ELEVATED, the SC/ML split,
// and theme sc_vehicles / sc_cluster. Installed phones must not keep serving v2.
const VERSION = 'mrd-mobile-v4';
const SHELL = [
  './mobile.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cross-origin (Supabase API, Realtime websocket upgrade polyfills, CDN):
  // do not intercept — the browser talks straight to the network.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  const path = url.pathname;
  // Shell = the 5 mobile files, plus navigations TO mobile.html specifically.
  // Deliberately narrow: any other same-origin page (e.g. the desktop
  // index.html if it ever shares this origin) passes through untouched.
  const isMobileNav = event.request.mode === 'navigate' && path.endsWith('/mobile.html');
  const isShell =
    SHELL.some((s) => path.endsWith(s.slice(1))) || // './mobile.html' -> '/mobile.html'
    isMobileNav;

  if (!isShell) return; // same-origin non-shell: network as usual

  // Cache-first + background refresh for the shell.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cacheKey = isMobileNav ? './mobile.html' : event.request;
      const cached = await cache.match(cacheKey);
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) cache.put(cacheKey, resp.clone());
          return resp;
        })
        .catch(() => null);
      return cached || network.then((r) => r || new Response('Offline', { status: 503 }));
    })
  );
});
