'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { redirectToSignIn } from '@/lib/api-client';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { Notice } from './Field';

/**
 * Sheet that renders a PNG from `src` (one of the poster routes), previews it, and hands it to the
 * phone's share sheet, or downloads it where sharing files isn't supported. `children` go above the
 * preview: the controls that change `src`.
 */
export function ImageShareSheet({
  open,
  onClose,
  title,
  src,
  fileName,
  alt,
  shareTitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  src: string;
  fileName: string;
  alt: string;
  shareTitle: string;
  children?: ReactNode;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    // Drop the previous export first, so a failed request can't share or save the wrong image
    setFile(null);
    setPreview(null);
    setLoading(true);
    setError(null);

    fetch(src)
      .then((response) => {
        if (response.status === 401) {
          redirectToSignIn();
          throw new Error('Your session has ended. Taking you to sign in…');
        }
        if (!response.ok) throw new Error('Could not make the image');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        setFile(new File([blob], fileName, { type: 'image/png' }));
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, src, fileName]);

  const canShare = file && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: shareTitle });
    } catch {
      // The user closed the share sheet
    }
  };

  const download = () => {
    if (!file || !preview) return;
    const link = document.createElement('a');
    link.href = preview;
    link.download = file.name;
    link.click();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {children}

      <div className="max-h-[45vh] overflow-y-auto rounded bg-ink/5">
        {loading || !preview ? (
          <div className="flex h-64 items-center justify-center text-ink-3">
            {error ? null : <Loader2 className="h-6 w-6 animate-spin" />}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={preview} alt={alt} className="h-auto w-full" />
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {canShare && (
          <Button className="flex-1" icon={<Share2 className="h-5 w-5" />} onClick={share} disabled={loading}>
            Share
          </Button>
        )}
        <Button
          className="flex-1"
          variant={canShare ? 'secondary' : 'primary'}
          icon={<Download className="h-5 w-5" />}
          onClick={download}
          disabled={loading || !file}
        >
          Save image
        </Button>
      </div>
    </Sheet>
  );
}
