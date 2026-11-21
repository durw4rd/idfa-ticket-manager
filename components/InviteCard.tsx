'use client';

import { Check } from 'lucide-react';
import type { CrewMember, Group } from '@/lib/types';
import { declineEndsAccess } from '@/lib/onboarding';
import { Button } from '@/components/ui/Button';

/**
 * A pending invitation: the group, who invited you and who's in it, with Join and Decline. Shown on
 * the welcome flow, the Agenda and the Crew page; the parent does the joining.
 */
export function InviteCard({
  group,
  lookup,
  busy,
  onJoin,
  onDecline,
}: {
  group: Group;
  lookup: (email: string) => CrewMember;
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const members = group.members.filter((m) => m.status === 'active').map((m) => lookup(m.userEmail).name);
  return (
    <div className="relative overflow-hidden rounded border border-line bg-surface p-4 pl-6">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-spark" aria-hidden />
      {group.invitedBy && <p className="text-sm text-ink-2">{lookup(group.invitedBy).name} invited you to</p>}
      <p className="font-display text-lg">{group.name}</p>
      {members.length > 0 && <p className="text-sm text-ink-2">With {members.join(', ')}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={onJoin} disabled={busy}>
          Join
        </Button>
        <Button size="sm" variant="ghost" onClick={onDecline} disabled={busy}>
          Decline
        </Button>
      </div>
    </div>
  );
}

/**
 * What to ask before declining an invite. Declining someone's last membership signs them out unless
 * the app-access flag lets them in, so that case says so plainly.
 */
export function declineConfirm(
  group: Group,
  groups: Group[],
  allowedWithoutGroups: boolean,
): { title: string; message: string; action: string; endsAccess: boolean } {
  const endsAccess = declineEndsAccess(groups, group.id, allowedWithoutGroups);
  return {
    title: `Decline ${group.name}?`,
    message: endsAccess
      ? "This invite is what lets you into the app, so declining signs you out. You'd need a new invite to come back."
      : "You won't see their screenings, tickets or ratings. Someone in the group can invite you again.",
    action: endsAccess ? 'Decline and sign out' : 'Decline',
    endsAccess,
  };
}
