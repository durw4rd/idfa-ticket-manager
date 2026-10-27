import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingStatus, Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton';

// Shown the moment a screening is tapped. Without its own file, the agenda's skeleton would show here.
export default function ScreeningLoading() {
  return (
    <>
      <PageHeader
        title={<Skeleton className="h-5 w-40" />}
        actions={<SkeletonAvatar />}
        back={
          <ButtonLink
            href="/screenings"
            variant="ghost"
            size="icon"
            aria-label="Back to agenda"
            className="-ml-3"
            icon={<ArrowLeft className="h-5 w-5" />}
          />
        }
      />
      <LoadingStatus label="Loading screening" />
      <div className="space-y-8">
        <div>
          <Skeleton className="-mx-4 mb-5 h-28 max-sm:rounded-none sm:mx-0" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="mt-3 h-5 w-1/2" />
          <Skeleton className="mt-2 h-5 w-1/3" />
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-16" />
          <Skeleton className="h-20" />
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="h-9" />
        </div>
      </div>
    </>
  );
}
