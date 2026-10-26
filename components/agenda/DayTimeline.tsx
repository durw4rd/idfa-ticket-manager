'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { DEFAULT_SCREENING_MINUTES, formatDate, formatTime, hourOfDay } from '@/lib/dates';
import { type AgendaDay, holdersOf, screeningHref } from '@/lib/agenda';
import { Avatar, crewBg } from '@/components/ui/Avatar';
import type { RowMarks } from './AgendaList';

const LENGTH_HOURS = DEFAULT_SCREENING_MINUTES / 60;
const ROW_PX = 36;

/**
 * A person's screenings for one day, each on the first row where it doesn't overlap the one
 * before, so clashing screenings sit on separate rows instead of covering each other.
 */
function layoutLane(screenings: AgendaScreening[]): { rows: Map<string, number>; count: number } {
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  const length = LENGTH_HOURS * 3600000;
  for (const screening of [...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const start = new Date(screening.startsAt).getTime();
    let row = rowEnds.findIndex((end) => end <= start);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = start + length;
    rows.set(screening.id, row);
  }
  return { rows, count: Math.max(rowEnds.length, 1) };
}

// Hour on the festival-day axis: a 00:30 show sits after 23:00, not before 10:00
function axisHour(date: Date): number {
  const hour = hourOfDay(date);
  return hour < 5 ? hour + 24 : hour;
}

/**
 * The festival at a glance: one strip per day, one lane per person, a block per screening on a
 * shared hour axis. Shared screenings line up across lanes; overlapping ones are outlined.
 */
export default function DayTimeline({
  days,
  people,
  marks,
}: {
  days: AgendaDay[];
  people: CrewMember[];
  marks: RowMarks;
}) {
  const todayRef = useRef<HTMLElement>(null);
  // Blocks are too narrow for titles, so a tap shows a caption under the day instead of navigating
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  // One hour axis for every day, so the same time sits at the same x all festival long
  const starts = days.flatMap((day) => day.screenings.map((s) => axisHour(new Date(s.startsAt))));
  const firstHour = Math.floor(Math.min(...starts));
  const lastHour = Math.ceil(Math.max(...starts) + LENGTH_HOURS);
  const span = Math.max(lastHour - firstHour, 1);
  const pct = (hours: number) => `${(hours / span) * 100}%`;
  const ticks = Array.from({ length: span + 1 }, (_, i) => firstHour + i).filter((hour) => hour % 2 === 0);
  const nowHour = axisHour(marks.now);

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const isToday = day.key === marks.todayKey;
        const dayPast = day.key < marks.todayKey;
        // Lanes only for people with something that day, so quiet days stay short
        const lanes = people
          .map((person) => {
            const own = day.screenings.filter((screening) => holdersOf(screening).includes(person.email));
            return { person, own, ...layoutLane(own) };
          })
          .filter((lane) => lane.own.length > 0);

        return (
          <section key={day.key} ref={isToday ? todayRef : undefined} aria-label={formatDate(day.date)}>
            <div className="mb-1 flex items-baseline gap-2">
              <h2 className={`font-display text-base ${dayPast ? 'text-ink-3' : ''}`}>{formatDate(day.date)}</h2>
              {isToday && (
                <span className="rounded-full bg-spark px-2 py-0.5 text-xs font-bold uppercase text-[#111]">Today</span>
              )}
              <span className="ml-auto text-xs tabular-nums text-ink-3">
                {day.screenings.length} {day.screenings.length === 1 ? 'screening' : 'screenings'}
              </span>
            </div>

            <div className="flex gap-1.5">
              <div className="w-6 shrink-0 pt-4">
                {lanes.map(({ person, count }) => (
                  <div key={person.email} className="flex items-start pt-2" style={{ height: count * ROW_PX }}>
                    <Avatar member={person} size="xs" />
                  </div>
                ))}
              </div>

              <div className="relative min-w-0 flex-1">
                {/* Hour labels and grid lines */}
                <div className="relative h-4 text-[10px] tabular-nums text-ink-3" aria-hidden>
                  {ticks.map((hour) => (
                    <span key={hour} className="absolute -translate-x-1/2" style={{ left: pct(hour - firstHour) }}>
                      {String(hour % 24).padStart(2, '0')}
                    </span>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 top-4" aria-hidden>
                  {ticks.map((hour) => (
                    <span
                      key={hour}
                      className="absolute inset-y-0 w-px bg-line"
                      style={{ left: pct(hour - firstHour) }}
                    />
                  ))}
                </div>

                {lanes.map(({ person, own, rows, count }) => (
                  <div key={person.email} className="relative" style={{ height: count * ROW_PX }}>
                    <div className="absolute inset-x-0 inset-y-0.5 rounded bg-ink/[0.04]" />
                    {own.map((screening) => {
                      const start = new Date(screening.startsAt);
                      const clash = marks.clashes.get(screening.id)?.includes(person.email);
                      const past = start < marks.now;
                      return (
                        <button
                          type="button"
                          key={screening.id}
                          onClick={() => setSelectedId(selectedId === screening.id ? null : screening.id)}
                          aria-pressed={selectedId === screening.id}
                          aria-label={`${formatTime(start)} ${screening.act}, ${screening.location}`}
                          className={`absolute h-8 overflow-hidden rounded px-1.5 text-left text-[11px] font-semibold leading-8 text-on-crew
                              ${crewBg(person.color)} ${past ? 'opacity-50' : ''}
                              ${clash ? 'ring-2 ring-danger ring-offset-1 ring-offset-paper' : ''}
                              ${selectedId === screening.id ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`}
                          style={{
                            top: (rows.get(screening.id) || 0) * ROW_PX + 2,
                            left: pct(axisHour(start) - firstHour),
                            width: `calc(${pct(LENGTH_HOURS)} - 2px)`,
                          }}
                        >
                          <span className="block truncate [font-stretch:75%]">{screening.act}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}

                {isToday && nowHour > firstHour && nowHour < lastHour && (
                  <span
                    className="pointer-events-none absolute bottom-0 top-3 w-0.5 -translate-x-1/2 rounded-full bg-spark"
                    style={{ left: pct(nowHour - firstHour) }}
                    aria-label={`Now, ${formatTime(marks.now)}`}
                  />
                )}
              </div>
            </div>
            {(() => {
              const selected = day.screenings.find((screening) => screening.id === selectedId);
              if (!selected) return null;
              const start = new Date(selected.startsAt);
              return (
                <Link
                  href={screeningHref(selected)}
                  className="mt-2 flex items-center gap-3 rounded border border-line bg-surface px-3 py-2.5"
                >
                  <span className="text-sm font-semibold tabular-nums">{formatTime(start)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base leading-tight">{selected.act}</span>
                    <span className="block truncate text-xs text-ink-2">{selected.location}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                </Link>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
}
