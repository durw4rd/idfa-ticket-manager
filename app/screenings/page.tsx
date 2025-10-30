import Link from 'next/link';
import { getAllScreenings } from '@/lib/db';
import { Calendar, MapPin, Clock, Ticket } from 'lucide-react';
import { parseTicketDateTime } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

            return (
              <Link
                key={screening.id}
                href={`/screenings/${screeningId}`}
                className="block p-6 border border-idfa-gray-200 rounded-lg hover:border-idfa-black hover:shadow-lg transition-all"
              >
                <h2 className="text-xl font-bold mb-3 line-clamp-2">
                  {screening.act}
                </h2>
                <div className="space-y-2 text-sm text-idfa-gray-600">
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
                      <span className="font-medium text-idfa-black">
                        {screening.ticketCount} tickets
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

