import { NextResponse } from 'next/server';
import { getAllScreenings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const screenings = await getAllScreenings();
    
    // Convert Date objects to ISO strings for JSON serialization
    const serializedScreenings = screenings.map(screening => ({
      ...screening,
      dateTime: screening.dateTime.toISOString(),
      tickets: screening.tickets.map(ticket => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
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

