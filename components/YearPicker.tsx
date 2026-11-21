'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { FestivalYear } from '@/lib/types';
import { Sheet, SheetOption } from '@/components/ui/Sheet';

/**
 * "IDFA 2026" in the page header, which opens a sheet of every festival year the crew has tickets
 * for. It lives in the header because the year decides everything below it, and a sheet keeps room
 * for any number of past editions. Plain text when there's only one year.
 */
export default function YearPicker({
  years,
  selectedYear,
  basePath,
  variant,
}: {
  years: FestivalYear[];
  selectedYear: number;
  basePath: '/screenings' | '/films';
  /** 'title' for the header's title line, 'eyebrow' for the small label above it */
  variant: 'title' | 'eyebrow';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const label = `IDFA ${selectedYear}`;

  if (years.length < 2) {
    return <>{label}</>;
  }

  const pick = (year: number) => {
    setOpen(false);
    if (year !== selectedYear) router.push(`${basePath}?year=${year}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Festival year: ${selectedYear}. Change year`}
        // -mx-1 px-1: room for the focus ring without shifting the text off the header's edge
        className={`hit-44 -mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 text-left hover:text-ink-2 ${
          variant === 'eyebrow' ? 'leading-none' : ''
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`shrink-0 text-ink-3 ${variant === 'eyebrow' ? 'h-3 w-3' : 'h-4 w-4'}`}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Festival year">
        <div className="space-y-1">
          {years.map(({ year, tickets }) => (
            <SheetOption key={year} onClick={() => pick(year)} selected={year === selectedYear}>
              <span className="flex items-baseline justify-between gap-3 pr-2">
                <span className="tabular-nums">{year}</span>
                <span className="text-sm font-normal tabular-nums text-ink-3">
                  {tickets === 0 ? 'No tickets yet' : `${tickets} ${tickets === 1 ? 'ticket' : 'tickets'}`}
                </span>
              </span>
            </SheetOption>
          ))}
        </div>
      </Sheet>
    </>
  );
}
