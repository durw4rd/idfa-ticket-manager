// The festival review poster's content (app/api/films/review): your rated films, best first. Pure, no I/O.

import type { AgendaScreening, FilmPlace, Rating } from './types';
import { filmShowings } from './agenda';
import { project, toScreen, type ViewBox } from './world-map';

export interface ReviewEntry {
  key: string; // The film (see lib/films.ts)
  title: string;
  rating: number; // 1-10
  festivalLink: string | null; // For the synopsis, from the film's first showing
  place: { name: string | null; country: string; lat: number; lon: number } | null;
}

export interface Review {
  entries: ReviewEntry[];
  average: number | null; // Your mean score, null with no ratings
  countries: number; // Distinct countries the placed films take place in
}

/**
 * Your ratings for a festival year as review entries, by your score (high first), then title.
 * `keysByTitle` and `ratings` are from getRatingsForYear, `places` from getFilmPlacesForYear
 * (both lib/db.ts), so the ratings', screenings' and places' film keys agree. A rated film with no
 * ticket left (deleted, or the rating was imported) keeps the title it was rated under.
 */
export function buildReview(input: {
  ratings: Rating[];
  screenings: AgendaScreening[];
  keysByTitle: Map<string, string>;
  places: Map<string, Pick<FilmPlace, 'placeName' | 'country' | 'lat' | 'lon'>>;
  me: string;
}): Review {
  const showings = filmShowings(
    [...input.screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    input.keysByTitle
  );
  const entries = input.ratings
    .filter((rating) => rating.userEmail === input.me)
    .map((rating): ReviewEntry => {
      const showing = showings.get(rating.filmKey);
      const stored = input.places.get(rating.filmKey);
      const placed = stored && stored.country && stored.lat != null && stored.lon != null;
      return {
        key: rating.filmKey,
        title: showing?.title ?? rating.act,
        rating: rating.rating,
        festivalLink: showing?.screening.festivalLink ?? null,
        place: placed ? { name: stored.placeName, country: stored.country!, lat: stored.lat!, lon: stored.lon! } : null,
      };
    })
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));

  return {
    entries,
    average: entries.length ? entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length : null,
    countries: new Set(entries.flatMap((entry) => (entry.place ? [entry.place.country] : []))).size,
  };
}

export interface ReviewPin {
  x: number; // CSS pixels in the map frame
  y: number;
  ranks: number[]; // 1-based places in the list of the films at this pin
}

/**
 * The review map's pins: one per placed film, numbered like the list, except that films closer than
 * `minGapPx` on screen share the first one's pin (one place, or neighbours too close to tell apart).
 */
export function reviewPins(entries: ReviewEntry[], view: ViewBox, widthPx: number, minGapPx = 44): ReviewPin[] {
  const pins: ReviewPin[] = [];
  entries.forEach((entry, index) => {
    if (!entry.place) return;
    const [x, y] = toScreen(project(entry.place.lon, entry.place.lat), view, widthPx);
    const near = pins.find((pin) => Math.hypot(pin.x - x, pin.y - y) < minGapPx);
    if (near) near.ranks.push(index + 1);
    else pins.push({ x, y, ranks: [index + 1] });
  });
  return pins;
}

/**
 * One line from an IDFA synopsis: its first sentence, cut at a word to at most `max` characters
 * (with an ellipsis) when the sentence runs longer.
 */
export function synopsisLine(text: string | null, max = 160): string | null {
  const clean = text?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentence = clean.slice(0, sentenceEnd(clean));
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, '')}…`;
}

// Titles and abbreviations that end with a full stop mid-sentence ("Dr. Smith", "St. Petersburg")
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'mt', 'vs', 'no', 'gen', 'lt', 'col', 'rev']);

/**
 * Where the first sentence ends: after a full stop, question or exclamation mark followed by a space
 * and a capital (so "1.5 million" doesn't end it), unless the stop is part of an abbreviation.
 */
function sentenceEnd(text: string): number {
  for (const match of Array.from(text.matchAll(/[.!?](?=\s+["“'‘(]?\p{Lu})/gu))) {
    const index = match.index ?? 0;
    const word = text.slice(0, index).match(/(\p{L}+)$/u)?.[1] ?? '';
    // A lone initial ("J. Doe") or a known abbreviation
    if (match[0] === '.' && (word.length === 1 || ABBREVIATIONS.has(word.toLowerCase()))) continue;
    return index + 1;
  }
  return text.length;
}
