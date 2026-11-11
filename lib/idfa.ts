// Client for the public GraphQL API behind the IDFA website: festival search (used by
// lib/find-festival-link.ts), film overviews and per-screening ticket availability.

import { unstable_cache } from 'next/cache';
import type { LDContext } from '@launchdarkly/ai-server';
import type { Screening, TicketAvailability } from './types';
import { getFestivalLinkForScreening } from './festival-links';
import { evaluateBooleanFlag } from './launchdarkly';

export const IDFA_GRAPHQL_URL = 'https://my.idfa.nl/api/graphql';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kill switch for the availability lookup, which calls IDFA on every agenda and poster load
export const IDFA_AVAILABILITY_FLAG_KEY = 'idfa-availability';

export async function queryIdfa<T>(
  endpoint: 'institute' | 'global',
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 5000
): Promise<T> {
  const response = await fetch(`${IDFA_GRAPHQL_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Default-Language': 'en' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`IDFA API returned ${response.status}`);
  }
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`IDFA API query failed: ${body.errors[0].message}`);
  }
  return body.data as T;
}

interface FestivalPage {
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

interface IdfaShow {
  startOn: string | null;
  ticketAvailabilityStatus: 'SOLD_OUT' | 'LOW_AVAILABILITY' | 'HIGH_AVAILABILITY' | null;
}

interface IdfaFilmInfo {
  overview: string | null;
  shows: IdfaShow[];
}

const SHOW_FIELDS = 'shows { startOn ticketAvailabilityStatus }';

const FILM_QUERY = `query ($id: ID!) {
  film(id: $id) { intro { translation } logline ${SHOW_FIELDS} }
}`;

// There is no lookup by ID for festival programs, so search by title and match the ID.
// Site search only covers the current edition, which is the only one with tickets on sale anyway.
const COMPOSITION_QUERY = `query ($query: String, $limit: Int!) {
  searchGlobal(query: $query, limit: $limit, offset: 0, filters: { pageTypes: [FILM] }) {
    hits { ... on Composition { id intro { translation } ${SHOW_FIELDS} } }
  }
}`;

type IntroFields = { intro?: { translation?: string | null } | null; logline?: string | null };

async function fetchFilmInfo(kind: FestivalPage['kind'], id: string, title: string, timeoutMs: number): Promise<IdfaFilmInfo> {
  let page: (IntroFields & { shows?: IdfaShow[] | null }) | null | undefined;
  if (kind === 'film') {
    const data = await queryIdfa<{ film: typeof page }>('institute', FILM_QUERY, { id }, timeoutMs);
    page = data.film;
  } else {
    const data = await queryIdfa<{
      searchGlobal: { hits: (IntroFields & { id?: string; shows?: IdfaShow[] | null })[] };
    }>('global', COMPOSITION_QUERY, { query: title, limit: 8 }, timeoutMs);
    page = data.searchGlobal.hits.find((hit) => hit.id?.toLowerCase() === id);
  }
  if (!page) {
    return { overview: null, shows: [] };
  }
  return {
    overview: toPlainText(page.intro?.translation || page.logline || ''),
    shows: page.shows || [],
  };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', hellip: '…',
};

const MAX_OVERVIEW_LENGTH = 500;

/** The site's intros carry a little HTML (<em>, &ldquo;); React would show it literally */
function toPlainText(html: string): string | null {
  const text = html
    // Block boundaries become spaces so paragraphs don't run together; inline tags like <em> just go
    .replace(/<br\s*\/?>|<\/?(p|div|li|ul|ol|h[1-6]|blockquote)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (entity, name) => NAMED_ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return null;
  }
  if (text.length <= MAX_OVERVIEW_LENGTH) {
    return text;
  }
  const cut = text.slice(0, MAX_OVERVIEW_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,.;:–—-]+$/, '')}…`;
}

// Errors are thrown, not returned, inside these so a failed request isn't cached
const cachedOverview = unstable_cache(
  async (kind: FestivalPage['kind'], id: string, title: string) => (await fetchFilmInfo(kind, id, title, 5000)).overview,
  ['idfa-overview'],
  { revalidate: 24 * 60 * 60 }
);

const cachedShows = unstable_cache(
  async (kind: FestivalPage['kind'], id: string, title: string, timeoutMs: number) =>
    (await fetchFilmInfo(kind, id, title, timeoutMs)).shows,
  ['idfa-shows'],
  // Short enough that a screening selling out shows up the same afternoon
  { revalidate: 10 * 60 }
);

/** The short synopsis from the film's IDFA page, or null when there's no page or IDFA can't be reached */
export async function getFilmOverview(festivalLink: string | null, title: string): Promise<string | null> {
  const page = festivalLink ? parseFestivalLink(festivalLink) : null;
  if (!page) {
    return null;
  }
  try {
    return await cachedOverview(page.kind, page.id, title);
  } catch (error) {
    console.warn(`Could not load the IDFA overview for "${title}":`, error);
    return null;
  }
}

// Ticket times and the site's show times are the same instant; allow for a rounding difference
const SHOW_MATCH_WINDOW_MS = 5 * 60 * 1000;

function availabilityOf(shows: IdfaShow[], startsAt: Date): TicketAvailability | null {
  // The nearest show in the window, so an 18:05 ticket doesn't pick up an 18:00 show listed first
  let show: IdfaShow | undefined;
  let bestGap = Infinity;
  for (const candidate of shows) {
    if (!candidate.startOn) continue;
    const gap = Math.abs(new Date(candidate.startOn).getTime() - startsAt.getTime());
    if (gap <= SHOW_MATCH_WINDOW_MS && gap < bestGap) {
      show = candidate;
      bestGap = gap;
    }
  }
  switch (show?.ticketAvailabilityStatus) {
    case 'SOLD_OUT':
      return 'sold-out';
    case 'LOW_AVAILABILITY':
      return 'low';
    default:
      return null;
  }
}

// Pages wait for this, so keep it short; a slow IDFA means no hints rather than a slow page.
// It bounds the whole lookup, including the flag check, which can wait for LaunchDarkly to start.
const AVAILABILITY_DEADLINE_MS = 3000;

/**
 * Sold-out and low-availability marks for the upcoming screenings among `screenings`, keyed by
 * screening id. Screenings with plenty of tickets left, without an IDFA page, or that IDFA couldn't
 * tell us about in time are left out. One request per film, all in parallel.
 */
export async function getAvailabilityForScreenings(
  screenings: Screening[],
  now: Date,
  context: LDContext
): Promise<Map<string, TicketAvailability>> {
  const upcoming = screenings.filter((screening) => screening.dateTime > now);
  if (upcoming.length === 0) {
    return new Map();
  }

  // Filled in as each film's lookup finishes, so a deadline still returns the ones that made it
  const marks = new Map<string, TicketAvailability>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), AVAILABILITY_DEADLINE_MS);
  });

  try {
    const outcome = await Promise.race([lookUpAvailability(upcoming, context, marks), deadline]);
    if (outcome === 'timeout') {
      console.warn(`IDFA availability check passed ${AVAILABILITY_DEADLINE_MS}ms; showing the ${marks.size} marks found so far`);
    }
  } catch (error) {
    console.warn('Could not check IDFA availability:', error);
  } finally {
    clearTimeout(timer);
  }
  // A copy, so lookups still running after the deadline can't change what the caller renders
  return new Map(marks);
}

async function lookUpAvailability(
  upcoming: Screening[],
  context: LDContext,
  marks: Map<string, TicketAvailability>
): Promise<'done'> {
  const enabled = await evaluateBooleanFlag(IDFA_AVAILABILITY_FLAG_KEY, context, true);
  if (!enabled.value) {
    return 'done';
  }

  const byFilm = new Map<string, { page: FestivalPage; title: string; screenings: Screening[] }>();
  await Promise.all(
    upcoming.map(async (screening) => {
      const link = await getFestivalLinkForScreening(screening);
      const page = link ? parseFestivalLink(link) : null;
      if (!page) return;
      const key = `${page.kind}:${page.id}`;
      if (!byFilm.has(key)) byFilm.set(key, { page, title: screening.act, screenings: [] });
      byFilm.get(key)!.screenings.push(screening);
    })
  );

  const lookups = await Promise.allSettled(
    Array.from(byFilm.values()).map(async (film) => {
      // The request timeout matches the deadline so late requests don't linger in the background
      const shows = await cachedShows(film.page.kind, film.page.id, film.title, AVAILABILITY_DEADLINE_MS);
      for (const screening of film.screenings) {
        const availability = availabilityOf(shows, screening.dateTime);
        if (availability) marks.set(screening.id, availability);
      }
    })
  );
  const failed = lookups.filter((lookup) => lookup.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`Could not check IDFA availability for ${failed.length} film(s):`, (failed[0] as PromiseRejectedResult).reason);
  }
  return 'done';
}
