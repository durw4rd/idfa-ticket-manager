'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { handleRadioKeys } from '@/lib/radio-keys';
import { readApiResponse } from '@/lib/api-client';
import { notifyTodoChanged } from '@/lib/todo-events';
import { Notice } from '@/components/ui/Field';
import { AutoTextarea } from '@/components/ui/AutoTextarea';
import { RatingRow } from '@/components/CrewRatings';
import { MAX_COMMENT_LENGTH } from '@/lib/films';

const SCALE = Array.from({ length: 10 }, (_, i) => i + 1);

/**
 * Your score (1–10) and comment for a film. One Save for both; the page refreshes so the crew's
 * ratings and averages update. Before the screening it stays folded behind "Rate early".
 * With `me`, a saved rating reads like the crew's (avatar, score, comment) with Edit to reopen
 * the form.
 */
export default function RatingInput({
  act,
  festivalYear,
  initialRating,
  initialComment,
  started = true,
  compact = false,
  me,
}: {
  act: string;
  festivalYear: number;
  initialRating: number | null;
  initialComment: string | null;
  started?: boolean;
  compact?: boolean; // In lists: the comment and Save appear once a score is picked
  me?: CrewMember; // Show a saved rating as a row in the crew's list instead of the filled-in form
}) {
  const router = useRouter();
  const [open, setOpen] = useState(started || initialRating !== null);
  // What's stored. Kept here rather than read from the props, which only catch up after the refresh.
  const [saved, setSaved] = useState(
    initialRating === null ? null : { rating: initialRating, comment: initialComment || '' },
  );
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [comment, setComment] = useState(initialComment || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Swapping the saved row for the form (and back) removes the control that had focus. Put it on
  // the matching control on the other side, so keyboard and screen-reader users keep their place.
  const rowRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const target = rowRef.current
      ? rowRef.current.querySelector<HTMLElement>('button')
      : formRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
    target?.focus();
  });

  const dirty = rating !== (saved?.rating ?? null) || comment.trim() !== (saved?.comment ?? '');

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
      await readApiResponse(response, 'Could not save your rating');
      if (method === 'DELETE') {
        setSaved(null);
        setRating(null);
        setComment('');
      } else if (rating !== null) {
        setSaved({ rating, comment: comment.trim() });
        setComment(comment.trim());
      }
      // Save turns the form into the row, Remove empties the form: both drop the focused button
      moveFocus.current = !!me || method === 'DELETE';
      setEditing(false);
      router.refresh();
      notifyTodoChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating');
    } finally {
      setBusy(false);
    }
  };

  if (me && saved && !editing) {
    return (
      <div ref={rowRef}>
        <RatingRow
          member={me}
          name="You"
          rating={saved.rating}
          comment={saved.comment}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                moveFocus.current = true;
                setEditing(true);
              }}
              icon={<Pencil className="h-3.5 w-3.5" />}
              className="-ml-4 mt-1 text-ink-2"
            >
              Edit
            </Button>
          }
        />
      </div>
    );
  }

  const cancel = () => {
    setRating(saved?.rating ?? null);
    setComment(saved?.comment ?? '');
    setError(null);
    moveFocus.current = true;
    setEditing(false);
  };

  return (
    <form
      ref={formRef}
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
            <AutoTextarea
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
              rows={2}
              disabled={busy}
              placeholder="One line about it (optional)"
              className="block italic placeholder:not-italic"
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
              {saved ? 'Save changes' : 'Save rating'}
            </Button>
            {editing && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={cancel} className="text-ink-2">
                Cancel
              </Button>
            )}
            {saved && (
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
