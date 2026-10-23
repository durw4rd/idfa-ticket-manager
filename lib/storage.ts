import { createHash, randomUUID } from 'crypto';
import { put, get, del } from '@vercel/blob';

// Ticket files (QR codes, PDFs) go to a private Blob store when PRIVATE_BLOB_READ_WRITE_TOKEN
// is set. Vercel sets access per store, so private files need their own store.
// Without it, files go to the existing public store under unguessable names.
// Either way the app never hands blob URLs to the browser; files are served through
// authenticated routes such as /api/tickets/[id]/qr.
const PRIVATE_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

export function isPrivateBlobUrl(url: string): boolean {
  return url.includes('.private.blob.vercel-storage.com');
}

function ownerFolder(ownerEmail: string): string {
  // Hash the email so it doesn't appear in blob paths
  return createHash('sha256').update(ownerEmail).digest('hex').slice(0, 16);
}

export async function uploadTicketFile(
  ownerEmail: string,
  kind: 'qr-codes' | 'tickets',
  body: Buffer,
  contentType: string
): Promise<string> {
  const extension = contentType === 'application/pdf' ? 'pdf' : 'png';
  const pathname = `users/${ownerFolder(ownerEmail)}/${kind}/${randomUUID()}.${extension}`;

  const blob = PRIVATE_TOKEN
    ? await put(pathname, body, { access: 'private', contentType, token: PRIVATE_TOKEN })
    : await put(pathname, body, { access: 'public', contentType });

  return blob.url;
}

/**
 * Read a stored file, private or public. Returns null if it doesn't exist.
 */
export async function readTicketFile(
  url: string
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  if (isPrivateBlobUrl(url)) {
    const result = await get(url, { access: 'private', token: PRIVATE_TOKEN });
    if (!result || result.statusCode !== 200) {
      return null;
    }
    return { stream: result.stream, contentType: result.blob.contentType };
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    return null;
  }
  return { stream: response.body, contentType: response.headers.get('content-type') || 'application/octet-stream' };
}

export async function deleteTicketFiles(urls: string[]): Promise<void> {
  const privateUrls = urls.filter((url) => url && isPrivateBlobUrl(url));
  const publicUrls = urls.filter((url) => url && !isPrivateBlobUrl(url));

  try {
    if (privateUrls.length > 0) {
      await del(privateUrls, { token: PRIVATE_TOKEN });
    }
    if (publicUrls.length > 0) {
      await del(publicUrls);
    }
  } catch (error) {
    // A leftover file is harmless; don't fail the request over it
    console.warn('Failed to delete ticket files:', error);
  }
}
