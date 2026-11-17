-- Migration: one rating per person per film (part 2 of 2)
-- Run this SQL once the code that reads ratings.film_key is deployed (see 007-ratings-by-film.sql).
-- It fills in any rating saved by the old code in between, then retires the per-title constraint.

BEGIN;

UPDATE ratings r SET film_key = COALESCE(
  (SELECT lower(m[1] || ':' || m[2])
   FROM tickets t, regexp_match(t.festival_link, '/(film|composition)/([0-9a-fA-F-]{36})') AS m
   WHERE t.act = r.act AND t.festival_year = r.festival_year
   LIMIT 1),
  'title:' || lower(r.act)
)
WHERE film_key IS NULL;

ALTER TABLE ratings ALTER COLUMN film_key SET NOT NULL;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_email_act_year_key;
CREATE INDEX IF NOT EXISTS idx_ratings_film_year ON ratings (film_key, festival_year);

COMMIT;
