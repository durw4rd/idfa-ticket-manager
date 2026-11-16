import { describe, expect, it } from 'vitest';
import {
  festivalDayKey,
  formatDate,
  formatDayHeading,
  formatTime,
  formatTimeRange,
  getFestivalYear,
  inputToTicketDate,
  inputToTicketStart,
  normalizeStartTime,
  parseTicketDateTime,
  screeningEnd,
  ticketDateToInput,
  ticketStartToInput,
} from './dates';

describe('parseTicketDateTime', () => {
  it('reads Amsterdam wall-clock time in winter (CET, UTC+1)', () => {
    expect(parseTicketDateTime('18-11-2026', '08:00 PM').toISOString()).toBe('2026-11-18T19:00:00.000Z');
  });

  it('reads Amsterdam wall-clock time in summer (CEST, UTC+2)', () => {
    expect(parseTicketDateTime('01-07-2026', '10:30 AM').toISOString()).toBe('2026-07-01T08:30:00.000Z');
  });

  it('handles 12 AM and 12 PM', () => {
    expect(parseTicketDateTime('22-11-2026', '12:15 AM').toISOString()).toBe('2026-11-21T23:15:00.000Z');
    expect(parseTicketDateTime('22-11-2026', '12:15 PM').toISOString()).toBe('2026-11-22T11:15:00.000Z');
  });

  it.each([
    ['31-11-2026', '08:00 PM'],
    ['18-13-2026', '08:00 PM'],
    ['18-11-2026', '13:00 PM'],
    ['18-11-2026', '08:60 PM'],
    ['18-11-2026', '20:00'],
    ['2026-11-18', '08:00 PM'],
  ])('rejects %s %s instead of rolling it over', (date, start) => {
    expect(() => parseTicketDateTime(date, start)).toThrow();
  });
});

describe('festivalDayKey', () => {
  it('counts a show after midnight as the previous festival day', () => {
    expect(festivalDayKey(parseTicketDateTime('22-11-2026', '12:30 AM'))).toBe('2026-11-21');
  });

  it('starts the festival day at 05:00', () => {
    expect(festivalDayKey(parseTicketDateTime('22-11-2026', '04:59 AM'))).toBe('2026-11-21');
    expect(festivalDayKey(parseTicketDateTime('22-11-2026', '05:00 AM'))).toBe('2026-11-22');
  });
});

describe('formatting', () => {
  const evening = parseTicketDateTime('18-11-2026', '08:00 PM');

  it('formats short and long dates without engine-specific punctuation', () => {
    expect(formatDate(evening)).toBe('Wed 18 Nov');
    expect(formatDate(evening, 'long')).toBe('Wednesday 18 November 2026');
    expect(formatDayHeading(evening)).toBe('Wednesday 18 November');
  });

  it('formats 24-hour times in Amsterdam time', () => {
    expect(formatTime(evening)).toBe('20:00');
    expect(formatTime(parseTicketDateTime('22-11-2026', '12:05 AM'))).toBe('00:05');
  });

  it('shows a range only when the end is known', () => {
    expect(formatTimeRange(evening, null)).toBe('20:00');
    expect(formatTimeRange(evening, '2026-11-18T21:03:00.000Z')).toBe('20:00–22:03');
  });
});

describe('screeningEnd', () => {
  const start = parseTicketDateTime('18-11-2026', '08:00 PM');

  it('uses the end time from the IDFA site when there is one', () => {
    expect(screeningEnd(start, '2026-11-18T21:03:00.000Z').toISOString()).toBe('2026-11-18T21:03:00.000Z');
  });

  it('falls back to a typical length when the end is missing or before the start', () => {
    expect(screeningEnd(start, null).toISOString()).toBe('2026-11-18T21:00:00.000Z');
    expect(screeningEnd(start, '2026-11-18T18:00:00.000Z').toISOString()).toBe('2026-11-18T21:00:00.000Z');
  });
});

describe('ticket field conversions', () => {
  it('normalizes AI-read start times', () => {
    expect(normalizeStartTime('6:45 pm')).toBe('06:45 PM');
    expect(normalizeStartTime(' 10:00AM ')).toBe('10:00 AM');
  });

  it('round-trips dates and times through the HTML inputs', () => {
    expect(ticketDateToInput('05-11-2026')).toBe('2026-11-05');
    expect(inputToTicketDate('2026-11-05')).toBe('05-11-2026');
    expect(ticketStartToInput('12:30 AM')).toBe('00:30');
    expect(ticketStartToInput('04:00 PM')).toBe('16:00');
    expect(inputToTicketStart('00:30')).toBe('12:30 AM');
    expect(inputToTicketStart('16:00')).toBe('04:00 PM');
  });

  it('reads the festival year from the date', () => {
    expect(getFestivalYear('18-11-2026')).toBe(2026);
    expect(() => getFestivalYear('18-11')).toThrow();
  });
});
