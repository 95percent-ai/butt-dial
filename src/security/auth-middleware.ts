/**
 * Auth middleware for POST /messages.
 * Validates bearer tokens and sets req.auth for the MCP SDK.
 * The SDK reads req.auth and passes it as extra.authInfo to tool callbacks.
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { verifyToken } from "./token-manager.js";
import { logger } from "../lib/logger.js";

// Extend Express Request to include auth (MCP SDK reads this)
declare global {
  namespace Express {
    interface Request {
      auth?: {
        token: string;
        clientId: string;
        scopes: string[];
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Demo mode — set dummy admin auth, skip checks
  if (config.demoMode) {
    req.auth = {
      token: "demo",
      clientId: "demo",
      scopes: ["admin"],
    };
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No master token configured — warn but allow (graceful degradation for dev)
    if (!config.masterSecurityToken) {
      req.auth = {
        token: "unconfigured",
        clientId: "admin",
        scopes: ["admin"],
      };
      next();
      return;
    }

    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <token>" });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  // Check master token first
  if (config.masterSecurityToken && token === config.masterSecurityToken) {
    req.auth = {
      token,
      clientId: "admin",
      scopes: ["admin"],
    };
    next();
    return;
  }

  // Check agent token
  const db = getProvider("database");
  const verified = verifyToken(db, token);

  if (!verified) {
    logger.warn("auth_failed", { reason: "invalid_token" });
    res.status(401).json({ error: "Invalid or revoked token" });
    return;
  }

  req.auth = {
    token,
    clientId: verified.agentId,
    scopes: ["agent"],
  };

  next();
}
