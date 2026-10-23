import { NextRequest, NextResponse, after } from 'next/server';
import { createHash } from 'crypto';
import { extractTicketDataFromImage } from '@/lib/ticket-extractor';
import { extractQRCodeFromImage } from '@/lib/qr-extractor';
import { createTicketUnlessDuplicate, findTicketByQrHash, getTicketsForYear } from '@/lib/db';
import { PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';
import { requireAuth } from '@/lib/auth-helpers';
import { findFestivalLink } from '@/lib/find-festival-link';
import { getFestivalLink } from '@/lib/festival-links';
import { flushLdEvents, userContext } from '@/lib/launchdarkly';
import { deleteTicketFiles, uploadTicketFile } from '@/lib/storage';
import { getFestivalYear, normalizeStartTime } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessPDFRequest {
  pageImages: Array<{
    pageNumber: number;
    imageData: string; // Base64 encoded image
    pdfUrl?: string; // Optional: URL of original PDF for reference
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

        if (!qrCode) {
          throw new Error('Could not extract QR code');
        }

        const qrHash = createHash('sha256').update(qrCode.payload).digest('hex');
        const existing = await findTicketByQrHash(viewer.visibleEmails, qrHash);
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

        const start = normalizeStartTime(extractedData.start);
        const festivalYear = getFestivalYear(extractedData.date);

        const qrCodeUrl = await uploadTicketFile(viewer.email, 'qr-codes', qrCode.image, 'image/png');

        // Create screening key
        const screeningKey = `${extractedData.act}|${extractedData.date}|${start}`;

        // Reuse a festival link we already found for this film, then try AI, then the hardcoded mapping
        const knownTickets = await getTicketsForYear(viewer.visibleEmails, festivalYear);
        let festivalLink: string | null =
          knownTickets.find((t) => t.act === extractedData.act && t.festivalLink)?.festivalLink || null;

        if (!festivalLink) {
          try {
            festivalLink = await findFestivalLink(extractedData.act, festivalYear, context);
          } catch (error) {
            console.warn(`AI search failed for "${extractedData.act}":`, error);
          }
        }

        if (!festivalLink) {
          festivalLink = getFestivalLink(extractedData.act, festivalYear);
        }

        // Create ticket in database, unless a group member saved the same ticket in the meantime
        const created = await createTicketUnlessDuplicate(viewer.visibleEmails, {
          act: extractedData.act,
          location: extractedData.location,
          date: extractedData.date,
          start,
          qrCodeUrl,
          pdfUrl: pageImage.pdfUrl || '',
          festivalLink: festivalLink || undefined,
          ownerEmail: viewer.email,
          qrHash,
        });

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
