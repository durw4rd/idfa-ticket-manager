import { MessagesSquare } from 'lucide-react';

/** "Q&A": the IDFA site says the makers take questions after this showing. Styled like AvailabilityMark. */
export default function QaMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-2 ${className}`}
      title="Q&A after the film"
    >
      <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
      Q&amp;A
    </span>
  );
}
