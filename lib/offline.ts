// The offline ticket wallet (public/sw.js). Client-only helpers.

/**
 * Register the service worker and have it keep an offline copy of the wallet and of these
 * tickets' QR codes (and nothing else). Only in production builds, where file names are stable;
 * in development the worker would hold on to stale code.
 */
export async function keepTicketsOffline(qrIds: string[]): Promise<void> {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    // The build files this page loaded; on a first visit they came before the worker could see them
    const assets = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).origin === location.origin && new URL(url).pathname.startsWith('/_next/static/'));
    registration.active?.postMessage({ type: 'sync', qrIds, assets });
  } catch (error) {
    console.warn('Offline tickets unavailable:', error);
  }
}

/** Delete every offline copy (wallet page, QR codes, build files); called before signing out */
export async function clearOfflineCopies(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    // Storage blocked (private mode): nothing was stored either
  }
}
