import Link from 'next/link';
import { getAllScreenings } from '@/lib/db';
import { Calendar, MapPin, Clock, Ticket } from 'lucide-react';
import { parseTicketDateTime } from '@/lib/db';
import { getVenueBackground } from '@/lib/venue-backgrounds';
import CoupleIcon from '@/components/CoupleIcon';

export const dynamic = 'force-dynamic';

// For testing: Set TEST_DATE environment variable (e.g., "2024-12-15T14:00:00")
// or uncomment and set the date below to override the current date
// const TEST_NOW = new Date('2025-11-21T14:00:00');
const TEST_NOW = process.env.TEST_DATE ? new Date(process.env.TEST_DATE) : null;

function getNow(): Date {
  return TEST_NOW || new Date();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
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

function isToday(date: Date): boolean {
  const now = getNow();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isPast(date: Date): boolean {
  return date < getNow();
}

export default async function ScreeningsPage() {
  const screenings = await getAllScreenings();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Screenings</h1>
        <Link
          href="/upload"
          className="px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
        >
          Upload Tickets
        </Link>
      </div>

      {screenings.length === 0 ? (
        <div className="text-center py-16">
          <Ticket className="mx-auto h-16 w-16 text-idfa-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No screenings yet</h2>
          <p className="text-idfa-gray-600 mb-6">
            Upload your PDF tickets to get started
          </p>
          <Link
            href="/upload"
            className="inline-block px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
          >
            Upload Tickets
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {screenings.map((screening) => {
            const screeningDateTime = parseTicketDateTime(screening.date, screening.start);
            const screeningId = encodeURIComponent(screening.id);
            const isPastScreening = isPast(screeningDateTime);
            // Only highlight as "today" if it's today AND not in the past
            const isTodayScreening = isToday(screeningDateTime) && !isPastScreening;

            // Get venue background
            const venueBackground = getVenueBackground(screening.location);

            // Determine card classes based on date and venue
            const cardClasses = [
              'block p-6 border rounded-lg transition-all',
              venueBackground ? 'venue-card-background' : '',
              isTodayScreening
                ? 'border-idfa-black border-2 hover:shadow-lg'
                : isPastScreening
                ? 'border-idfa-gray-300 opacity-60 hover:opacity-70'
                : 'border-idfa-gray-200 hover:border-idfa-black hover:shadow-lg',
              !venueBackground && isTodayScreening ? 'bg-idfa-gray-50' : '',
            ].filter(Boolean).join(' ');

            // Style for venue background (using CSS variable for the ::before pseudo-element)
            const cardStyle: React.CSSProperties | undefined = venueBackground
              ? ({
                  '--venue-bg-image': `url(${venueBackground})`,
                } as React.CSSProperties)
              : undefined;

            return (
              <Link
                key={screening.id}
                href={`/screenings/${screeningId}`}
                className={cardClasses}
                style={cardStyle}
              >
                <div className="venue-card-content">
                  {venueBackground ? (
                    <div className="venue-card-header-bg" style={cardStyle}>
                      <h2 className={`text-xl font-bold line-clamp-2 ${isPastScreening ? 'text-idfa-gray-500' : ''}`}>
                        {screening.act}
                      </h2>
                    </div>
                  ) : (
                    <h2 className={`text-xl font-bold mb-3 line-clamp-2 ${isPastScreening ? 'text-idfa-gray-500' : ''}`}>
                      {screening.act}
                    </h2>
                  )}
                  <div className={`space-y-2 text-sm ${isPastScreening ? 'text-idfa-gray-500' : 'text-idfa-gray-600'}`}>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(screeningDateTime)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4" />
                    <span>{formatTime(screeningDateTime)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4" />
                    <span>{screening.location}</span>
                  </div>
                  {screening.ticketCount > 1 && (
                    <div className="flex items-center space-x-2 pt-2">
                      <Ticket className="h-4 w-4" />
                      <span className={`font-medium ${isPastScreening ? 'text-idfa-gray-500' : 'text-idfa-black'}`}>
                        {screening.ticketCount} tickets
                      </span>
                      {screening.ticketCount === 2 && (
                        <CoupleIcon className="ml-1" />
                      )}
                    </div>
                  )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

