import { NextRequest, NextResponse, after } from 'next/server';
import { extractTicketDataFromImage } from '@/lib/ticket-extractor';
import { extractQRCodeFromImage } from '@/lib/qr-extractor';
import { createTicketUnlessDuplicate, findTicketByQrHash, getTicketsForYear, ticketUsesQrCodeUrl } from '@/lib/db';
import { PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';
import { requireAuth } from '@/lib/auth-helpers';
import { findFestivalLink } from '@/lib/find-festival-link';
import { getFestivalLink } from '@/lib/festival-links';
import { flushLdEvents, userContext } from '@/lib/launchdarkly';
import { deleteTicketFiles, isOwnTicketPdfUrl, uploadTicketFile } from '@/lib/storage';
import { getCurrentFestivalYear, getFestivalYear, parseTicketDateTime } from '@/lib/dates';
import { mayLackQrCode, parsePdfHash, ticketDedupKey } from '@/lib/ticket-dedup';
import { validateTicketFields } from '@/lib/ticket-fields';
import { getShowDetails } from '@/lib/idfa';
import { ensureFilmPlace } from '@/lib/find-film-place';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessPDFRequest {
  pageImages: Array<{
    pageNumber: number;
    imageData: string; // Base64 encoded image
    pdfUrl?: string; // Optional: URL of original PDF for reference
    pdfHash?: string; // SHA-256 of the PDF file: the duplicate key for tickets without a QR code
  }>;
}

export async function POST(request: NextRequest) {
  // Check authentication
  const { viewer, error } = await requireAuth();
  if (error) return error;

  // Deliver AI metrics and custom events to LaunchDarkly after the response is sent
  after(flushLdEvents);

  try {
    const { pageImages }: ProcessPDFRequest = await request.json();

    if (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0) {
      return NextResponse.json({ error: 'Page images array required' }, { status: 400 });
    }
    // One page per request keeps the body under Vercel's 4.5 MB limit and each call short
    if (pageImages.length > 1) {
      return NextResponse.json({ error: 'Send one page per request' }, { status: 400 });
    }

    const context = userContext(viewer.email);
    const totalPages = pageImages.length;
    const results: ProcessedTicketResult[] = [];
    let successful = 0;
    let failed = 0;
    let duplicates = 0;

    // Process each page image
    for (let i = 0; i < pageImages.length; i++) {
      try {
        const pageImage = pageImages[i];

        // Extract the QR code first: it's cheap, and lets us skip tickets we already have
        // before paying for the AI calls (the insert below re-checks atomically)
        const qrCode = await extractQRCodeFromImage(pageImage.imageData);

        // Tickets from older editions have no QR code; for those the PDF file and page identify
        // the ticket instead (see lib/ticket-dedup.ts)
        const qrHash = ticketDedupKey({
          qrPayload: qrCode?.payload ?? null,
          pdfHash: parsePdfHash(pageImage.pdfHash),
          pageNumber: pageImage.pageNumber,
        });
        const existing = qrHash ? await findTicketByQrHash(viewer.visibleEmails, qrHash) : null;
        if (existing) {
          results.push({
            ticketId: existing.id,
            screeningKey: `${existing.act}|${existing.date}|${existing.start}`,
            success: false,
            duplicate: true,
            error: `Already uploaded: ${existing.act} on ${existing.date}`,
          });
          duplicates++;
          continue;
        }

        // Extract ticket data with the model served by LaunchDarkly
        let extractedData;
        try {
          extractedData = await extractTicketDataFromImage(pageImage.imageData, context);
        } catch (aiError: any) {
          // Handle OpenAI quota/rate limit errors
          if (aiError?.status === 429 || aiError?.code === 'insufficient_quota') {
            const errorMsg = aiError.code === 'insufficient_quota'
              ? 'AI provider quota exceeded. Please check your billing and plan details.'
              : 'AI provider rate limit exceeded. Please try again later.';
            throw new Error(errorMsg);
          }
          throw aiError;
        }

        // Check what the model read before storing anything, so a bad read leaves no file behind
        const checked = validateTicketFields(extractedData);
        if (!checked.ok) {
          throw new Error(`Couldn't read this ticket: ${checked.error}`);
        }
        const { act, location, date, start } = checked.fields;
        const festivalYear = getFestivalYear(date);
        const screeningKey = `${act}|${date}|${start}`;

        // Only a past edition's ticket may be saved without a QR code: a current one without it
        // won't get anyone into the cinema, so that's a failed read
        if (!qrCode && !mayLackQrCode(festivalYear, getCurrentFestivalYear())) {
          throw new Error('Could not extract QR code');
        }

        const qrCodeUrl = qrCode ? await uploadTicketFile(viewer.email, 'qr-codes', qrCode.image, 'image/png') : '';

        let created: Awaited<ReturnType<typeof createTicketUnlessDuplicate>>;
        try {
          // Reuse a festival link we already found for this film, then try AI, then the hardcoded mapping
          const knownTickets = await getTicketsForYear(viewer.visibleEmails, festivalYear);
          let festivalLink: string | null = knownTickets.find((t) => t.act === act && t.festivalLink)?.festivalLink || null;

          if (!festivalLink) {
            try {
              festivalLink = await findFestivalLink(act, festivalYear, context);
            } catch (error) {
              console.warn(`AI search failed for "${act}":`, error);
            }
          }

          if (!festivalLink) {
            festivalLink = getFestivalLink(act, festivalYear);
          }

          // The end time and Q&A aren't on the ticket; the film's IDFA page has them
          const showDetails = await getShowDetails(festivalLink, act, parseTicketDateTime(date, start));

          // Create ticket in database, unless a group member saved the same ticket in the meantime
          created = await createTicketUnlessDuplicate(viewer.visibleEmails, {
            act,
            location,
            date,
            start,
            qrCodeUrl,
            // Only keep a PDF link this app stored for this user (the client sends it back to us)
            pdfUrl: pageImage.pdfUrl && isOwnTicketPdfUrl(viewer.email, pageImage.pdfUrl) ? pageImage.pdfUrl : '',
            festivalLink: festivalLink || undefined,
            endsAt: showDetails?.endsAt,
            hasQa: showDetails?.hasQa,
            ownerEmail: viewer.email,
            qrHash,
          });
        } catch (saveError) {
          // Nothing refers to the QR file unless the ticket was saved. The insert can have committed
          // even though the call failed (a connection lost before COMMIT was acknowledged), so only
          // delete the file once the database confirms no ticket uses it; when that can't be
          // checked either, keep it (a stray file is harmless, a ticket without its QR is not)
          try {
            if (qrCodeUrl && !(await ticketUsesQrCodeUrl(viewer.email, qrCodeUrl))) {
              await deleteTicketFiles([qrCodeUrl]);
            }
          } catch (checkError) {
            console.warn('Could not check whether the QR file is in use; keeping it:', checkError);
          }
          throw saveError;
        }

        if (created.duplicate) {
          await deleteTicketFiles([qrCodeUrl]);
          const existingTicket = created.duplicate;
          results.push({
            ticketId: existingTicket.id,
            screeningKey: `${existingTicket.act}|${existingTicket.date}|${existingTicket.start}`,
            success: false,
            duplicate: true,
            error: `Already uploaded: ${existingTicket.act} on ${existingTicket.date}`,
          });
          duplicates++;
          continue;
        }

        const ticket = created.ticket;
        results.push({
          ticketId: ticket.id,
          screeningKey,
          success: true,
          extracted: {
            act: ticket.act,
            location: ticket.location,
            date: ticket.date,
            start: ticket.start,
          },
        });

        successful++;

        // Where the film takes place, for the map: after the response, so the upload doesn't wait
        // on the model. Nothing happens if the crew's tickets already have this film placed.
        if (ticket.festivalLink) {
          after(async () => {
            await ensureFilmPlace(viewer, ticket.act, ticket.festivalYear, context);
            await flushLdEvents();
          });
        }
      } catch (error) {
        console.error(`Error processing page ${i + 1}:`, error);
        results.push({
          ticketId: '',
          screeningKey: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    const summary: PDFProcessingSummary = {
      totalPages,
      successful,
      failed,
      duplicates,
      tickets: results,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Process PDF error:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
