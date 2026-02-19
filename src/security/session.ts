/**
 * Session cookie module — encrypt/decrypt/set/clear session cookies.
 * Uses AES-256-CBC (same pattern as auth-api.ts token encryption).
 *
 * Cookie: __bd_session, HttpOnly, Secure in prod, SameSite=Lax, Path=/admin, 7-day expiry.
 * Payload: { orgId, userId, orgToken, expiresAt }
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { Response, Request } from "express";
import { config } from "../lib/config.js";

const COOKIE_NAME = "__bd_session";
const COOKIE_MAX_AGE_DAYS = 7;
const COOKIE_MAX_AGE_MS = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  orgId: string;
  userId: string;
  orgToken: string;
  expiresAt: number; // epoch ms
}

function getEncryptionKey(): Buffer {
  const key = config.credentialsEncryptionKey || config.masterSecurityToken || "default-dev-key-32chars-padding!";
  return Buffer.from(key.padEnd(32, "0").slice(0, 32));
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(ciphertext: string): string | null {
  try {
    const key = getEncryptionKey();
    const parts = ciphertext.split(":");
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], "hex");
    if (iv.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/** Set encrypted session cookie on the response. */
export function setSessionCookie(res: Response, payload: SessionPayload): void {
  const json = JSON.stringify(payload);
  const encrypted = encrypt(json);

  const isSecure = config.nodeEnv === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(encrypted)}`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE_DAYS * 24 * 60 * 60}`,
  ];
  if (isSecure) parts.push("Secure");

  res.setHeader("Set-Cookie", parts.join("; "));
}

/** Clear session cookie. */
export function clearSessionCookie(res: Response): void {
  const parts = [
    `${COOKIE_NAME}=`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=0`,
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}

/** Read and decrypt session cookie from request. Returns null if missing/invalid/expired. */
export function getSessionFromCookie(req: Request): SessionPayload | null {
  const cookies = req.cookies;
  if (!cookies) return null;

  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;

  const decrypted = decrypt(raw);
  if (!decrypted) return null;

  try {
    const payload = JSON.parse(decrypted) as SessionPayload;
    // Check required fields
    if (!payload.orgId || !payload.userId || !payload.orgToken || !payload.expiresAt) {
      return null;
    }
    // Check expiry
    if (Date.now() > payload.expiresAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, COOKIE_MAX_AGE_MS };
