-- Migration: remember which Audience Award voting links have been used
-- Run this SQL in your Postgres database after 010-film-places-manual-none.sql.

BEGIN;

-- Set when the holder opens the link from the app, or says they voted from IDFA's email;
-- the Films page's to-do list and the tab's count leave out links that have it.
ALTER TABLE vote_links ADD COLUMN IF NOT EXISTS voted_at TIMESTAMPTZ;

COMMIT;
