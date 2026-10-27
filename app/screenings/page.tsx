import { redirect } from 'next/navigation';
import { getFestivalYears, getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { getCurrentFestivalYear, getNow } from '@/lib/dates';
import { toAgendaScreening } from '@/lib/agenda';
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

  const [screenings, festivalYears, crew] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getFestivalYears(viewer.visibleEmails),
    getCrew(viewer),
  ]);
  const years = Array.from(new Set([currentYear, year, ...festivalYears])).sort((a, b) => b - a);

  return (
    <AgendaView
      screenings={screenings.map(toAgendaScreening)}
      crew={crew}
      year={year}
      years={years}
      now={getNow().toISOString()}
      actions={screenings.length > 0 ? <SharePosterButton key="share" year={year} crew={crew} /> : undefined}
    />
  );
}
