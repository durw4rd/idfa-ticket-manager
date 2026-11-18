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
 * any of its screenings, else the page a rating of it was saved under (so deleting the one linked
 * ticket doesn't cut a title off from its film's ratings). A title with neither takes the page of a
 * linked title that reads the same (so a ticket whose link isn't found yet still joins its film).
 */
export function filmKeysByTitle(
  screenings: Array<{ act: string; festivalLink?: string | null }>,
  ratings: Array<{ act: string; filmKey: string | null }> = []
): Map<string, string> {
  const linked = new Map<string, string>();
  for (const { act, festivalLink } of screenings) {
    const key = filmKey(festivalLink, act);
    if (!key.startsWith('title:') && !linked.has(act)) linked.set(act, key);
  }
  // Pages that ratings remember for a title, used only when they all agree
  const remembered = new Map<string, Set<string>>();
  for (const { act, filmKey: key } of ratings) {
    if (key && !key.startsWith('title:') && !linked.has(act)) {
      remembered.set(act, (remembered.get(act) ?? new Set()).add(key));
    }
  }
  for (const [act, keys] of remembered) {
    if (keys.size === 1) linked.set(act, [...keys][0]);
  }

  // Same-reading titles, only when they all point at one page
  const byComparable = new Map<string, Set<string>>();
  for (const [act, key] of linked) {
    const comparable = comparableTitle(act);
    byComparable.set(comparable, (byComparable.get(comparable) ?? new Set()).add(key));
  }

  const keys = new Map(linked);
  for (const { act } of [...screenings, ...ratings]) {
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
export function ratingFilmKey(rating: { filmKey: string | null; act: string }, keysByTitle: Map<string, string>): string {
  // No key: saved by the code before film keys, while migration 008 hadn't run yet
  const key = rating.filmKey ?? titleFilmKey(rating.act);
  return key.startsWith('title:') ? keysByTitle.get(rating.act) ?? key : key;
}

/**
 * One rating per person, film and year, the most recently saved, for when two of someone's
 * ratings turn out to be the same film (two titles rated before either's IDFA page was known).
 * Saving a rating removes the others (upsertRating); this covers the time until then.
 */
export function latestRatingPerFilm<T extends { userEmail: string; filmKey: string; festivalYear: number; updatedAt: Date | string }>(
  ratings: T[]
): T[] {
  const latest = new Map<string, T>();
  for (const rating of ratings) {
    const id = `${rating.userEmail}|${rating.festivalYear}|${rating.filmKey}`;
    const known = latest.get(id);
    if (!known || new Date(rating.updatedAt) > new Date(known.updatedAt)) latest.set(id, rating);
  }
  const kept = new Set(latest.values());
  return ratings.filter((rating) => kept.has(rating));
}

/**
 * Which stored place a film shows when it has one under its IDFA page's key and one under a title
 * key (saved before that title's page was known): a person's correction beats the AI's, and
 * between two corrections the newer one counts. Otherwise the film's own key wins.
 */
export function pickStoredPlace<T extends { source: string; updatedAt: Date | string }>(
  byFilm: T | undefined,
  byTitle: T | undefined
): T | undefined {
  if (!byFilm || !byTitle) return byFilm ?? byTitle;
  const filmManual = byFilm.source === 'manual';
  const titleManual = byTitle.source === 'manual';
  if (titleManual && !filmManual) return byTitle;
  if (titleManual && filmManual && new Date(byTitle.updatedAt) > new Date(byFilm.updatedAt)) return byTitle;
  return byFilm;
}
