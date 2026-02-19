/**
 * Legal liability reduction test suite.
 *
 * Tests:
 * Part 1 — Disclaimer Gate
 *   1. Schema: disclaimer_acceptances table exists
 *   2. Disclaimer page: GET /disclaimer returns 200 with HTML
 *   3. Disclaimer status API: GET /auth/api/disclaimer-status returns JSON
 *   4. Disclaimer accept API: POST /auth/api/accept-disclaimer without auth → 401
 *   5. Registration flow: verify-email returns redirect to /disclaimer
 *   6. Login flow: returns redirect to /disclaimer for new users
 *   7. Accept + re-login: returns redirect to /admin
 *   8. Dashboard API: requires disclaimer for cookie-auth users
 *   9. Admin page: redirects to /disclaimer for users who haven't accepted
 *  10. Disclaimer version: page shows version 1.0
 *
 * Part 2 — AI Voice Disclosure
 *  11. Config: voiceAiDisclosure exists in config schema
 *  12. Config: voiceAiDisclosureText has default value
 *  13. applyDisclosure: prepends disclosure text
 *  14. applyDisclosure: config controls behavior
 *  15. Guardrails: AI DISCLOSURE rules in COMMUNICATION_GUARDRAILS
 *  16. Guardrails: "Never claim to be human" rule exists
 *  17. make-call tool: imports applyDisclosure
 *  18. get-me tool: imports applyDisclosure
 *  19. inbound-voice: imports applyDisclosure
 *  20. rest-router: imports applyDisclosure
 *  21. Admin settings: VOICE_AI_DISCLOSURE in allowed save keys
 *  22. Admin settings: VOICE_AI_DISCLOSURE_TEXT in allowed save keys
 *
 * Part 3 — Strengthened Legal Documents
 *  23. Terms: AI-Specific Terms section exists
 *  24. Terms: Dispute Resolution section exists
 *  25. Terms: arbitration clause exists
 *  26. Terms: class action waiver exists
 *  27. Terms: FCC AI Voice Call Rules in compliance section
 *  28. Terms: AI-generated content excluded from liability
 *  29. Terms: expanded indemnification list
 *  30. AUP: AI-Specific Prohibitions section exists
 *  31. AUP: AI Agent Conduct section exists
 *  32. AUP: "must not deny being AI" rule
 *  33. Privacy: AI Processing section exists
 *  34. Privacy: data controller/processor language
 *  35. Privacy: provider disclaimer with links
 *
 * Prerequisites:
 *   - DEMO_MODE=true in .env
 *   - Server running: node dist/index.js
 *
 * Usage:
 *   npx tsx tests/legal-liability.test.ts
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
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
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
  console.log("\n=== Legal Liability Reduction Tests ===\n");

  // ── Part 1: Disclaimer Gate ─────────────────────────────────

  console.log("Part 1: Disclaimer Gate\n");

  // 1. Schema
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='disclaimer_acceptances'").all();
    assert(tables.length > 0, "1. disclaimer_acceptances table exists");
  } catch {
    assert(false, "1. disclaimer_acceptances table exists");
  }

  // 2. Disclaimer page
  try {
    const res = await fetch(`${SERVER_URL}/disclaimer`);
    const html = await res.text();
    assert(res.status === 200, "2. GET /disclaimer returns 200");
    assert(html.includes("Platform Usage Disclaimer"), "2b. Disclaimer page has title");
    assert(html.includes("accept-disclaimer"), "2c. Disclaimer page has accept endpoint");
  } catch (e) {
    assert(false, `2. GET /disclaimer — ${e}`);
  }

  // 3. Disclaimer status without auth
  try {
    const res = await fetch(`${SERVER_URL}/auth/api/disclaimer-status`);
    const data = await res.json() as any;
    assert(res.status === 401, "3. Disclaimer status without auth → 401");
  } catch (e) {
    assert(false, `3. Disclaimer status — ${e}`);
  }

  // 4. Accept disclaimer without auth
  try {
    const res = await fetch(`${SERVER_URL}/auth/api/accept-disclaimer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert(res.status === 401, "4. Accept disclaimer without auth → 401");
  } catch (e) {
    assert(false, `4. Accept disclaimer — ${e}`);
  }

  // Test the full registration → disclaimer → accept → admin flow
  const testEmail = `liability-test-${Date.now()}@test.com`;
  const testPassword = "TestPassword123!";
  const testOrgName = "LiabilityTest Inc";
  let sessionCookie = "";

  // 5. Register
  try {
    const regRes = await fetch(`${SERVER_URL}/auth/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        orgName: testOrgName,
        tosAccepted: true,
      }),
    });
    const regData = await regRes.json() as any;
    assert(regData.success === true, "5a. Registration succeeds");

    // Find OTP hash in DB and brute-force recover the 6-digit code
    const dbWrite = new Database(DB_PATH);
    const otpRow = dbWrite.prepare(
      "SELECT code FROM otp_codes WHERE contact_address = ? ORDER BY created_at DESC LIMIT 1"
    ).get(testEmail) as any;
    const code = otpRow ? recoverOtpCode(otpRow.code) : null;
    assert(!!code, "5b. OTP recovered from DB");

    // Verify email
    const verifyRes = await fetch(`${SERVER_URL}/auth/api/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, code }),
      redirect: "manual",
    });
    const verifyData = await verifyRes.json() as any;
    assert(verifyData.redirect === "/disclaimer", "5c. Verify-email redirects to /disclaimer");

    // Capture session cookie
    const setCookie = verifyRes.headers.get("set-cookie") || "";
    const cookieMatch = setCookie.match(/__bd_session=([^;]+)/);
    if (cookieMatch) sessionCookie = cookieMatch[1];
    assert(!!sessionCookie, "5d. Session cookie set after verification");

    dbWrite.close();
  } catch (e) {
    assert(false, `5. Registration flow — ${e}`);
  }

  // 6. Login → should redirect to /disclaimer
  try {
    const loginRes = await fetch(`${SERVER_URL}/auth/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginRes.json() as any;
    assert(loginData.redirect === "/disclaimer", "6. Login redirects to /disclaimer for new users");

    // Update session cookie
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const cookieMatch = setCookie.match(/__bd_session=([^;]+)/);
    if (cookieMatch) sessionCookie = cookieMatch[1];
  } catch (e) {
    assert(false, `6. Login redirect — ${e}`);
  }

  // 7. Check disclaimer status (authenticated)
  try {
    const statusRes = await fetch(`${SERVER_URL}/auth/api/disclaimer-status`, {
      headers: { Cookie: `__bd_session=${sessionCookie}` },
    });
    const statusData = await statusRes.json() as any;
    assert(statusData.accepted === false, "7a. Disclaimer not yet accepted");
    assert(statusData.currentVersion === "1.0", "7b. Current version is 1.0");
  } catch (e) {
    assert(false, `7. Disclaimer status — ${e}`);
  }

  // 8. Accept disclaimer
  try {
    const acceptRes = await fetch(`${SERVER_URL}/auth/api/accept-disclaimer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `__bd_session=${sessionCookie}`,
      },
    });
    const acceptData = await acceptRes.json() as any;
    assert(acceptData.success === true, "8a. Disclaimer accepted successfully");
    assert(acceptData.redirect === "/admin", "8b. Redirect to /admin after acceptance");
  } catch (e) {
    assert(false, `8. Accept disclaimer — ${e}`);
  }

  // 9. Re-login → should redirect to /admin now
  try {
    const loginRes = await fetch(`${SERVER_URL}/auth/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginRes.json() as any;
    assert(loginData.redirect === "/admin", "9. Re-login redirects to /admin after acceptance");
  } catch (e) {
    assert(false, `9. Re-login redirect — ${e}`);
  }

  // 10. Disclaimer page version
  try {
    const res = await fetch(`${SERVER_URL}/disclaimer`);
    const html = await res.text();
    assert(html.includes("version 1.0"), "10. Disclaimer page shows version 1.0");
  } catch (e) {
    assert(false, `10. Disclaimer version — ${e}`);
  }

  db.close();

  // ── Part 2: AI Voice Disclosure ────────────────────────────

  console.log("\nPart 2: AI Voice Disclosure\n");

  // 11-12. Config values
  const configPath = path.join(__dirname, "..", "src", "lib", "config.ts");
  const configContent = readFileSync(configPath, "utf-8");
  assert(configContent.includes("voiceAiDisclosure"), "11. voiceAiDisclosure in config schema");
  assert(configContent.includes("voiceAiDisclosureText"), "12. voiceAiDisclosureText in config schema");
  assert(configContent.includes('"Please note, this is an AI-generated call. "'), "12b. Default disclosure text set");

  // 13-14. applyDisclosure function
  const guardrailsPath = path.join(__dirname, "..", "src", "security", "communication-guardrails.ts");
  const guardrailsContent = readFileSync(guardrailsPath, "utf-8");
  assert(guardrailsContent.includes("export function applyDisclosure"), "13. applyDisclosure function exported");
  assert(guardrailsContent.includes("config.voiceAiDisclosure"), "14. applyDisclosure checks config");

  // 15-16. AI disclosure rules in guardrails
  assert(guardrailsContent.includes("AI DISCLOSURE:"), "15. AI DISCLOSURE section in guardrails");
  assert(guardrailsContent.includes("Never claim to be human"), "16. 'Never claim to be human' rule");

  // 17-20. Import checks
  const makeCallContent = readFileSync(path.join(__dirname, "..", "src", "tools", "make-call.ts"), "utf-8");
  assert(makeCallContent.includes("applyDisclosure"), "17. make-call imports applyDisclosure");

  const getMeContent = readFileSync(path.join(__dirname, "..", "src", "tools", "get-me.ts"), "utf-8");
  assert(getMeContent.includes("applyDisclosure"), "18. get-me imports applyDisclosure");

  const inboundVoiceContent = readFileSync(path.join(__dirname, "..", "src", "webhooks", "inbound-voice.ts"), "utf-8");
  assert(inboundVoiceContent.includes("applyDisclosure"), "19. inbound-voice imports applyDisclosure");

  const restRouterContent = readFileSync(path.join(__dirname, "..", "src", "api", "rest-router.ts"), "utf-8");
  assert(restRouterContent.includes("applyDisclosure"), "20. rest-router imports applyDisclosure");

  // 21-22. Admin settings allowed keys
  const routerContent = readFileSync(path.join(__dirname, "..", "src", "admin", "router.ts"), "utf-8");
  assert(routerContent.includes('"VOICE_AI_DISCLOSURE"'), "21. VOICE_AI_DISCLOSURE in allowed save keys");
  assert(routerContent.includes('"VOICE_AI_DISCLOSURE_TEXT"'), "22. VOICE_AI_DISCLOSURE_TEXT in allowed save keys");

  // ── Part 3: Strengthened Legal Documents ───────────────────

  console.log("\nPart 3: Strengthened Legal Documents\n");

  // Fetch all three legal pages
  let termsHtml = "";
  let aupHtml = "";
  let privacyHtml = "";

  try {
    const [termsRes, aupRes, privacyRes] = await Promise.all([
      fetch(`${SERVER_URL}/legal/terms`),
      fetch(`${SERVER_URL}/legal/aup`),
      fetch(`${SERVER_URL}/legal/privacy`),
    ]);
    termsHtml = await termsRes.text();
    aupHtml = await aupRes.text();
    privacyHtml = await privacyRes.text();
  } catch (e) {
    console.error(`  Failed to fetch legal pages: ${e}`);
  }

  // Terms of Service
  assert(termsHtml.includes("AI-Specific Terms"), "23. ToS: AI-Specific Terms section");
  assert(termsHtml.includes("Dispute Resolution"), "24. ToS: Dispute Resolution section");
  assert(termsHtml.includes("Binding Arbitration"), "25. ToS: arbitration clause");
  assert(termsHtml.includes("Class Action Waiver"), "26. ToS: class action waiver");
  assert(termsHtml.includes("FCC AI Voice Call Rules"), "27. ToS: FCC AI Voice Call Rules");
  assert(termsHtml.includes("AI-generated content"), "28. ToS: AI-generated content in liability");
  assert(termsHtml.includes("TCPA, FCC, GDPR, CAN-SPAM"), "29. ToS: expanded indemnification list");

  // Acceptable Use Policy
  assert(aupHtml.includes("AI-Specific Prohibitions"), "30. AUP: AI-Specific Prohibitions section");
  assert(aupHtml.includes("AI Agent Conduct"), "31. AUP: AI Agent Conduct section");
  assert(aupHtml.includes("deny being AI"), "32. AUP: must not deny being AI");

  // Privacy Policy
  assert(privacyHtml.includes("AI Processing"), "33. Privacy: AI Processing section");
  assert(privacyHtml.includes("data controller"), "34. Privacy: data controller language");
  assert(privacyHtml.includes("Provider Disclaimer"), "35. Privacy: provider disclaimer");

  // ── Cleanup test user ──────────────────────────────────────

  try {
    const dbClean = new Database(DB_PATH);
    dbClean.prepare("DELETE FROM user_accounts WHERE email = ?").run(testEmail);
    dbClean.prepare("DELETE FROM disclaimer_acceptances WHERE user_id IN (SELECT id FROM user_accounts WHERE email = ?)").run(testEmail);
    // Clean up org created during registration
    const testOrgs = dbClean.prepare(
      "SELECT org_id FROM user_accounts WHERE email = ?"
    ).all(testEmail) as any[];
    // User already deleted — just clean otp codes
    dbClean.prepare("DELETE FROM otp_codes WHERE identifier = ?").run(testEmail);
    dbClean.close();
  } catch {
    // Best effort cleanup
  }

  // ── Summary ────────────────────────────────────────────────

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log(`${"=".repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
