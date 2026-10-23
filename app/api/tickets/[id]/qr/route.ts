import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getTicketById } from '@/lib/db';
import { readTicketFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Serves a ticket's QR code image to users who can see the ticket
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  try {
    const ticket = await getTicketById(viewer.visibleEmails, id);
    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const file = await readTicketFile(ticket.qrCodeUrl);
    if (!file) {
      return NextResponse.json({ error: 'QR code not found' }, { status: 404 });
    }

    return new NextResponse(file.stream, {
      headers: {
        'Content-Type': file.contentType,
        // Never serve from cache: every request must pass the auth and visibility checks above,
        // so signing out or leaving a group immediately hides the QR code
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error serving QR code:', error);
    return NextResponse.json({ error: 'Failed to load QR code' }, { status: 500 });
  }
}
