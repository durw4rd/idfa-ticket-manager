'use client';

import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Field';

/** Pick or drop PDFs. Choosing files starts the upload straight away. */
export default function UploadSelect({ onFiles, error }: { onFiles: (files: File[]) => void; error: string | null }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-4 pt-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles(Array.from(event.dataTransfer.files));
        }}
        className={`flex flex-col items-center rounded border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-ink bg-ink/5' : 'border-line-strong'
        }`}
      >
        <FileUp className="mb-4 h-10 w-10 text-ink-3" strokeWidth={1.5} />
        <p className="font-display text-lg">Add your IDFA tickets</p>
        <p className="mt-1 max-w-xs text-sm text-ink-2">
          Choose the PDFs from your order confirmation. Each page becomes a ticket; you can check the details next.
        </p>
        <label
          className={buttonClasses(
            'primary',
            'md',
            'mt-6 cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink',
          )}
        >
          Choose PDFs
          <input
            type="file"
            multiple
            accept="application/pdf"
            className="sr-only"
            onChange={(event) => event.target.files && onFiles(Array.from(event.target.files))}
          />
        </label>
      </div>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
