import { describe, expect, it } from 'vitest';
import type { AgendaScreening, Rating } from './types';
import { buildReview, reviewPins, synopsisLine, type ReviewEntry } from './review';

const ME = 'me@example.com';
const FRIEND = 'friend@example.com';

function screening(act: string, startsAt: string, festivalLink: string | null = null): AgendaScreening {
  return {
    id: `${act}-${startsAt}`,
    act,
    location: 'Tuschinski 1',
    festivalYear: 2026,
    startsAt,
    endsAt: null,
    hasQa: false,
    festivalLink,
    availability: null,
    tickets: [{ id: act, ownerEmail: ME, holderEmail: ME }],
  };
}

function rating(filmKey: string, act: string, score: number, userEmail = ME): Rating {
  return {
    id: `${userEmail}-${filmKey}`,
    userEmail,
    filmKey,
    act,
    festivalYear: 2026,
    rating: score,
    comment: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('buildReview', () => {
  const screenings = [
    screening('IDFA Hit: Lonan Tché', '2026-11-14T19:00:00.000Z', 'https://idfa.nl/film/abc'),
    screening('Lonan Tché', '2026-11-16T19:00:00.000Z'),
    screening('Rivers', '2026-11-15T10:00:00.000Z'),
    screening('Alpha', '2026-11-15T12:00:00.000Z'),
  ];
  const keysByTitle = new Map([
    ['IDFA Hit: Lonan Tché', 'film:abc'],
    ['Lonan Tché', 'film:abc'],
  ]);
  const places = new Map([
    ['film:abc', { placeName: 'Bamako', country: 'ML', lat: 12.6, lon: -8 }],
    ['title:rivers', { placeName: null, country: 'BR', lat: -10, lon: -55 }],
    ['title:alpha', { placeName: null, country: null, lat: null, lon: null }],
  ]);

  it('lists only your ratings, best first, then by title', () => {
    const review = buildReview({
      ratings: [
        rating('title:rivers', 'Rivers', 7),
        rating('film:abc', 'Lonan Tché', 9),
        rating('title:alpha', 'Alpha', 7),
        rating('title:rivers', 'Rivers', 2, FRIEND),
      ],
      screenings,
      keysByTitle,
      places,
      me: ME,
    });
    expect(review.entries.map((entry) => [entry.title, entry.rating])).toEqual([
      ['Lonan Tché', 9],
      ['Alpha', 7],
      ['Rivers', 7],
    ]);
    expect(review.average).toBeCloseTo(23 / 3);
  });

  it('names a film by its shortest title and links its first showing', () => {
    const [entry] = buildReview({ ratings: [rating('film:abc', 'IDFA Hit: Lonan Tché', 8)], screenings, keysByTitle, places, me: ME }).entries;
    expect(entry.title).toBe('Lonan Tché');
    expect(entry.festivalLink).toBe('https://idfa.nl/film/abc');
    expect(entry.place).toEqual({ name: 'Bamako', country: 'ML', lat: 12.6, lon: -8 });
  });

  it('leaves films without a usable place off the map and counts countries', () => {
    const review = buildReview({
      ratings: [rating('title:alpha', 'Alpha', 6), rating('title:rivers', 'Rivers', 5), rating('film:abc', 'Lonan Tché', 4)],
      screenings,
      keysByTitle,
      places,
      me: ME,
    });
    expect(review.entries.find((entry) => entry.title === 'Alpha')?.place).toBeNull();
    expect(review.countries).toBe(2);
  });

  it('keeps a rated film whose tickets are gone, under its rated title', () => {
    const [entry] = buildReview({ ratings: [rating('title:gone', 'Gone Film', 6)], screenings, keysByTitle, places, me: ME }).entries;
    expect(entry).toMatchObject({ title: 'Gone Film', festivalLink: null, place: null });
  });

  it('has no average without ratings', () => {
    expect(buildReview({ ratings: [], screenings, keysByTitle, places, me: ME })).toEqual({ entries: [], average: null, countries: 0 });
  });
});

describe('synopsisLine', () => {
  it('takes the first sentence', () => {
    expect(synopsisLine('A fisherman returns home. His village has changed.')).toBe('A fisherman returns home.');
  });

  it("doesn't end the sentence at an abbreviation or a number", () => {
    expect(synopsisLine('Dr. Smith counts 1.5 million birds. Then more.')).toBe('Dr. Smith counts 1.5 million birds.');
  });

  it('cuts a long sentence at a word, with an ellipsis', () => {
    const line = synopsisLine('word '.repeat(60), 40)!;
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line.endsWith('word…')).toBe(true);
  });

  it('returns null for nothing', () => {
    expect(synopsisLine(null)).toBeNull();
    expect(synopsisLine('   ')).toBeNull();
  });
});

describe('reviewPins', () => {
  const entry = (title: string, lat: number, lon: number | null): ReviewEntry => ({
    key: title,
    title,
    rating: 7,
    festivalLink: null,
    place: lon === null ? null : { name: null, country: 'NL', lat, lon },
  });
  const view = { x: 0, y: 0, w: 1000, h: 500 };

  it('numbers pins by list position and merges films too close to tell apart', () => {
    const pins = reviewPins(
      [entry('Amsterdam', 52.37, 4.9), entry('Nowhere', 0, null), entry('Haarlem', 52.38, 4.64), entry('Lima', -12, -77)],
      view,
      1000
    );
    expect(pins.map((pin) => pin.ranks)).toEqual([[1, 3], [4]]);
  });
});
