'use client';

import { useState } from 'react';
import { Upload, File, X, Loader2 } from 'lucide-react';
import { pdfFileToImages, PDFPageImage } from '@/lib/pdf-client-utils';

export default function UploadTicket() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf'
    );
    setFiles(prev => [...prev, ...droppedFiles]);
    setError(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        file => file.type === 'application/pdf'
      );
      setFiles(prev => [...prev, ...selectedFiles]);
      setError(null);
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

    setUploading(true);
    setProcessing(false);
    setError(null);
    setSuccess(null);

    try {
      let totalPages = 0;

      // First, convert all PDFs to images on the client
      const allPageImages: Array<PDFPageImage & { pdfUrl?: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });
        setProcessing(true);

        try {
          // Convert PDF to images on client side
          const pageImages = await pdfFileToImages(file);
          
          // Optionally upload PDF to blob storage for reference (via API route)
          let pdfUrl = '';
          try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadResponse = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });
            if (uploadResponse.ok) {
              const { url } = await uploadResponse.json();
              pdfUrl = url;
            }
          } catch (e) {
            console.warn('Failed to upload PDF, continuing without PDF URL:', e);
          }

          // Add PDF URL to each page image
          pageImages.forEach(page => {
            allPageImages.push({
              ...page,
              pdfUrl,
            });
          });

          const pagesCount = pageImages.length;
          totalPages += pagesCount;
          setTotalPages(totalPages);
        } catch (err) {
          console.error(`Failed to process ${file.name}:`, err);
          throw new Error(`Failed to convert ${file.name} to images: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Now send all page images to server for processing
      setProcessing(true);
      setProgress({ current: 0, total: totalPages });

      const processResponse = await fetch('/api/process-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageImages: allPageImages.map(page => ({
            pageNumber: page.pageNumber,
            imageData: page.imageData,
            pdfUrl: page.pdfUrl,
          })),
        }),
      });

      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        throw new Error(errorData.error || `Failed to process tickets`);
      }

      const summary = await processResponse.json();
      
      if (summary.failed > 0) {
        console.warn(`Some pages failed to process: ${summary.failed} out of ${summary.totalPages}`);
      }

      setSuccess(`Successfully processed ${summary.successful} ticket${summary.successful !== 1 ? 's' : ''} from ${files.length} PDF${files.length > 1 ? 's' : ''}`);
      setFiles([]);
      setTimeout(() => {
        window.location.href = '/screenings';
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUploading(false);
      setProcessing(false);
      setProgress({ current: 0, total: 0 });
      setTotalPages(0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Upload Tickets</h1>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-idfa-gray-300 rounded-lg p-12 text-center hover:border-idfa-black transition-colors mb-8"
      >
        <Upload className="mx-auto h-12 w-12 text-idfa-gray-400 mb-4" />
        <p className="text-lg mb-2">Drag and drop PDF tickets here</p>
        <p className="text-sm text-idfa-gray-600 mb-4">or</p>
        <label className="cursor-pointer inline-block px-6 py-3 bg-idfa-black text-white rounded hover:bg-idfa-gray-800 transition-colors">
          Select Files
          <input
            type="file"
            multiple
            accept="application/pdf"
            onChange={handleFileSelect}
            className="hidden"
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
                <div className="flex items-center space-x-3">
                  <File className="h-5 w-5 text-idfa-gray-600" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-idfa-gray-600">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-2 hover:bg-idfa-gray-200 rounded"
                  disabled={uploading || processing}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(uploading || processing) && (
        <div className="mb-8 p-4 bg-idfa-gray-50 rounded border border-idfa-gray-200">
          <div className="flex items-center space-x-3 mb-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="font-medium">
              {uploading && `Converting PDF ${progress.current} of ${progress.total} to images...`}
              {processing && `Processing ${totalPages} ticket${totalPages !== 1 ? 's' : ''}: extracting information...`}
            </p>
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

      {success && (
        <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded text-green-800">
          {success}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={files.length === 0 || uploading || processing}
        className="w-full px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading || processing ? 'Processing...' : 'Upload and Process'}
      </button>
    </div>
  );
}
