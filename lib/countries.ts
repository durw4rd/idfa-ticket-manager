// The country table for film places: lookups and checks over the generated lib/countries-data.ts,
// and the rules for place names. Small enough for client components (the country picker); the map
// outlines are elsewhere. Keep it free of server-only imports.

import { COUNTRY_DATA, type CountryData } from './countries-data';

export type Country = CountryData;
export const COUNTRIES: readonly Country[] = COUNTRY_DATA;

const byCode = new Map(COUNTRY_DATA.map((country) => [country.code, country]));

/** The country for an ISO 3166-1 alpha-2 code (any case), or null when the map doesn't know it */
export function countryByCode(code: string | null | undefined): Country | null {
  return (code && byCode.get(code.toUpperCase())) || null;
}

export function countryName(code: string): string {
  return countryByCode(code)?.name ?? code;
}

// Bounding boxes are of the coastline at a coarse scale; allow for places just off it (islands,
// a town on the border) and for a model's estimate being a little out
const BOX_MARGIN_DEG = 1.5;

/** Whether a point could be in the country: inside its bounding box, with a margin */
export function inCountryBox(code: string, lat: number, lon: number): boolean {
  const country = countryByCode(code);
  if (!country || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const [west, south, east, north] = country.bbox;
  return (
    lat >= south - BOX_MARGIN_DEG &&
    lat <= north + BOX_MARGIN_DEG &&
    lon >= west - BOX_MARGIN_DEG &&
    lon <= east + BOX_MARGIN_DEG
  );
}

export const MAX_PLACE_NAME_LENGTH = 80;

/** A place name as stored: trimmed, single-spaced, capped; null when empty */
export function cleanPlaceName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_NAME_LENGTH).trim();
  return clean || null;
}
