import { sql as vercelSql, db } from '@vercel/postgres';
import { Ticket, Screening, Rating } from './types';
import { getFestivalYear, parseTicketDateTime } from './dates';

// Set DATABASE_URL or POSTGRES_URL before importing
// @vercel/postgres uses POSTGRES_URL by default, but we support DATABASE_URL too
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}

// Use the sql template tag - it will use POSTGRES_URL or DATABASE_URL
export const sql = vercelSql;

// Every read below is scoped to `visibleEmails`: the viewer plus their active group members
// (see getVisibleEmails in lib/groups.ts). Writes are scoped to the owner's own email.

type NewTicket = Omit<Ticket, 'id' | 'createdAt' | 'festivalYear' | 'startsAt'>;

async function insertTicket(query: typeof sql, ticket: NewTicket): Promise<Ticket> {
  const festivalYear = getFestivalYear(ticket.date);
  const startsAt = parseTicketDateTime(ticket.date, ticket.start);

  const result = await query`
    INSERT INTO tickets (act, location, date, start, qr_code_url, pdf_url, transaction_id, festival_link, owner_email, festival_year, starts_at, qr_hash)
    VALUES (${ticket.act}, ${ticket.location}, ${ticket.date}, ${ticket.start}, ${ticket.qrCodeUrl}, ${ticket.pdfUrl}, ${ticket.transactionId || null}, ${ticket.festivalLink || null}, ${ticket.ownerEmail}, ${festivalYear}, ${startsAt.toISOString()}, ${ticket.qrHash || null})
    RETURNING id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", owner_email as "ownerEmail", festival_year as "festivalYear", starts_at as "startsAt", qr_hash as "qrHash", created_at as "createdAt"
  `;

  return result.rows[0] as Ticket;
}

export async function createTicket(ticket: NewTicket): Promise<Ticket> {
  return insertTicket(sql, ticket);
}

/**
 * Insert a ticket unless someone in `visibleEmails` already has one with the same QR code.
 * The check and insert run in one transaction under an advisory lock on the QR hash, so two
 * group members uploading the same ticket at the same time can't both save it.
 */
export async function createTicketUnlessDuplicate(
  visibleEmails: string[],
  ticket: NewTicket
): Promise<{ ticket: Ticket; duplicate?: undefined } | { ticket?: undefined; duplicate: Ticket }> {
  if (!ticket.qrHash) {
    return { ticket: await createTicket(ticket) };
  }

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    await client.sql`SELECT pg_advisory_xact_lock(hashtextextended(${ticket.qrHash}, 0))`;
    const existing = await client.sql`
      SELECT id, act, date, start, owner_email as "ownerEmail"
      FROM tickets
      WHERE qr_hash = ${ticket.qrHash} AND owner_email = ANY(${visibleEmails as any}::text[])
      LIMIT 1
    `;
    if (existing.rows[0]) {
      await client.sql`ROLLBACK`;
      return { duplicate: existing.rows[0] as Ticket };
    }
    const inserted = await insertTicket(client.sql.bind(client) as typeof sql, ticket);
    await client.sql`COMMIT`;
    return { ticket: inserted };
  } catch (error) {
    await client.sql`ROLLBACK`.catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getTicketsForYear(visibleEmails: string[], year: number): Promise<Ticket[]> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", owner_email as "ownerEmail", festival_year as "festivalYear", starts_at as "startsAt", qr_hash as "qrHash", created_at as "createdAt"
    FROM tickets
    WHERE owner_email = ANY(${visibleEmails as any}::text[]) AND festival_year = ${year}
    ORDER BY starts_at ASC, created_at ASC
  `;

  return result.rows as Ticket[];
}

export async function getTicketById(visibleEmails: string[], id: string): Promise<Ticket | null> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", owner_email as "ownerEmail", festival_year as "festivalYear", starts_at as "startsAt", qr_hash as "qrHash", created_at as "createdAt"
    FROM tickets
    WHERE id = ${id} AND owner_email = ANY(${visibleEmails as any}::text[])
  `;

  return (result.rows[0] as Ticket) || null;
}

export async function getTicketsByScreeningKey(
  visibleEmails: string[],
  act: string,
  date: string,
  start: string
): Promise<Ticket[]> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", owner_email as "ownerEmail", festival_year as "festivalYear", starts_at as "startsAt", qr_hash as "qrHash", created_at as "createdAt"
    FROM tickets
    WHERE act = ${act} AND date = ${date} AND start = ${start}
      AND owner_email = ANY(${visibleEmails as any}::text[])
    ORDER BY created_at ASC
  `;

  return result.rows as Ticket[];
}

export async function findTicketByQrHash(visibleEmails: string[], qrHash: string): Promise<Ticket | null> {
  const result = await sql`
    SELECT id, act, date, start, owner_email as "ownerEmail"
    FROM tickets
    WHERE qr_hash = ${qrHash} AND owner_email = ANY(${visibleEmails as any}::text[])
    LIMIT 1
  `;

  return (result.rows[0] as Ticket) || null;
}

export async function getFestivalYears(visibleEmails: string[]): Promise<number[]> {
  const result = await sql`
    SELECT DISTINCT festival_year as "festivalYear"
    FROM tickets
    WHERE owner_email = ANY(${visibleEmails as any}::text[])
    ORDER BY festival_year DESC
  `;

  return result.rows.map((row) => Number(row.festivalYear));
}

/**
 * Update the AI-extracted fields of a ticket. Only the owner can update their tickets.
 */
export async function updateTicketDetails(
  ownerEmail: string,
  id: string,
  fields: { act: string; location: string; date: string; start: string }
): Promise<Ticket | null> {
  const festivalYear = getFestivalYear(fields.date);
  const startsAt = parseTicketDateTime(fields.date, fields.start);

  // A stored festival link belongs to the old title and year, so drop it when either changes
  // (the right-hand side of SET sees the row's values before the update)
  const result = await sql`
    UPDATE tickets
    SET act = ${fields.act}, location = ${fields.location}, date = ${fields.date}, start = ${fields.start},
        festival_year = ${festivalYear}, starts_at = ${startsAt.toISOString()},
        festival_link = CASE WHEN act = ${fields.act} AND festival_year = ${festivalYear} THEN festival_link ELSE NULL END
    WHERE id = ${id} AND owner_email = ${ownerEmail}
    RETURNING id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", owner_email as "ownerEmail", festival_year as "festivalYear", starts_at as "startsAt", qr_hash as "qrHash", created_at as "createdAt"
  `;

  return (result.rows[0] as Ticket) || null;
}

export async function updateTicketFestivalLink(id: string, festivalLink: string): Promise<void> {
  await sql`
    UPDATE tickets SET festival_link = ${festivalLink} WHERE id = ${id}
  `;
}

/**
 * Delete a ticket. Only the owner can delete their tickets.
 * Returns the deleted ticket so callers can clean up its blobs.
 */
export async function deleteTicket(ownerEmail: string, id: string): Promise<Ticket | null> {
  const result = await sql`
    DELETE FROM tickets
    WHERE id = ${id} AND owner_email = ${ownerEmail}
    RETURNING id, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl"
  `;

  return (result.rows[0] as Ticket) || null;
}

export function screeningKey(act: string, date: string, start: string): string {
  return `${act}|${date}|${start}`;
}

/**
 * Split a screening key back into its parts. The movie title may itself contain "|",
 * so date and start are taken from the end.
 */
export function parseScreeningKey(key: string): { act: string; date: string; start: string } | null {
  const parts = key.split('|');
  if (parts.length < 3) {
    return null;
  }
  const start = parts.pop()!;
  const date = parts.pop()!;
  return { act: parts.join('|'), date, start };
}

export function groupTicketsIntoScreenings(tickets: Ticket[]): Screening[] {
  const screeningMap = new Map<string, Ticket[]>();

  for (const ticket of tickets) {
    const key = screeningKey(ticket.act, ticket.date, ticket.start);
    if (!screeningMap.has(key)) {
      screeningMap.set(key, []);
    }
    screeningMap.get(key)!.push(ticket);
  }

  const screenings: Screening[] = [];

  for (const [key, ticketGroup] of Array.from(screeningMap.entries())) {
    const firstTicket = ticketGroup[0];
    screenings.push({
      id: key,
      act: firstTicket.act,
      location: firstTicket.location,
      date: firstTicket.date,
      start: firstTicket.start,
      festivalYear: firstTicket.festivalYear,
      dateTime: parseTicketDateTime(firstTicket.date, firstTicket.start),
      tickets: ticketGroup,
      ticketCount: ticketGroup.length,
    });
  }

  return screenings.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}

export async function getScreeningsForYear(visibleEmails: string[], year: number): Promise<Screening[]> {
  const tickets = await getTicketsForYear(visibleEmails, year);
  return groupTicketsIntoScreenings(tickets);
}

export async function getScreening(visibleEmails: string[], key: string): Promise<Screening | null> {
  const parsed = parseScreeningKey(key);
  if (!parsed) {
    return null;
  }

  const tickets = await getTicketsByScreeningKey(visibleEmails, parsed.act, parsed.date, parsed.start);
  return groupTicketsIntoScreenings(tickets)[0] || null;
}

// Rating functions
export async function getRating(userEmail: string, act: string, year: number): Promise<Rating | null> {
  const result = await sql`
    SELECT id, user_email as "userEmail", act, festival_year as "festivalYear", rating, comment, created_at as "createdAt", updated_at as "updatedAt"
    FROM ratings
    WHERE user_email = ${userEmail} AND act = ${act} AND festival_year = ${year}
    LIMIT 1
  `;

  return (result.rows[0] as Rating) || null;
}

export async function getRatingsByMovie(visibleEmails: string[], act: string, year: number): Promise<Rating[]> {
  const result = await sql`
    SELECT id, user_email as "userEmail", act, festival_year as "festivalYear", rating, comment, created_at as "createdAt", updated_at as "updatedAt"
    FROM ratings
    WHERE act = ${act} AND festival_year = ${year} AND user_email = ANY(${visibleEmails as any}::text[])
    ORDER BY created_at DESC
  `;

  return result.rows as Rating[];
}

export async function getRatingsForYear(visibleEmails: string[], year: number): Promise<Rating[]> {
  const result = await sql`
    SELECT id, user_email as "userEmail", act, festival_year as "festivalYear", rating, comment, created_at as "createdAt", updated_at as "updatedAt"
    FROM ratings
    WHERE festival_year = ${year} AND user_email = ANY(${visibleEmails as any}::text[])
    ORDER BY rating DESC, act ASC
  `;

  return result.rows as Rating[];
}

/**
 * Average ratings for every movie of a festival year, in one query.
 */
export async function getAverageRatings(
  visibleEmails: string[],
  year: number
): Promise<Map<string, { average: number; count: number }>> {
  const result = await sql`
    SELECT act, AVG(rating) as average, COUNT(*)::int as count
    FROM ratings
    WHERE festival_year = ${year} AND user_email = ANY(${visibleEmails as any}::text[])
    GROUP BY act
  `;

  return new Map(
    result.rows.map((row) => [row.act as string, { average: parseFloat(row.average), count: row.count as number }])
  );
}

export async function getAverageRating(
  visibleEmails: string[],
  act: string,
  year: number
): Promise<{ average: number; count: number } | null> {
  const result = await sql`
    SELECT
      AVG(rating) as average,
      COUNT(*)::int as count
    FROM ratings
    WHERE act = ${act} AND festival_year = ${year} AND user_email = ANY(${visibleEmails as any}::text[])
  `;

  const row = result.rows[0];
  if (!row || row.count === 0) {
    return null;
  }

  return {
    average: parseFloat(row.average),
    count: row.count,
  };
}

export async function upsertRating(
  userEmail: string,
  act: string,
  year: number,
  rating: number,
  comment?: string | null
): Promise<Rating> {
  const result = await sql`
    INSERT INTO ratings (user_email, act, festival_year, rating, comment)
    VALUES (${userEmail}, ${act}, ${year}, ${rating}, ${comment || null})
    ON CONFLICT (user_email, act, festival_year)
    DO UPDATE SET
      rating = ${rating},
      comment = ${comment || null},
      updated_at = NOW()
    RETURNING id, user_email as "userEmail", act, festival_year as "festivalYear", rating, comment, created_at as "createdAt", updated_at as "updatedAt"
  `;

  return result.rows[0] as Rating;
}

export async function deleteRating(userEmail: string, act: string, year: number): Promise<void> {
  await sql`
    DELETE FROM ratings
    WHERE user_email = ${userEmail} AND act = ${act} AND festival_year = ${year}
  `;
}
