import { MapPinOff } from 'lucide-react';
import PageHeader, { BackLink } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" back={<BackLink href="/screenings" />} />
      <EmptyState
        icon={<MapPinOff className="h-10 w-10" strokeWidth={1.5} />}
        title="This page doesn't exist"
        action={<ButtonLink href="/screenings" variant="secondary">Back to agenda</ButtonLink>}
      >
        The link may be old, or mistyped.
      </EmptyState>
    </>
  );
}
