// Working out where a film takes place: the festival's own text about it (lib/idfa.ts), a model
// that names the place (the film-place-finder AgentControl config, with a hardcoded OpenAI
// fallback), and a geocoder for the coordinates, so the pin doesn't rest on the model's guess.
// The prompt, schema and checks are in lib/film-place.ts.

import OpenAI from 'openai';
import type { LDContext } from '@launchdarkly/ai-server';
import { invokeAgentConfig } from './agent-config';
import { getFilmFacts, type FilmFacts } from './idfa';
import { getFilmPlacesForYear, recordFilmPlaceAttempt, saveFilmPlace } from './db';
import { titleFilmKey } from './films';
import {
  FILM_PLACE_CONFIG_KEY,
  FILM_PLACE_SCHEMA,
  fillFilmPlacePrompt,
  parseFilmPlaceAnswer,
  pickCoordinates,
  type GeocodeCandidate,
  type ModelPlace,
} from './film-place';
import type { FilmPlace } from './types';

// Open-Meteo's geocoder: GeoNames data, free, no key. Only a place name and a country code are sent.
const GEOCODER_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const GEOCODER_TIMEOUT_MS = 3000;

/**
 * Places with this name in the country, best match first. Empty when there are none or the
 * geocoder can't be reached: the caller then has the model's estimate or the country's centre.
 */
export async function geocodePlace(name: string, country: string): Promise<GeocodeCandidate[]> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('name', name);
  url.searchParams.set('countryCode', country);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`geocoder returned ${response.status}`);
    }
    const body = (await response.json()) as { results?: Array<{ name?: string; latitude?: number; longitude?: number }> };
    return (body.results ?? []).flatMap((result) =>
      typeof result.latitude === 'number' && typeof result.longitude === 'number'
        ? [{ name: result.name ?? name, lat: result.latitude, lon: result.longitude }]
        : []
    );
  } catch (error) {
    console.warn(`Could not geocode "${name}" (${country}):`, error);
    return [];
  }
}

/** The facts as the prompt's {{facts}}: labelled lines, so the model can tell clue from setting */
function formatFacts(facts: FilmFacts): string {
  return [
    facts.title ? `Title on the festival site: ${facts.title}` : null,
    facts.text ? `Description: ${facts.text}` : null,
    facts.languages.length ? `Spoken languages: ${facts.languages.join(', ')}` : null,
    facts.productionCountries.length ? `Production countries: ${facts.productionCountries.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function askWithFallback(title: string, facts: string): Promise<unknown> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: fillFilmPlacePrompt(title, facts) }],
    response_format: { type: 'json_schema', json_schema: { name: 'film_place', schema: FILM_PLACE_SCHEMA, strict: true } },
    // GPT-5 models reject max_tokens; temperature 0 only works at the default reasoning effort (none)
    max_completion_tokens: 200,
    temperature: 0,
  });
  return response.choices[0]?.message?.content;
}

/** Where a film was found to take place: ready to store */
export type FoundPlace = Omit<FilmPlace, 'source'>;

/**
 * Where the film behind `festivalLink` mainly takes place: a place, 'none' when it has no single
 * real-world place, or null when that can't be told now (no IDFA page, IDFA or every model
 * unreachable, the lookup switched off), so the caller can try again later.
 */
export async function findFilmPlace(
  festivalLink: string | null,
  title: string,
  context: LDContext
): Promise<FoundPlace | 'none' | null> {
  let facts: FilmFacts | null;
  try {
    facts = await getFilmFacts(festivalLink, title);
  } catch (error) {
    console.warn(`Could not load the IDFA page of "${title}" to place it:`, error);
    return null;
  }
  if (!facts) {
    return null;
  }

  const factsText = formatFacts(facts);
  let answer: ModelPlace | 'none' | null = null;

  const served = await invokeAgentConfig(FILM_PLACE_CONFIG_KEY, context, { variables: { title, facts: factsText } });
  // Switched off in LaunchDarkly: no lookup at all, and the film is tried again later
  if (served?.disabled) {
    return null;
  }
  if (served) {
    answer = parseFilmPlaceAnswer(served.response);
    if (!answer) {
      console.warn(`AgentControl config "${FILM_PLACE_CONFIG_KEY}" gave an unexpected answer, using fallback model`);
    }
  }

  if (!answer) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not configured, cannot place the film');
      return null;
    }
    try {
      answer = parseFilmPlaceAnswer(await askWithFallback(title, factsText));
    } catch (error) {
      console.warn(`Fallback model could not place "${title}":`, error);
      return null;
    }
  }

  if (!answer || answer === 'none') {
    return answer;
  }
  const candidates = answer.placeName ? await geocodePlace(answer.placeName, answer.country) : [];
  return { country: answer.country, ...pickCoordinates(answer, candidates) };
}

interface Viewer {
  email: string;
  visibleEmails: string[];
}

/**
 * Look up and store where the film `act` takes place, unless it already has a place (or a
 * deliberate 'none'), or a lookup failed in the last few hours. Meant for `after()`: never throws.
 */
export async function ensureFilmPlace(viewer: Viewer, act: string, year: number, context: LDContext): Promise<void> {
  try {
    const { titles, keysByTitle, places, recentlyAttempted } = await getFilmPlacesForYear(viewer.visibleEmails, year);
    const key = keysByTitle.get(act) ?? titleFilmKey(act);
    if (places.has(key) || recentlyAttempted.has(key)) {
      return;
    }
    // Any title of the film with a link will do: they all name the same IDFA page
    const link = titles.find((title) => (keysByTitle.get(title.act) ?? titleFilmKey(title.act)) === key && title.festivalLink)
      ?.festivalLink;
    if (!link) {
      // Without the IDFA page there's nothing to read; this runs again once the link is found
      return;
    }
    await placeFilm(viewer, act, year, key, link, context);
  } catch (error) {
    console.warn(`Could not place "${act}":`, error);
  }
}

async function placeFilm(viewer: Viewer, act: string, year: number, key: string, link: string, context: LDContext) {
  const found = await findFilmPlace(link, act, context);
  if (found === null) {
    await recordFilmPlaceAttempt(key, year);
  } else if (found === 'none') {
    await saveFilmPlace(viewer.visibleEmails, act, year, null, 'none');
  } else {
    await saveFilmPlace(viewer.visibleEmails, act, year, found, 'ai');
  }
}

/**
 * Place up to `limit` of the crew's films of a festival year that have an IDFA page but no place
 * yet, a few at a time so a map load doesn't fire dozens of model calls. Meant for `after()`.
 */
export async function fillMissingFilmPlaces(viewer: Viewer, year: number, context: LDContext, limit = 4): Promise<void> {
  try {
    const { titles, keysByTitle, places, recentlyAttempted } = await getFilmPlacesForYear(viewer.visibleEmails, year);
    const pending = new Map<string, { act: string; link: string }>();
    for (const { act, festivalLink } of titles) {
      const key = keysByTitle.get(act) ?? titleFilmKey(act);
      if (!festivalLink || places.has(key) || recentlyAttempted.has(key) || pending.has(key)) continue;
      pending.set(key, { act, link: festivalLink });
    }
    const batch = Array.from(pending.entries()).slice(0, limit);
    const results = await Promise.allSettled(
      batch.map(([key, { act, link }]) => placeFilm(viewer, act, year, key, link, context))
    );
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`Could not place ${failed.length} film(s):`, (failed[0] as PromiseRejectedResult).reason);
    }
  } catch (error) {
    console.warn('Could not fill in film places:', error);
  }
}
