'use client';

import { useEffect, useRef } from 'react';

/**
 * While `active`, ask before leaving the page: closing or reloading the tab (beforeunload, whose
 * text the browser chooses), following an in-app link, and the browser's Back button (Next.js
 * client navigation fires neither beforeunload nor anything cancellable, so links and history are
 * checked here). Navigation done in code, such as router.push after a successful save, isn't
 * affected.
 */
export function useLeaveGuard(active: boolean, message: string) {
  // Read from refs so a change of wording or state doesn't re-run the effects below
  const messageRef = useRef(message);
  messageRef.current = message;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Back/Forward can't be cancelled, so while armed we stand on one copy of the current history
  // entry (with Next.js's own state, so stepping back onto the original is a no-op for the router).
  // This says whether that copy is the entry we're on; there is never more than one.
  const onGuardEntry = useRef(false);

  // For as long as the page is open, not just while armed: a Back taken after disarming (say, once
  // the edits are saved) still lands on the original entry first, and should simply carry on
  useEffect(() => {
    const onPopState = () => {
      if (!onGuardEntry.current) return;
      onGuardEntry.current = false; // Now on the original entry
      if (!activeRef.current || window.confirm(messageRef.current)) {
        window.history.back(); // Finish the Back that was asked for
      } else {
        window.history.pushState(window.history.state, '', window.location.href);
        onGuardEntry.current = true;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!active) return;

    if (!onGuardEntry.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      onGuardEntry.current = true;
    }

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
      if (!window.confirm(messageRef.current)) {
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
  }, [active]);
}
