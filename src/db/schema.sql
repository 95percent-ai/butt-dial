-- Core tables for Phase 1 (SQLite-compatible)
-- Additional tables added in later phases as needed

-- Agent channel mappings
CREATE TABLE IF NOT EXISTS agent_channels (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  phone_number TEXT,
  whatsapp_sender_sid TEXT,
  whatsapp_status TEXT DEFAULT 'pending',
  email_address TEXT,
  voice_app_sid TEXT,
  voice_id TEXT,
  system_prompt TEXT,
  greeting TEXT,
  provider_overrides TEXT,         -- JSON string
  route_duplication TEXT,          -- JSON string
  status TEXT DEFAULT 'active',
  provisioned_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Agent pool management
CREATE TABLE IF NOT EXISTS agent_pool (
  id TEXT PRIMARY KEY,
  max_agents INTEGER DEFAULT 5,
  active_agents INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- WhatsApp number pool
CREATE TABLE IF NOT EXISTS whatsapp_pool (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  sender_sid TEXT,
  status TEXT DEFAULT 'available',
  assigned_to_agent TEXT REFERENCES agent_channels(agent_id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_channels_agent_id ON agent_channels(agent_id);

-- Seed the agent pool with default values
INSERT OR IGNORE INTO agent_pool (id, max_agents, active_agents)
VALUES ('default', 5, 0);
