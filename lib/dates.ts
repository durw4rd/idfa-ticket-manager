// IDFA screenings happen in Amsterdam, so all ticket times are Amsterdam wall-clock times.
// Servers (Vercel) run in UTC, so every parse/format goes through this time zone explicitly.
export const FESTIVAL_TIME_ZONE = 'Europe/Amsterdam';

// For testing: set TEST_DATE (e.g. "2026-11-14T14:00:00Z") to override the current date
const TEST_NOW = process.env.TEST_DATE ? new Date(process.env.TEST_DATE) : null;

export function getNow(): Date {
  return TEST_NOW || new Date();
}

function zonedParts(date: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FESTIVAL_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const result: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      result[part.type] = Number(part.value);
    }
  }
  return result;
}

/**
 * Convert an Amsterdam wall-clock time into an absolute Date
 */
function amsterdamTimeToDate(year: number, month: number, day: number, hours: number, minutes: number): Date {
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const p = zonedParts(new Date(asUtc));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - asUtc;
  return new Date(asUtc - offset);
}

export function parseTicketDateTime(date: string, start: string): Date {
  // Parse DD-MM-YYYY and HH:MM AM/PM format
  const [day, month, year] = date.split('-').map(Number);
  const timeMatch = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  if (!timeMatch || !day || !month || !year) {
    throw new Error(`Invalid date/time format: ${date} ${start}`);
  }

  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  const ampm = timeMatch[3].toUpperCase();

  // Reject impossible values instead of letting Date roll them into another day or time
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new Error(`Invalid date: ${date}`);
  }
  if (hours < 1 || hours > 12 || minutes > 59) {
    throw new Error(`Invalid time: ${start}`);
  }

  if (ampm === 'PM' && hours !== 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }

  return amsterdamTimeToDate(year, month, day, hours, minutes);
}

export function getFestivalYear(date: string): number {
  const year = Number(date.split('-')[2]);
  if (!year) {
    throw new Error(`Invalid date format: ${date}`);
  }
  return year;
}

export function getCurrentFestivalYear(): number {
  return zonedParts(getNow()).year;
}

/** Amsterdam calendar day as YYYY-MM-DD, used for grouping and "today" checks */
export function dayKey(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// A 00:30 show is part of the previous night's programme, so festival days start at 05:00
const FESTIVAL_DAY_START_HOURS = 5;

/** The festival day a moment belongs to, as YYYY-MM-DD: like dayKey, but the day starts at 05:00 */
export function festivalDayKey(date: Date): string {
  return dayKey(festivalDayStart(date));
}

/** A moment on the calendar day of its festival day, for headings (00:30 Sunday → Saturday) */
export function festivalDayStart(date: Date): Date {
  return new Date(date.getTime() - FESTIVAL_DAY_START_HOURS * 3600000);
}

export function isToday(date: Date): boolean {
  return dayKey(date) === dayKey(getNow());
}

export function isPast(date: Date): boolean {
  return date < getNow();
}

// Festival-local formats: 24h times and day-month order, as on the tickets and the IDFA site

/** "Sun 15 Nov" ("short") or "Sunday 15 November 2026" ("long") */
export function formatDate(date: Date, style: 'short' | 'long' = 'short'): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: FESTIVAL_TIME_ZONE,
    weekday: style,
    day: 'numeric',
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });
}

/** "Sunday 15 November", for day section headings */
export function formatDayHeading(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: FESTIVAL_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "16:00" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: FESTIVAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** Amsterdam hour of day with minutes as a fraction, e.g. 16:30 → 16.5. For timeline layout. */
export function hourOfDay(date: Date): number {
  const p = zonedParts(date);
  return p.hour + p.minute / 60;
}

// Typical IDFA screening length; tickets don't carry the film's runtime
export const DEFAULT_SCREENING_MINUTES = 120;

export function screeningEnd(start: Date): Date {
  return new Date(start.getTime() + DEFAULT_SCREENING_MINUTES * 60000);
}

/** Normalize an AI-extracted start time ("6:45 pm") to the stored "06:45 PM" format */
export function normalizeStartTime(start: string): string {
  const match = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return start.trim();
  }
  return `${match[1].padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()}`;
}

// Conversions between the stored ticket formats and HTML date/time inputs

/** "15-11-2026" → "2026-11-15" (input type=date) */
export function ticketDateToInput(date: string): string {
  const [day, month, year] = date.split('-');
  return year && month && day ? `${year}-${month}-${day}` : '';
}

/** "2026-11-15" → "15-11-2026" */
export function inputToTicketDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}-${month}-${year}` : '';
}

/** "04:00 PM" → "16:00" (input type=time) */
export function ticketStartToInput(start: string): string {
  const match = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return '';
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** "16:00" → "04:00 PM" */
export function inputToTicketStart(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (!match) return '';
  const hours = Number(match[1]);
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(twelve).padStart(2, '0')}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
}
