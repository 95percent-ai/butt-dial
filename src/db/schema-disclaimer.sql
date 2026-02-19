-- Disclaimer acceptance tracking
-- Records who accepted what disclaimer version, with IP and user-agent for audit trail.
CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  disclaimer_type TEXT NOT NULL DEFAULT 'platform_usage',
  version TEXT NOT NULL,
  accepted_at TEXT DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_disclaimer_user ON disclaimer_acceptances(user_id, disclaimer_type, version);
