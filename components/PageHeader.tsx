import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from './ui/Button';
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
  onCrewPage = false,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  me?: CrewMember;
  actions?: ReactNode;
  back?: ReactNode;
  onCrewPage?: boolean; // The avatar link is the way to the Crew page; mark it as where you are
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
          <Link
            href="/crew"
            aria-label="Crew and settings"
            aria-current={onCrewPage ? 'page' : undefined}
            className={`-mr-1 rounded-full p-1 ${onCrewPage ? 'ring-2 ring-spark' : ''}`}
          >
            <Avatar member={me} size="md" />
          </Link>
        )}
      </div>
    </header>
  );
}

/** The back arrow at the left of a detail page's header */
export function BackLink({ href, label = 'Back to agenda' }: { href: string; label?: string }) {
  return (
    <ButtonLink
      href={href}
      variant="ghost"
      size="icon"
      aria-label={label}
      className="-ml-3"
      icon={<ArrowLeft className="h-5 w-5" />}
    />
  );
}
