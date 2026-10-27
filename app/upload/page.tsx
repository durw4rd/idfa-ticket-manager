import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getViewer } from '@/lib/auth-helpers';
import { getCrew } from '@/lib/groups';
import PageHeader from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import UploadTicket from '@/components/UploadTicket';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }
  const crew = await getCrew(viewer);

  return (
    <>
      <PageHeader
        title="Add tickets"
        me={crew.find((member) => member.isMe)}
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
      <UploadTicket crew={crew} />
    </>
  );
}
