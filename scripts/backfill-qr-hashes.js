/**
 * Script to fill in qr_hash for tickets uploaded before duplicate detection existed
 * Run with: npm run backfill-qr-hashes -- [--dry-run]
 *
 * Decodes each ticket's stored QR image and saves the SHA-256 of its payload, the same
 * value /api/process-pdf compares when skipping tickets that were already uploaded.
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
const { get } = require('@vercel/blob');
const jsQR = require('jsqr');
const sharp = require('sharp');

// Set DATABASE_URL or POSTGRES_URL before importing
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}

const sql = vercelSql;
const dryRun = process.argv.includes('--dry-run');

// Only download from public Vercel Blob storage; stored URLs are not trusted to point anywhere else
function assertPublicBlobUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.port !== '' || !parsed.hostname.endsWith('.public.blob.vercel-storage.com')) {
    throw new Error(`Refusing to download a non-Blob URL: ${url}`);
  }
}

async function downloadImage(url) {
  if (new URL(url).hostname.endsWith('.private.blob.vercel-storage.com')) {
    const result = await get(url, { access: 'private', token: process.env.PRIVATE_BLOB_READ_WRITE_TOKEN });
    if (!result || result.statusCode !== 200) {
      throw new Error(`Failed to download ${url}`);
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  assertPublicBlobUrl(url);
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function decodeQrPayload(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const qrCode = jsQR(new Uint8ClampedArray(data.buffer), info.width, info.height);
  return qrCode ? qrCode.data : null;
}

async function main() {
  const { rows: tickets } = await sql`
    SELECT id, act, date, qr_code_url FROM tickets WHERE qr_hash IS NULL ORDER BY created_at ASC
  `;

  console.log(`Found ${tickets.length} tickets without a QR hash${dryRun ? ' (dry run)' : ''}`);

  const seen = new Map();
  let updated = 0;
  let failed = 0;

  for (const ticket of tickets) {
    try {
      const payload = await decodeQrPayload(await downloadImage(ticket.qr_code_url));
      if (!payload) {
        throw new Error('no QR code found in the stored image');
      }
      const qrHash = crypto.createHash('sha256').update(payload).digest('hex');

      if (seen.has(qrHash)) {
        console.log(`  ${ticket.act} (${ticket.date}): same QR code as ticket ${seen.get(qrHash)}`);
      }
      seen.set(qrHash, ticket.id);

      if (!dryRun) {
        await sql`UPDATE tickets SET qr_hash = ${qrHash} WHERE id = ${ticket.id}`;
      }
      updated++;
    } catch (error) {
      console.error(`  ${ticket.act} (${ticket.date}): ${error.message}`);
      failed++;
    }
  }

  console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated} tickets, ${failed} failed`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
