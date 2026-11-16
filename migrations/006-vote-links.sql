-- Migration: Audience Award voting links from forwarded emails
-- Run this SQL in your Postgres database after 005-screening-end-and-qa.sql.

BEGIN;

-- Each user gets a private address to forward IDFA's voting emails to (see lib/vote-links.ts).
-- The token in that address is how the inbound webhook knows whose mail it is, so it is a secret.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inbound_token VARCHAR(32) UNIQUE;

-- Gmail asks the forwarding address to confirm before it forwards anything. That confirmation
-- mail lands in the webhook too; its link waits here until the user opens it from the Crew page.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forward_confirm_url TEXT;

-- One row per voting link. IDFA sends one single-use link per scanned ticket, so each link is
-- dealt to one of the recipient's tickets for that film and shown to whoever holds that ticket.
-- ticket_id is NULL when no ticket was left to take it; the owner still sees those.
CREATE TABLE IF NOT EXISTS vote_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email VARCHAR(255) NOT NULL,  -- Whose mailbox forwarded it
  festival_year INT NOT NULL,
  act VARCHAR(255) NOT NULL,          -- The ticket's title when matched, else the email's
  url TEXT NOT NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  message_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (owner_email, url)           -- Postmark retries and re-forwards don't duplicate links
);

-- At most one link per ticket
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_links_ticket ON vote_links(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vote_links_owner_year ON vote_links(owner_email, festival_year);

COMMIT;
