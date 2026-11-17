'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const MINUTE = 60_000;
// Back after this long, the page's data (ended screenings, new tickets) is worth reloading
const STALE_AFTER_MS = 5 * MINUTE;

/**
 * "Now" for client components, starting from the server's `now` (so TEST_DATE applies) and moving
 * on every minute, so a page left open (often an installed home-screen app) keeps "in 20 min", the
 * next screening and the past greying current. The first render uses the server value exactly, so
 * server and client markup match.
 *
 * Also refreshes the page's server data when it comes back into view after a while.
 */
export function useNow(serverNowIso: string): Date {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(serverNowIso));

  useEffect(() => {
    // The server's clock (or TEST_DATE) minus this device's, measured when the page arrives
    const offset = new Date(serverNowIso).getTime() - Date.now();
    setNow(new Date(serverNowIso));
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), MINUTE);

    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        setNow(new Date(Date.now() + offset));
        if (Date.now() - hiddenAt >= STALE_AFTER_MS) router.refresh();
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Restored from the back/forward cache, the page comes back with the clock where it was left
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setNow(new Date(Date.now() + offset));
      router.refresh();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [serverNowIso, router]);

  return now;
}
