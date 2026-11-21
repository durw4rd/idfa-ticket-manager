'use client';

import { useState } from 'react';
import { Lock, RotateCw, WifiOff } from 'lucide-react';

/**
 * A ticket's QR code from /api/tickets/[id]/qr. The route never lets the browser cache it; the
 * offline wallet (public/sw.js) keeps copies of the Tickets page's codes, but any other code can
 * fail with no signal in a cinema foyer: say so and offer another try instead of a broken image.
 * `compact` (thumbnails inside a button) shows only an icon; the full-screen viewer has the Try
 * again button. Always on white, like the QR itself.
 */
export function QrImage({
  ticketId,
  alt,
  className = '',
  compact = false,
}: {
  ticketId: string;
  alt: string;
  className?: string;
  compact?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (compact) {
      return (
        <span className={`flex items-center justify-center text-[#54544f] ${className}`} title="QR code didn't load">
          <WifiOff className="h-5 w-5" aria-hidden />
          <span className="sr-only">QR code didn&apos;t load</span>
        </span>
      );
    }
    return (
      <div role="alert" className={`flex flex-col items-center justify-center gap-3 p-4 text-center text-[#54544f] ${className}`}>
        <WifiOff className="h-8 w-8" aria-hidden />
        <p className="text-sm">Couldn&apos;t load the QR code. Check your connection.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-black/15 px-5 text-sm font-semibold text-[#111]"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  // The query only makes a retry a new request; the route ignores it
  const src = `/api/tickets/${ticketId}/qr${attempt ? `?attempt=${attempt}` : ''}`;

  // An image can't tell no signal from a refusal. Ask once more: a 401 means the session is over
  // (or access was taken away), and /api/access-ended signs out and explains, or opens sign-in.
  const handleError = async () => {
    setFailed(true);
    try {
      if ((await fetch(src)).status === 401) window.location.assign('/api/access-ended');
    } catch {
      // No signal: the message above already says so
    }
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element -- private, uncached image
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={handleError}
      className={className}
    />
  );
}

/**
 * Stands in for a crew-mate's QR code, which only the ticket's holder and owner may see. Takes the
 * QR's place so the layout doesn't move; the caller's className sets its size.
 */
export function QrLocked({ holderName, className = '' }: { holderName: string; className?: string }) {
  const label = `Only ${holderName} can show this ticket`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded bg-surface ring-1 ring-line ${className}`}
    >
      <Lock className="h-5 w-5 text-ink-3" aria-hidden />
    </span>
  );
}
