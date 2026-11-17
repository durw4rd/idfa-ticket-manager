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
// Sign-out, a /tickets visit that redirects to the sign-in page, and a QR request answered 401
// delete all of it. Every write is best-effort: storage being full never breaks the online app.
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

// Bumped by every wipe. A write checks it hasn't changed since its request started, so a response
// that was already on its way when the user signed out can't put the wallet back.
let generation = 0;

/** Store a copy unless a wipe happened since `since`. Storage errors (a full disk) are ignored. */
async function store(cacheName, key, response, since) {
  if (since !== generation) return;
  try {
    const cache = await caches.open(cacheName);
    if (since !== generation) return;
    await cache.put(key, response);
  } catch (error) {
    console.warn('Offline copy not stored:', error);
  }
}

async function clearAll() {
  generation++;
  await Promise.all(KEEP.map((name) => caches.delete(name).catch(() => false)));
}

async function stored(key, options) {
  try {
    return await caches.match(key, options);
  } catch {
    return undefined;
  }
}

async function navigate(request, url) {
  const isWallet = url.pathname === WALLET && !url.search;
  const since = generation;
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const copy = await stored(WALLET, { cacheName: PAGES });
    if (!copy) throw error;
    // Any page opened offline shows the wallet, under its own address so the app's router agrees
    return isWallet ? copy : Response.redirect(WALLET, 302);
  }
  if (isWallet) {
    if (response.ok && !response.redirected && response.type === 'basic') {
      await store(PAGES, WALLET, response.clone(), since);
    } else if (response.type === 'opaqueredirect' || response.redirected) {
      // Signed out: the sign-in page answered, so nothing stored may outlive the session
      await clearAll();
    }
  }
  return response;
}

async function networkFirst(request, cacheName) {
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    // The query only marks a retry (see QrImage.tsx)
    const copy = await stored(request, { cacheName, ignoreSearch: true });
    if (copy) return copy;
    throw error;
  }
  // The session is over: the copies go too, and the refusal stands
  if (response.status === 401) await clearAll();
  return response;
}

async function cacheFirst(request) {
  const copy = await stored(request, { cacheName: STATIC });
  if (copy) return copy;
  const since = generation;
  const response = await fetch(request);
  if (response.ok) {
    await store(STATIC, request, response.clone(), since);
    // Each deploy brings new file names; drop the oldest so old builds don't pile up
    try {
      const cache = await caches.open(STATIC);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC)).map((key) => cache.delete(key)));
    } catch {
      // Trimming is housekeeping; skip it when storage misbehaves
    }
  }
  return response;
}

// From the pages:
// - { type: 'sync', qrIds, assets } from the wallet on every load. Keeps a QR copy for each ticket
//   the wallet shows and drops the rest (a ticket handed over, deleted or no longer visible), and
//   stores the build files and the page itself (a visit through the app's own links doesn't load it).
// - { type: 'sign-out' } before signing out, answered on the given port once everything is gone.
self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === 'sync') {
    event.waitUntil(sync(event.data, generation));
  } else if (event.data?.type === 'sign-out') {
    event.waitUntil(clearAll().then(() => event.ports[0]?.postMessage('cleared')));
  }
});

async function sync({ qrIds, assets }, since) {
  if (await fetchStored(PAGES, WALLET, since, true) === 'signed-out') return clearAll();

  try {
    const qr = await caches.open(QR);
    const wanted = new Set(qrIds.map((id) => `/api/tickets/${encodeURIComponent(id)}/qr`));
    for (const key of await qr.keys()) {
      if (!wanted.has(new URL(key.url).pathname)) await qr.delete(key);
    }
    for (const path of wanted) {
      if (await fetchStored(QR, path, since) === 'signed-out') return clearAll();
    }
  } catch (error) {
    console.warn('Offline QR codes not synced:', error);
  }

  for (const url of assets) {
    if (new URL(url, self.location.origin).pathname.startsWith('/_next/static/')) await fetchStored(STATIC, url, since);
  }
}

/**
 * Store `path` in the cache, unless it's there already and `refresh` isn't set. A network error
 * keeps what's stored, for next time.
 */
async function fetchStored(cacheName, path, since, refresh = false) {
  if (!refresh && (await stored(path, { cacheName }))) return 'stored';
  try {
    const response = await fetch(path, { redirect: 'manual' });
    if (response.type === 'opaqueredirect' || response.status === 401) return 'signed-out';
    if (response.ok) await store(cacheName, path, response, since);
    return response.ok ? 'stored' : 'missing';
  } catch {
    return 'missing';
  }
}
