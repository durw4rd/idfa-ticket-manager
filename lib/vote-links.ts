// Audience Award voting links, received as forwarded emails (see app/api/inbound/email/route.ts).
// A link belongs to the user whose mailbox forwarded it and is dealt to one of their tickets;
// whoever holds that ticket sees it. Voting URLs are single-use, so they are never logged and only
// ever sent to that one person's browser.

import { randomBytes } from 'crypto';
import { db } from '@vercel/postgres';
import { sql } from './db';
import { comparableTitle } from './find-festival-link';
import { normalizeEmail } from './groups';

const TOKEN_PATTERN = /^[0-9a-f]{24}$/;

/** Inbound mail is set up (see README). Until then nothing here touches the database. */
export function isInboundConfigured(): boolean {
  return /^[^@\s]+@[^@\s]+$/.test((process.env.INBOUND_EMAIL_ADDRESS || '').trim());
}

/**
 * The private address a user forwards voting emails to: the app's inbound address (env
 * INBOUND_EMAIL_ADDRESS) with the user's token after a "+". Null when inbound mail isn't set up.
 * The token is created the first time this is asked for.
 */
export async function getInboundAddress(email: string): Promise<string | null> {
  if (!isInboundConfigured()) {
    return null;
  }
  const [mailbox, domain] = process.env.INBOUND_EMAIL_ADDRESS!.trim().split('@');
  const me = normalizeEmail(email);
  // Keeps an existing token, also when two requests create the row at once
  const result = await sql`
    INSERT INTO profiles (email, inbound_token) VALUES (${me}, ${randomBytes(12).toString('hex')})
    ON CONFLICT (email) DO UPDATE SET inbound_token = COALESCE(profiles.inbound_token, EXCLUDED.inbound_token)
    RETURNING inbound_token as "token"
  `;
  return `${mailbox}+${result.rows[0].token}@${domain}`;
}

/** Whose forwarding address a token belongs to */
export async function findInboundOwner(token: string): Promise<string | null> {
  const value = token.trim().toLowerCase();
  if (!TOKEN_PATTERN.test(value)) {
    return null;
  }
  const result = await sql`SELECT email FROM profiles WHERE inbound_token = ${value}`;
  return (result.rows[0]?.email as string) ?? null;
}

/** Gmail's "confirm forwarding" link waiting for the user, or null */
export async function getForwardConfirmUrl(email: string): Promise<string | null> {
  const result = await sql`SELECT forward_confirm_url as "url" FROM profiles WHERE email = ${normalizeEmail(email)}`;
  return (result.rows[0]?.url as string) ?? null;
}

export async function setForwardConfirmUrl(email: string, url: string | null): Promise<void> {
  await sql`UPDATE profiles SET forward_confirm_url = ${url} WHERE email = ${normalizeEmail(email)}`;
}

/**
 * Store the voting links from one email and deal them to the owner's tickets for that film: the
 * most recent showing that has started (the email follows the screening), one link per ticket that
 * has none yet, the owner's own ticket first. Links left over, and all of them when no showing has
 * started, stay with the owner, unassigned. Safe to repeat: links already stored for this owner
 * are skipped. Returns how many were new.
 *
 * Runs in one transaction under an advisory lock on the owner, so two emails arriving together
 * can't both pick the same free ticket.
 */
export async function saveVoteLinks(
  ownerEmail: string,
  festivalYear: number,
  title: string,
  urls: string[],
  messageId: string | null,
  now: Date
): Promise<number> {
  const owner = normalizeEmail(ownerEmail);
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    await client.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`vote-links:${owner}`}, 0))`;

    const known = await client.sql`
      SELECT url FROM vote_links WHERE owner_email = ${owner} AND url = ANY(${urls as any}::text[])
    `;
    const knownUrls = new Set(known.rows.map((row) => row.url as string));
    const fresh = urls.filter((url) => !knownUrls.has(url));

    const tickets = await client.sql`
      SELECT t.id, t.act, t.starts_at as "startsAt",
             EXISTS (SELECT 1 FROM vote_links v WHERE v.ticket_id = t.id) as "taken"
      FROM tickets t
      WHERE t.owner_email = ${owner} AND t.festival_year = ${festivalYear}
      ORDER BY t.starts_at DESC, (t.holder_email = ${owner}) DESC, t.created_at ASC
    `;
    const wanted = comparableTitle(title);
    const matching = tickets.rows.filter((ticket) => comparableTitle(ticket.act as string) === wanted);
    // The showing is chosen among all the film's tickets, before looking at which are free, so a
    // spare link never spills over to another day's showing. Rows are newest showing first.
    const seen = matching.find((ticket) => new Date(ticket.startsAt) <= now);
    const free = seen
      ? matching.filter(
          (ticket) => !ticket.taken && new Date(ticket.startsAt).getTime() === new Date(seen.startsAt).getTime()
        )
      : [];

    let saved = 0;
    for (const [index, url] of Array.from(fresh.entries())) {
      const ticket = free[index];
      const result = await client.sql`
        INSERT INTO vote_links (owner_email, festival_year, act, url, ticket_id, message_id)
        VALUES (${owner}, ${festivalYear}, ${(ticket?.act as string) ?? (seen?.act as string) ?? title.slice(0, 255)}, ${url}, ${ticket?.id ?? null}, ${messageId})
        ON CONFLICT (owner_email, url) DO NOTHING
      `;
      saved += result.rowCount || 0;
    }
    await client.sql`COMMIT`;
    return saved;
  } catch (error) {
    await client.sql`ROLLBACK`.catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export interface VoteLink {
  id: string;
  act: string;
  url: string;
}

/**
 * The voting links the viewer may use for a screening: those dealt to tickets they currently hold
 * (among tickets they can see), plus their own links for this film that no ticket took.
 */
export async function getVoteLinksForScreening(
  viewer: { email: string; visibleEmails: string[] },
  screening: { act: string; festivalYear: number; tickets: { id: string }[] }
): Promise<VoteLink[]> {
  // Also keeps the screening page working before migration 006 has been run
  if (!isInboundConfigured()) {
    return [];
  }
  const ticketIds = screening.tickets.map((ticket) => ticket.id);
  const [held, spare] = await Promise.all([
    sql`
      SELECT v.id, v.act, v.url
      FROM vote_links v
      JOIN tickets t ON t.id = v.ticket_id
      WHERE v.ticket_id = ANY(${ticketIds as any}::uuid[])
        AND t.holder_email = ${viewer.email}
        AND t.owner_email = ANY(${viewer.visibleEmails as any}::text[])
      ORDER BY v.created_at ASC, v.id ASC
    `,
    getSpareVoteLinks(viewer.email, screening.festivalYear),
  ]);
  const wanted = comparableTitle(screening.act);
  return [...(held.rows as VoteLink[]), ...spare.filter((link) => comparableTitle(link.act) === wanted)];
}

/** The user's own voting links that aren't attached to a ticket */
export async function getSpareVoteLinks(email: string, festivalYear: number): Promise<VoteLink[]> {
  const result = await sql`
    SELECT id, act, url
    FROM vote_links
    WHERE owner_email = ${normalizeEmail(email)} AND festival_year = ${festivalYear} AND ticket_id IS NULL
    ORDER BY created_at ASC, id ASC
  `;
  return result.rows as VoteLink[];
}
