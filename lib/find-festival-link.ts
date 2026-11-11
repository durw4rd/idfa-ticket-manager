import OpenAI from 'openai';
import { config, type LDContext } from '@launchdarkly/ai-server';
import { createOpenAIHandler } from '@launchdarkly/ai-openai-messages';
import { createClaudeMessagesHandler } from '@launchdarkly/ai-claude-messages';
import { evaluateBooleanFlag, getLdClient } from './launchdarkly';
import { queryIdfa, UUID_PATTERN } from './idfa';

// AgentControl config with the prompt that picks a film's IDFA page from site search results.
// Its messages use the {{movieTitle}}, {{festivalYear}} and {{candidates}} variables.
export const FESTIVAL_LINK_CONFIG_KEY = 'festival-link-finder';
// Kill switch for the model pick (exact title matches don't need it)
export const FESTIVAL_LINK_FLAG_KEY = 'festival-link-ai';

// Created on first use: the OpenAI handler throws when OPENAI_API_KEY isn't set, which would
// otherwise break importing this module even for callers that never reach a model
let handlers: ReturnType<typeof createHandlers> | undefined;
function createHandlers() {
  return [createOpenAIHandler(), createClaudeMessagesHandler()];
}
function getHandlers() {
  return (handlers ??= createHandlers());
}

// Used as the LaunchDarkly config's user message, and by the fallback below
export const FESTIVAL_LINK_PROMPT = `A ticket for IDFA (International Documentary Film Festival Amsterdam) {{festivalYear}} shows this title: "{{movieTitle}}"

These are the results of searching the IDFA {{festivalYear}} program for that title:

{{candidates}}

Pick the result that is the same film or program as the ticket.

Rules:
- Ticket titles can differ from the website in punctuation, capitalization, accents, or a leading "The" or "A". These still match (e.g. "Kabul Between Prayers" matches "Kabul, Between Prayers").
- A ticket for a shorts program ("Shorts: ...") matches a program result, not a single film inside it.
- A result that only shares some words with the title does not match. Neither does a special screening of the film, such as "Market Screening: Love+War" for a "Love+War" ticket.
- If no result is clearly the same film or program, answer null.

Answer with only the number of the matching result, or null. No other text.`;

interface FestivalCandidate {
  kind: 'film' | 'composition';
  id: string;
  title: string;
}

function fillPrompt(movieTitle: string, festivalYear: number, candidates: string): string {
  return FESTIVAL_LINK_PROMPT.replaceAll('{{movieTitle}}', movieTitle)
    .replaceAll('{{festivalYear}}', String(festivalYear))
    .replaceAll('{{candidates}}', candidates);
}

function formatCandidates(candidates: FestivalCandidate[]): string {
  return candidates
    .map((c, i) => `${i + 1}. ${c.kind === 'composition' ? 'Program' : 'Film'}: ${c.title}`)
    .join('\n');
}

const SEARCH_LIMIT = 8;

// The film archive covers every edition, including the current one, but has no shorts programs
const ARCHIVE_FILMS_QUERY = `query ($query: String!, $filters: [ArchiveFilterInput!], $limit: Int!) {
  searchArchive(query: $query, filters: $filters, limit: $limit, offset: 0) {
    hits { ... on CollapsedFilmHit { film { id fullPreferredTitle } } }
  }
}`;

// Site search only covers the current edition; it is where shorts programs are found
const PROGRAMS_QUERY = `query ($query: String, $limit: Int!) {
  searchGlobal(query: $query, limit: $limit, offset: 0, filters: { pageTypes: [FILM] }) {
    hits { ... on Composition { id fullTitle shows { startOn } } }
  }
}`;

async function searchFilms(movieTitle: string, festivalYear: number): Promise<FestivalCandidate[]> {
  const data = await queryIdfa<{
    searchArchive: { hits: { film?: { id: string; fullPreferredTitle: string } }[] };
  }>('institute', ARCHIVE_FILMS_QUERY, {
    query: movieTitle,
    filters: [{ key: 'EDITION_YEAR', value: [String(festivalYear)] }],
    limit: SEARCH_LIMIT,
  });
  return data.searchArchive.hits.flatMap((hit) =>
    hit.film ? [{ kind: 'film' as const, id: hit.film.id, title: hit.film.fullPreferredTitle }] : []
  );
}

async function searchPrograms(movieTitle: string, festivalYear: number): Promise<FestivalCandidate[]> {
  const data = await queryIdfa<{
    searchGlobal: { hits: { id?: string; fullTitle?: string; shows?: { startOn: string }[] }[] };
  }>('global', PROGRAMS_QUERY, { query: movieTitle, limit: SEARCH_LIMIT });
  return data.searchGlobal.hits.flatMap((hit) =>
    hit.id && hit.fullTitle && hit.shows?.some((show) => show.startOn.startsWith(String(festivalYear)))
      ? [{ kind: 'composition' as const, id: hit.id, title: hit.fullTitle }]
      : []
  );
}

/**
 * Search the IDFA website for films and shorts programs of this edition that match the title.
 */
async function searchFestival(movieTitle: string, festivalYear: number): Promise<FestivalCandidate[]> {
  const results = await Promise.allSettled([
    searchFilms(movieTitle, festivalYear),
    searchPrograms(movieTitle, festivalYear),
  ]);
  const candidates: FestivalCandidate[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value);
    } else {
      console.warn(`IDFA search failed for "${movieTitle}":`, result.reason);
    }
  }
  // Only keep IDs that are safe to put in a URL
  return candidates.filter((c) => UUID_PATTERN.test(c.id));
}

async function pickWithAgentControl(
  movieTitle: string,
  festivalYear: number,
  candidates: string,
  context: LDContext
): Promise<string> {
  const result = await config({ key: FESTIVAL_LINK_CONFIG_KEY, handler: getHandlers() }).invoke(undefined, context, {
    movieTitle,
    festivalYear,
    candidates,
  });
  return String(result.response ?? '');
}

async function pickWithFallback(movieTitle: string, festivalYear: number, candidates: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'user',
        content: fillPrompt(movieTitle, festivalYear, candidates),
      },
    ],
    // GPT-5 models reject max_tokens; temperature 0 only works at the default reasoning effort (none)
    max_completion_tokens: 50,
    temperature: 0,
  });

  return response.choices[0]?.message?.content ?? '';
}

function parsePick(content: string, candidates: FestivalCandidate[]): FestivalCandidate | null {
  const match = content.trim().match(/^(\d+)\b/);
  if (!match) {
    return null;
  }
  return candidates[Number(match[1]) - 1] ?? null;
}

// The model's deliberate "no match" answer, as opposed to a response in some other format
function isNullAnswer(content: string): boolean {
  return /^["'`]?null["'`]?\.?$/i.test(content.trim());
}

/**
 * A title reduced to what tickets and the website reliably agree on: no accents, case,
 * punctuation or leading article ("Kabul, Between Prayers" and "Kabul Between Prayers" match).
 */
function comparableTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Any script's letters and digits count, so "Love 愛" and "Love 恨" stay different
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/**
 * The one search result whose title is the ticket's title, or null when none or several are.
 * Most tickets name the film exactly as the website does, and those need no model to pick.
 */
function pickExactTitle(movieTitle: string, candidates: FestivalCandidate[]): FestivalCandidate | null {
  const wanted = comparableTitle(movieTitle);
  if (!wanted) {
    return null;
  }
  const matches = candidates.filter((c) => comparableTitle(c.title) === wanted);
  const ids = new Set(matches.map((c) => `${c.kind}:${c.id}`));
  return ids.size === 1 ? matches[0] : null;
}

function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'film';
}

// The IDFA site only routes on the ID; the slug is for readability
function festivalUrl(candidate: FestivalCandidate): string {
  return `https://festival.idfa.nl/en/${candidate.kind}/${candidate.id}/${slugify(candidate.title)}/`;
}

const FESTIVAL_HOST = 'festival.idfa.nl';
// Archived festival pages redirect from festival.idfa.nl to www.idfa.nl
const ALLOWED_REDIRECT_HOSTS = new Set([FESTIVAL_HOST, 'www.idfa.nl']);
const MAX_REDIRECTS = 3;

/**
 * Check that a festival URL leads to a real film page. The IDFA site answers 200 for
 * made-up film URLs and serves a generic page, so look at the page title as well.
 * Only IDFA hosts are ever requested: redirects are followed by hand and must stay on them.
 */
export async function verifyFestivalLink(url: string): Promise<boolean> {
  try {
    let current = new URL(url);
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== 'https:' || !ALLOWED_REDIRECT_HOSTS.has(current.hostname) || current.port !== '') {
        return false;
      }
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return false;
    }
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
    return title.length > 0 && !/^IDFA (Festival|Institute)\b/i.test(title);
  } catch (error) {
    console.warn(`Could not verify festival link ${url}:`, error);
    return false;
  }
}

/**
 * Finds the IDFA festival page URL for a movie title: searches the IDFA website and takes the one
 * result with the same title. Only when there's no such result (or several) does the model from the
 * LaunchDarkly AgentControl config (with a hardcoded OpenAI fallback) pick one. Only links that
 * resolve to a real page are returned.
 */
export async function findFestivalLink(
  movieTitle: string,
  festivalYear: number,
  context: LDContext
): Promise<string | null> {
  try {
    const candidates = await searchFestival(movieTitle, festivalYear);
    if (candidates.length === 0) {
      return null;
    }

    const exact = pickExactTitle(movieTitle, candidates);
    if (exact) {
      const url = festivalUrl(exact);
      if (await verifyFestivalLink(url)) {
        return url;
      }
    }

    // The kill switch covers the model pick only; exact title matches above don't use it
    const enabled = await evaluateBooleanFlag(FESTIVAL_LINK_FLAG_KEY, context, true);
    if (!enabled.value) {
      return null;
    }

    const candidateList = formatCandidates(candidates);

    let content: string | undefined;

    if (await getLdClient()) {
      try {
        content = await pickWithAgentControl(movieTitle, festivalYear, candidateList, context);
        // A variation still on the old prompt answers with a URL; treat any answer that is
        // neither a valid pick nor "null" as unavailable, so the fallback model picks instead
        if (!parsePick(content, candidates) && !isNullAnswer(content)) {
          console.warn(`AgentControl config "${FESTIVAL_LINK_CONFIG_KEY}" gave an unexpected answer, using fallback model`);
          content = undefined;
        }
      } catch (error) {
        console.warn(`AgentControl config "${FESTIVAL_LINK_CONFIG_KEY}" unavailable, using fallback model:`, error);
      }
    }

    if (content === undefined) {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OpenAI API key not configured, cannot find festival link');
        return null;
      }
      content = await pickWithFallback(movieTitle, festivalYear, candidateList);
    }

    const pick = parsePick(content, candidates);
    if (!pick) {
      return null;
    }
    const url = festivalUrl(pick);
    return (await verifyFestivalLink(url)) ? url : null;
  } catch (error) {
    console.error('Error finding festival link with AI:', error);
    return null;
  }
}
