-- Migration: one rating per person per film (part 2 of 2)
-- Run this SQL once the code that reads ratings.film_key is deployed (see 007-ratings-by-film.sql).
-- It fills in any rating saved by the old code in between, then retires the per-title constraint.
--
-- If someone rated a film under one title before this deploy and under another title in between,
-- both are now the same film. One rating per person and film, and rating again replaces the old
-- one, so the most recently saved score and comment are kept, on the oldest row (see below).

BEGIN;

-- The app keeps reading and saving ratings while this runs. Take the strongest lock up front, as
-- the ALTER TABLEs below need it anyway: requests wait until COMMIT, nothing changes between ranking
-- the duplicates and deleting them, and no weaker lock has to be upgraded later (which could
-- deadlock with a request that had already read the table).
LOCK TABLE ratings IN ACCESS EXCLUSIVE MODE;

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

-- Per person, film and year: the oldest row stays (its title is the one first rated, which can be
-- what ties an unlinked title to the film, as upsertRating keeps it) and takes the newest score and
-- comment; the other rows go
CREATE TEMP TABLE rating_ranks ON COMMIT DROP AS
SELECT id,
  first_value(id) OVER (PARTITION BY user_email, festival_year, key ORDER BY created_at, id) AS oldest,
  first_value(id) OVER (PARTITION BY user_email, festival_year, key ORDER BY updated_at DESC, created_at DESC) AS newest
FROM rating_keys;

UPDATE ratings r SET rating = n.rating, comment = n.comment, updated_at = n.updated_at
FROM (SELECT DISTINCT oldest, newest FROM rating_ranks WHERE oldest <> newest) pick
JOIN ratings n ON n.id = pick.newest
WHERE r.id = pick.oldest;

DELETE FROM ratings WHERE id IN (SELECT id FROM rating_ranks WHERE id <> oldest);

UPDATE ratings r SET film_key = k.key FROM rating_keys k WHERE r.id = k.id AND r.film_key IS NULL;

ALTER TABLE ratings ALTER COLUMN film_key SET NOT NULL;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_email_act_year_key;
CREATE INDEX IF NOT EXISTS idx_ratings_film_year ON ratings (film_key, festival_year);

COMMIT;
