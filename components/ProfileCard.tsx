'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Loader2, LogOut } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { inputClasses, Notice } from '@/components/ui/Field';

/** Your display name (what the crew sees on avatars and ratings) and sign out */
export default function ProfileCard({ me, email }: { me: CrewMember; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not save your name');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-line bg-surface p-4">
      <div className="flex items-center gap-4">
        <Avatar member={{ ...me, name: name || me.name }} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg">{me.name}</p>
          <p className="truncate text-sm text-ink-3">{email}</p>
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Display name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Your name"
            className={inputClasses}
          />
        </label>
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || name.trim() === me.name}
          icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          Save
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-ink-3">The name your crew sees. Leave empty to use the one from your email.</p>
      {error && (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 mt-4 text-ink-2"
        icon={<LogOut className="h-4 w-4" />}
        onClick={() => signOut({ callbackUrl: '/login' })}
      >
        Sign out
      </Button>
    </section>
  );
}
