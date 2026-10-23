// Display helpers that are safe to use in both server and client components

/** Short display name from an email address: "misa.fasa@gmail.com" → "Misa.fasa" */
export function getDisplayName(email: string): string {
  const username = email.split('@')[0];
  // Capitalize first letter of username
  return username.charAt(0).toUpperCase() + username.slice(1);
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
