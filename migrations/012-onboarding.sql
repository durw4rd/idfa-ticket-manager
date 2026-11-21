-- Migration: first-run onboarding
-- Run this SQL in your Postgres database after 011-vote-links-voted.sql.

BEGIN;

-- Set when a user finishes or skips the welcome flow (/welcome). Until then the Agenda sends them
-- there, so someone who was just invited is walked through joining their crew first.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Everyone already using the app counts as onboarded: anyone in a group or with tickets. Only fills
-- the new column (or adds a profile row with no name or badge); existing values are untouched.
INSERT INTO profiles (email, onboarded_at)
SELECT email, NOW() FROM (
  SELECT user_email AS email FROM group_members WHERE status = 'active'
  UNION
  SELECT owner_email FROM tickets
) existing
ON CONFLICT (email) DO UPDATE SET onboarded_at = NOW() WHERE profiles.onboarded_at IS NULL;

COMMIT;
