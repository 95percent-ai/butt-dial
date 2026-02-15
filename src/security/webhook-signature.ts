/**
 * Webhook signature verification middleware.
 * Twilio: HMAC-SHA1 signature via the telephony provider.
 * Resend: Svix webhook signature verification.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

/**
 * Nonce cache for replay prevention.
 * Stores MessageSid/CallSid → timestamp. Entries expire after 5 minutes.
 */
const nonceCache = new Map<string, number>();

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup expired nonces every 60 seconds
const nonceCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [sid, ts] of nonceCache) {
    if (now - ts > NONCE_TTL_MS) {
      nonceCache.delete(sid);
    }
  }
}, 60_000);
if (nonceCleanupInterval.unref) nonceCleanupInterval.unref();

/** Check and record a nonce (MessageSid or CallSid). Returns true if replay detected. */
function isReplay(sid: string | undefined): boolean {
  if (!sid) return false;
  if (nonceCache.has(sid)) return true;
  nonceCache.set(sid, Date.now());
  return false;
}

/** Reset nonce cache (for testing). */
export function resetNonceCache(): void {
  nonceCache.clear();
}

/**
 * Middleware to verify Twilio webhook signatures.
 * Skips verification in demo mode.
 */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (config.demoMode) {
    next();
    return;
  }

  // If no Twilio auth token is configured, skip (graceful degradation)
  if (!config.twilioAuthToken) {
    logger.warn("twilio_sig_skip", { reason: "no_auth_token_configured" });
    next();
    return;
  }

  try {
    const telephony = getProvider("telephony");

    // Reconstruct the full URL Twilio used to reach us
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    // Get raw body string from urlencoded form data
    const rawBody = Object.entries(req.body as Record<string, string>)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers[key] = value;
    }

    const valid = telephony.verifyWebhookSignature(headers, rawBody, fullUrl);

    if (!valid) {
      logger.warn("twilio_sig_invalid", { url: fullUrl });
      res.status(403).send("<Response/>");
      return;
    }

    // Replay prevention: check MessageSid or CallSid
    const sid = (req.body as Record<string, string>)?.MessageSid || (req.body as Record<string, string>)?.CallSid;
    if (isReplay(sid)) {
      logger.warn("twilio_replay_detected", { sid });
      res.status(403).send("<Response/>");
      return;
    }
  } catch (err) {
    logger.error("twilio_sig_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't block on verification errors — log and continue
  }

  next();
}

/**
 * Middleware to verify Resend/Svix webhook signatures.
 * Skips verification in demo mode or when no webhook secret is configured.
 */
export function verifyResendSignature(req: Request, res: Response, next: NextFunction): void {
  if (config.demoMode) {
    next();
    return;
  }

  const secret = config.resendWebhookSecret;
  if (!secret) {
    logger.warn("resend_sig_skip", { reason: "no_webhook_secret_configured" });
    next();
    return;
  }

  try {
    // Svix signature verification
    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.warn("resend_sig_missing_headers");
      res.status(403).json({ error: "Missing Svix signature headers" });
      return;
    }

    // Check timestamp is within 5 minutes
    const timestampSeconds = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampSeconds) > 300) {
      logger.warn("resend_sig_expired", { timestamp: svixTimestamp });
      res.status(403).json({ error: "Webhook timestamp expired" });
      return;
    }

    // Compute expected signature
    const body = JSON.stringify(req.body);
    const signedContent = `${svixId}.${svixTimestamp}.${body}`;

    // Svix secret is base64-encoded after removing "whsec_" prefix
    const secretBytes = Buffer.from(
      secret.startsWith("whsec_") ? secret.slice(6) : secret,
      "base64"
    );
    const expectedSig = createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64");

    // Svix-Signature can contain multiple signatures separated by spaces
    const signatures = svixSignature.split(" ");
    const valid = signatures.some((sig) => {
      const sigValue = sig.startsWith("v1,") ? sig.slice(3) : sig;
      const sigBuf = Buffer.from(sigValue);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length) return false;
      return timingSafeEqual(sigBuf, expBuf);
    });

    if (!valid) {
      logger.warn("resend_sig_invalid");
      res.status(403).json({ error: "Invalid webhook signature" });
      return;
    }
  } catch (err) {
    logger.error("resend_sig_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't block on verification errors — log and continue
  }

  next();
}
