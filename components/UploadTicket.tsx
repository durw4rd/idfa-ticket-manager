'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, File, X, Loader2, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { pdfFileToImages } from '@/lib/pdf-client-utils';
import { ExtractedTicketFields, PDFProcessingSummary, ProcessedTicketResult } from '@/lib/types';

type Step = 'select' | 'processing' | 'review';

interface PageResult extends ProcessedTicketResult {
  fileName: string;
  pageNumber: number;
}

interface ReviewItem {
  ticketId: string;
  original: ExtractedTicketFields;
  draft: ExtractedTicketFields;
}

function fieldsChanged(a: ExtractedTicketFields, b: ExtractedTicketFields): boolean {
  return a.act !== b.act || a.location !== b.location || a.date !== b.date || a.start !== b.start;
}

export default function UploadTicket() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<Step>('select');
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<PageResult[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles.filter(file => file.type === 'application/pdf')]);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one PDF file');
      return;
    }

    setStep('processing');
    setError(null);
    const pageResults: PageResult[] = [];

    try {
      // Convert all PDFs to page images on the client first, so we know the total page count
      const pdfs: Array<{ file: File; pages: Awaited<ReturnType<typeof pdfFileToImages>>; pdfUrl: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(`Reading ${file.name}...`);
        setProgress({ current: i, total: files.length });

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
          setStatus(`Reading ticket ${processed + 1} of ${totalPages}...`);
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
          .filter(r => r.success && r.extracted)
          .map(r => ({ ticketId: r.ticketId, original: r.extracted!, draft: { ...r.extracted! } }))
      );
      setFiles([]);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('select');
    }
  };

  const updateDraft = (ticketId: string, field: keyof ExtractedTicketFields, value: string) => {
    setReviewItems(items =>
      items.map(item => (item.ticketId === ticketId ? { ...item, draft: { ...item.draft, [field]: value } } : item))
    );
  };

  const handleFinish = async () => {
    setSaving(true);
    setError(null);

    try {
      // Save corrections, and tell LaunchDarkly whether the AI got each ticket right
      for (const item of reviewItems) {
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
      }

      const year = reviewItems[0]?.draft.date.split('-')[2];
      router.push(year ? `/screenings?year=${year}` : '/screenings');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      setSaving(false);
    }
  };

  const failed = results.filter(r => !r.success && !r.duplicate);
  const duplicates = results.filter(r => r.duplicate);
  const inputClass =
    'w-full px-3 py-2 border border-idfa-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-idfa-black focus:border-transparent';

  if (step === 'review') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-3xl font-bold mb-2">Check your tickets</h1>
        <p className="text-idfa-gray-600 mb-8">
          The details below were read by AI. Fix anything that looks wrong, then save.
        </p>

        {reviewItems.length > 0 && (
          <div className="space-y-4 mb-8">
            {reviewItems.map(item => (
              <div key={item.ticketId} className="p-4 border border-idfa-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{fieldsChanged(item.original, item.draft) ? 'Edited' : 'Read successfully'}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-idfa-gray-600">Title</span>
                    <input className={inputClass} value={item.draft.act} onChange={e => updateDraft(item.ticketId, 'act', e.target.value)} />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-idfa-gray-600">Venue</span>
                    <input className={inputClass} value={item.draft.location} onChange={e => updateDraft(item.ticketId, 'location', e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-idfa-gray-600">Date (DD-MM-YYYY)</span>
                    <input className={inputClass} value={item.draft.date} onChange={e => updateDraft(item.ticketId, 'date', e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-idfa-gray-600">Time (HH:MM AM/PM)</span>
                    <input className={inputClass} value={item.draft.start} onChange={e => updateDraft(item.ticketId, 'start', e.target.value)} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="mb-6 p-4 bg-idfa-gray-50 border border-idfa-gray-200 rounded">
            <p className="flex items-center gap-2 font-medium mb-2">
              <Copy className="h-4 w-4" />
              {duplicates.length} ticket{duplicates.length !== 1 ? 's were' : ' was'} already uploaded and skipped
            </p>
            <ul className="text-sm text-idfa-gray-600 list-disc pl-6">
              {duplicates.map((r, i) => (
                <li key={i}>{r.error}</li>
              ))}
            </ul>
          </div>
        )}

        {failed.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-800">
            <p className="flex items-center gap-2 font-medium mb-2">
              <AlertTriangle className="h-4 w-4" />
              {failed.length} page{failed.length !== 1 ? 's' : ''} could not be processed
            </p>
            <ul className="text-sm list-disc pl-6">
              {failed.map((r, i) => (
                <li key={i}>
                  {r.fileName}, page {r.pageNumber}: {r.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-800">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {reviewItems.length > 0 ? (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Looks good, go to my screenings'}
            </button>
          ) : (
            <button
              onClick={() => router.push('/screenings')}
              className="flex-1 px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
            >
              Go to my screenings
            </button>
          )}
          <button
            onClick={() => {
              setResults([]);
              setReviewItems([]);
              setStep('select');
            }}
            disabled={saving}
            className="px-6 py-3 border border-idfa-gray-300 font-medium rounded hover:border-idfa-black transition-colors"
          >
            Upload more
          </button>
        </div>
      </div>
    );
  }

  const isProcessing = step === 'processing';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="text-3xl font-bold mb-8">Upload Tickets</h1>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-idfa-gray-300 rounded-lg p-8 sm:p-12 text-center hover:border-idfa-black transition-colors mb-8"
      >
        <Upload className="mx-auto h-12 w-12 text-idfa-gray-400 mb-4" />
        <p className="text-lg mb-2 hidden sm:block">Drag and drop PDF tickets here</p>
        <p className="text-sm text-idfa-gray-600 mb-4 hidden sm:block">or</p>
        <label className="cursor-pointer inline-block px-6 py-3 bg-idfa-black text-white rounded hover:bg-idfa-gray-800 transition-colors">
          Select PDF files
          <input
            type="file"
            multiple
            accept="application/pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isProcessing}
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Selected Files</h2>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-idfa-gray-50 rounded border border-idfa-gray-200"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <File className="h-5 w-5 text-idfa-gray-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-idfa-gray-600">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-2 hover:bg-idfa-gray-200 rounded"
                  disabled={isProcessing}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="mb-8 p-4 bg-idfa-gray-50 rounded border border-idfa-gray-200">
          <div className="flex items-center space-x-3 mb-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="font-medium">{status}</p>
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-idfa-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-idfa-black h-2 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded text-red-800">
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={files.length === 0 || isProcessing}
        className="w-full px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? 'Processing...' : 'Upload and Process'}
      </button>
    </div>
  );
}
