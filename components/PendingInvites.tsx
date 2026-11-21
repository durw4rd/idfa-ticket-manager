'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { CrewMember, Group } from '@/lib/types';
import { makeCrewLookup } from '@/lib/agenda';
import { readApiResponse } from '@/lib/api-client';
import { clearOfflineCopies } from '@/lib/offline';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { declineConfirm, InviteCard } from './InviteCard';

/**
 * Your pending invitations with Join and Decline, for the welcome flow and the top of the Agenda.
 * `groups` is every membership, invited or active, so declining can tell whether it would sign you
 * out. Calls `onChange` with the groups after a join or decline, then refreshes the page's data:
 * membership decides whose tickets you see.
 */
export default function PendingInvites({
  groups: groupsProp,
  crew,
  allowedWithoutGroups,
  onChange,
}: {
  groups: Group[];
  crew: CrewMember[];
  allowedWithoutGroups: boolean;
  onChange?: (groups: Group[], joined: Group | null) => void;
}) {
  const router = useRouter();
  const lookup = makeCrewLookup(crew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<Group | null>(null);
  // The memberships each action returns, used at once: the page's refreshed data comes later, and a
  // second decline before then must see the first one gone to know whether it signs them out
  const [groups, setGroups] = useState(groupsProp);
  useEffect(() => setGroups(groupsProp), [groupsProp]);
  const invites = groups.filter((group) => group.status === 'invited');

  const run = async (action: 'accept' | 'leave', group: Group, endsAccess = false) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, groupId: group.id }),
      });
      const data = await readApiResponse<{ groups: Group[] }>(response, 'Something went wrong');
      if (endsAccess) {
        // Signs them out now, rather than on whichever page load first notices (ACCESS_ENDED_PATH in
        // lib/auth-helpers.ts, which client code can't import)
        // Like Sign out: offline tickets mustn't outlive the session (access-ended clears the rest)
        await clearOfflineCopies();
        window.location.assign('/api/access-ended');
        return;
      }
      setGroups(data.groups);
      onChange?.(data.groups, action === 'accept' ? group : null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
      setDeclining(null);
    }
  };

  if (invites.length === 0) {
    return null;
  }
  const confirm = declining && declineConfirm(declining, groups, allowedWithoutGroups);

  return (
    <div className="space-y-3">
      {invites.map((group) => (
        <InviteCard
          key={group.id}
          group={group}
          lookup={lookup}
          busy={busy}
          onJoin={() => run('accept', group)}
          onDecline={() => setDeclining(group)}
        />
      ))}
      {error && <Notice>{error}</Notice>}

      <Sheet open={!!declining} onClose={() => setDeclining(null)} title={confirm?.title || ''}>
        {declining && confirm && (
          <div className="space-y-4">
            <p className="text-ink-2">{confirm.message}</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeclining(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => run('leave', declining, confirm.endsAccess)}
                disabled={busy}
                icon={busy ? <Loader2 className="h-5 w-5 animate-spin" /> : undefined}
              >
                {confirm.action}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
