'use client';

import Link from 'next/link';
import { MessagesSquare, Ticket, TicketX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { formatDate, formatTime, formatTimeRange, hourOfDay, screeningEnd } from '@/lib/dates';
import { type AgendaDay, holdersOf, screeningHref } from '@/lib/agenda';
import { Avatar, crewBg, crewBorder } from '@/components/ui/Avatar';
import type { RowMarks } from './AgendaList';

const ROW_PX = 48;
// Wide enough that a typical film's block holds two lines of its title; the strip scrolls sideways
const HOUR_PX = 64;

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
 * shared hour axis. Shared screenings line up across lanes; overlapping ones are outlined. All
 * days scroll sideways together, so the same time sits at the same x all festival long.
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const all = days.flatMap((day) => day.screenings);
  const starts = all.map((s) => axisHour(new Date(s.startsAt)));
  const firstHour = Math.floor(Math.min(...starts));
  const lastHour = Math.ceil(Math.max(...all.map((s, i) => starts[i] + lengthHours(s))));
  const span = Math.max(lastHour - firstHour, 1);
  const pct = (hours: number) => `${(hours / span) * 100}%`;
  const ticks = Array.from({ length: span + 1 }, (_, i) => firstHour + i);
  const nowHour = axisHour(marks.now);

  // Open on what's relevant: now on a festival day, else the next day's first screening
  const today = days.find((day) => day.key === marks.todayKey);
  const nextDay = today ?? days.find((day) => day.key > marks.todayKey);
  const scrollHour =
    today && nowHour > firstHour && nowHour < lastHour
      ? nowHour - 1
      : nextDay
        ? Math.min(...nextDay.screenings.map((s) => axisHour(new Date(s.startsAt)))) - 0.5
        : firstHour;

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(scrollHour - firstHour, 0) * HOUR_PX;
    // Only on first render: later re-renders shouldn't yank the strip back
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scrollRef} className="-mx-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
      <div className="space-y-6 pr-4" style={{ width: `max(100%, ${span * HOUR_PX + 56}px)` }}>
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
              {/* Pinned to the left edge so the day stays named while the strip scrolls */}
              <div className="sticky left-0 mb-1 flex w-fit items-baseline gap-2 pl-4">
                <h2 className={`font-display text-base ${dayPast ? 'text-ink-3' : ''}`}>{formatDate(day.date)}</h2>
                {isToday && (
                  <span className="rounded-full bg-spark px-2 py-0.5 text-xs font-bold uppercase text-[#111]">Today</span>
                )}
                <span className="text-xs tabular-nums text-ink-3">
                  {day.screenings.length} {day.screenings.length === 1 ? 'screening' : 'screenings'}
                </span>
              </div>

              <div className="flex pb-1">
                <div className="sticky left-0 z-10 w-10 shrink-0 bg-paper pl-4 pt-4">
                  {lanes.map(({ person, count }) => (
                    <div key={person.email} className="flex items-start pt-3" style={{ height: count * ROW_PX }}>
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
                        const availability = !past ? screening.availability : undefined;
                        // The title comes first: short blocks drop the icons (still in the aria-label)
                        // and padding so their few pixels go to the name
                        const blockPx = lengthHours(screening) * HOUR_PX;
                        const showIcons = blockPx >= 96;
                        return (
                          <Link
                            key={screening.id}
                            href={screeningHref(screening)}
                            aria-label={`${formatTimeRange(start, screening.endsAt)} ${screening.act}, ${screening.location}${screening.hasQa ? ', Q&A' : ''}${availability ? (availability === 'sold-out' ? ', sold out' : ', few left') : ''}`}
                            className={`absolute flex h-11 items-center gap-1 overflow-hidden rounded text-xs leading-tight ${blockPx < 48 ? 'px-1' : 'px-1.5'}
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
                            <span className="line-clamp-2 min-w-0 flex-1 break-words font-semibold" title={screening.act}>
                              {screening.act}
                            </span>
                            {showIcons && screening.hasQa && (
                              <MessagesSquare className="h-3.5 w-3.5 shrink-0" aria-hidden>
                                <title>Q&amp;A after the film</title>
                              </MessagesSquare>
                            )}
                            {showIcons &&
                              availability &&
                              (availability === 'sold-out' ? (
                                <TicketX className="h-3.5 w-3.5 shrink-0" aria-hidden>
                                  <title>Sold out</title>
                                </TicketX>
                              ) : (
                                <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden>
                                  <title>Few left</title>
                                </Ticket>
                              ))}
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
            </section>
          );
        })}
      </div>
    </div>
  );
}
