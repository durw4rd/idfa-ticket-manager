'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, RotateCw, Trash2 } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import type { PageResult, ReviewItem } from '@/components/UploadTicket';
import TicketFieldsForm from '@/components/TicketFieldsForm';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Notice } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';

/** Check what the AI read from each ticket, and say who each one is for */
export default function UploadReview({
  crew,
  items,
  results,
  saving,
  busyKey,
  error,
  onChange,
  onRemove,
  onRetry,
  isEdited,
  onFinish,
  onUploadMore,
}: {
  crew: CrewMember[];
  items: ReviewItem[];
  results: PageResult[];
  saving: boolean;
  busyKey: string | null; // The ticket being removed, or "page-<index>" for a page being read again
  error: string | null;
  onChange: (ticketId: string, change: Partial<Pick<ReviewItem, 'draft' | 'holderEmail'>>) => void;
  onRemove: (ticketId: string) => Promise<boolean>;
  onRetry: (resultIndex: number) => void;
  isEdited: (item: ReviewItem) => boolean;
  onFinish: () => void;
  onUploadMore: () => void;
}) {
  // Indexes into `results`, so a retry replaces the right page
  const failed = results.map((r, index) => ({ ...r, index })).filter((r) => !r.success && !r.duplicate);
  const duplicates = results.filter((r) => r.duplicate);
  const busy = saving || busyKey !== null;
  const [confirmRemove, setConfirmRemove] = useState<ReviewItem | null>(null);

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="font-display text-xl">Check your tickets</h2>
        <p className="mt-1 text-ink-2">
          {items.length > 0
            ? 'Read by AI. Fix anything that looks off and pick who each ticket is for.'
            : 'No new tickets this time.'}
        </p>
      </div>

      {items.length > 0 && (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={item.ticketId} className="rounded border border-line bg-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <p className="flex flex-1 items-center gap-2 text-sm font-semibold text-ok">
                  <CheckCircle2 className="h-4 w-4" />
                  {item.saved ? 'Saved' : isEdited(item) ? 'Edited' : `Ticket ${index + 1}`}
                </p>
                {!item.saved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-my-2 -mr-3 text-ink-2"
                    disabled={busy}
                    icon={busyKey === item.ticketId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    onClick={() => setConfirmRemove(item)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <TicketFieldsForm
                value={item.draft}
                disabled={item.saved || busy}
                onChange={(draft) => onChange(item.ticketId, { draft })}
              />
              {crew.length > 1 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-sm font-medium text-ink-2">For</p>
                  <div className="flex flex-wrap gap-2">
                    {crew.map((member) => (
                      <Chip
                        key={member.email}
                        selected={item.holderEmail === member.email}
                        disabled={item.saved || busy}
                        icon={<Avatar member={member} size="sm" />}
                        onClick={() => onChange(item.ticketId, { holderEmail: member.email })}
                      >
                        {member.isMe ? 'Me' : member.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {duplicates.length > 0 && (
        <div className="rounded border border-line bg-surface p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <Copy className="h-4 w-4" />
            {duplicates.length} already in the app, skipped
          </p>
          <ul className="list-disc pl-6 text-ink-2">
            {duplicates.map((r, i) => (
              <li key={i}>{r.error}</li>
            ))}
          </ul>
        </div>
      )}

      {failed.length > 0 && (
        <div className="rounded border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {failed.length} page{failed.length !== 1 ? 's' : ''} couldn&apos;t be read
          </p>
          <ul className="space-y-2">
            {failed.map((r) => (
              <li key={r.index} className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  {r.fileName}, page {r.pageNumber}: {r.error}
                </span>
                {r.retry && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={busy}
                    icon={busyKey === `page-${r.index}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                    onClick={() => onRetry(r.index)}
                  >
                    Try again
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <Notice>{error}</Notice>}

      <div className="flex flex-col gap-2">
        <Button
          onClick={onFinish}
          disabled={busy}
          icon={saving ? <Loader2 className="h-5 w-5 animate-spin" /> : undefined}
        >
          {items.length > 0 ? 'Save and see agenda' : 'See agenda'}
        </Button>
        <Button variant="secondary" onClick={onUploadMore} disabled={busy}>
          {items.length > 0 ? 'Save and add more' : 'Add more'}
        </Button>
      </div>

      <Sheet open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove this ticket?">
        {confirmRemove && (
          <div className="space-y-4">
            <p className="text-ink-2">
              <span className="font-semibold text-ink">{confirmRemove.original.act}</span> was saved when it was read.
              Removing it deletes the ticket and its QR code.
            </p>
            {error && <Notice>{error}</Notice>}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmRemove(null)} disabled={busy}>
                Keep it
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={busy}
                icon={busyKey ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                onClick={async () => {
                  if (await onRemove(confirmRemove.ticketId)) setConfirmRemove(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
