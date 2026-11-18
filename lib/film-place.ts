// Where a film takes place: the prompt and output schema for the model, and the pure checks on
// what it answers and on geocoder results. The lookup itself (IDFA, model, geocoder, database)
// is lib/find-film-place.ts. No network, no database: safe for unit tests.

import { parseJSONWithPossibleFences } from '@launchdarkly/ai-server';
import { cleanPlaceName, COUNTRIES, countryByCode, inCountryBox } from './countries';

// Client-safe, so they live with the country table; kept importable from here
export { cleanPlaceName, MAX_PLACE_NAME_LENGTH } from './countries';
import { distanceKm } from './world-map';
import { comparableTitle } from './films';

// AgentControl config with the prompt below; its messages use {{title}} and {{facts}}, and its
// variation's Output format is FILM_PLACE_SCHEMA
export const FILM_PLACE_CONFIG_KEY = 'film-place-finder';

// Used as the LaunchDarkly config's user message, and by the fallback in lib/find-film-place.ts
export const FILM_PLACE_PROMPT = `This is a film (or a program of short films) at IDFA, the International Documentary Film Festival Amsterdam: "{{title}}"

What the festival says about it:

{{facts}}

Where does this film mainly take place? Give the one primary place for a world map of the festival's films.

Rules:
- The place the film is set and filmed in, not where it was produced or financed. Production countries and spoken languages are only clues.
- Be as specific as the text allows while still covering most of the film: a town, village, city, province or region, or a named natural area such as a river, desert or island.
- place is a proper name as it would appear on a map ("Kabul", "Rondônia", "Atacama Desert"), in English, without the country. Never a description such as "a village in the north" or "the southern marshes": turn it into the named place it refers to, or use null.
- If only the country is clear, give the country with place null. Never repeat the country's name as the place.
- A direction within a country ("southwestern Iran", "central Morocco") isn't a place: use the named province or region it means, or null.
- If the film moves between places, pick the one where most of it happens. An opening scene, a backstory or the filmmaker's home base doesn't count unless the film stays there.
- Only name a place the festival's text names or unmistakably identifies (a named city, region, people, landmark or event). Never infer a place from the film's themes or mood: "war", "rubble" or "exile" alone don't point anywhere.
- If the text names no place, or the film has no real-world setting (animation of an imagined world, an essay with no place), answer with country null.
- A program of short films only has a place if the text says its films all take place there; otherwise answer with country null.
- country is the ISO 3166-1 alpha-2 code (use "PS" for Palestine, "XK" for Kosovo).
- lat and lon are your best estimate of the place's coordinates in decimal degrees, or of the country's centre when place is null.

Answer with only a JSON object: {"place": string or null, "country": string or null, "lat": number or null, "lon": number or null}`;

// The same shape as the prompt's answer. Mirrored as the AgentControl variation's Output format,
// and sent to OpenAI as a strict json_schema by the fallback; change both with it.
export const FILM_PLACE_SCHEMA = {
  type: 'object',
  properties: {
    place: { type: ['string', 'null'], description: 'Town, village, city or region; null for the country as a whole' },
    country: { type: ['string', 'null'], description: 'ISO 3166-1 alpha-2 code; null when there is no real-world setting' },
    lat: { type: ['number', 'null'] },
    lon: { type: ['number', 'null'] },
  },
  required: ['place', 'country', 'lat', 'lon'],
  additionalProperties: false,
};

export function fillFilmPlacePrompt(title: string, facts: string): string {
  return FILM_PLACE_PROMPT.replaceAll('{{title}}', title).replaceAll('{{facts}}', facts);
}


/** A place the model named, checked: a known country, a name, and an estimate inside the country */
export interface ModelPlace {
  placeName: string | null;
  country: string;
  estimate: { lat: number; lon: number } | null;
}

/**
 * What the model answered: a checked place, 'none' (it says the film has no real-world place), or
 * null when the answer isn't usable (not JSON, unknown country), so the caller tries elsewhere.
 * A wrong or missing estimate only drops the estimate: the geocoder finds the place from its name.
 */
export function parseFilmPlaceAnswer(content: unknown): ModelPlace | 'none' | null {
  const answer =
    typeof content === 'string'
      ? parseJSONWithPossibleFences<Record<string, unknown>>(content.trim())
      : content && typeof content === 'object'
        ? (content as Record<string, unknown>)
        : null;
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return null;
  }
  if (answer.country === null) {
    return 'none';
  }
  const country = typeof answer.country === 'string' ? countryByCode(answer.country.trim()) : null;
  if (!country) {
    return null;
  }
  return {
    placeName: placeUnlessCountry(cleanPlaceName(answer.place), country.code, country.name),
    country: country.code,
    estimate: checkedEstimate(country.code, answer.lat, answer.lon),
  };
}


function checkedEstimate(country: string, lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return inCountryBox(country, lat, lon) ? { lat, lon } : null;
}

// Other names models use for a country, so "Czech Republic, Czechia" doesn't get stored as a place
const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ['usa', 'us', 'united states of america', 'america'],
  GB: ['uk', 'great britain', 'britain'],
  CZ: ['czech republic'],
  CI: ['ivory coast'],
  CD: ['democratic republic of the congo', 'drc', 'congo kinshasa'],
  CG: ['congo', 'congo brazzaville'],
  KR: ['korea', 'republic of korea'],
  KP: ['dprk', "democratic people's republic of korea"],
  RU: ['russian federation'],
  TR: ['turkiye'],
  MK: ['macedonia'],
  SZ: ['swaziland'],
  MM: ['burma'],
  PS: ['palestinian territories', 'state of palestine', 'occupied palestinian territories'],
  CN: ["people's republic of china", 'prc', 'mainland china'],
  IR: ['islamic republic of iran'],
  SY: ['syrian arab republic'],
  NL: ['holland'],
  VA: ['holy see'],
  TL: ['east timor'],
  CV: ['cabo verde'],
};

// A direction or qualifier in front of the country's name ("southwestern Iran", "rural Iran")
const COUNTRY_QUALIFIER = /^(?:(?:north|south)[ -]?(?:east|west)(?:ern)?|(?:north|south|east|west)(?:ern)?|central|rural|urban|inland|coastal|upper|lower|mainland) /;
// Countries whose own name starts like that (South Sudan, North Macedonia, Central African Republic)
const COUNTRY_NAMES = new Set(COUNTRIES.map((country) => comparableTitle(country.name)));

/** The place name, or null when it only names the country again, perhaps with a direction */
export function placeUnlessCountry(place: string | null, code: string, name: string): string | null {
  if (!place) return null;
  const full = comparableTitle(place);
  const wanted = COUNTRY_NAMES.has(full) ? full : full.replace(COUNTRY_QUALIFIER, '');
  const names = [name, ...(COUNTRY_ALIASES[code] ?? [])].map(comparableTitle);
  return names.includes(wanted) ? null : place;
}

export interface GeocodeCandidate {
  name: string;
  lat: number;
  lon: number;
}

// A geocoder hit farther than this from the model's estimate is probably a namesake elsewhere in
// the country (there are a lot of San Josés)
const MAX_ESTIMATE_GAP_KM = 150;

/**
 * Where to put the pin: a geocoder hit near the model's estimate, else the top hit when there's no
 * estimate, else the estimate itself, else the country's centre (and then no place name, since
 * the pin no longer marks it). Candidates come from the geocoder already limited to the country.
 */
export function pickCoordinates(
  place: ModelPlace,
  candidates: GeocodeCandidate[]
): { placeName: string | null; lat: number; lon: number } {
  const inCountry = candidates.filter((candidate) => inCountryBox(place.country, candidate.lat, candidate.lon));
  if (place.estimate) {
    const { lat, lon } = place.estimate;
    const nearest = inCountry
      .map((candidate) => ({ candidate, gap: distanceKm(lat, lon, candidate.lat, candidate.lon) }))
      .sort((a, b) => a.gap - b.gap)[0];
    if (nearest && nearest.gap <= MAX_ESTIMATE_GAP_KM) {
      return { placeName: place.placeName, lat: nearest.candidate.lat, lon: nearest.candidate.lon };
    }
    return { placeName: place.placeName, lat, lon };
  }
  if (place.placeName && inCountry[0]) {
    return { placeName: place.placeName, lat: inCountry[0].lat, lon: inCountry[0].lon };
  }
  const [lon, lat] = countryByCode(place.country)!.center;
  return { placeName: null, lat, lon };
}
