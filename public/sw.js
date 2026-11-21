// Offline copy of the ticket wallet, for cinema foyers with no signal.
//
// - /tickets: the wallet page, stored by each sync after the build files it needs, and shown when
//   the network fails. Opening the app (or any page) offline lands there.
// - /api/tickets/<id>/qr: network first, so the server's visibility checks still decide; a copy
//   is only used when the network fails. The wallet page (components/tickets/OfflineTickets.tsx)
//   keeps the copies in step with the tickets it shows, and removes the rest.
// - /_next/static: build files have content hashes in their names, so a stored copy never goes
//   stale; keeping them lets the stored wallet page run offline. Each wallet sync keeps the files
//   the stored page needs and drops the rest (older builds).
//
// Sign-out, a /tickets visit that redirects to the sign-in page, and a QR request answered 401
// delete all of it. Every write is best-effort: storage being full never breaks the online app.
// Bump VERSION when the caching rules change: older caches are deleted on activate.

// v2: QR codes became holder-and-owner only, so wallets and codes stored under v1 (which held
// crew-mates' codes too) are dropped; the next online Tickets visit stores your own again.
const VERSION = 'v2';
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const QR = `ticket-qr-${VERSION}`; // Versioned too, so a bump drops old codes
const KEEP = [PAGES, STATIC, QR];
const WALLET = '/tickets';

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
  } else if (url.pathname === WALLET && request.headers.has('RSC')) {
    event.respondWith(walletData(request));
  } else if (/^\/api\/tickets\/[^/]+\/qr$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, QR));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  }
});

// Bumped by every wipe. A write checks it hasn't changed since its request started, so a response
// that was already on its way when the user signed out can't put the wallet back.
let generation = 0;

// Bumped per QR path each time the server refuses it (403). A sync that fetched the code before
// the refusal checks this, so its older answer can't put back the copy the refusal deleted.
const refusals = new Map();

function refusalCount(path) {
  return refusals.get(path) ?? 0;
}

/**
 * Store a copy unless a wipe happened since `since`, or `stillWanted` (if given) says no. Storage
 * errors (a full disk) are logged, not thrown. Returns whether the copy was stored.
 */
async function store(cacheName, key, response, since, stillWanted = () => true) {
  if (since !== generation || !stillWanted()) return false;
  try {
    const cache = await caches.open(cacheName);
    if (since !== generation || !stillWanted()) return false;
    await cache.put(key, response);
    // A wipe or refusal can land while the put is still writing, and its delete then runs before
    // the copy exists: check again now that it does, and take the copy back out
    if (since !== generation || !stillWanted()) {
      await cache.delete(key);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Offline copy not stored:', error);
    return false;
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
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const copy = await stored(WALLET, { cacheName: PAGES });
    if (!copy) throw error;
    // Any page opened offline shows the wallet, under its own address so the app's router agrees
    return isWallet ? copy : Response.redirect(WALLET, 302);
  }
  // The page itself is stored by the sync it starts once loaded, after its build files (see sync)
  if (isWallet && (response.type === 'opaqueredirect' || response.redirected)) {
    // Signed out: the sign-in page answered, so nothing stored may outlive the session
    await clearAll();
  }
  return response;
}

// The app's own links fetch the wallet as router data, not a page. Nothing is stored from it, but a
// redirect to sign-in or a 401 means the session is over, and the copies go.
async function walletData(request) {
  const response = await fetch(request);
  if (response.status === 401 || (response.redirected && new URL(response.url).pathname !== WALLET)) {
    await clearAll();
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
  // Not yours to show (e.g. a ticket handed to someone else since it was stored): drop the copy
  // so it can't be served offline later
  if (response.status === 403) {
    const path = new URL(request.url).pathname;
    refusals.set(path, refusalCount(path) + 1);
    try {
      const cache = await caches.open(cacheName);
      await cache.delete(request, { ignoreSearch: true });
    } catch {
      // Housekeeping only; the next wallet sync drops it too
    }
  }
  return response;
}

async function cacheFirst(request) {
  const copy = await stored(request, { cacheName: STATIC });
  if (copy) return copy;
  const since = generation;
  const response = await fetch(request);
  if (response.ok) {
    await store(STATIC, request, response.clone(), since);
  }
  return response;
}

// From the pages:
// - { type: 'sync', assets } from the wallet on every load. Stores the wallet page fresh (a visit
//   through the app's own links doesn't load the page itself), a QR copy for each ticket that
//   stored page lists, and the build files; drops QR copies of tickets no longer on it.
// - { type: 'sign-out' } before signing out, answered on the given port once everything is gone.
self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === 'sync') {
    // One at a time, in order, so an older sync finishing late can't undo a newer one. The wipe
    // generation is taken now: a sync queued before a sign-out stores nothing.
    const since = generation;
    syncs = syncs.then(() => sync(event.data, since)).catch((error) => console.warn('Offline sync failed:', error));
    event.waitUntil(syncs);
  } else if (event.data?.type === 'sign-out') {
    event.waitUntil(clearAll().then(() => event.ports[0]?.postMessage('cleared')));
  }
});

let syncs = Promise.resolve();

// The wallet marks its tickets in the page (components/tickets/OfflineTickets.tsx), so the QR
// copies always match the stored page rather than whatever the open tab was showing
const TICKET_IDS = /data-offline-tickets="([0-9a-fA-F -]*)"/;

async function sync({ assets }, since) {
  if (since !== generation) return;
  let response;
  try {
    response = await fetch(WALLET, { redirect: 'manual' });
  } catch {
    return; // Offline: keep what's stored
  }
  if (response.type === 'opaqueredirect' || response.status === 401) return clearAll();
  if (!response.ok) return;
  const html = await response.text();
  const match = html.match(TICKET_IDS);
  if (!match) return;
  // The build files the page needs: those it names, and those the open tab loaded (code split off
  // and loaded later). All of them are stored before the page replaces the old one, so a failed
  // download or write leaves the old page and its files as they were.
  const needed = new Set();
  for (const [, url] of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) needed.add(url.replace(/&amp;/g, '&'));
  for (const url of assets) {
    const parsed = new URL(url, self.location.origin);
    if (parsed.origin === self.location.origin && parsed.pathname.startsWith('/_next/static/')) {
      needed.add(parsed.pathname + parsed.search);
    }
  }
  for (const path of needed) {
    if ((await fetchStored(STATIC, path, since)) !== 'stored') return;
  }

  // Only the type: the body is already decoded, so encoding and length headers would be wrong
  const page = new Response(html, { headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/html' } });
  // Not stored (storage full, or signed out meanwhile): the old page stays, and so do its files and QR codes
  if (!(await store(PAGES, WALLET, page, since))) return;

  // Files from older builds are no longer needed by the stored page
  try {
    const cache = await caches.open(STATIC);
    for (const key of await cache.keys()) {
      const url = new URL(key.url);
      if (since === generation && !needed.has(url.pathname + url.search)) await cache.delete(key);
    }
  } catch {
    // Housekeeping only
  }

  try {
    const qr = await caches.open(QR);
    const ids = match[1].split(' ').filter(Boolean);
    const wanted = new Set(ids.map((id) => `/api/tickets/${encodeURIComponent(id)}/qr`));
    for (const key of await qr.keys()) {
      if (since === generation && !wanted.has(new URL(key.url).pathname)) await qr.delete(key);
    }
    for (const path of wanted) {
      if (await fetchStored(QR, path, since) === 'signed-out') return clearAll();
    }
  } catch (error) {
    console.warn('Offline QR codes not synced:', error);
  }
}

/** Store `path` in the cache unless it's there already. A network error is left for next time. */
async function fetchStored(cacheName, path, since) {
  if (await stored(path, { cacheName })) return 'stored';
  const refusedBefore = refusalCount(path);
  try {
    const response = await fetch(path, { redirect: 'manual' });
    if (response.type === 'opaqueredirect' || response.status === 401) return 'signed-out';
    // Refused while this request was out (e.g. the ticket was handed on): don't store the old answer
    const notRefused = () => refusalCount(path) === refusedBefore;
    // 'stored' only when the copy really is: a full disk must not count as done
    return response.ok && (await store(cacheName, path, response, since, notRefused)) ? 'stored' : 'missing';
  } catch {
    return 'missing';
  }
}
