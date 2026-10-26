'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronUp, GanttChart, List, Plus } from 'lucide-react';
import type { AgendaScreening, CrewMember } from '@/lib/types';
import { dayKey } from '@/lib/dates';
import {
  filterByPerson,
  findClashes,
  groupByDay,
  holdersOf,
  makeCrewLookup,
  type PersonFilter as Filter,
} from '@/lib/agenda';
import { usePersistentState } from '@/lib/use-persistent-state';
import PageHeader from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import AgendaList, { type RowMarks } from './AgendaList';
import DayTimeline from './DayTimeline';
import PersonFilter from './PersonFilter';
import UpNext from './UpNext';
import YearSwitcher from './YearSwitcher';

type View = 'list' | 'timeline';

export default function AgendaView({
  screenings,
  crew,
  year,
  years,
  now: nowIso,
  actions,
}: {
  screenings: AgendaScreening[];
  crew: CrewMember[];
  year: number;
  years: number[];
  now: string; // From the server, so TEST_DATE applies here too
  actions?: React.ReactNode;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const me = crew.find((member) => member.isMe)!;
  const lookup = useMemo(() => makeCrewLookup(crew), [crew]);

  const [who, setWho] = usePersistentState<Filter>('agenda.who', 'all', (value) =>
    value === 'all' || crew.some((member) => member.email === value)
  );
  const [view, setView] = usePersistentState<View>('agenda.view', 'list', (value) =>
    ['list', 'timeline'].includes(value)
  );
  const [showEarlier, setShowEarlier] = useState(false);

  const visible = useMemo(() => filterByPerson(screenings, who), [screenings, who]);
  const clashes = useMemo(() => findClashes(screenings), [screenings]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const screening of screenings) {
      for (const email of holdersOf(screening)) result.set(email, (result.get(email) || 0) + 1);
    }
    return result;
  }, [screenings]);

  // Whose "up next" to show: the selected person, or you when showing everyone
  const focusEmail = who === 'all' ? me.email : who;
  const upcoming = visible.filter((screening) => new Date(screening.startsAt) > now);
  const nextForFocus = upcoming.find((screening) => holdersOf(screening).includes(focusEmail));

  const todayKey = dayKey(now);
  const days = groupByDay(visible);
  const earlierDays = days.filter((day) => day.key < todayKey);
  const currentDays = days.filter((day) => day.key >= todayKey);
  const earlierCount = earlierDays.reduce((sum, day) => sum + day.screenings.length, 0);

  const marks: RowMarks = { nextId: nextForFocus?.id || null, clashes, todayKey, now };
  const people = who === 'all' ? crew : crew.filter((member) => member.email === who);
  const festivalDay = festivalDayLabel(screenings, todayKey);

  return (
    <>
      <PageHeader
        eyebrow={festivalDay}
        title={`IDFA ${year}`}
        me={me}
        actions={
          <>
            {actions}
            <ButtonLink
              href="/upload"
              variant="ghost"
              size="icon"
              aria-label="Add tickets"
              icon={<Plus className="h-6 w-6" />}
            />
          </>
        }
      />

      {screenings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-10 w-10" strokeWidth={1.5} />}
          title={`No tickets for ${year} yet`}
          action={
            <ButtonLink href="/upload" icon={<Plus className="h-5 w-5" />}>
              Add tickets
            </ButtonLink>
          }
        >
          Upload the PDFs from your IDFA order and your agenda builds itself.
        </EmptyState>
      ) : (
        <>
          {nextForFocus && <UpNext screening={nextForFocus} now={now} personEmail={focusEmail} lookup={lookup} />}

          <div className="mb-3 space-y-3">
            {crew.length > 1 && (
              <PersonFilter crew={crew} value={who} onChange={setWho} counts={counts} total={screenings.length} />
            )}
            <div className="flex items-center justify-between gap-3">
              <YearSwitcher years={years} selectedYear={year} />
              <SegmentedControl
                label="Agenda view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'list', label: 'List', icon: <List className="h-4 w-4" /> },
                  { value: 'timeline', label: 'Timeline', icon: <GanttChart className="h-4 w-4" /> },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState title={`Nothing for ${lookup(who).name} in ${year}`}>
              Tickets show up here once they&apos;re handed to {lookup(who).name}.
            </EmptyState>
          ) : view === 'timeline' ? (
            <DayTimeline days={days} people={people} marks={marks} />
          ) : (
            <>
              {earlierCount > 0 && currentDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEarlier(!showEarlier)}
                  aria-expanded={showEarlier}
                  className="-mx-4 mb-2 flex w-[calc(100%+2rem)] items-center gap-2 px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink"
                >
                  <ChevronUp className={`h-4 w-4 transition-transform ${showEarlier ? '' : 'rotate-180'}`} />
                  {showEarlier ? 'Hide' : 'Show'} {earlierCount} earlier {earlierCount === 1 ? 'screening' : 'screenings'}
                </button>
              )}
              <AgendaList
                days={showEarlier || currentDays.length === 0 ? days : currentDays}
                marks={marks}
                lookup={lookup}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

/** "Day 4 of 11" while the festival is on, judged by the days anyone in the crew has tickets for */
function festivalDayLabel(screenings: AgendaScreening[], todayKey: string): string | undefined {
  if (screenings.length === 0) return undefined;
  const first = new Date(dayKey(new Date(screenings[0].startsAt)));
  const last = new Date(dayKey(new Date(screenings[screenings.length - 1].startsAt)));
  const today = new Date(todayKey);
  if (today < first || today > last) return undefined;
  const dayMs = 86400000;
  const day = Math.round((today.getTime() - first.getTime()) / dayMs) + 1;
  const total = Math.round((last.getTime() - first.getTime()) / dayMs) + 1;
  return `Day ${day} of ${total}`;
}
