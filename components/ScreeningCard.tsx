import Link from 'next/link';
import { Clock, MapPin, Ticket } from 'lucide-react';
import { Screening } from '@/lib/types';
import { formatTime, isPast, isToday } from '@/lib/dates';
import { getVenueBackground } from '@/lib/venue-backgrounds';
import { getDisplayName } from '@/lib/display';
import CoupleIcon from '@/components/CoupleIcon';
import AverageRating from '@/components/AverageRating';

interface ScreeningCardProps {
  screening: Screening;
  viewerEmail: string;
  averageRating?: { average: number; count: number };
}

export default function ScreeningCard({ screening, viewerEmail, averageRating }: ScreeningCardProps) {
  const isPastScreening = isPast(screening.dateTime);
  // Only highlight as "today" if it's today AND not in the past
  const isTodayScreening = isToday(screening.dateTime) && !isPastScreening;

  // Get venue background
  const venueBackground = getVenueBackground(screening.location);

  // Group members whose tickets are part of this screening (other than the viewer)
  const otherOwners = Array.from(new Set(screening.tickets.map((t) => t.ownerEmail))).filter(
    (email) => email !== viewerEmail
  );

  // Determine card classes based on date and venue
  const cardClasses = [
    'block p-5 border rounded-lg transition-all',
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
      href={`/screenings/${encodeURIComponent(screening.id)}`}
      className={cardClasses}
      style={cardStyle}
    >
      <div className="venue-card-content">
        {venueBackground ? (
          <div className="venue-card-header-bg" style={cardStyle}>
            <h3 className={`text-lg font-bold line-clamp-2 ${isPastScreening ? 'text-idfa-gray-500' : ''}`}>
              {screening.act}
            </h3>
          </div>
        ) : (
          <h3 className={`text-lg font-bold mb-3 line-clamp-2 ${isPastScreening ? 'text-idfa-gray-500' : ''}`}>
            {screening.act}
          </h3>
        )}
        <div className={`space-y-2 text-sm ${isPastScreening ? 'text-idfa-gray-500' : 'text-idfa-gray-600'}`}>
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>{formatTime(screening.dateTime)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPin className="h-4 w-4" />
            <span>{screening.location}</span>
          </div>
          {(screening.ticketCount > 1 || otherOwners.length > 0) && (
            <div className="flex items-center space-x-2 pt-1">
              <Ticket className="h-4 w-4" />
              <span className={`font-medium ${isPastScreening ? 'text-idfa-gray-500' : 'text-idfa-black'}`}>
                {screening.ticketCount} ticket{screening.ticketCount !== 1 ? 's' : ''}
              </span>
              {otherOwners.length > 0 && (
                <span className="text-xs text-idfa-gray-500">
                  incl. {otherOwners.map(getDisplayName).join(', ')}
                </span>
              )}
              {screening.ticketCount === 2 && (
                <CoupleIcon className="ml-1" />
              )}
            </div>
          )}
        </div>
        {/* Average Rating */}
        {averageRating && (
          <div className="mt-3 pt-3 border-t border-idfa-gray-200">
            <AverageRating average={averageRating.average} count={averageRating.count} />
          </div>
        )}
      </div>
    </Link>
  );
}
