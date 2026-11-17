'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { keepTicketsOffline } from '@/lib/offline';

/**
 * Keeps this phone's offline copy of the wallet in step with the tickets on it (see public/sw.js),
 * and says so when the page is showing that copy.
 */
export default function OfflineTickets({ ticketIds }: { ticketIds: string[] }) {
  const [offline, setOffline] = useState(false);
  // Again on every fresh server render (a new ticketIds array), not only when the IDs change: a
  // refresh can bring a corrected time, venue or holder for the same tickets, and the stored page
  // should have it
  useEffect(() => {
    if (navigator.onLine) keepTicketsOffline();
  }, [ticketIds]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // The worker reads the ticket list from the stored page itself (see public/sw.js)
  const marker = <span hidden data-offline-tickets={ticketIds.join(' ')} />;
  if (!offline) return marker;
  return (
    <>
      {marker}
      <p role="status" className="mb-4 flex items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-sm text-ink-2">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        You&apos;re offline. These are the tickets saved on this phone.
      </p>
    </>
  );
}
