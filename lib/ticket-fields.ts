import type { ExtractedTicketFields } from './types';
import { normalizeStartTime, parseTicketDateTime } from './dates';

// tickets.act and tickets.location are VARCHAR(255)
export const MAX_TICKET_FIELD_LENGTH = 255;

const DATE_PATTERN = /^\d{2}-\d{2}-\d{4}$/;
const START_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

/**
 * Trim and check a ticket's title, venue, date and time, whether read by AI at upload or typed in
 * "Fix details". Returns the fields ready to store (start normalized to "HH:MM AM/PM"), or an error
 * message for the user. Checked before anything is stored, so a bad read never leaves a file behind.
 */
export function validateTicketFields(
  raw: Partial<Record<keyof ExtractedTicketFields, unknown>>
): { ok: true; fields: ExtractedTicketFields } | { ok: false; error: string } {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const act = text(raw.act);
  const location = text(raw.location);
  const date = text(raw.date);
  const start = text(raw.start);

  if (!act || !location || !date || !start) {
    return { ok: false, error: 'Title, venue, date, and time are required' };
  }
  if (act.length > MAX_TICKET_FIELD_LENGTH || location.length > MAX_TICKET_FIELD_LENGTH) {
    return { ok: false, error: `Title and venue must be ${MAX_TICKET_FIELD_LENGTH} characters or fewer` };
  }
  if (!DATE_PATTERN.test(date) || !START_PATTERN.test(start)) {
    return { ok: false, error: 'Date must be DD-MM-YYYY and time must be HH:MM AM/PM' };
  }
  try {
    parseTicketDateTime(date, start);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid date or time' };
  }
  return { ok: true, fields: { act, location, date, start: normalizeStartTime(start) } };
}
