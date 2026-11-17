-- Migration: one rating per person per film, not per ticket title (part 1 of 2)
-- Run this SQL in your Postgres database after 006-vote-links.sql, BEFORE deploying the code that
-- reads ratings.film_key. Then deploy, then run 008-ratings-by-film-finish.sql.
--
-- The same film can come in under several titles ("IDFA Hit: The Siege of Paradise" and
-- "The Siege of Paradise"). ratings.film_key names the film: the IDFA page ID from a ticket's
-- festival_link ("film:<id>" or "composition:<id>"), else the title ("title:<title>"). The app builds
-- the same keys (filmKey in lib/films.ts) and moves a title key to its film once the title's page
-- is known, so the rough lower-cased title used for unlinked rows below is enough.
--
-- Nothing is deleted. The code deployed before this one still writes ratings without a film_key,
-- so the column stays nullable and the old (user_email, act, festival_year) constraint stays until
-- part 2. If the unique index fails, someone rated one film twice under two titles: keep one of
-- their ratings by hand and run this again.

BEGIN;

ALTER TABLE ratings ADD COLUMN IF NOT EXISTS film_key VARCHAR(300);

UPDATE ratings r SET film_key = COALESCE(
  (SELECT lower(m[1] || ':' || m[2])
   FROM tickets t, regexp_match(t.festival_link, '/(film|composition)/([0-9a-fA-F-]{36})') AS m
   WHERE t.act = r.act AND t.festival_year = r.festival_year
   LIMIT 1),
  'title:' || lower(r.act)
)
WHERE film_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_user_film_year_key ON ratings (user_email, film_key, festival_year);

COMMIT;
