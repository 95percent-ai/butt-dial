/**
 * IP allowlist/denylist middleware factory.
 * Empty allowlist = all allowed (default). Denylist always checked.
 * Skipped in demo mode.
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

function parseList(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ipFilter(scope: "admin" | "webhook") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.demoMode) {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";

    // Check denylist first (always applies)
    const denylist = parseList(config.ipDenylist);
    if (denylist.includes(ip)) {
      logger.warn("ip_denied", { ip, scope });
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check allowlist (empty = allow all)
    const allowlist = parseList(
      scope === "admin" ? config.adminIpAllowlist : config.webhookIpAllowlist
    );

    if (allowlist.length > 0 && !allowlist.includes(ip)) {
      logger.warn("ip_not_in_allowlist", { ip, scope });
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
