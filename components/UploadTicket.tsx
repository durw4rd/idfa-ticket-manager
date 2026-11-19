'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pdfFileToImages } from '@/lib/pdf-client-utils';
import { readApiResponse } from '@/lib/api-client';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { CrewMember, ExtractedTicketFields, PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';
import UploadSelect from './upload/UploadSelect';
import UploadProgress from './upload/UploadProgress';
import UploadReview from './upload/UploadReview';

type Step = 'select' | 'processing' | 'review';

export interface PageResult extends ProcessedTicketResult {
  fileName: string;
  pageNumber: number;
  // Kept for a page that failed, so it can be tried again without choosing the file again
  retry?: PageSource;
}

export interface ReviewItem {
  ticketId: string;
  original: ExtractedTicketFields;
  draft: ExtractedTicketFields;
  holderEmail: string;
  saved: boolean; // Review sent, so a retry doesn't record the correction metric twice
}

function fieldsChanged(a: ExtractedTicketFields, b: ExtractedTicketFields): boolean {
  return a.act !== b.act || a.location !== b.location || a.date !== b.date || a.start !== b.start;
}

// Pages read at once: about twice as fast as one by one, and the server's per-QR lock
// (createTicketUnlessDuplicate) keeps concurrent inserts safe
const CONCURRENT_PAGES = 2;

/** What the server needs to read one page. `pdfHash` identifies tickets without a QR code. */
interface PageSource {
  imageData: string;
  pdfUrl: string;
  pdfHash?: string;
}

// The duplicate key for tickets from older editions, which have no QR code. crypto.subtle needs a
// secure context; without one those tickets just can't be checked for duplicates.
async function hashFile(file: File): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

/** Send one page to the server (one per request keeps bodies under Vercel's 4.5 MB limit) */
async function processPage(fileName: string, pageNumber: number, source: PageSource): Promise<PageResult> {
  try {
    const response = await fetch('/api/process-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageImages: [{ pageNumber, ...source }] }),
    });
    const summary = await readApiResponse<PDFProcessingSummary>(response, 'Failed to process ticket');
    const result: PageResult = { ...summary.tickets[0], fileName, pageNumber };
    // A duplicate is final; anything else that failed can be tried again
    return result.success || result.duplicate ? result : { ...result, retry: source };
  } catch (err) {
    return {
      ticketId: '',
      screeningKey: '',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      fileName,
      pageNumber,
      retry: source,
    };
  }
}

/**
 * Upload flow: pick PDFs (processing starts right away), watch progress, then check what the AI
 * read and who each ticket is for.
 */
export default function UploadTicket({ crew }: { crew: CrewMember[] }) {
  const router = useRouter();
  const me = crew.find((member) => member.isMe)!;
  const [step, setStep] = useState<Step>('select');
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<PageResult[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The ticket being removed or the page being read again ("page-<index>"), for its spinner
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Leaving now would lose the upload's progress, a page being read again, or review changes that
  // aren't saved yet (tickets themselves are saved as they're read)
  const unsavedReview =
    step === 'review' &&
    reviewItems.some((item) => !item.saved && (fieldsChanged(item.original, item.draft) || item.holderEmail !== me.email));
  useLeaveGuard(
    step === 'processing' || busyKey !== null || unsavedReview,
    step === 'review' && busyKey === null
      ? 'Leave without saving your changes to these tickets?'
      : "Tickets are still being read. Leave anyway? The ones not read yet won't be added."
  );

  const handleUpload = async (files: File[]) => {
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      setError('Choose the PDF tickets from your IDFA order');
      return;
    }

    setStep('processing');
    setError(null);

    try {
      // Convert all PDFs to page images on the client first, so we know the total page count
      const pdfs: Array<{
        file: File;
        pages: Awaited<ReturnType<typeof pdfFileToImages>>;
        pdfUrl: string;
        pdfHash?: string;
      }> = [];
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        setStatus(`Opening ${file.name}`);
        setProgress({ current: 0, total: 0 });

        let pages;
        try {
          pages = await pdfFileToImages(file);
        } catch (err) {
          throw new Error(`Failed to read ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }

        // Keep the original PDF for reference (best effort)
        let pdfUrl = '';
        try {
          const formData = new FormData();
          formData.append('file', file);
          const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
          if (uploadResponse.ok) {
            pdfUrl = (await uploadResponse.json()).url;
          }
        } catch (e) {
          console.warn('Failed to upload PDF, continuing without PDF URL:', e);
        }

        pdfs.push({ file, pages, pdfUrl, pdfHash: await hashFile(file) });
      }

      const jobs = pdfs.flatMap((pdf) => pdf.pages.map((page) => ({ pdf, page })));
      const pageResults: PageResult[] = new Array(jobs.length);
      let nextJob = 0;
      let processed = 0;
      setStatus(`Reading ${jobs.length === 1 ? 'your ticket' : `${jobs.length} tickets`}`);
      setProgress({ current: 0, total: jobs.length });

      const worker = async () => {
        while (nextJob < jobs.length) {
          const index = nextJob++;
          const { pdf, page } = jobs[index];
          pageResults[index] = await processPage(pdf.file.name, page.pageNumber, {
            imageData: page.imageData,
            pdfUrl: pdf.pdfUrl,
            pdfHash: pdf.pdfHash,
          });
          processed++;
          setStatus(`Read ${processed} of ${jobs.length} ${jobs.length === 1 ? 'ticket' : 'tickets'}`);
          setProgress({ current: processed, total: jobs.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENT_PAGES, jobs.length) }, worker));

      setResults(pageResults);
      setReviewItems(pageResults.filter((r) => r.success && r.extracted).map((r) => toReviewItem(r, me.email)));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('select');
    }
  };

  const updateItem = (ticketId: string, change: Partial<Pick<ReviewItem, 'draft' | 'holderEmail'>>) => {
    setReviewItems((items) => items.map((item) => (item.ticketId === ticketId ? { ...item, ...change } : item)));
  };

  // Read a failed page again; a success joins the tickets to check
  const retryPage = async (index: number) => {
    const failed = results[index];
    if (!failed?.retry) return;
    setBusyKey(`page-${index}`);
    setError(null);
    const result = await processPage(failed.fileName, failed.pageNumber, failed.retry);
    setResults((current) => current.map((r, i) => (i === index ? result : r)));
    if (result.success && result.extracted) {
      setReviewItems((items) => [...items, toReviewItem(result, me.email)]);
    }
    setBusyKey(null);
  };

  // Tickets are saved as they're read, so taking one out of the review deletes it
  const removeItem = async (ticketId: string): Promise<boolean> => {
    setBusyKey(ticketId);
    setError(null);
    try {
      await readApiResponse(await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' }), 'Could not remove the ticket');
      setReviewItems((items) => items.filter((item) => item.ticketId !== ticketId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the ticket');
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  // Save corrections and holders from the review step. Returns false (and shows the error) if saving failed.
  const saveReview = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      for (const item of reviewItems) {
        if (item.saved) {
          continue;
        }
        // Save corrections, and tell LaunchDarkly whether the AI got each ticket right
        const corrected = fieldsChanged(item.original, item.draft);
        const response = await fetch(`/api/tickets/${item.ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(corrected ? { fields: item.draft } : {}),
            review: { corrected },
          }),
        });
        await readApiResponse(response, 'Failed to save changes').catch((err: Error) => {
          throw new Error(`${item.draft.act}: ${err.message}`);
        });
        // New tickets are held by the uploader; hand over the ones meant for someone else
        if (item.holderEmail !== me.email) {
          const holderResponse = await fetch(`/api/tickets/${item.ticketId}/holder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holderEmail: item.holderEmail }),
          });
          await readApiResponse(holderResponse, 'Failed to set who the ticket is for').catch((err: Error) => {
            throw new Error(`${item.draft.act}: ${err.message}`);
          });
        }
        setReviewItems((items) => items.map((i) => (i.ticketId === item.ticketId ? { ...i, saved: true } : i)));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!(await saveReview())) {
      return;
    }
    const year = reviewItems[0]?.draft.date.split('-')[2];
    router.push(year ? `/screenings?year=${year}` : '/screenings');
    router.refresh();
  };

  // Save the reviewed tickets first, so edits aren't lost when starting another upload
  const handleUploadMore = async () => {
    if (!(await saveReview())) {
      return;
    }
    setResults([]);
    setReviewItems([]);
    setStep('select');
  };

  if (step === 'review') {
    return (
      <UploadReview
        crew={crew}
        items={reviewItems}
        results={results}
        saving={saving}
        busyKey={busyKey}
        error={error}
        onChange={updateItem}
        onRemove={removeItem}
        onRetry={retryPage}
        isEdited={(item) => fieldsChanged(item.original, item.draft)}
        onFinish={handleFinish}
        onUploadMore={handleUploadMore}
      />
    );
  }

  if (step === 'processing') {
    return <UploadProgress status={status} progress={progress} />;
  }

  return <UploadSelect onFiles={handleUpload} error={error} />;
}

function toReviewItem(result: PageResult, holderEmail: string): ReviewItem {
  return {
    ticketId: result.ticketId,
    original: result.extracted!,
    draft: { ...result.extracted! },
    holderEmail,
    saved: false,
  };
}
