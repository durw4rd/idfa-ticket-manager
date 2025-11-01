import { sql as vercelSql } from '@vercel/postgres';
import { Ticket, Screening, Rating } from './types';

// Set DATABASE_URL or POSTGRES_URL before importing
// @vercel/postgres uses POSTGRES_URL by default, but we support DATABASE_URL too
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}

// Use the sql template tag - it will use POSTGRES_URL or DATABASE_URL
const sql = vercelSql;

export async function createTicket(ticket: Omit<Ticket, 'id' | 'createdAt'>): Promise<Ticket> {
  const result = await sql`
    INSERT INTO tickets (act, location, date, start, qr_code_url, pdf_url, transaction_id, festival_link)
    VALUES (${ticket.act}, ${ticket.location}, ${ticket.date}, ${ticket.start}, ${ticket.qrCodeUrl}, ${ticket.pdfUrl}, ${ticket.transactionId || null}, ${ticket.festivalLink || null})
    RETURNING id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", created_at as "createdAt"
  `;
  
  return result.rows[0] as Ticket;
}

export async function getAllTickets(): Promise<Ticket[]> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", created_at as "createdAt"
    FROM tickets
    ORDER BY created_at DESC
  `;
  
  return result.rows as Ticket[];
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", created_at as "createdAt"
    FROM tickets
    WHERE id = ${id}
  `;
  
  return result.rows[0] as Ticket || null;
}

export async function getTicketsByScreeningKey(act: string, date: string, start: string): Promise<Ticket[]> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", festival_link as "festivalLink", created_at as "createdAt"
    FROM tickets
    WHERE act = ${act} AND date = ${date} AND start = ${start}
    ORDER BY created_at ASC
  `;
  
  return result.rows as Ticket[];
}

export async function deleteTicket(id: string): Promise<void> {
  await sql`
    DELETE FROM tickets
    WHERE id = ${id}
  `;
}

export function parseTicketDateTime(date: string, start: string): Date {
  // Parse DD-MM-YYYY and HH:MM AM/PM format
  const [day, month, year] = date.split('-').map(Number);
  const timeMatch = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  
  if (!timeMatch) {
    throw new Error(`Invalid time format: ${start}`);
  }
  
  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  const ampm = timeMatch[3].toUpperCase();
  
  if (ampm === 'PM' && hours !== 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return new Date(year, month - 1, day, hours, minutes);
}

export function groupTicketsIntoScreenings(tickets: Ticket[]): Screening[] {
  const screeningMap = new Map<string, Ticket[]>();
  
  for (const ticket of tickets) {
    const key = `${ticket.act}|${ticket.date}|${ticket.start}`;
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
      dateTime: parseTicketDateTime(firstTicket.date, firstTicket.start),
      tickets: ticketGroup,
      ticketCount: ticketGroup.length,
    });
  }
  
  return screenings.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}

export async function getAllScreenings(): Promise<Screening[]> {
  const tickets = await getAllTickets();
  return groupTicketsIntoScreenings(tickets);
}

// Rating functions
export async function getRating(userEmail: string, act: string): Promise<Rating | null> {
  const result = await sql`
    SELECT id, user_email as "userEmail", act, rating, comment, created_at as "createdAt", updated_at as "updatedAt"
    FROM ratings
    WHERE user_email = ${userEmail} AND act = ${act}
    LIMIT 1
  `;

  return result.rows[0] as Rating || null;
}

export async function getRatingsByMovie(act: string): Promise<Rating[]> {
  const result = await sql`
    SELECT id, user_email as "userEmail", act, rating, comment, created_at as "createdAt", updated_at as "updatedAt"
    FROM ratings
    WHERE act = ${act}
    ORDER BY created_at DESC
  `;

  return result.rows as Rating[];
}

export async function getAverageRating(act: string): Promise<{ average: number; count: number } | null> {
  const result = await sql`
    SELECT 
      AVG(rating) as average,
      COUNT(*)::int as count
    FROM ratings
    WHERE act = ${act}
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
  rating: number,
  comment?: string | null
): Promise<Rating> {
  const result = await sql`
    INSERT INTO ratings (user_email, act, rating, comment)
    VALUES (${userEmail}, ${act}, ${rating}, ${comment || null})
    ON CONFLICT (user_email, act)
    DO UPDATE SET
      rating = ${rating},
      comment = ${comment || null},
      updated_at = NOW()
    RETURNING id, user_email as "userEmail", act, rating, comment, created_at as "createdAt", updated_at as "updatedAt"
  `;

  return result.rows[0] as Rating;
}

export async function deleteRating(userEmail: string, act: string): Promise<void> {
  await sql`
    DELETE FROM ratings
    WHERE user_email = ${userEmail} AND act = ${act}
  `;
}

