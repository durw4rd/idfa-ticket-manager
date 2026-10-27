'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Share } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { Notice } from '@/components/ui/Field';

/**
 * Header button that renders the festival poster (a PNG from /api/agenda/poster) and hands it to the
 * phone's share sheet, or downloads it where sharing files isn't supported.
 */
export default function SharePosterButton({ year, crew }: { year: number; crew: CrewMember[] }) {
  const [open, setOpen] = useState(false);
  // 'all' or an index into `crew`, matching the poster route's `who` parameter
  const [who, setWho] = useState<string>(String(crew.findIndex((member) => member.isMe)));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    // Drop the previous export first, so a failed request can't share or save someone else's poster
    setFile(null);
    setPreview(null);
    setLoading(true);
    setError(null);

    fetch(`/api/agenda/poster?year=${year}&who=${who}`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not make the poster');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const name = who === 'all' ? 'crew' : crew[Number(who)]?.name.toLowerCase() || 'agenda';
        setFile(new File([blob], `idfa-${year}-${name}.png`, { type: 'image/png' }));
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, who, year, crew]);

  const canShare = file && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `IDFA ${year}` });
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
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Share agenda poster"
        icon={<Share className="h-5 w-5" />}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Share your festival">
        {crew.length > 1 && (
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
            {crew.map((member, index) => (
              <Chip
                key={member.email}
                selected={who === String(index)}
                icon={<Avatar member={member} size="sm" />}
                onClick={() => setWho(String(index))}
              >
                {member.isMe ? 'Me' : member.name}
              </Chip>
            ))}
            <Chip selected={who === 'all'} onClick={() => setWho('all')}>
              Everyone
            </Chip>
          </div>
        )}

        <div className="max-h-[45vh] overflow-y-auto rounded bg-ink/5">
          {loading || !preview ? (
            <div className="flex h-64 items-center justify-center text-ink-3">
              {error ? null : <Loader2 className="h-6 w-6 animate-spin" />}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={preview} alt="Agenda poster preview" className="h-auto w-full" />
          )}
        </div>
        {error && (
          <div className="mt-3">
            <Notice>{error}</Notice>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {canShare && (
            <Button className="flex-1" icon={<Share className="h-5 w-5" />} onClick={share} disabled={loading}>
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
    </>
  );
}
