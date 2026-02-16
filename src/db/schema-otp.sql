-- OTP verification codes table
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  contact_address TEXT NOT NULL,
  channel TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_agent_contact ON otp_codes(agent_id, contact_address);
