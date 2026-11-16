import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getViewer } from '@/lib/auth-helpers';
import { getCrew, getGroupsForUser } from '@/lib/groups';
import PageHeader from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import GroupManager from '@/components/GroupManager';
import ProfileCard from '@/components/ProfileCard';
import ForwardingCard from '@/components/ForwardingCard';
import { getForwardConfirmUrl, getInboundAddress, getSpareVoteLinks } from '@/lib/vote-links';
import { getCurrentFestivalYear } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const [groups, crew, inboundAddress] = await Promise.all([
    getGroupsForUser(viewer.email),
    getCrew(viewer),
    // Null until inbound mail is configured (INBOUND_EMAIL_ADDRESS), which hides the card
    getInboundAddress(viewer.email),
  ]);
  const [confirmUrl, spareLinks] = inboundAddress
    ? await Promise.all([
        getForwardConfirmUrl(viewer.email),
        getSpareVoteLinks(viewer.email, getCurrentFestivalYear()),
      ])
    : [null, []];
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
        <ProfileCard me={me} crew={crew} email={viewer.email} />
        <GroupManager initialGroups={groups} crew={crew} />
        {inboundAddress && (
          <ForwardingCard address={inboundAddress} confirmUrl={confirmUrl} spareLinks={spareLinks} />
        )}
      </div>
    </>
  );
}
