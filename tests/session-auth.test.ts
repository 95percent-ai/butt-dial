/**
 * Session-based auth test.
 *
 * Tests:
 * - Register + verify returns Set-Cookie header and redirect
 * - Login returns Set-Cookie header and redirect
 * - Cookie attributes are correct (HttpOnly, SameSite, Path, Max-Age)
 * - Logout clears cookie (Max-Age=0)
 * - Auth page: token reveal removed, forms still present
 * - Admin API accepts session cookie (live mode only)
 * - Admin API still accepts Bearer token (live mode only)
 * - Tampered/revoked cookie rejected (live mode only)
 *
 * Prerequisites:
 *   - Server running
 *
 * Usage:
 *   Demo mode (skips admin-rejection tests):
 *     DEMO_MODE=true in .env → start server → npx tsx tests/session-auth.test.ts
 *
 *   Live mode (full coverage, requires ORCHESTRATOR_SECURITY_TOKEN set):
 *     DEMO_MODE=false in .env → start server → npx tsx tests/session-auth.test.ts --live
 *
 *   The test auto-detects the server mode. Pass --live to force live-mode
 *   assertions (fails if server is actually in demo mode).
 */

import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function skip(label: string) {
  console.log(`  ⊘ ${label} (skipped — demo mode)`);
  skipped++;
}

/** Extract Set-Cookie header value for __bd_session */
function getSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/__bd_session=([^;]+)/);
  return match ? match[1] : null;
}

/** Build a Cookie header string from a session cookie value */
function cookieHeader(value: string): string {
  return `__bd_session=${value}`;
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
  console.log("\n=== Session-Based Auth Test ===\n");

  // Detect demo mode — auto-detect from server, override with --live flag
  const forceLive = process.argv.includes("--live");
  const healthRes = await fetch(`${SERVER_URL}/health`);
  const healthData = await healthRes.json() as Record<string, unknown>;
  const serverIsDemo = healthData.demoMode === true;

  if (forceLive && serverIsDemo) {
    console.error("ERROR: --live flag passed but server is in DEMO_MODE=true.");
    console.error("Set DEMO_MODE=false and ORCHESTRATOR_SECURITY_TOKEN in .env, then restart.");
    process.exit(1);
  }

  const isDemo = serverIsDemo && !forceLive;
  console.log(`Server mode: ${isDemo ? "DEMO (auth-rejection tests skipped)" : "LIVE (full coverage)"}\n`);

  const db = new Database(DB_PATH);
  const testEmail = `session-test-${Date.now()}@example.com`;
  const testPassword = "testpassword123";
  const testOrgName = "Session Test Org";

  // ── 1. Register ────────────────────────────────────────────────
  console.log("1. Registration");
  const regRes = await fetch(`${SERVER_URL}/auth/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword, orgName: testOrgName, tosAccepted: true }),
  });
  const regData = await regRes.json() as Record<string, unknown>;
  assert(regRes.ok, "Registration returns 200");
  assert(regData.success === true, "Registration success");

  // ── 2. Verify email — check cookie + redirect ─────────────────
  console.log("\n2. Email Verification with Cookie");
  const otpRow = db.prepare(
    "SELECT code FROM otp_codes WHERE contact_address = ? ORDER BY created_at DESC LIMIT 1"
  ).get(testEmail) as { code: string } | undefined;
  assert(otpRow !== undefined, "OTP hash exists in DB");
  const otpCode = otpRow ? recoverOtpCode(otpRow.code) : null;
  assert(otpCode !== null, "OTP code recovered from hash");

  const verifyRes = await fetch(`${SERVER_URL}/auth/api/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, code: otpCode }),
    redirect: "manual",
  });
  const verifyData = await verifyRes.json() as Record<string, unknown>;
  assert(verifyRes.ok, "Verify returns 200");
  assert(verifyData.success === true, "Verify success");
  assert(verifyData.redirect === "/admin", "Verify includes redirect to /admin");
  assert(typeof verifyData.orgToken === "string", "Verify still returns orgToken (backward compat)");

  const verifyCookie = getSessionCookie(verifyRes);
  assert(verifyCookie !== null, "Verify sets __bd_session cookie");
  assert(verifyCookie !== null && verifyCookie.length > 20, "Session cookie is encrypted (long value)");

  // Check cookie attributes
  const setCookieHdr = verifyRes.headers.get("set-cookie") || "";
  assert(setCookieHdr.includes("HttpOnly"), "Cookie is HttpOnly");
  assert(setCookieHdr.includes("SameSite=Lax"), "Cookie is SameSite=Lax");
  assert(setCookieHdr.includes("Path=/"), "Cookie Path is /");
  assert(setCookieHdr.includes("Max-Age="), "Cookie has Max-Age");

  // ── 3. Admin API with session cookie ───────────────────────────
  console.log("\n3. Admin API with Session Cookie");
  if (!isDemo) {
    const adminRes = await fetch(`${SERVER_URL}/admin/api/my-org`, {
      headers: { "Cookie": cookieHeader(verifyCookie!) },
    });
    assert(adminRes.ok, "Admin API /my-org accepts session cookie (200)");
    const adminData = await adminRes.json() as Record<string, unknown>;
    assert(adminData.orgId !== undefined, "Returns org data from cookie auth");

    const dashRes = await fetch(`${SERVER_URL}/admin/api/dashboard`, {
      headers: { "Cookie": cookieHeader(verifyCookie!) },
    });
    assert(dashRes.ok, "Admin API /dashboard accepts session cookie (200)");
  } else {
    skip("Admin API /my-org accepts session cookie");
    skip("Returns org data from cookie auth");
    skip("Admin API /dashboard accepts session cookie");
  }

  // ── 4. Bearer token backward compat ────────────────────────────
  console.log("\n4. Bearer Token Backward Compat");
  if (!isDemo) {
    const orgToken = String(verifyData.orgToken);
    const bearerRes = await fetch(`${SERVER_URL}/admin/api/my-org`, {
      headers: { "Authorization": `Bearer ${orgToken}` },
    });
    assert(bearerRes.ok, "Admin API /my-org accepts Bearer token (200)");
  } else {
    skip("Admin API /my-org accepts Bearer token");
  }

  // ── 5. Login returns Set-Cookie ────────────────────────────────
  console.log("\n5. Login with Cookie");
  const loginRes = await fetch(`${SERVER_URL}/auth/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const loginData = await loginRes.json() as Record<string, unknown>;
  assert(loginRes.ok, "Login returns 200");
  assert(loginData.redirect === "/admin", "Login includes redirect to /admin");
  assert(typeof loginData.orgToken === "string", "Login still returns orgToken (backward compat)");

  const loginCookie = getSessionCookie(loginRes);
  assert(loginCookie !== null, "Login sets __bd_session cookie");

  // ── 6. Tampered cookie rejected ────────────────────────────────
  console.log("\n6. Tampered Cookie Rejected");
  if (!isDemo) {
    const tamperedRes = await fetch(`${SERVER_URL}/admin/api/my-org`, {
      headers: { "Cookie": cookieHeader("tampered-garbage-value") },
    });
    assert(tamperedRes.status === 401, "Tampered cookie returns 401");

    const fakeEncrypted = "0000000000000000000000000000000f:abcdef1234567890abcdef1234567890";
    const fakeRes = await fetch(`${SERVER_URL}/admin/api/my-org`, {
      headers: { "Cookie": cookieHeader(fakeEncrypted) },
    });
    assert(fakeRes.status === 401, "Fake encrypted cookie returns 401");
  } else {
    skip("Tampered cookie returns 401");
    skip("Fake encrypted cookie returns 401");
  }

  // ── 7. No cookie and no Bearer = 401 ──────────────────────────
  console.log("\n7. No Auth = 401");
  if (!isDemo) {
    const noAuthRes = await fetch(`${SERVER_URL}/admin/api/my-org`);
    assert(noAuthRes.status === 401, "No cookie + no Bearer returns 401");
  } else {
    skip("No cookie + no Bearer returns 401");
  }

  // ── 8. Logout clears cookie ────────────────────────────────────
  console.log("\n8. Logout");
  const logoutRes = await fetch(`${SERVER_URL}/auth/api/logout`, {
    method: "POST",
  });
  const logoutData = await logoutRes.json() as Record<string, unknown>;
  assert(logoutRes.ok, "Logout returns 200");
  assert(logoutData.success === true, "Logout success");

  const logoutSetCookie = logoutRes.headers.get("set-cookie") || "";
  assert(logoutSetCookie.includes("__bd_session="), "Logout sets cookie header");
  assert(logoutSetCookie.includes("Max-Age=0"), "Logout cookie has Max-Age=0");

  // ── 9. Revoked token in cookie ─────────────────────────────────
  console.log("\n9. Revoked Token in Cookie");
  if (!isDemo) {
    const testUser = db.prepare("SELECT org_id FROM user_accounts WHERE email = ?").get(testEmail) as { org_id: string } | undefined;
    if (testUser) {
      db.prepare("DELETE FROM org_tokens WHERE org_id = ?").run(testUser.org_id);
    }
    const revokedRes = await fetch(`${SERVER_URL}/admin/api/my-org`, {
      headers: { "Cookie": cookieHeader(loginCookie!) },
    });
    assert(revokedRes.status === 401, "Revoked token in cookie returns 401");
  } else {
    skip("Revoked token in cookie returns 401");
  }

  // ── 10. Auth page smoke test ───────────────────────────────────
  console.log("\n10. Auth Page Smoke Test");
  const authPageRes = await fetch(`${SERVER_URL}/auth/login`);
  assert(authPageRes.ok, "Auth page loads");
  const authHtml = await authPageRes.text();
  assert(!authHtml.includes("token-view"), "Token reveal view removed from auth page");
  assert(!authHtml.includes("copyToken"), "copyToken function removed from auth page");
  assert(!authHtml.includes("token-box"), "Token box CSS removed from auth page");
  assert(authHtml.includes("login-form"), "Login form still present");
  assert(authHtml.includes("register-form"), "Register form still present");
  assert(authHtml.includes("verify-form"), "Verify form still present");

  // ── 11. Admin page updated ─────────────────────────────────────
  console.log("\n11. Admin Page Updates");
  const adminPageRes = await fetch(`${SERVER_URL}/admin`);
  assert(adminPageRes.ok, "Admin page loads");
  const adminHtml = await adminPageRes.text();
  assert(adminHtml.includes("Sign in with email"), "Admin login has 'Sign in with email' link");
  assert(adminHtml.includes("credentials"), "apiFetch includes credentials option");
  assert(adminHtml.includes("/auth/api/logout"), "Logout POSTs to /auth/api/logout");

  // ── Cleanup ────────────────────────────────────────────────────
  const testUser = db.prepare("SELECT org_id FROM user_accounts WHERE email = ?").get(testEmail) as { org_id: string } | undefined;
  if (testUser) {
    db.prepare("DELETE FROM org_tokens WHERE org_id = ?").run(testUser.org_id);
    db.prepare("DELETE FROM user_accounts WHERE email = ?").run(testEmail);
    db.prepare("DELETE FROM organizations WHERE id = ?").run(testUser.org_id);
  }
  db.prepare("DELETE FROM otp_codes WHERE contact_address = ?").run(testEmail);
  db.close();

  // ── Results ────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""} out of ${passed + failed}`);
  if (isDemo && skipped > 0) {
    console.log(`Note: ${skipped} admin-auth rejection tests skipped in demo mode.`);
    console.log(`Run with DEMO_MODE=false + ORCHESTRATOR_SECURITY_TOKEN set for full coverage.`);
  }
  console.log(`${"═".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
