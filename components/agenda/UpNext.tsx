'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Navigation, QrCode } from 'lucide-react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { dayKey, formatDate, formatTime } from '@/lib/dates';
import { formatTimeUntil } from '@/lib/display';
import { getMapSearchUrl } from '@/lib/maps-utils';
import { holdersOf, screeningHref } from '@/lib/agenda';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import QrOverlay, { qrTicketsFor } from '@/components/tickets/QrOverlay';

/** The next screening for the selected person, with the QR one tap away */
export default function UpNext({
  screening,
  now,
  personEmail,
  lookup,
}: {
  screening: AgendaScreening;
  now: Date;
  personEmail: string;
  lookup: (email: string) => CrewMember;
}) {
  const [showQr, setShowQr] = useState(false);
  const startsAt = new Date(screening.startsAt);
  // Compare with the server's `now`, not the browser clock, so TEST_DATE works
  const when = dayKey(startsAt) === dayKey(now) ? formatTimeUntil(startsAt, now) : formatDate(startsAt);

  return (
    <section className="relative mb-6 overflow-hidden rounded border border-line bg-surface">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-spark" aria-hidden />
      <div className="py-4 pl-6 pr-4">
        <p className="label">Up next · {when}</p>
        <Link href={screeningHref(screening)} className="mt-1 block">
          <h2 className="font-display text-xl text-balance">{screening.act}</h2>
        </Link>
        <div className="mt-2 flex items-center gap-2 text-sm text-ink-2">
          <span className="font-semibold tabular-nums text-ink">{formatTime(startsAt)}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{screening.location}</span>
          <span className="ml-auto">
            <AvatarStack members={holdersOf(screening).map(lookup)} />
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="spark" icon={<QrCode className="h-5 w-5" />} onClick={() => setShowQr(true)} className="flex-1">
            Show ticket
          </Button>
          <ButtonLink
            variant="secondary"
            size="icon"
            href={getMapSearchUrl(screening.location)}
            external
            aria-label={`Directions to ${screening.location}`}
            icon={<Navigation className="h-5 w-5" />}
          />
        </div>
      </div>
      {showQr && (
        <QrOverlay
          tickets={qrTicketsFor(screening, (email) => lookup(email).name, personEmail)}
          onClose={() => setShowQr(false)}
        />
      )}
    </section>
  );
}
