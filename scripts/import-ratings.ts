/**
 * Script to import ratings kept outside the app (notes from past editions)
 * Run with: npm run import-ratings -- <file.json> --email=<account> [--dry-run]
 *
 * The file is a JSON array of { year, act, rating, comment? }, where act is the exact title of one
 * of the account's tickets that year: the Films page shows a rating only for a film with a ticket,
 * so an entry without a matching ticket is reported and skipped rather than guessed. Each rating
 * is saved through upsertRating, exactly as when rating in the app, so importing again updates
 * rather than duplicates. Keep the file out of the repo. Environment variables come from .env.local.
 */

import { readFileSync } from 'fs';
import { sql, upsertRating } from '../lib/db';
import { normalizeEmail } from '../lib/groups';
import { MAX_COMMENT_LENGTH } from '../lib/films';

interface Entry {
  year: number;
  act: string;
  rating: number;
  comment?: string | null;
}

const dryRun = process.argv.includes('--dry-run');
const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const rawEmail = process.argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length);

/** Why an entry can't be saved, checked like POST /api/ratings does; null when it's fine */
function problem(entry: Entry): string | null {
  if (!Number.isInteger(entry.year) || entry.year < 2000 || entry.year > 2100) return 'year must be 2000-2100';
  if (!entry.act || typeof entry.act !== 'string') return 'act (the ticket title) is required';
  if (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 10) return 'rating must be a whole number 1-10';
  if (entry.comment != null && typeof entry.comment !== 'string') return 'comment must be a string';
  if (entry.comment && entry.comment.length > MAX_COMMENT_LENGTH) return `comment is over ${MAX_COMMENT_LENGTH} characters`;
  return null;
}

async function importRatings() {
  if (!file || !rawEmail) {
    console.error('Usage: npm run import-ratings -- <file.json> --email=<account> [--dry-run]');
    process.exit(1);
  }
  const email = normalizeEmail(rawEmail);
  const entries = JSON.parse(readFileSync(file, 'utf8')) as Entry[];
  if (!Array.isArray(entries)) throw new Error('The file must hold a JSON array');
  console.log(`Importing ${entries.length} ratings${dryRun ? ' (dry run)' : ''}...\n`);

  // The account's own tickets: whoever rates a film in the app sees it through a ticket they own
  const tickets = await sql<{ act: string; festival_year: number }>`
    SELECT DISTINCT act, festival_year FROM tickets WHERE owner_email = ${email}
  `;
  const titles = new Set(tickets.rows.map((row) => `${row.festival_year}|${row.act}`));

  let saved = 0;
  let skipped = 0;
  for (const entry of entries) {
    const label = `${entry.year} ${entry.act} (${entry.rating}/10, ${entry.comment?.length ?? 0} chars)`;
    const why = problem(entry) ?? (titles.has(`${entry.year}|${entry.act}`) ? null : 'no ticket with this exact title that year');
    if (why) {
      console.log(`  ✗ ${label}: ${why}`);
      skipped++;
      continue;
    }
    if (!dryRun) {
      await upsertRating([email], email, entry.act, entry.year, entry.rating, entry.comment?.trim() || null);
    }
    console.log(`  ✓ ${label}`);
    saved++;
  }

  console.log(`\n${dryRun ? 'Would save' : 'Saved'} ${saved}, skipped ${skipped}.`);
  if (skipped > 0) process.exitCode = 1;
}

importRatings().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
