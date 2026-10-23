/**
 * Script to move existing QR codes and ticket PDFs from the public Blob store to the private one
 * Run with: npm run migrate-blobs-private -- [--dry-run] [--keep-public]
 *
 * Requires PRIVATE_BLOB_READ_WRITE_TOKEN (private store) and BLOB_READ_WRITE_TOKEN (public store).
 * Run migrations/002-multi-user-multi-year.sql first.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env.local if it exists
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const { sql: vercelSql } = require('@vercel/postgres');
const { put, del } = require('@vercel/blob');

// Set DATABASE_URL or POSTGRES_URL before importing
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}

const PRIVATE_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
if (!PRIVATE_TOKEN) {
  throw new Error('PRIVATE_BLOB_READ_WRITE_TOKEN environment variable is required');
}

const sql = vercelSql;
const dryRun = process.argv.includes('--dry-run');
const keepPublic = process.argv.includes('--keep-public');

// Same layout as uploadTicketFile in lib/storage.ts
function ownerFolder(ownerEmail) {
  return crypto.createHash('sha256').update(ownerEmail).digest('hex').slice(0, 16);
}

function isPrivateBlobUrl(url) {
  return url.includes('.private.blob.vercel-storage.com');
}

async function copyToPrivate(url, ownerEmail, kind) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || (kind === 'tickets' ? 'application/pdf' : 'image/png');
  const extension = kind === 'tickets' ? 'pdf' : 'png';
  const body = Buffer.from(await response.arrayBuffer());
  const pathname = `users/${ownerFolder(ownerEmail)}/${kind}/${crypto.randomUUID()}.${extension}`;
  const blob = await put(pathname, body, { access: 'private', contentType, token: PRIVATE_TOKEN });
  return blob.url;
}

async function main() {
  const { rows: tickets } = await sql`
    SELECT id, owner_email, qr_code_url, pdf_url FROM tickets ORDER BY created_at ASC
  `;

  console.log(`Found ${tickets.length} tickets${dryRun ? ' (dry run)' : ''}`);

  // One PDF can hold several tickets, so map each public URL to its private copy once
  const migrated = new Map();
  let moved = 0;

  for (const ticket of tickets) {
    const updates = {};

    for (const [column, kind] of [['qr_code_url', 'qr-codes'], ['pdf_url', 'tickets']]) {
      const url = ticket[column];
      if (!url || isPrivateBlobUrl(url)) {
        continue;
      }
      if (!migrated.has(url)) {
        if (dryRun) {
          migrated.set(url, '(dry run)');
        } else {
          migrated.set(url, await copyToPrivate(url, ticket.owner_email, kind));
        }
        moved++;
      }
      updates[column] = migrated.get(url);
    }

    if (Object.keys(updates).length === 0) {
      continue;
    }

    console.log(`Ticket ${ticket.id}: ${Object.keys(updates).join(', ')}`);
    if (!dryRun) {
      await sql`
        UPDATE tickets
        SET qr_code_url = ${updates.qr_code_url || ticket.qr_code_url},
            pdf_url = ${updates.pdf_url || ticket.pdf_url}
        WHERE id = ${ticket.id}
      `;
    }
  }

  console.log(`${dryRun ? 'Would copy' : 'Copied'} ${moved} files to the private store`);

  if (!dryRun && !keepPublic && migrated.size > 0) {
    const publicUrls = Array.from(migrated.keys());
    // Delete in batches to stay within request limits
    for (let i = 0; i < publicUrls.length; i += 100) {
      await del(publicUrls.slice(i, i + 100));
    }
    console.log(`Deleted ${publicUrls.length} public copies`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
