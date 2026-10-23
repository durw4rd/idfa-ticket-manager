'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Film, Upload, Users } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/screenings', label: 'Screenings', icon: Film },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/settings', label: 'Sharing', icon: Users },
];

/**
 * Inline links in the header on larger screens, a fixed bottom bar on phones
 */
export default function AppNav({ variant }: { variant: 'header' | 'bottom' }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session) {
    return null;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === 'header') {
    return (
      <nav className="hidden sm:flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 text-sm font-medium rounded transition-colors ${
              isActive(href) ? 'text-idfa-black bg-idfa-gray-100' : 'text-idfa-gray-600 hover:text-idfa-black'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-idfa-gray-200 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-medium ${
              isActive(href) ? 'text-idfa-black' : 'text-idfa-gray-500'
            }`}
          >
            <Icon className="h-6 w-6" strokeWidth={isActive(href) ? 2.25 : 1.75} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
