import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth-helpers';
import { getCrew, getGroupsForUser } from '@/lib/groups';
import PageHeader, { BackLink } from '@/components/PageHeader';
import GroupManager from '@/components/GroupManager';
import ProfileCard from '@/components/ProfileCard';
import ForwardingCard from '@/components/ForwardingCard';
import QrSharingCard from '@/components/QrSharingCard';
import { getQrSharedWith } from '@/lib/qr-shares';
import { getForwardConfirmUrl, getInboundAddress, getSpareVoteLinks } from '@/lib/vote-links';
import { getCurrentFestivalYear } from '@/lib/dates';
import { isAllowedWithoutGroups } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const [groups, crew, qrSharedWith, inboundAddress, allowedWithoutGroups] = await Promise.all([
    getGroupsForUser(viewer.email),
    getCrew(viewer),
    getQrSharedWith(viewer),
    // Null until inbound mail is configured (INBOUND_EMAIL_ADDRESS), which hides the card
    getInboundAddress(viewer.email),
    // Only for warning before a decline; if it can't be asked, hasAccessEnded keeps them in too
    isAllowedWithoutGroups(viewer.email).catch(() => true),
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
        me={me}
        onCrewPage
        back={<BackLink href="/screenings" />}
      />
      <div className="space-y-10 pt-2">
        <ProfileCard me={me} crew={crew} email={viewer.email} />
        <GroupManager initialGroups={groups} crew={crew} allowedWithoutGroups={allowedWithoutGroups} />
        <QrSharingCard crew={crew} initialSharedWith={qrSharedWith} />
        {inboundAddress && (
          <ForwardingCard address={inboundAddress} confirmUrl={confirmUrl} spareLinks={spareLinks} />
        )}
      </div>
    </>
  );
}
