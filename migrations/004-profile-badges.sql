-- Migration: avatar badges
-- Run this SQL in your Postgres database after 003-ticket-holders-and-profiles.sql.

BEGIN;

-- The cinema icon a user picks for their avatar (see BADGES in lib/display.ts). NULL shows their
-- initial. The app keeps badges unique within a crew; the database doesn't, since crews overlap.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge VARCHAR(20);

-- A profile can now hold just a badge, with the name derived from the email
ALTER TABLE profiles ALTER COLUMN name DROP NOT NULL;

COMMIT;
