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

  // CSP: pages with inline CSS/JS need unsafe-inline (admin, landing, auth)
  const isAdmin = req.path.startsWith("/admin");
  const isPublicPage = req.path === "/" || req.path.startsWith("/auth") || req.path.startsWith("/docs");
  if (isAdmin) {
    // Admin pages need CDN access for Chart.js and Swagger UI
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data:; connect-src 'self'"
    );
  } else if (isPublicPage) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    );
  } else {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
  }

  next();
}
