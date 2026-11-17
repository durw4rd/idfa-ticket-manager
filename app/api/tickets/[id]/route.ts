import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { deleteTicket, getTicketsForYear, updateTicketDetails, updateTicketFestivalLink } from '@/lib/db';
import { findFestivalLink } from '@/lib/find-festival-link';
import { getFestivalLink } from '@/lib/festival-links';
import { deleteTicketFiles } from '@/lib/storage';
import { flushLdEvents, trackEvent, userContext } from '@/lib/launchdarkly';
import { validateTicketFields } from '@/lib/ticket-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How long a title correction waits for the new film's IDFA link before answering (see PATCH)
const FESTIVAL_LINK_WAIT_MS = 4000;

// LaunchDarkly metric: 1 when a user had to correct AI-extracted ticket fields, 0 when they were right
const EXTRACTION_CORRECTED_EVENT = 'ticket-extraction-corrected';

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
      const checked = validateTicketFields(body.fields);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }

      ticket = await updateTicketDetails(viewer.email, id, checked.fields);
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      // A corrected title drops the old film's IDFA page, and the overview, availability, end time
      // and Q&A all hang off that link. The client opens the corrected screening straight after
      // this, so have the link stored by then when we can: reuse one a crew-mate's ticket already
      // has for this film, or look it up, waiting a few seconds. A slower lookup finishes after the
      // response, and the next page load picks it up.
      if (!ticket.festivalLink) {
        const { id: ticketId, act: title, festivalYear } = ticket;
        const save = (async () => {
          try {
            const known = (await getTicketsForYear(viewer.visibleEmails, festivalYear)).find(
              (other) => other.act === title && other.festivalLink
            )?.festivalLink;
            const link =
              known ||
              (await findFestivalLink(title, festivalYear, userContext(viewer.email))) ||
              getFestivalLink(title, festivalYear);
            if (!link) return null;
            await updateTicketFestivalLink(viewer.email, ticketId, title, festivalYear, link);
            return link;
          } catch (linkError) {
            console.warn(`Could not find the festival link for "${title}":`, linkError);
            return null;
          }
        })();

        let timer: ReturnType<typeof setTimeout> | undefined;
        const outcome = await Promise.race([
          save.then((link) => ({ done: true as const, link })),
          new Promise<{ done: false }>((resolve) => {
            timer = setTimeout(() => resolve({ done: false }), FESTIVAL_LINK_WAIT_MS);
          }),
        ]);
        clearTimeout(timer);

        if (outcome.done) {
          if (outcome.link) ticket = { ...ticket, festivalLink: outcome.link };
          after(flushLdEvents);
        } else {
          after(async () => {
            await save;
            await flushLdEvents();
          });
        }
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
