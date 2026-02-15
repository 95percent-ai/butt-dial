/**
 * Security headers middleware.
 * Sets X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, HSTS.
 * Admin paths get relaxed CSP (needs unsafe-inline for setup page).
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Common headers
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // HSTS in production only
  if (config.nodeEnv === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // CSP: admin paths need unsafe-inline for setup page's inline CSS/JS
  const isAdmin = req.path.startsWith("/admin");
  if (isAdmin) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    );
  } else {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
  }

  next();
}
