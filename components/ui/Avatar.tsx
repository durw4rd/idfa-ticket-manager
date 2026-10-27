import type { CrewMember } from '@/lib/types';
import { getInitials } from '@/lib/display';

// Literal class names so Tailwind keeps them (see the crew tokens in app/globals.css)
const CREW_BG = ['bg-crew-0', 'bg-crew-1', 'bg-crew-2', 'bg-crew-3', 'bg-crew-4', 'bg-crew-5'];
const CREW_TEXT = ['text-crew-0', 'text-crew-1', 'text-crew-2', 'text-crew-3', 'text-crew-4', 'text-crew-5'];

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

export function Avatar({
  member,
  size = 'sm',
  className = '',
}: {
  member: Pick<CrewMember, 'name' | 'color'>;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      title={member.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-on-crew
        ${crewBg(member.color)} ${SIZES[size]} ${className}`}
    >
      {getInitials(member.name)}
    </span>
  );
}

/** Overlapping avatars, e.g. everyone holding a ticket for a screening */
export function AvatarStack({
  members,
  size = 'sm',
}: {
  members: Pick<CrewMember, 'name' | 'color' | 'email'>[];
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
