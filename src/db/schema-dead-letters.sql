-- Dead Letter Queue — stores messages that failed to send or couldn't be delivered.
-- Replaces voicemail_messages with a broader scope covering all channels.
-- Successful sends and successful inbound deliveries store nothing here.

CREATE TABLE IF NOT EXISTS dead_letters (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT DEFAULT 'default',
  channel TEXT NOT NULL,           -- sms, email, whatsapp, voice, line
  direction TEXT NOT NULL,         -- inbound, outbound
  reason TEXT NOT NULL,            -- agent_offline, send_failed, provider_error
  from_address TEXT,
  to_address TEXT,
  body TEXT,
  media_url TEXT,
  original_request TEXT,           -- JSON of original params (for retry)
  error_details TEXT,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, acknowledged
  created_at TEXT DEFAULT (datetime('now')),
  acknowledged_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_agent_status
  ON dead_letters(agent_id, status);
