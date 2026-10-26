'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, Plus, QrCode, Ticket } from 'lucide-react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { dayKey, formatDate, formatTime } from '@/lib/dates';
import { formatTimeUntil } from '@/lib/display';
import { makeCrewLookup, screeningHref } from '@/lib/agenda';
import { usePersistentState } from '@/lib/use-persistent-state';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import QrOverlay, { type QrTicket } from './QrOverlay';

type Scope = 'mine' | 'crew';

interface Pass {
  screening: AgendaScreening;
  ticketId: string;
  holder: CrewMember;
  index: number; // Position among the screening's tickets in this list
  of: number;
}

/**
 * Upcoming tickets as passes, soonest first. The next one shows its QR right away; any pass opens
 * the full-screen QR, and you can swipe through the rest from there.
 */
export default function TicketWallet({
  screenings,
  crew,
  now: nowIso,
}: {
  screenings: AgendaScreening[];
  crew: CrewMember[];
  now: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const lookup = useMemo(() => makeCrewLookup(crew), [crew]);
  const me = crew.find((member) => member.isMe)!;
  const [scope, setScope] = usePersistentState<Scope>('tickets.scope', 'mine', (v) => ['mine', 'crew'].includes(v));
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);

  const passes: Pass[] = screenings.flatMap((screening) => {
    const tickets = screening.tickets.filter((ticket) => scope === 'crew' || ticket.holderEmail === me.email);
    return tickets.map((ticket, index) => ({
      screening,
      ticketId: ticket.id,
      holder: lookup(ticket.holderEmail),
      index,
      of: tickets.length,
    }));
  });

  const qrTickets: QrTicket[] = passes.map((pass) => {
    const start = new Date(pass.screening.startsAt);
    return {
      id: pass.ticketId,
      title: pass.screening.act,
      meta: `${formatDate(start)} · ${formatTime(start)} · ${pass.screening.location}`,
      holder: pass.holder.name,
      label: pass.of > 1 ? `${pass.index + 1} of ${pass.of}` : undefined,
    };
  });

  return (
    <>
      {crew.length > 1 && (
        <div className="mb-4">
          <SegmentedControl
            label="Whose tickets"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'crew', label: 'Whole crew' },
            ]}
          />
        </div>
      )}

      {passes.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-10 w-10" strokeWidth={1.5} />}
          title={scope === 'mine' ? 'No upcoming tickets for you' : 'No upcoming tickets'}
          action={
            <ButtonLink href="/upload" icon={<Plus className="h-5 w-5" />}>
              Add tickets
            </ButtonLink>
          }
        >
          {scope === 'mine' && crew.length > 1
            ? 'Tickets a crew-mate hands to you show up here.'
            : 'Upload the PDFs from your IDFA order.'}
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {passes.map((pass, position) => {
            const start = new Date(pass.screening.startsAt);
            const first = position === 0;
            const when =
              dayKey(start) === dayKey(now) ? `Today · ${formatTimeUntil(start, now)}` : formatDate(start);
            return (
              <li
                key={pass.ticketId}
                className={`relative overflow-hidden rounded border bg-surface ${first ? 'border-ink/20' : 'border-line'}`}
              >
                {first && <div className="absolute inset-y-0 left-0 w-1.5 bg-spark" aria-hidden />}
                <div className={`flex gap-4 p-4 ${first ? 'flex-col pl-6' : 'items-center'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="label">{when}</p>
                    <Link href={screeningHref(pass.screening)} className="group mt-1 flex items-start gap-1">
                      <span className={`font-display leading-tight ${first ? 'text-xl' : 'text-lg'}`}>
                        {pass.screening.act}
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-3 group-hover:text-ink" />
                    </Link>
                    <p className="mt-1 text-sm text-ink-2">
                      <span className="font-semibold tabular-nums text-ink">{formatTime(start)}</span> ·{' '}
                      {pass.screening.location}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
                      <Avatar member={pass.holder} size="xs" />
                      {pass.holder.isMe ? 'You' : pass.holder.name}
                      {pass.of > 1 && <span className="text-ink-3">· {pass.index + 1} of {pass.of}</span>}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOverlayIndex(position)}
                    aria-label={`Show QR code for ${pass.screening.act}`}
                    className={`shrink-0 overflow-hidden rounded bg-white ring-1 ring-line ${
                      first ? 'mx-auto w-full max-w-[16rem] p-3' : 'h-16 w-16 p-1'
                    }`}
                  >
                    {first ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private, uncached image
                      <img src={`/api/tickets/${pass.ticketId}/qr`} alt="" className="aspect-square w-full object-contain" />
                    ) : (
                      <QrCode className="m-auto h-8 w-8 text-[#111]" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {overlayIndex !== null && (
        <QrOverlay tickets={qrTickets} startIndex={overlayIndex} onClose={() => setOverlayIndex(null)} />
      )}
    </>
  );
}
