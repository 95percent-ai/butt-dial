/**
 * CORS middleware.
 * Allowed origins from config, falls back to webhookBaseUrl.
 * Handles OPTIONS preflight with 204.
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";

function getAllowedOrigins(): string[] {
  if (config.corsAllowedOrigins) {
    return config.corsAllowedOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // Fall back to webhookBaseUrl
  return config.webhookBaseUrl ? [config.webhookBaseUrl] : [];
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();

  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin");
  }

  // Preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
