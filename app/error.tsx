'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCw } from 'lucide-react';
import PageHeader, { BackLink } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/** Shown when a page fails to render, e.g. the database can't be reached */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="Something went wrong" back={<BackLink href="/screenings" />} />
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" strokeWidth={1.5} />}
        title="This page couldn't load"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              // reset() alone re-renders with the data that failed; refresh fetches the server part again
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
              disabled={retrying}
              icon={<RotateCw className={`h-5 w-5 ${retrying ? 'animate-spin' : ''}`} />}
            >
              Try again
            </Button>
            <ButtonLink href="/screenings" variant="secondary">
              Back to agenda
            </ButtonLink>
          </div>
        }
      >
        It may be a connection problem. Your tickets are safe.
      </EmptyState>
    </>
  );
}
