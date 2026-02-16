/**
 * Password hashing and verification — PBKDF2-SHA512, zero dependencies.
 * Uses Node built-in crypto only.
 */

import { pbkdf2Sync, randomBytes } from "crypto";

const ITERATIONS = 100_000;
const KEY_LENGTH = 64; // bytes
const SALT_LENGTH = 32; // bytes
const DIGEST = "sha512";

/** Hash a plaintext password. Returns { hash, salt } as hex strings. */
export function hashPassword(plain: string): { hash: string; salt: string } {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = pbkdf2Sync(plain, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { hash, salt };
}

/** Verify a plaintext password against a stored hash and salt. */
export function verifyPassword(plain: string, hash: string, salt: string): boolean {
  const derived = pbkdf2Sync(plain, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  // Constant-time comparison via length check + byte compare
  if (derived.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}
