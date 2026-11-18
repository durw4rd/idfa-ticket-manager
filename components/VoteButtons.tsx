'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Vote } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { readApiResponse } from '@/lib/api-client';
import { notifyTodoChanged } from '@/lib/todo-events';

interface Link {
  id: string;
  url: string;
  votedAt: string | null;
}

/**
 * Audience Award voting links for the tickets you hold. The app can't see the vote itself, so
 * opening a link here counts as voting, and "Already voted" covers votes cast from IDFA's email.
 * A used link stays tappable ("Voted"), in case the vote didn't go through.
 */
export default function VoteButtons({ links }: { links: Link[] }) {
  const router = useRouter();
  const [voted, setVoted] = useState(() => new Set(links.filter((link) => link.votedAt).map((link) => link.id)));
  const [error, setError] = useState<string | null>(null);
  const pending = links.filter((link) => !voted.has(link.id));

  const markVoted = async (ids: string[], fromLink: boolean) => {
    setError(null);
    setVoted((current) => new Set([...Array.from(current), ...ids]));
    try {
      await Promise.all(
        ids.map(async (id) =>
          // keepalive: the tap also opens IDFA in a new tab, which mustn't cancel this
          readApiResponse(await fetch(`/api/vote-links/${id}/voted`, { method: 'POST', keepalive: true }), 'Could not save your vote')
        )
      );
      router.refresh();
      notifyTodoChanged();
    } catch (err) {
      // Back to "Vote", so another tap can try again. The link opened either way, so only
      // "Already voted" needs to say it didn't stick.
      setVoted((current) => new Set(Array.from(current).filter((id) => !ids.includes(id))));
      if (!fromLink) {
        setError(err instanceof Error ? err.message : 'Could not save your vote');
      }
    }
  };

  return (
    <>
      {links.map((link, index) => {
        const done = voted.has(link.id);
        const number = links.length > 1 ? ` ${index + 1}` : '';
        return (
          <ButtonLink
            key={link.id}
            href={link.url}
            external
            size="sm"
            variant={done ? 'secondary' : 'primary'}
            icon={done ? <Check className="h-4 w-4" /> : <Vote className="h-4 w-4" />}
            onClick={done ? undefined : () => markVoted([link.id], true)}
          >
            {done ? `Voted${number}` : `Vote${number}`}
          </ButtonLink>
        );
      })}
      {pending.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => markVoted(pending.map((link) => link.id), false)}>
          Already voted
        </Button>
      )}
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
