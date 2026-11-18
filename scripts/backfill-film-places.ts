/**
 * Script to find where existing films take place, for the agenda's map view
 * Run with: npm run backfill-film-places -- [--dry-run] [--year=2025] [--retry]
 *
 * Uses the same lookup as uploads (lib/find-film-place.ts): the film's IDFA page, the
 * film-place-finder model, and the geocoder. Films that already have a place (or were found to
 * have none) are skipped; manual places are never touched. --retry also tries films whose last
 * lookup failed within the past few hours. Environment variables come from .env.local.
 */

import { sql, getFilmPlacesForYear, recordFilmPlaceAttempt, saveFilmPlace } from '../lib/db';
import { findFilmPlace } from '../lib/find-film-place';
import { titleFilmKey } from '../lib/films';
import { countryName } from '../lib/countries';
import { flushLdEvents, userContext } from '../lib/launchdarkly';

const dryRun = process.argv.includes('--dry-run');
const retry = process.argv.includes('--retry');
const onlyYear = Number(process.argv.find((arg) => arg.startsWith('--year='))?.slice('--year='.length)) || null;

async function backfillFilmPlaces() {
  console.log(`Starting film place backfill${dryRun ? ' (dry run)' : ''}...\n`);

  const years = await sql<{ festival_year: number }>`SELECT DISTINCT festival_year FROM tickets ORDER BY festival_year`;
  let placed = 0;
  let none = 0;
  let failed = 0;

  for (const { festival_year: year } of years.rows) {
    if (onlyYear && year !== onlyYear) continue;
    // The script acts for everyone: all of the year's ticket owners together see every film
    const owners = await sql<{ owner_email: string }>`SELECT DISTINCT owner_email FROM tickets WHERE festival_year = ${year}`;
    const visibleEmails = owners.rows.map((row) => row.owner_email);
    const { titles, keysByTitle, places, recentlyAttempted } = await getFilmPlacesForYear(visibleEmails, year);

    const pending = new Map<string, { act: string; link: string }>();
    let unlinked = 0;
    for (const { act, festivalLink } of titles) {
      const key = keysByTitle.get(act) ?? titleFilmKey(act);
      if (places.has(key) || pending.has(key) || (!retry && recentlyAttempted.has(key))) continue;
      if (!festivalLink) {
        if (!titles.some((t) => t.festivalLink && (keysByTitle.get(t.act) ?? titleFilmKey(t.act)) === key)) unlinked++;
        continue;
      }
      pending.set(key, { act, link: festivalLink });
    }

    console.log(`IDFA ${year}: ${pending.size} film(s) to place, ${places.size} already placed, ${unlinked} without an IDFA page\n`);

    for (const [key, { act, link }] of pending) {
      console.log(`Processing: "${act}"...`);
      // Evaluated for the script's own context; a disabled film-place-finder AI config stops the lookups
      const found = await findFilmPlace(link, act, userContext('backfill-film-places'));

      if (found === null) {
        failed++;
        console.log('  ✗ Could not tell now (IDFA or the model unavailable, the AI config disabled, or no description)\n');
        if (!dryRun) await recordFilmPlaceAttempt(key, year);
      } else if (found === 'none') {
        none++;
        console.log('  – No single real-world place\n');
        if (!dryRun) await saveFilmPlace(visibleEmails, act, year, null, 'none');
      } else {
        placed++;
        const where = [found.placeName, countryName(found.country!)].filter(Boolean).join(', ');
        console.log(`  ✓ ${where} (${found.lat!.toFixed(3)}, ${found.lon!.toFixed(3)})\n`);
        if (!dryRun) await saveFilmPlace(visibleEmails, act, year, found, 'ai');
      }

      // Small delay to go easy on IDFA, the model and the geocoder
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Films placed: ${placed}`);
  console.log(`Films with no single place: ${none}`);
  console.log(`Films that couldn't be placed now: ${failed}`);
  if (dryRun) console.log('Dry run: nothing was saved.');
}

backfillFilmPlaces()
  .then(async () => {
    await flushLdEvents();
    console.log('\nBackfill complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during backfill:', error);
    process.exit(1);
  });
