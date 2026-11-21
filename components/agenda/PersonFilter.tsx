'use client';

import type { CrewMember } from '@/lib/types';
import { togglePerson } from '@/lib/agenda';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';

/**
 * Everyone · Me · each crew-mate, with how many screenings each holds tickets for. Pick any mix of
 * people, from any of your crews; nobody picked is everyone.
 */
export default function PersonFilter({
  crew,
  value,
  onChange,
  counts,
  total,
}: {
  crew: CrewMember[];
  value: string[];
  onChange: (value: string[]) => void;
  counts: Map<string, number>;
  total: number;
}) {
  const selected = new Set(value);
  return (
    <div className="-mx-4 -mt-1 flex gap-2 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none]" role="group" aria-label="Whose agenda">
      <Chip selected={value.length === 0} count={total} onClick={() => onChange([])}>
        Everyone
      </Chip>
      {crew.map((member) => (
        <Chip
          key={member.email}
          selected={selected.has(member.email)}
          count={counts.get(member.email) || 0}
          icon={<Avatar member={member} size="sm" />}
          onClick={() => onChange(togglePerson(crew, value, member.email))}
        >
          {member.isMe ? 'Me' : member.name}
        </Chip>
      ))}
    </div>
  );
}
