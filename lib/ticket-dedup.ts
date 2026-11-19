import { createHash } from 'crypto';

// Tickets from older IDFA editions (2015, 2020) have no QR code. They're kept as a record of what
// was seen, so they can't get anyone into a cinema; a current ticket without a QR code is a failed
// read instead.

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The PDF file hash the browser sent, if it's a well-formed SHA-256 */
export function parsePdfHash(value: unknown): string | null {
  return typeof value === 'string' && SHA256_HEX.test(value) ? value : null;
}

/**
 * The duplicate key stored in `qr_hash`: the SHA-256 of the QR payload, or, for a ticket without
 * a QR code, of its PDF file and page. The `pdf:` prefix keeps the two kinds from colliding.
 * Null when there's nothing to tell the ticket apart by (no QR code and no file hash).
 */
export function ticketDedupKey(source: {
  qrPayload: string | null;
  pdfHash: string | null;
  pageNumber: number;
}): string | null {
  const input = source.qrPayload ?? (source.pdfHash ? `pdf:${source.pdfHash}:${source.pageNumber}` : null);
  return input === null ? null : createHash('sha256').update(input).digest('hex');
}

/** Only past editions may be saved without a QR code */
export function mayLackQrCode(festivalYear: number, currentFestivalYear: number): boolean {
  return festivalYear < currentFestivalYear;
}
