import type { CrewMember, Rating } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';

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
      {ratings.map((rating) => {
        const member = lookup(rating.userEmail);
        return (
          <li key={rating.id} className="flex gap-3">
            <Avatar member={member} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="font-semibold">{member.name}</span>
                <span className="ml-auto font-display text-lg tabular-nums">
                  {rating.rating}
                  <span className="text-sm font-normal text-ink-3">/10</span>
                </span>
              </p>
              {rating.comment && <p className="mt-0.5 italic text-ink-2">“{rating.comment}”</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
