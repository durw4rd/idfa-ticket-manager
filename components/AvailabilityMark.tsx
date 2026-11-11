import { Ticket, TicketX } from 'lucide-react';
import type { TicketAvailability } from '@/lib/types';

/** "Sold out" / "Few left" from the IDFA site, styled like the agenda's Clash marker */
export default function AvailabilityMark({
  availability,
  className = '',
}: {
  availability: TicketAvailability;
  className?: string;
}) {
  const soldOut = availability === 'sold-out';
  const Icon = soldOut ? TicketX : Ticket;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${soldOut ? 'text-danger' : 'text-ink-2'} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {soldOut ? 'Sold out' : 'Few left'}
    </span>
  );
}
