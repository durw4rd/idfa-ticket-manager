'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, LogOut, UserPlus, X } from 'lucide-react';
import type { CrewMember, Group } from '@/lib/types';
import { makeCrewLookup } from '@/lib/agenda';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { inputClasses, Notice } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';

interface Confirm {
  title: string;
  message: string;
  action: string;
  body: Record<string, string>;
}

export default function GroupManager({ initialGroups, crew }: { initialGroups: Group[]; crew: CrewMember[] }) {
  const router = useRouter();
  const lookup = makeCrewLookup(crew);
  const me = crew.find((member) => member.isMe)!;
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const runAction = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }
      setGroups(data.groups);
      // Membership decides whose tickets you see, so every page's data changes with it
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const invites = groups.filter((g) => g.status === 'invited');
  const activeGroups = groups.filter((g) => g.status === 'active');

  return (
    <div className="space-y-10">
      {invites.length > 0 && (
        <section>
          <h2 className="label mb-3">Invitations</h2>
          <div className="space-y-3">
            {invites.map((group) => (
              <div key={group.id} className="relative overflow-hidden rounded border border-line bg-surface p-4 pl-6">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-spark" aria-hidden />
                <p className="font-display text-lg">{group.name}</p>
                <p className="text-sm text-ink-2">
                  With{' '}
                  {group.members
                    .filter((m) => m.status === 'active')
                    .map((m) => lookup(m.userEmail).name)
                    .join(', ')}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    icon={<Check className="h-4 w-4" />}
                    onClick={() => runAction({ action: 'accept', groupId: group.id })}
                    disabled={busy}
                  >
                    Join
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => runAction({ action: 'leave', groupId: group.id })}
                    disabled={busy}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="label mb-1">Your crew</h2>
        <p className="mb-4 text-sm text-ink-2">
          Everyone in a group sees each other&apos;s screenings, tickets and ratings.
        </p>

        {activeGroups.length === 0 && (
          <p className="mb-4 text-sm italic text-ink-3">
            You&apos;re not in a group yet, so your tickets are only visible to you.
          </p>
        )}

        <div className="space-y-4">
          {activeGroups.map((group) => (
            <div key={group.id} className="rounded border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <p className="font-display text-lg">{group.name}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="-mr-2 text-ink-2"
                  icon={<LogOut className="h-4 w-4" />}
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: `Leave ${group.name}?`,
                      message: "You'll stop seeing each other's tickets and ratings.",
                      action: 'Leave group',
                      body: { action: 'leave', groupId: group.id },
                    })
                  }
                >
                  Leave
                </Button>
              </div>

              <ul className="divide-y divide-line px-4">
                {group.members.map((member) => {
                  const person = lookup(member.userEmail);
                  const isMe = member.userEmail === me.email;
                  return (
                    <li key={member.userEmail} className="flex items-center gap-3 py-3">
                      <Avatar member={person} size="md" className={member.status === 'invited' ? 'opacity-40' : ''} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {person.name}
                          {isMe && <span className="font-normal text-ink-3"> (you)</span>}
                        </p>
                        <p className="truncate text-xs text-ink-3">{member.userEmail}</p>
                      </div>
                      <span className="text-xs text-ink-3">
                        {member.status === 'invited' ? 'Invited' : member.role === 'owner' ? 'Owner' : ''}
                      </span>
                      {group.role === 'owner' && !isMe && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="-mr-3 text-ink-3"
                          aria-label={`Remove ${person.name}`}
                          icon={<X className="h-4 w-4" />}
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              title: `Remove ${person.name}?`,
                              message: `They'll leave ${group.name} and stop seeing the group's tickets and ratings.`,
                              action: 'Remove',
                              body: { action: 'remove', groupId: group.id, email: member.userEmail },
                            })
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>

              <form
                className="flex gap-2 border-t border-line p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const email = inviteEmails[group.id]?.trim();
                  if (email && (await runAction({ action: 'invite', groupId: group.id, email }))) {
                    setInviteEmails((prev) => ({ ...prev, [group.id]: '' }));
                  }
                }}
              >
                <input
                  type="email"
                  placeholder="Invite by Google email"
                  aria-label={`Invite someone to ${group.name}`}
                  value={inviteEmails[group.id] || ''}
                  onChange={(event) => setInviteEmails((prev) => ({ ...prev, [group.id]: event.target.value }))}
                  className={`${inputClasses} min-w-0 flex-1`}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="icon"
                  aria-label="Send invite"
                  icon={<UserPlus className="h-5 w-5" />}
                  disabled={busy || !inviteEmails[group.id]?.trim()}
                />
              </form>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="label mb-3">Start a new group</h2>
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (newGroupName.trim() && (await runAction({ action: 'create', name: newGroupName.trim() }))) {
              setNewGroupName('');
            }
          }}
        >
          <input
            type="text"
            placeholder="e.g. Festival friends"
            aria-label="New group name"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            maxLength={100}
            className={`${inputClasses} min-w-0 flex-1`}
          />
          <Button type="submit" variant="secondary" disabled={busy || !newGroupName.trim()}>
            Create
          </Button>
        </form>
      </section>

      {busy && !confirm && (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </p>
      )}
      {error && <Notice>{error}</Notice>}

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ''}>
        {confirm && (
          <div className="space-y-4">
            <p className="text-ink-2">{confirm.message}</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => runAction(confirm.body)}
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
