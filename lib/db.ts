import { sql } from '@vercel/postgres';
import { Ticket, Screening } from './types';

export async function createTicket(ticket: Omit<Ticket, 'id' | 'createdAt'>): Promise<Ticket> {
  const result = await sql`
    INSERT INTO tickets (act, location, date, start, qr_code_url, pdf_url, transaction_id)
    VALUES (${ticket.act}, ${ticket.location}, ${ticket.date}, ${ticket.start}, ${ticket.qrCodeUrl}, ${ticket.pdfUrl}, ${ticket.transactionId || null})
    RETURNING id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", created_at as "createdAt"
  `;
  
  return result.rows[0] as Ticket;
}

export async function getAllTickets(): Promise<Ticket[]> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", created_at as "createdAt"
    FROM tickets
    ORDER BY created_at DESC
  `;
  
  return result.rows as Ticket[];
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", created_at as "createdAt"
    FROM tickets
    WHERE id = ${id}
  `;
  
  return result.rows[0] as Ticket || null;
}

export async function getTicketsByScreeningKey(act: string, date: string, start: string): Promise<Ticket[]> {
  const result = await sql`
    SELECT id, act, location, date, start, qr_code_url as "qrCodeUrl", pdf_url as "pdfUrl", transaction_id as "transactionId", created_at as "createdAt"
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
  
  for (const [key, ticketGroup] of screeningMap.entries()) {
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

