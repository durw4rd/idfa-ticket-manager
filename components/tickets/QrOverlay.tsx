'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AgendaScreening } from '@/lib/types';
import { useModal } from '@/lib/use-modal';
import { formatDate, formatTime } from '@/lib/dates';

export interface QrTicket {
  id: string;
  title: string; // Film title
  meta: string; // e.g. "Sun 15 Nov · 16:00 · Tuschinski 2"
  holder: string; // Holder's display name
  label?: string; // e.g. "1 of 2" when the screening has several tickets
}

/**
 * Full-screen QR viewer for the cinema door. A fixed white overlay rather than the Fullscreen API,
 * which iPhone Safari doesn't support for elements. Keeps the screen awake while open; swipe or
 * use the arrows to move between tickets.
 */
export default function QrOverlay({
  tickets,
  startIndex = 0,
  onClose,
}: {
  tickets: QrTicket[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const swipeStart = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModal(true, dialogRef, onClose);

  const count = tickets.length;
  const ticket = tickets[index];
  const go = (step: number) => setIndex((current) => (current + step + count) % count);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % count);
      if (event.key === 'ArrowLeft') setIndex((current) => (current - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  // Keep the screen awake while the QR is up. Browsers drop the lock when the page is hidden,
  // so take it again on return; a lock granted after closing is released straight away.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let closed = false;
    const acquire = async () => {
      if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
      try {
        const granted = await navigator.wakeLock.request('screen');
        if (closed) {
          granted.release().catch(() => {});
        } else {
          lock = granted;
        }
      } catch {
        // Not supported or not allowed (e.g. low battery); the QR still works
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      closed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
    };
  }, []);

  if (!ticket || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    // Always white: scanners read dark-on-light best, whatever the colour scheme
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={`QR code for ${ticket.title}`}
      className="fixed inset-0 z-[70] flex flex-col bg-white text-[#111] outline-none animate-[fade_150ms_ease-out]"
      onPointerDown={(event) => {
        swipeStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (swipeStart.current === null || count < 2) return;
        const distance = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(distance) > 50) go(distance < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-start gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1 pt-2">
          <p className="font-display text-lg leading-tight">{ticket.title}</p>
          <p className="mt-1 text-sm text-[#54544f]">{ticket.meta}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, uncached image */}
        <img
          key={ticket.id}
          src={`/api/tickets/${ticket.id}/qr`}
          alt={`QR code, ticket ${index + 1} of ${count}`}
          draggable={false}
          className="aspect-square w-[min(88vw,62vh)] select-none object-contain [image-rendering:pixelated]"
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="text-base font-semibold">
          {ticket.holder}
          {ticket.label && <span className="font-normal text-[#54544f]"> · ticket {ticket.label}</span>}
        </p>
        {count > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-[#54544f]">
              {index + 1}/{count}
            </span>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous ticket"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/15"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next ticket"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/15"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * The tickets to show for a screening: the ones `preferEmail` holds, or all of them if they hold
 * none (e.g. showing a crew-mate's ticket from your phone).
 */
export function qrTicketsFor(
  screening: AgendaScreening,
  nameOf: (email: string) => string,
  preferEmail?: string
): QrTicket[] {
  const mine = screening.tickets.filter((ticket) => ticket.holderEmail === preferEmail);
  const tickets = mine.length > 0 ? mine : screening.tickets;
  const startsAt = new Date(screening.startsAt);
  const meta = `${formatDate(startsAt)} · ${formatTime(startsAt)} · ${screening.location}`;
  return tickets.map((ticket, index) => ({
    id: ticket.id,
    title: screening.act,
    meta,
    holder: nameOf(ticket.holderEmail),
    label: tickets.length > 1 ? `${index + 1} of ${tickets.length}` : undefined,
  }));
}
