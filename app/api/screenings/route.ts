import { NextRequest, NextResponse } from 'next/server';
import { getScreeningsForYear } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentFestivalYear } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Check authentication
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const year = Number(request.nextUrl.searchParams.get('year')) || getCurrentFestivalYear();
    const screenings = await getScreeningsForYear(viewer.visibleEmails, year);

    // Convert Date objects to ISO strings for JSON serialization; blob URLs stay server-side
    const serializedScreenings = screenings.map(screening => ({
      ...screening,
      dateTime: screening.dateTime.toISOString(),
      tickets: screening.tickets.map(({ qrCodeUrl, pdfUrl, qrHash, ...ticket }) => ({
        ...ticket,
        qrCodeUrl: `/api/tickets/${ticket.id}/qr`,
        startsAt: new Date(ticket.startsAt).toISOString(),
        createdAt: new Date(ticket.createdAt).toISOString(),
      })),
    }));

    return NextResponse.json(serializedScreenings);
  } catch (error) {
    console.error('Error fetching screenings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch screenings' },
      { status: 500 }
    );
  }
}
