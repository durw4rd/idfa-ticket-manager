'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Loader2, MoreHorizontal, Pencil, QrCode, Trash2 } from 'lucide-react';
import type { CrewMember, ExtractedTicketFields } from '@/lib/types';
import { makeCrewLookup, screeningHref, screeningKey } from '@/lib/agenda';
import { readApiResponse } from '@/lib/api-client';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Field';
import { Sheet, SheetOption } from '@/components/ui/Sheet';
import TicketFieldsForm from '@/components/TicketFieldsForm';
import QrOverlay, { type QrTicket } from '@/components/tickets/QrOverlay';
import { QrImage } from '@/components/tickets/QrImage';

export interface ScreeningTicket {
  id: string;
  ownerEmail: string;
  holderEmail: string;
  fields: ExtractedTicketFields;
}

type Panel =
  | { kind: 'holder'; ticket: ScreeningTicket }
  | { kind: 'menu'; ticket: ScreeningTicket }
  | { kind: 'edit'; ticket: ScreeningTicket; draft: ExtractedTicketFields; applyToAll: boolean }
  | { kind: 'delete'; ticket: ScreeningTicket };

/**
 * The tickets for one screening: who holds each, the QR codes, and the actions you're allowed:
 * pass a ticket on (its owner or holder), fix details or delete it (its owner).
 */
export default function ScreeningTickets({
  tickets,
  crew,
  meEmail,
  title,
  meta,
}: {
  tickets: ScreeningTicket[];
  crew: CrewMember[];
  meEmail: string;
  title: string;
  meta: string;
}) {
  const router = useRouter();
  const lookup = makeCrewLookup(crew);
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Your own tickets first, so "Show ticket" opens on yours
  const ordered = [...tickets].sort(
    (a, b) => Number(b.holderEmail === meEmail) - Number(a.holderEmail === meEmail)
  );
  const qrTickets: QrTicket[] = ordered.map((ticket, index) => ({
    id: ticket.id,
    title,
    meta,
    holder: lookup(ticket.holderEmail).name,
    label: ordered.length > 1 ? `${index + 1} of ${ordered.length}` : undefined,
  }));
  const mineCount = ordered.filter((ticket) => ticket.holderEmail === meEmail).length;

  const close = () => {
    setPanel(null);
    setError(null);
  };

  const run = async (request: () => Promise<Response>, after: (data: any) => void) => {
    setBusy(true);
    setError(null);
    try {
      after(await readApiResponse(await request(), 'Something went wrong'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const setHolder = (ticket: ScreeningTicket, holderEmail: string) =>
    run(
      () =>
        fetch(`/api/tickets/${ticket.id}/holder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holderEmail }),
        }),
      () => {
        close();
        router.refresh();
      }
    );

  // Your other tickets for this showing: a misread title or time is usually the same on all of them
  const othersOwned = (ticket: ScreeningTicket) =>
    tickets.filter((other) => other.id !== ticket.id && other.ownerEmail === meEmail);

  const saveFields = async (ticket: ScreeningTicket, fields: ExtractedTicketFields, applyToAll: boolean) => {
    const ids = [ticket.id, ...(applyToAll ? othersOwned(ticket).map((other) => other.id) : [])];
    setBusy(true);
    setError(null);
    try {
      let saved: ExtractedTicketFields | null = null;
      for (const id of ids) {
        const response = await fetch(`/api/tickets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        });
        const data = await readApiResponse<{ ticket: ExtractedTicketFields }>(response, 'Could not save the details');
        saved ??= data.ticket;
      }
      // The screening's address is made of its details, so open it at its new one
      router.push(screeningHref({ id: screeningKey(saved!.act, saved!.date, saved!.start) }));
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the details';
      // Some may have been saved before one failed; the agenda shows where each one ended up
      setError(ids.length > 1 ? `${message}. Some tickets may already have the new details.` : message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (ticket: ScreeningTicket) =>
    run(
      () => fetch(`/api/tickets/${ticket.id}`, { method: 'DELETE' }),
      () => {
        router.push(`/screenings?year=${ticket.fields.date.split('-')[2]}`);
        router.refresh();
      }
    );

  return (
    <>
      <Button
        variant="spark"
        className="w-full"
        icon={<QrCode className="h-5 w-5" />}
        onClick={() => setOverlayIndex(0)}
      >
        {mineCount > 0
          ? `Show my ticket${mineCount > 1 ? 's' : ''}`
          : `Show ticket${tickets.length > 1 ? 's' : ''}`}
      </Button>

      <ul className="mt-3 divide-y divide-line rounded border border-line bg-surface">
        {ordered.map((ticket, index) => {
          const holder = lookup(ticket.holderEmail);
          const isOwner = ticket.ownerEmail === meEmail;
          const canPassOn = isOwner || ticket.holderEmail === meEmail;
          return (
            <li key={ticket.id} className="flex items-center gap-3 p-3">
              <button
                type="button"
                onClick={() => setOverlayIndex(index)}
                aria-label={`Show QR code for ${holder.name}'s ticket`}
                className="h-14 w-14 shrink-0 overflow-hidden rounded bg-white p-1 ring-1 ring-line"
              >
                <QrImage ticketId={ticket.id} alt="" compact className="h-full w-full object-contain" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  <Avatar member={holder} size="xs" />
                  <span className="truncate">{holder.isMe ? 'You' : holder.name}</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {tickets.length > 1 ? `Ticket ${index + 1} of ${tickets.length}` : 'Ticket'}
                  {!isOwner && ` · from ${lookup(ticket.ownerEmail).name}`}
                </p>
                {canPassOn && (crew.length > 1 || ticket.holderEmail !== meEmail) && (
                  <button
                    type="button"
                    onClick={() => setPanel({ kind: 'holder', ticket })}
                    className="hit-44 -ml-1 mt-1 inline-flex h-8 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Hand over
                  </button>
                )}
              </div>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="More ticket actions"
                  icon={<MoreHorizontal className="h-5 w-5" />}
                  onClick={() => setPanel({ kind: 'menu', ticket })}
                />
              )}
            </li>
          );
        })}
      </ul>

      {overlayIndex !== null && (
        <QrOverlay tickets={qrTickets} startIndex={overlayIndex} onClose={() => setOverlayIndex(null)} />
      )}

      <Sheet open={panel?.kind === 'holder'} onClose={close} title="Who's using this ticket?">
        {panel?.kind === 'holder' && (
          <div className="space-y-1">
            {crew.map((member) => (
              <SheetOption
                key={member.email}
                selected={member.email === panel.ticket.holderEmail}
                disabled={busy}
                icon={<Avatar member={member} size="md" />}
                onClick={() => setHolder(panel.ticket, member.email)}
              >
                {member.isMe ? `${member.name} (you)` : member.name}
              </SheetOption>
            ))}
            {error && <Notice>{error}</Notice>}
          </div>
        )}
      </Sheet>

      <Sheet open={panel?.kind === 'menu'} onClose={close} title="Ticket">
        {panel?.kind === 'menu' && (
          <div className="space-y-1">
            <SheetOption
              icon={<Pencil className="h-5 w-5 text-ink-2" />}
              onClick={() =>
                setPanel({ kind: 'edit', ticket: panel.ticket, draft: panel.ticket.fields, applyToAll: true })
              }
            >
              Fix details
            </SheetOption>
            <SheetOption
              tone="danger"
              icon={<Trash2 className="h-5 w-5" />}
              onClick={() => setPanel({ kind: 'delete', ticket: panel.ticket })}
            >
              Delete ticket
            </SheetOption>
          </div>
        )}
      </Sheet>

      <Sheet open={panel?.kind === 'edit'} onClose={close} title="Fix details">
        {panel?.kind === 'edit' && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveFields(panel.ticket, panel.draft, panel.applyToAll);
            }}
          >
            <TicketFieldsForm
              value={panel.draft}
              disabled={busy}
              onChange={(draft) => setPanel({ ...panel, draft })}
            />
            {othersOwned(panel.ticket).length > 0 && (
              <label className="flex items-center gap-3 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={panel.applyToAll}
                  disabled={busy}
                  onChange={(event) => setPanel({ ...panel, applyToAll: event.target.checked })}
                  className="h-5 w-5 accent-ink"
                />
                Also fix my other {othersOwned(panel.ticket).length === 1 ? 'ticket' : `${othersOwned(panel.ticket).length} tickets`} for
                this showing
              </label>
            )}
            {error && <Notice>{error}</Notice>}
            <Button type="submit" className="w-full" disabled={busy} icon={busy ? <Loader2 className="h-5 w-5 animate-spin" /> : undefined}>
              Save
            </Button>
          </form>
        )}
      </Sheet>

      <Sheet open={panel?.kind === 'delete'} onClose={close} title="Delete this ticket?">
        {panel?.kind === 'delete' && (
          <div className="space-y-4">
            <p className="text-ink-2">
              The ticket and its QR code are removed for everyone in your crew. This can&apos;t be undone.
            </p>
            {error && <Notice>{error}</Notice>}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close} disabled={busy}>
                Keep it
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => remove(panel.ticket)}
                disabled={busy}
                icon={busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
