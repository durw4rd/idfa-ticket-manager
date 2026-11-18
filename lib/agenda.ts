// Agenda logic shared by server pages and client components. Pure functions, no database access.

import type { AgendaScreening, CrewMember, FilmPlace, MapFilm, Rating, Screening, TicketAvailability } from './types';
import { festivalDayKey, festivalDayStart, screeningEnd } from './dates';
import { CREW_COLOR_COUNT, getDisplayName } from './display';
import { comparableTitle, titleFilmKey } from './films';

/** Strip a screening down to what the browser may see: no blob URLs, no QR hashes */
export function toAgendaScreening(screening: Screening): AgendaScreening {
  return {
    id: screening.id,
    act: screening.act,
    location: screening.location,
    festivalYear: screening.festivalYear,
    startsAt: screening.dateTime.toISOString(),
    endsAt: screening.endsAt ? new Date(screening.endsAt).toISOString() : null,
    hasQa: screening.hasQa === true,
    festivalLink: screening.tickets.find((ticket) => ticket.festivalLink)?.festivalLink || null,
    availability: null,
    tickets: screening.tickets.map((ticket) => ({
      id: ticket.id,
      ownerEmail: ticket.ownerEmail,
      holderEmail: ticket.holderEmail,
    })),
  };
}

/** Attach IDFA ticket availability (from getAvailabilityForScreenings in lib/idfa.ts) */
export function withAvailability(
  screenings: AgendaScreening[],
  availability: Map<string, TicketAvailability>
): AgendaScreening[] {
  return screenings.map((screening) => ({ ...screening, availability: availability.get(screening.id) ?? null }));
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
 * People who hold tickets for screenings that overlap, keyed by screening id. Uses the end time
 * from the IDFA site where known, else a typical length (see screeningEnd).
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

  for (const [email, own] of Array.from(byPerson.entries())) {
    const sorted = [...own].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const ends = sorted.map((screening) => screeningEnd(new Date(screening.startsAt), screening.endsAt));
    for (let i = 1; i < sorted.length; i++) {
      const start = new Date(sorted[i].startsAt);
      // Every earlier one, not just the one before: lengths differ, so a long screening can
      // still be running after a short one that started later has finished
      for (let j = 0; j < i; j++) {
        if (start < ends[j]) {
          mark(sorted[j].id, email);
          mark(sorted[i].id, email);
        }
      }
    }
  }
  return clashes;
}

/**
 * Films you held a ticket for that have finished, and that you haven't rated yet. Most recent
 * first, one entry per film (ratings are per film and year, not per screening; `keysByTitle`
 * from filmKeysByTitle in lib/films.ts says which titles are the same film).
 */
export function screeningsToRate(
  screenings: AgendaScreening[],
  myRatings: Pick<Rating, 'filmKey' | 'festivalYear'>[],
  keysByTitle: Map<string, string>,
  me: string,
  now: Date
): AgendaScreening[] {
  const filmOf = (screening: AgendaScreening) =>
    `${screening.festivalYear}|${keysByTitle.get(screening.act) ?? titleFilmKey(screening.act)}`;
  const rated = new Set(myRatings.map((rating) => `${rating.festivalYear}|${rating.filmKey}`));
  const seen = new Set<string>();
  return screenings
    // Finished rather than started, so nobody is asked to rate a film that's still running
    .filter((screening) => screeningEnd(new Date(screening.startsAt), screening.endsAt) <= now)
    .filter((screening) => screening.tickets.some((ticket) => ticket.holderEmail === me))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .filter((screening) => {
      const key = filmOf(screening);
      if (rated.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// A film known only by its title (no IDFA page yet), from a filmOf key ("<year>|title:…")
const isTitleKey = (key: string) => key.split('|', 2)[1]?.startsWith('title:') ?? false;

/** A voting link as the to-do list sees it: which screening its ticket is for, null when it has no ticket */
export interface TodoVoteLink {
  id: string;
  act: string;
  festivalYear: number;
  screeningId: string | null;
}

/** One film on the Films page's to-do list: a rating still to give, votes still to cast, or both */
export interface TodoItem<L extends TodoVoteLink = TodoVoteLink> {
  key: string; // Festival year and film key
  title: string;
  screening: AgendaScreening | null; // The showing it's about; null for a voting link no showing of yours matches
  rate: boolean;
  votes: L[];
}

/**
 * The to-do list: films to rate (from screeningsToRate) and unused Audience Award voting links,
 * one entry per film so a film waiting for both shows once. A link on a ticket goes with that
 * ticket's showing; a link without one with your most recent started showing of that film (by
 * film key, else by title), or on its own when there's none. Most recent first, links without a showing last.
 * Generic over the link so callers can carry the URL through without this module seeing it.
 */
export function buildTodo<L extends TodoVoteLink>(input: {
  toRate: AgendaScreening[];
  voteLinks: L[];
  screenings: AgendaScreening[];
  keysByTitle: Map<string, string>;
  me: string;
  now: Date;
}): TodoItem<L>[] {
  const { toRate, voteLinks, screenings, keysByTitle, me, now } = input;
  const filmOf = (screening: { act: string; festivalYear: number }) =>
    `${screening.festivalYear}|${keysByTitle.get(screening.act) ?? titleFilmKey(screening.act)}`;
  const byId = new Map(screenings.map((screening) => [screening.id, screening]));
  const mineStarted = screenings
    .filter((screening) => new Date(screening.startsAt) <= now)
    .filter((screening) => screening.tickets.some((ticket) => ticket.holderEmail === me))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const items = new Map<string, TodoItem<L>>();
  for (const screening of toRate) {
    items.set(filmOf(screening), { key: filmOf(screening), title: screening.act, screening, rate: true, votes: [] });
  }
  for (const link of voteLinks) {
    const wanted = comparableTitle(link.act);
    const film = filmOf(link);
    const screening =
      (link.screeningId ? byId.get(link.screeningId) : undefined) ??
      // The same film first. Then a title match, but never between two different known films
      // (both have an IDFA page), as two films can share a title.
      mineStarted.find((candidate) => filmOf(candidate) === film) ??
      mineStarted.find(
        (candidate) =>
          comparableTitle(candidate.act) === wanted && (isTitleKey(film) || isTitleKey(filmOf(candidate)))
      ) ??
      null;
    // Without a showing, the link's own film key still merges it with anything else for that film
    const key = screening ? filmOf(screening) : film;
    const item = items.get(key);
    if (item) {
      item.votes.push(link);
    } else {
      items.set(key, { key, title: screening?.act ?? link.act, screening, rate: false, votes: [link] });
    }
  }
  return Array.from(items.values()).sort((a, b) => {
    if (!a.screening || !b.screening) return a.screening ? -1 : b.screening ? 1 : 0;
    return b.screening.startsAt.localeCompare(a.screening.startsAt);
  });
}

/** Look up a crew member by email; people who left the group still get a name and colour */
export function makeCrewLookup(crew: CrewMember[]): (email: string) => CrewMember {
  const byEmail = new Map(crew.map((member) => [member.email, member]));
  return (email) =>
    byEmail.get(email) || { email, name: getDisplayName(email), color: CREW_COLOR_COUNT - 1, badge: null, isMe: false };
}

/** A screening's id: tickets with the same title, date and start are one screening */
export function screeningKey(act: string, date: string, start: string): string {
  return `${act}|${date}|${start}`;
}

/**
 * Split a screening key back into its parts. The movie title may itself contain "|",
 * so date and start are taken from the end.
 */
export function parseScreeningKey(key: string): { act: string; date: string; start: string } | null {
  const parts = key.split('|');
  if (parts.length < 3) {
    return null;
  }
  const start = parts.pop()!;
  const date = parts.pop()!;
  return { act: parts.join('|'), date, start };
}

export function screeningHref(screening: Pick<AgendaScreening, 'id'>): string {
  return `/screenings/${encodeURIComponent(screening.id)}`;
}

/**
 * The year's films for the agenda's map view, one per film however many titles and showings it had (in order
 * of first showing), with the stored place of each. `keysByTitle` and `places` come from
 * getFilmPlacesForYear in lib/db.ts.
 */
export function toMapFilms(
  screenings: AgendaScreening[],
  keysByTitle: Map<string, string>,
  places: Map<string, Pick<FilmPlace, 'placeName' | 'country' | 'lat' | 'lon' | 'source'>>,
  me: string
): MapFilm[] {
  const films = new Map<string, MapFilm>();
  const sorted = [...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (const screening of sorted) {
    const key = keysByTitle.get(screening.act) ?? titleFilmKey(screening.act);
    let film = films.get(key);
    if (!film) {
      const stored = places.get(key);
      const placed = stored && stored.country && stored.lat != null && stored.lon != null;
      film = {
        key,
        title: screening.act,
        href: screeningHref(screening),
        startsAt: screening.startsAt,
        location: screening.location,
        place: placed ? { name: stored.placeName, country: stored.country!, lat: stored.lat!, lon: stored.lon! } : null,
        // No country: the AI found no single place ('none'), or a person said so ('manual')
        noPlace: !!stored && !stored.country,
        holders: [],
        isMine: false,
      };
      films.set(key, film);
    }
    for (const holder of holdersOf(screening)) {
      if (!film.holders.includes(holder)) film.holders.push(holder);
    }
    film.isMine ||= film.holders.includes(me);
  }
  return Array.from(films.values());
}
