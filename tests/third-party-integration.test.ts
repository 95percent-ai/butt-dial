/**
 * Third-party integration test suite.
 *
 * Tests:
 * - A1. Registration: community edition → auto-approved
 * - A2. Auth page: KYC fields hidden for non-SaaS
 * - A3. Pending accounts: empty for non-SaaS
 * - B1. Token endpoint: GET /admin/api/my-token
 * - B2. Token regeneration: POST /admin/api/regenerate-token
 * - C1. LLM adapter module exports
 * - C2. Sandbox responder module exports
 * - C3. Mock providers: realistic IDs (SM..., CA..., EM..., WA..., LN...)
 * - C4. Config: sandbox config vars exist
 * - D1. Integration guide: docs/INTEGRATION.md exists
 * - D2. Docs page: /docs/integration returns 200
 * - D3. Raw guide: /api/v1/integration-guide returns markdown
 *
 * Prerequisites:
 *   - DEMO_MODE=true in .env
 *   - Server running: node dist/index.js
 *
 * Usage:
 *   npx tsx tests/third-party-integration.test.ts
 */

import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");

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

/** Recover a 6-digit OTP from its SHA-256 hash (brute force 100000-999999). */
function recoverOtpCode(hash: string): string | null {
  for (let i = 100000; i <= 999999; i++) {
    const candidate = String(i);
    if (createHash("sha256").update(candidate).digest("hex") === hash) {
      return candidate;
    }
  }
  return null;
}

async function main() {
  console.log("\n━━━ Third-Party Integration Tests ━━━\n");

  // ── Health check ──────────────────────────────────────────────
  console.log("▸ Server health");
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    assert(res.ok, "Server is running");
  } catch {
    console.error("  ✗ Server not running at " + SERVER_URL);
    console.error("  Start with: DEMO_MODE=true node dist/index.js");
    process.exit(1);
  }

  // ── Phase A: Registration ─────────────────────────────────────
  console.log("\n▸ Phase A: Registration (edition-aware)");

  // A1. Register + verify → check account_status
  const testEmail = `test-integ-${Date.now()}@example.com`;
  const testPassword = "testpass1234";
  const testOrg = "IntegTestOrg";

  // Register
  const regRes = await fetch(`${SERVER_URL}/auth/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword, orgName: testOrg, tosAccepted: true }),
  });
  const regData = await regRes.json();
  assert(regRes.ok, "Registration succeeds");
  assert(regData.email === testEmail.toLowerCase(), "Registration returns email");

  // Recover OTP — codes are stored as SHA-256 hashes, brute-force to find the plain code
  let otpCode = "000000";
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT code FROM otp_codes WHERE contact_address = ? ORDER BY created_at DESC LIMIT 1").get(testEmail.toLowerCase()) as { code: string } | undefined;
    if (row) {
      const recovered = recoverOtpCode(row.code);
      if (recovered) otpCode = recovered;
    }
    db.close();
  } catch {}

  // Verify email
  const verifyRes = await fetch(`${SERVER_URL}/auth/api/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, code: otpCode }),
  });
  const verifyData = await verifyRes.json();
  assert(verifyRes.ok, "Email verification succeeds");
  assert(verifyData.redirect === "/admin", "Redirects to /admin after verify");

  // Extract session cookie
  const setCookie = verifyRes.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(/__bd_session=([^;]+)/);
  const sessionCookie = cookieMatch ? `__bd_session=${cookieMatch[1]}` : "";
  assert(sessionCookie.length > 0, "Session cookie set after verification");

  // Check account_status (should be 'approved' in community edition)
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const user = db.prepare("SELECT account_status FROM user_accounts WHERE email = ?").get(testEmail.toLowerCase()) as { account_status: string } | undefined;
    assert(user?.account_status === "approved", "A1: Community edition auto-approves accounts");
    db.close();
  } catch (err) {
    assert(false, "A1: Community edition auto-approves accounts (DB error)");
  }

  // A2. Auth page: KYC fields hidden for non-SaaS
  const authPageRes = await fetch(`${SERVER_URL}/auth/login`);
  const authPageHtml = await authPageRes.text();
  assert(!authPageHtml.includes('id="reg-company"'), "A2: KYC company field hidden for community edition");
  assert(!authPageHtml.includes('id="reg-website"'), "A2: KYC website field hidden for community edition");
  assert(!authPageHtml.includes('id="reg-usecase"'), "A2: KYC use case field hidden for community edition");

  // A3. Pending accounts: empty for non-SaaS
  const pendingRes = await fetch(`${SERVER_URL}/admin/api/pending-accounts`, {
    headers: { Cookie: sessionCookie },
  });
  const pendingData = await pendingRes.json();
  // Demo mode returns empty (no super-admin check in demo mode, but returns empty for non-SaaS)
  assert(Array.isArray(pendingData.accounts), "A3: Pending accounts endpoint returns array");
  assert(pendingData.accounts.length === 0, "A3: Pending accounts empty for non-SaaS edition");

  // ── Phase B: Token in Admin Panel ─────────────────────────────
  console.log("\n▸ Phase B: API Token in Admin Panel");

  // B1. GET /admin/api/my-token
  const tokenRes = await fetch(`${SERVER_URL}/admin/api/my-token`, {
    headers: { Cookie: sessionCookie },
  });
  const tokenData = await tokenRes.json();
  assert(tokenRes.ok, "B1: my-token endpoint responds OK");
  assert(typeof tokenData.token === "string" && tokenData.token.length > 0, "B1: Returns token from session");

  // B2. POST /admin/api/regenerate-token
  const regenRes = await fetch(`${SERVER_URL}/admin/api/regenerate-token`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  const regenData = await regenRes.json();
  assert(regenRes.ok, "B2: Regenerate token responds OK");
  assert(regenData.success === true, "B2: Regeneration succeeds");
  assert(typeof regenData.token === "string" && regenData.token.length > 0, "B2: Returns new token");
  assert(regenData.token !== tokenData.token, "B2: New token differs from old");

  // Check that new session cookie was set
  const regenCookie = regenRes.headers.get("set-cookie") || "";
  assert(regenCookie.includes("__bd_session="), "B2: New session cookie set after regeneration");

  // ── Phase C: Smart Sandbox ────────────────────────────────────
  console.log("\n▸ Phase C: Smart Sandbox");

  // C1. LLM adapter module
  const llmAdapter = await import("../dist/lib/llm-adapter.js");
  assert(typeof llmAdapter.isLlmAvailable === "function", "C1: isLlmAvailable() exported");
  assert(typeof llmAdapter.complete === "function", "C1: complete() exported");

  // C2. Sandbox responder module
  const responder = await import("../dist/lib/sandbox-responder.js");
  assert(typeof responder.maybeTriggerSandboxReply === "function", "C2: maybeTriggerSandboxReply() exported");

  // C3. Mock providers: realistic IDs
  // Send a message and check the external ID format
  const sendRes = await fetch(`${SERVER_URL}/api/v1/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify({ agentId: "test-agent-001", to: "+15559876543", body: "Test sandbox", channel: "sms" }),
  });
  const sendData = await sendRes.json();
  if (sendRes.ok && sendData.externalId) {
    assert(sendData.externalId.startsWith("SM"), "C3: SMS mock returns Twilio-format ID (SM...)");
  } else {
    // In demo mode, auth may pass differently - check if it's an auth issue
    assert(false, "C3: SMS mock returns Twilio-format ID (send failed: " + JSON.stringify(sendData) + ")");
  }

  // C4. Config vars
  assert(typeof (await import("../dist/lib/config.js")).config.sandboxLlmEnabled === "boolean", "C4: sandboxLlmEnabled exists in config");
  assert(typeof (await import("../dist/lib/config.js")).config.sandboxReplyDelayMs === "number", "C4: sandboxReplyDelayMs exists in config");

  // ── Phase D: Integration Document ─────────────────────────────
  console.log("\n▸ Phase D: Integration Document");

  // D1. INTEGRATION.md exists
  const guidePath = path.join(__dirname, "..", "docs", "INTEGRATION.md");
  assert(existsSync(guidePath), "D1: docs/INTEGRATION.md exists");

  const guideContent = readFileSync(guidePath, "utf-8");
  assert(guideContent.includes("Quick Start"), "D1: Guide contains Quick Start section");
  assert(guideContent.includes("Authentication"), "D1: Guide contains Authentication section");
  assert(guideContent.includes("Sandbox"), "D1: Guide contains Sandbox section");
  assert(guideContent.includes("REST API"), "D1: Guide contains REST API section");
  assert(guideContent.includes("MCP Connection"), "D1: Guide contains MCP Connection section");
  assert(guideContent.includes("Going Live"), "D1: Guide contains Going Live section");

  // D2. Docs page
  const docsRes = await fetch(`${SERVER_URL}/docs/integration`);
  assert(docsRes.ok, "D2: /docs/integration returns 200");
  const docsHtml = await docsRes.text();
  assert(docsHtml.includes("Integration Guide"), "D2: Page title is Integration Guide");

  // D3. Raw guide endpoint
  const rawRes = await fetch(`${SERVER_URL}/api/v1/integration-guide`);
  assert(rawRes.ok, "D3: /api/v1/integration-guide returns 200");
  const rawText = await rawRes.text();
  assert(rawText.includes("# Butt-Dial MCP"), "D3: Returns markdown content");
  const contentType = rawRes.headers.get("content-type") || "";
  assert(contentType.includes("text/markdown"), "D3: Content-Type is text/markdown");

  // ── Admin page has API key card ───────────────────────────────
  console.log("\n▸ Admin UI");
  const adminRes = await fetch(`${SERVER_URL}/admin`);
  const adminHtml = await adminRes.text();
  assert(adminHtml.includes("api-key-card"), "Admin page contains API key card");
  assert(adminHtml.includes("copyApiKey"), "Admin page has copy key function");
  assert(adminHtml.includes("regenerateApiKey"), "Admin page has regenerate key function");

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
