-- Security tables for Phase 9 (SQLite-compatible)
-- Idempotent — safe to run multiple times

-- Bearer tokens for agent authentication
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  token_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash ON agent_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_agent ON agent_tokens(agent_id);

-- Encrypted provider credentials
CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  credential_key TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, credential_key)
);

-- Agent spending/rate limits
CREATE TABLE IF NOT EXISTS spending_limits (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL REFERENCES agent_channels(agent_id),
  max_actions_per_minute INTEGER DEFAULT 10,
  max_actions_per_hour INTEGER DEFAULT 100,
  max_actions_per_day INTEGER DEFAULT 500,
  max_spend_per_day REAL DEFAULT 10.0,
  max_spend_per_month REAL DEFAULT 100.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
