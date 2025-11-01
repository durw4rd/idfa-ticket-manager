import Link from 'next/link';
import { getAllScreenings, getRating, getRatingsByMovie } from '@/lib/db';
import { ArrowLeft, Calendar, MapPin, Clock, Film, Ticket, Navigation } from 'lucide-react';
import { parseTicketDateTime } from '@/lib/db';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { getVenueBackground } from '@/lib/venue-backgrounds';
import { getFestivalLinkForScreening } from '@/lib/festival-links';
import FestivalLinkButton from '@/components/FestivalLinkButton';
import CoupleIcon from '@/components/CoupleIcon';
import { getMapSearchUrl } from '@/lib/maps-utils';
import MovieRating from '@/components/MovieRating';
import AllRatings from '@/components/AllRatings';
import CollapsibleQRSection from '@/components/CollapsibleQRSection';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default async function ScreeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const screenings = await getAllScreenings();
  const screeningId = decodeURIComponent(id);
  const screening = screenings.find((s) => s.id === screeningId);

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

  const screeningDateTime = parseTicketDateTime(screening.date, screening.start);
  const venueBackground = getVenueBackground(screening.location);
  const festivalLink = await getFestivalLinkForScreening(screening);

  // Get user's rating and all ratings for this movie
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email || null;
  const userRating = userEmail
    ? await getRating(userEmail, screening.act)
    : null;
  const allRatings = await getRatingsByMovie(screening.act);

  return (
    <div 
      className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 ${venueBackground ? 'venue-page-background' : ''}`}
      style={venueBackground ? ({ '--venue-bg-image': `url(${venueBackground})` } as React.CSSProperties) : undefined}
    >
      <div className={venueBackground ? 'venue-page-content' : ''}>
      <Link
        href="/screenings"
        className="inline-flex items-center space-x-2 text-idfa-gray-600 hover:text-idfa-black mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Screenings</span>
      </Link>

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <h1 className="text-4xl font-bold">{screening.act}</h1>
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
            <span>{formatDate(screeningDateTime)}</span>
          </div>
          <div className="flex items-center space-x-3">
            <Clock className="h-5 w-5 text-idfa-gray-600" />
            <span>{formatTime(screeningDateTime)}</span>
          </div>
          <div className="flex items-center space-x-3">
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

      <div className="mt-12">
        <CollapsibleQRSection
          title={`QR Code${screening.ticketCount > 1 ? 's' : ''}`}
          defaultOpen={true}
        >
          <div className={`grid gap-6 ${screening.ticketCount === 1 ? 'grid-cols-1' : screening.ticketCount === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {screening.tickets.map((ticket, index) => (
              <QRCodeDisplay
                key={ticket.id}
                qrCodeUrl={ticket.qrCodeUrl}
                alt={`QR code for ${screening.act} - Ticket ${index + 1}`}
                ticketLabel={screening.ticketCount > 1 ? `Ticket ${index + 1}` : undefined}
              />
            ))}
          </div>
        </CollapsibleQRSection>
      </div>

      <div className="mt-12 pt-12 border-t border-idfa-gray-200">
        <h2 className="text-2xl font-bold mb-6">Rate this movie</h2>
        <MovieRating
          movieTitle={screening.act}
          initialRating={userRating}
        />
      </div>

      {allRatings.length > 0 && (
        <div className="mt-12 pt-12 border-t border-idfa-gray-200">
          <h2 className="text-2xl font-bold mb-6">All ratings</h2>
          <AllRatings
            ratings={allRatings}
            currentUserEmail={userEmail}
          />
        </div>
      )}
      </div>
    </div>
  );
}

