import { NextRequest, NextResponse, after } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { getCurrentFestivalYear, getNow } from '@/lib/dates';
import { normalizeEmail } from '@/lib/groups';
import { flushLdEvents, userContext } from '@/lib/launchdarkly';
import { extractVoteLinks, findGmailConfirmationLink, VOTE_EMAIL_SENDER } from '@/lib/vote-link-extractor';
import { findInboundOwner, isInboundConfigured, saveVoteLinks, setForwardConfirmUrl } from '@/lib/vote-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The one route without requireAuth (and left out of middleware.ts): Postmark calls it, not a
// signed-in user. It is protected by HTTP Basic credentials in the webhook URL configured in
// Postmark, whose password is INBOUND_WEBHOOK_SECRET. The user is then found from the token in
// the address the mail was sent to, never from anything else in the mail.
function authorized(request: NextRequest): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  const header = request.headers.get('authorization') || '';
  if (!secret || !header.startsWith('Basic ')) {
    return false;
  }
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const password = decoded.slice(decoded.indexOf(':') + 1);
  // Hashed so the comparison takes the same time whatever the lengths
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(password), digest(secret));
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Every place the "+token" of the user's forwarding address can turn up. Mail sent straight to
 * the address has it in MailboxHash. Mail that Gmail forwards automatically is still addressed
 * (To) to the user's own mailbox, so the token is only in the address Postmark received it at
 * (OriginalRecipient), or in the per-address hashes when the address was a Cc or Bcc.
 */
function addressTokens(mail: Record<string, unknown>): string[] {
  const tokens = [asString(mail.MailboxHash)];
  tokens.push(asString(mail.OriginalRecipient).match(/\+([^@+]+)@/)?.[1] ?? '');
  for (const field of ['ToFull', 'CcFull', 'BccFull']) {
    const addresses = mail[field];
    if (Array.isArray(addresses)) {
      for (const address of addresses) {
        tokens.push(asString((address as { MailboxHash?: unknown } | null)?.MailboxHash));
      }
    }
  }
  return Array.from(new Set(tokens.filter(Boolean)));
}

// Why a mail was dropped, for the function log. Never the mail's contents or addresses.
function ignored(reason: string) {
  console.info(`Inbound email ignored: ${reason}`);
  return NextResponse.json({ status: 'ignored', reason });
}

/**
 * POST /api/inbound/email — Postmark's inbound webhook (JSON). Handles two kinds of mail sent to
 * a user's forwarding address: IDFA's voting emails, and Gmail's "confirm forwarding" mail.
 * Anything else is acknowledged and dropped. Answers 200 unless it should be retried.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isInboundConfigured()) {
    return NextResponse.json({ status: 'ignored' });
  }

  let mail: Record<string, unknown>;
  try {
    mail = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    let owner: string | null = null;
    for (const token of addressTokens(mail)) {
      owner = await findInboundOwner(token);
      if (owner) break;
    }
    if (!owner) {
      return ignored('no forwarding address of a user among the recipients');
    }

    const fromFull = mail.FromFull as { Email?: unknown } | undefined;
    const from = normalizeEmail(asString(fromFull?.Email) || asString(mail.From));
    const email = { subject: asString(mail.Subject), html: asString(mail.HtmlBody), text: asString(mail.TextBody) };

    const confirmUrl = findGmailConfirmationLink(from, email);
    if (confirmUrl) {
      await setForwardConfirmUrl(owner, confirmUrl);
      return NextResponse.json({ status: 'confirmation' });
    }

    // Gmail's automatic forwarding keeps IDFA as the sender; a mail the user forwards by hand
    // comes from the user. Mail from anyone else isn't read at all.
    if (from !== VOTE_EMAIL_SENDER && from !== owner) {
      return ignored('sender is neither IDFA nor the user');
    }

    after(flushLdEvents);
    const vote = await extractVoteLinks(email, userContext(owner));
    if (!vote) {
      return ignored('not a voting email');
    }

    const saved = await saveVoteLinks(
      owner,
      getCurrentFestivalYear(),
      vote.title,
      vote.urls,
      asString(mail.MessageID) || null,
      getNow()
    );
    // Mail is arriving, so forwarding is confirmed and the Crew page can stop offering the link
    await setForwardConfirmUrl(owner, null);
    return NextResponse.json({ status: 'saved', links: saved });
  } catch (error) {
    // No mail contents in the log: the links are single-use credentials
    console.error('Inbound email failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Failed to process the email' }, { status: 500 });
  }
}
