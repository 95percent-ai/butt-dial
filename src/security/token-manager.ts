/**
 * Token manager — generate, hash, store, verify, and revoke bearer tokens.
 * Tokens are stored as SHA-256 hashes; plaintext is returned once at creation.
 */

import { randomBytes, createHash, randomUUID } from "crypto";
import type { IDBProvider } from "../providers/interfaces.js";

interface TokenRow {
  id: string;
  agent_id: string;
  org_id: string | null;
  revoked_at: string | null;
}

export interface GeneratedToken {
  plainToken: string;
  tokenHash: string;
}

export interface VerifiedToken {
  agentId: string;
  tokenId: string;
  orgId?: string;
}

/** Generate a new random token and its SHA-256 hash. */
export function generateToken(): GeneratedToken {
  const plainToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(plainToken);
  return { plainToken, tokenHash };
}

/** SHA-256 hash a plaintext token. */
export function hashToken(plainToken: string): string {
  return createHash("sha256").update(plainToken).digest("hex");
}

/** Store a token hash in the database for an agent. */
export function storeToken(
  db: IDBProvider,
  agentId: string,
  tokenHash: string,
  label?: string,
  orgId?: string,
): string {
  const id = randomUUID();
  db.run(
    `INSERT INTO agent_tokens (id, agent_id, token_hash, label, org_id)
     VALUES (?, ?, ?, ?, ?)`,
    [id, agentId, tokenHash, label || null, orgId || "default"]
  );
  return id;
}

/** Verify a plaintext token. Returns agent info if valid, null if not. */
export function verifyToken(
  db: IDBProvider,
  plainToken: string
): VerifiedToken | null {
  const hash = hashToken(plainToken);
  const rows = db.query<TokenRow>(
    "SELECT id, agent_id, org_id, revoked_at FROM agent_tokens WHERE token_hash = ?",
    [hash]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  if (row.revoked_at !== null) return null;

  // Update last_used_at
  db.run(
    "UPDATE agent_tokens SET last_used_at = datetime('now') WHERE id = ?",
    [row.id]
  );

  return { agentId: row.agent_id, tokenId: row.id, orgId: row.org_id || "default" };
}

/** Revoke all tokens for an agent. */
export function revokeAgentTokens(db: IDBProvider, agentId: string): number {
  const result = db.run(
    "UPDATE agent_tokens SET revoked_at = datetime('now') WHERE agent_id = ? AND revoked_at IS NULL",
    [agentId]
  );
  return result.changes;
}
