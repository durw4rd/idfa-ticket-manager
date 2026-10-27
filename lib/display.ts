// Display helpers that are safe to use in both server and client components

// Number of crew colours defined as --crew-0 … --crew-5 in app/globals.css
export const CREW_COLOR_COUNT = 6;

/**
 * Default display name from an email address, for users who haven't picked one:
 * "misa.fasa@gmail.com" → "Misa"
 */
export function getDisplayName(email: string): string {
  const username = email.split('@')[0];
  const first = username.split(/[._+\-\d]/).find(Boolean) || username;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** One or two letters for an avatar: "Misa" → "M" */
export function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Human-friendly relative time until a screening, e.g. "in 2 days", "in 3 h 20 min" */
export function formatTimeUntil(target: Date, now: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) {
    return 'starting now';
  }
  if (minutes < 60) {
    return `in ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `in ${hours} h ${rest} min` : `in ${hours} h`;
  }
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
