/**
 * HTTP-level rate limiter middleware.
 * In-memory per-IP rate limiting with configurable limits.
 * Skipped in demo mode.
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { metrics } from "../observability/metrics.js";

interface RateEntry {
  count: number;
  windowStart: number;
}

const ipBuckets = new Map<string, RateEntry>();
const globalBucket: RateEntry = { count: 0, windowStart: Date.now() };

const WINDOW_MS = 60_000; // 1 minute

// Cleanup expired entries every 60 seconds
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipBuckets) {
    if (now - entry.windowStart > WINDOW_MS) {
      ipBuckets.delete(ip);
    }
  }
  if (now - globalBucket.windowStart > WINDOW_MS) {
    globalBucket.count = 0;
    globalBucket.windowStart = now;
  }
}, 60_000);

// Don't block process exit
if (cleanupInterval.unref) cleanupInterval.unref();

export function httpRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (config.demoMode) {
    next();
    return;
  }

  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  // Global rate limit
  if (now - globalBucket.windowStart > WINDOW_MS) {
    globalBucket.count = 0;
    globalBucket.windowStart = now;
  }
  globalBucket.count++;

  if (globalBucket.count > config.httpRateLimitGlobal) {
    metrics.increment("mcp_http_rate_limit_hits_total", { scope: "global" });
    res.status(429).json({ error: "Too many requests (global limit)" });
    return;
  }

  // Per-IP rate limit
  let entry = ipBuckets.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    ipBuckets.set(ip, entry);
  }
  entry.count++;

  if (entry.count > config.httpRateLimitPerIp) {
    metrics.increment("mcp_http_rate_limit_hits_total", { scope: "per_ip" });
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  next();
}

/** Reset all rate limit state (for testing). */
export function resetHttpRateLimiter(): void {
  ipBuckets.clear();
  globalBucket.count = 0;
  globalBucket.windowStart = Date.now();
}
