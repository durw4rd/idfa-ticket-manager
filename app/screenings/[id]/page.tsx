import Link from 'next/link';
import { getAllScreenings } from '@/lib/db';
import { ArrowLeft, Calendar, MapPin, Clock, QrCode } from 'lucide-react';
import { parseTicketDateTime } from '@/lib/db';
import Image from 'next/image';

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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href="/screenings"
        className="inline-flex items-center space-x-2 text-idfa-gray-600 hover:text-idfa-black mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Screenings</span>
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-6">{screening.act}</h1>
        
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
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold mb-6">
          QR Code{screening.ticketCount > 1 ? 's' : ''}
        </h2>
        <div className={`grid gap-6 ${screening.ticketCount === 1 ? 'grid-cols-1' : screening.ticketCount === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {screening.tickets.map((ticket, index) => (
            <div
              key={ticket.id}
              className="p-6 border border-idfa-gray-200 rounded-lg bg-white"
            >
              {screening.ticketCount > 1 && (
                <h3 className="text-lg font-semibold mb-4">
                  Ticket {index + 1}
                </h3>
              )}
              <div className="flex justify-center bg-white p-4 rounded">
                <Image
                  src={ticket.qrCodeUrl}
                  alt={`QR code for ${screening.act} - Ticket ${index + 1}`}
                  width={300}
                  height={300}
                  className="max-w-full h-auto"
                  unoptimized
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

