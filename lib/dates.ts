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

export function isToday(date: Date): boolean {
  return dayKey(date) === dayKey(getNow());
}

export function isPast(date: Date): boolean {
  return date < getNow();
}

export function formatDate(date: Date, style: 'short' | 'long' = 'short'): string {
  return date.toLocaleDateString('en-US', {
    timeZone: FESTIVAL_TIME_ZONE,
    weekday: style,
    year: 'numeric',
    month: style,
    day: 'numeric',
  });
}

export function formatDayHeading(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: FESTIVAL_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: FESTIVAL_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Normalize an AI-extracted start time ("6:45 pm") to the stored "06:45 PM" format */
export function normalizeStartTime(start: string): string {
  const match = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return start.trim();
  }
  return `${match[1].padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()}`;
}
