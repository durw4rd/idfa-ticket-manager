import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { getFestivalYears, getRatingsForYear, getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { formatDate, getCurrentFestivalYear, getNow } from '@/lib/dates';
import { makeCrewLookup, screeningHref, screeningsToRate, toAgendaScreening } from '@/lib/agenda';
import type { AgendaScreening, Rating } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import YearSwitcher from '@/components/agenda/YearSwitcher';
import RatingInput from '@/components/RatingInput';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

interface Film {
  act: string;
  screening: AgendaScreening; // The first showing, for the link
  mine: Rating | undefined;
  others: Rating[];
  average: number | null;
}

export default async function FilmsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const currentYear = getCurrentFestivalYear();
  const year = Number((await searchParams).year) || currentYear;
  const now = getNow();

  const [screenings, ratings, crew, festivalYears] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getRatingsForYear(viewer.visibleEmails, year),
    getCrew(viewer),
    getFestivalYears(viewer.visibleEmails),
  ]);
  const years = Array.from(new Set([currentYear, year, ...festivalYears])).sort((a, b) => b - a);
  const lookup = makeCrewLookup(crew);
  const agenda = screenings.map(toAgendaScreening);

  const myRatings = ratings.filter((rating) => rating.userEmail === viewer.email);
  const toRate = screeningsToRate(agenda, myRatings, viewer.email, now);

  // Every film someone in the crew has rated, best (by your score, then the crew's) first
  const firstShowing = new Map<string, AgendaScreening>();
  for (const screening of agenda) {
    if (!firstShowing.has(screening.act)) firstShowing.set(screening.act, screening);
  }
  const films: Film[] = Array.from(new Set(ratings.map((rating) => rating.act)))
    .filter((act) => firstShowing.has(act))
    .map((act) => {
      const filmRatings = ratings.filter((rating) => rating.act === act);
      return {
        act,
        screening: firstShowing.get(act)!,
        mine: filmRatings.find((rating) => rating.userEmail === viewer.email),
        others: filmRatings.filter((rating) => rating.userEmail !== viewer.email),
        average: filmRatings.reduce((sum, r) => sum + r.rating, 0) / filmRatings.length,
      };
    })
    .sort((a, b) => (b.mine?.rating ?? 0) - (a.mine?.rating ?? 0) || (b.average ?? 0) - (a.average ?? 0));

  const myAverage = myRatings.length
    ? myRatings.reduce((sum, rating) => sum + rating.rating, 0) / myRatings.length
    : null;
  const ticketCount = screenings.reduce((sum, screening) => sum + screening.ticketCount, 0);

  return (
    <>
      <PageHeader title="Films" eyebrow={`IDFA ${year}`} me={crew.find((member) => member.isMe)} />

      <div className="mb-6">
        <YearSwitcher years={years} selectedYear={year} basePath="/films" />
      </div>

      {year < currentYear && (
        <dl className="mb-8 grid grid-cols-3 divide-x divide-line rounded border border-line bg-surface">
          <Stat label="Films" value={String(firstShowing.size)} />
          <Stat label="Tickets" value={String(ticketCount)} />
          <Stat label="Your avg" value={myAverage ? myAverage.toFixed(1) : '–'} />
        </dl>
      )}

      {toRate.length > 0 && (
        <section aria-labelledby="to-rate" className="mb-10">
          <h2 id="to-rate" className="label mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-spark" aria-hidden />
            To rate · {toRate.length}
          </h2>
          <ul className="space-y-3">
            {toRate.map((screening) => (
              <li key={screening.id} className="rounded border border-line bg-surface p-4">
                <Link href={screeningHref(screening)} className="block">
                  <p className="font-display text-lg leading-tight">{screening.act}</p>
                  <p className="mt-0.5 text-sm text-ink-3">
                    Seen {formatDate(new Date(screening.startsAt))} · {screening.location}
                  </p>
                </Link>
                <div className="mt-3">
                  <RatingInput
                    act={screening.act}
                    festivalYear={screening.festivalYear}
                    initialRating={null}
                    initialComment={null}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {films.length > 0 ? (
        <section aria-labelledby="rated">
          <h2 id="rated" className="label mb-1">
            Rated
          </h2>
          <ol className="divide-y divide-line">
            {films.map((film) => (
              <li key={film.act}>
                <Link href={screeningHref(film.screening)} className="-mx-4 block px-4 py-4 hover:bg-ink/[0.03]">
                  <div className="flex items-start gap-3">
                    <p className="min-w-0 flex-1 font-display text-lg leading-tight">{film.act}</p>
                    <p className="shrink-0 text-right">
                      {film.mine ? (
                        <span className="font-display text-xl tabular-nums">{film.mine.rating}</span>
                      ) : (
                        <span className="text-sm text-ink-3">not rated</span>
                      )}
                      {film.others.length > 0 && (
                        <span className="block text-xs tabular-nums text-ink-3">crew {film.average?.toFixed(1)}</span>
                      )}
                    </p>
                  </div>
                  {[film.mine, ...film.others]
                    .filter((rating): rating is Rating => !!rating?.comment)
                    .map((rating) => (
                      <p key={rating.id} className="mt-2 flex gap-2 text-sm">
                        <Avatar member={lookup(rating.userEmail)} size="xs" className="mt-0.5" />
                        <span className="italic text-ink-2">“{rating.comment}”</span>
                      </p>
                    ))}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        toRate.length === 0 && (
          <EmptyState icon={<Star className="h-10 w-10" strokeWidth={1.5} />} title="Nothing rated yet">
            After each screening, the film shows up here so you can score it and leave a line for the crew.
          </EmptyState>
        )
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-display text-xl tabular-nums">{value}</dd>
    </div>
  );
}
