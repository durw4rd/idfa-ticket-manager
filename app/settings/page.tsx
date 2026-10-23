import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth-helpers';
import { getGroupsForUser } from '@/lib/groups';
import GroupManager from '@/components/GroupManager';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const groups = await getGroupsForUser(viewer.email);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="text-3xl font-bold mb-2">Sharing</h1>
      <p className="text-idfa-gray-600 mb-10">Signed in as {viewer.email}</p>
      <GroupManager initialGroups={groups} viewerEmail={viewer.email} />
    </div>
  );
}
