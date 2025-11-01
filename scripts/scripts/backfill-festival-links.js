"use strict";
/**
 * Script to backfill festival links for existing tickets
 * Run with: npm run backfill-festival-links
 */
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = require("@vercel/postgres");
const find_festival_link_1 = require("../lib/find-festival-link");
const festival_links_1 = require("../lib/festival-links");
// Set DATABASE_URL or POSTGRES_URL before importing
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
}
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}
const sql = postgres_1.sql;
async function backfillFestivalLinks() {
    console.log('Starting festival link backfill...\n');
    // Get all tickets without festival links
    const tickets = await sql `
    SELECT DISTINCT act
    FROM tickets
    WHERE festival_link IS NULL
    ORDER BY act
  `;
    if (tickets.rows.length === 0) {
        console.log('No tickets found without festival links.');
        return;
    }
    console.log(`Found ${tickets.rows.length} unique movies without festival links.\n`);
    let updated = 0;
    let found = 0;
    let notFound = 0;
    for (const row of tickets.rows) {
        const act = row.act;
        console.log(`Processing: "${act}"...`);
        // Try AI first
        let festivalLink = null;
        try {
            console.log('  → Trying AI search...');
            festivalLink = await (0, find_festival_link_1.findFestivalLink)(act);
        }
        catch (error) {
            console.warn(`  → AI search failed:`, error);
        }
        // Fall back to hardcoded mapping if AI didn't find it
        if (!festivalLink) {
            console.log('  → Trying hardcoded mapping...');
            festivalLink = (0, festival_links_1.getFestivalLink)(act);
        }
        if (festivalLink) {
            // Update all tickets with this act
            const result = await sql `
        UPDATE tickets
        SET festival_link = ${festivalLink}
        WHERE act = ${act} AND festival_link IS NULL
        RETURNING id
      `;
            const count = result.rowCount || 0;
            updated += count;
            found++;
            console.log(`  ✓ Found link: ${festivalLink}`);
            console.log(`  ✓ Updated ${count} ticket(s)\n`);
        }
        else {
            notFound++;
            console.log(`  ✗ No link found\n`);
        }
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('\n--- Summary ---');
    console.log(`Total movies processed: ${tickets.rows.length}`);
    console.log(`Movies with links found: ${found}`);
    console.log(`Movies without links: ${notFound}`);
    console.log(`Total tickets updated: ${updated}`);
}
backfillFestivalLinks()
    .then(() => {
    console.log('\nBackfill complete!');
    process.exit(0);
})
    .catch((error) => {
    console.error('Error during backfill:', error);
    process.exit(1);
});
