-- User accounts for self-service registration
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  org_id TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  pending_token_enc TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT,
  locked_until TEXT,
  failed_login_attempts INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);
