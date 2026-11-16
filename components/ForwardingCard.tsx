'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Vote } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Field';

/**
 * Your private address for forwarding IDFA's "Cast your vote" emails, how to set that up in
 * Gmail, and any voting links that arrived for a film you have no free ticket for.
 */
export default function ForwardingCard({
  address,
  confirmUrl,
  spareLinks,
}: {
  address: string;
  confirmUrl: string | null; // Gmail's "confirm forwarding" link, once its confirmation mail has arrived
  spareLinks: { id: string; act: string; url: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the address and copy it by hand.');
    }
  };

  return (
    <section aria-labelledby="forwarding-heading">
      <h2 id="forwarding-heading" className="label mb-3">
        Voting links
      </h2>
      <div className="space-y-4 rounded border border-line bg-surface p-4">
        <p className="text-sm text-ink-2">
          After a screening in the Audience Award, IDFA emails you a voting link for each ticket. Forward those emails
          here and the links show up on the screening, for whoever holds each ticket.
        </p>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Your forwarding address</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink">
              {address}
            </code>
            <Button
              variant="secondary"
              size="icon"
              onClick={copy}
              aria-label={copied ? 'Copied' : 'Copy address'}
              icon={copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-3">Keep it to yourself: mail sent to it is filed under your name.</p>
        </div>

        {error && <Notice>{error}</Notice>}

        {confirmUrl && (
          <div className="rounded border border-line-strong p-3">
            <p className="text-sm">Gmail is waiting for this address to confirm it accepts your mail.</p>
            <ButtonLink
              href={confirmUrl}
              external
              size="sm"
              className="mt-2"
              icon={<ExternalLink className="h-4 w-4" />}
            >
              Confirm forwarding
            </ButtonLink>
          </div>
        )}

        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>
            In Gmail settings, under <span className="font-semibold text-ink">Forwarding and POP/IMAP</span>, add the
            address above as a forwarding address.
          </li>
          <li>Come back here and tap Confirm forwarding when it appears (reload after a minute).</li>
          <li>
            Create a filter for mail from <span className="font-semibold text-ink">noreply@mailgun.idfa.nl</span> with
            the words <span className="font-semibold text-ink">Cast your vote</span>, and set it to forward to that
            address.
          </li>
        </ol>

        {spareLinks.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-2">Links without a ticket</p>
            <ul className="space-y-2">
              {spareLinks.map((link) => (
                <li key={link.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-display text-base">{link.act}</span>
                  <ButtonLink href={link.url} external variant="secondary" size="sm" icon={<Vote className="h-4 w-4" />}>
                    Vote
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
