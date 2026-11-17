-- Migration: one rating per person per film (part 2 of 2)
-- Run this SQL once the code that reads ratings.film_key is deployed (see 007-ratings-by-film.sql).
-- It fills in any rating saved by the old code in between, then retires the per-title constraint.
--
-- If someone rated a film under one title before this deploy and under another title in between,
-- both are now the same film. One rating per person and film, and rating again replaces the old
-- one, so the most recently saved is kept and the older one deleted. To see what would go, run it
-- with the DELETE changed to a SELECT, then ROLLBACK.

BEGIN;

-- The app keeps saving ratings while this runs. Hold off its writes until COMMIT, so nothing
-- changes between ranking the duplicates below and deleting them.
LOCK TABLE ratings IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE rating_keys ON COMMIT DROP AS
SELECT r.id, r.user_email, r.festival_year, r.updated_at, r.created_at, COALESCE(
  r.film_key,
  (SELECT lower(m[1] || ':' || m[2])
   FROM tickets t, regexp_match(t.festival_link, '/(film|composition)/([0-9a-fA-F-]{36})') AS m
   WHERE t.act = r.act AND t.festival_year = r.festival_year
   LIMIT 1),
  'title:' || lower(r.act)
) AS key
FROM ratings r;

DELETE FROM ratings WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY user_email, festival_year, key ORDER BY updated_at DESC, created_at DESC
    ) AS newest
    FROM rating_keys
  ) ranked
  WHERE newest > 1
);

UPDATE ratings r SET film_key = k.key FROM rating_keys k WHERE r.id = k.id AND r.film_key IS NULL;

ALTER TABLE ratings ALTER COLUMN film_key SET NOT NULL;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_email_act_year_key;
CREATE INDEX IF NOT EXISTS idx_ratings_film_year ON ratings (film_key, festival_year);

COMMIT;
