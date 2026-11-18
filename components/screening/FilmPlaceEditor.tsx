'use client';

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Loader2, MapPin } from 'lucide-react';

// The picker carries the whole country list; load it on the first tap, not with the page
const FilmPlaceSheet = dynamic(() => import('./FilmPlaceSheet'), { ssr: false });

/**
 * Where the film is set, under the venue on the screening page, with a sheet to change it. The
 * AI's pick is a guess; a place set here is kept, and the whole crew's map follows it.
 */
export default function FilmPlaceEditor({
  act,
  festivalYear,
  place,
  noPlace,
}: {
  act: string;
  festivalYear: number;
  place: { name: string | null; country: string; countryName: string } | null;
  noPlace: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();

  const where = place ? [place.name, place.countryName].filter(Boolean).join(', ') : null;

  return (
    <>
      <p className="mt-1 flex items-center gap-2 text-ink-2">
        <MapPin className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0">
          {where ? (
            <>
              Set in <span className="text-ink">{where}</span>
            </>
          ) : noPlace ? (
            'No single place'
          ) : (
            'Where is it set?'
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={refreshing}
          className="hit-44 ml-1 inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink underline-offset-4 hover:underline disabled:opacity-50"
          aria-label={where ? `Change where ${act} is set` : `Set where ${act} is set`}
        >
          {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {where ? 'Edit' : 'Set'}
        </button>
      </p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}

      {open && (
        <FilmPlaceSheet
          act={act}
          festivalYear={festivalYear}
          initial={place ? { name: place.name, country: place.country } : null}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            setNote(saved);
            setOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </>
  );
}
