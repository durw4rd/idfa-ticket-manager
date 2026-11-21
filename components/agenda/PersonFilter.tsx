'use client';

import { Fragment } from 'react';
import { Users } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { crewSections, togglePeople } from '@/lib/agenda';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';

/**
 * Everyone · Me · each crew-mate, with how many screenings each holds tickets for. Several people
 * can be picked at once; nobody picked is everyone. In more than one crew, crew-mates are listed
 * under a chip for their crew, which picks the whole crew (you included) in one tap.
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
  const me = crew.find((member) => member.isMe);
  const sections = crewSections(crew);
  const selected = new Set(value);
  // Crew-mates no section lists (only possible while groups load out of step) still get a chip
  const unlisted = crew.filter(
    (member) => !member.isMe && !sections.some((section) => section.members.includes(member))
  );

  const personChip = (member: CrewMember) => (
    <Chip
      key={member.email}
      selected={selected.has(member.email)}
      count={counts.get(member.email) || 0}
      icon={<Avatar member={member} size="sm" />}
      onClick={() => onChange(togglePeople(crew, value, [member.email]))}
    >
      {member.isMe ? 'Me' : member.name}
    </Chip>
  );

  return (
    <div
      className="-mx-4 -mt-1 flex items-center gap-2 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none]"
      role="group"
      aria-label="Whose agenda"
    >
      <Chip selected={value.length === 0} count={total} onClick={() => onChange([])}>
        Everyone
      </Chip>
      {me && personChip(me)}
      {sections.length > 1
        ? sections.map((section) => (
            <Fragment key={section.group.id}>
              <span className="h-6 w-px shrink-0 bg-line" aria-hidden />
              <Chip
                selected={section.everyone.every((email) => selected.has(email))}
                icon={<Users className="ml-1 h-4 w-4" />}
                aria-label={`Everyone in ${section.group.name}`}
                className="max-w-[12rem]"
                onClick={() => onChange(togglePeople(crew, value, section.everyone))}
              >
                <span className="truncate">{section.group.name}</span>
              </Chip>
              {section.members.map(personChip)}
            </Fragment>
          ))
        : sections.flatMap((section) => section.members).map(personChip)}
      {unlisted.map(personChip)}
    </div>
  );
}
