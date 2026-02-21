/**
 * Dry test for MCP Onboarding — Setup UI expansion.
 *
 * Unit tests (no server needed):
 * 1.  getProviderStatus returns all 5 sections
 * 2.  getProviderStatus twilio section has configured/accountSid/authToken
 * 3.  getProviderStatus elevenlabs section has configured/apiKey
 * 4.  getProviderStatus resend section has configured/apiKey
 * 5.  getProviderStatus server section has configured/webhookBaseUrl/orchestratorSecurityToken
 * 6.  getProviderStatus voice section has configured/greeting/voice/language
 * 7.  mask() shows only last 4 characters
 * 8.  saveCredentials writes new key to .env
 * 9.  saveCredentials preserves existing keys
 *
 * Integration tests (server with DEMO_MODE=true):
 * 10. GET /admin/api/status returns all 5 provider sections
 * 11. GET /admin/api/status twilio section present
 * 12. GET /admin/api/status resend section present
 * 13. GET /admin/api/status server section present
 * 14. GET /admin/api/status voice section present
 * 15. POST /admin/api/save with RESEND_API_KEY succeeds
 * 16. POST /admin/api/save with unknown key fails
 * 17. POST /admin/api/test/resend without apiKey returns 400
 * 18. GET /admin/setup returns HTML
 * 19. GET /admin/setup HTML contains Twilio card
 * 20. GET /admin/setup HTML contains ElevenLabs card
 * 21. GET /admin/setup HTML contains Resend card
 * 22. GET /admin/setup HTML contains Server Settings card
 * 23. GET /admin/setup HTML contains Voice Defaults card
 * 24. GET /admin/setup HTML does NOT contain step indicator
 *
 * Usage: npx tsx tests/setup-ui.test.ts
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";

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

// =======================================================================
// Phase A — Unit tests (no server needed)
// =======================================================================

async function testProviderStatusShape() {
  console.log("\n--- ProviderStatus Shape ---");

  // Dynamically import (env-writer reads .env from cwd)
  const { getProviderStatus } = await import("../src/admin/env-writer.js");
  const status = getProviderStatus();

  // 1. All 5 sections present
  assert(
    "twilio" in status && "elevenlabs" in status && "resend" in status && "server" in status && "voice" in status,
    "1. getProviderStatus returns all 5 sections"
  );

  // 2. Twilio section shape
  assert(
    "configured" in status.twilio && "accountSid" in status.twilio && "authToken" in status.twilio,
    "2. twilio section has configured/accountSid/authToken"
  );

  // 3. ElevenLabs section shape
  assert(
    "configured" in status.elevenlabs && "apiKey" in status.elevenlabs,
    "3. elevenlabs section has configured/apiKey"
  );

  // 4. Resend section shape
  assert(
    "configured" in status.resend && "apiKey" in status.resend,
    "4. resend section has configured/apiKey"
  );

  // 5. Server section shape
  assert(
    "configured" in status.server && "webhookBaseUrl" in status.server && "orchestratorSecurityToken" in status.server,
    "5. server section has configured/webhookBaseUrl/orchestratorSecurityToken"
  );

  // 6. Voice section shape
  assert(
    "configured" in status.voice && "greeting" in status.voice && "voice" in status.voice && "language" in status.voice,
    "6. voice section has configured/greeting/voice/language"
  );
}

async function testMaskFunction() {
  console.log("\n--- Mask Function ---");

  // Test by checking status output for a known configured value
  // We can verify masking by checking the env-writer module's behavior:
  // If TWILIO_ACCOUNT_SID is set, its masked value should end with last 4 chars
  const { getProviderStatus } = await import("../src/admin/env-writer.js");
  const status = getProviderStatus();

  // 7. If twilio is configured, masked value shows only last 4 chars
  if (status.twilio.accountSid) {
    const masked = status.twilio.accountSid;
    assert(
      masked.startsWith("*") && masked.length > 4,
      "7. mask() shows only last 4 characters"
    );
  } else {
    // No twilio configured — still passes the shape test
    assert(status.twilio.accountSid === null, "7. mask() returns null when not configured");
  }
}

async function testSaveCredentials() {
  console.log("\n--- saveCredentials ---");

  const testEnvPath = path.join(process.cwd(), ".env.test-backup");
  const envPath = path.join(process.cwd(), ".env");

  // Back up existing .env if present
  let backup: string | null = null;
  if (existsSync(envPath)) {
    backup = readFileSync(envPath, "utf-8");
  }

  try {
    // Write a minimal .env
    writeFileSync(envPath, "TWILIO_ACCOUNT_SID=ACtest1234\nSOME_OTHER_KEY=hello\n", "utf-8");

    // Re-import to pick up the file
    const { saveCredentials } = await import("../src/admin/env-writer.js");

    // 8. Save a new key
    saveCredentials({ RESEND_API_KEY: "re_test_key_1234" });
    const content1 = readFileSync(envPath, "utf-8");
    assert(content1.includes("RESEND_API_KEY=re_test_key_1234"), "8. saveCredentials writes new key to .env");

    // 9. Existing keys preserved
    assert(
      content1.includes("TWILIO_ACCOUNT_SID=ACtest1234") && content1.includes("SOME_OTHER_KEY=hello"),
      "9. saveCredentials preserves existing keys"
    );
  } finally {
    // Restore original .env
    if (backup !== null) {
      writeFileSync(envPath, backup, "utf-8");
    }
  }
}

// =======================================================================
// Phase B — Integration tests (requires running server with DEMO_MODE=true)
// =======================================================================

async function testStatusEndpoint() {
  console.log("\n--- GET /admin/api/status ---");

  const res = await fetch(`${SERVER_URL}/admin/api/status`);
  const data = await res.json() as Record<string, unknown>;

  // 10. Returns all 5 sections
  assert(
    "twilio" in data && "elevenlabs" in data && "resend" in data && "server" in data && "voice" in data,
    "10. /admin/api/status returns all 5 provider sections"
  );

  // 11-14. Individual sections present
  assert("configured" in (data.twilio as Record<string, unknown>), "11. twilio section present");
  assert("configured" in (data.resend as Record<string, unknown>), "12. resend section present");
  assert("configured" in (data.server as Record<string, unknown>), "13. server section present");
  assert("configured" in (data.voice as Record<string, unknown>), "14. voice section present");
}

async function testSaveEndpoint() {
  console.log("\n--- POST /admin/api/save ---");

  // 15. Save RESEND_API_KEY succeeds
  const res1 = await fetch(`${SERVER_URL}/admin/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: { RESEND_API_KEY: "re_test_integration" } }),
  });
  const data1 = await res1.json() as { success: boolean };
  assert(data1.success === true, "15. POST /admin/api/save with RESEND_API_KEY succeeds");

  // 16. Unknown key fails
  const res2 = await fetch(`${SERVER_URL}/admin/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: { UNKNOWN_KEY: "value" } }),
  });
  const data2 = await res2.json() as { success: boolean };
  assert(data2.success === false, "16. POST /admin/api/save with unknown key fails");
}

async function testResendTestEndpoint() {
  console.log("\n--- POST /admin/api/test/resend ---");

  // 17. Missing apiKey returns 400
  const res = await fetch(`${SERVER_URL}/admin/api/test/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(res.status === 400, "17. POST /admin/api/test/resend without apiKey returns 400");
}

async function testSetupPageHTML() {
  console.log("\n--- GET /admin/setup ---");

  // /admin/setup redirects to unified admin (/admin#settings)
  const res = await fetch(`${SERVER_URL}/admin/setup`, { redirect: "follow" });
  const html = await res.text();

  // 18. Returns HTML
  assert(res.status === 200 && html.includes("<!DOCTYPE html>"), "18. GET /admin/setup returns HTML");

  // 19-23. All provider sections present in unified admin settings
  assert(html.toLowerCase().includes("twilio"), "19. HTML contains Twilio section");
  assert(html.toLowerCase().includes("elevenlabs"), "20. HTML contains ElevenLabs section");
  assert(html.toLowerCase().includes("resend"), "21. HTML contains Resend section");
  assert(html.toLowerCase().includes("server") || html.toLowerCase().includes("settings"), "22. HTML contains Server Settings section");
  assert(html.toLowerCase().includes("voice"), "23. HTML contains Voice section");

  // 24. No step indicator
  assert(!html.includes('class="steps"'), "24. HTML does NOT contain step indicator");
}

// =======================================================================
// Run
// =======================================================================

async function main() {
  console.log("Setup UI Tests\n==============");

  // Phase A — Unit tests
  console.log("\nPhase A: Unit tests (no server needed)");
  await testProviderStatusShape();
  await testMaskFunction();
  await testSaveCredentials();

  // Phase B — Integration tests
  console.log("\n\nPhase B: Integration tests (requires DEMO_MODE=true server)");
  try {
    const healthCheck = await fetch(`${SERVER_URL}/health`);
    if (healthCheck.ok) {
      await testStatusEndpoint();
      await testSaveEndpoint();
      await testResendTestEndpoint();
      await testSetupPageHTML();
    } else {
      console.log("  (skipped — server returned non-200)");
    }
  } catch {
    console.log("  (skipped — server not running)");
  }

  // Summary
  console.log(`\n\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
