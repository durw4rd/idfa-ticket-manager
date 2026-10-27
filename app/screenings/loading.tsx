import PageHeader from '@/components/PageHeader';
import { LoadingStatus, Skeleton, SkeletonAvatar, SkeletonRows } from '@/components/ui/Skeleton';

// Shown the moment the Agenda tab is tapped, while the server loads the screenings
export default function AgendaLoading() {
  return (
    <>
      <PageHeader title={<Skeleton className="h-5 w-28" />} actions={<SkeletonAvatar />} />
      <LoadingStatus label="Loading agenda" />
      <Skeleton className="mb-6 h-36" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>
      <Skeleton className="mb-1 mt-4 h-4 w-24" />
      <SkeletonRows count={5} />
    </>
  );
}
