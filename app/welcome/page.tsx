import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth-helpers';
import { isAllowedWithoutGroups } from '@/lib/auth';
import { getCrew, getGroupsForUser } from '@/lib/groups';
import { getScreeningsForYear } from '@/lib/db';
import { getCurrentFestivalYear } from '@/lib/dates';
import Welcome from '@/components/onboarding/Welcome';

export const dynamic = 'force-dynamic';

/**
 * The first-run walkthrough: join your crew, set your name and badge, see what the app does, add
 * tickets. The Agenda sends people here until they finish or skip it (profiles.onboarded_at).
 */
export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const [groups, crew, screenings, allowedWithoutGroups] = await Promise.all([
    getGroupsForUser(viewer.email),
    getCrew(viewer),
    getScreeningsForYear(viewer.visibleEmails, getCurrentFestivalYear()),
    // Only for warning before a decline; if it can't be asked, hasAccessEnded keeps them in too
    isAllowedWithoutGroups(viewer.email).catch(() => true),
  ]);

  return (
    <Welcome
      groups={groups}
      crew={crew}
      email={viewer.email}
      allowedWithoutGroups={allowedWithoutGroups}
      crewScreenings={screenings.length}
      hasOwnTickets={screenings.some((screening) => screening.tickets.some((t) => t.ownerEmail === viewer.email))}
    />
  );
}
