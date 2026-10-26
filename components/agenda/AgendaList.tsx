import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { formatDayHeading, formatTime } from '@/lib/dates';
import { type AgendaDay, holdersOf, isTogether, screeningHref } from '@/lib/agenda';
import { AvatarStack } from '@/components/ui/Avatar';

export interface RowMarks {
  nextId: string | null;
  clashes: Map<string, string[]>;
  todayKey: string;
  now: Date;
}

/** Day sections of screening rows: time | title, venue, who's going */
export default function AgendaList({
  days,
  marks,
  lookup,
}: {
  days: AgendaDay[];
  marks: RowMarks;
  lookup: (email: string) => CrewMember;
}) {
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`}>
          <h2
            id={`day-${day.key}`}
            className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 flex items-center gap-2 border-b border-line bg-paper/90 px-4 py-2 backdrop-blur-md"
          >
            <span className="label text-ink-2">{formatDayHeading(day.date)}</span>
            {day.key === marks.todayKey && (
              <span className="rounded-full bg-spark px-2 py-0.5 text-xs font-bold uppercase text-[#111]">Today</span>
            )}
          </h2>
          <ul>
            {day.screenings.map((screening) => (
              <ScreeningRow key={screening.id} screening={screening} marks={marks} lookup={lookup} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ScreeningRow({
  screening,
  marks,
  lookup,
}: {
  screening: AgendaScreening;
  marks: RowMarks;
  lookup: (email: string) => CrewMember;
}) {
  const startsAt = new Date(screening.startsAt);
  const past = startsAt < marks.now;
  const next = screening.id === marks.nextId;
  const clash = marks.clashes.get(screening.id);
  const holders = holdersOf(screening).map(lookup);

  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={screeningHref(screening)}
        className="relative -mx-4 grid grid-cols-[3.75rem_1fr] gap-x-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.03] active:bg-ink/5"
      >
        {next && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-spark" aria-label="Next" />}
        <span
          className={`pt-0.5 text-base font-semibold tabular-nums ${past ? 'text-ink-3' : 'text-ink'}`}
        >
          {formatTime(startsAt)}
        </span>
        <span className="min-w-0">
          <span className={`block font-display text-lg leading-tight ${past ? 'text-ink-3' : ''}`}>
            {screening.act}
          </span>
          <span className="mt-1 flex items-center gap-2 text-sm text-ink-2">
            <span className={`truncate ${past ? 'text-ink-3' : ''}`}>{screening.location}</span>
            {clash && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                Clash
              </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {isTogether(screening) && <span className="text-xs font-semibold text-ink-2">Together</span>}
              <AvatarStack members={holders} size="xs" />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
