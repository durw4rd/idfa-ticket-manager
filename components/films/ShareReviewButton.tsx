'use client';

import { useState } from 'react';
import { Share } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ImageShareSheet } from '@/components/ui/ImageShareSheet';

/**
 * Films tab header button: your festival review (a PNG from /api/films/review) of the films you
 * rated that year, with where they take place, to share with friends.
 */
export default function ShareReviewButton({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Share your festival review"
        icon={<Share className="h-5 w-5" />}
        onClick={() => setOpen(true)}
      />
      <ImageShareSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share your review"
        src={`/api/films/review?year=${year}`}
        fileName={`idfa-${year}-review.png`}
        alt="Festival review preview"
        shareTitle={`My IDFA ${year}`}
      />
    </>
  );
}
