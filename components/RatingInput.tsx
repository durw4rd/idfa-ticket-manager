'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { handleRadioKeys } from '@/lib/radio-keys';
import { Notice } from '@/components/ui/Field';

const MAX_COMMENT_LENGTH = 500;
const SCALE = Array.from({ length: 10 }, (_, i) => i + 1);

/**
 * Your score (1–10) and comment for a film. One Save for both; the page refreshes so the crew's
 * ratings and averages update. Before the screening it stays folded behind "Rate early".
 */
export default function RatingInput({
  act,
  festivalYear,
  initialRating,
  initialComment,
  started = true,
  compact = false,
}: {
  act: string;
  festivalYear: number;
  initialRating: number | null;
  initialComment: string | null;
  started?: boolean;
  compact?: boolean; // In lists: the comment and Save appear once a score is picked
}) {
  const router = useRouter();
  const [open, setOpen] = useState(started || initialRating !== null);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [comment, setComment] = useState(initialComment || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = rating !== initialRating || comment.trim() !== (initialComment || '');

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Rate early
      </Button>
    );
  }

  const send = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/ratings', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method === 'POST' ? { act, festivalYear, rating, comment: comment.trim() || null } : { act, festivalYear },
        ),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not save your rating');
      }
      if (method === 'DELETE') {
        setRating(null);
        setComment('');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating) send('POST');
      }}
    >
      <div role="radiogroup" aria-label={`Your score for ${act}, 1 to 10`} className="flex gap-1">
        {SCALE.map((value) => {
          const filled = rating !== null && value <= rating;
          const chosen = value === rating;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={`${value}`}
              disabled={busy}
              // One Tab stop for the scale: the chosen score, or 1 when unrated
              tabIndex={chosen || (rating === null && value === 1) ? 0 : -1}
              onClick={() => setRating(value)}
              onKeyDown={(event) => handleRadioKeys(event, value - 1, SCALE.length, (next) => setRating(SCALE[next]))}
              className={`h-11 min-w-0 flex-1 rounded text-sm font-bold tabular-nums transition-colors
                ${chosen ? 'bg-spark text-[#111]' : filled ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-2 hover:bg-ink/10'}`}
            >
              {value}
            </button>
          );
        })}
      </div>

      {(!compact || rating !== null) && (
        <>
          <label className="block">
            <span className="sr-only">Comment</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
              rows={2}
              disabled={busy}
              placeholder="One line about it (optional)"
              className="w-full resize-none rounded border border-line-strong bg-surface px-3 py-2.5 text-base italic text-ink
            placeholder:not-italic placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
          </label>

          {error && <Notice>{error}</Notice>}

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!rating || !dirty || busy}
              icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {initialRating ? 'Save changes' : 'Save rating'}
            </Button>
            {initialRating !== null && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => send('DELETE')} className="text-ink-2">
                Remove
              </Button>
            )}
            {comment.length > MAX_COMMENT_LENGTH - 50 && (
              <span className="ml-auto text-xs tabular-nums text-ink-3">
                {comment.length}/{MAX_COMMENT_LENGTH}
              </span>
            )}
          </div>
        </>
      )}
    </form>
  );
}
