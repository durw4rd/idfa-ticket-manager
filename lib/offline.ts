// The offline ticket wallet (public/sw.js). Client-only helpers.

/**
 * Register the service worker and have it keep an offline copy of the wallet and of the QR codes
 * of the tickets on it (marked in the page by OfflineTickets), and nothing else. Only in production builds, where file names are stable;
 * in development the worker would hold on to stale code.
 */
export async function keepTicketsOffline(): Promise<void> {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    // The build files this page loaded; on a first visit they came before the worker could see them
    const assets = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).origin === location.origin && new URL(url).pathname.startsWith('/_next/static/'));
    registration.active?.postMessage({ type: 'sync', assets });
  } catch (error) {
    console.warn('Offline tickets unavailable:', error);
  }
}

/**
 * Delete every offline copy (wallet page, QR codes, build files); called before signing out. The
 * worker wipes them and confirms, which also stops any of its requests still in flight from
 * storing a copy afterwards; the page then deletes whatever is left itself.
 */
export async function clearOfflineCopies(): Promise<void> {
  try {
    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null;
    if (worker) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        // Don't hold up signing out if the worker doesn't answer
        const timeout = setTimeout(resolve, 2000);
        channel.port1.onmessage = () => {
          clearTimeout(timeout);
          resolve();
        };
        worker.postMessage({ type: 'sign-out' }, [channel.port2]);
      });
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // Storage blocked (private mode): nothing was stored either
  }
}
