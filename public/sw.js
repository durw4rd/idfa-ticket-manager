// Offline copy of the ticket wallet, for cinema foyers with no signal.
//
// - /tickets: network first; the last page that loaded is kept and shown when the network fails.
//   Opening the app (or any page) offline lands there.
// - /api/tickets/<id>/qr: network first, so the server's visibility checks still decide; a copy
//   is only used when the network fails. The wallet page (components/tickets/OfflineTickets.tsx)
//   keeps the copies in step with the tickets it shows, and removes the rest.
// - /_next/static: build files have content hashes in their names, so a stored copy never goes
//   stale; keeping them lets the stored wallet page run offline.
//
// Sign-out (and a /tickets visit that redirects to the sign-in page) deletes all of it.
// Bump VERSION when the caching rules change: older caches are deleted on activate.

const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const QR = 'ticket-qr'; // Shared with OfflineTickets.tsx and ProfileCard.tsx
const KEEP = [PAGES, STATIC, QR];
const WALLET = '/tickets';
const MAX_STATIC = 200;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (!KEEP.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request, url));
  } else if (/^\/api\/tickets\/[^/]+\/qr$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, QR));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  }
});

async function navigate(request, url) {
  const isWallet = url.pathname === WALLET && !url.search;
  try {
    const response = await fetch(request);
    if (isWallet) {
      if (response.ok && !response.redirected && response.type === 'basic') {
        const cache = await caches.open(PAGES);
        await cache.put(WALLET, response.clone());
      } else if (response.type === 'opaqueredirect' || response.redirected) {
        // Signed out: the sign-in page answered, so nothing stored may outlive the session
        await clearAll();
      }
    }
    return response;
  } catch (error) {
    const stored = await caches.match(WALLET, { cacheName: PAGES });
    if (!stored) throw error;
    // Any page opened offline shows the wallet, under its own address so the app's router agrees
    return isWallet ? stored : Response.redirect(WALLET, 302);
  }
}

async function networkFirst(request, cacheName) {
  try {
    return await fetch(request);
  } catch (error) {
    // The query only marks a retry (see QrImage.tsx)
    const stored = await caches.match(request, { cacheName, ignoreSearch: true });
    if (stored) return stored;
    throw error;
  }
}

async function cacheFirst(request) {
  const stored = await caches.match(request, { cacheName: STATIC });
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC);
    await cache.put(request, response.clone());
    // Each deploy brings new file names; drop the oldest so old builds don't pile up
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC)).map((key) => cache.delete(key)));
  }
  return response;
}

async function clearAll() {
  await Promise.all(KEEP.map((name) => caches.delete(name)));
}

// From the wallet page on every load: { type: 'sync', qrIds, assets }. Keeps a QR copy for each
// ticket the wallet shows and drops the rest (a ticket handed over, deleted or no longer visible),
// and stores the build files and the page itself if this visit didn't come through the worker.
self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === 'sync') event.waitUntil(sync(event.data));
});

async function sync({ qrIds, assets }) {
  // Fetched again each time: a visit through the app's own links doesn't load the page itself
  if (await fetchStored(PAGES, WALLET, true) === 'signed-out') return clearAll();

  const qr = await caches.open(QR);
  const wanted = new Set(qrIds.map((id) => `/api/tickets/${encodeURIComponent(id)}/qr`));
  for (const key of await qr.keys()) {
    if (!wanted.has(new URL(key.url).pathname)) await qr.delete(key);
  }
  for (const path of wanted) {
    if (await fetchStored(QR, path) === 'signed-out') return clearAll();
  }

  for (const url of assets) {
    if (new URL(url, self.location.origin).pathname.startsWith('/_next/static/')) await fetchStored(STATIC, url);
  }
}

/**
 * Store `path` in the cache, unless it's there already and `refresh` isn't set. A network error
 * keeps what's stored, for next time.
 */
async function fetchStored(cacheName, path, refresh = false) {
  const cache = await caches.open(cacheName);
  if (!refresh && (await cache.match(path))) return 'stored';
  try {
    const response = await fetch(path, { redirect: 'manual' });
    if (response.type === 'opaqueredirect' || response.status === 401) return 'signed-out';
    if (response.ok) await cache.put(path, response);
    return response.ok ? 'stored' : 'missing';
  } catch {
    return 'missing';
  }
}
