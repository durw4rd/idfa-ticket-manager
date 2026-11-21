'use client';

import { useState } from 'react';
import type { CrewMember } from '@/lib/types';
import { readApiResponse } from '@/lib/api-client';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Notice } from '@/components/ui/Field';

/**
 * Choose crew-mates who may show your tickets' QR codes (see canSeeQr). Codes otherwise show only
 * to a ticket's holder and owner. Each chip saves straight away.
 */
export default function QrSharingCard({
  crew,
  initialSharedWith,
}: {
  crew: CrewMember[];
  initialSharedWith: string[];
}) {
  const others = crew.filter((member) => !member.isMe);
  const [sharedWith, setSharedWith] = useState<string[]>(initialSharedWith);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (others.length === 0) return null;

  const toggle = async (member: CrewMember) => {
    const shared = !sharedWith.includes(member.email);
    setSaving(member.email);
    setError(null);
    try {
      await readApiResponse(
        await fetch('/api/qr-shares', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewerEmail: member.email, shared }),
        }),
        'Could not update sharing'
      );
      setSharedWith((current) =>
        shared ? [...current, member.email] : current.filter((email) => email !== member.email)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update sharing');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="qr-sharing-heading">
      <h2 id="qr-sharing-heading" className="label mb-3">
        Who can show your tickets
      </h2>
      <div className="space-y-4 rounded border border-line bg-surface p-4">
        <p className="text-sm text-ink-2">
          Your QR codes show only to you and to whoever holds a ticket you bought. Pick crew-mates who can show them
          too, say to get you in from their phone.
        </p>
        <div className="flex flex-wrap gap-2">
          {others.map((member) => (
            <Chip
              key={member.email}
              selected={sharedWith.includes(member.email)}
              disabled={saving !== null}
              onClick={() => toggle(member)}
              icon={<Avatar member={member} size="xs" />}
            >
              {member.name}
            </Chip>
          ))}
        </div>
        {error && <Notice>{error}</Notice>}
      </div>
    </section>
  );
}
