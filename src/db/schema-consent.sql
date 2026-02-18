-- Contact consent tracking
-- Records consent status for each contact per agent per channel
CREATE TABLE IF NOT EXISTS contact_consent (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT DEFAULT 'default',
  contact_address TEXT NOT NULL,           -- phone number or email
  channel TEXT NOT NULL,                    -- sms, voice, email, whatsapp
  consent_type TEXT NOT NULL DEFAULT 'express',  -- express, implied, transactional
  status TEXT NOT NULL DEFAULT 'granted',   -- granted, revoked
  granted_at TEXT DEFAULT (datetime('now')),
  revoked_at TEXT,
  source TEXT,                              -- how consent was obtained: web_form, verbal, sms_optin, api
  ip_address TEXT,                          -- IP where consent was recorded (if web)
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_consent_lookup ON contact_consent(agent_id, contact_address, channel, status);
CREATE INDEX IF NOT EXISTS idx_contact_consent_org ON contact_consent(org_id);

-- Per-country terms acceptance tracking
CREATE TABLE IF NOT EXISTS country_terms_accepted (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT DEFAULT 'default',
  country_code TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  accepted_at TEXT DEFAULT (datetime('now')),
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_country_terms_user ON country_terms_accepted(user_id, country_code);
