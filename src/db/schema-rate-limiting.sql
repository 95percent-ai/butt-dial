-- Rate limiting & cost tracking tables for Phase 10 (SQLite-compatible)
-- Idempotent — safe to run multiple times

-- Usage logs — every outbound action recorded for rate checking + cost tracking
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  action_type TEXT NOT NULL,        -- 'sms', 'email', 'whatsapp', 'voice_call', 'voice_message'
  channel TEXT NOT NULL,             -- 'sms', 'email', 'whatsapp', 'voice'
  target_address TEXT,               -- recipient phone/email (for contact frequency)
  cost REAL DEFAULT 0,               -- action cost in USD (0 if unknown, updated later)
  external_id TEXT,                  -- provider reference (Twilio SID, Resend ID, etc.)
  status TEXT DEFAULT 'success',     -- 'success', 'failed', 'rate_limited'
  metadata TEXT,                     -- JSON blob for extra context
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index: rate limit checks (agent + time window)
CREATE INDEX IF NOT EXISTS idx_usage_logs_agent_time
  ON usage_logs(agent_id, created_at);

-- Index: rate limit checks by action type
CREATE INDEX IF NOT EXISTS idx_usage_logs_agent_action_time
  ON usage_logs(agent_id, action_type, created_at);

-- Index: contact frequency checks (same agent + same target + action type)
CREATE INDEX IF NOT EXISTS idx_usage_logs_agent_target_action_time
  ON usage_logs(agent_id, target_address, action_type, created_at);

-- Index: look up by external ID (for cost updates from webhooks)
CREATE INDEX IF NOT EXISTS idx_usage_logs_external_id
  ON usage_logs(external_id);
