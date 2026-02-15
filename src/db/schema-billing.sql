-- Billing tables for Phase 18

-- Per-agent billing configuration
CREATE TABLE IF NOT EXISTS billing_config (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'starter',              -- free | starter | pro | enterprise
  markup_percent REAL DEFAULT 0,            -- per-agent markup override (0 = use global default)
  billing_email TEXT,                       -- email for invoices
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_billing_config_agent ON billing_config(agent_id);

-- Add billing_cost column to usage_logs if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a safe approach
CREATE TABLE IF NOT EXISTS _billing_migration_flag (applied INTEGER);
INSERT OR IGNORE INTO _billing_migration_flag VALUES (0);
