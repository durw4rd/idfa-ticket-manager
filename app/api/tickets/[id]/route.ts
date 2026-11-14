import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { deleteTicket, updateTicketDetails, updateTicketFestivalLink } from '@/lib/db';
import { findFestivalLink } from '@/lib/find-festival-link';
import { getFestivalLink } from '@/lib/festival-links';
import { deleteTicketFiles } from '@/lib/storage';
import { flushLdEvents, trackEvent, userContext } from '@/lib/launchdarkly';
import { normalizeStartTime, parseTicketDateTime } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LaunchDarkly metric: 1 when a user had to correct AI-extracted ticket fields, 0 when they were right
const EXTRACTION_CORRECTED_EVENT = 'ticket-extraction-corrected';

const DATE_PATTERN = /^\d{2}-\d{2}-\d{4}$/;
const START_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

interface UpdateTicketRequest {
  fields?: { act: string; location: string; date: string; start: string };
  // Sent from the upload review step: whether the user changed what the AI extracted
  review?: { corrected: boolean };
}

// PATCH: Fix a ticket's details, and/or record extraction review feedback
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  try {
    const body: UpdateTicketRequest = await request.json();
    let ticket = null;

    if (body.fields) {
      const act = body.fields.act?.trim();
      const location = body.fields.location?.trim();
      const date = body.fields.date?.trim();
      const start = body.fields.start?.trim();

      if (!act || !location || !date || !start) {
        return NextResponse.json({ error: 'Title, venue, date, and time are required' }, { status: 400 });
      }
      if (!DATE_PATTERN.test(date) || !START_PATTERN.test(start)) {
        return NextResponse.json(
          { error: 'Date must be DD-MM-YYYY and time must be HH:MM AM/PM' },
          { status: 400 }
        );
      }
      try {
        parseTicketDateTime(date, start);
      } catch (parseError) {
        return NextResponse.json(
          { error: parseError instanceof Error ? parseError.message : 'Invalid date or time' },
          { status: 400 }
        );
      }

      ticket = await updateTicketDetails(viewer.email, id, {
        act,
        location,
        date,
        start: normalizeStartTime(start),
      });
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      // A corrected title drops the old film's IDFA page. Find the new one once the response is
      // sent; the overview, availability, end time and Q&A all hang off that link.
      if (!ticket.festivalLink) {
        const { id: ticketId, act: title, festivalYear } = ticket;
        after(async () => {
          try {
            const link =
              (await findFestivalLink(title, festivalYear, userContext(viewer.email))) ||
              getFestivalLink(title, festivalYear);
            if (link) await updateTicketFestivalLink(viewer.email, ticketId, title, festivalYear, link);
          } catch (linkError) {
            console.warn(`Could not find the festival link for "${title}":`, linkError);
          } finally {
            await flushLdEvents();
          }
        });
      }
    }

    if (body.review) {
      await trackEvent(
        EXTRACTION_CORRECTED_EVENT,
        userContext(viewer.email),
        { ticketId: id },
        body.review.corrected ? 1 : 0
      );
      after(flushLdEvents);
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to update ticket', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove one of your own tickets
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  try {
    const deleted = await deleteTicket(viewer.email, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // The PDF can hold several tickets, so only the QR code is removed
    await deleteTicketFiles([deleted.qrCodeUrl]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return NextResponse.json(
      { error: 'Failed to delete ticket', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
