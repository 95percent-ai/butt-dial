/**
 * OTP (One-Time Password) service — generate, verify, and cleanup verification codes.
 * Agents can send a 6-digit code to a contact, then verify it before sharing sensitive info.
 */

import { randomUUID, createHash, randomInt } from "crypto";
import { logger } from "../lib/logger.js";

interface DBProvider {
  query: <T>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => { changes: number };
}

interface OtpRow {
  id: string;
  code: string;
  expires_at: string;
  verified: number;
  attempts: number;
}

interface OtpCountRow {
  cnt: number;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Generate a 6-digit OTP, store its hash in the DB, return the plain code.
 * Rate limited: max 5 OTPs per contact per hour.
 */
export function generateOtp(
  db: DBProvider,
  agentId: string,
  contactAddress: string,
  channel: string,
): { code: string; codeId: string; expiresIn: string } {
  // Rate limit: max 5 OTPs per contact per hour
  const recentCodes = db.query<OtpCountRow>(
    `SELECT COUNT(*) as cnt FROM otp_codes
     WHERE agent_id = ? AND contact_address = ? AND created_at >= datetime('now', '-1 hour')`,
    [agentId, contactAddress]
  );

  if (recentCodes[0]?.cnt >= 5) {
    throw new Error("Rate limit exceeded: maximum 5 verification codes per contact per hour");
  }

  const code = String(randomInt(100000, 999999));
  const codeId = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.run(
    `INSERT INTO otp_codes (id, agent_id, contact_address, channel, code, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [codeId, agentId, contactAddress, channel, hashCode(code), expiresAt]
  );

  logger.info("otp_generated", { agentId, contactAddress: contactAddress.slice(0, 4) + "***", channel });

  return { code, codeId, expiresIn: "5 minutes" };
}

/**
 * Verify an OTP code. Checks hash match, expiry, and max 3 attempts.
 */
export function verifyOtp(
  db: DBProvider,
  agentId: string,
  contactAddress: string,
  code: string,
): { valid: boolean; reason?: string } {
  // Find the latest unexpired, unverified OTP for this agent+contact
  const rows = db.query<OtpRow>(
    `SELECT id, code, expires_at, verified, attempts FROM otp_codes
     WHERE agent_id = ? AND contact_address = ? AND verified = 0
     ORDER BY created_at DESC LIMIT 1`,
    [agentId, contactAddress]
  );

  if (rows.length === 0) {
    return { valid: false, reason: "No pending verification code found. Request a new one." };
  }

  const otp = rows[0];

  // Check expiry
  if (new Date(otp.expires_at) < new Date()) {
    return { valid: false, reason: "Code expired. Request a new one." };
  }

  // Check max attempts
  if (otp.attempts >= 3) {
    return { valid: false, reason: "Too many failed attempts. Request a new code." };
  }

  // Verify hash
  if (hashCode(code) === otp.code) {
    db.run("UPDATE otp_codes SET verified = 1 WHERE id = ?", [otp.id]);
    logger.info("otp_verified", { agentId, contactAddress: contactAddress.slice(0, 4) + "***" });
    return { valid: true };
  }

  // Wrong code — increment attempts
  const newAttempts = otp.attempts + 1;
  db.run("UPDATE otp_codes SET attempts = ? WHERE id = ?", [newAttempts, otp.id]);

  if (newAttempts >= 3) {
    logger.warn("otp_max_attempts", { agentId, contactAddress: contactAddress.slice(0, 4) + "***" });
    return { valid: false, reason: "Too many failed attempts. Code invalidated — request a new one." };
  }

  return { valid: false, reason: `Invalid code. ${3 - newAttempts} attempt(s) remaining.` };
}

/**
 * Delete expired OTP codes (older than 10 minutes past expiry).
 */
export function cleanupExpiredOtps(db: DBProvider): number {
  const result = db.run(
    "DELETE FROM otp_codes WHERE expires_at < datetime('now', '-10 minutes')"
  );
  if (result.changes > 0) {
    logger.info("otp_cleanup", { deleted: result.changes });
  }
  return result.changes;
}
