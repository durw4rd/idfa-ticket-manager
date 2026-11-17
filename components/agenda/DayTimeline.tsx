'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { formatDate, formatTime, formatTimeRange, hourOfDay, screeningEnd } from '@/lib/dates';
import { type AgendaDay, holdersOf, screeningHref } from '@/lib/agenda';
import { Avatar, crewBg, crewBorder } from '@/components/ui/Avatar';
import AvailabilityMark from '@/components/AvailabilityMark';
import QaMark from '@/components/QaMark';
import type { RowMarks } from './AgendaList';

const ROW_PX = 36;

/** How long a screening's block is: to the end time from the IDFA site, else a typical length */
function lengthHours(screening: AgendaScreening): number {
  const start = new Date(screening.startsAt);
  return (screeningEnd(start, screening.endsAt).getTime() - start.getTime()) / 3600000;
}

/**
 * A person's screenings for one day, each on the first row where it doesn't overlap the one
 * before, so clashing screenings sit on separate rows instead of covering each other.
 */
function layoutLane(screenings: AgendaScreening[]): { rows: Map<string, number>; count: number } {
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const screening of [...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const start = new Date(screening.startsAt).getTime();
    let row = rowEnds.findIndex((end) => end <= start);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = screeningEnd(new Date(start), screening.endsAt).getTime();
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

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  // One hour axis for every day, so the same time sits at the same x all festival long
  const all = days.flatMap((day) => day.screenings);
  const starts = all.map((s) => axisHour(new Date(s.startsAt)));
  const firstHour = Math.floor(Math.min(...starts));
  const lastHour = Math.ceil(Math.max(...all.map((s, i) => starts[i] + lengthHours(s))));
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
                        <Link
                          key={screening.id}
                          href={screeningHref(screening)}
                          aria-label={`${formatTimeRange(start, screening.endsAt)} ${screening.act}, ${screening.location}`}
                          className={`absolute h-8 overflow-hidden rounded
                              ${
                                past
                                  ? `border-l-4 bg-surface text-ink-2 ring-1 ring-inset ring-line ${crewBorder(person.color)}`
                                  : `text-on-crew ${crewBg(person.color)}`
                              }
                              ${clash ? 'ring-2 ring-danger ring-offset-1 ring-offset-paper' : ''}`}
                          style={{
                            top: (rows.get(screening.id) || 0) * ROW_PX + 2,
                            left: pct(axisHour(start) - firstHour),
                            width: `calc(${pct(lengthHours(screening))} - 2px)`,
                          }}
                        >
                          {/* No text: blocks are often too narrow even for a time; the line under the day names them */}
                        </Link>
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
            {/* What's on, in order: the blocks show when, this says what */}
            <ul className="mt-1.5 flex flex-wrap gap-x-3 pl-[1.875rem] text-xs" aria-label={`Screenings on ${formatDate(day.date)}`}>
              {day.screenings.map((screening) => {
                const start = new Date(screening.startsAt);
                return (
                  <li key={screening.id} className="min-w-0 max-w-full">
                    <Link
                      href={screeningHref(screening)}
                      className={`flex items-baseline gap-1 py-1.5 hover:underline ${start < marks.now ? 'text-ink-3' : 'text-ink-2'}`}
                    >
                      <span className="font-semibold tabular-nums text-ink">{formatTime(start)}</span>
                      <span className="min-w-0 truncate">{screening.act}</span>
                      {screening.hasQa && <QaMark />}
                      {start > marks.now && screening.availability && <AvailabilityMark availability={screening.availability} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
