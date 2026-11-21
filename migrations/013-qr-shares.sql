-- Migration: sharing your QR codes with chosen crew-mates
-- Run this SQL in your Postgres database after 012-onboarding.sql.

BEGIN;

-- A ticket's QR code shows only to its holder and owner, plus anyone either of them shares with
-- here (the "Can show my tickets" switches on the Crew page). A share counts only while both are
-- in a crew together, so leaving every shared group ends it without deleting the row.
CREATE TABLE IF NOT EXISTS qr_shares (
  owner_email TEXT NOT NULL,   -- Who shares their codes
  viewer_email TEXT NOT NULL,  -- Who may see them
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_email, viewer_email),
  CHECK (owner_email <> viewer_email)
);

-- Looked up by viewer on every page that shows codes
CREATE INDEX IF NOT EXISTS qr_shares_viewer_idx ON qr_shares (viewer_email);

COMMIT;
