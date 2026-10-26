/**
 * Script to backfill festival links for existing tickets
 * Run with: npm run backfill-festival-links -- [--dry-run]
 *
 * Uses the same lookup as /api/process-pdf: IDFA site search with an AI pick
 * (lib/find-festival-link.ts), then the hardcoded mapping (lib/festival-links.ts).
 * Environment variables come from .env.local (loaded by the npm script).
 */

import { sql } from '../lib/db';
import { getFestivalLink } from '../lib/festival-links';
import { findFestivalLink } from '../lib/find-festival-link';
import { flushLdEvents, userContext } from '../lib/launchdarkly';

const dryRun = process.argv.includes('--dry-run');

async function backfillFestivalLinks() {
  console.log(`Starting festival link backfill${dryRun ? ' (dry run)' : ''}...\n`);

  // Film pages differ per edition, so look up each title once per festival year
  const films = await sql<{ act: string; festival_year: number; owner_email: string }>`
    SELECT act, festival_year, MIN(owner_email) AS owner_email
    FROM tickets
    WHERE festival_link IS NULL
    GROUP BY act, festival_year
    ORDER BY festival_year, act
  `;

  if (films.rows.length === 0) {
    console.log('No tickets found without festival links.');
    return;
  }

  console.log(`Found ${films.rows.length} unique movies without festival links.\n`);

  let updated = 0;
  let found = 0;
  let notFound = 0;

  for (const { act, festival_year: festivalYear, owner_email: ownerEmail } of films.rows) {
    console.log(`Processing: "${act}" (IDFA ${festivalYear})...`);

    // The AI lookup is evaluated for a ticket owner, so the festival-link-ai kill switch applies
    console.log('  → Searching the IDFA site...');
    let festivalLink = await findFestivalLink(act, festivalYear, userContext(ownerEmail));

    if (!festivalLink) {
      console.log('  → Trying hardcoded mapping...');
      festivalLink = getFestivalLink(act, festivalYear);
    }

    if (festivalLink) {
      found++;
      console.log(`  ✓ Found link: ${festivalLink}`);

      if (dryRun) {
        console.log('  ✓ Dry run, not updating\n');
      } else {
        const result = await sql`
          UPDATE tickets
          SET festival_link = ${festivalLink}
          WHERE act = ${act} AND festival_year = ${festivalYear} AND festival_link IS NULL
          RETURNING id
        `;
        const count = result.rowCount || 0;
        updated += count;
        console.log(`  ✓ Updated ${count} ticket(s)\n`);
      }
    } else {
      notFound++;
      console.log(`  ✗ No link found\n`);
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('\n--- Summary ---');
  console.log(`Total movies processed: ${films.rows.length}`);
  console.log(`Movies with links found: ${found}`);
  console.log(`Movies without links: ${notFound}`);
  console.log(`Total tickets updated: ${updated}`);
}

backfillFestivalLinks()
  .then(async () => {
    await flushLdEvents();
    console.log('\nBackfill complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during backfill:', error);
    process.exit(1);
  });
