import type { ReactNode } from 'react';
import type { CrewMember, Rating } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';

/** One person's verdict: who, score, comment. `action` sits under it (your own row has Edit). */
export function RatingRow({
  member,
  name = member.name,
  rating,
  comment,
  action,
}: {
  member: Pick<CrewMember, 'name' | 'color' | 'badge'>;
  name?: string;
  rating: number;
  comment?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Avatar member={member} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="font-semibold">{name}</span>
          <span className="ml-auto font-display text-lg tabular-nums">
            {rating}
            <span className="text-sm font-normal text-ink-3">/10</span>
          </span>
        </p>
        {comment && <p className="mt-0.5 whitespace-pre-line break-words italic text-ink-2">“{comment}”</p>}
        {action}
      </div>
    </div>
  );
}

/** What the rest of the crew thought: score, comment, who */
export default function CrewRatings({
  ratings,
  lookup,
}: {
  ratings: Rating[];
  lookup: (email: string) => CrewMember;
}) {
  return (
    <ul className="space-y-4">
      {ratings.map((rating) => (
        <li key={rating.id}>
          <RatingRow member={lookup(rating.userEmail)} rating={rating.rating} comment={rating.comment} />
        </li>
      ))}
    </ul>
  );
}
