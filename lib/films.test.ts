import { describe, expect, it } from 'vitest';
import { filmKey, filmKeysByTitle, latestRatingPerFilm, ratingFilmKey } from './films';

const SIEGE = 'https://festival.idfa.nl/en/film/E64A0B19-15c4-4b15-9cf7-5c00eb61acd2/the-siege-of-paradise/';
const SIEGE_KEY = 'film:e64a0b19-15c4-4b15-9cf7-5c00eb61acd2';
const SHORTS = 'https://festival.idfa.nl/en/composition/83822564-582e-4e4f-9baf-3723c9e50711/shorts/';

describe('filmKey', () => {
  it('uses the IDFA page when the link is one, else the comparable title', () => {
    expect(filmKey(SIEGE, 'IDFA Hit: The Siege of Paradise')).toBe(SIEGE_KEY);
    expect(filmKey(SHORTS, 'Shorts')).toBe('composition:83822564-582e-4e4f-9baf-3723c9e50711');
    expect(filmKey(null, 'The Siege of Paradise!')).toBe('title:siege of paradise');
    expect(filmKey('https://example.com/en/film/e64a0b19-15c4-4b15-9cf7-5c00eb61acd2/', 'X')).toBe('title:x');
  });
});

describe('filmKeysByTitle', () => {
  it('gives every title of one IDFA page the same key', () => {
    const keys = filmKeysByTitle([
      { act: 'IDFA Hit: The Siege of Paradise', festivalLink: SIEGE },
      { act: 'The Siege of Paradise', festivalLink: SIEGE },
    ]);
    expect(keys.get('IDFA Hit: The Siege of Paradise')).toBe(SIEGE_KEY);
    expect(keys.get('The Siege of Paradise')).toBe(SIEGE_KEY);
  });

  it('lets a title without a link join a linked title that reads the same', () => {
    const keys = filmKeysByTitle([
      { act: 'The Siege of Paradise', festivalLink: SIEGE },
      { act: 'Siege of paradise', festivalLink: null },
      { act: 'Unlinked', festivalLink: null },
    ]);
    expect(keys.get('Siege of paradise')).toBe(SIEGE_KEY);
    expect(keys.get('Unlinked')).toBe('title:unlinked');
  });

  it('keeps a same-reading title apart when the linked ones disagree', () => {
    const keys = filmKeysByTitle([
      { act: 'Home', festivalLink: SIEGE },
      { act: 'HOME', festivalLink: SHORTS },
      { act: 'home', festivalLink: null },
    ]);
    expect(keys.get('home')).toBe('title:home');
  });
});

describe('ratingFilmKey', () => {
  const keys = new Map([['The Siege of Paradise', SIEGE_KEY]]);

  it('moves a rating saved under its title to the film the title is now linked to', () => {
    expect(ratingFilmKey({ filmKey: 'title:siege of paradise', act: 'The Siege of Paradise' }, keys)).toBe(SIEGE_KEY);
  });

  it('keeps an IDFA key, and a title key with no linked title', () => {
    expect(ratingFilmKey({ filmKey: 'film:abc', act: 'The Siege of Paradise' }, keys)).toBe('film:abc');
    expect(ratingFilmKey({ filmKey: 'title:gone', act: 'Gone' }, keys)).toBe('title:gone');
  });
});

describe('filmKeysByTitle with ratings', () => {
  it("keeps a title on the film its ratings were saved under once the linked ticket is gone", () => {
    const keys = filmKeysByTitle([{ act: 'Siege', festivalLink: null }], [{ act: 'Siege', filmKey: SIEGE_KEY }]);
    expect(keys.get('Siege')).toBe(SIEGE_KEY);
  });

  it('ignores remembered pages that disagree, and title keys', () => {
    const keys = filmKeysByTitle(
      [{ act: 'Home', festivalLink: null }],
      [
        { act: 'Home', filmKey: 'film:1' },
        { act: 'Home', filmKey: 'film:2' },
        { act: 'Away', filmKey: 'title:away' },
      ]
    );
    expect(keys.get('Home')).toBe('title:home');
    expect(keys.get('Away')).toBe('title:away');
  });
});

describe('ratingFilmKey without a stored key', () => {
  it('treats it as its title (saved by the old code during the rollout)', () => {
    const keys = new Map([['The Siege of Paradise', SIEGE_KEY]]);
    expect(ratingFilmKey({ filmKey: null, act: 'The Siege of Paradise' }, keys)).toBe(SIEGE_KEY);
    expect(ratingFilmKey({ filmKey: null, act: 'Other' }, keys)).toBe('title:other');
  });
});

describe('latestRatingPerFilm', () => {
  it("keeps each person's most recent rating of a film", () => {
    const rating = (id: string, userEmail: string, filmKey: string, updatedAt: string) => ({
      id,
      userEmail,
      filmKey,
      festivalYear: 2026,
      updatedAt,
    });
    const kept = latestRatingPerFilm([
      rating('old', 'me', 'film:1', '2026-11-13T12:00:00Z'),
      rating('new', 'me', 'film:1', '2026-11-15T12:00:00Z'),
      rating('friend', 'friend', 'film:1', '2026-11-10T12:00:00Z'),
      rating('other', 'me', 'film:2', '2026-11-01T12:00:00Z'),
    ]);
    expect(kept.map((r) => r.id)).toEqual(['new', 'friend', 'other']);
  });
});
