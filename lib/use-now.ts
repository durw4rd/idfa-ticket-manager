'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const MINUTE = 60_000;
// Back after this long, the page's data (ended screenings, new tickets) is worth reloading
const STALE_AFTER_MS = 5 * MINUTE;

/**
 * "Now" for client components. The first render uses the server's `now`, so server and client
 * markup match. After that it's this device's clock, moving on every minute, so a page left open
 * (often an installed home-screen app) keeps "in 20 min", the next screening and the past greying
 * current. It never infers anything from the age of `now`: a page restored from a cache (the
 * router's or the browser's back/forward cache) can carry a `now` from long ago.
 *
 * With TEST_DATE set the server's clock is fixed (see getNow in lib/dates.ts); the root layout
 * marks that with data-fixed-clock, and then the client keeps the server's `now` too.
 *
 * Also refreshes the page's server data when it comes back into view after a while.
 */
export function useNow(serverNowIso: string): Date {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(serverNowIso));

  useEffect(() => {
    if (document.documentElement.dataset.fixedClock !== undefined) {
      setNow(new Date(serverNowIso));
      return;
    }
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, MINUTE);

    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        tick();
        if (Date.now() - hiddenAt >= STALE_AFTER_MS) router.refresh();
        hiddenAt = null;
      }
    };
    // Restored from the browser's back/forward cache: the timer was paused and the data may be old
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      tick();
      router.refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [serverNowIso, router]);

  return now;
}
