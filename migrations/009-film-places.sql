-- Migration: where each film takes place, for the Map tab
-- Run this SQL in your Postgres database after 008-ratings-by-film-finish.sql, before deploying the
-- code that reads film_places.
--
-- One primary place per film and festival year, keyed like ratings by film_key (filmKey in
-- lib/films.ts), so every title and ticket of a film shares it. It's public programme information,
-- not anyone's data: the app reads it only for films the viewer's crew has tickets for, and anyone
-- with a ticket for the film can correct it (see saveFilmPlace in lib/db.ts).

BEGIN;

CREATE TABLE IF NOT EXISTS film_places (
  film_key VARCHAR(300) NOT NULL,
  festival_year INT NOT NULL,
  -- The town, village or region ("Kabul", "Rondônia"); NULL means the country as a whole
  place_name TEXT,
  -- ISO 3166-1 alpha-2 (XK for Kosovo), from lib/countries-data.ts; NULL when source = 'none'
  country CHAR(2),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  -- 'ai' (found by find-film-place), 'manual' (set by someone; the AI never overwrites it), or
  -- 'none' (looked: the film has no single real-world place, e.g. a mixed shorts program)
  source VARCHAR(10) NOT NULL CHECK (source IN ('ai', 'manual', 'none')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (film_key, festival_year),
  CHECK (source = 'none' OR (country IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL))
);

-- Lookups that couldn't finish (IDFA or the model unreachable), so they wait a while before the
-- next try instead of running on every map load
CREATE TABLE IF NOT EXISTS film_place_attempts (
  film_key VARCHAR(300) NOT NULL,
  festival_year INT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (film_key, festival_year)
);

COMMIT;
