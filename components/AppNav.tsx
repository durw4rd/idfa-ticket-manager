'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CalendarDays, Star, Ticket } from 'lucide-react';
import { TODO_CHANGED_EVENT } from '@/lib/todo-events';

// One tab per job: see the agenda (list, timeline or map), get to a ticket, rate what you saw
const NAV_ITEMS = [
  { href: '/screenings', label: 'Agenda', icon: CalendarDays },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/films', label: 'Films', icon: Star },
];

/** Bottom tab bar on every screen size. Hidden when signed out. */
export default function AppNav() {
  const pathname = usePathname();
  const { status } = useSession();
  const todoCount = useTodoCount(status === 'authenticated', pathname);

  if (status !== 'authenticated') {
    return null;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/90 pb-safe backdrop-blur-md">
      <div className="mx-auto grid h-tabbar max-w-xl grid-cols-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          // Films holds the to-do list: films waiting for your rating or Audience Award vote
          const count = href === '/films' ? todoCount : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={count > 0 ? `${label}, ${count} to do` : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <span
                className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-spark text-[#111]' : ''
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                {count > 0 && (
                  <span
                    aria-hidden
                    // On the active tab's yellow pill, ink keeps it readable
                    className={`absolute -top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums ring-2 ring-paper ${
                      active ? 'bg-ink text-paper' : 'bg-spark text-[#111]'
                    }`}
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * How many films are on the Films page's to-do list. Asked again on every page change, when the
 * app comes back to the foreground, and after a rating or vote is saved. A failed request shows
 * no count: it's a nudge, never worth an error.
 */
function useTodoCount(signedIn: boolean, pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = () => {
      fetch('/api/todo', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!cancelled) setCount(typeof data?.count === 'number' ? data.count : 0);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    load();
    window.addEventListener(TODO_CHANGED_EVENT, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(TODO_CHANGED_EVENT, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, pathname]);

  return signedIn ? count : 0;
}
