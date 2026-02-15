/**
 * Auth guard — helpers called inside tool callbacks to enforce access control.
 * Uses extra.authInfo populated by the auth middleware.
 */

import { config } from "../lib/config.js";

export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Require that the caller is the specified agent (or master/demo).
 * Agent tokens can only access their own agent. Master token can access any.
 */
export function requireAgent(agentId: string, authInfo?: AuthInfo): void {
  // Demo mode — skip all auth
  if (config.demoMode) return;

  if (!authInfo) {
    throw new AuthError("Authentication required");
  }

  // Master token or demo client can access any agent
  if (authInfo.scopes.includes("admin")) return;

  // Agent token must match
  if (authInfo.clientId !== agentId) {
    throw new AuthError(`Token for agent "${authInfo.clientId}" cannot access agent "${agentId}"`);
  }
}

/**
 * Require admin access (master token or demo mode only).
 * Agent tokens are not allowed.
 */
export function requireAdmin(authInfo?: AuthInfo): void {
  // Demo mode — skip all auth
  if (config.demoMode) return;

  if (!authInfo) {
    throw new AuthError("Authentication required");
  }

  if (!authInfo.scopes.includes("admin")) {
    throw new AuthError("Admin access required. Agent tokens cannot perform this action.");
  }
}

/** Build a standard MCP error response for auth failures. */
export function authErrorResponse(err: unknown) {
  const message = err instanceof AuthError ? err.message : "Authentication failed";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
