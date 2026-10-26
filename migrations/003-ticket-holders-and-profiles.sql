-- Migration: ticket holders and display names
-- Run this SQL in your Postgres database after 002-multi-user-multi-year.sql.

BEGIN;

-- Tickets: who will use the ticket. The uploader (owner_email) stays the owner; the holder is
-- whoever in the group the ticket is meant for. Existing tickets are held by their uploader.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS holder_email VARCHAR(255);
UPDATE tickets SET holder_email = owner_email WHERE holder_email IS NULL;
ALTER TABLE tickets ALTER COLUMN holder_email SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_holder ON tickets(holder_email);

-- Profiles: a display name a user picks for themselves. Users without a row get a name
-- derived from their email (see getDisplayName in lib/display.ts).
CREATE TABLE IF NOT EXISTS profiles (
  email VARCHAR(255) PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMIT;
