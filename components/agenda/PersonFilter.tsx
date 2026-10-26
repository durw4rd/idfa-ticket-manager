'use client';

import type { CrewMember } from '@/lib/types';
import type { PersonFilter as Filter } from '@/lib/agenda';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';

/** Everyone · Me · each crew-mate, with how many screenings each holds tickets for */
export default function PersonFilter({
  crew,
  value,
  onChange,
  counts,
  total,
}: {
  crew: CrewMember[];
  value: Filter;
  onChange: (value: Filter) => void;
  counts: Map<string, number>;
  total: number;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Whose agenda">
      <Chip selected={value === 'all'} count={total} onClick={() => onChange('all')}>
        Everyone
      </Chip>
      {crew.map((member) => (
        <Chip
          key={member.email}
          selected={value === member.email}
          count={counts.get(member.email) || 0}
          icon={<Avatar member={member} size="sm" />}
          onClick={() => onChange(member.email)}
        >
          {member.isMe ? 'Me' : member.name}
        </Chip>
      ))}
    </div>
  );
}
