// Which screenings are the same film. Ratings are per person, film and festival year, and the
// same film can reach the app under several titles ("IDFA Hit: The Siege of Paradise" and
// "The Siege of Paradise", "Lonan Tché" and "Lonan Tché + Talk"). Pure functions, no database access.

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FestivalPage {
  kind: 'film' | 'composition';
  id: string;
}

const FESTIVAL_PAGE_HOSTS = new Set(['festival.idfa.nl', 'www.idfa.nl']);

/** The kind and ID of an IDFA festival page URL, as built by festivalUrl in lib/find-festival-link.ts */
export function parseFestivalLink(url: string): FestivalPage | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !FESTIVAL_PAGE_HOSTS.has(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(/\/(film|composition)\/([^/]+)/);
    if (!match || !UUID_PATTERN.test(match[2])) {
      return null;
    }
    return { kind: match[1] as FestivalPage['kind'], id: match[2].toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * A title reduced to what tickets and the website reliably agree on: no accents, case,
 * punctuation or leading article ("Kabul, Between Prayers" and "Kabul Between Prayers" match).
 */
export function comparableTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Any script's letters and digits count, so "Love 愛" and "Love 恨" stay different
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/** The key for a title the app has no IDFA page for */
export function titleFilmKey(act: string): string {
  return `title:${comparableTitle(act)}`;
}

/**
 * A film's key: its IDFA page ("film:<id>" or "composition:<id>") when known, else its title.
 * Stored as ratings.film_key (migrations/007), which the backfill builds the same way.
 */
export function filmKey(festivalLink: string | null | undefined, act: string): string {
  const page = festivalLink ? parseFestivalLink(festivalLink) : null;
  return page ? `${page.kind}:${page.id}` : titleFilmKey(act);
}

/**
 * The film key for every title in a festival year's screenings. A title takes the IDFA page of
 * any of its screenings; a title with none takes the page of a linked title that reads the same
 * (so a ticket whose link isn't found yet still joins its film).
 */
export function filmKeysByTitle(screenings: Array<{ act: string; festivalLink?: string | null }>): Map<string, string> {
  const linked = new Map<string, string>();
  for (const { act, festivalLink } of screenings) {
    const key = filmKey(festivalLink, act);
    if (!key.startsWith('title:') && !linked.has(act)) linked.set(act, key);
  }

  // Same-reading titles, only when they all point at one page
  const byComparable = new Map<string, Set<string>>();
  for (const [act, key] of linked) {
    const comparable = comparableTitle(act);
    byComparable.set(comparable, (byComparable.get(comparable) ?? new Set()).add(key));
  }

  const keys = new Map(linked);
  for (const { act } of screenings) {
    if (keys.has(act)) continue;
    const pages = byComparable.get(comparableTitle(act));
    keys.set(act, pages?.size === 1 ? [...pages][0] : titleFilmKey(act));
  }
  return keys;
}

/**
 * The film a stored rating belongs to now. A rating made under a title key, before the film's
 * IDFA page was known, joins the film its title has since been linked to.
 */
export function ratingFilmKey(rating: { filmKey: string; act: string }, keysByTitle: Map<string, string>): string {
  return rating.filmKey.startsWith('title:') ? keysByTitle.get(rating.act) ?? rating.filmKey : rating.filmKey;
}
