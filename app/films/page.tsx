import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { getFestivalYears, getRatingsForYear, getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { formatDate, getCurrentFestivalYear, getNow } from '@/lib/dates';
import { makeCrewLookup, screeningHref, screeningsToRate, toAgendaScreening } from '@/lib/agenda';
import { filmKeysByTitle, titleFilmKey } from '@/lib/films';
import type { AgendaScreening, Rating } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import YearSwitcher from '@/components/agenda/YearSwitcher';
import RatingInput from '@/components/RatingInput';
import { Avatar } from '@/components/ui/Avatar';
import { Disclosure } from '@/components/ui/Disclosure';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

interface Film {
  key: string; // See lib/films.ts
  title: string;
  screening: AgendaScreening; // The first showing, for the link
  mine: Rating | undefined;
  ratings: Rating[]; // Yours first, then the crew's
  comments: Rating[]; // The ratings that came with a comment, same order
  average: number;
}

export default async function FilmsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const currentYear = getCurrentFestivalYear();
  const year = Number((await searchParams).year) || currentYear;
  // Checked before any query: festival_year is an INT, so ?year=1e20 would fail in the database
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    redirect('/films');
  }
  const now = getNow();

  const [screenings, ratings, crew, festivalYears] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getRatingsForYear(viewer.visibleEmails, year),
    getCrew(viewer),
    getFestivalYears(viewer.visibleEmails),
  ]);
  // Only years someone in the crew has tickets for, plus this one
  if (year !== currentYear && !festivalYears.includes(year)) {
    redirect('/films');
  }
  const years = Array.from(new Set([currentYear, ...festivalYears])).sort((a, b) => b - a);
  const lookup = makeCrewLookup(crew);
  const agenda = screenings.map(toAgendaScreening);

  // Which titles are the same film ("Lonan Tché" and "Lonan Tché + Talk"); ratings already carry
  // the film's key from getRatingsForYear
  const keysByTitle = filmKeysByTitle(agenda);
  const filmOf = (screening: AgendaScreening) => keysByTitle.get(screening.act) ?? titleFilmKey(screening.act);
  const myRatings = ratings.filter((rating) => rating.userEmail === viewer.email);
  const toRate = screeningsToRate(agenda, myRatings, keysByTitle, viewer.email, now);

  // Each film's first screening, which its entry links to; the shortest title names it, as the
  // longer ones add a series or a talk ("IDFA Hit: …", "… + Talk")
  const showings = new Map<string, { screening: AgendaScreening; title: string }>();
  for (const screening of agenda) {
    const key = filmOf(screening);
    const known = showings.get(key);
    if (!known) showings.set(key, { screening, title: screening.act });
    else if (screening.act.length < known.title.length) known.title = screening.act;
  }

  // Every film someone in the crew has rated, best (by your score, then the crew's) first
  const films: Film[] = Array.from(new Set(ratings.map((rating) => rating.filmKey)))
    .filter((key) => showings.has(key))
    .map((key) => {
      const mine = ratings.find((rating) => rating.filmKey === key && rating.userEmail === viewer.email);
      const others = ratings.filter((rating) => rating.filmKey === key && rating.userEmail !== viewer.email);
      const filmRatings = mine ? [mine, ...others] : others;
      const { screening, title } = showings.get(key)!;
      return {
        key,
        title,
        screening,
        mine,
        ratings: filmRatings,
        comments: filmRatings.filter((rating) => !!rating.comment),
        average: filmRatings.reduce((sum, r) => sum + r.rating, 0) / filmRatings.length,
      };
    })
    .sort((a, b) => (b.mine?.rating ?? 0) - (a.mine?.rating ?? 0) || b.average - a.average);

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
          <Stat label="Films" value={String(showings.size)} />
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
              <li key={film.key} className="py-4">
                <div className="flex items-start gap-3">
                  <Link
                    href={screeningHref(film.screening)}
                    className="hit-44 min-w-0 flex-1 font-display text-lg leading-tight underline-offset-4 hover:underline"
                  >
                    {film.title}
                  </Link>
                  <p className="shrink-0 text-right">
                    <span className="font-display text-xl tabular-nums">{film.average.toFixed(1)}</span>
                    <span className="block text-xs tabular-nums text-ink-3">
                      {film.ratings.length === 1 ? '1 rating' : `avg of ${film.ratings.length}`}
                    </span>
                  </p>
                </div>

                {/* Who gave what, you first */}
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  {film.ratings.map((rating) => {
                    const member = lookup(rating.userEmail);
                    return (
                      <li key={rating.id} className="flex items-center gap-1.5 text-sm">
                        <Avatar member={member} size="xs" />
                        <span className="sr-only">{member.isMe ? 'You' : member.name}:</span>
                        <span className="font-semibold tabular-nums">{rating.rating}</span>
                      </li>
                    );
                  })}
                </ul>

                {film.comments.length > 0 && (
                  <Disclosure
                    className="mt-2"
                    label={film.comments.length === 1 ? '1 comment' : `${film.comments.length} comments`}
                  >
                    {film.comments.map((rating) => (
                      <p key={rating.id} className="mt-2 flex gap-2 text-sm">
                        <Avatar member={lookup(rating.userEmail)} size="xs" className="mt-0.5" />
                        <span className="min-w-0 whitespace-pre-line break-words italic text-ink-2">
                          “{rating.comment}”
                        </span>
                      </p>
                    ))}
                  </Disclosure>
                )}
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
