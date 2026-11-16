import { describe, expect, it } from 'vitest';
import { validateTicketFields } from './ticket-fields';

const good = { act: ' Nuisance Bear ', location: 'Tuschinski 1', date: '14-11-2026', start: '10:00 am' };

describe('validateTicketFields', () => {
  it('trims the fields and normalizes the start time', () => {
    expect(validateTicketFields(good)).toEqual({
      ok: true,
      fields: { act: 'Nuisance Bear', location: 'Tuschinski 1', date: '14-11-2026', start: '10:00 AM' },
    });
  });

  it.each([
    [{ ...good, act: '   ' }, 'required'],
    [{ ...good, location: undefined }, 'required'],
    [{ ...good, act: 'x'.repeat(256) }, '255 characters'],
    [{ ...good, date: '2026-11-14' }, 'DD-MM-YYYY'],
    [{ ...good, start: '18:45' }, 'HH:MM AM/PM'],
    [{ ...good, date: '31-11-2026' }, 'Invalid date'],
    [{ ...good, act: 42 }, 'required'],
  ])('rejects %j', (raw, message) => {
    const result = validateTicketFields(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});
