/**
 * Placeholder shape for loading.tsx screens; className sets its size. A span, so it can sit in a
 * heading (PageHeader's title) as well as in blocks.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block rounded bg-ink/[0.07] motion-safe:animate-pulse ${className}`} />;
}

/** Screen-reader announcement for a loading screen, since the skeleton shapes are hidden from it */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

/** Rows shaped like the agenda list: time on the left, title and venue on the right */
export function SkeletonRows({ count }: { count: number }) {
  return (
    <ul>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="grid grid-cols-[3.75rem_1fr] gap-x-3 border-b border-line py-3.5 last:border-b-0">
          <Skeleton className="mt-1 h-4 w-11" />
          <span className="space-y-2">
            <Skeleton className={`h-5 ${i % 3 === 1 ? 'w-1/2' : 'w-3/4'}`} />
            <Skeleton className="h-4 w-1/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The header's avatar slot while the crew loads */
export function SkeletonAvatar() {
  return <Skeleton className="h-9 w-9 rounded-full" />;
}
