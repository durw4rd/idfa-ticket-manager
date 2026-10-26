import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { updateTicketHolder } from '@/lib/db';
import { normalizeEmail } from '@/lib/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT: Hand a ticket to someone in your group. Allowed for the ticket's owner and its current holder.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const holderEmail = typeof body?.holderEmail === 'string' ? normalizeEmail(body.holderEmail) : '';

    // The holder must be someone whose tickets you can see, i.e. you or an active crew-mate
    if (!holderEmail || !viewer.visibleEmails.includes(holderEmail)) {
      return NextResponse.json({ error: 'The holder must be a member of your group' }, { status: 400 });
    }

    const ticket = await updateTicketHolder(viewer, id, holderEmail);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, holderEmail: ticket.holderEmail });
  } catch (error) {
    console.error('Error updating ticket holder:', error);
    return NextResponse.json({ error: 'Failed to update ticket holder' }, { status: 500 });
  }
}
