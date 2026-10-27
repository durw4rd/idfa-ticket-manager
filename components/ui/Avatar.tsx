import { Clapperboard, Drama, Film, Popcorn, Projector, Video, type LucideIcon } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { type Badge, getInitials } from '@/lib/display';

export const BADGE_ICONS: Record<Badge, LucideIcon> = {
  clapper: Clapperboard,
  popcorn: Popcorn,
  projector: Projector,
  film: Film,
  masks: Drama,
  camera: Video,
};

// Literal class names so Tailwind keeps them (see the crew tokens in app/globals.css)
const CREW_BG = ['bg-crew-0', 'bg-crew-1', 'bg-crew-2', 'bg-crew-3', 'bg-crew-4', 'bg-crew-5'];
const CREW_TEXT = ['text-crew-0', 'text-crew-1', 'text-crew-2', 'text-crew-3', 'text-crew-4', 'text-crew-5'];
const CREW_TINT = [
  'bg-crew-0/15',
  'bg-crew-1/15',
  'bg-crew-2/15',
  'bg-crew-3/15',
  'bg-crew-4/15',
  'bg-crew-5/15',
];

const CREW_BORDER = [
  'border-crew-0',
  'border-crew-1',
  'border-crew-2',
  'border-crew-3',
  'border-crew-4',
  'border-crew-5',
];

export function crewBorder(color: number) {
  return CREW_BORDER[color % CREW_BORDER.length];
}

export function crewBg(color: number) {
  return CREW_BG[color % CREW_BG.length];
}

export function crewText(color: number) {
  return CREW_TEXT[color % CREW_TEXT.length];
}

const SIZES = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

const ICON_SIZES = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
};

/**
 * A person: their badge (or initial) in their crew colour on a tint of it. The tint sits on an
 * opaque surface, so stacked avatars don't show through each other.
 */
export function Avatar({
  member,
  size = 'sm',
  className = '',
}: {
  member: Pick<CrewMember, 'name' | 'color' | 'badge'>;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = member.badge ? BADGE_ICONS[member.badge] : null;
  return (
    <span
      title={member.name}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-bold
        ${crewText(member.color)} ${SIZES[size]} ${className}`}
    >
      <span className={`absolute inset-0 rounded-full ${CREW_TINT[member.color % CREW_TINT.length]}`} aria-hidden />
      {Icon ? (
        <Icon className={`relative ${ICON_SIZES[size]}`} strokeWidth={2.25} aria-hidden />
      ) : (
        <span className="relative">{getInitials(member.name)}</span>
      )}
    </span>
  );
}

/** Overlapping avatars, e.g. everyone holding a ticket for a screening */
export function AvatarStack({
  members,
  size = 'sm',
}: {
  members: Pick<CrewMember, 'name' | 'color' | 'badge' | 'email'>[];
  size?: keyof typeof SIZES;
}) {
  return (
    <span className="inline-flex -space-x-1.5" aria-label={members.map((m) => m.name).join(', ')}>
      {members.map((member) => (
        <Avatar key={member.email} member={member} size={size} className="ring-2 ring-paper" />
      ))}
    </span>
  );
}
