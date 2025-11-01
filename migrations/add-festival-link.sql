-- Migration: Add festival_link column to tickets table
-- Run this SQL in your Postgres database to add support for storing festival links

ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS festival_link TEXT;

-- Add an index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_festival_link ON tickets(festival_link) WHERE festival_link IS NOT NULL;

