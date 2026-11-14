-- Migration: screening end time and Q&A
-- Run this SQL in your Postgres database after 004-profile-badges.sql.

BEGIN;

-- Tickets only print the start. The end time and whether a Q&A follows come from the IDFA site
-- (see getShowDetails in lib/idfa.ts), filled in at upload and refreshed when the agenda loads.
-- NULL means IDFA hasn't told us; the app then assumes a typical length and shows no Q&A mark.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS has_qa BOOLEAN;

COMMIT;
