'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CalendarDays, Star, Ticket } from 'lucide-react';

// One tab per job: see the agenda, get to a ticket, rate what you saw
const NAV_ITEMS = [
  { href: '/screenings', label: 'Agenda', icon: CalendarDays },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/films', label: 'Films', icon: Star },
];

/** Bottom tab bar on every screen size. Hidden when signed out. */
export default function AppNav() {
  const pathname = usePathname();
  const { status } = useSession();

  if (status !== 'authenticated') {
    return null;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/90 pb-safe backdrop-blur-md">
      <div className="mx-auto grid h-tabbar max-w-xl grid-cols-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-spark text-[#111]' : ''
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
