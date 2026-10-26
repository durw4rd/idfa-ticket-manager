import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CrewMember } from '@/lib/types';
import { Avatar } from './ui/Avatar';

/**
 * Slim sticky header: page title on the left, page actions and your avatar (→ Crew) on the right.
 * `back` replaces the title area's left edge with a back link on detail pages.
 */
export default function PageHeader({
  title,
  eyebrow,
  me,
  actions,
  back,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  me?: CrewMember;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 -mx-4 mb-2 bg-paper/90 px-4 pt-safe backdrop-blur-md">
      <div className="flex h-14 items-center gap-3">
        {back}
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="label leading-none">{eyebrow}</p>}
          <h1 className="truncate font-display text-lg">{title}</h1>
        </div>
        {actions}
        {me && (
          <Link href="/crew" aria-label="Crew and settings" className="-mr-1 rounded-full p-1">
            <Avatar member={me} size="md" />
          </Link>
        )}
      </div>
    </header>
  );
}
