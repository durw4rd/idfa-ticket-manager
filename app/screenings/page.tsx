import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getFestivalYears, getScreeningsForYear } from '@/lib/db';
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

  const [screenings, festivalYears, crew] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getFestivalYears(viewer.visibleEmails),
    getCrew(viewer),
  ]);
  // Only years someone in the crew has tickets for, plus this one: ?year=1900 isn't a festival
  if (year !== currentYear && !festivalYears.includes(year)) {
    redirect('/screenings');
  }
  const now = getNow();
  // Only upcoming screenings are checked, so recap years make no IDFA requests
  const availability = await getAvailabilityForScreenings(screenings, now, userContext(viewer.email));
  // End times and Q&A are stored on the tickets; catch up with the IDFA site once the page is sent
  after(() => refreshShowDetails(viewer.visibleEmails, screenings, now, userContext(viewer.email)));
  const years = Array.from(new Set([currentYear, ...festivalYears])).sort((a, b) => b - a);

  return (
    <AgendaView
      screenings={withAvailability(screenings.map(toAgendaScreening), availability)}
      crew={crew}
      year={year}
      years={years}
      now={now.toISOString()}
      actions={screenings.length > 0 ? <SharePosterButton key="share" year={year} crew={crew} /> : undefined}
    />
  );
}
