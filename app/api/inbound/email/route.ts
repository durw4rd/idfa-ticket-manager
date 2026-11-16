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
    // Postmark puts the part after "+" in MailboxHash
    const owner = await findInboundOwner(asString(mail.MailboxHash));
    if (!owner) {
      return NextResponse.json({ status: 'ignored' });
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
      return NextResponse.json({ status: 'ignored' });
    }

    after(flushLdEvents);
    const vote = await extractVoteLinks(email, userContext(owner));
    if (!vote) {
      return NextResponse.json({ status: 'ignored' });
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
