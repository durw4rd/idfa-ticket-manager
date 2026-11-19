import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { mayLackQrCode, parsePdfHash, ticketDedupKey } from './ticket-dedup';

const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');
const fileHash = 'a'.repeat(64);

describe('parsePdfHash', () => {
  it('accepts a lowercase SHA-256 hex string', () => {
    expect(parsePdfHash(fileHash)).toBe(fileHash);
  });

  it.each([undefined, null, 42, '', 'A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}g`])('rejects %j', (value) => {
    expect(parsePdfHash(value)).toBeNull();
  });
});

describe('ticketDedupKey', () => {
  it('hashes the QR payload, as tickets always have been', () => {
    expect(ticketDedupKey({ qrPayload: 'QR123', pdfHash: fileHash, pageNumber: 1 })).toBe(sha256('QR123'));
  });

  it('falls back to the PDF file and page for a ticket without a QR code', () => {
    expect(ticketDedupKey({ qrPayload: null, pdfHash: fileHash, pageNumber: 2 })).toBe(sha256(`pdf:${fileHash}:2`));
  });

  it('tells pages of the same file apart', () => {
    const page1 = ticketDedupKey({ qrPayload: null, pdfHash: fileHash, pageNumber: 1 });
    const page2 = ticketDedupKey({ qrPayload: null, pdfHash: fileHash, pageNumber: 2 });
    expect(page1).not.toBe(page2);
  });

  it('has no key without a QR code or a file hash', () => {
    expect(ticketDedupKey({ qrPayload: null, pdfHash: null, pageNumber: 1 })).toBeNull();
  });
});

describe('mayLackQrCode', () => {
  it('allows past editions only', () => {
    expect(mayLackQrCode(2015, 2026)).toBe(true);
    expect(mayLackQrCode(2025, 2026)).toBe(true);
    expect(mayLackQrCode(2026, 2026)).toBe(false);
    expect(mayLackQrCode(2027, 2026)).toBe(false);
  });
});
