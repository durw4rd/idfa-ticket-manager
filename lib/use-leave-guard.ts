'use client';

import { useEffect } from 'react';

/**
 * While `active`, ask before leaving the page: closing or reloading the tab (beforeunload, whose
 * text the browser chooses) and following an in-app link (Next.js client navigation doesn't fire
 * beforeunload, so link clicks are checked here). Navigation done in code, such as router.push
 * after a successful save, isn't affected.
 */
export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    // Capture phase on window runs before React's handlers (and so before next/link's)
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return; // New tabs and windows don't leave this page
      }
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // Leaving the site: beforeunload asks
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
    };
  }, [active, message]);
}
