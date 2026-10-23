import { createHash, randomUUID } from 'crypto';
import { put, get, del } from '@vercel/blob';

// Ticket files (QR codes, PDFs) live in a private Vercel Blob store (Vercel sets access per
// store). The app never hands blob URLs to the browser; files are served through
// authenticated routes such as /api/tickets/[id]/qr.
const PRIVATE_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

function requirePrivateToken(): string {
  if (!PRIVATE_TOKEN) {
    throw new Error('PRIVATE_BLOB_READ_WRITE_TOKEN is not set; ticket files cannot be stored');
  }
  return PRIVATE_TOKEN;
}

export function isPrivateBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.private.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

function parseBlobUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.port === '' && parsed.hostname.endsWith('.blob.vercel-storage.com')) {
      return parsed;
    }
  } catch {
    // Not a URL
  }
  return null;
}

function ownerFolder(ownerEmail: string): string {
  // Hash the email so it doesn't appear in blob paths
  return createHash('sha256').update(ownerEmail).digest('hex').slice(0, 16);
}

/**
 * True if the URL is a ticket PDF this app stored for this owner. Clients send back the
 * URL from /api/upload, so it must be checked before it is saved with a ticket.
 */
export function isOwnTicketPdfUrl(ownerEmail: string, url: string): boolean {
  const parsed = parseBlobUrl(url);
  return !!parsed && parsed.pathname.startsWith(`/users/${ownerFolder(ownerEmail)}/tickets/`);
}

export async function uploadTicketFile(
  ownerEmail: string,
  kind: 'qr-codes' | 'tickets',
  body: Buffer,
  contentType: string
): Promise<string> {
  const extension = contentType === 'application/pdf' ? 'pdf' : 'png';
  const pathname = `users/${ownerFolder(ownerEmail)}/${kind}/${randomUUID()}.${extension}`;

  const blob = await put(pathname, body, { access: 'private', contentType, token: requirePrivateToken() });

  return blob.url;
}

/**
 * Read a stored file. Returns null if it doesn't exist.
 */
export async function readTicketFile(
  url: string
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  // Only ever read from the private Blob store, never from an arbitrary stored URL
  if (!parseBlobUrl(url) || !isPrivateBlobUrl(url)) {
    return null;
  }

  const result = await get(url, { access: 'private', token: requirePrivateToken() });
  if (!result || result.statusCode !== 200) {
    return null;
  }
  return { stream: result.stream, contentType: result.blob.contentType };
}

export async function deleteTicketFiles(urls: string[]): Promise<void> {
  const privateUrls = urls.filter((url) => url && isPrivateBlobUrl(url));

  try {
    if (privateUrls.length > 0) {
      await del(privateUrls, { token: requirePrivateToken() });
    }
  } catch (error) {
    // A leftover file is harmless; don't fail the request over it
    console.warn('Failed to delete ticket files:', error);
  }
}
