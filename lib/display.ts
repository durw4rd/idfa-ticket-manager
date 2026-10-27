// Display helpers that are safe to use in both server and client components

// Number of crew colours defined as --crew-0 … --crew-5 in app/globals.css
export const CREW_COLOR_COUNT = 6;

/**
 * Badges people pick for their avatar. Each one owns the crew colour at its index, so a badge looks
 * the same everywhere, and within a crew no two people share one (see getCrew in lib/groups.ts).
 * The icons live in components/ui/Avatar.tsx.
 */
export const BADGES = ['clapper', 'popcorn', 'projector', 'film', 'masks', 'camera'] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_LABELS: Record<Badge, string> = {
  clapper: 'Clapperboard',
  popcorn: 'Popcorn',
  projector: 'Projector',
  film: 'Film strip',
  masks: 'Masks',
  camera: 'Camera',
};

export function isBadge(value: unknown): value is Badge {
  return typeof value === 'string' && (BADGES as readonly string[]).includes(value);
}

export function badgeColor(badge: Badge): number {
  return BADGES.indexOf(badge);
}

/**
 * Badges and colours for everyone in a crew, given in join order.
 *
 * Badges are unique within a crew, but crews overlap: two people in different groups can share a
 * badge and both be in the viewer's crew (or two people picked one at the same moment). Then
 * whoever comes first keeps it and the other shows their initial.
 *
 * A badge brings its own colour. Everyone else's colour comes from their email, not from where they
 * sit in someone's crew list, so everyone sees the same colour for the same person. When two people
 * hash to the same colour (or a badge's), the one whose email sorts later moves to the next free
 * colour; that only depends on who is in the crew, so viewers with the same crew still agree.
 */
export function assignCrewLooks(
  people: { email: string; badge: unknown }[]
): Map<string, { badge: Badge | null; color: number }> {
  const looks = new Map<string, { badge: Badge | null; color: number }>();
  const taken = new Set<number>();
  for (const { email, badge } of people) {
    if (isBadge(badge) && !taken.has(badgeColor(badge))) {
      taken.add(badgeColor(badge));
      looks.set(email, { badge, color: badgeColor(badge) });
    }
  }

  const rest = people.map((person) => person.email).filter((email) => !looks.has(email));
  for (const email of rest.sort()) {
    // FNV-1a: small, stable, and spreads similar emails apart
    let hash = 0x811c9dc5;
    for (let i = 0; i < email.length; i++) {
      hash = Math.imul(hash ^ email.charCodeAt(i), 0x01000193) >>> 0;
    }
    let color = hash % CREW_COLOR_COUNT;
    for (let step = 0; step < CREW_COLOR_COUNT && taken.has(color); step++) {
      color = (color + 1) % CREW_COLOR_COUNT;
    }
    taken.add(color);
    looks.set(email, { badge: null, color });
  }
  return looks;
}

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
