/**
 * Organization manager — CRUD operations and token management for multi-tenancy.
 * Reuses SHA-256 hashing pattern from token-manager.ts.
 */

import { randomBytes, createHash, randomUUID } from "crypto";
import type { IDBProvider } from "../providers/interfaces.js";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgTokenRow {
  id: string;
  org_id: string;
  token_hash: string;
  label: string | null;
  scopes: string;
  revoked_at: string | null;
}

export interface VerifiedOrgToken {
  orgId: string;
  tokenId: string;
  scopes: string;
}

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/** Create a new organization. Returns the org record and a raw security token. */
export function createOrganization(
  db: IDBProvider,
  name: string,
  slug: string,
  settings?: Record<string, unknown>,
): { org: Organization; rawToken: string } {
  const id = randomUUID();
  const settingsJson = settings ? JSON.stringify(settings) : null;

  db.run(
    `INSERT INTO organizations (id, name, slug, settings) VALUES (?, ?, ?, ?)`,
    [id, name, slug, settingsJson],
  );

  // Generate org security token
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const tokenId = randomUUID();

  db.run(
    `INSERT INTO org_tokens (id, org_id, token_hash, label, scopes) VALUES (?, ?, ?, ?, 'org-admin')`,
    [tokenId, id, tokenHash, `org-${slug}`],
  );

  // Create a default agent pool for this org
  try {
    db.run(
      `INSERT OR IGNORE INTO agent_pool (id, max_agents, active_agents, org_id) VALUES (?, 5, 0, ?)`,
      [`pool-${id}`, id],
    );
  } catch {
    // agent_pool table might not have org_id yet on first run
  }

  const org = getOrganization(db, id)!;
  return { org, rawToken };
}

/** Get an organization by ID. */
export function getOrganization(db: IDBProvider, orgId: string): Organization | null {
  const rows = db.query<Organization>(
    "SELECT id, name, slug, settings, created_at, updated_at FROM organizations WHERE id = ?",
    [orgId],
  );
  return rows.length > 0 ? rows[0] : null;
}

/** List all organizations. */
export function listOrganizations(db: IDBProvider): Organization[] {
  return db.query<Organization>(
    "SELECT id, name, slug, settings, created_at, updated_at FROM organizations ORDER BY created_at",
  );
}

/** Delete an organization and cascade-delete all its data. */
export function deleteOrganization(db: IDBProvider, orgId: string): { tablesAffected: string[]; rowsDeleted: number } {
  if (orgId === "default") {
    throw new Error("Cannot delete the default organization");
  }

  const tables = [
    "org_tokens", "agent_tokens", "usage_logs", "audit_log",
    "call_logs", "dead_letters", "spending_limits", "billing_config",
    "dnc_list", "otp_codes", "erasure_requests", "provider_credentials",
    "agent_channels", "agent_pool", "whatsapp_pool",
  ];

  let totalDeleted = 0;
  const affected: string[] = [];

  for (const table of tables) {
    try {
      const col = table === "org_tokens" ? "org_id" : "org_id";
      const result = db.run(`DELETE FROM ${table} WHERE ${col} = ?`, [orgId]);
      if (result.changes > 0) {
        totalDeleted += result.changes;
        affected.push(table);
      }
    } catch {
      // Table might not exist
    }
  }

  db.run("DELETE FROM organizations WHERE id = ?", [orgId]);

  return { tablesAffected: affected, rowsDeleted: totalDeleted };
}

/** Generate a new token for an org. Returns the raw token (shown once). */
export function generateOrgToken(
  db: IDBProvider,
  orgId: string,
  label?: string,
): string {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const id = randomUUID();

  db.run(
    `INSERT INTO org_tokens (id, org_id, token_hash, label, scopes) VALUES (?, ?, ?, ?, 'org-admin')`,
    [id, orgId, tokenHash, label || null],
  );

  return rawToken;
}

/** Verify an org token. Returns org info if valid, null if not. */
export function verifyOrgToken(
  db: IDBProvider,
  plainToken: string,
): VerifiedOrgToken | null {
  const hash = hashToken(plainToken);
  const rows = db.query<OrgTokenRow>(
    "SELECT id, org_id, scopes, revoked_at FROM org_tokens WHERE token_hash = ?",
    [hash],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  if (row.revoked_at !== null) return null;

  // Update last_used_at
  db.run(
    "UPDATE org_tokens SET last_used_at = datetime('now') WHERE id = ?",
    [row.id],
  );

  return { orgId: row.org_id, tokenId: row.id, scopes: row.scopes };
}

/** Revoke all tokens for an org. */
export function revokeOrgTokens(db: IDBProvider, orgId: string): number {
  const result = db.run(
    "UPDATE org_tokens SET revoked_at = datetime('now') WHERE org_id = ? AND revoked_at IS NULL",
    [orgId],
  );
  return result.changes;
}
