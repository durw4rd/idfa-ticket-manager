import PageHeader from '@/components/PageHeader';
import { LoadingStatus, Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton';

// Shown the moment the Films tab is tapped, while ratings load
export default function FilmsLoading() {
  return (
    <>
      <PageHeader title="Films" actions={<SkeletonAvatar />} />
      <LoadingStatus label="Loading films" />
      <Skeleton className="mb-6 h-9 w-32 rounded-full" />
      <Skeleton className="mb-1 h-4 w-16" />
      <ol className="divide-y divide-line">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-start gap-3 py-4">
            <Skeleton className={`h-5 flex-1 ${i % 2 ? 'max-w-[50%]' : 'max-w-[70%]'}`} />
            <Skeleton className="ml-auto h-6 w-6" />
          </li>
        ))}
      </ol>
    </>
  );
}
