// Screening keys, title matching, crew looks and voting emails: the string handling the app relies on
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScreeningKey, screeningKey } from './db';
import { comparableTitle } from './films';
import { assignCrewLooks, CREW_COLOR_COUNT, formatTimeUntil, getDisplayName } from './display';
import { extractVoteLinks, findGmailConfirmationLink } from './vote-link-extractor';

describe('screening keys', () => {
  it('round-trips, even when the title contains "|"', () => {
    const key = screeningKey('Before | After', '18-11-2026', '08:00 PM');
    expect(parseScreeningKey(key)).toEqual({ act: 'Before | After', date: '18-11-2026', start: '08:00 PM' });
  });

  it('rejects keys without a date and time', () => {
    expect(parseScreeningKey('Just a title')).toBeNull();
  });
});

describe('comparableTitle', () => {
  it.each([
    ['Kabul, Between Prayers', 'Kabul Between Prayers'],
    ['The Siege of Paradise', 'siege of paradise'],
    ['Lonan Tché', 'Lonan Tche'],
    ['Rock & Roll', 'rock and roll'],
  ])('treats %s and %s as the same title', (a, b) => {
    expect(comparableTitle(a)).toBe(comparableTitle(b));
  });

  it('keeps titles in other scripts apart', () => {
    expect(comparableTitle('Love 愛')).not.toBe(comparableTitle('Love 恨'));
  });
});

describe('crew looks', () => {
  it('gives the first person a contested badge, and everyone a distinct colour', () => {
    const looks = assignCrewLooks([
      { email: 'a@example.com', badge: 'popcorn' },
      { email: 'b@example.com', badge: 'popcorn' },
      { email: 'c@example.com', badge: null },
    ]);
    expect(looks.get('a@example.com')!.badge).toBe('popcorn');
    expect(looks.get('b@example.com')!.badge).toBeNull();
    const colours = ['a', 'b', 'c'].map((x) => looks.get(`${x}@example.com`)!.color);
    expect(new Set(colours).size).toBe(3);
    colours.forEach((c) => expect(c).toBeLessThan(CREW_COLOR_COUNT));
  });

  it('derives a display name from the email', () => {
    expect(getDisplayName('alex.jansen@example.com')).toBe('Alex');
    expect(getDisplayName('j_doe99@example.com')).toBe('J');
  });

  it('describes the time until a screening', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(formatTimeUntil(new Date('2026-11-18T12:30:00Z'), now)).toBe('in 30 min');
    expect(formatTimeUntil(new Date('2026-11-18T15:20:00Z'), now)).toBe('in 3 h 20 min');
    expect(formatTimeUntil(new Date('2026-11-20T12:00:00Z'), now)).toBe('in 2 days');
    expect(formatTimeUntil(new Date('2026-11-18T11:00:00Z'), now)).toBe('starting now');
  });
});

describe('voting emails', () => {
  const fixture = JSON.parse(readFileSync(new URL('../scripts/fixtures/vote-email.json', import.meta.url), 'utf8'));
  const email = { subject: fixture.Subject, html: fixture.HtmlBody, text: fixture.TextBody };
  const context = { kind: 'user', key: 'test@example.com' } as const;

  it('reads the film and only the "Vote now" links from the known template, without a model', async () => {
    const vote = await extractVoteLinks(email, context);
    expect(vote?.title).toBe('Nuisance Bear');
    expect(vote?.urls).toEqual([
      'https://email.mailgun.idfa.nl/c/EXAMPLE-VOTE-1',
      'https://email.mailgun.idfa.nl/c/EXAMPLE-VOTE-2',
    ]);
  });

  it('never keeps links to other hosts', async () => {
    const html = email.html.replaceAll('https://email.mailgun.idfa.nl/c/EXAMPLE-VOTE', 'https://evil.example/c/EXAMPLE-VOTE');
    const vote = await extractVoteLinks({ ...email, html }, context);
    expect(vote?.urls ?? []).not.toContainEqual(expect.stringContaining('evil.example'));
  });

  it("only takes Gmail's confirmation link from Gmail", () => {
    const mail = { subject: 'Gmail Forwarding Confirmation', html: '', text: 'Confirm: https://mail.google.com/mail/vf-abc123 thanks' };
    expect(findGmailConfirmationLink('forwarding-noreply@google.com', mail)).toBe('https://mail.google.com/mail/vf-abc123');
    expect(findGmailConfirmationLink('someone@example.com', mail)).toBeNull();
  });
});
