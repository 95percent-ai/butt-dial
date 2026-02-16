/**
 * Org-scope helper — reusable functions for org-scoped database queries.
 * Ensures data isolation between organizations.
 */

import type { IDBProvider } from "../providers/interfaces.js";
import { AuthError, type AuthInfo, isSuperAdmin, getOrgId } from "./auth-guard.js";

/** Look up the org_id for an agent. Returns 'default' if not found. */
export function getOrgIdForAgent(db: IDBProvider, agentId: string): string {
  const rows = db.query<{ org_id: string }>(
    "SELECT org_id FROM agent_channels WHERE agent_id = ?",
    [agentId],
  );
  return rows.length > 0 ? (rows[0].org_id || "default") : "default";
}

/** Verify an agent belongs to the specified org. Throws 403 if mismatch. */
export function verifyAgentBelongsToOrg(db: IDBProvider, agentId: string, orgId: string): void {
  const agentOrgId = getOrgIdForAgent(db, agentId);
  if (agentOrgId !== orgId) {
    throw new AuthError(`Agent "${agentId}" does not belong to your organization`);
  }
}

/**
 * Build an org filter for SQL queries.
 * For super-admin: returns empty filter (sees all).
 * For org-admin/agent: returns " AND org_id = ?" with the param.
 */
export function orgFilter(authInfo?: AuthInfo): { clause: string; params: unknown[] } {
  if (isSuperAdmin(authInfo)) {
    return { clause: "", params: [] };
  }
  const orgId = getOrgId(authInfo);
  return { clause: " AND org_id = ?", params: [orgId] };
}

/**
 * Build a WHERE org filter (for queries without a preceding WHERE).
 * For super-admin: returns empty.
 * For org-admin/agent: returns " WHERE org_id = ?" with param.
 */
export function orgWhere(authInfo?: AuthInfo): { clause: string; params: unknown[] } {
  if (isSuperAdmin(authInfo)) {
    return { clause: "", params: [] };
  }
  const orgId = getOrgId(authInfo);
  return { clause: " WHERE org_id = ?", params: [orgId] };
}

/**
 * Require that authInfo includes an orgId and the agent belongs to it.
 * Skips check for super-admin.
 */
export function requireAgentInOrg(db: IDBProvider, agentId: string, authInfo?: AuthInfo): void {
  if (isSuperAdmin(authInfo)) return;
  const orgId = getOrgId(authInfo);
  verifyAgentBelongsToOrg(db, agentId, orgId);
}
