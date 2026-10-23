'use client';

import { useState } from 'react';
import { Check, Loader2, LogOut, UserPlus, Users, X } from 'lucide-react';
import { Group } from '@/lib/types';
import { getDisplayName } from '@/lib/display';

interface GroupManagerProps {
  initialGroups: Group[];
  viewerEmail: string;
}

export default function GroupManager({ initialGroups, viewerEmail }: GroupManagerProps) {
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (body: Record<string, string>, confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invites = groups.filter((g) => g.status === 'invited');
  const activeGroups = groups.filter((g) => g.status === 'active');
  const inputClass =
    'flex-1 min-w-0 px-3 py-2 border border-idfa-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-idfa-black focus:border-transparent';

  return (
    <div className="space-y-10">
      {invites.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Invitations</h2>
          <div className="space-y-3">
            {invites.map((group) => (
              <div key={group.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-2 border-idfa-black rounded-lg">
                <div>
                  <p className="font-medium">{group.name}</p>
                  <p className="text-sm text-idfa-gray-600">
                    With {group.members.filter((m) => m.status === 'active').map((m) => getDisplayName(m.userEmail)).join(', ')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => runAction({ action: 'accept', groupId: group.id })}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-idfa-black text-white text-sm font-medium rounded hover:bg-idfa-gray-800 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Join
                  </button>
                  <button
                    onClick={() => runAction({ action: 'leave', groupId: group.id })}
                    disabled={busy}
                    className="px-4 py-2 text-sm text-idfa-gray-700 hover:bg-idfa-gray-100 rounded"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-1">Your groups</h2>
        <p className="text-sm text-idfa-gray-600 mb-4">
          People in your group see your screenings, tickets, and ratings, and you see theirs.
        </p>

        {activeGroups.length === 0 && (
          <p className="text-sm text-idfa-gray-500 italic mb-4">You&apos;re not in a group yet. Your tickets are only visible to you.</p>
        )}

        <div className="space-y-4">
          {activeGroups.map((group) => (
            <div key={group.id} className="p-4 border border-idfa-gray-200 rounded-lg">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="flex items-center gap-2 font-semibold">
                  <Users className="h-5 w-5" />
                  {group.name}
                </p>
                <button
                  onClick={() =>
                    runAction(
                      { action: 'leave', groupId: group.id },
                      `Leave "${group.name}"? You will stop seeing each other's tickets and ratings.`
                    )
                  }
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                >
                  <LogOut className="h-4 w-4" />
                  Leave
                </button>
              </div>

              <ul className="divide-y divide-idfa-gray-100 mb-4">
                {group.members.map((member) => (
                  <li key={member.userEmail} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {member.userEmail}
                      {member.userEmail === viewerEmail && <span className="ml-2 text-idfa-gray-500">(You)</span>}
                    </span>
                    <span className="flex items-center gap-2 text-idfa-gray-500">
                      {member.status === 'invited' ? 'Invited' : member.role === 'owner' ? 'Owner' : 'Member'}
                      {group.role === 'owner' && member.userEmail !== viewerEmail && (
                        <button
                          onClick={() =>
                            runAction(
                              { action: 'remove', groupId: group.id, email: member.userEmail },
                              `Remove ${member.userEmail} from "${group.name}"?`
                            )
                          }
                          disabled={busy}
                          className="p-1 hover:text-red-600"
                          aria-label={`Remove ${member.userEmail}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const email = inviteEmails[group.id]?.trim();
                  if (email && (await runAction({ action: 'invite', groupId: group.id, email }))) {
                    setInviteEmails((prev) => ({ ...prev, [group.id]: '' }));
                  }
                }}
              >
                <input
                  type="email"
                  placeholder="Invite by Google email"
                  value={inviteEmails[group.id] || ''}
                  onChange={(e) => setInviteEmails((prev) => ({ ...prev, [group.id]: e.target.value }))}
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={busy || !inviteEmails[group.id]?.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-idfa-black text-white text-sm font-medium rounded hover:bg-idfa-gray-800 disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  Invite
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Start a new group</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (newGroupName.trim() && (await runAction({ action: 'create', name: newGroupName.trim() }))) {
              setNewGroupName('');
            }
          }}
        >
          <input
            type="text"
            placeholder="Group name, e.g. Festival friends"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            maxLength={100}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy || !newGroupName.trim()}
            className="px-4 py-2 bg-idfa-black text-white text-sm font-medium rounded hover:bg-idfa-gray-800 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </section>

      {busy && (
        <p className="flex items-center gap-2 text-sm text-idfa-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </p>
      )}
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800 text-sm">{error}</div>}
    </div>
  );
}
