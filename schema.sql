-- Huda Math Club — Cloudflare D1 schema
-- Run with:
--   npx wrangler d1 execute huda-math-club --local  --file=./schema.sql
--   npx wrangler d1 execute huda-math-club --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS registrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,

  parent_name   TEXT NOT NULL,
  -- COLLATE NOCASE makes the UNIQUE constraint (and lookups) case-insensitive,
  -- so "Ada@x.com" and "ada@x.com" are the same person.
  parent_email  TEXT NOT NULL COLLATE NOCASE,
  parent_phone  TEXT NOT NULL,
  child_name    TEXT NOT NULL COLLATE NOCASE,

  session       TEXT NOT NULL CHECK (session IN ('Session 1', 'Session 2')),
  status        TEXT NOT NULL CHECK (status IN ('Confirmed', 'Waitlist')),

  -- NULL when Confirmed; 1, 2, 3... when Waitlist.
  waitlist_spot INTEGER,

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),

  -- A spot number only makes sense on the waitlist, and every waitlisted row must have one.
  CHECK (
    (status = 'Confirmed' AND waitlist_spot IS NULL) OR
    (status = 'Waitlist'  AND waitlist_spot IS NOT NULL)
  ),

  -- Duplicate protection at the database level: one child, one session, per parent email.
  UNIQUE (parent_email, child_name, session)
);

-- Fast lookup for the login/history page.
CREATE INDEX IF NOT EXISTS idx_registrations_email
  ON registrations (parent_email);

-- Fast COUNT(*) for the seat/waitlist calculation on insert.
CREATE INDEX IF NOT EXISTS idx_registrations_session
  ON registrations (session, id);
