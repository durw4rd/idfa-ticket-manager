/**
 * Script to move existing QR codes and ticket PDFs from the public Blob store to the private one
 * Run with: npm run migrate-blobs-private -- [--dry-run] [--keep-public]
 *
 * Requires PRIVATE_BLOB_READ_WRITE_TOKEN (private store) and BLOB_READ_WRITE_TOKEN (public store).
 * Run migrations/002-multi-user-multi-year.sql first.
 *
 * Safe to re-run: every public -> private copy is recorded in a journal file before the database
 * is updated, and public copies are only deleted once no ticket points at them. A later run
 * finishes anything an earlier run left behind, including deletions skipped with --keep-public.
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

const JOURNAL_PATH = path.join(process.cwd(), 'scripts', '.blob-migration-journal.json');

function loadJournal() {
  if (!fs.existsSync(JOURNAL_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8'));
}

function saveJournal(journal) {
  fs.writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2));
}

async function pointTicketsAt(publicUrl, privateUrl) {
  await sql`UPDATE tickets SET qr_code_url = ${privateUrl} WHERE qr_code_url = ${publicUrl}`;
  await sql`UPDATE tickets SET pdf_url = ${privateUrl} WHERE pdf_url = ${publicUrl}`;
}

async function stillReferenced(publicUrl) {
  const { rows } = await sql`
    SELECT 1 FROM tickets WHERE qr_code_url = ${publicUrl} OR pdf_url = ${publicUrl} LIMIT 1
  `;
  return rows.length > 0;
}

async function main() {
  // journal: { [publicUrl]: { privateUrl, deleted } }
  const journal = dryRun ? {} : loadJournal();

  // Every public file still referenced by a ticket, with an owner for the private path
  const { rows } = await sql`
    SELECT qr_code_url AS url, owner_email, 'qr-codes' AS kind FROM tickets
    UNION ALL
    SELECT pdf_url AS url, owner_email, 'tickets' AS kind FROM tickets
  `;
  const pending = new Map();
  for (const row of rows) {
    if (row.url && !isPrivateBlobUrl(row.url) && !pending.has(row.url)) {
      pending.set(row.url, row);
    }
  }

  console.log(`${pending.size} public files to move${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) {
    for (const [url, row] of pending) {
      console.log(`  ${row.kind}: ${url}`);
    }
    const leftovers = Object.entries(loadJournal()).filter(([, entry]) => !entry.deleted);
    console.log(`${leftovers.length} already-copied public files waiting to be deleted`);
    return;
  }

  let copied = 0;
  for (const [publicUrl, row] of pending) {
    let entry = journal[publicUrl];
    if (!entry) {
      entry = { privateUrl: await copyToPrivate(publicUrl, row.owner_email, row.kind), deleted: false };
      journal[publicUrl] = entry;
      // Record the copy before touching the database, so a failure below can be resumed
      saveJournal(journal);
      copied++;
    }
    await pointTicketsAt(publicUrl, entry.privateUrl);
  }
  console.log(`Copied ${copied} files to the private store and updated their tickets`);

  if (keepPublic) {
    console.log('Kept public copies (--keep-public); run again without it to delete them');
    return;
  }

  let deleted = 0;
  for (const [publicUrl, entry] of Object.entries(journal)) {
    if (entry.deleted) {
      continue;
    }
    if (await stillReferenced(publicUrl)) {
      // A previous run copied the file but didn't finish updating its tickets
      await pointTicketsAt(publicUrl, entry.privateUrl);
    }
    await del(publicUrl);
    entry.deleted = true;
    saveJournal(journal);
    deleted++;
  }
  console.log(`Deleted ${deleted} public copies`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
