/**
 * Dry test for OTP verification feature.
 * Tests OTP generation, verification, expiry, rate limiting, and cleanup.
 * Prerequisites: None (uses in-memory database)
 * Usage: npx tsx tests/otp.test.ts
 */

// Set env before any imports so config parses without errors
process.env.DEMO_MODE = "true";

import Database from "better-sqlite3";
import { generateOtp, verifyOtp, cleanupExpiredOtps } from "../src/security/otp.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// In-memory database setup
// ---------------------------------------------------------------------------

const sqliteDb = new Database(":memory:");

sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    contact_address TEXT NOT NULL,
    channel TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_otp_agent_contact ON otp_codes(agent_id, contact_address);
`);

const db = {
  query: <T>(sql: string, params?: unknown[]): T[] => {
    const stmt = sqliteDb.prepare(sql);
    return (params ? stmt.all(...params) : stmt.all()) as T[];
  },
  run: (sql: string, params?: unknown[]) => {
    const stmt = sqliteDb.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  },
  exec: (sql: string) => sqliteDb.exec(sql),
  close: () => sqliteDb.close(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const AGENT = "test-otp-agent";
const CONTACT = "+1555000111";
const CHANNEL = "sms";

async function testGeneration() {
  console.log("\n--- OTP Generation ---");

  const result = generateOtp(db, AGENT, CONTACT, CHANNEL);

  // 1. Returns a 6-digit code
  assert(/^\d{6}$/.test(result.code), "generateOtp returns a 6-digit code");

  // 2. Returns a codeId (UUID format)
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.codeId),
    "generateOtp returns a codeId (UUID)"
  );

  // 3. Returns expiresIn = "5 minutes"
  assert(result.expiresIn === "5 minutes", 'generateOtp returns expiresIn = "5 minutes"');

  // 4. Code is stored in database
  const rows = db.query<{ id: string; code: string }>(
    "SELECT id, code FROM otp_codes WHERE id = ?",
    [result.codeId]
  );
  assert(rows.length === 1, "OTP code is stored in database");

  // 5. Stored code is hashed (not the plain text code)
  assert(rows[0].code !== result.code, "stored code is hashed (not plain text)");
}

async function testVerificationSuccess() {
  console.log("\n--- OTP Verification — Success ---");

  // Clean slate
  db.run("DELETE FROM otp_codes WHERE agent_id = ?", [AGENT]);

  const { code, codeId } = generateOtp(db, AGENT, CONTACT, CHANNEL);

  // 6. Correct code returns valid: true
  const result = verifyOtp(db, AGENT, CONTACT, code);
  assert(result.valid === true, "verifyOtp with correct code returns { valid: true }");

  // 7. After verification, row has verified = 1
  const rows = db.query<{ verified: number }>(
    "SELECT verified FROM otp_codes WHERE id = ?",
    [codeId]
  );
  assert(rows[0].verified === 1, "after verification, otp row has verified = 1");
}

async function testVerificationWrongCode() {
  console.log("\n--- OTP Verification — Wrong Code ---");

  db.run("DELETE FROM otp_codes WHERE agent_id = ?", [AGENT]);
  generateOtp(db, AGENT, CONTACT, CHANNEL);

  // 8. Wrong code returns valid: false
  const result = verifyOtp(db, AGENT, CONTACT, "000000");
  assert(result.valid === false, "verifyOtp with wrong code returns { valid: false }");

  // 9. Reason mentions "Invalid code"
  assert(
    result.reason !== undefined && result.reason.includes("Invalid code"),
    'reason mentions "Invalid code"'
  );

  // 10. Reason mentions remaining attempts
  assert(
    result.reason !== undefined && /attempt/.test(result.reason),
    "reason mentions remaining attempts"
  );
}

async function testMaxAttempts() {
  console.log("\n--- OTP Verification — Max Attempts ---");

  db.run("DELETE FROM otp_codes WHERE agent_id = ?", [AGENT]);
  generateOtp(db, AGENT, CONTACT, CHANNEL);

  // Exhaust 3 wrong attempts
  verifyOtp(db, AGENT, CONTACT, "000001");
  verifyOtp(db, AGENT, CONTACT, "000002");
  const third = verifyOtp(db, AGENT, CONTACT, "000003");

  // 11. After 3 wrong attempts, returns valid: false
  assert(third.valid === false, "after 3 wrong attempts, verifyOtp returns { valid: false }");

  // 12. Reason mentions "Too many failed attempts"
  assert(
    third.reason !== undefined && third.reason.includes("Too many failed attempts"),
    'reason mentions "Too many failed attempts"'
  );

  // 13. Further attempts also fail (code is invalidated)
  const fourth = verifyOtp(db, AGENT, CONTACT, "000004");
  assert(fourth.valid === false, "further attempts also fail after max attempts exceeded");
}

async function testExpired() {
  console.log("\n--- OTP Verification — Expired ---");

  db.run("DELETE FROM otp_codes WHERE agent_id = ?", [AGENT]);
  const { codeId, code } = generateOtp(db, AGENT, CONTACT, CHANNEL);

  // 14. Manually set expires_at to the past
  db.run("UPDATE otp_codes SET expires_at = datetime('now', '-1 hour') WHERE id = ?", [codeId]);

  // 15. verifyOtp returns expired reason
  const result = verifyOtp(db, AGENT, CONTACT, code);
  assert(result.valid === false, "verifyOtp returns { valid: false } for expired code");
  assert(
    result.reason !== undefined && result.reason.includes("expired"),
    'reason mentions "expired"'
  );
}

async function testNoPendingCode() {
  console.log("\n--- OTP Verification — No Pending Code ---");

  // 16. verifyOtp for unknown contact returns valid: false
  const result = verifyOtp(db, AGENT, "+1999999999", "123456");
  assert(result.valid === false, "verifyOtp for unknown contact returns { valid: false }");

  // 17. Reason mentions "No pending verification code"
  assert(
    result.reason !== undefined && result.reason.includes("No pending verification code"),
    'reason mentions "No pending verification code"'
  );
}

async function testRateLimiting() {
  console.log("\n--- Rate Limiting ---");

  const rateLimitContact = "+1555999888";
  db.run("DELETE FROM otp_codes WHERE contact_address = ?", [rateLimitContact]);

  // 18. Can generate up to 5 OTPs per contact per hour
  for (let i = 0; i < 5; i++) {
    generateOtp(db, AGENT, rateLimitContact, CHANNEL);
  }
  assert(true, "can generate up to 5 OTPs per contact per hour");

  // 19. 6th attempt throws rate limit error
  let rateLimitHit = false;
  try {
    generateOtp(db, AGENT, rateLimitContact, CHANNEL);
  } catch (err: unknown) {
    rateLimitHit = err instanceof Error && err.message.includes("Rate limit exceeded");
  }
  assert(rateLimitHit, "6th OTP generation throws rate limit error");
}

async function testCleanup() {
  console.log("\n--- Cleanup ---");

  const cleanupContact = "+1555777666";
  db.run("DELETE FROM otp_codes WHERE contact_address = ?", [cleanupContact]);

  // Create a code and set it expired (>10 minutes past expiry)
  const { codeId: expiredId } = generateOtp(db, AGENT, cleanupContact, CHANNEL);
  db.run("UPDATE otp_codes SET expires_at = datetime('now', '-20 minutes') WHERE id = ?", [expiredId]);

  // Create a fresh, non-expired code
  const { codeId: freshId } = generateOtp(db, AGENT, cleanupContact, CHANNEL);

  // 20. cleanupExpiredOtps removes old codes
  const deleted = cleanupExpiredOtps(db);
  assert(deleted >= 1, "cleanupExpiredOtps removes expired codes");

  // 21. Non-expired codes survive cleanup
  const surviving = db.query<{ id: string }>(
    "SELECT id FROM otp_codes WHERE id = ?",
    [freshId]
  );
  assert(surviving.length === 1, "non-expired codes survive cleanup");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== OTP Verification dry test ===");

  await testGeneration();
  await testVerificationSuccess();
  await testVerificationWrongCode();
  await testMaxAttempts();
  await testExpired();
  await testNoPendingCode();
  await testRateLimiting();
  await testCleanup();

  // Teardown
  sqliteDb.close();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
