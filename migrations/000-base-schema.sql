-- Base schema: the original tickets and ratings tables.
-- For a new database, run this first, then add-festival-link.sql, then 002-multi-user-multi-year.sql.

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  date VARCHAR(10) NOT NULL,
  start VARCHAR(10) NOT NULL,
  qr_code_url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  transaction_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screening_key ON tickets(act, date, start);
CREATE INDEX IF NOT EXISTS idx_date ON tickets(date);
CREATE INDEX IF NOT EXISTS idx_act ON tickets(act);
CREATE INDEX IF NOT EXISTS idx_location ON tickets(location);

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email VARCHAR(255) NOT NULL,
  act VARCHAR(255) NOT NULL,  -- Movie title
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_email, act)  -- Replaced by (user_email, act, festival_year) in 002
);

CREATE INDEX IF NOT EXISTS idx_ratings_user_email ON ratings(user_email);
CREATE INDEX IF NOT EXISTS idx_ratings_act ON ratings(act);
CREATE INDEX IF NOT EXISTS idx_ratings_user_act ON ratings(user_email, act);
