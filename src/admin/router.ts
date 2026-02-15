import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { spawn } from "node:child_process";
import { getProviderStatus, saveCredentials } from "./env-writer.js";
import { testTwilioCredentials, testElevenLabsCredentials, testResendCredentials } from "./credential-testers.js";
import { renderSetupPage } from "./setup-page.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export const adminRouter = Router();

/**
 * Admin auth middleware for POST routes.
 * Checks Authorization: Bearer <masterToken>.
 * No master token configured = allow (graceful degradation).
 */
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // No master token = allow (dev mode / not configured yet)
  if (!config.masterSecurityToken) {
    next();
    return;
  }

  // Demo mode = allow
  if (config.demoMode) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("admin_auth_failed", { reason: "missing_header", path: req.path });
    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <masterToken>" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== config.masterSecurityToken) {
    logger.warn("admin_auth_failed", { reason: "invalid_token", path: req.path });
    res.status(401).json({ error: "Invalid admin token" });
    return;
  }

  next();
}

/** Serve the setup page (GET — no auth required) */
adminRouter.get("/admin/setup", (_req: Request, res: Response) => {
  res.type("html").send(renderSetupPage());
});

/** Return provider config status (masked values) */
adminRouter.get("/admin/api/status", (_req: Request, res: Response) => {
  const status = getProviderStatus();
  res.json(status);
});

/** Test Twilio credentials */
adminRouter.post("/admin/api/test/twilio", adminAuth, async (req: Request, res: Response) => {
  const { accountSid, authToken } = req.body ?? {};

  if (!accountSid || !authToken) {
    res.status(400).json({ success: false, message: "accountSid and authToken are required" });
    return;
  }

  const result = await testTwilioCredentials(String(accountSid), String(authToken));
  res.json(result);
});

/** Test ElevenLabs credentials */
adminRouter.post("/admin/api/test/elevenlabs", adminAuth, async (req: Request, res: Response) => {
  const { apiKey } = req.body ?? {};

  if (!apiKey) {
    res.status(400).json({ success: false, message: "apiKey is required" });
    return;
  }

  const result = await testElevenLabsCredentials(String(apiKey));
  res.json(result);
});

/** Test Resend credentials */
adminRouter.post("/admin/api/test/resend", adminAuth, async (req: Request, res: Response) => {
  const { apiKey } = req.body ?? {};

  if (!apiKey) {
    res.status(400).json({ success: false, message: "apiKey is required" });
    return;
  }

  const result = await testResendCredentials(String(apiKey));
  res.json(result);
});

/** Save credentials to .env */
adminRouter.post("/admin/api/save", adminAuth, (req: Request, res: Response) => {
  const { credentials } = req.body ?? {};

  if (!credentials || typeof credentials !== "object" || Object.keys(credentials).length === 0) {
    res.status(400).json({ success: false, message: "No credentials provided" });
    return;
  }

  // Only allow known credential keys
  const allowed = new Set([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "ELEVENLABS_API_KEY",
    "RESEND_API_KEY",
    "EMAIL_DEFAULT_DOMAIN",
    "WEBHOOK_BASE_URL",
    "MASTER_SECURITY_TOKEN",
    "ANTHROPIC_API_KEY",
    "VOICE_DEFAULT_GREETING",
    "VOICE_DEFAULT_VOICE",
    "VOICE_DEFAULT_LANGUAGE",
    "IDENTITY_MODE",
    "ISOLATION_MODE",
  ]);

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (allowed.has(key) && typeof value === "string" && value.length > 0) {
      filtered[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    res.status(400).json({ success: false, message: "No valid credentials provided" });
    return;
  }

  try {
    saveCredentials(filtered);
    res.json({ success: true, message: `Saved ${Object.keys(filtered).length} credential(s)` });
  } catch (err) {
    res.status(500).json({ success: false, message: `Failed to save: ${String(err)}` });
  }
});

/** Deploy — restart the server so new .env values take effect */
adminRouter.post("/admin/api/deploy", adminAuth, (_req: Request, res: Response) => {
  res.json({ success: true, message: "Restarting server..." });

  setTimeout(() => {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    child.unref();
    process.exit(0);
  }, 500);
});
