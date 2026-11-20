'use client';

import { useState } from 'react';
import { Share } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ImageShareSheet } from '@/components/ui/ImageShareSheet';

type When = 'upcoming' | 'all';

/**
 * Header button that renders the festival poster (a PNG from /api/agenda/poster) to share. While the
 * festival is on, it offers just the screenings still to come, the ones friends can still join.
 */
export default function SharePosterButton({
  year,
  crew,
  canPickUpcoming,
}: {
  year: number;
  crew: CrewMember[];
  canPickUpcoming: boolean; // The year has screenings both behind and ahead
}) {
  const [open, setOpen] = useState(false);
  // 'all' or an index into `crew`, matching the poster route's `who` parameter
  const [who, setWho] = useState<string>(String(crew.findIndex((member) => member.isMe)));
  const [picked, setPicked] = useState<When>('upcoming');
  const when: When = canPickUpcoming ? picked : 'all';

  const name = who === 'all' ? 'crew' : crew[Number(who)]?.name.toLowerCase() || 'agenda';
  const fileName = `idfa-${year}-${name}${when === 'upcoming' ? '-upcoming' : ''}.png`;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Share agenda poster"
        icon={<Share className="h-5 w-5" />}
        onClick={() => setOpen(true)}
      />
      <ImageShareSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share your festival"
        src={`/api/agenda/poster?year=${year}&who=${who}&when=${when}`}
        fileName={fileName}
        alt="Agenda poster preview"
        shareTitle={`IDFA ${year}`}
      >
        {crew.length > 1 && (
          <div className="-mx-5 -mt-1 mb-3 flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none]">
            {crew.map((member, index) => (
              <Chip
                key={member.email}
                selected={who === String(index)}
                icon={<Avatar member={member} size="sm" />}
                onClick={() => setWho(String(index))}
              >
                {member.isMe ? 'Me' : member.name}
              </Chip>
            ))}
            <Chip selected={who === 'all'} onClick={() => setWho('all')}>
              Everyone
            </Chip>
          </div>
        )}
        {canPickUpcoming && (
          <div className="mb-3">
            <SegmentedControl
              label="Which screenings"
              value={picked}
              onChange={setPicked}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'all', label: 'Whole festival' },
              ]}
            />
          </div>
        )}
      </ImageShareSheet>
    </>
  );
}
