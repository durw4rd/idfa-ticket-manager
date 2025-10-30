import { NextRequest, NextResponse } from 'next/server';
import { splitPDFIntoPages } from '@/lib/pdf-splitter';
import { extractTicketDataFromPDFPage } from '@/lib/openai-processor';
import { extractQRCodeFromPDFPage } from '@/lib/qr-extractor';
import { put } from '@vercel/blob';
import { createTicket, getTicketsByScreeningKey } from '@/lib/db';
import { PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { pdfUrl } = await request.json();

    if (!pdfUrl) {
      return NextResponse.json({ error: 'PDF URL required' }, { status: 400 });
    }

    // Fetch PDF from URL
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch PDF');
    }
    const pdfBuffer = Buffer.from(await response.arrayBuffer());

    // Split PDF into pages
    const pageBuffers = await splitPDFIntoPages(pdfBuffer);
    const totalPages = pageBuffers.length;

    const results: ProcessedTicketResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process each page
    for (let i = 0; i < pageBuffers.length; i++) {
      try {
        const pageBuffer = pageBuffers[i];
        
        // Extract ticket data using OpenAI
        const extractedData = await extractTicketDataFromPDFPage(pageBuffer, 0);
        
        // Extract QR code
        const qrCodeBuffer = await extractQRCodeFromPDFPage(pageBuffer, 0);
        
        if (!qrCodeBuffer) {
          throw new Error('Could not extract QR code');
        }

        // Upload QR code to blob storage
        const qrCodeBlob = await put(
          `qr-codes/${Date.now()}-${i}.png`,
          qrCodeBuffer,
          {
            access: 'public',
            contentType: 'image/png',
          }
        );

        // Create screening key
        const screeningKey = `${extractedData.act}|${extractedData.date}|${extractedData.start}`;

        // Create ticket in database
        const ticket = await createTicket({
          act: extractedData.act,
          location: extractedData.location,
          date: extractedData.date,
          start: extractedData.start,
          qrCodeUrl: qrCodeBlob.url,
          pdfUrl: pdfUrl,
        });

        results.push({
          ticketId: ticket.id,
          screeningKey,
          success: true,
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

