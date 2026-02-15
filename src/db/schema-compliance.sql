-- Compliance tables for Phase 17

-- Do Not Contact list
CREATE TABLE IF NOT EXISTS dnc_list (
  id TEXT PRIMARY KEY,
  phone_number TEXT,
  email_address TEXT,
  reason TEXT,
  added_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dnc_phone ON dnc_list(phone_number);
CREATE INDEX IF NOT EXISTS idx_dnc_email ON dnc_list(email_address);

-- GDPR erasure requests
CREATE TABLE IF NOT EXISTS erasure_requests (
  id TEXT PRIMARY KEY,
  subject_identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL, -- phone | email | agent_id
  status TEXT DEFAULT 'pending', -- pending | completed | failed
  tables_affected TEXT,          -- JSON array of table names
  rows_deleted INTEGER DEFAULT 0,
  requested_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
