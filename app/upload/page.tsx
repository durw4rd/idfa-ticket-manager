import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth-helpers';
import { getCrew } from '@/lib/groups';
import PageHeader, { BackLink } from '@/components/PageHeader';
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
        back={<BackLink href="/screenings" />}
      />
      <UploadTicket crew={crew} />
    </>
  );
}
