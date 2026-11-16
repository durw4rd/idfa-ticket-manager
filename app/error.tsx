'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import PageHeader, { BackLink } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/** Shown when a page fails to render, e.g. the database can't be reached */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
            <Button onClick={reset} icon={<RotateCw className="h-5 w-5" />}>
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
