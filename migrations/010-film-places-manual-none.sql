-- Migration: a person can say a film has no single place, and the AI can't undo it
-- Run this SQL in your Postgres database after 009-film-places.sql, before deploying the code that
-- saves manual "no single place" rows.
--
-- 009 only allowed a missing country with source 'none' (the AI's "no real-world place"). A
-- person choosing "No single place" is now stored as source 'manual' with no country, so it gets
-- the same protection as any manual place (see saveFilmPlace in lib/db.ts). A row has either a full
-- place or none of it.

BEGIN;

ALTER TABLE film_places DROP CONSTRAINT IF EXISTS film_places_check;
ALTER TABLE film_places DROP CONSTRAINT IF EXISTS film_places_place_complete;
ALTER TABLE film_places ADD CONSTRAINT film_places_place_complete CHECK (
  (country IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL AND source <> 'none')
  OR (country IS NULL AND lat IS NULL AND lon IS NULL AND place_name IS NULL AND source IN ('none', 'manual'))
);

COMMIT;
