import { describe, expect, it } from 'vitest';
import type { AgendaScreening } from './types';
import { filterByPerson, findClashes, groupByDay, isTogether, makeCrewLookup, screeningsToRate, toMapFilms } from './agenda';

const ME = 'me@example.com';
const FRIEND = 'friend@example.com';

function screening(id: string, startsAt: string, holders: string[], extra: Partial<AgendaScreening> = {}): AgendaScreening {
  return {
    id,
    act: id,
    location: 'Tuschinski 1',
    festivalYear: 2026,
    startsAt,
    endsAt: null,
    hasQa: false,
    festivalLink: null,
    availability: null,
    tickets: holders.map((holderEmail, i) => ({ id: `${id}-${i}`, ownerEmail: ME, holderEmail })),
    ...extra,
  };
}

describe('findClashes', () => {
  it('flags overlapping screenings for the person holding both, using the typical length when the end is unknown', () => {
    const clashes = findClashes([
      screening('a', '2026-11-18T19:00:00.000Z', [ME]),
      screening('b', '2026-11-18T20:30:00.000Z', [ME, FRIEND]),
    ]);
    expect(clashes.get('a')).toEqual([ME]);
    expect(clashes.get('b')).toEqual([ME]);
  });

  it('uses the real end time when known', () => {
    const clashes = findClashes([
      screening('a', '2026-11-18T19:00:00.000Z', [ME], { endsAt: '2026-11-18T20:15:00.000Z' }),
      screening('b', '2026-11-18T20:30:00.000Z', [ME]),
    ]);
    expect(clashes.size).toBe(0);
  });

  it('catches a long screening still running after a later short one', () => {
    const clashes = findClashes([
      screening('long', '2026-11-18T10:00:00.000Z', [ME], { endsAt: '2026-11-18T15:00:00.000Z' }),
      screening('short', '2026-11-18T11:00:00.000Z', [ME], { endsAt: '2026-11-18T12:00:00.000Z' }),
      screening('later', '2026-11-18T13:00:00.000Z', [ME]),
    ]);
    expect(clashes.get('later')).toEqual([ME]);
    expect(clashes.get('long')).toEqual([ME]);
  });

  it('does not flag different people at the same time', () => {
    expect(
      findClashes([screening('a', '2026-11-18T19:00:00.000Z', [ME]), screening('b', '2026-11-18T19:00:00.000Z', [FRIEND])]).size
    ).toBe(0);
  });
});

describe('screeningsToRate', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');

  it('lists started films you held a ticket for, newest first, once per film, without rated ones', () => {
    const queue = screeningsToRate(
      [
        screening('Seen', '2026-11-16T19:00:00.000Z', [ME]),
        screening('Seen', '2026-11-17T19:00:00.000Z', [ME], { id: 'Seen-2' }),
        screening('Rated', '2026-11-17T10:00:00.000Z', [ME]),
        screening('Friend only', '2026-11-17T11:00:00.000Z', [FRIEND]),
        screening('Upcoming', '2026-11-19T19:00:00.000Z', [ME]),
      ],
      [{ filmKey: 'title:rated', festivalYear: 2026 }],
      new Map(),
      ME,
      now
    );
    expect(queue.map((s) => s.id)).toEqual(['Seen-2']);
  });

  it('treats titles of the same film as one, so rating one screening rates the other', () => {
    const keysByTitle = new Map([
      ['IDFA Hit: Siege', 'film:1'],
      ['Siege', 'film:1'],
    ]);
    const screenings = [
      screening('IDFA Hit: Siege', '2026-11-13T10:30:00.000Z', [ME]),
      screening('Siege', '2026-11-17T13:00:00.000Z', [ME]),
    ];
    expect(screeningsToRate(screenings, [{ filmKey: 'film:1', festivalYear: 2026 }], keysByTitle, ME, now)).toEqual([]);
    expect(screeningsToRate(screenings, [], keysByTitle, ME, now).map((s) => s.id)).toEqual(['Siege']);
  });
});

describe('groupByDay', () => {
  it('puts an after-midnight show on the previous festival day', () => {
    const days = groupByDay([
      screening('evening', '2026-11-21T19:00:00.000Z', [ME]),
      screening('night', '2026-11-21T23:30:00.000Z', [ME]),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].key).toBe('2026-11-21');
  });
});

describe('filterByPerson and isTogether', () => {
  const shared = screening('shared', '2026-11-18T19:00:00.000Z', [ME, FRIEND]);
  const mine = screening('mine', '2026-11-19T19:00:00.000Z', [ME]);

  it('filters by holder', () => {
    expect(filterByPerson([shared, mine], FRIEND).map((s) => s.id)).toEqual(['shared']);
    expect(filterByPerson([shared, mine], 'all')).toHaveLength(2);
  });

  it('knows when two people go together', () => {
    expect(isTogether(shared)).toBe(true);
    expect(isTogether(mine)).toBe(false);
  });
});

describe('makeCrewLookup', () => {
  it('still names people who have left the crew', () => {
    const lookup = makeCrewLookup([]);
    expect(lookup('sam.devries@example.com').name).toBe('Sam');
  });
});

describe('toMapFilms', () => {
  const SIEGE_KEY = 'film:e64a0b19-15c4-4b15-9cf7-5c00eb61acd2';
  const keysByTitle = new Map([
    ['IDFA Hit: The Siege of Paradise', SIEGE_KEY],
    ['The Siege of Paradise', SIEGE_KEY],
  ]);
  const places = new Map([
    [SIEGE_KEY, { placeName: 'Gaza', country: 'PS', lat: 31.5, lon: 34.47, source: 'ai' as const }],
    ['title:shorts', { placeName: null, country: null, lat: null, lon: null, source: 'none' as const }],
    ['title:set by hand', { placeName: null, country: null, lat: null, lon: null, source: 'manual' as const }],
  ]);

  it('merges every title and showing of a film, holders from all of them, first showing first', () => {
    const films = toMapFilms(
      [
        screening('The Siege of Paradise', '2026-11-20T19:00:00.000Z', [FRIEND]),
        screening('IDFA Hit: The Siege of Paradise', '2026-11-18T19:00:00.000Z', [ME]),
      ],
      keysByTitle,
      places,
      ME
    );
    expect(films).toHaveLength(1);
    expect(films[0]).toMatchObject({
      key: SIEGE_KEY,
      title: 'IDFA Hit: The Siege of Paradise',
      href: `/screenings/${encodeURIComponent('IDFA Hit: The Siege of Paradise')}`,
      place: { name: 'Gaza', country: 'PS', lat: 31.5, lon: 34.47 },
      noPlace: false,
      holders: [ME, FRIEND],
      isMine: true,
    });
  });

  it("tells a film looked up with no place from one not placed yet, and marks films you aren't seeing", () => {
    const films = toMapFilms(
      [
        screening('Shorts', '2026-11-18T10:00:00.000Z', [FRIEND]),
        screening('Unplaced', '2026-11-19T10:00:00.000Z', [FRIEND]),
        screening('Set by hand', '2026-11-20T10:00:00.000Z', [FRIEND]),
      ],
      keysByTitle,
      places,
      ME
    );
    expect(films.map((f) => [f.title, f.place, f.noPlace, f.isMine])).toEqual([
      ['Shorts', null, true, false],
      ['Unplaced', null, false, false],
      ['Set by hand', null, true, false],
    ]);
  });

  it('sends the browser nothing but the film, its place and who holds tickets', () => {
    const [film] = toMapFilms([screening('The Siege of Paradise', '2026-11-20T19:00:00.000Z', [ME])], keysByTitle, places, ME);
    expect(Object.keys(film).sort()).toEqual(['holders', 'href', 'isMine', 'key', 'location', 'noPlace', 'place', 'startsAt', 'title']);
    expect(JSON.stringify(film)).not.toMatch(/blob|ownerEmail|qr/i);
  });
});
