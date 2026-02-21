/**
 * Auth guard — helpers called inside tool callbacks to enforce access control.
 * Uses extra.authInfo populated by the auth middleware.
 *
 * 3-tier auth: super-admin (orchestrator token) > org-admin (org token) > agent (agent token)
 */

import { config } from "../lib/config.js";

export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  orgId?: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Require that the caller is the specified agent (or admin/demo).
 * Agent tokens can only access their own agent. Admin tokens can access any.
 * Org-admin tokens can only access agents in their org.
 */
export function requireAgent(agentId: string, authInfo?: AuthInfo): void {
  // Demo mode — skip all auth
  if (config.demoMode) return;

  if (!authInfo) {
    throw new AuthError("Authentication required");
  }

  // Super-admin can access any agent
  if (authInfo.scopes.includes("super-admin") || authInfo.scopes.includes("admin")) return;

  // Org-admin can access agents in their org (org boundary checked by caller via org-scope)
  if (authInfo.scopes.includes("org-admin")) return;

  // Agent token must match
  if (authInfo.clientId !== agentId) {
    throw new AuthError(`Token for agent "${authInfo.clientId}" cannot access agent "${agentId}"`);
  }
}

/**
 * Require admin access (orchestrator token, org-admin, or demo mode).
 * Agent tokens are not allowed.
 */
export function requireAdmin(authInfo?: AuthInfo): void {
  // Demo mode — skip all auth
  if (config.demoMode) return;

  if (!authInfo) {
    throw new AuthError("Authentication required");
  }

  if (
    authInfo.scopes.includes("admin") ||
    authInfo.scopes.includes("super-admin") ||
    authInfo.scopes.includes("org-admin")
  ) {
    return;
  }

  throw new AuthError("Admin access required. Agent tokens cannot perform this action.");
}

/**
 * Require org-admin or super-admin access.
 */
export function requireOrgAdmin(authInfo?: AuthInfo): void {
  if (config.demoMode) return;

  if (!authInfo) {
    throw new AuthError("Authentication required");
  }

  if (
    authInfo.scopes.includes("admin") ||
    authInfo.scopes.includes("super-admin") ||
    authInfo.scopes.includes("org-admin")
  ) {
    return;
  }

  throw new AuthError("Organization admin access required.");
}

/**
 * Require super-admin access (orchestrator token only).
 */
export function requireSuperAdmin(authInfo?: AuthInfo): void {
  if (config.demoMode) return;

  if (!authInfo) {
    throw new AuthError("Authentication required");
  }

  if (authInfo.scopes.includes("super-admin") || authInfo.scopes.includes("admin")) {
    return;
  }

  throw new AuthError("Super-admin access required. Only the orchestrator token can perform this action.");
}

/** Extract orgId from auth context. Returns 'default' for super-admin or demo. */
export function getOrgId(authInfo?: AuthInfo): string {
  if (config.demoMode) return "default";
  if (!authInfo) return "default";
  return authInfo.orgId || "default";
}

/** Check if caller is super-admin (can see all orgs). */
export function isSuperAdmin(authInfo?: AuthInfo): boolean {
  if (config.demoMode) return true;
  if (!authInfo) return false;
  return authInfo.scopes.includes("super-admin") || authInfo.scopes.includes("admin");
}

/**
 * Resolve agentId — use explicit value if provided, otherwise infer from agent token.
 * Returns null if neither is available (caller should return an error).
 */
export function resolveAgentId(authInfo: AuthInfo | undefined, explicitAgentId?: string): string | null {
  if (explicitAgentId) return explicitAgentId;
  if (authInfo?.scopes?.includes("agent")) return authInfo.clientId;
  return null;
}

/** Build a standard MCP error response for auth failures. */
export function authErrorResponse(err: unknown) {
  const message = err instanceof AuthError ? err.message : "Authentication failed";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
