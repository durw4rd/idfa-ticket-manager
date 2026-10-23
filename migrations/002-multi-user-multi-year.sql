-- Migration: multi-user ownership, festival years, and sharing groups
-- Run this SQL in your Postgres database after add-festival-link.sql.
-- Existing tickets are assigned to misa.fasa@gmail.com and a group is seeded for the existing users;
-- change those emails before running this on another database.

BEGIN;

-- Tickets: owner, festival year, absolute start time, QR payload hash
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS festival_year INT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_hash VARCHAR(64);

UPDATE tickets SET owner_email = 'misa.fasa@gmail.com' WHERE owner_email IS NULL;
UPDATE tickets SET festival_year = CAST(split_part(date, '-', 3) AS INT) WHERE festival_year IS NULL;
-- date is DD-MM-YYYY and start is HH:MM AM/PM, both in Amsterdam local time
UPDATE tickets
SET starts_at = (to_timestamp(date || ' ' || start, 'DD-MM-YYYY HH12:MI AM')::timestamp) AT TIME ZONE 'Europe/Amsterdam'
WHERE starts_at IS NULL;

ALTER TABLE tickets ALTER COLUMN owner_email SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN festival_year SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN starts_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_owner_year ON tickets(owner_email, festival_year);
CREATE INDEX IF NOT EXISTS idx_tickets_starts_at ON tickets(starts_at);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_hash ON tickets(qr_hash) WHERE qr_hash IS NOT NULL;

-- Ratings: one rating per user, movie, and festival year
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS festival_year INT;
UPDATE ratings SET festival_year = 2025 WHERE festival_year IS NULL;
ALTER TABLE ratings ALTER COLUMN festival_year SET NOT NULL;

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_email_act_key;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_email_act_year_key;
ALTER TABLE ratings ADD CONSTRAINT ratings_user_email_act_year_key UNIQUE (user_email, act, festival_year);
CREATE INDEX IF NOT EXISTS idx_ratings_act_year ON ratings(act, festival_year);

-- Groups: users in the same group see each other's screenings and ratings
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
  invited_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_group_members_email ON group_members(user_email);

-- Seed the existing couple as one group
DO $$
DECLARE
  seeded_group UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE user_email = 'misa.fasa@gmail.com') THEN
    INSERT INTO groups (name, created_by)
    VALUES ('Misa & Martina', 'misa.fasa@gmail.com')
    RETURNING id INTO seeded_group;

    INSERT INTO group_members (group_id, user_email, role, status, invited_by) VALUES
      (seeded_group, 'misa.fasa@gmail.com', 'owner', 'active', NULL),
      (seeded_group, 'martina.chylkova@gmail.com', 'member', 'active', 'misa.fasa@gmail.com');
  END IF;
END $$;

COMMIT;
