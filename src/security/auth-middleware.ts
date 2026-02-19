/**
 * Auth middleware for POST /messages.
 * Validates bearer tokens and sets req.auth for the MCP SDK.
 * The SDK reads req.auth and passes it as extra.authInfo to tool callbacks.
 *
 * 3-tier auth: master token → org token → agent token
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { verifyToken } from "./token-manager.js";
import { verifyOrgToken } from "../lib/org-manager.js";
import { logger } from "../lib/logger.js";
import { sendAlert } from "../observability/alert-manager.js";
import { recordFailedAuth } from "./anomaly-detector.js";

/**
 * Brute-force lockout tracking.
 * After 10 failures from an IP → 15-minute lockout (429 response).
 */
interface LockoutEntry {
  failures: number;
  lockedUntil: number | null;
}

const bruteForceTracker = new Map<string, LockoutEntry>();

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Cleanup expired entries every 60 seconds
const lockoutCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of bruteForceTracker) {
    if (entry.lockedUntil && now > entry.lockedUntil) {
      bruteForceTracker.delete(ip);
    }
  }
}, 60_000);
if (lockoutCleanup.unref) lockoutCleanup.unref();

function recordBruteForceFailure(ip: string): boolean {
  let entry = bruteForceTracker.get(ip);
  if (!entry) {
    entry = { failures: 0, lockedUntil: null };
    bruteForceTracker.set(ip, entry);
  }

  entry.failures++;

  if (entry.failures >= LOCKOUT_THRESHOLD) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    sendAlert({
      severity: "HIGH",
      title: "Brute-force lockout",
      message: `IP ${ip} locked out after ${entry.failures} failed auth attempts`,
      details: { ip },
    }).catch(() => {});
    return true; // locked out
  }

  return false;
}

function isLockedOut(ip: string): boolean {
  const entry = bruteForceTracker.get(ip);
  if (!entry || !entry.lockedUntil) return false;
  if (Date.now() > entry.lockedUntil) {
    bruteForceTracker.delete(ip);
    return false;
  }
  return true;
}

function resetBruteForce(ip: string): void {
  bruteForceTracker.delete(ip);
}

/** Reset all brute-force tracking (for testing). */
export function resetBruteForceTracker(): void {
  bruteForceTracker.clear();
}

// Extend Express Request to include auth (MCP SDK reads this) and cookies
declare global {
  namespace Express {
    interface Request {
      auth?: {
        token: string;
        clientId: string;
        scopes: string[];
        orgId?: string;
      };
      cookies?: Record<string, string>;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Demo mode — set dummy admin auth, skip checks
  if (config.demoMode) {
    req.auth = {
      token: "demo",
      clientId: "demo",
      scopes: ["admin", "super-admin"],
      orgId: "default",
    };
    next();
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";

  // Check brute-force lockout
  if (isLockedOut(ip)) {
    res.status(429).json({ error: "Too many failed attempts. Try again later." });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No master token configured — warn but allow (graceful degradation for dev)
    if (!config.masterSecurityToken) {
      req.auth = {
        token: "unconfigured",
        clientId: "admin",
        scopes: ["admin", "super-admin"],
        orgId: "default",
      };
      next();
      return;
    }

    recordFailedAuth(ip);
    recordBruteForceFailure(ip);
    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <token>" });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  // 1. Check master token first → super-admin
  if (config.masterSecurityToken && token === config.masterSecurityToken) {
    resetBruteForce(ip);
    req.auth = {
      token,
      clientId: "super-admin",
      scopes: ["admin", "super-admin"],
      orgId: undefined, // super-admin sees all orgs
    };
    next();
    return;
  }

  const db = getProvider("database");

  // 2. Check org token → org-admin
  try {
    const orgVerified = verifyOrgToken(db, token);
    if (orgVerified) {
      resetBruteForce(ip);
      req.auth = {
        token,
        clientId: orgVerified.orgId,
        scopes: ["org-admin"],
        orgId: orgVerified.orgId,
      };
      next();
      return;
    }
  } catch {
    // org_tokens table might not exist yet during first migration
  }

  // 3. Check agent token
  const verified = verifyToken(db, token);

  if (!verified) {
    logger.warn("auth_failed", { reason: "invalid_token" });
    recordFailedAuth(ip);
    recordBruteForceFailure(ip);
    res.status(401).json({ error: "Invalid or revoked token" });
    return;
  }

  resetBruteForce(ip);
  req.auth = {
    token,
    clientId: verified.agentId,
    scopes: ["agent"],
    orgId: verified.orgId || "default",
  };

  next();
}
