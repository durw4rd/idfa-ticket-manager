'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pdfFileToImages } from '@/lib/pdf-client-utils';
import { CrewMember, ExtractedTicketFields, PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';
import UploadSelect from './upload/UploadSelect';
import UploadProgress from './upload/UploadProgress';
import UploadReview from './upload/UploadReview';

type Step = 'select' | 'processing' | 'review';

export interface PageResult extends ProcessedTicketResult {
  fileName: string;
  pageNumber: number;
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

  const handleUpload = async (files: File[]) => {
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      setError('Choose the PDF tickets from your IDFA order');
      return;
    }

    setStep('processing');
    setError(null);
    const pageResults: PageResult[] = [];

    try {
      // Convert all PDFs to page images on the client first, so we know the total page count
      const pdfs: Array<{ file: File; pages: Awaited<ReturnType<typeof pdfFileToImages>>; pdfUrl: string }> = [];
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

        pdfs.push({ file, pages, pdfUrl });
      }

      // Process one page per request: keeps request bodies small and shows real progress
      const totalPages = pdfs.reduce((sum, pdf) => sum + pdf.pages.length, 0);
      let processed = 0;
      for (const pdf of pdfs) {
        for (const page of pdf.pages) {
          setStatus(`Reading ticket ${processed + 1} of ${totalPages}`);
          setProgress({ current: processed, total: totalPages });

          try {
            const response = await fetch('/api/process-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pageImages: [{ pageNumber: page.pageNumber, imageData: page.imageData, pdfUrl: pdf.pdfUrl }],
              }),
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || 'Failed to process ticket');
            }
            const summary: PDFProcessingSummary = await response.json();
            pageResults.push({ ...summary.tickets[0], fileName: pdf.file.name, pageNumber: page.pageNumber });
          } catch (err) {
            pageResults.push({
              ticketId: '',
              screeningKey: '',
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
              fileName: pdf.file.name,
              pageNumber: page.pageNumber,
            });
          }

          processed++;
          setProgress({ current: processed, total: totalPages });
        }
      }

      setResults(pageResults);
      setReviewItems(
        pageResults
          .filter((r) => r.success && r.extracted)
          .map((r) => ({
            ticketId: r.ticketId,
            original: r.extracted!,
            draft: { ...r.extracted! },
            holderEmail: me.email,
            saved: false,
          }))
      );
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('select');
    }
  };

  const updateItem = (ticketId: string, change: Partial<Pick<ReviewItem, 'draft' | 'holderEmail'>>) => {
    setReviewItems((items) => items.map((item) => (item.ticketId === ticketId ? { ...item, ...change } : item)));
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
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(`${item.draft.act}: ${data.error || 'Failed to save changes'}`);
        }
        // New tickets are held by the uploader; hand over the ones meant for someone else
        if (item.holderEmail !== me.email) {
          const holderResponse = await fetch(`/api/tickets/${item.ticketId}/holder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holderEmail: item.holderEmail }),
          });
          if (!holderResponse.ok) {
            const data = await holderResponse.json().catch(() => ({}));
            throw new Error(`${item.draft.act}: ${data.error || 'Failed to set who the ticket is for'}`);
          }
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
        error={error}
        onChange={updateItem}
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
