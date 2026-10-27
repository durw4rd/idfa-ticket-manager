// Agenda logic shared by server pages and client components. Pure functions, no database access.

import type { AgendaScreening, CrewMember, Rating, Screening } from './types';
import { DEFAULT_SCREENING_MINUTES, festivalDayKey, festivalDayStart } from './dates';
import { CREW_COLOR_COUNT, getDisplayName } from './display';

/** Strip a screening down to what the browser may see: no blob URLs, no QR hashes */
export function toAgendaScreening(screening: Screening): AgendaScreening {
  return {
    id: screening.id,
    act: screening.act,
    location: screening.location,
    festivalYear: screening.festivalYear,
    startsAt: screening.dateTime.toISOString(),
    festivalLink: screening.tickets.find((ticket) => ticket.festivalLink)?.festivalLink || null,
    tickets: screening.tickets.map((ticket) => ({
      id: ticket.id,
      ownerEmail: ticket.ownerEmail,
      holderEmail: ticket.holderEmail,
    })),
  };
}

/** Everyone holding a ticket for the screening, in ticket order */
export function holdersOf(screening: AgendaScreening): string[] {
  return Array.from(new Set(screening.tickets.map((ticket) => ticket.holderEmail)));
}

/** 'all', or the email of the person whose agenda to show */
export type PersonFilter = 'all' | string;

export function filterByPerson(screenings: AgendaScreening[], who: PersonFilter): AgendaScreening[] {
  if (who === 'all') return screenings;
  return screenings.filter((screening) => screening.tickets.some((ticket) => ticket.holderEmail === who));
}

/** Two or more different people hold tickets for it */
export function isTogether(screening: AgendaScreening): boolean {
  return holdersOf(screening).length > 1;
}

export interface AgendaDay {
  key: string; // Festival day as YYYY-MM-DD in Amsterdam; after-midnight shows count as the night before
  date: Date; // A moment on that day, for headings
  screenings: AgendaScreening[];
}

export function groupByDay(screenings: AgendaScreening[]): AgendaDay[] {
  const days = new Map<string, AgendaDay>();
  for (const screening of screenings) {
    const date = new Date(screening.startsAt);
    const key = festivalDayKey(date);
    if (!days.has(key)) {
      days.set(key, { key, date: festivalDayStart(date), screenings: [] });
    }
    days.get(key)!.screenings.push(screening);
  }
  return Array.from(days.values());
}

/**
 * People who hold tickets for screenings that overlap, keyed by screening id. A screening is
 * assumed to last DEFAULT_SCREENING_MINUTES, since tickets don't carry the runtime.
 */
export function findClashes(screenings: AgendaScreening[]): Map<string, string[]> {
  const byPerson = new Map<string, AgendaScreening[]>();
  for (const screening of screenings) {
    for (const email of holdersOf(screening)) {
      if (!byPerson.has(email)) byPerson.set(email, []);
      byPerson.get(email)!.push(screening);
    }
  }

  const clashes = new Map<string, string[]>();
  const mark = (id: string, email: string) => {
    const people = clashes.get(id) || [];
    if (!people.includes(email)) clashes.set(id, [...people, email]);
  };

  const length = DEFAULT_SCREENING_MINUTES * 60000;
  for (const [email, own] of Array.from(byPerson.entries())) {
    const sorted = [...own].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 1; i < sorted.length; i++) {
      const previousEnd = new Date(sorted[i - 1].startsAt).getTime() + length;
      if (new Date(sorted[i].startsAt).getTime() < previousEnd) {
        mark(sorted[i - 1].id, email);
        mark(sorted[i].id, email);
      }
    }
  }
  return clashes;
}

/**
 * Films you held a ticket for that have started, and that you haven't rated yet. Most recent
 * first, one entry per film (ratings are per film and year, not per screening).
 */
export function screeningsToRate(
  screenings: AgendaScreening[],
  myRatings: Pick<Rating, 'act' | 'festivalYear'>[],
  me: string,
  now: Date
): AgendaScreening[] {
  const rated = new Set(myRatings.map((rating) => `${rating.festivalYear}|${rating.act}`));
  const seen = new Set<string>();
  return screenings
    .filter((screening) => new Date(screening.startsAt) <= now)
    .filter((screening) => screening.tickets.some((ticket) => ticket.holderEmail === me))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .filter((screening) => {
      const key = `${screening.festivalYear}|${screening.act}`;
      if (rated.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Look up a crew member by email; people who left the group still get a name and colour */
export function makeCrewLookup(crew: CrewMember[]): (email: string) => CrewMember {
  const byEmail = new Map(crew.map((member) => [member.email, member]));
  return (email) =>
    byEmail.get(email) || { email, name: getDisplayName(email), color: CREW_COLOR_COUNT - 1, badge: null, isMe: false };
}

export function screeningHref(screening: Pick<AgendaScreening, 'id'>): string {
  return `/screenings/${encodeURIComponent(screening.id)}`;
}
