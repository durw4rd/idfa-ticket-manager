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
  // Links marked here and not yet confirmed by a refresh. The server's votedAt counts too, so a
  // vote saved elsewhere (another tab, the Crew page) shows once the props catch up.
  const [voted, setVoted] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const isVoted = (link: Link) => !!link.votedAt || voted.has(link.id);
  const pending = links.filter((link) => !isVoted(link));

  const markVoted = async (ids: string[], fromLink: boolean) => {
    setError(null);
    setVoted((current) => new Set([...Array.from(current), ...ids]));
    // Each link on its own: with several, some saves can work while others fail
    const results = await Promise.allSettled(
      ids.map(async (id) =>
        // keepalive: the tap also opens IDFA in a new tab, which mustn't cancel this
        readApiResponse(await fetch(`/api/vote-links/${id}/voted`, { method: 'POST', keepalive: true }), 'Could not save your vote')
      )
    );
    const failed = ids.filter((_, index) => results[index].status === 'rejected');
    if (failed.length < ids.length) {
      router.refresh();
      notifyTodoChanged();
    }
    if (failed.length > 0) {
      // Back to "Vote", so another tap can try again. The link opened either way, so only
      // "Already voted" needs to say it didn't stick.
      setVoted((current) => new Set(Array.from(current).filter((id) => !failed.includes(id))));
      if (!fromLink) {
        const reason = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
        setError(reason.reason instanceof Error ? reason.reason.message : 'Could not save your vote');
      }
    }
  };

  return (
    <>
      {links.map((link, index) => {
        const done = isVoted(link);
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
