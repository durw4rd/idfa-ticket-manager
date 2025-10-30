import { NextRequest, NextResponse } from 'next/server';
import { extractTicketDataFromImage } from '@/lib/openai-processor';
import { extractQRCodeFromImage } from '@/lib/qr-extractor';
import { put } from '@vercel/blob';
import { createTicket } from '@/lib/db';
import { PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';

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
  try {
    const { pageImages }: ProcessPDFRequest = await request.json();

    if (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0) {
      return NextResponse.json({ error: 'Page images array required' }, { status: 400 });
    }

    const totalPages = pageImages.length;
    const results: ProcessedTicketResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process each page image
    for (let i = 0; i < pageImages.length; i++) {
      try {
        const pageImage = pageImages[i];
        
        // Extract ticket data using OpenAI
        let extractedData;
        try {
          extractedData = await extractTicketDataFromImage(pageImage.imageData);
        } catch (openaiError: any) {
          // Handle OpenAI quota/rate limit errors
          if (openaiError?.status === 429 || openaiError?.code === 'insufficient_quota') {
            const errorMsg = openaiError.code === 'insufficient_quota'
              ? 'OpenAI API quota exceeded. Please check your billing and plan details.'
              : 'OpenAI API rate limit exceeded. Please try again later.';
            throw new Error(errorMsg);
          }
          throw openaiError;
        }
        
        // Extract QR code
        const qrCodeBuffer = await extractQRCodeFromImage(pageImage.imageData);
        
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
          pdfUrl: pageImage.pdfUrl || '',
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

