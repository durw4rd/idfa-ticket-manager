'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { COUNTRIES, MAX_PLACE_NAME_LENGTH } from '@/lib/countries';
import { readApiResponse } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Field, inputClasses, Notice } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';

/**
 * The sheet for setting where a film is set. Loaded only when it's opened (see FilmPlaceEditor):
 * the country list is the bulk of it, and the screening page is opened at the door.
 */
export default function FilmPlaceSheet({
  act,
  festivalYear,
  initial,
  onClose,
  onSaved,
}: {
  act: string;
  festivalYear: number;
  initial: { name: string | null; country: string } | null;
  onClose: () => void;
  onSaved: (note: string | null) => void;
}) {
  const [country, setCountry] = useState(initial?.country ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (body: { country: string | null; placeName?: string }) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/films/place', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ act, festivalYear, ...body }),
      });
      const data = await readApiResponse<{ approximate?: boolean; countryName?: string }>(
        response,
        'Could not save the place'
      );
      onSaved(
        data.approximate
          ? `Couldn't find “${body.placeName}” on the map, so its pin is in the middle of ${data.countryName}.`
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the place');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={() => !saving && onClose()} title="Where is it set?">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (country) save({ country, placeName: name.trim() || undefined });
        }}
      >
        <p className="text-sm text-ink-2">
          The main place <span className="font-display">{act}</span> takes place, for the crew&apos;s map.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Country</span>
          {/* Native, so phones show their own picker */}
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            required
            className={inputClasses}
          >
            <option value="" disabled>
              Pick a country
            </option>
            {COUNTRIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Town, village or region"
          hint="Optional. Leave it empty to pin the country as a whole."
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_PLACE_NAME_LENGTH}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="e.g. Kabul"
        />
        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            type="submit"
            disabled={saving || !country}
            icon={saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : undefined}
          >
            Save
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => save({ country: null })}>
            No single place
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
