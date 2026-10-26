'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { DEFAULT_SCREENING_MINUTES, formatDate, formatTime, hourOfDay } from '@/lib/dates';
import { type AgendaDay, holdersOf, screeningHref } from '@/lib/agenda';
import { Avatar, crewBg } from '@/components/ui/Avatar';
import type { RowMarks } from './AgendaList';

const LENGTH_HOURS = DEFAULT_SCREENING_MINUTES / 60;

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
        const lanes = people.filter((person) =>
          day.screenings.some((screening) => holdersOf(screening).includes(person.email))
        );

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
                {lanes.map((person) => (
                  <div key={person.email} className="flex h-9 items-center">
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
                    <span key={hour} className="absolute inset-y-0 w-px bg-line" style={{ left: pct(hour - firstHour) }} />
                  ))}
                </div>

                {lanes.map((person) => (
                  <div key={person.email} className="relative h-9 py-0.5">
                    <div className="absolute inset-x-0 inset-y-0.5 rounded bg-ink/[0.04]" />
                    {day.screenings
                      .filter((screening) => holdersOf(screening).includes(person.email))
                      .map((screening) => {
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
                            className={`absolute inset-y-0.5 overflow-hidden rounded px-1.5 text-left text-[11px] font-semibold leading-8 text-on-crew
                              ${crewBg(person.color)} ${past ? 'opacity-50' : ''}
                              ${clash ? 'ring-2 ring-danger ring-offset-1 ring-offset-paper' : ''}
                              ${selectedId === screening.id ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`}
                            style={{
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
