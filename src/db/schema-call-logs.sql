-- Call logging table for Phase 13 — Advanced Voice
-- Tracks duration, cost, recording URL, transfers, agent-to-agent calls

CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  call_sid TEXT,
  direction TEXT NOT NULL,       -- inbound | outbound | transfer | agent-to-agent
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  status TEXT DEFAULT 'initiated', -- initiated | ringing | in-progress | completed | failed | busy | no-answer
  duration_seconds INTEGER,
  cost REAL,
  recording_url TEXT,
  recording_sid TEXT,
  transfer_to TEXT,              -- phone number or agent ID if transferred
  metadata TEXT,                 -- JSON string for extra data
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_logs_agent ON call_logs(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_sid ON call_logs(call_sid);
