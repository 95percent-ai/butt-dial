-- Voicemail messages collected by the answering machine
-- when no agent is connected via MCP to handle voice calls.

CREATE TABLE IF NOT EXISTS voicemail_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  call_sid TEXT NOT NULL,
  caller_from TEXT NOT NULL,
  caller_to TEXT NOT NULL,
  transcript TEXT,
  caller_message TEXT,
  caller_preferences TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  dispatched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_voicemail_agent_status
  ON voicemail_messages(agent_id, status);
