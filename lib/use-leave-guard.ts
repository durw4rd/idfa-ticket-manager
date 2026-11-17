'use client';

import { useEffect } from 'react';

/**
 * While `active`, ask before leaving the page: closing or reloading the tab (beforeunload, whose
 * text the browser chooses), following an in-app link, and the browser's Back button (Next.js
 * client navigation fires neither beforeunload nor anything cancellable, so links and history are
 * checked here). Navigation done in code, such as router.push after a successful save, isn't
 * affected.
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

    // Back/Forward can't be cancelled, so stand on a copy of the current history entry: going back
    // lands on the original (the same page, with Next.js's own state, so the router does nothing),
    // and then we either step back again for real or put the copy back
    window.history.pushState(window.history.state, '', window.location.href);
    let leaving = false;
    const onPopState = () => {
      if (leaving) return;
      if (window.confirm(message)) {
        leaving = true;
        window.history.back();
      } else {
        window.history.pushState(window.history.state, '', window.location.href);
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [active, message]);
}
