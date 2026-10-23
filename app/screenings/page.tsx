import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, MapPin, Navigation, QrCode, Star, Ticket } from 'lucide-react';
import { getAverageRatings, getFestivalYears, getRatingsForYear, getScreeningsForYear } from '@/lib/db';
import { getViewer } from '@/lib/auth-helpers';
import {
  dayKey,
  formatDate,
  formatDayHeading,
  formatTime,
  getCurrentFestivalYear,
  getNow,
  isPast,
} from '@/lib/dates';
import { formatTimeUntil } from '@/lib/display';
import { getMapSearchUrl } from '@/lib/maps-utils';
import { Screening } from '@/lib/types';
import ScreeningCard from '@/components/ScreeningCard';
import YearSwitcher from '@/components/YearSwitcher';

export const dynamic = 'force-dynamic';

type AverageMap = Map<string, { average: number; count: number }>;

function groupByDay(screenings: Screening[]): Array<{ key: string; label: string; screenings: Screening[] }> {
  const days: Array<{ key: string; label: string; screenings: Screening[] }> = [];
  for (const screening of screenings) {
    const key = dayKey(screening.dateTime);
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, label: formatDayHeading(screening.dateTime), screenings: [] };
      days.push(day);
    }
    day.screenings.push(screening);
  }
  return days;
}

function DayGroups({
  screenings,
  viewerEmail,
  averageRatings,
}: {
  screenings: Screening[];
  viewerEmail: string;
  averageRatings: AverageMap;
}) {
  return (
    <div className="space-y-8">
      {groupByDay(screenings).map((day) => (
        <section key={day.key}>
          <h2 className="sticky top-0 z-20 -mx-4 px-4 py-2 mb-4 bg-white/95 backdrop-blur text-sm font-semibold uppercase tracking-wide text-idfa-gray-600 border-b border-idfa-gray-200">
            {day.label}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {day.screenings.map((screening) => (
              <ScreeningCard
                key={screening.id}
                screening={screening}
                viewerEmail={viewerEmail}
                averageRating={averageRatings.get(screening.act)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function UpNext({ screening }: { screening: Screening }) {
  const href = `/screenings/${encodeURIComponent(screening.id)}`;
  return (
    <section className="mb-10 rounded-xl bg-idfa-black text-white p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-idfa-gray-400 mb-2">
        Up next · {formatTimeUntil(screening.dateTime, getNow())}
      </p>
      <Link href={href} className="block">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3 hover:underline">{screening.act}</h2>
      </Link>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-idfa-gray-300 mb-5">
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {formatDate(screening.dateTime)} · {formatTime(screening.dateTime)}
        </span>
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {screening.location}
        </span>
        {screening.ticketCount > 1 && (
          <span className="flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            {screening.ticketCount} tickets
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`${href}#qr`}
          className="inline-flex items-center gap-2 px-5 py-3 bg-white text-idfa-black font-semibold rounded hover:bg-idfa-gray-100 transition-colors"
        >
          <QrCode className="h-5 w-5" />
          Show QR code
        </Link>
        <a
          href={getMapSearchUrl(screening.location)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 border border-idfa-gray-600 font-medium rounded hover:border-white transition-colors"
        >
          <Navigation className="h-5 w-5" />
          Directions
        </a>
      </div>
    </section>
  );
}

async function ArchiveView({
  year,
  screenings,
  viewerEmail,
  visibleEmails,
  averageRatings,
}: {
  year: number;
  screenings: Screening[];
  viewerEmail: string;
  visibleEmails: string[];
  averageRatings: AverageMap;
}) {
  const ratings = await getRatingsForYear(visibleEmails, year);
  const myRatings = new Map(ratings.filter((r) => r.userEmail === viewerEmail).map((r) => [r.act, r.rating]));
  // One entry per film, keeping every screening of it (group members may have seen it at different times)
  const filmScreenings = new Map<string, Screening[]>();
  for (const screening of screenings) {
    filmScreenings.set(screening.act, [...(filmScreenings.get(screening.act) ?? []), screening]);
  }
  const films = Array.from(filmScreenings, ([act, filmShowings]) => ({ act, screenings: filmShowings }));
  const myAverage =
    myRatings.size > 0 ? Array.from(myRatings.values()).reduce((sum, r) => sum + r, 0) / myRatings.size : null;

  // Best-rated films first, unrated ones last in screening order
  const sortedFilms = [...films].sort((a, b) => (myRatings.get(b.act) ?? 0) - (myRatings.get(a.act) ?? 0));

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="rounded-lg border border-idfa-gray-200 p-4">
          <p className="text-3xl font-bold">{films.length}</p>
          <p className="text-sm text-idfa-gray-600">films</p>
        </div>
        <div className="rounded-lg border border-idfa-gray-200 p-4">
          <p className="text-3xl font-bold">{screenings.reduce((sum, s) => sum + s.ticketCount, 0)}</p>
          <p className="text-sm text-idfa-gray-600">tickets</p>
        </div>
        <div className="rounded-lg border border-idfa-gray-200 p-4">
          <p className="text-3xl font-bold">{myAverage !== null ? myAverage.toFixed(1) : '–'}</p>
          <p className="text-sm text-idfa-gray-600">your avg rating</p>
        </div>
      </div>

      <ol className="divide-y divide-idfa-gray-200 border-y border-idfa-gray-200">
        {sortedFilms.map((film) => {
          const myRating = myRatings.get(film.act);
          const groupAverage = averageRatings.get(film.act);
          return (
            <li key={film.act} className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{film.act}</p>
                  <ul className="mt-1 space-y-1">
                    {film.screenings.map((screening) => (
                      <li key={screening.id}>
                        <Link
                          href={`/screenings/${encodeURIComponent(screening.id)}`}
                          className="text-sm text-idfa-gray-600 hover:text-idfa-black hover:underline"
                        >
                          {formatDate(screening.dateTime)} · {formatTime(screening.dateTime)} · {screening.location}
                          {screening.ticketCount > 1 ? ` · ${screening.ticketCount} tickets` : ''}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right flex-shrink-0">
                  {myRating ? (
                    <p className="flex items-center gap-1 font-semibold">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {myRating}/10
                    </p>
                  ) : (
                    <p className="text-sm text-idfa-gray-500">Not rated</p>
                  )}
                  {groupAverage && groupAverage.count > 1 && (
                    <p className="text-xs text-idfa-gray-500">group avg {groupAverage.average.toFixed(1)}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export default async function ScreeningsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const currentYear = getCurrentFestivalYear();
  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || currentYear;

  const [ticketYears, screenings, averageRatings] = await Promise.all([
    getFestivalYears(viewer.visibleEmails),
    getScreeningsForYear(viewer.visibleEmails, year),
    getAverageRatings(viewer.visibleEmails, year),
  ]);

  const years = Array.from(new Set([currentYear, year, ...ticketYears])).sort((a, b) => b - a);
  const isArchive = year < currentYear;
  const pastYears = ticketYears.filter((y) => y < year);

  const upcoming = screenings.filter((s) => !isPast(s.dateTime));
  const past = screenings.filter((s) => isPast(s.dateTime));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">IDFA {year}</h1>
          <p className="text-idfa-gray-600">{isArchive ? 'Festival recap' : 'My screenings'}</p>
        </div>
        <div className="flex flex-col sm:items-end gap-3">
          <YearSwitcher years={years} selectedYear={year} />
          {!isArchive && (
            <Link
              href="/upload"
              className="hidden sm:inline-block px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
            >
              Upload Tickets
            </Link>
          )}
        </div>
      </div>

      {screenings.length === 0 ? (
        <div className="text-center py-16">
          <Ticket className="mx-auto h-16 w-16 text-idfa-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No screenings for {year} yet</h2>
          <p className="text-idfa-gray-600 mb-6">
            Upload your PDF tickets to get started
          </p>
          <Link
            href="/upload"
            className="inline-block px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
          >
            Upload Tickets
          </Link>
          {pastYears.length > 0 && (
            <p className="mt-6 text-sm text-idfa-gray-600">
              Looking for past festivals?{' '}
              <Link href={`/screenings?year=${pastYears[0]}`} className="underline hover:text-idfa-black">
                See IDFA {pastYears[0]}
              </Link>
            </p>
          )}
        </div>
      ) : isArchive ? (
        <ArchiveView
          year={year}
          screenings={screenings}
          viewerEmail={viewer.email}
          visibleEmails={viewer.visibleEmails}
          averageRatings={averageRatings}
        />
      ) : (
        <>
          {upcoming.length > 0 && <UpNext screening={upcoming[0]} />}

          {upcoming.length > 0 && (
            <DayGroups screenings={upcoming} viewerEmail={viewer.email} averageRatings={averageRatings} />
          )}

          {past.length > 0 &&
            (upcoming.length > 0 ? (
              <details className="mt-12 group">
                <summary className="cursor-pointer select-none text-sm font-medium text-idfa-gray-600 hover:text-idfa-black">
                  Show past screenings ({past.length})
                </summary>
                <div className="mt-6">
                  <DayGroups screenings={past} viewerEmail={viewer.email} averageRatings={averageRatings} />
                </div>
              </details>
            ) : (
              <DayGroups screenings={past} viewerEmail={viewer.email} averageRatings={averageRatings} />
            ))}
        </>
      )}
    </div>
  );
}
