import { redirect } from 'next/navigation';
import { getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { getCurrentFestivalYear, getNow, screeningEnd } from '@/lib/dates';
import { toAgendaScreening } from '@/lib/agenda';
import PageHeader from '@/components/PageHeader';
import TicketWallet from '@/components/tickets/TicketWallet';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const now = getNow();
  const [screenings, crew] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, getCurrentFestivalYear()),
    getCrew(viewer),
  ]);
  // Keep a ticket until its screening is over, in case you need it at the door after the start
  const current = screenings.filter((screening) => screeningEnd(screening.dateTime) > now);

  return (
    <>
      <PageHeader title="Tickets" me={crew.find((member) => member.isMe)} />
      <TicketWallet screenings={current.map(toAgendaScreening)} crew={crew} now={now.toISOString()} />
    </>
  );
}
