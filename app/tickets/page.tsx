import { redirect } from 'next/navigation';
import { getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { getCurrentFestivalYear, getNow, screeningEnd } from '@/lib/dates';
import { canSeeQr, toAgendaScreening } from '@/lib/agenda';
import { getQrEmails } from '@/lib/qr-shares';
import PageHeader from '@/components/PageHeader';
import TicketWallet from '@/components/tickets/TicketWallet';
import OfflineTickets from '@/components/tickets/OfflineTickets';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const now = getNow();
  const [screenings, crew, qrEmails] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, getCurrentFestivalYear()),
    getCrew(viewer),
    getQrEmails(viewer),
  ]);
  // Keep a ticket until its screening is over, in case you need it at the door after the start
  const current = screenings.filter((screening) => screeningEnd(screening.dateTime, screening.endsAt) > now);

  return (
    <>
      <PageHeader title="Tickets" me={crew.find((member) => member.isMe)} />
      {/* The codes you may show (yours, or shared with you); the QR route refuses the crew's others */}
      <OfflineTickets
        ticketIds={current.flatMap((screening) =>
          screening.tickets.filter((ticket) => canSeeQr(ticket, qrEmails)).map((ticket) => ticket.id)
        )}
      />
      <TicketWallet screenings={current.map(toAgendaScreening)} crew={crew} qrEmails={qrEmails} now={now.toISOString()} />
    </>
  );
}
