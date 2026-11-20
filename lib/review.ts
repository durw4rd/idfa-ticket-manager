// The festival review poster's content (app/api/films/review): your rated films, best first. Pure, no I/O.

import type { AgendaScreening, FilmPlace, Rating } from './types';
import { filmShowings } from './agenda';
import { titleFilmKey } from './films';
import { project, toScreen, type ViewBox } from './world-map';

export interface ReviewEntry {
  key: string; // The film (see lib/films.ts)
  title: string;
  rating: number; // 1-10
  festivalLink: string | null; // For the synopsis: the first showing's link, else any showing's
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
  const sorted = [...input.screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const showings = filmShowings(sorted, input.keysByTitle);
  // The first link any showing of each film has: the first showing can be a title IDFA's page
  // wasn't found for, while a later one ("… + Talk") has it
  const links = new Map<string, string>();
  for (const screening of sorted) {
    const key = input.keysByTitle.get(screening.act) ?? titleFilmKey(screening.act);
    if (screening.festivalLink && !links.has(key)) links.set(key, screening.festivalLink);
  }
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
        festivalLink: links.get(rating.filmKey) ?? null,
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

export const REVIEW_PIN_HEIGHT = 44;
// Room kept between two pins' badges
const PIN_GAP = 4;

export interface ReviewPin {
  x: number; // Centre, in CSS pixels in the map frame
  y: number;
  ranks: number[]; // 1-based places in the list of the films at this pin, lowest first
  label: string; // "3", "1·4", or "1·2 +3" when more than three films share it
  width: number; // Of the badge, in CSS pixels; it grows with the label
}

function pinLabel(ranks: number[]): string {
  return ranks.length > 3 ? `${ranks.slice(0, 2).join('·')} +${ranks.length - 2}` : ranks.join('·');
}

function toPin(x: number, y: number, ranks: number[]): ReviewPin {
  const label = pinLabel(ranks);
  return { x, y, ranks, label, width: Math.max(REVIEW_PIN_HEIGHT, 20 + label.length * 15) };
}

function overlap(a: ReviewPin, b: ReviewPin): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + PIN_GAP && Math.abs(a.y - b.y) < REVIEW_PIN_HEIGHT + PIN_GAP
  );
}

/**
 * The review map's pins: one per placed film, numbered like the list, except that films whose badges
 * would overlap share one, at the better-ranked film's place (one place, or neighbours too close to
 * tell apart). A shared badge is wider, so merging repeats until no two badges overlap.
 */
export function reviewPins(entries: ReviewEntry[], view: ViewBox, widthPx: number): ReviewPin[] {
  let pins: ReviewPin[] = [];
  entries.forEach((entry, index) => {
    if (!entry.place) return;
    const [x, y] = toScreen(project(entry.place.lon, entry.place.lat), view, widthPx);
    pins.push(toPin(x, y, [index + 1]));
  });
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        if (overlap(pins[i], pins[j])) {
          const ranks = [...pins[i].ranks, ...pins[j].ranks].sort((a, b) => a - b);
          pins[i] = toPin(pins[i].x, pins[i].y, ranks);
          pins = pins.filter((_, k) => k !== j);
          merged = true;
          break outer;
        }
      }
    }
  }
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
 * Where the first sentence ends: after a full stop, question or exclamation mark (and any closing
 * quotes or brackets) followed by a space and a capital, so "1.5 million" doesn't end it, unless
 * the stop is part of an abbreviation.
 */
function sentenceEnd(text: string): number {
  for (const match of Array.from(text.matchAll(/[.!?]["”’')\]]*(?=\s+["“'‘(]?\p{Lu})/gu))) {
    const index = match.index ?? 0;
    const word = text.slice(0, index).match(/(\p{L}+)$/u)?.[1] ?? '';
    // A lone initial ("J. Doe") or a known abbreviation
    if (match[0] === '.' && (word.length === 1 || ABBREVIATIONS.has(word.toLowerCase()))) continue;
    return index + match[0].length;
  }
  return text.length;
}
