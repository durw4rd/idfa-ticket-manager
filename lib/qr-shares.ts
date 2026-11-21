// Sharing your QR codes with chosen crew-mates (the qr_shares table, migration 013). A ticket's code
// shows to its holder and owner, and to anyone either of them shares with: see canSeeQr in
// lib/agenda.ts. A share counts only while both people are in a crew together.

import { sql } from './db';
import { normalizeEmail } from './groups';

/**
 * Whose codes the viewer may see, as ticket holder or owner: the viewer plus the crew-mates who
 * share with them. Pass it to canSeeQr. People outside `visibleEmails` are left out, so a share
 * stops counting when they no longer share a crew.
 */
export async function getQrEmails(viewer: { email: string; visibleEmails: string[] }): Promise<string[]> {
  const result = await sql`
    SELECT owner_email AS "ownerEmail"
    FROM qr_shares
    WHERE viewer_email = ${viewer.email} AND owner_email = ANY(${viewer.visibleEmails as any}::text[])
  `;
  return [viewer.email, ...result.rows.map((row) => row.ownerEmail as string)];
}

/** Who the owner shares their codes with, limited to their current crew */
export async function getQrSharedWith(owner: { email: string; visibleEmails: string[] }): Promise<string[]> {
  const result = await sql`
    SELECT viewer_email AS "viewerEmail"
    FROM qr_shares
    WHERE owner_email = ${owner.email} AND viewer_email = ANY(${owner.visibleEmails as any}::text[])
  `;
  return result.rows.map((row) => row.viewerEmail as string);
}

/**
 * Start or stop sharing the owner's codes with a crew-mate. Only the owner's own shares are written,
 * and only with someone in their crew. Returns false if `viewerEmail` isn't a crew-mate.
 */
export async function setQrShare(
  owner: { email: string; visibleEmails: string[] },
  viewerEmail: string,
  shared: boolean
): Promise<boolean> {
  const viewer = normalizeEmail(viewerEmail);
  if (viewer === owner.email || !owner.visibleEmails.includes(viewer)) {
    return false;
  }
  if (shared) {
    await sql`
      INSERT INTO qr_shares (owner_email, viewer_email)
      VALUES (${owner.email}, ${viewer})
      ON CONFLICT DO NOTHING
    `;
  } else {
    await sql`DELETE FROM qr_shares WHERE owner_email = ${owner.email} AND viewer_email = ${viewer}`;
  }
  return true;
}
