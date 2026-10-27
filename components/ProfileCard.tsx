'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Loader2, LogOut } from 'lucide-react';
import type { CrewMember } from '@/lib/types';
import { assignCrewLooks, type Badge, BADGE_LABELS, BADGES, badgeColor } from '@/lib/display';
import { handleRadioKeys } from '@/lib/radio-keys';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { inputClasses, Notice } from '@/components/ui/Field';

/** Your display name and badge (what the crew sees on avatars and ratings) and sign out */
export default function ProfileCard({ me, crew, email }: { me: CrewMember; crew: CrewMember[]; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [badge, setBadge] = useState<Badge | null>(me.badge);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (change: { name: string } | { badge: Badge | null }) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not save your profile');
      }
      router.refresh();
    } catch (err) {
      if ('badge' in change) {
        setBadge(me.badge);
      }
      setError(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  };

  const pickBadge = (next: Badge | null) => {
    if (next !== badge) {
      setBadge(next);
      save({ badge: next });
    }
  };

  // Badges other people in your crew already have
  const takenBy = new Map(crew.filter((m) => !m.isMe && m.badge).map((m) => [m.badge!, m.name]));
  // The colour your initial would get without a badge, worked out the same way getCrew does
  const initialColor = assignCrewLooks(crew.map((m) => ({ email: m.email, badge: m.isMe ? null : m.badge }))).get(
    me.email,
  )!.color;
  const lookFor = (option: Badge | null) => ({
    name: name || me.name,
    badge: option,
    color: option ? badgeColor(option) : initialColor,
  });
  const options: (Badge | null)[] = [null, ...BADGES];
  const available = options.filter((option) => !option || !takenBy.has(option));

  return (
    <section className="rounded border border-line bg-surface p-4">
      <div className="flex items-center gap-4">
        <Avatar member={lookFor(badge)} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg">{me.name}</p>
          <p className="truncate text-sm text-ink-3">{email}</p>
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save({ name });
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

      <h3 className="label mb-2 mt-5">Your badge</h3>
      {/* Taken badges are shown but aren't radios, so the radios' indexes match `available` for arrow keys */}
      <div role="radiogroup" aria-label="Your badge" className="grid max-w-sm grid-cols-7 justify-items-center">
        {options.map((option) => {
          const owner = option ? takenBy.get(option) : undefined;
          const label = option ? BADGE_LABELS[option] : 'Your initial';
          const look = lookFor(option);
          if (owner) {
            return (
              <span key={option} title={`${label}: ${owner} has it`} className="rounded-full p-0.5 opacity-30">
                <Avatar member={look} size="md" />
                <span className="sr-only">
                  {label}, taken by {owner}
                </span>
              </span>
            );
          }
          const selected = option === badge;
          const index = available.indexOf(option);
          return (
            <button
              key={option ?? 'initial'}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              tabIndex={selected ? 0 : -1}
              disabled={busy}
              onClick={() => pickBadge(option)}
              onKeyDown={(event) =>
                handleRadioKeys(event, index, available.length, (next) => pickBadge(available[next]))
              }
              className={`rounded-full p-0.5 ring-offset-surface transition focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-ink/40 ${selected ? 'ring-2 ring-ink' : 'hover:ring-1 hover:ring-line-strong'}`}
            >
              <Avatar member={look} size="md" />
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-ink-3">
        {badge ? BADGE_LABELS[badge] : 'Your initial'}. Each badge goes to one person per crew; faded ones are taken.
      </p>

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
