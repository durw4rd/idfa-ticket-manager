import PageHeader from '@/components/PageHeader';
import { LoadingStatus, Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton';

// Shown the moment the Tickets tab is tapped: the next pass (with its QR) and the ones after it
export default function TicketsLoading() {
  return (
    <>
      <PageHeader title="Tickets" actions={<SkeletonAvatar />} />
      <LoadingStatus label="Loading tickets" />
      <ol className="space-y-3">
        <li className="rounded border border-line bg-surface p-4 pl-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="mt-4 aspect-square w-40" />
        </li>
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-4 rounded border border-line bg-surface p-4">
            <span className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </span>
            <Skeleton className="h-16 w-16 shrink-0" />
          </li>
        ))}
      </ol>
    </>
  );
}
