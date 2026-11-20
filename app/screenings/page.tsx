import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getFestivalYears, withCurrentYear, getFilmPlacesForYear, getScreeningsForYear, type FilmPlaces } from '@/lib/db';
import { fillMissingFilmPlaces } from '@/lib/find-film-place';
import { titleFilmKey } from '@/lib/films';
import type { MapPlaceData } from '@/lib/types';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { getCurrentFestivalYear, getNow } from '@/lib/dates';
import { toAgendaScreening, withAvailability } from '@/lib/agenda';
import { getAvailabilityForScreenings, refreshShowDetails } from '@/lib/idfa';
import { userContext } from '@/lib/launchdarkly';
import AgendaView from '@/components/agenda/AgendaView';
import SharePosterButton from '@/components/agenda/SharePosterButton';

export const dynamic = 'force-dynamic';

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
  const year = Number((await searchParams).year) || currentYear;
  // Checked before any query: festival_year is an INT, so ?year=1e20 would fail in the database
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    redirect('/screenings');
  }

  const [screenings, festivalYears, crew, filmPlaces] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getFestivalYears(viewer.visibleEmails),
    getCrew(viewer),
    // For the map view. Never worth failing the agenda over: without it the map just has no pins
    getFilmPlacesForYear(viewer.visibleEmails, year).catch((error) => {
      console.warn('Could not load film places:', error);
      return null;
    }),
  ]);
  // Only years someone in the crew has tickets for, plus this one: ?year=1900 isn't a festival
  if (year !== currentYear && !festivalYears.some((entry) => entry.year === year)) {
    redirect('/screenings');
  }
  const now = getNow();
  // Only upcoming screenings are checked, so recap years make no IDFA requests
  const availability = await getAvailabilityForScreenings(screenings, now, userContext(viewer.email));
  // End times and Q&A are stored on the tickets; catch up with the IDFA site once the page is sent
  after(() => refreshShowDetails(viewer.visibleEmails, screenings, now, userContext(viewer.email)));
  const years = withCurrentYear(festivalYears, currentYear);
  // Films with an IDFA page but no place yet are placed after the page is sent, a few per visit
  if (filmPlaces && hasUnplacedFilms(filmPlaces)) {
    after(() => fillMissingFilmPlaces(viewer, year, userContext(viewer.email)));
  }
  const placeData: MapPlaceData = {
    keysByTitle: filmPlaces ? Array.from(filmPlaces.keysByTitle) : [],
    places: filmPlaces ? Array.from(filmPlaces.places) : [],
  };

  return (
    <AgendaView
      screenings={withAvailability(screenings.map(toAgendaScreening), availability)}
      crew={crew}
      year={year}
      years={years}
      pastEdition={year < currentYear}
      now={now.toISOString()}
      placeData={placeData}
      actions={
        screenings.length > 0 ? (
          <SharePosterButton
            key="share"
            year={year}
            crew={crew}
            startTimes={screenings.map((screening) => screening.dateTime.toISOString())}
            now={now.toISOString()}
          />
        ) : undefined
      }
    />
  );
}

/** Any film with an IDFA page, no place yet, and no failed lookup in the last few hours */
function hasUnplacedFilms({ titles, keysByTitle, places, recentlyAttempted }: FilmPlaces): boolean {
  return titles.some(({ act, festivalLink }) => {
    const key = keysByTitle.get(act) ?? titleFilmKey(act);
    return !!festivalLink && !places.has(key) && !recentlyAttempted.has(key);
  });
}
