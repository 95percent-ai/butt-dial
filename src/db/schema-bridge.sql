-- Call Bridging — route inbound local calls to outbound local numbers via VoIP
-- Two cheap local calls instead of one expensive international call (~85% savings)

-- Bridge routes: maps incoming caller + Twilio number → destination number
CREATE TABLE IF NOT EXISTS bridge_registry (
  id TEXT PRIMARY KEY,
  local_number TEXT NOT NULL,         -- Twilio number that receives the inbound call
  caller_pattern TEXT NOT NULL,       -- E.164 caller ID to match, or '*' for any caller
  destination_number TEXT NOT NULL,   -- Number to dial on the outbound leg
  label TEXT,                         -- Human-readable name (e.g. "Inon → Kelvin")
  active INTEGER DEFAULT 1,          -- 1 = enabled, 0 = disabled
  org_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bridge_registry_lookup ON bridge_registry(local_number, caller_pattern, active);

-- Bridge call logs: tracks both legs of each bridged call
CREATE TABLE IF NOT EXISTS bridge_calls (
  id TEXT PRIMARY KEY,
  bridge_id TEXT,                     -- FK to bridge_registry (null for programmatic calls)
  inbound_sid TEXT,                   -- Twilio Call SID for leg A (caller → Twilio)
  outbound_sid TEXT,                  -- Twilio Call SID for leg B (Twilio → destination)
  caller TEXT NOT NULL,               -- Who called
  destination TEXT NOT NULL,          -- Who was dialed
  status TEXT DEFAULT 'pending',      -- pending | ringing | in-progress | completed | failed
  duration INTEGER,                   -- Call duration in seconds
  org_id TEXT DEFAULT 'default',
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bridge_calls_bridge ON bridge_calls(bridge_id);
CREATE INDEX IF NOT EXISTS idx_bridge_calls_started ON bridge_calls(started_at);
