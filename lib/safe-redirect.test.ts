import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './safe-redirect';

describe('safeCallbackUrl', () => {
  it.each([
    ['/films', '/films'],
    ['/screenings?year=2025', '/screenings?year=2025'],
    ['/screenings/A%7C18-11-2026%7C08%3A00%20PM', '/screenings/A%7C18-11-2026%7C08%3A00%20PM'],
  ])('follows a path on this site: %s', (raw, expected) => {
    expect(safeCallbackUrl(raw)).toBe(expected);
  });

  it.each([
    null,
    '',
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil.example/x',
    '/\t/evil.example/x',
    '/\n/evil.example/x',
    'javascript:alert(1)',
    '/.//evil.example/x',
    '/%2e//evil.example/x',
    '/%2E%2E//evil.example/x',
    '/a/..//evil.example/x',
  ])('sends %j to the agenda instead', (raw) => {
    expect(safeCallbackUrl(raw)).toBe('/screenings');
  });
});
