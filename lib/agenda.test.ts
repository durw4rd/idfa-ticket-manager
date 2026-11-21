import { describe, expect, it } from 'vitest';
import type { AgendaScreening, CrewGroup, CrewMember } from './types';
import {
  buildTodo,
  crewHint,
  filmShowings,
  filterByPeople,
  filterByPerson,
  findClashes,
  groupByDay,
  isTogether,
  joinNames,
  makeCrewLookup,
  screeningsToRate,
  toMapFilms,
  togglePerson,
  upcomingOnly,
} from './agenda';

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

  it('waits until a film has finished', () => {
    const running = screening('Running', '2026-11-18T11:00:00.000Z', [ME]);
    const short = screening('Short', '2026-11-18T10:00:00.000Z', [ME], { endsAt: '2026-11-18T11:30:00.000Z' });
    expect(screeningsToRate([running, short], [], new Map(), ME, now).map((s) => s.id)).toEqual(['Short']);
  });

  it('lists finished films you held a ticket for, newest first, once per film, without rated ones', () => {
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

describe('buildTodo', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  const a = screening('A', '2026-11-17T19:00:00.000Z', [ME]);
  const b = screening('B', '2026-11-16T19:00:00.000Z', [ME]);
  const base = { screenings: [a, b], keysByTitle: new Map<string, string>(), me: ME, now };

  it('puts a rating and a vote for the same film in one entry, newest first', () => {
    const todo = buildTodo({
      ...base,
      toRate: [a, b],
      voteLinks: [{ id: 'v1', act: 'A', screeningId: 'A', festivalYear: 2026 }],
    });
    expect(todo.map((item) => [item.title, item.rate, item.votes.map((v) => v.id)])).toEqual([
      ['A', true, ['v1']],
      ['B', true, []],
    ]);
  });

  it('lists a vote for a film already rated on its own', () => {
    const todo = buildTodo({ ...base, toRate: [], voteLinks: [{ id: 'v1', act: 'B', screeningId: 'B', festivalYear: 2026 }] });
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ rate: false, screening: { id: 'B' } });
  });

  it('merges titles of the same film', () => {
    const hit = screening('IDFA Hit: Siege', '2026-11-13T10:30:00.000Z', [ME]);
    const siege = screening('Siege', '2026-11-17T13:00:00.000Z', [ME]);
    const keysByTitle = new Map([
      ['IDFA Hit: Siege', 'film:1'],
      ['Siege', 'film:1'],
    ]);
    const todo = buildTodo({
      ...base,
      screenings: [hit, siege],
      keysByTitle,
      toRate: [siege],
      voteLinks: [{ id: 'v1', act: 'IDFA Hit: Siege', screeningId: 'IDFA Hit: Siege', festivalYear: 2026 }],
    });
    expect(todo).toHaveLength(1);
    expect(todo[0].votes.map((v) => v.id)).toEqual(['v1']);
  });

  it("matches a link without a ticket to your showing of the same film under another title", () => {
    const hit = screening('IDFA Hit: Siege', '2026-11-13T10:30:00.000Z', [FRIEND]);
    const siege = screening('Siege', '2026-11-17T13:00:00.000Z', [ME]);
    const keysByTitle = new Map([
      ['IDFA Hit: Siege', 'film:1'],
      ['Siege', 'film:1'],
    ]);
    const todo = buildTodo({
      ...base,
      screenings: [hit, siege],
      keysByTitle,
      toRate: [siege],
      voteLinks: [{ id: 'spare', act: 'IDFA Hit: Siege', screeningId: null, festivalYear: 2026 }],
    });
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ rate: true, screening: { id: 'Siege' } });
    expect(todo[0].votes.map((v) => v.id)).toEqual(['spare']);
  });

  it('prefers your showing of the same film over a newer one of another film with that title', () => {
    const home = screening('Home', '2026-11-14T10:00:00.000Z', [ME]);
    const other = screening('HOME', '2026-11-17T10:00:00.000Z', [ME]);
    const keysByTitle = new Map([
      ['Home', 'film:1'],
      ['HOME', 'film:2'],
    ]);
    const todo = buildTodo({
      ...base,
      screenings: [home, other],
      keysByTitle,
      toRate: [],
      voteLinks: [{ id: 'spare', act: 'Home', screeningId: null, festivalYear: 2026 }],
    });
    expect(todo.map((item) => item.screening?.id)).toEqual(['Home']);
  });

  it('keeps a link for one film apart from your showing of another film with the same title', () => {
    const theirs = screening('Home', '2026-11-14T10:00:00.000Z', [FRIEND]);
    const mine = screening('HOME', '2026-11-17T10:00:00.000Z', [ME]);
    const keysByTitle = new Map([
      ['Home', 'film:1'],
      ['HOME', 'film:2'],
    ]);
    const todo = buildTodo({
      ...base,
      screenings: [theirs, mine],
      keysByTitle,
      toRate: [mine],
      voteLinks: [{ id: 'spare', act: 'Home', screeningId: null, festivalYear: 2026 }],
    });
    expect(todo.map((item) => [item.title, item.rate, item.votes.length])).toEqual([
      ['HOME', true, 0],
      ['Home', false, 1],
    ]);
  });

  it('gives a link without a ticket to your latest started showing with that title, else lists it last on its own', () => {
    const todo = buildTodo({
      ...base,
      toRate: [],
      voteLinks: [
        { id: 'spare', act: 'a', screeningId: null, festivalYear: 2026 },
        { id: 'lost', act: 'Elsewhere', screeningId: null, festivalYear: 2026 },
      ],
    });
    expect(todo.map((item) => [item.screening?.id ?? null, item.title])).toEqual([
      ['A', 'A'],
      [null, 'Elsewhere'],
    ]);
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

describe('filterByPeople', () => {
  const OTHER = 'other@example.com';
  const shared = screening('shared', '2026-11-18T19:00:00.000Z', [ME, FRIEND]);
  const mine = screening('mine', '2026-11-19T19:00:00.000Z', [ME]);
  const theirs = screening('theirs', '2026-11-20T19:00:00.000Z', [OTHER]);

  it('shows what any selected person holds', () => {
    expect(filterByPeople([shared, mine, theirs], [FRIEND, OTHER]).map((s) => s.id)).toEqual(['shared', 'theirs']);
  });

  it('shows everything when nobody is selected', () => {
    expect(filterByPeople([shared, mine, theirs], [])).toHaveLength(3);
  });
});

const FESTIVAL: CrewGroup = { id: 'g1', name: 'Festival friends' };
const DUO: CrewGroup = { id: 'g2', name: 'Duo' };
function member(email: string, groups: CrewGroup[], isMe = false): CrewMember {
  return { email, name: email.split('@')[0], color: 0, badge: null, isMe, groups };
}

describe('togglePerson', () => {
  const OTHER = 'other@example.com';
  const SAM = 'sam@example.com';
  // You share Festival friends with FRIEND and OTHER, and Duo with SAM only
  const crew = [
    member(ME, [FESTIVAL, DUO], true),
    member(FRIEND, [FESTIVAL]),
    member(OTHER, [FESTIVAL]),
    member(SAM, [DUO]),
  ];

  it('adds a person, keeping crew order', () => {
    expect(togglePerson(crew, [OTHER], ME)).toEqual([ME, OTHER]);
  });

  it('takes a selected person off', () => {
    expect(togglePerson(crew, [ME, OTHER], OTHER)).toEqual([ME]);
  });

  it('picks people from different crews together', () => {
    const picked = [ME, FRIEND, SAM].reduce((selected, email) => togglePerson(crew, selected, email), [] as string[]);
    expect(picked).toEqual([ME, FRIEND, SAM]);
  });
});

describe('crewHint', () => {
  const MARTINA = 'martina@example.com';
  const SAM = 'sam@example.com';
  const me = member(ME, [FESTIVAL, DUO], true);
  const martina = member(MARTINA, [FESTIVAL, DUO]);
  const sam = member(SAM, [DUO]);

  it('names crews only when you are in more than one, and never for you', () => {
    expect(crewHint(sam, me)).toBe('Duo');
    expect(crewHint(martina, me)).toBe('Festival friends, Duo');
    expect(crewHint(me, me)).toBeNull();
    expect(crewHint(sam, member(ME, [DUO], true))).toBeNull();
  });
});

describe('joinNames', () => {
  it('reads like a sentence', () => {
    expect(joinNames(['Alex'])).toBe('Alex');
    expect(joinNames(['Alex', 'Sam'])).toBe('Alex and Sam');
    expect(joinNames(['Alex', 'Sam', 'Joe'])).toBe('Alex, Sam and Joe');
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

describe('upcomingOnly', () => {
  it('keeps screenings that have not started yet', () => {
    const now = new Date('2026-11-18T19:00:00.000Z');
    const kept = upcomingOnly(
      [
        screening('past', '2026-11-17T19:00:00.000Z', [ME]),
        screening('started', '2026-11-18T19:00:00.000Z', [ME]),
        screening('later', '2026-11-18T21:00:00.000Z', [ME]),
      ],
      now
    );
    expect(kept.map((s) => s.id)).toEqual(['later']);
  });
});

describe('filmShowings', () => {
  it('keeps each film’s first showing and names it by its shortest title', () => {
    const showings = filmShowings(
      [
        screening('IDFA Hit: Lonan Tché', '2026-11-14T19:00:00.000Z', [ME]),
        screening('Lonan Tché + Talk', '2026-11-15T19:00:00.000Z', [ME]),
        screening('Lonan Tché', '2026-11-16T19:00:00.000Z', [ME]),
      ],
      new Map([
        ['IDFA Hit: Lonan Tché', 'film:abc'],
        ['Lonan Tché + Talk', 'film:abc'],
        ['Lonan Tché', 'film:abc'],
      ])
    );
    expect(showings.size).toBe(1);
    expect(showings.get('film:abc')).toMatchObject({ title: 'Lonan Tché', screening: { id: 'IDFA Hit: Lonan Tché' } });
  });
});
