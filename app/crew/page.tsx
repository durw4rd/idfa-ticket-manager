import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getViewer } from '@/lib/auth-helpers';
import { getCrew, getGroupsForUser } from '@/lib/groups';
import PageHeader from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import GroupManager from '@/components/GroupManager';
import ProfileCard from '@/components/ProfileCard';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const [groups, crew] = await Promise.all([getGroupsForUser(viewer.email), getCrew(viewer)]);
  const me = crew.find((member) => member.isMe)!;

  return (
    <>
      <PageHeader
        title="Crew"
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
      <div className="space-y-10 pt-2">
        <ProfileCard me={me} email={viewer.email} />
        <GroupManager initialGroups={groups} crew={crew} />
      </div>
    </>
  );
}
