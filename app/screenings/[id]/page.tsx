import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Calendar, MapPin, Clock, Ticket, Navigation } from 'lucide-react';
import { getScreening, getRating, getRatingsByMovie } from '@/lib/db';
import { getViewer } from '@/lib/auth-helpers';
import { formatDate, formatTime, isPast } from '@/lib/dates';
import { getDisplayName } from '@/lib/display';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { getVenueBackground } from '@/lib/venue-backgrounds';
import { getFestivalLinkForScreening } from '@/lib/festival-links';
import FestivalLinkButton from '@/components/FestivalLinkButton';
import CoupleIcon from '@/components/CoupleIcon';
import { getMapSearchUrl } from '@/lib/maps-utils';
import MovieRating from '@/components/MovieRating';
import AllRatings from '@/components/AllRatings';
import CollapsibleQRSection from '@/components/CollapsibleQRSection';
import TicketActions from '@/components/TicketActions';
import AddToCalendarButton from '@/components/AddToCalendarButton';

export const dynamic = 'force-dynamic';

export default async function ScreeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const { id } = await params;
  const screening = await getScreening(viewer.visibleEmails, decodeURIComponent(id));

  if (!screening) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Screening not found</h1>
          <Link
            href="/screenings"
            className="text-idfa-black hover:underline"
          >
            ← Back to Screenings
          </Link>
        </div>
      </div>
    );
  }

  const screeningDateTime = screening.dateTime;
  const isPastScreening = isPast(screeningDateTime);
  const venueBackground = getVenueBackground(screening.location);
  const festivalLink = await getFestivalLinkForScreening(screening);

  // Get user's rating and the group's ratings for this movie
  const [userRating, allRatings] = await Promise.all([
    getRating(viewer.email, screening.act, screening.festivalYear),
    getRatingsByMovie(viewer.visibleEmails, screening.act, screening.festivalYear),
  ]);

  return (
    <div
      className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 ${venueBackground ? 'venue-page-background' : ''}`}
      style={venueBackground ? ({ '--venue-bg-image': `url(${venueBackground})` } as React.CSSProperties) : undefined}
    >
      <div className={venueBackground ? 'venue-page-content' : ''}>
      <Link
        href={`/screenings?year=${screening.festivalYear}`}
        className="inline-flex items-center space-x-2 text-idfa-gray-600 hover:text-idfa-black mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to IDFA {screening.festivalYear}</span>
      </Link>

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold">{screening.act}</h1>
          {festivalLink && (
            <FestivalLinkButton
              url={festivalLink}
              movieTitle={screening.act}
            />
          )}
        </div>

        <div className="space-y-3 text-lg">
          <div className="flex items-center space-x-3">
            <Calendar className="h-5 w-5 text-idfa-gray-600" />
            <span>{formatDate(screeningDateTime, 'long')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Clock className="h-5 w-5 text-idfa-gray-600" />
            <span>{formatTime(screeningDateTime)}</span>
            {!isPastScreening && (
              <AddToCalendarButton
                title={screening.act}
                location={screening.location}
                startsAt={screeningDateTime.toISOString()}
                url={festivalLink}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MapPin className="h-5 w-5 text-idfa-gray-600" />
            <span>{screening.location}</span>
            <a
              href={getMapSearchUrl(screening.location)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
              title="Open in Maps"
            >
              <Navigation className="h-4 w-4" />
              <span>Directions</span>
            </a>
          </div>
          {screening.ticketCount > 1 && (
            <div className="flex items-center space-x-3">
              <Ticket className="h-5 w-5 text-idfa-gray-600" />
              <span>{screening.ticketCount} tickets</span>
              {screening.ticketCount === 2 && (
                <CoupleIcon className="ml-1" />
              )}
            </div>
          )}
        </div>
      </div>

      <div id="qr" className="mt-12 scroll-mt-4">
        <CollapsibleQRSection
          title={`QR Code${screening.ticketCount > 1 ? 's' : ''}`}
          defaultOpen={!isPastScreening}
        >
          <div className={`grid gap-6 ${screening.ticketCount === 1 ? 'grid-cols-1' : screening.ticketCount === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {screening.tickets.map((ticket, index) => {
              const isOwn = ticket.ownerEmail === viewer.email;
              const owner = isOwn ? null : getDisplayName(ticket.ownerEmail);
              const label = [screening.ticketCount > 1 ? `Ticket ${index + 1}` : null, owner]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={ticket.id}>
                  <QRCodeDisplay
                    qrCodeUrl={`/api/tickets/${ticket.id}/qr`}
                    alt={`QR code for ${screening.act} - Ticket ${index + 1}`}
                    ticketLabel={label || undefined}
                  />
                  {isOwn && (
                    <TicketActions
                      ticketId={ticket.id}
                      fields={{ act: ticket.act, location: ticket.location, date: ticket.date, start: ticket.start }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleQRSection>
      </div>

      <div className="mt-12 pt-12 border-t border-idfa-gray-200">
        <h2 className="text-2xl font-bold mb-6">Rate this movie</h2>
        <MovieRating
          movieTitle={screening.act}
          festivalYear={screening.festivalYear}
          initialRating={userRating}
        />
      </div>

      {allRatings.length > 0 && (
        <div className="mt-12 pt-12 border-t border-idfa-gray-200">
          <h2 className="text-2xl font-bold mb-6">All ratings</h2>
          <AllRatings
            ratings={allRatings}
            currentUserEmail={viewer.email}
          />
        </div>
      )}
      </div>
    </div>
  );
}
