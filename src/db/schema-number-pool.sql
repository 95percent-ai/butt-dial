-- Number Pool: shared phone numbers for smart outbound routing
-- Numbers are matched by country code to minimize international call costs.

CREATE TABLE IF NOT EXISTS number_pool (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '["sms","voice"]',
  is_default INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  label TEXT,
  org_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_number_pool_country ON number_pool(country_code, status);
