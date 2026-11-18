import { sql as vercelSql, db } from '@vercel/postgres';
import { Ticket, Screening, Rating, FilmPlace } from './types';
import { getFestivalYear, parseTicketDateTime } from './dates';
import { parseScreeningKey, screeningKey } from './agenda';
import { filmKeysByTitle, latestRatingPerFilm, pickStoredPlace, ratingFilmKey, titleFilmKey } from './films';

// Kept importable from here too; they live in lib/agenda.ts so client components can use them
export { parseScreeningKey, screeningKey };

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

type Query = typeof sql;

/** Run `work` in one transaction on its own connection; everything is rolled back if it throws */
export async function withTransaction<T>(work: (query: Query) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await work(client.sql.bind(client) as Query);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`.catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * withTransaction, holding a transaction-scoped advisory lock on `key` throughout, so changes that
 * use the same key run one at a time and every check sees the data as it is when the change is
 * written. Used for ticket inserts (per QR code), group membership (per group), voting links
 * (per owner) and ratings (per person and year).
 */
export function withAdvisoryLock<T>(key: string, work: (query: Query) => Promise<T>): Promise<T> {
  return withTransaction(async (query) => {
    await query`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    return work(query);
  });
}

/**
 * A tickets row as a Ticket. Ticket queries select and return `*` and come through here, so a new
 * column means one change here (and in lib/types.ts), not one per query.
 */
// Rows from @vercel/postgres are untyped
function toTicket(row: Record<string, any>): Ticket {
  return {
    id: row.id,
    act: row.act,
    location: row.location,
    date: row.date,
    start: row.start,
    qrCodeUrl: row.qr_code_url,
    pdfUrl: row.pdf_url,
    transactionId: row.transaction_id,
    festivalLink: row.festival_link,
    ownerEmail: row.owner_email,
    holderEmail: row.holder_email,
    festivalYear: row.festival_year,
    startsAt: row.starts_at,
    qrHash: row.qr_hash,
    endsAt: row.ends_at,
    hasQa: row.has_qa,
    createdAt: row.created_at,
  };
}

// Every read below is scoped to `visibleEmails`: the viewer plus their active group members
// (see getVisibleEmails in lib/groups.ts). Writes are scoped to the owner's own email.

// The holder defaults to the uploader
type NewTicket = Omit<Ticket, 'id' | 'createdAt' | 'festivalYear' | 'startsAt' | 'holderEmail'> & { holderEmail?: string };

async function insertTicket(query: Query, ticket: NewTicket): Promise<Ticket> {
  const festivalYear = getFestivalYear(ticket.date);
  const startsAt = parseTicketDateTime(ticket.date, ticket.start);

  const result = await query`
    INSERT INTO tickets (act, location, date, start, qr_code_url, pdf_url, transaction_id, festival_link, owner_email, holder_email, festival_year, starts_at, qr_hash, ends_at, has_qa)
    VALUES (${ticket.act}, ${ticket.location}, ${ticket.date}, ${ticket.start}, ${ticket.qrCodeUrl}, ${ticket.pdfUrl}, ${ticket.transactionId || null}, ${ticket.festivalLink || null}, ${ticket.ownerEmail}, ${ticket.holderEmail || ticket.ownerEmail}, ${festivalYear}, ${startsAt.toISOString()}, ${ticket.qrHash || null}, ${ticket.endsAt ? ticket.endsAt.toISOString() : null}, ${ticket.hasQa ?? null})
    RETURNING *
  `;

  return toTicket(result.rows[0]);
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
    return { ticket: await insertTicket(sql, ticket) };
  }

  return withAdvisoryLock(ticket.qrHash, async (query) => {
    const existing = await query`
      SELECT id, act, date, start, owner_email as "ownerEmail"
      FROM tickets
      WHERE qr_hash = ${ticket.qrHash} AND owner_email = ANY(${visibleEmails as any}::text[])
      LIMIT 1
    `;
    if (existing.rows[0]) {
      return { duplicate: existing.rows[0] as Ticket };
    }
    return { ticket: await insertTicket(query, ticket) };
  });
}

export async function getTicketsForYear(visibleEmails: string[], year: number): Promise<Ticket[]> {
  const result = await sql`
    SELECT *
    FROM tickets
    WHERE owner_email = ANY(${visibleEmails as any}::text[]) AND festival_year = ${year}
    ORDER BY starts_at ASC, created_at ASC
  `;

  return result.rows.map(toTicket);
}

export async function getTicketById(visibleEmails: string[], id: string): Promise<Ticket | null> {
  const result = await sql`
    SELECT *
    FROM tickets
    WHERE id = ${id} AND owner_email = ANY(${visibleEmails as any}::text[])
  `;

  return result.rows[0] ? toTicket(result.rows[0]) : null;
}

export async function getTicketsByScreeningKey(
  visibleEmails: string[],
  act: string,
  date: string,
  start: string
): Promise<Ticket[]> {
  const result = await sql`
    SELECT *
    FROM tickets
    WHERE act = ${act} AND date = ${date} AND start = ${start}
      AND owner_email = ANY(${visibleEmails as any}::text[])
    ORDER BY created_at ASC
  `;

  return result.rows.map(toTicket);
}

/** True if one of the owner's tickets has this QR image (for cleaning up after a failed save) */
export async function ticketUsesQrCodeUrl(ownerEmail: string, qrCodeUrl: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM tickets WHERE owner_email = ${ownerEmail} AND qr_code_url = ${qrCodeUrl} LIMIT 1
  `;
  return result.rows.length > 0;
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

  // A stored festival link belongs to the old title and year, so drop it when either changes.
  // Likewise the end time and Q&A belong to one showing; the next agenda load looks them up again.
  // (the right-hand side of SET sees the row's values before the update)
  const result = await sql`
    UPDATE tickets
    SET act = ${fields.act}, location = ${fields.location}, date = ${fields.date}, start = ${fields.start},
        festival_year = ${festivalYear}, starts_at = ${startsAt.toISOString()},
        festival_link = CASE WHEN act = ${fields.act} AND festival_year = ${festivalYear} THEN festival_link ELSE NULL END,
        ends_at = CASE WHEN act = ${fields.act} AND date = ${fields.date} AND start = ${fields.start} THEN ends_at ELSE NULL END,
        has_qa = CASE WHEN act = ${fields.act} AND date = ${fields.date} AND start = ${fields.start} THEN has_qa ELSE NULL END
    WHERE id = ${id} AND owner_email = ${ownerEmail}
    RETURNING *
  `;

  return result.rows[0] ? toTicket(result.rows[0]) : null;
}

/**
 * Hand a ticket to someone else in the group. Unlike other ticket writes, the current holder may
 * do this as well as the owner, so a crew-mate can pass on a ticket they were given. The caller
 * checks that `holderEmail` is in the viewer's visible emails; this also requires the new holder
 * to see the owner's tickets (visibility isn't transitive across groups), or they couldn't open it.
 */
export async function updateTicketHolder(
  viewer: { email: string; visibleEmails: string[] },
  id: string,
  holderEmail: string
): Promise<Ticket | null> {
  const result = await sql`
    UPDATE tickets
    SET holder_email = ${holderEmail}
    WHERE id = ${id}
      AND (owner_email = ${viewer.email} OR holder_email = ${viewer.email})
      AND owner_email = ANY(${viewer.visibleEmails as any}::text[])
      AND (
        owner_email = ${holderEmail}
        OR EXISTS (
          SELECT 1 FROM group_members owner_m
          JOIN group_members holder_m ON holder_m.group_id = owner_m.group_id
          WHERE owner_m.user_email = tickets.owner_email AND owner_m.status = 'active'
            AND holder_m.user_email = ${holderEmail} AND holder_m.status = 'active'
        )
      )
    RETURNING *
  `;

  return result.rows[0] ? toTicket(result.rows[0]) : null;
}

/**
 * Store the IDFA page found for one of the owner's tickets after its title was corrected. Only
 * while the ticket still has that title and festival year and no link, so a lookup that finishes after another edit
 * can't attach the wrong film.
 */
export async function updateTicketFestivalLink(
  ownerEmail: string,
  id: string,
  act: string,
  festivalYear: number,
  festivalLink: string
): Promise<void> {
  await sql`
    UPDATE tickets SET festival_link = ${festivalLink}
    WHERE id = ${id} AND owner_email = ${ownerEmail} AND act = ${act} AND festival_year = ${festivalYear}
      AND festival_link IS NULL
  `;
}

/**
 * Store what the IDFA site says about a showing (see refreshShowDetails in lib/idfa.ts) on every
 * visible ticket for it. Not limited to the caller's own tickets: this is public programme
 * information about the screening, the same for everyone holding a ticket.
 */
export async function updateScreeningShowDetails(
  visibleEmails: string[],
  screening: { act: string; date: string; start: string },
  details: { endsAt: Date | null; hasQa: boolean | null }
): Promise<void> {
  await sql`
    UPDATE tickets
    SET ends_at = ${details.endsAt ? details.endsAt.toISOString() : null}, has_qa = ${details.hasQa}
    WHERE act = ${screening.act} AND date = ${screening.date} AND start = ${screening.start}
      AND owner_email = ANY(${visibleEmails as any}::text[])
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
      endsAt: ticketGroup.find((ticket) => ticket.endsAt)?.endsAt ?? null,
      hasQa: ticketGroup.find((ticket) => ticket.hasQa != null)?.hasQa ?? null,
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

// Rating functions. A rating is per person, film and festival year; the film is the IDFA page
// its title is linked to (see lib/films.ts), so a film shown under two titles gets one rating.

// Rows from @vercel/postgres are untyped; rating queries select and return `*` and come through here
function toRating(row: Record<string, any>): Rating {
  return {
    id: row.id,
    userEmail: row.user_email,
    // Null only for a rating saved by the old code before migration 008
    filmKey: row.film_key ?? titleFilmKey(row.act),
    act: row.act,
    festivalYear: row.festival_year,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every title the crew has a ticket for in a festival year, once per festival link it has */
async function getFilmTitles(
  visibleEmails: string[],
  year: number
): Promise<Array<{ act: string; festivalLink: string | null }>> {
  const result = await sql`
    SELECT DISTINCT act, festival_link AS "festivalLink"
    FROM tickets
    WHERE festival_year = ${year} AND owner_email = ANY(${visibleEmails as any}::text[])
  `;
  return result.rows as Array<{ act: string; festivalLink: string | null }>;
}

/**
 * Film key for every title the crew has a ticket for or rated in a festival year (see
 * filmKeysByTitle), and the crew's ratings with their filmKey moved to the film's current key,
 * one per person and film.
 */
async function getRatingsAndFilmKeys(
  visibleEmails: string[],
  year: number
): Promise<{ keysByTitle: Map<string, string>; ratings: Rating[] }> {
  const [titles, stored] = await Promise.all([
    getFilmTitles(visibleEmails, year),
    sql`
      SELECT * FROM ratings
      WHERE festival_year = ${year} AND user_email = ANY(${visibleEmails as any}::text[])
      ORDER BY rating DESC, act ASC
    `,
  ]);
  const raw = stored.rows.map(toRating);
  const keysByTitle = filmKeysByTitle(titles, raw);
  const ratings = latestRatingPerFilm(raw.map((rating) => ({ ...rating, filmKey: ratingFilmKey(rating, keysByTitle) })));
  return { keysByTitle, ratings };
}

/**
 * Every rating the crew gave in a festival year, under the film's current key, and which film each
 * title belongs to. Pages use these keys rather than working them out again: the ratings that
 * link a title to its film can be among those left out as duplicates.
 */
export async function getRatingsForYear(
  visibleEmails: string[],
  year: number
): Promise<{ keysByTitle: Map<string, string>; ratings: Rating[] }> {
  return getRatingsAndFilmKeys(visibleEmails, year);
}

/** The crew's ratings for the film a title belongs to, newest first */
export async function getRatingsForFilm(visibleEmails: string[], act: string, year: number): Promise<Rating[]> {
  const { keysByTitle, ratings } = await getRatingsAndFilmKeys(visibleEmails, year);
  const key = filmKeyForTitle(keysByTitle, act);
  return ratings
    .filter((rating) => rating.filmKey === key)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function filmKeyForTitle(keysByTitle: Map<string, string>, act: string): string {
  return keysByTitle.get(act) ?? titleFilmKey(act);
}

/**
 * Save the user's rating for the film `act` belongs to. One rating per film: a rating the user
 * gave the same film under another key (before its IDFA page was known) is replaced.
 */
export async function upsertRating(
  visibleEmails: string[],
  userEmail: string,
  act: string,
  year: number,
  rating: number,
  comment?: string | null
): Promise<Rating> {
  const { keysByTitle } = await getRatingsAndFilmKeys(visibleEmails, year);
  const key = filmKeyForTitle(keysByTitle, act);
  return withAdvisoryLock(`rating:${userEmail}:${year}`, async (query) => {
    const mine = await query`SELECT id, film_key, act FROM ratings WHERE user_email = ${userEmail} AND festival_year = ${year}`;
    const replaced = mine.rows
      .filter((row) => row.film_key !== key && ratingFilmKey({ filmKey: row.film_key, act: row.act }, keysByTitle) === key)
      .map((row) => row.id as string);
    if (replaced.length > 0) {
      await query`DELETE FROM ratings WHERE user_email = ${userEmail} AND id = ANY(${replaced as any}::uuid[])`;
    }
    const result = await query`
      INSERT INTO ratings (user_email, film_key, act, festival_year, rating, comment)
      VALUES (${userEmail}, ${key}, ${act}, ${year}, ${rating}, ${comment || null})
      ON CONFLICT (user_email, film_key, festival_year)
      -- act stays the title first rated: a title known to be this film only through that rating
      -- (no link of its own) would otherwise lose its film when the rating is saved from another title
      DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW()
      RETURNING *
    `;
    return toRating(result.rows[0]);
  });
}

/** Remove the user's rating for the film `act` belongs to, under whichever key it was saved */
export async function deleteRating(visibleEmails: string[], userEmail: string, act: string, year: number): Promise<void> {
  const { keysByTitle } = await getRatingsAndFilmKeys(visibleEmails, year);
  const key = filmKeyForTitle(keysByTitle, act);
  await withAdvisoryLock(`rating:${userEmail}:${year}`, async (query) => {
    const mine = await query`SELECT id, film_key, act FROM ratings WHERE user_email = ${userEmail} AND festival_year = ${year}`;
    const ids = mine.rows
      .filter((row) => ratingFilmKey({ filmKey: row.film_key, act: row.act }, keysByTitle) === key)
      .map((row) => row.id as string);
    if (ids.length > 0) {
      await query`DELETE FROM ratings WHERE user_email = ${userEmail} AND id = ANY(${ids as any}::uuid[])`;
    }
  });
}

// Film places: where each film mainly takes place, for the agenda's map view (see lib/find-film-place.ts).
// Keyed like ratings by film and festival year. This is public programme information rather than
// anyone's data, so, like updateScreeningShowDetails, writes aren't limited to the caller's own
// rows: anyone whose crew has a ticket for the film may set it, and reads only cover films the
// viewer's crew has tickets for.

type StoredPlace = FilmPlace & { updatedAt: Date };

function toFilmPlace(row: Record<string, any>): StoredPlace {
  return {
    placeName: row.place_name,
    country: row.country,
    lat: row.lat,
    lon: row.lon,
    source: row.source,
    updatedAt: row.updated_at,
  };
}

export interface FilmPlaces {
  /** Every title the crew has a ticket for this year, with its festival link when one is known */
  titles: Array<{ act: string; festivalLink: string | null }>;
  /** Which film each title is (see filmKeysByTitle) */
  keysByTitle: Map<string, string>;
  /** Stored places by film key */
  places: Map<string, FilmPlace>;
  /** Films with a lookup claimed or failed recently (see claimFilmPlaceLookup) */
  recentlyAttempted: Set<string>;
}

// How long a claimed lookup holds the film: a failed one waits this long before the next try, and
// one that died without finishing doesn't block it longer than this
const ATTEMPT_RETRY_HOURS = 6;

/**
 * The places of the films the crew has tickets for in a festival year. A place saved while a title
 * had no IDFA page yet is stored under its title key; once the title is linked, it counts for the
 * film (a person's correction beating the AI's place, see pickStoredPlace) and is copied onto the
 * film's key, so the film's other titles show it too. The title row stays: another crew may still
 * have the title without its link.
 */
export async function getFilmPlacesForYear(visibleEmails: string[], year: number): Promise<FilmPlaces> {
  const titles = await getFilmTitles(visibleEmails, year);
  const keysByTitle = filmKeysByTitle(titles);
  const keys = Array.from(new Set([...keysByTitle.values(), ...titles.map(({ act }) => titleFilmKey(act))]));
  if (keys.length === 0) {
    return { titles, keysByTitle, places: new Map(), recentlyAttempted: new Set() };
  }

  const [stored, attempts] = await Promise.all([
    sql`
      SELECT film_key, place_name, country, lat, lon, source, updated_at
      FROM film_places
      WHERE festival_year = ${year} AND film_key = ANY(${keys as any}::text[])
    `,
    sql`
      SELECT film_key FROM film_place_attempts
      WHERE festival_year = ${year} AND film_key = ANY(${keys as any}::text[])
        AND attempted_at > NOW() - make_interval(hours => ${ATTEMPT_RETRY_HOURS})
    `,
  ]);
  const byKey = new Map(stored.rows.map((row) => [row.film_key as string, toFilmPlace(row)]));
  const places = new Map<string, FilmPlace>();
  const toPromote: Array<{ titleKey: string; filmKey: string }> = [];
  for (const { act } of titles) {
    const key = keysByTitle.get(act) ?? titleFilmKey(act);
    const titleKey = titleFilmKey(act);
    // Copied only while the title's row should win, so this isn't repeated on every load
    const titleRow = byKey.get(titleKey);
    if (key !== titleKey && titleRow && pickStoredPlace(byKey.get(key), titleRow) === titleRow) {
      toPromote.push({ titleKey, filmKey: key });
    }
    // Several titles can be one film: each one's title-key place is weighed against what the film has so far
    const place = pickStoredPlace((places.get(key) as StoredPlace | undefined) ?? byKey.get(key), byKey.get(titleKey));
    if (place) places.set(key, place);
  }
  if (toPromote.length > 0) {
    await promoteTitlePlaces(toPromote, year);
  }
  return {
    titles,
    keysByTitle,
    places,
    recentlyAttempted: new Set(attempts.rows.map((row) => row.film_key as string)),
  };
}

/**
 * Copy places saved under a title key onto the film key the title now belongs to, keeping a
 * person's correction over the AI's place (and the newer of two corrections). One statement per
 * title, and nothing is deleted, so a correction saved meanwhile is never lost: it's copied on the
 * next load. Best effort: the reads above already show the right place.
 */
async function promoteTitlePlaces(moves: Array<{ titleKey: string; filmKey: string }>, year: number): Promise<void> {
  try {
    await withTransaction(async (query) => {
      for (const { titleKey, filmKey } of moves) {
        await query`
          INSERT INTO film_places (film_key, festival_year, place_name, country, lat, lon, source, updated_at)
          SELECT ${filmKey}, festival_year, place_name, country, lat, lon, source, updated_at
          FROM film_places WHERE film_key = ${titleKey} AND festival_year = ${year}
          ON CONFLICT (film_key, festival_year) DO UPDATE
            SET place_name = EXCLUDED.place_name, country = EXCLUDED.country, lat = EXCLUDED.lat,
                lon = EXCLUDED.lon, source = EXCLUDED.source, updated_at = EXCLUDED.updated_at
            WHERE EXCLUDED.source = 'manual'
              AND (film_places.source <> 'manual' OR EXCLUDED.updated_at > film_places.updated_at)
        `;
      }
    });
  } catch (error) {
    console.warn('Could not move title places onto their films:', error);
  }
}

/** The place of the film `act` belongs to, or null when none is stored */
export async function getFilmPlace(visibleEmails: string[], act: string, year: number): Promise<FilmPlace | null> {
  const { keysByTitle, places } = await getFilmPlacesForYear(visibleEmails, year);
  return places.get(keysByTitle.get(act) ?? titleFilmKey(act)) ?? null;
}

/**
 * Store where the film `act` belongs to takes place: a place, or null for "no single place" (the
 * AI's finding with source 'none', or a person's choice with source 'manual'). Returns false when
 * nobody in the crew has a ticket with that title this year. A person's choice, place or no place,
 * is never replaced by the AI's: only another manual one overwrites it.
 */
export async function saveFilmPlace(
  visibleEmails: string[],
  act: string,
  year: number,
  place: Omit<FilmPlace, 'source'> | null,
  source: FilmPlace['source']
): Promise<boolean> {
  const titles = await getFilmTitles(visibleEmails, year);
  if (!titles.some((title) => title.act === act)) {
    return false;
  }
  const key = filmKeysByTitle(titles).get(act) ?? titleFilmKey(act);
  const value = !place || source === 'none' ? { placeName: null, country: null, lat: null, lon: null } : place;
  await withTransaction(async (query) => {
    await query`
      INSERT INTO film_places (film_key, festival_year, place_name, country, lat, lon, source)
      VALUES (${key}, ${year}, ${value.placeName}, ${value.country}, ${value.lat}, ${value.lon}, ${source})
      ON CONFLICT (film_key, festival_year) DO UPDATE
        SET place_name = EXCLUDED.place_name, country = EXCLUDED.country, lat = EXCLUDED.lat,
            lon = EXCLUDED.lon, source = EXCLUDED.source, updated_at = NOW()
        WHERE film_places.source <> 'manual' OR EXCLUDED.source = 'manual'
    `;
    // A correction made under the title before its page was known gets the same value, so crews
    // that have the title without its link see this one too (an AI result leaves it be)
    if (source === 'manual' && key !== titleFilmKey(act)) {
      await query`
        UPDATE film_places
        SET place_name = ${value.placeName}, country = ${value.country}, lat = ${value.lat}, lon = ${value.lon},
            source = 'manual', updated_at = NOW()
        WHERE film_key = ${titleFilmKey(act)} AND festival_year = ${year}
      `;
    }
    await query`DELETE FROM film_place_attempts WHERE film_key = ${key} AND festival_year = ${year}`;
  });
  return true;
}

/**
 * Claim the lookup of a film's place, so two requests (an upload and an agenda load, say) don't
 * both pay for it. True when this caller may look it up: nobody claimed it in the last few hours,
 * or `force`. The claim stays as the "failed recently" mark if the lookup can't finish, and
 * saveFilmPlace clears it.
 */
export async function claimFilmPlaceLookup(filmKey: string, year: number, force = false): Promise<boolean> {
  const result = await sql`
    INSERT INTO film_place_attempts (film_key, festival_year, attempted_at)
    VALUES (${filmKey}, ${year}, NOW())
    ON CONFLICT (film_key, festival_year) DO UPDATE SET attempted_at = NOW()
      WHERE ${force} OR film_place_attempts.attempted_at <= NOW() - make_interval(hours => ${ATTEMPT_RETRY_HOURS})
    RETURNING film_key
  `;
  return (result.rowCount ?? 0) > 0;
}

/** Whether a place (or a deliberate "no single place") is stored under this film key */
export async function hasStoredFilmPlace(filmKey: string, year: number): Promise<boolean> {
  const result = await sql`SELECT 1 FROM film_places WHERE film_key = ${filmKey} AND festival_year = ${year} LIMIT 1`;
  return (result.rowCount ?? 0) > 0;
}

/** Give up a claim without a result (the film turned out to be placed already) */
export async function releaseFilmPlaceClaim(filmKey: string, year: number): Promise<void> {
  await sql`DELETE FROM film_place_attempts WHERE film_key = ${filmKey} AND festival_year = ${year}`;
}
